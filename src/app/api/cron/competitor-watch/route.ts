import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { fetchPage } from "@/modules/extraction";
import { hashText, diffPageChange } from "@/modules/competitor-watch";

const MAX_CHECKS_PER_RUN = 15; // bounds cost/runtime — a diff call only fires when the hash actually changed

interface TrackedPage {
  client_id: string;
  target_keyword: string;
  url: string;
}

/**
 * Page change monitoring agent (spec Part F "competitor change
 * monitoring"). Watches the same tracked (client, keyword, url) set that
 * rank_history tracks — both the client's own page and competitor pages
 * fall out of that set symmetrically, so this also catches unexpected
 * changes to your own site, not just competitor moves.
 *
 * Cheap path (hash compare) runs for every tracked page; the paid path
 * (diffPageChange, a Claude call) only fires when content actually
 * changed, which keeps this affordable even at higher tracked-page
 * counts. See src/app/api/cron/rank-check for the sibling job and the
 * same CRON_SECRET auth pattern.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: rankRows, error } = await supabase
    .from("rank_history")
    .select("client_id, target_keyword, url");

  if (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }

  const trackedByKey = new Map<string, TrackedPage>();
  (rankRows ?? []).forEach((row) => {
    trackedByKey.set(`${row.client_id}|${row.target_keyword}|${row.url}`, row);
  });
  const tracked = Array.from(trackedByKey.values()).slice(0, MAX_CHECKS_PER_RUN);

  let baselined = 0;
  let unchanged = 0;
  let changed = 0;
  let flagged = 0;
  let failed = 0;

  for (const page of tracked) {
    try {
      const { html } = await fetchPage(page.url);
      const $ = cheerio.load(html);
      const pageText = $("body").text().replace(/\s+/g, " ").trim();
      const contentHash = hashText(pageText);

      const { data: snapshot } = await supabase
        .from("page_snapshots")
        .select("content_hash, page_text")
        .eq("client_id", page.client_id)
        .eq("target_keyword", page.target_keyword)
        .eq("url", page.url)
        .maybeSingle();

      if (!snapshot) {
        baselined++;
      } else if (snapshot.content_hash === contentHash) {
        unchanged++;
      } else {
        changed++;
        const diff = await diffPageChange({
          targetKeyword: page.target_keyword,
          oldText: snapshot.page_text ?? "",
          newText: pageText,
        });

        if (diff.changed && diff.seo_relevant) {
          flagged++;
          await supabase.from("page_changes").insert({
            client_id: page.client_id,
            target_keyword: page.target_keyword,
            url: page.url,
            summary: diff.summary,
            seo_relevant: diff.seo_relevant,
            notable_additions: diff.notable_additions,
            notable_removals: diff.notable_removals,
          });
        }
      }

      await supabase.from("page_snapshots").upsert({
        client_id: page.client_id,
        target_keyword: page.target_keyword,
        url: page.url,
        content_hash: contentHash,
        page_text: pageText.slice(0, 12000),
        captured_at: new Date().toISOString(),
      });
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    status: "ok",
    tracked_pages: trackedByKey.size,
    checked_this_run: tracked.length,
    baselined,
    unchanged,
    changed,
    flagged_seo_relevant: flagged,
    failed,
  });
}

export const maxDuration = 300;
