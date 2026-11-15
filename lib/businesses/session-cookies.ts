import "server-only"
import type { NextResponse } from "next/server"
import { cleanSwitchName, cleanSwitchPhoto, SWITCH_COOKIE, SWITCH_COOKIE_MAX_AGE_S } from "@/lib/businesses/switch-screen"
import { cookiePairs, HOST_PREFIX, holdsHostSession } from "@/lib/supabase/host-session"
import { SESSION_COOKIE_MAX_AGE, sessionCookieChunks, storedSessionJson, storedSessionKey } from "@/lib/supabase/session-jar"

/**
 * ===========================================================================
 *  A SESSION HANDED OVER IN THE ANSWER'S OWN COOKIES
 * ===========================================================================
 * The switch (app/api/businesses/switch) and New business (app/api/
 * businesses) both hand the browser a session for another account. They
 * used to leave it to the page to store, through the Supabase client's
 * setSession, which waits on the client's lock, its start up, a network call
 * and its listeners, none of them with a limit: on a phone that is where
 * "Switching to ..." stayed for ever (lib/businesses/switch-flow).
 *
 * So the answer carries it in its own Set-Cookie, in the chunks and the
 * format the server and the client both use (lib/supabase/session-jar), and
 * the browser holds the new account the moment the answer lands, before any
 * script of the page runs. It also means a web view that sends a
 * `document.cookie` write to its network process a moment late (WKWebView
 * does) cannot load the next page with the old session. Host only, path /,
 * SameSite Lax, readable by the page, as @supabase/ssr sets it. Older chunks
 * the new session no longer needs are expired.
 *
 * `arrival` is the switch screen's name and photo (lib/businesses/switch-
 * screen SWITCH_COOKIE), cleaned here as the layout cleans it when it reads
 * it: only /app is sent it, for half a minute.
 *
 * Only ever called after the route has checked who is asking and that the
 * account is theirs to open.
 */
export function setSessionCookies(
  res: NextResponse,
  request: Request,
  session: { access_token: string; refresh_token: string; expires_at?: number | null; expires_in?: number | null; token_type?: string | null; user?: unknown },
  arrival?: { name?: unknown; photo?: unknown } | null,
): void {
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https"
  const key = storedSessionKey()
  if (key) {
    const pairs = cookiePairs(request.headers.get("cookie"))
    /* Under the `__Host-` name on HTTPS, every old-name chunk expired (lib/supabase/host-session.ts, round AX). */
    const host = secure || holdsHostSession(pairs, key)
    const { set, expire } = sessionCookieChunks(key, storedSessionJson(session), pairs.map((p) => p.name), host)
    const isHost = (name: string) => name.startsWith(HOST_PREFIX)
    for (const c of set) res.cookies.set({ name: c.name, value: c.value, path: "/", maxAge: SESSION_COOKIE_MAX_AGE, sameSite: "lax", secure: secure || isHost(c.name), httpOnly: false })
    for (const name of expire) res.cookies.set({ name, value: "", path: "/", maxAge: 0, sameSite: "lax", secure: secure || isHost(name), httpOnly: false })
  }
  const name = arrival ? cleanSwitchName(arrival.name) : null
  if (name) {
    const photo = cleanSwitchPhoto(arrival?.photo)
    res.cookies.set({ name: SWITCH_COOKIE, value: photo ? `${name}\n${photo}` : name, path: "/app", maxAge: SWITCH_COOKIE_MAX_AGE_S, sameSite: "lax", secure, httpOnly: false })
  }
}
