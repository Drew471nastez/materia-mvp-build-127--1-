#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE METRIC STRIP FOLLOWS THE TAB
 * ===========================================================================
 * Four tabs above each chart, in a row that scrolls sideways on a phone.
 *
 * IT DID NOT FOLLOW. The fourth tab is off the edge, so tapping along the row
 * left the tab just chosen half out of sight. What has to be true is where
 * the row ENDS UP, in pixels, after each tap: the chosen tab fully in view,
 * the edge of the next one showing, and no movement when there was nothing to
 * reveal. Driven against the real hook on a strip with the product's widths.
 *
 * Whose a swipe on the row is, the row's or the page's, is the browser's call
 * now, and it is measured with real touch input on the real pages by
 * scripts/check-metric-tabs-gesture.mjs. TouchEvent objects dispatched from
 * script, which this probe used to send, never scroll anything, so they could
 * only ever measure a hand written gesture handler.
 *
 * WHAT IS MEASURED, AND HOW. The strip is scrolled with the browser's own
 * smooth scrolling, and a smooth scroll needs frames that headless Chromium
 * under virtual time never gives it — scrollLeft simply stays where it was.
 * So these runs force a reduced-motion preference, where the hook asks for
 * the same scroll instantly: the TARGET is what is under test here, and it is
 * computed by the same lines either way. That the request is a smooth one
 * when motion is allowed is a single word in the source, pinned in
 * tests/tab-strip.test.ts.
 *
 *   node scripts/check-tab-strip.mjs
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"

const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/* From components/app/use-tab-strip.ts; the test asserts they still match. */
const PEEK_PX = 40

const work = join(root, ".tab-strip-probe")
mkdirSync(work, { recursive: true })

try {
  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-tab-strip.tsx"),
    "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "probe.js")}`,
    `--alias:@=${root}`,
    "--jsx=automatic", "--log-level=error",
    '--define:process.env.NODE_ENV="production"',
  ], { cwd: root, stdio: "inherit" })

  const page = join(work, "strip.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0 }
  #strip::-webkit-scrollbar { display: none }
  /* Wrapped, or the report itself is wider than the window and the strip
     inherits that width instead of the viewport's. */
  #out { white-space: pre-wrap; word-break: break-all }
</style>
<div id="root"></div>
<pre id="out">pending</pre>
<script src="./probe.js"></script>
<script>
const tick = () => new Promise((r) => setTimeout(r, 16))

const strip = () => document.getElementById("strip")

/*
  Where a tab sits relative to what can be seen, once the strip has settled.
  Negative means it is off the left edge, positive past the right one.
*/
function placeOf(name) {
  const s = strip()
  const tab = s.querySelector('[data-tab="' + name + '"]')
  const left = tab.offsetLeft - s.scrollLeft
  const right = left + tab.offsetWidth
  return { left: Math.round(left), right: Math.round(right), clipped: left < -1 || right > s.clientWidth + 1 }
}

const press = async (name) => {
  const before = strip().scrollLeft
  strip().querySelector('[data-tab="' + name + '"]').click()
  /*
    React commits the click's render after the handler returns, and the smooth
    scroll then runs on its own. Under virtual time it is fast-forwarded, so a
    generous wait lands on the settled position rather than partway through.
  */
  await tick()
  await new Promise((r) => setTimeout(r, 700))
  const s2 = strip()
  const chosen = placeOf(name)
  /* What of the NEXT tab along is showing, which is the point of the peek. */
  const order = ["views", "revenue", "orders", "conversion"]
  const i = order.indexOf(name)
  const after = order[i + 1] ? placeOf(order[i + 1]) : null
  const prior = order[i - 1] ? placeOf(order[i - 1]) : null
  return {
    scrollLeft: Math.round(s2.scrollLeft),
    moved: Math.round(s2.scrollLeft - before),
    chosen,
    nextVisible: after ? Math.max(0, Math.min(after.right, s2.clientWidth) - Math.max(after.left, 0)) : null,
    priorVisible: prior ? Math.max(0, Math.min(prior.right, s2.clientWidth) - Math.max(prior.left, 0)) : null,
  }
}

async function measure() {
  const s = strip()
  const out = { overflowing: s.scrollWidth > s.clientWidth, scrollWidth: s.scrollWidth, clientWidth: s.clientWidth }
  out.toRevenue = await press("revenue")
  out.toOrders = await press("orders")
  out.toConversion = await press("conversion")
  out.backToViews = await press("views")
  /* And the tab already chosen, which has nothing to reveal. */
  out.sameAgain = await press("views")

  document.getElementById("out").textContent = JSON.stringify(out)
}
addEventListener("load", () => setTimeout(measure, 300))
</script>`)

  const run = (width, extra = []) => {
    const dom = execFileSync(CHROMIUM, [
      "--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${width},760`,
      "--virtual-time-budget=20000", "--dump-dom", ...extra, `file://${page}`,
    ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
    const match = dom.match(/<pre id="out">([^<]*)</)
    if (!match || match[1] === "pending") fail(`Nothing reported at ${width}px.`)
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  }

  /* See the note at the top: instant, so the settled position can be read. */
  const phone = run(430, ["--force-prefers-reduced-motion"])

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  console.log(`\nFour tabs of 130px in a ${phone.clientWidth}px strip, ${phone.scrollWidth}px of row\n`)
  for (const [label, r] of Object.entries(phone)) {
    if (typeof r !== "object" || r === null || !r.chosen) continue
    console.log(`  ${label.padEnd(14)} scrollLeft ${String(r.scrollLeft).padStart(3)} (moved ${String(r.moved).padStart(4)})   chosen ${r.chosen.left}..${r.chosen.right}${r.chosen.clipped ? "  <-- CLIPPED" : ""}   next showing ${r.nextVisible ?? "-"}px`)
  }
  console.log("")

  expect(phone.overflowing, "the row really is wider than the strip, or there is nothing to test",
    `${phone.scrollWidth} in ${phone.clientWidth}`)

  /* ── the tab you chose is fully in view ──────────────────────────────── */
  for (const [label, r] of [["revenue", phone.toRevenue], ["orders", phone.toOrders], ["conversion", phone.toConversion], ["views", phone.backToViews]]) {
    expect(!r.chosen.clipped, `choosing ${label} leaves it fully in view`, `it sits at ${r.chosen.left}..${r.chosen.right}`)
  }

  /* ── and the next one along is showing ───────────────────────────────── */
  expect(phone.toRevenue.nextVisible >= PEEK_PX - 1,
    `with at least ${PEEK_PX}px of the tab after it showing, so there is somewhere to go`,
    `${phone.toRevenue.nextVisible}px of the next tab`)
  expect(phone.toOrders.nextVisible >= PEEK_PX - 1,
    "the same one tab further along",
    `${phone.toOrders.nextVisible}px of the next tab`)
  expect(phone.backToViews.priorVisible === 0 || phone.backToViews.chosen.left >= 0,
    "and coming back left, the first tab is reached rather than half shown",
    `views sits at ${phone.backToViews.chosen.left}`)

  /* ── it moves the right way, and only as far as it must ──────────────── */
  /*
    ONLY AS FAR AS IT HAS TO. On a strip this wide, choosing Revenue reveals
    nothing that was hidden — it and the edge of Orders are already there — so
    the right answer is not to move at all. What must never happen is moving
    the WRONG WAY, and what must happen is moving when something really is off
    the edge, which is what Conversion is.
  */
  expect(
    phone.toRevenue.moved >= 0 && phone.toOrders.moved >= 0 && phone.toConversion.moved >= 0,
    "moving right never scrolls the row the other way",
    `${phone.toRevenue.moved}, ${phone.toOrders.moved}, ${phone.toConversion.moved}`,
  )
  expect(phone.toConversion.moved > 0, "and it does move when the tab chosen is off the edge", phone.toConversion.moved)
  expect(phone.backToViews.moved < 0, "coming back left brings the row back", phone.backToViews.moved)
  expect(phone.toConversion.scrollLeft === phone.scrollWidth - phone.clientWidth,
    "the last tab lands at the end of the row, not past it",
    `${phone.toConversion.scrollLeft} of ${phone.scrollWidth - phone.clientWidth}`)
  expect(phone.sameAgain.moved === 0, "and the tab already chosen moves the row not at all", phone.sameAgain.moved)

  /* ── where nothing is hidden, nothing happens ────────────────────────── */
  const wide = run(1400, ["--force-prefers-reduced-motion"])
  expect(!wide.overflowing, "on a wide screen the row fits, so there is nothing to reveal",
    `${wide.scrollWidth} in ${wide.clientWidth}`)
  expect(wide.toRevenue.moved === 0 && wide.toConversion.moved === 0,
    "and the strip is left alone, without naming a breakpoint to do it",
    `${wide.toRevenue.moved} and ${wide.toConversion.moved}`)

  console.log(`\n${broken === 0 ? "The strip follows the tab you chose." : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
