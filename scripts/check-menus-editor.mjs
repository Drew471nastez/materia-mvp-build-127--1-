/**
 * ===========================================================================
 *  THE MENUS EDITOR, MEASURED
 * ===========================================================================
 * The owner's report on Menus: a wordy paragraph, a menu card holding link
 * cards holding a form (card in card in card), and "Add sub-link / Remove
 * link" text buttons. Shopify's Navigation is a list of menus, each opening
 * onto a clean tree of links. Each claim, as a number a browser reads back:
 *
 *   row height          every link row and menu row: 36px on a computer, 44px on a phone
 *   nesting indent      a sub-link's name starts 20px right of its parent's
 *   no nested cards     inside the editor, no element that is not a field or
 *                       a button has a border on all four sides and a radius
 *                       (Website Settings' own Card is the one card there is)
 *   destination         each row says where it goes, in 12px type
 *   one source          editing the Main menu (still the header's links)
 *                       writes all of them into it and points the header at it
 *
 *   node scripts/check-menus-editor.mjs          (SHOTS=dir keeps pictures)
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? ""
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* This checkout's stylesheet, compiled from source: a build is older than the classes measured here. */
process.env.PROBE_CSS = "source"
const css = await appCss(root)

const out = mkdtempSync(join(tmpdir(), "storelib-menus-editor-"))
const stubs = join(root, ".menus-editor-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "supabase.js"), `export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }) }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } }
`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-menus-editor.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
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
      ? [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }]
      : [{ name: "hover", value: "hover" }, { name: "pointer", value: "fine" }],
  })
  await call("Page.navigate", { url: `file://${page(!phone)}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) fail(`The page threw (${width}): ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}`)
    return r.result.value
  }
  for (let i = 0; i < 100; i++) {
    if (await js("!!window.__ready")) break
    await sleep(50)
  }
  await sleep(300)
  const errors = await js("window.__err")
  if (errors.length) fail(`The page reported errors: ${errors.join(" | ")}`)
  const shot = async (name) => {
    if (!SHOTS) return
    const { data } = await call("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
  }
  const click = async (x, y) => {
    await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
  }
  const type = async (text) => call("Input.insertText", { text })
  return { js, shot, click, type }
}

let passed = 0
const failures = []
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${label}${detail !== undefined ? `   (${JSON.stringify(detail)})` : ""}`) }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

/** Everything the claims need, read in one pass. `scope` is #sidebar or #settings. */
const READ = (scope) => `(() => {
  const root = document.querySelector(${JSON.stringify(scope)})
  const ed = root.querySelector("[data-menus-editor]")
  const px = (v) => parseFloat(v) || 0
  const cardLike = (el) => {
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) return false
    const cs = getComputedStyle(el)
    const sides = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].filter((w) => px(w) > 0).length
    return sides === 4 && px(cs.borderTopLeftRadius) > 0 && cs.borderTopStyle !== "none"
  }
  const cards = [...ed.querySelectorAll("*")].filter((el) => !el.closest("button") && cardLike(el)).map((el) => el.tagName.toLowerCase() + "." + String(el.className).split(" ").slice(0, 3).join("."))
  let ancestorsCards = 0
  for (let el = ed.parentElement; el && el !== root.parentElement; el = el.parentElement) if (cardLike(el)) ancestorsCards++
  const bars = [...ed.querySelectorAll("[data-link-bar]")].map((b) => Math.round(b.getBoundingClientRect().height))
  const menuRows = [...ed.querySelectorAll("[data-menu-row]")].map((r) => ({ h: Math.round(r.getBoundingClientRect().height), text: r.textContent.replace(/\\s+/g, " ").trim() }))
  const dests = [...ed.querySelectorAll("[data-link-dest]")].map((d) => ({ text: d.textContent, size: getComputedStyle(d).fontSize }))
  return { cards, ancestorsCards, bars, menuRows, dests, paragraphs: [...ed.querySelectorAll("p")].map((p) => p.textContent), rowsIds: [...ed.querySelectorAll("[data-link-row]")].map((r) => r.getAttribute("data-link-row")) }
})()`

const INDENT = (scope, parent, child) => `(() => {
  const ed = document.querySelector(${JSON.stringify(scope)}).querySelector("[data-menus-editor]")
  const a = ed.querySelector('[data-link-row="${parent}"] > div [data-link-label]').getBoundingClientRect()
  const b = ed.querySelector('[data-link-row="${child}"] [data-link-label]').getBoundingClientRect()
  return Math.round(b.left - a.left)
})()`

const centre = (scope, sel) => `(() => { const el = document.querySelector(${JSON.stringify(scope)}).querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`

console.log("\nOn a computer, 1280 wide: the builder's sidebar, opened on the Main menu")
const desk = await open({ width: 1280, height: 900, phone: false })
const side = await desk.js(READ("#sidebar"))
check("the Main menu shows the header's links, sub-links under Shop", side.rowsIds.join() === "0,1,1/0,1/1,2,3", side.rowsIds)
check("every link row is 36px", side.bars.length === 6 && side.bars.every((h) => h === 36), side.bars)
const indent = await desk.js(INDENT("#sidebar", "1", "1/0"))
check("a sub-link's name starts 20px in from its parent's", indent === 20, indent)
check("each row says where it goes, in 12px type", side.dests.length === 6 && side.dests.every((d) => d.size === "12px") && side.dests[3].text !== "" && side.dests[5].text === "instagram.com", side.dests)
check("and says nothing when that is only its own name again", side.dests[0].text === "" && side.dests[1].text === "" && side.dests[4].text === "", side.dests.map((d) => d.text))
check("in the builder's panel, one quiet box round the links, nothing boxed inside it", side.cards.length === 1, side.cards)
check("no paragraph explaining the editor", side.paragraphs.length === 0, side.paragraphs)
await desk.shot("menus-sidebar-main")

/* Open a row: two fields and nothing else. */
const row = await desk.js(centre("#sidebar", '[data-link-row="2"] [data-link-label]'))
await desk.click(row.x, row.y)
await sleep(450)
const opened = await desk.js(`(() => {
  const p = document.querySelector('#sidebar [data-link-row="2"] [data-link-panel]')
  const r = p.getBoundingClientRect()
  return { labels: [...p.querySelectorAll("span")].map((s) => s.textContent).filter((t) => t === "Label" || t === "Link"), textButtons: [...p.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => /Remove|Add sub|Add link to|Move/.test(t)), height: Math.round(r.height), cards: [...p.querySelectorAll("*")].filter((el) => { if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) return false; const cs = getComputedStyle(el); return parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderTopLeftRadius) > 0 && !el.closest("button") }).length }
})()`)
check("a clicked row opens Label and Link under it", opened.labels.join() === "Label,Link", opened)
check("and no text buttons: Add sub-link and Delete are in the row's menu", opened.textButtons.length === 0, opened.textButtons)
await desk.shot("menus-sidebar-open")

/* The row's menu. */
const dots = await desk.js(centre("#sidebar", '[data-link-row="0"] [data-link-actions]'))
await desk.click(dots.x, dots.y)
await sleep(300)
const items = await desk.js(`[...document.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent.trim())`)
check("the row's menu offers Add sub-link and Delete", items.includes("Add sub-link") && items.includes("Delete"), items)
await desk.js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`)
await sleep(300)

/* Typing into a link of the Main menu: the header's links move in, and the header reads it. */
const input = await desk.js(centre("#sidebar", '[data-link-row="2"] [data-link-panel] input'))
await desk.click(input.x, input.y)
await desk.type(" us")
await sleep(200)
const writes = await desk.js("window.__menuWrites")
const main = (writes.find((w) => w.menus) || {}).menus?.["main-menu"]
check("the first edit writes every header link into the Main menu", !!main && main.links.length === 4 && main.links[1].links.length === 2 && main.links[2].title === "About us", main)
check("and points the header at it", writes.some((w) => w.header === "main-menu"), writes.map((w) => Object.keys(w)[0]))
check("the other menus are kept", !!(writes.find((w) => w.menus) || {}).menus?.footer)

console.log("\nWebsite Settings › Navigation, the dark page, 1280 wide")
const set = await desk.js(READ("#settings"))
check("Main menu first, then the rest", set.menuRows.length === 2 && /^Main menu/.test(set.menuRows[0].text) && /^Footer/.test(set.menuRows[1].text), set.menuRows.map((r) => r.text))
check("the menu that sits in the header says so, and shows its first links", /^Main menuHeader/.test(set.menuRows[0].text) && /Home, Shop, About/.test(set.menuRows[0].text), set.menuRows[0].text)
check("every menu row is two lines, 52 to 60px", set.menuRows.every((r) => r.h >= 52 && r.h <= 60), set.menuRows.map((r) => r.h))
check("inside the page's Card, nothing else is a card", set.cards.length === 0 && set.ancestorsCards === 1, { inside: set.cards, around: set.ancestorsCards })
const mainRow = await desk.js(centre("#settings", '[data-menu-row="main-menu"]'))
await desk.click(mainRow.x, mainRow.y)
await sleep(300)
const setOpen = await desk.js(READ("#settings"))
check("a menu opens onto its links", setOpen.rowsIds.length === 6 && setOpen.bars.every((h) => h === 36), setOpen.bars)
check("still no card inside the Card", setOpen.cards.length === 0, setOpen.cards)
const setIndent = await desk.js(INDENT("#settings", "1", "1/0"))
check("the same 20px step for a sub-link", setIndent === 20, setIndent)
await desk.shot("menus-settings-open")

console.log("\nOn a phone, 390 wide")
const phone = await open({ width: 390, height: 844, phone: true })
const ph = await phone.js(READ("#sidebar"))
check("every link row is 44px under a thumb", ph.bars.length === 6 && ph.bars.every((h) => h === 44), ph.bars)
const phIndent = await phone.js(INDENT("#sidebar", "1", "1/0"))
check("a sub-link still starts 20px in", phIndent === 20, phIndent)
const phSet = await phone.js(READ("#settings"))
check("menu rows are at least 60px under a thumb", phSet.menuRows.every((r) => r.h >= 60), phSet.menuRows.map((r) => r.h))
await phone.shot("menus-phone")

console.log(`\n${passed} passed, ${failures.length} failed`)
ws.close()
proc.kill()
rmSync(out, { recursive: true, force: true })
if (failures.length) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
