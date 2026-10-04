/**
 * ===========================================================================
 *  PROFILES, CREATOR PAGES AND FOLLOWS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-profile.tsx) at 1440x900 and on
 * phones 320, 390 and 430 wide:
 *
 *   SOMEBODY ELSE   the photo (118 / 134px, five percent up) straddles the
 *                   band's lower edge, the name is centred, Follow and
 *                   Message are there (Message to the community's ?dm=
 *                   link), the way back is a chevron in a top bar beside
 *                   their photo; Follow turns into Following with a check,
 *                   a pointer over it says Unfollow (not right after the
 *                   press), the count goes up by one; followers and
 *                   following are one quiet line that opens nothing; "In
 *                   Clay Studio" pages six posts at a time; the Activity
 *                   tab's Show more adds the next page
 *   YOUR OWN        the owner's pills (Activity lit), no Follow, the "only
 *                   you" line, Add cover on the band
 *   CREATOR PAGE    light (Sage) and dark (Astrid) schemes: the photo is
 *                   158px (150 + 5%) with a ring in the page's own
 *                   background; no sales anywhere in the hero, Sales sit in
 *                   About beside Joined and Products above the payment
 *                   methods; the way back is a chevron INSIDE the top bar,
 *                   icon only, and it answers a press on the next frame; on
 *                   a phone the newsletter bar is one row (back, photo,
 *                   email, Subscribe) from 320 to 430 wide, Subscribed
 *                   included; Follow is Storelib's primary in the scheme's
 *                   buy colour, Following and Message the quiet secondary in
 *                   the scheme's surface, all one height and rounding; with
 *                   no newsletter bar the slim top bar carries the chevron;
 *                   opened cold, no chevron at all
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
    ["phone-320", { width: 320, height: 700, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone-430", { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]
  const open = async (vp, which) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    /* Every page starts as a new visitor: the bar remembers a subscription in localStorage, which file:// pages share. */
    await p.evaluateOnNewDocument(() => { try { localStorage.clear() } catch {} })
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
    /* The profiles are measured at 1440 and 390; the creator page at every width. */
    const profiles = label === "desktop-1440" || label === "phone-390"

    if (profiles) {
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
        const ring = document.querySelector("[data-profile-header] [class*='ring-2']")
        return {
          cover: cover && { top: Math.round(cover.top), bottom: Math.round(cover.bottom), left: Math.round(cover.left), w: Math.round(cover.width), h: Math.round(cover.height), radius: getComputedStyle(document.querySelector("[data-profile-cover]")).borderTopLeftRadius },
          win: innerWidth,
          ring: ring ? getComputedStyle(ring).boxShadow : null,
          joined: /Joined/.test(document.querySelector("[data-profile-header]")?.textContent || ""),
          ownerControls: !!document.querySelector("[data-profile-cover-actions]"),
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
      expect(!!geo.cover && geo.cover.left === 0 && geo.cover.w === geo.win && geo.cover.radius === "0px" && geo.cover.h === (phone ? 128 : 256), "the band runs edge to edge, square, the creator page's height", geo.cover)
      expect(!geo.joined && /0px 0px 0px 2px/.test(geo.ring || "") && !geo.ownerControls, "no Joined line, a thin 2px ring, no owner controls on somebody else's band", { joined: geo.joined, ring: geo.ring, owner: geo.ownerControls })
      expect(!!geo.avatar && geo.avatar.top < geo.cover.bottom && geo.avatar.bottom > geo.cover.bottom, "the photo straddles the band's lower edge", geo)
      expect(geo.avatar && Math.abs(geo.avatar.w - (phone ? 118 : 134)) <= 1, `the photo is ${phone ? 118 : 134}px (112 / 128 plus five percent)`, geo.avatar?.w)
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
      const before = await p.evaluate(() => document.querySelector("[data-profile-count=followers] [data-profile-count-value]").textContent)
      await p.click("[data-follow-button]")
      await frames(p, 4)
      const after = await p.evaluate(() => ({ text: document.querySelector("[data-follow-button]").textContent.trim(), n: document.querySelector("[data-profile-count=followers] [data-profile-count-value]").textContent, fetches: window.__fetches }))
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

      /* Followers and following: one quiet line of text that opens nothing. */
      await p.evaluate(() => window.scrollTo(0, 0))
      const line = await p.evaluate(() => {
        const el = document.querySelector("[data-profile-counts]")
        const r = el.getBoundingClientRect()
        return { tag: el.tagName, text: el.textContent.replace(/\s+/g, " ").trim(), h: Math.round(r.height), buttons: el.querySelectorAll("button, a").length }
      })
      expect(line.tag === "P" && line.buttons === 0 && line.h <= 24 && /^\d+ followers · 41 following$/.test(line.text), "followers and following are one quiet line, not buttons", line)
      await p.click("[data-profile-count=followers]")
      await new Promise((r) => setTimeout(r, 400))
      const dialog = await p.evaluate(() => !!document.querySelector("[role=dialog], [data-follow-list]") || (window.__fetches || []).some((u) => u.startsWith("/api/follow/list")))
      expect(!dialog, "pressing the count opens no list and asks for none", dialog)

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
        geo.pills.map((x) => x[0]).join() === "Activity,Communities,Library,Settings" && geo.pills[2][1] === "/account/library" && geo.pills[3][1] === "/account/settings?section=account",
        "the profile center's pills: Activity, Communities, Library, Settings (Edit profile is on the cover)",
        geo.pills,
      )
      const lit = await p.evaluate(() => document.querySelector("[data-profile-owner-pill][data-active=true]")?.getAttribute("data-profile-owner-pill"))
      const cover = await p.evaluate(() => document.querySelector("[data-profile-cover-edit]")?.getAttribute("aria-label"))
      expect(!geo.follow && geo.onlyYou && !geo.back && lit === "activity" && cover === "Add cover", "no Follow, the only-you line, no back bar, Activity lit, Add cover on the band", { ...geo, lit, cover })
      const band = await p.evaluate(() => {
        const b = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) } : null }
        const edit = document.querySelector("[data-profile-edit]")
        return { cover: b("[data-profile-cover]"), edit: b("[data-profile-edit]"), camera: b("[data-profile-cover-edit]"), href: edit?.getAttribute("href"), text: edit?.textContent?.trim(), win: innerWidth, joined: /Joined/.test(document.querySelector("[data-profile-header]")?.textContent || "") }
      })
      expect(band.cover.left === 0 && band.cover.w === band.win, "/@me: the same edge to edge band as /account", band.cover)
      expect(band.text === "Edit profile" && band.href === "/account/settings" && band.edit.h === 40 && band.edit.top >= band.cover.top && band.edit.bottom <= band.cover.bottom && band.camera.right <= band.edit.left && band.camera.h === 40, "Edit profile on the cover with the camera button beside it, both 40px", band)
      expect(!band.joined, "no Joined line", band.joined)
      if (phone) {
        expect(geo.pillsOverflow === true, "on a phone the pills scroll sideways inside their row", geo.pillsOverflow)
        const small = await smallTargets(p, "[data-profile-owner-pills], [data-profile-social]")
        expect(small.length === 0, "pills and counts are at least 40px", small)
      }
      await p.close()
    }
    }

    /* The creator page's tabs, from the function the page itself builds them with (components/profile/creator-communities-tab.tsx). */
    for (const which of ["creator", "creator-none"]) {
      if (!profiles) break
      console.log(`\n${label}: ${which}, the tabs`)
      const { p, errors } = await open(vp, which)
      const tabs = await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim()))
      expect(errors.length === 0 && tabs.join() === "Home,Communities,About", "Home, Communities and About: no Activity tab on a creator page", { tabs, errors })
      await p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => t.textContent.trim() === "Communities").click())
      await frames(p, 3)
      await p.evaluate(() => document.querySelector("[role=tablist]")?.scrollIntoView())
      await p.screenshot({ path: join(shots, `${label}-${which}-communities.png`) })
      const panel = await p.evaluate(() => ({
        cards: document.querySelectorAll("[data-storefront-communities] > li").length,
        names: [...document.querySelectorAll("[data-storefront-communities] > li")].map((li) => (li.textContent || "").slice(0, 40)),
        empty: [...document.querySelectorAll("[data-panel-spacing]")].map((e) => e.innerText.replace(/\s+/g, " ").trim()).find((t) => /No communities yet/.test(t)) ?? null,
        side: document.documentElement.scrollWidth - innerWidth,
      }))
      if (which === "creator") expect(panel.cards === 1 && /Clay Studio/.test(panel.names[0] || "") && !panel.empty, "Communities lists only the one they made, not the one they joined", panel)
      else expect(panel.cards === 0 && panel.empty === "No communities yet This creator hasn't opened any yet.", "none made: the No communities yet panel", panel)
      expect(panel.side <= 0, "nothing sideways", panel.side)
      await p.close()
    }

    for (const which of ["creator", "creator-dark", "creator-noback", "creator-nobar"]) {
      console.log(`\n${label}: ${which}`)
      const { p, errors } = await open(vp, which)
      await p.screenshot({ path: join(shots, `${label}-${which}.png`) })
      if (label === "desktop-1440" || label === "phone-390") await p.screenshot({ path: join(shots, `${label}-${which}-full.png`), fullPage: true })
      const side = await noSideways(p)
      expect(side.doc <= side.win && errors.length === 0, "nothing sideways, no errors", { side, errors })
      const dark = which === "creator-dark"

      /* The photo and its ring. */
      const hero = await p.evaluate(() => {
        const header = document.querySelector("[data-storefront-follow]")?.closest("[class*=flex-col]")
        const avatar = document.querySelector("[data-cover-band]")?.parentElement?.querySelector("[data-slot=avatar]") ?? null
        const cs = avatar && getComputedStyle(avatar)
        const root = getComputedStyle(document.querySelector("[data-storefront-root]"))
        const heroText = (document.querySelector("[data-cover-band]")?.parentElement?.innerText || "").replace(/\s+/g, " ")
        return {
          w: avatar ? Math.round(avatar.getBoundingClientRect().width) : null,
          ring: cs?.borderTopColor,
          ringW: cs?.borderTopWidth,
          page: root.backgroundColor,
          sales: /\bsales\b/i.test(heroText),
          heroText: heroText.slice(0, 160),
          header: !!header,
        }
      })
      expect(hero.w === 158, "the creator photo is 158px (150 plus five percent)", hero.w)
      expect(hero.ring === hero.page && hero.ringW === "3px", `the ring is the page's own background (${dark ? "dark" : "light"} scheme)`, { ring: hero.ring, page: hero.page, w: hero.ringW })
      expect(!hero.sales, "no sales count anywhere in the hero", hero.heroText)
      const about = await p.evaluate(() => {
        const box = document.querySelector("[data-probe-about]")
        if (!box) return null
        const find = (t) => [...box.querySelectorAll("p, span, h3, h4")].find((n) => n.textContent.trim() === t)
        const top = (n) => (n ? Math.round(n.getBoundingClientRect().top) : null)
        const sales = find("Sales"), joined = find("Joined"), products = find("Products")
        const pay = [...box.querySelectorAll("*")].find((n) => n.children.length === 0 && /Accepted payment methods/i.test(n.textContent))
        return { sales: top(sales), joined: top(joined), products: top(products), pay: top(pay), value: sales?.nextElementSibling?.textContent }
      })
      expect(!!about && about.sales !== null && about.sales === about.joined && about.joined === about.products && about.value === "14" && about.pay > about.sales, "Sales sit in About beside Joined and Products, above the payment methods", about)

      /* The follow block: one quiet line, then Follow and Message in Storelib's language, in the scheme. */
      const geo = await p.evaluate(() => {
        const row = document.querySelector("[data-storefront-follow]")
        const r = row?.querySelector("[data-profile-actions]")?.getBoundingClientRect()
        const counts = document.querySelector("[data-storefront-follow] [data-profile-counts]")
        return {
          row: !!row,
          actionsCx: r ? Math.round(r.left + r.width / 2) : null,
          counts: counts?.textContent?.replace(/\s+/g, " ").trim(),
          countsH: counts ? Math.round(counts.getBoundingClientRect().height) : null,
          countButtons: counts ? counts.querySelectorAll("button, a").length : null,
          metaFollowers: [...document.querySelectorAll("span")].filter((s) => /\bfollowers\b/.test(s.textContent || "") && !s.closest("[data-storefront-follow]") && s.children.length < 3).length,
          w: window.innerWidth,
        }
      })
      expect(geo.row && Math.abs(geo.actionsCx - geo.w / 2) <= 2, "the follow block sits under the bio, centred", geo)
      expect(geo.counts === "1.3k followers · 64 following" && geo.countsH <= 24 && geo.countButtons === 0, "followers and following: one quiet line, nothing to press", geo)
      expect(geo.metaFollowers === 0, "the follower count is printed once", geo.metaFollowers)
      const look = () =>
        p.evaluate(() => {
          const b = document.querySelector("[data-storefront-follow] [data-follow-button]")
          const m = document.querySelector("[data-storefront-follow] [data-profile-message]")
          const one = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, h: Math.round(r.height), weight: cs.fontWeight } }
          return { follow: one(b), tone: b.getAttribute("data-follow-tone"), state: b.getAttribute("data-follow-button"), message: one(m) }
        })
      const want = dark ? "rgb(37, 99, 235)" : "rgb(47, 93, 70)"
      const l0 = await look()
      expect(l0.tone === "scheme" && l0.follow.bg === want && l0.follow.color === "rgb(255, 255, 255)" && /inset/.test(l0.follow.shadow), `Follow is Storelib's primary (light on top, a darker foot) in the scheme's buy colour (${dark ? "Astrid" : "Sage"})`, l0.follow)
      const pageBg = hero.page
      expect(l0.message.bg !== "rgba(0, 0, 0, 0)" && l0.message.bg !== pageBg && (dark ? l0.message.bg !== "rgb(255, 255, 255)" : true) && /inset/.test(l0.message.shadow), "Message is the quiet secondary: the scheme's surface, a hairline and a soft foot", { message: l0.message, page: pageBg })
      expect(l0.follow.h === 40 && l0.message.h === 40 && l0.follow.radius === "12px" && l0.message.radius === "12px", "Follow and Message share one height and Storelib's rounding", { f: [l0.follow.h, l0.follow.radius], m: [l0.message.h, l0.message.radius] })
      await p.screenshot({ path: join(shots, `${label}-${which}-follow.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 760) } })
      if (which === "creator" || which === "creator-dark") {
        await p.click("[data-storefront-follow] [data-follow-button]")
        /* The pointer off it (a hovered button is a step darker), and past the 100ms colour transition. */
        await p.mouse.move(1, 1)
        await new Promise((r) => setTimeout(r, 250))
        const l1 = await look()
        expect(l1.state === "following" && l1.follow.bg === l0.message.bg && l1.follow.border === l0.message.border, "Following settles into the same quiet secondary as Message", { following: l1.follow, message: l0.message })
        if (!phone) {
          await p.mouse.move(5, 5)
          await frames(p, 2)
          await p.hover("[data-storefront-follow] [data-follow-button]")
          await frames(p, 3)
          const red = await p.evaluate(() => ({ color: getComputedStyle(document.querySelector("[data-storefront-follow] [data-follow-button]")).color, unfollow: getComputedStyle(document.querySelector("[data-storefront-follow] [data-follow-label=unfollow]")).visibility }))
          expect(red.unfollow === "visible" && red.color !== l1.follow.color, "a pointer over Following says Unfollow, in the scheme's red", { red, before: l1.follow.color })
          await p.screenshot({ path: join(shots, `${label}-${which}-unfollow.png`), clip: { x: 0, y: 0, width: vp.width, height: 760 } })
          await p.mouse.move(5, 5)
        }
      }

      /* The way back: a chevron INSIDE the top bar, icon only, before the photo. */
      const back = await p.evaluate(() => {
        const shown = (list) => [...list].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
        const chevEl = shown(document.querySelectorAll("[data-profile-back-button]"))
        const scope = document.querySelector("[data-profile-top-bar]") || document.querySelector(".subscribe-bar-fixed, [class*=subscribe-bar-border]")
        const bar = scope?.getBoundingClientRect()
        const face = scope ? shown(scope.querySelectorAll("[data-slot=avatar], span[class*='rounded-full']")) : null
        if (!chevEl || !face || !bar) return { chev: !!chevEl, face: !!face, bar: !!bar }
        const chev = chevEl.getBoundingClientRect()
        const fr = face.getBoundingClientRect()
        return {
          inside: chev.top >= bar.top - 0.5 && chev.bottom <= bar.bottom + 0.5 && scope.contains(chevEl),
          gap: Math.round(fr.left - chev.right),
          sameRow: Math.abs((chev.top + chev.height / 2) - (fr.top + fr.height / 2)) <= 3,
          iconOnly: chevEl.textContent.trim() === "" && chevEl.querySelectorAll("svg").length === 1,
          w: Math.round(chev.width),
          h: Math.round(chev.height),
        }
      })
      if (which === "creator-noback") {
        expect(back.chev === false, "opened cold: no way back in the bar", back)
      } else {
        expect(back.inside && back.sameRow && back.gap >= 0 && back.gap <= 16 && back.iconOnly && back.w === 40 && back.h === 40, "the way back is a 40px chevron inside the top bar, icon only, right before the photo", back)
        /* A press shows on the next frame, before any click or navigation. */
        const press = await p.evaluate(async () => {
          const btn = [...document.querySelectorAll("[data-profile-back-button]")].find((el) => el.getBoundingClientRect().width > 0)
          const rest = getComputedStyle(btn).backgroundColor
          btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", isPrimary: true }))
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          const cs = getComputedStyle(btn)
          const out = { rest, pressedBg: cs.backgroundColor, scale: cs.scale, flag: btn.getAttribute("data-pressed") }
          btn.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch", isPrimary: true }))
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          out.after = btn.getAttribute("data-pressed")
          /* Let it ease back to its full size before anything else measures it. */
          await new Promise((r) => setTimeout(r, 300))
          out.settled = Math.round(btn.getBoundingClientRect().height)
          return out
        })
        expect(press.flag === "true" && press.scale === "0.9" && press.pressedBg !== press.rest && press.after === null && press.settled === 40, "the chevron answers a press on the next frame, and lets go", press)
      }

      /* On a phone the newsletter bar is one row, Subscribed included. */
      if (phone && which !== "creator-nobar") {
        const rowOf = () =>
          p.evaluate(() => {
            const row = document.querySelector("[data-subscribe-row=phone]")
            const bar = row.closest(".subscribe-bar-fixed, [class*=subscribe-bar-border]")
            const kids = [...row.children].filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0 && c.tagName !== "STYLE" })
            const rects = kids.map((c) => c.getBoundingClientRect())
            const mids = rects.map((r) => r.top + r.height / 2)
            const input = row.querySelector("input[type=email]").getBoundingClientRect()
            const btn = row.querySelector("button[type=submit]")
            return {
              kids: kids.map((c) => c.getAttribute("data-profile-back") !== null ? "back" : c.getAttribute("data-slot") === "avatar" ? "avatar" : c.tagName === "INPUT" ? "email" : c.tagName === "BUTTON" ? "button" : c.tagName),
              oneRow: Math.max(...mids) - Math.min(...mids) <= 2,
              rowH: Math.round(row.getBoundingClientRect().height),
              barH: Math.round(bar.getBoundingClientRect().height),
              fits: row.scrollWidth <= row.clientWidth + 1 && Math.max(...rects.map((r) => r.right)) <= bar.getBoundingClientRect().right,
              inputW: Math.round(input.width),
              inputH: Math.round(input.height),
              btnH: Math.round(btn.getBoundingClientRect().height),
              btnText: btn.innerText.replace(/\s+/g, " ").trim(),
              phase: btn.querySelector("[data-subscribe-phase]")?.getAttribute("data-subscribe-phase"),
              invalid: !row.querySelector("input[type=email]").checkValidity(),
              barBg: getComputedStyle(bar).backgroundColor,
              btnBg: getComputedStyle(btn).backgroundColor,
              font: getComputedStyle(row.querySelector("input[type=email]")).fontSize,
            }
          })
        const r0 = await rowOf()
        const order = which === "creator-noback" ? "avatar,email,button" : "back,avatar,email,button"
        expect(r0.kids.join() === order && r0.oneRow && r0.fits && r0.rowH <= 44 && r0.barH <= 64, `the newsletter bar is ONE row at ${vp.width}px: ${order}`, r0)
        expect(r0.inputW >= 80 && r0.inputH === 40 && r0.btnH === 40 && r0.font === "16px", "the email field keeps room to type (16px, so no zoom) and both are 40px to a thumb", r0)
        const scheme = await p.evaluate(() => ({ page: getComputedStyle(document.querySelector("[data-storefront-root]")).backgroundColor }))
        expect(dark ? r0.barBg !== "rgb(255, 255, 255)" : true, "the bar is drawn in the scheme's own colours", { bar: r0.barBg, button: r0.btnBg, page: scheme.page })
        await p.evaluate(() => window.scrollTo(0, 0))
        await p.type("[data-subscribe-row=phone] input[type=email]", "maya.reader@example.com")
        await p.click("[data-subscribe-row=phone] button[type=submit]")
        await new Promise((r) => setTimeout(r, 500))
        const r1 = await rowOf()
        expect(r0.phase === "idle" && r1.phase === "done" && !r1.invalid && r1.oneRow && r1.fits && r1.rowH === r0.rowH && r1.barH === r0.barH && r1.inputW === r0.inputW, "Subscribed fits the same row, nothing moves", { before: r0, after: r1 })
        await p.screenshot({ path: join(shots, `${label}-${which}-subscribed.png`), clip: { x: 0, y: 0, width: vp.width, height: 120 } })
      }
      if (phone) {
        const small = await smallTargets(p, "[data-storefront-follow], [data-profile-back], [data-subscribe-row]")
        expect(small.length === 0, "the follow block's and the bar's controls are at least 40px", small)
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
