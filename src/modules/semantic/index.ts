/**
 * Layer: Code (pgvector). Embeds entities/sections and computes cosine
 * similarity between pages to measure semantic proximity to the target
 * keyword and between competing pages (A8 Step 3).
 *
 * Uses Voyage AI for embeddings (Anthropic's recommended embedding
 * provider — Claude itself has no embeddings endpoint). Requires
 * VOYAGE_API_KEY; if unset, embedding is skipped and semantic proximity
 * falls back to null (surfaced as missing_data, never guessed — per A9).
 */

const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";
const EMBEDDING_MODEL = "voyage-3";

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(VOYAGE_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [text.slice(0, 8000)],
      }),
    });

    if (!response.ok) return null;

    const payload = await response.json();
    return payload?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * pgvector columns read back through PostgREST can come back as a plain
 * JS array or as a stringified "[0.1,0.2,...]" depending on the Postgres/
 * PostgREST version — normalize defensively rather than assume, since a
 * raw string silently "works" with array-shaped code (it has .length and
 * indexable characters) while producing meaningless similarity numbers.
 */
export function parseEmbedding(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic proximity between two pages' embeddings, 0-1. Null if either
 * embedding is unavailable (missing VOYAGE_API_KEY) — never guessed.
 */
export function semanticProximity(
  embeddingA: number[] | null,
  embeddingB: number[] | null
): number | null {
  if (!embeddingA || !embeddingB) return null;
  return cosineSimilarity(embeddingA, embeddingB);
}
