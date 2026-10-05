/**
 * ===========================================================================
 *  ROUND 11: EXPLORE, THE PRODUCT PAGE AND EVERY BACK, MEASURED
 * ===========================================================================
 * Two halves.
 *
 * COMPONENTS (always run): scripts/render-explore-round11.tsx, bundled with
 * esbuild and drawn with the app's own CSS.
 *
 *   BACKS     every back control that is a component (the shared
 *             BackControl, the profile bar's chevron, the product's
 *             "< Explore" and the product creator bar's arrow), pressed by a
 *             finger at 4x CPU throttle and sampled on every frame: no frame
 *             has a scale, a matrix or a translate on the control or in it,
 *             no part of it changes size, the pressed tint is on screen on
 *             the FIRST frame after the finger lands, and a double tap is one
 *             navigation. Filmstrips of each press go to SHOTS_DIR.
 *   CARDS     the community card's mark has a hairline and a 1px soft shadow,
 *             and the price (or Free) is 16px.
 *
 * THE REAL APP (when BASE is set): a running `next dev` of this checkout,
 * whose Supabase is the stand in this probe serves on 127.0.0.1:54399
 * (48 products by four makers, one signed in person). Turbopack refuses a
 * worktree whose node_modules is a link out of it, so run the app from a
 * copy with `turbopack: { root: "/" }` in its next.config, then:
 *
 *   node scripts/check-explore-round11.mjs serve-stub   (leave it running)
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
 *     SUPABASE_SERVICE_ROLE_KEY=x EXPLORE_MARKETPLACE_ENABLED=1 next dev -p 3931
 *   BASE=http://127.0.0.1:3931 PROBE_CSS=source node scripts/check-explore-round11.mjs
 *
 *   ICON      the categories icon beside the search glyph, cropped at 2x, in
 *             the hero (20px on a computer, 18px on a phone) and in the
 *             header's field (18px), drawn at the search glyph's stroke.
 *   ARRIVAL   from Explore scrolled 1500px down, a card pressed: every frame
 *             of the product page is at scrollY 0 (phone and computer); a
 *             stray scroll of the page in its first moments, with no finger
 *             on it, is put back to 0; a scroll the person makes is not.
 *   RETURN    "< Explore" pressed on the product: Explore's first frame is
 *             at the place it was left, the card that was under the finger
 *             where it was (to the pixel), no frame at the top, never a jump,
 *             and it comes in on a short fade that never drops below half.
 *   AVATAR    the phone header's photo: 34px, with a hairline and a soft
 *             1px shadow.
 *   SEARCH    /explore/search: the field's shadow is drawn whole under the
 *             field, also when the rows' pane is a layer of its own (as iOS
 *             makes a touch scroller), photographed.
 *
 * Pictures go to SHOTS_DIR (a temporary folder by default); look at them.
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const root = process.cwd()
const SESSION_FILE = join(tmpdir(), "storelib-explore-r11-session.json")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── The stand in database for the real app ─────────────────────────────── */
const AT = "2026-08-01T10:00:00.000Z"
const ME = { id: "99999999-9999-4999-8999-000000000001", aud: "authenticated", role: "authenticated", email: "ava@example.com", email_confirmed_at: AT, app_metadata: { provider: "email" }, user_metadata: { full_name: "Ava Stone" }, created_at: AT, updated_at: AT }
function tables() {
  const creators = [], profiles = [], products = []
  profiles.push({ id: ME.id, username: "ava", display_name: "Ava Stone", avatar_url: null, is_creator: false, welcome_completed: true, created_at: AT })
  for (let c = 1; c <= 4; c++) {
    const U = `11111111-1111-4111-8111-00000000000${c}`, C = `22222222-2222-4222-8222-00000000000${c}`, h = `maker${c}`
    profiles.push({ id: U, username: h, display_name: `Maker ${c}`, avatar_url: null, bio: "Prints", email_verified: true, is_creator: true, welcome_completed: true, created_at: AT })
    creators.push({ id: C, user_id: U, slug: h, username: h, display_name: `Maker ${c}`, avatar_url: null, bio: "Prints", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: AT, niche_tags: [] })
    for (let n = 1; n <= 12; n++) {
      const i = (c - 1) * 12 + n
      products.push({
        id: `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`, creator_id: C, seller_id: C, title: `Product ${i} long enough title`, slug: `product-${i}`,
        description: `<p>${"A description paragraph that makes the product page long enough to scroll. ".repeat(40)}</p>`, price: 10 + i, price_cents: (10 + i) * 100, currency: "usd", status: "published", archived: false,
        type: "digital", product_type: "digital", thumbnail_url: null, cover_image_url: null, images: [], gallery_urls: [], created_at: `2026-08-${String((i % 27) + 1).padStart(2, "0")}T10:00:00.000Z`, updated_at: AT,
        product_categories: [], category: "design", subcategory: null, reviews_count: 0, reviews_average: 0, sales_count: i, view_count: i * 3, is_featured: false,
      })
    }
  }
  /* As storelib.com runs: the light bar. */
  const platform_settings = [{ key: "buyer_header_light", value: true }]
  return { platform_settings, profiles, creators, products, store_builder_configs: [], onepages: [], follows: [], entitlements: [], custom_domains: [], seo_overrides: [], username_history: [], orders: [], store_theme_installs: [], reviews: [] }
}

async function main() {
  const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
  if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
  const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-r11-")), "shots")
  mkdirSync(shots, { recursive: true })
  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
    if (!ok) broken++
  }
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    if (!process.env.PARTS || process.env.PARTS.includes("components")) await components(browser, shots, expect)
    if (process.env.BASE) await realApp(browser, shots, expect, process.env.BASE)
    else console.log("\n(BASE not set: the real app half was skipped.)")
  } finally {
    await browser.close()
  }
  console.log(`\nPictures: ${shots}`)
  console.log(broken ? `\n${broken} check(s) failed.` : "\nAll checks passed.")
  process.exit(broken ? 1 : 0)
}

/* A row of frames side by side, for looking at a press. */
async function contactSheet(frames, out, crop) {
  if (!frames.length) return
  const tiles = await Promise.all(frames.map((f) => sharp(Buffer.from(f.data, "base64")).extract(crop).png().toBuffer()))
  const gap = 4
  const sheet = sharp({ create: { width: tiles.length * (crop.width + gap), height: crop.height, channels: 3, background: "#ff00ff" } })
  await sheet.composite(tiles.map((t, i) => ({ input: t, left: i * (crop.width + gap), top: 0 }))).png().toFile(out)
}

/*
  ONE PRESS, FILMED. Samples every frame from just before the finger lands:
  the computed scale / matrix / translate of the control, everything in
  it and everything round it up to <body>; the size of each visible part;
  the control's ground and its disc's opacity. `pointerAt` is when the
  pointerdown reached the page, so "frame 1" is the first sample after it.
*/
const SAMPLER = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  window.__press = { samples: [], downAt: null }
  addEventListener("pointerdown", () => { if (window.__press.downAt == null) window.__press.downAt = performance.now() }, true)
  const t0 = performance.now()
  const moved = (n) => {
    const cs = getComputedStyle(n)
    const t = cs.transform
    return (cs.scale !== "none" && cs.scale !== "1") || (t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)") || (cs.translate !== "none" && cs.translate !== "0px")
  }
  const tick = () => {
    if (!el.isConnected) return
    const parts = [el, ...el.querySelectorAll("*")]
    const around = []
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) around.push(n)
    const spinner = (n) => n.closest(".bar-control-spinner, [class*='spinner']")
    const bumps = [...parts, ...around].filter((n) => !spinner(n) && moved(n)).map((n) => n.tagName.toLowerCase() + "." + String(n.getAttribute("class") || "").slice(0, 40))
    const sizes = parts.filter((n) => !spinner(n)).map((n) => { const r = n.getBoundingClientRect(); return Math.round(r.width * 10) / 10 + "x" + Math.round(r.height * 10) / 10 }).join(" ")
    const disc = el.querySelector("[data-back-disc]")
    window.__press.samples.push({
      t: performance.now() - t0,
      at: performance.now(),
      bumps,
      sizes,
      bg: getComputedStyle(el).backgroundColor,
      disc: disc ? getComputedStyle(disc).opacity : null,
      pressed: el.hasAttribute("data-pressed"),
    })
    if (performance.now() - t0 < 2600) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

async function filmPress(p, sel, name, shots, { double = false, gap = 110 } = {}) {
  const box = await p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }, sel)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const frames = []
  cdp.on("Page.screencastFrame", (f) => { frames.push(f); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
  await p.evaluate(SAMPLER(sel))
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await sleep(250)
  const x = box.x + box.w / 2, y = box.y + box.h / 2
  const touch = async (type) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  await touch("touchStart"); await sleep(140); await touch("touchEnd")
  if (double) { await sleep(gap); await touch("touchStart"); await sleep(90); await touch("touchEnd") }
  await sleep(1300)
  await cdp.send("Page.stopScreencast")
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const res = await p.evaluate(() => window.__press)
  /* A screencast frame is not at the page's device pixel ratio: scale by its own width against the window's. */
  const pad = 10
  if (frames.length) {
    const meta = await sharp(Buffer.from(frames[0].data, "base64")).metadata()
    const k = meta.width / frames[0].metadata.deviceWidth
    const crop = { left: Math.max(0, Math.round((box.x - pad) * k)), top: Math.max(0, Math.round((box.y - pad) * k)), width: Math.round((box.w + pad * 2) * k), height: Math.round((box.h + pad * 2) * k) }
    await contactSheet(frames.slice(0, 14), join(shots, `press-${name}.png`), crop).catch((e) => console.log("   (no filmstrip:", e.message, ")"))
  }
  return { ...res, frames: frames.length }
}

function judgePress(res, expect, label, { tint }) {
  const s = res.samples
  const before = s.filter((x) => res.downAt == null || x.at < res.downAt)
  const after = s.filter((x) => res.downAt != null && x.at >= res.downAt)
  const rest = before[before.length - 1] ?? s[0]
  const first = after[0]
  if (process.env.DEBUG_PRESS) { let last = ""; for (const x of s) { const k = `${x.bg} ${x.disc} ${x.pressed}`; if (k !== last) console.log("     ", Math.round(x.at - (res.downAt ?? 0)), k); last = k } }
  const bumps = [...new Set(s.flatMap((x) => x.bumps))]
  const sizes = [...new Set(s.map((x) => x.sizes))]
  expect(bumps.length === 0, `${label}: no scale, matrix or translate on any frame (${s.length} frames at 4x CPU)`, bumps.slice(0, 3))
  expect(sizes.length === 1, `${label}: nothing in it changes size`, sizes.length === 1 ? sizes[0].split(" ")[0] : sizes.slice(0, 3))
  const tinted = (x) => (tint === "disc" ? Number(x.disc) > 0.1 : x.bg !== rest.bg)
  expect(!!first && tinted(first), `${label}: pressed tint on the first frame after the finger lands`, first && { ms: Math.round(first.at - res.downAt), rest: tint === "disc" ? rest.disc : rest.bg, frame1: tint === "disc" ? first.disc : first.bg })
}

async function components(browser, shots, expect) {
  const css = await appCss(root)
  const faces = interFaces(root)
  const stubs = join(root, ".explore-round11-probe")
  mkdirSync(stubs, { recursive: true })
  const STUBS = {
    "next-navigation.jsx": `export const usePathname = () => "/p/product-1"
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})
import { useContext } from "react"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
export const useRouter = () => useContext(AppRouterContext)`,
    "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })`,
    "next-image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, className, style, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style }) }`,
    "supabase-client.jsx": `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : chain(), apply: () => chain() })
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => chain(), rpc: () => chain(), channel: () => chain(), removeChannel() {} } }`,
  }
  for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, k), v)
  try {
    await build({
      entryPoints: [join(root, "scripts/render-explore-round11.tsx")],
      bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
      outfile: join(stubs, "app.js"),
      define: { "process.env.NODE_ENV": '"production"' },
      banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
      loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
      plugins: [{
        name: "stubs",
        setup(b) {
          b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "next-navigation.jsx") }))
          b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(stubs, "next-link.jsx") }))
          b.onResolve({ filter: /^next\/image$/ }, () => ({ path: join(stubs, "next-image.jsx") }))
          b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
          b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
        },
      }],
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, "app.js"), "utf8")
    writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)
  } catch (e) {
    rmSync(stubs, { recursive: true, force: true })
    throw new Error(`The probe did not bundle: ${e.message}`)
  }

  const open = async (show, vp) => {
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport(vp)
    await p.goto(`file://${join(stubs, "index.html")}?show=${show}`)
    await p.evaluate(() => document.fonts.ready)
    await sleep(500)
    p.__errors = errors
    return p
  }

  console.log("\nBACKS: every back control pressed by a finger, 4x CPU, every frame")
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const controls = [
    ["back-control", "[data-probe=back-control] [data-back-control]", "bg"],
    ["profile-back", "[data-probe=profile-back] [data-profile-back-button]", "bg"],
    ["breadcrumb", "[data-probe=breadcrumb] [data-discover-breadcrumb]", "bg"],
    ["creator-bar-back", "[data-probe=creator-bar] [data-back-control]", "disc"],
  ]
  for (const [name, sel, tint] of controls) {
    const p = await open("backs", PHONE)
    const found = await p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 ? Math.round(r.width) + "x" + Math.round(r.height) : null }, sel)
    expect(!!found, `${name}: drawn`, found ?? "missing")
    if (!found) { await p.close(); continue }
    const one = await filmPress(p, sel, name, shots)
    judgePress(one, expect, name, { tint })
    const nav1 = await p.evaluate(() => ({ ...window.__nav }))
    expect(nav1.pushes.length + nav1.backs === 1, `${name}: one tap is one navigation`, nav1)
    await p.close()
    const q = await open("backs", PHONE)
    await filmPress(q, sel, `${name}-double`, shots, { double: true })
    const nav2 = await q.evaluate(() => ({ ...window.__nav }))
    expect(nav2.pushes.length + nav2.backs === 1, `${name}: a double tap is still one navigation`, nav2)
    expect(q.__errors.length === 0, `${name}: no page errors`, q.__errors.slice(0, 2))
    await q.close()
    if (name !== "profile-back") {
      /* A slow second tap, after the 400ms hold: the push is still on its way and the page has not gone. */
      const r = await open("backs", PHONE)
      await filmPress(r, sel, `${name}-late`, shots, { double: true, gap: 600 })
      const nav3 = await r.evaluate(() => ({ ...window.__nav }))
      expect(nav3.pushes.length + nav3.backs === 1, `${name}: a second tap 600ms later, page not gone yet, is still one navigation`, nav3)
      await r.close()
    }
  }

  console.log("\nCARDS: the community mark's depth and the price")
  for (const [vpName, vp] of [["390", PHONE], ["1440", { width: 1440, height: 900, deviceScaleFactor: 2 }]]) {
    const p = await open("cards", vp)
    const m = await p.evaluate(() => [...document.querySelectorAll("[data-community-card]")].map((c) => {
      const marks = [...c.querySelectorAll("[data-community-mark], [data-app-avatar][data-avatar-kind=mark]")].map((mark) => {
        const r = mark.getBoundingClientRect()
        const layers = getComputedStyle(mark).boxShadow.split(/,(?![^(]*\))/).map((l) => l.trim()).filter((l) => !/^rgba\(0, 0, 0, 0\)/.test(l))
        return { px: Math.round(r.width), layers: layers.join(", "), rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
      })
      const price = c.querySelector("[data-community-price]")
      return { slug: c.getAttribute("data-community-card"), marks, price: price.textContent, priceSize: getComputedStyle(price).fontSize, priceWeight: getComputedStyle(price).fontWeight, rect: (() => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })() }
    }))
    for (const c of m) {
      for (const mk of c.marks) {
        const ring = / 0px 0px 0px 1px(,|$)/.test(mk.layers)
        const drop = / 0px 1px 2px 0px(,|$)/.test(mk.layers)
        expect(ring && drop, `${vpName} ${c.slug}: the ${mk.px}px mark has a 1px hairline ring and a 1px soft shadow`, mk.layers)
      }
      expect(c.priceSize === "16px", `${vpName} ${c.slug}: "${c.price}" is 16px (it was 15)`, `${c.priceSize} / ${c.priceWeight}`)
    }
    const file = join(shots, `cards-${vpName}.png`)
    await p.screenshot({ path: file })
    const r = m[1].rect
    await sharp(file).extract({ left: Math.max(0, Math.round((r.x - 8) * 2)), top: Math.max(0, Math.round((r.y - 8) * 2)), width: Math.round((r.w + 16) * 2), height: Math.round((r.h + 16) * 2) }).png().toFile(join(shots, `card-${vpName}.png`))
    await p.close()
  }
  rmSync(stubs, { recursive: true, force: true })
}

async function realApp(browser, shots, expect, BASE) {
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 2 }
  const open = async (vp, path, { signedIn = false } = {}) => {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    p.__ctx = ctx
    await p.setViewport(vp)
    if (signedIn && existsSync(SESSION_FILE)) await p.setCookie({ ...JSON.parse(readFileSync(SESSION_FILE, "utf8")), url: BASE })
    await p.setCookie({ name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE })
    await p.goto(BASE + path, { waitUntil: "networkidle2", timeout: 600000 })
    await p.evaluate(() => document.fonts.ready)
    await sleep(1500)
    return p
  }
  const close = (p) => p.__ctx.close()
  /* PARTS=icon,arrival,avatar,search runs only those (all by default). */
  const part = (name) => !process.env.PARTS || process.env.PARTS.split(",").includes(name)
  const cardAt = (p, n = 0) => p.evaluate((n) => {
    const a = [...document.querySelectorAll('[data-product-card] a[href*="layout=discover"]')].filter((a) => { const r = a.getBoundingClientRect(); return r.top > 140 && r.bottom < innerHeight - 140 && r.width > 50 })[n]
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { href: a.getAttribute("href"), x: r.left + r.width / 2, y: r.top + 40, top: Math.round(a.closest("[data-product-card]").getBoundingClientRect().top), sy: Math.round(scrollY) }
  }, n)
  const tap = (p, vp, x, y) => (vp.hasTouch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y))
  const FILM = (ms) => `(() => { window.__f = []; const t0 = performance.now(); const tick = () => { const m = document.querySelector("main"); window.__f.push({ t: Math.round(performance.now() - t0), path: location.pathname, y: Math.round(scrollY), op: m ? getComputedStyle(m).opacity : "1", ground: (() => { const g = document.querySelector(".explore-ground"); return g ? getComputedStyle(g).opacity : null })(), cls: document.documentElement.className.split(" ").filter((c) => c.startsWith("explore-scroll")).join(" "), card: window.__watch ? (() => { const a = document.querySelector('[data-product-card] a[href="' + window.__watch + '"]'); return a ? Math.round(a.closest("[data-product-card]").getBoundingClientRect().top) : null })() : null }); if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()`

  if (part("icon")) console.log("\nICON: the categories icon beside the search glyph")
  for (const [vpName, vp] of part("icon") ? [["1440", DESK], ["390", PHONE]] : []) {
    const p = await open(vp, "/explore")
    const m = await p.evaluate(() => {
      const field = document.querySelector("main form[role=search]")
      const glyph = field?.querySelector("svg.lucide-search, svg")
      const icon = document.querySelector("[data-search-categories] [data-categories-icon]")
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } }
      return field && icon && glyph ? { field: r(field), icon: r(icon), glyph: r(glyph), iconStroke: icon.getAttribute("stroke-width"), glyphStroke: glyph.getAttribute("stroke-width"), shapes: icon.innerHTML } : null
    })
    expect(!!m, `${vpName}: the hero field and its icon`, m ? undefined : "missing")
    if (m) {
      const want = 20
      expect(Math.round(m.icon.w) === want, `${vpName}: the icon is ${want}px in the hero`, Math.round(m.icon.w))
      expect(m.iconStroke === m.glyphStroke && m.iconStroke === "2", `${vpName}: drawn at the search glyph's stroke (2)`, { icon: m.iconStroke, glyph: m.glyphStroke })
      const file = join(shots, `icon-hero-${vpName}.png`)
      await p.screenshot({ path: file })
      const f = m.field
      await sharp(file).extract({ left: Math.round(f.x * 2) - 16, top: Math.round(f.y * 2) - 16, width: Math.round(f.w * 2) + 32, height: Math.round(f.h * 2) + 32 }).png().toFile(join(shots, `icon-field-${vpName}.png`))
    }
    if (vpName === "1440") {
      await p.evaluate(() => window.scrollTo(0, 900))
      await sleep(900)
      const h = await p.evaluate(() => {
        const icon = document.querySelector("#platform-header-root [data-header-search-categories] [data-categories-icon]")
        const field = document.querySelector("#platform-header-root [data-header-search-field]")
        if (!icon || !field) return null
        const b = icon.getBoundingClientRect(), f = field.getBoundingClientRect()
        return { w: Math.round(b.width), field: { x: f.left, y: f.top, w: f.width, h: f.height }, sy: scrollY }
      })
      expect(!!h && h.w === 18, "1440: the header field's icon is 18px", h && h.w)
      if (h) {
        const file = join(shots, "icon-header-1440.png")
        await p.screenshot({ path: file })
        await sharp(file).extract({ left: Math.round(h.field.x * 2) - 12, top: Math.max(0, Math.round(h.field.y * 2) - 12), width: Math.round(h.field.w * 2) + 24, height: Math.round(h.field.h * 2) + 24 }).png().toFile(join(shots, "icon-header-field-1440.png"))
      }
    }
    await close(p)
  }

  for (const [vpName, vp] of part("arrival") ? [["390", PHONE], ["1440", DESK]] : []) {
    console.log(`\nARRIVAL and RETURN at ${vpName}`)
    const p = await open(vp, "/explore")
    await p.evaluate(() => window.scrollTo(0, 1500))
    await sleep(900)
    const card = await cardAt(p)
    expect(!!card, `${vpName}: a card under the finger at scrollY 1500`, card)
    if (!card) { await close(p); continue }
    await p.evaluate(FILM(9000))
    await tap(p, vp, card.x, card.y)
    await p.waitForFunction(() => location.pathname.startsWith("/p/"), { timeout: 300000 })
    await sleep(2500)
    const arrive = (await p.evaluate(() => window.__f)).filter((f) => f.path.startsWith("/p/"))
    const ys = [...new Set(arrive.map((f) => f.y))]
    expect(arrive.length > 0 && ys.length === 1 && ys[0] === 0, `${vpName}: every frame of the product is at scrollY 0 (from Explore at ${card.sy})`, { frames: arrive.length, ys })

    /* RETURN: the way back the page offers ("< Explore" on a phone, the creator bar's arrow on a computer). */
    await p.evaluate((href) => { window.__watch = href }, card.href)
    /* A computer draws no back of its own over a product (the browser's Back is the way), so there it is history.back(). */
    const backSel = "[data-discover-breadcrumb]"
    const back = vpName === "390" ? await p.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, backSel) : { browser: true }
    expect(!!back, `${vpName}: the way back (${vpName === "390" ? '"< Explore"' : "the browser's Back"})`, back)
    if (back) {
      const cdp = await p.createCDPSession()
      const frames = []
      let t0 = 0
      cdp.on("Page.screencastFrame", (f) => { frames.push({ t: Date.now() - t0, data: f.data }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
      await p.evaluate((href) => { window.__watch = href }, card.href)
      await p.evaluate(FILM(6000))
      t0 = Date.now()
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
      if (back.browser) await p.evaluate(() => history.back())
      else await tap(p, vp, back.x, back.y)
      await p.waitForFunction(() => location.pathname === "/explore", { timeout: 300000 })
      await sleep(2000)
      await cdp.send("Page.stopScreencast")
      const film = (await p.evaluate(() => window.__f)).filter((f) => f.path === "/explore")
      const firstShown = film.find((f) => !f.cls.includes("explore-scroll-restoring"))
      const ys2 = [...new Set(film.filter((f) => !f.cls.includes("explore-scroll-restoring")).map((f) => f.y))]
      const tops = [...new Set(film.filter((f) => !f.cls.includes("explore-scroll-restoring")).map((f) => f.card))]
      expect(!!firstShown && firstShown.y === card.sy, `${vpName}: Explore's first frame is where it was left (${card.sy})`, firstShown && firstShown.y)
      expect(ys2.length === 1, `${vpName}: and it never moves after that (no jump)`, ys2)
      expect(tops.length === 1 && tops[0] === card.top, `${vpName}: the card that was pressed is where it was, to the pixel (${card.top})`, tops)
      const ops = film.map((f) => Number(f.ground ?? 1))
      expect(Math.min(...ops) >= 0.5 && ops.some((o) => o < 0.99) && ops[ops.length - 1] === 1, `${vpName}: a short fade in, never below half (no blank, no flash)`, { min: Math.min(...ops), frames: ops.slice(0, 12).map((o) => o.toFixed(2)) })
      for (const [i, f] of frames.slice(0, 10).entries()) writeFileSync(join(shots, `return-${vpName}-${String(i).padStart(2, "0")}-${f.t}ms.jpg`), Buffer.from(f.data, "base64"))
    }

    /* The guard, directly: a stray scroll with no finger is put back; one the person makes is not. */
    const next = await cardAt(p, 1)
    if (next) {
      await tap(p, vp, next.x, next.y)
      await p.waitForFunction(() => location.pathname.startsWith("/p/"), { timeout: 300000 })
      await p.evaluate(() => window.scrollTo(0, 700))
      await sleep(120)
      const strayY = await p.evaluate(() => Math.round(scrollY))
      expect(strayY === 0, `${vpName}: a scroll nobody made, in the page's first moments, is put back to 0`, strayY)
      /* Still inside the guard's second: the person's own wheel or finger ends it at once. */
      await p.evaluate(() => { window.dispatchEvent(new WheelEvent("wheel")); window.scrollTo(0, 700) })
      await sleep(300)
      const ownY = await p.evaluate(() => Math.round(scrollY))
      expect(ownY === 700, `${vpName}: a scroll the person starts is never pulled back`, ownY)
    }
    await close(p)
  }

  if (part("avatar")) {
    console.log("\nAVATAR: the phone header's photo")
    const p = await open(PHONE, "/explore", { signedIn: true })
    await p.waitForSelector("[data-phone-header-avatar] [data-app-avatar]", { timeout: 60000 }).catch(() => {})
    const a = await p.evaluate(() => {
      const el = document.querySelector("[data-phone-header-avatar] [data-app-avatar]")
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), shadow: getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/).map((l) => l.trim()).filter((l) => !/^rgba\(0, 0, 0, 0\)/.test(l)).join(", "), border: getComputedStyle(el).borderTopWidth, rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
    })
    expect(!!a && a.w === 34 && a.h === 34, "390: the photo is 34px (it was 32)", a && `${a.w}x${a.h}`)
    expect(!!a && / 0px 0px 0px 1px$/.test(a.shadow.split(/,(?![^(]*\))/)[0].trim()) && /0px 1px 2px 0px/.test(a.shadow), "390: a hairline ring and a 1px soft shadow", a && a.shadow)
    if (a) {
      const file = join(shots, "avatar-390.png")
      await p.screenshot({ path: file })
      await sharp(file).extract({ left: Math.round((a.rect.x - 60) * 2), top: 0, width: Math.round((a.rect.w + 72) * 2), height: Math.round((a.rect.y + a.rect.h + 14) * 2) }).resize({ width: Math.round((a.rect.w + 72) * 6) }).png().toFile(join(shots, "avatar-390-crop.png"))
    }
    await close(p)
  }

  if (part("search")) console.log("\nSEARCH: /explore/search, the field's shadow")
  for (const [vpName, vp] of part("search") ? [["390", PHONE], ["1440", DESK]] : []) {
    for (const layer of [false, true]) {
      const p = await open(vp, "/explore/search")
      if (layer) await p.addStyleTag({ content: "[data-search-screen] > div.overflow-y-auto{isolation:isolate;will-change:opacity}" })
      await sleep(300)
      const m = await p.evaluate(() => {
        const f = document.querySelector("[data-search-screen-field]")
        if (!f) return null
        f.blur()
        const r = f.getBoundingClientRect()
        const top = document.querySelector("[data-search-top]")
        return { x: r.left, y: r.top, w: r.width, h: r.height, z: top ? getComputedStyle(top).zIndex : null }
      })
      expect(!!m, `${vpName}${layer ? " (rows as a layer)" : ""}: the field`, m ? undefined : "missing")
      if (!m) { await close(p); continue }
      await sleep(400)
      const file = join(shots, `search-${vpName}${layer ? "-layer" : ""}.png`)
      await p.screenshot({ path: file })
      /* The column under the field's middle, 1 to 24px below its foot: the shadow is a smooth fade to white, with no step to white before it ends. */
      const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
      const col = Math.round((m.x + m.w / 2) * 2)
      const lum = []
      for (let d = 1; d <= 24; d++) {
        const row = Math.round((m.y + m.h + d) * 2)
        const i = (row * info.width + col) * info.channels
        lum.push(Math.round((data[i] + data[i + 1] + data[i + 2]) / 3))
      }
      const firstWhite = lum.findIndex((v) => v >= 254)
      const steps = lum.slice(1).map((v, i) => v - lum[i])
      expect(firstWhite >= 15 && Math.max(...steps) <= 4, `${vpName}${layer ? " (rows as a layer)" : ""}: the shadow fades out whole (reaches ${firstWhite + 1}px, largest step ${Math.max(...steps)})`, lum.join(" "))
      await sharp(file).extract({ left: Math.round(m.x * 2) - 24, top: Math.round(m.y * 2) - 24, width: Math.round(m.w * 2) + 48, height: Math.round(m.h * 2) + 96 }).png().toFile(join(shots, `search-field-${vpName}${layer ? "-layer" : ""}.png`))
      await close(p)
    }
  }
}

/* Last, so every constant above is defined before it runs. */
if (process.argv[2] === "serve-stub") {
  const stub = await serveSupabaseStub({ port: 54399, tables: tables(), user: ME })
  /* The stand in answers only its own token, so the probe signs in with the cookie it hands out. */
  writeFileSync(SESSION_FILE, JSON.stringify(stub.sessionCookie()))
  console.log("Supabase stand in on http://127.0.0.1:54399")
  setInterval(() => {}, 1 << 30)
} else {
  await main()
}
