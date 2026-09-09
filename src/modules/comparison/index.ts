import type { AuditComparison, Confidence, ExtractedPage, PageScoreSummary, ScoreModule } from "@/types/audit";
import { buildContentGaps } from "./gap-classification";
import { generateRankingHypothesis } from "./ranking-hypothesis";
import { generateContentBriefs } from "@/modules/content-brief";
import { projectScore } from "@/modules/scoring";

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function normalizeConfidence(value: string): Confidence {
  if (value === "high" || value === "medium" || value === "low") return value;
  // "medium-high" and similar composite labels from the LLM collapse to medium.
  return "medium";
}

/**
 * A8 Step 9 + B6: builds the final comparison record — advantages, gap
 * classification, ranking hypothesis, recommendations, current/projected
 * scores, confidence, and missing_data. Deterministic gap classification
 * (Code) feeds into the Claude-generated narrative (guardrail-constrained
 * per A4/A10/A11), matching the B2 layer mapping.
 */
export async function buildComparison(params: {
  targetKeyword: string;
  pages: ExtractedPage[];
  scores: PageScoreSummary[];
}): Promise<AuditComparison> {
  const contentGaps = buildContentGaps(params.pages);

  const [hypothesis, contentBriefs] = await Promise.all([
    generateRankingHypothesis({
      targetKeyword: params.targetKeyword,
      pages: params.pages,
      scores: params.scores,
      contentGaps,
    }),
    generateContentBriefs({
      targetKeyword: params.targetKeyword,
      contentGaps,
      pages: params.pages,
    }),
  ]);

  const currentScores: Record<string, number> = {};
  const projectedScores: Record<string, number> = {};

  params.scores.forEach((summary) => {
    currentScores[summary.url] = summary.current_score;

    const impacts: Partial<Record<ScoreModule, number>> = {};
    hypothesis.recommendations
      .filter((r) => r.page_url === summary.url)
      .forEach((r) => {
        const targetModule = r.category as ScoreModule;
        const priorityImpact = r.priority === "high" ? 10 : r.priority === "medium" ? 5 : 2;
        // Additive; projectScore() caps each module's raw score at 100.
        impacts[targetModule] = (impacts[targetModule] ?? 0) + priorityImpact;
      });

    projectedScores[summary.url] = projectScore(summary, impacts);
  });

  const missingData = new Set<string>(hypothesis.missing_data ?? []);
  params.pages.forEach((p) => {
    if (p.authority.status !== "ok") {
      missingData.add(`${p.url}: authority/backlink data unavailable (DataForSEO not configured or call failed)`);
    }
  });

  const overallConfidence = hypothesis.ranking_hypothesis.length
    ? hypothesis.ranking_hypothesis.reduce<Confidence>((lowest, item) => {
        const c = normalizeConfidence(item.confidence);
        return CONFIDENCE_RANK[c] < CONFIDENCE_RANK[lowest] ? c : lowest;
      }, "high")
    : "low";

  return {
    page_advantages: hypothesis.page_advantages,
    content_gaps: contentGaps,
    semantic_gaps: contentGaps.filter((g) => g.gap_type === "opportunity_gap"),
    technical_gaps: [],
    authority_gaps: [],
    content_briefs: contentBriefs,
    ranking_hypothesis: hypothesis.ranking_hypothesis.map((h) => ({
      ...h,
      confidence: normalizeConfidence(h.confidence),
    })),
    recommendations: hypothesis.recommendations,
    current_scores: currentScores,
    projected_scores: projectedScores,
    confidence: overallConfidence,
    missing_data: Array.from(missingData),
  };
}
