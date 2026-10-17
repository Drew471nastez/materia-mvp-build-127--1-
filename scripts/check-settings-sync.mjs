/**
 * ===========================================================================
 *  THE SIDEBAR FOLLOWS A SCHEMA FILE THAT CHANGED UNDER IT
 * ===========================================================================
 * scripts/render-settings-sync.tsx draws Theme settings and a section's panel
 * with the builder's own controls and the functions the builder draws them
 * with. This opens it in Chromium, reads the controls in order with what each
 * shows, replaces both schema files in place (as a save, a push or Storelib
 * AI does to an open editor), and reads them again:
 *
 *   order          the controls, top to bottom, before and after
 *   values         what each control shows: kept by id, a new one at its
 *                  default, one outside its new range at the range's end
 *   stored         the values themselves, unchanged by the schema change
 *   removed        a setting the file took away is not drawn, its value kept
 *   bound          the collection's title as the Title box's placeholder,
 *                  its picture in the picker, "From Kitchen" under each
 *   remounts       the panel's root element is the same one after the swap
 *
 *   node scripts/check-settings-sync.mjs          (SHOTS=dir keeps pictures)
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
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

const out = mkdtempSync(join(tmpdir(), "storelib-settings-sync-"))
execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-settings-sync.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty",
], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
/* The section's panel before and after, read in Node the way the builder reads it. */
const sectionFields = execFileSync("npx", ["--no-install", "tsx", join(root, "scripts/render-settings-sync-fields.ts")], { cwd: root, encoding: "utf8" })
const pageFile = join(out, "index.html")
writeFileSync(pageFile,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
  `<script>window.__sectionFields=${sectionFields.replace(/</g, "\\u003c")}</script>` +
  `<script src="probe.js"></script></body></html>`)

/* ── the browser ─────────────────────────────────────────────────────── */
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

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call("Page.enable", {})
await call("Runtime.enable", {})
await call("Emulation.setDeviceMetricsOverride", { width: 1100, height: 1600, deviceScaleFactor: 1, mobile: false })
await call("Page.navigate", { url: `file://${pageFile}` })
const js = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}`)
  return r.result.value
}
for (let i = 0; i < 80; i++) {
  if (await js("!!window.__ready")) break
  await sleep(50)
}
await sleep(150)
const errors = await js("window.__err")
if (errors.length) fail(`The page reported errors: ${errors.join(" | ")}`)
const shot = async (name) => {
  if (!SHOTS) return
  const { data } = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
}

/* Every control in a panel, top to bottom, with what it shows. */
const READ = `(() => {
  const panel = (sel) => [...document.querySelectorAll(sel + " [data-field-id]")].map((el) => {
    const thumb = el.querySelector('[data-slot="slider-thumb"]')
    const box = el.querySelector('input[type="text"]:not([type=search]), input:not([type])')
    const sw = el.querySelector('[role="switch"]')
    const img = el.querySelector("img")
    const bound = el.querySelector("[data-bound-field]")
    return {
      id: el.dataset.fieldId,
      kind: el.dataset.kind,
      top: Math.round(el.getBoundingClientRect().top),
      slider: thumb ? Number(thumb.getAttribute("aria-valuenow")) : null,
      box: box ? box.value : null,
      placeholder: box ? box.getAttribute("placeholder") : null,
      on: sw ? sw.getAttribute("aria-checked") === "true" : null,
      picture: img ? img.getAttribute("src").slice(0, 24) : null,
      bound: bound ? bound.dataset.boundField + ":" + (bound.querySelector(":scope > p, :scope > button")?.textContent ?? "") : null,
    }
  })
  return {
    groups: [...document.querySelectorAll("#groups [data-group]")].map((g) => g.dataset.group),
    layout: panel("#layout"), promo: panel("#promo"), section: panel("#section"),
  }
})()`

let passed = 0
const failures = []
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const line = (rows) => rows.map((r) => `${r.id}${r.slider !== null ? `=${r.slider}` : r.on !== null ? `=${r.on}` : r.box !== null ? `="${r.box}"${r.placeholder ? `(${r.placeholder})` : ""}` : ""}`).join(", ")
const byId = (rows, id) => rows.find((r) => r.id === id)

await js("(window.__panelRoot = document.querySelector('#section > div'), true)")
const a = await js(READ)
await shot("before")
const storedBefore = await js("window.__storedValues()")
await js("window.__swapSchemas()")
await sleep(120)
const b = await js(READ)
await shot("after")
const storedAfter = await js("window.__storedValues()")
const sameRoot = await js("window.__panelRoot === document.querySelector('#section > div') && document.contains(window.__panelRoot)")

console.log("\nTheme settings: config/settings_schema.json changed")
console.log(`        groups before: ${a.groups.join(", ")}`)
console.log(`        groups after:  ${b.groups.join(", ")}`)
console.log(`        Layout before: ${line(a.layout).slice(0, 220)}`)
console.log(`        Layout after:  ${line(b.layout)}`)
console.log(`        Promo after:   ${line(b.promo)}`)
check("the theme's own group is first, Storelib's after it in their order", b.groups[0] === "promo_strip" && b.groups.slice(1).join() === a.groups.join(), b.groups)
check("Layout's sliders in the file's order, Storelib's left out after them", b.layout[0].id === "section_gap" && b.layout[1].id === "page_width" && b.layout[2].id === "card_gap" && b.layout.length === a.layout.length + 1, b.layout.map((r) => r.id))
check("page_width stored 1600, its range now ends at 1400: shown at 1400", byId(a.layout, "page_width").slider === 1600 && byId(b.layout, "page_width").slider === 1400, [byId(a.layout, "page_width").slider, byId(b.layout, "page_width").slider])
check("section_gap kept by id: 24 before and after", byId(a.layout, "section_gap").slider === 24 && byId(b.layout, "section_gap").slider === 24)
check("the new slider at its default, 16", byId(b.layout, "card_gap")?.slider === 16)
check("the new group's controls: a heading, the switch on, the words, the size", line(b.promo) === 'promo_strip_header_1, promo_show=true, promo_text=""(Free shipping over $50), promo_size=14' || (byId(b.promo, "promo_show")?.on === true && byId(b.promo, "promo_size")?.slider === 14), line(b.promo))

console.log("\nA section's <schema> changed")
console.log(`        before: ${line(a.section)}`)
console.log(`        after:  ${line(b.section)}`)
check("the controls in the file's new order, grouped under its headings", b.section.map((r) => r.id).join() === "hdr_look,padding_top,gap,show_count,hdr_content,collection,title,image", b.section.map((r) => r.id))
check("padding_top stored 160, range now 0 to 96: shown at 96", byId(a.section, "padding_top").slider === 160 && byId(b.section, "padding_top").slider === 96)
check("show_count kept by id: off before and after", byId(a.section, "show_count").on === false && byId(b.section, "show_count").on === false)
check("the new slider at its default, 12", byId(b.section, "gap")?.slider === 12)
check("the removed setting is not drawn", !!byId(a.section, "old_words") && !byId(b.section, "old_words"))
check("the stored values are exactly as they were: nothing clamped, nothing dropped", JSON.stringify(storedBefore) === JSON.stringify(storedAfter) && storedAfter.section.padding_top === 160 && storedAfter.section.old_words === "kept but not drawn" && storedAfter.theme.page_width === 1600, storedAfter)
check("the panel was changed in place, not drawn again from nothing", sameRoot === true)

console.log("\nA picked collection, in the sidebar")
const title = byId(b.section, "title")
const image = byId(b.section, "image")
console.log(`        title: placeholder "${title?.placeholder}", ${title?.bound}`)
console.log(`        image: picture ${image?.picture}, ${image?.bound}`)
check("the Title box shows the collection's name while it follows it", title?.placeholder === "Kitchen" && title?.box === "" && /collection:From Kitchen/.test(title?.bound ?? ""), title)
check("the picker shows the collection's picture, nothing uploaded", !!image?.picture && image.picture.startsWith("data:image/svg") && /collection:From Kitchen/.test(image?.bound ?? ""), image)

/* Typing a title of its own: Reset to collection appears; pressing it empties the value. */
await js(`(() => { const el = document.querySelector('#section [data-field-id="title"] input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "Pans"); el.dispatchEvent(new Event("input", { bubbles: true })) })()`)
await sleep(80)
const typed = await js(READ)
const reset = byId(typed.section, "title")
check("a title of its own: the box holds it, and Reset to collection is offered", reset?.box === "Pans" && /own:Reset to collection/.test(reset?.bound ?? ""), reset)
await js(`(() => { const b = [...document.querySelectorAll('#section [data-field-id="title"] button')].find((x) => /Reset to collection/.test(x.textContent)); b.click() })()`)
await sleep(80)
const back = byId((await js(READ)).section, "title")
const storedBack = await js("window.__storedValues()")
check("Reset to collection empties it, and the collection's name is back", back?.box === "" && back?.placeholder === "Kitchen" && storedBack.section.title === "", { back, stored: storedBack.section.title })
await shot("bound")

ws.close()
proc.kill()
console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
