/**
 * ===========================================================================
 *  ROUND 14: SCROLLING THE CANVAS WITH THE OWNER'S REAL THEME
 * ===========================================================================
 * The owner: "Scroll in the canvas still bugs, still freezes, still laggy."
 * Measured with scripts/check-wb-scroll-r14.mjs on the real Materia theme
 * (scripts/materia-live-kit.mjs: the public pages of andrewrullz.storelib.com
 * made into a theme for the canvas), against the same page live:
 *
 *   every write to an outline box restyled the theme's page from <body>
 *   down (its :has() rules read [style]): 18ms a write, 2.4s of the bridge's
 *   own script in a 13s scroll at 1x; now the builder's boxes, strip and
 *   marks are in a shadow root (0.02ms a write)
 *   the outlines were read before the frame was laid out, the inserter
 *   measured every section every frame, the selection's box was React state
 *   every frame, the page's scroll was a message every frame, the section
 *   library's cards and the canvas's pictures were warmed in the middle of a
 *   scroll
 *   a section far from the screen rests (content-visibility: hidden at the
 *   size it had), so the theme's whole-page restyles leave it out
 *
 * The bridge is run in Chromium below when one is installed; the rest is
 * held to its source.
 *
 * Run with:  npx tsx tests/wb-scroll-r14.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { SCROLL_REST_MS } from "../lib/website-builder/scroll-rest"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const canvas = read("components/website-builder/compat/compat-canvas.tsx")
const preview = read("components/website-builder/compat/compat-section-preview.tsx")
const bridge = CANVAS_BRIDGE

console.log("\nTHE BUILDER'S OWN LAYER, OUT OF THE THEME'S SIGHT")
{
  check("one host, a [data-sl-box] drawn as its contents, with a shadow root", /layerHost\.setAttribute\("data-sl-box", "layer"\);/.test(bridge) && /layerHost\.style\.cssText = "display:contents;pointer-events:auto";/.test(bridge) && /layerHost\.attachShadow\(\{ mode: "open" \}\)/.test(bridge))
  check("  the boxes, the Add section strip and the layout mark are put in it", /layer\(\)\.appendChild\(b\);/.test(bridge) && /layer\(\)\.appendChild\(adder\);/.test(bridge) && /layer\(\)\.appendChild\(lateEl\);/.test(bridge))
  check("  their rules go with them", /own\.textContent = css\.textContent \+ \(addCss \? addCss\.textContent : ""\);/.test(bridge))
  check("  a point over the strip is the host to the page's hit tests", /adder\.contains\(hit\) \|\| hit === layerHost/.test(bridge))
}

console.log("\nTHE OUTLINES, READ ONCE THE FRAME IS LAID OUT")
{
  check("read in a ResizeObserver's callback (after layout), asked for by a mark resized once a frame", /var afterLayout = function \(fn\)/.test(bridge) && /if \(!lateFns\.length\) \{ lateWide = !lateWide;/.test(bridge))
  check("  the outlines, the toolbar's box and a burst's ticks", /afterLayout\(drawBoxes\)/.test(bridge) && /afterLayout\(function \(\) \{ if \(boxFrame\) report\(\); \}\)/.test(bridge) && /afterLayout\(tick\)/.test(bridge))
  check("  every element measured before any box is written", /var b = visibleRect\(blk, -2\);\s*var seen = b \? null : visibleRect\(sec, 0\);[\s\S]{0,500}place\(boxes\.hover, hv\);/.test(bridge))
  check("  where a box landed is read back only once the page is still, one for all", /if \(!streamingOn\) landed\(/.test(bridge))
  check("still only after two frames with nothing new (a slow frame is not a stop)", /requestAnimationFrame\(function \(\) \{ requestAnimationFrame\(function \(\) \{\s*if \(streamingUntil !== at\) return;/.test(bridge))
}

console.log("\nNOTHING MEASURED OR SAID FOR EVERY FRAME OF A SCROLL")
{
  check("the Add section strip goes while the page moves and is found again once it stops", /addEventListener\("scroll", function \(\) \{ if \(addFrame\) \{ cancelAnimationFrame\(addFrame\); addFrame = 0; \} if \(gapShown\) showGap\(null\); \}, \{ passive: true \}\);/.test(bridge) && /afterScroll = function \(\) \{ if \(addAt && !addFrame\) addFrame = requestAnimationFrame\(placeAdder\); \};/.test(bridge))
  const heartbeat = Number(/t - scrollingSaid > (\d+)/.exec(bridge)?.[1])
  check("the final offset waits 100ms, and the bounded heartbeat keeps the parent gesture alive", /scrolledTimer = setTimeout\(function \(\) \{ post\(\{ type: "scrolled", scrollY: scrollY \}\); \}, 100\);/.test(bridge) && heartbeat > 0 && heartbeat < SCROLL_REST_MS)
  check("a wheel reads the page's hold only when <html> or <body> changed, or after a second", /lockDirty = true;/.test(bridge) && /lockSeen === null \|\| lockDirty \|\| t0 - lockSeen > 1000/.test(bridge))
  check("  and looks for a scroller of its own only for a wheel the theme took", /if \(!e\.defaultPrevented \|\| takesWheel\(e\.target, dy\)\) return;/.test(bridge))
  /* In the head's own script (CANVAS_SWITCH), not the bridge's. */
  const bridgeFile = read("lib/storelib-theme/compat/canvas-bridge.ts")
  check("the pictures are not warmed while the page is scrolled", /var stillPage = function \(\) \{ return now\(\) - scrolledAt > 1500; \};/.test(bridgeFile) && /if \(stillPage\(\)\) warm\(false, true\);/.test(bridgeFile))
  check("  and their preloads coming and going are not the page changing (no outline burst)", /mine\(r\.addedNodes\) && mine\(r\.removedNodes\)/.test(bridge) && /n\.hasAttribute\("data-sl-warm"\)/.test(bridge))
  check("the selected section's box moved by hand, a render only for another section", /ghostNow\.current = next/.test(canvas) && /if \(was && next && was\.id === next\.id && ghostEl\.current\) \{\s*placeGhost\(ghostEl\.current\)/.test(canvas) && /<div ref=\{placeGhost\}/.test(canvas))
  check("  the editor told once a frame, however many boxes came in it", /ghostTold\.current = requestAnimationFrame/.test(canvas))
  check("the section library waits while the canvas is in use (its input never reaches the editor's window)", /window\.addEventListener\("storelib:canvas-input"/.test(preview) && /CANVAS_QUIET_MS - \(performance\.now\(\) - lastCanvasInput\)/.test(preview) && /m\.type === "scrolling" && isFront/.test(canvas))
}

console.log("\nA STORELIB THEME'S CANVAS: NOTHING MEASURED PER SCROLL FRAME")
{
  const insert = read("components/website-builder/editor/canvas-block-insert.tsx")
  const hover = read("components/website-builder/canvas-hover.tsx")
  check("the Add a block strip goes while the canvas scrolls and is placed 150ms after it stops", /show\(null\)\s*window\.clearTimeout\(settle\)\s*settle = window\.setTimeout\(\(\) => \{[\s\S]{0,200}document\.elementFromPoint\(at\.x, at\.y\)[\s\S]{0,40}\}, 150\)/.test(insert))
  check("the hover marks are taken off once while it scrolls (no render a frame), and measured 150ms after", /if \(drawnFor\) \{ drawnFor = null; setBox\(null\) \}/.test(hover) && /settle = window\.setTimeout\(\(\) => \{[\s\S]{0,200}schedule\(\)\s*\}, 150\)/.test(hover))
}

console.log("\nA SECTION FAR FROM THE SCREEN RESTS")
{
  check("content-visibility: hidden a screen and a half away, at the size it had", /\[data-sl-rest\]\{contain-intrinsic-size:auto none\}\[data-sl-rest\]\[data-sl-far\]\{content-visibility:hidden\}/.test(bridge) && /rootMargin: "150% 0px 150% 0px"/.test(bridge))
  check("  never a group's section, nor one with anything fixed or sticky in it", /shopify-section-group-/.test(bridge) && /if \(p === "fixed" \|\| p === "sticky"\) return false;/.test(bridge))
  check("  marked by attribute, watched again when a section is drawn again", /farWatch\(el\);/.test(bridge) && /farIO\.unobserve\(farOn\[id\]\)/.test(bridge))
  check("  with the browser's own observer, not the one the theme's are counted by", /var IO = window\.__slIO \|\| window\.IntersectionObserver;/.test(bridge))
}

console.log("\nTHE PROBE AND ITS THEME")
{
  check("the probe scrolls the real theme, in the editor and live, desktop wheel and phone fling, 1x and 4x", existsSync("scripts/check-wb-scroll-r14.mjs") && /materiaLive/.test(read("scripts/check-wb-scroll-r14.mjs")) && /dispatchTouchEvent/.test(read("scripts/check-wb-scroll-r14.mjs")))
  check("  budgets: dropped frames under 5% and the longest frame under 50ms at 1x, messages never one a frame, the canvas laid out as live", /droppedPct < 5/.test(read("scripts/check-wb-scroll-r14.mjs")) && /r\.longest < 50/.test(read("scripts/check-wb-scroll-r14.mjs")) && /lays the page out as the live page does/.test(read("scripts/check-wb-scroll-r14.mjs")))
  check("the theme is made from the public pages only (nothing logged in to)", /https:\/\/andrewrullz\.storelib\.com/.test(read("scripts/materia-live-kit.mjs")) && !/cookie|authorization/i.test(read("scripts/materia-live-kit.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))
  check("the theme's own costs are written up for its author", existsSync("docs/theme-contracts/materia-scroll-performance.md"))
}

async function inBrowser() {
  const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium"
  if (!existsSync(chrome)) {
    console.log("  --    no Chromium here: the bridge is held to its source only")
    return
  }
  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 600 })
    const section = (id: string, inner: string) => `<div class="shopify-section" id="shopify-section-${id}" data-section-id="${id}">${inner}</div>`
    /* A theme with a :has() rule that reads [style], as the owner's does, and a section with a bar fixed to the screen. */
    await page.setContent(`<!doctype html><html><head><style>.x:has([style*="nothing"]) { color: red }</style></head><body style="margin:0;font:16px sans-serif">
      ${section("hero", `<div class="x" style="height:500px;background:#cde">Hero</div>`)}
      ${Array.from({ length: 8 }, (_, i) => section(`s${i}`, `<div class="x" style="height:700px;background:${i % 2 ? "#eee" : "#ddd"}">Section ${i}</div>`)).join("")}
      ${section("bar", `<div style="height:300px">Bar section<div style="position:fixed;bottom:0;left:0;right:0;height:40px;background:#111"></div></div>`)}
      ${section("tail", `<div style="height:600px">Tail</div>`)}
      <script>
        window.__msgs = [];
        addEventListener("message", function (e) { if (e.data && e.data.storelib === 1) window.__msgs.push(e.data.type) });
        window.__slInspect = true;
        ${CANVAS_BRIDGE}
      </script></body></html>`)
    await page.evaluate(() => dispatchEvent(new Event("load")))
    const send = (m: Record<string, unknown>) => page.evaluate((x) => window.postMessage({ storelib: 1, ...x }, "*"), m)
    await send({ type: "select", sectionId: "hero", blockId: null, inspect: true, scroll: false })
    await wait(300)
    const layer = await page.evaluate(() => {
      const host = document.querySelector("[data-sl-box=layer]") as HTMLElement | null
      const box = host?.shadowRoot?.querySelector<HTMLElement>("[data-sl-box=section]")
      return { host: !!host, inShadow: !!box, light: document.querySelectorAll("[data-sl-box=section]").length, display: box ? getComputedStyle(box).display : null, top: box?.getBoundingClientRect().top }
    })
    check("the selected section's outline is drawn, from inside the shadow root", layer.host && layer.inShadow && layer.light === 0 && layer.display === "block", layer)
    /* Twenty scrolls, a frame apart. */
    const beganScroll = Date.now()
    await page.evaluate(() => { (window as unknown as { __msgs: string[] }).__msgs.length = 0 })
    for (let i = 1; i <= 20; i++) { await page.evaluate((y) => scrollTo(0, y), i * 10); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null)))) }
    const during = await page.evaluate(() => {
      const box = document.querySelector("[data-sl-box=layer]")!.shadowRoot!.querySelector<HTMLElement>("[data-sl-box=section]")!
      return { top: box.getBoundingClientRect().top, hero: document.getElementById("shopify-section-hero")!.getBoundingClientRect().top }
    })
    check("  it follows the section while the page scrolls", Math.abs(during.top - Math.max(0, during.hero)) <= 1, during)
    await wait(400)
    const msgs = await page.evaluate(() => (window as unknown as { __msgs: string[] }).__msgs.slice())
    const count = (t: string) => msgs.filter((m) => m === t).length
    check("  twenty scroll frames: one final offset and bounded heartbeats, never a message each frame", count("scrolled") === 1 && count("scrolling") > 1 && count("scrolling") < 20 && count("scrolling") <= Math.ceil((Date.now() - beganScroll) / 60) + 1, msgs)
    /* A write to a box costs what a write to nothing costs, whatever the theme's rules. */
    const cost = await page.evaluate(() => {
      const box = document.querySelector("[data-sl-box=layer]")!.shadowRoot!.querySelector<HTMLElement>("[data-sl-box=hover]")!
      const light = document.createElement("div"); document.body.appendChild(light)
      let n = 0
      const mo = new MutationObserver((l) => { n += l.length }); mo.observe(document.body, { attributes: true, subtree: true })
      box.style.top = "3px"; light.style.top = "3px"
      return new Promise<number>((r) => setTimeout(() => { mo.disconnect(); r(n) }, 0))
    })
    check("  a page's observer on <body> hears nothing of the boxes being moved", cost === 1, cost)

    /* Far sections rest, a second and a half after the page has loaded and when it has a moment. */
    await page.evaluate(() => scrollTo(0, 0))
    await wait(2600)
    const rest = await page.evaluate(() => ({
      far: [...document.querySelectorAll("[data-sl-far]")].map((s) => s.id.replace("shopify-section-", "")),
      rest: [...document.querySelectorAll("[data-sl-rest]")].map((s) => s.id.replace("shopify-section-", "")),
      h: document.documentElement.scrollHeight,
    }))
    check("sections far below the screen rest; the one on screen does not", rest.far.includes("s5") && rest.far.includes("tail") && !rest.far.includes("hero") && !rest.far.includes("s0"), rest)
    check("  never the section with a bar fixed to the screen", !rest.rest.includes("bar") && !rest.far.includes("bar"), rest)
    const h0 = await page.evaluate(() => document.body.scrollHeight)
    check("  the page keeps its height", h0 === 500 + 8 * 700 + 300 + 600, h0)
    await page.evaluate(() => scrollTo(0, document.getElementById("shopify-section-s6")!.offsetTop))
    await wait(300)
    const near = await page.evaluate(() => ({ s6: document.getElementById("shopify-section-s6")!.hasAttribute("data-sl-far"), hero: document.getElementById("shopify-section-hero")!.hasAttribute("data-sl-far"), text: document.getElementById("shopify-section-s6")!.getBoundingClientRect().height }))
    check("  scrolled to, it is drawn again at its own size, and the one left far behind rests", !near.s6 && near.hero && near.text === 700, near)
  } finally {
    await browser.close()
  }
}

async function main() {
  await inBrowser()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
