import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoreModule } from "@/types/audit";

/**
 * Scoring-weight calibration tooling (Part D1 Phase 8 / Part F "ranking-
 * change attribution"). This is deliberately NOT a claim that the current
 * weights (src/lib/config/scoring-weights.ts) have been calibrated — they
 * haven't, and can't be yet. Calibrating a weight against outcomes
 * requires outcomes to exist: at least two completed audits, for the same
 * keyword+client, far enough apart in time for a rank to plausibly have
 * moved. On a fresh install (or any install still on its first audit per
 * keyword) this report correctly says "not enough data" instead of
 * fabricating a correlation from noise.
 *
 * How it works once data exists: for each pair of consecutive audit runs
 * sharing a (client, keyword), and for each page present in both, compute
 * each module's raw-score delta between the two runs and pair it with
 * that page's rank delta over the same window (both runs already seed
 * rank_history — see pipeline.ts — so this joins via audit_run_id, no
 * fuzzy timestamp matching needed). Pearson-correlate score delta against
 * rank *improvement* (rank going down is better, so the sign is flipped)
 * per module, across every such pair. A module whose score consistently
 * moves with rank improvement is pulling its weight; one that doesn't may
 * be over-weighted — but only trust this once sample_size clears the
 * floor below.
 */

const MIN_SAMPLE_SIZE = 10;

export interface ModuleCorrelation {
  module: ScoreModule;
  sample_size: number;
  correlation: number | null; // Pearson r, -1..1; null when sample_size < MIN_SAMPLE_SIZE
  interpretation: string;
}

export interface CalibrationReport {
  generated_at: string;
  keyword_pairs_compared: number; // consecutive audit-run pairs sharing a keyword
  excluded_null_rank_pairs: number; // pairs skipped because a rank was "not in top 10" (can't quantify a delta from null)
  ready: boolean; // true once at least one module cleared MIN_SAMPLE_SIZE
  module_correlations: ModuleCorrelation[];
  summary: string;
}

interface AuditRunRow {
  id: string;
  client_id: string;
  target_keyword: string;
  created_at: string;
}

interface PageScoreRow {
  audit_run_id: string;
  url: string;
  scores: { module_scores: { module: ScoreModule; raw_score: number; provisional: boolean }[] } | null;
}

interface RankRow {
  audit_run_id: string | null;
  url: string;
  observed_rank: number | null;
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return cov / Math.sqrt(varX * varY);
}

function interpret(correlation: number | null, sampleSize: number): string {
  if (correlation === null) {
    return `Only ${sampleSize} paired observation(s) so far — need ${MIN_SAMPLE_SIZE}+ before a correlation means anything. Keep running audits and letting the rank-check cron accumulate history.`;
  }
  if (Math.abs(correlation) < 0.15) {
    return "Little to no observed relationship between this module's score movement and rank movement in the data so far.";
  }
  const direction = correlation > 0 ? "moves with" : "moves opposite to";
  const strength = Math.abs(correlation) > 0.5 ? "a fairly strong" : "a weak-to-moderate";
  return `This module's score ${direction} rank improvement, ${strength} relationship (r=${correlation.toFixed(2)}, n=${sampleSize}). Still directional, not proof — see the module doc comment before changing any weight off this alone.`;
}

/**
 * Scoped to one client's own data via the RLS-scoped client passed in
 * (never the service-role client — this is a read a signed-in workspace
 * member should be able to trigger for their own history, nothing more).
 */
export async function computeCalibrationReport(
  supabase: SupabaseClient,
  clientId: string
): Promise<CalibrationReport> {
  const { data: runs } = await supabase
    .from("audit_runs")
    .select("id, client_id, target_keyword, created_at")
    .eq("client_id", clientId)
    .eq("status", "complete")
    .order("created_at", { ascending: true });

  const auditRuns = (runs ?? []) as AuditRunRow[];

  // Group runs by keyword — only consecutive runs for the SAME keyword are
  // comparable (different keywords aren't the same competitive set).
  const byKeyword = new Map<string, AuditRunRow[]>();
  auditRuns.forEach((run) => {
    const list = byKeyword.get(run.target_keyword) ?? [];
    list.push(run);
    byKeyword.set(run.target_keyword, list);
  });

  const consecutivePairs: [AuditRunRow, AuditRunRow][] = [];
  byKeyword.forEach((list) => {
    for (let i = 0; i < list.length - 1; i++) {
      consecutivePairs.push([list[i]!, list[i + 1]!]);
    }
  });

  const runIds = auditRuns.map((r) => r.id);
  const observationsByModule = new Map<ScoreModule, { scoreDelta: number; rankImprovement: number }[]>();
  let excludedNullRankPairs = 0;

  if (runIds.length > 0) {
    const { data: pageRows } = await supabase
      .from("audit_pages")
      .select("audit_run_id, url, scores")
      .in("audit_run_id", runIds);

    const { data: rankRows } = await supabase
      .from("rank_history")
      .select("audit_run_id, url, observed_rank")
      .in("audit_run_id", runIds);

    const pagesByRun = new Map<string, PageScoreRow[]>();
    (pageRows ?? []).forEach((row) => {
      const list = pagesByRun.get(row.audit_run_id) ?? [];
      list.push(row as PageScoreRow);
      pagesByRun.set(row.audit_run_id, list);
    });

    const rankByRunAndUrl = new Map<string, number | null>();
    (rankRows ?? []).forEach((row: RankRow) => {
      if (row.audit_run_id) rankByRunAndUrl.set(`${row.audit_run_id}|${row.url}`, row.observed_rank);
    });

    for (const [runA, runB] of consecutivePairs) {
      const pagesA = pagesByRun.get(runA.id) ?? [];
      const pagesB = pagesByRun.get(runB.id) ?? [];
      const urlsB = new Map(pagesB.map((p) => [p.url, p]));

      for (const pageA of pagesA) {
        const pageB = urlsB.get(pageA.url);
        if (!pageB || !pageA.scores || !pageB.scores) continue;

        const rankA = rankByRunAndUrl.get(`${runA.id}|${pageA.url}`) ?? null;
        const rankB = rankByRunAndUrl.get(`${runB.id}|${pageA.url}`) ?? null;

        if (rankA === null || rankB === null) {
          excludedNullRankPairs++;
          continue;
        }

        const rankImprovement = rankA - rankB; // rank number went down = improved

        const scoresA = new Map(pageA.scores.module_scores.map((m) => [m.module, m]));
        const scoresB = new Map(pageB.scores.module_scores.map((m) => [m.module, m]));

        scoresA.forEach((moduleA, module) => {
          const moduleB = scoresB.get(module);
          if (!moduleB || moduleA.provisional || moduleB.provisional) return;

          const scoreDelta = moduleB.raw_score - moduleA.raw_score;
          const list = observationsByModule.get(module) ?? [];
          list.push({ scoreDelta, rankImprovement });
          observationsByModule.set(module, list);
        });
      }
    }
  }

  const ALL_MODULES: ScoreModule[] = [
    "content_architecture",
    "entities_semantic",
    "eeat",
    "experience",
    "local",
    "schema_technical",
    "authority",
  ];

  const moduleCorrelations: ModuleCorrelation[] = ALL_MODULES.map((module) => {
    const observations = observationsByModule.get(module) ?? [];
    const sampleSize = observations.length;
    const correlation =
      sampleSize >= MIN_SAMPLE_SIZE
        ? pearsonCorrelation(
            observations.map((o) => o.scoreDelta),
            observations.map((o) => o.rankImprovement)
          )
        : null;

    return {
      module,
      sample_size: sampleSize,
      correlation,
      interpretation: interpret(correlation, sampleSize),
    };
  });

  const ready = moduleCorrelations.some((m) => m.correlation !== null);

  return {
    generated_at: new Date().toISOString(),
    keyword_pairs_compared: consecutivePairs.length,
    excluded_null_rank_pairs: excludedNullRankPairs,
    ready,
    module_correlations: moduleCorrelations,
    summary: ready
      ? "Enough paired history exists for at least one module — review the correlations below before touching any weight."
      : `Not enough history yet. Re-run this audit's keyword periodically (or let the rank-check cron accumulate data) — each module needs ${MIN_SAMPLE_SIZE}+ paired score/rank observations before a correlation is trustworthy.`,
  };
}
