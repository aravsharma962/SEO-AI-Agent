"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { ACTIVE_CLIENT_COOKIE } from "@/lib/workspace";

/**
 * Sets the active-workspace cookie, after confirming the caller is
 * actually a member of that client — never trust a client_id argument
 * blindly, even though it only came from our own dropdown.
 */
export async function switchWorkspace(clientId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: membership } = await supabase
    .from("client_members")
    .select("client_id")
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!membership) return;

  cookies().set(ACTIVE_CLIENT_COOKIE, clientId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/");
  revalidatePath("/history");
}

/**
 * Creates an additional client workspace for the signed-in user and makes
 * it active (agency case: one login, several client brands). Uses the
 * service-role client — same as the 0002 auto-provisioning trigger — to
 * bypass RLS for the insert, but the owner is always the authenticated
 * caller's own user id, never client input.
 */
export async function createWorkspace(name: string): Promise<{ clientId?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Workspace name is required" };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const service = createSupabaseServiceClient();

  const { data: client, error: clientError } = await service
    .from("clients")
    .insert({ name: trimmed, owner_user_id: user.id })
    .select("id")
    .single();

  if (clientError || !client) {
    return { error: clientError?.message ?? "Could not create workspace" };
  }

  const { error: memberError } = await service
    .from("client_members")
    .insert({ client_id: client.id, user_id: user.id, role: "owner" });

  if (memberError) {
    return { error: memberError.message };
  }

  cookies().set(ACTIVE_CLIENT_COOKIE, client.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/");
  revalidatePath("/history");

  return { clientId: client.id };
}
