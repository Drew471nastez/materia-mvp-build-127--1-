import { createBrowserClient } from "@supabase/ssr"
export { createAdminClient } from "@/lib/supabase/admin"

// Helper to parse cookies from document.cookie
function parseCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined") return []

  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.length > 0)
    .map((cookie) => {
      const eqIndex = cookie.indexOf("=")
      if (eqIndex === -1) return { name: cookie, value: "" }
      const name = cookie.substring(0, eqIndex)
      const value = cookie.substring(eqIndex + 1)
      try {
        return { name, value: decodeURIComponent(value) }
      } catch {
        return { name, value }
      }
    })
}

// Helper to set a cookie with proper cross-subdomain support
function setCookie(
  name: string,
  value: string,
  options: { maxAge?: number; path?: string; domain?: string; secure?: boolean; sameSite?: string } = {}
) {
  if (typeof document === "undefined") return

  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  const isLocalhost = mainDomain.includes("localhost")

  let cookieStr = `${name}=${encodeURIComponent(value)}`

  // Always set path
  cookieStr += `; path=${options.path || "/"}`

  // Set max-age if provided
  if (options.maxAge !== undefined) {
    cookieStr += `; max-age=${options.maxAge}`
  }

  // For production, set cross-subdomain cookie
  if (!isLocalhost) {
    cookieStr += `; domain=.${mainDomain}`
    cookieStr += "; secure"
  }

  // SameSite - default to lax
  cookieStr += `; samesite=${options.sameSite || "lax"}`

  document.cookie = cookieStr
}

export function createClient() {
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  const isLocalhost = mainDomain.includes("localhost")

  // For localhost, use default behavior
  if (isLocalhost) {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  // For production with subdomains, use cross-subdomain cookie handling
  // This ensures PKCE code_verifier works when user is on seller.storelib.com
  // but callback is on storelib.com
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookies()
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            setCookie(name, value, options || {})
          })
        },
      },
    }
  )
}
