/**
 * ===========================================================================
 *  WHETHER THE SERVER'S COOKIE CARD MAY SHOW BEFORE REACT HAS RUN (round 48)
 * ===========================================================================
 * The cookie card is in every page's HTML (components/cookie-consent-banner,
 * marked data-cookie-banner-early until its effect has run), so a first-time
 * visitor sees it with the first paint instead of after hydration. It must
 * not show to anybody the live banner would not ask, so app/globals.css hides
 * it unless this script, run in <head> before <body> paints, put
 * `data-cookie-ask` on <html>. It does that only when all of these hold,
 * which are the live banner's own conditions:
 *
 *   no valid storelib_consent cookie   lib/consent/consent parse(): version 2
 *   not in a frame                     the live banner's `embedded`
 *   not the native app                 lib/native-bridge isNativeApp()
 *   on Storelib's own host             not lib/nav/creator-site onCreatorSite():
 *                                      a creator's site draws the card in its
 *                                      own colours, known only after hydration
 *
 * Getting one of these wrong costs nothing worse than today: the card simply
 * appears (or goes) when the live banner decides, after hydration.
 */
import { CONSENT_COOKIE, CONSENT_VERSION } from "@/lib/consent/consent"

/** The valid record's shape, as parse() reads it. */
export const CONSENT_RECORD_SOURCE = `(^|;\\\\s*)${CONSENT_COOKIE}=${CONSENT_VERSION}\\\\.p[01]\\\\.a[01]\\\\.m[01]\\\\.\\\\d{9,11}(;|$)`

export function cookieAskBoot(mainHost: string = process.env.NEXT_PUBLIC_SITES_HOST || "storelib.com"): string {
  const main = JSON.stringify(mainHost.toLowerCase())
  return `try{(function(){var w=window,h=location.hostname.toLowerCase().replace(/^www\\./,""),ua=navigator.userAgent||"";if(new RegExp("${CONSENT_RECORD_SOURCE}").test(document.cookie))return;if(w.self!==w.top)return;if((w.Capacitor&&w.Capacitor.isNativePlatform&&w.Capacitor.isNativePlatform())||/StorelibApp|Capacitor/.test(ua)||(/wv/.test(ua)&&/Android/.test(ua)))return;if(!(h===${main}||h==="localhost"||h==="127.0.0.1"||/\\.vercel\\.app$/.test(h)))return;document.documentElement.setAttribute("data-cookie-ask","")})()}catch(e){}`
}

export const COOKIE_ASK_BOOT = cookieAskBoot()
