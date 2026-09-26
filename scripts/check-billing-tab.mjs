/**
 * ===========================================================================
 *  THE BILLING TAB AND THE MONTHLY / YEARLY PILL, MEASURED
 * ===========================================================================
 * The real Settings page on its Billing tab, the in-app upgrade page and the
 * landing page's pricing section, hydrated in Chromium at 390px (a phone:
 * touch, 3x pixels, the CPU slowed four times) and at 1280px. It measures:
 *
 *   TOGGLE     Monthly and Yearly pressed four times. On every frame of
 *              every switch: each card's width and height (must not
 *              change), the pill's thumb (a transform, landing exactly on
 *              the option pressed), every element in the cards and the
 *              pill whose LAYOUT box moved (offsets, which a transform
 *              does not touch), whether a header picture was asked for
 *              again or its <img> replaced, the opacity of the old and the
 *              new price, how long the switch takes, and the longest frame.
 *              Also whether the price's glyphs stick out of the box that
 *              is faded (the box a phone composites and clips to).
 *   REDUCED    with prefers-reduced-motion, the switch lands in one frame.
 *   ORDER      the Billing tab's sections, top to bottom.
 *   PLANS ROW  the Plans heading's size against the tab's other section
 *              headings, the pill's height, and where the pill sits: at
 *              the right of the heading's row, not in the middle (at 320px
 *              too, where it may drop under the heading, flush left).
 *   ARTWORK    the average luminance of each card's picture, alone and
 *              with its fade and grain, and the grain's fine detail (the
 *              variance a 3x3 blur takes out). BASELINE=<json> compares
 *              against an earlier run and prints the ratios.
 *   CONTRAST   every line of text on each card's header against the pixels
 *              actually behind it (worst pixel and 5th percentile).
 *
 *   node scripts/check-billing-tab.mjs
 *   SHOTS=/dir node scripts/check-billing-tab.mjs        # screenshots, prefix billing-
 *   OUT_JSON=/file.json node scripts/check-billing-tab.mjs
 *   BASELINE=/file.json node scripts/check-billing-tab.mjs
 *
 * The two pictures are downloaded once per run with curl, which goes through
 * the machine's proxy (the headless browser cannot).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"
import nextConfig from "../next.config.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
/* ONLY=toggle,layout,artwork,reduced runs a part. */
const only = (part) => !process.env.ONLY || process.env.ONLY.split(",").includes(part)
const root = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), "storelib-billing-"))
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

/* The pictures the cards name, fetched once. */
const cardsSource = readFileSync(join(root, "components/billing/plan-cards.tsx"), "utf8")
const base = /const PICTURE_BASE = "([^"]+)"/.exec(cardsSource)?.[1]
const names = [...cardsSource.matchAll(/picture: `\$\{PICTURE_BASE\}\/([^`]+)`/g)].map((m) => m[1])
if (!base || names.length !== 2) fail("Could not find the two header pictures in plan-cards.tsx.")
const pictures = new Map()
for (const [i, name] of names.entries()) {
  const url = `${base}/${name}`
  const file = join(tmp, `picture-${i}.png`)
  try {
    execFileSync("curl", ["-sSf", "-o", file, url], { stdio: ["ignore", "ignore", "inherit"], timeout: 60_000 })
  } catch {
    fail(`Could not download ${url}.`)
  }
  pictures.set(url, file)
}

const dir = join(root, ".billing-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "dynamic.js"), `export default function dynamic() { return () => null }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}), updateUser: async () => ({ data: {}, error: null }), reauthenticate: async () => ({ error: null }), refreshSession: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)

/* next/image as the build configures it. */
const imageOpts = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [32, 48, 64, 96, 128, 256, 384],
  path: "/_next/image",
  loader: "default",
  loaderFile: "",
  domains: [],
  disableStaticImages: false,
  minimumCacheTTL: nextConfig.images.minimumCacheTTL,
  formats: nextConfig.images.formats,
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;",
  contentDispositionType: "attachment",
  remotePatterns: nextConfig.images.remotePatterns,
  qualities: nextConfig.images.qualities,
  unoptimized: false,
}
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-billing-probe.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--define:process.env.__NEXT_IMAGE_OPTS=${JSON.stringify(imageOpts)}`,
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/dynamic=${join(dir, "dynamic.js")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const script = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })

/* Inter from the build, served by the probe's server rather than file://. */
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, p) => {
  const key = `/__font/${fontFiles.size}.woff2`
  fontFiles.set(key, p)
  return `url(${key})`
})
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${script}</script></body></html>`

/* An account on Free with three invoices from an earlier Pro spell. */
const FREE = { id: "free", name: "Free", price_cents: 0, fee_percent: 0.06, fee_fixed_cents: 30 }
const invoices = [0, 1, 2].map((i) => ({
  id: `in_${i}`,
  amount_cents: 2900,
  status: "paid",
  description: "Pro",
  created_at: `2026-0${6 - i}-02T10:00:00Z`,
  period_start: `2026-0${6 - i}-02T10:00:00Z`,
  period_end: `2026-0${7 - i}-02T10:00:00Z`,
  invoice_pdf_url: null,
}))
const overview = {
  plans: [FREE, { id: "growth", name: "Growth", price_cents: 2900, fee_percent: 0.03, fee_fixed_cents: 30 }, { id: "pro", name: "Pro", price_cents: 9900, fee_percent: 0.02, fee_fixed_cents: 30 }],
  subscription: null,
  currentPlan: FREE,
  invoices,
  paymentMethod: null,
}

let imageAsks = []
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://probe")
  if (url.pathname === "/_next/image") {
    const file = pictures.get(url.searchParams.get("url") ?? "")
    imageAsks.push({ url: url.searchParams.get("url"), w: Number(url.searchParams.get("w")), at: Date.now() })
    if (!file) { res.writeHead(400).end(); return }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" }).end(readFileSync(file))
    return
  }
  if (fontFiles.has(url.pathname)) {
    res.writeHead(200, { "Content-Type": "font/woff2" }).end(readFileSync(fontFiles.get(url.pathname)))
    return
  }
  if (url.pathname.startsWith("/api/")) {
    let body = {}
    if (url.pathname === "/api/billing/overview") body = overview
    else if (url.pathname === "/api/billing/subscription") body = { subscription: null, currentPlan: FREE }
    else if (url.pathname === "/api/billing/invoices") body = { invoices }
    else if (url.pathname.startsWith("/api/domains")) body = { domains: [] }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body))
    return
  }
  res.writeHead(200, { "content-type": "text/html" }).end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}
const results = {}

/* ── In the page ──────────────────────────────────────────────────────── */

/** Starts a recorder of every frame: sizes, the thumb, layout offsets, opacities, frame times. */
const ARM = () => {
  const cards = [...document.querySelectorAll("[data-plan-card]")]
  const group = document.querySelector("[data-billing-interval]")
  const thumb = group.querySelector(':scope > span[aria-hidden="true"]')
  const watched = [...document.querySelectorAll("[data-plan-cards] *, [data-plan-cards], [data-billing-interval], [data-billing-interval] *")]
  const offsets = (el) => [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight].join(",")
  const imgs = [...document.querySelectorAll("img[data-plan-picture]")]
  const srcs = imgs.map((i) => i.currentSrc)
  const base = watched.map(offsets)
  const pro = cards.find((c) => c.dataset.planCard === "growth")
  const priceItems = [...pro.querySelector("[data-plan-header] p").querySelectorAll("[data-morph]")]
  const frames = []
  const moved = new Set()
  let last = performance.now()
  let stop = false
  const tick = (now) => {
    const f = { dt: now - last, t: now }
    last = now
    f.cards = cards.map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100] })
    const cs = getComputedStyle(thumb)
    f.thumb = { transform: cs.transform, translate: cs.translate, left: Math.round(thumb.getBoundingClientRect().left * 100) / 100 }
    f.opacity = priceItems.map((el) => ({ text: el.textContent.trim(), on: el.dataset.morph === "on", o: Number(getComputedStyle(el).opacity) }))
    watched.forEach((el, i) => { if (offsets(el) !== base[i]) moved.add(el) })
    const now2 = [...document.querySelectorAll("img[data-plan-picture]")]
    f.imgSame = now2.length === imgs.length && now2.every((n, i) => n === imgs[i] && n.currentSrc === srcs[i] && n.complete)
    frames.push(f)
    if (!stop) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__probe = {
    frames,
    stop: () => { stop = true },
    moved: () => [...moved].map((el) => `${el.tagName.toLowerCase()}${el.dataset.morph ? `[data-morph=${el.dataset.morph}]` : ""} "${(el.textContent || "").trim().slice(0, 24)}"`),
    thumbTarget: () => {
      const on = group.querySelector('[aria-checked="true"]').getBoundingClientRect()
      const t = thumb.getBoundingClientRect()
      return { dl: Math.round((t.left - on.left) * 100) / 100, dr: Math.round((t.right - on.right) * 100) / 100 }
    },
  }
}

/** How far the price's glyphs reach outside the box that fades (what a phone composites and clips to). */
const INK = () => {
  const out = []
  for (const item of document.querySelectorAll("[data-plan-header] p [data-morph]")) {
    const cs = getComputedStyle(item)
    const ctx = document.createElement("canvas").getContext("2d")
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const m = ctx.measureText(item.textContent)
    const range = document.createRange()
    range.selectNodeContents(item)
    const text = range.getBoundingClientRect()
    /* The baseline: the text's content box, from the font's own ascent. */
    const baseline = text.top + m.fontBoundingBoxAscent
    const box = item.getBoundingClientRect()
    const above = Math.max(0, box.top - (baseline - m.actualBoundingBoxAscent))
    const below = Math.max(0, baseline + m.actualBoundingBoxDescent - box.bottom)
    out.push({ text: item.textContent.trim(), above: Math.round(above * 10) / 10, below: Math.round(below * 10) / 10 })
  }
  return out
}

/** The Billing tab's sections and the Plans row. */
const LAYOUT = () => {
  const panel = document.querySelector('[data-settings-panel="billing"]')
  if (!panel) return null
  const heads = [...panel.querySelectorAll("h2")].map((h) => ({ text: h.textContent.trim(), top: Math.round(h.getBoundingClientRect().top), size: parseFloat(getComputedStyle(h).fontSize), weight: getComputedStyle(h).fontWeight }))
  const plans = [...panel.querySelectorAll("h2")].find((h) => h.textContent.trim() === "Plans")
  const group = panel.querySelector("[data-billing-interval]")
  const cards = panel.querySelector("[data-plan-cards]")
  const g = group.getBoundingClientRect()
  const p = plans.getBoundingClientRect()
  const c = cards.getBoundingClientRect()
  const options = [...group.querySelectorAll("[data-interval-option]")].map((b) => {
    const r = b.getBoundingClientRect()
    const cs = getComputedStyle(b)
    /* The area a finger can press: the button, or its ::after when that reaches further. */
    const after = getComputedStyle(b, "::after")
    const extra = after.content !== "none" && after.position === "absolute" ? Math.max(0, -parseFloat(after.top) || 0) + Math.max(0, -parseFloat(after.bottom) || 0) : 0
    return { h: Math.round(r.height * 10) / 10, target: Math.round((r.height + extra) * 10) / 10, font: parseFloat(cs.fontSize) }
  })
  return {
    heads,
    plansRow: {
      headingSize: parseFloat(getComputedStyle(plans).fontSize),
      switchH: Math.round(g.height * 10) / 10,
      switchW: Math.round(g.width),
      sameRow: g.top < p.bottom && g.bottom > p.top,
      rightGap: Math.round((c.right - g.right) * 10) / 10,
      leftGap: Math.round((g.left - c.left) * 10) / 10,
      centreOffset: Math.round(((g.left + g.right) / 2 - (c.left + c.right) / 2) * 10) / 10,
      belowHeading: g.top >= p.bottom - 0.5,
      options,
    },
  }
}

/** Header rectangles, and which parts to show, for the pixel reads. */
const HEADERS = () => [...document.querySelectorAll("[data-plan-card]")].map((card) => {
  const h = card.querySelector("[data-plan-header]").getBoundingClientRect()
  return { id: card.dataset.planCard, x: h.left + scrollX, y: h.top + scrollY, w: h.width, h: h.height }
})
const HEADER_TEXT = () => {
  const boxes = []
  for (const el of document.querySelectorAll("[data-plan-header] *")) {
    if (el.closest('[data-morph="off"]')) continue
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!own) continue
    const cs = getComputedStyle(el)
    const range = document.createRange()
    range.selectNodeContents(el)
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue
      /* Tailwind's `text-white/85` computes to oklab() or color(srgb), not rgb(): read it as sRGB 0 to 255 with its alpha. */
      const n = (cs.color.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number)
      let c = n
      if (cs.color.startsWith("color(srgb")) c = [n[0] * 255, n[1] * 255, n[2] * 255, ...(n.length > 3 ? [n[3]] : [])]
      else if (cs.color.startsWith("oklab(")) {
        const [Lk, A, B] = n
        const l = (Lk + 0.3963377774 * A + 0.2158037573 * B) ** 3
        const m = (Lk - 0.1055613458 * A - 0.0638541728 * B) ** 3
        const s = (Lk - 0.0894841775 * A - 1.291485548 * B) ** 3
        const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
        const enc = (v) => 255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))
        c = [...lin.map(enc), ...(n.length > 3 ? [n[3]] : [])]
      }
      boxes.push({ card: el.closest("[data-plan-card]").dataset.planCard, text: el.textContent.trim().slice(0, 30), color: c, x: rect.left + scrollX, y: rect.top + scrollY, w: rect.width, h: rect.height })
    }
  }
  return boxes
}

/** Pixel statistics of regions of a screenshot. */
const PIXELS = async ({ shot, regions, boxes }) => {
  const img = new Image()
  img.src = `data:image/png;base64,${shot}`
  await img.decode()
  const canvas = document.createElement("canvas")
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const dpr = img.width / document.documentElement.clientWidth
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const stats = (regions || []).map((b) => {
    /* 4px in from each edge: the rounded corners and the card's ring stay out. */
    const x = Math.floor((b.x + 4) * dpr), y = Math.floor((b.y + 4) * dpr), w = Math.floor((b.w - 8) * dpr), h = Math.floor((b.h - 8) * dpr)
    const d = ctx.getImageData(x, y, w, h).data
    const luma = new Float32Array(w * h)
    let sumL = 0, sumY = 0
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      sumL += L(d[i], d[i + 1], d[i + 2])
      const yv = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      luma[p] = yv
      sumY += yv
    }
    /* Grain: what a 3x3 blur takes out, as a variance (the picture's own shapes are far larger than 3px). */
    let hp = 0, n = 0
    for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += luma[(yy + dy) * w + xx + dx]
      const v = luma[yy * w + xx] - s / 9
      hp += v * v
      n++
    }
    /* The same at the size of a CSS pixel (blocks of dpr x dpr averaged first): the grain as a person sees it on a 3x phone. */
    const k = Math.max(1, Math.round(dpr)), cw = Math.floor(w / k), ch = Math.floor(h / k)
    const css = new Float32Array(cw * ch)
    for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
      let s = 0
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += luma[(yy * k + dy) * w + xx * k + dx]
      css[yy * cw + xx] = s / (k * k)
    }
    let hc = 0, nc = 0
    for (let yy = 1; yy < ch - 1; yy++) for (let xx = 1; xx < cw - 1; xx++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += css[(yy + dy) * cw + xx + dx]
      const v = css[yy * cw + xx] - s / 9
      hc += v * v
      nc++
    }
    return { id: b.id, luminance: sumL / (w * h), luma: sumY / (w * h), grain: hp / n, grainCss: hc / nc }
  })
  const contrast = (boxes || []).map((b) => {
    const [tr, tg, tb, ta = 1] = b.color
    const x = Math.floor(b.x * dpr), y = Math.floor(b.y * dpr), w = Math.max(1, Math.floor(b.w * dpr)), h = Math.max(1, Math.floor(b.h * dpr))
    const d = ctx.getImageData(x, y, w, h).data
    const ks = []
    for (let i = 0; i < d.length; i += 4) {
      const fr = tr * ta + d[i] * (1 - ta), fg = tg * ta + d[i + 1] * (1 - ta), fb = tb * ta + d[i + 2] * (1 - ta)
      const a = L(fr, fg, fb), c = L(d[i], d[i + 1], d[i + 2])
      ks.push((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05))
    }
    ks.sort((p, q) => p - q)
    return { card: b.card, text: b.text, worst: Math.round(ks[0] * 100) / 100, p5: Math.round(ks[Math.floor(ks.length * 0.05)] * 100) / 100 }
  })
  return { stats, contrast }
}

/* ── The runs ─────────────────────────────────────────────────────────── */

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })

async function open(surface, W, { reduced = false, dpr } = {}) {
  const phone = W < 768
  const page = await browser.newPage()
  await page.setViewport(phone ? { width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: dpr ?? 3 } : { width: W, height: 1000, deviceScaleFactor: dpr ?? 1 })
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }])
  await page.goto(`${origin}/?surface=${surface}`, { waitUntil: "networkidle0" })
  await page.waitForSelector("[data-plan-card]", { timeout: 15000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.querySelectorAll("img[data-plan-picture]")].map((i) => (i.complete && i.naturalWidth ? null : new Promise((r) => { i.onload = i.onerror = r }))))
    /* AnimateOnScroll (marketing) waits for an observer; the settled page is the one measured. */
    for (const el of document.querySelectorAll('[style*="opacity: 0"]')) if (!el.closest("[data-plan-card]") && !el.hasAttribute("data-morph")) { el.style.opacity = "1"; el.style.transform = "none" }
  })
  await new Promise((r) => setTimeout(r, 400))
  return page
}

async function toggles(page, W, label) {
  const phone = W < 768
  await page.evaluate(() => document.querySelector("[data-billing-interval]").scrollIntoView({ block: "center" }))
  await new Promise((r) => setTimeout(r, 200))
  const cdp = await page.createCDPSession()
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const asksBefore = imageAsks.length
  const presses = ["yearly", "monthly", "yearly", "monthly"]
  const per = []
  let movedAll = new Set()
  for (const option of presses) {
    await page.evaluate(ARM)
    const sel = `[data-interval-option="${option}"]`
    if (phone) await page.tap(sel)
    else await page.click(sel)
    await new Promise((r) => setTimeout(r, 650))
    const r = await page.evaluate(() => { window.__probe.stop(); return { frames: window.__probe.frames, moved: window.__probe.moved(), thumb: window.__probe.thumbTarget() } })
    r.moved.forEach((m) => movedAll.add(m))
    const f = r.frames
    const sizes = new Set(f.map((x) => JSON.stringify(x.cards)))
    /* The price: the shown one's opacity, the hidden one's, and when both are partly there. */
    const curve = f.map((x) => x.opacity.map((o) => Math.round(o.o * 100) / 100))
    const both = Math.max(...f.map((x) => Math.min(...x.opacity.map((o) => o.o))))
    const settleAt = (() => {
      /* From the first frame that shows the press (the tap's own round trip is not the switch) to the first frame of the final state. */
      const key = (x) => JSON.stringify(x.opacity.map((o) => o.o)) + x.thumb.transform + x.thumb.translate
      const final = key(f[f.length - 1])
      const start = f.findIndex((x) => key(x) !== key(f[0]))
      if (start < 0) return null
      for (let i = start; i < f.length; i++) {
        if (f.slice(i).every((x) => key(x) === final)) return Math.round(f[i].t - f[start - 1 >= 0 ? start - 1 : 0].t)
      }
      return null
    })()
    per.push({
      option,
      frames: f.length,
      sizes: sizes.size,
      cardSizes: [...sizes].slice(0, 3),
      thumbs: [...new Set(f.map((x) => `${x.thumb.transform} | ${x.thumb.translate}`))].length,
      thumbFinal: `${f[f.length - 1].thumb.transform} | ${f[f.length - 1].thumb.translate}`,
      thumbOnTarget: r.thumb,
      imgSame: f.every((x) => x.imgSame),
      longestFrame: Math.round(Math.max(...f.slice(1).map((x) => x.dt))),
      both: Math.round(both * 100) / 100,
      settleMs: settleAt,
      curve: curve.filter((c, i) => i === 0 || JSON.stringify(c) !== JSON.stringify(curve[i - 1])).slice(0, 40),
    })
  }
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const asks = imageAsks.length - asksBefore
  const ink = await page.evaluate(INK)
  console.log(`\n${label}: Monthly and Yearly pressed ${presses.length} times${phone ? " (CPU slowed 4x)" : ""}`)
  for (const p of per) {
    console.log(`    to ${p.option.padEnd(7)} ${p.frames} frames, card sizes seen ${p.sizes}, thumb states ${p.thumbs}, settled after ${p.settleMs}ms, longest frame ${p.longestFrame}ms, old and new price both above ${p.both}`)
    console.log(`      price opacity per frame [${p.curve.map((c) => c.join("/")).join("  ")}]`)
    console.log(`      thumb ends ${p.thumbFinal}, off the pressed option by ${p.thumbOnTarget.dl}/${p.thumbOnTarget.dr}px`)
  }
  expect(per.every((p) => p.sizes === 1), "no card changes width or height on any frame", per.map((p) => p.cardSizes))
  expect(movedAll.size === 0, `no layout box moves in the cards or the pill (${movedAll.size} moved)`, [...movedAll].slice(0, 8))
  expect(per.every((p) => p.imgSame) && asks === 0, `no header picture replaced or asked for again (${asks} asks)`, per.map((p) => p.imgSame))
  expect(per.every((p) => /matrix|none/.test(p.thumbFinal) && !/none \| none/.test(p.thumbFinal) || p.option === "monthly"), "the thumb moves on transform", per.map((p) => p.thumbFinal))
  expect(per.every((p) => Math.abs(p.thumbOnTarget.dl) <= 0.5 && Math.abs(p.thumbOnTarget.dr) <= 0.5), "the thumb lands exactly on the option pressed", per.map((p) => p.thumbOnTarget))
  expect(per.every((p) => p.settleMs !== null && p.settleMs <= 300), "everything has settled within 300ms of the press showing", per.map((p) => p.settleMs))
  expect(per.every((p) => p.both <= 0.35), "the old and the new price are never both clearly on screen", per.map((p) => p.both))
  const inkOut = Math.max(...ink.map((i) => Math.max(i.above, i.below)))
  expect(inkOut === 0, `the price's glyphs stay inside the box that fades (worst ${inkOut}px outside)`, ink)
  return { per, asks, moved: [...movedAll], ink }
}

try {
  /* Toggles on every surface, at both widths. */
  for (const surface of only("toggle") ? ["settings", "upgrade", "marketing"] : []) {
    for (const W of [390, 1280]) {
      const page = await open(surface, W)
      results[`${surface}-${W}`] = { toggle: await toggles(page, W, `${surface}, at ${W}px`) }
      if (SHOTS && surface === "settings") {
        mkdirSync(SHOTS, { recursive: true })
        await page.evaluate(() => document.querySelector("[data-probe-scroller]").scrollTo(0, 0))
        const full = await page.evaluate(() => document.querySelector('[data-settings-panel="billing"]').scrollHeight + 400)
        await page.setViewport({ width: W, height: Math.min(full, 4000), ...(W < 768 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) })
        await new Promise((r) => setTimeout(r, 300))
        await page.screenshot({ path: join(SHOTS, `billing-tab-${W}.png`) })
      }
      await page.close()
    }
  }

  /* The Billing tab's order and the Plans row, at 390, 1280 and 320. */
  for (const W of only("layout") ? [320, 390, 1280] : []) {
    const page = await open("settings", W)
    const r = await page.evaluate(LAYOUT)
    results[`settings-${W}`] = { ...(results[`settings-${W}`] || {}), layout: r }
    console.log(`\nthe Billing tab at ${W}px`)
    const order = r.heads.map((h) => h.text)
    console.log(`    sections, top to bottom: ${order.join(" > ")}`)
    const row = r.plansRow
    console.log(`    Plans heading ${row.headingSize}px (others ${r.heads.filter((h) => h.text !== "Plans").map((h) => `${h.text} ${h.size}px`).join(", ")}), pill ${row.switchH}px tall, ${row.switchW}px wide, ${row.sameRow ? "on the heading's row" : "under the heading"}, ${row.rightGap}px from the right edge, ${row.leftGap}px from the left, centre ${row.centreOffset}px off the middle, options ${row.options.map((o) => `${o.h}px (press area ${o.target}px) ${o.font}px text`).join(", ")}`)
    const iHist = order.indexOf("Billing History"), iPlans = order.indexOf("Plans"), iOver = order.indexOf("Subscription Overview")
    expect(iOver === 0 && iHist > iOver && iPlans > iHist, "Subscription Overview, then Billing History, then Plans", order)
    const others = r.heads.filter((h) => h.text !== "Plans")
    expect(others.every((h) => h.size === row.headingSize), "Plans is the same size as the tab's other section headings", r.heads.map((h) => `${h.text} ${h.size}`))
    expect(row.switchH >= 30 && row.switchH <= 34, `the pill is about 32px tall (${row.switchH}px)`)
    expect(row.options.every((o) => o.font === 13), "13px words in the pill", row.options)
    if (W < 768) expect(row.options.every((o) => o.target >= 44), "each option is a 44px press on a phone", row.options)
    if (row.sameRow) expect(Math.abs(row.rightGap) <= 0.5, "the pill sits at the right of the Plans row", row)
    else expect(row.belowHeading && Math.abs(row.leftGap) <= 0.5, "under the heading, flush left, when the row is too narrow", row)
    expect(W < 390 || row.sameRow, "one row at 390px and wider", row)
    await page.close()
  }

  /* The pictures: luminance, grain and the contrast of the text on them. */
  for (const W of only("artwork") ? [390, 1280] : []) {
    /* The marketing section: the window scrolls and no fixed bar covers a card. Each card is read on its own, centred on screen. */
    const page = await open("marketing", W)
    const statsAll = [], statsPic = [], contrast = []
    for (const id of ["free", "growth"]) {
      await page.evaluate((id) => document.querySelector(`[data-plan-card="${id}"] [data-plan-header]`).scrollIntoView({ block: "center" }), id)
      await new Promise((r) => setTimeout(r, 150))
      const boxes = (await page.evaluate(HEADER_TEXT)).filter((b) => b.card === id).map((b) => ({ ...b, x: b.x - 0, y: b.y - 0 }))
      const sc = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
      const region = (await page.evaluate(HEADERS)).filter((h) => h.id === id).map((r) => ({ ...r, x: r.x - sc.x, y: r.y - sc.y }))
      const relBoxes = boxes.map((b) => ({ ...b, x: b.x - sc.x, y: b.y - sc.y }))
      const hideText = await page.addStyleTag({ content: "[data-plan-header] *{color:transparent!important;text-shadow:none!important}[data-plan-header] > :not(img):not([aria-hidden]){visibility:hidden!important}" })
      const shotAll = await page.screenshot({ fullPage: false, encoding: "base64" })
      const all = await page.evaluate(PIXELS, { shot: shotAll, regions: region, boxes: relBoxes })
      /* The picture alone: fade and grain hidden too. */
      const hideRest = await page.addStyleTag({ content: "[data-plan-header] > span[aria-hidden]{visibility:hidden!important}" })
      const shotPic = await page.screenshot({ fullPage: false, encoding: "base64" })
      const pic = await page.evaluate(PIXELS, { shot: shotPic, regions: region })
      if (process.env.DEBUG_DIR) writeFileSync(join(process.env.DEBUG_DIR, `${id}-${W}.png`), Buffer.from(shotAll, "base64"))
      await page.evaluate((a, b) => { a.remove(); b.remove() }, hideText, hideRest)
      statsAll.push(...all.stats)
      statsPic.push(...pic.stats)
      contrast.push(...all.contrast)
    }
    const all = { stats: statsAll, contrast }
    const pic = { stats: statsPic }
    const art = Object.fromEntries(all.stats.map((s, i) => [s.id, { header: s, picture: pic.stats[i] }]))
    results[`artwork-${W}`] = { art, contrast: all.contrast }
    console.log(`\nthe pictures (landing page cards) at ${W}px`)
    for (const [id, a] of Object.entries(art)) {
      console.log(`    ${id.padEnd(6)} picture alone: luminance ${a.picture.luminance.toFixed(4)}, luma ${a.picture.luma.toFixed(2)}   with fade and grain: luminance ${a.header.luminance.toFixed(4)}, luma ${a.header.luma.toFixed(2)}, grain variance ${a.header.grain.toFixed(2)} per device pixel, ${a.header.grainCss.toFixed(2)} per CSS pixel`)
    }
    const low = all.contrast.filter((c) => c.worst < 4.5)
    for (const id of ["free", "growth"]) {
      const cs = all.contrast.filter((c) => c.card === id)
      console.log(`    ${id.padEnd(6)} text contrast: lowest pixel ${Math.min(...cs.map((c) => c.worst))}:1, lowest 5th percentile ${Math.min(...cs.map((c) => c.p5))}:1 over ${cs.length} lines`)
    }
    expect(low.length === 0, "every line of text on the pictures reaches 4.5:1 on the pixels behind it", low.slice(0, 6))
    if (process.env.BASELINE && existsSync(process.env.BASELINE)) {
      const before = JSON.parse(readFileSync(process.env.BASELINE, "utf8"))[`artwork-${W}`]?.art
      if (before) {
        const ratio = (id, k, f) => after(id, k, f) / before[id][k][f]
        const after = (id, k, f) => art[id][k][f]
        const fr = ratio("free", "picture", "luma"), pr = ratio("growth", "picture", "luma")
        const frL = ratio("free", "picture", "luminance"), prL = ratio("growth", "picture", "luminance")
        const fg = ratio("free", "header", "grainCss"), pg = ratio("growth", "header", "grainCss")
        console.log(`    against the baseline: Free picture luma x${fr.toFixed(3)} (luminance x${frL.toFixed(3)}), Pro picture luma x${pr.toFixed(3)} (luminance x${prL.toFixed(3)}); grain variance per CSS pixel Free x${fg.toFixed(2)}, Pro x${pg.toFixed(2)} (per device pixel Free x${ratio("free", "header", "grain").toFixed(2)}, Pro x${ratio("growth", "header", "grain").toFixed(2)}); whole header luma Free x${ratio("free", "header", "luma").toFixed(3)}, Pro x${ratio("growth", "header", "luma").toFixed(3)}`)
        expect(Math.abs(fr - 0.95) <= 0.01, `the Free picture is 5% darker (x${fr.toFixed(3)} in sRGB value)`)
        expect(pr <= 0.9, `the Pro picture is a clear step darker (x${pr.toFixed(3)})`)
        const fh = ratio("free", "header", "luma")
        expect(fh >= 0.93 && fh <= 0.97, `and the whole Free header, grain and all, reads about 5% darker too (x${fh.toFixed(3)})`)
        expect(fg >= 1.5 && pg >= 1.5, `the grain is clearly stronger on both (x${fg.toFixed(2)}, x${pg.toFixed(2)})`)
      }
    }
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true })
      const p2 = await open("marketing", W)
      await p2.evaluate(() => document.querySelector("[data-plan-cards]").scrollIntoView({ block: "start" }))
      await new Promise((r) => setTimeout(r, 200))
      await p2.screenshot({ path: join(SHOTS, `billing-cards-${W}.png`) })
      if (W < 768) {
        /* A 3x crop of the Pro header, to see the grain at a phone's density. */
        const pro = (await p2.evaluate(HEADERS)).find((h) => h.id === "growth")
        await p2.screenshot({ path: join(SHOTS, `billing-pro-header-3x.png`), clip: { x: pro.x, y: pro.y, width: pro.w, height: pro.h } })
        const free = (await p2.evaluate(HEADERS)).find((h) => h.id === "free")
        await p2.evaluate((y) => window.scrollTo(0, y - 20), free.y)
        await p2.screenshot({ path: join(SHOTS, `billing-free-header-3x.png`), clip: { x: free.x, y: free.y, width: free.w, height: free.h } })
      }
      await p2.close()
    }
    await page.close()
  }

  /* Reduced motion: the switch lands at once, and nothing slides. */
  for (const W of only("reduced") ? [390, 1280] : []) {
    const page = await open("settings", W, { reduced: true })
    await page.evaluate(ARM)
    await page.click('[data-interval-option="yearly"]')
    await new Promise((r) => setTimeout(r, 300))
    const r = await page.evaluate(() => {
      window.__probe.stop()
      const f = window.__probe.frames
      const key = (x) => JSON.stringify(x.opacity.map((o) => o.o)) + x.thumb.transform + x.thumb.translate
      /* From the first frame that shows the press, how many different states follow: one means it landed at once. */
      const first = f.findIndex((x) => key(x) !== key(f[0]))
      const thumb = document.querySelector('[data-billing-interval] > span[aria-hidden="true"]')
      const items = [...document.querySelectorAll("[data-morph]")]
      const moving = (el) => { const cs = getComputedStyle(el); return cs.transitionProperty !== "none" && cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0) }
      return {
        changedAt: first,
        distinct: first < 0 ? 0 : new Set(f.slice(first).map(key)).size,
        thumbMoves: moving(thumb),
        itemsMove: items.filter(moving).length,
        offTransforms: [...new Set(items.filter((i) => i.dataset.morph === "off").map((i) => `${getComputedStyle(i).transform} ${getComputedStyle(i).translate}`))],
      }
    })
    results[`reduced-${W}`] = r
    console.log(`\nreduced motion at ${W}px: ${r.distinct} state(s) from the first changed frame, thumb transitions ${r.thumbMoves ? "on" : "off"}, ${r.itemsMove} lines with a transition, hidden lines at ${r.offTransforms.join(" / ")}`)
    expect(r.distinct === 1 && !r.thumbMoves && r.itemsMove === 0, "with reduced motion the pill and the prices change in one frame", r)
    await page.close()
  }

  if (process.env.OUT_JSON) writeFileSync(process.env.OUT_JSON, JSON.stringify(results, null, 2))
  if (SHOTS) console.log(`\n  screenshots in ${SHOTS}`)
  console.log(broken === 0 ? "\nall billing tab checks passed\n" : `\n${broken} billing tab checks failed\n`)
  process.exitCode = broken === 0 ? 0 : 1
} finally {
  await browser.close()
  server.close()
  rmSync(tmp, { recursive: true, force: true })
}
