import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkSerpPosition } from "@/modules/serp-check";

const STALE_AFTER_DAYS = 6; // ~weekly cadence even if the cron itself fires daily
const MAX_CHECKS_PER_RUN = 20; // bounds cost/runtime per invocation — each check is a paid Claude + web_search call

interface TrackedPage {
  client_id: string;
  target_keyword: string;
  url: string;
  checked_at: string;
}

/**
 * Periodic SERP re-check (Part F "automated SERP tracking" / "ranking-
 * change attribution"). Vercel Cron hits this on a schedule (see
 * vercel.json); Vercel signs the request with CRON_SECRET automatically
 * when that env var is set — see https://vercel.com/docs/cron-jobs.
 *
 * Every (client, keyword, url) combo that has ever appeared in
 * rank_history is a "tracked page." This finds the ones whose most recent
 * check is older than STALE_AFTER_DAYS, re-checks up to
 * MAX_CHECKS_PER_RUN of them (oldest first), and appends new rows —
 * audit_run_id is left null since a cron check isn't tied to any specific
 * audit run.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  // No efficient "distinct latest per group" via the JS query builder —
  // fine at this scale; group in memory instead of hand-rolling raw SQL.
  const { data: rows, error } = await supabase
    .from("rank_history")
    .select("client_id, target_keyword, url, checked_at")
    .order("checked_at", { ascending: false });

  if (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }

  const latestByGroup = new Map<string, TrackedPage>();
  (rows ?? []).forEach((row) => {
    const key = `${row.client_id}|${row.target_keyword}|${row.url}`;
    if (!latestByGroup.has(key)) latestByGroup.set(key, row);
  });

  const staleThreshold = Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const due = Array.from(latestByGroup.values())
    .filter((page) => new Date(page.checked_at).getTime() < staleThreshold)
    .sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime())
    .slice(0, MAX_CHECKS_PER_RUN);

  let checked = 0;
  let failed = 0;

  for (const page of due) {
    const result = await checkSerpPosition({ targetKeyword: page.target_keyword, url: page.url });

    const { error: insertError } = await supabase.from("rank_history").insert({
      client_id: page.client_id,
      audit_run_id: null,
      target_keyword: page.target_keyword,
      url: page.url,
      observed_rank: result.observed_rank,
      note: result.note,
      checked_at: result.checked_at,
    });

    if (insertError) failed++;
    else checked++;
  }

  return NextResponse.json({
    status: "ok",
    tracked_pages: latestByGroup.size,
    due_this_run: due.length,
    checked,
    failed,
  });
}

// Sequential checks (rate-limit friendly) across up to MAX_CHECKS_PER_RUN
// pages can take a few minutes.
export const maxDuration = 300;
