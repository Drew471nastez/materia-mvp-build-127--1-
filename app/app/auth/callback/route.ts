import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { sameOriginPath } from "@/lib/auth/continue"

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
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const bridgeToken = searchParams.get("bridge_token")
  /* A path on this site only: `${canonicalUrl}${next}` with "@evil.com" in it is another host (lib/auth/continue.ts). */
  const next = sameOriginPath(searchParams.get("next"), "/app")
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  // ── Web fallback: no bridge token ───────────────────────────────────────
  // Session was already established in the same browser by /auth/callback.
  if (!bridgeToken) {
    return NextResponse.redirect(`${canonicalUrl}${next}`)
  }

  // ── Validate + consume the bridge token ─────────────────────────────────
  const adminSupabase = createAdminClient()

  const { data: tokenRow, error: lookupError } = await adminSupabase
    .from("oauth_bridge_tokens")
    .select("id, access_token, refresh_token, next_path, expires_at")
    .eq("id", bridgeToken)
    .single()

  if (lookupError || !tokenRow) {
    console.error("Bridge token lookup error:", lookupError)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent("Invalid or expired session token. Please sign in again.")}`
    )
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    await adminSupabase.from("oauth_bridge_tokens").delete().eq("id", bridgeToken)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent("Session token expired. Please sign in again.")}`
    )
  }

  // Delete immediately — one-time use.
  await adminSupabase.from("oauth_bridge_tokens").delete().eq("id", bridgeToken)

  // ── Set session in the WebView's cookie jar ──────────────────────────────
  // createClient() uses the Next.js cookie store. Any cookies written via
  // setAll() → cookieStore.set() will appear as Set-Cookie headers on the
  // redirect response that the WebView receives and stores. This is how the
  // session crosses from Chrome's jar (where OAuth ran) into WebView's jar.
  const supabase = await createClient()
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
  })

  if (sessionError) {
    console.error("Session set error:", sessionError)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent("Failed to establish session. Please sign in again.")}`
    )
  }

  const destination = tokenRow.next_path || next
  return NextResponse.redirect(`${canonicalUrl}${destination}`)
}
