/**
 * ===========================================================================
 *  PROFILES AND FOLLOWS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-profile.tsx) at 1440x900 and on a
 * 390x844 phone:
 *
 *   SOMEBODY ELSE   the photo straddles the band's lower edge, the name is
 *                   centred, Follow and Message are there (Message to the
 *                   community's ?dm= link), the way back is a chevron in a
 *                   top bar beside their photo; Follow turns into Following
 *                   with a check, a pointer over it says Unfollow (not right
 *                   after the press), the count goes up by one; the
 *                   followers count opens the list and Show more loads the
 *                   next page; "In Clay Studio" lists six posts and Older /
 *                   Newer page through them without the list jumping; the
 *                   Activity tab's Show more adds the next page and the
 *                   list ends on "Joined Storelib"
 *   YOUR OWN        the owner's pills (Activity lit), no Follow, the "only
 *                   you" line, Add cover on the band
 *   CREATOR PAGE    the way back is the newsletter bar's first thing, before
 *                   the photo; the follow block under the bio, centred, the
 *                   follower count printed once; Follow is filled in the
 *                   scheme's own button colour (Sage green, Astrid blue on
 *                   black); with no newsletter bar the slim top bar carries
 *                   the chevron, the photo and the name
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
  /* Headless Chromium says it has no hover at all, so a pointer over a button never matches Tailwind's hover: variants; a computer has one. */
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] })
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
      expect(!!geo.back && geo.back.top < geo.cover.top && geo.back.h >= 40, "the way back is in the top bar above the band, 40px to a thumb", { back: geo.back, cover: geo.cover?.top })
      const bar = await p.evaluate(() => {
        const bar = document.querySelector("[data-profile-top-bar]")?.getBoundingClientRect()
        const chev = document.querySelector("[data-profile-top-bar] [data-profile-back-button]")?.getBoundingClientRect()
        const face = document.querySelector("[data-profile-top-bar] [data-slot=avatar], [data-profile-top-bar] span[class*='rounded-full']")?.getBoundingClientRect()
        return bar && chev && face ? { barH: Math.round(bar.height), chevRight: Math.round(chev.right), faceLeft: Math.round(face.left), name: document.querySelector("[data-profile-top-bar-name]")?.textContent, pill: !!document.querySelector("[data-profile-back] .rounded-full.border") } : null
      })
      expect(!!bar && bar.faceLeft >= bar.chevRight && bar.faceLeft - bar.chevRight <= 16 && bar.name === "Sam Rivera", "the chevron sits right beside their photo and name, in the bar", bar)
      expect(geo.follow === "Follow" && geo.message && geo.pills === 0, "Follow and Message, no owner pills", geo)
      const dm = await p.evaluate(() => document.querySelector("[data-profile-message]")?.getAttribute("href"))
      expect(/^\/community\/clay-studio\?dm=[0-9a-f-]{36}$/.test(dm || ""), "Message opens the conversation in the community (?dm=), never a member page", dm)
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
      expect(/Following/.test(after.text) && Number(after.n) === Number(before) + 1, "Follow: Following, and one more follower", { before, after })
      const hover = await p.evaluate(() => {
        const vis = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).visibility : null }
        return { check: !!document.querySelector("[data-follow-button] svg"), following: vis("[data-follow-label=following]"), unfollow: vis("[data-follow-label=unfollow]") }
      })
      if (!phone) {
        /* The pointer that pressed Follow is still on it: no Unfollow until it has left. */
        expect(hover.check && hover.following === "visible" && hover.unfollow === "hidden", "Following has a check, and no Unfollow under the pointer that just followed", hover)
        const w0 = await p.evaluate(() => Math.round(document.querySelector("[data-follow-button]").getBoundingClientRect().width))
        await p.mouse.move(5, 5)
        await frames(p, 2)
        await p.hover("[data-follow-button]")
        await frames(p, 2)
        const back = await p.evaluate(() => ({ following: getComputedStyle(document.querySelector("[data-follow-label=following]")).visibility, unfollow: getComputedStyle(document.querySelector("[data-follow-label=unfollow]")).visibility, w: Math.round(document.querySelector("[data-follow-button]").getBoundingClientRect().width), color: getComputedStyle(document.querySelector("[data-follow-button]")).color }))
        expect(back.following === "hidden" && back.unfollow === "visible" && back.w === w0, "hovering Following again says Unfollow, at the same width", { ...back, w0 })
        await p.screenshot({ path: join(shots, `${label}-other-unfollow-hover.png`), clip: { x: 0, y: 0, width: vp.width, height: 560 } })
        await p.mouse.move(5, 5)
      }
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

      /* In Clay Studio: six posts, then Older and Newer. */
      const sh0 = await p.evaluate(() => {
        const sec = document.querySelector("[data-shared-community=clay-studio]")
        sec?.scrollIntoView()
        const list = sec?.querySelector("ul")
        return { posts: sec?.querySelectorAll("[data-shared-post]").length, h: list ? Math.round(list.getBoundingClientRect().height) : 0, page: sec?.querySelector("[data-shared-page]")?.textContent, newerDisabled: sec?.querySelector("[data-shared-newer]")?.disabled, heading: sec?.querySelector("h2")?.textContent }
      })
      expect(sh0.posts === 6 && sh0.page === "Page 1" && sh0.newerDisabled === true && sh0.heading === "In Clay Studio", "In Clay Studio: six posts, page 1, Newer off", sh0)
      await p.screenshot({ path: join(shots, `${label}-other-shared.png`) })
      await p.click("[data-shared-older]")
      await new Promise((r) => setTimeout(r, 40))
      const mid = await p.evaluate(() => { const l = document.querySelector("[data-shared-community=clay-studio] ul"); return { h: Math.round(l.getBoundingClientRect().height), busy: l.getAttribute("aria-busy") } })
      expect(mid.busy === "true" && mid.h >= sh0.h - 1, "while the next page comes the list keeps its height", { mid, before: sh0.h })
      await new Promise((r) => setTimeout(r, 300))
      const sh1 = await p.evaluate(() => { const sec = document.querySelector("[data-shared-community=clay-studio]"); return { posts: sec.querySelectorAll("[data-shared-post]").length, page: sec.querySelector("[data-shared-page]").textContent, olderDisabled: sec.querySelector("[data-shared-older]").disabled } })
      expect(sh1.posts === 3 && sh1.page === "Page 2" && sh1.olderDisabled, "Older: the next three, page 2, nothing older", sh1)
      const asked = await p.evaluate(() => window.__fetches.filter((u) => u.startsWith("/api/profile/shared-posts")))
      await p.click("[data-shared-newer]")
      await frames(p, 2)
      const sh2 = await p.evaluate(() => ({ posts: document.querySelectorAll("[data-shared-community=clay-studio] [data-shared-post]").length, asked: window.__fetches.filter((u) => u.startsWith("/api/profile/shared-posts")).length }))
      expect(sh2.posts === 6 && sh2.asked === asked.length && asked.length === 1 && /cursor=c2/.test(asked[0]), "Newer is the page already seen, not asked again", { sh2, asked })
      if (phone) {
        const small = await smallTargets(p, "[data-shared-pager]")
        expect(small.length === 0, "the pager's buttons are at least 40px", small)
      }

      /* Activity: Show more. */
      const n0 = await p.evaluate(() => document.querySelectorAll("[data-profile-activity-item]").length)
      await p.evaluate(() => document.querySelector("[data-profile-activity-more]").scrollIntoView())
      await p.click("[data-profile-activity-more]")
      await new Promise((r) => setTimeout(r, 300))
      const n1 = await p.evaluate(() => ({ n: document.querySelectorAll("[data-profile-activity-item]").length, more: !!document.querySelector("[data-profile-activity-more]") }))
      expect(n0 === 5 && n1.n === 7 && !n1.more, "Activity: Show more adds the next page, and the list ends on Joined Storelib", { n0, n1 })
      const last = await p.evaluate(() => [...document.querySelectorAll("[data-profile-activity-item]")].pop()?.getAttribute("data-profile-activity-item"))
      expect(last === "joined_storelib", "the last line is the day they joined", last)

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
        geo.pills.map((x) => x[0]).join() === "Activity,Communities,Library,Edit profile,Settings" && geo.pills[2][1] === "/account/library" && geo.pills[4][1] === "/account/settings?section=account",
        "the profile center's pills: Activity, Communities, Library, Edit profile, Settings",
        geo.pills,
      )
      const lit = await p.evaluate(() => document.querySelector("[data-profile-owner-pill][data-active=true]")?.getAttribute("data-profile-owner-pill"))
      const cover = await p.evaluate(() => document.querySelector("[data-profile-cover-edit]")?.textContent?.trim())
      expect(!geo.follow && geo.onlyYou && !geo.back && lit === "activity" && cover === "Add cover", "no Follow, the only-you line, no back bar, Activity lit, Add cover on the band", { ...geo, lit, cover })
      if (phone) {
        expect(geo.pillsOverflow === true, "on a phone the pills scroll sideways inside their row", geo.pillsOverflow)
        const small = await smallTargets(p, "[data-profile-owner-pills], [data-profile-social]")
        expect(small.length === 0, "pills and counts are at least 40px", small)
      }
      await p.close()
    }

    for (const which of ["creator", "creator-dark", "creator-nobar"]) {
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
      const fill = await p.evaluate(() => { const b = document.querySelector("[data-storefront-follow] [data-follow-button]"); const cs = b && getComputedStyle(b); return cs && { bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius, tone: b.getAttribute("data-follow-tone"), msgRadius: getComputedStyle(document.querySelector("[data-storefront-follow] [data-profile-message]")).borderTopLeftRadius } })
      const want = which === "creator-dark" ? "rgb(37, 99, 235)" : "rgb(47, 93, 70)"
      expect(fill?.tone === "scheme" && fill.bg === want && fill.color === "rgb(255, 255, 255)", `Follow is filled in the scheme's own button colour (${which === "creator-dark" ? "Astrid" : "Sage"})`, fill)
      expect(fill?.radius === fill?.msgRadius, "Message has the scheme's rounding too", fill)
      const back = await p.evaluate(() => {
        const shown = (list) => [...list].map((el) => el.getBoundingClientRect()).find((r) => r.width > 0 && r.height > 0)
        const chev = shown(document.querySelectorAll("[data-profile-back-button]"))
        const scope = document.querySelector("[data-profile-top-bar]") || document.querySelector(".subscribe-bar-fixed, [class*=subscribe-bar-border]")
        const fr = scope ? shown(scope.querySelectorAll("[data-slot=avatar], span[class*='rounded-full']")) : null
        const header = document.querySelector("[data-storefront-follow]")?.getBoundingClientRect()
        return chev && fr ? { chevTop: Math.round(chev.top), chevRight: Math.round(chev.right), faceLeft: Math.round(fr.left), gap: Math.round(fr.left - chev.right), sameRow: Math.abs((chev.top + chev.height / 2) - (fr.top + fr.height / 2)) <= 3, belowHeader: header ? chev.top > header.top : false, pill: !!document.querySelector("[data-profile-back] .border") } : null
      })
      expect(!!back && back.sameRow && back.gap >= 0 && back.gap <= 16 && !back.belowHeader && !back.pill, "the way back is a chevron in the top bar, right before the photo, not a pill under it", back)
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
