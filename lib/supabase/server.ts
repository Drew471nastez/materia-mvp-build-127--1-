import { createServerClient } from "@supabase/ssr"
import { mediaFetch, withMediaAddresses } from "@/lib/storage/media-url"
import { cookies, headers } from "next/headers"
import { cookiePairs, outgoingName, sessionView, writesHostCookies } from "./host-session"
import { storedSessionKey } from "./session-jar"

/**
 * Get the main domain for cross-subdomain cookies
 */
function getMainDomain(): string {
  return process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
}

/**
 * HOST-ONLY. The session cookie belongs to storelib.com and nothing else.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS NOT `.storelib.com` ANY MORE
 * ---------------------------------------------------------------------------
 * AI-built sites are published at <slug>.storelib.com, and those pages carry
 * JavaScript written by a model from a creator's prompt — code we cannot
 * vouch for. A cookie scoped to `.storelib.com` is sent to EVERY host under
 * it, and this one cannot be httpOnly because the browser Supabase client
 * reads it from JavaScript to restore a session.
 *
 * Those two facts together meant any published site could read
 * `document.cookie` and take the access and refresh tokens of every
 * signed-in Storelib user who visited it. Not a theoretical leak — an
 * account takeover anybody could ship through the site builder.
 *
 * Returning undefined makes the cookie host-only: set by storelib.com, sent
 * only to storelib.com. Nothing else on the platform needs it wider —
 * creator storefronts are paths (storelib.com/andrewrullz), and custom
 * domains are separate registrable domains that never received this cookie
 * in the first place. www is redirected to the apex by the proxy so there is
 * only ever one host holding a session.
 */
function getCookieDomain(_requestHost: string, _mainDomain: string): undefined {
  return undefined
}

/** `fetch`: the fetch under this one client instead of mediaFetch (only /auth/sync-session's claims fallback passes one). */
export async function createClient({ fetch: underFetch }: { fetch?: typeof fetch } = {}) {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const mainDomain = getMainDomain()
  const requestHost = headerStore.get("host") || ""
  const cookieDomain = getCookieDomain(requestHost, mainDomain)
  const isLocalhost = mainDomain.includes("localhost") || requestHost.includes("localhost")
  /*
    THE SESSION UNDER `__Host-` (round AX, lib/supabase/host-session.ts): a published site on a subdomain can
    plant a cookie under the old name, never under this one. Read: the `__Host-` copy wins, and an old name that
    arrived twice (counted in the raw header, since cookies() keeps one of each) is not read at all. Write: the
    `__Host-` name on HTTPS, the old name on http://localhost, as before.
  */
  const key = storedSessionKey()
  const raw = cookiePairs(headerStore.get("cookie"))
  const counts = new Map<string, number>()
  for (const c of raw) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
  const duplicated = [...counts].filter(([, n]) => n > 1).map(([name]) => name)
  const proto = (headerStore.get("x-forwarded-proto") || "").split(",")[0].trim()
  const hostCookies = writesHostCookies({ https: proto !== "http", localhost: isLocalhost, pairs: [...raw, ...cookieStore.getAll()], key })

  return withMediaAddresses(createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    /* Every row read carries Storelib's own file addresses (lib/storage/media-url.ts). */
    global: { fetch: mediaFetch },
    ...(underFetch ? { global: { fetch: underFetch } } : {}),
    cookies: {
      getAll() {
        return sessionView(cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })), key, duplicated, { retireLegacy: hostCookies }).cookies
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const out = outgoingName(name, key, hostCookies)
            const host = out !== name
            const enhancedOptions = {
              ...options,
              domain: cookieDomain,
              secure: host ? true : isLocalhost ? options?.secure : true,
              sameSite: options?.sameSite || ("lax" as const),
              ...(host ? { path: "/" } : {}),
            }
            cookieStore.set(out, value, enhancedOptions)
            /* The old name goes with it, on this host: it is never read again beside the `__Host-` copy. */
            if (host) cookieStore.set(name, "", { path: "/", maxAge: 0, secure: !isLocalhost, sameSite: "lax" })
          })
        } catch {
          // The "setAll" method was called from a Server Component.
          // This can be ignored if you have proxy refreshing user sessions.
        }
      },
    },
  }))
}
