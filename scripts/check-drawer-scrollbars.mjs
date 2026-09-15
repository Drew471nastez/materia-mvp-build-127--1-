/**
 * ===========================================================================
 *  ONE SCROLLBAR, AND NO EMPTY COLUMN BESIDE IT
 * ===========================================================================
 * Two complaints about the same strip of pixels down the right of an open
 * editor: there are two scrollbars where there should be one, and there is a
 * blank white column next to them where a scrollbar used to be.
 *
 * Neither is visible in a stylesheet. The second one is not even in our CSS:
 * Radix locks the page behind a modal with react-remove-scroll, which takes
 * the document's scrollbar away and pads the body by its width so the layout
 * underneath does not jump. That padding is the empty column. Whether it
 * shows depends on the browser's scrollbar width, which is why this has to
 * run somewhere scrollbars are REAL.
 *
 * So: no `--hide-scrollbars` here, unlike the other probes. Hiding them
 * would make every number in this file zero and every check pass.
 *
 *   pnpm build && node scripts/check-drawer-scrollbars.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-scroll-"))
const stubs = join(root, ".scroll-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/creator-page"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)

const PROBE = `<script>
function rect(el) { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }

export const useLinkStatus = () => ({ pending: false })

/* An element paints a vertical scrollbar when it reserves width for one. */
function gutter(el) { return el.offsetWidth - el.clientWidth }

function scrollbarsNow() {
  const found = []
  document.querySelectorAll("*").forEach(function (el) {
    if (!(el instanceof HTMLElement)) return
    const g = gutter(el)
    if (g <= 0) return
    const cs = getComputedStyle(el)
    if (cs.overflowY !== "auto" && cs.overflowY !== "scroll") return
    if (el.scrollHeight <= el.clientHeight) return
    found.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || "").toString().slice(0, 60),
      width: g,
      rect: rect(el),
    })
  })
  return found
}

async function run() {
  await new Promise(function (r) { setTimeout(r, 300) })
  const result = { viewport: window.innerWidth }
  const de = document.documentElement

  /*
    THE WORKSPACE DOES NOT SCROLL. It is a full-height, clipped box with the
    creator page in a frame inside it, and that is the page the empty column
    was reported on: nothing to scroll, and a white track down the edge
    anyway, because 'overflow-y: scroll' reserved one on every page whether
    it was needed or not.

    The shared harness makes its page 200vh so the OTHER probe can watch the
    body scroll, so this one shortens it first. A document with nothing to
    scroll must reserve nothing.
  */
  const page = document.getElementById("page")
  page.style.minHeight = "0"
  page.style.height = "300px"
  await new Promise(function (r) { setTimeout(r, 120) })
  result.shortPage = { docGutter: window.innerWidth - de.clientWidth }

  document.getElementById("open-editor").click()
  await new Promise(function (r) { setTimeout(r, 500) })

  /*
    Virtual time runs the timers but never ticks the document timeline, so
    the drawer sits frozen on the first frame of its slide and measures a
    full panel-width off the right edge. Finishing its animations puts it
    where it comes to rest, which is the thing being measured.
  */
  document.querySelectorAll('[data-slot="dialog-content"]').forEach(function (el) {
    el.getAnimations({ subtree: true }).forEach(function (a) { try { a.finish() } catch (e) {} })
  })
  await new Promise(function (r) { setTimeout(r, 60) })

  const body = document.body
  const bodyCS = getComputedStyle(body)
  const deCS = getComputedStyle(de)
  result.open = {
    scrollbars: scrollbarsNow(),
    bodyPaddingRight: bodyCS.paddingRight,
    bodyMarginRight: bodyCS.marginRight,
    bodyOverflow: bodyCS.overflow,
    docOverflow: deCS.overflow,
    /* What the document itself still reserves for a bar it no longer uses. */
    docGutter: window.innerWidth - de.clientWidth,
    bodyWidth: Math.round(body.getBoundingClientRect().width),
  }
  const panel = document.querySelector('[data-slot="dialog-content"]')
  result.open.panel = panel ? rect(panel) : null
  if (panel) {
    const cs = getComputedStyle(panel)
    result.open.panelGutter = gutter(panel)
    result.open.panelOverflow = cs.overflowY
  }

  const pre = document.createElement("pre"); pre.id = "out"; pre.textContent = JSON.stringify(result); document.body.append(pre)
}
if (document.readyState === "complete") run(); else addEventListener("load", run)
</script>`

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-editor-motion.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style>` +
  `<style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script>${PROBE}</body></html>`)

/* NOTE the missing --hide-scrollbars. See the note at the top of this file. */
const dom = execFileSync(CHROMIUM,
  ["--headless=new", "--no-sandbox", "--disable-gpu",
   "--window-size=1280,900", "--virtual-time-budget=12000", "--dump-dom", `file://${file}`],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe did not run.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got ?? ""}`}`)
  if (!ok) broken++
}

console.log("\na page with nothing to scroll reserves nothing")
expect(r.shortPage.docGutter === 0,
  "no empty column down the right of a page that does not scroll",
  `${r.shortPage.docGutter}px reserved`)

console.log("\nwith the drawer open, one thing scrolls")
const bars = r.open.scrollbars
expect(bars.length === 1, "exactly one scrollbar is drawn",
  `${bars.length}: ${bars.map((b) => `${b.tag}.${b.cls || "-"}@${b.rect.x}+${b.width}px`).join("  |  ")}`)
if (bars.length >= 1) {
  /*
    `scrollbar-width: thin` is the standard property and Chromium renders it
    at 10px, overriding the 8px ::-webkit-scrollbar width. Ten is the number
    to hold: the point is that it is not the system's 15px slab with a
    painted track beside it.
  */
  expect(bars.every((b) => b.width <= 10), "and it is a slim one, not a system-width bar",
    bars.map((b) => `${b.width}px`).join(", "))
}

console.log("\nand nothing pretends a scrollbar is still there")
expect(parseFloat(r.open.bodyPaddingRight || "0") === 0, "the body is not padded to fake the old scrollbar",
  r.open.bodyPaddingRight)

console.log(broken === 0
  ? "\nOne slim bar, and no empty column on a page with nothing to scroll.\n"
  : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
