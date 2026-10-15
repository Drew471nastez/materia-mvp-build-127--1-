/**
 * ===========================================================================
 *  THE APP'S SHELL (round 9, N2: asks 1 to 6)
 * ===========================================================================
 * The owner's words, with screenshots 56, 57 and 59:
 *
 *   1. "Every page is edge to edge like /app: no black (or any) bar above
 *      the header on /explore, products, creator pages, profiles, /account,
 *      library, communities, checkout. Status bar text colour follows the
 *      page."
 *   2. "The header and the status bar band are ONE surface: same colour
 *      (white), no translucent grey tint, content scrolls under an opaque
 *      header with a hairline at its bottom only."
 *   3. "Touch devices: no fade/overlay/tint when a finger touches or scrolls
 *      over a card."
 *   4. "Back navigation: never needs two taps, never double navigates on a
 *      double tap."
 *   5. "Library pills respond to the first tap every time on phones."
 *   6. "The splash is hidden after the first stable paint on every landing
 *      route."
 *
 * What is data is run here; the rest is read off the source. The pixels
 * (band and header one colour, nothing through the header, no veil under a
 * finger, one back for a double tap, the first tap on a pill) are measured
 * in scripts/check-native-shell.mjs.
 */
import { readSource, readCode } from "./_source"
import { DEFAULT_BAND, luminance, normalizeBand, parseColor, shouldHideSplashOn, statusStyleFor } from "@/lib/native-chrome"
import { isTap, TAP_MAX_MS, TAP_SLOP_PX } from "@/lib/navigation/first-tap"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
  }
}

const css = readSource("app/globals.css")
const cssCode = readCode("app/globals.css")
const layout = readCode("app/layout.tsx")
const chrome = readCode("lib/platform/header-chrome.ts")
const header = readCode("components/platform/platform-header-client.tsx")
const conditional = readCode("components/marketing/conditional-header.tsx")
const light = readCode("lib/ui/light-chrome.ts")
const nativeChrome = readCode("components/platform/native-chrome.tsx")
const goBack = readCode("lib/navigation/go-back.ts")
const tabs = readCode("components/library/library-tabs.tsx")
const discover = readCode("lib/isDiscoverMode.ts")
const cap = readCode("capacitor.config.ts")

/* A rule's body, by its exact selector line. */
function rule(selector: string): string | null {
  const i = cssCode.indexOf(`${selector} {`)
  if (i < 0) return null
  return cssCode.slice(i, cssCode.indexOf("}", i) + 1)
}

async function main() {
console.log("\n1. ONE BAND, AND THE STATUS BAR'S TEXT FROM IT")
{
  check("the band has one number, white by default", /--native-band: #ffffff;/.test(rule(":root") ?? cssCode))
  const shield = rule("html.capacitor::before")
  check("the shield under the clock is the band, not black", !!shield && /background-color: var\(--native-band\)/.test(shield) && !/#000000/.test(shield), shield)
  const canvas = cssCode.match(/html\.capacitor \{[^}]*\}/g) ?? []
  check("the app's canvas is the band in every html.capacitor rule, never black", canvas.length >= 2 && canvas.every((r) => !/background-color: #000000/.test(r)) && canvas.filter((r) => /background-color: var\(--native-band\)/.test(r)).length >= 2, canvas.length)
  check("/app's band is its own #111111", /html\.app-layout \{\s*--native-band: #111111;/.test(cssCode))
  check("the builder's band is its bar's #171717", /html\.wb-fullscreen \{\s*--native-band: #171717;/.test(cssCode))
  check("a dark buyer header says so to the band, from the server's HTML, in the bar and its stand in", /--native-band:\$\{BUYER_HEADER_DARK_BG\}/.test(header) && /--native-band:\$\{BUYER_HEADER_DARK_BG\}/.test(conditional))
  check("theme-color starts white", /themeColor: "#ffffff"/.test(layout) && !/themeColor: "#000000"/.test(layout))
  check("NativeChrome is mounted once in the root layout", (layout.match(/<NativeChrome \/>/g) ?? []).length === 1)
  /* Changed on purpose (round 28): the dark look on <html> is one more change it reads the band on. */
  check("it reads the band after every move and when <html> changes its mind, not on every style write", /readBand\(\)/.test(nativeChrome) && /applyThemeColor\(band\)/.test(nativeChrome) && /applyStatusBar\(band\)/.test(nativeChrome) && /attributeFilter: \["class", "style", "data-sl-dark"\]/.test(nativeChrome) && /if \(now === last\) return/.test(nativeChrome) && /\[pathname\]/.test(nativeChrome))
  check("a white full screen page says its colour through the band and no longer sets the status bar itself (light text on the way out)", /setProperty\("--native-band", color\)/.test(light) && !/status-bar/.test(light) && !/Style\.Dark/.test(light))

  check("white band: dark status text", statusStyleFor("#ffffff") === "LIGHT")
  check("#f2f2f2 (welcome) and #f8f9fa (a page layer): dark text", statusStyleFor("#f2f2f2") === "LIGHT" && statusStyleFor("#f8f9fa") === "LIGHT")
  check("/app's #111111, the dark header's #0e0e10, the builder's #171717: light text", statusStyleFor("#111111") === "DARK" && statusStyleFor("#0e0e10") === "DARK" && statusStyleFor("#171717") === "DARK")
  check("the violet #8b5cf6: dark text, the more readable of the two (4.96:1 against 4.23:1)", statusStyleFor("#8b5cf6") === "LIGHT")
  check("a colour that cannot be read is the white default", statusStyleFor("nonsense") === "LIGHT" && normalizeBand("") === DEFAULT_BAND)
  check("written one way, so a change is only a change", normalizeBand("#FFF") === "#ffffff" && normalizeBand("rgb(17, 17, 17)") === "#111111" && normalizeBand(" #0E0E10 ") === "#0e0e10")
  check("rgba and 8 digit hex read", JSON.stringify(parseColor("rgba(1, 2, 3, 0.5)")) === "[1,2,3]" && JSON.stringify(parseColor("#ffffff80")) === "[255,255,255]")
  check("luminance runs from black to white", luminance([0, 0, 0]) === 0 && Math.abs(luminance([255, 255, 255]) - 1) < 1e-9)
  check("SystemBars (core, Capacitor 8) first, the StatusBar plugin after, each asked only on a change", /import\("@capacitor\/core"\)/.test(readCode("lib/native-chrome.ts")) && /style !== lastStyle/.test(readCode("lib/native-chrome.ts")) && /import\("@capacitor\/status-bar"\)/.test(readCode("lib/native-chrome.ts")))
  check("capacitor.config: dark status text and a white strip from the first native frame (next release)", /SystemBars: \{[^}]*style: 'LIGHT'/.test(cap) && /StatusBar: \{[^}]*backgroundColor: '#ffffff'/.test(cap) && /insetsHandling: 'css'/.test(cap))
}

console.log("\n1b. A CREATOR'S PAGE IN THE APP HAS THE APP'S HEADER")
{
  check("a creator's /<handle> and /<handle>/<slug> are Discover in the app, as /u/ and /p/ were", /isSellerPage\(pathname\)/.test(discover) && /from "@\/lib\/url-helpers"/.test(discover))
}

console.log("\n2. THE HEADER AND THE BAND ARE ONE SURFACE")
{
  check("the light bar is opaque white: no blur, no 98%, no depth shadow", /root: "platform-header-light z-40 w-full bg-white"/.test(chrome) && !/backdrop-blur supports-\[backdrop-filter\]:bg-\[#fcfcfd\]/.test(chrome))
  check("its hairline stays", /headerBorder: "border-b border-\[rgba\(16,18,27,0\.06\)\]"/.test(chrome))
  check("the light depth rule is gone", !/\.platform-header-light\.platform-header-depth/.test(cssCode))
  check("the fixed bar brings its room in the flow, on every layout (the account, the library), not a marketing wrapper's padding", /html\.capacitor \.native-header-spacer \{[^}]*height: calc\(65px \+ env\(safe-area-inset-top, 0px\)\)/.test(cssCode) && /\.native-header-spacer \{\s*display: none;/.test(cssCode) && !/marketing-flex-wrapper \{\s*padding-top/.test(cssCode))
  check("the bar and its stand in both leave it", /className="native-header-spacer"/.test(header) && /className="native-header-spacer"/.test(conditional))
  check("the stand in is the bar's white", /"sticky top-0 z-40 w-full bg-white"/.test(conditional))
  check("a page's own top bar (the profile's) pads under the clock when it is the top, and not under the Storelib header", /html\.capacitor \.native-top-surface \{\s*padding-top: env\(safe-area-inset-top, 0px\);/.test(cssCode) && /html\.capacitor \.native-header-spacer ~ \* \.native-top-surface \{\s*padding-top: 0;/.test(cssCode) || /html\.capacitor \.native-header-spacer ~ \.native-top-surface,\s*html\.capacitor \.native-header-spacer ~ \* \.native-top-surface \{\s*padding-top: 0;/.test(cssCode))
  check("the profile bar is that surface: a hairline, no shadow", /className="native-top-surface sticky top-0 z-30 w-full border-b border-black\/\[0\.06\]"/.test(readCode("components/profile/profile-top-bar.tsx")))
}

console.log("\n3. NO VEIL UNDER A FINGER")
{
  check("every hover: is a mouse's hover (hover:hover AND pointer:fine), group- and peer- with it", /@custom-variant hover \{\s*@media \(hover: hover\) and \(pointer: fine\) \{\s*&:hover \{\s*@slot;/.test(cssCode))
  check("no grey tap square in a browser either", /html \{\s*-webkit-tap-highlight-color: transparent;\s*\}/.test(cssCode))
  check("a link or button with a picture in it, and any card, keeps full strength and no filter while pressed on a touch screen", /@media \(hover: none\), \(pointer: coarse\) \{\s*:is\(a, button, \[role="button"\], \[tabindex="0"\]\):has\(img, picture, video, canvas\):active,/.test(cssCode) && /\[data-product-card\], \[data-community-card\]/.test(cssCode) && /opacity: 1 !important;\s*filter: none !important;/.test(cssCode))
  check("a tapped card no longer draws its parent's text colour as a frame", !/\.group:hover \{\s*box-shadow: none !important;\s*border-color: inherit !important;/.test(cssCode))
}

console.log("\n4. ONE BACK PER PRESS")
{
  check("a back on its way holds every other one, for at least BACK_HOLD_MS", /export const BACK_HOLD_MS = 400/.test(goBack) && /if \(backInFlight\(\)\) return \(\) => \{\}/.test(goBack))
  check("it lets go when the back shows itself or gives up", /function done\(\) \{\s*settled = true\s*backPending = false/.test(goBack))
  check("and the second tap does not open what is under it on the page that came back", /swallowEchoClicks\(\)/.test(goBack) && /window\.addEventListener\("click", eat, true\)/.test(goBack))
  /* Round 11: and on until the page has gone (pushBackOnce), not only for BACK_HOLD_MS. */
  check("a pushed fallback is held the same way", /pushBackOnce\(plan\.href, navigate\)/.test(goBack) && /if \(backInFlight\(now\)\) return false/.test(goBack))

  /* Run for real, with a window that only counts. */
  const listeners: Record<string, Array<(e: unknown) => void>> = {}
  let backs = 0
  const fakeWindow = {
    addEventListener: (t: string, f: (e: unknown) => void) => ((listeners[t] ||= []).push(f)),
    removeEventListener: (t: string, f: (e: unknown) => void) => { listeners[t] = (listeners[t] || []).filter((g) => g !== f) },
    history: { back: () => { backs++ } },
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  }
  ;(globalThis as unknown as { window: unknown }).window = fakeWindow
  const go = await import("@/lib/navigation/go-back")
  go.resetBackHold()
  let fallbacks = 0
  go.backThen(() => fallbacks++, 50)
  go.backThen(() => fallbacks++, 50)
  check("two backs in a row: history.back once", backs === 1, backs)
  let prevented = 0
  let stopped = 0
  for (const f of listeners.click || []) f({ preventDefault: () => prevented++, stopImmediatePropagation: () => stopped++ })
  check("a click inside the hold is dropped", prevented === 1 && stopped === 1, { prevented, stopped })
  for (const f of listeners.popstate || []) f({})
  check("the back showed itself: no fallback", fallbacks === 0)
  await new Promise((r) => setTimeout(r, go.BACK_HOLD_MS - 50))
  prevented = 0
  for (const f of listeners.click || []) f({ preventDefault: () => prevented++, stopImmediatePropagation: () => {} })
  check("a slow second tap, after the back has landed, is still dropped (LANDED_HOLD_MS from the landing)", prevented === 1 && go.LANDED_HOLD_MS >= 250, prevented)
  await new Promise((r) => setTimeout(r, go.LANDED_HOLD_MS + 80))
  go.backThen(() => fallbacks++, 50)
  check("after the hold, the next back goes", backs === 2, backs)
  await new Promise((r) => setTimeout(r, 120))
  check("a back that never shows itself still ends on the fallback, and lets go", fallbacks === 1 && !go.backInFlight(Date.now() + go.BACK_HOLD_MS + 1), fallbacks)
  delete (globalThis as unknown as { window?: unknown }).window
}

console.log("\n5. THE FIRST TAP ON A PILL")
{
  check("a tap: the same spot, quickly", isTap({ x: 10, y: 10, t: 0 }, 14, 13, 120))
  check("a drift past the slop is a scroll", !isTap({ x: 10, y: 10, t: 0 }, 10 + TAP_SLOP_PX + 1, 10, 120))
  check("a long press is the platform's", !isTap({ x: 10, y: 10, t: 0 }, 10, 10, TAP_MAX_MS + 1))
  check("no pointer down, no tap", !isTap(null, 0, 0, 0))
  check("each pill answers on the lift, through the shared hook", /useFirstTap<HTMLAnchorElement>/.test(tabs) && /onPointerUp=\{(tap\.onPointerUp|\(e\) => \{\s*releasePill\(e\.currentTarget\)\s*tap\.onPointerUp\(e\))/.test(tabs) && /onPointerCancel=\{(tap\.onPointerCancel|\(e\) => \{\s*releasePill\(e\.currentTarget\)\s*tap\.onPointerCancel\(\))/.test(tabs))
  check("a tap moves through the router with no scroll, a mouse click stays the Link's own", /router\.push\(tab\.href, \{ scroll: false \}\)/.test(tabs) && /return false/.test(tabs))
  /* Round 17: the words are the shared PILL_WORDS layer (lib/ui/pill-switch.ts), pointer-events-none as before. */
  check("the label never takes the finger from the pill", /className=\{`\$\{PILL_WORDS\} [^`]*`\}>\{label\}/.test(tabs) && /PILL_WORDS =\s*"pointer-events-none /.test(readCode("lib/ui/pill-switch.ts")))
  check("the browser's click after a tap is swallowed, never a second move", /CLICK_ECHO_MS/.test(readCode("lib/navigation/first-tap.ts")) && /e\.preventDefault\(\)\s*return/.test(readCode("lib/navigation/first-tap.ts")))
  check("a tap that is the second half of a back's double tap is not a pill press", /if \(backInFlight\(\)\) return/.test(readCode("lib/navigation/first-tap.ts")))
}

console.log("\n6. THE SPLASH COMES DOWN ON EVERY LANDING PAGE")
{
  check("Explore, a community, a creator's page, the account: hidden here", ["/explore", "/community/x", "/andrewrullz", "/account"].every((p) => shouldHideSplashOn(p, false)))
  check("the gate and the pages that time it themselves are left alone", ["/native-start", "/app", "/app/products", "/account/library", "/account/library/courses", "/welcome"].every((p) => !shouldHideSplashOn(p, false)))
  check("not while a sign in is being finished", !shouldHideSplashOn("/explore", true))
  check("after two frames and the fonts, capped", /requestAnimationFrame\(\(\) =>\s*requestAnimationFrame/.test(nativeChrome) && /setTimeout\(r, 600\)/.test(nativeChrome) && /hideSplashOnce\(\)/.test(nativeChrome))
}

console.log("\nCOPY")
{
  const DASH = new RegExp("\\u2014")
  const BANNED = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b`, "i")
  const files = ["lib/native-chrome.ts", "components/platform/native-chrome.tsx", "lib/navigation/first-tap.ts", "lib/navigation/go-back.ts", "lib/ui/light-chrome.ts", "lib/platform/header-chrome.ts", "components/library/library-tabs.tsx", "scripts/check-native-shell.mjs", "scripts/render-native-shell.tsx", "tests/native-shell.test.ts"]
  for (const f of files) {
    const src = readSource(f)
    check(`${f}: no em dash and none of the banned words`, !DASH.test(src) && !BANNED.test(src))
  }
  /* The comments added to globals.css this round. */
  const at = css.indexOf("THE STATUS BAR BAND'S COLOUR")
  const ours = css.slice(at, css.indexOf("*/", at))
  check("globals.css: the band's note has no em dash", !DASH.test(ours))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
}

void main()
