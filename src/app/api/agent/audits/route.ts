import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runAuditPipeline } from "@/modules/pipeline";
import { assembleReport } from "@/modules/report";
import { parseEmbedding } from "@/modules/semantic";
import type { AuditInput, ExtractedPage, PageScoreSummary, SerpIntentResult } from "@/types/audit";

/**
 * Machine-to-machine door for the SEO Automation Agent (no browser login).
 * Auth: header  x-agent-key: <AGENT_API_KEY>.  Runs under ONE workspace: AGENT_CLIENT_ID.
 *   POST /api/agent/audits   { target_keyword, pages:[{url,is_own_page?},...], internal_link_candidates? }  -> { audit_run_id }
 *   GET  /api/agent/audits?id=<audit_run_id>                                                              -> status or full report
 */
function authorised(req: NextRequest) {
  const key = process.env.AGENT_API_KEY || "";
  const got = req.headers.get("x-agent-key") || "";
  if (key.length < 16 || got.length !== key.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(key));
}

const Schema = z.object({
  target_keyword: z.string().min(1),
  pages: z.array(z.object({ url: z.string().url(), is_own_page: z.boolean().optional(), observed_rank: z.number().int().positive().optional() })).min(2),
  industry: z.string().optional(),
  page_type: z.string().optional(),
  location: z.string().optional(),
  internal_link_candidates: z.array(z.object({ url: z.string().url(), topic: z.string().min(1) })).max(20).optional(),
});

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  const clientId = process.env.AGENT_CLIENT_ID;
  if (!clientId) return NextResponse.json({ status: "error", message: "AGENT_CLIENT_ID not set" }, { status: 500 });
  const parsed = Schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const supabase = createSupabaseServiceClient();
  const { data: run, error } = await supabase
    .from("audit_runs")
    .insert({ client_id: clientId, target_keyword: input.target_keyword, industry: input.industry ?? null, page_type: input.page_type ?? null, location: input.location ?? null })
    .select("id").single();
  if (error || !run) return NextResponse.json({ status: "error", message: error?.message ?? "Could not create audit run" }, { status: 500 });
  const auditInput: AuditInput = { ...input, pages: input.pages };
  waitUntil(runAuditPipeline(run.id, auditInput, clientId));
  return NextResponse.json({ status: "pending", audit_run_id: run.id }, { status: 202 });
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ status: "error", message: "id required" }, { status: 400 });
  const supabase = createSupabaseServiceClient();
  const { data: run } = await supabase.from("audit_runs").select("*").eq("id", id).eq("client_id", process.env.AGENT_CLIENT_ID ?? "").single();
  if (!run) return NextResponse.json({ status: "error", message: "Audit run not found" }, { status: 404 });
  if (run.status === "failed") return NextResponse.json({ status: "failed", keyword: run.target_keyword, error: run.error });
  if (run.status !== "complete") return NextResponse.json({ status: run.status, keyword: run.target_keyword });

  const { data: pageRows } = await supabase.from("audit_pages").select("*").eq("audit_run_id", id);
  const { data: cmp } = await supabase.from("audit_comparisons").select("*").eq("audit_run_id", id).single();
  if (!pageRows || !cmp) return NextResponse.json({ status: "error", message: "Report data is missing" }, { status: 500 });

  const pages: ExtractedPage[] = pageRows.map((row) => ({
    url: row.url, observed_rank: row.observed_rank, serp_check: row.serp_check, embedding: parseEmbedding(row.embedding),
    on_page: row.on_page, content: row.content, entities: row.entities, entity_relationships: row.entity_relationships,
    schema_data: row.schema_data, social_metadata: row.social_metadata, technical: row.technical, authority: row.authority,
    sentiment: row.sentiment, eeat: row.eeat, experience: row.experience, local: row.local,
    schema_recommendations: row.schema_recommendations ?? [], internal_link_suggestions: row.internal_links ?? null, scores: row.scores,
  }));
  const scores: PageScoreSummary[] = pageRows.map((row) => row.scores);
  const intent: SerpIntentResult = run.search_intent ?? { primary: "informational", secondary: [], reasoning: "" };
  const report = assembleReport({
    keyword: run.target_keyword, intent, pages, scores,
    comparison: {
      page_advantages: cmp.page_advantages, content_gaps: cmp.content_gaps, semantic_gaps: cmp.semantic_gaps, technical_gaps: cmp.technical_gaps,
      authority_gaps: cmp.authority_gaps, content_briefs: cmp.content_briefs ?? [], ranking_hypothesis: cmp.ranking_hypothesis,
      recommendations: cmp.recommendations, current_scores: cmp.current_scores, projected_scores: cmp.projected_scores,
      confidence: cmp.confidence, missing_data: cmp.missing_data,
    },
  });
  return NextResponse.json(report);
}

export const maxDuration = 300;
