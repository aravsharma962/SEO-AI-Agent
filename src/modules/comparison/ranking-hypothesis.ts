import { callClaudeForJson } from "@/lib/anthropic/client";
import type {
  ContentGap,
  ExtractedPage,
  PageScoreSummary,
  Recommendation,
  RankingHypothesisItem,
} from "@/types/audit";

// Guardrails from spec A4, A10, A11 — enforced via the system prompt rather
// than post-hoc filtering, since this is narrative text generation.
const SYSTEM_PROMPT = `You write the ranking-hypothesis narrative and prioritized recommendations for a
Comparative Ranking Diagnostic and Optimization System (SEO). You are given per-page
module scores, content gaps, and structured module data for 2+ pages competing for the
same keyword.

You MUST follow these rules without exception:
1. Never claim a single factor (word count, schema, sentiment, entity count) causes
   ranking. Ranking causality is a weighted hypothesis, never a claim of certainty.
2. Never say a higher SEO score guarantees a higher Google position, or that 100/100
   means guaranteed rank #1.
3. Preferred hedged language: "This appears to be a likely advantage.", "This is a
   plausible contributor.", "This is a measurable on-page advantage, but ranking
   causality cannot be confirmed from page analysis alone."
4. Separate page-level SEO from domain-level authority explicitly when authority data
   is provisional/missing.
5. Do not recommend padding word count to match a competitor.
6. Do not recommend removing an existing strong section just because a competitor
   lacks it.
7. Never invent credentials, statistics, costs, success rates, or factual claims not present
   in the supplied page data.
8. When evidence is missing, label it "unknown" / evidence_type "requires_external_data"
   rather than guessing.
9. For each ranking_hypothesis item, set confidence based on evidence_type:
   high confidence only for directly observed facts (evidence_type "observed");
   medium for reasonable inference ("inferred"); low for anything requiring outside
   data ("requires_external_data") such as domain authority or CTR claims.
10. Recommendations must be specific and actionable (reference the actual missing
    section/entity/schema type), not generic ("improve SEO").

Respond with ONLY a JSON object of shape:
{
  "page_advantages": { "<page_url>": ["...", ...] },
  "ranking_hypothesis": [{"statement": "...", "confidence": "high|medium|low", "evidence_type": "observed|inferred|requires_external_data"}],
  "recommendations": [{"priority": "high|medium|low", "page_url": "...", "category": "content_architecture|entities_semantic|eeat|experience|local|schema_technical|authority|technical|content", "action": "...", "rationale": "..."}],
  "missing_data": ["..."],
  "overall_confidence": "high|medium|low|medium-high"
}
No text outside the JSON object.`;

export interface RankingHypothesisResult {
  page_advantages: Record<string, string[]>;
  ranking_hypothesis: RankingHypothesisItem[];
  recommendations: Recommendation[];
  missing_data: string[];
  overall_confidence: string;
}

export async function generateRankingHypothesis(params: {
  targetKeyword: string;
  pages: ExtractedPage[];
  scores: PageScoreSummary[];
  contentGaps: ContentGap[];
}): Promise<RankingHypothesisResult> {
  const pageSummaries = params.pages.map((p, i) => ({
    url: p.url,
    observed_rank: p.observed_rank,
    module_scores: params.scores[i]?.module_scores,
    current_score: params.scores[i]?.current_score,
    coverage: params.scores[i]?.coverage,
    entities: p.entities.slice(0, 30),
    entity_relationships: p.entity_relationships.slice(0, 30),
    eeat: p.eeat,
    experience: p.experience,
    local: p.local,
    schema_types_present: p.schema_data.types_present,
    authority: p.authority,
    sentiment: p.sentiment,
  }));

  const user = `Target keyword: "${params.targetKeyword}"

Per-page data:
${JSON.stringify(pageSummaries, null, 2)}

Content gaps (already classified per core/differentiator/commodity/opportunity):
${JSON.stringify(params.contentGaps, null, 2)}`;

  return callClaudeForJson<RankingHypothesisResult>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 8192,
  });
}
