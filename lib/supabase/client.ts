import { createBrowserClient } from "@supabase/ssr"
export { createAdminClient } from "@/lib/supabase/admin"

export function createClient() {
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  const isLocalhost = mainDomain.includes("localhost")

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Custom cookie handling for cross-subdomain support
        // This ensures PKCE code_verifier and auth tokens work across all subdomains
        getAll() {
          if (typeof document === "undefined") return []

          return document.cookie.split("; ").map((cookie) => {
            const [name, ...valueParts] = cookie.split("=")
            // Join with = in case value contains = characters (common in base64)
            const value = valueParts.join("=")
            return {
              name,
              value: value ? decodeURIComponent(value) : "",
            }
          }).filter(c => c.name) // Filter out empty names
        },
        setAll(cookies) {
          if (typeof document === "undefined") return

          cookies.forEach(({ name, value, options }) => {
            let cookie = `${name}=${encodeURIComponent(value)}`

            // Set domain for cross-subdomain support (e.g., .storelib.com)
            // This is critical for PKCE code_verifier to work when OAuth redirects between subdomains
            if (!isLocalhost) {
              cookie += `; domain=.${mainDomain}`
            }

            cookie += `; path=${options?.path || "/"}`

            if (options?.maxAge) {
              cookie += `; max-age=${options.maxAge}`
            }

            if (!isLocalhost) {
              cookie += "; secure"
            }

            cookie += `; samesite=${options?.sameSite || "lax"}`

            document.cookie = cookie
          })
        },
      },
    }
  )
}
