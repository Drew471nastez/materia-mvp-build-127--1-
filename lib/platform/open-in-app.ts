/**
 * The addresses behind "Open in app" (components/library/open-in-app.tsx),
 * and the app's side of them (components/native-auth-handler.tsx). Pure, so
 * both ends are tested against one another.
 */

export type Phone = "ios" | "android"

export const APP_PACKAGE = "com.storelib.app"
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`

/** The cookie that says the library's app banner was closed, and for how long it stays closed. */
export const APP_BANNER_COOKIE = "storelib_app_banner"
export const APP_BANNER_QUIET_DAYS = 30

/** The app's own web view says so in its user agent (app/library/layout.tsx isCapacitorWebView reads the same). */
export function isAppWebView(ua: string): boolean {
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

/**
 * The phone the library's banner is drawn for, decided on the server from
 * the request: a phone's browser, not the app, and not closed in the last
 * APP_BANNER_QUIET_DAYS. Null draws nothing.
 */
export function bannerPhone(ua: string, closedCookie: string | null | undefined, requestedWith?: string | null): Phone | null {
  if (closedCookie === "closed" || isAppWebView(ua)) return null
  /* Inside somebody else's web view the hand off card does this job instead (round 14). */
  if (inAppBrowser(ua, requestedWith ?? null)) return null
  return phoneOf(ua)
}

export function phoneOf(ua: string): Phone | null {
  if (/iPhone|iPod/i.test(ua)) return "ios"
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "android"
  return null
}

/** A path on this site, never another site's address dressed as one. */
function sitePath(path: string | null | undefined): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return null
  return path
}

/** The address that opens the app, from the page this is on. */
export function appLink(phone: Phone, path: string): string {
  const safe = sitePath(path) ?? "/account/library"
  if (phone === "ios") return `${APP_PACKAGE}://open?path=${encodeURIComponent(safe)}`
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`
}

/**
 * A storelib.com link the phone handed to the app (a Universal Link or an
 * App Link, lib/platform/app-links.ts) that is a page to show. The sign in
 * and password reset returns are not: lib/native-oauth.ts has its own
 * handling for those, which a second navigation would race.
 *
 * CHECKOUT AND SIGN IN ARE REFUSED ON PURPOSE, not by accident. A buyer who
 * started paying in a browser finishes there, with the session they have
 * there, and the association file excludes the same paths so an iPhone never
 * offers them either. Everything people actually share is accepted: a
 * community, a post, an event, a program, a creator page, a product, a
 * profile.
 */
const HANDLED_ELSEWHERE = /^\/(?:app\/)?(?:auth\/|reset-password)|^\/app\/settings\/billing|^\/(?:checkout|purchase|login|signup|register|logout)(?:[/?#]|$)/

/** Inside the app: the page an "open" link or a storelib.com link asks for, or null for any other link. */
export function openTarget(url: string): string | null {
  const m = /^(?:com\.storelib\.app|storelib):\/\/open\/?\?(.*)$/i.exec(url || "")
  if (m) {
    let asked: string | null = null
    try {
      asked = sitePath(new URLSearchParams(m[1]).get("path"))
    } catch {
      return null
    }
    /* The same refusals as a storelib.com link: the scheme is not a way around them. */
    return asked && !HANDLED_ELSEWHERE.test(asked) ? asked : null
  }
  const web = /^https:\/\/(?:www\.)?storelib\.com(\/[^#]*)?(?:#.*)?$/i.exec(url || "")
  if (!web) return null
  const path = sitePath(web[1] || "/")
  if (!path || HANDLED_ELSEWHERE.test(path)) return null
  return path
}

/**
 * ===========================================================================
 *  THE "OPEN IN THE APP" PILL ON A COMMUNITY (components/community/
 *  open-in-app-pill.tsx)
 * ===========================================================================
 * The address that opens this very page in the app:
 *
 *   iPhone    the app's scheme with the page (com.storelib.app://open?path=),
 *             the App Store when nothing answers; iOS never opens a
 *             Universal Link for a tap on the site it is already on
 *   Android   the page itself as an intent for the app's package: with App
 *             Links verified (lib/platform/app-links.ts) the app opens on it,
 *             and Chrome falls back to the Play Store when it is not there
 */
export function pageAppLink(phone: Phone, path: string, host = "storelib.com"): string {
  const safe = sitePath(path) ?? "/"
  if (phone === "ios") return `${APP_PACKAGE}://open?path=${encodeURIComponent(safe)}`
  /*
    Not installed: Chrome opens the Play Store. The referrer is the page,
    so a later install can land on it (storeLink). Installed: the app opens
    on this page.
  */
  const store = storeLink("android", safe) || PLAY_URL
  return `intent://${host}${safe}#Intent;scheme=https;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(store)};end`
}

/**
 * Whether the pill is drawn, and for which phone. Never in the app, never
 * on a computer; on an iPhone's Safari only when the system's own Smart App
 * Banner is not there to do it (no App Store id configured), since two
 * banners for one app is one too many. Chrome and Firefox on an iPhone have
 * no Smart App Banner, so they get the pill.
 */
export function pillPhone(ua: string, smartBanner: boolean, requestedWith?: string | null): Phone | null {
  if (isAppWebView(ua)) return null
  /*
    INSIDE AN IN-APP BROWSER THE PILL STANDS ASIDE (round 14). Neither a
    Universal Link nor an intent escapes a web view, so the pill could not
    do the job there; the hand off card does, and two of them for one app is
    one too many.
  */
  if (inAppBrowser(ua, requestedWith ?? null)) return null
  const phone = phoneOf(ua)
  if (phone === "ios" && smartBanner && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return null
  return phone
}

/** The pill's own quiet time once closed. */
export const APP_PILL_KEY = "storelib:app-pill-closed"
export const APP_PILL_QUIET_DAYS = 30

/**
 * ===========================================================================
 *  A LINK SHARED THROUGH INSTAGRAM, WHATSAPP OR TIKTOK (round 14)
 * ===========================================================================
 * The owner: "if the user on iOS or Android has the app installed on their
 * device, it needs to open through that, not in browsers".
 *
 * A Universal Link (iOS) or an App Link (Android) only hands the page over
 * where the tap happens somewhere that honours it: Safari, Chrome, Mail,
 * Messages, a Chrome Custom Tab. The apps people actually share through do
 * not. Instagram, Facebook, Messenger, TikTok, WhatsApp, Snapchat, LinkedIn,
 * X, Line, Pinterest and Telegram each open a link in a web view of their
 * own, and a web view honours neither. So a link shared to Instagram opened
 * the page inside Instagram's browser with the app sitting unused on the
 * same phone. That is what this part is for.
 *
 * WHAT ESCAPES A WEB VIEW. The app's own scheme
 * (com.storelib.app://open?path=...) hands over on a tap on both phones from
 * inside almost every in-app browser. Android's `intent://` escape works
 * from Chrome but not from inside a plain web view, where it fails with an
 * unknown scheme error, so the in-app case uses the scheme on both phones
 * with the store as a fallback after STORE_FALLBACK_MS.
 *
 * TWO SIGNALS, BOTH READ ON THE SERVER. Android sends the hosting app's
 * package in the `x-requested-with` request header; iOS says it in the user
 * agent instead. Only the server sees the header, so
 * app/api/app-links/in-app-browser answers the question and the card
 * (components/platform/open-in-app-card.tsx) asks it, and only from inside
 * a web view.
 */

/** The name shown when the hosting app cannot be named. */
export const UNNAMED_BROWSER = "this app's browser"

/**
 * Android's `x-requested-with`: the hosting app's package. Storelib's own
 * app and the real browsers are listed too, as the answers that are not an
 * in-app browser at all.
 */
const PACKAGE_NAMES: Record<string, string> = {
  "com.instagram.android": "Instagram",
  "com.instagram.lite": "Instagram",
  "com.whatsapp": "WhatsApp",
  "com.whatsapp.w4b": "WhatsApp",
  "com.zhiliaoapp.musically": "TikTok",
  "com.zhiliaoapp.musically.go": "TikTok",
  "com.ss.android.ugc.trill": "TikTok",
  "com.facebook.katana": "Facebook",
  "com.facebook.lite": "Facebook",
  "com.facebook.orca": "Messenger",
  "com.facebook.mlite": "Messenger",
  "com.snapchat.android": "Snapchat",
  "com.linkedin.android": "LinkedIn",
  "com.twitter.android": "X",
  "com.x.android": "X",
  "org.telegram.messenger": "Telegram",
  "org.telegram.messenger.web": "Telegram",
  "org.thunderdog.challegram": "Telegram",
  "jp.naver.line.android": "Line",
  "com.pinterest": "Pinterest",
  "com.tencent.mm": "WeChat",
  "com.reddit.frontpage": "Reddit",
  "com.google.android.gm": "Gmail",
  "com.discord": "Discord",
  "com.Slack": "Slack",
}

/** Packages that are not somebody else's web view: ours, and the real browsers. */
const NOT_IN_APP_PACKAGES = new Set([
  "com.storelib.app",
  "com.android.chrome",
  "com.chrome.beta",
  "com.chrome.dev",
  "com.chrome.canary",
  "org.mozilla.firefox",
  "org.mozilla.fenix",
  "com.microsoft.emmx",
  "com.opera.browser",
  "com.opera.mini.native",
  "com.sec.android.app.sbrowser",
  "com.brave.browser",
  "com.duckduckgo.mobile.android",
  "com.vivaldi.browser",
  "com.UCMobile.intl",
])

/** The user agent tokens the same apps put in their web view, most specific first. */
const UA_NAMES: Array<[RegExp, string]> = [
  [/FBAN\/(?:Messenger|Orca)|FB_IAB\/Orca|Orca-Android|Messenger(?:ForiOS|Lite)/i, "Messenger"],
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FB4A|FBIOS/i, "Facebook"],
  [/TikTok|musical_ly|BytedanceWebview|Trill|aweme/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedIn/i, "LinkedIn"],
  [/TwitterAndroid|Twitter for|\bTwitter\b/i, "X"],
  [/Telegram/i, "Telegram"],
  [/\bLine\/[\d.]|\bLine\b.*\/IAB/i, "Line"],
  [/Pinterest/i, "Pinterest"],
  [/MicroMessenger/i, "WeChat"],
  [/\bWhatsApp\b/i, "WhatsApp"],
  [/Reddit/i, "Reddit"],
  [/\bGSA\//i, "the Google app"],
]

/** A real browser on an iPhone names itself; Safari's own token is on every WKWebView Safari draws. */
const REAL_IOS_BROWSER = /Safari\/|CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Chrome\//

/**
 * STORELIB'S OWN WEB VIEW, FOR THE CLIENT SIDE AND THE SERVER ALIKE.
 * isAppWebView's `wv` rule cannot be used for this: every Android in-app
 * web view carries `wv` in its user agent, which is precisely the case the
 * hand off card exists for, so that rule would hide the card from everybody
 * inside Instagram on Android. What actually says "this is the Storelib
 * app" is the Capacitor bridge in the page, the user agent Capacitor
 * appends (capacitor.config.ts appendUserAgent), and on Android the
 * `x-requested-with` header carrying our own package.
 */
export function isOurApp(ua: string, bridge = false): boolean {
  return bridge || /StorelibApp|Capacitor/i.test(ua)
}

/** Storelib's own web view, by either signal. Never treated as somebody else's browser. */
function isOurWebView(ua: string, requestedWith: string | null | undefined): boolean {
  if (isOurApp(ua)) return true
  return (requestedWith || "").trim() === APP_PACKAGE
}

/**
 * The app whose web view is showing this page, by name, or null for a real
 * browser (and for Storelib's own web view). `requestedWith` is Android's
 * `x-requested-with` request header, null where there is none.
 *
 * The unnamed cases are deliberate. On Android every in-app web view carries
 * `wv` in its user agent, so an unknown package (or a missing header, which
 * is what WhatsApp's web view sends) is still known to be a web view. On an
 * iPhone a web view is the user agent without any real browser's token,
 * which is exactly how WhatsApp's looks: no Safari, no CriOS.
 */
export function inAppBrowser(ua: string, requestedWith?: string | null): string | null {
  if (!ua || isOurWebView(ua, requestedWith)) return null
  const pkg = (requestedWith || "").trim()
  if (pkg && NOT_IN_APP_PACKAGES.has(pkg)) return null
  if (pkg && PACKAGE_NAMES[pkg]) return PACKAGE_NAMES[pkg]
  for (const [re, name] of UA_NAMES) if (re.test(ua)) return name
  /* A package nobody here knows, shaped like one: an app's web view all the same. */
  if (pkg && /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(pkg)) return UNNAMED_BROWSER
  const phone = phoneOf(ua)
  if (phone === "android" && /\bwv\b/.test(ua)) return UNNAMED_BROWSER
  if (phone === "ios" && !REAL_IOS_BROWSER.test(ua)) return UNNAMED_BROWSER
  return null
}

/**
 * The line under the card's own "Open this page in Storelib", which names
 * the app when it has a name. "it" is that page, which is what the line
 * above it says.
 */
export function handoffLine(browser: string): string {
  if (browser === UNNAMED_BROWSER) return "This app is showing it in its own browser."
  return `${browser} is showing it in its own browser.`
}

/** How long the hand off is given before the store is opened instead. */
export const STORE_FALLBACK_MS = 1400

/** The card's own quiet time once "Keep reading here" is pressed. */
export const OPEN_CARD_KEY = "storelib:open-in-app-card-closed"
export const OPEN_CARD_COOKIE = "storelib_open_card"
export const OPEN_CARD_QUIET_DAYS = 30

/**
 * THE COOKIE THAT SAYS THE APP IS ON THIS PHONE. Set by the app's own web
 * view on every page it loads (components/platform/app-link-opener.tsx), so
 * it is proof rather than a guess, and long lived because the app may not be
 * opened for months.
 */
export const APP_SEEN_COOKIE = "storelib_app_seen"
export const APP_SEEN_DAYS = 400

/** The store page for this phone, with the shared path carried along where the store can carry it. */
export function storeLink(phone: Phone, path: string, appStoreId?: string | null): string | null {
  if (phone === "android") {
    /*
      THE PATH SURVIVES THE INSTALL ON ANDROID. Play passes `referrer`
      through to the installed app, which reads it with the Install Referrer
      API on first launch and lands on the page the person tapped. iOS has
      no equivalent without a paid service, so there the card says to tap
      the link again instead of pretending.
    */
    const safe = sitePath(path) ?? "/"
    return `${PLAY_URL}&referrer=${encodeURIComponent(`utm_content=${safe}`)}`
  }
  const id = (appStoreId || "").trim()
  return /^\d+$/.test(id) ? `https://apps.apple.com/app/id${id}` : null
}

/** The scheme address that hands this page to the app, from inside a web view, on both phones. */
export function schemeLink(path: string): string {
  const safe = sitePath(path) ?? "/"
  return `${APP_PACKAGE}://open?path=${encodeURIComponent(safe)}`
}

export interface HandoffCard {
  /** The phone, for the store and the words. */
  phone: Phone
  /** The hosting app's name, or UNNAMED_BROWSER. */
  browser: string
  /** One line, in Storelib's voice. */
  line: string
  /** The page being handed over. */
  path: string
  /** What the Open button follows first. */
  scheme: string
  /** Where it goes when nothing answers, or null on an iPhone with no App Store id set. */
  store: string | null
  /** Whether the hand off is attempted on arrival with no tap (the app has been here before). */
  auto: boolean
}

export interface HandoffRequest {
  ua: string
  /** Android's `x-requested-with` request header. */
  requestedWith?: string | null
  path: string
  /** The card's own quiet cookie, OPEN_CARD_COOKIE. */
  quietCookie?: string | null
  /** APP_SEEN_COOKIE: set by the app's own web view, so the app is on this phone. */
  appSeenCookie?: string | null
  /** NEXT_PUBLIC_IOS_APP_STORE_ID. */
  appStoreId?: string | null
}

/**
 * ONE PLACE DECIDES WHAT TO DRAW. Nothing on a computer, nothing in the
 * Storelib app, nothing in a real browser (the Smart App Banner and the
 * existing pill already do that job there, and pillPhone now stands aside
 * inside a web view so the two never double up), nothing on a page the app
 * would refuse (openTarget is asked, so checkout and sign in are refused
 * here for the same reason they are refused there), and nothing once the
 * reader has said to keep reading here.
 *
 * `auto` IS ONLY TRUE WITH PROOF. An automatic navigation to the scheme
 * with the app NOT installed shows the person a system error in several
 * in-app browsers, so it happens only where that error cannot happen: the
 * app has loaded this site in this cookie store before (APP_SEEN_COOKIE).
 * Everywhere else it is one clear tap. That is deliberate, not an
 * oversight: do not make it automatic without the cookie.
 */
export function handoffCard(req: HandoffRequest): HandoffCard | null {
  const ua = req.ua || ""
  const phone = phoneOf(ua)
  if (!phone) return null
  if (req.quietCookie === "closed") return null
  const browser = inAppBrowser(ua, req.requestedWith ?? null)
  if (!browser) return null
  const path = sitePath(req.path)
  if (!path) return null
  const scheme = schemeLink(path)
  /* The app's own side has to accept the page, or the hand off would land nowhere. */
  if (openTarget(scheme) !== path) return null
  return {
    phone,
    browser,
    line: handoffLine(browser),
    path,
    scheme,
    store: storeLink(phone, path, req.appStoreId),
    auto: req.appSeenCookie === "1",
  }
}
