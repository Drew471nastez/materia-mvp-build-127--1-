/**
 * ===========================================================================
 *  THE EDITOR'S PREVIEW AGAINST THE LIVE ONEPAGE, BLOCK BY BLOCK
 * ===========================================================================
 * "Sometimes in the preview they are not like in the live OnePage."
 *
 * One saved page (scripts/render-onepage-parity.tsx: one of every block the
 * editor adds) is drawn at 390 wide twice, from the same data: once as the
 * editor's preview shows it on a phone, once as the published page. For every
 * theme the Design tab offers, both are measured:
 *
 *   PAGE      the colour behind the page, the font the page is set in, where
 *             the first block starts, how far apart the blocks are
 *   BLOCKS    for each block, in order: its size, the text in it (face, size,
 *             weight, colour), its largest box (fill, corners, border,
 *             shadow), and its pixels, as a share of the block that differs
 *
 * Every difference is printed, and the run fails on any. Nothing leaves the
 * page: every request that is not this server's is refused, for both sides
 * alike, so a font or an embed that cannot load is missing from both.
 *
 * The preview is measured where it draws: inside its frame since it became
 * the live page's own component framed (components/onepage/live-preview),
 * in the editor's document before that. Measured against the editor as it
 * was (the drawing in phone-preview.tsx), all 18 themes differed in every
 * block: 499 differences.
 *
 *   node scripts/check-onepage-parity.mjs
 *   THEMES=default,riso node scripts/check-onepage-parity.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-parity.mjs     side by side pictures
 *   PIXEL_TOLERANCE=0.02   the share of a block's pixels that may differ (default 0.01)
 *   DUMP=1 with SHOTS       each block's two pictures as well
 *   TRACE=1                 timings of each step
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const TOLERANCE = Number(process.env.PIXEL_TOLERANCE ?? 0.01)

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-parity.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const trace = (m) => { if (process.env.TRACE) console.log(`    [${new Date().toISOString().slice(11, 23)}] ${m}`) }

/* Motion stands still, so both sides are measured at rest. */
const STILL = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}"

async function open(view, theme) {
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) trace(`${view} navigated to ${f.url()}`) })
  await p.evaluateOnNewDocument((css) => {
    /* Motion stands still; the clock does not (a frozen Date.now spins some loops for ever). */
    addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s) })
  }, STILL)
  trace(`open ${view} ${theme}`)
  await p.goto(`${base}/app/parity?view=${view}&theme=${theme}`, { waitUntil: "load" })
  trace("loaded")
  await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  trace("fonts")
  /*
    THE PREVIEW IS A FRAME (components/onepage/live-preview): what it shows
    is measured inside it, once it has said it drew. A preview drawn in the
    editor's own document (the one this probe was written against) is
    measured where it is.
  */
  let t = p
  if (view === "preview") {
    const framed = await p.waitForSelector("[data-onepage-preview-frame]", { timeout: 4000 }).catch(() => null)
    if (framed) {
      await p.waitForSelector("[data-onepage-preview-frame][data-drawn]", { timeout: 8000 }).catch(() => trace("the frame never said it drew"))
      t = (await framed.contentFrame()) || p
      if (t !== p) {
        await t.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
        /* A picture of a box inside a frame is taken where the frame shows it: the frame is made as tall as its page. */
        const h = await t.evaluate(() => document.documentElement.scrollHeight)
        await p.setViewport({ width: 390, height: Math.min(16000, h), deviceScaleFactor: 1, isMobile: true, hasTouch: true })
        await sleep(300)
      }
    }
  }
  if (t === p && view === "live") {
    /* The same for the live page, so both have been through the same resize (a carousel places itself on one). */
    const h = await p.evaluate(() => document.documentElement.scrollHeight)
    await p.setViewport({ width: 390, height: Math.min(16000, h), deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    await sleep(300)
  }
  await sleep(700)
  return { p, t, errors }
}

/**
 * The list of blocks: the box on screen whose children are all full width
 * and hold the page's name first. The live page also draws a computer's
 * layout, hidden at this width; only the one showing counts.
 */
const LIST = () => {
  const all = [...document.querySelectorAll("div")]
  return all.find((d) => d.getBoundingClientRect().width > 0 && d.children.length >= 8 && [...d.children].every((c) => c.classList.contains("w-full")) && /Satori Studio/.test(d.children[0]?.textContent || "")) || null
}

async function measure({ p, t }) {
  await p.bringToFront()
  return t.evaluate((LIST_SRC) => {
    const LIST = eval(`(${LIST_SRC})`)
    const list = LIST()
    if (!list) return null
    const px = (v) => Math.round(parseFloat(v) * 10) / 10
    const face = (f) => f.split(",")[0].replace(/["']/g, "").trim()
    const textOf = (root) => {
      const out = []
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let n
      while ((n = walker.nextNode())) {
        const t = n.textContent.trim()
        if (!t) continue
        const el = n.parentElement
        const cs = getComputedStyle(el)
        if (cs.display === "none" || cs.visibility === "hidden") continue
        out.push({ text: t.slice(0, 40), size: px(cs.fontSize), weight: cs.fontWeight, face: face(cs.fontFamily), color: cs.color })
      }
      return out.slice(0, 8)
    }
    const boxOf = (root) => {
      let best = null
      for (const el of [root, ...root.querySelectorAll("*")]) {
        const cs = getComputedStyle(el)
        const painted = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none" || parseFloat(cs.borderTopWidth) > 0 || cs.boxShadow !== "none"
        if (!painted) continue
        const r = el.getBoundingClientRect()
        const area = r.width * r.height
        if (!best || area > best.area + 1) best = { area, w: px(r.width), h: px(r.height), fill: cs.backgroundColor, radius: px(cs.borderTopLeftRadius), border: `${px(cs.borderTopWidth)} ${cs.borderTopStyle} ${cs.borderTopColor}`, shadow: cs.boxShadow }
      }
      if (best) delete best.area
      return best
    }
    const blocks = [...list.children].map((c) => {
      const r = c.getBoundingClientRect()
      return { w: px(r.width), h: px(r.height), text: textOf(c), box: boxOf(c) }
    })
    const first = list.children[0].getBoundingClientRect()
    const second = list.children[1]?.getBoundingClientRect()
    /* The page's own colour: the first box up from the list that paints one. */
    let bg = null
    for (let el = list; el; el = el.parentElement) {
      const cs = getComputedStyle(el)
      if (cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none") { bg = cs.backgroundImage !== "none" ? cs.backgroundImage.slice(0, 80) : cs.backgroundColor; break }
    }
    const lr = list.getBoundingClientRect()
    return {
      page: { background: bg, face: face(getComputedStyle(list).fontFamily), listLeft: px(lr.left), listWidth: px(lr.width), gap: second ? px(second.top - first.bottom) : null },
      blocks,
    }
  }, LIST.toString())
}

/** Each block's picture, in order. */
async function blockShots({ p, t }) {
  /* A tab in the background draws no frames, and a picture waits for one. */
  await p.bringToFront()
  await t.evaluate((LIST_SRC) => { const LIST = eval(`(${LIST_SRC})`); const l = LIST(); [...(l?.children || [])].forEach((c, i) => c.setAttribute("data-parity-i", String(i))) }, LIST.toString())
  /* Every row that scrolls sideways (a carousel) starts from its first slide on both sides. */
  await t.evaluate(() => { for (const el of document.querySelectorAll("*")) if (el.scrollLeft) el.scrollLeft = 0 })
  await sleep(250)
  const out = []
  for (const el of await t.$$("[data-parity-i]")) {
    try { out.push(await el.screenshot({ encoding: "base64" })) } catch (e) { trace(`shot failed: ${e.message}`); out.push(null) }
  }
  return out
}

const diffPage = await browser.newPage()
await diffPage.goto(`${base}/app/parity?view=none`)
/** The share of pixels that differ between two pictures (sizes differing count as all). */
async function pixelDiff(a, b) {
  if (!a || !b) return 1
  await diffPage.bringToFront()
  return diffPage.evaluate(async (a, b) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${s}` })
    const [ia, ib] = await Promise.all([load(a), load(b)])
    if (Math.abs(ia.width - ib.width) > 1 || Math.abs(ia.height - ib.height) > 1) return 1
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
    const read = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data }
    const da = read(ia), db = read(ib)
    let off = 0
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) off++
    }
    return off / (w * h)
  }, a, b)
}

/** Both pages whole, side by side, for a person to look at. */
async function sideBySide(theme) {
  const full = async (view) => {
    const { p, t } = await open(view, theme)
    if (view === "preview") {
      /* The preview scrolls inside its own box, or its own frame: stretch it to its content. */
      const h = t !== p ? await t.evaluate(() => document.documentElement.scrollHeight) : await p.evaluate(() => {
        const box = document.querySelector("[data-parity-preview]")
        const scroller = [...box.querySelectorAll("*")].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 4)
        return scroller ? scroller.scrollHeight : 844
      })
      await p.setViewport({ width: 390, height: h, deviceScaleFactor: 1 })
      await sleep(300)
    }
    const shot = await p.screenshot({ encoding: "base64", fullPage: true })
    await p.close()
    return shot
  }
  const [a, b] = [await full("preview"), await full("live")]
  const png = await diffPage.evaluate(async (a, b) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${s}` })
    const [ia, ib] = await Promise.all([load(a), load(b)])
    const c = document.createElement("canvas")
    c.width = ia.width + ib.width + 24
    c.height = Math.max(ia.height, ib.height)
    const x = c.getContext("2d")
    x.fillStyle = "#e5e7eb"; x.fillRect(0, 0, c.width, c.height)
    x.drawImage(ia, 0, 0); x.drawImage(ib, ia.width + 24, 0)
    return c.toDataURL("image/png").split(",")[1]
  }, a, b)
  writeFileSync(join(SHOTS, `parity-${theme}.png`), Buffer.from(png, "base64"))
}

const THEMES = (process.env.THEMES || "default,air,studio,cream,riso,blocks,sunset,peach,ocean,aurora,olive,astrid,night,midnight,space,neon,nature,fusion").split(",")

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const mismatches = []
let blockIds = null
for (const theme of THEMES) {
  const pv = await open("preview", theme)
  const lv = await open("live", theme)
  if (!blockIds) blockIds = await lv.p.evaluate(() => window.__PARITY_ORDER || null)
  const [a, b] = [await measure(pv), await measure(lv)]
  const found = []
  if (!a || !b) {
    found.push(`the list of blocks was not found (preview ${!!a}, live ${!!b})`)
  } else {
    for (const k of Object.keys(a.page)) if (!same(a.page[k], b.page[k])) found.push(`page ${k}: preview ${JSON.stringify(a.page[k])}  live ${JSON.stringify(b.page[k])}`)
    if (a.blocks.length !== b.blocks.length) found.push(`block count: preview ${a.blocks.length}  live ${b.blocks.length}`)
    trace("measured")
    const [sa, sb] = [await blockShots(pv), await blockShots(lv)]
    trace("shots")
    const n = Math.min(a.blocks.length, b.blocks.length)
    for (let i = 0; i < n; i++) {
      const name = blockIds?.[i] || `#${i}`
      const x = a.blocks[i], y = b.blocks[i]
      const lines = []
      if (Math.abs(x.w - y.w) > 1 || Math.abs(x.h - y.h) > 1) lines.push(`size ${x.w}x${x.h} vs ${y.w}x${y.h}`)
      const tn = Math.max(x.text.length, y.text.length)
      for (let t = 0; t < tn; t++) {
        const u = x.text[t], v = y.text[t]
        if (!u || !v) { lines.push(`text "${(u || v).text}" only in the ${u ? "preview" : "live page"}`); continue }
        for (const k of ["text", "size", "weight", "face", "color"]) if (u[k] !== v[k]) lines.push(`"${v.text}" ${k}: ${u[k]} vs ${v[k]}`)
      }
      if (!same(x.box, y.box)) {
        if (!x.box || !y.box) lines.push(`box only in the ${x.box ? "preview" : "live page"}`)
        else for (const k of Object.keys(y.box)) if (!same(x.box[k], y.box[k])) lines.push(`box ${k}: ${x.box[k]} vs ${y.box[k]}`)
      }
      if (process.env.DUMP && SHOTS && sa[i] && sb[i]) {
        writeFileSync(join(SHOTS, `block-${theme}-${name}-preview.png`), Buffer.from(sa[i], "base64"))
        writeFileSync(join(SHOTS, `block-${theme}-${name}-live.png`), Buffer.from(sb[i], "base64"))
      }
      const d = await pixelDiff(sa[i], sb[i])
      if (d > TOLERANCE) lines.push(`pixels ${(d * 100).toFixed(1)}% differ`)
      if (lines.length) found.push(`${name}: ${lines.join("; ")}`)
    }
  }
  const errs = [...pv.errors.map((e) => `preview threw: ${e}`), ...lv.errors.map((e) => `live threw: ${e}`)]
  found.push(...errs)
  await pv.p.close()
  await lv.p.close()
  console.log(`\n${theme}: ${found.length ? `${found.length} difference${found.length === 1 ? "" : "s"}` : "the same"}`)
  for (const f of found) console.log(`  - ${f}`)
  mismatches.push(...found.map((f) => `${theme}: ${f}`))
  if (SHOTS) await sideBySide(theme)
}

await browser.close()
server.close()
console.log(`\n${mismatches.length ? `FAIL  ${mismatches.length} differences between the preview and the live page` : "ok    the preview and the live page are the same, for every theme and block"}`)
if (SHOTS) console.log(`pictures in ${SHOTS}`)
process.exit(mismatches.length ? 1 : 0)
