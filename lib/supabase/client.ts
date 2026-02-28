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
function isNativePlatform(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).Capacitor?.isNativePlatform === "function" &&
    (window as any).Capacitor.isNativePlatform()
  )
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
    //   • flowType: "pkce"           — explicit, matches server
    //   • storage: localStorage      — reliable in native WebView, no
    //                                  cross-origin cookie domain issues
    // No server-side middleware exists, so localStorage session is safe.
    browserClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: window.localStorage,
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
