import "server-only"
import type { User } from "@supabase/supabase-js"
import { routeUser } from "@/lib/auth/route-user"
import { classifyAuthError } from "@/lib/auth/auth-error"
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
 *
 * `unavailable`: nobody could check the session (Auth slow or down), so the
 * route answers 503 Try again, never 401 (round rel2-auth).
 */
export async function pushRequestUser(req: Request): Promise<{ user: User | null; via: "cookie" | "bearer" | null; authError: string | null; unavailable: boolean }> {
  /* Round rel2-auth: Supabase Auth itself, as before (lib/auth/route-user `fresh`, retries and a ceiling); it says when Auth could not tell. */
  const who = await routeUser({ fresh: true })
  if (who.kind === "user") return { user: who.user, via: "cookie", authError: null, unavailable: false }
  let unavailable = who.kind === "unavailable"
  const header = req.headers.get("authorization")
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (bearer) {
    const { data, error } = await createAdminClient()
      .auth.getUser(bearer)
      .catch((e: unknown) => ({ data: { user: null }, error: e }))
    if (data.user) return { user: data.user, via: "bearer", authError: null, unavailable: false }
    /* The app's token: Auth refusing it is nobody, Auth not answering is "could not tell". */
    if (error && !classifyAuthError(error).signedOut) unavailable = true
  }
  return { user: null, via: null, authError: who.kind === "unavailable" ? who.reason : null, unavailable }
}
