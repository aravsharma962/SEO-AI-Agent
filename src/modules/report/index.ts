import type {
  AuditComparison,
  AuditReportResponse,
  ExtractedPage,
  PageScoreSummary,
  SerpIntentResult,
} from "@/types/audit";

/**
 * Report assembly (Part E). Deterministic — pure code, plain JSON
 * reshaping of what the pipeline already computed. No LLM calls here.
 */
export function assembleReport(params: {
  keyword: string;
  intent: SerpIntentResult;
  pages: ExtractedPage[];
  scores: PageScoreSummary[];
  comparison: AuditComparison;
}): AuditReportResponse {
  const scoresByUrl: AuditReportResponse["scores"] = {};
  params.scores.forEach((s) => {
    const page = params.pages.find((p) => p.url === s.url);
    scoresByUrl![s.url] = {
      current: s.current_score,
      projected: params.comparison.projected_scores[s.url],
      coverage: s.coverage,
      observed_rank: page?.observed_rank ?? null,
      serp_check_note: page?.serp_check?.note,
    };
  });

  return {
    status: "success",
    keyword: params.keyword,
    audit: {
      search_intent: { primary: params.intent.primary, secondary: params.intent.secondary },
      page_comparison: {
        page_advantages: params.comparison.page_advantages,
        content_gaps: params.comparison.content_gaps,
      },
      entity_semantic_analysis: params.pages.map((p) => ({
        url: p.url,
        entities: p.entities,
        entity_relationships: p.entity_relationships,
        semantic_gaps: params.comparison.semantic_gaps,
      })),
      eeat_analysis: params.pages.map((p) => ({ url: p.url, eeat: p.eeat, experience: p.experience })),
      local_analysis: params.pages.map((p) => ({ url: p.url, local: p.local })),
      schema_analysis: params.pages.map((p) => ({ url: p.url, schema: p.schema_data })),
      technical_analysis: params.pages.map((p) => ({ url: p.url, technical: p.technical })),
      authority_analysis: params.pages.map((p) => ({ url: p.url, authority: p.authority })),
    },
    scores: scoresByUrl,
    ranking_hypothesis: params.comparison.ranking_hypothesis,
    recommendations: params.comparison.recommendations,
    missing_data: params.comparison.missing_data,
    confidence: params.comparison.confidence,
  };
}
