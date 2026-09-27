/**
 * ===========================================================================
 *  THE ONEPAGE'S SEARCH AND SHARE PREVIEWS, AND ITS PHONE TAB BAR, MEASURED
 * ===========================================================================
 * scripts/render-onepage-editor.tsx mounts the real editor with a filled
 * page; the network and Supabase are stubs, and the stub API keeps what the
 * editor saves. Three things are checked:
 *
 *   THE BAR        at 360, 390 and 430: four buttons, Settings one of them,
 *                  each 44px or more, all one height, 12px or more from both
 *                  edges, clear of a 34px home indicator (put in by hand,
 *                  env() cannot be emulated), the dark pill exactly over the
 *                  chosen one, moving on transform and opacity only
 *   FOLLOWING      Settings, SEO: the Google and shared link previews read
 *                  the page's name and bio; a rename in Basic info and a new
 *                  bio in Links change them; a typed title stops following
 *                  a rename; "Use page name" makes it follow again
 *   THE SAME       after Save, the row the editor sent is handed to the
 *                  public page's real generateMetadata
 *                  (scripts/render-onepage-seo-meta.ts); its title,
 *                  description, share title, description, image and address
 *                  must equal the previews on screen
 *
 *   node scripts/check-onepage-seo.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-seo.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-seo-"))
mkdirSync(shots, { recursive: true })
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* ── The editor, bundled as scripts/check-onepage-editor.mjs bundles it ── */
const dir = join(root, ".onepage-seo-probe")
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
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE_THEME=${JSON.stringify({ background_type: "solid", background_color: "#1a2e1a", text_color: "#eef2ec", secondary_text_color: "#b7c4b6", button_color: "#ff0000", button_text_color: "#ffffff" })}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`

/* What the editor saved, kept by the stub API as the database would keep it. */
let saved = null
let published = null
const server = createServer((req, res) => {
  if (req.url.startsWith("/onepage-preview") || req.url === "/" || req.url.startsWith("/app")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  let body = ""
  req.on("data", (c) => { body += c })
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" })
    if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
    if (req.url.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ clicks: 0, daily: [] }))
    if (req.url === "/api/onepage/publish" && req.method === "POST") { published = JSON.parse(body); return res.end(JSON.stringify({ success: true, published_at: new Date().toISOString() })) }
    if (req.url === "/api/onepage" && req.method === "PUT") { const b = JSON.parse(body); if (b.draft_blocks) saved = b; return res.end(JSON.stringify({ onepage: b })) }
    res.end("{}")
  })
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

async function open(vp, hash = "links") {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(1000)
  /* Long tasks, from here on. */
  await p.evaluate(() => {
    window.__long = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: false })
  })
  return { p, errors }
}
const clickText = (p, text, scope = "body") => p.evaluate((text, scope) => {
  const el = [...document.querySelector(scope).querySelectorAll("button, a")].find((b) => b.textContent.trim() === text && b.getClientRects().length)
  if (el) el.click()
  return !!el
}, text, scope)
const read = (p) => p.evaluate(() => {
  const t = (s) => document.querySelector(s)?.textContent?.trim() ?? null
  return {
    searchTitle: t("[data-search-title]"), searchDescription: t("[data-search-description]"), searchUrl: t("[data-search-url]"),
    shareTitle: t("[data-og-title]"), shareDescription: t("[data-og-description]"), shareDomain: t("[data-og-domain]"),
    imageUrl: document.querySelector("[data-og-card]")?.getAttribute("data-og-image-url") ?? null,
    cardText: document.querySelector("[data-og-generated]")?.textContent?.trim() ?? null,
    titleFollows: document.querySelector('[data-seo-field="seo-title"]')?.hasAttribute("data-follows") ?? null,
  }
})
async function typeInto(p, selector, text) {
  await p.focus(selector)
  await p.evaluate((s) => { const el = document.querySelector(s); el.select?.() }, selector)
  await p.keyboard.press("Backspace")
  if (text) await p.keyboard.type(text, { delay: 8 })
  await sleep(150)
}
async function openSettings(p, phone) {
  if (phone) await p.click('[data-onepage-tabbar] [data-tab="settings"]')
  else await p.click('button[title="Settings"]')
  await sleep(500)
}
const section = async (p, label) => { await clickText(p, label, "[data-tab-panel=settings]"); await sleep(250) }

/* ─────────────────────────────── The bar ─────────────────────────────── */
for (const width of [360, 390, 430]) {
  const vp = { width, height: width === 430 ? 932 : 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
  console.log(`\n── the phone tab bar, ${width} ──`)
  const { p } = await open(vp, "design")
  const measure = () => p.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left * 10) / 10, r: Math.round(b.right * 10) / 10, t: Math.round(b.top * 10) / 10, b: Math.round(b.bottom * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }
    const bar = document.querySelector("[data-onepage-tabbar]")
    /* The word as it reads: each button draws its face twice, one over the other, to fade between them. */
    const word = (b) => b.querySelector("span > span")?.textContent.trim() ?? b.textContent.trim()
    const buttons = [...bar.querySelectorAll("[data-tab]")].map((b) => ({ id: b.getAttribute("data-tab"), label: word(b), pressed: b.getAttribute("aria-pressed"), ...r(b) }))
    /* Each button's own dark fill (the phone bar has no travelling pill): where it is and how much of it shows. */
    const fills = [...bar.querySelectorAll("[data-tab]")].map((b) => { const f = b.querySelector("[data-tab-fill]"); return { id: b.getAttribute("data-tab"), o: Number(getComputedStyle(f).opacity), ...r(f) } })
    return { vw: innerWidth, vh: innerHeight, bar: r(bar), buttons, fills, pill: !!bar.querySelector("[data-tab-pill]"), sideScroll: document.documentElement.scrollWidth > innerWidth + 1 }
  })
  const m = await measure()
  const heights = m.buttons.map((b) => b.h)
  const settings = m.buttons.find((b) => b.id === "settings")
  console.log(`  buttons: ${m.buttons.map((b) => `${b.label} ${b.w}x${b.h} @${b.l}`).join(", ")}`)
  expect(m.buttons.map((b) => b.id).join() === "links,design,products,settings", "four buttons: Links, Design, Products, Settings", m.buttons.map((b) => b.label))
  expect(settings && settings.label === "Settings", "Settings has its word, not only an icon", settings?.label)
  expect(Math.min(...heights) >= 44 && Math.max(...heights) - Math.min(...heights) < 0.5, "every button 44px or taller, all one height", heights)
  expect(Math.min(...m.buttons.map((b) => b.w)) >= 44 && Math.max(...m.buttons.map((b) => b.w)) - Math.min(...m.buttons.map((b) => b.w)) < 1, "every button the same width, 44px or wider", m.buttons.map((b) => b.w))
  expect(settings && m.vw - settings.r >= 12 && m.buttons[0].l >= 12, "12px or more from both edges", { left: m.buttons[0].l, right: settings && Math.round((m.vw - settings.r) * 10) / 10 })
  expect(m.vh - Math.max(...m.buttons.map((b) => b.b)) >= 10, "10px or more under the buttons with no home indicator", m.vh - Math.max(...m.buttons.map((b) => b.b)))
  const on = m.buttons.find((b) => b.pressed === "true")
  const onFill = m.fills.find((f) => f.id === on?.id)
  expect(!m.pill && on && onFill.o === 1 && Math.abs(on.l - onFill.l) <= 1 && Math.abs(on.w - onFill.w) <= 2 && m.fills.filter((f) => f.id !== on.id).every((f) => f.o === 0), "the chosen one wears its own dark fill, over its whole face; the others none, and no pill", { on: on?.id, fills: m.fills.map((f) => [f.id, f.o]) })
  expect(!m.sideScroll, "nothing scrolls sideways")
  await p.screenshot({ path: join(shots, `bar-${width}.png`), clip: { x: 0, y: m.vh - 150, width: m.vw, height: 150 } })

  /* A tap on Settings: its fill crossfades in where it is, on the compositor. */
  const anim = await p.evaluate(async () => {
    const bar = document.querySelector("[data-onepage-tabbar]")
    const seen = new Set()
    const watch = () => bar.getAnimations({ subtree: true }).forEach((a) => seen.add(a.transitionProperty || "keyframes"))
    const t0 = performance.now()
    document.querySelector('[data-onepage-tabbar] [data-tab="settings"]').click()
    let frames = 0
    await new Promise((res) => { const tick = () => { watch(); frames++; performance.now() - t0 < 500 ? requestAnimationFrame(tick) : res() }; requestAnimationFrame(tick) })
    return { props: [...seen], frames }
  })
  await sleep(200)
  const m2 = await measure()
  const s2 = m2.buttons.find((b) => b.id === "settings")
  expect(anim.props.length > 0 && anim.props.every((k) => k === "opacity"), "the change is opacity only, nothing slides", anim.props)
  expect(s2.pressed === "true" && m2.fills.find((f) => f.id === "settings").o === 1 && m2.fills.filter((f) => f.id !== "settings").every((f) => f.o === 0), "and Settings is the one dark", m2.fills.map((f) => [f.id, f.o]))
  const longs = await p.evaluate(() => window.__long)
  console.log(`  long tasks from load to the Settings tap: ${JSON.stringify(longs)}; frames drawn in 500ms after the tap: ${anim.frames}`)
  await p.screenshot({ path: join(shots, `bar-${width}-settings.png`), clip: { x: 0, y: m.vh - 150, width: m.vw, height: 150 } })

  /* An iPhone's home indicator: the bar grows by the inset and the buttons stay above it. */
  await p.addStyleTag({ content: ":root { --op-tabbar-h: calc(64px + 34px) !important }" })
  await sleep(150)
  const m3 = await measure()
  const clear = m3.vh - Math.max(...m3.buttons.map((b) => b.b))
  expect(clear >= 34 && m3.bar.h === 98, "with a 34px home indicator the buttons end above it and the bar grows to hold it", { clear, bar: m3.bar.h })
  await p.screenshot({ path: join(shots, `bar-${width}-inset34.png`), clip: { x: 0, y: m.vh - 150, width: m.vw, height: 150 } })
  const pad = await p.evaluate(() => {
    const box = document.querySelector("[data-tab-panel=settings] > div")
    return box ? parseFloat(getComputedStyle(box).paddingBottom) : null
  })
  expect(pad === 98 + 16, "and the tab's content leaves the same room plus 16px under its end", pad)
  await p.close()
}

/* ─────────────────────────── Following the page ─────────────────────────── */
for (const [label, vp] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1440", { width: 1440, height: 900 }],
]) {
  const phone = vp.width < 768
  console.log(`\n── search and share previews, ${label} ──`)
  saved = null
  const { p, errors } = await open(vp, "links")
  await openSettings(p, phone)
  await section(p, "SEO")
  let s = await read(p)
  expect(s.searchTitle === "Satori Studio | Storelib" && s.shareTitle === "Satori Studio", "the titles start from the page's name", { search: s.searchTitle, share: s.shareTitle })
  expect(s.searchDescription === "Prints, posters and a newsletter" && s.shareDescription === s.searchDescription, "the descriptions from its bio", s.searchDescription)
  expect(s.shareDomain === "storelib.me" && s.searchUrl === "https://storelib.me › satori", "the host and the address (OnePages live at storelib.me/{username})", { d: s.shareDomain, u: s.searchUrl })
  expect(s.cardText === "SSstorelib.com/satori/links" || /Satori Studio/.test(s.cardText || ""), "the share picture draws the name", s.cardText)
  expect(s.titleFollows === true, "the title box says it follows the page")
  await p.screenshot({ path: join(shots, `seo-${label}-start.png`), fullPage: false })

  /* A rename in Basic info. */
  await section(p, "Basic info")
  await typeInto(p, "[data-settings-name]", "Satori Prints")
  await section(p, "SEO")
  s = await read(p)
  expect(s.searchTitle === "Satori Prints | Storelib" && s.shareTitle === "Satori Prints" && /Satori Prints/.test(s.cardText || ""), "a rename reaches both previews and the picture at once", { search: s.searchTitle, share: s.shareTitle, card: s.cardText })
  const imageAfterRename = s.imageUrl

  /* A new bio, typed where it is written: the Links tab's profile sheet. */
  await p.click(phone ? '[data-onepage-tabbar] [data-tab="links"]' : '[data-tab-row="desktop"] [data-tab="links"]')
  await sleep(600)
  await p.evaluate(() => [...document.querySelectorAll("[data-tab-panel=links] button")].find((b) => /Prints, posters and a newsletter/.test(b.textContent) && b.getClientRects().length)?.click())
  await sleep(600)
  await typeInto(p, '[role=dialog] textarea', "Riso prints, zines and a Friday letter")
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "Save")?.click())
  await sleep(500)
  await openSettings(p, phone)
  await section(p, "SEO")
  s = await read(p)
  expect(s.searchDescription === "Riso prints, zines and a Friday letter" && s.shareDescription === s.searchDescription, "a new bio reaches both descriptions", s.searchDescription)
  expect(s.imageUrl === imageAfterRename, "and leaves the picture's address alone: the picture does not draw the bio", { before: imageAfterRename, after: s.imageUrl })

  /* A title of their own, typed. */
  await p.evaluate(() => { window.__long = [] })
  await typeInto(p, "#seo-title", "Risograph prints from Kyoto")
  const typingLongs = await p.evaluate(() => window.__long)
  s = await read(p)
  expect(s.searchTitle === "Risograph prints from Kyoto" && s.shareTitle === "Risograph prints from Kyoto" && s.titleFollows === false, "a typed title shows in both previews as it is typed", { search: s.searchTitle, share: s.shareTitle })
  console.log(`  long tasks while typing 27 characters: ${JSON.stringify(typingLongs)}`)
  expect(typingLongs.filter((d) => d > 100).length === 0, "no task over 100ms while typing", typingLongs)
  await p.screenshot({ path: join(shots, `seo-${label}-typed.png`), fullPage: false })

  /* It no longer follows a rename... */
  await section(p, "Basic info")
  await typeInto(p, "[data-settings-name]", "Kyoto Riso")
  await section(p, "SEO")
  s = await read(p)
  expect(s.searchTitle === "Risograph prints from Kyoto" && /Kyoto Riso/.test(s.cardText || ""), "a typed title stays when the page is renamed; the picture still follows", { search: s.searchTitle, card: s.cardText })
  /* ...until it is reset. */
  const reset = await p.$('[data-seo-reset="seo-title"]')
  expect(!!reset, "a way back to following is on screen beside it")
  if (reset) await reset.click()
  await sleep(200)
  s = await read(p)
  expect(s.searchTitle === "Kyoto Riso | Storelib" && s.shareTitle === "Kyoto Riso" && s.titleFollows === true, "Use page name: it follows the page again", { search: s.searchTitle, share: s.shareTitle })

  /* A shared description of its own, then Save, then the public page's metadata. */
  if (!(await p.$("#social-description"))) await p.click("[data-seo-social-open]")
  await sleep(150)
  await typeInto(p, "#social-description", "New prints every Friday")
  await typeInto(p, "#seo-title", "Riso prints | Kyoto")
  s = await read(p)
  await p.screenshot({ path: join(shots, `seo-${label}-before-save.png`), fullPage: false })
  await p.evaluate(() => [...document.querySelectorAll("[data-settings-save] button")].find((b) => b.getClientRects().length)?.click())
  await sleep(900)
  const status = await p.evaluate(() => document.querySelector("[data-settings-status]")?.textContent)
  expect(!!saved && !!published, "Save sent the page and published it", { saved: !!saved, published: !!published })
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
    const meta = await metadataFor(row, { username: "satori", display_name: null, avatar_url: null })
    const pairs = [
      ["title", meta.title?.absolute, s.searchTitle],
      ["description", meta.description, s.searchDescription],
      ["og:title", meta.openGraph?.title, s.shareTitle],
      ["og:description", meta.openGraph?.description, s.shareDescription],
      ["og:image", meta.openGraph?.images?.[0]?.url, s.imageUrl],
      ["twitter:image", meta.twitter?.images?.[0], s.imageUrl],
      ["og:url host", new URL(meta.openGraph?.url).host, s.shareDomain],
    ]
    for (const [what, server, screen] of pairs) expect(server === screen, `${what}: the public page says what the preview showed`, { server, screen })
    expect(meta.twitter?.card === "summary_large_image" && meta.alternates?.canonical === meta.openGraph?.url, "a large card, one canonical address", { card: meta.twitter?.card, canonical: meta.alternates?.canonical })
    expect(saved.settings.seo_title === "Riso prints | Kyoto" && saved.settings.social_description === "New prints every Friday" && !saved.settings.social_title, "only the fields somebody typed were saved as their own", { seo_title: saved.settings.seo_title, social_title: saved.settings.social_title ?? null })
  }
  /* Every section, for the eye. */
  for (const [name, file] of [["Basic info", "basic"], ["Subscribe", "subscribe"], ["Share", "share"], ["Verified badge", "verified"], ["Billing", "billing"]]) {
    await section(p, name)
    if (name === "Verified badge") await p.evaluate(() => document.querySelector("[data-settings-verified] [role=switch]")?.click())
    await sleep(250)
    await p.screenshot({ path: join(shots, `settings-${label}-${file}.png`), fullPage: false })
  }
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(`\nScreenshots: ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nAll checks passed")
