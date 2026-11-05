/**
 * ===========================================================================
 *  ROUND 31: THE PRODUCT PAGE FROM EXPLORE, IN THE DARK LOOK, LOOKED AT
 * ===========================================================================
 * The owner: "in dark mode, opening a product from Explore lands on a white
 * product page and a white header; the sticky add to cart bar, the add to
 * wishlist button and the select an option selector are not adapted at all".
 *
 * The page is the real route (/<handle>/<slug>?layout=discover&recommended=1,
 * app/(storelib)/(marketing)/p/[slug]/page.tsx through its layout) with each store config
 * a creator really has (scripts/render-product-page-ssr31.tsx CASES):
 *
 *   SSR   rendered to HTML on the server, with the <head> boot as the root
 *         layout prints it: the first paint. Which look the page says it has
 *         (data-product-look="site" or data-own-look), whether <html> is dark,
 *         the page's ground, and in the dark look every element still light
 *         or dark ink on the dark ground (scripts/check-dark-pages.mjs
 *         lightPatches), over the whole page.
 *   LIVE  the same page mounted in a browser under the real light buyer header
 *         and the real look painter, so the client parts run: the buy card
 *         settles, the option rows and the physical options appear, the option
 *         rows are pressed, the wishlist button is hovered and pressed, the
 *         sticky buy bar comes up, a question is opened, the bar's More menu
 *         and the Share menu are opened. Light patches after each.
 *
 * At 390 and 1440, light and dark. With SHOTS_DIR every state is kept as a
 * picture; with BASELINE_DIR (the same run's SHOTS_DIR from the code before
 * the change) every light picture is compared pixel for pixel.
 *
 *   PROBE_CSS=source node scripts/check-product-dark-round31.mjs [ssr live]
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

/* PROBE_ROOT: the tree to draw (a copy of the code from before a change, for BASELINE_DIR pictures); this one by default. */
const root = process.env.PROBE_ROOT || process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".product31-probe")
const shots = process.env.SHOTS_DIR || null
const baseline = process.env.BASELINE_DIR || null
if (shots) mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const PATH = "/mara/glaze-notes?layout=discover&recommended=1"
const lumOf = (rgb) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(rgb || "")
  if (m) return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255
  /* The design system's tokens compute as oklch(L C H): L is near enough the lightness for light or dark. */
  const o = /oklch\(([\d.]+)/.exec(rgb || "")
  return o ? Number(o[1]) : null
}
/* Pictures held still: no animation or transition mid way when a picture is taken, so two runs compare. */
const STILL = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}`

/*
  Every element on screen (or under `scope`) whose own background or border is light while the page is dark, and dark
  ink or icons on the dark ground: scripts/check-dark-pages.mjs lightPatches, the same rules. `skipOwn` leaves a
  creator's own look out (it keeps its colours on purpose). `viewport` only what is in the window.
*/
const lightPatchesOf = (p, { scope = "body", skipOwn = false, viewport = false } = {}) =>
  p.evaluate(
    ({ scope, skipOwn, viewport }) => {
      const out = []
      const parse = (rgb) => {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(rgb || "")
        if (!m) return null
        return { l: (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255, a: m[4] === undefined ? 1 : Number(m[4]) }
      }
      const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 90)}`
      const KEEP = "img, video, picture, canvas, [data-community-mark], [data-keep-bright], [data-storelib-mark], [data-soft-img], iframe"
      const roots = [...document.querySelectorAll(scope)]
      for (const r of roots)
        for (const el of [r, ...r.querySelectorAll("*")]) {
          if (el.closest(KEEP)) continue
          if (skipOwn && el.closest("[data-own-look]")) continue
          const b = el.getBoundingClientRect()
          if (b.width === 0 || b.height === 0) continue
          if (viewport && (b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth)) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || cs.display === "none") continue
          let hiddenUp = false
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const s = getComputedStyle(a)
            if (Number(s.opacity) === 0 || s.visibility === "hidden") {
              hiddenUp = true
              break
            }
          }
          if (hiddenUp) continue
          if (el instanceof SVGElement) {
            if (el.tagName.toLowerCase() === "svg" || b.width < 6) continue
            const fill = cs.fill === "none" ? null : parse(cs.fill)
            const stroke = cs.stroke === "none" ? null : parse(cs.stroke)
            const dark = (c) => c && c.a > 0.5 && c.l < 0.22
            const owner = el.closest("svg")
            const ob = owner ? getComputedStyle(owner) : null
            if ((dark(stroke) && parseFloat(cs.strokeWidth) > 0) || (dark(fill) && cs.fillOpacity !== "0")) {
              if (ob && Number(ob.opacity) > 0.1) out.push({ what: "dark icon", el: name(owner || el), fill: cs.fill, stroke: cs.stroke })
            }
            continue
          }
          if (b.width >= 14 && b.height >= 14) {
            const bg = parse(cs.backgroundColor)
            if (bg && bg.a > 0.35 && bg.l > 0.55) out.push({ what: "light background", el: name(el), bg: cs.backgroundColor })
            for (const side of ["Top", "Right", "Bottom", "Left"]) {
              const w = parseFloat(cs[`border${side}Width`])
              const c = parse(cs[`border${side}Color`])
              if (w >= 1 && c && c.a > 0.3 && c.l > 0.45) {
                out.push({ what: `light border ${side}`, el: name(el), color: cs[`border${side}Color`] })
                break
              }
            }
          }
          const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
          const ink = parse(cs.color)
          if (ownText && ink && ink.a > 0.5 && ink.l < 0.3) {
            let ground = null
            for (let a = el; a; a = a.parentElement) {
              const g = parse(getComputedStyle(a).backgroundColor)
              if (g && g.a > 0.5) {
                ground = g
                break
              }
            }
            if (!ground || ground.l < 0.5) out.push({ what: "dark text", el: name(el), color: cs.color, text: el.textContent.trim().slice(0, 40) })
          }
        }
      const seen = new Set()
      return out.filter((o) => {
        const k = `${o.what}|${o.el}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      }).slice(0, 30)
    },
    { scope, skipOwn, viewport },
  )

/* Light pictures against the same pictures from before the change: how many pixels moved, and by how much at most. */
const diffs = []
async function compareLight(file) {
  if (!baseline || !shots) return
  const before = join(baseline, file)
  if (!existsSync(before)) {
    diffs.push({ file, missing: true })
    return
  }
  const a = await sharp(before).raw().toBuffer({ resolveWithObject: true })
  const b = await sharp(join(shots, file)).raw().toBuffer({ resolveWithObject: true })
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    diffs.push({ file, size: [`${a.info.width}x${a.info.height}`, `${b.info.width}x${b.info.height}`] })
    return
  }
  let moved = 0
  let max = 0
  for (let i = 0; i < a.data.length; i += a.info.channels) {
    let d = 0
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c] - b.data[i + c]))
    if (d > 2) moved++
    if (d > max) max = d
  }
  diffs.push({ file, moved, max, pixels: a.info.width * a.info.height })
}

const pic = (bg, fg) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900"><rect width="1200" height="900" fill="${bg}"/><ellipse cx="600" cy="560" rx="300" ry="190" fill="${fg}"/></svg>`)}`
const FIX = {
  product: { id: "p-1", slug: "glaze-notes", title: "Glaze notes for cone 6", description: "<p>Forty tested recipes with photos of each on two clay bodies, and the firing schedule that made them.</p>", price_cents: 2400, compare_at_cents: 3200, currency: "usd", status: "published", creator_id: "cr-1", thumbnail_url: pic("#d9cbb6", "#a9845c"), images: [pic("#d9cbb6", "#a9845c"), pic("#cfdbd5", "#6f8f7f")], category: "design", product_categories: [{ category: { id: "c-1", name: "Design", slug: "design", type: "digital" } }], whats_included: ["40 recipes", "Firing schedule"], faqs: [], reviews_count: 2, reviews_average: 4.5, refund_policy_enabled: true, refund_policy_type: "14_days", created_at: "2026-09-01T10:00:00.000Z" },
  creator: { id: "cr-1", user_id: "u-1", name: "Mara Lindqvist", slug: "mara", username: "mara" },
  profile: { id: "u-1", display_name: "Mara Lindqvist", username: "mara", avatar_url: pic("#e8d5c4", "#8a5a3c") },
}
const PHYSICAL = {
  product: { id: "p-1", creatorId: "cr-1", title: "Glaze notes for cone 6", slug: "glaze-notes", imageUrl: null },
  delivery: { lines: ["Ships in 2 to 4 days"] },
  options: [{ name: "Size", values: ["Small", "Large"] }, { name: "Glaze", values: ["Celadon", "Tenmoku"] }],
  variants: [
    { id: "pv-1", name: "Small / Celadon", options: ["Small", "Celadon"], priceCents: 2400, compareAtCents: null, imageUrl: null, soldOut: false, left: null, maxQuantity: 5 },
    { id: "pv-2", name: "Small / Tenmoku", options: ["Small", "Tenmoku"], priceCents: 2400, compareAtCents: null, imageUrl: null, soldOut: false, left: 3, maxQuantity: 3 },
    { id: "pv-3", name: "Large / Celadon", options: ["Large", "Celadon"], priceCents: 3200, compareAtCents: null, imageUrl: null, soldOut: true, left: null, maxQuantity: 0 },
    { id: "pv-4", name: "Large / Tenmoku", options: ["Large", "Tenmoku"], priceCents: 3200, compareAtCents: null, imageUrl: null, soldOut: false, left: null, maxQuantity: 5 },
  ],
}

/* Which look each case says it has: Storelib's own (follows the person) or the creator's. */
const SITE = ["default", "template", "published", "variants", "physical", "variantsplain", "physicalplain"]
const OWN = ["custom", "owncolour"]

try {
  const stubFiles = {
    "data.js": `const F = () => globalThis.__productFixture || { config: null }
const FIX = ${JSON.stringify(FIX)}
export const loadProductBySlug = async () => ({ product: { ...FIX.product, type: F().type || "digital" }, viaHistory: false })
export const loadCreator = async () => FIX.creator
export const loadCreatorProfile = async () => FIX.profile
export const loadStoreConfig = async (_c, pageType) => (pageType === "product" && F().config ? { published_config: F().config } : null)
export const loadProductPageConfig = async () => null
`,
    "cache.js": `const pic = ${JSON.stringify(FIX.product.images[1])}
const F = () => globalThis.__productFixture || { config: null }
export const PRODUCT_CACHE_TTL = 60
export const productTag = (s) => "product:" + s
export const creatorTag = (c) => "creator:" + c
export const PRODUCT_SELECT = "*"
export const VARIANT_SELECT = "*"
export const cachedProductBySlug = async () => null
export const cachedCreator = async () => null
export const cachedCreatorProfile = async () => null
export const cachedStoreConfig = async () => null
export const cachedProductPageConfig = async () => null
export const cachedVariants = async () => F().variants || []
export const cachedProductAssets = async () => [{ id: "a-1", file_name: "glaze-notes.pdf" }]
export const cachedCourseOutline = async () => null
export const cachedMoreFromCreator = async () => [1, 2, 3].map((i) => ({ id: "m-" + i, slug: "more-" + i, title: ["Trimming guide", "Kiln log sheet", "Wax resist basics"][i - 1], price_cents: 900 * i, compare_at_cents: null, type: "digital", thumbnail_url: pic, images: [pic], creator_id: "cr-1", status: "published" }))
export const cachedReviews = async () => [{ id: "r-1", product_id: "p-1", rating: 5, content: "The photos on two clay bodies saved me a month of test tiles.", created_at: "2026-09-12T10:00:00.000Z", reviewer_name: "Jonas", buyer: { id: "u-2", display_name: "Jonas Berg", avatar_url: null } }, { id: "r-2", product_id: "p-1", rating: 4, content: "Clear and tested. The schedule worked in my small kiln.", created_at: "2026-09-20T10:00:00.000Z", reviewer_name: "Priya", buyer: { id: "u-3", display_name: "Priya Raman", avatar_url: null } }]
`,
    "supabase.js": `const result = { data: null, error: null, count: 0 }
function q() { const b = new Proxy(function () {}, { get(_, k) { if (k === "then") return (res) => res({ data: [], error: null, count: 0 }); if (k === "maybeSingle" || k === "single") return async () => result; return () => b }, apply() { return b } }); return b }
const client = { from: () => q(), rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null }, error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) }, channel() { const ch = { on() { return ch }, subscribe() { return ch } }; return ch }, removeChannel() {} }
export async function createClient() { return client }
export function createAdminClient() { return client }
export function createPublicReadClient() { return client }
export function createServiceClient() { return client }
export default client
`,
    "supabase-client.js": `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: { id: "u-me", email: "sam@example.com", user_metadata: {} } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }; return q },
  }
}
export const isNativePlatform = () => false
`,
    "auth.js": `export const currentUserForRequest = async () => ({ user: null })
export const profileForRequest = async () => null
export const creatorForRequest = async () => null
export const sellerAccessForRequest = async () => null
`,
    "headers.js": `export async function headers() { return new Headers({ host: "storelib.com" }) }
export async function cookies() { return { get: () => undefined, getAll: () => [], has: () => false } }
export async function draftMode() { return { isEnabled: false } }
`,
    "cache-next.js": `export const unstable_cache = (fn) => fn
export const revalidateTag = () => {}
export const revalidatePath = () => {}
export const unstable_noStore = () => {}
`,
    "navigation-server.js": `export const notFound = () => { throw new Error("notFound") }
export const redirect = (u) => { throw new Error("redirect " + u) }
export const permanentRedirect = (u) => { throw new Error("permanentRedirect " + u) }
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => "/mara/glaze-notes"
export const useSearchParams = () => new URLSearchParams("layout=discover&recommended=1")
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const useSelectedLayoutSegments = () => []
`,
    "navigation-browser.js": `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const useSelectedLayoutSegments = () => []
export const notFound = () => { throw new Error("notFound") }
export const redirect = (u) => { throw new Error("redirect " + u) }
export const permanentRedirect = (u) => { throw new Error("permanentRedirect " + u) }
`,
    "link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (globalThis.__router ||= []).push(["link", href]) } } }, children) })
`,
    "image.jsx": `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`,
    "empty.js": "export {}\n",
    /* Node's own modules, which the server half of the page reaches (web push, the mailer) and a browser has none of: never called while the page draws. */
    "builtin.cjs": "const f = function () { return p }\nconst p = new Proxy(f, { get: () => p, apply: () => p, construct: () => p })\nmodule.exports = p\n",
  }
  for (const [f, src] of Object.entries(stubFiles)) writeFileSync(join(stubs, f), src)
  const STUB = {
    "lib/commerce/product-page-data": "data.js",
    "lib/commerce/product-page-cache": "cache.js",
    "lib/supabase/server": "supabase.js",
    "lib/supabase/admin": "supabase.js",
    "lib/supabase/public-read": "supabase.js",
    "lib/auth/request-scope": "auth.js",
  }
  const dataStubs = (extra = {}) => ({
    name: "data-stubs",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => {
        for (const [k, f] of Object.entries({ ...STUB, ...extra })) if (a.path.endsWith(k) || a.path === `@/${k}`) return { path: join(stubs, f) }
        return undefined
      })
    },
  })
  const { build } = await import("esbuild")
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder"

  /* The boots as lib/appearance prints them in the root layout's <head>. */
  await build({ entryPoints: [join(root, "lib/appearance/site-appearance.ts")], bundle: true, format: "esm", platform: "neutral", outfile: join(stubs, "boots.mjs"), logLevel: "error" })
  const { APPEARANCE_BOOT } = await import(join(stubs, "boots.mjs"))
  const head = (look) =>
    `<script>${look === "dark" ? `localStorage.setItem("storelib:appearance","dark");` : `localStorage.removeItem("storelib:appearance");`}</script><script>${APPEARANCE_BOOT}</script><style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}${STILL}</style>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const answer = (r, html) => {
    const url = r.url()
    if (url.startsWith("data:")) return r.continue()
    if (!url.startsWith(ORIGIN)) return r.respond({ status: 204, body: "" })
    const path = url.slice(ORIGIN.length)
    const json = (body) => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    if (path.startsWith("/api/wishlist/check")) return json({ isWishlisted: false, isLoggedIn: true })
    if (path.startsWith("/api/wishlist")) return json({ success: true, count: 1 })
    if (path.startsWith("/api/physical/storefront/product")) return json(PHYSICAL)
    if (path.startsWith("/api/offers/bundles")) return json({ bundles: [] })
    if (path.startsWith("/api/account/appearance")) return json({ appearance: null })
    /* What the header asks for (scripts/check-transitions-round30.mjs answers the same). */
    if (path.startsWith("/api/notifications")) return json({ unread: 0, items: [], nextCursor: null, available: true })
    if (path.includes("/dms")) return json({ ready: true, unread: 0, conversations: [] })
    if (path.startsWith("/api/me/places")) return json({ signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: [] })
    if (path.startsWith("/api/")) return json({})
    return r.respond({ status: 200, contentType: "text/html", body: html })
  }
  const shoot = async (p, file, light, full = false) => {
    if (!shots) return
    await p.screenshot({ path: join(shots, file), fullPage: full })
    if (light) await compareLight(file)
  }

  /* ── SSR: the first paint ────────────────────────────────────────────────── */
  if (want("SSR")) {
    await build({
      entryPoints: [join(root, "scripts/render-product-page-ssr31.tsx")],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2022",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/headers": "./.product31-probe/headers.js", "next/cache": "./.product31-probe/cache-next.js", "next/navigation": "./.product31-probe/navigation-server.js", "next/link": "./.product31-probe/link.jsx", "next/image": "./.product31-probe/image.jsx", "server-only": "./.product31-probe/empty.js" },
      plugins: [dataStubs()],
      banner: { js: "import { createRequire as __cr } from 'module'; import { fileURLToPath as __fu } from 'url'; import { dirname as __dn } from 'path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
      loader: { ".css": "empty", ".png": "empty", ".svg": "empty" },
      outfile: join(stubs, "product.mjs"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const { renderProduct } = await import(join(stubs, "product.mjs"))
    for (const which of [...SITE, ...OWN]) {
      let markup = ""
      try {
        markup = await renderProduct(which)
      } catch (e) {
        expect(false, `ssr ${which}: the page renders`, String(e?.stack || e).split("\n").slice(0, 6).join(" | "))
        continue
      }
      const ownLook = /data-own-look=""/.test(markup)
      const site = /data-product-look="site"/.test(markup)
      console.log(`\nSSR ${which}: ${markup.length} characters; own look ${ownLook}, Storelib's look ${site}`)
      if (SITE.includes(which)) expect(site && !ownLook, `ssr ${which}: Storelib's own look, which follows the person's (data-product-look="site", no data-own-look)`)
      else expect(ownLook && !site, `ssr ${which}: the creator's own look is kept (data-own-look)`)
      expect(!/removeAttribute\("data-sl-dark"\)/.test(markup), `ssr ${which}: nothing in the page takes the dark look off the document`)
      const grounds = {}
      for (const vp of [PHONE, DESK]) {
        for (const look of ["light", "dark"]) {
          const p = await browser.newPage()
          await p.setViewport(vp)
          p.setDefaultTimeout(120_000)
          const errors = []
          p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
          const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head(look)}</head><body>${markup}</body></html>`
          await p.setRequestInterception(true)
          p.on("request", (r) => answer(r, html))
          await p.goto(`${ORIGIN}${PATH}`, { waitUntil: "load" })
          await sleep(300)
          const state = await p.evaluate(() => ({ dark: document.documentElement.hasAttribute("data-sl-dark"), ground: getComputedStyle(document.querySelector("[data-product-look], [data-own-look]") || document.body).backgroundColor }))
          const label = `ssr ${which} ${look} ${vp.width}`
          grounds[`${look}${vp.width}`] = state.ground
          expect(state.dark === (look === "dark"), `${label}: <html> is in the person's ${look} look`, state.dark)
          if (look === "dark") {
            if (SITE.includes(which)) {
              const patches = await lightPatchesOf(p)
              expect(patches.length === 0, `${label}: nothing left light, and no dark ink or icon on the dark ground`, patches)
              expect(lumOf(state.ground) < 0.12, `${label}: the page's ground is the dark one`, state.ground)
            } else {
              expect(state.ground === grounds[`light${vp.width}`], `${label}: the creator's ground is the one it has in the light look`, [state.ground, grounds[`light${vp.width}`]])
              const inside = await p.evaluate(() => {
                const own = document.querySelector("[data-own-look]")
                const t = own?.querySelector("h1, h2")
                return t ? getComputedStyle(t).color : null
              })
              const insideLight = grounds[`ink${vp.width}`]
              expect(!insideLight || inside === insideLight, `${label}: the creator's type is the colour it has in the light look`, [inside, insideLight])
            }
          } else if (OWN.includes(which)) {
            grounds[`ink${vp.width}`] = await p.evaluate(() => {
              const t = document.querySelector("[data-own-look]")?.querySelector("h1, h2")
              return t ? getComputedStyle(t).color : null
            })
          }
          expect(errors.length === 0, `${label}: no page errors`, errors.slice(0, 2))
          await shoot(p, `ssr-${which}-${look}-${vp.width}.png`, look === "light", true)
          await p.close()
        }
      }
    }
  }

  /* ── LIVE: the client parts, pressed ─────────────────────────────────────── */
  if (want("LIVE")) {
    await build({
      entryPoints: [join(root, "scripts/render-product-page-live31.tsx")],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/headers": "./.product31-probe/headers.js", "next/cache": "./.product31-probe/cache-next.js", "next/navigation": "./.product31-probe/navigation-browser.js", "next/link": "./.product31-probe/link.jsx", "next/image": "./.product31-probe/image.jsx", "server-only": "./.product31-probe/empty.js" },
      plugins: [
        dataStubs({ "lib/supabase/client": "supabase-client.js" }),
        { name: "node-builtins", setup(b) { b.onResolve({ filter: /^(node:)?(crypto|util|url|https?|fs|path|net|tls|assert|stream|buffer|zlib|os|events|child_process|dns|querystring|string_decoder|worker_threads|async_hooks|perf_hooks|http2|punycode|process|timers|vm|readline|v8|module)(\/.*)?$/ }, () => ({ path: join(stubs, "builtin.cjs") })) } },
      ],
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},cwd:function(){return '/'},platform:'browser',versions:{},nextTick:function(f){Promise.resolve().then(f)}};var __dirname='/';var __filename='/x.js';var global=globalThis;" },
      loader: { ".css": "empty", ".png": "empty", ".svg": "empty" },
      outfile: join(stubs, "live.js"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const liveJs = readFileSync(join(stubs, "live.js"), "utf8")
    /* One element's own colours, to say what a state looks like in numbers. */
    const coloursOf = (p, sel) =>
      p.evaluate((sel) => {
        const el = typeof sel === "string" ? document.querySelector(sel) : null
        if (!el) return null
        const cs = getComputedStyle(el)
        return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor }
      }, sel)
    const mark = (p, find, attr) =>
      p.evaluate(
        ({ find, attr }) => {
          const els = [...document.querySelectorAll(find.sel)].filter((e) => (!find.text || e.textContent.includes(find.text)) && e.getBoundingClientRect().width > 0)
          const el = els[find.index ?? 0]
          if (!el) return false
          el.setAttribute(attr, "")
          el.scrollIntoView({ block: "center" })
          return true
        },
        { find, attr },
      )
    const centre = (p, sel) =>
      p.evaluate((sel) => {
        const b = document.querySelector(sel)?.getBoundingClientRect()
        return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null
      }, sel)

    for (const which of (process.env.CASES || "published,variants,physical,variantsplain,physicalplain,template,default,custom").split(",")) {
      for (const vp of [PHONE, DESK]) {
        const lightInk = {}
        for (const look of ["light", "dark"]) {
          const label = `live ${which} ${look} ${vp.width}`
          console.log(`\n${label.toUpperCase()}`)
          const p = await browser.newPage()
          await p.setViewport(vp)
          p.setDefaultTimeout(120_000)
          const errors = []
          p.on("pageerror", (e) => errors.push(String(e?.stack || e).slice(0, 600)))
          const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head(look)}</head><body><div id="app"></div><script>${liveJs.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
          await p.setRequestInterception(true)
          p.on("request", (r) => answer(r, html))
          await p.goto(`${ORIGIN}${PATH}`, { waitUntil: "load" })
          if (!(await p.evaluate(() => typeof window.__mount === "function"))) {
            expect(false, `${label}: the page's script loads`, errors.slice(0, 3))
            await p.close()
            continue
          }
          await p.evaluate((w) => window.__mount(w), which)
          await sleep(1200)
          const dark = look === "dark"
          const site = SITE.includes(which)
          const pass = async (state, opts = {}) => {
            if (!dark) return
            const patches = await lightPatchesOf(p, { skipOwn: !site, ...opts })
            expect(patches.length === 0, `${label} ${state}: nothing light, no dark ink on the dark ground${site ? "" : " (outside the creator's own look)"}`, patches)
          }
          const st = await p.evaluate(() => ({
            dark: document.documentElement.hasAttribute("data-sl-dark"),
            header: getComputedStyle(document.querySelector("#platform-header-root") || document.body).backgroundColor,
            ground: getComputedStyle(document.querySelector("[data-product-look], [data-own-look]") || document.body).backgroundColor,
            ownH1: (() => {
              const t = document.querySelector("[data-own-look] h1")
              return t ? getComputedStyle(t).color : null
            })(),
          }))
          console.log(`  header ${st.header}, page ground ${st.ground}`)
          expect(st.dark === dark, `${label}: <html> is in the person's ${look} look, after the painter ran`, st.dark)
          expect(dark ? lumOf(st.header) < 0.15 : lumOf(st.header) > 0.9, `${label}: the Storelib header is in the person's look`, st.header)
          if (site) expect(dark ? lumOf(st.ground) < 0.12 : lumOf(st.ground) > 0.9, `${label}: the page's ground is in the person's look`, st.ground)
          else if (!dark) lightInk.ground = st.ground, lightInk.h1 = st.ownH1
          else expect(st.ground === lightInk.ground && st.ownH1 === lightInk.h1, `${label}: the creator's page keeps the colours it has in the light look`, [st.ground, st.ownH1, lightInk])
          await pass("settled, whole page")
          await pass("the header", { scope: "#platform-header-root" })
          await shoot(p, `live-${which}-settled-${look}-${vp.width}.png`, !dark, true)

          /* The option rows of a download with options: pressed, and the chosen one. */
          if (which.startsWith("variants")) {
            const ok = await mark(p, { sel: "button", text: "Studio licence" }, "data-probe-variant")
            expect(ok, `${label}: the option rows are drawn`)
            if (ok) {
              const at = await centre(p, "[data-probe-variant]")
              await p.mouse.move(at.x, at.y)
              await p.mouse.down()
              await sleep(60)
              await pass("an option row pressed", { viewport: true })
              await p.mouse.up()
              await sleep(250)
              const chosen = await coloursOf(p, "[data-probe-variant]")
              console.log(`  the chosen row: ${JSON.stringify(chosen)}`)
              if (dark) expect(lumOf(chosen.border) > 0.3, `${label}: the chosen row's ring is the buy button's colour, seen on the dark card`, chosen)
              await pass("an option chosen", { viewport: true })
              await shoot(p, `live-${which}-option-${look}-${vp.width}.png`, !dark)
            }
          }
          /* A product that ships: its options, quantity, Add to cart and Buy now. */
          if (which.startsWith("physical")) {
            const ok = await mark(p, { sel: "[data-physical-buy-box] button", text: "Tenmoku" }, "data-probe-chip")
            expect(ok, `${label}: the options of a product that ships are drawn`)
            if (ok) {
              await p.click("[data-probe-chip]")
              await sleep(200)
              await pass("an option chosen", { viewport: true })
              const buy = await p.evaluate(() => {
                const box = [...document.querySelectorAll("[data-physical-buy-box]")].find((b) => b.getBoundingClientRect().width > 0)
                const btns = [...(box?.querySelectorAll("button") || [])]
                const add = btns.find((b) => b.textContent.includes("Add to cart"))
                const now = btns.find((b) => b.textContent.includes("Buy now"))
                const c = (el) => (el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, border: getComputedStyle(el).borderTopColor } : null)
                return { add: c(add), now: c(now) }
              })
              console.log(`  Add to cart ${JSON.stringify(buy.add)}, Buy now ${JSON.stringify(buy.now)}`)
              if (dark) expect(buy.add && lumOf(buy.add.color) > 0.3 && buy.now && lumOf(buy.now.bg) < 0.5 && lumOf(buy.now.color) > 0.8, `${label}: Add to cart's words and edge are seen on the dark card, Buy now is a filled button with white words`, buy)
              await shoot(p, `live-${which}-options-${look}-${vp.width}.png`, !dark)
            }
          }
          /* The wishlist button: at rest, hovered, pressed, and once it is in the wishlist. */
          if (!which.startsWith("physical")) {
            const ok = await mark(p, { sel: "button", text: "Add to wishlist" }, "data-probe-wish")
            expect(ok, `${label}: the wishlist button is drawn`)
            if (ok) {
              await sleep(150)
              const rest = await coloursOf(p, "[data-probe-wish]")
              const at = await centre(p, "[data-probe-wish]")
              await p.mouse.move(at.x, at.y)
              await sleep(200)
              const hover = await coloursOf(p, "[data-probe-wish]")
              await pass("the wishlist button hovered", { scope: "[data-probe-wish]" })
              await shoot(p, `live-${which}-wish-hover-${look}-${vp.width}.png`, !dark)
              await p.mouse.down()
              await sleep(60)
              const pressed = await coloursOf(p, "[data-probe-wish]")
              await pass("the wishlist button pressed", { scope: "[data-probe-wish]" })
              await p.mouse.up()
              await sleep(400)
              console.log(`  wishlist at rest ${JSON.stringify(rest)}, hovered ${JSON.stringify(hover)}, pressed ${JSON.stringify(pressed)}`)
              if (dark && site) expect(lumOf(rest.bg) < 0.15 && lumOf(rest.color) > 0.6, `${label}: the wishlist button is a dark surface with light words`, rest)
              await pass("in the wishlist", { viewport: true })
              await shoot(p, `live-${which}-wish-added-${look}-${vp.width}.png`, !dark)
            }
          }
          /* A question opened. */
          {
            const ok = await mark(p, { sel: "[data-faq-section] button", text: "refund" }, "data-probe-faq")
            if (ok) {
              await p.click("[data-probe-faq]")
              await sleep(300)
              await pass("a question opened", { viewport: true })
            }
          }
          /* The sticky buy bar, brought up by scrolling to the description. */
          {
            await p.evaluate(() => {
              const d = document.querySelector("[data-description-section]")
              const top = d ? d.getBoundingClientRect().top + scrollY : 900
              scrollTo(0, top - 80)
            })
            await sleep(700)
            const bar = await p.evaluate(() => {
              const el = [...document.querySelectorAll("div.fixed.bottom-0")].find((b) => b.className.includes("border-t") && Number(getComputedStyle(b).opacity) > 0.9)
              if (!el) return null
              el.setAttribute("data-probe-bar", "")
              const cs = getComputedStyle(el)
              return { bg: cs.backgroundColor, border: cs.borderTopColor }
            })
            console.log(`  sticky bar ${JSON.stringify(bar)}`)
            expect(!!bar, `${label}: the sticky buy bar comes up`)
            if (bar) {
              if (dark && site) expect(lumOf(bar.bg) < 0.15, `${label}: the sticky buy bar is a dark surface`, bar)
              await pass("the sticky buy bar", { scope: "[data-probe-bar]" })
              await shoot(p, `live-${which}-sticky-${look}-${vp.width}.png`, !dark)
            }
          }
          /* The bar's More menu on a phone, the Share menu on a computer. */
          {
            await p.evaluate(() => scrollTo(0, 0))
            await sleep(300)
            const sel = vp.width < 1024 ? 'button[aria-label="More"]' : 'button[aria-label="Share"]'
            const ok = await mark(p, { sel }, "data-probe-menu")
            if (ok) {
              await p.click("[data-probe-menu]")
              await sleep(450)
              await pass(vp.width < 1024 ? "the bar's More menu open" : "the Share menu open", { viewport: true })
              await shoot(p, `live-${which}-menu-${look}-${vp.width}.png`, !dark)
              await p.keyboard.press("Escape")
            }
          }
          expect(errors.length === 0, `${label}: no page errors`, errors.slice(0, 2))
          await p.close()
        }
      }
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

if (baseline && shots) {
  console.log(`\nLIGHT LOOK AGAINST BEFORE (${baseline}): pixels moved by more than 2 levels on a channel`)
  for (const d of diffs) console.log(`  ${d.missing ? "no picture from before" : d.size ? `size ${d.size.join(" -> ")}` : `${d.moved} of ${d.pixels} moved, at most ${d.max}`}   ${d.file}`)
  const moved = diffs.filter((d) => !d.missing && (d.size || d.moved > 0))
  expect(moved.length === 0, "the light look is the same picture it was before, every state", moved.map((d) => d.file))
}

console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
