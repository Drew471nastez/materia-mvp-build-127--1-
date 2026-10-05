/**
 * ===========================================================================
 *  THE PROMPT AFTER JOINING, MEASURED AND PHOTOGRAPHED (round 13)
 * ===========================================================================
 * The real prompt (components/notifications/web-push-prompt.tsx, through
 * scripts/render-community-web-push.tsx) at 1440x900 and 390x844, in a
 * browser whose Push API the probe stands in for:
 *
 *   APPEARS     not on first paint; about APPEAR_MS later, rising and fading
 *               in frame by frame (sampled every frame), nothing jumping
 *   FITS        no sideways scroll, its buttons 40px tall on a phone, the
 *               floating one clear of the screen's edges
 *   TURN ON     the browser's question only from that tap, then POST
 *               /api/push/web, "Notifications are on", and it goes away
 *   NOT NOW     it goes away and stays away on the next visit
 *   NEVER       for a member who joined long ago, or a browser that was
 *               already answered
 *
 *   PROBE_CSS=source node scripts/check-community-web-push.mjs
 * Screenshots go to SHOTS_DIR (printed at the end): look at them.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".community-web-push-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-web-push-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const KEY = "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ"

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-web-push.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'}};globalThis.process=process;" },
    loader: { ".css": "empty" },
    plugins: [{ name: "alias", setup(b) { b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind })) } }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  console.error(`The probe did not bundle: ${e.message}`)
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, protocolTimeout: 240000, args: ["--no-sandbox", "--hide-scrollbars"] })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(vp, { query = "", permission = "default", context = null } = {}) {
  const ctx = context ?? (await browser.createBrowserContext())
  const p = await ctx.newPage()
  await p.setViewport(vp)
  const errors = []
  const web = []
  p.on("pageerror", (e) => errors.push(String(e?.message || e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (u.startsWith(ORIGIN + "/api/push/web")) {
      web.push({ method: r.method(), body: r.postData() ? JSON.parse(r.postData()) : null })
      if (r.method() === "GET") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ publicKey: KEY, saved: null }) })
      await sleep(150)
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    }
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  await p.evaluateOnNewDocument((permission) => {
    const perm = { value: permission }
    window.__asked = []
    const N = function () {}
    Object.defineProperty(N, "permission", { get: () => perm.value })
    N.requestPermission = (cb) => new Promise((res) => { window.__asked.push([Math.round(performance.now()), window.__lastTap || 0]); setTimeout(() => { perm.value = "granted"; cb && cb(perm.value); res(perm.value) }, 150) })
    window.Notification = N
    window.PushManager = function () {}
    const pm = {
      getSubscription: async () => window.__sub || null,
      subscribe: async (o) => {
        const key = o.applicationServerKey
        window.__sub = { endpoint: "https://push.example.net/sub/xyz", options: { applicationServerKey: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) }, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "p256", auth: "auth" } } }, unsubscribe: async () => { window.__sub = null; return true } }
        return window.__sub
      },
    }
    const reg = { active: { scriptURL: location.origin + "/storelib-push-sw.js" }, pushManager: pm }
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations: async () => (window.__reg ? [window.__reg] : []), register: async () => { window.__reg = reg; return reg } } })
    document.addEventListener("pointerdown", () => { window.__lastTap = Math.round(performance.now()) }, true)
    /* Every frame from the start: whether the prompt is there, and where. */
    window.__frames = []
    const t0 = performance.now()
    const tick = () => {
      const el = document.querySelector("[data-web-push-prompt]")
      if (el) {
        const r = el.getBoundingClientRect()
        window.__frames.push({ t: Math.round(performance.now() - t0), y: Math.round(r.top * 10) / 10, o: Number(getComputedStyle(el).opacity) })
      } else window.__frames.push({ t: Math.round(performance.now() - t0), y: null, o: 0 })
      if (window.__frames.length < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, permission)
  await p.goto(`${ORIGIN}/community/film-loft${query}`, { waitUntil: "load" })
  return { p, ctx, errors, web }
}

const layout = (p, phone) =>
  p.evaluate((phone) => {
    const el = document.querySelector("[data-web-push-prompt]")
    const small = []
    for (const b of el ? el.querySelectorAll("button") : []) {
      const r = b.getBoundingClientRect()
      if (phone && (r.height < 40 || r.width < 40)) small.push([b.textContent.trim() || b.getAttribute("aria-label"), Math.round(r.width), Math.round(r.height)])
    }
    const r = el?.getBoundingClientRect()
    const words = el?.querySelector("p")?.getBoundingClientRect()
    const close = el?.querySelector("[data-web-push-close]")?.getBoundingClientRect()
    return { overflow: document.documentElement.scrollWidth - innerWidth, small, box: r ? { l: Math.round(r.left), r: Math.round(innerWidth - r.right), b: Math.round(innerHeight - r.bottom), w: Math.round(r.width) } : null, overlap: words && close ? words.right > close.left + 1 && words.top < close.bottom : null }
  }, phone)

for (const [name, vp] of [["1440", DESK], ["390", PHONE]]) {
  for (const floating of [false, true]) {
    const label = `${name}${floating ? " floating" : ""}`
    console.log(`\nAfter joining, at ${label}`)
    const { p, ctx, errors, web } = await open(vp, { query: floating ? "?floating=1" : "" })
    await p.waitForSelector("[data-web-push-prompt]", { timeout: 5000 }).catch(() => null)
    await sleep(500)
    const frames = await p.evaluate(() => window.__frames)
    const first = frames.findIndex((f) => f.y !== null)
    const shown = frames.slice(first)
    const settled = shown.findIndex((f) => f.o >= 0.999)
    const rise = shown.slice(0, settled + 1)
    expect(first > 0 && frames[first].t >= 900, "not on first paint: it appears about a second after the page", frames[first]?.t)
    expect(rise.length >= 5 && rise.every((f, i) => i === 0 || (f.o >= rise[i - 1].o - 0.001 && f.y <= rise[i - 1].y + 0.11)), "it rises and fades in frame by frame, never back", rise.map((f) => [f.y, Math.round(f.o * 100) / 100]))
    expect(rise.length > 0 && rise[0].y - rise.at(-1).y >= 4 && rise[0].y - rise.at(-1).y <= 10, "a short rise, a few pixels", rise.length ? rise[0].y - rise.at(-1).y : null)
    const l = await layout(p, vp === PHONE)
    expect(l.overflow <= 0, "no sideways scroll", l.overflow)
    expect(l.small.length === 0, "every button at least 40px on a phone", l.small)
    expect(l.overlap === false, "its words never run under the close button", l.overlap)
    if (floating) expect(l.box && l.box.l >= 16 && l.box.r >= 16 && l.box.b >= 16, "floating: clear of the screen's edges", l.box)
    await p.screenshot({ path: join(shots, `prompt-${name}${floating ? "-floating" : ""}.png`) })
    expect(web.length === 0 && (await p.evaluate(() => window.__asked.length)) === 0, "nothing is asked of the browser before a tap", web)
    if (!floating) {
      await (vp === PHONE ? p.tap("[data-web-push-on]") : p.click("[data-web-push-on]"))
      await p.waitForSelector('[data-web-push-prompt="on"]', { timeout: 5000 }).catch(() => null)
      const asked = await p.evaluate(() => window.__asked)
      expect(asked.length === 1 && asked[0][1] > 0 && asked[0][0] - asked[0][1] < 1000, "Turn on asks the browser once, from that tap", asked)
      expect(web.some((w) => w.method === "POST" && w.body?.subscription?.endpoint === "https://push.example.net/sub/xyz"), "and saves this browser (POST /api/push/web)", web.map((w) => w.method))
      await sleep(100)
      await p.screenshot({ path: join(shots, `prompt-${name}-on.png`) })
      await sleep(2300)
      expect((await p.$("[data-web-push-prompt]")) === null, "then says so and goes away by itself")
    } else {
      await (vp === PHONE ? p.tap("[data-web-push-later]") : p.click("[data-web-push-later]"))
      await sleep(400)
      expect((await p.$("[data-web-push-prompt]")) === null, "Not now: it goes away")
      const again = await open(vp, { query: "?floating=1", context: ctx })
      await sleep(1800)
      expect((await again.p.$("[data-web-push-prompt]")) === null, "and is not offered again on the next visit")
      await again.p.close()
    }
    expect(errors.length === 0, "no page errors", errors)
    await ctx.close()
  }
}

console.log("\nNever")
{
  const a = await open(PHONE, { query: "?old=1" })
  await sleep(1800)
  expect((await a.p.$("[data-web-push-prompt]")) === null, "a member who joined long ago is not asked")
  await a.ctx.close()
  const b = await open(PHONE, { permission: "granted" })
  await sleep(1800)
  expect((await b.p.$("[data-web-push-prompt]")) === null, "nor a browser that already allows them")
  await b.ctx.close()
  const c = await open(PHONE, { permission: "denied" })
  await sleep(1800)
  expect((await c.p.$("[data-web-push-prompt]")) === null, "nor one that blocked them")
  await c.ctx.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log(`\nShots: ${shots}`)
console.log(broken ? `\n${broken} problem(s)` : "\nAll good")
process.exit(broken ? 1 : 0)
