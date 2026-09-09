import Anthropic from "@anthropic-ai/sdk";
import { callClaudeForJson } from "@/lib/anthropic/client";
import type { SerpCheckResult } from "@/types/audit";

export type { SerpCheckResult };

const SYSTEM_PROMPT = `You verify a page's current organic Google ranking for a keyword using live web
search. Search for the exact keyword, then look at the organic results and determine whether the
given URL (matching by domain + path, not exact query-string) appears in the top 10, and at what
position (1 = top result).

Rules:
- Only report a position you can actually see in the search results — never guess or estimate.
- If the URL (or its domain, for a close variant) does not appear in the top 10 organic results
  you retrieved, set observed_rank to null — do not report a low-confidence guess as a real rank.
- Ignore ads/sponsored results when counting position.

Respond with ONLY a JSON object, as the LAST thing in your response, after any searching:
{"observed_rank": <1-10 or null>, "note": "<one sentence — what you found>"}`;

/**
 * Live SERP position check (Part A8 Step 1 / Part F "automated SERP
 * tracking"). Layer: Claude + the server-side web_search tool — this is
 * exactly the kind of step that CANNOT be done with deterministic code
 * (Google's live ranking isn't something the app can compute itself, only
 * observe via a real search). Replaces the earlier hardcoded
 * observed_rank the dashboard used to send.
 */
/**
 * Never throws — a search failure (rate limit, tool error, malformed
 * response) shouldn't take down the whole audit over what's effectively a
 * bonus verification step. Falls back to "unverified" with an explanatory
 * note, consistent with the "say unknown rather than guessing" rule
 * (spec A10.10) that already governs the authority module.
 */
export async function checkSerpPosition(params: {
  targetKeyword: string;
  url: string;
  location?: string;
}): Promise<SerpCheckResult> {
  const checked_at = new Date().toISOString();

  try {
    const domain = new URL(params.url).hostname;

    const user = `Keyword: "${params.targetKeyword}"${params.location ? `\nLocation context: ${params.location}` : ""}
Target URL: ${params.url}
Target domain: ${domain}`;

    const tools: Anthropic.ToolUnion[] = [
      {
        type: "web_search_20260318",
        name: "web_search",
        max_uses: 3,
      },
    ];

    const result = await callClaudeForJson<{ observed_rank: number | null; note: string }>({
      system: SYSTEM_PROMPT,
      user,
      maxTokens: 1536,
      tools,
    });

    const rank =
      typeof result.observed_rank === "number" && result.observed_rank >= 1 && result.observed_rank <= 10
        ? result.observed_rank
        : null;

    return { observed_rank: rank, checked_at, note: result.note ?? "" };
  } catch (error) {
    return {
      observed_rank: null,
      checked_at,
      note: `Live rank verification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
