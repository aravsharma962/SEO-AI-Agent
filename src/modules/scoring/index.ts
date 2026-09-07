import type { ExtractedPage, ModuleScore, PageScoreSummary, ScoreModule } from "@/types/audit";
import { SCORING_WEIGHTS } from "@/lib/config/scoring-weights";
import { MODULE_SCORERS } from "./module-scorers";

const ALL_MODULES = Object.keys(SCORING_WEIGHTS) as ScoreModule[];

/**
 * Scoring engine (A9). Deterministic — pure code, no LLM. Computes each
 * module's raw score, then a weighted normalized current_score. Provisional
 * modules (currently: authority, when DataForSEO data is unavailable) are
 * EXCLUDED from the normalized total and their weight redistributed across
 * the remaining modules, per A9: "mark the authority score provisional or
 * exclude it from the normalized total rather than guessing."
 */
export function scorePage(page: ExtractedPage, allPages: ExtractedPage[]): PageScoreSummary {
  const moduleScores: ModuleScore[] = ALL_MODULES.map((module) => {
    const scored = MODULE_SCORERS[module](page, allPages);
    return { ...scored, weight: SCORING_WEIGHTS[module] };
  });

  const usableScores = moduleScores.filter((m) => !m.provisional);
  const totalUsableWeight = usableScores.reduce((sum, m) => sum + m.weight, 0);

  const currentScore =
    totalUsableWeight === 0
      ? 0
      : usableScores.reduce((sum, m) => sum + m.raw_score * m.weight, 0) / totalUsableWeight;

  const coverage = (usableScores.length / ALL_MODULES.length) * 100;

  return {
    url: page.url,
    module_scores: moduleScores,
    current_score: Math.round(currentScore),
    coverage: Math.round(coverage),
  };
}

export function scoreAllPages(pages: ExtractedPage[]): PageScoreSummary[] {
  return pages.map((page) => scorePage(page, pages));
}

/**
 * Projected score after applying a set of recommendations. Each
 * recommendation nudges its target module's raw score toward 100 by
 * `impact` points (capped), then the page is re-normalized with the same
 * weighting logic. This is a readiness/completeness projection, NOT a
 * rank prediction (spec A9/A10.9).
 */
export function projectScore(
  summary: PageScoreSummary,
  moduleImpacts: Partial<Record<ScoreModule, number>>
): number {
  const adjusted = summary.module_scores.map((m) => {
    const impact = moduleImpacts[m.module] ?? 0;
    return { ...m, raw_score: Math.min(100, m.raw_score + impact) };
  });

  const usable = adjusted.filter((m) => !m.provisional);
  const totalWeight = usable.reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return summary.current_score;

  const projected = usable.reduce((sum, m) => sum + m.raw_score * m.weight, 0) / totalWeight;
  return Math.round(projected);
}
