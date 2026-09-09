"use client";

import { useEffect, useState } from "react";

interface RankHistoryPoint {
  observed_rank: number | null;
  checked_at: string;
  note: string | null;
}

/**
 * Renders nothing until there are at least 2 points — a single check
 * (the one seeded at audit time) isn't "history" yet. Fills in over time
 * as the rank-check cron (src/app/api/cron/rank-check) accumulates more.
 */
export default function RankHistory({ auditRunId, url }: { auditRunId: string; url: string }) {
  const [points, setPoints] = useState<RankHistoryPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audits/${auditRunId}/rank-history`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPoints(data?.history?.[url] ?? []);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [auditRunId, url]);

  if (!points || points.length < 2) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Rank history</p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        {points.map((p, i) => (
          <span key={i}>
            {new Date(p.checked_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}:{" "}
            <span className="font-mono font-medium text-slate-700">
              {p.observed_rank ? `#${p.observed_rank}` : "not top 10"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
