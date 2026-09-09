import { callClaudeForJson } from "@/lib/anthropic/client";
import type { SearchIntent, SerpIntentResult } from "@/types/audit";

export type { SerpIntentResult };

const VALID_INTENTS: SearchIntent[] = [
  "informational",
  "commercial",
  "transactional",
  "local",
  "cost",
  "comparison",
  "navigational",
];

const SYSTEM_PROMPT = `You classify Google search intent for SEO audits. Allowed intent labels: ${VALID_INTENTS.join(
  ", "
)}.
A query can have one primary intent and zero or more secondary intents.
Respond with ONLY a JSON object: {"primary": "<intent>", "secondary": ["<intent>", ...], "reasoning": "<1-2 sentences>"}.
Do not include any text outside the JSON object.`;

/**
 * Step 1 (A8): SERP & Search Intent Analysis. Layer: Claude (small call).
 */
export async function classifySearchIntent(params: {
  targetKeyword: string;
  location?: string;
  industry?: string;
}): Promise<SerpIntentResult> {
  const user = `Target keyword: "${params.targetKeyword}"
Location: ${params.location ?? "unspecified"}
Industry: ${params.industry ?? "unspecified"}`;

  const result = await callClaudeForJson<SerpIntentResult>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 512,
  });

  return {
    primary: VALID_INTENTS.includes(result.primary) ? result.primary : "informational",
    secondary: (result.secondary ?? []).filter((i) => VALID_INTENTS.includes(i)),
    reasoning: result.reasoning ?? "",
  };
}
