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
        get(name: string) {
          if (typeof document === "undefined") return undefined
          const value = document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${name}=`))
            ?.split("=")[1]
          return value ? decodeURIComponent(value) : undefined
        },
        set(name: string, value: string, options?: { path?: string; maxAge?: number; domain?: string; secure?: boolean; sameSite?: "lax" | "strict" | "none" }) {
          if (typeof document === "undefined") return

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
        },
        remove(name: string, options?: { path?: string }) {
          if (typeof document === "undefined") return

          let cookie = `${name}=; max-age=0`

          if (!isLocalhost) {
            const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
            cookie += `; domain=.${mainDomain}`
          }

          cookie += `; path=${options?.path || "/"}`

          document.cookie = cookie
        },
      },
    }
  )
}
