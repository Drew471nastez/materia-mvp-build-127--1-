/**
 * ===========================================================================
 *  ANALYTICS › SEND TO, MEASURED AND PHOTOGRAPHED (round ana-1029)
 * ===========================================================================
 * The real button and dialog (components/app/analytics/send-analytics.tsx,
 * through scripts/render-send-analytics.tsx) at 1440x900 and 390x844, with
 * /api/analytics/destinations answered by a store that has GA4 connected
 * (one error waiting) and nothing else:
 *
 *   ROW       the button sits beside Export on the heading's line, a 36px
 *             circle like it (changed on purpose, round 49: it was in the
 *             control row, with its name from 640px)
 *   DIALOG    at most 520px wide on a computer; a bottom sheet on a phone,
 *             nothing past the screen's sides
 *   ROWS      six tools, each a target at least 44px tall
 *   STATUS    GA4 says it is connected, with errors; opened, its last event,
 *             its error and Send test
 *   FORM      Meta opened: its fields, Connect
 *
 *   node scripts/check-send-analytics.mjs
 * Screenshots go to SHOTS_DIR (printed at the end): look at them.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
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
const stubs = join(root, ".send-analytics-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-send-analytics-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const ago = (m) => new Date(Date.now() - m * 60_000).toISOString()
const none = (p) => ({ provider: p, connected: false, label: null, hint: null, testEventCode: null, lastSentAt: null, lastEvent: null, waiting: 0, errors: [], log: [] })
const ANSWER = {
  ready: true,
  canEdit: true,
  destinations: [
    { provider: "ga4", connected: true, label: "G-8KQ2LM4XYZ", hint: "x9Qa", testEventCode: null, lastSentAt: ago(3), lastEvent: "purchase", waiting: 1, errors: [{ at: ago(12), event: "page_view", error: "Google Analytics 4 answered 500." }], log: [{ id: "1", event: "purchase", status: "sent", at: ago(3), attempts: 1, code: 204, error: null }, { id: "2", event: "page_view", status: "queued", at: ago(12), attempts: 2, code: 500, error: "Google Analytics 4 answered 500." }] },
    none("meta"),
    none("posthog"),
    none("webhook"),
  ],
}

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-send-analytics.tsx")],
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

async function open(vp, query) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e?.message || e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (u.startsWith(ORIGIN + "/api/analytics/destinations")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(ANSWER) })
    if (u.startsWith(ORIGIN + "/api/analytics/api-tokens")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ready: true, tokens: [] }) })
    if (u.startsWith(ORIGIN + "/integrations/")) return r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="#e5e7eb"/></svg>' })
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  await p.goto(`${ORIGIN}/app/analytics${query}`, { waitUntil: "load" })
  return { p, ctx, errors }
}

for (const [name, vp] of [["desktop", DESK], ["phone", PHONE]]) {
  console.log(`\n${name} ${vp.width}x${vp.height}`)
  const { p, ctx, errors } = await open(vp, "")
  await sleep(400)
  const row = await p.evaluate(() => {
    const el = document.querySelector("[data-analytics-send]")
    const b = el?.getBoundingClientRect()
    const e = document.querySelector("[data-export-stand-in]")?.getBoundingClientRect()
    return b && e ? { h: Math.round(b.height), eh: Math.round(e.height), w: Math.round(b.width), ew: Math.round(e.width), sameLine: Math.abs(b.top - e.top) < 1, before: b.right <= e.left, radius: getComputedStyle(el).borderRadius } : null
  })
  expect(!!row && row.h === row.eh && row.sameLine && row.before, "Send to sits beside Export, as tall as it", row)
  /* Changed on purpose (round 49): a 36px circle at every width, icon only, like Export. */
  expect(!!row && row.w === row.ew && row.w === 36, "a 36px circle like Export", row)
  await p.screenshot({ path: join(shots, `${name}-row.png`) })
  await p.click("[data-analytics-send]")
  await sleep(700)
  const box = await p.evaluate(() => {
    const el = document.querySelector("[data-analytics-destinations]")
    const r = el?.getBoundingClientRect()
    const rows = [...document.querySelectorAll("[data-destination-row] > button")].map((b) => Math.round(b.getBoundingClientRect().height))
    return r ? { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), rows, overflow: document.documentElement.scrollWidth > window.innerWidth } : null
  })
  expect(!!box && box.rows.length === 6 && box.rows.every((h) => h >= 44), "six tools, each a target 44px or taller", box?.rows)
  expect(!!box && box.left >= 0 && box.right <= vp.width && !box.overflow, "nothing past the screen's sides", box)
  if (name === "desktop") expect(!!box && box.width <= 520, "the dialog at most 520px wide", box?.width)
  const ga = await p.evaluate(() => document.querySelector('[data-destination-row="ga4"]')?.textContent ?? "")
  expect(/Connected, with errors/.test(ga), "GA4 says it is connected, with errors", ga.slice(0, 80))
  await p.screenshot({ path: join(shots, `${name}-list.png`) })
  await p.click('[data-destination-row="ga4"] > button')
  await sleep(250)
  const body = await p.evaluate(() => document.querySelector('[data-destination-body="ga4"]')?.textContent ?? "")
  expect(/Last event/.test(body) && /answered 500/.test(body) && /Send test/.test(body), "opened: the last event, the error, Send test", body.slice(0, 120))
  await p.screenshot({ path: join(shots, `${name}-ga4.png`) })
  await p.click('[data-destination-row="meta"] > button')
  await sleep(250)
  const meta = await p.evaluate(() => ({ inputs: document.querySelectorAll('[data-destination-body="meta"] input').length, connect: /Connect/.test(document.querySelector('[data-destination-body="meta"]')?.textContent ?? ""), ga4Shut: !document.querySelector('[data-destination-body="ga4"]') }))
  expect(meta.inputs === 3 && meta.connect && meta.ga4Shut, "Meta opened: three fields and Connect, GA4 shut", meta)
  await p.screenshot({ path: join(shots, `${name}-meta.png`) })
  /*
    CLOSING (round 51, the owner: "the Send analytics modal glitches when it closes"). Every frame of the close is
    measured: the panel's layout height (offsetHeight, so the zoom of the fade is not counted). The list was taken out the moment it closed, so the dialog played its
    fade on a header alone, 600px shorter and re-centred: a jump on the first frame.
  */
  const closing = await p.evaluate(async (phone) => {
    const panel = () => document.querySelector(phone ? "[data-send-sheet]" : "[data-send-dialog]")
    const first = panel() ? { height: panel().offsetHeight } : null
    if (!first) return null
    const frames = []
    const done = phone ? null : [...document.querySelectorAll("[data-send-dialog] button")].find((b) => b.textContent?.trim() === "Done")
    if (done) done.click()
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    const t0 = performance.now()
    while (performance.now() - t0 < 700) {
      await new Promise((r) => requestAnimationFrame(r))
      const el = panel()
      if (!el) break
      frames.push({ h: el.offsetHeight, list: !!el.querySelector("[data-analytics-destinations]") })
    }
    return { open: Math.round(first.height), frames: frames.length, minH: frames.length ? Math.min(...frames.map((f) => f.h)) : null, listGone: frames.some((f) => !f.list), gone: !panel() }
  }, name === "phone")
  console.log(`   closing: ${JSON.stringify(closing)}`)
  expect(!!closing && closing.gone, "the dialog closes", closing)
  expect(!!closing && closing.frames > 0 && !closing.listGone && closing.minH >= closing.open - 2, "while it closes it keeps its list and its height: nothing jumps", closing)
  expect(errors.length === 0, "no page errors", errors)
  await ctx.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
