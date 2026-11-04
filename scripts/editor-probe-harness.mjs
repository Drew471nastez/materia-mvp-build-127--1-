/**
 * ===========================================================================
 *  ONE HARNESS, FOR EVERY PROBE THAT NEEDS THE REAL EDITOR IN A REAL BROWSER
 * ===========================================================================
 * The editor is bundled for the browser with the network and the framework's
 * server-side modules replaced by stubs, and NOTHING about the editor itself
 * is stubbed: what is measured is the code that ships.
 *
 * Extracted because it was about to be copied a third time. check-editor-
 * scroll and check-section-library each carried their own copy of these
 * hundred lines, which is a hundred lines that can drift into three
 * different ideas of what "the editor" is.
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { probeCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/**
 * The editor is bundled here, for the browser, with the network and the
 * framework's server-side modules replaced by stubs in .wb-probe/. Nothing
 * about the editor itself is stubbed.
 */
const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
const STUBS = {
  "navigation.js": `export const usePathname = () => "/website-builder/editor/probe-install"
/* Every push is kept, and told to the probe page (render-editor-probe.tsx PROBE_NAVIGATE_MS), so a probe can count navigations and play one arriving. */
export const useRouter = () => ({ push(href) { (window.probePushes = window.probePushes || []).push(href); window.dispatchEvent(new CustomEvent("probe:push", { detail: href })) }, replace() {}, refresh() {}, prefetch(href) { (window.probePrefetches = window.probePrefetches || []).push(href) }, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({ installId: "probe-install" })
export const redirect = () => {}
export const notFound = () => {}
`,
  "link.jsx": `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`,
  "image.jsx": `import React from "react"
export default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }

export const useLinkStatus = () => ({ pending: false })
`,
  "cache.js": `export const unstable_cache = (fn) => fn
export const revalidateTag = () => {}
export const revalidatePath = () => {}
`,
  "supabase-client.js": `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? undefined : chain, apply: () => chain() })
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "probe-user", email: "probe@example.invalid" } }, error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    /* PROBE_UPLOAD_URL / PROBE_UPLOAD_MS: an upload that takes a while and lands at an address the probe serves (the files chooser's drop). */
    storage: { from: () => ({ upload: async () => { await new Promise((r) => setTimeout(r, window.PROBE_UPLOAD_MS || 0)); return { data: null, error: null } }, getPublicUrl: (p) => ({ data: { publicUrl: window.PROBE_UPLOAD_URL ? window.PROBE_UPLOAD_URL + p : "" } }), remove: async () => ({ data: null, error: null }) }) },
    from: () => chain(), channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {},
  }
}
`,
  "node-crypto.js": `export function createHash() {
  let acc = ""
  return { update(s) { acc += String(s); return this }, digest() { let h = 0x811c9dc5; for (let i = 0; i < acc.length; i++) { h ^= acc.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0").repeat(4) } }
}
export function randomBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return { toString: () => Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") } }
export function randomUUID() { return crypto.randomUUID() }
export default { createHash, randomBytes, randomUUID }
`,
  "node-empty.js": `const noop = () => { throw new Error("node builtin used in the browser probe") }
export const readFileSync = noop, writeFileSync = noop, existsSync = () => false, readdirSync = () => [], mkdirSync = noop
export const join = (...p) => p.join("/"), resolve = (...p) => p.join("/"), dirname = (p) => p.split("/").slice(0, -1).join("/"), basename = (p) => p.split("/").pop(), extname = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i) }
export default {}
`,
  "buffer-shim.js": `const enc = new TextEncoder(), dec = new TextDecoder()
function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s) }
function unb64(s) { const bin = atob(s.split("-").join("+").split("_").join("/")); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a }
class Buf {
  constructor(bytes) { this.bytes = bytes }
  static from(x, encoding) { if (x instanceof Uint8Array) return new Buf(x); if (typeof x === "string") return new Buf(encoding === "base64" || encoding === "base64url" ? unb64(x) : enc.encode(x)); return new Buf(new Uint8Array(x)) }
  static isBuffer(x) { return x instanceof Buf }
  static byteLength(s) { return enc.encode(String(s)).length }
  toString(encoding) { if (encoding === "base64") return b64(this.bytes); if (encoding === "base64url") return b64(this.bytes).split("+").join("-").split("/").join("_").split("=").join(""); return dec.decode(this.bytes) }
  get length() { return this.bytes.length }
}
globalThis.Buffer = Buf
`,
}
for (const [name, body] of Object.entries(STUBS)) writeFileSync(join(stubs, name), body)
const bundle = process.env.EDITOR_BUNDLE ?? join(mkdtempSync(join(tmpdir(), "storelib-editor-bundle-")), "editor-probe.js")
if (!existsSync(bundle)) {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-editor-probe.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    `--inject:${join(stubs, "buffer-shim.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    ...(process.env.CANVAS_ORIGIN ? [`--define:process.env.NEXT_PUBLIC_CANVAS_ORIGIN=${JSON.stringify(process.env.CANVAS_ORIGIN)}`] : []),
    `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:next/cache=${join(stubs, "cache.js")}`, `--alias:@/lib/supabase/client=${join(stubs, "supabase-client.js")}`,
    `--alias:node:crypto=${join(stubs, "node-crypto.js")}`, `--alias:crypto=${join(stubs, "node-crypto.js")}`,
    `--alias:node:fs=${join(stubs, "node-empty.js")}`, `--alias:fs=${join(stubs, "node-empty.js")}`, `--alias:node:path=${join(stubs, "node-empty.js")}`, `--alias:path=${join(stubs, "node-empty.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
}
/* The build's stylesheet, or globals.css compiled on the spot: see probe-css.mjs. */
const css = await probeCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-editor-"))




export { CHROMIUM, root, fail, bundle, css, out }

/**
 * ===========================================================================
 *  A REAL RENDERING TARGET, DRIVEN OVER THE DEVTOOLS PROTOCOL
 * ===========================================================================
 * NOT `--dump-dom --virtual-time-budget`, which is what the older probes in
 * this directory use. That mode never fires requestAnimationFrame: measured,
 * 0 of 3 callbacks. Anything that animates, or that coalesces work into a
 * frame the way the sheet's viewport maths does, is INVISIBLE to it, and the
 * probe reports a component doing nothing when in truth it was never given a
 * frame to do it in.
 *
 * So: a headless target that paints, device metrics set to the phone being
 * claimed about, and the drive evaluated as a promise the protocol awaits.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = Number(process.env.CDP_PORT ?? 9455)

export async function drivePage({ width, height, head = "", body = "", drive, settleMs = 4000 }) {
  const file = join(out, `page-${Math.random().toString(36).slice(2, 8)}.html`)
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>${head}</head><body><div id="app"></div>${body}<script>window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`,
  )

  const chrome = spawn(
    CHROMIUM,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2",
      `--remote-debugging-port=${PORT}`,
      "--remote-allow-origins=*",
      `--window-size=${width},${height}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  )
  let stderr = ""
  chrome.stderr.on("data", (d) => (stderr += String(d)))

  let version = null
  for (let i = 0; i < 60 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    } catch {
      await sleep(250)
    }
  }
  if (!version) {
    chrome.kill()
    fail(`Chromium never opened a debugging port.\n${stderr.slice(-600)}`)
  }

  try {
    const ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true })
      ws.addEventListener("error", rej, { once: true })
    })
    let id = 0
    const pending = new Map()
    let sessionId = null
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    })
    const send = (method, params = {}, session = sessionId) =>
      new Promise((resolve) => {
        const n = ++id
        pending.set(n, resolve)
        ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) }))
      })

    const { result: created } = await send("Target.createTarget", { url: "about:blank" }, null)
    const { result: attached } = await send("Target.attachToTarget", { targetId: created.targetId, flatten: true }, null)
    sessionId = attached.sessionId
    await send("Page.enable")
    await send("Runtime.enable")
    /** A real phone's viewport, not the window the OS was willing to give. */
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true })
    await send("Page.navigate", { url: `file://${file}` })
    await sleep(settleMs)

    const answer = await send("Runtime.evaluate", { expression: drive, awaitPromise: true, returnByValue: true, timeout: 120_000 })
    const r = answer.result?.result
    if (!r || r.subtype === "error" || answer.result?.exceptionDetails) {
      fail(`the drive threw: ${JSON.stringify(answer.result?.exceptionDetails ?? r)?.slice(0, 800)}`)
    }
    ws.close()
    return r.value ?? []
  } finally {
    chrome.kill()
  }
}

