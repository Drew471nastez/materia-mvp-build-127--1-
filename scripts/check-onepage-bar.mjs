/**
 * ===========================================================================
 *  THE WHITE BAR OVER A ONEPAGE, MEASURED IN ROWS OF PIXELS
 * ===========================================================================
 * Reported from a phone, of the OnePage editor in Preview: "why is there that
 * empty bar space, white?" — a white bar across the top of a dark page with
 * nothing in the middle of it. An opinion about emptiness is worth nothing, so
 * this probe renders the screen he photographed and reads it:
 *
 *   near-white bands   rows of the viewport where every pixel is near white
 *   flat bands         rows where every pixel is the same colour — a band of
 *                      background with no content crossing it
 *   the bar's gaps     the widest run of the bar with no control in it
 *   the two he circled the newsletter's Subscribe button and the field beside
 *                      it: height, corners, and the 44px a thumb needs
 *
 * Three screens, at 390x844 and 360x780:
 *
 *   editor-preview     the editor with Preview open: the bar over the page
 *   editor-preview-inset47  the same with an iPhone 13's 47px safe area put
 *                      in by hand, because env(safe-area-inset-top) cannot be
 *                      emulated and it is half of what he was looking at
 *   live               the published page on its own, no bar: nothing white
 *                      may appear between it and any edge of the screen
 *
 *   node scripts/check-onepage-bar.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-bar.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-bar-"))
mkdirSync(shots, { recursive: true })
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* The same stubs scripts/check-onepage-editor.mjs mounts the editor with. */
const dir = join(root, ".onepage-bar-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/onepage"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
writeFileSync(join(dir, "supabase.js"), `const result = { data: { onboarding_completed: true }, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-editor.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = await appCss(root)

/* The page he photographed: dark green, two products, a link, a newsletter. */
const THEME = {
  background_type: "solid",
  background_color: "#12352b",
  background_gradient: "",
  background_image_url: "",
  text_color: "#eef2ec",
  secondary_text_color: "#b7c4b6",
  button_color: "#eef2ec",
  button_text_color: "#12352b",
  button_style: "filled",
  button_border_radius: 12,
  button_border_width: 0,
  button_border_color: "#eef2ec",
  button_shadow: "none",
  title_color: "#eef2ec",
  social_icon_color: "#eef2ec",
  spacing: "normal",
  card_width: "standard",
  header_layout: "classic",
}
const BLOCKS = [
  { id: "h0", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "p1", type: "product", enabled: true, sort_order: 1, data: { product_id: "pr1", show_price: true, show_description: true, cta_text: "Get My Guide", style: "callout" } },
  { id: "p2", type: "product", enabled: true, sort_order: 2, data: { product_id: "pr2", show_price: true, show_description: true, cta_text: "Get My Guide", style: "callout" } },
  { id: "l1", type: "link_button", enabled: true, sort_order: 3, data: { label: "My Link", url: "https://example.com/mine", icon: null, thumbnail_url: null } },
  { id: "e1", type: "email_capture", enabled: true, sort_order: 4, data: { headline: "Join my newsletter", description: "Get updates and exclusive content", placeholder: "Enter your email", button_text: "Subscribe", success_message: "Thanks!", button_preset: "subscribe", custom_button_text: "", enable_digital_product: false, layout_type: "default", animation_type: "none" } },
]
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE_THEME=${JSON.stringify(THEME)};window.PROBE_LIVE_THEME=${JSON.stringify(THEME)};window.PROBE_BLOCKS=${JSON.stringify(BLOCKS)}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  if (req.url.startsWith("/onepage-preview")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  if (req.url === "/" || req.url.startsWith("/?") || req.url.startsWith("/app")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  res.writeHead(200, { "content-type": "application/json" })
  if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
  if (req.url.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ clicks: 0, daily: [] }))
  res.end("{}")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

/* A blank page whose canvas reads a frame, so the probe needs no image library. */
const reader = await browser.newPage()
await reader.evaluate(() => {
  window.rows = async (png, dpr) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
    const out = []
    for (let y = 0; y < height; y++) {
      let white = true, flat = true
      const i0 = y * width * 4
      const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2]
      for (let x = 0; x < width; x++) {
        const i = i0 + x * 4
        const r = data[i], gg = data[i + 1], b = data[i + 2]
        if (r < 242 || gg < 242 || b < 242) white = false
        if (Math.abs(r - r0) > 3 || Math.abs(gg - g0) > 3 || Math.abs(b - b0) > 3) flat = false
        if (!white && !flat) break
      }
      out.push({ y: Math.round(y / dpr), white, flat, colour: `#${[r0, g0, b0].map((v) => v.toString(16).padStart(2, "0")).join("")}` })
    }
    return out
  }
})

/** Rows that answer `key`, run together into bands of 4px and up. */
const bands = (rows, key, min = 4) => {
  const b = []
  let run = null
  for (const r of rows) {
    if (r[key]) {
      if (run && run.colour === r.colour && r.y <= run.y1 + 1) { run.y1 = r.y; continue }
      if (run) b.push(run)
      run = { y0: r.y, y1: r.y, colour: r.colour }
    } else if (run) { b.push(run); run = null }
  }
  if (run) b.push(run)
  return b.map((r) => ({ y: `${r.y0}-${r.y1}`, y0: r.y0, y1: r.y1, h: r.y1 - r.y0 + 1, colour: r.colour })).filter((r) => r.h >= min)
}

async function shot(p, label, dpr) {
  const png = await p.screenshot({ encoding: "base64" })
  writeFileSync(join(shots, `${label}.png`), Buffer.from(png, "base64"))
  return reader.evaluate((png, dpr) => window.rows(png, dpr), png, dpr)
}

for (const vp of [
  { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  /* The narrowest screen the bar's middle word is shown on: it must fit whole. */
  { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
]) {
  const tag = `${vp.width}x${vp.height}`
  console.log(`\n── the editor's bar over the page, ${tag} ──`)
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.goto(`${base}/app/onepage#links`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(900)
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Preview" && b.getClientRects().length)?.click())
  await sleep(2200)

  const rows = await shot(p, `editor-preview-${tag}`, vp.deviceScaleFactor)
  const bar = await p.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } }
    const header = document.querySelector("[data-onepage-editor] > header")
    const things = [...header.querySelectorAll("button, [data-onepage-state]")]
      .filter((e) => e.getClientRects().length)
      .map((e) => ({ what: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 16), ...r(e) }))
      .sort((a, b) => a.x - b.x)
    let widest = { gap: 0, between: null }
    for (let i = 1; i < things.length; i++) {
      const gap = things[i].x - (things[i - 1].x + things[i - 1].w)
      if (gap > widest.gap) widest = { gap, between: `${things[i - 1].what} → ${things[i].what}` }
    }
    const label = header.querySelector("[data-onepage-state]")
    const shown = label && label.getClientRects().length
    return {
      header: r(header), things, widest,
      label: shown ? { text: label.textContent, cut: label.scrollWidth > label.clientWidth + 1, w: Math.round(label.getBoundingClientRect().width) } : null,
      preview: r(document.querySelector("[data-onepage-mobile-preview]")), viewH: document.documentElement.clientHeight,
    }
  })
  const white = bands(rows, "white")
  const inBar = white.filter((b) => b.y1 <= bar.header.h)
  const belowBar = white.filter((b) => b.y0 >= bar.header.h)
  console.log(`  white bands: ${JSON.stringify(white)}`)
  console.log(`  bar: ${JSON.stringify(bar.header)}  widest gap across it: ${JSON.stringify(bar.widest)}`)
  expect(bar.header.h <= 48, "the phone bar is no taller than the controls need (48px)", bar.header.h)
  expect(inBar.reduce((n, b) => n + b.h, 0) <= 14, "and holds at most 14px of rows with nothing in them", inBar)
  /* A fifth of the bar with nothing in it is a dead band: 91px of 390 was
     what he photographed. From 375px the save state fills it; under that
     there is no room for a word and six controls leave 61px of 360 (17%),
     which is a gap between two groups, not a hole. */
  expect(bar.widest.gap < bar.header.w / 5, "no run of the bar a fifth of its width or wider with nothing in it", { ...bar.widest, of: bar.header.w })
  expect(vp.width >= 375 ? !!bar.label && !bar.label.cut : bar.label === null,
    vp.width >= 375 ? "the word in the middle is whole, not cut short" : "and is left out where there is no room for it", bar.label)
  expect(belowBar.length === 0, "nothing white between the bar and the bottom of the screen", belowBar)
  expect(bar.preview.y === bar.header.h && bar.preview.y + bar.preview.h === bar.viewH, "the page's own colour runs from the bar to the bottom edge", bar.preview)

  /* The same bar on a real iPhone: env(safe-area-inset-top) cannot be
     emulated, so an iPhone 13's 47px is put in by hand. */
  await p.addStyleTag({ content: "[data-onepage-editor] > header { padding-top: 47px !important }" })
  await sleep(400)
  const insetRows = await shot(p, `editor-preview-inset47-${tag}`, vp.deviceScaleFactor)
  const insetWhite = bands(insetRows, "white")
  const empty = insetWhite.reduce((n, b) => n + b.h, 0)
  console.log(`  with a 47px safe area: white bands ${JSON.stringify(insetWhite)} — ${empty}px of the bar is empty`)
  expect(empty <= 47 + 14, "on an iPhone the only empty white left is the safe area itself", empty)
  await p.close()

  console.log(`\n── the published page, no bar, ${tag} ──`)
  const q = await browser.newPage()
  await q.setViewport(vp)
  await q.goto(`${base}/?live`)
  await sleep(1800)
  const liveRows = await shot(q, `live-${tag}`, vp.deviceScaleFactor)
  const liveWhite = bands(liveRows, "white")
  console.log(`  white bands: ${liveWhite.length ? JSON.stringify(liveWhite) : "none"}`)
  expect(liveWhite.length === 0, "the page is its own colour from edge to edge", liveWhite)

  /* The two he circled in red. */
  const buttons = await q.evaluate(() => {
    const live = [...document.querySelectorAll(".onepage-live")].find((e) => e.getClientRects().length) || document.body
    const say = (el) => {
      if (!el) return null
      const cs = getComputedStyle(el)
      const b = el.getBoundingClientRect()
      return { text: el.textContent.trim().slice(0, 14), x: Math.round(b.x), w: Math.round(b.width), h: Math.round(b.height), radius: cs.borderTopLeftRadius, align: cs.textAlign }
    }
    const tap = [...live.querySelectorAll("a, button")].filter((e) => e.getClientRects().length)
    return {
      myLink: say(tap.find((e) => e.textContent.trim() === "My Link")),
      subscribe: say(tap.find((e) => e.textContent.trim() === "Subscribe")),
      field: say(live.querySelector('input[type="email"]')),
      cards: tap.filter((e) => e.textContent.trim() === "Get My Guide").map(say),
    }
  })
  console.log(`  the two circled in red: ${JSON.stringify(buttons)}`)
  expect(buttons.myLink.h >= 44 && buttons.subscribe.h >= 44 && buttons.field.h >= 44,
    "My Link, Subscribe and the field beside it are all 44px or taller", [buttons.myLink?.h, buttons.subscribe?.h, buttons.field?.h])
  expect(buttons.subscribe.radius === buttons.field.radius && buttons.subscribe.radius === buttons.myLink.radius,
    "and they wear the theme's corners, the field included", [buttons.myLink?.radius, buttons.subscribe?.radius, buttons.field?.radius])
  expect(buttons.myLink.x === 20 && buttons.myLink.w === vp.width - 40, "My Link sits on the page's own margin, full width", buttons.myLink)
  expect(buttons.subscribe.h === buttons.field.h, "Subscribe and its field are one row of one height", [buttons.subscribe?.h, buttons.field?.h])
  await q.close()
}

await browser.close()
server.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} measurement(s) off.\n` : "\nThe bar earns its space and nothing white is left over.\n")
process.exit(broken ? 1 : 0)
