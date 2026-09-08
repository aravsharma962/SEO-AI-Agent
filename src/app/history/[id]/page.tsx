import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import AuditView from "../../audit-view";

export default async function HistoryDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const workspace = await getWorkspace(supabase);
  if (!workspace) redirect("/login");

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/history" className="text-sm text-slate-500 hover:underline">
            ← Audit History
          </Link>
          <p className="mt-1 text-xs text-slate-400">{workspace.clientName}</p>
        </div>
        <Link href="/" className="text-sm text-slate-600 underline">
          New audit
        </Link>
      </div>

      <div className="mt-8">
        <AuditView auditRunId={params.id} />
      </div>
    </main>
  );
}
