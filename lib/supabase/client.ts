import { createBrowserClient } from "@supabase/ssr"
import { mediaFetch, withMediaAddresses } from "@/lib/storage/media-url"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { fresherSession, readSessionFromCookies, sessionCookieRemovals, sessionCookieWrites, storedSessionKey } from "./session-jar"

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

/**
 * Detect Capacitor native platform synchronously.
 * window.Capacitor is injected by the native bridge before any JS runs,
 * so this is reliable as long as we're in a browser context.
 */
export function isNativePlatform(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).Capacitor?.isNativePlatform === "function" &&
    (window as any).Capacitor.isNativePlatform()
  )
}

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
      }
    )
  }

  /* Every getPublicUrl hands back Storelib's own address (lib/storage/media-url.ts). */
  return withMediaAddresses(browserClient)
}
