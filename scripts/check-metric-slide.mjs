#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE CHART COMES IN FROM THE SIDE THE TAB IS ON
 * ===========================================================================
 * "When I click a tab it should slide in from the left or the right depending
 * on which one I clicked, on mobile."
 *
 * Direction is the whole claim, and it is not something a screenshot or a
 * reading of the source settles: what matters is the animation the browser is
 * actually running on the element at the moment the tab changes. So the real
 * component is mounted, the real tabs are clicked, and the keyframes are read
 * back off `element.getAnimations()`.
 *
 * WHAT THIS CAN SEE, unlike the chart's own draw-in: an Animation object
 * exists and carries its keyframes the instant it is created, with no frames
 * needing to elapse. Virtual time and a starved rAF, which is what stops
 * scripts/check-chart-skeleton.mjs watching a line grow, do not stop this.
 *
 *   node scripts/check-metric-slide.mjs
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"

const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/* From components/app/metric-slide.tsx. The test file asserts these are the
   numbers the component actually ships, so this cannot drift away from it. */
const SHIFT_PX = 28
const DURATION_MS = 320

const work = join(root, ".metric-slide-probe")
mkdirSync(work, { recursive: true })

try {
  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-metric-slide.tsx"),
    "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "probe.js")}`,
    `--alias:@=${root}`,
    "--jsx=automatic", "--log-level=error",
    '--define:process.env.NODE_ENV="production"',
  ], { cwd: root, stdio: "inherit" })

  const page = join(work, "slide.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>body{margin:0}</style>
<div id="root"></div>
<pre id="out">pending</pre>
<script src="./probe.js"></script>
<script>
const tick = () => new Promise((r) => setTimeout(r, 16))

/*
  Read the animation the component just started. getAnimations() returns it
  the moment it is created, and getKeyframes() gives the offsets it was built
  from — so the direction is the sign of the x it starts at, in pixels, not an
  inference from anything.
*/
function slideOf() {
  const node = document.querySelector("[data-metric-slide]")
  const anims = node.getAnimations()
  if (!anims.length) return { running: false, node: !!node, overflow: node.style.overflow }
  const a = anims[anims.length - 1]
  const frames = a.effect.getKeyframes()
  const first = frames[0] ?? {}
  const last = frames[frames.length - 1] ?? {}
  const x = /translate3d\\((-?[\\d.]+)px/.exec(first.transform ?? "")
  const timing = a.effect.getTiming()
  return {
    running: true,
    startsAtX: x ? Number(x[1]) : null,
    startsInvisible: String(first.opacity) === "0",
    endsInPlace: /translate3d\\(0(px)?, 0(px)?, 0(px)?\\)/.test(last.transform ?? "") && String(last.opacity) === "1",
    duration: timing.duration,
    easing: timing.easing,
    /* transform and opacity only: anything else here is a layout per frame. */
    properties: [...new Set(frames.flatMap((f) => Object.keys(f)).filter((k) => k !== "offset" && k !== "composite" && k !== "computedOffset" && k !== "easing"))].sort(),
    /* Clipped while it moves, so the offset chart cannot widen the page. */
    overflow: node.style.overflow,
  }
}

const press = async (name) => {
  /*
    Cleared first. An animation whose timeline never advances stays listed for
    ever here, so without this the reading for a tap that starts NOTHING is
    the previous tap's animation, still sitting there — a probe that can never
    see the one case it is asked about.
  */
  document.querySelector("[data-metric-slide]").getAnimations().forEach((a) => a.cancel())
  document.getElementById("tab-" + name).click()
  /*
    One tick, because React commits the click's render after the handler
    returns: reading straight after click() reports the PREVIOUS tap's
    animation, which is a probe measuring the wrong thing and passing.
  */
  await tick()
  const s = slideOf()
  /*
    Then time is allowed to pass. The animation itself will not progress here
    — no compositor, so its timeline never advances and its finish event
    never fires — but the clip is given back on a TIMER precisely so that it
    does not depend on that, and a timer does advance under virtual time.
  */
  const node = document.querySelector("[data-metric-slide]")
  await new Promise((r) => setTimeout(r, ${DURATION_MS + 120}))
  s.overflowAfter = node.style.overflow
  return s
}

async function measure() {
  const out = {}
  /* Rightwards along the strip, one tab and then two at once. */
  out.toRevenue = await press("revenue")
  out.toConversion = await press("conversion")
  /* And back leftwards. */
  out.backToOrders = await press("orders")
  out.backToViews = await press("views")
  /* The same tab again is not a move. */
  out.sameAgain = await press("views")
  document.getElementById("out").textContent = JSON.stringify(out)
}
addEventListener("load", () => setTimeout(measure, 300))
</script>`)

  const run = (width, extra = []) => {
    const dom = execFileSync(CHROMIUM, [
      "--headless=new", "--no-sandbox", "--disable-gpu", `--window-size=${width},760`,
      "--virtual-time-budget=9000", "--dump-dom", ...extra, `file://${page}`,
    ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
    const match = dom.match(/<pre id="out">([^<]*)</)
    if (!match || match[1] === "pending") fail(`Nothing reported at ${width}px.`)
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  }

  const phone = run(390)
  /* A desktop, where the strip is a row of columns with a highlight on the
     active one and paging is not the affordance. */
  const desktop = run(1280)
  /* And somebody who has asked for less movement. */
  const calm = run(390, ["--force-prefers-reduced-motion"])

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  console.log("\nA 390px phone, tapping along the strip\n")
  for (const [label, s] of Object.entries(phone)) {
    console.log(`  ${label.padEnd(14)} ${s.running ? `starts at x=${s.startsAtX}px, ${s.duration}ms, clipped: ${s.overflow || "no"}` : "no animation"}`)
  }
  console.log("")

  expect(phone.toRevenue.running, "a tab to the right animates the chart", "nothing ran")
  expect(phone.toRevenue.startsAtX === SHIFT_PX, `and it starts ${SHIFT_PX}px to the RIGHT of its place`, phone.toRevenue.startsAtX)
  expect(phone.toConversion.startsAtX === SHIFT_PX, "two tabs to the right is the same direction, not twice the distance", phone.toConversion.startsAtX)
  expect(phone.backToOrders.startsAtX === -SHIFT_PX, `a tab to the left starts ${SHIFT_PX}px to the LEFT`, phone.backToOrders.startsAtX)
  expect(phone.backToViews.startsAtX === -SHIFT_PX, "and so does one further left again", phone.backToViews.startsAtX)
  expect(!phone.sameAgain.running, "tapping the tab you are already on does nothing", "it animated anyway")

  expect(phone.toRevenue.startsInvisible && phone.toRevenue.endsInPlace,
    "it fades in as it arrives, and ends exactly in place",
    JSON.stringify({ from: phone.toRevenue.startsInvisible, to: phone.toRevenue.endsInPlace }))
  expect(
    JSON.stringify(phone.toRevenue.properties) === JSON.stringify(["opacity", "transform"]),
    "on transform and opacity only, which is the compositor's own pair",
    JSON.stringify(phone.toRevenue.properties),
  )
  expect(phone.toRevenue.duration === DURATION_MS, `over ${DURATION_MS}ms`, phone.toRevenue.duration)
  expect(/cubic-bezier/.test(phone.toRevenue.easing), "on a curve rather than linearly", phone.toRevenue.easing)
  expect(phone.toRevenue.overflow === "hidden", "clipped while it moves, so it cannot widen the page", phone.toRevenue.overflow)
  expect(phone.toRevenue.overflowAfter === "", "and the clip is given back when it lands", `overflow left as ${phone.toRevenue.overflowAfter}`)
  expect(phone.backToViews.overflowAfter === "", "on every move, not only the first", `overflow left as ${phone.backToViews.overflowAfter}`)

  console.log("\nA 1280px desktop, and a phone with reduced motion\n")
  expect(!desktop.toRevenue.running, "a desktop does not page: the strip is a row of columns there", "it slid anyway")
  expect(!calm.toRevenue.running, "and nothing moves for somebody who asked for less motion", "it slid anyway")

  console.log(`\n${broken === 0 ? "The chart arrives from the side its tab is on." : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
