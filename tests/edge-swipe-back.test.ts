/**
 * ===========================================================================
 *  THE EDGE SWIPE BACK: THE RULES AS WRITTEN, AND WHERE IT RUNS
 * ===========================================================================
 * Round 12, G (ask 39). The decisions are lib/navigation/edge-swipe.ts and
 * are run case by case here; the component (components/platform/
 * edge-swipe-back.tsx) is held to the promises the probe cannot see from a
 * single run: mounted once in the root layout, only in the app, every
 * listener passive, the back through the shared helper, nothing left on
 * <html> or <body>. The motion itself is measured by
 * scripts/check-edge-swipe.mjs (every frame of a drag, the release, the
 * spring back, the places it must not run).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CLAIM_PX,
  COMPLETE_FRACTION,
  EDGE_START_PX,
  FLICK_PX_PER_MS,
  cancelMs,
  completeMs,
  dimOpacity,
  edgeSwipeRouteAllowed,
  judgeMove,
  pageOffset,
  progressOf,
  releaseVelocity,
  shadowOpacity,
  shouldComplete,
  startsAtEdge,
} from "../lib/navigation/edge-swipe"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const W = 390

console.log("\nWhere a swipe may start")
check("within 20px of the left edge", EDGE_START_PX === 20 && startsAtEdge(0) && startsAtEdge(12) && startsAtEdge(20))
check("not at 21px, not at 40px", !startsAtEdge(21) && !startsAtEdge(40))
check("the buyer's side: Explore, a product, a creator, a profile, the library, the account, a community", ["/explore", "/andrew/preset-pack", "/andrew", "/@ava", "/account/library", "/account", "/community/club", "/community/club/post/1"].every(edgeSwipeRouteAllowed))
check("never the seller app, the editors, the start screen, sign in callbacks or the checkout", ["/app", "/app/products", "/admin", "/website-builder/editor/1", "/store-builder", "/native-start", "/checkout", "/checkout/x", "/auth/callback"].every((p) => !edgeSwipeRouteAllowed(p)))
check("a path that only starts with the same letters is not caught", edgeSwipeRouteAllowed("/apparel") && edgeSwipeRouteAllowed("/authors"))

console.log("\nWhen a touch becomes the page's drag")
check("a small move waits", judgeMove(4, 2) === "wait" && judgeMove(CLAIM_PX - 1, 0) === "wait")
check("10px to the right, mostly sideways: the page's", judgeMove(CLAIM_PX, 0) === "claim" && judgeMove(14, 6) === "claim")
check("a move that goes down first is a scroll", judgeMove(3, 12) === "give-up" && judgeMove(9, -10) === "give-up")
check("a diagonal that is not clearly sideways is not taken", judgeMove(11, 10) !== "claim")
check("a move to the left gives the touch up", judgeMove(-12, 0) === "give-up")

console.log("\nThe page follows the finger")
check("its offset is the finger's distance", pageOffset(123, W) === 123 && pageOffset(0, W) === 0)
check("never left of the edge, never past the width", pageOffset(-30, W) === 0 && pageOffset(500, W) === W)
check("progress is 0 to 1", progressOf(0, W) === 0 && progressOf(W / 2, W) === 0.5 && progressOf(W * 2, W) === 1 && progressOf(10, 0) === 0)
check("the dim clears as the page goes", dimOpacity(0) === 1 && dimOpacity(0.5) === 0.5 && dimOpacity(1) === 0)
check("the page's shadow is there while it moves and gone when it has left", shadowOpacity(0) === 1 && shadowOpacity(0.5) > 0.7 && shadowOpacity(1) === 0)

console.log("\nLetting go")
check("past 35% goes", COMPLETE_FRACTION === 0.35 && shouldComplete(W * 0.36, W, 0) && !shouldComplete(W * 0.34, W, 0))
check("a flick to the right goes, however short", shouldComplete(30, W, FLICK_PX_PER_MS + 0.1))
check("a jitter at the edge is not a flick", !shouldComplete(10, W, 2))
check("a flick back to the left stays, however far", !shouldComplete(W * 0.8, W, -0.5))
check("a slow short drag stays", !shouldComplete(W * 0.2, W, 0.1))
const samples: Array<[number, number]> = [[0, 10], [16, 30], [32, 50], [48, 70], [64, 90], [80, 110], [96, 130]]
check("release speed over the last 80ms", Math.abs(releaseVelocity(samples) - 1.25) < 0.01, releaseVelocity(samples))
check("a finger held still before the lift has no speed", releaseVelocity([[0, 10], [16, 60], [200, 60], [216, 60]]) === 0)
check("one sample has no speed", releaseVelocity([[0, 10]]) === 0)
check("the slide out is quick from a flick and calm from a slow release", completeMs(200, 3) === 170 && completeMs(250, 0.2) <= 320 && completeMs(250, 0.2) >= 170)
check("the spring back is never slow", cancelMs(0) === 200 && cancelMs(1000) === 320)
check("reduced motion: both short", completeMs(300, 0, true) === 140 && cancelMs(300, true) === 140)

console.log("\nThe component")
const comp = read("components/platform/edge-swipe-back.tsx")
const layout = read("app/(storelib)/layout.tsx")
const lib = read("lib/navigation/edge-swipe.ts")
/* Changed on purpose (the owner: no edge swipe navigation inside the iOS and Android app; the browser keeps its own). */
check("not mounted: the app has no edge swipe of its own", !/<EdgeSwipeBack \/>/.test(layout) && !/from "@\/components\/platform\/edge-swipe-back"/.test(layout))
check("only in the app: nothing is installed outside it", /if \(typeof window === "undefined" \|\| !edgeSwipeEnvironment\(window\)\) return/.test(comp))
check("the app means html.capacitor, not Android, not a shell with its own swipe", /classList\.contains\("capacitor"\)/.test(lib) && /getPlatform\?\.\(\) === "android"/.test(lib) && /NATIVE_SWIPE_FLAG/.test(lib))
check("every listener is passive: nothing it does can hold a scroll", /const opts: AddEventListenerOptions = \{ passive: true, capture: true \}/.test(comp) && !/passive: false/.test(comp) && !/preventDefault/.test(comp))
check("touchstart, touchmove, touchend and touchcancel all use those options", ["touchstart", "touchmove", "touchend", "touchcancel"].every((t) => new RegExp(`addEventListener\\("${t}", on\\w+, opts\\)`).test(comp)))
check("it goes back through backThen (the hold, the echo guard, the fallback), once", (comp.match(/backThen\(/g) || []).length === 1 && /if \(!backInFlight\(\)\) backThen\(arrive\)/.test(comp))
check("never with no history behind: the same plan the back controls use", /planBack\(readBackEvidence\(\), null\)\.kind !== "history"/.test(comp))
check("never over a sheet, a dialog, the lightbox, the composer, a page layer", /data-app-sheet-up/.test(lib) && /\[data-lightbox\]/.test(lib) && /data-composer="open"\],\[data-composer="sheet"\]/.test(lib) && /has-page-layer/.test(lib) && /aria-modal="true"/.test(lib))
check("never on a row that scrolls sideways, a Swiper, a pan-y gallery, a slider, the tab bar", /overflowX === "auto" \|\| cs\.overflowX === "scroll"/.test(lib) && /swiper/.test(lib) && /pan-y/.test(lib) && /type === "range"/.test(lib) && /data-buyer-tab-bar/.test(lib))
check("moves by the translate property and opacity only (the compositor's)", /html\.style\.translate = `\$\{x\}px 0px`/.test(comp) && /tab\.style\.translate = `\$\{-x\}px 0px`/.test(comp) && !/\.style\.(left|top|width|marginLeft) = `\$\{x/.test(comp))
check("every inline style it sets is put back as it was", /function put\(/.test(comp) && /function restore\(\)/.test(comp) && /restore\(\)/.test(comp.slice(comp.indexOf("function leave()"))))
check("the window's scroll events from the hand over are kept from the page", /function muteScroll\(\)/.test(comp) && /stopImmediatePropagation/.test(comp))
check("a slow page behind: the app's own spinner on the stand in, after the same half second as a slow page", /ActivitySpinner, SPINNER_WAIT_MS/.test(comp) && /\$\{SPINNER_WAIT_MS\}ms forwards/.test(comp))
check("no client module imports server code", !/next\/headers|server-only|lib\/communities\/server|admin-blog-auth/.test(comp + lib))
check("no banned words or em dashes", !/—|\bunlock|\belevate|seamless|powerful|effortless|supercharge|transform/i.test(comp + lib))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("\nFailures:\n" + failures.map((f) => "  - " + f).join("\n"))
  process.exit(1)
}
