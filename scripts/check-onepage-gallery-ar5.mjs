/**
 * ===========================================================================
 *  THE THEME GALLERY AND THE WALLPAPER EFFECTS, AS PICTURES (round AR5)
 * ===========================================================================
 * The live page's own component (scripts/render-onepage-ar5.tsx) in every
 * theme, at 390x844 (a phone, touch) and 1440x900, each saved and laid side
 * by side in gallery-390.png and gallery-1440.png, so the themes can be seen
 * to differ in structure (a Hero, a cover, cards, tiles, rows, a grid), not
 * only in colour. Then a photo wallpaper and a video wallpaper in each of the
 * six effects, with and without a tint, in effects-image.png and
 * effects-video.png, and the time each effect's frame took to draw.
 *
 * Fonts and photos are fetched for the browser from here (Google Fonts,
 * Unsplash), so the faces and wallpapers are the real ones; /_next/image is
 * answered here too, resized with sharp.
 *
 *   SHOTS=/dir node scripts/check-onepage-gallery-ar5.mjs
 *   THEMES=air,sunset SHOTS=/dir node scripts/check-onepage-gallery-ar5.mjs
 *   VIDEO=/path/to/clip.webm ...   the clip the video wallpaper plays
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-ar5-gallery-"))
mkdirSync(join(shots, "themes"), { recursive: true })
const video = process.env.VIDEO && existsSync(process.env.VIDEO) ? process.env.VIDEO : null

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
async function wire(p, origin) {
  await p.setRequestInterception(true)
  p.on("request", async (req) => {
    let u
    try { u = new URL(req.url()) } catch { return req.continue() }
    if (u.protocol === "data:" || u.protocol === "blob:") return req.continue()
    if (u.origin === origin) {
      if (u.pathname !== "/_next/image") return req.continue()
      const src = u.searchParams.get("url") || ""
      let body = null
      if (src.startsWith("/")) {
        const file = join(root, "public", src)
        if (existsSync(file)) body = readFileSync(file)
      } else {
        const got = await remote(src)
        body = got?.body ?? null
      }
      if (!body) return req.respond({ status: 404, body: "" })
      const out = await sharp(body).resize({ width: Number(u.searchParams.get("w")) || 384, withoutEnlargement: true }).webp({ quality: Number(u.searchParams.get("q")) || 75 }).toBuffer()
      return req.respond({ status: 200, contentType: "image/webp", body: out })
    }
    if (!OUTSIDE.test(u.hostname)) return req.abort()
    const got = await remote(req.url())
    if (!got) return req.abort()
    return req.respond({ status: 200, contentType: got.type, body: got.body, headers: { "access-control-allow-origin": "*" } })
  })
}

const statics = video ? { "/__media/": dirname(video) } : {}
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-ar5.tsx", statics, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none", "--autoplay-policy=no-user-gesture-required", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"], protocolTimeout: 60000 })
const BLOCKS = ["header", "link_plain", "link_thumb", "link_pro", "product_button", "product_callout", "heading", "text", "email", "faq"]
const settle = (page, ms = 900) => page.evaluate((t) => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), t)), ms)
const open = async (width, height, mobile) => {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  await wire(page, base)
  page.on("pageerror", (e) => console.error("pageerror", e.message))
  await page.goto(`${base}/app/onepage`, { waitUntil: "load" })
  await page.waitForFunction(() => typeof window.__ar5Render === "function", { timeout: 20000 })
  return page
}
const fontsIn = (page) => page.evaluate(() => document.fonts.ready.then(() => document.fonts.size))

/* A contact sheet: the pictures in a grid, each scaled to `w`, the theme's name under each. */
async function sheet(files, cols, w, out) {
  const metas = await Promise.all(files.map((f) => sharp(f.path).metadata()))
  const h = Math.round((metas[0].height / metas[0].width) * w)
  const label = 26
  const rows = Math.ceil(files.length / cols)
  const tiles = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(f.path).resize({ width: w, height: h, fit: "cover", position: "top" }).png().toBuffer(),
    left: (i % cols) * (w + 12) + 12,
    top: Math.floor(i / cols) * (h + label + 12) + 12,
  })))
  const names = files.map((f, i) => ({
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${label}"><text x="0" y="18" font-family="Inter, sans-serif" font-size="15" fill="#1a1a2e">${f.name}</text></svg>`),
    left: (i % cols) * (w + 12) + 12,
    top: Math.floor(i / cols) * (h + label + 12) + 12 + h + 4,
  }))
  await sharp({ create: { width: cols * (w + 12) + 12, height: rows * (h + label + 12) + 12, channels: 3, background: "#f8f9fa" } }).composite([...tiles, ...names]).png().toFile(out)
}

const report = { themes: [], effects: [] }
try {
  const themes = await (await open(390, 844, true)).evaluate(() => window.__ar5Themes)
  const only = process.env.THEMES ? process.env.THEMES.split(",") : null
  const list = themes.filter((t) => !only || only.includes(t.id))
  for (const [w, h, mobile] of [[390, 844, true], [1440, 900, false]]) {
    const page = await open(w, h, mobile)
    const files = []
    for (const t of list) {
      await page.evaluate((id, ids) => window.__ar5Render(id, ids), t.id, BLOCKS)
      await fontsIn(page)
      await settle(page)
      const path = join(shots, "themes", `${t.id}-${w}.png`)
      await page.screenshot({ path })
      files.push({ name: t.name, path })
      const structure = await page.evaluate(() => ({
        hero: !!document.querySelector("[data-hero-header]"),
        cover: !!document.querySelector("[data-cover-image]"),
        layout: document.querySelector("[data-block-layout]")?.getAttribute("data-block-layout") ?? (document.querySelector("[data-mixed-blocks]") ? "masonry" : "list"),
        products: document.querySelector("[data-product-pair]") ? "grid" : "own or rows",
        overflowX: document.documentElement.scrollWidth > innerWidth,
      }))
      report.themes.push({ id: t.id, width: w, ...structure })
    }
    await sheet(files, w === 390 ? 8 : 4, w === 390 ? 220 : 420, join(shots, `gallery-${w}.png`))
    await page.close()
    console.log(`${w}: ${files.length} themes drawn, ${report.themes.filter((r) => r.width === w && r.overflowX).length} with a sideways scroll; ${join(shots, `gallery-${w}.png`)}`)
  }

  /* The six effects on a photo and on a video, with and without a tint, and how long the frame after each took. */
  const PHOTO = "/images/onepage-themes/nature.webp"
  const baseLook = { background_type: "image", background_image_url: PHOTO, background_color: "#22301f", text_color: "#ffffff", secondary_text_color: "#e8eee4", title_color: "#ffffff", button_style: "glass", button_color: "#ffffff", button_text_color: "#ffffff", button_border_radius: 16, font_family: "'Inter', sans-serif", header_layout: "classic", template_id: "nature" }
  const EFFECTS = [["none", {}], ["mono", {}], ["blur", { wallpaper_blur: 14 }], ["halftone", {}], ["grain", { noise_strength: 30 }], ["duotone", { wallpaper_tint: "#1f2a6b" }], ["none + tint", { wallpaper_tint: "#b2846c", wallpaper_tint_strength: 45 }], ["mono + tint", { wallpaper_tint: "#0c3b35", wallpaper_tint_strength: 35 }]]
  for (const kind of video ? ["image", "video"] : ["image"]) {
    const page = await open(390, 844, true)
    const files = []
    for (const [name, extra] of EFFECTS) {
      const effect = name.split(" ")[0]
      const look = kind === "image" ? { ...baseLook, wallpaper_effect: effect, ...extra } : { ...baseLook, background_type: "video", background_image_url: "", background_video_url: `/__media/${basename(video)}`, wallpaper_effect: effect, ...extra }
      await page.evaluate((th, ids) => window.__ar5Render(th, ids), look, ["header", "link_plain", "link_thumb", "text"])
      await settle(page, kind === "video" ? 1500 : 700)
      /* The frames that follow, sampled: how long each took, so an effect that costs a frame shows. */
      const frames = await page.evaluate(() => new Promise((r) => { const t = []; let last = performance.now(); let n = 0; const tick = (now) => { t.push(now - last); last = now; if (++n < 60) requestAnimationFrame(tick); else r(t) }; requestAnimationFrame(tick) }))
      const playing = kind === "video" ? await page.evaluate(() => { const v = document.querySelector("video[data-wallpaper-video]"); return v ? { t: v.currentTime, paused: v.paused, filter: getComputedStyle(v).filter } : null }) : null
      const path = join(shots, `effect-${kind}-${name.replace(/\W+/g, "-")}.png`)
      await page.screenshot({ path })
      files.push({ name, path })
      const sorted = [...frames].sort((a, b) => a - b)
      report.effects.push({ kind, name, medianFrameMs: Math.round(sorted[30] * 10) / 10, worstFrameMs: Math.round(sorted[59] * 10) / 10, layers: await page.evaluate(() => document.querySelectorAll("[data-wallpaper-effect]").length), playing })
    }
    await sheet(files, 4, 260, join(shots, `effects-${kind}.png`))
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
writeFileSync(join(shots, "gallery-report.json"), JSON.stringify(report, null, 2))
for (const e of report.effects) console.log(`${e.kind.padEnd(5)} ${e.name.padEnd(12)} ${e.layers} layer(s), median frame ${e.medianFrameMs}ms, worst ${e.worstFrameMs}ms${e.playing ? `, video at ${e.playing.t.toFixed(2)}s ${e.playing.paused ? "PAUSED" : "playing"}` : ""}`)
const structures = new Map()
for (const r of report.themes.filter((x) => x.width === 390)) {
  const k = `${r.hero ? "hero" : r.cover ? "cover" : "classic"}|${r.layout}|${r.products}`
  structures.set(k, [...(structures.get(k) ?? []), r.id])
}
console.log(`\n${structures.size} distinct drawn structures among ${report.themes.filter((x) => x.width === 390).length} themes (header | links layout | products)`)
console.log(`pictures: ${shots}`)
