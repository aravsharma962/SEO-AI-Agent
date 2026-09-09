"use client";

import { useEffect, useState } from "react";

interface PageChangeEntry {
  url: string;
  summary: string;
  notable_additions: string[] | null;
  notable_removals: string[] | null;
  detected_at: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Renders nothing until the competitor-watch cron has actually flagged an
 * SEO-relevant change on one of this audit's pages — most audits, most
 * weeks, will show nothing here, which is correct: most page changes
 * aren't SEO-relevant, and this only surfaces the ones that are.
 */
export default function PageChangesPanel({ auditRunId }: { auditRunId: string }) {
  const [changes, setChanges] = useState<PageChangeEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audits/${auditRunId}/page-changes`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setChanges(data?.changes ?? []);
      })
      .catch(() => {
        if (!cancelled) setChanges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [auditRunId]);

  if (!changes || changes.length === 0) return null;

  return (
    <section>
      <div className="mb-5">
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-slate-400">
          Page Activity
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-slate-900">
          Changes detected since this audit
        </h2>
        <p className="mt-1 text-sm italic text-slate-400">
          Only SEO-relevant changes are shown — most page edits (ads, timestamps, minor rewording)
          are filtered out.
        </p>
      </div>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {changes.map((c, i) => (
          <div key={i} className="px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-slate-900">{domainOf(c.url)}</span>
              <span className="font-mono text-xs text-slate-400">
                {new Date(c.detected_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{c.summary}</p>
            {(c.notable_additions?.length ?? 0) > 0 && (
              <p className="mt-1.5 text-xs text-emerald-700">+ {c.notable_additions!.join(" · ")}</p>
            )}
            {(c.notable_removals?.length ?? 0) > 0 && (
              <p className="mt-1 text-xs text-rose-700">− {c.notable_removals!.join(" · ")}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
