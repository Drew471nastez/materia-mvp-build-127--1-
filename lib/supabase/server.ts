import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"
import { cookieDomainFor, cookieSecureFor } from "@/lib/supabase/cookie-domain"

/**
 * The server-side Supabase client.
 *
 * The domain rule moved to lib/supabase/cookie-domain.ts, which is now the ONLY
 * copy — this file, the browser client and middleware.ts all read it. Three
 * hand-maintained copies of "which domain does the session cookie live on" is
 * two cookies on two domains away from an auth bug nobody can reproduce.
 *
 * See the note on `setAll` below before changing anything here.
 */

export async function createClient() {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const requestHost = headerStore.get("host") || ""
  const cookieDomain = cookieDomainFor(requestHost)
  const secure = cookieSecureFor(requestHost)

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      /**
       * WRITING REFRESHED COOKIES — and why the catch below is not "ignore".
       *
       * Next.js forbids setting cookies from a Server Component, so `set`
       * throws there and the write is lost. That is only safe because
       * something else refreshes first — and the original comment ("can be
       * ignored if you have proxy refreshing user sessions") is literally
       * true here: proxy.ts is that proxy. It runs before every request the
       * matcher accepts, calls getSession(), and writes any rotated cookies
       * onto the response, where they are actually saved.
       *
       * Why it matters: Supabase ROTATES refresh tokens. A refresh whose
       * result is dropped leaves the browser holding a token that has already
       * been invalidated, and the next refresh — minutes or hours later, on a
       * different page — fails with "Invalid Refresh Token: Already Used",
       * which supabase-js treats as terminal. That is a random logout with no
       * bad network and no expiry behind it. By the time this file runs the
       * token is fresh, so there is nothing to refresh and nothing to lose.
       *
       * DO NOT remove the getSession() call in proxy.ts without changing this.
       */
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              domain: cookieDomain,
              secure: secure ? true : options?.secure,
              sameSite: options?.sameSite || ("lax" as const),
            })
          })
        } catch {
          // Server Component: cookies are read-only here. Safe only because
          // middleware.ts has already done the refresh — see above.
        }
      },
    },
  })
}
