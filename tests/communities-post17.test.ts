/**
 * ===========================================================================
 *  ROUND 17: THE POST ON A PHONE, DONE PROPERLY (worker P17)
 * ===========================================================================
 * Held from their inputs and, where the rule is about how a file is written,
 * from its source:
 *
 *   REACHED     a post the ROUTER reaches (a comment notification's
 *               /post/<id>#c-<comment>, a short address no card holds) is
 *               drawn: only the opened post's own history entry holds the
 *               place under it (round 16 held it for the router's post page
 *               too, under a hidden Activity: the address changed and
 *               nothing showed)
 *
 *   ENGINE      every move is Web Animations on translate, scale and opacity
 *               only, nothing behind the post moves, no blur while it moves,
 *               the post prepared before it moves; the busy loop result
 *   MORPH       the container is exactly the four clips' intersection at
 *               every step; the fade through never shows both contents; the
 *               style is one constant; the close lands on the card in order
 *   FINGER      a pull follows the finger, the top edge under it
 *   KEYBOARD    the decision table per environment (76.jpg's numbers), the
 *               page always to the foot of the screen, the readout's press
 *
 * ROUND 25: the opened post is the website builder's bottom sheet
 * (post-fullscreen.tsx); post-morph.ts and post-stage.ts are gone, and with
 * them this suite's MORPH, FINGER and ENGINE sections (their rules hold for
 * code that no longer exists). tests/post25.test.ts holds the sheet. REACHED
 * and the KEYBOARD table stay.
 *
 *   node scripts/run-push-tests.mjs   (in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { atPlaceFor, onLayerEntry } from "@/lib/communities/client/places"
import { boxFootOnScreen, footCss, keyboardEnv, keyboardPlan, type KeyboardFacts } from "@/components/community/member/keyboard-plan"
import { iosKeyboardFor } from "@/components/community/member/post-motion"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nREACHED: a post the router reaches is drawn")
{
  check("the opened post's own entry is known by its mark", onLayerEntry({ storelibLayer: "layer-1-abc" }) && onLayerEntry({ __NA: true, storelibLayer: "layer-2" }))
  check("the router's entries, the navigator's and none are not the opened post's", !onLayerEntry({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] }) && !onLayerEntry({ __communityDepth: 1 }) && !onLayerEntry(null) && !onLayerEntry(undefined) && !onLayerEntry("x"))
  check("a post opened over a place keeps the place", atPlaceFor("/community/clay/post/a1b2c3d4", "", true, true))
  check("the router on a post's address, from a place, does not keep the place", !atPlaceFor("/community/clay/post/a1b2c3d4", "", true, false) && !atPlaceFor("/community/clay/post/first-bowls-a1b2c3d4", "", true, false))
  check("a place is a place whatever the entry", atPlaceFor("/community/clay/notifications", "", false, false) && atPlaceFor("/community/clay", "?profile=mara", true, false))
  const host = read("components/community/member/place-host.tsx")
  check("the host asks the entry before holding the place", /const overLayer = typeof window !== "undefined" && onLayerEntry\(window\.history\.state\)/.test(host) && /atPlaceFor\(pathname \|\| "", search\?\.toString\(\) \?\? "", heldAtPlace\.current \?\? false, overLayer\)/.test(host))
  check("the router's post page is the routed slot's, shown over any place, and no kept screen shows with it", /const routerPost = isPostAddress\(pathname\) && !overLayer/.test(host) && /const routedVisible = routerPost \|\|/.test(host) && /const visible = key === shown\.key && \(routedKey !== null \|\| atPlace\) && !routerPost/.test(host))
  const frame = read("components/community/member/shell-frame.tsx")
  check("a comment's link (#c-<id>, every comment notification) opens its post over the place like any post link", /url\.hash && !\/\^#\(c-\[\\w-\]\+\|comments\)\$\/\.test\(url\.hash\)/.test(frame))
}

console.log("\nKEYBOARD: the decision table (keyboard-plan.ts)")
{
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
  check("the rows: iPhone Safari, the iOS app, the app with the plugin, Android (browser or app), a computer", keyboardEnv({ ua: IPHONE, capacitor: false, plugin: false, coarse: true }) === "ios-safari" && keyboardEnv({ ua: IPHONE, capacitor: true, plugin: false, coarse: true }) === "ios-app" && keyboardEnv({ ua: IPHONE, capacitor: true, plugin: true, coarse: true }) === "ios-app-plugin" && keyboardEnv({ ua: ANDROID, capacitor: true, plugin: true, coarse: true }) === "android" && keyboardEnv({ ua: ANDROID, capacitor: false, plugin: false, coarse: true }) === "android" && keyboardEnv({ ua: "Mozilla/5.0 (Macintosh)", capacitor: false, plugin: false, coarse: false }) === "computer")
  const base: KeyboardFacts = { layoutH: 844, innerH: 844, vvTop: 0, vvH: 844, typing: true, native: 0, table: iosKeyboardFor(390, 844), published: 422 }
  const foot = (env: Parameters<typeof keyboardPlan>[0], m: Partial<KeyboardFacts>) => {
    const plan = keyboardPlan(env, { ...base, ...m })
    return { plan, screen: boxFootOnScreen(plan, { layoutH: m.layoutH ?? 844, vvTop: m.vvTop ?? 0, tabs: 56 }) }
  }
  /* 76.jpg: a 390x844 iPhone, the keyboard's bar from 464 (844 - 380), iOS's pan 62. */
  const app = foot("ios-app", {})
  check("the iOS app, nothing reported: the table's keyboard, applied in the focus, on the keys at 464", app.plan.source === "table" && app.plan.atFocus && app.screen === 464, app)
  const appPan = foot("ios-app", { vvTop: 62 })
  check("76.jpg: a 62px pan reported: the room is the keyboard less the pan, still on the keys at 464 on the screen (never lifted twice)", appPan.plan.foot === 318 && appPan.screen === 464, appPan)
  check("round 16's maths for the same pan put the box 62 short: the table's height added on a page iOS had already panned", 844 - 380 - 62 === 402)
  const appReports = foot("ios-app", { vvTop: 0, vvH: 464 })
  check("an iOS app whose web view reports the keyboard: the visible part, as Safari", appReports.plan.source === "visual" && appReports.screen === 464, appReports)
  const plugin = foot("ios-app-plugin", { native: 380, vvTop: 0 })
  check("the app with the plugin: its exact height, the web view's scroll held so iOS does not pan as well", plugin.plan.source === "native" && plugin.plan.holdScroll && plugin.screen === 464, plugin)
  const pluginPan = foot("ios-app-plugin", { native: 390, layoutH: 852, vvTop: 64 })
  check("the plugin's height with a pan anyway: less the pan", pluginPan.screen === 852 - 390, pluginPan)
  const safari = foot("ios-safari", { vvH: 464, published: 380 })
  const safariPan = foot("ios-safari", { vvTop: 120, vvH: 464, published: 260 })
  check("iPhone Safari: the visible part, pan included, no keyboard height added", safari.plan.source === "visual" && safari.screen === 464 && safariPan.plan.foot === 260 && safariPan.screen === 464, { safari, safariPan })
  const android = foot("android", { layoutH: 464, innerH: 464, vvH: 464, native: 300, table: null })
  check("Android, the web view shrank: nothing added, never the plugin's height", android.plan.foot === 0 && android.plan.source === "visual" && !android.plan.holdScroll, android)
  const chrome = foot("android", { vvH: 520, table: null })
  check("Android Chrome, the visible part shrank: its room", chrome.plan.foot === 324 && chrome.screen === 520, chrome)
  const rest = keyboardPlan("ios-app", { ...base, typing: false })
  check("not typing: the tab bar's room, as CSS", rest.foot === "tabs" && footCss(rest) === "var(--buyer-tabs-h, 0px)" && footCss(app.plan) === "380px")
  check("a computer: never a keyboard", keyboardPlan("computer", base).foot === "tabs")
  const pf = read("components/community/member/post-fullscreen.tsx")
  /* Round 25: the surface is the bottom sheet's (fixed to the foot of the screen, its skirt one sheet tall below it): tests/post25.test.ts. */
  const mes = read("components/website-builder/mobile-editor-sheet.tsx")
  check("THE SURFACE: the post is the bottom sheet, anchored to the foot of the screen, white, with a solid skirt one sheet tall under its foot", /<MobileEditorSheet/.test(pf) && /className="bg-white \[--wb-sheet-skirt:#fff\]"/.test(pf) && /"fixed left-0 right-0 bottom-0 flex flex-col/.test(mes) && /0 \$\{height\}px 0 0 var\(--wb-sheet-skirt, transparent\)/.test(mes))
  const vb = read("components/community/member/visible-box.ts")
  check("the plan is applied IN the focus (before iOS decides to pan) and laid out at once", /const onFocusIn = \(e: FocusEvent\) => \{[\s\S]{0,200}run\(t\)\s*\/\*[^*]*\*\/\s*void \(scope\(\) as HTMLElement \| null\)\?\.offsetHeight/.test(vb) && /document\.addEventListener\("focusin", onFocusIn, true\)/.test(vb))
  check("the plugin's scroll is held only while typing, and let go", /holdNativeScroll\(hold\)/.test(vb) && /if \(held\) holdNativeScroll\(false\)/.test(vb))
  const nk = read("components/community/member/native-keyboard.ts")
  check("setScroll only on iOS and only with the plugin", /if \(!nativeKeyboardAvailable\(\)\) return/.test(nk) && /Capacitor\.getPlatform\(\) !== "ios"/.test(nk) && /Keyboard\.setScroll\(\{ isDisabled: on \}\)/.test(nk))
  const cm = read("components/community/member/comments.tsx")
  check("the post page's dock is on the same plan: its white to the foot while typed in, its content lifted", /useKeyboardPlan\(\s*dockPhone,/.test(cm) && /dock\.style\.bottom = "0px"\s*dock\.style\.paddingBottom = `\$\{Math\.round\(plan\.foot\) \+ 10\}px`/.test(cm))
  const css = read("app/globals.css")
  check("the keyboard does not shorten the community while a post is over it (its scroll would be thrown away under the post)", /html\.keyboard-open \[data-community-shell\]:not\(\[data-post-over\]\)(:not\(\[data-sheet-over\]\))? \{/.test(css) && /communityShell\(\)\?\.setAttribute\("data-post-over", ""\)/.test(pf))
  const guard = read("components/platform/keyboard-guard.tsx")
  check("KeyboardGuard leaves the post's own scroller alone", /if \(active\.closest\("\[data-keyboard-own\]"\)\) return/.test(guard) && /data-keyboard-own=""/.test(pf))
  check("THE READOUT: a 1.5s press on the face beside the comment box turns it on or off, kept on the phone", /export const KB_DEBUG_PRESS_MS = 1500/.test(pf) && /closest\?\.\("\[data-comment-box=comment\] > \[data-app-avatar\]"\)/.test(pf) && /window\.localStorage\.setItem\(KB_DEBUG_KEY, "1"\)/.test(pf) && /Math\.hypot\(e\.clientX - at\.x, e\.clientY - at\.y\) > 10/.test(pf))
  check("the face gives no iOS callout (the long press is ours)", /\[&_\[data-comment-box=comment\]>\[data-app-avatar\]\]:\[-webkit-touch-callout:none\]/.test(cm))
  check("and ?kbdebug=1 still works", /URLSearchParams\(window\.location\.search\)\.get\("kbdebug"\)/.test(pf))
}

console.log("\nCOPY: this round's files")
{
  const files = ["components/community/member/post-fullscreen.tsx", "components/community/member/keyboard-plan.ts", "components/community/member/visible-box.ts", "components/community/member/native-keyboard.ts", "components/community/member/post-overlay.tsx", "components/community/member/post-opener.tsx", "scripts/check-communities-post17.mjs", "scripts/render-communities-post17.tsx"]
  /* Spelled in pieces, so this file does not hold them itself. */
  const banned = new RegExp(["\\u2014", "un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge", "trans" + "form"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  const bad = files.filter((f) => banned.test(read(f)))
  check("no em dash and no banned word in this round's files", bad.length === 0, bad)
  const client = ["components/community/member/post-fullscreen.tsx", "components/community/member/visible-box.ts", "components/community/member/keyboard-plan.ts"]
  check("client modules import no server code", client.every((f) => !/from "(@\/lib\/communities\/server|next\/headers|server-only)/.test(read(f))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
