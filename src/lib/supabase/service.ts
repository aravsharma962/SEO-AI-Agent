import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS. This is what the pipeline
 * worker uses to write audit_pages / audit_comparisons / audit_usage rows
 * (see supabase/migrations/0001_init.sql). NEVER import this into anything
 * that runs in the browser or accepts direct, unauthenticated client input.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
