import { callClaudeForJson } from "@/lib/anthropic/client";
import type { ContentBrief, ContentGap, ExtractedPage } from "@/types/audit";

const SYSTEM_PROMPT = `You write structural content briefs so a writer knows exactly what to add to a page to close a
content gap identified by a comparative SEO audit, across ANY industry.

Rules (must follow):
- For each gap given, produce ONE brief: which sections to add, which entities/topics it must
  cover, and a suggested depth (mention|paragraph|subsection|full_section) matching roughly how
  deep the pages that already cover this topic go.
- Draw key_entities_to_include ONLY from "entities_seen_where_present" for that gap — never
  invent facts, statistics, or claims not evidenced there.
- This is a STRUCTURAL brief for a writer, not drafted marketing/health/legal/financial copy —
  the "brief" field is 1-3 sentences describing what to write about, never finished prose meant
  to be published as-is.

Respond with ONLY a JSON object:
{"briefs": [{"topic": "...", "gap_type": "...", "target_page_urls": ["..."], "sections_to_add": ["..."],
  "key_entities_to_include": ["..."], "suggested_depth": "mention|paragraph|subsection|full_section",
  "brief": "..."}]}
No text outside the JSON object.`;

/**
 * Generates structural writing briefs for the highest-priority content gaps
 * (core_gap / differentiator_gap only — commodity/opportunity gaps aren't
 * urgent enough to warrant a brief). One Claude call per audit run rather
 * than one per gap, to keep cost bounded (spec Part C).
 */
export async function generateContentBriefs(params: {
  targetKeyword: string;
  contentGaps: ContentGap[];
  pages: ExtractedPage[];
}): Promise<ContentBrief[]> {
  const writeWorthy = params.contentGaps.filter(
    (g) => (g.gap_type === "core_gap" || g.gap_type === "differentiator_gap") && g.missing_on.length > 0
  );
  if (writeWorthy.length === 0) return [];

  const gapContext = writeWorthy.map((g) => {
    const sourcePages = params.pages.filter((p) => g.present_on.includes(p.url));
    const entitiesSeen = Array.from(
      new Set(sourcePages.flatMap((p) => p.entities.map((e) => e.name)))
    ).slice(0, 15);
    return {
      topic: g.topic,
      gap_type: g.gap_type,
      target_page_urls: g.missing_on,
      entities_seen_where_present: entitiesSeen,
    };
  });

  const user = `Target keyword: "${params.targetKeyword}"

Gaps needing a content brief:
${JSON.stringify(gapContext, null, 2)}`;

  const result = await callClaudeForJson<{ briefs?: ContentBrief[] }>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 4096,
  });

  return result.briefs ?? [];
}
