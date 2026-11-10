/**
 * ===========================================================================
 *  WAVE 11: THE THREE NEW THEMES ON A REAL PAGE, AND THE VERIFIED TOOLTIP
 * ===========================================================================
 * The live page's own component (scripts/render-onepage-w11.tsx), with a
 * real portrait, products and forms.
 *
 *   PART=themes   Linen, Harbor and Portrait at 390 and 1280, in their own
 *                 block layout and in each of the five, full page; a button
 *                 hovered (the first link) and a product card's button
 *                 hovered, each shot on its own.
 *   PART=tooltip  the verified badge's tooltip open, under every name style
 *                 and a display face, on the classic header and the Hero:
 *                 the tooltip must be in the page's own font, upright, not
 *                 clipped, not hollow, not transformed, not uppercased.
 *
 *   SHOTS=/some/dir node scripts/shot-onepage-w11.mjs
 *   PART=tooltip node scripts/shot-onepage-w11.mjs
 *
 * Fails on a page that scrolls sideways at 390, throws, or a tooltip that
 * wears the name's treatment. AUDIT=1 measures every word against the
 * pixels under it, as scripts/shot-onepage-skins.mjs does.
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-w11-"))
mkdirSync(shots, { recursive: true })
const PART = new Set((process.env.PART || "themes,tooltip").split(","))
const THEMES = (process.env.THEMES || "linen,harbor,portrait").split(",")
const LAYOUTS = (process.env.LAYOUTS || "own,list,grid,cards,compact,masonry").split(",")
const WIDTHS = (process.env.WIDTHS || "390,1280").split(",").map(Number)

const CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const fetched = new Map()
function remote(url) {
  if (!fetched.has(url)) {
    fetched.set(url, fetch(url, { headers: { "user-agent": CHROME_UA }, signal: AbortSignal.timeout(20000) })
      .then(async (r) => (r.ok ? { type: r.headers.get("content-type") || "application/octet-stream", body: Buffer.from(await r.arrayBuffer()) } : null))
      .catch(() => { fetched.delete(url); return null }))
  }
  return fetched.get(url)
}
const OUTSIDE = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|images\.unsplash\.com)$/

async function audit(page) {
  const texts = await page.evaluate(() => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!n.textContent.trim() || !el || el.closest("[aria-hidden=true]")) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || /rgba\(0, 0, 0, 0\)/.test(cs.webkitTextFillColor)) continue
      let alpha = 1
      for (let e = el; e; e = e.parentElement) alpha *= +getComputedStyle(e).opacity
      if (alpha < 0.1) continue
      const r = document.createRange()
      r.selectNodeContents(n)
      for (const b of r.getClientRects()) if (b.width > 2 && b.height > 2) out.push({ text: n.textContent.trim().slice(0, 30), color: cs.color, alpha, large: parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700), x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height })
    }
    return out
  })
  const dpr = await page.evaluate(() => devicePixelRatio)
  const style = await page.addStyleTag({ content: "*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } ::placeholder { color: transparent !important; }" })
  const { data, info } = await sharp(await page.screenshot({ fullPage: true })).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  await style.evaluate((s) => s.remove())
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const px = (x, y) => { const i = (Math.min(info.height - 1, Math.max(0, Math.round(y * dpr))) * info.width + Math.min(info.width - 1, Math.max(0, Math.round(x * dpr)))) * 3; return [data[i], data[i + 1], data[i + 2]] }
  const found = []
  for (const t of texts) {
    const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(t.color)
    if (!m) continue
    const a = (m[4] === undefined ? 1 : +m[4]) * t.alpha
    const ratios = []
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const bg = px(t.x + (t.w * (i + 0.5)) / 6, t.y + (t.h * (j + 0.5)) / 3)
      const fg = [1, 2, 3].map((k, q) => +m[k] * a + bg[q] * (1 - a))
      const [x, y] = [lum(fg), lum(bg)]
      ratios.push((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))
    }
    const low = ratios.sort((p, q) => p - q)[2]
    if (low < (t.large ? 3 : 4.5)) found.push(`"${t.text}" reads at ${low.toFixed(2)}:1`)
  }
  return found
}

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-w11.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const problems = []

async function open(query, width) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: width < 500 ? 844 : 900, deviceScaleFactor: width < 500 ? 2 : 1, isMobile: width < 500, hasTouch: width < 500 })
  await page.setRequestInterception(true)
  page.on("request", async (req) => {
    let u
    try { u = new URL(req.url()) } catch { return req.continue() }
    if (u.protocol === "data:" || u.protocol === "blob:") return req.continue()
    /* The image optimizer, stubbed: the original picture, as the browser would get it unoptimised. */
    const target = u.origin === base && u.pathname === "/_next/image" ? u.searchParams.get("url") : u.origin === base ? null : req.url()
    if (!target) return req.continue()
    const host = (() => { try { return new URL(target).hostname } catch { return "" } })()
    if (!OUTSIDE.test(host)) return req.abort()
    const got = await remote(target)
    if (!got) return req.abort()
    return req.respond({ status: 200, contentType: got.type, body: got.body, headers: { "access-control-allow-origin": "*" } })
  })
  /* GUARD=0: the page without the runtime legibility guard (lib/onepage/legible), to see what the theme itself draws. */
  if (process.env.GUARD === "0") await page.evaluateOnNewDocument(() => { window.__ONEPAGE_LEGIBLE_OFF = true })
  page.on("pageerror", (e) => problems.push(`${query} ${width}: ${e}`))
  await page.goto(`${base}/app?${query}`, { waitUntil: "networkidle0" })
  /*
    A computer's mouse. Every hover: is inside @media (hover: hover) and (pointer: fine), and a headless
    Chromium answers no whatever it is told (scripts/check-account-film.mjs), so the computer's page has the
    question answered yes, as a computer with a mouse answers. The phone's page keeps it: a finger has no hover.
  */
  if (width >= 500) await page.evaluate(() => { for (const s of document.querySelectorAll("style")) s.textContent = s.textContent.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)\s*and\s*\(\s*pointer\s*:\s*fine\s*\)/g, "@media all") })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000) }))))
    /* Down the page a screen at a time, so every lazy picture is asked for and in. */
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000) }))))
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 900))
  })
  return page
}

try {
  if (PART.has("themes")) {
    for (const theme of THEMES) for (const width of WIDTHS) for (const layout of LAYOUTS) {
      const page = await open(`theme=${theme}${layout === "own" ? "" : `&layout=${layout}`}`, width)
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (width < 500 && sideways > 0) problems.push(`${theme} ${width} ${layout}: scrolls ${sideways}px sideways`)
      const file = join(shots, `${theme}-${width}-${layout}.png`)
      await page.screenshot({ path: file, fullPage: true })
      if (process.env.AUDIT === "1") problems.push(...(await audit(page)).map((p) => `${theme} ${width} ${layout}: ${p}`))
      if (layout === "own") {
        /* A link and a product card's button, hovered: the words must still read. */
        for (const [what, words] of [["link", "8-week strength program"], ["product", "Get it"]]) {
          /* The innermost link or button that says these words. */
          const handle = await page.evaluateHandle((w) => [...document.querySelectorAll("a, button, [data-product-cta]")].filter((e) => e.textContent.trim() === w).pop() ?? null, words)
          const el = handle.asElement()
          if (!el) { problems.push(`${theme} ${width}: no ${what} button`); continue }
          await el.evaluate((n) => n.scrollIntoView({ block: "center" }))
          await el.hover()
          await new Promise((r) => setTimeout(r, 900))
          const read = await el.evaluate((n) => {
            const words = [...n.querySelectorAll("*")].concat(n).filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
            return words.map((e) => getComputedStyle(e).color)
          })
          /* The card or row the button is in, hovered, as the eye sees it: clipped from the page as it stands, so the pointer stays where it is. */
          const r = await el.evaluate((n) => { const f = n.tagName === "A" ? n : (n.closest("a") ?? n.parentElement?.parentElement?.parentElement ?? n); const b = f.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })
          /* The viewport as it is (no resize, so the pointer and the hover stay), cut to the card. */
          const dpr = await page.evaluate(() => devicePixelRatio)
          const vp = page.viewport()
          const left = Math.max(0, Math.floor((r.x - 12) * dpr)), top = Math.max(0, Math.floor((r.y - 12) * dpr))
          await sharp(await page.screenshot({ captureBeyondViewport: false })).extract({ left, top, width: Math.min(Math.ceil((r.w + 24) * dpr), vp.width * dpr - left), height: Math.min(Math.ceil((r.h + 24) * dpr), vp.height * dpr - top) }).toFile(join(shots, `${theme}-${width}-hover-${what}.png`))
          console.log(`  ${theme} ${width} hover ${what}: ${read.join(" ")}`)
        }
      }
      console.log(`  ${file}`)
      await page.close()
    }
  }
  if (PART.has("tooltip")) {
    const CASES = [
      ["linen", "classic", "", ""], ["linen", "classic", "outline", ""], ["linen", "classic", "gradient", "Shrikhand"], ["harbor", "classic", "chrome", ""],
      ["harbor", "classic", "neon", "Unbounded"], ["linen", "classic", "spaced", ""], ["linen", "classic", "label", ""], ["linen", "classic", "sticker", ""],
      ["portrait", "hero", "", ""], ["portrait", "hero", "outline", ""], ["portrait", "hero", "retro", "Great Vibes"], ["portrait", "hero", "marker", ""],
      ["y2k", "classic", "", ""], ["vaporwave", "classic", "", ""], ["grunge", "classic", "", ""], ["grunge2", "classic", "", ""], ["arcade", "classic", "", ""], ["playful", "classic", "swash", ""],
    ]
    for (const width of WIDTHS) for (const [theme, header, name, font] of CASES) {
      const page = await open(`theme=${theme}&header=${header}&verified=1${name ? `&name=${name}` : ""}${font ? `&font=${encodeURIComponent(font)}` : ""}`, width)
      /* Before wave 11 the badge had no marks of its own: it was the span.group inside the h1. */
      const badge = (await page.$("[data-verified-badge]")) || (await page.$("h1 span.group"))
      if (!badge) { problems.push(`${theme} ${header} ${name}: no badge`); await page.close(); continue }
      /* A pointer hovers it; a phone taps it (the badge takes focus, and the tooltip shows while it has it). */
      if (width < 500) await badge.tap().catch(() => badge.click())
      else await badge.hover()
      await new Promise((r) => setTimeout(r, 400))
      const got = await page.evaluate(() => {
        const tip = document.querySelector("[data-verified-tooltip]") || document.querySelector("h1 span.group > span")
        /* The page's own words: the bio, which only ever wears the body font. */
        const body = getComputedStyle(document.querySelector("[data-op-header] > p, [data-hero-header] p") || document.body)
        const cs = getComputedStyle(tip)
        let inherited = []
        for (let e = tip; e && e !== document.body; e = e.parentElement) {
          const s = getComputedStyle(e)
          if (s.filter !== "none") inherited.push(`filter on ${e.tagName}`)
          if (s.maskImage && s.maskImage !== "none") inherited.push(`mask on ${e.tagName}`)
          if (s.transform !== "none" && e !== tip) inherited.push(`transform on ${e.tagName}`)
          if (s.rotate && s.rotate !== "none") inherited.push(`rotate on ${e.tagName}`)
          if (e.tagName === "H1") inherited.push("inside the name's h1")
        }
        const r = tip.getBoundingClientRect()
        return { font: cs.fontFamily, bodyFont: body.fontFamily, size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle, transform: cs.textTransform, spacing: cs.letterSpacing, fill: cs.webkitTextFillColor, stroke: cs.webkitTextStrokeWidth, shadow: cs.textShadow, color: cs.color, opacity: cs.opacity, inherited, rect: [r.left, r.top, r.width, r.height].map(Math.round), text: tip.textContent }
      })
      const label = `${theme} ${header} ${name || "theme's own"}${font ? ` ${font}` : ""} ${width}`
      const bad = []
      if (got.font !== got.bodyFont) bad.push(`font ${got.font} (page ${got.bodyFont})`)
      if (got.style !== "normal") bad.push(`font-style ${got.style}`)
      if (got.transform !== "none") bad.push(`text-transform ${got.transform}`)
      if (!/^(normal|0px)$/.test(got.spacing)) bad.push(`letter-spacing ${got.spacing}`)
      if (got.fill !== got.color) bad.push(`text fill ${got.fill}`)
      if (got.stroke !== "0px") bad.push(`stroke ${got.stroke}`)
      if (got.shadow !== "none") bad.push(`text-shadow ${got.shadow}`)
      if (got.opacity !== "1") bad.push(`not shown (opacity ${got.opacity})`)
      if (got.size !== "12px") bad.push(`size ${got.size}`)
      bad.push(...got.inherited)
      if (got.rect[0] < 0 || got.rect[0] + got.rect[2] > width) bad.push(`off screen ${got.rect}`)
      /* Shot open either way, so a before shot shows what the words wore. */
      if (got.opacity !== "1") await page.evaluate(() => { const t = document.querySelector("[data-verified-tooltip]") || document.querySelector("h1 span.group > span"); t.style.opacity = "1"; t.style.transition = "none" })
      if (bad.length) problems.push(`tooltip ${label}: ${bad.join(", ")}`)
      console.log(`  tooltip ${label}: ${bad.length ? "FAIL " + bad.join(", ") : "ok"} (${got.font.split(",")[0]})`)
      const box = await page.evaluate(() => {
        const h = document.querySelector("[data-name-line]") || document.querySelector("h1")
        const t = (document.querySelector("[data-verified-tooltip]") || document.querySelector("h1 span.group > span")).getBoundingClientRect()
        const r = h.getBoundingClientRect()
        const x = Math.min(r.left, t.left), y = Math.min(r.top, t.top)
        return { x, y, w: Math.max(r.right, t.right) - x, h: Math.max(r.bottom, t.bottom) - y }
      })
      const pad = 28
      const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad)
      await page.screenshot({ path: join(shots, `tooltip-${width}-${theme}-${header}-${name || "own"}${font ? "-" + font.replace(/\s+/g, "") : ""}.png`), clip: { x, y, width: Math.min(width - x, box.w + pad * 2), height: box.h + pad * 2 } })
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
if (problems.length) { console.log(problems.map((p) => `  - ${p}`).join("\n")); process.exit(1) }
console.log(`\nShots in ${shots}`)
