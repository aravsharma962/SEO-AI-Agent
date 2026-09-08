import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY env var");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// `||` (not `??`) so an env var that's set-but-empty (e.g. added blank in a
// dashboard) still falls back correctly, not just an unset one.
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

/**
 * Calls Claude with a system prompt + user content and parses a single JSON
 * object out of the response. Every Claude-powered module in src/modules
 * (SERP intent, entities, E-E-A-T, experience, local, sentiment, ranking
 * hypothesis, recommendations — see Part B2) goes through this helper so
 * prompt/parse conventions stay consistent.
 */
export async function callClaudeForJson<T>(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 2048,
    system: params.system,
    messages: [{ role: "user", content: params.user }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response did not contain a text block");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`Could not find JSON in Claude response: ${textBlock.text.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]) as T;
}
