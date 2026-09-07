import { callClaudeForJson } from "@/lib/anthropic/client";
import type { SentimentData } from "@/types/audit";

const SYSTEM_PROMPT = `You are a diagnostic content-tone classifier for medical/local-service SEO pages.
This is NOT a ranking signal — it only describes tone so an SEO analyst can see whether
copy reads as clinical/informational vs. promotional/sales-driven.
Detect unsubstantiated promotional phrases such as: "100% safe", "no recurrence",
"permanent results for everyone", "best surgeon", "world-class", "guaranteed results".

Respond with ONLY a JSON object:
{"tone": "clinical|promotional|mixed|neutral", "promotional_phrases_detected": ["..."]}
No text outside the JSON object.`;

/**
 * A8 Step 4: Sentiment Analysis — diagnostic tag only, never a ranking
 * claim (A4, A10.4). Layer: Claude or NLP lib.
 */
export async function analyzeSentiment(pageText: string): Promise<SentimentData> {
  const truncated = pageText.slice(0, 12000);

  const result = await callClaudeForJson<Omit<SentimentData, "note">>({
    system: SYSTEM_PROMPT,
    user: truncated,
    maxTokens: 512,
  });

  return {
    tone: result.tone ?? "neutral",
    promotional_phrases_detected: result.promotional_phrases_detected ?? [],
    note: "Diagnostic tone signal only — never treated as a ranking factor (spec A4/A10.4).",
  };
}
