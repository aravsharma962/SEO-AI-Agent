import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace, getUserWorkspaces } from "@/lib/workspace";
import AuditDashboard from "./audit-dashboard";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const workspace = await getActiveWorkspace(supabase);

  if (!workspace) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-2xl font-semibold">No workspace found</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account isn&apos;t linked to a client workspace yet. This should happen
          automatically on signup (see supabase/migrations/0002_auth_provisioning.sql) —
          if you signed up before that migration was applied, contact an admin to be
          added to a client via the client_members table.
        </p>
      </main>
    );
  }

  const workspaces = await getUserWorkspaces(supabase);

  return (
    <AuditDashboard
      userEmail={workspace.userEmail}
      workspaces={workspaces}
      activeClientId={workspace.clientId}
    />
  );
}
