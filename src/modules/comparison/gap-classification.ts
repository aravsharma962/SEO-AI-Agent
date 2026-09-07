import type { ContentGap, ExtractedPage, GapType } from "@/types/audit";

/**
 * B6 — Gap classification. Deterministic, pure code.
 *
 * - core_gap: every page except this one covers it (highest priority)
 * - differentiator_gap: at least one but not all other pages cover it
 * - commodity_gap: every page covers it (worth checking depth, not adding)
 * - opportunity_gap: no page covers it (unclaimed angle)
 */
export function classifyGapType(
  topic: string,
  presentOn: string[],
  allPageUrls: string[]
): GapType {
  if (presentOn.length === allPageUrls.length) return "commodity_gap";
  if (presentOn.length === 0) return "opportunity_gap";
  if (presentOn.length === allPageUrls.length - 1) return "core_gap";
  return "differentiator_gap";
}

/**
 * Builds content gaps from the sections present per page (A8 Step 2 / B6).
 * One ContentGap per topic per target page that is missing it — a topic
 * fully covered everywhere still yields a commodity_gap entry so it's
 * visible in the report, per B6 ("add briefly or skip").
 */
export function buildContentGaps(pages: ExtractedPage[]): ContentGap[] {
  const allUrls = pages.map((p) => p.url);
  const allTopics = new Set<string>();
  pages.forEach((p) => p.content.sections_present.forEach((s) => allTopics.add(s)));

  const gaps: ContentGap[] = [];

  for (const topic of allTopics) {
    const presentOn = pages.filter((p) => p.content.sections_present.includes(topic as never)).map((p) => p.url);
    const missingOn = allUrls.filter((u) => !presentOn.includes(u));
    const gapType = classifyGapType(topic, presentOn, allUrls);

    if (missingOn.length === 0 && gapType !== "commodity_gap") continue;

    gaps.push({
      topic,
      gap_type: gapType,
      present_on: presentOn,
      missing_on: missingOn,
      recommendation:
        gapType === "core_gap"
          ? `Add a "${topic}" section — every other compared page covers it and this page does not.`
          : gapType === "differentiator_gap"
          ? `Consider adding a "${topic}" section — at least one higher-context competitor covers it.`
          : gapType === "commodity_gap"
          ? `"${topic}" is covered everywhere; keep it concise rather than expanding for its own sake.`
          : `No compared page covers "${topic}" — potential unique-angle opportunity, not a required fix.`,
    });
  }

  return gaps;
}
