/**
 * ===========================================================================
 *  ROUND 41, MEASURED: A OnePage'S EDGES, EMBEDS, ICONS AND SHEETS
 * ===========================================================================
 * scripts/render-onepage-public-r41.tsx (the real published page) in headless
 * Chromium. For each theme:
 *
 *   EDGES     the pill product button and the callout card, photographed at
 *             3x along the 45 degree ray through a rounded corner. A clean
 *             edge only ever mixes the page's colour and the edge's own
 *             colour; a pixel off that line is the fill bleeding out under
 *             the border (the "scattered border"). Reported as the largest
 *             distance off the line, in RGB units (0 to 441).
 *   EMBED     an X post: X's document is stood in for here (a 12px card,
 *             550px at most, that says its height and width the way X's does),
 *             so what is measured is our side: the frame's width against the
 *             card's, the radius we clip at, any fill of ours beside it.
 *   ICONS     a social icon's box before and while hovered (size and the
 *             row's other icons must not move).
 *   DIALOGS   Share and Subscribe opened at 1440: the page's width, the
 *             scrollbar and html/body overflow before and after, so nothing
 *             shifts; the share card shows the creator's photo.
 *   SHEET     a product in its sheet at 390: the drag handle sits above the
 *             picture, not over it; the button for a product that ships
 *             carries the option and quantity.
 *
 *   node scripts/check-onepage-public-r41.mjs     THEMES=astrid,ember  SHOTS=dir
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || join(tmpdir(), "onepage-r41-shots")
mkdirSync(SHOTS, { recursive: true })
const THEMES = (process.env.THEMES || "astrid,night,neon,midnight,space,ember,atlas,graphite,default,cream").split(",")
const FRINGE_MAX = Number(process.env.FRINGE_MAX || 40)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const expect = (ok, name, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
}

/* X's document, stood in: transparent canvas, a card of 550 at most with a 12px corner, its height and width said to the page. */
const fakeTweet = (dark) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}
.c{box-sizing:border-box;max-width:550px;width:100%;height:300px;border-radius:12px;border:1px solid ${dark ? "#2f3336" : "#cfd9de"};background:${dark ? "#000" : "#fff"};font:15px system-ui;color:${dark ? "#e7e9ea" : "#0f1419"};padding:16px}</style></head>
<body><div class="c" id="c">Maria Clay @maria<br><br>New prints are up.</div><script>
function say(){var r=document.getElementById("c").getBoundingClientRect();parent.postMessage({"twttr.embed":{method:"twttr.private.resize",params:[{height:Math.round(r.height),width:Math.round(r.width)}]}},"*");parent.postMessage({probeCard:{w:Math.round(r.width),h:Math.round(r.height),canvas:getComputedStyle(document.documentElement).backgroundColor}},"*")}
say();addEventListener("resize",say)</script></body></html>`

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-public-r41.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], ignoreDefaultArgs: ["--hide-scrollbars"] })

async function open(vp, path) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("https://platform.twitter.com/embed/Tweet.html")) return void r.respond({ status: 200, contentType: "text/html", body: fakeTweet(/theme=dark/.test(u)) })
    if (u.startsWith(base) || u.startsWith("data:")) return void r.continue()
    return void r.abort()
  })
  if (!vp.isMobile)
    await p.evaluateOnNewDocument(() => {
      const css = "html::-webkit-scrollbar{width:15px;background:#888}html::-webkit-scrollbar-thumb{background:#444}"
      const add = () => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st) }
      if (document.head) add()
      else document.addEventListener("DOMContentLoaded", add)
    })
  await p.evaluateOnNewDocument(() => addEventListener("message", (e) => { if (e.data && e.data.probeCard) window.__card = e.data.probeCard }))
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  await p.goto(`${base}${path}`, { waitUntil: "load" })
  /* The probe page is served as /app; a OnePage is not, so /app's own html rules (overflow hidden on a phone) are taken off. */
  await p.evaluate(() => document.documentElement.classList.remove("app-layout"))
  /* A classic scrollbar, as a desktop browser draws one (headless draws none), so hiding it would show as a change of width. */
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  if (!vp.isMobile) await p.evaluate(() => document.querySelectorAll("style").forEach((s) => { s.textContent = s.textContent.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)(\s*and\s*\(\s*pointer\s*:\s*fine\s*\))?/g, "@media all") }))
  await sleep(900)
  return { p, errors }
}

async function shownBox(p, sel) {
  return p.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0)
    if (!el) return null
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { x: r.left, y: r.top, w: r.width, h: r.height, radius: parseFloat(cs.borderTopLeftRadius) || 0, bw: parseFloat(cs.borderTopWidth) || 0 }
  }, sel)
}

/** The largest step off the page-to-edge line along the 45 degree ray through the top left corner. */
async function fringe(p, sel, name) {
  const box0 = await shownBox(p, sel)
  if (!box0) return null
  await sleep(150)
  const box = await shownBox(p, sel)
  const dpr = 3
  const r = Math.min(box.radius, box.h / 2, box.w / 2)
  if (r < 4) return { r, d: 0 }
  const pad = 6
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: r + pad * 2, height: r + pad * 2 }
  const buf = await p.screenshot({ clip, captureBeyondViewport: false })
  await sharp(buf).resize({ width: Math.round(clip.width * dpr * 4), kernel: "nearest" }).toFile(join(SHOTS, `${name}.png`))
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (cx, cy) => {
    const x = Math.round((cx - clip.x) * dpr)
    const y = Math.round((cy - clip.y) * dpr)
    const i = (Math.max(0, Math.min(info.height - 1, y)) * info.width + Math.max(0, Math.min(info.width - 1, x))) * 3
    return [data[i], data[i + 1], data[i + 2]]
  }
  const cx = box.x + r
  const cy = box.y + r
  const k = Math.SQRT1_2
  const point = (dist) => at(cx - dist * k, cy - dist * k)
  const outside = point(r + 3)
  const ring = box.bw > 0 ? point(r - box.bw / 2) : point(r - 3)
  const off = (c) => {
    const ab = ring.map((v, i) => v - outside[i])
    const ac = c.map((v, i) => v - outside[i])
    const len = ab.reduce((s, v) => s + v * v, 0) || 1
    const t = Math.max(0, Math.min(1, ab.reduce((s, v, i) => s + v * ac[i], 0) / len))
    return Math.sqrt(ac.reduce((s, v, i) => s + (v - t * ab[i]) ** 2, 0))
  }
  let worst = 0
  for (let d = r + 2.5; d >= r - Math.max(box.bw, 0.5) * 0.6; d -= 1 / dpr) worst = Math.max(worst, off(point(d)))
  return { r: Math.round(r), bw: box.bw, d: Math.round(worst), outside, ring }
}

const DESK3 = { width: 900, height: 900, deviceScaleFactor: 3 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

for (const theme of THEMES) {
  console.log(`\n${theme}`)
  const { p, errors } = await open(DESK3, `/app/r41?theme=${theme}&solid=1`)
  await p.waitForSelector("[data-product-block]", { timeout: 15000 })
  for (const [sel, label] of [["[data-product-block=button]", "pill button"], ["[data-product-block=callout]", "callout card"], ["[data-product-block=callout] [data-product-cta]", "callout button"]]) {
    const f = await fringe(p, sel, `edge-${theme}-${label.replace(/ /g, "-")}`)
    if (f) expect(f.d <= FRINGE_MAX, `${label}: corner edge mixes only page and edge colour (off by ${f.d}, r ${f.r}, border ${f.bw})`, { outside: f.outside, ring: f.ring })
  }
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()
}

console.log("\nX post, icons and dialogs at 1440 (astrid, dark)")
{
  const { p, errors } = await open(DESK, `/app/r41?theme=astrid`)
  await p.waitForSelector("[data-onepage-embed]", { timeout: 15000 })
  await p.evaluate(() => [...document.querySelectorAll("[data-onepage-embed]")].find((e) => e.getBoundingClientRect().width > 0)?.scrollIntoView({ block: "center" }))
  await sleep(2500)
  const e = await p.evaluate(() => {
    const wrap = [...document.querySelectorAll("[data-embed-frame]")].find((e) => e.getBoundingClientRect().width > 0)
    if (!wrap) return null
    const f = wrap.querySelector("iframe")
    const card = window.__card ? { getBoundingClientRect: () => ({ width: window.__card.w, height: window.__card.h }) } : null
    const cs = getComputedStyle(wrap)
    return {
      wrapWidth: Math.round(wrap.getBoundingClientRect().width),
      frameWidth: Math.round(f.getBoundingClientRect().width),
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
      wrapHeight: Math.round(wrap.getBoundingClientRect().height),
      cardHeight: card ? Math.round(card.getBoundingClientRect().height) : null,
      clip: cs.overflow,
      radius: cs.borderTopLeftRadius,
      wrapBg: cs.backgroundColor,
      frameScheme: getComputedStyle(f).colorScheme,
      src: f.getAttribute("src"),
    }
  })
  expect(!!e && e.wrapWidth === e.cardWidth && e.frameWidth === e.cardWidth, "X post: the frame is exactly the card's width (no strip beside it)", e)
  expect(!!e && e.wrapHeight === e.cardHeight, "X post: the frame is exactly the card's height", e && { wrap: e.wrapHeight, card: e.cardHeight })
  expect(!!e && (e.clip === "visible" || e.radius === "12px"), "X post: the corners are X's own (no clip, or a 12px one)", e && { clip: e.clip, radius: e.radius })
  expect(!!e && e.wrapBg === "rgba(0, 0, 0, 0)", "X post: nothing of ours behind it", e?.wrapBg)
  expect(!!e && /theme=dark/.test(e.src), "X post: X's dark look on a dark page", e?.src)
  const x = await shownBox(p, "[data-onepage-embed]")
  if (x) await p.screenshot({ path: join(SHOTS, "x-post-astrid.png"), clip: { x: 0, y: Math.max(0, x.y - 20), width: 1400, height: Math.min(860, x.h + 40) }, captureBeyondViewport: false })

  /* Icons: one hovered, every icon's box before and during. */
  const icons = () => p.evaluate(() => [...document.querySelectorAll("[data-op-social-icon]")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, e.offsetWidth, e.offsetHeight, e.offsetLeft, e.offsetTop] }))
  await p.evaluate(() => window.scrollTo(0, 0))
  await sleep(300)
  const before = await icons()
  const first = await p.evaluateHandle(() => [...document.querySelectorAll("[data-op-social-icon]")].find((e) => e.getBoundingClientRect().width > 0))
  if (first.asElement()) await first.asElement().hover()
  await sleep(450)
  const during = await icons()
  const layoutSame = before.length > 0 && before.every((b, i) => during[i] && b.slice(4).join() === during[i].slice(4).join())
  const sizeSame = before.length > 0 && before.every((b, i) => during[i] && b[2] === during[i][2] && b[3] === during[i][3])
  expect(layoutSame, `social icons: hovering moves no other icon (layout boxes, ${before.length} icons)`, { before, during })
  expect(sizeSame, "social icons: the hovered icon keeps its size", { before: before[0], during: during[0] })
  await p.mouse.move(5, 5)

  /* Dialogs. */
  for (const [btn, sel, name] of [["[data-onepage-share-button]", "[data-onepage-share-sheet]", "share"], ["[data-onepage-bell]", "[data-onepage-subscribe-sheet]", "subscribe"]]) {
    /* The share and bell buttons hide while the page is scrolled down, so the page sits at its top. */
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(200)
    const read = () => p.evaluate(() => ({ cw: document.documentElement.clientWidth, html: getComputedStyle(document.documentElement).overflowY, body: getComputedStyle(document.body).overflowY, pad: getComputedStyle(document.body).paddingRight, y: Math.round(scrollY), x: Math.round(([...document.querySelectorAll("[data-product-block]")].find((e) => e.getBoundingClientRect().width > 0)?.getBoundingClientRect().left) ?? -1) }))
    const was = await read()
    await p.click(btn)
    await sleep(700)
    const now = await read()
    const avatar = await p.evaluate((s) => {
      const el = document.querySelector(s)
      const img = el?.querySelector("img, video")
      return img ? { tag: img.tagName, src: (img.getAttribute("src") || "").slice(0, 30), w: Math.round(img.getBoundingClientRect().width) } : null
    }, sel)
    expect(was.cw === now.cw && was.x === now.x && now.y === was.y, `${name}: the page keeps its width, place and scroll when it opens`, { was, now })
    expect(now.html !== "hidden" && now.body !== "hidden", `${name}: html and body overflow untouched`, now)
    expect(!!avatar && avatar.w >= 56, `${name}: the creator's photo is in it`, avatar)
    await p.mouse.move(120, 450)
    await p.mouse.wheel({ deltaY: 600 })
    await sleep(400)
    const afterWheel = await p.evaluate(() => Math.round(scrollY))
    expect(afterWheel === now.y, `${name}: a wheel over the dimmed page does not scroll it`, { before: now.y, after: afterWheel })
    await p.screenshot({ path: join(SHOTS, `${name}-desk.png`) })
    await p.keyboard.press("Escape")
    await sleep(400)
  }
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()
}

console.log("\nProduct sheet at 390 (astrid)")
{
  const { p, errors } = await open(PHONE, `/app/r41?theme=astrid`)
  await p.waitForSelector("[data-product-block]", { timeout: 15000 })
  for (const [id, name] of [["p_sheet", "download"], ["p_ship", "ships"]]) {
    const tap = await p.evaluateHandle((id) => [...document.querySelectorAll(`[data-product-tap="sheet"]`)].find((e) => e.getBoundingClientRect().width > 0 && e.closest(`[data-block-id="${id}"]`)) || [...document.querySelectorAll(`[data-product-tap="sheet"]`)].filter((e) => e.getBoundingClientRect().width > 0)[id === "p_sheet" ? 0 : 1], id)
    await tap.asElement().evaluate((e) => e.scrollIntoView({ block: "center" }))
    await sleep(200)
    await tap.asElement().tap()
    await sleep(1600)
    const m = await p.evaluate(() => {
      const sheet = [...document.querySelectorAll("[data-sheet-panel]")].find((e) => e.getBoundingClientRect().height > 50 && getComputedStyle(e).visibility !== "hidden")
      if (!sheet) return null
      const handle = sheet.querySelector("[data-sheet-handle]") || sheet.querySelector("[data-sheet-grabber]")
      const gallery = sheet.querySelector("[data-product-sheet-gallery]")
      const buy = sheet.querySelector("[data-product-sheet-buy]")
      const hb = handle?.getBoundingClientRect()
      const gb = gallery?.getBoundingClientRect()
      return { handleBottom: hb ? Math.round(hb.bottom) : null, galleryTop: gb ? Math.round(gb.top) : null, sheetTop: Math.round(sheet.getBoundingClientRect().top), buyHref: buy?.getAttribute("href") || null, buyText: buy?.textContent || null, qty: !!sheet.querySelector("[data-product-sheet-qty]") }
    })
    expect(!!m && m.galleryTop !== null && m.handleBottom !== null && m.galleryTop >= m.handleBottom, `${name}: the handle sits above the picture, not over it`, m)
    if (name === "ships") {
      expect(!!m && m.qty, "ships: a quantity is chosen in the sheet", m)
      const scope = '[data-product-sheet="p-ship"]'
      const before = await p.evaluate((s) => document.querySelector(`${s} [data-product-sheet-buy]`)?.textContent, scope)
      expect(before === "Choose an option", "ships: two options and none chosen: the button asks for one first", before)
      await p.evaluate((s) => document.querySelector(`${s} [data-product-sheet-options] [role=radio]:nth-child(2)`)?.click(), scope)
      await p.evaluate((s) => document.querySelector(`${s} [data-product-sheet-qty-more]`)?.click(), scope)
      await sleep(200)
      const href = await p.evaluate((s) => document.querySelector(`${s} [data-product-sheet-buy]`)?.getAttribute("href"), scope)
      let items = null
      try {
        items = JSON.parse(Buffer.from(new URL(href).searchParams.get("items"), "base64url").toString("utf8"))
      } catch {}
      expect(/\/checkout\/physical\?/.test(href || "") && /shop=seller_probe/.test(href || "") && JSON.stringify(items) === JSON.stringify([["p-ship", "v-l", 2]]), "ships: the button goes to the cart checkout with the option and quantity chosen", { href: (href || "").slice(0, 120), items })
    }
    await p.screenshot({ path: join(SHOTS, `sheet-${name}-phone.png`) })
    await p.evaluate(() => history.back())
    await sleep(900)
  }
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()
}

await browser.close()
server.close()
console.log(failed ? `\n${failed} FAILED   (pictures in ${SHOTS})` : `\nall ok   (pictures in ${SHOTS})`)
process.exit(failed ? 1 : 0)
