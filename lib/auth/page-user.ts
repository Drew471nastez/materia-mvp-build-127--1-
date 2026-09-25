import "server-only"

import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { shouldSendToLogin } from "@/lib/auth/current-user"

/**
 * ===========================================================================
 *  THE PAGE WAS STILL SENDING PEOPLE TO /login
 * ===========================================================================
 * proxy.ts and the /app layout were both taught that "Supabase did not
 * answer" is not "nobody is signed in". The pages under them were not. Next
 * renders a layout and its page AT THE SAME TIME, so while the layout was
 * correctly holding the screen and recovering the session, the page beside it
 * ran
 *
 *     const { user } = await currentUserForRequest()
 *     if (!user) redirect("/login")
 *
 * and a `redirect()` thrown from a page wins. `user` is null in both cases,
 * so a slow answer from Supabase sent a signed in person to /login.
 *
 * That is also why it clusters around deploys. A new deployment starts on
 * cold functions, the first auth calls on them are the slowest of the day,
 * and the three second ceiling in lib/auth/current-user.ts is reached more
 * often. /login then finds the session in the browser and sends them back to
 * /app, which times out again, and after three bounces in six seconds the
 * login page's loop breaker gives up and shows the form. Signed out, as far
 * as anybody can see, with a valid session in the cookie the whole time.
 *
 * So a page asks this instead:
 *
 *   a user           render the page
 *   nobody           redirect to the login form (the proxy normally already has)
 *   could not tell   null. The page renders nothing and the layout's
 *                    NativeAuthGate reads the session in the browser, writes it
 *                    back and reloads. A page whose layout has no gate renders
 *                    <SessionRecovery /> (components/auth/session-recovery.tsx),
 *                    which is the same gate on its own.
 *
 * One cached answer per request (lib/auth/request-scope.ts), so the layout,
 * the page and its metadata agree and ask Supabase once between them.
 */
export async function pageUser(loginPath = "/login"): Promise<User | null> {
  const current = await currentUserForRequest()
  if (shouldSendToLogin(current)) redirect(loginPath)
  return current.user
}
