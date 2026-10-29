import "server-only"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Who is asking, for the app's push routes (app/api/push/register, test).
 *
 * The cookie first. The app keeps its session in Capacitor Preferences and
 * copies it into the web view's cookies (lib/supabase/client.ts); when that
 * copy is missing or behind (a cold start that refreshed the token before
 * the cookie was written), the phone was signed in and these routes said 401,
 * so its token was never saved and no push ever reached it. lib/push/client.ts
 * sends the access token as well, read here as app/api/onboarding/finalize
 * reads it.
 */
export async function pushRequestUser(req: Request): Promise<{ user: User | null; via: "cookie" | "bearer" | null; authError: string | null }> {
  const {
    data: { user: cookieUser },
    error,
  } = await (await createClient()).auth.getUser()
  if (cookieUser) return { user: cookieUser, via: "cookie", authError: null }
  const header = req.headers.get("authorization")
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (bearer) {
    const { data } = await createAdminClient()
      .auth.getUser(bearer)
      .catch(() => ({ data: { user: null } }))
    if (data.user) return { user: data.user, via: "bearer", authError: null }
  }
  return { user: null, via: null, authError: error?.message ?? null }
}
