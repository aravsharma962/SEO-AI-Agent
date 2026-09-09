import { createHash } from "crypto";
import { callClaudeForJson } from "@/lib/anthropic/client";

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface PageChangeResult {
  changed: boolean;
  seo_relevant: boolean;
  summary: string;
  notable_additions: string[];
  notable_removals: string[];
}

const SYSTEM_PROMPT = `You compare two snapshots of the same webpage (older vs newer) and judge whether the
difference is SEO-meaningful — not just any byte-level change. Most real-world page diffs are noise:
ad copy, timestamps, unrelated widget content, minor rewording that changes nothing substantive.
Only flag changes that could plausibly affect search ranking or a competitive SEO analysis: new or
removed content sections, changed claims/credentials, new schema-relevant details (doctor info,
pricing, reviews), changed calls to action, restructured headings, or added/removed topics.

Respond with ONLY a JSON object:
{"changed": bool, "seo_relevant": bool, "summary": "<1-2 sentences, empty string if changed is false>",
 "notable_additions": ["..."], "notable_removals": ["..."]}
No text outside the JSON object.`;

/**
 * Judges whether a content diff matters for SEO, rather than just
 * reporting that bytes changed — a naive text diff on a real page is
 * mostly noise (ads, timestamps, unrelated dynamic content). This is the
 * one call in this module that's genuinely agentic: Claude decides what's
 * signal vs. noise, it isn't told.
 */
export async function diffPageChange(params: {
  targetKeyword: string;
  oldText: string;
  newText: string;
}): Promise<PageChangeResult> {
  const user = `Target keyword: "${params.targetKeyword}"

OLDER SNAPSHOT:
"""
${params.oldText.slice(0, 10000)}
"""

NEWER SNAPSHOT:
"""
${params.newText.slice(0, 10000)}
"""`;

  const result = await callClaudeForJson<Partial<PageChangeResult>>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 1024,
  });

  return {
    changed: Boolean(result.changed),
    seo_relevant: Boolean(result.seo_relevant),
    summary: result.summary ?? "",
    notable_additions: result.notable_additions ?? [],
    notable_removals: result.notable_removals ?? [],
  };
}
