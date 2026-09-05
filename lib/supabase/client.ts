import { createBrowserClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
export { createAdminClient } from "@/lib/supabase/admin"

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
 * Get cookie domain for cross-subdomain support
 * Returns ".storelib.com" format for production
 */
function getCookieDomain(): string | undefined {
  if (isLocalhost()) return undefined
  return `.${getMainDomain()}`
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
 */
const capacitorStorage = {
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
        cookieOptions: {
          domain: cookieDomain,
          path: "/",
          secure: !isLocalhost(),
          sameSite: "lax",
        },
      }
    )
  }

  return browserClient
}
