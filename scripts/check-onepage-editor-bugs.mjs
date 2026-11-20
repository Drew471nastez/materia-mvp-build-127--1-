/**
 * The OnePage editor bugs of round op-editor, seen in headless Chromium.
 *
 *   UPLOADS    an upload that was stopped, or replaced by a second file,
 *              still wrote its picture when its bytes were already up
 *              (components/onepage/upload-progress useMediaUpload)
 *   INTEGRATIONS  a read of what is connected that failed showed every tool
 *              as "Not connected" or "Not set up", and a tool's sheet offered
 *              Connect over a working key (components/onepage/page-integrations,
 *              settings-integrations)
 *   SHARE      an address typed in Settings and not saved was what Copy link
 *              and the share sheet handed out (components/onepage/onepage-editor)
 *
 *   node scripts/check-onepage-editor-bugs.mjs
 *   ONLY=uploads|integrations|share   one part
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok || got === undefined ? "" : `   (${JSON.stringify(got)?.slice(0, 400)})`}`)
  if (!ok) broken++
}
const fail = (m) => { throw new Error(m) }
const ONLY = process.env.ONLY || null
const part = (name) => !ONLY || ONLY === name
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

try {
  /* ── Uploads ── */
  if (part("uploads")) {
  console.log("uploads")
  const dir = join(root, `.onepage-bugs-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  /* An upload that never hears Stop: its bytes are up, and it answers anyway. */
  writeFileSync(join(dir, "media-upload.js"), `export class UploadError extends Error { constructor(code, message) { super(message); this.code = code } }
export const uploadMessage = (e) => String((e && e.message) || e)
export function uploadOnePageMedia(file, o) { return new Promise((r) => setTimeout(() => r({ url: "https://cdn.example/" + o.prefix, path: o.prefix, bucket: "b", mime: "image/jpeg", size: 1, kind: "image" }), o.prefix.includes("slow") ? 400 : 100)) }
`)
  try {
    execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-editor-bugs.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
      `--outfile=${join(dir, "probe.js")}`, '--define:process.env.NODE_ENV="production"',
      `--alias:@/lib/onepage/media-upload=${join(dir, "media-upload.js")}`, `--alias:@=${root}`], { stdio: ["ignore", "ignore", "inherit"] })
    const js = readFileSync(join(dir, "probe.js"), "utf8")
    const server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><div id="root"></div><script>${js.replace(/<\/script/g, "<\\/script")}</script>`) })
    await new Promise((r) => server.listen(0, r))
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.waitForFunction(() => !!window.up)
    const r = await page.evaluate(async () => {
      const blob = new Blob(["x"], { type: "image/jpeg" })
      const out = {}
      out.plain = await window.up.upload(blob, { prefix: "plain", want: "image" })
      const stopped = window.up.upload(blob, { prefix: "stopped-slow", want: "image" })
      window.up.cancel()
      out.stopped = await stopped
      const first = window.up.upload(blob, { prefix: "first-slow", want: "image" })
      const second = window.up.upload(blob, { prefix: "second", want: "image" })
      out.first = await first
      out.second = await second
      return out
    })
    expect(r.plain?.url === "https://cdn.example/plain", "an upload nobody stopped is written", r)
    expect(r.stopped === null, "an upload stopped after its bytes were up writes nothing", r)
    expect(r.first === null && r.second?.url === "https://cdn.example/second", "a second file replaces the first: only the second is written", r)
    await page.close()
    server.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  }

  /* ── Integrations, the read failing ── */
  console.log("integrations")
  let reads = "fail"
  const header = { id: "h", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } }
  const api = (req) => {
    const path = req.url.split("?")[0]
    if (path === "/api/store/integrations") return reads === "fail" ? { status: 500, body: { error: "down" } } : { body: { tracking: { ga4: "G-1A2B3C4D5E" }, ready: true, ga: null } }
    if (path === "/api/store/integrations/marketing") return reads === "fail" ? { status: 500, body: { error: "down" } } : { body: { marketing: [{ provider: "klaviyo", connected: true, listName: "Newsletter" }] } }
    if (path === "/api/onepage/integrations") return reads === "fail" ? { status: 503, body: { error: "down" } } : { body: { ready: true, integrations: [{ provider: "mailchimp", connected: true, hint: "1a2b", listName: "Fans", sent: 3, failed: 0 }] } }
    if (path === "/api/domains") return { body: { domains: [], primary: { website: null, creator_page: null }, purposes: ["website", "creator_page"] } }
    if (path === "/api/onepage/address") return { body: { available: true } }
    return null
  }
  if (part("integrations")) {
    const { base, server } = await serveEditorProbe({ root, blocks: [header], api, fail, statics: { "/integrations/": join(root, "public/integrations") } })
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(`${base}/app/onepage#settings-integrations`)
    await page.waitForSelector("[data-settings-integrations]", { visible: true, timeout: 15000 })
    await page.waitForSelector("[data-integrations-unread]", { timeout: 8000 }).catch(() => null)
    await sleep(400)
    const text = await page.$eval("[data-settings-integrations]", (e) => e.innerText)
    expect(!/Not connected|Not set up/.test(text), "a failed read never says Not connected or Not set up", text.slice(0, 300))
    const notes = await page.$$eval("[data-integrations-unread]", (els) => els.length)
    expect(notes === 3, "each of the three lists says it could not check, with Try again", notes)
    await page.click('[data-page-integration="mailchimp"]')
    await page.waitForSelector('[data-integration-sheet="mailchimp"]', { visible: true })
    await sleep(300)
    const sheet = await page.$eval('[data-integration-sheet="mailchimp"]', (e) => ({ unread: !!e.querySelector("[data-integration-unread]"), keyField: !!e.querySelector('input[type="password"]') }))
    expect(sheet.unread && !sheet.keyField, "the sheet offers Try again, not a key field over a key it could not see", sheet)
    reads = "ok"
    await page.click("[data-integration-unread] button")
    await page.waitForFunction(() => !document.querySelector("[data-integration-unread]"), { timeout: 8000 }).catch(() => null)
    const after = await page.$eval('[data-integration-sheet="mailchimp"]', (e) => e.innerText)
    expect(/1a2b/.test(after) && /Disconnect/.test(after), "Try again reads it: the sheet shows the connected key", after.slice(0, 200))
    expect(errors.length === 0, "no page errors", errors)
    await page.close()
    server.close()
  }

  /* ── The address shared ── */
  if (part("share")) {
  console.log("share")
    const { base, server } = await serveEditorProbe({ root, blocks: [header], api, fail })
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.goto(`${base}/app/onepage#settings-basic`)
    const field = await page.waitForSelector("[data-settings-slug]", { visible: true, timeout: 15000 })
    await field.click({ clickCount: 3 })
    await field.type("satori-new-name")
    await sleep(700)
    /* The phone's bar and the desktop's both carry these: the one on screen is pressed. */
    const pressVisible = (sel) => page.$$eval(sel, (els) => { const el = els.find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden"); if (!el) return false; el.click(); return true })
    expect(await pressVisible('[data-tab="links"]'), "the Links tab is pressed, leaving Settings")
    await sleep(500)
    expect(await pressVisible("[data-onepage-share-desk], [data-onepage-share]"), "Share is pressed")
    await page.waitForSelector("[data-share-onepage]", { visible: true })
    await sleep(300)
    const shared = await page.$eval("[data-share-onepage]", (e) => e.innerText)
    expect(/\/satori\b/.test(shared) && !shared.includes("satori-new-name"), "before Save, the share sheet hands out the address that is live", shared.slice(0, 200))
    await page.close()
    server.close()
  }
} finally {
  await browser.close()
}
if (broken) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
console.log("\nall passed")
