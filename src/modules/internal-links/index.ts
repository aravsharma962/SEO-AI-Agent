import { callClaudeForJson } from "@/lib/anthropic/client";
import type { Entity, InternalLinkCandidate, InternalLinkSuggestion } from "@/types/audit";

const SYSTEM_PROMPT = `You suggest internal links to add to a page, across ANY industry. You are given this page's
content/entities and a list of candidate URLs from the SAME SITE, each with a short human-written
description of what it covers.

Rules (must follow):
- Only suggest a link when a candidate page's topic is genuinely relevant to something actually
  discussed on this page — never force an irrelevant link just to use every candidate.
- Anchor text must read naturally in the context of this page's content, not just repeat the
  candidate's topic verbatim.
- placement_context should say roughly where/why the link belongs (e.g. "in the pricing section,
  when mentioning enterprise plans").
- Suggest at most 8. Fewer good suggestions beats more weak ones — an empty list is correct when
  nothing is genuinely relevant.

Respond with ONLY a JSON object:
{"suggestions": [{"anchor_text": "...", "link_to_url": "...", "placement_context": "..."}]}
No text outside the JSON object.`;

/**
 * Suggests internal links FROM this page TO other pages on the same site.
 * Only runs when the caller supplies candidate URLs (AuditInput.internal_link_candidates)
 * for the page marked is_own_page — there's no way to discover a site's own
 * other pages from a single-page audit, so this stays null (not guessed)
 * rather than silently doing nothing, same "missing_data when unconfigured"
 * pattern as authority/semantic proximity.
 */
export async function suggestInternalLinks(params: {
  pageText: string;
  entities: Entity[];
  candidates: InternalLinkCandidate[];
}): Promise<InternalLinkSuggestion[]> {
  if (params.candidates.length === 0) return [];

  const truncated = params.pageText.slice(0, 12000);
  const user = `Candidate internal-link targets (same site):
${JSON.stringify(params.candidates)}

This page's top entities: ${JSON.stringify(params.entities.slice(0, 20))}

This page's content:
"""
${truncated}
"""`;

  const result = await callClaudeForJson<{ suggestions?: InternalLinkSuggestion[] }>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 2048,
  });

  return result.suggestions ?? [];
}
