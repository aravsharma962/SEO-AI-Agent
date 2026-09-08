import type { SupabaseClient } from "@supabase/supabase-js";

export interface Workspace {
  clientId: string;
  clientName: string;
  userEmail: string;
}

/**
 * Resolves the signed-in user's client workspace (see
 * supabase/migrations/0002_auth_provisioning.sql — every signup gets
 * exactly one client_members row). Returns null if unauthenticated or
 * unprovisioned, so callers can redirect/render accordingly.
 */
export async function getWorkspace(supabase: SupabaseClient): Promise<Workspace | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("client_members")
    .select("client_id, clients(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const clientName =
    (membership.clients as unknown as { name: string } | null)?.name ?? "Your workspace";

  return {
    clientId: membership.client_id,
    clientName,
    userEmail: user.email ?? "",
  };
}
