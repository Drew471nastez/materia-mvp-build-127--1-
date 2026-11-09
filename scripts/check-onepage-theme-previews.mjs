/**
 * ===========================================================================
 *  EVERY THEME CARD IS THE PAGE IT MAKES, MEASURED (round AP)
 * ===========================================================================
 * The owner: "fix the themes previews so they're actually correct, because
 * some of them are completely fucked, such as the folio", "the ledger as
 * well, text underlaps very bad". Folio's name was squeezed to a sliver
 * under its cover (garbage glyphs) and Ledger's rows ran into each other.
 *
 * The real OnePage editor and the real live page (scripts/onepage-probe-server.mjs):
 *
 *   SIDE BY SIDE  every theme's live page at 390 (the top of it, the shape of
 *                 a card) beside its card in the picker, in
 *                 side-by-side-<id>.png, and all of them in side-by-side.png.
 *                 The same page is drawn in both: the theme's name, a bio,
 *                 three social icons, three links (the first with a picture)
 *                 and, for a theme that lays products out its own way, two
 *                 products ahead of the links.
 *   MATCH         read from both: the background, the title's face and
 *                 colour, the avatar's shape and size against the width, the
 *                 header's alignment, the first button's fill, words, corner
 *                 and border, and the blocks' layout. A mismatch fails.
 *   TEXT          every card in the picker at 390 and 1440: no two text boxes
 *                 in a card meet, none runs out of the card or is cut by a
 *                 box that clips it, and none is squeezed shorter than its
 *                 own line (Folio's sliver).
 *   PICKER        picker-390.png and picker-1440.png; scrolling the picker
 *                 on a phone with the CPU slowed four times, frame times.
 *
 *   node scripts/check-onepage-theme-previews.mjs
 *   SHOTS=/some/dir THEMES=folio,ledger node scripts/check-onepage-theme-previews.mjs
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
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-theme-previews-"))
mkdirSync(shots, { recursive: true })
const ONLY = process.env.THEMES ? new Set(process.env.THEMES.split(",")) : null
const PARTS = new Set((process.env.PARTS || "side,text,picker").split(","))

/* The catalogue, from the Design tab and the newer themes' own file. */
const sources = ["components/onepage/tabs/design-tab.tsx", "components/onepage/themes/r40-themes.ts"].map((f) => readFileSync(join(root, f), "utf8")).join("\n")
const THEMES = [...sources.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",\n    name: "([^"]+)",[\s\S]*?theme_config: \{([\s\S]*?)\n    \},/g)].map((m) => ({
  id: m[1],
  name: m[2],
  products: /product_layout: "(grid|rows)"/.test(m[3]),
  /* Round W8: a card draws product tiles after its links (they would take the links out of sight), so its first link is not where the page's is. */
  tilesLast: /product_layout: "grid"/.test(m[3]),
}))
if (THEMES.length < 30) fail(`only ${THEMES.length} themes were read`)

/* The picture a link and a product carry, and the avatar: flat tints, so neither side has a photo the other lacks. */
const tint = (h, s, l) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${h},${s}%,${l}%)"/></svg>`)}`
const blocksFor = (t) => {
  const links = [
    { id: "l1", type: "link_button", enabled: true, sort_order: 10, data: { label: "Latest work", url: "https://example.com/work", thumbnail_url: tint(30, 25, 62) } },
    { id: "l2", type: "link_button", enabled: true, sort_order: 11, data: { label: "Book a session", url: "https://example.com/book" } },
    { id: "l3", type: "link_button", enabled: true, sort_order: 12, data: { label: "Newsletter", url: "https://example.com/news" } },
  ]
  const products = t.products ? [1, 2].map((n) => ({ id: `p${n}`, type: "product", enabled: true, sort_order: n, data: { product_id: `p${n}`, product_title: n === 1 ? "Print set" : "Field notes", product_price_cents: n === 1 ? 2400 : 1200, product_slug: `p${n}`, product_thumbnail: tint(200 + n * 40, 20, 70), cta_text: "Buy" } })) : []
  return [{ id: "s", type: "social_row", enabled: true, sort_order: 0, data: { platforms: [{ platform: "instagram", url: "https://instagram.com/x" }, { platform: "tiktok", url: "https://tiktok.com/@x" }, { platform: "youtube", url: "https://youtube.com/@x" }] } }, ...products, ...links]
}

const { base, server } = await serveEditorProbe({ root, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const problems = []

/* ── Fonts and photos from where the browser would get them, kept ── */
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
    if (!OUTSIDE.test(u.hostname)) return req.abort()
    const got = await remote(req.url())
    if (!got) return req.abort()
    return req.respond({ status: 200, contentType: got.type, body: got.body, headers: { "access-control-allow-origin": "*" } })
  })
  p.on("pageerror", (e) => errors.push(String(e)))
}
const settle = (p) => p.evaluate(async () => {
  await document.fonts.ready
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000) }))))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
})

/* What a page or a card draws, read the same way from both (the card's preview is the page at its own scale). */
function readLook(scope) {
  const box = scope.getBoundingClientRect()
  const s = (el) => (el ? getComputedStyle(el) : null)
  const title = scope.querySelector("h1, [data-tp-title]")
  const avatar = scope.querySelector("[data-page-avatar], [data-tp-avatar]")
  /* Round W8: a card shows whole blocks only; one that did not fit sits in a column out of sight, which is not read. */
  const seen = (el) => { const r = el.getBoundingClientRect(); return r.left < box.right - 1 && r.top < box.bottom - 1 }
  const button = [...scope.querySelectorAll("a.op-btn, [data-tp-link]")].find(seen) || null
  const ts = s(title), as = s(avatar), bs = s(button)
  const ar = avatar?.getBoundingClientRect(), tr = title?.getBoundingClientRect(), br = button?.getBoundingClientRect()
  const pairs = scope.querySelectorAll("[data-link-pair], [data-tp-pair]").length
  const cards = scope.querySelectorAll("a.op-card, [data-tp-card]").length
  const prodGrid = scope.querySelectorAll('[data-product-block="tile"], [data-tp-product="tile"]').length
  const prodRows = scope.querySelectorAll('[data-product-block="row"], [data-tp-product="row"]').length
  const avatarRadius = as ? (avatar.querySelector("[data-slot=avatar], span") ? s(avatar.firstElementChild?.firstElementChild || avatar).borderTopLeftRadius : as.borderTopLeftRadius) : null
  return {
    font: ts ? ts.fontFamily.split(",")[0].replace(/['"]/g, "").trim() : null,
    titleColor: ts?.color ?? null,
    titleLeft: tr ? Math.round(((tr.left - box.left) / box.width) * 100) : null,
    avatarW: ar ? Math.round((ar.width / box.width) * 1000) / 10 : null,
    avatarLeft: ar ? Math.round(((ar.left - box.left) / box.width) * 100) : null,
    avatarRound: avatarRadius ? parseFloat(avatarRadius) / (ar?.width || 1) : null,
    buttonFill: bs?.backgroundColor ?? null,
    buttonText: bs?.color ?? null,
    buttonRadius: bs && br ? Math.round((Math.min(parseFloat(bs.borderTopLeftRadius), br.height / (box.width / 390) / 2) / (br.height / (box.width / 390))) * 100) / 100 : null,
    buttonBorder: bs ? parseFloat(bs.borderTopWidth) : null,
    buttonBorderColor: bs?.borderTopColor ?? null,
    layout: scope.querySelector("[data-mixed-blocks], [data-tp-masonry]") ? "masonry" : pairs ? "grid" : cards ? "cards" : "list",
    products: prodGrid ? "grid" : prodRows ? "rows" : "own",
    /* Where the name, the social row and the first link start, in the page's own pixels. */
    tops: [title, scope.querySelector("[data-op-social-row], [data-tp-socials]"), button].map((el) => (el ? Math.round((el.getBoundingClientRect().top - box.top) / (box.width / 390)) : null)),
  }
}

const side = []
const tops = []
if (PARTS.has("side")) {
  console.log("\n── Each theme's live page beside its card ──")
  const live = await browser.newPage()
  await live.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await wire(live)
  const ed = await browser.newPage()
  await ed.setViewport({ width: 390, height: 844, deviceScaleFactor: 4, isMobile: true, hasTouch: true })
  await wire(ed)
  await ed.goto(`${base}/app/onepage#design`)
  await ed.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
  await sleep(800)
  await ed.tap('[data-nav-row="theme"]')
  await ed.waitForSelector("[data-theme-card]")
  await settle(ed)
  for (const t of THEMES) {
    if (ONLY && !ONLY.has(t.id)) continue
    const { identifier } = await live.evaluateOnNewDocument(`window.PROBE_TITLE=${JSON.stringify(t.name)};window.PROBE_AVATAR=${JSON.stringify(tint(220, 8, 74))};window.PROBE_BLOCKS=${JSON.stringify(blocksFor(t))};`)
    await live.bringToFront()
    await live.goto(`${base}/app/onepage?live&template=${t.id}`)
    await live.waitForSelector("[data-op-header], [data-hero-header]", { timeout: 30000 })
    await sleep(700)
    await settle(live)
    await sleep(400)
    const liveShot = await live.screenshot({ clip: { x: 0, y: 0, width: 390, height: 487.5 } })
    const liveLook = await live.evaluate(`(${readLook})(document.querySelector("[data-op-header]")?.closest(".relative.min-h-screen") || document.body)`)
    await live.removeScriptToEvaluateOnNewDocument(identifier)

    const card = await ed.$(`[data-theme-card="${t.id}"] [data-theme-frame]`)
    if (!card) { problems.push(`${t.id}: no card in the picker`); continue }
    await ed.bringToFront()
    await card.evaluate((e) => e.scrollIntoView({ block: "center" }))
    await sleep(150)
    const cardShot = await card.screenshot()
    const cardLook = await ed.evaluate(`(${readLook})(document.querySelector('[data-theme-card="${t.id}"] [data-tp-page]'))`)
    const W = 780, H = 975
    const a = await sharp(liveShot).resize(W, H, { fit: "cover", position: "top" }).png().toBuffer()
    const b = await sharp(cardShot).resize(W, H, { fit: "cover", position: "top" }).png().toBuffer()
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2 + 24}" height="56"><text x="0" y="38" font-family="Inter,Arial" font-size="30" fill="#1a1a2e">${t.name}: live page at 390</text><text x="${W + 24}" y="38" font-family="Inter,Arial" font-size="30" fill="#1a1a2e">picker card</text></svg>`)
    const pair = await sharp({ create: { width: W * 2 + 24, height: H + 56, channels: 3, background: "#f8f9fa" } }).composite([{ input: label, left: 0, top: 0 }, { input: a, left: 0, top: 56 }, { input: b, left: W + 24, top: 56 }]).png().toBuffer()
    await sharp(pair).toFile(join(shots, `side-by-side-${t.id}.png`))
    side.push(pair)

    /* The comparison: what differs between the page and its card. */
    const diffs = []
    const near = (x, y, tol) => x !== null && y !== null && Math.abs(x - y) <= tol
    if (liveLook.font !== cardLook.font) diffs.push(`title face ${liveLook.font} / ${cardLook.font}`)
    if (liveLook.titleColor !== cardLook.titleColor) diffs.push(`title colour ${liveLook.titleColor} / ${cardLook.titleColor}`)
    if (liveLook.avatarW !== null || cardLook.avatarW !== null) {
      if (!near(liveLook.avatarW, cardLook.avatarW, 1.5)) diffs.push(`avatar width ${liveLook.avatarW}% / ${cardLook.avatarW}%`)
      if (!near(liveLook.avatarLeft, cardLook.avatarLeft, 2)) diffs.push(`avatar place ${liveLook.avatarLeft}% / ${cardLook.avatarLeft}%`)
    }
    if (!near(liveLook.titleLeft, cardLook.titleLeft, 3)) diffs.push(`title place ${liveLook.titleLeft}% / ${cardLook.titleLeft}%`)
    const cardHasButton = cardLook.buttonFill !== null
    if (cardHasButton && liveLook.buttonFill !== cardLook.buttonFill) diffs.push(`button fill ${liveLook.buttonFill} / ${cardLook.buttonFill}`)
    if (cardHasButton && liveLook.buttonText !== cardLook.buttonText) diffs.push(`button words ${liveLook.buttonText} / ${cardLook.buttonText}`)
    if (cardHasButton && !near(liveLook.buttonRadius, cardLook.buttonRadius, 0.06)) diffs.push(`button corner ${liveLook.buttonRadius} / ${cardLook.buttonRadius}`)
    if (cardHasButton && liveLook.buttonBorderColor !== cardLook.buttonBorderColor && liveLook.buttonBorder > 0) diffs.push(`button border ${liveLook.buttonBorderColor} / ${cardLook.buttonBorderColor}`)
    if (cardHasButton && liveLook.layout !== cardLook.layout) diffs.push(`layout ${liveLook.layout} / ${cardLook.layout}`)
    if (cardLook.products !== "own" && liveLook.products !== cardLook.products) diffs.push(`products ${liveLook.products} / ${cardLook.products}`)
    /*
      The icons and the first link sit where the page puts them under the
      name, within 6 of its pixels (round W8: the card keeps less room over
      the header than the page's 50px for Share, so the name is compared on
      its own, within the 28px the card leaves out).
    */
    if (liveLook.tops[0] !== null && cardLook.tops[0] !== null && (liveLook.tops[0] - cardLook.tops[0] < -6 || liveLook.tops[0] - cardLook.tops[0] > 34)) diffs.push(`name at ${liveLook.tops[0]} / ${cardLook.tops[0]}`)
    liveLook.tops.forEach((y, i) => { if (i && y !== null && cardLook.tops[i] !== null && (i === 1 || (cardHasButton && !t.tilesLast)) && Math.abs((y - liveLook.tops[0]) - (cardLook.tops[i] - cardLook.tops[0])) > 6) diffs.push(`${["name", "icons", "first link"][i]} at ${y} / ${cardLook.tops[i]} (from the name)`) })
    tops.push({ id: t.id, live: liveLook.tops, card: cardLook.tops })
    console.log(`  ${diffs.length ? "DIFF" : "ok  "}  ${t.id.padEnd(10)} ${diffs.join("; ") || `${cardLook.font}, ${cardLook.layout}${cardLook.products !== "own" ? `, products ${cardLook.products}` : ""}, avatar ${cardLook.avatarW ?? "-"}%`}`)
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
  for (const x of tops) console.log(`    ${x.id.padEnd(10)} name, icons, first link at ${x.live.join(", ")} on the page, ${x.card.join(", ")} on the card`)
  await live.close()
  await ed.close()
}

/* ── No text in any card meets another, runs out, or is cut ── */
async function picker(width) {
  const p = await browser.newPage()
  const phone = width < 600
  await p.setViewport({ width, height: phone ? 844 : 900, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
  await wire(p)
  await p.goto(`${base}/app/onepage#design`)
  await p.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
  await sleep(800)
  if (phone) await p.tap('[data-nav-row="theme"]')
  else await p.click('[data-nav-row="theme"]')
  await p.waitForSelector("[data-theme-card]")
  await settle(p)
  await sleep(500)
  return p
}
const textReport = (scope) => {
  const out = { cards: 0, texts: 0, blocks: 0, meet: [], out: [], cut: [], squeezed: [], sliced: [] }
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
    const cr = card.getBoundingClientRect()
    const boxes = []
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue
      const el = n.parentElement
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none" || el.closest("[aria-hidden=true]:not([data-tp-page])") && !el.closest("[data-tp-page]")) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      if (!r.width || !r.height) { out.squeezed.push(`${id} "${n.textContent.trim()}" has no box`); continue }
      out.texts++
      boxes.push({ r, t: n.textContent.trim(), el })
      const pad = 0.5
      if (r.left < cr.left - pad || r.right > cr.right + pad || r.top < cr.top - pad || r.bottom > cr.bottom + pad) out.out.push(`${id} "${n.textContent.trim()}"`)
      const clip = clipBox(el, card)
      if (clip) {
        const k = clip.getBoundingClientRect()
        if (r.left < k.left - pad || r.right > k.right + pad || r.top < k.top - pad || r.bottom > k.bottom + pad) out.cut.push(`${id} "${n.textContent.trim()}" cut ${Math.round(Math.max(k.left - r.left, r.right - k.right, k.top - r.top, r.bottom - k.bottom))}px`)
      }
      /* A line squeezed shorter than itself (Folio's sliver): the element is shorter than one line of its text. */
      const er = el.getBoundingClientRect()
      const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
      if (er.height < Math.min(r.height, line) - 1) out.squeezed.push(`${id} "${n.textContent.trim()}" ${er.height.toFixed(1)}px for a ${Math.min(r.height, line).toFixed(1)}px line`)
      if (el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflowX)) out.cut.push(`${id} "${n.textContent.trim()}" truncated`)
    }
    /*
      Round W8, BLOCKS: every block in a card is whole or out of sight (never
      the top sliver of a button at the card's edge), and no two shown meet.
    */
    const frame = card.querySelector("[data-theme-frame]")?.getBoundingClientRect()
    const shown = []
    for (const b of card.querySelectorAll("[data-tp-blocks] > *, [data-tp-header], [data-tp-avatar]")) {
      const r = b.getBoundingClientRect()
      if (!frame || !r.width || !r.height) continue
      if (r.left >= frame.right - 0.5 || r.top >= frame.bottom - 0.5) continue
      out.blocks = (out.blocks || 0) + 1
      if (!b.matches("[data-tp-header]") && (r.bottom > frame.bottom + 0.5 || r.right > frame.right + 0.5)) out.sliced.push(`${id} ${b.getAttribute("data-tp-link") !== null ? "link" : b.tagName.toLowerCase()}${[...b.attributes].filter((a) => a.name.startsWith("data-tp")).map((a) => `[${a.name}]`).join("")} cut by the card's edge`)
      if (b.parentElement?.matches("[data-tp-blocks]")) shown.push(r)
    }
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const a = shown[i], b = shown[j]
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) out.meet.push(`${id} two blocks overlap`)
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 0.5 && h > 0.5) out.meet.push(`${id} "${boxes[i].t}" and "${boxes[j].t}" (${w.toFixed(1)}x${h.toFixed(1)})`)
    }
  }
  return out
}
if (PARTS.has("text") || PARTS.has("picker")) {
  for (const width of [390, 1440]) {
    const p = await picker(width)
    if (PARTS.has("text")) {
      const r = await p.evaluate(`(${textReport})("[data-theme-kind-shown]")`)
      console.log(`\n── Text and blocks in the cards at ${width} ──\n  ${r.cards} cards, ${r.texts} text boxes, ${r.blocks} blocks: ${r.meet.length} meet, ${r.out.length} run out of the card, ${r.cut.length} cut, ${r.squeezed.length} squeezed, ${r.sliced.length} blocks sliced by the edge`)
      for (const k of ["meet", "out", "cut", "squeezed", "sliced"]) for (const x of r[k].slice(0, 12)) console.log(`    ${k}: ${x}`)
      const sizes = await p.evaluate(() => [...new Set([...document.querySelectorAll("[data-theme-kind-shown] [data-theme-frame]")].map((f) => `${Math.round(f.getBoundingClientRect().width)}x${Math.round(f.getBoundingClientRect().height)}`))])
      console.log(`  card sizes: ${sizes.join(", ")}`)
      if (sizes.length !== 1) problems.push(`${width}: cards of ${sizes.length} sizes (${sizes.join(", ")})`)
      if (r.cards < 30) problems.push(`${width}: only ${r.cards} cards`)
      for (const k of ["meet", "out", "cut", "squeezed", "sliced"]) if (r[k].length) problems.push(`${width}: ${r[k].length} text boxes ${k}`)
    }
    if (PARTS.has("picker")) {
      const grid = await p.$("[data-theme-grid]")
      await grid.evaluate((e) => e.scrollIntoView({ block: "start" }))
      await sleep(200)
      await p.screenshot({ path: join(shots, `picker-${width}.png`) })
      /* Every card at once: a window tall enough for the whole grid, then back. */
      const tall = await grid.evaluate((e) => Math.ceil(e.getBoundingClientRect().height) + 400)
      const vp = p.viewport()
      await p.setViewport({ ...vp, height: tall })
      await sleep(600)
      await settle(p)
      await grid.screenshot({ path: join(shots, `picker-${width}-all.png`) })
      await p.setViewport(vp)
      await sleep(300)
      /* Scrolling the picker, four times slower CPU: the time between frames while it moves. */
      const cdp = await p.createCDPSession()
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
      console.log(`\n── Scrolling the picker at ${width}, CPU slowed 4x ──\n  ${frames.n} frames: median ${frames.p50.toFixed(1)}ms, 95th ${frames.p95.toFixed(1)}ms, longest ${frames.max.toFixed(1)}ms, ${frames.over} over 34ms`)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    }
    await p.close()
  }
}

await browser.close()
server.close()
if (errors.length) problems.push(...errors.slice(0, 5).map((e) => `page error: ${e}`))
console.log(`\nPictures in ${shots}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nEvery card is its page, and no text meets, runs out or is cut.")
