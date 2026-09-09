"use client";

import { useEffect, useState } from "react";
import type {
  AuditReportResponse,
  ContentGap,
  Recommendation,
  RankingHypothesisItem,
} from "@/types/audit";
import { exportReportToExcel } from "@/lib/export-xlsx";
import { getOptimizationLevel } from "@/lib/optimization-level";
import RankHistory from "./rank-history";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

// Cycled by page index — v1 audits are 2 pages, but this holds up for more.
const PAGE_STYLES = [
  { badge: "bg-teal-50 text-teal-700", top: "border-t-teal-600", fill: "bg-teal-600", fillSoft: "bg-teal-50 border border-teal-600" },
  { badge: "bg-orange-50 text-orange-700", top: "border-t-orange-600", fill: "bg-orange-600", fillSoft: "bg-orange-50 border border-orange-600" },
  { badge: "bg-violet-50 text-violet-700", top: "border-t-violet-600", fill: "bg-violet-600", fillSoft: "bg-violet-50 border border-violet-600" },
];

const PRIORITY_ORDER: Record<Recommendation["priority"], number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_DOT: Record<Recommendation["priority"], string> = {
  high: "bg-rose-600",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};
const CONFIDENCE_DOT: Record<RankingHypothesisItem["confidence"], string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};
const EVIDENCE_LABEL: Record<RankingHypothesisItem["evidence_type"], string> = {
  observed: "Observed",
  inferred: "Inferred",
  requires_external_data: "Requires external data",
};
const GAP_TYPE_LABEL: Record<ContentGap["gap_type"], string> = {
  core_gap: "Core gap",
  differentiator_gap: "Differentiator gap",
  commodity_gap: "Commodity gap",
  opportunity_gap: "Opportunity gap",
};

export default function ReportView({
  report,
  auditRunId,
}: {
  report: AuditReportResponse;
  auditRunId: string;
}) {
  const storageKey = `seo-audit-checklist-${auditRunId}`;
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      // localStorage unavailable — checklist just won't persist, not fatal
    }
  }, [storageKey]);

  function toggle(index: number) {
    setChecked((prev) => {
      const next = { ...prev, [index]: !prev[index] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  if (!report.audit || !report.scores) {
    return <p className="text-sm text-slate-600">Report data is incomplete.</p>;
  }

  const audit = report.audit;
  const pageUrls = Object.keys(report.scores).sort((a, b) => {
    const ra = report.scores![a]?.observed_rank ?? 999;
    const rb = report.scores![b]?.observed_rank ?? 999;
    return ra - rb;
  });

  const recsWithIndex = (report.recommendations ?? []).map((r, i) => ({ ...r, __index: i }));
  const recsByPage = pageUrls.map((url) => ({
    url,
    recs: recsWithIndex
      .filter((r) => r.page_url === url)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
  }));
  const doneCount = Object.values(checked).filter(Boolean).length;
  const totalRecs = recsWithIndex.length;

  const gaps = audit.page_comparison.content_gaps;
  const coreAndDiff = gaps.filter((g) => g.gap_type === "core_gap" || g.gap_type === "differentiator_gap");
  const commodity = gaps.filter((g) => g.gap_type === "commodity_gap");
  const opportunity = gaps.filter((g) => g.gap_type === "opportunity_gap");
  const gapGroups = new Map<string, ContentGap[]>();
  coreAndDiff.forEach((g) => {
    const key = g.missing_on.join(",");
    gapGroups.set(key, [...(gapGroups.get(key) ?? []), g]);
  });

  return (
    <div className="space-y-12 font-body">
      {/* Masthead */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <p className="font-mono text-xs font-medium uppercase tracking-widest text-slate-400">
            Comparative Ranking Diagnostic
          </p>
          <button
            onClick={() => exportReportToExcel(report)}
            className="flex-none rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Export to Excel
          </button>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold text-slate-900" style={{ textWrap: "balance" }}>
          {report.keyword}
        </h1>
        {audit.search_intent && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs font-medium text-slate-700">
              Primary intent — {audit.search_intent.primary}
            </span>
            {audit.search_intent.secondary.map((s) => (
              <span key={s} className="rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-500">
                Secondary — {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600">
          <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-slate-400" />
          <span>
            Overall explanation confidence: <b className="font-semibold text-slate-900">{report.confidence}</b> — see{" "}
            <a href="#coverage" className="underline underline-offset-2">
              Data Coverage &amp; Caveats
            </a>
            .
          </span>
        </div>
      </div>

      {/* Scoreboard */}
      <section>
        <SectionHead eyebrow="Scoreboard" title="Current vs. projected readiness" note="A completeness score, not a rank predictor." />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pageUrls.map((url, i) => {
            const s = report.scores![url]!;
            const style = PAGE_STYLES[i % PAGE_STYLES.length]!;
            const advantages = audit.page_comparison.page_advantages[url] ?? [];
            return (
              <div key={url} className={`rounded-lg border border-slate-200 bg-white p-5 border-t-4 ${style.top}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${style.badge}`}>
                    {s.observed_rank ? `RANK #${s.observed_rank}` : "RANK NOT IN TOP 10"}
                  </span>
                  <span className="text-base font-semibold text-slate-900">{domainOf(url)}</span>
                </div>
                <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-slate-400 hover:text-slate-600">
                  {pathOf(url)}
                </a>
                {s.serp_check_note && (
                  <p className="mt-1 text-xs italic text-slate-400">Live check: {s.serp_check_note}</p>
                )}

                <div className="mt-4 space-y-2.5">
                  <Meter label="CURRENT" value={s.current} fillClass={style.fill} />
                  {typeof s.projected === "number" && <Meter label="PROJECTED" value={s.projected} fillClass={style.fillSoft} />}
                </div>

                {(() => {
                  const currentLevel = getOptimizationLevel(s.current);
                  const projectedLevel =
                    typeof s.projected === "number" ? getOptimizationLevel(s.projected) : null;
                  const levelUp = projectedLevel && projectedLevel.label !== currentLevel.label;
                  return (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${currentLevel.badgeClass}`}>
                        {currentLevel.label}
                      </span>
                      <span className="text-xs text-slate-400">— {currentLevel.description}</span>
                      {levelUp && (
                        <>
                          <span className="text-xs text-slate-300">→</span>
                          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${projectedLevel!.badgeClass}`}>
                            {projectedLevel!.label}
                          </span>
                          <span className="text-xs text-slate-400">if implemented</span>
                        </>
                      )}
                    </div>
                  );
                })()}

                <p className="mt-3 text-xs text-slate-500">
                  {typeof s.projected === "number" && (
                    <>
                      <b className="text-slate-700">+{s.projected - s.current} pts</b> achievable by closing the gaps below ·{" "}
                    </>
                  )}
                  Data coverage {s.coverage}%
                </p>

                {advantages.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Where this page leads</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-slate-600">
                      {advantages.map((a, idx) => (
                        <li key={idx}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <RankHistory auditRunId={auditRunId} url={url} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Content gap ledger */}
      {gaps.length > 0 && (
        <section>
          <SectionHead eyebrow="Content Gap Ledger" title="Sections to close" note="Core gaps: the other page covers this and you don't — highest priority." />
          <div className="space-y-6">
            {Array.from(gapGroups.entries()).map(([missingKey, groupGaps]) => (
              <div key={missingKey}>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {missingKey
                    .split(",")
                    .filter(Boolean)
                    .map(domainOf)
                    .join(", ") || "Unclaimed"}
                  <span className="font-mono text-xs font-normal text-slate-400">
                    — {groupGaps.length} {groupGaps.length === 1 ? "gap" : "gaps"}
                  </span>
                </p>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {groupGaps.map((g) => (
                    <div key={g.topic} className="grid grid-cols-[3px_1fr] gap-3 px-4 py-3">
                      <div className={g.gap_type === "core_gap" ? "rounded bg-rose-600" : "rounded bg-amber-500"} />
                      <div>
                        <p className="text-sm font-semibold capitalize text-slate-900">{g.topic.replace(/_/g, " ")}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{g.recommendation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {commodity.length > 0 && (
              <div className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
                <b className="text-slate-900">Covered by both, keep concise:</b>{" "}
                {commodity.map((g) => g.topic.replace(/_/g, " ")).join(" · ")} — no need to expand these further.
              </div>
            )}

            {opportunity.length > 0 && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <b>Unclaimed opportunity:</b> {opportunity.map((g) => g.topic.replace(/_/g, " ")).join(" · ")} — no compared page covers this yet.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Ranking hypothesis */}
      {(report.ranking_hypothesis?.length ?? 0) > 0 && (
        <section>
          <SectionHead eyebrow="Ranking Hypothesis" title="Why the ranking likely looks this way" note="A weighted hypothesis, never a claim of causality." />
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {report.ranking_hypothesis!.map((h, i) => (
              <div key={i} className="grid grid-cols-[3px_1fr] gap-3 px-4 py-3.5">
                <div className={`rounded ${CONFIDENCE_DOT[h.confidence]}`} />
                <div>
                  <p className="mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${CONFIDENCE_DOT[h.confidence]}`} />
                    {h.confidence} confidence · {EVIDENCE_LABEL[h.evidence_type]}
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">{h.statement}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action plan */}
      {totalRecs > 0 && (
        <section>
          <SectionHead eyebrow="Action Plan" title="For implementation" note="Ordered by priority within each site. Your progress is saved on this device." />
          <div className="mb-6 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: totalRecs ? `${(doneCount / totalRecs) * 100}%` : "0%" }}
              />
            </div>
            <span className="font-mono text-xs text-slate-500">
              {doneCount} / {totalRecs} implemented
            </span>
          </div>

          <div className="space-y-7">
            {recsByPage
              .filter((g) => g.recs.length > 0)
              .map((group, i) => {
                const style = PAGE_STYLES[pageUrls.indexOf(group.url) % PAGE_STYLES.length]!;
                return (
                  <div key={group.url}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${style.badge}`}>
                        {domainOf(group.url).toUpperCase()}
                      </span>
                      <h3 className="font-display text-base font-semibold text-slate-900">
                        {group.recs.length} recommendation{group.recs.length === 1 ? "" : "s"}
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                      {group.recs.map((r) => (
                        <label key={r.__index} className="flex cursor-pointer gap-3 px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={!!checked[r.__index]}
                            onChange={() => toggle(r.__index)}
                            className="mt-1 h-4 w-4 flex-none accent-emerald-600"
                          />
                          <div>
                            <span className="mb-1 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wide text-slate-400">
                              <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[r.priority]}`} />
                              {r.priority}
                            </span>
                            <p className={`text-sm font-medium leading-relaxed ${checked[r.__index] ? "text-slate-400 line-through" : "text-slate-900"}`}>
                              {r.action}
                            </p>
                            <p className={`mt-1 text-xs leading-relaxed ${checked[r.__index] ? "text-slate-300" : "text-slate-500"}`}>
                              {r.rationale}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Missing data / caveats */}
      <section id="coverage">
        <SectionHead eyebrow="Data Coverage &amp; Caveats" title="What this audit doesn't know" />
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          {(report.missing_data?.length ?? 0) > 0 && (
            <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-slate-600">
              {report.missing_data!.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm italic text-slate-400">
            This score measures on-page readiness and completeness, not a ranking guarantee. A higher score does not
            guarantee a higher Google position — treat every statement above as a weighted hypothesis, not a claim of
            causality.
          </p>
        </div>
      </section>

      <details className="rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-400">
          Raw JSON (debug)
        </summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(report, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SectionHead({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="mb-5">
      <p className="font-mono text-xs font-medium uppercase tracking-widest text-slate-400">{eyebrow}</p>
      <h2 className="mt-1 font-display text-xl font-semibold text-slate-900">{title}</h2>
      {note && <p className="mt-1 text-sm italic text-slate-400">{note}</p>}
    </div>
  );
}

function Meter({ label, value, fillClass }: { label: string; value: number; fillClass: string }) {
  return (
    <div className="grid grid-cols-[70px_1fr_32px] items-center gap-2.5">
      <span className="font-mono text-[11px] text-slate-400">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="text-right font-mono text-sm tabular-nums text-slate-700">{value}</span>
    </div>
  );
}
