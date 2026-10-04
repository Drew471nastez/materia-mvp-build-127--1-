/**
 * ===========================================================================
 *  /ACCOUNT AS THE PROFILE CENTER, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real site header (components/platform/platform-header-client.tsx, a
 * signed in buyer, Supabase stubbed) over the real hub (components/account/
 * account-hub.tsx) with the real pages under it, from
 * scripts/render-account-center.tsx, at 1440x900 and on a 390x844 phone:
 *
 *   ACTIVITY        /account: the profile's own header, its cover edge to
 *                   edge right under the site header (no card, no rounding),
 *                   the photo across its lower edge with a thin 2px ring, no
 *                   "Joined" line, Edit profile (a Storelib button, to
 *                   /account/settings, where the cover is placed) alone on
 *                   the cover (round 8: no camera button beside it), the
 *                   four owner pills with Activity lit
 *                   (no Edit profile pill), the activity ending on "Joined
 *                   Storelib"
 *   THE PHONE BAR   on a phone, over /account only: the Storelib logo and a
 *                   "..." and nothing else in the bar (no navigator, heart,
 *                   bell or photo); the "..." opens a sheet with Share
 *                   profile, Settings, Language, Help, Log out; Share profile
 *                   hands the phone's share sheet the /@handle address, and
 *                   without one copies it and says "Link copied". On a
 *                   computer the bar keeps its heart, bell and photo.
 *   LIBRARY         /account/library: a page of its own, no profile header,
 *                   its own "Library" title over the five sub pills (Products
 *                   lit); the phone's bar is the usual one there; a sub pill
 *                   lights on the press, before the page answers
 *   SETTINGS        the header steps aside: one face on the screen
 *   EVERYWHERE      nothing sideways; on a phone every pill and control of
 *                   ours is at least 40px tall
 *
 *   PROBE_CSS=source node scripts/check-account-center.mjs
 * Screenshots go to SHOTS_DIR (printed at the end).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".account-center-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-account-center-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const URL_BASE = "https://storelib.com/__account_center_probe"

const STUBS = {
  "next-navigation": `import { useSyncExternalStore } from "react"
let path = window.__path || "/account"
let search = window.__search || ""
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const go = (href) => { const [p, q] = href.split("?"); path = p; search = q || ""; window.__arrivedAt = performance.now(); subs.forEach((f) => f()) }
const router = { push: (h) => { (window.__links ||= []).push(h); setTimeout(() => go(h), window.__navMs ?? 60) }, replace: go, prefetch: () => {}, back: () => {}, refresh: () => {} }
window.__go = go
export const usePathname = () => useSyncExternalStore(subscribe, () => path, () => path)
export const useSearchParams = () => { const s = useSyncExternalStore(subscribe, () => search, () => search); return new URLSearchParams(s) }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}`,
  "next-link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => {
    rest.onClick && rest.onClick(e)
    e.preventDefault()
    ;(window.__links ||= []).push(href)
    window.__pressedAt = performance.now()
    setTimeout(() => window.__go(href), window.__navMs ?? 60)
  } }, children)
})
export const useLinkStatus = () => ({ pending: false })`,
  "next-image": `import React from "react"
const PUBLIC = ${JSON.stringify("file://" + join(root, "public"))}
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  const url = typeof src === "string" ? (src.startsWith("/") ? PUBLIC + src : src) : ""
  return React.createElement("img", { src: url, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}`,
  /* A signed in buyer: the header asks for the user, then the profile, then the creator row. */
  "supabase-client": `const USER = { id: "u1", email: "alex@example.com", user_metadata: {} }
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Alex Morgan", avatar_url: null, username: "alexmorgan", is_creator: false }
  return null
}
const chain = (table) => new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (r) => r({ data: rowFor(table), error: null, count: 0 }) : chain(table),
  apply: () => chain(table),
})
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
    channel: () => chain(null),
    removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k}.jsx`), v)

try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-account-center.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [
      {
        name: "stubs",
        setup(b) {
          b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace(/\//g, "-")}.jsx`) }))
          b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
          b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
        },
      },
    ],
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--disable-gpu"] })
  const VIEWPORTS = [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]
  const open = async (vp, path, globals = {}, { share = false } = {}) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(URL_BASE) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") || r.url().startsWith("file:") ? r.continue() : r.respond({ status: 404, body: "" })))
    await p.evaluateOnNewDocument(
      (path, globals, share) => {
        window.__path = path
        Object.assign(window, globals)
        /* The phone's share sheet, or none; and a clipboard that remembers. */
        Object.defineProperty(navigator, "share", { configurable: true, value: share ? async (data) => { window.__shared = data } : undefined })
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t } } })
      },
      path,
      globals,
      share,
    )
    await p.goto(URL_BASE, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    return { p, errors }
  }
  const measure = (p) =>
    p.evaluate(() => {
      const box = (el) => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }
      }
      const shown = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert]") }
      const column = document.querySelector("[data-probe-account-column]")
      const head = document.getElementById("platform-header-root")
      const avatarEl = document.querySelector("[data-profile-header] [class*='ring-2']")
      const owner = [...document.querySelectorAll("[data-profile-owner-pill]")]
      const sub = [...document.querySelectorAll("[data-library-tab]")]
      const controls = [...column.querySelectorAll("[data-profile-owner-pills] a, [data-library-tabs] a, [data-profile-cover-actions] a")].filter(shown)
      const edit = document.querySelector("[data-profile-edit]")
      const camera = document.querySelector("[data-profile-cover-edit]")
      const headerItems = head ? [...head.querySelectorAll("a, button")].filter(shown).map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()).filter(Boolean) : []
      return {
        sideways: document.documentElement.scrollWidth - innerWidth,
        width: innerWidth,
        header: box(head),
        headerItems,
        cover: box(document.querySelector("[data-profile-cover]")),
        coverRadius: (() => { const c = document.querySelector("[data-profile-cover]"); return c ? getComputedStyle(c).borderTopLeftRadius : null })(),
        avatar: box(avatarEl),
        ring: avatarEl ? getComputedStyle(avatarEl).boxShadow : null,
        name: document.querySelector("[data-profile-name]")?.textContent,
        heroText: document.querySelector("[data-profile-hero]")?.textContent ?? null,
        owner: owner.map((a) => [a.textContent.trim(), a.getAttribute("data-active")]),
        sub: sub.map((a) => [a.textContent.trim(), a.getAttribute("data-active")]),
        title: (() => { const t = document.querySelector("[data-library-title]"); return t ? { text: t.textContent.trim(), tag: t.tagName, size: getComputedStyle(t).fontSize, ...box(t) } : null })(),
        subTop: sub[0] ? Math.round(sub[0].getBoundingClientRect().top) : null,
        edit: edit && { ...box(edit), href: edit.getAttribute("href"), text: edit.textContent.trim(), bg: getComputedStyle(edit).backgroundColor, radius: getComputedStyle(edit).borderTopLeftRadius },
        camera: camera && { ...box(camera), href: camera.getAttribute("href"), label: camera.getAttribute("aria-label") },
        follow: !!document.querySelector("[data-follow-button]"),
        small: controls.filter((el) => el.getBoundingClientRect().height < 39.5).map((el) => `${el.textContent.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().height)}`),
        hero: !!document.querySelector("[data-profile-hero]"),
        settings: !!document.querySelector("[data-account-settings]"),
        ownerScrolls: (() => { const n = document.querySelector("[data-profile-owner-pills] > div"); return n ? n.scrollWidth > n.clientWidth : null })(),
        subScrolls: (() => { const n = document.querySelector("[data-library-tabs]"); return n ? n.scrollWidth > n.clientWidth : null })(),
        last: [...document.querySelectorAll("[data-profile-activity-item]")].pop()?.getAttribute("data-profile-activity-item") ?? null,
        more: (() => { const b = document.querySelector("[data-header-profile-more]"); return b && shown(b) ? box(b) : null })(),
      }
    })

  for (const [label, vp] of VIEWPORTS) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}: /account, my own profile`)
    {
      const { p, errors } = await open(vp, "/account", { __photo: true })
      const m = await measure(p)
      await p.screenshot({ path: join(shots, `${label}-account.png`) })
      await p.screenshot({ path: join(shots, `${label}-account-full.png`), fullPage: true })
      expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
      expect(!!m.cover && m.cover.left === 0 && m.cover.w === m.width && m.coverRadius === "0px", "the cover runs edge to edge: the window's whole width, square corners", { cover: m.cover, radius: m.coverRadius })
      expect(!!m.cover && !!m.header && Math.abs(m.cover.top - m.header.bottom) <= 1, "  and starts right under the site header", { cover: m.cover?.top, header: m.header?.bottom })
      expect(!!m.cover && m.cover.h === (phone ? 128 : 256), "  the creator page's band height", m.cover?.h)
      expect(!!m.avatar && m.avatar.top < m.cover.bottom && m.avatar.bottom > m.cover.bottom && m.avatar.w === (phone ? 118 : 134), "the photo straddles the cover's edge, 118 / 134px", m.avatar)
      expect(/0px 0px 0px 2px/.test(m.ring || "") && !/0px 0px 0px 4px/.test(m.ring || ""), "  with a thin 2px ring", m.ring)
      expect(!/Joined/.test(m.heroText || ""), "no Joined line under the name", m.heroText)
      expect(!!m.edit && m.edit.text === "Edit profile" && m.edit.href === "/account/settings" && m.edit.h === 40 && m.edit.bg === "rgb(255, 255, 255)", "Edit profile is a white Storelib button, 40px, to /account/settings", m.edit)
      expect(!!m.edit && m.edit.top >= m.cover.top && m.edit.bottom <= m.cover.bottom, "  on the cover", { edit: m.edit, cover: m.cover })
      expect(!m.camera, "  and nothing beside it: no camera button for the cover (it is placed in Settings)", m.camera)
      if (phone) expect(m.edit.top - m.cover.top <= 16, "  top right on a phone, clear of the photo", { edit: m.edit, avatar: m.avatar })
      else expect(m.cover.bottom - m.edit.bottom <= 20 && m.edit.right <= (m.width + 960) / 2, "  at the foot of the band, inside the profile's column", { edit: m.edit, cover: m.cover })
      expect(m.owner.map((x) => x[0]).join() === "Activity,Communities,Library,Settings" && m.owner[0][1] === "true", "the four owner pills, Activity lit, no Edit profile pill", m.owner)
      expect(!m.follow, "no Follow on your own page", m.follow)
      expect(m.last === "joined_storelib", "the activity ends on the day you joined", m.last)
      if (phone) {
        expect(m.small.length === 0, "every pill and control is at least 40px", m.small)
        expect(!!m.more && m.more.w === 42 && m.more.h === 42, "the phone bar: a 42px \"...\" at the right, the size of the icons it replaces", m.more)
        expect(!!m.header && m.header.h === 65, "  the bar keeps its height, so moving to the library moves nothing", m.header?.h)
        expect(m.headerItems.every((t) => t === "More" || /storelib/i.test(t)) && m.headerItems.includes("More"), "  and nothing else but the logo: no navigator, heart, bell or photo", m.headerItems)
        await p.screenshot({ path: join(shots, `${label}-account-bar.png`), clip: { x: 0, y: 0, width: 390, height: 120 } })
        await p.click("[data-header-profile-more]")
        await sleep(600)
        const sheet = await p.evaluate(() => [...document.querySelectorAll("[data-profile-bar-sheet] [data-account-item], [data-app-sheet] [data-account-item='log-out']")].filter((e) => e.getBoundingClientRect().height > 0).map((e) => [e.getAttribute("data-account-item"), e.textContent.trim(), Math.round(e.getBoundingClientRect().height)]))
        await p.screenshot({ path: join(shots, `${label}-account-sheet.png`) })
        expect(sheet.map((r) => r[1]).join() === "Share profile,Settings,Language,Help,Log out", "the \"...\" opens Share profile, Settings, Language, Help, Log out", sheet)
        expect(sheet.every((r) => r[2] >= 44), "  each row a thumb's height", sheet.map((r) => r[2]))
        await p.click('[data-account-item="share-profile"]')
        await sleep(500)
        const copied = await p.evaluate(() => ({ copied: window.__copied, note: document.querySelector("[data-profile-share-note]")?.textContent?.trim() ?? null }))
        await p.screenshot({ path: join(shots, `${label}-account-copied.png`) })
        expect(copied.copied === "https://storelib.com/@alexmorgan" && copied.note === "Link copied", "Share profile without a share sheet copies the /@handle address and says so", copied)
      } else {
        expect(!m.more, "a computer's bar has no \"...\"", m.more)
        expect(["Wishlist", "My Library", "Library"].some((t) => m.headerItems.includes(t)) && m.headerItems.includes("Your account"), "  and keeps its heart, library and photo", m.headerItems)
      }
      await p.close()
    }

    if (phone) {
      console.log(`\n${label}: Share profile with the phone's own share sheet`)
      const { p } = await open(vp, "/account", { __photo: true }, { share: true })
      await p.click("[data-header-profile-more]")
      await sleep(600)
      await p.click('[data-account-item="share-profile"]')
      await sleep(400)
      const shared = await p.evaluate(() => ({ shared: window.__shared, copied: window.__copied ?? null }))
      expect(shared.shared?.url === "https://storelib.com/@alexmorgan" && shared.copied === null, "the share sheet is handed the /@handle address, nothing copied", shared)
      await p.close()
    }

    console.log(`\n${label}: /account/library, a page of its own`)
    {
      const { p, errors } = await open(vp, "/account/library", { __photo: true, __cover: true })
      const m = await measure(p)
      await p.screenshot({ path: join(shots, `${label}-library.png`) })
      await p.screenshot({ path: join(shots, `${label}-library-full.png`), fullPage: true })
      expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
      expect(!m.hero && !m.cover && m.owner.length === 0, "no profile header and no owner pills above it", { hero: m.hero, owner: m.owner })
      expect(m.title?.text === "Library" && m.title.tag === "H1" && m.title.size === (phone ? "24px" : "28px"), "its own title, Library", m.title)
      expect(m.sub.map((x) => x[0]).join() === "Products,Courses,Wishlist,Reviews,Receipts" && m.sub[0][1] === "true", "the five sub pills under it, Products lit (memberships are communities now)", m.sub)
      expect(!!m.title && m.subTop > m.title.bottom && !!m.header && m.title.top - m.header.bottom >= 12, "  title first, the pills under it, with room under the site header", { header: m.header?.bottom, title: m.title, sub: m.subTop })
      if (phone) {
        expect(m.small.length === 0, "every pill and control is at least 40px", m.small)
        expect(m.subScrolls === true, "the sub pills scroll sideways inside their row", m.subScrolls)
        expect(!m.more && m.headerItems.includes("Wishlist"), "the phone's usual bar here, not the profile's", m.headerItems)
      }
      /* A sub pill answers the press, not the page. */
      await p.evaluate(() => { window.__navMs = 600 })
      await p.evaluate(() => document.querySelector('[data-library-tab="Courses"]').scrollIntoView({ block: "nearest", inline: "nearest" }))
      await p.click('[data-library-tab="Courses"]')
      await sleep(50)
      const lit = await p.evaluate(() => ({ active: document.querySelector('[data-library-tab="Courses"]').getAttribute("data-active"), links: window.__links }))
      expect(lit.active === "true" && lit.links.includes("/account/library/courses"), "pressed, Courses lights at once, before the page answers", lit)
      await sleep(800)
      const after = await measure(p)
      expect(after.title?.text === "Library" && !after.hero, "  the courses page keeps the title and no profile header", after.title)
      await p.screenshot({ path: join(shots, `${label}-library-courses.png`) })
      await p.close()
    }

    console.log(`\n${label}: Settings`)
    {
      const { p, errors } = await open(vp, "/account/settings", { __photo: true })
      const m = await measure(p)
      await p.screenshot({ path: join(shots, `${label}-settings.png`) })
      expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
      expect(!m.cover && !m.hero && m.owner.length === 0 && m.settings, "the header steps aside: Settings' own photo is the one face", m)
      const coverField = await p.evaluate(() => !!document.querySelector("[data-account-cover-field]"))
      expect(coverField, "Settings offers the cover, in the creator editor's upload box", coverField)
      if (phone) expect(!m.more, "the phone's usual bar here", m.headerItems)
      await p.close()
    }

    /* Privacy: a creator shows no activity anywhere, so has no switch for it; the communities switch still drives their card in a community. */
    for (const creator of [false, true]) {
      console.log(`\n${label}: Settings, Privacy, ${creator ? "a creator" : "a buyer"}`)
      const { p, errors } = await open(vp, "/account/settings", { __photo: true, __section: "privacy", __creator: creator })
      const rows = await p.evaluate(() => ({
        switches: [...document.querySelectorAll("[data-account-card=privacy] [role=switch]")].map((b) => b.getAttribute("aria-label")),
        text: document.querySelector("[data-account-card=privacy]")?.innerText.replace(/\s+/g, " ") ?? "",
        sideways: document.documentElement.scrollWidth - innerWidth,
      }))
      await p.screenshot({ path: join(shots, `${label}-settings-privacy-${creator ? "creator" : "buyer"}.png`) })
      expect(errors.length === 0 && rows.sideways <= 0, "nothing sideways, no errors", { errors, sideways: rows.sideways })
      if (creator) expect(rows.switches.join() === "Show communities I am in" && !/activity/i.test(rows.text), "a creator: only Show communities I am in, and the word activity nowhere", rows)
      else expect(rows.switches.join() === "Show my activity,Show communities I am in", "a buyer: both switches", rows)
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`${broken} failed`)
  process.exit(1)
}
console.log("all passed")
