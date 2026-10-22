/**
 * ===========================================================================
 *  CONNECT GITHUB (AND THE OTHER SIGN INS) IN A SHEET OVER THE PHONE APP
 * ===========================================================================
 * Round 39, the owner: "Inside iOS Capacitor / Android, when I click Connect
 * GitHub or whatever I do in the website settings, make sure it opens a
 * mobile bottom sheet with the browser, it doesn't take me outside of
 * Storelib, and after the connection it takes me back smoothly."
 *
 * WHY IT LEFT. Continue to GitHub was a link to /api/github/connect, which
 * answers with a redirect to github.com. The app's web view follows a
 * Storelib address in place, but github.com is not one of its
 * allowNavigation hosts (capacitor.config.ts), so Capacitor handed it to
 * Safari or Chrome, and the person was outside Storelib with no way back.
 * Connect Supabase did the same.
 *
 * HOW IT GOES NOW, inside the app only (the in-app browser plugin answers;
 * never a guess from the user agent):
 *
 *   1. The web view asks the connect route for the provider's address
 *      (?app=ios|android, JSON). The route signs into its state that this
 *      sign in started in the app, and sets any cookie it needs (Supabase's
 *      PKCE verifier) here, in the web view's own cookie jar.
 *   2. That address opens in the in-app browser: a sheet over the app on
 *      iOS (SFSafariViewController, presentationStyle "popover"), a Custom
 *      Tab on Android. The person signs in to GitHub or Supabase there.
 *   3. The provider sends the sheet back to the usual Storelib callback.
 *      The sheet has none of the app's cookies, so the callback does not
 *      finish there: seeing its state came from the app, it sends the sheet
 *      to /auth/connect-return, which hands the same callback address to the app
 *      through the app's own scheme (com.storelib.app://open on iOS,
 *      storelib://auth/callback?connect= on Android: the two every shipped
 *      build answers).
 *   4. The app hears it (components/platform/app-link-opener.tsx and
 *      lib/native-oauth.ts call finishConnect), closes the sheet and loads
 *      the callback in the web view, where the person is signed in. Every
 *      check the callback makes holds as it always did (the state is ours,
 *      this person owns the site, the GitHub user can reach the
 *      installation), and it lands on Website settings, Connections.
 *
 * Closed without finishing (Done, a swipe down): the sheet's
 * browserFinished, and CONNECT_CLOSED_EVENT on window, so the panel reads
 * its state again rather than waiting on a sheet that is gone.
 *
 * In a browser, on a computer or a phone, nothing changes: the link is
 * followed as it always was.
 */

import { tt } from "@/lib/i18n/text"

/** The callbacks a sheet may hand back to the app, and nothing else. */
export const CONNECT_RETURN_PATHS = ["/api/github/setup", "/api/website-builder/supabase/callback"] as const

/** Said on window when the sheet closes without the app hearing back. */
export const CONNECT_CLOSED_EVENT = "storelib:connect-closed"

type CapacitorGlobal = { isNativePlatform?: () => boolean; isPluginAvailable?: (name: string) => boolean; getPlatform?: () => string }

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null
  return ((window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null) as CapacitorGlobal | null
}

/** Inside the phone app, from the app's own bridge. */
export function inNativeApp(): boolean {
  return !!capacitor()?.isNativePlatform?.()
}

/** Inside the phone app, with the in-app browser there to open the sheet. */
export function sheetAvailable(): boolean {
  const cap = capacitor()
  if (!cap?.isNativePlatform?.()) return false
  return cap.isPluginAvailable ? cap.isPluginAvailable("Browser") : false
}

/** ios or android, from the app's own bridge. */
export function appPlatform(): "ios" | "android" | null {
  const p = capacitor()?.getPlatform?.()
  return p === "ios" || p === "android" ? p : null
}

/** The callback address an app link carries back, when it is one of ours; else null. */
export function connectReturnPath(url: string): string | null {
  let carried: string | null = null
  try {
    const open = /^(?:com\.storelib\.app|storelib):\/\/open\/?\?(.*)$/i.exec(url || "")
    const auth = /^(?:com\.storelib\.app|storelib):\/\/auth\/callback\/?\?(.*)$/i.exec(url || "")
    if (open) carried = new URLSearchParams(open[1]).get("path")
    else if (auth) carried = new URLSearchParams(auth[1]).get("connect")
  } catch {
    return null
  }
  return safeReturnPath(carried)
}

/** A path that is exactly one of the callbacks, on our own host, marked as the app's: else null. */
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path || path.length > 3000 || !path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return null
  let u: URL
  try {
    u = new URL(path, "https://storelib.com")
  } catch {
    return null
  }
  if (u.origin !== "https://storelib.com") return null
  if (!(CONNECT_RETURN_PATHS as readonly string[]).includes(u.pathname)) return null
  if (u.searchParams.get("in_app") !== "1") return null
  return `${u.pathname}${u.search}`
}

let finishing: string | null = null

/**
 * An app link that hands a sign in back: close the sheet and finish the
 * callback in the web view. True when it was one (whoever heard it first
 * finishes it; the other listener's call is a no-op).
 */
export function finishConnect(url: string): boolean {
  const path = connectReturnPath(url)
  if (!path) return false
  if (finishing === path) return true
  finishing = path
  void (async () => {
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.close()
    } catch {
      /* already closed, or Android closed it handing the link over */
    }
    window.location.assign(path)
  })()
  return true
}

export type ConnectStart = { ok: true; inSheet: boolean } | { ok: false; error: string }

/**
 * Continue to GitHub, Connect Supabase. `startPath` is the connect route as
 * the web has always followed it (/api/github/connect?installId=...).
 */
export async function startConnect(startPath: string, navigate: (href: string) => void = (href) => window.location.assign(href)): Promise<ConnectStart> {
  const platform = appPlatform()
  if (!inNativeApp() || !platform) {
    navigate(startPath)
    return { ok: true, inSheet: false }
  }
  let url: string | null = null
  try {
    const res = await fetch(`${startPath}${startPath.includes("?") ? "&" : "?"}app=${platform}`, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" })
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok || typeof data.url !== "string" || !/^https:\/\//.test(data.url)) return { ok: false, error: data.error || tt("That could not be opened. Try again.") }
    url = data.url
  } catch {
    return { ok: false, error: tt("That could not be opened. Check your connection and try again.") }
  }
  /*
    A SHELL WITHOUT THE IN-APP BROWSER (built before the plugin was in it):
    the phone's own browser, which is where this went before, but now with a
    way back: the callback hands itself to the app through the same scheme,
    and the app finishes it signed in.
  */
  if (!sheetAvailable()) {
    const { openInBrowser } = await import("@/lib/native-bridge")
    openInBrowser(url)
    return { ok: true, inSheet: false }
  }
  try {
    const { Browser } = await import("@capacitor/browser")
    const handle = await Browser.addListener("browserFinished", () => {
      void handle.remove()
      /* Handed back already: the web view is on its way to the callback. */
      if (!finishing) window.dispatchEvent(new CustomEvent(CONNECT_CLOSED_EVENT))
    })
    await Browser.open({ url, presentationStyle: "popover", toolbarColor: "#ffffff" })
    return { ok: true, inSheet: true }
  } catch {
    return { ok: false, error: tt("That could not be opened. Try again.") }
  }
}
