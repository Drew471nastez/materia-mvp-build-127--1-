/**
 * ===========================================================================
 *  AN IMAGE SETTING: THE PICKER, AND AN ADDRESS BOX UNDER IT
 * ===========================================================================
 * The owner's report: an AI coded a logo as a text box holding an address.
 * An image setting is drawn as the image picker with the address box under
 * it; typing an address sets the picture, and choosing a file replaces the
 * address. Each of those, as something a browser does and a number it
 * reads back, on a computer and on a phone:
 *
 *   where the box is      under the picker, its full width, the gap between
 *   typing an address     the setting holds it, and the picker shows it
 *   half an address       not sent; leaving the box says why
 *   choosing a file       the setting becomes the file's address and the box
 *                         under the picker shows that address
 *
 *   node scripts/check-image-setting.mjs          (SHOTS=dir keeps pictures)
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

const out = mkdtempSync(join(tmpdir(), "storelib-image-setting-"))
const stubs = join(root, ".image-setting-probe")
mkdirSync(stubs, { recursive: true })
/* The upload succeeds and hands back an address, so the component's own path runs end to end with no network. */
writeFileSync(join(stubs, "supabase.js"), `export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    storage: { from: () => ({
      upload: async () => { await new Promise((r) => setTimeout(r, 60)); return { error: null } },
      getPublicUrl: (path) => ({ data: { publicUrl: "https://cdn.test/storage/v1/object/public/store-builder-images/" + path } }),
    }) },
  }
}
`)
writeFileSync(join(stubs, "sonner.js"), `export const toast = Object.assign(() => {}, { error: () => {}, success: () => {} })\n`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-image-setting.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
    `--alias:sonner=${join(stubs, "sonner.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const pageFile = join(out, "index.html")
writeFileSync(pageFile,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
  `<script src="probe.js"></script></body></html>`)

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
  await call("Page.navigate", { url: `file://${pageFile}` })
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
  const type = (text) => call("Input.insertText", { text })
  const shot = async (name) => {
    if (!SHOTS) return
    const { data } = await call("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
  }
  return { js, type, shot }
}

let passed = 0
const failures = []
const check = (label, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

/* One wrapper's control, measured. */
const READ = (wrap) => `(() => {
  const w = document.getElementById(${JSON.stringify(wrap)})
  const picker = w.querySelector("[data-wb-image-picker]")
  const box = picker.querySelector("[data-wb-image-box]") || picker.querySelector(".wb-dropzone")
  const input = w.querySelector("[data-image-address]")
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) } }
  const problem = w.querySelector('[role="alert"]')
  return {
    value: w.getAttribute("data-value"),
    state: picker.getAttribute("data-wb-image-picker"),
    picker: r(picker), box: r(box), input: r(input),
    inputValue: input.value, placeholder: input.getAttribute("placeholder"),
    inputFont: parseFloat(getComputedStyle(input).fontSize),
    inputBorder: getComputedStyle(input).borderTopColor,
    problem: problem ? problem.textContent : null,
    stored: (picker.querySelector('[data-wb-image-layer="stored"]') || {}).src || null,
  }
})()`

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC"

for (const vp of [{ name: "computer", width: 1280, height: 900, phone: false }, { name: "phone", width: 390, height: 844, phone: true }]) {
  console.log(`\nOn a ${vp.name}, ${vp.width} wide`)
  const p = await open(vp)

  /* Where the box is. */
  for (const wrap of ["empty", "filled"]) {
    const m = await p.js(READ(wrap))
    const gap = m.input.t - m.picker.b
    console.log(`        ${wrap}: picker ${m.picker.w}x${m.picker.h} at ${m.picker.l}, address box ${m.input.w}x${m.input.h} at ${m.input.l}, ${gap}px under it`)
    check(`${wrap}: the address box is under the picker`, m.input.t >= m.picker.b, m)
    /* The picker keeps its own rhythm under its box: 10px under the empty dropzone, 8px under Replace and Remove. */
    check(`${wrap}: close under it, 4 to 10px`, gap >= 4 && gap <= 10, gap)
    check(`${wrap}: the same width and left edge as the picker`, m.input.w === m.picker.w && m.input.l === m.picker.l, { input: m.input, picker: m.picker })
    /* 16px type on a phone, which app/globals.css gives every field so iOS does not zoom into it. */
    check(`${wrap}: a sidebar field, 32px tall, ${vp.phone ? "16px type on a phone" : "13px type"}`, m.input.h === 32 && m.inputFont === (vp.phone ? 16 : 13), { h: m.input.h, font: m.inputFont })
    check(`${wrap}: it says what it is for`, m.placeholder === "Or paste an image link", m.placeholder)
  }
  const filled = await p.js(READ("filled"))
  check("filled: the box shows the picture's address", filled.state === "filled" && filled.inputValue === "https://cdn.test/brand/logo-ld.png", filled)
  await p.shot(`${vp.name}-rest`)

  /* Typing an address sets the picture. */
  await p.js(`document.querySelector("#empty [data-image-address]").focus()`)
  await p.type("https://cdn.test/brand/new-logo.webp")
  await sleep(150)
  const typed = await p.js(READ("empty"))
  check("typing an address sets the setting", typed.value === "https://cdn.test/brand/new-logo.webp", typed.value)
  check("and the picker shows that picture", typed.state === "filled" && typed.stored === "https://cdn.test/brand/new-logo.webp", { state: typed.state, stored: typed.stored })
  check("the box keeps what was typed", typed.inputValue === "https://cdn.test/brand/new-logo.webp", typed.inputValue)
  await p.shot(`${vp.name}-typed`)

  /* Half an address is not sent, and leaving the box says why. */
  await p.js(`(() => { const i = document.querySelector("#filled [data-image-address]"); i.focus(); i.select() })()`)
  await p.type("cdn.test/logo")
  await sleep(80)
  const half = await p.js(READ("filled"))
  check("half an address is not sent", half.value === "https://cdn.test/brand/logo-ld.png" && half.inputValue === "cdn.test/logo", { value: half.value, box: half.inputValue })
  check("and nothing is said while typing", half.problem === null, half.problem)
  await p.js(`document.querySelector("#filled [data-image-address]").blur()`)
  await sleep(80)
  const left = await p.js(READ("filled"))
  check("leaving the box says what an image link is", /starts with https:\/\//.test(left.problem ?? ""), left.problem)
  await p.shot(`${vp.name}-half`)

  /* Choosing a file replaces the address. */
  await p.js(`(async () => {
    const png = atob(${JSON.stringify(PNG)})
    const bytes = new Uint8Array(png.length)
    for (let i = 0; i < png.length; i++) bytes[i] = png.charCodeAt(i)
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], "logo.png", { type: "image/png" }))
    const input = document.querySelector('#filled input[type="file"]')
    input.files = dt.files
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })()`)
  let chosen = null
  for (let i = 0; i < 60; i++) {
    chosen = await p.js(READ("filled"))
    if (chosen.value && chosen.value.includes("/storage/v1/object/public/")) break
    await sleep(50)
  }
  check("choosing a file replaces the address in the setting", !!chosen.value && /\/storage\/v1\/object\/public\/store-builder-images\/u1\/sections\/\d+\.png$/.test(chosen.value), chosen.value)
  check("and the box under the picker shows the file's address", chosen.inputValue === chosen.value, { box: chosen.inputValue, value: chosen.value })
  check("and the old complaint is gone", chosen.problem === null, chosen.problem)
  await p.shot(`${vp.name}-chosen`)
}

ws.close()
proc.kill()
rmSync(out, { recursive: true, force: true })
console.log(`\n  ${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\n  Failed: ${failures.join(", ")}\n`)
  process.exit(1)
}
