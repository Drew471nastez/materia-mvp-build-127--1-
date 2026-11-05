/**
 * ===========================================================================
 *  LOG OUT ON THIS DEVICE, EVEN WHEN SUPABASE AUTH DOES NOT ANSWER (round 53)
 * ===========================================================================
 * `auth.signOut()` in the browser keeps the session, cookie and all, when
 * its request to Supabase Auth fails with anything but a 401, 403 or 404 (a
 * dropped connection, a timeout, a 5xx): @supabase/auth-js 2.87.3
 * GoTrueClient._signOut answers { error } and returns before it clears
 * anything. Every Log out in the app awaited it and went on as if it had
 * worked, so the next page was still signed in
 * (scripts/check-auth-flows-r52.mjs, "the cookie stayed").
 *
 * So the browser's sign out is followed by the server's
 * (app/api/auth/logout), which expires every session cookie of this browser
 * whatever Auth answers. `ended` is false only when neither could be
 * reached. For scope "global" both are true only when Supabase Auth itself
 * ended every session; otherwise nothing was ended, on purpose.
 *
 * Browser only. No imports: the caller hands in its own client's `auth`.
 */

type SignOut = { signOut: (options: { scope: "local" | "global" }) => Promise<{ error: unknown }> }

export const LOGOUT_ROUTE = "/api/auth/logout"

export async function endDeviceSession(
  scope: "local" | "global",
  auth: SignOut,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<{ ended: boolean; everywhere: boolean }> {
  const browser = await auth
    .signOut({ scope })
    .then((r) => !r?.error)
    .catch(() => false)
  const server = await fetchImpl(LOGOUT_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ scope }),
  })
    .then(async (res) => (res.ok ? (((await res.json().catch(() => ({}))) as { auth?: boolean }) ?? {}) : null))
    .catch(() => null)
  const everywhere = scope === "global" && (browser || server?.auth === true)
  /* "Everywhere" that Auth did not do ends nothing (the route keeps the cookie too), so the person can ask again. */
  return { ended: scope === "global" ? everywhere : browser || !!server, everywhere }
}
