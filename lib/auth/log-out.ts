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
 * Then this device forgets the account (lib/auth/forget-device-sign-in.ts):
 * the phone's own Google sign in, the app's Preferences copy of the session,
 * the cached home and any OAuth carry, so Continue with Google or Apple asks
 * which account instead of reopening the one just left. For "everywhere"
 * only once it ended.
 *
 * Browser only. No static imports: the caller hands in its own client's
 * `auth`, and the forgetting is loaded when a Log out happens.
 */

type SignOut = {
  signOut: (options: { scope: "local" | "global" }) => Promise<{ error: unknown }>
  getSession?: () => Promise<{ data: { session: { access_token?: string | null } | null } }>
}

/*
  FIRST, THIS PHONE LEAVES THE ACCOUNT'S PUSHES (r57, lib/push/unregister.ts),
  while the session is still there to say whose token it is. A phone that
  never registered (every browser) asks nothing.
*/
async function forgetPushDefault(auth: SignOut, scope: "local" | "global"): Promise<void> {
  if (typeof window === "undefined") return
  const access = await auth.getSession?.().then((r) => r?.data?.session?.access_token ?? null).catch(() => null)
  const { forgetThisDevicePush } = await import("@/lib/push/unregister")
  await forgetThisDevicePush(access ?? null, undefined, scope === "global")
}

export const LOGOUT_ROUTE = "/api/auth/logout"

export async function endDeviceSession(
  scope: "local" | "global",
  auth: SignOut,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  forget: () => Promise<void> = () => import("@/lib/auth/forget-device-sign-in").then((m) => m.forgetDeviceSignIn()),
  forgetPush: () => Promise<void> = () => forgetPushDefault(auth, scope),
): Promise<{ ended: boolean; everywhere: boolean }> {
  await forgetPush().catch(() => undefined)
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
  /* This device was asked to log out: it forgets the account whatever Auth answered. "Everywhere" that did not happen keeps it. */
  if (scope === "local" || everywhere) await forget().catch(() => undefined)
  /* "Everywhere" that Auth did not do ends nothing (the route keeps the cookie too), so the person can ask again. */
  return { ended: scope === "global" ? everywhere : browser || !!server, everywhere }
}
