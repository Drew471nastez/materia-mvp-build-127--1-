import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Get the main domain for cross-subdomain cookies
 */
function getMainDomain(): string {
  return process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
}

export async function createClient() {
  const cookieStore = await cookies()
  const mainDomain = getMainDomain()
  const isLocalhost = mainDomain.includes("localhost")

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Add cross-subdomain support for session cookies
            // This ensures auth session is accessible from:
            // - storelib.com (canonical)
            // - username.storelib.com (seller subdomains)
            const enhancedOptions = {
              ...options,
              // Set domain to .storelib.com for cross-subdomain access
              domain: isLocalhost ? undefined : `.${mainDomain}`,
              // Ensure secure in production
              secure: isLocalhost ? options?.secure : true,
              // Use lax for OAuth compatibility
              sameSite: options?.sameSite || ("lax" as const),
            }
            cookieStore.set(name, value, enhancedOptions)
          })
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have proxy refreshing user sessions.
        }
      },
    },
  })
}
