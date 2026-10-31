import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { sameOriginPath } from "@/lib/auth/continue"
import { consumeBridgeToken } from "@/lib/auth/bridge-token"

/**
 * GET /app/auth/callback?bridge_token=<uuid>&next=<path>
 *
 * This URL is the Android App Link target registered in AndroidManifest.xml.
 *
 * ANDROID PATH (bridge token present):
 *   After /auth/callback exchanges the OAuth code and stores the Supabase
 *   session in oauth_bridge_tokens, it redirects here with bridge_token=<uuid>.
 *   The App Link fires and MainActivity loads THIS full URL in the WebView.
 *   The WebView makes a GET request here; this handler:
 *     1. Validates the bridge token (expiry + existence check).
 *     2. Retrieves the stored access_token + refresh_token.
 *     3. Deletes the token (one-time use).
 *     4. Calls supabase.auth.setSession() which writes the session cookies
 *        into the cookie store — those cookies are returned as Set-Cookie
 *        headers on the redirect response that the WebView receives.
 *     5. Redirects to `next` (/app or /library).
 *   The WebView stores the session cookies and the user arrives at the
 *   destination fully authenticated. ✅
 *
 * WEB FALLBACK (no bridge token, or no app installed):
 *   Browsers on iOS / desktop skip the App Link and navigate here directly.
 *   If there is no bridge_token the handler still works: if a bridge_token was
 *   provided it's still validated and consumed; then redirects to `next`.
 *   If no bridge_token at all, just redirect to `next` (session was already
 *   set in the same browser by /auth/callback's createClient call).
 */
/* The redirect carries a fresh session in its cookies: never kept by a cache, and the address is not sent on. */
function go(to: string): NextResponse {
  const res = NextResponse.redirect(to)
  res.headers.set("Cache-Control", "no-store")
  res.headers.set("Referrer-Policy", "no-referrer")
  return res
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const bridgeToken = searchParams.get("bridge_token")
  /* A path on this site only: `${canonicalUrl}${next}` with "@evil.com" in it is another host (lib/auth/continue.ts). */
  const next = sameOriginPath(searchParams.get("next"), "/app")
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  // ── Web fallback: no bridge token ───────────────────────────────────────
  // Session was already established in the same browser by /auth/callback.
  if (!bridgeToken) {
    return go(`${canonicalUrl}${next}`)
  }

  // ── Consume the bridge token: one statement, so only one request ever gets it (lib/auth/bridge-token.ts) ──
  const consumed = await consumeBridgeToken(createAdminClient(), bridgeToken)
  if (consumed.ok === false) {
    if (consumed.reason !== "invalid") console.error("[app/auth/callback] bridge token not used:", consumed.reason)
    const message = consumed.reason === "expired" ? "Session token expired. Please sign in again." : "Invalid or expired session token. Please sign in again."
    return go(`${canonicalUrl}/login?error=${encodeURIComponent(message)}`)
  }

  // ── Set session in the WebView's cookie jar ──────────────────────────────
  // createClient() uses the Next.js cookie store. Any cookies written via
  // setAll() → cookieStore.set() will appear as Set-Cookie headers on the
  // redirect response that the WebView receives and stores. This is how the
  // session crosses from Chrome's jar (where OAuth ran) into WebView's jar.
  const supabase = await createClient()
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: consumed.session.accessToken,
    refresh_token: consumed.session.refreshToken,
  })

  if (sessionError) {
    console.error("[app/auth/callback] session not set:", sessionError.name || "error")
    return go(`${canonicalUrl}/login?error=${encodeURIComponent("Failed to establish session. Please sign in again.")}`)
  }

  /* The stored path is checked like the query's: a path on this site only. */
  const destination = consumed.session.nextPath ? sameOriginPath(consumed.session.nextPath, next) : next
  return go(`${canonicalUrl}${destination}`)
}
