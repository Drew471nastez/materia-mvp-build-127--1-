/**
 * ===========================================================================
 *  DOWNLOAD IN THE PRODUCT EDITOR'S FILE MENU, MEASURED
 * ===========================================================================
 * "I want to download the files myself, the digital files I have there."
 * The real editor (scripts/render-product-editor.tsx, a saved product with
 * two files) at 1440 and 390, over http, with the owner route and storage
 * stood in by this script's server. Storage's answer is the one Supabase
 * gives a signed URL with `download=<name>`: Content-Disposition attachment,
 * filename and RFC 5987 filename*. Chromium saves for real (CDP download
 * events), so the saved name is what a browser actually chose.
 *
 *   1440  the menu is Download, Rename, Delete; Download shows "Preparing
 *         download" on the row, the route is asked with the name the row
 *         shows, the browser saves it under that name, the page stays, and
 *         no row moves. A renamed file with & # and an accent saves whole.
 *         A refusal is red on the row, in the server's words. A file still
 *         uploading saves the picked file, with no request at all.
 *   390   the same menu as a sheet, 52px rows, Download first; a browser on
 *         a phone saves the same way. In the iOS app (Capacitor bridge
 *         present, Browser plugin not built in) the page goes to the signed
 *         link, which Capacitor hands to Safari, and the toast says Files;
 *         in the Android app the Browser plugin opens it and the toast says
 *         Downloads.
 *
 *   node scripts/check-file-download.mjs        (SHOTS_DIR=dir for pictures)
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
const fontDir = (faces.match(/url\(file:\/\/([^)]*\/static\/media)\//) ?? [])[1]
const inter = fontDir ? faces.split(`file://${fontDir}/`).join("/font/") : ""
const stubs = mkdtempSync(join(tmpdir(), "storelib-file-download-"))
const shots = process.env.SHOTS_DIR || join(stubs, "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* An uploader that goes to "uploading" and stays there, so a row is mid upload. */
writeFileSync(join(stubs, "chunked-upload.js"), `
export async function computeSHA256() { return "probe" }
export class DirectUploader {
  constructor(o) { this.o = o; this.status = "idle" }
  setStatus(s) { this.status = s; this.o.onStatusChange && this.o.onStatusChange(s) }
  start() { this.setStatus("uploading"); this.o.onProgress && this.o.onProgress(30, Math.round(this.o.file.size * 0.3), this.o.file.size); return new Promise(() => {}) }
  abort() { this.setStatus("aborted"); this.o.onError && this.o.onError({ code: "ABORTED", message: "cancelled" }) }
  pause() {} resume() {} getStatus() { return this.status } destroy() {}
}
`)
/* The Browser plugin: "missing" answers as an app built without it does. */
writeFileSync(join(stubs, "browser.js"), `
export const Browser = {
  async open({ url }) {
    if (window.__browserMode === "missing") throw Object.assign(new Error('"Browser" plugin is not implemented on ios'), { code: "UNIMPLEMENTED" })
    window.__browserOpened = url
  },
  async close() {},
}
`)
writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/app/products/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const redirect = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }\n`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-product-editor.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    "next/navigation": join(stubs, "navigation.js"),
    "next/link": join(stubs, "link.jsx"),
    "next/image": join(stubs, "image.jsx"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") }))
      b.onResolve({ filter: /storage\/chunked-upload$/ }, () => ({ path: join(stubs, "chunked-upload.js") }))
      b.onResolve({ filter: /^@capacitor\/browser$/ }, () => ({ path: join(stubs, "browser.js") }))
    },
  }],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`

/* The owner route and storage, stood in. */
const state = { mode: "ok", api: [], signed: [] }
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (fontDir && url.pathname.startsWith("/font/")) {
    try {
      const body = readFileSync(join(fontDir, decodeURIComponent(url.pathname.slice(6))))
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(body)
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  const api = url.pathname.match(/^\/api\/products\/files\/([^/]+)\/download$/)
  if (api) {
    const name = url.searchParams.get("name") ?? ""
    state.api.push({ id: decodeURIComponent(api[1]), name })
    const answer = () => {
      if (state.mode === "flagged") {
        res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" })
        return res.end(JSON.stringify({ error: "The virus scan flagged this file, so it cannot be downloaded." }))
      }
      const origin = `http://${req.headers.host}`
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
      res.end(JSON.stringify({ success: true, downloadUrl: `${origin}/storage/v1/object/sign/digital-products/${api[1]}?token=t0k&download=${encodeURIComponent(name)}`, fileName: name, expiresIn: 120 }))
    }
    return void setTimeout(answer, 450)
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/")) {
    const download = url.searchParams.get("download") ?? ""
    state.signed.push(download)
    const enc = encodeURIComponent(download)
    /* What Supabase Storage answers a signed URL with download=<name>. */
    res.writeHead(200, { "content-type": "application/zip", "content-disposition": `attachment; filename=${enc}; filename*=UTF-8''${enc};` })
    return res.end(Buffer.alloc(2048, 7))
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

/* A UTF-8 locale: without one Chromium saves any non-ASCII name as "download", whatever the header says. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } })
const cdp = await browser.target().createCDPSession()
const downloads = []
const saveDir = join(stubs, "saved")
mkdirSync(saveDir, { recursive: true })
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: saveDir, eventsEnabled: true })
cdp.on("Browser.downloadWillBegin", (e) => downloads.push({ name: e.suggestedFilename, url: e.url }))

const FIRST = "portrait-presets-lightroom.zip"
const SECOND = "portrait-presets-capture-one.zip"

const rowOf = (p, name) =>
  p.evaluate((name) => {
    const li = [...document.querySelectorAll("[data-file-row]")].find((r) => r.querySelector("p")?.textContent === name || r.querySelector("input")?.value === name)
    if (!li) return null
    const b = li.getBoundingClientRect()
    const meta = li.querySelector("[data-file-meta]")
    return { top: +b.top.toFixed(2), h: +b.height.toFixed(2), meta: meta?.textContent ?? "", red: meta?.querySelector("[data-file-download='error']") ? getComputedStyle(meta.querySelector("[data-file-download='error']")).color : null }
  }, name)
/* Each row's top and height inside the list, so scrolling a row into view is not read as it moving. */
const rowsGeometry = (p) =>
  p.$$eval("[data-file-row]", (r) => {
    const list = document.querySelector("[data-file-list]").getBoundingClientRect().top
    return r.map((x) => { const b = x.getBoundingClientRect(); return [+(b.top - list).toFixed(1), +b.height.toFixed(1)] })
  })

async function openMenu(p, name, phone) {
  const sel = `button[aria-label="Actions for ${name}"]`
  await p.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "center" }), sel)
  await sleep(150)
  if (phone) await p.tap(sel)
  else await p.click(sel)
  await sleep(phone ? 520 : 220)
  return p.evaluate((phone) => {
    const rows = phone ? [...document.querySelectorAll("[data-action-sheet] button, [data-action-sheet] a")] : [...document.querySelectorAll("[data-action-list] [role='menuitem']")]
    return rows.map((r) => ({ text: r.textContent.trim(), h: Math.round(r.getBoundingClientRect().height) }))
  }, phone)
}
async function pick(p, label, phone) {
  if (phone) {
    const handle = await p.evaluateHandle((label) => [...document.querySelectorAll("[data-action-sheet] button")].find((b) => b.textContent.trim() === label), label)
    await handle.tap()
  } else {
    const handle = await p.evaluateHandle((label) => [...document.querySelectorAll("[data-action-list] [role='menuitem']")].find((b) => b.textContent.trim() === label), label)
    await handle.click()
  }
}
const waitFor = async (fn, ms = 4000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await sleep(50)
  }
  return false
}

try {
  /* ── Desktop ────────────────────────────────────────────────────── */
  {
    console.log("\ndesktop 1440")
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport({ width: 1440, height: 900 })
    await p.goto(origin, { waitUntil: "load" })
    await p.waitForSelector("[data-file-row]")
    await sleep(600)

    const items = await openMenu(p, FIRST, false)
    expect(items.map((i) => i.text).join(",") === "Download,Rename,Delete", "the menu is Download, Rename, Delete", items.map((i) => i.text))
    await p.screenshot({ path: join(shots, "file-download-1440-menu.png") })
    const before = await rowsGeometry(p)
    const url0 = p.url()
    state.api.length = 0
    downloads.length = 0
    await pick(p, "Download", false)
    await sleep(120)
    const preparing = await rowOf(p, FIRST)
    expect(/^Preparing download$/.test(preparing.meta), "the row says Preparing download while the link is asked for", preparing.meta)
    await p.screenshot({ path: join(shots, "file-download-1440-preparing.png") })
    await waitFor(async () => downloads.length > 0)
    await sleep(200)
    expect(state.api.length === 1 && state.api[0].id === "a1" && state.api[0].name === FIRST, "the owner route is asked once, for this file, with the name the row shows", state.api)
    expect(downloads[0]?.name === FIRST, "the browser saves it under the file's name", downloads)
    expect(p.url() === url0, "the page stays where it is")
    const after = await rowsGeometry(p)
    expect(JSON.stringify(before) === JSON.stringify(after), "no row moved or changed height", { before, after })
    expect((await rowOf(p, FIRST)).meta === "45.8 MB", "and the line is the size again", (await rowOf(p, FIRST)).meta)

    /* Renamed with & # and an accent: the name reaches the browser whole. */
    await openMenu(p, SECOND, false)
    await pick(p, "Rename", false)
    await sleep(150)
    await p.keyboard.down("Control")
    await p.keyboard.press("KeyA")
    await p.keyboard.up("Control")
    const odd = "Café & Bass #2 + presets.zip"
    await p.keyboard.type(odd)
    await p.keyboard.press("Enter")
    await sleep(150)
    state.api.length = 0
    downloads.length = 0
    await openMenu(p, odd, false)
    await pick(p, "Download", false)
    await waitFor(async () => downloads.length > 0)
    expect(state.api[0]?.name === odd && downloads[0]?.name === odd, "a renamed file with & # + and an accent saves under that name, whole", { asked: state.api[0]?.name, saved: downloads[0]?.name })

    /* A refusal. */
    state.mode = "flagged"
    const beforeErr = await rowsGeometry(p)
    await openMenu(p, FIRST, false)
    await pick(p, "Download", false)
    await sleep(700)
    const refused = await rowOf(p, FIRST)
    expect(/virus scan flagged this file/.test(refused.meta) && refused.red === "rgb(180, 35, 24)", "a refusal is on the row, red, in the server's words", refused)
    expect(JSON.stringify(beforeErr) === JSON.stringify(await rowsGeometry(p)), "and nothing moves for it either")
    await p.screenshot({ path: join(shots, "file-download-1440-refused.png") })
    state.mode = "ok"

    /* A file still uploading: the picked file itself, no request. */
    const tmp = join(stubs, "fresh-mix.wav")
    writeFileSync(tmp, Buffer.alloc(1_300_000, 3))
    const input = await p.$("#file-input")
    await input.uploadFile(tmp)
    await sleep(400)
    const up = await rowOf(p, "fresh-mix.wav")
    expect(!!up && /of/.test(up.meta), "a new file is uploading in its row", up)
    const upItems = await openMenu(p, "fresh-mix.wav", false)
    expect(upItems.map((i) => i.text).join(",") === "Download,Cancel upload", "its menu is Download, Cancel upload", upItems.map((i) => i.text))
    await p.screenshot({ path: join(shots, "file-download-1440-uploading-menu.png") })
    state.api.length = 0
    downloads.length = 0
    await pick(p, "Download", false)
    await waitFor(async () => downloads.length > 0)
    expect(downloads[0]?.name === "fresh-mix.wav" && downloads[0]?.url.startsWith("blob:") && state.api.length === 0, "it saves the picked file from the page, with no request", { downloads, api: state.api.length })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── Phone browser, then the two apps ───────────────────────────── */
  for (const run of [
    { name: "phone browser 390", platform: null },
    { name: "iOS app 390 (no Browser plugin)", platform: "ios", browserMode: "missing" },
    { name: "Android app 390", platform: "android", browserMode: "ok" },
  ]) {
    console.log(`\n${run.name}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    if (run.platform) {
      await p.evaluateOnNewDocument((platform, mode) => {
        window.__browserMode = mode
        /* What each shell injects before the page runs: its bridge, which is how
           @capacitor/core decides the platform once it loads, and the Capacitor
           global the page reads before then. */
        if (platform === "android") window.androidBridge = { postMessage() {} }
        else window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: {} }
      }, run.platform, run.browserMode)
    }
    await p.goto(origin, { waitUntil: "load" })
    await p.waitForSelector("[data-file-row]")
    await sleep(700)
    const items = await openMenu(p, FIRST, true)
    expect(items[0]?.text === "Download" && items.map((i) => i.text).join(",") === "Download,Rename,Delete" && items.every((i) => i.h >= 52), "the sheet is Download, Rename, Delete, every row 52px or more", items)
    if (!run.platform) await p.screenshot({ path: join(shots, "file-download-390-sheet.png") })
    const btn = await p.evaluate((name) => { const b = document.querySelector(`button[aria-label="Actions for ${name}"]`).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)] }, FIRST)
    state.api.length = 0
    state.signed.length = 0
    downloads.length = 0
    const url0 = p.url()
    await pick(p, "Download", true)
    await sleep(700)
    const preparing = await rowOf(p, FIRST)
    if (!run.platform) {
      expect(/^Preparing download$/.test(preparing.meta) || downloads.length > 0, "the row says Preparing download once the sheet has gone", preparing.meta)
      await p.screenshot({ path: join(shots, "file-download-390-preparing.png") })
      await waitFor(async () => downloads.length > 0)
      expect(downloads[0]?.name === FIRST && p.url() === url0, "a phone browser saves it under its name, and stays on the page", downloads)
      expect(btn[0] >= 44 && btn[1] >= 44, "the row's menu button is 44px", btn)
    } else if (run.platform === "ios") {
      await waitFor(async () => state.signed.length > 0)
      expect(state.signed[0] === FIRST, "the app goes to the signed link itself, which Capacitor hands to Safari", state.signed)
      await sleep(400)
      const toast = await p.evaluate(() => document.body.innerText)
      const shown = await p.evaluate(() => { const el = [...document.querySelectorAll("body *")].find((e) => e.childElementCount === 0 && e.textContent === "Tap Download to save it to Files"); return el ? { fits: el.scrollWidth <= el.clientWidth + 1, w: el.clientWidth } : null })
      expect(/Tap Download to save it to Files/.test(toast) && !!shown?.fits, "and the toast says to tap Download for Files, whole on one line", shown)
      await p.screenshot({ path: join(shots, "file-download-390-ios-toast.png") })
    } else {
      await waitFor(async () => p.evaluate(() => !!window.__browserOpened))
      await sleep(400)
      const opened = (await p.evaluate(() => window.__browserOpened)) || "http://none/"
      expect(new URL(opened).searchParams.get("download") === FIRST && p.url() === url0, "the Browser plugin opens the signed link, and the app stays on the editor", opened)
      const toast = await p.evaluate(() => document.body.innerText)
      expect(/Saving to Downloads on this phone/.test(toast), "and the toast says Downloads", (toast.match(/[^\n]*Downloads on this phone[^\n]*/) ?? [""])[0])
      await p.screenshot({ path: join(shots, "file-download-390-android-toast.png") })
    }
    expect(state.api.length === 1 && state.api[0].name === FIRST, "the owner route was asked once, with the row's name", state.api)
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
  if (!process.env.KEEP) {
    for (const f of readdirSync(stubs)) if (f !== "shots") rmSync(join(stubs, f), { recursive: true, force: true })
  }
}
console.log(`\nscreenshots in ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed\n`)
  process.exit(1)
}
console.log("\nall checks passed\n")
void existsSync
