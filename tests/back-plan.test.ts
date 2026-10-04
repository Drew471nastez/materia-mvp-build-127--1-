/**
 * ===========================================================================
 *  THE PRODUCT PAGE'S BACK ARROW: BACK, OR TO THE CREATOR'S PAGE
 * ===========================================================================
 * "If there is no point to go back to at all, it should take me to the
 * creator page of that product." The decision (lib/navigation/back-plan) is
 * run case by case, and the runner (lib/navigation/go-back) is run against a
 * stand-in window to prove the one promise the decision cannot make alone: a
 * back that does nothing is followed by the creator's page, never by a
 * spinner that lasts for ever.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { creatorPageHref, fallbackHref, isPlainClick, NO_CREATOR_HREF, planBack, type BackEvidence } from "../lib/navigation/back-plan"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const ORIGIN = "https://storelib.com"
const cold: BackEvidence = { canGoBack: null, depth: 0, referrer: "", origin: ORIGIN, historyLength: 1 }
const plan = (e: Partial<BackEvidence>, href = "/andrew") => planBack({ ...cold, ...e }, href)
const goesBack = (e: Partial<BackEvidence>) => plan(e).kind === "history"
const goesTo = (e: Partial<BackEvidence>, href = "/andrew") => { const p = plan(e, href); return p.kind === "navigate" ? p.href : null }

console.log("\nThe decision")
check("a shared link opened in a fresh tab goes to the creator's page", goesTo({}) === "/andrew")
check("so does one with a history of other sites behind it", goesTo({ historyLength: 5, referrer: "https://www.google.com/" }) === "/andrew")
check("a new tab opened from one of our pages has a referrer and nothing behind it: the creator's page", goesTo({ referrer: `${ORIGIN}/andrew`, historyLength: 1 }) === "/andrew")
check("a hard load from one of our pages in the same tab goes back", goesBack({ referrer: `${ORIGIN}/andrew`, historyLength: 3 }))
check("a product card pressed on the creator page (a client navigation) goes back", goesBack({ depth: 1 }))
check("the browser saying there is an entry behind goes back", goesBack({ canGoBack: true }))
check("the browser saying there is none never goes back, whatever the app counted", goesTo({ canGoBack: false, depth: 2, referrer: `${ORIGIN}/x`, historyLength: 4 }) === "/andrew")
check("a referrer from a lookalike origin is not ours", goesTo({ referrer: "https://storelib.com.evil.test/andrew", historyLength: 3 }) === "/andrew")
check("a referrer that is not a URL is ignored", goesTo({ referrer: "not a url", historyLength: 3 }) === "/andrew")

console.log("\nThe fallback address")
check("the creator's page is /<handle>", creatorPageHref("Andrew") === "/andrew")
check("a handle cannot carry a path", creatorPageHref("../admin?x=1") === "/adminx1")
check("no username is no creator page", creatorPageHref("") === "#" && creatorPageHref(undefined) === "#")
check("with no creator page it goes to Explore rather than nowhere", fallbackHref("#") === NO_CREATOR_HREF && fallbackHref("") === NO_CREATOR_HREF && goesTo({}, "#") === NO_CREATOR_HREF)
check("an absolute or protocol relative address is never a fallback", fallbackHref("https://evil.test/") === NO_CREATOR_HREF && fallbackHref("//evil.test") === NO_CREATOR_HREF)

console.log("\nWhich presses are ours")
const press = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
check("a plain press or tap", isPlainClick(press))
check("cmd, ctrl, shift, alt and a middle click belong to the browser",
  !isPlainClick({ ...press, metaKey: true }) && !isPlainClick({ ...press, ctrlKey: true }) && !isPlainClick({ ...press, shiftKey: true }) && !isPlainClick({ ...press, altKey: true }) && !isPlainClick({ ...press, button: 1 }))

console.log("\nIn a tab")
/* A stand-in window: listeners, a history whose back() may or may not do
   anything, and timers run by hand. */
type Listener = () => void
function fakeWindow(opts: { backDoes: "nothing" | "popstate" | "pagehide"; canGoBack?: boolean | null; referrer?: string; historyLength?: number }) {
  const listeners: Record<string, Listener[]> = {}
  const timers: { at: number; fn: () => void }[] = []
  let backs = 0
  const fire = (t: string) => (listeners[t] ?? []).slice().forEach((f) => f())
  const w = {
    location: { origin: ORIGIN, href: `${ORIGIN}/andrew/ebook` },
    history: {
      length: opts.historyLength ?? 1,
      back() {
        backs++
        if (opts.backDoes !== "nothing") timers.push({ at: 50, fn: () => fire(opts.backDoes) })
      },
    },
    addEventListener(t: string, f: Listener) { (listeners[t] ||= []).push(f) },
    removeEventListener(t: string, f: Listener) { listeners[t] = (listeners[t] ?? []).filter((x) => x !== f) },
    setTimeout(fn: () => void, ms: number) { timers.push({ at: ms, fn }); return timers.length },
    clearTimeout() {},
    ...(opts.canGoBack === undefined || opts.canGoBack === null ? {} : { navigation: { canGoBack: opts.canGoBack, addEventListener() {}, removeEventListener() {} } }),
  }
  const g = globalThis as unknown as { window?: unknown; document?: unknown }
  g.window = w
  /* Every fake tab is a fresh one: no back from the last case is still on its way (go-back's hold against a double tap). */
  resetHold?.()
  g.document = { referrer: opts.referrer ?? "" }
  return {
    run() { timers.sort((a, b) => a.at - b.at).splice(0).forEach((t) => t.fn()) },
    backs: () => backs,
    /* The watch's own listeners. The click hold after a back (go-back BACK_HOLD_MS, LANDED_HOLD_MS) is a timed listener of its own, taken off on its own clock. */
    listening: () => Object.entries(listeners).reduce((n, [t, l]) => n + (t === "click" ? 0 : l.length), 0),
  }
}

let resetHold: (() => void) | null = null

async function main() {
  const { goBackOr, BACK_WATCH_MS, resetBackHold } = await import("../lib/navigation/go-back")
  resetHold = resetBackHold

  {
    const tab = fakeWindow({ backDoes: "nothing" })
    const went: string[] = []
    const p = goBackOr("/andrew", (h) => went.push(h))
    tab.run()
    check("opened cold: straight to the creator's page, history untouched", p.kind === "navigate" && went.join() === "/andrew" && tab.backs() === 0, { p, went })
  }
  {
    /* The case that "loads forever": the evidence says there is somewhere
       to go back to, and the browser's back does nothing. */
    const tab = fakeWindow({ backDoes: "nothing", referrer: `${ORIGIN}/andrew`, historyLength: 2 })
    const went: string[] = []
    const p = goBackOr("/andrew", (h) => went.push(h))
    tab.run()
    check("a back that does nothing is followed by the creator's page", p.kind === "history" && tab.backs() === 1 && went.join() === "/andrew", { p, went })
    check("and nothing is left listening", tab.listening() === 0)
  }
  {
    const tab = fakeWindow({ backDoes: "popstate", referrer: `${ORIGIN}/andrew`, historyLength: 2 })
    const went: string[] = []
    goBackOr("/andrew", (h) => went.push(h))
    tab.run()
    check("a back the router handles (popstate) is left alone", tab.backs() === 1 && went.length === 0 && tab.listening() === 0, went)
  }
  {
    const tab = fakeWindow({ backDoes: "pagehide", referrer: `${ORIGIN}/andrew`, historyLength: 2 })
    const went: string[] = []
    goBackOr("/andrew", (h) => went.push(h))
    tab.run()
    check("a back to another document (pagehide) is left alone", tab.backs() === 1 && went.length === 0, went)
  }
  {
    const tab = fakeWindow({ backDoes: "nothing", canGoBack: false, referrer: `${ORIGIN}/andrew`, historyLength: 4 })
    const went: string[] = []
    goBackOr("/andrew", (h) => went.push(h))
    tab.run()
    check("where the browser says there is nothing behind, back is never called", tab.backs() === 0 && went.join() === "/andrew")
  }
  check("the watch is short enough not to read as a hang", BACK_WATCH_MS > 300 && BACK_WATCH_MS <= 1500, BACK_WATCH_MS)

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE WATCH ON ITS OWN, WHICH THE WHOLE APP GOES BACK THROUGH
    ═══════════════════════════════════════════════════════════════════════
    Every screen with a way back also puts something up while it waits: a
    dimmed arrow, a spinner, a page layer held live over the page behind.
    `history.back()` reports nothing when it does nothing, so all of it stayed
    there. Filmed on the product editor with back made into a no-op, nothing
    changed on the screen for the whole film (scripts/check-app-back-stall.mjs).
  */
  console.log("\nThe watch")
  const { backThen } = await import("../lib/navigation/go-back")
  {
    const tab = fakeWindow({ backDoes: "nothing" })
    const went: string[] = []
    backThen(() => went.push("fallback"))
    tab.run()
    check("a back that does nothing is followed by the fallback", tab.backs() === 1 && went.join() === "fallback")
    check("and nothing is left listening", tab.listening() === 0)
  }
  for (const showed of ["popstate", "pagehide"] as const) {
    const tab = fakeWindow({ backDoes: showed })
    const went: string[] = []
    backThen(() => went.push("fallback"))
    tab.run()
    check(`a back that shows itself (${showed}) is left alone`, tab.backs() === 1 && went.length === 0 && tab.listening() === 0)
  }
  {
    /* A screen that goes away before the watch is over takes its watch with it. */
    const tab = fakeWindow({ backDoes: "nothing" })
    const went: string[] = []
    const stop = backThen(() => went.push("fallback"))
    stop()
    tab.run()
    check("a cancelled watch never runs its fallback", went.length === 0 && tab.listening() === 0)
  }

  console.log("\nThe controls")
  /* Code only: the comments explain what router.back() used to do. */
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const bar = code("components/store-builder/product-creator-bar.tsx")
  const crumb = code("components/product/discover-back-breadcrumb.tsx")
  check("the bar's arrow is a real link to the creator's page", /<a\s+href=\{href\}/.test(bar) && /<BackControl onBack=\{goBack\} href=\{fallbackHref\(creatorHref\)\}/.test(bar))
  check("a plain press is taken over, any other press opens the link", /if \(!isPlainClick\(e\)\) return\s+e\.preventDefault\(\)/.test(bar))
  check("the bar decides through back-plan and never calls history.back itself", /goBackOr\(target/.test(bar) && !/window\.history\.back\(\)/.test(bar) && !/router\.back\(\)/.test(bar))
  check("a push that never lands loads the creator's page as a document", /window\.location\.assign\(href\), PUSH_GIVE_UP_MS/.test(bar))
  check("the app's breadcrumb is a link too, with the same decision", /<a\s+ref=\{ref\}\s+href=\{href\}/.test(crumb) && /goBackOr\(href/.test(crumb) && !/router\.back\(\)/.test(crumb))
  const tracker = code("components/platform/app-history-tracker.tsx")
  check("a route that replaced its entry is not counted as a page behind",
    /if \(!grew && !poppedOnce\.current\) \{\s*lastPath\.current = pathname\s*return/.test(tracker) && tracker.indexOf("!grew && !poppedOnce") < tracker.indexOf("noteClientNavigation(lastPath.current)"))
  check("the product page hands the breadcrumb the creator's page", /creatorHref=\{creatorPageHref\(creatorUsername\)\}/.test(read("app/(marketing)/p/[slug]/page.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
