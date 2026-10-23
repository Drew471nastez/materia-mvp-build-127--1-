/**
 * ===========================================================================
 *  THE CANVAS THAT DOES NOT SCROLL WHEN THE EDITOR OPENS (round 1023, part 2)
 * ===========================================================================
 * The owner, on the imported Materia theme: "when the editor opens, the
 * canvas does not scroll and has no scrollbar until I turn on the inspector
 * and click a section; then it scrolls."
 *
 * Exactly that, with nothing pressed: the real editor (the bundle of
 * scripts/editor-probe-harness.mjs) opened on the owner's store
 * (scripts/materia-store-kit.mjs over tests/fixtures/shopify-materia: the
 * announcement bar, the currency selector, the slideshow, the cookie banner,
 * "Cart drawer (live preview)"), once per thing a store theme's scripts do on
 * the first paint (SCENARIOS there), and real wheels sent over the middle of
 * the canvas with no click, no key and no selection before them:
 *
 *   FIRST     the first wheel, as soon as the page has drawn
 *   LATER     another, three seconds on (every timer of the page's has run)
 *   AGAIN     the page drawn again behind and brought forward (what a
 *             setting the page cannot take in place does), a wheel at once
 *   SCROLLBAR whether the page shows one (room to scroll, <html> not held)
 *
 * A wheel with room to scroll that moves the page less than 40px of 400 is a
 * frozen canvas. A layer the theme has open on screen (its menu, its cart)
 * is the theme's to hold, and is said, not counted.
 *
 * Round 1023 part 2, main's bundle and this round's (wheel moved of 400px,
 * first / three seconds later / first wheel on the page drawn again):
 *
 *                                   before              after
 *   plain (the store, no hold)      400 / 400 / 400     400 / 400 / 400
 *   consent (Allow Cookies hold)    0 / 400 / 0         400 / 400 / 400
 *   loader (.loader-overlay)        0 / 0 / 0           400 / 400 / 400
 *   drawer (opens itself in frame)  0 / 400 / 0         400 / 400 / 400
 *   smooth (stopped, takes wheels)  0 / 0 / 0           400 / 400 / 400
 *   backdrop (fixed picture under)  0 / 400 / 0         400 / 400 / 400
 *   banner (consent, tall banner)   0 / 0 / 0           400 / 400 / 400
 *   all four at once                0 / 0 / 0           400 / 400 / 400
 *
 *   npx tsx scripts/check-canvas-landing.mjs
 *   ONLY=<scenario,…>       only these (SCENARIOS, and "plain" for the store with none)
 *   EDITOR_BUNDLE=<file>    reuse a bundle (one from another commit, to compare)
 *   BUDGET=0                report without failing
 */
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"
import { SCENARIOS } from "./materia-store-kit.mjs"

const BUDGET = process.env.BUDGET !== "0"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

const ALL = ["plain", ...SCENARIOS, "consent,loader,drawer,smooth"]
const ONLY = process.env.ONLY ? process.env.ONLY.split(";").map((s) => s.trim()) : null

async function landing(scenario, bundle, css) {
  const compat = await importedTheme({ store: true, scenario: scenario === "plain" ? "" : scenario })
  const ed = await openEditor({ kind: "imported", bundle, css, compat, settle: 0 })
  const { page, front, js, close } = ed
  try {
    /* The first moment a wheel can reach the page: the editor's loader and the canvas's outline gone from over it. */
    await page.waitForFunction(() => {
      const l = document.querySelector(".wb-canvas-loader")
      return (!l || l.getAttribute("data-leaving") === "true") && !document.querySelector("[data-canvas-placeholder='up']")
    }, { timeout: 30_000, polling: 50 }).catch(() => {})
    await sleep(300)
    const centre = await js(() => {
      const r = document.getElementById("wb-preview-root").getBoundingClientRect()
      return { x: Math.round(r.left + r.width * 0.6), y: Math.round(r.top + r.height * 0.5) }
    })
    const state = async () => (await front())?.evaluate(() => {
      const se = document.scrollingElement || document.documentElement
      const hs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body)
      const held = hs.overflowY === "hidden" || hs.overflowY === "clip" || ((bs.overflowY === "hidden" || bs.overflowY === "clip") && hs.overflowY === "visible")
      return { y: scrollY, room: se.scrollHeight - se.clientHeight, html: hs.overflowY, body: bs.overflowY, bodyClass: document.body.className, htmlClass: document.documentElement.className, unlock: document.documentElement.getAttribute("data-sl-unlock"), bar: !held && se.scrollHeight - se.clientHeight > 2, open: !!document.querySelector("[data-md].is-open, [data-np].is-open, .cart-drawer.active") }
    }).catch(() => null)
    const wheel = async () => {
      await page.mouse.move(centre.x, centre.y)
      const a = await state()
      if (!a) return null
      if (a.y > a.room - 420) { await (await front()).evaluate(() => scrollTo(0, 0)); await sleep(100) }
      const b = await state()
      await page.mouse.wheel({ deltaY: 400 })
      await sleep(600)
      const c = await state()
      const moved = Math.round((c?.y ?? 0) - (b?.y ?? 0))
      /* Back where it was, for the next wheel. */
      await (await front()).evaluate((y) => scrollTo(0, y), b.y).catch(() => {})
      await sleep(100)
      return { moved, room: b.room, html: b.html, body: b.body, bar: b.bar, open: b.open, unlock: b.unlock, bodyClass: b.bodyClass, htmlClass: b.htmlClass }
    }
    const first = await wheel()
    await sleep(3000)
    const later = await wheel()
    /* The page drawn again (what a setting the page could not take in place did), and a wheel as soon as the new page is in front. */
    const id0 = await js(() => { const f = document.querySelector("iframe[data-compat-frame='front']"); f.__probe = 1; return true })
    void id0
    await (await front()).evaluate(() => parent.postMessage({ storelib: 1, type: "reload" }, "*")).catch(() => {})
    await page.waitForFunction(() => { const f = document.querySelector("iframe[data-compat-frame='front']"); return !!f && !f.__probe }, { timeout: 15_000, polling: 50 }).catch(() => {})
    await sleep(300)
    const reloaded = await wheel()
    const frozen = (w) => !!w && w.room > 60 && Math.abs(w.moved) < 40 && !w.open
    const say = (w) => w ? `${String(w.moved).padStart(4)}px of 400 (room ${w.room}) html ${w.html} body ${w.body}${w.unlock ? ` let go (${w.unlock})` : ""} bar ${w.bar ? "yes" : "no"}${w.open ? " OPEN" : ""}` : "(no canvas)"
    console.log(`\n  ${scenario.padEnd(30)} first ${frozen(first) ? "FROZEN" : "ok    "} ${say(first)}`)
    console.log(`  ${"".padEnd(30)} later ${frozen(later) ? "FROZEN" : "ok    "} ${say(later)}${later?.bodyClass ? `  body="${later.bodyClass}"` : ""}${/lenis/.test(later?.htmlClass ?? "") ? `  html="${later.htmlClass}"` : ""}`)
    console.log(`  ${"".padEnd(30)} drawn again ${frozen(reloaded) ? "FROZEN" : "ok    "} ${say(reloaded)}`)
    return { scenario, first, later, reloaded, frozenFirst: frozen(first), frozenLater: frozen(later), frozenReloaded: frozen(reloaded), errors: ed.errors }
  } finally {
    await close()
  }
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  console.log("LANDING: the editor opened on the Materia store, nothing pressed, real wheels over the canvas")
  const results = []
  for (const s of ALL) {
    if (ONLY && !ONLY.includes(s)) continue
    try { results.push(await landing(s, bundle, css)) } catch (e) { console.log(`  ${s}: ${String(e).slice(0, 200)}`); results.push({ scenario: s, failed: true }) }
  }
  console.log("\nBUDGETS")
  for (const r of results) {
    if (r.failed) { expect(false, `${r.scenario}: the editor opened`); continue }
    expect(!r.frozenFirst, `${r.scenario}: the first wheel scrolls the canvas`, r.first && { moved: r.first.moved, room: r.first.room })
    expect(!r.frozenLater, `${r.scenario}: a wheel later scrolls it too`, r.later && { moved: r.later.moved, room: r.later.room })
    expect(!r.frozenReloaded, `${r.scenario}: the page drawn again scrolls at its first wheel`, r.reloaded && { moved: r.reloaded.moved, room: r.reloaded.room })
    expect(!r.later || r.later.open || r.later.bar, `${r.scenario}: the page shows its scrollbar`, r.later && { html: r.later.html, body: r.later.body })
    if (r.errors?.length) console.log(`  note  ${r.scenario}: page errors ${JSON.stringify(r.errors.slice(0, 2))}`)
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
