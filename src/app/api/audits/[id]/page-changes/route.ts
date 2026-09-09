import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PageChangeEntry {
  url: string;
  summary: string;
  notable_additions: string[] | null;
  notable_removals: string[] | null;
  detected_at: string;
}

/**
 * GET /api/audits/[id]/page-changes — SEO-relevant changes detected on
 * this audit's pages by the competitor-watch cron (src/app/api/cron/
 * competitor-watch), most recent first. Scoped through RLS via the
 * anon-key server client, same as the sibling rank-history route.
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
    return NextResponse.json({ status: "success", changes: [] });
  }

  const { data: changeRows } = await supabase
    .from("page_changes")
    .select("url, summary, notable_additions, notable_removals, detected_at")
    .eq("client_id", auditRun.client_id)
    .eq("target_keyword", auditRun.target_keyword)
    .in("url", urls)
    .eq("seo_relevant", true)
    .order("detected_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ status: "success", changes: (changeRows ?? []) as PageChangeEntry[] });
}
