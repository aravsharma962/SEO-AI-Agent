/**
 * Maps a 0-100 completeness score to a human-readable maturity band. This
 * is a fixed lookup, not a Claude call, and deliberately so: a score band
 * is a pure function of a number that's already been computed — asking an
 * LLM to re-derive "is 47 Developing or Competitive" would add latency,
 * cost, and a new failure mode for zero judgment benefit. Per Part B2 of
 * the spec, Claude is reserved for steps that actually require judgment
 * (entity extraction, E-E-A-T scoring, the ranking hypothesis); this isn't
 * one of them.
 *
 * These labels describe on-page readiness/completeness only — never a
 * rank prediction (spec A4/A9). "Optimized" means "little left to fix
 * here," not "guaranteed to outrank anything."
 */
export interface OptimizationLevel {
  label: string;
  description: string;
  badgeClass: string;
}

const LEVELS: { min: number; level: OptimizationLevel }[] = [
  {
    min: 81,
    level: { label: "Optimized", description: "Maintain & monitor", badgeClass: "bg-emerald-50 text-emerald-700" },
  },
  {
    min: 61,
    level: { label: "Competitive", description: "Refinement stage", badgeClass: "bg-sky-50 text-sky-700" },
  },
  {
    min: 41,
    level: { label: "Developing", description: "Core gaps remain", badgeClass: "bg-amber-50 text-amber-700" },
  },
  {
    min: 0,
    level: { label: "Foundational", description: "Major gaps remain", badgeClass: "bg-rose-50 text-rose-700" },
  },
];

export function getOptimizationLevel(score: number): OptimizationLevel {
  const clamped = Math.min(100, Math.max(0, score));
  const match = LEVELS.find((l) => clamped >= l.min);
  return (match ?? LEVELS[LEVELS.length - 1]!).level;
}
