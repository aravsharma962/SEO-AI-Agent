import type { ScoreModule } from "@/types/audit";

/**
 * Module weights for the current-score / projected-score calculation (A9).
 * Weights sum to 1.0 across all modules. If a module's underlying data is
 * missing (most commonly `authority`, per A9 and Part C), the scoring
 * engine excludes it and renormalizes the remaining weights rather than
 * guessing — see src/modules/scoring/index.ts.
 */
export const SCORING_WEIGHTS: Record<ScoreModule, number> = {
  content_architecture: 0.22,
  entities_semantic: 0.22,
  eeat: 0.16,
  experience: 0.1,
  local: 0.1,
  schema_technical: 0.12,
  authority: 0.08,
};

export const MODULES_THAT_CAN_BE_PROVISIONAL: ScoreModule[] = ["authority"];
