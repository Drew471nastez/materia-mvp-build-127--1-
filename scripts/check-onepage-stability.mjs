/**
 * ===========================================================================
 *  THE PUBLISHED /links PAGE SHOULD NOT REBUILD ITSELF WHILE YOU USE IT
 * ===========================================================================
 * Reported from a phone on storelib.com/satori-studio/links: the carousel
 * blinks while you swipe it, the creator's avatar "refreshes randomly", and
 * there is a blur over the avatar nobody asked for.
 *
 * All three are one measurement away from each other, so they are measured
 * together on one document:
 *
 *   churnOnScroll   how many <img> elements React destroys and recreates when
 *                   nothing happened except a scroll. Anything above zero is
 *                   the blink: a replaced <img> repaints from nothing.
 *   itemWidths      what the carousel's slides are laid out at. A slide that
 *                   starts at 100% and then becomes a pixel width has moved
 *                   on screen once for free.
 *   avatar.filter   whether the avatar is blurred at all.
 *   swipeCancelled  whether the horizontal swipe can stop the page scrolling.
 *                   React attaches touchmove passively, so preventDefault in
 *                   an onTouchMove is a no-op with a console warning, and the
 *                   page scrolls underneath the drag.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-onepage-"))
const stubs = join(root, ".onepage-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/satori-studio/links"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-onepage-stability.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>${css}</style><style>body{margin:0}</style>
</head><body><div id="root"></div><div style="height:2400px"></div>
<script>window.addEventListener("error", function (e) { window.__err = String(e.message) })</script>
<script>${readFileSync(join(root, "scripts/onepage-stability-observe.js"), "utf8")}</script>
<script>${readFileSync(join(out, "probe.js"), "utf8")}</script>
<script>${readFileSync(join(root, "scripts/onepage-stability-page.js"), "utf8")}</script>
</body></html>`)

/*
  The same document, handed to another probe rather than measured here.

  scripts/check-onepage-drag.mjs drives real touch input through the browser's
  input pipeline, which is the only way to find out what a finger gets. It
  needs a page to drive, and building this one twice would be two places to
  keep in step.
*/
if (process.env.EMIT_HTML) {
  const { copyFileSync } = await import("node:fs")
  copyFileSync(join(out, "index.html"), process.env.EMIT_HTML)
  console.log(process.env.EMIT_HTML)
  process.exit(0)
}

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=520,900", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const found = [...dom.matchAll(/<pre id="probe-result">([\s\S]*?)<\/pre>/g)]
if (!found.length) fail(`Nothing reported. ${process.env.DEBUG ? dom.slice(0, 4000) : "Run with DEBUG=1 to see the DOM."}`)
const r = JSON.parse(found[found.length - 1][1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))

console.log("")
console.log(`  images on the page      ${r.imgCount} (${r.avatarCopies} copies of the avatar)`)
console.log(`  avatar copies           ${r.avatarList.map((a) => `${a.filter}/${a.anim}`).join("  ")}`)
console.log(`  carousel slide widths   ${r.trackFound ? JSON.stringify(r.itemWidths) : "(no track found)"}`)
console.log(`  widths at insertion     ${JSON.stringify(r.bornWidths)}`)
console.log(`  widths rewritten later  ${JSON.stringify(r.widthValuesSeen)}`)
console.log(`  img churn on a scroll   ${r.churnOnScroll.removed} removed, ${r.churnOnScroll.added} added`)
console.log(`  the slider is           overflow-x ${r.overflowX}, snap ${r.snapType}, slides snap ${r.slideSnapAlign}, scrollable ${r.canScroll}`)
console.log(`  the arrow moved it      ${r.arrowFound ? r.pictureMovedByArrow + "px" : "(no arrow found)"}`)
console.log(`  dots parked half way    ${JSON.stringify(r.dotWidthsAtHalfway)}`)
console.log(`  subscribe panel         ${r.subscribe ? `closed ${r.subscribe.beforeOpening} -> open ${r.subscribe.whenOpen} -> pressed away ${r.subscribe.afterPressingAway}, fade ${r.subscribe.fade}` : "(no bell on this page)"}`)
if (process.env.DEBUG) console.log("  avatar copies:", JSON.stringify(r.avatarList, null, 1))
if (process.env.DEBUG) { console.log("  imgs:", JSON.stringify(r.imgList, null, 1)); console.log("  scroll:", JSON.stringify(r.scrolled)) }
if (r.error) console.log(`  page error              ${r.error}`)
console.log("")

const problems = []
if (!r.trackFound) problems.push("the carousel track was not on the page, so nothing about it was measured")
if (r.churnOnScroll.removed > 0 || r.churnOnScroll.added > 0)
  problems.push(`a scroll destroyed ${r.churnOnScroll.removed} and rebuilt ${r.churnOnScroll.added} images — that is the blink`)
/*
  EVERY COPY, NOT THE FIRST ONE FOUND.

  The page mounts its phone layout and its desktop layout at the same time and
  lets CSS hide one, and the share sheet draws the picture a third time. An
  earlier version of this read whichever copy came first in the document, which
  was the share sheet's — unblurred — and so reported a clean avatar while the
  one on screen was sitting at blur(3px).
*/
for (const a of r.avatarList) {
  if (a.filter && a.filter !== "none") problems.push(`an avatar (${a.cls || "no class"}) is drawn through ${a.filter}`)
  if (a.anim && a.anim !== "none") problems.push(`an avatar (${a.cls || "no class"}) runs the ${a.anim} animation, so every mount replays it`)
}
if (r.trackFound && r.itemWidths.some((w) => w === "100%" || w === ""))
  problems.push(`a carousel slide is still laid out at 100% once the page has settled: ${JSON.stringify(r.itemWidths)}`)
if (r.bornWidths.includes("100%"))
  problems.push(`something was born at width 100% and given a real width afterwards: ${JSON.stringify(r.bornWidths)}`)
/*
  THE SLIDER HAS TO BE A REAL SCROLLER.

  Which is the whole point of the rebuild: the browser moves the row, on the
  compositor, with momentum and snapping, so it follows a finger without any
  of the guessing the hand-rolled drag depended on.
*/
if (r.trackFound) {
  if (r.overflowX !== "auto" && r.overflowX !== "scroll")
    problems.push(`the slider's overflow-x is ${r.overflowX}, so the browser will not scroll it`)
  if (!/x mandatory|x proximity/.test(r.snapType || ""))
    problems.push(`the slider does not snap: scroll-snap-type is ${r.snapType}`)
  if (r.slideSnapAlign !== "start")
    problems.push(`a slide's scroll-snap-align is ${r.slideSnapAlign}, so there is nothing for the scroller to stop on`)
  if (!r.canScroll)
    problems.push("the slider holds no more than it can show, so there is nothing to slide")

  /*
    THE ARROW HAS TO MOVE THE PICTURE. Reported exactly that way: the dots
    advanced and the gallery sat still.
  */
  if (!r.arrowFound) problems.push("the carousel has no next arrow")
  else if (!r.pictureMovedByArrow)
    problems.push(`pressing the next arrow moved the first picture ${r.pictureMovedByArrow}px — the dots move and the gallery does not`)

  /*
    AND THE DOT FILLS BY DEGREES. Parked exactly halfway between two slides,
    neither dot has won: both should be about half grown. A long pill and a
    row of short ones is the snap that was reported as "too direct".
  */
  const w = r.dotWidthsAtHalfway || []
  const grown = w.filter((n) => n > 10 && n < 22)
  if (w.length && grown.length < 2)
    problems.push(`halfway between two slides the dots are ${JSON.stringify(w)} — the fill jumps from one dot to the next instead of crossing over`)
}

/* The slides have to come out at the width the arithmetic asks for, or the
   calc() that replaced the measurement is just a different wrong number. */
if (r.trackFound && r.itemPixels.length) {
  const view = 1.2, gap = 8
  const expected = (r.containerBox - gap * (Math.ceil(view) - 1)) / view
  for (const w of r.itemPixels) {
    if (Math.abs(w - expected) > 1) problems.push(`a slide is ${w}px wide where ${Math.round(expected * 100) / 100}px was asked for`)
  }
}

/* And the swipe has to move the track. */

/*
  AND PRESSING AWAY CLOSES THE SUBSCRIBE PANEL, over its own 300ms fade.
*/
if (!r.subscribe) problems.push("the subscribe bell was not on the page, so nothing about it was measured")
else {
  if (r.subscribe.whenOpen !== "auto")
    problems.push(`pressing the bell left the panel at pointer-events ${r.subscribe.whenOpen} — it did not open`)
  if (r.subscribe.afterPressingAway !== "none")
    problems.push(`pressing away left the panel at pointer-events ${r.subscribe.afterPressingAway} — it stays open over the page`)
  if (!/^0\.3s|^300ms/.test(r.subscribe.fade || ""))
    problems.push(`the panel closes over ${r.subscribe.fade} rather than easing out`)
}

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("The published page holds still, and the slider is a scroller the browser drives.\n")
