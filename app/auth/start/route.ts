import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"

/**
 * GET /auth/start?provider=google&native=true
 *
 * Server-side PKCE initiation for Chrome Custom Tab (Android) and web.
 *
 * WHY THIS EXISTS — cookie-jar isolation:
 *   Capacitor WebView and Chrome Custom Tab have separate cookie jars.
 *   If the WebView calls supabase.signInWithOAuth(), the PKCE verifier lands
 *   in the WebView jar. Chrome Custom Tab can't read it → exchange fails →
 *   "Session expired". This route runs server-side so Chrome Custom Tab
 *   directly receives the PKCE verifier via Set-Cookie on the 302 response.
 *
 * PKCE COOKIE SAME-SITE NOTE (critical for Android):
 *   The redirect chain is: /auth/start (storelib.com) → Google (cross-site)
 *   → Supabase (cross-site) → /auth/callback (storelib.com).
 *   With SameSite=Lax, Chrome on Android may block cookies during cross-site
 *   redirects in Chrome Custom Tab context (Privacy Sandbox / partition).
 *   Fix: SameSite=None (+ Secure) for native flows so the cookie is always
 *   sent regardless of cross-site redirect chain depth.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const isNative = searchParams.get("native") === "true"
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  // CRITICAL: callbackOrigin MUST be the actual request host, not NEXT_PUBLIC_SITE_URL.
  // The PKCE verifier cookie is scoped to the host that serves /auth/start.
  // On Vercel preview deploys the host differs from NEXT_PUBLIC_SITE_URL —
  // using the wrong origin makes the cookie unreachable at /auth/callback.
  const callbackOrigin = origin

  console.log(`[auth/start] ▶ request received`)
  console.log(`[auth/start]   origin         : ${origin}`)
  console.log(`[auth/start]   callbackOrigin : ${callbackOrigin}`)
  console.log(`[auth/start]   isNative       : ${isNative}`)
  console.log(`[auth/start]   SUPABASE_URL   : ${process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40)}`)

  const cookieStore = await cookies()
  const headerStore = await headers()
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  const requestHost = headerStore.get("host") || ""
  const isLocalhost = mainDomain.includes("localhost") || requestHost.includes("localhost")
  const hostWithoutPort = requestHost.split(":")[0]
  const cookieDomain =
    !isLocalhost &&
    (hostWithoutPort === mainDomain || hostWithoutPort.endsWith(`.${mainDomain}`))
      ? `.${mainDomain}`
      : undefined

  console.log(`[auth/start]   requestHost    : ${requestHost}`)
  console.log(`[auth/start]   cookieDomain   : ${cookieDomain ?? "(none — defaults to request host)"}`)
  console.log(`[auth/start]   isLocalhost    : ${isLocalhost}`)

  // Capture every cookie Supabase writes so we can explicitly attach them to
  // the redirect response. cookieStore.set() may not auto-merge into
  // NextResponse.redirect() in all Next.js runtime versions.
  const capturedCookies: Array<{
    name: string
    value: string
    options: Record<string, unknown>
  }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // For native flows: use SameSite=None so the cookie is sent even
            // through the cross-site redirect chain (Google → Supabase → us).
            // Chrome Custom Tab on newer Android may block SameSite=Lax cookies
            // on cross-site redirects due to Privacy Sandbox partitioning.
            // SameSite=None requires Secure=true (which we always set on prod).
            const isCodeVerifier = name.endsWith("-code-verifier")
            const sameSiteValue = isNative
              ? "none"
              : ((options?.sameSite ?? "lax") as "lax" | "strict" | "none")

            const enhancedOptions = {
              ...options,
              domain: cookieDomain,
              secure: isNative
                ? true  // SameSite=None requires Secure
                : (isLocalhost ? (options?.secure ?? false) : true),
              sameSite: sameSiteValue,
            }

            console.log(`[auth/start]   setAll → cookie "${name}" sameSite=${sameSiteValue} secure=${enhancedOptions.secure} domain=${enhancedOptions.domain ?? "(req host)"} isCodeVerifier=${isCodeVerifier}`)

            try { cookieStore.set(name, value, enhancedOptions) } catch {}
            capturedCookies.push({ name, value, options: enhancedOptions })
          })
        },
      },
    }
  )

  const redirectTo = isNative
    ? `${callbackOrigin}/auth/callback?native=true`
    : `${callbackOrigin}/auth/callback`

  console.log(`[auth/start]   redirectTo     : ${redirectTo}`)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    console.error("[auth/start] ✗ signInWithOAuth error:", error?.message)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent(error?.message ?? "OAuth initialisation failed")}`
    )
  }

  console.log(`[auth/start]   OAuth URL      : ${data.url.slice(0, 80)}…`)
  console.log(`[auth/start]   capturedCookies: ${capturedCookies.map(c => c.name).join(", ")}`)

  const response = NextResponse.redirect(data.url)

  // Explicitly set all PKCE and auth cookies on the redirect response.
  // This guarantees Set-Cookie headers are present so Chrome Custom Tab
  // stores them before following the redirect to Google OAuth.
  capturedCookies.forEach(({ name, value, options }) => {
    response.cookies.set(
      name,
      value,
      options as Parameters<typeof response.cookies.set>[2]
    )
    console.log(`[auth/start]   → response.cookies.set("${name}", …, sameSite=${options.sameSite})`)
  })

  // Native-auth detection cookie: allows /auth/callback to detect the native
  // flow via cookie when Chrome Custom Tab's UA is standard Chrome (not
  // "StorelibApp"). This is belt-and-suspenders alongside ?native=true in the
  // redirectTo URL.
  if (isNative) {
    response.cookies.set("storelib_native_auth", "1", {
      httpOnly: true,
      secure: true,
      sameSite: "none",   // SameSite=None so it arrives despite cross-site redirects
      maxAge: 600,        // 10 minutes
      path: "/auth/callback",
    })
    console.log(`[auth/start]   → storelib_native_auth cookie set (sameSite=none)`)
  }

  console.log(`[auth/start] ✓ Redirecting to Google OAuth`)
  return response
}
