/**
 * ===========================================================================
 *  PROFILES AND FOLLOWS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-profile.tsx) at 1440x900 and on a
 * 390x844 phone:
 *
 *   SOMEBODY ELSE   the photo straddles the band's lower edge, the name is
 *                   centred, Follow and Message are there, the back bar is
 *                   at the top; Follow turns into Following and the count
 *                   goes up by one; the followers count opens the list (a
 *                   dialog on a computer, the bottom sheet on a phone) and
 *                   Show more loads the next page; the Activity tab's Show
 *                   more adds the next page
 *   YOUR OWN        the five pills, no Follow, the "only you" line
 *   CREATOR PAGE    the follow block under the bio, centred, the follower
 *                   count printed once; on a dark scheme the button is in
 *                   the page's own text colour
 *   EVERYWHERE      nothing scrolls sideways; on a phone every control of
 *                   ours a finger presses is at least 40px tall
 *
 *   PROBE_CSS=source node scripts/check-profile.mjs
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
const stubs = join(root, ".profile-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-profile-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const frames = (p, n = 2) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`,
  )
  writeFileSync(
    join(stubs, "image.jsx"),
    `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-profile.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.profile-probe/navigation.js", "next/link": "./.profile-probe/link.jsx", "next/image": "./.profile-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const VIEWPORTS = [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]
  const open = async (vp, which) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.goto(`file://${join(stubs, "index.html")}?${which}`, { waitUntil: "load" })
    await frames(p, 3)
    return { p, errors }
  }
  const noSideways = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }))
  const smallTargets = (p, scope) =>
    p.evaluate((scope) => {
      const out = []
      for (const el of document.querySelectorAll(scope.split(",").flatMap((w) => [`${w.trim()} a`, `${w.trim()} button`]).join(", "))) {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || style.display === "none" || style.visibility === "hidden") continue
        if (el.tagName === "A" && style.display === "inline" && el.closest("p")) continue
        if (r.height < 40) out.push({ text: (el.textContent || "").trim().slice(0, 30), h: Math.round(r.height) })
      }
      return out
    }, scope)

  for (const [label, vp] of VIEWPORTS) {
    const phone = label.startsWith("phone")

    console.log(`\n${label}: somebody else's profile`)
    {
      const { p, errors } = await open(vp, "other")
      await p.screenshot({ path: join(shots, `${label}-other-top.png`) })
      await p.screenshot({ path: join(shots, `${label}-other-full.png`), fullPage: true })
      const side = await noSideways(p)
      expect(side.doc <= side.win && errors.length === 0, "nothing sideways, no errors", { side, errors })
      const geo = await p.evaluate(() => {
        const r = (s) => document.querySelector(s)?.getBoundingClientRect() ?? null
        const cover = r("[data-profile-cover]")
        const avatar = r("[data-profile-header] [data-slot=avatar], [data-profile-header] span[class*='rounded-full']")
        const name = r("[data-profile-name]")
        return {
          cover: cover && { top: Math.round(cover.top), bottom: Math.round(cover.bottom) },
          avatar: avatar && { top: Math.round(avatar.top), bottom: Math.round(avatar.bottom), cx: Math.round(avatar.left + avatar.width / 2), w: Math.round(avatar.width) },
          nameCx: name ? Math.round(name.left + name.width / 2) : null,
          back: (() => { const b = r("[data-profile-back-button]"); return b && { top: Math.round(b.top), h: Math.round(b.height) } })(),
          follow: document.querySelector("[data-follow-button]")?.textContent?.trim(),
          message: !!document.querySelector("[data-profile-message]"),
          pills: document.querySelectorAll("[data-profile-owner-pill]").length,
          tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()),
          col: (() => { const m = r("[data-member-profile]"); return m && Math.round(m.left + m.width / 2) })(),
        }
      })
      expect(!!geo.avatar && geo.avatar.top < geo.cover.bottom && geo.avatar.bottom > geo.cover.bottom, "the photo straddles the band's lower edge", geo)
      expect(geo.avatar && Math.abs(geo.avatar.w - (phone ? 112 : 128)) <= 1, `the photo is ${phone ? 112 : 128}px`, geo.avatar?.w)
      expect(Math.abs(geo.nameCx - geo.col) <= 2 && Math.abs(geo.avatar.cx - geo.col) <= 2, "name and photo are centred on the column", { name: geo.nameCx, avatar: geo.avatar?.cx, col: geo.col })
      expect(!!geo.back && geo.back.top < geo.cover.top, "the back bar is above the band", { back: geo.back?.top, cover: geo.cover?.top })
      expect(geo.follow === "Follow" && geo.message && geo.pills === 0, "Follow and Message, no owner pills", geo)
      expect(geo.tabs.join() === "Activity,Communities", "tabs: Activity and Communities (no Products for a buyer)", geo.tabs)
      if (phone) {
        const small = await smallTargets(p, "[data-profile-social], [data-profile-back], [data-profile-activity]")
        expect(small.length === 0, "every control of ours is at least 40px", small)
        /* The tab row is the creator page's own (components/storefront/storefront-tabs), shared as it is: measured, not ours to change here. */
        const tabs = await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].map((t) => Math.round(t.getBoundingClientRect().height)))
        console.log(`  info  the shared tab row's tabs are ${tabs.join(", ")}px tall`)
      }

      /* Follow. */
      const before = await p.evaluate(() => document.querySelector("[data-profile-count=followers] span").textContent)
      await p.click("[data-follow-button]")
      await frames(p, 4)
      const after = await p.evaluate(() => ({ text: document.querySelector("[data-follow-button]").textContent.trim(), n: document.querySelector("[data-profile-count=followers] span").textContent, fetches: window.__fetches }))
      expect(after.text === "Following" && Number(after.n) === Number(before) + 1, "Follow: Following, and one more follower", { before, after })
      expect(after.fetches.some((u) => u === "/api/follow"), "asked the follow route", after.fetches)
      await p.screenshot({ path: join(shots, `${label}-other-following.png`) })

      /* Back, with nothing behind it (a link opened in a new tab): history.back() does nothing here. */
      await p.evaluate(() => { history.back = () => {} })
      await p.click("[data-profile-back-button]")
      await new Promise((r) => setTimeout(r, 1100))
      const went = await p.evaluate(() => (window.__router || []).map(([k, h]) => `${k}:${h}`))
      expect(went.includes("push:/explore"), "Back with nothing behind lands on Explore", went)

      /* The followers list. */
      await p.evaluate(() => window.scrollTo(0, 0))
      await p.click("[data-profile-count=followers]")
      await new Promise((r) => setTimeout(r, 600))
      const list = await p.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-follow-person]")]
        const body = document.querySelector("[data-follow-list-body]")
        const box = body?.closest("[role=dialog]")?.getBoundingClientRect() ?? body?.parentElement?.getBoundingClientRect()
        return { rows: rows.length, rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : 0, more: !!document.querySelector("[data-follow-list-more]"), box: box && { top: Math.round(box.top), bottom: Math.round(box.bottom), w: Math.round(box.width) } }
      })
      expect(list.rows === 20 && list.more, "the list opens with the first page and Show more", list)
      expect(list.rowH >= 56, "rows are at least 56px", list.rowH)
      await p.screenshot({ path: join(shots, `${label}-followers.png`) })
      await p.evaluate(() => document.querySelector("[data-follow-list-more]").scrollIntoView())
      await p.click("[data-follow-list-more]")
      await new Promise((r) => setTimeout(r, 300))
      const more = await p.evaluate(() => ({ rows: document.querySelectorAll("[data-follow-person]").length, more: !!document.querySelector("[data-follow-list-more]") }))
      expect(more.rows === 30 && !more.more, "Show more adds the next page, then there is no more", more)
      if (phone) {
        const small = await smallTargets(p, "[data-follow-list]")
        expect(small.length === 0, "the list's controls are at least 40px", small)
      }
      await p.keyboard.press("Escape")
      await new Promise((r) => setTimeout(r, 500))

      /* Activity: Show more. */
      const n0 = await p.evaluate(() => document.querySelectorAll("[data-profile-activity-item]").length)
      await p.evaluate(() => document.querySelector("[data-profile-activity-more]").scrollIntoView())
      await p.click("[data-profile-activity-more]")
      await new Promise((r) => setTimeout(r, 300))
      const n1 = await p.evaluate(() => ({ n: document.querySelectorAll("[data-profile-activity-item]").length, more: !!document.querySelector("[data-profile-activity-more]") }))
      expect(n0 === 5 && n1.n === 6 && !n1.more, "Activity: Show more adds the next page", { n0, n1 })

      /* The Communities tab. */
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Communities").click())
      await frames(p, 3)
      await p.evaluate(() => document.querySelector("[data-profile-tabs]").scrollIntoView())
      await p.screenshot({ path: join(shots, `${label}-other-communities.png`) })
      const cards = await p.evaluate(() => document.querySelectorAll("[data-profile-communities] [data-community-card]").length)
      expect(cards === 2, "the communities they are in", cards)
      await p.close()
    }

    console.log(`\n${label}: your own profile`)
    {
      const { p, errors } = await open(vp, "self")
      await p.screenshot({ path: join(shots, `${label}-self-top.png`) })
      const side = await noSideways(p)
      const geo = await p.evaluate(() => ({
        pills: [...document.querySelectorAll("[data-profile-owner-pill]")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
        follow: !!document.querySelector("[data-follow-button]"),
        onlyYou: !!document.querySelector("[data-profile-only-you]"),
        back: !!document.querySelector("[data-profile-back]"),
        pillsOverflow: (() => { const n = document.querySelector("[data-profile-owner-pills] > div"); return n ? n.scrollWidth > n.clientWidth : null })(),
      }))
      expect(side.doc <= side.win && errors.length === 0, "nothing sideways, no errors", { side, errors })
      expect(
        geo.pills.map((x) => x[0]).join() === "Library,Courses,Communities,Edit profile,Settings" && geo.pills[4][1] === "/account/settings?section=account",
        "the five pills, Settings on the Account section",
        geo.pills,
      )
      expect(!geo.follow && geo.onlyYou && !geo.back, "no Follow, the only-you line, no back bar", geo)
      if (phone) {
        expect(geo.pillsOverflow === true, "on a phone the pills scroll sideways inside their row", geo.pillsOverflow)
        const small = await smallTargets(p, "[data-profile-owner-pills], [data-profile-social]")
        expect(small.length === 0, "pills and counts are at least 40px", small)
      }
      await p.close()
    }

    for (const which of ["creator", "creator-dark"]) {
      console.log(`\n${label}: ${which}`)
      const { p, errors } = await open(vp, which)
      await p.screenshot({ path: join(shots, `${label}-${which}.png`) })
      const side = await noSideways(p)
      const geo = await p.evaluate(() => {
        const row = document.querySelector("[data-storefront-follow]")
        const r = row?.querySelector("[data-profile-actions]")?.getBoundingClientRect()
        const btn = document.querySelector("[data-storefront-follow] [data-follow-button]")
        const counts = document.querySelector("[data-storefront-follow] [data-profile-counts]")
        return {
          row: !!row,
          actionsCx: r ? Math.round(r.left + r.width / 2) : null,
          btnColor: btn ? getComputedStyle(btn).color : null,
          counts: counts?.textContent,
          metaFollowers: [...document.querySelectorAll("span")].filter((s) => /\bfollowers\b/.test(s.textContent || "") && !s.closest("[data-storefront-follow]") && s.children.length < 3).length,
          w: window.innerWidth,
        }
      })
      expect(side.doc <= side.win && errors.length === 0, "nothing sideways, no errors", { side, errors })
      expect(geo.row && Math.abs(geo.actionsCx - geo.w / 2) <= 2, "the follow block sits under the bio, centred", geo)
      expect(/1\.3k\s*followers/.test(geo.counts || "") && /64\s*following/.test(geo.counts || ""), "followers and following", geo.counts)
      expect(geo.metaFollowers === 0, "the follower count is printed once", geo.metaFollowers)
      if (which === "creator-dark") expect(geo.btnColor === "rgb(245, 245, 244)", "on a dark scheme the button is the page's text colour", geo.btnColor)
      if (phone) {
        const small = await smallTargets(p, "[data-storefront-follow], [data-profile-back]")
        expect(small.length === 0, "the follow block's controls are at least 40px", small)
      }
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
