import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"

/**
 * Get the main domain for cross-subdomain cookies
 */
function getMainDomain(): string {
  return process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
}

/**
 * Determine the cookie domain based on the current request host.
 *
 * Only set an explicit `.storelib.com` domain when the browser is actually
 * on a storelib.com host (apex or subdomain).  On Vercel preview deployments
 * (e.g. xxx.vercel.app) or localhost, leave the domain undefined so the
 * cookie defaults to the current host — otherwise the browser silently
 * rejects the cookie (wrong domain) and PKCE code-verifier is lost.
 */
function getCookieDomain(requestHost: string, mainDomain: string): string | undefined {
  const isLocalhost = mainDomain.includes("localhost") || requestHost.includes("localhost")
  if (isLocalhost) return undefined

  // Only set cross-subdomain cookie when on the actual production domain
  const hostWithoutPort = requestHost.split(":")[0]
  if (hostWithoutPort === mainDomain || hostWithoutPort.endsWith(`.${mainDomain}`)) {
    return `.${mainDomain}`
  }

  // Vercel preview deployments, other domains — let cookie default to request host
  return undefined
}

export async function createClient() {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const mainDomain = getMainDomain()
  const requestHost = headerStore.get("host") || ""
  const cookieDomain = getCookieDomain(requestHost, mainDomain)
  const isLocalhost = mainDomain.includes("localhost") || requestHost.includes("localhost")

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const enhancedOptions = {
              ...options,
              domain: cookieDomain,
              secure: isLocalhost ? options?.secure : true,
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
