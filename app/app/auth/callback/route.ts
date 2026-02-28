import { NextResponse } from "next/server"

/**
 * GET /app/auth/callback
 *
 * This URL is the Android App Link target registered in AndroidManifest.xml.
 * After Google OAuth completes in a Chrome Custom Tab, /auth/callback
 * exchanges the code and redirects here. On Android the App Link fires
 * before this route handler ever runs — Chrome Custom Tab closes and
 * MainActivity opens, loading /app directly.
 *
 * This handler exists purely as a web fallback for:
 *   • iOS / desktop browsers (no app installed or no App Link support)
 *   • Android devices where the app is not installed
 *
 * In all fallback cases we simply redirect to /app. The session cookie was
 * already written by /auth/callback, so /app will authenticate normally.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin
  return NextResponse.redirect(`${canonicalUrl}/app`, { status: 302 })
}
