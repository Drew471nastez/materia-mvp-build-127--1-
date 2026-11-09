/**
 * ===========================================================================
 *  A WHOLE AI WEBSITE, DRAWN AND LOOKED AT, WITHOUT A MODEL
 * ===========================================================================
 * The coded components the AI builder's tests use (benchmarks A to D, the
 * classic job's creative sample "AP") composed into home pages and drawn by
 * the real Storelib template engine with each design's tokens as Theme
 * settings (scripts/render-ai-sample-site.tsx), then opened in Chromium at
 * 390 and 1440 and measured against CLAUDE.md:
 *
 *   overflow     nothing scrolls sideways
 *   h1           one heading at the top of the hierarchy (or none for a one
 *                table portfolio, which is reported, not failed)
 *   purple       no violet, purple or indigo colour on any drawn element
 *   gradient     no gradient background anywhere
 *   radius       no corner over 16px on a button or picture
 *   menu         the header draws the site's own menu links
 *   copy         no banned word, em dash or placeholder in the drawn words
 *   slop         round L's evaluator score and findings; the shared gate
 *
 * These are hand written components. A pass here says the PIPELINE (gate,
 * compiler, renderer, tokens, schemes) carries a good design to the page; it
 * says nothing about what a real model writes, which only a live run shows.
 *
 *   node scripts/check-ai-sample-site.mjs
 *   SHOTS=<dir>   the pictures (full page, 390 and 1440)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SHOTS = process.env.SHOTS || ""
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const dir = join(root, `.ai-sample-${process.pid}`)
process.on("exit", () => rmSync(dir, { recursive: true, force: true }))
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "empty.cjs"), "module.exports = {}\n")
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-ai-sample-site.tsx"), "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(dir, "render.cjs")}`, `--alias:@=${root}`, "--alias:server-only=" + join(dir, "empty.cjs"), "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", "--external:sharp", "--external:esbuild",
    '--define:process.env.NODE_ENV="production"'], { stdio: ["ignore", "ignore", "inherit"] })
} catch {
  fail("scripts/render-ai-sample-site.tsx did not bundle. The error above is esbuild's.")
}
execFileSync("node", [join(dir, "render.cjs")], { stdio: "inherit", env: { ...process.env, OUT_DIR: dir } })
const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"))
const designs = Object.keys(report)

const BANNED = /\b(unlock(s|ed|ing)?|elevat(e|es|ed|ing)|seamless(ly)?|powerful|effortless(ly)?|supercharg(e|es|ed|ing)|transform(s|ed|ing|ative)?)\b|—|lorem ipsum|goes here|go here|<\/?(?:p|strong|em|br|a)\b[^>]*>/i

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const out = {}
for (const key of designs) {
  console.log(`\n${key}`)
  const r = report[key]
  console.log(`        anti slop score ${r.score} (${r.counts.error} errors, ${r.counts.warn} warnings)`)
  for (const f of r.findings) console.log(`          ${f.slice(0, 200)}`)
  expect(r.counts.error === 0, `${key}: no high anti slop finding`)
  expect(r.gate.length === 0, `${key}: every file passes the shared gate`, r.gate.join(" | "))
  for (const width of [390, 1440]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: width < 768 ? 844 : 900, deviceScaleFactor: 1 })
    await page.goto(`file://${join(dir, `${key}.html`)}`, { waitUntil: "load" })
    const m = await page.evaluate(() => {
      const els = [...document.querySelectorAll("[data-storelib-theme] *")].filter((e) => e.getClientRects().length)
      const hue = (c) => {
        const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(c)
        if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null
        const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number(x) / 255)
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
        if (d < 0.12) return null
        let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
        h = (h * 60 + 360) % 360
        const l = (max + min) / 2
        const s = d / (1 - Math.abs(2 * l - 1))
        return { h, s }
      }
      const purple = []
      const gradients = []
      const neutral = []
      const round = []
      for (const e of els) {
        const cs = getComputedStyle(e)
        for (const p of ["color", "backgroundColor", "borderTopColor"]) {
          const x = hue(cs[p])
          if (x && x.h >= 245 && x.h <= 300 && x.s > 0.3 && (p !== "borderTopColor" || parseFloat(cs.borderTopWidth) > 0)) purple.push(`${e.tagName.toLowerCase()}.${e.className} ${p} ${cs[p]}`)
        }
        if (/gradient/.test(cs.backgroundImage)) {
          /* A coloured gradient fails; a neutral one (a white sheen, a shade) is reported. */
          const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []
          const coloured = stops.some((c) => { const x = hue(c); return x && x.s > 0.3 })
          ;(coloured ? gradients : neutral).push(`${e.tagName.toLowerCase()}.${e.className}`)
        }
        if ((e.tagName === "A" || e.tagName === "BUTTON" || e.tagName === "IMG") && parseFloat(cs.borderTopLeftRadius) > 16 && e.getBoundingClientRect().height < 200) round.push(`${e.tagName.toLowerCase()}.${e.className} ${cs.borderTopLeftRadius}`)
      }
      const header = document.querySelector('[data-section-id$="-0"] header, header')
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        h1: document.querySelectorAll("h1").length,
        purple: [...new Set(purple)].slice(0, 5),
        gradients: [...new Set(gradients)].slice(0, 5),
        neutral: [...new Set(neutral)].slice(0, 5),
        round: [...new Set(round)].slice(0, 5),
        menuLinks: header ? [...header.querySelectorAll("nav a")].map((a) => a.textContent.trim()).filter(Boolean) : null,
        text: document.querySelector("[data-storelib-theme]").innerText,
        height: document.documentElement.scrollHeight,
        problems: window.__problems,
        types: window.__types,
      }
    })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `sample-${key}-${width}.png`), fullPage: true })
    await page.close()
    out[`${key}@${width}`] = { ...m, text: undefined }
    console.log(`        ${width}px: ${m.types.join(" > ")}, ${m.height}px tall`)
    expect(m.problems.length === 0, `${key} ${width}: every section drew`, m.problems.join(" | "))
    expect(m.overflow <= 0, `${key} ${width}: nothing scrolls sideways`, `${m.overflow}px over`)
    expect(m.purple.length === 0, `${key} ${width}: no purple, violet or indigo`, m.purple.join(" | "))
    expect(m.gradients.length === 0, `${key} ${width}: no coloured gradient`, m.gradients.join(" | "))
    if (m.neutral.length) console.log(`        reported: a neutral gradient (sheen) on ${m.neutral.join(", ")}`)
    expect(m.round.length === 0, `${key} ${width}: no corner over 16px on a button or picture`, m.round.join(" | "))
    const banned = BANNED.exec(m.text)
    expect(!banned, `${key} ${width}: no banned word, em dash, placeholder or markup shown as text`, banned ? banned[0] : "")
    if (m.menuLinks !== null) expect(m.menuLinks.length > 0, `${key} ${width}: the header draws the site's own menu`, m.menuLinks.join(", "))
    console.log(`        h1: ${m.h1}${m.h1 === 1 ? "" : " (reported: one is the norm)"}`)
  }
}
await browser.close()
if (process.env.JSON) (await import("node:fs")).writeFileSync(process.env.JSON, JSON.stringify({ report, pages: out }, null, 2))
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
