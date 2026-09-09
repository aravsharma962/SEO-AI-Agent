import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assembleReport } from "@/modules/report";
import type { ExtractedPage, PageScoreSummary, SerpIntentResult } from "@/types/audit";

/**
 * GET /api/audits/[id] — poll status while running, fetch the full report
 * once complete (Part B1 "poll status, fetch report"; Part E response
 * shape). Reads go through the anon-key server client, so RLS confines
 * results to audit_runs the caller's client membership can see.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: auditRun, error: runError } = await supabase
    .from("audit_runs")
    .select("*")
    .eq("id", params.id)
    .single();

  if (runError || !auditRun) {
    return NextResponse.json({ status: "error", message: "Audit run not found" }, { status: 404 });
  }

  if (auditRun.status === "failed") {
    return NextResponse.json(
      { status: "failed", keyword: auditRun.target_keyword, error: auditRun.error },
      { status: 200 }
    );
  }

  if (auditRun.status !== "complete") {
    return NextResponse.json(
      { status: auditRun.status, keyword: auditRun.target_keyword },
      { status: 200 }
    );
  }

  const { data: pageRows } = await supabase
    .from("audit_pages")
    .select("*")
    .eq("audit_run_id", params.id);

  const { data: comparisonRow } = await supabase
    .from("audit_comparisons")
    .select("*")
    .eq("audit_run_id", params.id)
    .single();

  if (!pageRows || !comparisonRow) {
    return NextResponse.json(
      { status: "error", message: "Audit marked complete but report data is missing" },
      { status: 500 }
    );
  }

  const pages: ExtractedPage[] = pageRows.map((row) => ({
    url: row.url,
    observed_rank: row.observed_rank,
    serp_check: row.serp_check,
    on_page: row.on_page,
    content: row.content,
    entities: row.entities,
    entity_relationships: row.entity_relationships,
    schema_data: row.schema_data,
    social_metadata: row.social_metadata,
    technical: row.technical,
    authority: row.authority,
    sentiment: row.sentiment,
    eeat: row.eeat,
    experience: row.experience,
    local: row.local,
    scores: row.scores,
  }));

  const scores: PageScoreSummary[] = pageRows.map((row) => row.scores);

  const intent: SerpIntentResult = auditRun.search_intent ?? {
    primary: "informational",
    secondary: [],
    reasoning: "",
  };

  const report = assembleReport({
    keyword: auditRun.target_keyword,
    intent,
    pages,
    scores,
    comparison: {
      page_advantages: comparisonRow.page_advantages,
      content_gaps: comparisonRow.content_gaps,
      semantic_gaps: comparisonRow.semantic_gaps,
      technical_gaps: comparisonRow.technical_gaps,
      authority_gaps: comparisonRow.authority_gaps,
      ranking_hypothesis: comparisonRow.ranking_hypothesis,
      recommendations: comparisonRow.recommendations,
      current_scores: comparisonRow.current_scores,
      projected_scores: comparisonRow.projected_scores,
      confidence: comparisonRow.confidence,
      missing_data: comparisonRow.missing_data,
    },
  });

  return NextResponse.json(report);
}

/**
 * DELETE /api/audits/[id] — removes an audit run. RLS (see
 * supabase/migrations/0003_audit_runs_delete_policy.sql) confines this to
 * audit runs owned by the caller's client; audit_pages/audit_comparisons/
 * audit_usage cascade-delete automatically via their FK constraints.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("audit_runs")
    .delete()
    .eq("id", params.id)
    .select("id");

  if (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { status: "error", message: "Audit run not found or not permitted" },
      { status: 404 }
    );
  }

  return NextResponse.json({ status: "deleted" });
}
