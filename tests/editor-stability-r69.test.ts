/**
 * ===========================================================================
 *  ROUND 69: THE HEADER FOLLOWS ITS SETTING, A SWITCH HIDES NOTHING
 * ===========================================================================
 *   npx tsx tests/editor-stability-r69.test.ts
 *
 * The owner: "when I switch between 'sticky on scroll up' and 'always
 * sticky', it doesn't work ... it's stuck on always sticky"; "when I switch
 * between mobile view, desktop view or larger screen ... it hides the header
 * section or other things really abruptly".
 *
 * Found (scripts/check-editor-stability-r69.ts, the real editor in Chromium):
 *   STICKY    a header drawn again in the canvas runs its inline scripts again
 *             (round 66), and what their first run added to window and
 *             document was taken off first. The sticky controller runs once
 *             per page behind its own guard (if (!window.StorelibHeaderSticky)),
 *             so its second run added nothing: its scroll, resize and load
 *             listeners were gone and the header kept the mode it had. Only
 *             what the run again adds again is taken off now.
 *   SWITCH    the page keeps the place under the eye through a switch by
 *             scrolling, and a phone's page is taller: "Show on scroll up"
 *             read that scroll as the person going down and slid away. A
 *             change of width (or a section drawn again) no longer counts as
 *             a scroll; for theme files already installed, the canvas holds
 *             the bar shown through the switch.
 *   COLLAPSE  a section resting far from the screen (content-visibility,
 *             at the size it last had) was held for the switch at a plain
 *             length and lost that size: let go it was zero tall, the page
 *             6,891px long before a switch and 2,264px after. Held at
 *             "auto <length>" now, in the canvas's own hold and the editor's.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CANVAS_BRIDGE, CANVAS_SCRIPT_OWN, CANVAS_SWITCH } from "@/lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`) }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const M = "theme-packages/materia/base/"
const controller = process.env.OLD_CONTROLLER ? readFileSync(process.env.OLD_CONTROLLER, "utf8") : code(M + "snippets/header-sticky-controller.liquid")
const stickyCss = code(M + "assets/header-sticky.css")
const switchTs = code("lib/website-builder/canvas-switch.ts")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.log("\nA section's script run again keeps what it does not add again (canvas-bridge.ts)\n")
{
  check("the run again comes first, then the last run's listeners are taken off", CANVAS_BRIDGE.indexOf("old.replaceWith(s);") < CANVAS_BRIDGE.indexOf("var now = own.get(key) || [];"))
  check("only a listener for the same event on the same target, or an interval when it starts one again", /return r\[0\] === null \? n\[0\] === null : n\[0\] === r\[0\] && n\[1\] === r\[1\];/.test(CANVAS_BRIDGE))
  check("what stays is noted again, for the next run", /if \(kept\.length\) own\.set\(key, kept\.concat\(now\)\);/.test(CANVAS_BRIDGE))
}

console.log("\nA change of width is not a scroll (header-sticky-controller.liquid)\n")
{
  check("the width is read, not the height (a phone's address bar is still a scroll)", /if \(s\.vw !== innerWidth\) \{ if \(s\.vw != null\) s\.settleUntil = now \+ 500; s\.vw = innerWidth; \}/.test(controller))
  check("while it settles the bar keeps its state, and the turn starts where the page is", /if \(settling\) \{ s\.dir = 0; s\.turnY = y; if \(!away \|\| y <= 0\) s\.hidden = false; \}/.test(controller))
  check("a section drawn again settles too", /state\.settleUntil = performance\.now\(\) \+ 500;/.test(controller))
  check("the canvas holds an installed theme's bar shown through a switch", /var holdBars = function \(on\)/.test(CANVAS_BRIDGE) && /holdBars\(!!on\);/.test(CANVAS_BRIDGE) && /data-sl-bar-held/.test(CANVAS_BRIDGE))
  check("and lets go at once when the person scrolls, taps or types", /addEventListener\("wheel", letGo, \{ capture: true, passive: true \}\)/.test(CANVAS_BRIDGE) && /addEventListener\("keydown", letGo, true\)/.test(CANVAS_BRIDGE))
}

console.log("\nA resting section keeps its size through a switch\n")
{
  check("the canvas's own hold (CANVAS_SWITCH holdBelow): auto first", CANVAS_SWITCH.includes('s.style.containIntrinsicHeight = "auto " + Math.round(item.height) + "px";'))
  check("the editor's hold (canvas-switch.ts holdIn): auto first", switchTs.includes("b.style.containIntrinsicHeight = `auto ${Math.round(h * 10) / 10}px`"))
  check("the rest itself remembers the size (auto none)", CANVAS_BRIDGE.includes("[data-sl-rest]{contain-intrinsic-size:auto none}"))
}

/* ------------------------------------------------------------------------ */
/* In Chromium: the controller as the theme ships it, the bridge's own code. */
/* ------------------------------------------------------------------------ */

/** The snippet's script, its Liquid taken out (comments, the stylesheet tag, the pill rule). */
const controllerJs = (() => {
  const t = controller
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "")
    .replace(/\{%-?\s*if pgs\.header_pill_mobile\s*%\}[\s\S]*?\{%-?\s*endif\s*%\}/, "")
  return t.slice(t.indexOf("<script>") + 8, t.lastIndexOf("</script>", t.indexOf("header-sticky-extras")))
})()
const between = (text: string, from: string, to: string) => { const a = text.indexOf(from); const b = text.indexOf(to, a); return a >= 0 && b > a ? text.slice(a, b) : "" }
const RUN_SCRIPTS = between(CANVAS_BRIDGE, "var JS_TYPE", "/* A section new to the page goes in")
const HOLD_BELOW = between(CANVAS_SWITCH, "var held = [];", "var lastW = 0;")
const REST_CSS = /\[data-sl-rest\]\{contain-intrinsic-size:auto none\}\[data-sl-rest\]\[data-sl-far\]\{content-visibility:hidden\}/.exec(CANVAS_BRIDGE)?.[0] ?? ""

const header = (mode: string) => `<div id="shopify-section-hdr" class="shopify-section section-header"><header class="header" data-sticky="${mode}" data-sticky-mobile="true" style="display:block;height:80px;background:#ddd">Header</header><script>${controllerJs}</script></div>`
const pageHtml = (mode: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width">${CANVAS_SCRIPT_OWN}<style>${stickyCss}</style><style>body{margin:0;font:16px sans-serif}${REST_CSS}</style></head><body>${header(mode)}<main><div class="shopify-section" id="shopify-section-a"><p class="wrap" style="margin:0">${"Words that wrap onto more lines on a phone. ".repeat(90)}</p></div><div class="shopify-section" id="shopify-section-b" style="height:2400px;background:#eee"></div><div class="shopify-section" id="shopify-section-far"><div style="height:700px;background:#cde">far</div></div><div style="height:3000px"></div></main></body></html>`

async function browserHalf() {
  const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    /* A fresh page each time: setContent keeps the window, and the controller's guard with it. */
    let page = await browser.newPage()
    const fresh = async () => { await page.close(); page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 }) }
    await page.setViewport({ width: 1280, height: 800 })
    const state = () => page.evaluate(() => { const s = document.getElementById("shopify-section-hdr")!; const b = s.querySelector("header")!.getBoundingClientRect(); return { mode: s.dataset.storelibSticky ?? "", hidden: s.classList.contains("shopify-section-header-hidden"), top: Math.round(b.top), bottom: Math.round(b.bottom), y: Math.round(scrollY) } })
    /* A hand on a wheel: scroll events, a frame apart. */
    const scrollBy = async (dy: number) => { for (let i = 0; i < 8; i++) { await page.evaluate((d) => window.scrollBy(0, d), dy / 8); await sleep(30) } await sleep(500) }
    /* The canvas drawing the header again, as canvas-bridge.ts does: the new section in place, its inline scripts run again. */
    const redraw = (mode: string) => page.evaluate((html, src) => {
      const w = window as unknown as { __ran?: Set<string>; __runScripts?: (el: Element, again: boolean) => void }
      if (!w.__runScripts) {
        const ran = new Set<string>()
        document.querySelectorAll("script").forEach((x) => ran.add(x.src || x.textContent || ""))
        w.__runScripts = new Function("ran", src + "\nreturn runScripts;")(ran) as (el: Element, again: boolean) => void
      }
      const t = document.createElement("template")
      t.innerHTML = html
      const next = t.content.firstElementChild!
      document.getElementById("shopify-section-hdr")!.replaceWith(next)
      w.__runScripts(next, true)
      document.dispatchEvent(new CustomEvent("storelib:settings-change"))
    }, header(mode), RUN_SCRIPTS)

    console.log("\nIn Chromium: Show on scroll up, Always sticky, and back, each a header drawn again\n")
    await page.setContent(pageHtml("on-scroll-up"), { waitUntil: "load" })
    await sleep(300)
    check("the bridge's run again code was found", RUN_SCRIPTS.length > 200 && /var runScripts = function/.test(RUN_SCRIPTS))
    const rounds: string[] = []
    for (const mode of ["always", "on-scroll-up", "always", "on-scroll-up", "none", "on-scroll-up"]) {
      await page.evaluate(() => scrollTo(0, 0))
      await sleep(300)
      await redraw(mode)
      await sleep(700)
      await scrollBy(1600)
      const down = await state()
      await scrollBy(-200)
      const up = await state()
      const ok = mode === "always" ? down.top === 0 && !down.hidden && up.top === 0
        : mode === "on-scroll-up" ? down.hidden && down.bottom <= 0 && !up.hidden && up.top === 0
        : down.bottom <= 0
      rounds.push(`${mode}: ${ok ? "ok" : JSON.stringify({ down, up })}`)
      check(`${mode} after the header was drawn again: ${mode === "always" ? "pinned" : mode === "none" ? "scrolls away" : "hides going down, back going up"}`, ok && down.mode === mode, { down, up })
    }

    console.log("\nIn Chromium: a change of width with the page held under the eye never hides the bar\n")
    await fresh()
    await page.setContent(pageHtml("on-scroll-up"), { waitUntil: "load" })
    await sleep(300)
    await scrollBy(1800)
    await scrollBy(-200)
    const shown = await state()
    check("scrolled into the page, a little up: the bar is shown", !shown.hidden && shown.top === 0, shown)
    /* 1280 to 1100 is full screen closing: both desktop widths, the text above wraps onto more lines and the page holds the eye by scrolling down. */
    for (const [w, label] of [[1100, "out of full screen"], [1600, "to a larger screen"], [1100, "out of it again"], [390, "to the phone"], [1280, "back to the desktop"]] as const) {
      /* As the canvas does it: its own scroll keeps the eye, the theme is not told of those scrolls. */
      await page.evaluate(() => { const w = window as unknown as { __quiet: (e: Event) => void }; w.__quiet = (e) => { if (e.target === document || e.target === window) e.stopImmediatePropagation() }; addEventListener("scroll", w.__quiet, true) })
      const eye = await page.evaluate(() => { const el = document.getElementById("shopify-section-b")!; return el.getBoundingClientRect().top })
      await page.setViewport({ width: w, height: 800 })
      await page.evaluate((at) => { const el = document.getElementById("shopify-section-b")!; window.scrollBy(0, el.getBoundingClientRect().top - at) }, eye)
      await sleep(120)
      await page.evaluate(() => removeEventListener("scroll", (window as unknown as { __quiet: () => void }).__quiet, true))
      await sleep(700)
      const after = await state()
      check(`${label}: the bar stays (the page moved under it by itself)`, !after.hidden && after.top === 0, after)
      await scrollBy(300)
      const down = await state()
      check(`${label}: then a scroll down still hides it`, down.hidden, down)
      await scrollBy(-200)
    }

    console.log("\nIn Chromium: a section resting far away keeps its height through the canvas's hold\n")
    await fresh()
    await page.setContent(pageHtml("always"), { waitUntil: "load" })
    await sleep(200)
    const heights = await page.evaluate(async (src) => {
      const far = document.getElementById("shopify-section-far")!
      const before = far.getBoundingClientRect().height
      far.setAttribute("data-sl-rest", "")
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      far.setAttribute("data-sl-far", "")
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const rested = far.getBoundingClientRect().height
      const api = new Function(src + "\nreturn { holdBelow: holdBelow, releaseNear: releaseNear };")() as { holdBelow(): void; releaseNear(all: boolean): void }
      api.holdBelow()
      const held = far.style.contentVisibility === "hidden"
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      api.releaseNear(true)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return { before, rested, held, after: far.getBoundingClientRect().height, page: document.documentElement.scrollHeight }
    }, HOLD_BELOW)
    check("the canvas's hold code was found and held the section", HOLD_BELOW.includes("var holdBelow") && heights.held, heights)
    check("rested, it keeps its height", heights.rested === heights.before, heights)
    check("held for a switch and let go, still resting, it keeps its height (was 0)", heights.after === heights.before, heights)
  } finally {
    await browser.close()
  }
}

void (async () => {
  try { await browserHalf() } catch (e) { check("the browser half ran", false, String(e).slice(0, 300)) }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})()
