import { createBrowserClient } from "@supabase/ssr"
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

export function createClient() {
  // Return existing client if already created (singleton pattern)
  // This prevents rate limiting from multiple client creations
  if (browserClient) {
    return browserClient
  }

  const cookieDomain = getCookieDomain()

  // Create browser client with cross-subdomain cookie support via cookieOptions
  // This ensures PKCE cookies are accessible across all subdomains
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Use isSingleton to prevent multiple GoTrueClient instances
      isSingleton: true,
      // Cookie options for cross-subdomain support
      cookieOptions: {
        // Domain for cross-subdomain cookie sharing
        domain: cookieDomain,
        // Path for all routes
        path: "/",
        // Secure in production
        secure: !isLocalhost(),
        // SameSite lax for OAuth compatibility
        sameSite: "lax",
      },
    }
  )

  return browserClient
}
