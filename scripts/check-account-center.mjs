/**
 * ===========================================================================
 *  /ACCOUNT AS THE PROFILE CENTER, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real hub (components/account/account-hub.tsx) with the real pages
 * under it, from scripts/render-account-hub.tsx, at 1440x900 and on a
 * 390x844 phone:
 *
 *   ACTIVITY        /account: the profile's own header (cover, photo across
 *                   its edge, name, counts), the five owner pills with
 *                   Activity lit, Add cover on the band, the activity ending
 *                   on "Joined Storelib"
 *   LIBRARY         /account/library: the Library pill lit and under it the
 *                   six sub pills, Products lit, then the products list;
 *                   on a phone both rows scroll sideways inside themselves
 *   A SUB PILL      pressed, it lights at once, before the page answers
 *   EDIT / SETTINGS the header steps aside: one face on the screen
 *   EVERYWHERE      nothing sideways; every pill and control at least 40px
 *                   tall on a phone (the library's sub pills are 40 there,
 *                   36 on a computer)
 *
 *   PROBE_CSS=source node scripts/check-account-center.mjs
 * Screenshots go to SHOTS_DIR (printed at the end).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
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

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
let path = window.__path || "/account"
let search = window.__search || ""
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const go = (href) => { const [p, q] = href.split("?"); path = p; search = q || ""; window.__arrivedAt = performance.now(); subs.forEach((f) => f()) }
const router = { push: (h) => setTimeout(() => go(h), window.__navMs ?? 60), replace: go, prefetch: () => {}, back: () => {}, refresh: () => {} }
window.__go = go
export const usePathname = () => useSyncExternalStore(subscribe, () => path, () => path)
export const useSearchParams = () => { const s = useSyncExternalStore(subscribe, () => search, () => search); return new URLSearchParams(s) }
export const useRouter = () => router
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => {
    rest.onClick && rest.onClick(e)
    e.preventDefault()
    ;(window.__links ||= []).push(href)
    window.__pressedAt = performance.now()
    setTimeout(() => window.__go(href), window.__navMs ?? 60)
  } }, children)
})
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-account-hub.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.account-center-probe/navigation.js", "next/link": "./.account-center-probe/link.jsx", "next/image": "./.account-center-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const VIEWPORTS = [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]
  const open = async (vp, path, globals = {}) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(URL_BASE) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 404, body: "" })))
    await p.evaluateOnNewDocument((path, globals) => {
      window.__path = path
      Object.assign(window, globals)
    }, path, globals)
    await p.goto(URL_BASE, { waitUntil: "load" })
    await sleep(300)
    return { p, errors }
  }
  const measure = (p) =>
    p.evaluate(() => {
      const r = (el) => el?.getBoundingClientRect() ?? null
      const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden" }
      const column = document.querySelector("[data-probe-account-column]")
      const cover = r(document.querySelector("[data-profile-cover]"))
      const avatar = r(document.querySelector("[data-profile-header] [data-slot=avatar], [data-profile-header] span[class*='rounded-full']"))
      const owner = [...document.querySelectorAll("[data-profile-owner-pill]")]
      const sub = [...document.querySelectorAll("[data-library-tab]")]
      const controls = [...column.querySelectorAll("[data-profile-owner-pills] a, [data-library-tabs] a, [data-profile-cover-edit], [data-profile-count]")].filter(shown)
      return {
        sideways: document.documentElement.scrollWidth - innerWidth,
        cover: cover && { top: Math.round(cover.top), bottom: Math.round(cover.bottom) },
        avatar: avatar && { top: Math.round(avatar.top), bottom: Math.round(avatar.bottom), w: Math.round(avatar.width) },
        name: document.querySelector("[data-profile-name]")?.textContent,
        owner: owner.map((a) => [a.textContent.trim(), a.getAttribute("data-active")]),
        sub: sub.map((a) => [a.textContent.trim(), a.getAttribute("data-active")]),
        ownerBottom: owner[0] ? Math.round(owner[0].getBoundingClientRect().bottom) : null,
        subTop: sub[0] ? Math.round(sub[0].getBoundingClientRect().top) : null,
        coverEdit: document.querySelector("[data-profile-cover-edit]")?.textContent?.trim() ?? null,
        follow: !!document.querySelector("[data-follow-button]"),
        small: controls.filter((el) => el.getBoundingClientRect().height < 39.5).map((el) => `${el.textContent.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().height)}`),
        hero: !!document.querySelector("[data-profile-hero]"),
        settings: !!document.querySelector("[data-account-settings]"),
        ownerScrolls: (() => { const n = document.querySelector("[data-profile-owner-pills] > div"); return n ? n.scrollWidth > n.clientWidth : null })(),
        subScrolls: (() => { const n = document.querySelector("[data-library-tabs]"); return n ? n.scrollWidth > n.clientWidth : null })(),
        last: [...document.querySelectorAll("[data-profile-activity-item]")].pop()?.getAttribute("data-profile-activity-item") ?? null,
        products: document.querySelectorAll("[data-library-home] [data-library-row], [data-library-home] li").length,
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
      expect(!!m.avatar && m.avatar.top < m.cover.bottom && m.avatar.bottom > m.cover.bottom && m.avatar.w === (phone ? 112 : 128), "the profile's own header: the photo straddles the cover's edge", m)
      expect(m.owner.map((x) => x[0]).join() === "Activity,Communities,Library,Edit profile,Settings" && m.owner[0][1] === "true", "the five owner pills, Activity lit", m.owner)
      expect(!m.follow && m.coverEdit === "Add cover", "no Follow on your own page; Add cover on the band", { follow: m.follow, cover: m.coverEdit })
      expect(m.last === "joined_storelib", "the activity ends on the day you joined", m.last)
      if (phone) {
        expect(m.small.length === 0, "every pill and control is at least 40px", m.small)
        expect(m.ownerScrolls === true, "the pills scroll sideways inside their row", m.ownerScrolls)
      }
      await p.close()
    }

    console.log(`\n${label}: /account/library, the library inside the profile`)
    {
      const { p, errors } = await open(vp, "/account/library", { __photo: true, __cover: true })
      const m = await measure(p)
      await p.screenshot({ path: join(shots, `${label}-library.png`) })
      await p.screenshot({ path: join(shots, `${label}-library-full.png`), fullPage: true })
      expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
      expect(m.owner.find((x) => x[0] === "Library")?.[1] === "true", "the Library pill is lit", m.owner)
      expect(m.sub.map((x) => x[0]).join() === "Products,Courses,Memberships,Wishlist,Reviews,Receipts" && m.sub[0][1] === "true", "the six sub pills under it, Products lit", m.sub)
      expect(m.subTop > m.ownerBottom, "the sub pills sit under the owner pills", { owner: m.ownerBottom, sub: m.subTop })
      expect(m.coverEdit === "Change cover", "with a cover, the band offers Change cover", m.coverEdit)
      if (phone) {
        expect(m.small.length === 0, "every pill and control is at least 40px", m.small)
        expect(m.subScrolls === true, "the sub pills scroll sideways inside their row", m.subScrolls)
      }
      /* A sub pill answers the press, not the page. */
      await p.evaluate(() => { window.__navMs = 600 })
      await p.evaluate(() => document.querySelector('[data-library-tab="Courses"]').scrollIntoView({ block: "nearest", inline: "nearest" }))
      await p.click('[data-library-tab="Courses"]')
      await sleep(50)
      const lit = await p.evaluate(() => ({ active: document.querySelector('[data-library-tab="Courses"]').getAttribute("data-active"), links: window.__links }))
      expect(lit.active === "true" && lit.links.includes("/account/library/courses"), "pressed, Courses lights at once, before the page answers", lit)
      await sleep(800)
      await p.screenshot({ path: join(shots, `${label}-library-courses.png`) })
      await p.close()
    }

    console.log(`\n${label}: Edit profile and Settings`)
    {
      const { p, errors } = await open(vp, "/account/settings", { __photo: true })
      const m = await measure(p)
      await p.screenshot({ path: join(shots, `${label}-settings.png`) })
      expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
      expect(!m.cover && !m.hero && m.owner.length === 0 && m.settings, "the header steps aside: Settings' own photo is the one face", m)
      const coverField = await p.evaluate(() => !!document.querySelector("[data-account-cover-field]"))
      expect(coverField, "Settings offers the cover, in the creator editor's upload box", coverField)
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
