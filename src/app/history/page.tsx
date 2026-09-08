import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import DeleteAuditButton from "./delete-button";

const STATUS_STYLES: Record<string, string> = {
  complete: "bg-emerald-50 text-emerald-700",
  running: "bg-amber-50 text-amber-700",
  pending: "bg-slate-100 text-slate-600",
  failed: "bg-red-50 text-red-700",
};

export default async function HistoryPage() {
  const supabase = createSupabaseServerClient();
  const workspace = await getWorkspace(supabase);
  if (!workspace) redirect("/login");

  const { data: runs } = await supabase
    .from("audit_runs")
    .select("id, target_keyword, status, created_at, completed_at")
    .eq("client_id", workspace.clientId)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Audit History</h1>
          <p className="mt-1 text-sm text-slate-600">{workspace.clientName}</p>
        </div>
        <Link href="/" className="text-sm text-slate-600 underline">
          New audit
        </Link>
      </div>

      <div className="mt-8 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {!runs || runs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No audits yet — run your first one from the New Audit page.</p>
        ) : (
          runs.map((run) => (
            <div key={run.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <Link href={`/history/${run.id}`} className="truncate font-medium text-slate-900 hover:underline">
                  {run.target_keyword}
                </Link>
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(run.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-none items-center gap-4">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                    STATUS_STYLES[run.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {run.status}
                </span>
                <DeleteAuditButton auditRunId={run.id} keyword={run.target_keyword} />
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
