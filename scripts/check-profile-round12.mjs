/**
 * ===========================================================================
 *  PROFILES, ROUND 12, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real components (scripts/render-profile-round12.tsx) at storelib.com
 * addresses, at 1440x900 and 390x844:
 *
 *   PERSON     /@maya, a person without a store, is the creator page's
 *              template without products: no Storelib header (the real
 *              ConditionalHeader at /@maya draws nothing), the page's own
 *              top bar with the photo and name, the creator header (cover,
 *              photo across its edge, name, @handle, bio, "Lisbon,
 *              Portugal", counts, Follow), the underline tabs, About and
 *              the "Powered by Storelib" footer; nothing sideways; taps big
 *              enough on a phone
 *   SAME PAGE  measured against a creator page with no products in the
 *              default scheme: the same ground, the same photo size and
 *              place, the same name size, the same tab type, the same footer
 *   SELF       your own page: Edit profile on the cover, no Follow
 *   BACK       came from somewhere: the chevron in the top bar
 *   SETTINGS   City and Country in Profile settings: a country picked by
 *              name is saved as its code, the city as typed; before part 98
 *              the fields are not drawn
 *
 *   PROBE_CSS=source node scripts/check-profile-round12.mjs
 * Screenshots go to SHOTS_DIR (printed at the end): look at them.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".profile-round12-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-profile-r12-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = (part) => !process.env.PROBE_ONLY || process.env.PROBE_ONLY.split(",").includes(part)
const ORIGIN = "https://storelib.com"

const STUBS = {
  "next-navigation.js": `import { useSyncExternalStore } from "react"
const nav = window.__nav
const subs = new Set()
const notify = () => subs.forEach((f) => f())
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => useSyncExternalStore(subscribe, () => nav.path, () => nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(nav.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
  "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) e.preventDefault() } }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
  "next-image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, quality, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`,
  /* Signed in as somebody with no photo; storage and the session for the upload. */
  "supabase-client.jsx": `const USER = { id: "user-1", email: "ava@example.com", user_metadata: {} }
function chain(table) {
  const b = {
    select() { return b }, eq() { return b }, is() { return b }, limit() { return b }, order() { return b }, single() { return b }, maybeSingle() { return b }, or() { return b }, in() { return b }, update(v) { (window.__updates ||= []).push([table, v]); return b },
    then(res) { setTimeout(() => res({ data: table === "profiles" ? { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: false } : null, error: null }), 10) },
  }
  return b
}
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
      getSession: async () => ({ data: { session: { access_token: "probe-token", user: USER } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: "https://placeholder.supabase.co/storage/v1/object/public/avatars/" + p } }) }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel() {},
  }
}
`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, k), v)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-profile-round12.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "next-navigation.js") }))
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(stubs, "next-link.jsx") }))
        b.onResolve({ filter: /^next\/image$/ }, () => ({ path: join(stubs, "next-image.jsx") }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  console.error(`The probe did not bundle: ${e.message}`)
  process.exit(1)
}


const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files"] })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const VPS = [["desktop", DESK], ["phone", PHONE]]

async function open(vp, address, { uploadDelay = 700 } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e?.stack || e).split("\n").slice(0, 4).join(" | ").slice(0, 400)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (u.startsWith("https://placeholder.supabase.co/storage/v1/object/avatars/")) {
      if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } })
      await sleep(uploadDelay)
      return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"Key":"avatars/x"}' })
    }
    if (u.startsWith(ORIGIN + "/api/account/avatar")) { await sleep(150); return r.respond({ status: 200, contentType: "application/json", body: "{}" }) }
    if (u.startsWith(ORIGIN + "/api/storage/uploaded") || u.startsWith(ORIGIN + "/api/profile/cover")) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
    if (u.startsWith(ORIGIN + "/api/platform/flags")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ communities: true }) })
    if (u.startsWith(ORIGIN + "/")) {
      const file = join(root, "public", decodeURIComponent(new URL(u).pathname))
      if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : "application/octet-stream", body: readFileSync(file) })
    }
    if (u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("file:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  const [path, search] = address.split("?")
  await p.evaluateOnNewDocument((path, search) => {
    window.__nav = { path, search: search ? "?" + search : "" }
    try {
      localStorage.clear()
      localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "user-1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false }))
    } catch {}
  }, path, search || "")
  await p.goto(ORIGIN + address, { waitUntil: "load" })
  await p.evaluate(() => Promise.all([document.fonts.load("400 16px Inter"), document.fonts.load("600 16px Inter")]).catch(() => {}).then(() => document.fonts.ready))
  await sleep(700)
  return { p, errors }
}


const rect = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) } }, sel)

/* What both pages are made of, measured the same way. */
const anatomy = (p) => p.evaluate(() => {
  const r = (el) => (el ? el.getBoundingClientRect() : null)
  const root = document.querySelector("[data-storefront-root]")
  const h1 = document.querySelector("h1")
  const photo = h1?.parentElement?.querySelector("[data-slot=avatar], span.relative.flex") || h1?.parentElement?.firstElementChild
  const band = document.querySelector("[data-cover-band]")
  const tab = document.querySelector("[role=tab]")
  const footer = [...document.querySelectorAll("footer, div")].find((el) => /Powered by/.test(el.textContent || "") && el.children.length < 8)
  const small = []
  for (const el of document.querySelectorAll("a, button, select, input")) {
    const b = r(el)
    if (!b || b.width === 0 || getComputedStyle(el).visibility === "hidden") continue
    if (el.closest("[data-seller-footer], footer")) continue
    /* The tab strip is the creator page's own (StorefrontTabs, 38px tall and the column's half wide on a phone): measured, not changed here. */
    if (el.getAttribute("role") === "tab") continue
    if (b.height < 40 && !el.closest("[data-profile-counts]")) small.push(`${el.tagName.toLowerCase()} ${Math.round(b.width)}x${Math.round(b.height)} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}`)
  }
  return {
    header: !!document.getElementById("platform-header-root"),
    wishlist: !!document.querySelector("a[href*=wishlist], a[href='/account/library']"),
    ground: root ? getComputedStyle(root).backgroundColor : null,
    sideways: document.documentElement.scrollWidth - innerWidth,
    topBar: r(document.querySelector("[data-profile-top-bar]"))?.height ?? null,
    subscribeBar: r(document.querySelector("[data-subscribe-row], .subscribe-bar-spacer"))?.height ?? null,
    band: band ? Math.round(r(band).height) : 0,
    photo: photo ? { w: Math.round(r(photo).width), cx: Math.round(r(photo).left + r(photo).width / 2), topFromBand: band ? Math.round(r(photo).top - r(band).bottom) : null } : null,
    name: h1 ? { text: h1.textContent.trim(), size: getComputedStyle(h1).fontSize, weight: getComputedStyle(h1).fontWeight } : null,
    location: document.querySelector("[data-profile-location]")?.textContent?.trim() ?? null,
    locationSize: (() => { const el = document.querySelector("[data-profile-location]"); return el ? getComputedStyle(el).fontSize : null })(),
    counts: document.querySelector("[data-profile-counts]")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    follow: !!document.querySelector("[data-profile-actions] button"),
    edit: !!document.querySelector("[data-person-edit]"),
    back: !!document.querySelector("[data-profile-back-button]"),
    tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
    tabType: tab ? `${getComputedStyle(tab).fontSize}/${getComputedStyle(tab).fontWeight}` : null,
    about: document.querySelector("[data-person-about] h3, [data-probe-about] h3")?.textContent?.trim() ?? null,
    aboutFacts: [...document.querySelectorAll("[data-person-about-fact]")].map((f) => f.innerText.replace(/\s+/g, " ").trim()),
    returns: /Returns & exchanges|Accepted payment methods/.test(document.querySelector("[data-person-about]")?.textContent || ""),
    footer: !!footer,
    small,
  }
})

try {
  const VIEWS = { desktop: DESK, phone: PHONE }
  const creator = {}
  if (only("person")) {
    for (const [label, vp] of VPS) {
      const { p, errors } = await open(vp, "/calvin?case=creator")
      await p.screenshot({ path: join(shots, `creator-${label}.png`), fullPage: true })
      creator[label] = await anatomy(p)
      expect(errors.length === 0, `${label}: the creator page draws without errors`, errors)
      await p.close()
    }
    for (const [label, vp] of VPS) for (const photo of ["yes", "no"]) {
      const name = `person-${label}-photo-${photo}`
      console.log(`\n${name}`)
      const { p, errors } = await open(vp, `/@maya?case=person&photo=${photo}`)
      await p.screenshot({ path: join(shots, `${name}.png`) })
      await p.screenshot({ path: join(shots, `${name}-full.png`), fullPage: true })
      const m = await anatomy(p)
      const c = creator[label]
      expect(!m.header && !m.wishlist, "no Storelib header, no wishlist or library icons over it", { header: m.header, wishlist: m.wishlist })
      expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
      expect(m.topBar === 57 && !m.back, "its own top bar (56px and the hairline), no chevron opened cold", { topBar: m.topBar, back: m.back })
      expect(m.ground === c.ground, "the creator page's ground", { person: m.ground, creator: c.ground })
      expect(photo === "yes" ? m.band === c.band && m.band > 0 : m.band === 0, photo === "yes" ? "the cover band at the creator page's height" : "no cover: no band, as a creator page without one", { person: m.band, creator: c.band })
      expect(m.photo?.w === c.photo?.w && Math.abs(m.photo.cx - c.photo.cx) <= 1, "the photo the creator page's size, in its place", { person: m.photo, creator: c.photo })
      if (photo === "yes") expect(m.photo.topFromBand === c.photo.topFromBand, "  across the band's edge as far", { person: m.photo.topFromBand, creator: c.photo.topFromBand })
      expect(m.name?.size === c.name?.size && m.name?.weight === c.name?.weight && m.name?.text === "Maya Ortiz", "the name at the creator page's size and weight", { person: m.name, creator: c.name })
      expect(photo === "yes" ? m.location === "Lisbon, Portugal" && m.locationSize === "13px" : m.location === null, photo === "yes" ? "where they are from, one quiet 13px line" : "no location said: no line", { location: m.location, size: m.locationSize })
      expect(m.counts === "128 followers · 41 following" && m.follow && !m.edit, "followers, following and Follow", m.counts)
      expect(m.tabs.join() === "Activity,Communities" && m.tabType === c.tabType, "Activity and Communities, in the creator page's tab type", { tabs: m.tabs, person: m.tabType, creator: c.tabType })
      expect(m.about === "About Maya Ortiz" && m.aboutFacts.join("|") === "JOINED 2025|COMMUNITIES 3" && !m.returns, "About: the year they joined and their communities, no shop words", { about: m.about, facts: m.aboutFacts, returns: m.returns })
      expect(m.footer && c.footer, "the creator page's footer", m.footer)
      if (label === "phone") expect(m.small.length === 0, "every tap target 40px or more on a phone", m.small)
      /* The communities tab. */
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Communities")?.click())
      await sleep(350)
      await p.evaluate(() => document.querySelector("[data-profile-community-list]")?.scrollIntoView({ block: "center" }))
      await sleep(150)
      await p.screenshot({ path: join(shots, `${name}-communities.png`) })
      const rows = await p.evaluate(() => [...document.querySelectorAll("[data-profile-community]")].map((a) => Math.round(a.getBoundingClientRect().height)))
      expect(rows.length === 3 && rows.every((h) => h >= 64), "the communities they are in, three rows of 64px or more", rows)
      await p.close()
    }

    for (const [label, vp] of VPS) {
      console.log(`\n${label}: your own page, and arriving from somewhere`)
      {
        const { p, errors } = await open(vp, "/@maya?case=person&self=1")
        await p.screenshot({ path: join(shots, `person-${label}-self.png`) })
        const m = await anatomy(p)
        const edit = await rect(p, "[data-person-edit]")
        expect(m.edit && !m.follow && errors.length === 0, "Edit profile on the cover, no Follow", { edit: m.edit, follow: m.follow, errors })
        expect(edit && edit.h >= 36, "  the creator page's own control size (36px, 44px to a thumb)", edit)
        await p.close()
      }
      {
        const { p } = await open(vp, "/@maya?case=person&back=1")
        const m = await anatomy(p)
        const chev = await rect(p, "[data-profile-back-button]")
        await p.screenshot({ path: join(shots, `person-${label}-back.png`), clip: { x: 0, y: 0, width: vp.width, height: 120 } })
        expect(m.back && chev?.w >= 40 && chev?.h >= 40 && m.topBar === 57, "the chevron in the same top bar, 40px", { chev, topBar: m.topBar })
        await p.close()
      }
      {
        const { p } = await open(vp, "/@maya?case=person&communities=off")
        const m = await anatomy(p)
        const heading = await p.evaluate(() => document.querySelector("#person-lone-heading")?.textContent?.trim())
        await p.screenshot({ path: join(shots, `person-${label}-communities-off.png`), fullPage: true })
        expect(m.tabs.length === 0 && heading === "Activity" && m.aboutFacts.join() === "JOINED 2025", "communities off: no strip, Activity under its heading, nothing about communities", { tabs: m.tabs, heading, facts: m.aboutFacts })
        await p.close()
      }
    }
  }

  if (only("settings")) for (const [label, vp] of VPS) {
    console.log(`\n${label}: where you are from, in Profile settings`)
    const { p, errors } = await open(vp, "/account/settings?case=settings&supported=1")
    const city = await rect(p, "[data-account-city]")
    const country = await rect(p, "[data-account-country]")
    expect(errors.length === 0 && city && country, "City and Country are there", { city, country, errors })
    expect(city.h >= 44 && country.h >= 44, "  44px fields", { city: city.h, country: country.h })
    expect(label === "phone" ? country.y > city.y : country.y === city.y, label === "phone" ? "  stacked on a phone" : "  side by side", { city, country })
    const options = await p.evaluate(() => { const s = document.querySelector("[data-account-country]"); return { n: s.options.length, first: s.options[1]?.text, pt: [...s.options].find((o) => o.value === "PT")?.text } })
    expect(options.n > 240 && options.pt === "Portugal", "every country by its name", options)
    await p.type("[data-account-city]", "  Lisbon ")
    await p.select("[data-account-country]", "PT")
    await sleep(400)
    await p.screenshot({ path: join(shots, `settings-${label}-location.png`), fullPage: true })
    const saveButton = await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Save/.test(b.textContent.trim()))?.textContent.trim() ?? null)
    expect(!!saveButton, "the save bar comes up for a location alone", saveButton)
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Save/.test(b.textContent.trim()))?.click())
    await sleep(600)
    const updates = await p.evaluate(() => window.__updates || [])
    const patch = updates.find(([t]) => t === "profiles")?.[1]
    expect(patch && patch.location_city === "Lisbon" && patch.location_country === "PT", "saved: the city as typed (trimmed), the country as its code", patch)
    await p.close()
    const before = await open(vp, "/account/settings?case=settings&supported=0")
    expect(!(await rect(before.p, "[data-account-location]")), "before part 98: no fields at all")
    await before.p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `${broken} failed` : "all passed")
process.exit(broken ? 1 : 0)
