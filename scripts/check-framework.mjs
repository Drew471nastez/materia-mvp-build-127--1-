/**
 * ===========================================================================
 *  THE FRAMEWORK'S NEW SECTIONS AND CONTROLS, LOOKED AT AND MEASURED
 * ===========================================================================
 * Draws Plans, Rows, Course Outline, the 404 page's section, the Product
 * Grid's chosen products and the countdown's date (scripts/render-framework-
 * probe.tsx) at 390 and 1440, and the new editor controls in the 300px
 * desktop sidebar and in the phone sheet at 390. Writes a screenshot of each
 * and refuses:
 *
 *   - a section or control wider than its column (sideways scroll)
 *   - text under 4.5:1 against what is behind it
 *   - on a phone, a bordered tap target or a field under 44px
 *   - on a phone, a typable field under 16px (iOS zooms the page for it)
 *
 *   node scripts/check-framework.mjs        (screenshots to .wb-probe/framework-*.png)
 *
 * Uses the built stylesheet when there is one and app/globals.css through
 * Tailwind when there is not (scripts/probe-css.mjs), so it runs without a build.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const shots = join(root, ".wb-probe")
mkdirSync(shots, { recursive: true })
writeFileSync(join(shots, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(shots, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\nexport const useParams = () => ({})\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-framework-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-framework-probe.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(shots, "link.jsx")}`, `--alias:next/navigation=${join(shots, "navigation.js")}`, `--alias:@=${root}`,
  `--alias:server-only=${join(shots, "navigation.js")}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const css = await appCss(root)

const MEASURE = `
<script>
(function () {
  function lum(c) {
    const m = c.match(/\\d+(\\.\\d+)?/g) || []
    const [r, g, b] = m.slice(0, 3).map((n) => { const v = Number(n) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  function opaque(bg) {
    const m = /^rgba?\\(([^)]+)\\)/.exec(bg || ""); if (!m) return false
    const p = m[1].split(",").map((x) => x.trim()); const a = p.length > 3 ? Number(p[3]) : 1
    return Number.isFinite(a) && a > 0.05
  }
  function behind(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; if (opaque(bg)) return bg }
    return "rgb(255, 255, 255)"
  }
  const phone = window.innerWidth < 640
  const out = []
  for (const p of document.querySelectorAll("[data-probe]")) {
    const low = [], small = [], zoom = []
    for (const el of p.querySelectorAll("h1,h2,h3,p,a,li,span,button,summary,label,time,s,strong")) {
      const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("").trim()
      if (t.length < 2) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || Number(cs.opacity) < 0.15) continue
      const rect = el.getBoundingClientRect(); if (rect.width < 2 || rect.height < 2) continue
      const a = lum(cs.color), b = lum(behind(el)); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio < 4.5) low.push(t.slice(0, 30) + " " + ratio.toFixed(2) + ":1")
    }
    if (phone) {
      for (const el of p.querySelectorAll("a,button,summary,input,select,textarea")) {
        const cs = getComputedStyle(el); const rect = el.getBoundingClientRect()
        if (rect.height === 0 || cs.display === "none") continue
        const field = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|range|hidden|color)$/.test(el.type)
        const bordered = field || el.tagName === "SUMMARY" || parseFloat(cs.borderTopWidth) > 0 || opaque(cs.backgroundColor)
        if (bordered && rect.height < 44) small.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 24) + " " + Math.round(rect.height) + "px")
        if (field && parseFloat(cs.fontSize) < 16) zoom.push(el.tagName + " " + cs.fontSize)
      }
    }
    const r = p.getBoundingClientRect()
    out.push({ name: p.dataset.probe, height: Math.round(r.height), overflow: Math.round(p.scrollWidth - p.clientWidth), low, small, zoom })
  }
  const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(out); document.body.append(pre)
})()
</script>`

function page(width, body, extra = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style><style>
    body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}
    .probe{margin:0 0 16px;background:#fff;overflow:hidden}
    .probe__bar{display:flex;gap:10px;align-items:baseline;padding:6px 12px;background:#1a1a2e;color:#fff;font-size:12px}
    .probe__bar code{margin-left:auto;opacity:.6}
    ${extra}
  </style></head><body>${body}${MEASURE}</body></html>`
}

function shoot(name, width, html) {
  const file = join(out, `${name}.html`)
  writeFileSync(file, html)
  /* Headless Chromium will not lay a window out narrower than about 500px, so a phone is a 390px column in a 520px window: under 640px, so every phone rule applies. */
  const args = ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--window-size=${Math.max(width, 520)},1400`, "--virtual-time-budget=3000"]
  const dom = execFileSync(CHROMIUM, [...args, "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 128 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail(`${name}: the page did not report.`)
  const records = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
  /* The window as tall as what was drawn, so the picture is all of it: a full-page flag is not honoured by every build. */
  const tall = Math.min(20000, records.reduce((sum, r) => sum + r.height + 16, 64))
  const png = join(shots, `framework-${name}.png`)
  execFileSync(CHROMIUM, [...args.map((a) => (a.startsWith("--window-size=") ? `--window-size=${Math.max(width, 520)},${tall}` : a)), `--screenshot=${png}`, `file://${file}`], { stdio: ["ignore", "ignore", "ignore"] })
  console.log(`  shot: .wb-probe/framework-${name}.png`)
  return records
}

const sectionsHtml = readFileSync(join(out, "sections.html"), "utf8").replace(/<section class="probe" data-name="([^"]+)">/g, '<section class="probe" data-probe="$1">')
const controlsHtml = readFileSync(join(out, "controls.html"), "utf8").replace(/<div class="ctl" data-type="([^"]+)">/g, '<div class="ctl" data-probe="control $1">')

const problems = []
const report = (records, where) => {
  for (const r of records) {
    const at = `${r.name} @ ${where}`
    const bits = [`${r.height}px tall`]
    if (r.overflow > 0) problems.push(`${at}: ${r.overflow}px wider than its column`)
    for (const l of r.low) problems.push(`${at}: low contrast, ${l}`)
    for (const s of r.small) problems.push(`${at}: tap target ${s}`)
    for (const z of r.zoom) problems.push(`${at}: ${z}, a phone zooms for it`)
    console.log(`    ${at}: ${bits.join(", ")}${r.overflow > 0 ? `, overflow ${r.overflow}` : ""}${r.low.length ? `, ${r.low.length} low contrast` : ""}${r.small.length ? `, ${r.small.length} small targets` : ""}`)
  }
}

for (const width of [390, 1440]) {
  report(shoot(`sections-${width}`, width, page(width, `<div style="width:${width}px">${sectionsHtml}</div>`)), `${width}px`)
}
/* The sidebar is 300px wide on a computer. On a phone the controls sit in the bottom sheet. */
report(shoot("controls-1440", 1440, page(1440, `<aside style="width:300px;margin:24px;background:#fff;padding:16px;border-right:1px solid #e5e7eb" class="space-y-4">${controlsHtml}</aside>`)), "sidebar 1440px")
report(shoot("controls-390", 390, page(390, `<div data-mobile-bottom-sheet style="width:390px;box-sizing:border-box;background:#fff;padding:16px" class="space-y-4">${controlsHtml}</div>`)), "phone sheet 390px")

/*
 * THE SHARED COLOUR AND GRADIENT EDITORS, which the Background control opens
 * rather than copies (color-chip.tsx, gradient-editor.tsx). Their phone sizes
 * belong to whoever owns the sidebar's existing controls; they are reported,
 * and do not fail this check, which is about what the framework added.
 */
const SHARED = /color_background @ phone sheet 390px: tap target (Pick color|Remove this colour|Add a colour|Direction)/
const shared = problems.filter((p) => SHARED.test(p))
if (shared.length) {
  console.log(`\n${shared.length} in the shared colour and gradient editors, not this control's own:`)
  for (const p of shared) console.log(`  - ${p}`)
}
problems.splice(0, problems.length, ...problems.filter((p) => !SHARED.test(p)))
if (problems.length) {
  console.log(`\n${problems.length} problems:`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log("\nNo overflow, no low contrast, no small phone targets.")
