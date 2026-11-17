/**
 * ===========================================================================
 *  THE HOME PAGE'S LAZY SECTIONS, MEASURED (landing round)
 * ===========================================================================
 * Every lazily loaded section of the home page is an empty box until its
 * code arrives (components/marketing/home/lazy-section.tsx). The box has to
 * be as tall as the section, or the page changes length when it mounts.
 * LAZY_SECTION_HEIGHTS_CSS (components/marketing/home/lazy-sections.tsx)
 * says how tall, per section and screen width. This script writes it.
 *
 * It opens the home page of a running PRODUCTION build in a real browser at
 * the widths below (the common phones and laptops, and both sides of every
 * width where a layout changes), reads each box before its section mounts,
 * walks to the foot of the page so every section mounts, and reads each
 * section's real height. Between two measured widths a section's height is
 * taken as a straight line; a rule is written only where the line changes.
 *
 *   pnpm build && pnpm start -p 3215
 *   node scripts/measure-home-lazy-heights.mjs http://localhost:3215            how far off each box is now
 *   node scripts/measure-home-lazy-heights.mjs http://localhost:3215 --write    write the measured rules
 *
 * Run it again whenever a section's height changes, then build and run it
 * once more without --write: every box should be within 2px of its section.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")

const FILE = "components/marketing/home/lazy-sections.tsx"
/** Both sides of 640, 768, 900, 1024, 1180, 1280 and 1536 (where the sections' layouts change), and the usual phones and laptops. */
const WIDTHS = [360, 390, 430, 639, 640, 767, 768, 899, 900, 1023, 1024, 1179, 1180, 1279, 1280, 1440, 1535, 1536, 1920, 2560]
const HEIGHT = 900
/**
 * A section whose height follows the screen's height too (a pinned scroll
 * track): that part, as the section's own CSS writes it, and its sum in vh,
 * per range of widths (`until` is the widest width a range covers; the last
 * range has none). Use the section's own unit: svh where its track is in svh,
 * so a phone's toolbar does not put the box off. Checked against a shorter
 * screen at 390 and 1440 on every run.
 */
const TRACKS = {
  /* Landing round 5: the held stage (100svh) and its 80svh, less the cards pulled up over it: 125svh, measured. */
  /* Landing round 9: the stage held 100svh plus its dwell, less the cards pulled up over it: 153svh at every width, measured at 390 and 1440. */
  /* Landing round 10: the track now holds the stage and the cards together, so the held part differs: 153svh on phones (cards in a row), 241svh from 900px (the 2x2 grid under the held stage), measured at 390 and 1440. */
  /* Landing round 11: the phone shrinks under the heading before the cards, and on phones the cards stack: 153svh on phones, 241svh from 900px, measured at 390 and 1440. */
  /* Landing round 14: under 900px nothing is held: the stage (100svh), less the cards' lap (8svh), plus their top padding (10vh): 101vh, measured at 390. */
  /* Landing round 15: under 900px the stage is held again (100svh); from 900px the hold before the cards is 20svh shorter (221svh). */
  /* Landing round 15: the phone stage is held under the header (100svh less the header, plus the cards' 9vh), measured 109 per 100 at 390; from 900px the phone rises over a shorter range, 221svh, measured at 1440. */
  /* Landing round 16: the stage is held at every width and the cards start 40svh after it (they were 0 on a phone, 24svh on a computer): 149 per 100 at 390, 237 at 1440, measured. */
  checkout: [{ css: "140svh + 9vh", vh: 149, until: 899 }, { css: "237svh", vh: 237 }],
}
const trackAt = (n, w) => TRACKS[n]?.find((t) => t.until == null || w <= t.until)
/** A line that predicts a measured height within this many pixels is kept; past it a new rule starts. */
const TOLERANCE = 2

const base = (process.argv[2] ?? "").replace(/\/+$/, "")
const write = process.argv.includes("--write")
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/measure-home-lazy-heights.mjs http://localhost:3215 [--write]")
  process.exit(1)
}

const source = readFileSync(FILE, "utf8")
/** The sections that have a box: every lazySection() whose minHeight reads --lz. */
const NAMES = [...source.matchAll(/name: "([^"]+)"[\s\S]*?minHeight: "([^"]+)"/g)].filter((m) => m[2].startsWith("var(--lz")).map((m) => m[1])
if (!NAMES.length) throw new Error(`no lazy section with a var(--lz) box found in ${FILE}`)

async function measure(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" })
  /* The boxes, before anything mounts: what the rules in the page now say. */
  const boxes = await page.evaluate(
    (names) => Object.fromEntries(names.map((n) => { const el = document.querySelector(`[data-lazy-section="${n}"]`); return [n, el && !el.childElementCount ? parseFloat(getComputedStyle(el).minHeight) : null] })),
    NAMES,
  )
  await page.waitForLoadState("networkidle")
  for (let y = 0, foot = 1; y < foot; y += 600) {
    foot = await page.evaluate((to) => { window.scrollTo(0, to); return document.documentElement.scrollHeight - window.innerHeight }, y)
    await page.waitForTimeout(70)
  }
  await page.waitForTimeout(1200)
  /* offsetHeight: the laid out height, whatever transform a band or a reveal has on it at this moment. */
  const real = await page.evaluate(
    (names) => Object.fromEntries(names.map((n) => { const el = document.querySelector(`[data-lazy-section="${n}"]`); return [n, el?.firstElementChild ? el.firstElementChild.offsetHeight : null] })),
    NAMES,
  )
  await context.close()
  const missing = NAMES.filter((n) => real[n] == null)
  if (missing.length) throw new Error(`at ${width}px these sections did not mount: ${missing.join(", ")}`)
  return { boxes, real }
}

const browser = await chromium.launch()
const at = {}
try {
  for (const w of WIDTHS) {
    at[w] = await measure(browser, w, HEIGHT)
    const off = NAMES.map((n) => (at[w].boxes[n] == null ? 0 : Math.abs(at[w].boxes[n] - at[w].real[n])))
    const worst = Math.max(...off)
    console.log(`${String(w).padStart(5)}px  boxes now off by at most ${Math.round(worst)}px${worst > TOLERANCE ? `  (${NAMES[off.indexOf(worst)]})` : ""}`)
  }
  /* The part that follows the screen's height: measured on a shorter screen and compared with TRACKS. */
  for (const w of [390, 1440]) {
    const short = await measure(browser, w, HEIGHT - 200)
    for (const n of NAMES) {
      const vh = ((at[w].real[n] - short.real[n]) / 200) * 100
      const said = trackAt(n, w)?.vh ?? 0
      /* Landing round 10: sections whose pictures are capped by the screen's height (min(..., Nsvh)) grow with it only on short screens, which a line in vh cannot say; their boxes are measured at HEIGHT and mount screens ahead, so that is a note, not a stop. A section in TRACKS must still match. */
      if (Math.abs(vh - said) > 2) {
        const message = `${n} at ${w}px grows ${vh.toFixed(1)}vh with the screen's height, TRACKS says ${said}`
        if (TRACKS[n]) throw new Error(`${message}: update TRACKS in this script`)
        console.warn(`note: ${message} (capped by the screen's height on short screens)`)
      }
    }
  }
} finally {
  await browser.close()
}

/** A section's height at one width without the part that follows the screen's height. */
const fixed = (n, w) => at[w].real[n] - ((trackAt(n, w)?.vh ?? 0) * HEIGHT) / 100
const lineThrough = (n, a, b) => {
  const slope = (fixed(n, b) - fixed(n, a)) / (b - a)
  return { slope, px: fixed(n, a) - slope * a }
}
const valueOf = (line, w) => line.px + line.slope * w
function write1(n, line, w) {
  const track = trackAt(n, w)
  const terms = []
  if (track) terms.push(track.css)
  const px = Number(line.px.toFixed(1))
  const vw = Number((line.slope * 100).toFixed(3))
  if (px || !vw) terms.push(`${px}px`)
  if (vw) terms.push(`${vw}vw`)
  const sum = terms.join(" + ").replace(/\+ -/g, "- ")
  return terms.length === 1 && !track ? sum : `calc(${sum})`
}

/* The stretches: a line between two neighbouring widths, in force from `from` up (a wider one overrides it). Two widths one pixel apart are the two sides of a layout change, with no line between them. */
const stretches = []
for (let i = 0; i + 1 < WIDTHS.length; i++) {
  const [a, b] = [WIDTHS[i], WIDTHS[i + 1]]
  if (b - a === 1) continue
  const afterBreak = i > 0 && a - WIDTHS[i - 1] === 1
  stretches.push({ a, b, from: i === 0 ? 0 : afterBreak ? a : a + 1 })
}
const last = WIDTHS[WIDTHS.length - 1]
const blocks = new Map()
const put = (from, n, value) => blocks.set(from, [...(blocks.get(from) ?? []), `[data-lazy-section="${n}"]{--lz:${value}}`])
const rules = {}
for (const n of NAMES) {
  let current = null
  rules[n] = []
  for (const s of stretches) {
    const line = lineThrough(n, s.a, s.b)
    /* A new rule where the line stops fitting, or where the pinned track's own CSS changes. */
    if (current && current.track === trackAt(n, s.a) && Math.abs(valueOf(current, s.a) - fixed(n, s.a)) <= TOLERANCE && Math.abs(valueOf(current, s.b) - fixed(n, s.b)) <= TOLERANCE) continue
    current = line
    rules[n].push({ from: s.from, line })
    current.track = trackAt(n, s.a)
    put(s.from, n, write1(n, line, s.a))
  }
  /* Past the widest measured screen the height is held, so a line with any slope does not run on. */
  if (Math.abs(current.slope * last) > TOLERANCE) {
    const flat = { slope: 0, px: fixed(n, last) }
    rules[n].push({ from: last + 1, line: flat })
    put(last + 1, n, write1(n, flat, last))
  }
}
const css = [...blocks.keys()].sort((x, y) => x - y).map((from) => (from ? `@media (min-width:${from}px){${blocks.get(from).join("")}}` : blocks.get(from).join(""))).join("")

/* What the new rules say at every measured width, against what was measured. */
let worst = 0
for (const w of WIDTHS) for (const n of NAMES) worst = Math.max(worst, Math.abs(valueOf(rules[n].filter((r) => r.from <= w).pop().line, w) - fixed(n, w)))
console.log(`\nMeasured rules: ${css.length} bytes, within ${worst.toFixed(1)}px of every section at every measured width.`)
if (worst > TOLERANCE + 0.5) throw new Error("the measured rules do not match the measurements")

if (!write) {
  console.log("Not written (pass --write to put them in " + FILE + ").")
} else {
  const pattern = /export const LAZY_SECTION_HEIGHTS_CSS = '[^']*'/
  if (!pattern.test(source)) throw new Error(`LAZY_SECTION_HEIGHTS_CSS not found in ${FILE}`)
  writeFileSync(FILE, source.replace(pattern, () => `export const LAZY_SECTION_HEIGHTS_CSS = '${css}'`))
  console.log(`Written to ${FILE}. Build again and run this once more without --write to confirm.`)
}
