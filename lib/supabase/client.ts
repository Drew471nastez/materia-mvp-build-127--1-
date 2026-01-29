import { createBrowserClient } from "@supabase/ssr"
export { createAdminClient } from "@/lib/supabase/admin"

/**
 * Get the main domain for cross-subdomain cookies
 * Returns the base domain (e.g., "storelib.com") without protocol
 */
function getMainDomain(): string {
  return process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
}

/**
 * Parse all cookies from document.cookie into an array
 */
function getAllCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return []

  return document.cookie.split(";").map((cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=")
    return {
      name: name || "",
      value: valueParts.join("=") || "",
    }
  }).filter((c) => c.name)
}

/**
 * Set a cookie with cross-subdomain support
 * Critical for PKCE flow: code_verifier must be readable from any subdomain
 */
function setCookie(name: string, value: string, options?: { path?: string; maxAge?: number; sameSite?: string }) {
  if (typeof document === "undefined") return

  const mainDomain = getMainDomain()
  const isLocalhost = mainDomain.includes("localhost")

  let cookieStr = `${name}=${value}`

  // Path
  cookieStr += `; path=${options?.path || "/"}`

  // Max age
  if (options?.maxAge) {
    cookieStr += `; max-age=${options.maxAge}`
  }

  // SameSite
  cookieStr += `; samesite=${options?.sameSite || "lax"}`

  // Cross-subdomain support (critical for PKCE)
  // Set domain to .storelib.com so cookies are accessible from:
  // - storelib.com (canonical)
  // - username.storelib.com (seller subdomains)
  if (!isLocalhost) {
    cookieStr += `; domain=.${mainDomain}`
    cookieStr += "; secure"
  }

  document.cookie = cookieStr
}

/**
 * Delete a cookie (set with expired max-age)
 */
function deleteCookie(name: string) {
  if (typeof document === "undefined") return

  const mainDomain = getMainDomain()
  const isLocalhost = mainDomain.includes("localhost")

  // Delete from current domain
  document.cookie = `${name}=; path=/; max-age=0`

  // Also delete from root domain (in case it was set there)
  if (!isLocalhost) {
    document.cookie = `${name}=; path=/; max-age=0; domain=.${mainDomain}`
  }
}

export function createClient() {
  // Create browser client with custom cookie handling for cross-subdomain PKCE support
  // This ensures the code_verifier cookie is accessible when:
  // 1. User starts OAuth on username.storelib.com
  // 2. OAuth callback happens on storelib.com (canonical URL)
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return getAllCookies()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (value === "") {
              // Empty value means delete
              deleteCookie(name)
            } else {
              // sameSite can be boolean or string in Supabase types, convert to string
              const sameSite = typeof options?.sameSite === "string" ? options.sameSite : "lax"
              setCookie(name, value, {
                path: options?.path,
                maxAge: options?.maxAge,
                sameSite,
              })
            }
          })
        },
      },
    }
  )
}
