/**
 * ===========================================================================
 *  THEME BLOCKS, MEASURED
 * ===========================================================================
 * The library's block sections, drawn by the real engine from their presets,
 * and the sidebar's block tree, in Chromium, with the numbers read back:
 *
 *   "Image with text"   the picture and the words side by side on a
 *                       computer, one above the other on a phone
 *   "Image grid"        the static title above the grid, and the grid in
 *                       three even columns, two on a phone
 *   "Three columns"     a row of three groups, each the same width
 *   the sidebar         a static row with no grip, Duplicate or Delete, the
 *                       blocks inside a group listed inside its open row,
 *                       and the row of a selected inner block opened for it
 *
 *   node scripts/check-theme-blocks.mjs          (SHOTS=dir keeps pictures)
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? ""
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

const out = mkdtempSync(join(tmpdir(), "storelib-theme-blocks-"))
const stubs = join(root, ".theme-blocks-probe")
mkdirSync(stubs, { recursive: true })
/* The compile cache keys on a hash; a browser bundle has no node:crypto, so a plain one stands in. */
writeFileSync(join(stubs, "crypto.js"), `export function createHash() {
  let s = ""
  return { update(x) { s += x; return this }, digest() { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(16) } }
}
`)
writeFileSync(join(stubs, "supabase.js"), `export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }) } } }\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-theme-blocks.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;globalThis.Buffer=globalThis.Buffer||{byteLength:function(s){return new TextEncoder().encode(s).length}};',
    '--define:process.env.NODE_ENV="production"',
    `--alias:node:crypto=${join(stubs, "crypto.js")}`,
    `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const html = join(out, "page.html")
writeFileSync(html,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
  `<script src="probe.js"></script></body></html>`)

const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => { buf += d.toString(); const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(timer); resolve(m[0]) } })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) => new Promise((resolve, reject) => {
  const n = ++id
  pending.set(n, { resolve, reject })
  ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
})

async function open({ width, height, phone }) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: phone })
  await call("Page.navigate", { url: `file://${html}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) fail(`The page threw (${width}): ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}`)
    return r.result.value
  }
  for (let i = 0; i < 100; i++) { if (await js("!!window.__ready")) break; await sleep(50) }
  const errors = await js("window.__err")
  if (errors.length) fail(`The page reported errors: ${errors.join(" | ")}`)
  const shot = async (name) => {
    if (!SHOTS) return
    const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
  }
  return { js, shot }
}

let passed = 0
const failures = []
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

const READ = `(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const sec = (k) => document.querySelector('[data-probe-section="' + k + '"]')
  const iwt = sec("blocks_section0")
  const row = iwt && iwt.querySelector('[data-block-type="group"] > .sl-group--row')
  const kids = row ? [...row.children].filter((c) => c.classList.contains("sl-block")) : []
  const grid = sec("image_grid1")
  const cells = grid ? [...grid.querySelectorAll(".grid > .sl-block")] : []
  const three = sec("blocks_section2")
  const cols = three ? [...three.querySelectorAll('.sl-group--row > .sl-block[data-block-type="group"]')] : []
  const side = document.getElementById("sidebar")
  const rowOf = (k) => side.querySelector('[data-block-row="' + k + '"]')
  const btn = (k, label) => rowOf(k) && [...rowOf(k).querySelectorAll(":scope > div > div > button")].some((b) => (b.getAttribute("aria-label") || "").startsWith(label))
  return {
    iwt: kids.map(box),
    gridTitle: box(grid && grid.querySelector('.head [data-block-id="title"]')),
    gridFirst: box(cells[0]),
    cells: cells.map(box),
    cols: cols.map(box),
    staticGrip: !!(rowOf("title") && rowOf("title").querySelector("[data-block-grip]")),
    staticDuplicate: btn("title", "Duplicate"), staticDelete: btn("title", "Delete"),
    groupGrip: !!(rowOf("row") && rowOf("row").querySelector("[data-block-grip]")),
    innerShown: !!side.querySelector('[data-probe-children="row"] [data-block-row="row/b"]'),
    innerInsideGroup: (() => { const g = box(rowOf("row")); const i = box(side.querySelector('[data-block-row="row/b"]')); return !!g && !!i && i.y > g.y && i.y + i.h <= g.y + g.h && i.x > g.x })(),
    hiddenDim: (() => { const t = rowOf("pic") && rowOf("pic").querySelector("[data-block-toggle]"); return t ? getComputedStyle(t).opacity : null })(),
    addBlock: !!side.querySelector('[data-probe-children="row"] [data-add-block]'),
  }
})()`

console.log("\nOn a computer, 1280 wide")
const desk = await open({ width: 1280, height: 900, phone: false })
const d = await desk.js(READ)
await desk.shot("theme-blocks-desktop")
/* Side by side: one left of the other, and their heights overlapping (the preset centres the words against the picture). */
check("Image with text: the picture and the words side by side", d.iwt.length === 2 && d.iwt[0].x + d.iwt[0].w <= d.iwt[1].x && d.iwt[1].y < d.iwt[0].y + d.iwt[0].h && d.iwt[0].y < d.iwt[1].y + d.iwt[1].h, d.iwt)
check("and the words centred against the picture, as the preset says", d.iwt.length === 2 && Math.abs((d.iwt[0].y + d.iwt[0].h / 2) - (d.iwt[1].y + d.iwt[1].h / 2)) <= 1, d.iwt)
check("and the same width each", d.iwt.length === 2 && Math.abs(d.iwt[0].w - d.iwt[1].w) <= 1, d.iwt)
check("Image grid: the static title sits above the grid", !!d.gridTitle && !!d.gridFirst && d.gridTitle.y + d.gridTitle.h <= d.gridFirst.y, { t: d.gridTitle, f: d.gridFirst })
check("in three even columns", d.cells.length === 3 && new Set(d.cells.map((c) => c.y)).size === 1 && Math.max(...d.cells.map((c) => c.w)) - Math.min(...d.cells.map((c) => c.w)) <= 1, d.cells)
check("Three columns: three groups in a row, each the same width", d.cols.length === 3 && new Set(d.cols.map((c) => c.y)).size === 1 && Math.max(...d.cols.map((c) => c.w)) - Math.min(...d.cols.map((c) => c.w)) <= 1, d.cols)
check("the sidebar's static row has no grip, Duplicate or Delete", !d.staticGrip && !d.staticDuplicate && !d.staticDelete, d)
check("a group's row drags", d.groupGrip)
check("the blocks inside a group are listed inside its open row", d.innerShown && d.innerInsideGroup, d)
check("a selected inner block opened the group's row for it", d.innerShown)
check("each level has its own Add block", d.addBlock)
check("a hidden block's row is dimmed", d.hiddenDim === "0.5", d.hiddenDim)

console.log("\nOn a phone, 390 wide")
const phone = await open({ width: 390, height: 844, phone: true })
const p = await phone.js(READ)
await phone.shot("theme-blocks-phone")
check("Image with text: the picture above the words", p.iwt.length === 2 && p.iwt[0].y + p.iwt[0].h <= p.iwt[1].y, p.iwt)
check("each the full width", p.iwt.length === 2 && Math.abs(p.iwt[0].w - p.iwt[1].w) <= 1 && p.iwt[0].w > 300, p.iwt)
check("Image grid: two columns on a phone", p.cells.length === 3 && p.cells[0].y === p.cells[1].y && p.cells[2].y > p.cells[0].y, p.cells)
check("Three columns: stacked on a phone", p.cols.length === 3 && p.cols[0].y < p.cols[1].y && p.cols[1].y < p.cols[2].y, p.cols)

ws.close()
proc.kill()
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
