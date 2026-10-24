import { NextResponse } from "next/server"
import type { ConnectState } from "@/lib/github-sync/core"

/**
 * ===========================================================================
 *  A SIGN IN STARTED IN THE PHONE APP FINISHES IN THE APP
 * ===========================================================================
 * The server half of lib/native-connect.ts (it says the whole way). Used by
 * the two connect routes and their two callbacks:
 *
 *   /api/github/connect           ->  /api/github/setup
 *   /api/website-builder/supabase/connect  ->  .../supabase/callback
 *
 * A connect route asked with ?app=ios or ?app=android (only the app's web
 * view asks that way) signs the platform into its state and answers with
 * JSON, { url }, for the in-app browser to open, instead of a redirect.
 *
 * Its callback, reached in that in-app browser with such a state, does not
 * finish there (no cookies: "this person owns the site" could never hold).
 * It sends the in-app browser to /auth/connect-return with its own address and
 * in_app=1, and that page hands the address to the app. The app loads it
 * in its web view, in_app=1 tells the callback to finish as usual, and
 * every check it makes is made there, signed in.
 */

/** The page in the in-app browser that hands the callback to the app (app/auth/connect-return). Under /auth: a word no creator's handle can be. */
export const CONNECT_RETURN_PAGE = "/auth/connect-return"

/** ios or android when the app's web view asked, else null. */
export function appAsked(req: Request): "ios" | "android" | null {
  const v = new URL(req.url).searchParams.get("app")
  return v === "ios" || v === "android" ? v : null
}

/** The connect route's answer to the app: the provider's address as JSON, never cached. */
export function appStart(url: string): NextResponse {
  return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } })
}

/**
 * The callback, in the in-app browser, for a sign in the app started: off to
 * /auth/connect-return with this very address (and in_app=1). Null when the
 * callback should finish here: not started in the app, or already loaded in
 * the app's web view.
 */
export function handBackToApp(req: Request, state: Pick<ConnectState, "app"> | null): NextResponse | null {
  if (!state?.app) return null
  const here = new URL(req.url)
  if (here.searchParams.get("in_app") === "1") return null
  here.searchParams.set("in_app", "1")
  const back = new URL(CONNECT_RETURN_PAGE, req.url)
  back.searchParams.set("to", `${here.pathname}${here.search}`)
  back.searchParams.set("app", state.app)
  const res = NextResponse.redirect(back)
  res.headers.set("Cache-Control", "no-store")
  /* The callback's code and state are in that address: never sent on to another site. */
  res.headers.set("Referrer-Policy", "no-referrer")
  return res
}

/**
 * The app link that carries the callback back into the app:
 *   iOS       com.storelib.app://open?path=   (Info.plist CFBundleURLSchemes)
 *   Android   storelib://auth/callback?connect=   (the sign in filter every
 *             shipped build has; com.storelib.app://open only from the
 *             build that added it, AndroidManifest.xml)
 */
export function appLinkFor(platform: "ios" | "android", path: string): string {
  return platform === "ios" ? `com.storelib.app://open?path=${encodeURIComponent(path)}` : `storelib://auth/callback?connect=${encodeURIComponent(path)}`
}

/**
 * The same for a tap in a Chrome Custom Tab, which follows an intent:// link
 * a person taps but not a storelib:// one a page sets by itself (app/auth/
 * app-callback says how that was found).
 */
export function androidIntentFor(path: string): string {
  return `intent://auth/callback?connect=${encodeURIComponent(path)}#Intent;scheme=storelib;package=com.storelib.app;end`
}
