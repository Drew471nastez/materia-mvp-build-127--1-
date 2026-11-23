/**
 * ===========================================================================
 *  LOG OUT TAKES THIS PHONE OFF THE ACCOUNT'S PUSHES (r57)
 * ===========================================================================
 * A phone's token stayed in push_tokens under the account after Log out, so
 * a phone handed back, shared or sold kept showing "You made a sale!" and
 * every other push of an account nobody was signed into on it any more.
 * The row only moved when somebody else signed in on the same phone.
 *
 * Every Log out (lib/auth/log-out.ts endDeviceSession, lib/native-bridge.ts
 * nativeLogout) calls this first, while the session is still there to say
 * whose token it is: DELETE /api/push/register with this phone's token
 * removes the row if it is the signed in account's. Then the push client
 * forgets it sent the token (the "storelib:push-forget" event), so the next
 * person to sign in on this phone registers it again.
 *
 * The token is the one lib/push/client.ts last sent (window.__storelibPushToken),
 * or the one iOS's AppDelegate keeps (window.__storelibFcmToken). In a
 * browser, or a phone that never registered, there is none and nothing is
 * asked. Never throws, never waits more than PUSH_FORGET_MS.
 */

export const PUSH_FORGET_EVENT = "storelib:push-forget"
export const PUSH_FORGET_MS = 2_500

type PushWindow = { __storelibPushToken?: unknown; __storelibFcmToken?: unknown; dispatchEvent?: (e: Event) => boolean }

/** This phone's push token, if it has one. */
export function thisDeviceToken(w: PushWindow | undefined = typeof window === "undefined" ? undefined : (window as unknown as PushWindow)): string | null {
  if (!w) return null
  const t = typeof w.__storelibPushToken === "string" && w.__storelibPushToken ? w.__storelibPushToken : typeof w.__storelibFcmToken === "string" && w.__storelibFcmToken ? w.__storelibFcmToken : null
  return t && t.length <= 4096 ? t : null
}

/**
 * `everywhere` (Log out everywhere): every phone and browser of the account
 * leaves its pushes, not only this one, since none of them is signed in any
 * more. Asked from a browser too, which has no token of its own.
 */
export async function forgetThisDevicePush(accessToken: string | null = null, fetchImpl: typeof fetch = (input, init) => fetch(input, init), everywhere = false): Promise<boolean> {
  if (typeof window === "undefined") return false
  const token = thisDeviceToken()
  if (!token && !everywhere) return false
  try {
    ;(window as unknown as PushWindow).dispatchEvent?.(new Event(PUSH_FORGET_EVENT))
  } catch {
    /* no listener: nothing to forget */
  }
  const ctl = typeof AbortController === "function" ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), PUSH_FORGET_MS) : null
  try {
    const res = await fetchImpl("/api/push/register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      credentials: "include",
      body: JSON.stringify(everywhere ? { all: true } : { token }),
      ...(ctl ? { signal: ctl.signal } : {}),
    })
    return res.ok
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
