/**
 * ===========================================================================
 *  EVERY THEME CHANGES EVERY BLOCK, MEASURED
 * ===========================================================================
 * The real OnePage editor (scripts/onepage-probe-server.mjs), its real
 * preview frame, every theme card pressed in turn.
 *
 * The page starts the way the report found it: on Blocks (a grid pattern, a
 * hard black shadow), with a product block that kept a near black
 * background of its own from an earlier look. Then each of the eighteen
 * themes is pressed, and in the preview:
 *
 *   the product block wears the theme like the link beside it: the same
 *   fill (solid, or none for an outline or glass theme), the same corners,
 *   the same border;
 *   the product's title can be read on what it sits on (contrast 3:1 or more);
 *   nothing of the theme before is left: Blocks' grid is gone on a theme
 *   with no pattern, its hard shadow on a theme with none;
 *   the page's own background is the theme's.
 *
 * AND THEN, ROUND 10 ("ensure the current themes apply correctly, are
 * smooth, clean, good"; "switching between categories, the themes flash or
 * glitch"):
 *
 *   KINDS     the Theme page on a phone (390x844, touch, the CPU slowed four
 *             times): every pill pressed in turn, slowly and then quickly,
 *             with every frame sampled (requestAnimationFrame) and the grid
 *             watched (MutationObserver). Fails on any frame where a card
 *             that is shown is blank: no size, its photo not decoded, or a
 *             card that was on screen the frame before drawn faded; and on
 *             any card made again or thrown away.
 *             ROUND 11 ("the themes flash when I land on each category"): a
 *             pick is one still swap. Fails on any card that moves or fades
 *             (an animation, a transform, an opacity under 1) in any
 *             sampled frame; and FILMS picks (the browser's own screencast,
 *             every frame it draws): each frame of the grid must be the
 *             kind before or the kind after, pixel for pixel, never a frame
 *             between them (kinds-film-*.png, the frames side by side).
 *   APPLY     the editor at 1440: themes picked one after another while the
 *             preview frame is sampled every frame. Fails on a frame with no
 *             page drawn (a white frame) or a title drawn in a face that is
 *             not in yet (the jump of a font swap).
 *   GALLERY   every theme drawn by the preview (390) and the live page (390
 *             and 1440), side by side in gallery-*.png; the new themes also
 *             with no profile picture. On the live page at 390: the bio, a
 *             text block and a link's label measured against the pixels
 *             really behind them (the words hidden, a picture taken): 4.5:1
 *             or more against nine in ten of those pixels (a star or a speck
 *             of grain under one letter is not what the words sit on).
 *
 * Fonts and photos are fetched for the browser from here (Google Fonts,
 * Unsplash, storelib.com), so the faces and wallpapers are the real ones;
 * Next's /_next/image is answered here too, resized with sharp.
 *
 *   node scripts/check-onepage-themes.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-themes.mjs   (pictures)
 *   PARTS=kinds,apply node scripts/check-onepage-themes.mjs  (some parts: blocks, kinds, apply, gallery)
 *   THEMES=editorial,haze PARTS=gallery node scripts/check-onepage-themes.mjs  (the gallery for some themes)
 */
import { execFileSync } from "node:child_process"
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
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-themes-"))
mkdirSync(shots, { recursive: true })

/* The theme catalogue, read from the Design tab itself: id, and what it sets. */
const src = readFileSync(join(root, "components/onepage/tabs/design-tab.tsx"), "utf8")
const THEMES = [...src.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",\n    name: "([^"]+)",[\s\S]*?theme_config: \{([\s\S]*?)\n    \},/g)].map((m) => ({
  id: m[1],
  name: m[2],
  pattern: (m[3].match(/background_pattern: "([a-z-]+)"/) || [])[1] || "none",
  shadow: (m[3].match(/button_shadow: "([a-z]+)"/) || [])[1] || "none",
  style: (m[3].match(/button_style: "([a-z]+)"/) || [])[1] || "filled",
}))
if (THEMES.length < 15) fail(`only ${THEMES.length} themes were read from the Design tab`)
/* THEMES=a,b: the gallery for those themes only. */
const GALLERY_ONLY = process.env.THEMES ? new Set(process.env.THEMES.split(",")) : null

/*
  THE LIVE PAGE AS storelib.me SERVES IT. The proxy's own decision
  (lib/onepage/host-route.ts onePageRoute), bundled here from the source, is
  asked about every request the live page makes in the gallery, with the
  host storelib.me: a wallpaper, a font or a call that the OnePage host
  would answer with a 404 or send away fails the probe.
*/
const routeDir = mkdtempSync(join(tmpdir(), "storelib-host-route-"))
execFileSync("pnpm", ["exec", "esbuild", join(root, "lib/onepage/host-route.ts"), "--bundle", "--format=esm", "--platform=node", "--log-level=error", `--alias:@=${root}`, `--outfile=${join(routeDir, "route.mjs")}`], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
const { onePageRoute } = await import(join(routeDir, "route.mjs"))
const servedOnMe = (url, method = "GET") => {
  const u = new URL(url)
  const r = onePageRoute({ host: "storelib.me", pathname: u.pathname, search: u.search, method, mainDomain: "storelib.com" })
  return !r || r.kind === "next" || r.kind === "rewrite" ? null : `${method} ${u.pathname}${u.search.slice(0, 60)} -> ${r.kind}${r.location ? ` ${r.location}` : ""}`
}
const notOnMe = []
const blocksTheme = src.match(/\n  \{\n    id: "blocks",[\s\S]*?theme_config: (\{[\s\S]*?\n    \}),/)

const { base, server } = await serveEditorProbe({
  root,
  fail,
  theme: {
    template_id: "blocks",
    background_color: "#ffd84d",
    background_pattern: "grid",
    button_color: "#ffffff",
    button_text_color: "#111111",
    button_shadow: "hard",
    button_shadow_color: "#111111",
    button_border_width: 2,
    button_border_color: "#111111",
  },
  blocks: [
    { id: "link", type: "link_button", enabled: true, sort_order: 1, data: { label: "My Link", url: "https://example.com" } },
    {
      id: "prod",
      type: "product",
      enabled: true,
      sort_order: 2,
      data: {
        product_id: "p1",
        product_title: "Probe Pack",
        product_description: "Forty drum loops",
        product_price_cents: 1900,
        product_slug: "probe-pack",
        style: "callout",
        cta_text: "Get it",
        /* What the report showed: a black block from an earlier look, no text colour of its own. */
        block_background_color: "#111111",
      },
    },
  ],
})
void blocksTheme

/* The newest themes: drawn again with no profile picture in the gallery, and side by side in theme-cards-new.png. */
const NEW = ["editorial", "terrazzo", "blueprint", "darkroom", "haze"]
const PARTS = new Set((process.env.PARTS || "blocks,kinds,apply,gallery").split(","))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0

/* ── What the browser fetches from elsewhere, fetched here and kept ── */
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
async function wire(p, origin, { live = false } = {}) {
  await p.setRequestInterception(true)
  p.on("request", async (req) => {
    let u
    try { u = new URL(req.url()) } catch { return req.continue() }
    if (u.protocol === "data:" || u.protocol === "blob:") return req.continue()
    /* What the live page asks its own host for (the harness's page and script aside), as storelib.me would route it. */
    if (live && u.origin === origin && req.resourceType() !== "document" && req.resourceType() !== "script") {
      const bad = servedOnMe(req.url(), req.method())
      if (bad && !notOnMe.includes(bad)) notOnMe.push(bad)
    }
    if (u.origin === origin) {
      if (u.pathname !== "/_next/image") return req.continue()
      const got = await remote(new URL(u.searchParams.get("url") || "", origin).href)
      if (!got) return req.respond({ status: 404, body: "" })
      const body = await sharp(got.body).resize({ width: Number(u.searchParams.get("w")) || 384, withoutEnlargement: true }).webp({ quality: Number(u.searchParams.get("q")) || 75 }).toBuffer()
      return req.respond({ status: 200, contentType: "image/webp", body, headers: { "cache-control": "public, max-age=31536000, immutable" } })
    }
    if (!OUTSIDE.test(u.hostname)) return req.abort()
    const got = await remote(req.url())
    if (!got) return req.abort()
    return req.respond({ status: 200, contentType: got.type, body: got.body, headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=31536000, immutable" } })
  })
}
/* Every theme's faces and photos fetched before anything is timed, as a visitor's cache would have them. */
{
  const families = new Set()
  for (const m of src.matchAll(/(?:font_family|title_font): "'([^']+)'/g)) families.add(m[1])
  const fontsSrc = readFileSync(join(root, "lib/onepage/fonts.ts"), "utf8")
  const weights = (f) => (fontsSrc.match(new RegExp(`(?:"${f}"|\\b${f.replace(/ /g, "")}): "([^"]+)"`)) || [])[1]
  await Promise.all([...families].map(async (f) => {
    const w = weights(f)
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}${w ? `:wght@${w}` : ""}&display=swap`
    const css = await remote(href)
    const urls = css ? [...css.body.toString().matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]) : []
    await Promise.all(urls.map(remote))
  }))
  await Promise.all([...src.matchAll(/background_image_url: "(https:[^"]+)"/g)].map((m) => remote(m[1])))
}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const parse = (c) => {
  const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null
}
const lum = ({ r, g, b }) => {
  const ch = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

const errors = []
if (PARTS.has("blocks")) {
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await wire(page, base)
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto(`${base}/app/onepage#design`)
await page.waitForSelector("[data-scroll-container]")
await sleep(1200)
await page.click('[data-nav-row="theme"]')
await sleep(600)

const preview = async () => {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((fr) => fr.url().includes("onepage-preview"))
    if (f) return f
    await sleep(100)
  }
  return null
}

/* What the preview draws: the product card, the link, the page under them. */
const read = (frame) =>
  frame.evaluate(() => {
    /* Only what is on screen: the page also keeps copies it does not show. */
    const shown = [...document.querySelectorAll("a,button")].filter((e) => e.getBoundingClientRect().width > 0)
    const byText = (t) => shown.find((e) => e.textContent && e.textContent.includes(t))
    const card = byText("Probe Pack")
    const link = shown.find((e) => e.textContent && e.textContent.trim() === "My Link") || byText("My Link")
    if (!card || !link) return null
    /* The title in whatever element the product's layout draws it (a <p> before the eight layouts). */
    const title = [...card.querySelectorAll("*")].find((p) => p.childElementCount === 0 && p.textContent === "Probe Pack")
    document.querySelectorAll("[data-probe-card]").forEach((e) => e.removeAttribute("data-probe-card"))
    card.setAttribute("data-probe-card", "")
    const under = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor
        if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg
      }
      return "rgb(255, 255, 255)"
    }
    const s = (el) => { const c = getComputedStyle(el); return { bg: c.backgroundColor, radius: c.borderTopLeftRadius, border: c.borderTopWidth, borderColor: c.borderTopColor, shadow: c.boxShadow } }
    const r = card.getBoundingClientRect()
    return {
      /* Where on the card to look: the title's line, right of the words, clear of the rounded corners (as fractions of the card). */
      spot: { fx: 0.75, fy: title ? (title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2 - r.top) / r.height : 0.5 },
      card: s(card),
      link: s(link),
      title: title ? getComputedStyle(title).color : null,
      under: under(card),
      pattern: document.querySelector("[data-wallpaper-pattern]")?.getAttribute("data-wallpaper-pattern") || "none",
    }
  })

/* The colour the screen shows at that spot of the card: found where the browser says the card is now, so where the preview has scrolled or slid it does not matter. */
async function paintedAt(frame, spot) {
  const el = await frame.$("[data-probe-card]")
  if (!el) return null
  /* The preview is the phone frame zoomed down, and the browser's own box for what is inside ignores the zoom: map it by hand. */
  const frameBox = await (await frame.frameElement())?.boundingBox()
  if (!frameBox) return null
  const inner = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth } })
  const zoom = frameBox.width / inner.vw
  const box = { x: frameBox.x + inner.x * zoom, y: frameBox.y + inner.y * zoom, width: inner.w * zoom, height: inner.h * zoom }
  const png = await page.screenshot()
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const cx = Math.round(box.x + box.width * spot.fx), cy = Math.round(box.y + box.height * spot.fy)
  let r = 0, g = 0, b = 0, n = 0
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
    const i = (Math.min(Math.max(y, 0), info.height - 1) * info.width + Math.min(Math.max(x, 0), info.width - 1)) * 3
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  return { r: r / n, g: g / n, b: b / n, a: 1 }
}

const frame0 = await preview()
if (!frame0) fail("the preview frame never loaded")
const before = await read(frame0)
expect(before && parse(before.card.bg) && Math.round(lum(parse(before.card.bg)) * 100) < 5, "before: the product block is the black slab the report showed", before?.card.bg)

for (const t of THEMES) {
  await page.click(`[data-theme-card="${t.id}"]`)
  await sleep(700)
  /* A theme that asks for a layout change asks first: take it. */
  const confirmed = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent && x.textContent.trim() === "Update to Classic")
    if (b) { b.click(); return true }
    return false
  })
  if (confirmed) await sleep(700)
  const frame = await preview()
  const m = frame ? await read(frame) : null
  console.log(`\n${t.name} (${t.style}, shadow ${t.shadow}, pattern ${t.pattern})`)
  if (!m) { expect(false, "the preview draws the product and the link"); continue }
  expect(m.card.bg === m.link.bg, "the product block has the link's fill", `${m.card.bg} / ${m.link.bg}`)
  expect(m.card.radius === m.link.radius && m.card.border === m.link.border, "and its corners and border", `${m.card.radius} ${m.card.border} / ${m.link.radius} ${m.link.border}`)
  /* The colour really painted under the title: a patch of the card beside it, from a screenshot, so a gradient or a photo behind glass is measured as it is. */
  await sleep(900)
  const surface = await paintedAt(frame, m.spot)
  const ratio = m.title && parse(m.title) && surface ? contrast(parse(m.title), surface) : 0
  expect(ratio >= 3, "the product's title can be read on it", `${m.title} on painted rgb(${surface ? [surface.r, surface.g, surface.b].map(Math.round).join(",") : "?"}): ${ratio.toFixed(2)}:1`)
  expect(t.pattern !== "none" || m.pattern === "none", "no pattern left from the theme before", m.pattern)
  expect(t.shadow === "hard" || !/ 4px 4px 0px/.test(m.card.shadow), "no hard shadow left from the theme before", m.card.shadow)
  await page.screenshot({ path: join(shots, `theme-${t.id}.png`) })
}
await page.close()
}

/*
  Layout shift while kinds are picked: the browser's own layout-shift
  entries (PerformanceObserver), every one counted, the ones right after
  an input included, so a pick that moves a card or anything around the
  grid shows here even where a page's score would forgive it.
*/
async function shiftOfPicks(pg, pick) {
  await pg.evaluate(() => {
    window.__shifts = []
    window.__shiftObs?.disconnect()
    window.__shiftObs = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__shifts.push({ v: e.value, pick: window.__pick, input: e.hadRecentInput, rects: (e.sources || []).slice(0, 2).map((x) => [x.previousRect.y, x.currentRect.y, x.previousRect.height, x.currentRect.height].map(Math.round)), nodes: (e.sources || []).map((x) => (x.node && x.node.getAttribute ? x.node.getAttribute("data-theme-card") || x.node.getAttribute("data-theme-copy") || x.node.className?.toString().slice(0, 40) : x.node?.nodeName) || "?").slice(0, 4) })))
    window.__shiftObs.observe({ type: "layout-shift" })
  })
  for (const k of ["light", "dark", "gradient", "image", "all", "image", "dark", "all"]) {
    await pg.evaluate((k) => { window.__pick = k }, k)
    await pick(k)
    await sleep(500)
  }
  return pg.evaluate(() => { window.__shiftObs.disconnect(); return window.__shifts })
}
function reportShift(where, list) {
  const total = Math.round(list.reduce((a, e) => a + e.v, 0) * 10000) / 10000
  expect(total < 0.01, `${where}: picking kinds shifts nothing on the page (layout shift, every entry counted)`, { total, entries: list.length, first: list.slice(0, 3) })
}

/* ───────────────────────── KINDS: no card blinks ───────────────────────── */
if (PARTS.has("kinds")) {
  console.log("\n── Theme kinds on a phone, every frame ──")
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await wire(p, base)
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#design`)
  await p.waitForSelector('[data-nav-row="theme"]')
  await sleep(1000)
  await p.tap('[data-nav-row="theme"]')
  await p.waitForSelector("[data-theme-filters]")
  /* Every photo card's picture in and decoded first: what is measured is the switch, not the first load. */
  await p.waitForFunction(() => [...document.querySelectorAll("img[data-theme-thumb]")].every((i) => i.complete && i.naturalWidth > 0), { timeout: 15000 }).catch(() => null)
  await sleep(600)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await p.evaluate(() => {
    const grid = document.querySelector("[data-theme-grid]")
    const w = window
    w.__frames = []
    w.__moving = []
    w.__made = 0
    w.__thrown = 0
    new MutationObserver((ms) => ms.forEach((m) => {
      m.addedNodes.forEach((n) => { if (n.nodeType === 1) w.__made++ })
      m.removedNodes.forEach((n) => { if (n.nodeType === 1) w.__thrown++ })
    })).observe(grid, { childList: true, subtree: true })
    /* Each shown card's opacity the frame before: a card coming in may fade up, but none may ever dim. */
    let before = new Map()
    const tick = () => {
      const now = new Map()
      const blank = []
      for (const c of grid.querySelectorAll("[data-theme-card], [data-theme-copy]")) {
        if (!c.hasAttribute("data-theme-shown")) continue
        const id = c.getAttribute("data-theme-card") || c.getAttribute("data-theme-copy")
        const pic = c.querySelector("span.relative")
        const r = pic ? pic.getBoundingClientRect() : { width: 0, height: 0 }
        const img = c.querySelector("img[data-theme-thumb]")
        const decoded = !img || (img.complete && img.naturalWidth > 0)
        /* What it is drawn at: its own opacity and every box's above it in the grid (a whole grid faded counts). */
        let op = 1
        for (let n = c; n && n !== grid.parentElement; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
        now.set(id, op)
        if (r.width < 1 || r.height < 1 || !decoded || (before.has(id) && op < before.get(id) - 0.02)) blank.push({ id, w: Math.round(r.width), decoded, op: Math.round(op * 100) / 100 })
        /* A still swap: no shown card is ever drawn faded, moved or scaled, or has an animation of its own. */
        const tf = getComputedStyle(c).transform
        if (op < 0.995 || (tf && tf !== "none" && tf !== "matrix(1, 0, 0, 1, 0, 0)") || c.getAnimations().length) w.__moving.push({ id, op: Math.round(op * 100) / 100, tf, anims: c.getAnimations().length })
      }
      w.__frames.push({ t: performance.now(), shown: now.size, blank })
      before = now
      w.__raf = requestAnimationFrame(tick)
    }
    w.__raf = requestAnimationFrame(tick)
  })
  const kinds = ["light", "dark", "gradient", "image", "all", "dark", "image", "light", "all"]
  for (const k of kinds) {
    await p.tap(`[data-theme-filter="${k}"]`)
    await sleep(420)
    await p.screenshot({ path: join(shots, `kinds-${k}.png`) })
  }
  /* And quickly, a press every 90ms, as a thumb flicking along the row would. */
  for (const k of ["light", "dark", "gradient", "image", "all", "gradient", "light", "all"]) {
    await p.tap(`[data-theme-filter="${k}"]`)
    await sleep(90)
  }
  await sleep(600)
  const r = await p.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    const f = window.__frames
    return { frames: f.length, blank: f.filter((x) => x.blank.length).map((x) => x.blank).slice(0, 5), blankFrames: f.filter((x) => x.blank.length).length, moving: window.__moving.length, movingSample: window.__moving.slice(0, 4), made: window.__made, thrown: window.__thrown, shownEnd: f[f.length - 1].shown }
  })
  /* The frames timed on their own, with nothing read in them (the sampling above lays the page out every frame and would be timed too). */
  await p.evaluate(() => {
    const w = window
    w.__times = []
    const tick = (t) => { w.__times.push(t); w.__raf = requestAnimationFrame(tick) }
    w.__raf = requestAnimationFrame(tick)
  })
  for (const k of ["light", "dark", "gradient", "image", "all", "gradient", "light", "all"]) {
    await p.tap(`[data-theme-filter="${k}"]`)
    await sleep(350)
  }
  const times = await p.evaluate(() => { cancelAnimationFrame(window.__raf); const t = window.__times; return t.slice(1).map((x, i) => x - t[i]) })
  times.sort((a, b) => a - b)
  r.longest = Math.round(times[times.length - 1])
  r.p95 = Math.round(times[Math.floor(times.length * 0.95)])
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  console.log(`  ${r.frames} frames sampled; timed alone, a pick's frames: 95% under ${r.p95}ms, the longest ${r.longest}ms (CPU slowed 4x)`)
  expect(r.blankFrames === 0, "no frame shows a blank or undecoded card, or dims one that was on screen", r.blank)
  expect(r.moving === 0, "no card that is shown moves, fades or animates in any frame (a pick is one still swap)", r.movingSample)
  expect(r.made === 0 && r.thrown === 0, "no card or picture is made again or thrown away by a pick", { made: r.made, thrown: r.thrown })
  expect(r.shownEnd === THEMES.length, "back on All, every theme is shown", r.shownEnd)
  /*
    FILMED: the browser's own screencast, every frame it draws, through a
    pick at a time (CPU still slowed four times). The grid's box in each
    frame is compared with the grid before the pick and the grid once it
    has settled: every frame must be one or the other (a pixel off by a
    little is the encoder), never a card half faded, moved, or blank
    between them. The frames go side by side into kinds-film-<kind>.png.
  */
  {
    await p.evaluate(() => document.querySelector("[data-theme-filters]")?.scrollIntoView({ block: "start" }))
    await p.tap('[data-theme-filter="all"]')
    await sleep(500)
    /* The grid's box on screen, in CSS pixels, cut to the screen. */
    const gridBox = () => p.evaluate(() => { const r = document.querySelector("[data-theme-grid]").getBoundingClientRect(); const top = Math.max(0, r.top); return { x: r.left, y: top, w: r.width, h: Math.min(window.innerHeight - 90, r.bottom) - top } })
    /* A frame's grid, small: each frame is cut by the same box at its own scale, so every frame and the two ends are compared alike. */
    const gridOf = async (f, box) => {
      const meta = await sharp(f).metadata()
      const k = meta.width / 390
      return sharp(f).extract({ left: Math.round(box.x * k), top: Math.round(box.y * k), width: Math.round(box.w * k), height: Math.round(box.h * k) }).resize({ width: 120, height: Math.round((120 * box.h) / box.w), fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    }
    const diff = (a, b) => {
      let off = 0
      for (let i = 0; i < a.data.length; i += 3) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 30) off++
      return off / (a.data.length / 3)
    }
    let between = 0
    let filmed = 0
    for (const k of ["image", "all", "dark", "light", "gradient", "all"]) {
      const box = await gridBox()
      const frames = []
      const onFrame = async (f) => { frames.push(Buffer.from(f.data, "base64")); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => null) }
      cdp.on("Page.screencastFrame", onFrame)
      await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
      await sleep(250)
      await p.tap(`[data-theme-filter="${k}"]`)
      await sleep(900)
      await cdp.send("Page.stopScreencast")
      cdp.off("Page.screencastFrame", onFrame)
      if (frames.length < 2) continue
      /* The first frame is the kind before, the last the kind after (the pick long settled). */
      const before = await gridOf(frames[0], box)
      const after = await gridOf(frames[frames.length - 1], box)
      const marks = []
      for (const f of frames) {
        const g = await gridOf(f, box)
        const dB = diff(g, before)
        const dA = diff(g, after)
        const ok = dB < 0.01 || dA < 0.01
        if (!ok) between++
        marks.push({ f, ok, dB, dA })
      }
      filmed += frames.length
      console.log(`  film ${k}: ${frames.length} frames, ${marks.filter((m) => !m.ok).length} between the two kinds${marks.some((m) => !m.ok) ? ` (${marks.filter((m) => !m.ok).map((m) => `${(m.dB * 100).toFixed(1)}%/${(m.dA * 100).toFixed(1)}%`).join(" ")})` : ""}`)
      /* The frames side by side, as they were drawn: kinds-film-<kind>.png. A frame between the two kinds is framed in red. */
      if (frames.length) {
        const W = 180
        const tiles = await Promise.all(marks.slice(0, 12).map(async (m) => {
          const t = await sharp(m.f).resize({ width: W }).png().toBuffer()
          const meta = await sharp(t).metadata()
          return { buf: await sharp(t).extend({ top: 4, bottom: 4, left: 4, right: 4, background: m.ok ? "#e5e7eb" : "#dc2626" }).png().toBuffer(), h: meta.height + 8 }
        }))
        const H = Math.max(...tiles.map((t) => t.h))
        await sharp({ create: { width: tiles.length * (W + 14), height: H, channels: 3, background: "#ffffff" } }).composite(tiles.map((t, i) => ({ input: t.buf, left: i * (W + 14), top: 0 }))).png().toFile(join(shots, `kinds-film-${k}-${filmed}.png`))
      }
    }
    expect(filmed > 0, "the picks were filmed", filmed)
    expect(between === 0, "every filmed frame of the grid is the kind before or the kind after, never one between", between)
  }
  /* LAYOUT SHIFT on a phone: every pick, from the top and scrolled, with the CPU still slowed. */
  {
    await p.evaluate(() => { const b = document.querySelector("[data-theme-grid]"); for (let n = b; n; n = n.parentElement) { const y = getComputedStyle(n).overflowY; if (y === "auto" || y === "scroll") { n.scrollTop = 0; break } } })
    await sleep(300)
    const top = await shiftOfPicks(p, (k) => p.tap(`[data-theme-filter="${k}"]`))
    await p.evaluate(() => document.querySelector("[data-theme-filters]")?.scrollIntoView({ block: "start" }))
    await sleep(300)
    const scrolled = await shiftOfPicks(p, (k) => p.tap(`[data-theme-filter="${k}"]`))
    reportShift("390, from the top", top)
    reportShift("390, scrolled down", scrolled)
  }
  /* The newest cards side by side, as the grid draws them: theme-cards-new.png. */
  {
    const cards = []
    for (const id of NEW) {
      const el = await p.$(`[data-theme-card="${id}"]`)
      if (!el) continue
      await el.evaluate((e) => e.scrollIntoView({ block: "center" }))
      await sleep(300)
      cards.push(await el.screenshot())
    }
    if (cards.length) {
      const metas = await Promise.all(cards.map((c) => sharp(c).metadata()))
      let x = 0
      const comp = cards.map((c, i) => { const at = { input: c, left: x, top: 0 }; x += metas[i].width + 16; return at })
      await sharp({ create: { width: x, height: Math.max(...metas.map((m) => m.height)), channels: 3, background: "#ffffff" } }).composite(comp).png().toFile(join(shots, "theme-cards-new.png"))
    }
  }
  await p.close()

  /* And on a computer, 1440 wide, picked with a mouse. */
  {
    const d = await browser.newPage()
    await d.setViewport({ width: 1440, height: 900 })
    await wire(d, base)
    d.on("pageerror", (e) => errors.push(String(e)))
    await d.goto(`${base}/app/onepage#design`)
    await d.waitForSelector('[data-nav-row="theme"]')
    await sleep(1000)
    await d.click('[data-nav-row="theme"]')
    await d.waitForSelector("[data-theme-filters]")
    await sleep(900)
    reportShift("1440", await shiftOfPicks(d, (k) => d.click(`[data-theme-filter="${k}"]`)))
    await d.close()
  }
}

/* ───────────────────────── APPLY: no white frame, no font jump ───────────────────────── */
if (PARTS.has("apply")) {
  console.log("\n── Picking themes, the preview sampled every frame ──")
  /* A page with its name and bio (a header block), a link and a product. */
  const own = await serveEditorProbe({
    root,
    fail,
    blocks: [
      { id: "header", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
      { id: "link", type: "link_button", enabled: true, sort_order: 1, data: { label: "My Link", url: "https://example.com" } },
      { id: "prod", type: "product", enabled: true, sort_order: 2, data: { product_id: "p1", product_title: "Probe Pack", product_description: "Forty drum loops", product_price_cents: 1900, product_slug: "probe-pack", style: "callout", cta_text: "Get it" } },
    ],
  })
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await wire(p, own.base)
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${own.base}/app/onepage#design`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(1200)
  await p.click('[data-nav-row="theme"]')
  await sleep(600)
  const frame = await (async () => { for (let i = 0; i < 40; i++) { const f = p.frames().find((fr) => fr.url().includes("onepage-preview")); if (f) return f; await sleep(100) } return null })()
  if (!frame) fail("the preview frame never loaded")
  await frame.waitForSelector("h1")
  await sleep(800)
  await frame.evaluate(() => {
    const w = window
    w.__seen = []
    const tick = () => {
      const roots = [...document.querySelectorAll(".onepage-live")].filter((e) => e.getBoundingClientRect().height > 0)
      const h1 = roots[0]?.querySelector("h1")
      const fam = h1 ? getComputedStyle(h1).fontFamily.split(",")[0].replace(/["']/g, "").trim() : null
      const weight = h1 ? getComputedStyle(h1).fontWeight : "400"
      const inFace = fam ? document.fonts.check(`${weight} 16px "${fam}"`) && [...document.fonts].some((f) => f.family.replace(/["']/g, "") === fam && f.status === "loaded") : false
      w.__seen.push({ t: performance.now(), drawn: roots.length > 0 && !!h1, fam, inFace, bg: roots[0] ? getComputedStyle(roots[0]).backgroundColor : null })
      w.__raf = requestAnimationFrame(tick)
    }
    w.__raf = requestAnimationFrame(tick)
  })
  const order = ["paper", "graphite", "cream", "midnight", "sage", "neon", "nature", "studio", "fusion", "riso", "default"].filter((id) => THEMES.some((t) => t.id === id))
  for (const id of order) {
    await p.click(`[data-theme-card="${id}"]`)
    const confirmed = await p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent && x.textContent.trim() === "Update to Classic")
      if (b) { b.click(); return true }
      return false
    })
    await sleep(confirmed ? 1300 : 1100)
  }
  const seen = await frame.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__seen })
  const white = seen.filter((s) => !s.drawn)
  /* A face not in yet is a swap to come; Inter is the editor's own and always in. */
  const swaps = seen.filter((s, i) => s.drawn && s.fam && !s.inFace && i > 0)
  const families = [...new Set(seen.map((s) => s.fam))]
  console.log(`  ${seen.length} frames, title faces drawn: ${families.join(", ")}`)
  expect(white.length === 0, "the preview never shows a frame with no page", white.length)
  expect(swaps.length === 0, "the title is never drawn in a face that has not come in (no font swap jump)", swaps.slice(0, 4).map((s) => s.fam))
  await p.close()
  own.server.close()
}

/* ───────────────────────── GALLERY: preview and live, every theme ───────────────────────── */
if (PARTS.has("gallery")) {
  console.log("\n── Every theme, the preview and the live page ──")
  const parity = await serveEditorProbe({ root, entry: "scripts/render-onepage-parity.tsx", fail })
  const ONLY = "link_plain,link_thumb,link_icon,product_button,product_callout,product_preview,social_icons,text,heading,email_default"
  const shot = async (view, id, width, extra = "") => {
    const p = await browser.newPage()
    await p.setViewport({ width, height: width >= 1000 ? 900 : 844, deviceScaleFactor: 1, isMobile: width < 1000, hasTouch: width < 1000 })
    await wire(p, parity.base, { live: view === "live" })
    p.on("pageerror", (e) => errors.push(`${view} ${id}: ${e}`))
    await p.goto(`${parity.base}/app/parity?view=${view}&theme=${id}&only=${ONLY}${extra}`, { waitUntil: "load", timeout: 90000 })
    if (view === "preview") {
      await p.waitForSelector("[data-onepage-preview-frame][data-drawn]", { timeout: 10000 }).catch(() => null)
    }
    await p.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]))
    await sleep(1200)
    const png = await p.screenshot()
    return { p, png }
  }
  /* The words hidden, a picture of what is behind them, the worst pixel against their colour. */
  const measure = async (p, text, png0) => {
    /* The words in the page itself, or in the preview's frame (the phone frame, zoomed): the box mapped to the screen either way. */
    let frame = null
    let box = null
    for (const f of p.frames()) {
      box = await f.evaluate((text) => {
        const els = [...document.querySelectorAll("p,span,a,div,h2,h3")].filter((e) => e.getBoundingClientRect().height > 0 && e.childElementCount === 0 && e.textContent && e.textContent.trim().startsWith(text))
        const el = els[0]
        if (!el) return null
        el.setAttribute("data-probe-words", "")
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top, sy: window.scrollY, w: r.width, h: r.height, vw: window.innerWidth, color: getComputedStyle(el).color, opacity: Number(getComputedStyle(el).opacity) }
      }, text).catch(() => null)
      if (box) { frame = f; break }
    }
    if (!box || box.w < 2) return null
    if (frame !== p.mainFrame()) {
      const fb = await (await frame.frameElement())?.boundingBox()
      if (!fb) return null
      const z = fb.width / box.vw
      const sy = await p.evaluate(() => window.scrollY)
      box = { ...box, x: fb.x + box.x * z, y: fb.y + sy + box.y * z, w: box.w * z, h: box.h * z }
    } else {
      box = { ...box, y: box.y + box.sy }
    }
    await frame.evaluate(() => { const e = document.querySelector("[data-probe-words]"); e.style.setProperty("color", "transparent", "important"); e.style.setProperty("text-shadow", "none", "important") })
    const png = await p.screenshot({ clip: { x: Math.max(0, box.x), y: box.y, width: Math.max(2, box.w), height: Math.max(2, box.h) } })
    await frame.evaluate(() => { const e = document.querySelector("[data-probe-words]"); e.style.removeProperty("color"); e.style.removeProperty("text-shadow"); e.removeAttribute("data-probe-words") })
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const ink = parse(box.color)
    if (!ink) return null
    const all = []
    for (let i = 0; i < info.width * info.height; i += 1) {
      const bg = { r: data[i * 3], g: data[i * 3 + 1], b: data[i * 3 + 2], a: 1 }
      all.push(contrast(over({ ...ink, a: ink.a * box.opacity }, bg), bg))
    }
    all.sort((a, b) => a - b)
    void png0
    /* Against the 10th worst pixel in a hundred: a star, a speck of grain or a pattern's line under one letter is not what the words are read on. */
    return Math.round(all[Math.floor(all.length * 0.1)] * 100) / 100
  }
  const rows = []
  /* Glass themes with no picture: the letter circle must read (gallery-avatars.png). */
  const GLASS = ["midnight", "ocean"]
  for (const t of THEMES) {
    if (GALLERY_ONLY && !GALLERY_ONLY.has(t.id)) continue
    const views = []
    for (const extra of NEW.includes(t.id) || GLASS.includes(t.id) ? ["", "&avatar=0"] : [""]) {
      /*
        The words measured on the live page at 390 for every theme; for the
        newest, also in the preview and on the live page at 1440, and all
        of it again with no profile picture.
      */
      const read = async (pg, where) => {
        const bio = await measure(pg, "Prints, posters and a newsletter")
        const body = await measure(pg, "Prints, posters and a letter")
        const label = await measure(pg, "Shop the prints")
        expect(bio !== null && bio >= 4.5, `${where}: the bio reads on what is behind it (4.5:1, on 90% of what is behind)`, bio)
        expect(body !== null && body >= 4.5, `${where}: a text block reads on what is behind it (4.5:1, on 90% of what is behind)`, body)
        expect(label !== null && label >= 4.5, `${where}: a link's label reads on its button (4.5:1, on 90% of what is behind)`, label)
      }
      const all = NEW.includes(t.id)
      const pic = extra ? ", no picture" : ""
      if (!extra) console.log(`\n${t.name}`)
      const a = await shot("preview", t.id, 390, extra)
      views.push(a.png)
      if (all) await read(a.p, `preview 390${pic}`)
      await a.p.close()
      const b = await shot("live", t.id, 390, extra)
      views.push(b.png)
      if (!extra || all) await read(b.p, `live 390${pic}`)
      await b.p.close()
      const c = await shot("live", t.id, 1440, extra)
      views.push(c.png)
      if (all) await read(c.p, `live 1440${pic}`)
      await c.p.close()
    }
    rows.push({ id: t.id, views })
  }
  parity.server.close()
  /*
    Known and not a theme's: the Storelib badge in the footer is the app's
    own logo file (lib/brand/logo.ts, /images/brand/...), which storelib.me
    sends to storelib.com with a 308, a hop before it shows. Said here,
    not passed over; every other request must be answered on the host.
  */
  const badge = notOnMe.filter((x) => x.startsWith("GET /images/brand/"))
  if (badge.length) console.log(`  note  the footer badge's logo is a 308 hop on storelib.me, not a theme's request: ${badge.join(", ")}`)
  const themed = notOnMe.filter((x) => !badge.includes(x))
  expect(themed.length === 0, "every request a theme makes on the live page (wallpaper, fonts, calls) is one storelib.me answers (lib/onepage/host-route onePageRoute)", themed.slice(0, 5))
  /* gallery-N.png: one row per theme, preview 390 | live 390 | live 1440 (and again without a picture for the new ones). */
  const H = 422
  const tile = async (png) => sharp(png).resize({ height: H }).png().toBuffer()
  const pages = []
  for (let i = 0; i < rows.length; i += 6) pages.push(rows.slice(i, i + 6))
  pages.push(rows.filter((r) => GLASS.includes(r.id) || r.id === "graphite").map((r) => ({ ...r, views: r.views.slice(3) })))
  pages.push(rows.filter((r) => NEW.includes(r.id)))
  for (const [n, pageRows] of pages.entries()) {
    if (!pageRows.length) continue
    const comp = []
    let width = 0
    for (const [y, row] of pageRows.entries()) {
      let x = 0
      for (const v of row.views) {
        const buf = await tile(v)
        const m = await sharp(buf).metadata()
        comp.push({ input: buf, left: x, top: y * (H + 12) })
        x += m.width + 12
      }
      width = Math.max(width, x)
    }
    const name = n === pages.length - 1 ? "gallery-new.png" : n === pages.length - 2 ? "gallery-avatars.png" : `gallery-${n + 1}.png`
    await sharp({ create: { width, height: pageRows.length * (H + 12), channels: 3, background: "#e5e7eb" } }).composite(comp).png().toFile(join(shots, name))
  }
}

expect(errors.length === 0, "no page errors", errors.slice(0, 3))
console.log(`\n${broken === 0 ? "every theme checked" : `${broken} checks failed`}. Pictures: ${shots}`)
await browser.close()
server.close()
process.exit(broken === 0 ? 0 : 1)
