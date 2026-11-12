/**
 * ===========================================================================
 *  EVERY THEME CARD IS A REAL CREATOR'S PAGE, MEASURED (round AS)
 * ===========================================================================
 * The owner: "it has those lines in the theme cards, which looks absolutely
 * cheap", "can you actually show how it would look using that theme with
 * some creators ... real offers and real products and newsletter and social
 * icons ... accuracy almost 99%".
 *
 * The real OnePage editor and the real live page (scripts/onepage-probe-server.mjs,
 * scripts/render-onepage-editor.tsx ?live&template=<id>&creator):
 *
 *   SIDE BY SIDE  each theme's live page, built from the same creator the
 *                 card draws (components/onepage/themes/preview-content,
 *                 the blocks in the card's order), at 390, beside its card,
 *                 in side-by-side-<id>.png and side-by-side.png.
 *   MATCH         read from both: the background, the name's face and
 *                 colour, the avatar's size and place, the first link's
 *                 fill, words, corner and border, the layout, the products'
 *                 kind, the newsletter's card and button, the words of the
 *                 name, the bio and the first link. A mismatch fails.
 *   NO BARS       no card draws a grey placeholder bar any more; every card
 *                 has real words in its blocks.
 *   COST          the time from opening the Theme page to every card drawn
 *                 with its creator, at 390 and 1440, the DOM nodes per card,
 *                 and the frames while the grid scrolls on a phone with the
 *                 CPU slowed four times.
 *   TEXT          no two text boxes in a card meet, none runs out of the
 *                 card or is cut, none is squeezed.
 *
 *   node scripts/check-onepage-theme-previews-as1.mjs
 *   SHOTS=/some/dir THEMES=plaster,folio PARTS=side node scripts/check-onepage-theme-previews-as1.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-theme-previews-as1-"))
mkdirSync(shots, { recursive: true })
const ONLY = process.env.THEMES ? new Set(process.env.THEMES.split(",")) : null
const PARTS = new Set((process.env.PARTS || "side,cost,text").split(","))

const { base, server } = await serveEditorProbe({ root, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const problems = []

const CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const fetched = new Map()
function remote(url) {
  if (!fetched.has(url)) {
    fetched.set(url, fetch(url, { headers: { "user-agent": CHROME_UA }, signal: AbortSignal.timeout(15000) })
      .then(async (r) => (r.ok ? { type: r.headers.get("content-type") || "application/octet-stream", body: Buffer.from(await r.arrayBuffer()) } : null))
      .catch(() => { fetched.delete(url); return null }))
  }
  return fetched.get(url)
}
const OUTSIDE = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.unsplash\.com|storelib\.com)$/
const fontBytes = { n: 0, bytes: 0, cut: 0, cutBytes: 0 }
async function wire(p) {
  await p.setRequestInterception(true)
  p.on("request", async (req) => {
    let u
    try { u = new URL(req.url()) } catch { return req.continue() }
    if (u.protocol === "data:" || u.protocol === "blob:") return req.continue()
    if (u.origin === base) {
      if (u.pathname !== "/_next/image") return req.continue()
      const got = await remote(new URL(u.searchParams.get("url") || "", base).href)
      if (!got) return req.respond({ status: 404, body: "" })
      const body = await sharp(got.body).resize({ width: Number(u.searchParams.get("w")) || 384, withoutEnlargement: true }).webp({ quality: Number(u.searchParams.get("q")) || 75 }).toBuffer()
      return req.respond({ status: 200, contentType: "image/webp", body })
    }
    /* A theme's own drawing on Storelib's address (Plaster's cover) is this checkout's file, as the next deploy serves it. */
    if (u.hostname === "storelib.com" && u.pathname.startsWith("/images/")) {
      const file = join(root, "public", u.pathname)
      if (!existsSync(file)) return req.respond({ status: 404, body: "" })
      return req.respond({ status: 200, contentType: u.pathname.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream", body: readFileSync(file) })
    }
    if (!OUTSIDE.test(u.hostname)) return req.abort()
    const got = await remote(req.url())
    if (!got) return req.abort()
    if (u.hostname === "fonts.gstatic.com") { fontBytes.n++; fontBytes.bytes += got.body.length; if (u.pathname.startsWith("/l/font")) { fontBytes.cut++; fontBytes.cutBytes += got.body.length } }
    return req.respond({ status: 200, contentType: got.type, body: got.body, headers: { "access-control-allow-origin": "*" } })
  })
  p.on("pageerror", (e) => errors.push(String(e)))
}
const settle = (p) => p.evaluate(async () => {
  await document.fonts.ready
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000) }))))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
})

/* What a page or a card draws, read the same way from both. */
function readLook(scope) {
  const box = scope.getBoundingClientRect()
  const s = (el) => (el ? getComputedStyle(el) : null)
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left < box.right - 1 && r.top < box.bottom - 1 }
  const title = scope.querySelector("h1, [data-tp-title]")
  const bio = scope.querySelector("[data-op-header] > p, [data-hero-header] p, [data-tp-bio]")
  const avatar = scope.querySelector("[data-page-avatar], [data-tp-avatar]")
  const button = [...scope.querySelectorAll("a.op-btn, [data-tp-link]")].find(seen) || null
  const news = [...scope.querySelectorAll("[data-email-layout]")].find(seen) || null
  const send = news ? news.querySelector("button[type=submit], [data-product-cta]") : null
  const ts = s(title), bs = s(button), ns = s(news), ss = s(send)
  const ar = avatar?.getBoundingClientRect(), tr = title?.getBoundingClientRect(), br = button?.getBoundingClientRect()
  const k = box.width / 390
  const words = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null)
  const prod = scope.querySelector('[data-product-block="tile"], [data-tp-product="tile"]') ? "grid" : scope.querySelector('[data-product-block="row"], [data-tp-product="row"]') ? "rows" : scope.querySelector('[data-product-block="callout"], [data-tp-product="callout"]') ? "callout" : "none"
  return {
    font: ts ? ts.fontFamily.split(",")[0].replace(/['"]/g, "").trim() : null,
    titleColor: ts?.color ?? null,
    titleWords: words(title),
    bioWords: words(bio),
    titleLeft: tr ? Math.round(((tr.left - box.left) / box.width) * 100) : null,
    avatarW: ar ? Math.round((ar.width / box.width) * 1000) / 10 : null,
    avatarLeft: ar ? Math.round(((ar.left - box.left) / box.width) * 100) : null,
    buttonFill: bs?.backgroundColor ?? null,
    buttonText: bs?.color ?? null,
    buttonWords: button ? words(button.querySelector("[data-block-title], [data-tp-label]") || button) : null,
    buttonRadius: bs && br ? Math.round((Math.min(parseFloat(bs.borderTopLeftRadius), br.height / k / 2) / (br.height / k)) * 100) / 100 : null,
    buttonH: br ? Math.round(br.height / k) : null,
    buttonW: br ? Math.round(br.width / k) : null,
    buttonBorder: bs ? parseFloat(bs.borderTopWidth) : null,
    buttonBorderColor: bs?.borderTopColor ?? null,
    newsFill: ns?.backgroundColor ?? null,
    sendFill: ss?.backgroundColor ?? null,
    sendText: ss?.color ?? null,
    products: prod,
    layout: scope.querySelector("[data-mixed-blocks], [data-tp-masonry]") ? "masonry" : scope.querySelector("[data-link-pair], [data-tp-pair]") ? "grid" : scope.querySelector("a.op-card, [data-tp-card]") ? "cards" : "list",
    tops: [title, scope.querySelector("[data-op-social-row], [data-tp-socials]"), button].map((el) => (el ? Math.round((el.getBoundingClientRect().top - box.top) / k) : null)),
  }
}

async function openPicker(p, phone) {
  await p.goto(`${base}/app/onepage#design`)
  await p.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
  await sleep(800)
}
async function showThemes(p, phone) {
  if (phone) await p.tap('[data-nav-row="theme"]')
  else await p.click('[data-nav-row="theme"]')
  await p.waitForSelector(process.env.BASELINE ? "[data-theme-card] [data-tp-page]" : "[data-theme-card] [data-tp-label]", { timeout: 30000 })
}

/* The catalogue, read in the page from the Design tab (every theme's id and name). */
let THEMES = []

const side = []
if (PARTS.has("side")) {
  console.log("\n── Each theme's live page beside its card ──")
  const ed = await browser.newPage()
  await ed.setViewport({ width: 390, height: 844, deviceScaleFactor: 4, isMobile: true, hasTouch: true })
  await wire(ed)
  await openPicker(ed, true)
  await showThemes(ed, true)
  await settle(ed)
  THEMES = await ed.evaluate(() => [...document.querySelectorAll("[data-theme-card]")].map((c) => ({ id: c.getAttribute("data-theme-card"), name: c.querySelector("[data-theme-frame] + span")?.textContent?.trim() || c.getAttribute("data-theme-card") })))
  const live = await browser.newPage()
  await live.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await wire(live)
  for (const t of THEMES) {
    if (ONLY && !ONLY.has(t.id)) continue
    await live.bringToFront()
    await live.goto(`${base}/app/onepage?live&template=${t.id}&creator`)
    await live.waitForSelector("[data-op-header], [data-hero-header]", { timeout: 30000 })
    await sleep(900)
    await settle(live)
    await sleep(400)
    const liveShot = await live.screenshot({ clip: { x: 0, y: 0, width: 390, height: 546 } })
    const liveLook = await live.evaluate(`(${readLook})(document.querySelector("[data-op-header], [data-hero-header]")?.closest(".relative.min-h-screen") || document.body)`)

    const card = await ed.$(`[data-theme-card="${t.id}"] [data-theme-frame]`)
    if (!card) { problems.push(`${t.id}: no card in the picker`); continue }
    await ed.bringToFront()
    await card.evaluate((e) => e.scrollIntoView({ block: "center" }))
    await sleep(150)
    const cardShot = await card.screenshot()
    const cardLook = await ed.evaluate(`(${readLook})(document.querySelector('[data-theme-card="${t.id}"] [data-tp-page]'))`)
    const W = 780, H = 1092
    const a = await sharp(liveShot).resize(W, H, { fit: "cover", position: "top" }).png().toBuffer()
    const b = await sharp(cardShot).resize(W, H, { fit: "cover", position: "top" }).png().toBuffer()
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2 + 24}" height="56"><text x="0" y="38" font-family="Inter,Arial" font-size="30" fill="#1a1a2e">${t.name}: live page at 390</text><text x="${W + 24}" y="38" font-family="Inter,Arial" font-size="30" fill="#1a1a2e">theme card</text></svg>`)
    const pair = await sharp({ create: { width: W * 2 + 24, height: H + 56, channels: 3, background: "#f8f9fa" } }).composite([{ input: label, left: 0, top: 0 }, { input: a, left: 0, top: 56 }, { input: b, left: W + 24, top: 56 }]).png().toBuffer()
    await sharp(pair).toFile(join(shots, `side-by-side-${t.id}.png`))
    side.push(pair)

    const diffs = []
    const near = (x, y, tol) => x !== null && y !== null && Math.abs(x - y) <= tol
    if (liveLook.font !== cardLook.font) diffs.push(`name face ${liveLook.font} / ${cardLook.font}`)
    if (liveLook.titleColor !== cardLook.titleColor) diffs.push(`name colour ${liveLook.titleColor} / ${cardLook.titleColor}`)
    if (liveLook.titleWords !== cardLook.titleWords) diffs.push(`name "${liveLook.titleWords}" / "${cardLook.titleWords}"`)
    if (liveLook.bioWords !== cardLook.bioWords) diffs.push(`bio "${liveLook.bioWords}" / "${cardLook.bioWords}"`)
    if (liveLook.avatarW !== null || cardLook.avatarW !== null) {
      if (!near(liveLook.avatarW, cardLook.avatarW, 1.5)) diffs.push(`avatar width ${liveLook.avatarW}% / ${cardLook.avatarW}%`)
      if (!near(liveLook.avatarLeft, cardLook.avatarLeft, 2)) diffs.push(`avatar place ${liveLook.avatarLeft}% / ${cardLook.avatarLeft}%`)
    }
    if (!near(liveLook.titleLeft, cardLook.titleLeft, 3)) diffs.push(`name place ${liveLook.titleLeft}% / ${cardLook.titleLeft}%`)
    if (cardLook.buttonFill !== null) {
      if (liveLook.buttonFill !== cardLook.buttonFill) diffs.push(`link fill ${liveLook.buttonFill} / ${cardLook.buttonFill}`)
      if (liveLook.buttonText !== cardLook.buttonText) diffs.push(`link words colour ${liveLook.buttonText} / ${cardLook.buttonText}`)
      if (liveLook.buttonWords !== cardLook.buttonWords) diffs.push(`link "${liveLook.buttonWords}" / "${cardLook.buttonWords}"`)
      if (!near(liveLook.buttonRadius, cardLook.buttonRadius, 0.06)) diffs.push(`link corner ${liveLook.buttonRadius} / ${cardLook.buttonRadius}`)
      if (!near(liveLook.buttonH, cardLook.buttonH, 3)) diffs.push(`link height ${liveLook.buttonH} / ${cardLook.buttonH}`)
      if (!near(liveLook.buttonW, cardLook.buttonW, 3)) diffs.push(`link width ${liveLook.buttonW} / ${cardLook.buttonW}`)
      if (liveLook.buttonBorder > 0 && liveLook.buttonBorderColor !== cardLook.buttonBorderColor) diffs.push(`link border ${liveLook.buttonBorderColor} / ${cardLook.buttonBorderColor}`)
      if (liveLook.layout !== cardLook.layout) diffs.push(`layout ${liveLook.layout} / ${cardLook.layout}`)
    }
    if (cardLook.products !== "none" && liveLook.products !== cardLook.products) diffs.push(`products ${liveLook.products} / ${cardLook.products}`)
    if (cardLook.newsFill !== null && liveLook.newsFill !== null) {
      if (liveLook.newsFill !== cardLook.newsFill) diffs.push(`newsletter card ${liveLook.newsFill} / ${cardLook.newsFill}`)
      if (liveLook.sendFill !== cardLook.sendFill) diffs.push(`newsletter button ${liveLook.sendFill} / ${cardLook.sendFill}`)
      if (liveLook.sendText !== cardLook.sendText) diffs.push(`newsletter button words ${liveLook.sendText} / ${cardLook.sendText}`)
    }
    /*
      The card leaves out the page's Share and Subscribe row (round W8): the name sits up to 34px higher on a
      centred header, and up to 56px on a header set flush left, which the page starts under that row.
    */
    if (liveLook.tops[0] !== null && cardLook.tops[0] !== null && (liveLook.tops[0] - cardLook.tops[0] < -6 || liveLook.tops[0] - cardLook.tops[0] > (cardLook.titleLeft !== null && cardLook.titleLeft < 20 ? 56 : 34))) diffs.push(`name at ${liveLook.tops[0]} / ${cardLook.tops[0]}`)
    liveLook.tops.forEach((y, i) => { if (i && y !== null && cardLook.tops[i] !== null && Math.abs((y - liveLook.tops[0]) - (cardLook.tops[i] - cardLook.tops[0])) > 6) diffs.push(`${["name", "icons", "first link"][i]} at ${y} / ${cardLook.tops[i]} (from the name)`) })
    console.log(`  ${diffs.length ? "DIFF" : "ok  "}  ${t.id.padEnd(12)} ${diffs.join("; ") || `${cardLook.titleWords}, ${cardLook.font}, ${cardLook.layout}, products ${cardLook.products}`}`)
    if (diffs.length) problems.push(`${t.id}: ${diffs.join("; ")}`)
  }
  if (side.length) {
    const cols = 3
    const metas = await Promise.all(side.map((s) => sharp(s).metadata()))
    const w = metas[0].width, h = metas[0].height
    const rows = Math.ceil(side.length / cols)
    const sheet = await sharp({ create: { width: cols * (w + 40), height: rows * (h + 40), channels: 3, background: "#ffffff" } })
      .composite(side.map((s, i) => ({ input: s, left: (i % cols) * (w + 40), top: Math.floor(i / cols) * (h + 40) })))
      .png().toBuffer()
    await sharp(sheet).resize({ width: Math.min(cols * (w + 40), 4800) }).toFile(join(shots, "side-by-side.png"))
  }
  await live.close()
  await ed.close()
}

/* ── The grid: drawn whole, its cost, and its words ── */
const textReport = (scope) => {
  const out = { cards: 0, texts: 0, meet: [], out: [], cut: [], squeezed: [], bars: [], empty: [] }
  const clipBox = (el, stop) => {
    for (let n = el.parentElement; n && n !== stop.parentElement; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.overflowX !== "visible" || s.overflowY !== "visible") return n
    }
    return null
  }
  for (const card of document.querySelectorAll(`${scope} [data-theme-card]`)) {
    out.cards++
    const id = card.getAttribute("data-theme-card")
    const frame = card.querySelector("[data-theme-frame]").getBoundingClientRect()
    const cr = card.getBoundingClientRect()
    /* A grey placeholder bar: a span with no words, only a background, the shape of a line of words. */
    for (const s of card.querySelectorAll("[data-tp-page] span")) {
      if (s.children.length || s.textContent.trim()) continue
      const r = s.getBoundingClientRect(), cs = getComputedStyle(s)
      if (r.height > 0 && r.height <= 4 && r.width > 12 && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.borderRadius !== "0px") out.bars.push(id)
    }
    if (!card.querySelector("[data-tp-blocks] [data-tp-label], [data-tp-blocks] [data-tp-product], [data-tp-blocks] [data-tp-news]")) out.empty.push(id)
    const boxes = []
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue
      const el = n.parentElement
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none") continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      if (!r.width || !r.height) continue
      /* A block that did not fit sits in a column out of sight (round W8): not shown, not read. */
      if (el.closest("[data-tp-page]") && (r.left >= frame.right - 0.5 || r.top >= frame.bottom - 0.5)) continue
      out.texts++
      boxes.push({ r, t: n.textContent.trim() })
      const pad = 0.5
      if (r.left < cr.left - pad || r.right > cr.right + pad || r.top < cr.top - pad || r.bottom > cr.bottom + pad) out.out.push(`${id} "${n.textContent.trim()}"`)
      const clip = clipBox(el, card)
      if (clip && !clip.matches("[data-tp-page], [data-theme-frame], [data-tp-blocks]")) {
        const k = clip.getBoundingClientRect()
        if (r.left < k.left - pad || r.right > k.right + pad || r.top < k.top - pad || r.bottom > k.bottom + pad) out.cut.push(`${id} "${n.textContent.trim()}"`)
      }
      const er = el.getBoundingClientRect()
      const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
      if (er.height < Math.min(r.height, line) - 1) out.squeezed.push(`${id} "${n.textContent.trim()}"`)
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 0.5 && h > 0.5) out.meet.push(`${id} "${boxes[i].t}" and "${boxes[j].t}"`)
    }
  }
  return out
}

if (PARTS.has("cost") || PARTS.has("text")) {
  for (const width of [390, 1440]) {
    const phone = width < 600
    const p = await browser.newPage()
    await p.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
    await wire(p)
    fontBytes.n = 0
    fontBytes.bytes = 0
    fontBytes.cut = 0
    fontBytes.cutBytes = 0
    await openPicker(p, phone)
    const cdp = await p.createCDPSession()
    await cdp.send("Performance.enable")
    const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
    const before = await metric()
    const t0 = await p.evaluate(() => performance.now())
    await showThemes(p, phone)
    const t1 = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))))
    const after = await metric()
    await settle(p)
    const nodes = await p.evaluate(() => {
      const shown = [...document.querySelectorAll("[data-theme-kind-shown] [data-theme-card]")]
      const all = [...document.querySelectorAll("[data-theme-card], [data-theme-copy]")]
      const per = shown.map((c) => c.querySelectorAll("*").length)
      return { shown: shown.length, all: all.length, mean: Math.round(per.reduce((a, b) => a + b, 0) / per.length), max: Math.max(...per), document: document.querySelectorAll("*").length }
    })
    console.log(`\n── The Theme page at ${width} ──`)
    console.log(`  opened to every card drawn with its creator: ${Math.round(t1 - t0)}ms (script ${Math.round((after.ScriptDuration - before.ScriptDuration) * 1000)}ms, style ${Math.round((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000)}ms, layout ${Math.round((after.LayoutDuration - before.LayoutDuration) * 1000)}ms)`)
    console.log(`  ${nodes.shown} cards shown, ${nodes.all} kept in all the kinds' grids; DOM nodes per card: mean ${nodes.mean}, most ${nodes.max}; the whole document ${nodes.document}`)
    if (PARTS.has("text")) {
      const r = await p.evaluate(`(${textReport})("[data-theme-kind-shown]")`)
      console.log(`  ${r.cards} cards, ${r.texts} text boxes: ${r.meet.length} meet, ${r.out.length} run out, ${r.cut.length} cut, ${r.squeezed.length} squeezed; ${r.bars.length} grey bars; ${r.empty.length} cards without blocks`)
      for (const k of ["meet", "out", "cut", "squeezed", "bars", "empty"]) for (const x of [...new Set(r[k])].slice(0, 8)) console.log(`    ${k}: ${x}`)
      for (const k of ["meet", "out", "cut", "squeezed", "bars", "empty"]) if (r[k].length) problems.push(`${width}: ${r[k].length} ${k}`)
    }
    const grid = await p.$("[data-theme-grid]")
    await grid.evaluate((e) => e.scrollIntoView({ block: "start" }))
    await sleep(300)
    await p.screenshot({ path: join(shots, `grid-${width}.png`) })
    const tall = await grid.evaluate((e) => Math.ceil(e.getBoundingClientRect().height) + 400)
    const vp = p.viewport()
    await p.setViewport({ ...vp, height: tall })
    await sleep(700)
    await settle(p)
    await grid.screenshot({ path: join(shots, `grid-${width}-all.png`) })
    console.log(`  fonts fetched: ${fontBytes.n} files, ${Math.round(fontBytes.bytes / 1024)}KB; of them the cards' cut faces (fonts.gstatic.com/l/font): ${fontBytes.cut} files, ${Math.round(fontBytes.cutBytes / 1024)}KB`)
    await p.setViewport(vp)
    await sleep(300)
    if (PARTS.has("cost")) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const frames = await p.evaluate(async () => {
        let box = document.querySelector("[data-theme-grid]")
        while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
        box = box || document.scrollingElement
        box.scrollTop = 0
        const times = []
        let last = performance.now()
        const end = last + 2500
        await new Promise((done) => {
          const step = (now) => {
            times.push(now - last)
            last = now
            box.scrollTop += 24
            if (now < end) requestAnimationFrame(step)
            else done()
          }
          requestAnimationFrame(step)
        })
        times.shift()
        times.sort((a, b) => a - b)
        return { n: times.length, p50: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], over: times.filter((t) => t > 34).length }
      })
      console.log(`  scrolling the grid, CPU slowed 4x: ${frames.n} frames, median ${frames.p50.toFixed(1)}ms, 95th ${frames.p95.toFixed(1)}ms, longest ${frames.max.toFixed(1)}ms, ${frames.over} over 34ms`)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    }
    await p.close()
  }
}

await browser.close()
server.close()
if (errors.length) problems.push(...[...new Set(errors)].slice(0, 5).map((e) => `page error: ${e}`))
console.log(`\nPictures in ${shots}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nEvery card is its creator's page, drawn whole, with no bar left.")
