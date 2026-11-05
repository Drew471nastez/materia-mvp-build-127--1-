/**
 * ===========================================================================
 *  A LINK SHARED THROUGH INSTAGRAM OR WHATSAPP OPENS THE APP (round 14)
 * ===========================================================================
 * The owner: "Make the shared links through WhatsApp, Instagram, or any
 * other place which are links: if the user on iOS or Android has the app
 * installed on their device, it needs to open through that, not in browsers."
 *
 * A Universal Link and an App Link are only honoured where the tap happens.
 * Instagram, WhatsApp, TikTok, Facebook, Messenger, Snapchat, LinkedIn, X,
 * Telegram and Line each open a link in a web view of their own, and a web
 * view honours neither. The table below is real user agent strings and real
 * `x-requested-with` values from those apps on both phones, so the detection
 * is measured against what the phones actually send rather than against a
 * guess.
 *
 * scripts/check-open-in-app.mjs draws the card at 390x844 and 1440x900 and
 * presses it: the hand off, the store after the timer, the timer cancelled
 * when the page hides, and the quiet choice remembered.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  APP_SEEN_COOKIE,
  OPEN_CARD_COOKIE,
  OPEN_CARD_KEY,
  OPEN_CARD_QUIET_DAYS,
  STORE_FALLBACK_MS,
  UNNAMED_BROWSER,
  bannerPhone,
  handoffCard,
  handoffLine,
  inAppBrowser,
  isOurApp,
  openTarget,
  phoneOf,
  pillPhone,
  schemeLink,
  storeLink,
} from "../lib/platform/open-in-app"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ─────────────────────────────────────────────────────────────────────────
   1. THE TABLE OF REAL USER AGENTS AND x-requested-with VALUES
   ───────────────────────────────────────────────────────────────────────── */
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)"
const ANDROID_WV =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36"

/** [what it is, user agent, x-requested-with, the name on screen or null] */
const TABLE: Array<[string, string, string | null, string | null]> = [
  /* ── iPhone: the app says so in the user agent ─────────────────────── */
  [
    "Instagram, iPhone",
    `${IOS} Mobile/15E148 Instagram 338.0.3.24.90 (iPhone15,2; iOS 17_5_1; en_US; en; scale=3.00; 1179x2556; 613754691)`,
    null,
    "Instagram",
  ],
  [
    "Facebook, iPhone",
    `${IOS} Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5.1;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]`,
    null,
    "Facebook",
  ],
  [
    "Messenger, iPhone",
    `${IOS} Mobile/15E148 [FBAN/MessengerForiOS;FBAV/447.0.0.44.108;FBBV/553847234;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5.1;FBLC/en_US;FBOP/5]`,
    null,
    "Messenger",
  ],
  [
    "TikTok, iPhone",
    `${IOS} Mobile/15E148 musical_ly_34.5.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US isDarkMode/0 WKWebView/1 BytedanceWebview/d8a21c6`,
    null,
    "TikTok",
  ],
  /* Snapchat's own token sits after a Safari token: the app's name has to win. */
  ["Snapchat, iPhone", `${IOS} Mobile/15E148 Snapchat/12.90.0.46 (like Safari/604.1)`, null, "Snapchat"],
  ["LinkedIn, iPhone", `${IOS} Mobile/15E148 [LinkedInApp]`, null, "LinkedIn"],
  ["X, iPhone", `${IOS} Mobile/15E148 Twitter for iPhone/10.52`, null, "X"],
  /* Line's web view keeps Safari's token and adds its own after it. */
  ["Line, iPhone", `${IOS} Version/17.0 Mobile/15E148 Safari/604.1 Line/14.6.1`, null, "Line"],
  /*
    WHATSAPP AND TELEGRAM ON AN iPHONE CANNOT BE NAMED, and that is the
    honest answer rather than a wrong one: their web views send the plainest
    user agent of the lot, with no Safari token and no CriOS. They are still
    known to be a web view, which is what the card needs.
  */
  ["WhatsApp, iPhone", `${IOS} Mobile/15E148`, null, UNNAMED_BROWSER],
  ["Telegram, iPhone", `${IOS} Mobile/15E148`, null, UNNAMED_BROWSER],

  /* ── Android: the package in the x-requested-with header ───────────── */
  [
    "Instagram, Android",
    "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Instagram 338.0.0.19.108 Android (33/13; 450dpi; 1080x2176; samsung; SM-S918B; dm3q; qcom; en_US; 605753462)",
    "com.instagram.android",
    "Instagram",
  ],
  ["WhatsApp, Android", ANDROID_WV, "com.whatsapp", "WhatsApp"],
  ["WhatsApp for Business, Android", ANDROID_WV, "com.whatsapp.w4b", "WhatsApp"],
  ["TikTok, Android", ANDROID_WV, "com.zhiliaoapp.musically", "TikTok"],
  ["TikTok (the other package), Android", ANDROID_WV, "com.ss.android.ugc.trill", "TikTok"],
  [
    "Facebook, Android",
    `${ANDROID_WV} [FB_IAB/FB4A;FBAV/466.0.0.32.86;]`,
    "com.facebook.katana",
    "Facebook",
  ],
  [
    "Messenger, Android",
    `${ANDROID_WV} [FB_IAB/Orca-Android;FBAV/447.0.0.44.108;]`,
    "com.facebook.orca",
    "Messenger",
  ],
  ["Snapchat, Android", ANDROID_WV, "com.snapchat.android", "Snapchat"],
  ["LinkedIn, Android", ANDROID_WV, "com.linkedin.android", "LinkedIn"],
  ["X, Android", ANDROID_WV, "com.twitter.android", "X"],
  ["Telegram, Android", ANDROID_WV, "org.telegram.messenger", "Telegram"],
  ["Line, Android", ANDROID_WV, "jp.naver.line.android", "Line"],
  ["Pinterest, Android", ANDROID_WV, "com.pinterest", "Pinterest"],
  /* An app nobody here has heard of is still an app's web view. */
  ["an app with no name here, Android", ANDROID_WV, "com.example.reader", UNNAMED_BROWSER],
  ["an app's web view with the header missing, Android", ANDROID_WV, null, UNNAMED_BROWSER],

  /* ── Not an in-app browser ─────────────────────────────────────────── */
  ["Safari on an iPhone", `${IOS} Version/17.5 Mobile/15E148 Safari/604.1`, null, null],
  ["Chrome on an iPhone", `${IOS} CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1`, null, null],
  ["Firefox on an iPhone", `${IOS} FxiOS/127.0 Mobile/15E148 Safari/605.1.15`, null, null],
  [
    "Chrome on Android",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
    null,
    null,
  ],
  [
    "Samsung Internet on Android",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.6167.178 Mobile Safari/537.36",
    null,
    null,
  ],
  /*
    A CHROME CUSTOM TAB names its host app in the header while its user
    agent is plain Chrome. It honours App Links, so the app has already had
    the link by the time a page runs, and the card never asks about it (the
    card reads the user agent first). The header still names it here.
  */
  [
    "a Chrome Custom Tab opened by WhatsApp (named, but App Links already work there)",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
    "com.whatsapp",
    "WhatsApp",
  ],
  /* A Custom Tab Chrome opened for itself, and a browser's own package: not somebody else's web view. */
  [
    "Chrome's own package in the header",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
    "com.android.chrome",
    null,
  ],
  /* jQuery and friends set this header to XMLHttpRequest; it is not a package. */
  ["a stray x-requested-with that is not a package", `${IOS} Version/17.5 Mobile/15E148 Safari/604.1`, "XMLHttpRequest", null],

  /* ── STORELIB'S OWN WEB VIEW IS NEVER AN IN-APP BROWSER ────────────── */
  ["the Storelib app on an iPhone", `${IOS} Mobile/15E148 Capacitor`, null, null],
  ["the Storelib app on Android", `${ANDROID_WV} Capacitor`, "com.storelib.app", null],
  ["the Storelib app on Android, by the header alone", ANDROID_WV, "com.storelib.app", null],
  ["an older Storelib shell, by its user agent alone", `${ANDROID_WV} StorelibApp/2.1`, null, null],

  /* ── A computer is nobody's phone ──────────────────────────────────── */
  [
    "a Mac",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    null,
    null,
  ],
]

console.log("\n1. The app whose browser is showing the page, by what the phone actually sends")
for (const [label, ua, xrw, want] of TABLE) {
  const got = inAppBrowser(ua, xrw)
  check(`${label}: ${want === null ? "a real browser" : want}`, got === want, { got, want })
}
check("nothing at all is a real browser, not a web view", inAppBrowser("", null) === null && inAppBrowser("", "com.instagram.android") === null)
/*
  THE TRAP THAT HID THE WHOLE THING. isAppWebView's Android rule is "wv in
  the user agent", and every in-app web view on Android has that, so it
  reads Instagram's browser as the Storelib app. isOurApp is the rule the
  card uses instead: the bridge in the page, or the user agent Capacitor
  appends, and on the server our own package in the header.
*/
check("Instagram's Android web view is not mistaken for the Storelib app, which the 'wv' rule alone would do",
  isOurApp(TABLE[10][1]) === false && isOurApp(ANDROID_WV) === false && inAppBrowser(TABLE[10][1], "com.instagram.android") === "Instagram")
check("  and the Storelib app is still known, by the bridge or by its user agent", isOurApp(`${ANDROID_WV} Capacitor`) && isOurApp(ANDROID_WV, true) && isOurApp(`${IOS} Mobile/15E148 Capacitor`))
check("  the card asks the bridge and isOurApp, never the 'wv' rule", /isOurApp\(ua, !!bridge\?\.isNativePlatform\?\.\(\)\)/.test(code("components/platform/open-in-app-card.tsx")) && !/isNativeApp/.test(code("components/platform/open-in-app-card.tsx")))

console.log("\n   the line it reads")
check(
  "a named app is named",
  handoffLine("Instagram") === "Instagram is showing it in its own browser." &&
    handoffLine("WhatsApp") === "WhatsApp is showing it in its own browser.",
  handoffLine("Instagram"),
)
check("an app with no name reads as a sentence, never 'this app's browser is showing it in its own browser'",
  handoffLine(UNNAMED_BROWSER) === "This app is showing it in its own browser." && !handoffLine(UNNAMED_BROWSER).includes(UNNAMED_BROWSER),
  handoffLine(UNNAMED_BROWSER))

/* ─────────────────────────────────────────────────────────────────────────
   2. THE PILL AND THE BANNER STAND ASIDE, SO NOTHING DOUBLES UP
   ───────────────────────────────────────────────────────────────────────── */
console.log("\n2. One thing at a time: the pill and the library's banner stand aside inside a web view")
const INSTAGRAM_IOS = TABLE[0][1]
const SAFARI = `${IOS} Version/17.5 Mobile/15E148 Safari/604.1`
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36"
check("inside Instagram the pill is not drawn, with or without an App Store id", pillPhone(INSTAGRAM_IOS, true) === null && pillPhone(INSTAGRAM_IOS, false) === null)
check("inside WhatsApp's Android web view either, named by the header", pillPhone(ANDROID_WV, true, "com.whatsapp") === null)
check("and the library's banner is not drawn there", bannerPhone(INSTAGRAM_IOS, undefined) === null && bannerPhone(ANDROID_WV, undefined, "com.whatsapp") === null)
check("a real browser is unchanged: Safari without a Smart App Banner, Chrome on Android", pillPhone(SAFARI, false) === "ios" && pillPhone(SAFARI, true) === null && pillPhone(CHROME_ANDROID, true) === "android")
check("and the library's banner is unchanged there too", bannerPhone(SAFARI, undefined) === "ios" && bannerPhone(CHROME_ANDROID, null) === "android")

/* ─────────────────────────────────────────────────────────────────────────
   3. WHAT THE CARD IS GIVEN, AND WHEN IT IS GIVEN NOTHING
   ───────────────────────────────────────────────────────────────────────── */
console.log("\n3. The one place that decides what to draw")
const PAGE = "/community/clay-studio/post/42"
const ig = handoffCard({ ua: INSTAGRAM_IOS, path: PAGE, appStoreId: "1234567890" })
check("inside Instagram on an iPhone: the phone, the app's name, the line, the scheme and the App Store", !!ig && ig.phone === "ios" && ig.browser === "Instagram" && ig.line === "Instagram is showing it in its own browser." && ig.scheme === "com.storelib.app://open?path=%2Fcommunity%2Fclay-studio%2Fpost%2F42" && ig.store === "https://apps.apple.com/app/id1234567890", ig)
check("  and the hand off is a tap, never automatic, with no proof the app is there", ig?.auto === false)
const seen = handoffCard({ ua: INSTAGRAM_IOS, path: PAGE, appStoreId: "1234567890", appSeenCookie: "1" })
check("the app has loaded this site before (its own web view set the cookie): the hand off is attempted with no tap", seen?.auto === true)
const noId = handoffCard({ ua: INSTAGRAM_IOS, path: PAGE })
check("an iPhone with no App Store id set has no store to fall back to, and says so rather than following a broken address", noId !== null && noId.store === null)
const wa = handoffCard({ ua: ANDROID_WV, requestedWith: "com.whatsapp", path: "/community/clay-studio" })
check("inside WhatsApp on Android: the same scheme (an intent:// never escapes a plain web view) and the Play Store", !!wa && wa.phone === "android" && wa.browser === "WhatsApp" && wa.scheme === "com.storelib.app://open?path=%2Fcommunity%2Fclay-studio" && !!wa.store && wa.store.startsWith("https://play.google.com/store/apps/details?id=com.storelib.app"), wa)
check("  and Play carries the page as an install referrer, so the app can land right after installing", /&referrer=utm_content%3D%2Fcommunity%2Fclay-studio$/.test(wa?.store || ""), wa?.store)
check("nothing on a computer", handoffCard({ ua: TABLE[TABLE.length - 1][1], path: PAGE }) === null)
check("nothing in Safari or Chrome: the Smart App Banner and the pill do that job", handoffCard({ ua: SAFARI, path: PAGE }) === null && handoffCard({ ua: CHROME_ANDROID, path: PAGE }) === null)
check("nothing inside the Storelib app itself", handoffCard({ ua: `${IOS} Mobile/15E148 Capacitor`, path: PAGE }) === null && handoffCard({ ua: ANDROID_WV, requestedWith: "com.storelib.app", path: PAGE }) === null)
check("nothing once the reader said to keep reading here", handoffCard({ ua: INSTAGRAM_IOS, path: PAGE, quietCookie: "closed" }) === null)
check("nothing for an address that is not a path on this site", handoffCard({ ua: INSTAGRAM_IOS, path: "//evil.example/x" }) === null && handoffCard({ ua: INSTAGRAM_IOS, path: "https://evil.example" }) === null && handoffCard({ ua: INSTAGRAM_IOS, path: "/a b" }) === null)
check("nothing on a page the app refuses: checkout and sign in stay in the browser they were begun in", handoffCard({ ua: INSTAGRAM_IOS, path: "/checkout?productId=1" }) === null && handoffCard({ ua: INSTAGRAM_IOS, path: "/login" }) === null)
check("the store address is the phone's own, and an iPhone's needs the numeric id", storeLink("ios", "/x", "1234567890") === "https://apps.apple.com/app/id1234567890" && storeLink("ios", "/x", "nope") === null && storeLink("ios", "/x") === null && (storeLink("android", "/x") || "").startsWith("https://play.google.com/"))
check("the scheme never carries somebody else's address", schemeLink("//evil.example") === "com.storelib.app://open?path=%2F" && schemeLink("/community/x") === "com.storelib.app://open?path=%2Fcommunity%2Fx")
check("the timer is 1.4s, long enough for the app to answer and short enough to feel like nothing", STORE_FALLBACK_MS === 1400)
check("the quiet time is the pill's 30 days", OPEN_CARD_QUIET_DAYS === 30)

/* ─────────────────────────────────────────────────────────────────────────
   4. THE APP LANDS ON THE RIGHT PAGE
   ───────────────────────────────────────────────────────────────────────── */
console.log("\n4. The app lands on the page the link asked for")
const LANDS: Array<[string, string]> = [
  ["a community", "/community/clay-studio"],
  ["a post in a community", "/community/clay-studio/post/42"],
  ["an event (round 14's paid events)", "/community/clay-studio/events/ev_7f3a91"],
  ["a program in the classroom", "/community/clay-studio/learn/prog_12"],
  ["a space", "/community/clay-studio/space/general"],
  ["the members", "/community/clay-studio/members"],
  ["a community's sales page with the query a share carries", "/community/clay-studio?ref=ig"],
  ["a creator's page", "/maria"],
  ["a product on a creator's page", "/maria/preset-pack"],
  ["a product at its short address", "/p/preset-pack"],
  ["a profile", "/@maria"],
  ["a profile at its other two addresses", "/member/maria"],
  ["a profile at /u", "/u/maria"],
  ["the library", "/account/library"],
  ["Discover", "/explore"],
]
for (const [label, path] of LANDS) {
  check(`${label}: the scheme the card follows lands on ${path}`, openTarget(schemeLink(path)) === path, openTarget(schemeLink(path)))
  const web = `https://storelib.com${path}`
  check(`  and so does the plain https address people share, ${web}`, openTarget(web) === path, openTarget(web))
}
check("www. too, and a bare storelib.com is the home page", openTarget("https://www.storelib.com/community/clay-studio") === "/community/clay-studio" && openTarget("https://storelib.com") === "/")

console.log("\n   and refuses, on purpose")
const REFUSED: Array<[string, string]> = [
  ["checkout: the payment finishes in the browser it was begun in, with the session it has there", "/checkout"],
  ["checkout for a physical order", "/checkout/physical"],
  ["the purchase step", "/purchase/tok_1"],
  ["sign in", "/login"],
  ["sign up", "/signup"],
  ["signing out", "/logout"],
  ["the sign in return, which lib/native-oauth.ts finishes itself", "/auth/callback"],
  ["the password reset return", "/reset-password"],
  ["the billing return from Stripe", "/app/settings/billing"],
]
for (const [why, path] of REFUSED) {
  check(`${why}: ${path}`, openTarget(schemeLink(path)) === null && openTarget(`https://storelib.com${path}`) === null, {
    scheme: openTarget(schemeLink(path)),
    web: openTarget(`https://storelib.com${path}`),
  })
}
check("somebody else's site is never followed", openTarget("https://storelib.com.evil.example/x") === null && openTarget("com.storelib.app://open?path=https://evil.example") === null && openTarget("com.storelib.app://open?path=%2F%2Fevil.example") === null)
check("and a refusal is a refusal, not a guess: the card is given nothing for the same paths", REFUSED.every(([, p]) => handoffCard({ ua: INSTAGRAM_IOS, path: p }) === null))

/* ─────────────────────────────────────────────────────────────────────────
   5. THE WIRING
   ───────────────────────────────────────────────────────────────────────── */
console.log("\n5. The wiring")
const card = code("components/platform/open-in-app-card.tsx")
check("the root layout mounts the card on every page", /<OpenInAppCard \/>/.test(code("app/(storelib)/layout.tsx")))
check("the card asks about the web view only when the user agent already looks like one, so a page in Safari makes no request",
  /if \(!inAppBrowser\(ua, null\)\) return/.test(card) && /\/api\/app-links\/in-app-browser\?path=/.test(card))
check("the server answers from both signals and both cookies", (() => {
  const route = code("app/api/app-links/in-app-browser/route.ts")
  return /head\.get\("user-agent"\)/.test(route) && /head\.get\("x-requested-with"\)/.test(route) && /jar\.get\(OPEN_CARD_COOKIE\)/.test(route) && /jar\.get\(APP_SEEN_COOKIE\)/.test(route) && /handoffCard\(/.test(route)
})())
check("  and never caches an answer that is one phone's", /no-store/.test(read("app/api/app-links/in-app-browser/route.ts")) && /Vary/.test(read("app/api/app-links/in-app-browser/route.ts")))
check("the app's own web view writes the cookie that proves the app is on this phone, on every page it loads",
  new RegExp(`\\$\\{APP_SEEN_COOKIE\\}=1`).test(code("components/platform/app-link-opener.tsx")) && /if \(!isNativeApp\(\)\) return/.test(code("components/platform/app-link-opener.tsx")))
check("the card follows the scheme first and the store only after the timer", /window\.location\.href = card\.scheme/.test(card) && /setTimeout\(/.test(card) && /window\.location\.href = card\.store/.test(card))
check("the timer is cancelled when the page hides or goes away, which is how the app taking over is known",
  /visibilityState === "hidden"/.test(card) && /addEventListener\("visibilitychange", stop, \{ once: true \}\)/.test(card) && /addEventListener\("pagehide"/.test(card) && /useEffect\(\(\) => \(\) => window\.clearTimeout\(timer\.current\), \[\]\)/.test(card))
check("  and nothing in it runs twice or loops", /if \(going\.current\) return/.test(card) && /going\.current = true/.test(card) && /if \(!card\.auto \|\| tried\.current\) return/.test(card))
check("the quiet choice is remembered in both places, for 30 days", new RegExp(`localStorage\\.setItem\\(OPEN_CARD_KEY`).test(card) && new RegExp(`\\$\\{OPEN_CARD_COOKIE\\}=closed`).test(card) && /OPEN_CARD_QUIET_DAYS \* 24 \* 60 \* 60/.test(card))
check("  and read back from both, so a browser with no storage is still quiet", /localStorage\.getItem\(OPEN_CARD_KEY/.test(card) && new RegExp(`\\$\\{OPEN_CARD_COOKIE\\}=closed`).test(card.split("function quietAlready")[1] || ""))
check("the card is fixed to the foot of the screen over the page, never a sheet over it, and hidden in the app",
  /pointer-events-none fixed inset-x-0/.test(card) && /html\.capacitor_&\]:hidden/.test(card) && !/backdrop|fixed inset-0/.test(card))
check("  and it clears the phone's tab bar and the home indicator", /var\(--buyer-tabs-h, 0px\)/.test(card) && /env\(safe-area-inset-bottom\)/.test(card))
check("the cookie names are one set, shared by the card, the route and the app", APP_SEEN_COOKIE === "storelib_app_seen" && OPEN_CARD_COOKIE === "storelib_open_card" && OPEN_CARD_KEY === "storelib:open-in-app-card-closed")

console.log("\n   the native side, which ships with a release and not with a deploy")
const manifest = read("android/app/src/main/AndroidManifest.xml")
check("Android answers the scheme the card follows (the one change the hand off needs there)",
  /<data android:scheme="com\.storelib\.app" android:host="open" \/>/.test(manifest) && /<data android:scheme="storelib" android:host="open" \/>/.test(manifest))
check("  and still verifies the shared pages as App Links", /android:autoVerify="true"[\s\S]*?android:pathPrefix="\/community\/"[\s\S]*?android:pathPrefix="\/@"/.test(manifest))
check("an iPhone already registers the scheme, so the hand off works there with no release", /<string>com\.storelib\.app<\/string>/.test(read("ios/App/App/Info.plist")))
check("the checklist of what a build still has to carry is written down where the association file is built",
  /Associated Domains/.test(read("lib/platform/app-links.ts")) && /Install Referrer/.test(read("lib/platform/app-links.ts")) && /cap sync/.test(read("lib/platform/app-links.ts")) && /NEXT_PUBLIC_IOS_APP_STORE_ID/.test(read("lib/platform/app-links.ts")))

/* ─────────────────────────────────────────────────────────────────────────
   6. WHAT STORELIB SHARES IS THE PLAIN CANONICAL ADDRESS
   ───────────────────────────────────────────────────────────────────────── */
console.log("\n6. Every share in the product shares https://storelib.com/...")
check("a post shares the canonical address, not the host the reader happens to be on (a creator's own domain would never open the app)",
  /const SHARE_ORIGIN = "https:\/\/storelib\.com"/.test(code("components/community/member/post-card.tsx")) && !/\$\{window\.location\.origin\}\$\{href\}/.test(code("components/community/member/post-card.tsx")))
check("the invite sheet shares the community's own address", /return `https:\/\/storelib\.com\/community\/\$\{slug\}`/.test(code("components/community/member/invite-sheet.tsx")))
/* Changed on purpose (communities round trip): the address lives in ./share-link, which the list, the bar and the Overview share. */
check("a creator's community list does too", /https:\/\/storelib\.com\/community\/\$\{slug\}/.test(code("components/community/creator/share-link.ts")) && /from "\.\/share-link"/.test(code("components/community/creator/community-list.tsx")) && ["community-list.tsx", "community-shell.tsx", "overview.tsx"].every((f) => !/window\.location\.origin.*community/.test(code(`components/community/creator/${f}`))))
check("the community's address on the wall is copied whole", /https:\/\/storelib\.com\$\{path\}/.test(code("components/community/member/wall.tsx")))
check("a creator page's share copies the address it shows, storelib.com, not the host the workspace is open on",
  /const absolute = `https:\/\/storelib\.com\$\{path\}`/.test(code("components/app/creator-page-share.tsx")) && !/window\.location\.origin/.test(code("components/app/creator-page-share.tsx")))
check("a profile has its own Open Graph title, description and picture", (() => {
  const seo = read("lib/profile/profile-seo.ts")
  return /openGraph/.test(seo) && /description/.test(seo) && /images/.test(seo)
})())
check("a product shares getProductShareUrl's canonical address, never window.location", /getProductShareUrl\(/.test(code("components/product/share-button.tsx")) && !/window\.location\.href/.test(code("components/product/share-button.tsx")))
check("nothing in the product shares the app's scheme or a tracking wrapper",
  ["components/community/member/post-card.tsx", "components/community/member/invite-sheet.tsx", "components/community/creator/community-list.tsx", "components/product/share-button.tsx"].every(
    (f) => !/com\.storelib\.app:\/\//.test(code(f)) && !/intent:\/\//.test(code(f)),
  ))
check("a shared community page has its Open Graph title, description and picture (round 12 and 13 built them)", (() => {
  const seo = read("components/community/public/seo.ts")
  return /openGraph/.test(seo) && /description/.test(seo) && /images/.test(seo) && existsSync(join(process.cwd(), "app/(storelib)/(marketing)/community/[slug]/share.png/route.tsx"))
})())

/* ─────────────────────────────────────────────────────────────────────────
   7. THE PROBE, AND THE COPY
   ───────────────────────────────────────────────────────────────────────── */
console.log("\n7. The probe and the copy")
check("the probe that draws the card and presses it exists", ["scripts/check-open-in-app.mjs", "scripts/render-open-in-app.tsx"].every((f) => existsSync(join(process.cwd(), f))))
/* Each word with one of its letters in a character class, so this file is not itself an offender. */
const BANNED = /\b(u[n]lock\w*|e[l]evate\w*|s[e]amless\w*|p[o]werful\w*|e[f]fortless(ly)?|s[u]percharge\w*|t[r]ansform\w*)\b/i
const mine = [
  "lib/platform/open-in-app.ts",
  "lib/platform/app-links.ts",
  "components/platform/open-in-app-card.tsx",
  "components/platform/app-link-opener.tsx",
  "app/api/app-links/in-app-browser/route.ts",
  "scripts/check-open-in-app.mjs",
  "scripts/render-open-in-app.tsx",
  "tests/native-app-links-inapp.test.ts",
]
for (const f of mine) {
  const text = read(f)
  check(`${f}: no em dash, none of the banned words`, !/\u2014/.test(text) && !BANNED.test(text))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailed:\n  " + failures.join("\n  "))
  process.exit(1)
}
