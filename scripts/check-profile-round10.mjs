/**
 * ===========================================================================
 *  PROFILES, ROUND 10, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real components (scripts/render-profile-round10.tsx) at storelib.com
 * addresses, at 1440x900 and 390x844:
 *
 *   PROFILE     /@maya (no store), with and without a photo: Storelib's
 *               header is there (the person is never stranded), the phone
 *               tab bar too, nothing sideways; without a photo the hero is
 *               the default face; the Communities tab is the list of places
 *               (rows 64px, one press each)
 *   EMPTY       a creator page with no products, every combination of what
 *               it can hold (/calvin's old "header" section, empty and
 *               hidden sections, a real text block; communities or none; a
 *               visitor or the owner). The 62.webp case is reproduced first
 *               with the round 9 rule (Home over a blank band), then with
 *               this round's: no Home tab, nothing blank, what comes next
 *               sits close under the follow row
 *   AVATARS     people without a photo in the header (signed in), comments,
 *               the members list and a profile: the default face, never
 *               letters; a community's square mark keeps its letters
 *   SETTINGS    a picture chosen: the crop sheet slides up (frames sampled:
 *               only rises, compositor only), the page under it does not
 *               move, a drag moves the picture, Use photo puts it in the
 *               circle at once with a progress ring and nothing on the page
 *               moves at any point
 *   COVER       /account's band 148 / 220 / 294 tall, and Settings' frame
 *               the band's new shape
 *
 *   PROBE_CSS=source node scripts/check-profile-round10.mjs
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
const stubs = join(root, ".profile-round10-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-profile-r10-")), "shots")
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
    select() { return b }, eq() { return b }, is() { return b }, limit() { return b }, order() { return b }, single() { return b }, maybeSingle() { return b }, or() { return b }, in() { return b }, update() { return b },
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
    entryPoints: [join(root, "scripts/render-profile-round10.tsx")],
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

/* A picture to choose in Settings: 1200x800, a face off to the right, so a centre square would cut it. */
const picture = join(stubs, "pick.png")
await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#d8cfc4" } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><circle cx="930" cy="330" r="150" fill="#8a6f5a"/><rect x="760" y="520" width="340" height="300" rx="150" fill="#8a6f5a"/><rect x="0" y="0" width="1200" height="800" fill="none" stroke="#1a1a2e" stroke-width="20"/></svg>`) }])
  .png().toFile(picture)

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
/* Letters drawn in a circle that stands for a person. */
const LETTERS = (scope) => [...(scope || document).querySelectorAll("[data-app-avatar][data-avatar-kind=person]")].filter((a) => /[A-Z]{1,2}/.test(a.textContent.trim())).length

try {
  /* ── PROFILE ─────────────────────────────────────────────────────────── */
  if (only("profile")) for (const [label, vp] of VPS) {
    for (const photo of ["yes", "no"]) {
      const name = `profile-${label}-photo-${photo}`
      console.log(`\n${name}`)
      const { p, errors } = await open(vp, `/@maya?case=profile&photo=${photo}`)
      await p.screenshot({ path: join(shots, `${name}.png`) })
      const m = await p.evaluate((LETTERS) => {
        const header = document.getElementById("platform-header-root")
        const bar = document.querySelector("[data-buyer-tab-bar]")
        const band = document.querySelector("[data-profile-cover-band]")
        const hero = document.querySelector("[data-profile-hero] [data-app-avatar]")
        return {
          header: header ? Math.round(header.getBoundingClientRect().height) : 0,
          bar: !!bar && getComputedStyle(bar).display !== "none" && bar.getBoundingClientRect().height > 0,
          band: band ? Math.round(band.getBoundingClientRect().height) : 0,
          heroDefault: !!hero?.querySelector("[data-avatar-default]"),
          heroLetters: hero ? /[A-Z]{2}/.test(hero.textContent) : null,
          sideways: document.documentElement.scrollWidth - innerWidth,
          tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
          letters: eval(LETTERS)(document),
        }
      }, `(${LETTERS.toString()})`)
      expect(m.header > 40, "Storelib's header is over the profile", m.header)
      if (label === "phone") expect(m.bar, "  and the phone tab bar under it", m.bar)
      expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
      expect(m.band === (label === "phone" ? 148 : 294), "the band at its new height", m.band)
      expect(m.tabs.join() === "Activity,Communities", "Activity and Communities, nothing bought", m.tabs)
      if (photo === "no") expect(m.heroDefault && !m.heroLetters, "no photo: the default face, no letters", m)
      expect(m.letters === 0, "no person drawn as letters anywhere on the page", m.letters)
      /* The communities: a list of places. */
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Communities")?.click())
      await sleep(350)
      await p.evaluate(() => document.querySelector("[data-profile-community-list]")?.scrollIntoView({ block: "center" }))
      await sleep(150)
      await p.screenshot({ path: join(shots, `${name}-communities.png`) })
      const rows = await p.evaluate(() => [...document.querySelectorAll("[data-profile-community]")].map((a) => { const r = a.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), text: a.innerText.replace(/\s+/g, " ").trim() } }))
      expect(rows.length === 3 && rows.every((r) => r.h >= 64), "three rows, each 64px or more to a thumb", rows.map((r) => r.h))
      expect(rows.every((r) => r.w <= 680), "  in the activity's own column", rows.map((r) => r.w))
      const said = rows.map((r) => r.text)
      expect(/^Clay Studio/.test(said[0]) && /Maya Ortiz/.test(said[0]) && /1\.2k|1,240/.test(said[0]) && /Night Runners/.test(said[1]) && /Theo Grant/.test(said[1]), "  name, who runs it, the real count", said)
      await p.close()
    }
  }

  /* ── EMPTY CREATOR PAGES ─────────────────────────────────────────────── */
  if (only("creator")) {
    const measure = (p) => p.evaluate(() => {
      const r = (el) => (el ? el.getBoundingClientRect() : null)
      const follow = r(document.querySelector("[data-storefront-follow]") || document.querySelector("[data-profile-social]"))
      const cat = document.querySelector("[data-probe-catalogue]")
      const about = document.querySelector("[data-probe-about]")
      const aboutRule = about?.querySelector(".h-px")
      const ink = [...(cat?.querySelectorAll("p, h2, h3, [role=tab], a, img") ?? [])].filter((el) => r(el).height > 0).map((el) => r(el).top)
      const firstInk = ink.length ? Math.min(...ink) : r(aboutRule)?.top ?? r(about)?.top ?? null
      const strip = cat?.querySelector("[role=tablist]")
      const panel = cat?.querySelector("[role=tabpanel]:not([hidden])")
      return {
        followBottom: follow ? Math.round(follow.bottom) : null,
        firstInk: firstInk === null ? null : Math.round(firstInk),
        tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
        heading: document.querySelector("#storefront-communities-heading")?.textContent?.trim() ?? null,
        /* A Home panel with nothing drawn in it: its height with no ink inside. */
        emptyPanel: panel ? { h: Math.round(r(panel).height), ink: [...panel.querySelectorAll("p, h2, h3, a, img, li")].filter((el) => r(el).height > 0).length } : null,
        blankBelowStrip: strip && about ? Math.round(r(aboutRule || about).top - r(strip).bottom) : null,
        prompt: !!document.querySelector("[data-first-product]"),
        sideways: document.documentElement.scrollWidth - innerWidth,
      }
    })
    for (const [label, vp] of VPS) {
      console.log(`\n${label}: the 62.webp case, with round 9's rule`)
      {
        const { p } = await open(vp, "/calvin?case=creator&sections=calvin&communities=none&view=visitor&rule=old")
        await p.screenshot({ path: join(shots, `creator-${label}-calvin-BEFORE.png`), fullPage: true })
        const m = await measure(p)
        expect(m.tabs.join() === "Home,Communities" && m.emptyPanel && m.emptyPanel.ink === 0, "reproduced: a Home tab over nothing, beside Communities", m)
        await p.close()
      }
      for (const sections of ["calvin", "empty", "text"]) for (const communities of ["none", "some"]) for (const view of ["visitor", "owner"]) {
        const name = `creator-${label}-${sections}-${communities}-${view}`
        const { p, errors } = await open(vp, `/calvin?case=creator&sections=${sections}&communities=${communities}&view=${view}`)
        await p.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
        const m = await measure(p)
        const gap = m.firstInk - m.followBottom
        const tag = `${label} ${sections}/${communities}/${view}:`
        expect(m.sideways <= 0 && errors.length === 0, `${tag} nothing sideways, no errors`, { sideways: m.sideways, errors })
        expect(m.firstInk !== null && gap >= 0 && gap <= 120, `${tag} no hole under the follow row`, { gap })
        if (sections === "text") {
          expect(m.tabs[0] === "Home" && m.emptyPanel?.ink > 0, `${tag} a section with words: Home, with them in it`, m.tabs)
        } else if (communities === "some") {
          expect(m.tabs.length === 0 && m.heading === "Communities", `${tag} nothing in Home: no strip, the communities under their heading`, { tabs: m.tabs, heading: m.heading })
        } else {
          expect(m.tabs.length === 0 && m.heading === null && !m.emptyPanel, `${tag} nothing at all: no strip, header then About`, m)
        }
        expect(m.prompt === (view === "owner"), `${tag} the owner's line for the owner only`, m.prompt)
        await p.close()
      }
    }
  }

  /* ── AVATARS ─────────────────────────────────────────────────────────── */
  if (only("avatars")) for (const [label, vp] of VPS) {
    console.log(`\n${label}: people without a photo`)
    const { p, errors } = await open(vp, "/explore?case=avatars")
    await sleep(300)
    await p.screenshot({ path: join(shots, `avatars-${label}.png`), fullPage: true })
    const header = await p.evaluate(() => document.getElementById("platform-header-root"))
    await p.screenshot({ path: join(shots, `avatars-${label}-header.png`), clip: { x: label === "phone" ? 0 : 1440 - 420, y: 0, width: label === "phone" ? 390 : 420, height: 80 } })
    const m = await p.evaluate((LETTERS) => {
      const count = (sel) => document.querySelectorAll(`${sel} [data-avatar-default]`).length
      return {
        header: document.querySelectorAll("#platform-header-root [data-avatar-default]").length,
        comments: count("[data-probe-avatars=comments]"),
        members: count("[data-probe-avatars=members]"),
        sizes: count("[data-probe-avatars=sizes]"),
        mark: document.querySelector("[data-probe-mark] [data-app-avatar]")?.textContent.trim(),
        letters: eval(LETTERS)(document),
      }
    }, `(${LETTERS.toString()})`)
    expect(errors.length === 0, "no errors", errors)
    expect(m.header >= 1, "the header's photo button: the default face for a signed in person with no photo", m.header)
    expect(m.comments >= 3, "comments: the commenters and the box's own face", m.comments)
    expect(m.members === 2, "members: the two without a photo", m.members)
    expect(m.sizes === 8, "every size and every ground", m.sizes)
    expect(m.letters === 0, "no person drawn as letters", m.letters)
    expect(m.mark === "CS", "a community's square mark keeps its letters", m.mark)
    await p.close()
  }

  /* ── SETTINGS: THE PHOTO ─────────────────────────────────────────────── */
  if (only("settings")) for (const [label, vp] of VPS) {
    console.log(`\n${label}: Settings, a new photo`)
    const { p, errors } = await open(vp, "/account/settings?case=settings")
    await p.screenshot({ path: join(shots, `settings-${label}-before.png`) })
    const before = { row: await rect(p, "[data-account-photo-row]"), under: await rect(p, "[data-probe-under-photo]") }
    /* Choose the picture, then watch the sheet arrive frame by frame. */
    const input = await p.$("[data-account-photo-input]")
    await p.evaluate(() => {
      window.__frames = []
      const watch = () => {
        const panel = document.querySelector("[data-photo-crop-panel]")
        if (panel) {
          const cs = getComputedStyle(panel)
          window.__frames.push({ t: performance.now(), top: panel.getBoundingClientRect().top, translate: cs.translate, opacity: cs.opacity })
        }
        if (window.__frames.length < 40) requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
    })
    await input.uploadFile(picture)
    await p.waitForSelector("[data-photo-crop-panel]", { timeout: 4000 })
    await sleep(600)
    const frames = await p.evaluate(() => window.__frames)
    const tops = frames.map((f) => Math.round(f.top))
    const rises = tops.every((t, i) => i === 0 || t <= tops[i - 1] + 0.5)
    expect(frames.length > 5 && rises, "the sheet only rises into place (frames sampled), never jumps back", tops.slice(0, 14))
    await p.screenshot({ path: join(shots, `settings-${label}-crop.png`) })
    const during = { row: await rect(p, "[data-account-photo-row]"), under: await rect(p, "[data-probe-under-photo]") }
    expect(JSON.stringify(before) === JSON.stringify(during), "the page under the sheet does not move", { before, during })
    const stage = await rect(p, "[data-photo-crop-stage]")
    const circle = await rect(p, "[data-photo-crop-circle]")
    expect(stage && circle && Math.abs(circle.w - (stage.w - 40)) <= 1, "the circle is the stage less 20px each side", { stage, circle })
    const buttons = await p.evaluate(() => [...document.querySelectorAll("[data-photo-crop] button")].map((b) => Math.round(b.getBoundingClientRect().height)))
    expect(buttons.every((h) => h >= 40), "every control 40px or more", buttons)
    /* Drag the picture left by 120px: the face on the right comes into the circle. */
    const t0 = await p.evaluate(() => getComputedStyle(document.querySelector("[data-photo-crop-image]")).transform)
    const cx = stage.x + stage.w / 2
    const cy = stage.y - (await p.evaluate(() => scrollY)) + stage.h / 2
    await p.mouse.move(cx, cy)
    await p.mouse.down()
    for (let i = 1; i <= 8; i++) await p.mouse.move(cx - i * 15, cy, { steps: 1 })
    await p.mouse.up()
    await sleep(120)
    const t1 = await p.evaluate(() => getComputedStyle(document.querySelector("[data-photo-crop-image]")).transform)
    const tx = (t) => Number((t.match(/matrix\(([^)]+)\)/)?.[1] || "").split(",")[4] || 0)
    /* 1200x800 under a circle 320 across: 80px of picture either side, so a 120px drag stops at 80, and never further. */
    const room = Math.round(((1200 * (circle.w / 800)) - circle.w) / 2)
    expect(Math.abs(tx(t1) - (tx(t0) - room)) <= 1, "a drag moves the picture (on the compositor), and stops where the circle would show an edge", { before: tx(t0), after: tx(t1), room })
    await p.screenshot({ path: join(shots, `settings-${label}-crop-moved.png`) })
    /* Use photo: in the circle at once, the ring filling, nothing moving. */
    await p.evaluate(() => { window.__ring = []; const watch = () => { const r = document.querySelector("[data-photo-progress]"); if (r) window.__ring.push(r.getAttribute("data-photo-progress")); if (window.__ring.length < 200) requestAnimationFrame(watch) }; requestAnimationFrame(watch) })
    await p.click("[data-photo-crop-save]")
    await p.waitForSelector("[data-photo-preview]", { timeout: 4000 })
    await sleep(120)
    await p.screenshot({ path: join(shots, `settings-${label}-uploading.png`) })
    const uploading = { row: await rect(p, "[data-account-photo-row]"), under: await rect(p, "[data-probe-under-photo]") }
    expect(JSON.stringify(before) === JSON.stringify(uploading), "the new photo is in the circle at once and nothing moved", { before, uploading })
    await sleep(1400)
    const ring = await p.evaluate(() => window.__ring)
    const after = { row: await rect(p, "[data-account-photo-row]"), under: await rect(p, "[data-probe-under-photo]") }
    const done = await p.evaluate(() => ({ preview: !!document.querySelector("[data-photo-preview]"), ring: !!document.querySelector("[data-photo-progress]"), sheet: !!document.querySelector("[data-photo-crop]"), error: document.querySelector("[data-account-photo-error]")?.textContent ?? null }))
    expect(ring.length > 0 && ring.includes("0"), "the progress ring showed while it uploaded", [...new Set(ring)].slice(0, 6))
    expect(done.preview && !done.ring && !done.sheet && !done.error, "saved: the photo stays, the ring and the sheet are gone, no error", done)
    expect(JSON.stringify(before) === JSON.stringify(after), "and nothing on the page moved at any point", { before, after })
    expect(errors.length === 0, "no errors", errors)
    await p.screenshot({ path: join(shots, `settings-${label}-after.png`) })
    /* The cover frame in Settings: the band's new shape. */
    const frame = await p.evaluate(() => {
      const img = document.querySelector("[data-account-cover-field] img")
      let el = img?.parentElement
      while (el && getComputedStyle(el).overflow !== "hidden") el = el.parentElement
      const r = (el || img).getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    })
    const bandH = label === "phone" ? 148 : 294
    const vw = label === "phone" ? 390 : 1440
    const want = Math.round(frame.w / (vw / bandH))
    expect(Math.abs(frame.h - want) <= 2, `Settings' cover frame takes the taller band's shape (${frame.w}x${frame.h}, was ${Math.round(frame.w / (vw / (label === "phone" ? 128 : 256)))} tall)`, { frame, want })
    await p.close()
  }

  /* ── /account's band ─────────────────────────────────────────────────── */
  if (only("hub")) for (const [w, want] of [[390, 148], [800, 220], [1440, 294]]) {
    const { p } = await open({ width: w, height: 900, deviceScaleFactor: 1, isMobile: w < 640, hasTouch: w < 640 }, "/account?case=hub")
    const band = await rect(p, "[data-profile-cover-band]")
    expect(band?.h === want, `/account at ${w}: the cover ${want}px tall (fifteen percent over before)`, band)
    await p.screenshot({ path: join(shots, `hub-${w}.png`) })
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `${broken} failed` : "all passed")
process.exit(broken ? 1 : 0)
