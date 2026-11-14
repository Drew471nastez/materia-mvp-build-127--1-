import { createBrowserClient } from "@supabase/ssr"
import { mediaFetch, withMediaAddresses } from "@/lib/storage/media-url"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { isNativePlatform } from "./native-platform"
import { fresherSession, readSessionFromCookies, SESSION_COOKIE_MAX_AGE, sessionCookieRemovals, sessionCookieWrites, storedSessionKey } from "./session-jar"
import { cookiePairs, HOST_PREFIX, outgoingName, plantedExpiries, sessionView, writesHostCookies } from "./host-session"

/**
 * createAdminClient is NOT re-exported here.
 *
 * This module is the browser's Supabase client, and it used to forward the
 * service-role client too — so `import { createAdminClient } from
 * "@/lib/supabase/client"` read as a legitimate browser import. Server code
 * imports it from "@/lib/supabase/admin", which is `server-only` and fails
 * the build if a client component reaches for it.
 */

// Singleton instance to prevent rate limiting from multiple client creations
let browserClient: ReturnType<typeof createBrowserClient> | null = null

/**
 * Get the main domain for cross-subdomain cookies
 */
function getMainDomain(): string {
  return process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
}

/**
 * Check if we're on localhost
 */
function isLocalhost(): boolean {
  return getMainDomain().includes("localhost")
}

/**
 * HOST-ONLY, deliberately — see the long note in lib/supabase/server.ts.
 *
 * This cookie is readable from JavaScript (that is how createBrowserClient
 * restores a session), and AI-built sites are published on
 * <slug>.storelib.com. Scoping it to `.storelib.com` would hand every
 * published page the login tokens of every visitor who has one.
 */
function getCookieDomain(): undefined {
  return undefined
}

/* Detect Capacitor native platform synchronously (lib/supabase/native-platform.ts, its own file so the header can ask it without this one). */
export { isNativePlatform }

/**
 * Capacitor Preferences storage adapter for Supabase auth.
 *
 * On native Android the WebView's localStorage can be unreliable:
 * it lives in a different process from Chrome Custom Tabs, and the
 * PKCE code-verifier stored by signInWithOAuth() must survive across
 * the Custom Tab OAuth round-trip.  Capacitor Preferences is backed
 * by Android SharedPreferences which is process-safe and persists
 * across app restarts.
 *
 * supabase-js accepts async getItem/setItem/removeItem — the dynamic
 * import of @capacitor/preferences is cached after the first call.
 *
 * This is the DEVICE copy. The session key alone is also kept in step with
 * the WebView's cookie jar by `capacitorStorage` below.
 */
const deviceStorage = {
  async getItem(key: string): Promise<string | null> {
    // Try Preferences first (primary, process-safe storage).
    try {
      const { Preferences } = await import("@capacitor/preferences")
      const { value } = await Preferences.get({ key })
      if (value !== null) return value
    } catch { /* Preferences unavailable — fall through to localStorage */ }
    // Fallback: localStorage mirror (set by setItem below) or legacy sessions
    // from older app versions that stored directly in localStorage.
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem(key)
      }
    } catch { /* localStorage unavailable */ }
    return null
  },
  async setItem(key: string, value: string): Promise<void> {
    // Mirror to localStorage FIRST (synchronous) — ensures reads on cold start
    // work even if the async Preferences write hasn't completed yet.
    try { localStorage.setItem(key, value) } catch { /* ignore */ }
    // Write to Preferences (primary, survives process switches).
    try {
      const { Preferences } = await import("@capacitor/preferences")
      await Preferences.set({ key, value })
    } catch {
      // Retry once after 100ms — transient failures happen during app state transitions
      try {
        await new Promise(r => setTimeout(r, 100))
        const { Preferences } = await import("@capacitor/preferences")
        await Preferences.set({ key, value })
      } catch { /* ignore */ }
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const { Preferences } = await import("@capacitor/preferences")
      await Preferences.remove({ key })
    } catch { /* ignore */ }
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  },
}

function readCookieHeader(): string {
  try {
    return typeof document === "undefined" ? "" : document.cookie
  } catch {
    return ""
  }
}

function writeCookies(lines: string[]): void {
  try {
    for (const line of lines) document.cookie = line
  } catch { /* no cookie jar: the device copy still holds the session */ }
}

const secureCookies = () => typeof location !== "undefined" && location.protocol === "https:"

/* http://localhost cannot hold a `__Host-` cookie (it needs Secure): the old name stays there. */
const onLocalhost = () => isLocalhost() || (typeof location !== "undefined" && /(^|\.)localhost$/.test(location.hostname))

/**
 * What the native client stores through.
 *
 * THE SESSION is one session in two places, never two sessions: read from
 * whichever of the device copy and the cookie is newer, written to both,
 * removed from both. lib/supabase/session-jar.ts has the reason, which is a
 * sign-out nobody asked for. Every other key, the PKCE verifier included, is
 * the device copy alone, exactly as before.
 */
export const capacitorStorage = {
  async getItem(key: string): Promise<string | null> {
    const device = await deviceStorage.getItem(key)
    if (key !== storedSessionKey()) return device
    const cookie = await readSessionFromCookies(key, readCookieHeader())
    const newest = fresherSession(device, cookie)
    /* The server renewed it last: bring the device copy up to date, so the
       backup is never the one that falls behind. */
    if (newest && newest !== device) await deviceStorage.setItem(key, newest)
    return newest ?? device
  },
  async setItem(key: string, value: string): Promise<void> {
    if (key === storedSessionKey()) {
      /* The cookie first, and synchronously: the next request the proxy sees
         must carry this token and not the one it replaces. */
      writeCookies(sessionCookieWrites(key, value, readCookieHeader(), secureCookies()))
    }
    await deviceStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    if (key === storedSessionKey()) writeCookies(sessionCookieRemovals(key, readCookieHeader(), secureCookies()))
    await deviceStorage.removeItem(key)
  },
}

/**
 * THE WEB CLIENT'S COOKIES, UNDER `__Host-` (round AX, lib/supabase/host-session.ts).
 *
 * @supabase/ssr reads document.cookie itself when it is given no cookie
 * methods, and keeps the FIRST of two cookies with one name: a session a
 * published site planted with Domain=storelib.com could win over the
 * visitor's own. These methods show it the `__Host-` copy instead (which no
 * other host can set), under the name it expects, and write its renewals
 * there.
 *
 * Reading also finishes the move for this browser, at once, on pages the
 * proxy answers from the CDN without a Set-Cookie: an old-name session that
 * arrived once is copied to `__Host-` and the old name expired; a planted
 * copy beside the real one is expired where a site could have put it
 * (Domain=storelib.com), never the host's own, and the jar is read again.
 */
export const browserSessionCookies = {
  getAll(): { name: string; value: string }[] {
    const key = storedSessionKey()
    let pairs = cookiePairs(readCookieHeader())
    let view = sessionView(pairs, key)
    const https = secureCookies()
    const host = writesHostCookies({ https, localhost: onLocalhost(), pairs, key })
    if (!host) return view.cookies
    if (view.tossed.length > 0 && typeof location !== "undefined") {
      writeCookies(plantedExpiries(view.tossed, getMainDomain(), location.pathname))
      pairs = cookiePairs(readCookieHeader())
      view = sessionView(pairs, key)
    }
    if (view.migrate.length > 0) {
      writeCookies([
        ...view.migrate.map((c) => `${HOST_PREFIX}${c.name}=${encodeURIComponent(c.value)}; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; samesite=lax; secure`),
        ...view.migrate.map((c) => `${c.name}=; path=/; max-age=0; samesite=lax; secure`),
      ])
    }
    if (view.shadowed.length > 0) writeCookies(view.shadowed.map((name) => `${name}=; path=/; max-age=0; samesite=lax; secure`))
    return view.cookies
  },
  setAll(list: { name: string; value: string; options?: { path?: string; maxAge?: number; sameSite?: string | boolean; secure?: boolean; domain?: string } }[]): void {
    const key = storedSessionKey()
    const pairs = cookiePairs(readCookieHeader())
    const host = writesHostCookies({ https: secureCookies(), localhost: onLocalhost(), pairs, key })
    const lines: string[] = []
    for (const { name, value, options } of list) {
      const out = outgoingName(name, key, host)
      const prefixed = out !== name
      const path = prefixed ? "/" : options?.path || "/"
      const maxAge = typeof options?.maxAge === "number" ? `; max-age=${options.maxAge}` : ""
      const domain = !prefixed && options?.domain ? `; domain=${options.domain}` : ""
      const sameSite = typeof options?.sameSite === "string" ? `; samesite=${options.sameSite}` : "; samesite=lax"
      const secure = prefixed || options?.secure ? "; secure" : ""
      lines.push(`${out}=${encodeURIComponent(value)}; path=${path}${maxAge}${domain}${sameSite}${secure}`)
      if (prefixed) lines.push(`${name}=; path=/; max-age=0; samesite=lax; secure`)
    }
    writeCookies(lines)
  },
}


export function createClient() {
  // Return existing client if already created (singleton pattern)
  if (browserClient) {
    return browserClient
  }

  if (isNativePlatform()) {
    // ── Capacitor native path ─────────────────────────────────────────
    // Use the bare supabase-js client so we can set:
    //   • detectSessionInUrl: false  — we handle the callback via appUrlOpen
    //   • flowType: "pkce"           — PKCE code exchange happens client-side
    //   • persistSession: true       — session survives app restarts
    //   • autoRefreshToken: true     — automatically refresh expired tokens
    //   • storage: Capacitor Preferences — backed by Android SharedPreferences,
    //     process-safe and survives Chrome Custom Tab ↔ WebView switches.
    //     This is critical: the PKCE code-verifier stored by signInWithOAuth()
    //     must be readable by exchangeCodeForSession() after the OAuth
    //     round-trip through Chrome Custom Tab.
    browserClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { fetch: mediaFetch },
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: capacitorStorage,
        },
      }
    ) as ReturnType<typeof createBrowserClient>
  } else {
    // ── Web / SSR path ────────────────────────────────────────────────
    // Use the SSR-compatible cookie-based client so the session is
    // visible to Next.js server components and route handlers.
    const cookieDomain = getCookieDomain()

    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        isSingleton: true,
        global: { fetch: mediaFetch },
        cookieOptions: {
          domain: cookieDomain,
          path: "/",
          secure: !isLocalhost(),
          sameSite: "lax",
        },
        /* The session under `__Host-`, read and written through browserSessionCookies below (round AX). */
        cookies: browserSessionCookies,
      }
    )
  }

  /* Every getPublicUrl hands back Storelib's own address (lib/storage/media-url.ts). */
  return withMediaAddresses(browserClient)
}
