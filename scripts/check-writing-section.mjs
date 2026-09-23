#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE SPOT ASK AI IS WRITING A SECTION INTO, MEASURED
 * ===========================================================================
 * components/website-builder/editor/writing-section.tsx, with the rules
 * app/globals.css ships for it, on two pages: a light site at the width of
 * the desktop canvas and a dark site at the width of a phone. The questions
 * a screenshot answers badly:
 *
 *   is it the page's       its background and its bones are mixed from the
 *                          site's own text and background, so a dark site
 *                          gets a dark placeholder, not a white slab
 *   can it be read         the label against its own background, by contrast
 *                          ratio rather than by eye
 *   does it fit            three cards across a desktop canvas and two on a
 *                          phone, no overflow, the prompt cut at two lines
 *   does it move, and      the ring and the sweep run; with reduced motion
 *   stop                   asked for, nothing does
 *
 * Leaves .probe-writing-section.png behind to look at.
 *
 *   node scripts/check-writing-section.mjs
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"

const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/* The product's own rules, read out of the stylesheet rather than copied. */
const globals = readFileSync(join(root, "app/globals.css"), "utf8")
const ownBlock = globals.slice(globals.indexOf("/* ===========================================================================\n   A SECTION THE AI IS STILL WRITING"))
const nextBlock = ownBlock.indexOf("/* ====", 10)
const css = [
  globals.match(/@property --wb-ai-angle \{[^}]*\}/)?.[0],
  globals.match(/@keyframes wb-ai-shimmer \{[^}]*\}\s*\}/)?.[0],
  nextBlock === -1 ? ownBlock : ownBlock.slice(0, nextBlock),
]
if (css.some((c) => !c)) fail("Could not find the placeholder's rules in app/globals.css.")

const PROMPT = "A pricing table with three plans, the middle one highlighted, and a line under each price saying what it includes. Monthly and yearly toggle above it."

const work = join(root, ".writing-probe")
mkdirSync(work, { recursive: true })

try {
  writeFileSync(join(work, "entry.tsx"), `
import { createRoot } from "react-dom/client"
import { WritingSection } from "@/components/website-builder/editor/writing-section"
for (const el of document.querySelectorAll("[data-slot]")) {
  createRoot(el).render(<WritingSection prompt={${JSON.stringify(PROMPT)}} />)
}
`)
  execFileSync("npx", [
    "esbuild", join(work, "entry.tsx"),
    "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "probe.js")}`,
    `--alias:@=${root}`,
    "--jsx=automatic", "--log-level=error",
    '--define:process.env.NODE_ENV="production"',
  ], { cwd: root, stdio: "inherit" })

  const page = join(work, "writing.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: #eef1f5; font-family: Inter, system-ui, sans-serif; display: flex; gap: 24px; padding: 24px; align-items: flex-start; }
  .site { border-radius: 20px; overflow: hidden; background: var(--theme-bg); color: var(--theme-text); }
  .site[data-tone="light"] { width: 1100px; --theme-text: #0f172a; --theme-bg: #ffffff; }
  .site[data-tone="dark"] { width: 390px; --theme-text: #f5f5f4; --theme-bg: #111111; }
  .neighbour { padding: 40px 24px; font-size: 20px; font-weight: 700; border-bottom: 1px solid color-mix(in srgb, var(--theme-text) 10%, transparent); }
  ${css.join("\n")}
</style>
<div class="site" data-tone="light" id="light">
  <div class="neighbour">Hero, the section above</div>
  <div data-slot></div>
  <div class="neighbour">FAQ, the section below</div>
</div>
<div class="site" data-tone="dark" id="dark">
  <div class="neighbour">Hero</div>
  <div data-slot></div>
  <div class="neighbour">FAQ</div>
</div>
<pre id="out" style="position:absolute;left:-9999px">pending</pre>
<script src="./probe.js"></script>
<script>
/* "rgb(15, 23, 42)", or "color(srgb 0.97 0.97 0.97)" for a colour-mix, which is 0 to 1. */
const rgb = (s) => {
  const n = (s.match(/[\\d.]+/g) || []).slice(0, 3).map(Number)
  return s.startsWith("color(srgb") ? n.map((c) => c * 255) : n
}
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

function look(id) {
  const site = document.getElementById(id)
  const box = site.querySelector("[data-writing-section]")
  if (!box) return null
  const cs = getComputedStyle(box)
  const ring = getComputedStyle(box, "::before")
  const label = box.querySelector(".wb-writing-label")
  const prompt = box.querySelector(".wb-writing-prompt")
  const cards = [...box.querySelectorAll(".wb-bone-card")].filter((c) => getComputedStyle(c).display !== "none")
  const bone = box.querySelector(".wb-bone")
  const sweep = getComputedStyle(bone, "::after")
  const r = box.getBoundingClientRect()
  const s = site.getBoundingClientRect()
  return {
    width: Math.round(r.width), height: Math.round(r.height),
    inside: r.left >= s.left && r.right <= s.right + 0.5,
    overflowX: box.scrollWidth > box.clientWidth + 1,
    siteBg: getComputedStyle(site).backgroundColor,
    bg: cs.backgroundColor,
    bone: getComputedStyle(bone).backgroundColor,
    labelColor: getComputedStyle(label).color,
    labelText: label.textContent.trim(),
    labelContrast: contrast(getComputedStyle(label).color, cs.backgroundColor),
    promptContrast: contrast(getComputedStyle(prompt).color, cs.backgroundColor),
    promptLines: Math.round(prompt.getBoundingClientRect().height / parseFloat(getComputedStyle(prompt).lineHeight)),
    columns: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size === 1 ? cards.length : -1,
    ringImage: ring.backgroundImage.slice(0, 40),
    ringAnimation: ring.animationName,
    sweepAnimation: sweep.animationName,
    sweepShown: sweep.display !== "none",
    boxAnimation: cs.animationName,
    role: box.getAttribute("role"),
    live: box.getAttribute("aria-live"),
  }
}
addEventListener("load", () => setTimeout(() => {
  document.getElementById("out").textContent = JSON.stringify({ light: look("light"), dark: look("dark") })
}, 900))
</script>`)

  const run = (extra) => {
    const dom = execFileSync(CHROMIUM, [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=1600,900",
      "--virtual-time-budget=4000", ...extra, "--dump-dom", `file://${page}`,
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 })
    const match = dom.match(/<pre id="out"[^>]*>([^<]*)</)
    if (!match || match[1] === "pending") fail("The placeholder never reported a measurement.")
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  }

  const moving = run([])
  const still = run(["--force-prefers-reduced-motion"])
  if (!moving.light || !moving.dark) fail("The placeholder did not render.")

  execFileSync(CHROMIUM, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=1600,760", "--hide-scrollbars",
    "--virtual-time-budget=4000", `--screenshot=${join(root, ".probe-writing-section.png")}`, `file://${page}`,
  ], { stdio: "ignore", timeout: 60_000 })

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${JSON.stringify(got)}`}`)
    if (!ok) broken++
  }

  for (const [name, m] of [["light site, desktop canvas", moving.light], ["dark site, phone", moving.dark]]) {
    console.log(`\n${name}: ${m.width} x ${m.height}px, background ${m.bg} on ${m.siteBg}, label ${m.labelContrast.toFixed(2)}:1, prompt ${m.promptContrast.toFixed(2)}:1\n`)
    expect(m.labelText === "Writing a section", "it says what is happening", m.labelText)
    expect(m.role === "status" && m.live === "polite", "and says it to a screen reader too", [m.role, m.live])
    expect(m.bg !== m.siteBg && m.bone !== m.bg, "it is a tone of the site, set apart from the page and its bones from it", [m.siteBg, m.bg, m.bone])
    expect(m.labelContrast >= 4.5, "the label reads against it", m.labelContrast)
    expect(m.promptContrast >= 4.5, "and so does the prompt", m.promptContrast)
    expect(m.promptLines <= 2, "the prompt stops at two lines", m.promptLines)
    expect(m.inside && !m.overflowX, "nothing spills out of the page", [m.inside, m.overflowX])
    expect(m.height >= 240 && m.height <= 560, "section sized, not a sliver and not a screen", m.height)
    expect(/conic-gradient/.test(m.ringImage) && m.ringAnimation === "wb-ai-shimmer", "the Ask AI ring runs round its edge", [m.ringImage, m.ringAnimation])
    expect(m.sweepShown && m.sweepAnimation === "wb-bone-sweep", "and a sweep crosses the bones", m.sweepAnimation)
  }
  expect(moving.light.columns === 3, "three cards across the desktop canvas", moving.light.columns)
  expect(moving.dark.columns === 2, "two on a phone, with the third left out rather than wrapped", moving.dark.columns)
  expect(lumOf(moving.dark.bg) < 0.1, "a dark site gets a dark placeholder", moving.dark.bg)

  console.log("\nWith reduced motion asked for\n")
  for (const m of [still.light, still.dark]) {
    expect(m.ringAnimation === "none" && m.boxAnimation === "none" && !m.sweepShown, "nothing moves", [m.ringAnimation, m.boxAnimation, m.sweepShown])
  }

  console.log(`\nScreenshot: .probe-writing-section.png`)
  if (broken) fail(`${broken} check(s) failed.`)
  console.log("\nall checks passed\n")
} finally {
  rmSync(work, { recursive: true, force: true })
}

function lumOf(color) {
  const n = (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
  const [r, g, b] = color.startsWith("color(srgb") ? n.map((c) => c * 255) : n
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
