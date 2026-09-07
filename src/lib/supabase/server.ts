import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Request-scoped Supabase client. Uses the anon key and the caller's auth
 * cookies, so RLS policies (see supabase/migrations/0001_init.sql) apply.
 * Use this in API routes / server components that act on behalf of a user.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no request/response — safe
            // to ignore if session refresh is handled by middleware.
          }
        },
      },
    }
  );
}
