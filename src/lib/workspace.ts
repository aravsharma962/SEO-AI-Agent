import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const ACTIVE_CLIENT_COOKIE = "active_client_id";

export interface WorkspaceSummary {
  clientId: string;
  clientName: string;
}

export interface Workspace extends WorkspaceSummary {
  userEmail: string;
}

/**
 * All client workspaces the signed-in user belongs to. A user can belong
 * to more than one client_members row (agency case) — the auto-
 * provisioning trigger (0002) only ever creates one on signup, but
 * createWorkspace() (src/app/workspace-actions.ts) can add more.
 */
export async function getUserWorkspaces(supabase: SupabaseClient): Promise<WorkspaceSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("client_members")
    .select("client_id, created_at, clients(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    clientId: row.client_id,
    clientName: (row.clients as unknown as { name: string } | null)?.name ?? "Untitled workspace",
  }));
}

/**
 * Resolves which workspace is "active" for this request: the
 * active_client_id cookie if set AND the user is actually a member of it
 * (never trust the cookie value blindly — a stale cookie from a workspace
 * the user was removed from must not leak access), else the first
 * workspace, else null if the user has none at all.
 */
export async function getActiveWorkspace(supabase: SupabaseClient): Promise<Workspace | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaces = await getUserWorkspaces(supabase);
  if (workspaces.length === 0) return null;

  const cookieClientId = cookies().get(ACTIVE_CLIENT_COOKIE)?.value;
  const active = workspaces.find((w) => w.clientId === cookieClientId) ?? workspaces[0]!;

  return { ...active, userEmail: user.email ?? "" };
}
