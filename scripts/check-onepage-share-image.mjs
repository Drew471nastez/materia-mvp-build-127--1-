/**
 * ===========================================================================
 *  THE PICTURE A SHARED ONEPAGE LINK SHOWS, CHOSEN IN THE EDITOR, MEASURED
 * ===========================================================================
 * scripts/render-onepage-editor.tsx mounts the real editor, with an https
 * profile photo this probe answers itself; the stub API keeps what the
 * editor saves. At 390 by 844 and 1440 by 900, in Settings, SEO:
 *
 *   DEFAULT     Profile photo is the chosen card; the preview is the square
 *               photo beside the words (a summary card), its address
 *               links/photo.jpg
 *   THE CARDS   three, one row, the same width and height, 44px or taller,
 *               nothing scrolls sideways; the chosen one's mark is shown
 *               (opacity 1) and the others' hidden, faded and scaled
 *   SWITCHING   Share card: the wide card above the words, a large card,
 *               the page unsaved; Custom image: the picker opens, the upload
 *               is written at once with the choice, the crop shows; Profile
 *               photo again: back to the square
 *   SAVE        the row Save sent, handed to the public page's real
 *               generateMetadata: og:image and twitter:card are what the
 *               preview showed
 *   NO PHOTO    a page with no photo: the card shows, and the editor says so
 *
 *   node scripts/check-onepage-share-image.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-share-image.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-share-image-"))
mkdirSync(shots, { recursive: true })
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const PHOTO = "https://x.supabase.co/storage/v1/object/public/avatars/probe/me.jpg"
const UPLOAD = "https://x.supabase.co/storage/v1/object/public/onepage-assets/probe/og.jpg"

/* The pictures the probe answers for x.supabase.co: a portrait for the photo, a wide landscape for the upload. */
const portrait = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#d9c8b4"/><circle cx="240" cy="200" r="92" fill="#8a5a44"/><rect x="104" y="318" width="272" height="200" rx="120" fill="#2f4858"/></svg>`)).jpeg().toBuffer()
const landscape = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f4c28b"/><stop offset="1" stop-color="#d9735a"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1180" cy="330" r="120" fill="#fff3d6"/><path d="M0 700 L420 420 L760 640 L1100 380 L1600 720 L1600 900 L0 900 Z" fill="#3d3a4b"/></svg>`)).png().toBuffer()
const uploadFile = join(shots, "upload-source.png")
writeFileSync(uploadFile, landscape)

/* ── The editor, bundled as scripts/check-onepage-seo.mjs bundles it ── */
const dir = join(root, ".onepage-share-image-probe")
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
/* Storage answers an upload and its public address, so the Custom image upload runs end to end. */
writeFileSync(join(dir, "supabase.js"), `const result = { data: { onboarding_completed: true }, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
const bucket = { upload: async () => ({ data: { path: "probe/og.jpg" }, error: null }), getPublicUrl: () => ({ data: { publicUrl: ${JSON.stringify(UPLOAD)} } }) }
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => bucket }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
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
} catch { rmSync(dir, { recursive: true, force: true }); fail("the editor did not bundle") }

/* ── The public page's generateMetadata, for Node, with its database swapped ── */
const STANDINS = {
  "@/lib/supabase/admin": "export const createAdminClient = () => globalThis.__probeAdmin",
  "@/lib/custom-domains/store": "export const primaryHostFor = async () => null",
  "@/lib/website-builder/site-seo-data": "export const activeDomainOf = async () => null",
  "@/lib/onepage/live-products": "export const withLiveProducts = async (_db, _id, blocks) => blocks",
  "@/components/onepage/public-onepage": "export const PublicOnePage = () => null",
  "next/navigation": "export const notFound = () => {}; export const permanentRedirect = () => {}; export const redirect = () => {}",
  "next/headers": "export const headers = async () => new Map(); export const cookies = async () => ({ getAll: () => [] })",
  "next/cache": "export const unstable_cache = (fn) => fn; export const revalidatePath = () => {}; export const revalidateTag = () => {}; export const unstable_noStore = () => {}",
  "next/server": "export class NextResponse extends Response {}; export const after = () => {}",
  "server-only": "",
}
const metaOut = join(dir, "meta.mjs")
await build({
  entryPoints: [join(root, "scripts/render-onepage-seo-meta.ts")],
  outfile: metaOut, bundle: true, format: "esm", platform: "node", target: "node20", jsx: "automatic", logLevel: "error",
  alias: { "@": root }, packages: "external",
  plugins: [{
    name: "stand-ins",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => (a.path in STANDINS ? { path: a.path, namespace: "standin" } : undefined))
      b.onLoad({ filter: /.*/, namespace: "standin" }, (a) => ({ contents: STANDINS[a.path], loader: "js" }))
    },
  }],
})
const { metadataFor } = await import(pathToFileURL(metaOut).href)

const css = await appCss(root)
const htmlFor = (avatar) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE_AVATAR=${JSON.stringify(avatar)};window.PROBE_THEME=${JSON.stringify({ background_type: "solid", background_color: "#1a2e1a", text_color: "#eef2ec", secondary_text_color: "#b7c4b6", button_color: "#e8d9c4", button_text_color: "#1a2e1a" })}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`

/* What the editor wrote, kept by the stub API as the database would keep it. */
let puts = []
let saved = null
let published = null
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname.startsWith("/onepage-preview") || url.pathname === "/" || url.pathname.startsWith("/app")) {
    res.writeHead(200, { "content-type": "text/html" })
    return res.end(htmlFor(url.searchParams.has("nophoto") ? null : PHOTO))
  }
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" })
    if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
    if (req.url.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ clicks: 0, daily: [] }))
    if (req.url === "/api/onepage/publish" && req.method === "POST") { published = JSON.parse(body); return res.end(JSON.stringify({ success: true, published_at: new Date().toISOString() })) }
    if (req.url === "/api/onepage" && req.method === "PUT") { const b = JSON.parse(body); puts.push(b); if (b.draft_blocks) saved = b; return res.end(JSON.stringify({ onepage: b })) }
    res.end("{}")
  })
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

async function open(vp, query = "") {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("https://x.supabase.co/")) return r.respond({ status: 200, contentType: u.includes("og.jpg") ? "image/png" : "image/jpeg", body: u.includes("og.jpg") ? landscape : portrait })
    if (u.startsWith("http://127.0.0.1") || u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  await p.goto(`${base}/app/onepage${query}#links`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(900)
  return { p, errors }
}
const phoneOf = (vp) => vp.width < 768
async function toSeo(p, phone) {
  if (phone) await p.click('[data-onepage-tabbar] [data-tab="settings"]')
  else await p.click('button[title="Settings"]')
  await sleep(500)
  await p.evaluate(() => [...document.querySelectorAll("[data-tab-panel=settings] button")].find((b) => b.textContent.trim() === "SEO" && b.getClientRects().length)?.click())
  await sleep(400)
}
const read = (p) => p.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left * 10) / 10, y: Math.round(b.top * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }
  const cards = [...document.querySelectorAll("[data-share-choices] [data-choice]")].map((b) => ({
    label: b.getAttribute("data-choice"),
    pressed: b.getAttribute("aria-pressed"),
    mark: Number(getComputedStyle(b.querySelector("[data-choice-mark]")).opacity),
    ...r(b),
  }))
  const card = document.querySelector("[data-og-card]")
  return {
    cards,
    source: document.querySelector("[data-share-preview]")?.getAttribute("data-share-source"),
    imageUrl: card?.getAttribute("data-og-image-url"),
    twitterCard: card?.getAttribute("data-og-twitter-card"),
    photo: r(document.querySelector("[data-og-photo]")),
    wide: r(document.querySelector("[data-og-generated], [data-og-crop]")),
    crop: !!document.querySelector("[data-og-crop]"),
    note: document.querySelector("[data-share-note]")?.textContent.trim(),
    status: document.querySelector("[data-settings-status]")?.textContent.trim(),
    sideScroll: document.documentElement.scrollWidth > innerWidth + 1,
    photoLoaded: [...document.querySelectorAll("[data-og-photo] img, [data-share-thumb=profile] img")].every((i) => i.complete && i.naturalWidth > 0),
  }
})
const pick = async (p, label) => {
  await p.evaluate((label) => document.querySelector(`[data-share-choices] [data-choice="${label}"]`)?.click(), label)
  await sleep(350)
}
async function shot(p, name) {
  const box = await p.evaluate(() => {
    const el = document.querySelector("[data-share-preview]")
    el.scrollIntoView({ block: "start" })
    return null
  })
  await sleep(200)
  await p.screenshot({ path: join(shots, `${name}.png`), fullPage: false })
  return box
}

for (const [label, vp] of [
  ["390x844", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["1440x900", { width: 1440, height: 900 }],
]) {
  const phone = phoneOf(vp)
  console.log(`\n── the share picture, ${label} ──`)
  puts = []
  saved = null
  published = null
  const { p, errors } = await open(vp)
  await toSeo(p, phone)
  let s = await read(p)
  console.log(`  cards: ${s.cards.map((c) => `${c.label} ${c.w}x${c.h} @${c.x},${c.y}`).join(", ")}`)
  expect(s.cards.map((c) => c.label).join() === "Profile photo,Share card,Custom image", "three cards, the photo first", s.cards.map((c) => c.label))
  expect(s.cards[0]?.pressed === "true" && s.cards.slice(1).every((c) => c.pressed === "false"), "Profile photo is chosen by default", s.cards.map((c) => c.pressed))
  expect(s.cards[0]?.mark === 1 && s.cards.slice(1).every((c) => c.mark === 0), "its mark is shown, the others' hidden", s.cards.map((c) => c.mark))
  expect(new Set(s.cards.map((c) => c.y)).size === 1 && Math.max(...s.cards.map((c) => c.w)) - Math.min(...s.cards.map((c) => c.w)) < 1 && new Set(s.cards.map((c) => c.h)).size === 1, "one row, the same width and height")
  expect(Math.min(...s.cards.map((c) => c.h)) >= 44, "44px or taller", s.cards.map((c) => c.h))
  expect(s.source === "profile" && !!s.photo && Math.abs(s.photo.w - s.photo.h) < 1 && !s.wide, "the preview is the square photo beside the words", { source: s.source, photo: s.photo })
  expect(/^https:\/\/storelib\.com\/satori\/links\/photo\.jpg\?v=/.test(s.imageUrl || "") && s.twitterCard === "summary", "its address is the photo's, a summary card", { url: s.imageUrl, card: s.twitterCard })
  expect(s.photoLoaded, "the photo is drawn")
  expect(s.note === "The photo at the top of your page, shown square.", "one line says what it is", s.note)
  expect(!s.sideScroll, "nothing scrolls sideways")
  await shot(p, `share-${label}-profile`)

  /* The choice marks move on opacity and scale only, as every choice in the editor does. */
  const motion = await p.evaluate(async () => {
    const seen = new Set()
    const marks = [...document.querySelectorAll("[data-share-choices] [data-choice-mark]")]
    document.querySelector('[data-share-choices] [data-choice="Share card"]').click()
    const t0 = performance.now()
    await new Promise((res) => { const tick = () => { marks.forEach((m) => m.getAnimations().forEach((a) => seen.add(a.transitionProperty || a.animationName))); performance.now() - t0 < 300 ? requestAnimationFrame(tick) : res() }; requestAnimationFrame(tick) })
    return [...seen]
  })
  await sleep(300)
  s = await read(p)
  expect(motion.length > 0 && motion.every((k) => k === "opacity" || k === "scale"), "the marks fade and scale, nothing else moves", motion)
  expect(s.cards[1]?.pressed === "true" && s.cards[1]?.mark === 1 && s.cards[0]?.mark === 0, "Share card is chosen", s.cards.map((c) => c.mark))
  expect(s.source === "generated" && !!s.wide && Math.abs(s.wide.w / s.wide.h - 1200 / 630) < 0.02 && !s.photo, "the wide card sits above the words", s.wide)
  expect(/\/satori\/links\/share\.png\?v=/.test(s.imageUrl || "") && s.twitterCard === "summary_large_image", "its address is the card's, a large card", { url: s.imageUrl, card: s.twitterCard })
  expect(s.status !== "All changes saved", "the page is unsaved until Save", s.status)
  expect(s.note === "Made from your name, photo and theme.", "one line says what it is", s.note)
  await shot(p, `share-${label}-card`)

  /* Custom image: the picker opens; the upload is written at once, with the choice. */
  const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 3000 }).catch(() => null), pick(p, "Custom image")])
  expect(!!chooser, "choosing Custom image with nothing uploaded opens the picker")
  if (chooser) await chooser.accept([uploadFile])
  await sleep(1200)
  s = await read(p)
  const write = puts.find((b) => b.settings && b.settings.social_image_url)
  expect(!!write && write.share_image_mode === "custom" && write.settings.social_image_url === UPLOAD, "the upload is written at once, with the choice", write ? { mode: write.share_image_mode, url: write.settings.social_image_url } : null)
  expect(s.cards[2]?.pressed === "true" && s.source === "custom" && s.crop, "Custom image is chosen and its crop shows", { source: s.source, crop: s.crop })
  expect(s.note === "Drag on the picture to move the crop.", "one line says what to do", s.note)
  await shot(p, `share-${label}-custom`)

  /* And back to the photo. */
  await pick(p, "Profile photo")
  s = await read(p)
  expect(s.source === "profile" && !!s.photo, "Profile photo again: the square photo", s.source)
  await p.evaluate(() => [...document.querySelectorAll("[data-settings-save] button")].find((b) => b.getClientRects().length)?.click())
  await sleep(900)
  const status = await p.evaluate(() => document.querySelector("[data-settings-status]")?.textContent)
  expect(!!saved && saved.share_image_mode === "profile", "Save sent the choice", saved?.share_image_mode)
  expect(status === "All changes saved", "and the section says so", status)
  if (saved && published) {
    const row = {
      ...saved,
      seller_id: "seller_probe",
      status: "published",
      published_blocks: published.draft_blocks,
      published_theme: published.theme,
      published_profile: { title: published.title, bio: published.bio, avatar_url: published.avatar_url, avatar_video_url: published.avatar_video_url },
      published_social_links: published.social_links,
    }
    const meta = await metadataFor(row, { username: "satori", display_name: null, avatar_url: PHOTO })
    const og = meta.openGraph?.images?.[0]
    expect(og?.url === s.imageUrl && meta.twitter?.images?.[0] === s.imageUrl, "og:image and twitter:image are what the preview showed", { server: og?.url, screen: s.imageUrl })
    expect(meta.twitter?.card === "summary" && og?.width === 600 && og?.height === 600 && og?.type === "image/jpeg", "a summary card, 600 square, a JPEG", { card: meta.twitter?.card, og })
    const asCard = await metadataFor({ ...row, share_image_mode: "card" }, { username: "satori", display_name: null, avatar_url: PHOTO })
    expect(asCard.twitter?.card === "summary_large_image" && asCard.openGraph?.images?.[0]?.width === 1200, "the same row with the card chosen: a large card, 1200 wide", asCard.twitter?.card)
  }
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()

  /* A page with no photo at all. */
  const bare = await open(vp, "?nophoto")
  await toSeo(bare.p, phone)
  s = await read(bare.p)
  expect(s.cards[0]?.pressed === "true" && s.source === "generated" && !!s.wide, "no photo: Profile photo stays chosen and the card shows", { source: s.source })
  expect(s.note === "You have no profile photo yet, so links show the share card.", "and the editor says so", s.note)
  expect(!s.sideScroll, "nothing scrolls sideways")
  await shot(bare.p, `share-${label}-no-photo`)
  expect(bare.errors.length === 0, "no errors on the page", bare.errors.slice(0, 3))
  await bare.p.close()
}

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(`\nScreenshots: ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nAll checks passed")
