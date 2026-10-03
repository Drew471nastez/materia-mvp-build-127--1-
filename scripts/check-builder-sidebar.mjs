/**
 * ===========================================================================
 *  THE BUILDER'S SIDEBAR, MEASURED
 * ===========================================================================
 * The owner's reports, each as something a browser does and a number it
 * reads back:
 *
 *   "The rows and configs in the sidebar are a bit too big, like Shopify's."
 *      Every section row's height, on a computer and on a phone.
 *   "Add section under the header, one up and one down."
 *      The groups in order, and where each Add section button is.
 *   "Hovering a section shows hide and delete, and the three dots."
 *      Each action's visibility at rest, under the pointer, and on a touch
 *      screen, where an invisible delete must not take a tap.
 *   "The hover colours toggle makes no sense."
 *      The four colour rows of a button, all in view.
 *   "Insert shop data should have no tooltip."
 *      The button's size, and whether anything appears over it on hover.
 *
 *   node scripts/check-builder-sidebar.mjs          (SHOTS=dir keeps pictures)
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

const out = mkdtempSync(join(tmpdir(), "storelib-builder-sidebar-"))
const stubs = join(root, ".builder-sidebar-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "supabase.js"), `export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }), upload: async () => ({ error: null }) }) } }
}
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-builder-sidebar.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
/*
  A HOVERING MOUSE, FOR THE COMPUTER. Tailwind's hover: is inside
  @media (hover: hover), and headless Chromium answers no whatever it is
  told (scripts/check-account-film.mjs tried its flags and CDP's media
  emulation). So the computer's page gets the stylesheet with that query
  answered yes, as a computer with a mouse answers; the phone's keeps it.
*/
const page = (mouse) => {
  const f = join(out, mouse ? "computer.html" : "phone.html")
  writeFileSync(f,
    `<!doctype html><html class="light"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${mouse ? css.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)/g, "@media all") : css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
    `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
    `<script src="probe.js"></script></body></html>`)
  return f
}

/* ── The browser ─────────────────────────────────────────────────────── */
const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
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
  await call("Emulation.setEmulatedMedia", {
    features: phone
      ? [{ name: "hover", value: "none" }, { name: "any-hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-pointer", value: "coarse" }]
      : [{ name: "hover", value: "hover" }, { name: "any-hover", value: "hover" }, { name: "pointer", value: "fine" }, { name: "any-pointer", value: "fine" }],
  })
  await call("Page.navigate", { url: `file://${page(!phone)}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) fail(`The page threw (${width}): ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}`)
    return r.result.value
  }
  for (let i = 0; i < 80; i++) {
    if (await js("!!window.__ready")) break
    await sleep(50)
  }
  const errors = await js("window.__err")
  if (errors.length) fail(`The page reported errors: ${errors.join(" | ")}`)
  const mouse = async (x, y) => call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  const shot = async (name) => {
    if (!SHOTS) return
    const { data } = await call("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
  }
  return { js, mouse, shot }
}

let passed = 0
const failures = []
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

const READ = `(() => {
  const vis = (el) => !!el && getComputedStyle(el).visibility === "visible" && el.getBoundingClientRect().width > 0
  const row = (id) => document.querySelector('[data-section-row="' + id + '"]')
  const act = (id, label) => row(id) && [...row(id).querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "").startsWith(label))
  return {
    heights: [...document.querySelectorAll("[data-section-row]")].map((r) => Math.round(r.getBoundingClientRect().height)),
    groups: [...document.querySelectorAll("[data-section-group]")].map((g) => g.getAttribute("data-section-group")),
    addButtons: [...document.querySelectorAll("[data-add-section]")].map((b) => b.closest("[data-section-group]").getAttribute("data-section-group")),
    addHeight: Math.round(document.querySelector("[data-add-section]").getBoundingClientRect().height),
    rowFont: parseFloat(getComputedStyle(row("a").querySelector("span.truncate")).fontSize),
    deleteA: vis(act("a", "Delete")), hideA: vis(act("a", "Hide")), moreA: vis(act("a", "More")),
    eyeHidden: vis(act("c", "Show")),
    headerDelete: !!act("h", "Delete"), headerMore: !!act("h", "More"),
    rowA: (() => { const r = row("a").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })(),
    colorRows: [...document.querySelectorAll('[data-button-colors] [data-color-row]')].map((r) => r.getAttribute("data-color-row")),
    colorRowHeights: [...document.querySelectorAll("[data-color-row]")].map((r) => Math.round(r.getBoundingClientRect().height)),
    stars: (() => { const r = document.querySelector('[data-color-row="Stars"]'); return r ? r.textContent : null })(),
    shopData: (() => { const b = document.querySelector("[data-dynamic-action]"); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: r.x + r.width / 2, y: r.y + r.height / 2 } })(),
    tooltip: !!document.querySelector('[role="tooltip"], [data-slot="tooltip-content"]'),
  }
})()`

console.log("\nOn a computer, 1280 wide")
const desk = await open({ width: 1280, height: 900, phone: false })
const rest = await desk.js(READ)
check("three groups, Header then Template then Footer", rest.groups.join(",") === "header,template,footer", rest.groups)
check("Add section under the header and at the end of the template, and only there", rest.addButtons.join(",") === "header,template", rest.addButtons)
check("every section row is 32px", rest.heights.length === 5 && rest.heights.every((h) => h === 32), rest.heights)
check("a row's name is 13px", rest.rowFont === 13, rest.rowFont)
check("Add section is a 32px line", rest.addHeight === 32, rest.addHeight)
check("at rest a row shows no actions", !rest.deleteA && !rest.hideA && !rest.moreA, rest)
check("a hidden section keeps its eye in view, so it can come back", rest.eyeHidden)
check("the header has no Delete and no menu", !rest.headerDelete && !rest.headerMore)
await desk.mouse(rest.rowA.x, rest.rowA.y)
await sleep(120)
const hovered = await desk.js(READ)
check("under the pointer: Hide, Delete and the menu", hovered.deleteA && hovered.hideA && hovered.moreA, { d: hovered.deleteA, h: hovered.hideA, m: hovered.moreA })
await desk.shot("sidebar-desktop-hover")
check("a button's four colours, the two hover ones included, all in view", hovered.colorRows.length === 4 && hovered.colorRows.some((n) => /hover fill/i.test(n)) && hovered.colorRows.some((n) => /hover text/i.test(n)), hovered.colorRows)
check("colour rows are at most 36px", hovered.colorRowHeights.every((h) => h <= 36), hovered.colorRowHeights)
check("a section's own colour row is drawn, following its scheme", !!hovered.stars && /Stars/.test(hovered.stars), hovered.stars)
check("the Insert shop data button is 22px square", !!hovered.shopData && hovered.shopData.w === 22 && hovered.shopData.h === 22, hovered.shopData)
await desk.mouse(hovered.shopData.x, hovered.shopData.y)
await sleep(700)
const tip = await desk.js(READ)
check("and nothing appears over it on hover", !tip.tooltip)

console.log("\nOn a phone, 390 wide, touch")
const phone = await open({ width: 390, height: 844, phone: true })
const p = await phone.js(READ)
check("every row is 44px under a thumb", p.heights.every((h) => h === 44), p.heights)
check("no invisible Delete waits under a thumb", !p.deleteA && !p.moreA)
check("a hidden section still shows its eye", p.eyeHidden)
await phone.shot("sidebar-phone")

console.log(`\n${passed} passed, ${failures.length} failed`)
ws.close()
proc.kill()
rmSync(out, { recursive: true, force: true })
if (failures.length) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
