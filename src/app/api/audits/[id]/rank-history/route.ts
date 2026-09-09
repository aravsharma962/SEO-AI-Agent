import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RankHistoryPoint {
  observed_rank: number | null;
  checked_at: string;
  note: string | null;
}

/**
 * GET /api/audits/[id]/rank-history — every rank_history point for this
 * audit's pages (both the check seeded at audit time and any later cron
 * re-checks — see src/app/api/cron/rank-check). Scoped through RLS via
 * the anon-key server client, same as the parent audit route.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: auditRun } = await supabase
    .from("audit_runs")
    .select("client_id, target_keyword")
    .eq("id", params.id)
    .single();

  if (!auditRun) {
    return NextResponse.json({ status: "error", message: "Audit run not found" }, { status: 404 });
  }

  const { data: pageRows } = await supabase
    .from("audit_pages")
    .select("url")
    .eq("audit_run_id", params.id);

  const urls = (pageRows ?? []).map((r) => r.url);
  if (urls.length === 0) {
    return NextResponse.json({ status: "success", history: {} });
  }

  const { data: historyRows } = await supabase
    .from("rank_history")
    .select("url, observed_rank, checked_at, note")
    .eq("client_id", auditRun.client_id)
    .eq("target_keyword", auditRun.target_keyword)
    .in("url", urls)
    .order("checked_at", { ascending: true });

  const history: Record<string, RankHistoryPoint[]> = {};
  urls.forEach((url) => {
    history[url] = [];
  });
  (historyRows ?? []).forEach((row) => {
    history[row.url] = history[row.url] ?? [];
    history[row.url]!.push({
      observed_rank: row.observed_rank,
      checked_at: row.checked_at,
      note: row.note,
    });
  });

  return NextResponse.json({ status: "success", history });
}
