/**
 * ===========================================================================
 *  THE ONEPAGE PREVIEW IN A REAL NEXT SERVER (round AQ)
 * ===========================================================================
 * Not the component harness: `next dev` with placeholder keys, the editor's
 * preview frame (/onepage-preview?embedded=1) framed by a plain host page on
 * the same origin that answers its "ready" with a page, exactly as
 * components/onepage/live-preview does. It reads nothing from the database,
 * so it runs with none. On an iPhone 13 (puppeteer KnownDevices), real touch:
 *
 *   a  no cookie banner in the frame; still one on / and /pricing
 *   b  the block sheet rises from 12% of its height, only up, every frame
 *   c  once picked up it moves 1:1 with the finger; a short pull springs
 *      back, a long one or a flick closes it; a scrolled body scrolls and
 *      the sheet stays, at the top a pull moves the sheet
 *   d  Share is a bottom sheet on a phone; a shelf shows All, Choose, One
 *
 *   next dev -p 3517 (with the placeholder env), then
 *   BASE=http://127.0.0.1:3517 SHOTS=/dir node scripts/check-onepage-real-preview.mjs
 */
import puppeteer, { KnownDevices } from "puppeteer-core"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const BASE = process.env.BASE || "http://127.0.0.1:3517"
const OUT = process.env.SHOTS || mkdtempSync(join(tmpdir(), "onepage-real-"))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const expect = (ok, what, got) => { results.push({ ok, what, got }); console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}   ${JSON.stringify(got)}`) }

const pic = "/images/onepage-themes/nature.webp"
const pic2 = "/images/onepage-themes/fusion.webp"
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"]
const items = ids.map((id, i) => ({ id, kind: "digital", title: ["Film presets", "Studio guide", "Poster pack"][i], href: `/p/item-${i}`, image: i % 2 ? pic2 : pic, price_cents: [1900, 0, 4500][i] }))
const longText = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the price list, with enough words to wrap across the sheet.`).join(" ")
const block = (id, type, data, i) => ({ id, type, enabled: true, sort_order: i, data })
const page = {
  id: "aq2-page", title: "Ana Studio", bio: "Prints, posters and a newsletter", slug: "ana", avatar_url: null, avatar_video_url: null, avatar_video_crop: null,
  theme: { background_color: "#ffffff", text_color: "#111111", button_color: "#1a1a2e", button_text_color: "#ffffff", button_style: "filled", button_border_radius: 12, font_family: "Inter" },
  social_links: {}, settings: {}, seller_id: null,
  blocks: [
    block("form", "contact_form", { title: "Get in touch", open_mode: "sheet" }, 0),
    block("pdf", "pdf_document", { title: "Price list", pdf_file_url: "/aq2-probe.pdf", description: longText }, 1),
    block("all", "storelib_shelf", { source: "all", layout: "list", pick: "all", limit: 3, items }, 2),
    block("some", "storelib_shelf", { source: "all", layout: "list", pick: "some", product_ids: ids.slice(0, 2), items: items.slice(0, 2) }, 3),
    block("one", "storelib_shelf", { source: "all", layout: "list", pick: "one", product_ids: ids.slice(2), items: items.slice(2) }, 4),
  ],
}

const browser = await puppeteer.launch({
  executablePath: "/opt/pw-browsers/chromium",
  /* Headless Chromium paints at 60Hz; with --disable-frame-rate-limit its rAF fired every 0.3ms without painting, so the samples are the real 60Hz frames. */
  args: ["--no-sandbox", "--disable-gpu"],
})
const phone = KnownDevices["iPhone 13"]

/** A host on this origin framing the preview, answering its ready with the page. */
async function framedPreview(ctx, device = phone) {
  const p = await ctx.newPage()
  await p.emulate(device)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`) })
  /* The host: a plain page on the same origin (no React of its own to hydrate over the frame), served by interception. */
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    if (r.isInterceptResolutionHandled()) return
    if (r.url() === `${BASE}/__aq2_host`) return r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'></head><body></body></html>" })
    r.continue()
  })
  await p.goto(`${BASE}/__aq2_host`, { waitUntil: "load", timeout: 180000 })
  await p.evaluate((pageData) => {
    document.documentElement.style.cssText = "margin:0;height:100%"
    document.body.innerHTML = ""
    document.body.style.cssText = "margin:0;height:100%;overflow:hidden"
    const f = document.createElement("iframe")
    f.src = "/onepage-preview?embedded=1"
    f.setAttribute("data-host-frame", "")
    f.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0"
    window.__drawn = false
    window.__msgs = []
    window.addEventListener("message", (e) => {
      window.__msgs.push(e.data?.kind)
      if (e.data?.channel !== "storelib-onepage-preview") return
      if (e.data.kind === "ready") f.contentWindow.postMessage({ channel: "storelib-onepage-preview", kind: "page", page: pageData, currency: "USD" }, location.origin)
      if (e.data.kind === "drawn") window.__drawn = true
    })
    document.body.appendChild(f)
  }, page)
  await p.waitForFunction(() => window.__drawn, { timeout: 60000 }).catch(async (e) => { console.log("    msgs", await p.evaluate(() => window.__msgs), errors.slice(0, 3)); await p.screenshot({ path: `${OUT}/real-stuck.png` }); throw e })
  const handle = await p.$("[data-host-frame]")
  const frame = await handle.contentFrame()
  await sleep(800)
  return { p, frame, errors }
}

const bannerShown = (ctx) => ctx.evaluate(() => [...document.querySelectorAll("[data-cookie-banner]")].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.01 && [...e.querySelectorAll("*")].some((c) => c.getBoundingClientRect().height > 0) }).length)

/* ── a. the cookie banner ──────────────────────────────────────────── */
console.log("\na. Cookie banner")
{
  const ctx = await browser.createBrowserContext()
  const { p, frame, errors } = await framedPreview(ctx)
  await sleep(1500)
  const inFrame = await bannerShown(frame)
  const markup = await frame.evaluate(() => document.querySelectorAll("[data-cookie-banner]").length)
  expect(inFrame === 0, "no cookie banner inside the editor's preview frame (fresh visitor, no consent)", { shown: inFrame, inMarkup: markup })
  await p.screenshot({ path: `${OUT}/real-preview-frame-390.png` })
  expect(errors.length === 0, "no page errors in the host", errors.slice(0, 2))
  await ctx.close()
}
for (const path of ["/pricing", "/"]) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  await p.emulate(phone)
  const res = await p.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 240000 }).catch((e) => ({ status: () => String(e).slice(0, 80) }))
  await sleep(2500)
  const shown = await bannerShown(p).catch(() => -1)
  expect(shown >= 1, `the banner still shows on the public page ${path} (fresh visitor)`, { status: res?.status?.(), shown })
  await p.screenshot({ path: `${OUT}/real-public${path === "/" ? "-home" : path.replace(/\//g, "-")}-390.png` })
  await ctx.close()
}

/* ── b, c. the block sheet in the preview frame on an iPhone 13 ─────── */
console.log("\nb/c. Block sheet in the real preview frame, iPhone 13, real touch")
const ctx = await browser.createBrowserContext()
const { p, frame, errors } = await framedPreview(ctx)
const cdp = await p.target().createCDPSession()
const panelY = () => frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => {
  const el = document.querySelector("[data-block-sheet-panel]")
  r(el ? ((cs) => (cs.translate === "none" ? 0 : parseFloat(cs.translate.split(" ")[1] || "0")) + new DOMMatrixReadOnly(cs.transform).m42)(getComputedStyle(el)) : null)
})))
const record = (ms) => frame.evaluate((ms) => {
  window.__f = []
  const t0 = performance.now()
  const tick = (t) => {
    const el = document.querySelector("[data-block-sheet-panel]")
    const body = document.querySelector("[data-block-sheet-body]")
    window.__f.push({ t: t - t0, y: el ? ((cs) => (cs.translate === "none" ? 0 : parseFloat(cs.translate.split(" ")[1] || "0")) + new DOMMatrixReadOnly(cs.transform).m42)(getComputedStyle(el)) : null, h: el ? el.offsetHeight : 0, st: body ? body.scrollTop : null })
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, ms)
const frames = () => frame.evaluate(() => window.__f)
const clickIn = (sel) => frame.evaluate((sel) => { const b = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length); if (b) { b.focus({ preventScroll: true }); b.click() } return !!b }, sel)
const clickText = (text) => frame.evaluate((text) => { const b = [...document.querySelectorAll("button, [role=button]")].find((e) => e.textContent.includes(text) && e.getClientRects().length); if (b) { b.scrollIntoView({ block: "center" }); b.click() } return !!b }, text)

async function openWatched(text, name) {
  await frame.evaluate(() => scrollTo(0, 0))
  await sleep(300)
  /* A screencast of the opening, every frame the compositor makes. */
  const shots = []
  cdp.on("Page.screencastFrame", async (f) => { shots.push(f.data); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1, maxWidth: 390 })
  await record(1200)
  const found = await clickText(text)
  await sleep(1300)
  await cdp.send("Page.stopScreencast")
  cdp.removeAllListeners("Page.screencastFrame")
  const f = (await frames()).filter((x) => x.y !== null)
  const ys = f.map((x) => x.y)
  const dts = f.slice(1).map((x, i) => x.t - f[i].t)
  const backwards = f.slice(1).filter((x, i) => x.y > f[i].y + 0.5).length
  const moving = f.filter((x, i) => i > 0 && Math.abs(x.y - f[i - 1].y) > 0.1)
  const steps = f.slice(1).map((x, i) => Math.abs(x.y - f[i].y))
  const median = [...dts].sort((a, b) => a - b)[Math.floor(dts.length / 2)] || 0
  const long = dts.filter((d) => d > 50).length
  const stats = { found, samples: f.length, firstY: Math.round(ys[0] ?? -1), h: f[0]?.h, restY: Math.round((ys.at(-1) ?? 99) * 10) / 10, backwards, movingFrames: moving.length, medianFrameMs: Math.round(median * 10) / 10, framesOver50ms: long, biggestStepPx: Math.round(Math.max(0, ...steps)), shots: shots.length }
  console.log(`    ${name}: ${JSON.stringify(stats)}`)
  /* Six frames of the opening, as a strip. */
  const pick = shots.length ? [0, 0.1, 0.2, 0.35, 0.5, 0.75, 1].map((k) => shots[Math.min(shots.length - 1, Math.round(k * (shots.length - 1)))]) : []
  pick.forEach((b64, i) => writeFileSync(`${OUT}/real-open-${name}-${i}.jpg`, Buffer.from(b64, "base64")))
  return stats
}

const form = await openWatched("Get in touch", "form")
/* The block sheet's own rise (round AN, scripts/check-onepage-block-sheet.mjs): from 12% of its height, fading in, only ever up. */
expect(form.found && form.firstY > 0 && form.firstY <= form.h * 0.15 && form.backwards === 0 && Math.abs(form.restY) < 0.5 && form.movingFrames >= 8, "the form's sheet rises from 12% of its height, only ever up, over many frames, to rest", form)
expect(form.framesOver50ms === 0, "no frame over 50ms while it opens", { medianFrameMs: form.medianFrameMs, over50: form.framesOver50ms })

const handle = () => frame.evaluate(() => { const r = document.querySelector("[data-block-sheet-handle]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(10, r.height / 2) } })
async function drag(from, dy, { steps = 10, pauseMs = 40, measure = false } = {}) {
  let lag = 0
  const seen = []
  const t0 = Date.now() / 1000
  const at = (k) => t0 + (k * Math.max(pauseMs, 8)) / 1000
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }], timestamp: at(0) })
  for (let k = 1; k <= steps; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y + (dy * k) / steps }], timestamp: at(k) })
    if (pauseMs) await sleep(pauseMs)
    if (measure) { const y = await panelY(); if (y !== null && y > 0) seen.push(y - (dy * k) / steps) }
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: at(steps) + 0.004 })
  /* Picked up where the finger is once past the slop (components/onepage/block-sheet move): from then on panel minus finger is one constant. */
  if (seen.length) lag = Math.max(...seen) - Math.min(...seen)
  return measure ? { lag, offset: seen.length ? Math.round(-seen[0]) : null, steps: seen.length } : lag
}
const isOpen = () => frame.evaluate(() => !!document.querySelector("[data-block-sheet-panel]"))
const waitGone = async () => { for (let t = 0; t < 2000; t += 100) { await sleep(100); if (!(await isOpen())) return true } return false }

/* Follows the finger: a slow drag (0.15 px/ms, under the flick speed) read at every step. */
const g = await handle()
const follow = await drag(g, 120, { steps: 8, pauseMs: 100, measure: true })
await sleep(800)
const back = await panelY()
expect(follow.lag <= 2 && follow.steps >= 5, "once picked up, the sheet moves 1:1 with the finger (panel minus finger varies by at most 2px)", { varies: Math.round(follow.lag * 10) / 10, pickupOffset: follow.offset, steps: follow.steps })
expect(back !== null && Math.abs(back) < 0.5, "a short slow drag let go springs back to rest", back)

/* Closes on a long drag, slow. */
const g2 = await handle()
await drag(g2, 420, { steps: 14, pauseMs: 100 })
expect(await waitGone(), "a long slow drag (420px) closes it", null)

/* Closes on a flick. */
await openWatched("Get in touch", "form-again")
const g3 = await handle()
await drag(g3, 110, { steps: 4, pauseMs: 0 })
expect(await waitGone(), "a quick short flick (110px) closes it", null)

/* No scroll fight: the PDF's long body, scrolled; a pull down on it scrolls the body back, the sheet stays; at the top a pull moves the sheet. */
const pdf = await openWatched("Price list", "pdf")
const body = await frame.evaluate(() => { const b = document.querySelector("[data-block-sheet-body]"); const sc = [b, ...b.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)); if (!sc) return null; sc.setAttribute("data-probe-scroller", ""); sc.scrollTop = 260; const r = sc.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: sc.scrollTop, sh: sc.scrollHeight, ch: sc.clientHeight } })
expect(!!body, "the PDF sheet's body scrolls (a long description)", body)
if (body) {
  await sleep(300)
  await record(1500)
  await drag({ x: body.x, y: body.y - 60 }, 160, { steps: 8, pauseMs: 40 })
  await sleep(900)
  const f = await frames()
  const maxY = Math.max(...f.map((x) => x.y ?? 0))
  const after = await frame.evaluate(() => document.querySelector("[data-probe-scroller]")?.scrollTop ?? null)
  expect(maxY < 1 && after !== null && after < body.top, "scrolled, a pull down on the body scrolls it back and the sheet does not move", { sheetMovedPx: Math.round(maxY), scrollTopBefore: body.top, after })
  await frame.evaluate(() => { document.querySelector("[data-probe-scroller]").scrollTop = 0 })
  await sleep(300)
  await record(1500)
  await drag({ x: body.x, y: body.y - 60 }, 90, { steps: 6, pauseMs: 40 })
  await sleep(900)
  const moved = Math.max(...(await frames()).map((x) => x.y ?? 0))
  expect(moved > 40, "at the top, a pull down on the body moves the sheet", { moved: Math.round(moved) })
}
expect(errors.length === 0, "no page errors in the host while the sheets were used", errors.slice(0, 2))
await p.screenshot({ path: `${OUT}/real-pdf-sheet-390.png` })

/* ── d. share sheet and products picker in the preview ─────────────── */
console.log("\nd. Share sheet and the products picker, in the real preview frame")
if (await isOpen()) { await frame.evaluate(() => document.querySelector("[data-block-sheet-close]")?.click()); await sleep(800) }
await frame.evaluate(() => scrollTo(0, 0))
const shared = await clickIn("[data-onepage-share-button]")
await sleep(1200)
const share = await frame.evaluate(() => {
  const s = document.querySelector("[data-onepage-share-sheet]")
  const panel = s?.closest("[data-sheet-panel]") || s?.closest("[role=dialog]")
  const r = (panel || s)?.getBoundingClientRect()
  return { sheet: !!s, bottomGap: r ? Math.round(innerHeight - r.bottom) : null, width: r ? Math.round(r.width) : null, shared: !!document.querySelector("[data-app-sheet]") }
})
expect(shared && share.sheet && share.bottomGap !== null && share.bottomGap <= 1 && share.width >= 388, "on a phone, Share opens as a bottom sheet the width of the screen", share)
await p.screenshot({ path: `${OUT}/real-share-390.png` })
await frame.evaluate(() => document.querySelector("[data-app-sheet] [data-sheet-close], [data-app-sheet] button[aria-label=Close]")?.click())
await sleep(900)
const shelves = await frame.evaluate(() => Object.fromEntries(["all", "some", "one"].map((id) => {
  const el = document.querySelector(`[data-block-id="${id}"]`) || document.getElementById(id) || [...document.querySelectorAll("[data-onepage-block]")].find((e) => e.getAttribute("data-onepage-block") === id)
  const cards = el ? [...el.querySelectorAll("a, [role=link]")].filter((a) => /\/p\/item-/.test(a.getAttribute("href") || "")).map((a) => a.textContent.trim().slice(0, 18)) : null
  return [id, cards]
})))
console.log("    shelves:", JSON.stringify(shelves))
const titlesOnPage = await frame.evaluate(() => ["Film presets", "Studio guide", "Poster pack"].map((t) => (document.body.innerText.match(new RegExp(t, "g")) || []).length))
expect(titlesOnPage.join() === "2,2,2" || (shelves.all?.length === 3 && shelves.some?.length === 2 && shelves.one?.length === 1), "All shows three, Choose its two, One its one (Film presets in All and Choose, Studio guide in All and Choose, Poster pack in All and One: 2,2,2)", { titlesOnPage, shelves })
await frame.evaluate(() => document.querySelector('[data-block-id="all"], #all')?.scrollIntoView({ block: "start" }))
await sleep(500)
await p.screenshot({ path: `${OUT}/real-shelves-390.png`, fullPage: false })
await ctx.close()

await browser.close()
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed")
process.exit(failed ? 1 : 0)
