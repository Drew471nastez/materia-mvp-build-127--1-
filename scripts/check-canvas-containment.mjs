/**
 * ===========================================================================
 *  NOTHING A SECTION DRAWS LEAVES THE CANVAS, MEASURED
 * ===========================================================================
 * An agent-written header opened its menu with `position: fixed; inset: 0`
 * and covered the whole editor. This draws the same kind of section inside
 * the canvas's real structure (the .wb-canvas-frame card, the scroller
 * inside it, the @container wrapper every section gets) with the real
 * stylesheet and the real section CSS compiler, and measures:
 *
 *   - a fixed full-screen menu covers the canvas card and stops at its edge,
 *     at the top of what is in view even when the page is scrolled;
 *   - a z-index of 2147483647 inside the card stays under the editor's bar;
 *   - `100vw` / `100vh` are the canvas's, not the window's;
 *   - `@media (max-width: 767px)` answers to the phone preview's width;
 *   - a popover and a dialog opened from a button (no script) open inside the
 *     canvas, not in the browser's top layer, and Escape closes them;
 *   - a header's dropdown hangs over the section after it, not under it,
 *     and is not cut off at the header's edge;
 *   - a <style> an agent put in the template never reaches the page;
 *   - on a live page (no canvas) the same CSS behaves as written.
 *
 *   pnpm build && node scripts/check-canvas-containment.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const appCss = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

/* The real compiler, bundled for node. */
const out = mkdtempSync(join(tmpdir(), "storelib-contain-"))
writeFileSync(join(out, "entry.ts"), [
  `export { scopeCss, cssForInstance } from ${JSON.stringify(join(root, "lib/storelib-theme/storelib/css.ts"))}`,
  `export { compileSection } from ${JSON.stringify(join(root, "lib/storelib-theme/storelib/compile.ts"))}`,
  `export { renderSection } from ${JSON.stringify(join(root, "lib/storelib-theme/render.ts"))}`,
].join("\n"))
execFileSync("npx", ["esbuild", join(out, "entry.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${join(out, "css.cjs")}`, "--log-level=error", `--alias:@=${root}`], { cwd: root, stdio: "inherit" })
const { scopeCss, cssForInstance, compileSection, renderSection } = createRequire(import.meta.url)(join(out, "css.cjs"))

/* The editor's guard, the real component, mounted on its own. */
writeFileSync(join(out, "guard.tsx"), `import { createRoot } from "react-dom/client"
import { CanvasTopLayerGuard } from ${JSON.stringify(join(root, "components/website-builder/canvas-top-layer.tsx"))}
createRoot(document.getElementById("guard")!).render(<CanvasTopLayerGuard />)`)
execFileSync("npx", ["esbuild", join(out, "guard.tsx"), "--bundle", "--format=iife", "--jsx=automatic", "--define:process.env.NODE_ENV=\"production\"", `--outfile=${join(out, "guard.js")}`, "--log-level=error"], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const GUARD = readFileSync(join(out, "guard.js"), "utf8")

const AGENT_CSS = `
.bar { display: flex; justify-content: space-between; padding: 16px; background: #111; color: #fff; }
.menu { position: fixed; inset: 0; z-index: 2147483647; background: #000; color: #fff; }
.dd { position: relative; }
.dd__panel { position: absolute; top: 100%; left: 0; width: 220px; height: 240px; background: #fde68a; z-index: 5; }
.pm { width: 100%; height: 100%; margin: 0; background: #111; color: #fff; }
.pm:popover-open { outline: 3px solid rgb(255, 0, 0); }
.dg { width: 300px; height: 200px; }
.wide { width: 100vw; height: 40px; background: #2563eb; }
.tall { height: 100vh; background: #f3f4f6; }
.links { display: flex; gap: 12px; }
@media (max-width: 767px) { .links { display: none; } }
`
const scoped = scopeCss(AGENT_CSS, { type: "site_header" })
if (!scoped.ok) fail(JSON.stringify(scoped.errors))
const sectionCss = cssForInstance(scoped.value, "hdr-1")
const SECTION = `<div data-section-id="hdr-1"><div class="bar"><b>Brand</b><nav class="links"><a>One</a><a>Two</a></nav></div><div class="menu">Services Portfolio Contact</div><div class="wide"></div><div class="tall"></div><div style="height:1200px"></div></div>`

/* The same header as a real page has it: wrapped as SectionWrapper wraps a
   .storelib section, with the section after it. */
const wrap = (inner) => `<div data-section="" class="relative w-full isolate overflow-x-clip">${inner}</div>`
const NAV = `<div data-section-id="nav-1" style="display:flex;gap:16px;align-items:center;background:#111;color:#fff;padding:16px;height:32px">
  <button id="pm-btn" popovertarget="pm">Menu</button><div popover id="pm" class="pm">Services</div>
  <button id="dg-btn" commandfor="dg" command="show-modal">Contact</button><dialog id="dg" class="dg">Write to us</dialog>
  <div class="dd"><button id="dd-btn">Shop</button><div class="dd__panel" id="dd-panel"></div></div>
</div>`
const NEXT = `<div data-section-id="next-1" style="background:#0ea5e9;height:600px"></div>`
const navCss = cssForInstance(scopeCss(AGENT_CSS, { type: "site_header" }).value, "nav-1")

const page = (canvas) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${appCss}</style><style>body{margin:0;background:#eef1f5}${sectionCss}${navCss}</style></head><body><div id="guard"></div>
${canvas
  ? `<header id="chrome" style="position:relative;z-index:50;height:56px;background:#1a1a2e"></header>
     <main style="display:flex;justify-content:center;height:calc(100vh - 56px);padding:24px;box-sizing:border-box">
       <div id="frame" class="wb-canvas-frame relative overflow-hidden" style="width:${canvas === "stack" ? 1100 : canvas}px;max-width:100%;height:min(900px,100%)">
         <div id="scroller" class="relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden w-full h-full">
           ${canvas === "stack" ? `<div class="@container" data-section-box="">${wrap(NAV)}</div><div class="@container" data-section-box="">${wrap(NEXT)}</div>` : `<div class="@container">${SECTION}</div>`}
         </div>
       </div>
     </main>`
  : `<div class="@container">${SECTION}</div>`}
<script>${GUARD.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const rect = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } })

for (const [label, width] of [["desktop canvas", 1100], ["phone canvas", 390]]) {
  console.log(`\n${label}, editor window 1440 × 900`)
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.setContent(page(width), { waitUntil: "load" })
  const frame = await rect(p, "#frame")
  const menu = await rect(p, `[data-section-id="hdr-1"] .menu`)
  expect(menu.x === frame.x && menu.y === frame.y && menu.w === frame.w && menu.h === frame.h, "a fixed full-screen menu covers exactly the canvas", { frame, menu })
  const onChrome = await p.evaluate(() => document.elementFromPoint(20, 20)?.id)
  expect(onChrome === "chrome", "the editor's bar is still on top of it", onChrome)
  const outside = await p.evaluate(({ x, y, w, h }) => {
    const pts = [[x - 8, y + 20], [x + w + 8, y + 20], [x + 20, y + h + 8]].filter(([a, b]) => a > 0 && b > 0 && a < innerWidth && b < innerHeight)
    return pts.map(([a, b]) => document.elementFromPoint(a, b)?.closest("[data-section-id]") ? "section" : "editor")
  }, frame)
  expect(outside.every((s) => s === "editor"), "nothing of the section is drawn outside the card", outside)
  await p.$eval("#scroller", (e) => { e.scrollTop = 900 })
  const scrolled = await rect(p, `[data-section-id="hdr-1"] .menu`)
  expect(scrolled.y === frame.y, "scrolled down, the menu is still where the screen is", { scrolled, frame })
  const wide = await rect(p, `[data-section-id="hdr-1"] .wide`)
  expect(wide.w <= frame.w, "100vw is the canvas's width", { wide: wide.w, canvas: frame.w })
  const tall = await rect(p, `[data-section-id="hdr-1"] .tall`)
  expect(Math.abs(tall.h - frame.h) <= 1, "100vh is the canvas's height", { tall: tall.h, canvas: frame.h })
  const links = await p.$eval(`[data-section-id="hdr-1"] .links`, (e) => getComputedStyle(e).display)
  expect(links === (width < 768 ? "none" : "flex"), "a width media query answers to the canvas", links)
  await p.close()
}

console.log("\nmenus in a real page of sections, editor window 1440 × 900")
{
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.setContent(page("stack"), { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 150)) // the guard mounts in an effect
  const frame = await rect(p, "#frame")
  const panel = await rect(p, "#dd-panel")
  const at = (x, y) => p.evaluate((x, y) => document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.closest("[data-section-id]")?.getAttribute("data-section-id"), x, y)
  const below = panel.y + panel.h - 20
  await p.mouse.move(5, 5)
  expect(await at(panel.x + 20, below) === "next-1", "control: untouched, the next section is on top (a closed menu would be hidden)", await at(panel.x + 20, below))
  await p.hover("#dd-btn")
  expect(await at(panel.x + 20, below) === "dd-panel", "hovered, a header's dropdown hangs over the next section, uncut", await at(panel.x + 20, below))
  await p.mouse.move(5, 5)
  await p.focus("#dd-btn")
  expect(await at(panel.x + 20, below) === "dd-panel", "and with the keyboard on it too", await at(panel.x + 20, below))
  await p.$eval("#dd-btn", (b) => b.blur())
  await p.$eval("#dd-btn", (b) => b.setAttribute("aria-expanded", "true"))
  expect(await at(panel.x + 20, below) === "dd-panel", "and when a script opened it and said so with aria-expanded", await at(panel.x + 20, below))
  await p.$eval("#dd-btn", (b) => b.removeAttribute("aria-expanded"))

  await p.click("#pm-btn")
  const pm = await p.$eval("#pm", (e) => ({ open: e.hasAttribute("data-sl-open"), top: e.matches(":popover-open"), outline: getComputedStyle(e).outlineColor }))
  expect(pm.open && !pm.top, "a popover opens in the canvas, not in the top layer", pm)
  expect(pm.outline === "rgb(255, 0, 0)", "and its :popover-open styles apply", pm.outline)
  const pmr = await rect(p, "#pm")
  expect(pmr.x >= frame.x && pmr.y >= frame.y && pmr.x + pmr.w <= frame.x + frame.w && pmr.y + pmr.h <= frame.y + frame.h, "it stays inside the canvas", { pm: pmr, frame })
  expect(await at(frame.x + frame.w / 2, frame.y + frame.h / 2) === "pm", "it covers the sections after its own", await at(frame.x + frame.w / 2, frame.y + frame.h / 2))
  expect(await at(20, 20) === "chrome", "and never the editor's bar", await at(20, 20))
  await p.keyboard.press("Escape")
  expect(!(await p.$eval("#pm", (e) => e.hasAttribute("data-sl-open"))), "Escape closes it")
  await p.click("#pm-btn")
  await p.mouse.click(frame.x - 40, frame.y + 200)
  expect(!(await p.$eval("#pm", (e) => e.hasAttribute("data-sl-open"))), "a press outside it closes it too")

  await p.click("#dg-btn")
  const dg = await p.$eval("#dg", (e) => ({ open: e.open, modal: e.matches(":modal") }))
  expect(dg.open && !dg.modal, "a dialog opened as a modal opens in the canvas instead", dg)
  const dgr = await rect(p, "#dg")
  expect(dgr.x >= frame.x && dgr.x + dgr.w <= frame.x + frame.w, "centred in the canvas", { dg: dgr, frame })
  await p.close()
}

console.log("\na <style> an agent writes into the template")
{
  const file = (t) => `<template>\n<div class="x">${t}</div>\n</template>\n<style>\n.x{color:red}\n</style>\n<schema>\n{"type":"t","name":"T","category":"Content","settings":[],"presets":[{"name":"T"}]}\n</schema>\n`
  const stray = `<style>body{display:none}</style><link rel="stylesheet" href="https://example.com/a.css"><base href="https://example.com/"><p>kept</p>`
  const saved = compileSection(file(stray), { file: "sections/t.storelib" })
  expect(saved.ok === false && /<style> tag/.test(saved.errors[0].message), "a save refuses it and says where CSS goes", saved.ok ? "accepted" : saved.errors[0].message.slice(0, 60))
  const old = compileSection(file(stray), { file: "sections/t.storelib", lenient: true })
  const drawn = renderSection({ compiled: old.value, id: "s1", instance: { type: "t", settings: {}, blocks: {}, block_order: [] }, theme: {}, page: { template: "index" } }).html
  expect(!/<style|<link|<base/i.test(drawn) && drawn.includes("<p>kept</p>"), "one saved before the rule draws without it, and keeps the rest", drawn.slice(-60))
}

console.log("\nlive page, window 390 × 844")
{
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844 })
  await p.setContent(page(0), { waitUntil: "load" })
  const menu = await rect(p, `[data-section-id="hdr-1"] .menu`)
  expect(menu.x === 0 && menu.y === 0 && menu.w === 390 && menu.h === 844, "the same menu is the whole screen on a live page", menu)
  const tall = await rect(p, `[data-section-id="hdr-1"] .tall`)
  expect(tall.h === 844, "100vh is the window there", tall.h)
  const links = await p.$eval(`[data-section-id="hdr-1"] .links`, (e) => getComputedStyle(e).display)
  expect(links === "none", "and the phone layout applies", links)
  await p.close()
}

await browser.close()
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
