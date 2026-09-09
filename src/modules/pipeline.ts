import type { AuditInput, ExtractedPage } from "@/types/audit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchPage, extractOnPage, extractSchema, extractSocialMetadata, extractTechnical } from "@/modules/extraction";
import { classifySearchIntent } from "@/modules/serp-intent";
import { extractEntitiesAndRelationships } from "@/modules/entities";
import { analyzeSentiment } from "@/modules/sentiment";
import { analyzeEeat } from "@/modules/eeat";
import { analyzeExperience } from "@/modules/experience";
import { analyzeLocalSeo } from "@/modules/local-seo";
import { checkSerpPosition } from "@/modules/serp-check";
import { embedText } from "@/modules/semantic";
import { fetchAuthorityData } from "@/lib/dataforseo/client";
import { scoreAllPages } from "@/modules/scoring";
import { buildComparison } from "@/modules/comparison";
import * as cheerio from "cheerio";

/**
 * Full audit pipeline (Part B1 diagram):
 *   SERP Intent -> Crawl/Extract -> On-Page -> Entities -> E-E-A-T -> Schema
 *   -> Technical -> DataForSEO Authority -> Scoring -> Claude reasoning
 *   -> Report
 *
 * Runs as a background job kicked off from the API route via
 * `after()`/`waitUntil()` (see src/app/api/audits/route.ts and B3). For
 * audit volumes where this exceeds Vercel's execution limits even under
 * Fluid Compute, move this function unchanged onto the existing worker
 * host (Hostinger VPS per B3) — it only depends on env vars + Supabase,
 * not on the Next.js request/response cycle.
 */
export async function runAuditPipeline(
  auditRunId: string,
  input: AuditInput,
  clientId: string
): Promise<void> {
  let supabase: ReturnType<typeof createSupabaseServiceClient> | undefined;

  try {
    supabase = createSupabaseServiceClient();
    await supabase.from("audit_runs").update({ status: "running" }).eq("id", auditRunId);

    const intent = await classifySearchIntent({
      targetKeyword: input.target_keyword,
      location: input.location,
      industry: input.industry,
    });

    await supabase.from("audit_runs").update({ search_intent: intent }).eq("id", auditRunId);

    // null when VOYAGE_API_KEY is unset — semantic proximity then degrades
    // gracefully in scoreEntitiesSemantic rather than guessing (see
    // src/modules/scoring/module-scorers.ts).
    const targetKeywordEmbedding = await embedText(input.target_keyword);

    const extractedPages: ExtractedPage[] = [];

    for (const pageInput of input.pages) {
      const { html, httpStatus } = await fetchPage(pageInput.url);
      const $ = cheerio.load(html);
      const pageText = $("body").text().replace(/\s+/g, " ").trim();

      const onPage = extractOnPage(html, httpStatus);
      const schemaData = extractSchema(html);
      const socialMetadata = extractSocialMetadata(html);
      const technical = extractTechnical(html, httpStatus, onPage.robots);

      const [entityResult, sentiment, eeat, experience, local, authority, serpCheck, embedding] = await Promise.all([
        extractEntitiesAndRelationships({
          targetKeyword: input.target_keyword,
          pageText,
          headings: onPage.headings,
        }),
        analyzeSentiment(pageText),
        analyzeEeat(pageText),
        analyzeExperience(pageText),
        analyzeLocalSeo({ pageText, location: input.location }),
        fetchAuthorityData(pageInput.url),
        checkSerpPosition({ targetKeyword: input.target_keyword, url: pageInput.url, location: input.location }),
        embedText(pageText),
      ]);

      // Live-verified rank wins when the search actually found the page in
      // the top 10; otherwise fall back to whatever the caller supplied
      // rather than discarding it outright.
      const observedRank = serpCheck.observed_rank ?? pageInput.observed_rank ?? null;

      const extractedPage: ExtractedPage = {
        url: pageInput.url,
        observed_rank: observedRank,
        serp_check: serpCheck,
        embedding,
        on_page: onPage,
        content: entityResult.content,
        entities: entityResult.entities,
        entity_relationships: entityResult.relationships,
        schema_data: schemaData,
        social_metadata: socialMetadata,
        technical,
        authority,
        sentiment,
        eeat,
        experience,
        local,
        scores: null,
      };

      extractedPages.push(extractedPage);

      await supabase.from("audit_pages").insert({
        audit_run_id: auditRunId,
        url: extractedPage.url,
        observed_rank: extractedPage.observed_rank,
        serp_check: extractedPage.serp_check,
        embedding: extractedPage.embedding,
        on_page: extractedPage.on_page,
        content: extractedPage.content,
        entities: extractedPage.entities,
        entity_relationships: extractedPage.entity_relationships,
        eeat: extractedPage.eeat,
        experience: extractedPage.experience,
        local: extractedPage.local,
        schema_data: extractedPage.schema_data,
        social_metadata: extractedPage.social_metadata,
        technical: extractedPage.technical,
        authority: extractedPage.authority,
        sentiment: extractedPage.sentiment,
      });

      // Seeds rank_history immediately so there's a first data point
      // without waiting for the next cron cycle (see
      // src/app/api/cron/rank-check/route.ts, which appends to this same
      // table on a recurring schedule).
      await supabase.from("rank_history").insert({
        client_id: clientId,
        audit_run_id: auditRunId,
        target_keyword: input.target_keyword,
        url: extractedPage.url,
        observed_rank: extractedPage.observed_rank,
        note: extractedPage.serp_check?.note ?? null,
        checked_at: extractedPage.serp_check?.checked_at ?? new Date().toISOString(),
      });
    }

    const scores = scoreAllPages(extractedPages, targetKeywordEmbedding);
    extractedPages.forEach((page, i) => {
      page.scores = scores[i] ?? null;
    });

    for (const summary of scores) {
      await supabase
        .from("audit_pages")
        .update({ scores: summary })
        .eq("audit_run_id", auditRunId)
        .eq("url", summary.url);
    }

    const comparison = await buildComparison({
      targetKeyword: input.target_keyword,
      pages: extractedPages,
      scores,
    });

    await supabase.from("audit_comparisons").insert({
      audit_run_id: auditRunId,
      page_advantages: comparison.page_advantages,
      content_gaps: comparison.content_gaps,
      semantic_gaps: comparison.semantic_gaps,
      technical_gaps: comparison.technical_gaps,
      authority_gaps: comparison.authority_gaps,
      ranking_hypothesis: comparison.ranking_hypothesis,
      recommendations: comparison.recommendations,
      current_scores: comparison.current_scores,
      projected_scores: comparison.projected_scores,
      confidence: comparison.confidence,
      missing_data: comparison.missing_data,
    });

    await supabase
      .from("audit_runs")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", auditRunId);
  } catch (error) {
    // Logged so a crash that happens before any DB write (e.g. a missing/
    // invalid SUPABASE_SERVICE_ROLE_KEY) is still visible in Vercel's
    // function logs, not just silently stuck at "pending" forever.
    console.error(`Audit pipeline failed for run ${auditRunId}:`, error);

    try {
      const failClient = supabase ?? createSupabaseServiceClient();
      await failClient
        .from("audit_runs")
        .update({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown pipeline error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", auditRunId);
    } catch (writeError) {
      console.error(`Could not record failure for run ${auditRunId}:`, writeError);
    }
  }
}
