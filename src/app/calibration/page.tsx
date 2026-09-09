import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { computeCalibrationReport } from "@/modules/calibration";

const MODULE_LABELS: Record<string, string> = {
  content_architecture: "Content Architecture",
  entities_semantic: "Entities & Semantic",
  eeat: "E-E-A-T",
  experience: "Experience",
  local: "Local SEO",
  schema_technical: "Schema & Technical",
  authority: "Authority",
};

export default async function CalibrationPage() {
  const supabase = createSupabaseServerClient();
  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/login");

  const report = await computeCalibrationReport(supabase, workspace.clientId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Scoring Weight Calibration</h1>
          <p className="mt-1 text-sm text-slate-600">{workspace.clientName}</p>
        </div>
        <Link href="/" className="flex-none text-sm text-slate-600 underline">
          New audit
        </Link>
      </div>

      <div
        className={`mt-6 rounded-md border px-4 py-3 text-sm ${
          report.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {report.summary}
      </div>

      <div className="mt-4 flex gap-6 text-xs text-slate-500">
        <span>
          <b className="font-mono text-slate-700">{report.keyword_pairs_compared}</b> consecutive audit-run
          pairs compared
        </span>
        <span>
          <b className="font-mono text-slate-700">{report.excluded_null_rank_pairs}</b> excluded (rank not in
          top 10 on one side)
        </span>
      </div>

      <div className="mt-8 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {report.module_correlations.map((m) => (
          <div key={m.module} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-slate-900">
                {MODULE_LABELS[m.module] ?? m.module}
              </span>
              <span className="font-mono text-xs text-slate-500">
                {m.correlation === null ? "—" : `r = ${m.correlation.toFixed(2)}`} · n={m.sample_size}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-600">{m.interpretation}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs italic text-slate-400">
        This correlates score movement with live-verified rank movement between your own
        repeated audits of the same keyword — it never guesses at a relationship it doesn&apos;t
        have enough data to support. Re-run this keyword&apos;s audit periodically (or let the
        rank-check cron accumulate history) to build up a real signal here.
      </p>
    </main>
  );
}
