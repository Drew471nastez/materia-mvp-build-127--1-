import { createBrowserClient } from "@supabase/ssr"
export { createAdminClient } from "@/lib/supabase/admin"

export function createClient() {
  // Use default Supabase browser client with built-in cookie handling
  // This works correctly for PKCE auth flow on the same domain
  // The login page, OAuth redirect, and callback all stay on storelib.com
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
