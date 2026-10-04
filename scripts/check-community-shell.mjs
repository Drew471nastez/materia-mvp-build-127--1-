/**
 * ===========================================================================
 *  THE COMMUNITY'S OWN FRAME AND ITS ABOUT PAGE, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-shell.tsx) with fixtures, at
 * 1440x900 and on a 390x844 phone, each photographed:
 *
 *   TOP BAR     the community's bar is the only bar (no Storelib header):
 *               the hamburger first, then logo, name, By <creator> to their
 *               page, Messages with its count, the bell, my picture; no
 *               chevron switcher; a hairline and a soft shadow under it; it
 *               stays at the top while the page scrolls
 *   NAVIGATOR   the hamburger opens the navigator (a menu on a computer, a
 *               sheet on a phone) with my communities, Discover communities
 *               and Explore Storelib
 *   TABS        Community, Classroom, Calendar, Members, Leaderboards, About
 *               as plain words, no pill box; the chosen one ink with a 2px
 *               line on the bar's bottom edge
 *   FEED        spaces as chips (All chosen), the side card with Members /
 *               Online / Admins from 1024px, the heartbeat sent on load
 *   ABOUT       title, rating, the gallery with its strip (a thumbnail
 *               changes the picture, a video plays in place), the facts line,
 *               "Still a paying member" only where the fixture says so, the
 *               card sticking under the bar while the page scrolls; on a
 *               phone the card's content under the media and the join bar
 *               pinned to the bottom
 *   MEMBERS     names open the person's page, Message beside each; the
 *               leaderboard's names too
 *   PERSON CARD on a computer, resting on a name opens the card after
 *               ~350ms (not before), it stays while the pointer crosses into
 *               it, closes ~160ms after the pointer leaves, opens from
 *               keyboard focus too (Tab steps into it, Escape closes it and
 *               gives focus back); Follow and Message work, Message opening
 *               the panel in place. On a phone a tap is a tap: no card.
 *   ?dm=<id>    opens that conversation once and leaves the address
 *
 * and everywhere: nothing scrolls sideways, no page error, every control on
 * a phone is at least 40px tall, no violet fill.
 *
 *   PROBE_CSS=source node scripts/check-community-shell.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".community-shell-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-shell-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel(name) {
      const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }
      return ch
    },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }) },
  }
}
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-shell.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-shell-probe/navigation.js", "next/link": "./.community-shell-probe/link.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

  const VIEWPORTS = [
    ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]

  async function open(name, path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const calls = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        calls.push({ url: short, method: r.method() })
        let body = {}
        if (short.endsWith("/presence")) body = { ok: true, ready: true }
        /* Storelib's navigator (components/nav/place-navigator.tsx) asks for the person's communities, most recently visited first. */
        else if (short.startsWith("/api/me/places")) body = name.includes("visitor")
          ? { signedIn: false, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
          : { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [{ id: "c0000000-0000-4000-8000-000000000001", slug: "clay-studio", name: "Clay Studio", logoUrl: null }, { id: "c2", slug: "night-runners", name: "Night Runners", logoUrl: null }, { id: "c3", slug: "film-photo-club", name: "Film Photo Club", logoUrl: null }] }
        else if (short.startsWith("/api/notifications/inbox")) body = { unread: 4, items: [], nextCursor: null }
        else if (short.endsWith("/dms") && r.method() === "POST") body = { conversation: { id: "cv-1", other: { id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, role: null } } }
        else if (/\/dms\/cv-1/.test(short)) body = { messages: [], hasMore: false }
        else if (short.includes("/dms")) body = { ready: true, unread: 2, conversations: [] }
        else if (short.includes("/posts?")) body = { pinned: [], posts: [], nextCursor: null }
        else if (/\/people\/[^/]+\/card$/.test(short)) {
          const id = short.split("/people/")[1].split("/")[0]
          body = { person: { id, name: id === "u-leo" ? "Leo Martins" : "Jonas Berg", username: id === "u-leo" ? "leom" : "jonasb", avatarUrl: null, href: id === "u-leo" ? "/@leom" : "/@jonasb", bio: "Weekend potter, Lisbon. Mostly bowls and cups, trying to get better at lids.", role: null, level: 2, levelName: "Regular", activeAt: new Date(Date.now() - 2 * 3600_000).toISOString(), communities: { count: 4, inCommon: 1 }, owns: 1, following: false, isSelf: false, canMessage: true } }
        } else if (short === "/api/follow") body = { following: true, followers: 12 }
        else if (short.includes("/play")) body = { url: `${ORIGIN}/media/clip.mp4`, poster: null, mime: "video/mp4", expiresAt: null }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/media/`)) return r.respond({ status: 404, body: "" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}case=${name}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(450)
    return { p, errors, calls }
  }

  const shot = (p, name, fullPage = false) => p.screenshot({ path: join(shots, `${name}.png`), fullPage })
  const sideScroll = (p) => p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }))
  const smallTargets = (p) =>
    p.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("button, a[data-community-nav], a[data-space-chip], [data-notification-bell], [data-community-me], [data-place-navigator], [data-gallery-thumb], [data-join-bar] a, [data-join-bar] button, [role=radio]")) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || cs.display === "none") continue
        if (r.height < 40) out.push({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(r.height) })
      }
      return out
    })
  const violet = (p) => p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => /139, 92, 246|124, 58, 237/.test(getComputedStyle(e).backgroundColor)).length)
  const rect = (p, sel) =>
    p.evaluate((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect()
      return r && r.width ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) } : null
    }, sel)

  for (const [label, vp] of VIEWPORTS.filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)

    /* ── FEED: the bar, the pills, the chips, the side card ─────────── */
    {
      const { p, errors, calls } = await open("feed", "/community/clay-studio", vp)
      await shot(p, `${label}-feed`)
      const g = await p.evaluate(() => {
        const top = document.querySelector("[data-community-top]")
        const r = top.getBoundingClientRect()
        return {
          platformHeader: !!document.getElementById("platform-header-root"),
          top: Math.round(r.top),
          height: Math.round(r.height),
          rowHeight: Math.round(document.querySelector("[data-community-top-row]").getBoundingClientRect().height),
          name: document.querySelector("[data-community-identity] a")?.textContent,
          by: document.querySelector("[data-community-creator]")?.getAttribute("href"),
          byText: document.querySelector("[data-community-identity] p")?.textContent,
          tabs: [...document.querySelectorAll("[data-community-tabs] a")].map((a) => a.textContent.trim()),
          current: document.querySelector("[data-community-tabs] [aria-current=page]")?.textContent?.trim(),
          tabLook: (() => {
            const on = document.querySelector("[data-community-tabs] [aria-current=page]")
            const off = document.querySelector("[data-community-tabs] a:not([aria-current])")
            const line = on?.querySelector("[data-tab-line]")
            const offLine = off?.querySelector("[data-tab-line]")
            const cs = getComputedStyle(on)
            const lr = line.getBoundingClientRect()
            return {
              bg: cs.backgroundColor,
              border: cs.borderTopWidth,
              color: cs.color,
              offColor: getComputedStyle(off).color,
              line: { h: Math.round(lr.height), w: Math.round(lr.width), tabW: Math.round(on.getBoundingClientRect().width), opacity: getComputedStyle(line).opacity, bg: getComputedStyle(line).backgroundColor, bottom: Math.round(lr.bottom) },
              offLine: getComputedStyle(offLine).opacity,
              barBottom: Math.round(top.getBoundingClientRect().bottom),
            }
          })(),
          shadow: getComputedStyle(top).boxShadow,
          hairline: getComputedStyle(top).borderBottomWidth + " " + getComputedStyle(top).borderBottomColor,
          rowOrder: (() => {
            const x = (s) => Math.round(document.querySelector(s)?.getBoundingClientRect().left ?? -1)
            return { nav: x("[data-community-top-row] [data-place-navigator]"), logo: x("[data-community-top-row] > a"), name: x("[data-community-identity]") }
          })(),
          switcher: !!document.querySelector("[data-community-switcher]"),
          chips: [...document.querySelectorAll("[data-space-chip]")].map((a) => a.textContent.trim()),
          chipOn: document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip"),
          messages: document.querySelector("[data-community-messages-button] [data-count-badge]")?.textContent ?? null,
          bell: document.querySelector("[data-community-top] [data-notification-bell] [data-bell-badge]")?.textContent?.trim() ?? null,
          me: !!document.querySelector("[data-community-me]"),
          stats: [...document.querySelectorAll("[data-community-aside] [data-stat]")].filter((d) => d.getBoundingClientRect().width > 0).map((d) => d.textContent.trim()),
          topVar: getComputedStyle(document.documentElement).getPropertyValue("--community-top").trim(),
          theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
          bg: getComputedStyle(document.querySelector("[data-community-shell]")).backgroundColor,
        }
      })
      expect(!g.platformHeader, "no Storelib header, only the community's bar", g.platformHeader)
      expect(g.top === 0 && g.rowHeight === (phone ? 56 : 64), "the bar sits at the top, 64px on a computer and 56px on a phone", { top: g.top, row: g.rowHeight })
      expect(g.name === "Clay Studio" && g.by === "/mara" && /By Mara Lindqvist/.test(g.byText || ""), "the name, and By <creator> to their page", { name: g.name, by: g.by })
      expect(g.tabs.join() === "Community,Classroom,Calendar,Members,Leaderboards,About" && g.current === "Community", "one row of section tabs, Community marked", g.tabs)
      const t = g.tabLook
      expect(t.bg === "rgba(0, 0, 0, 0)" && t.border === "0px", "the tabs are plain words: no pill fill, no pill border", { bg: t.bg, border: t.border })
      expect(t.color === "rgb(26, 26, 46)" && t.offColor !== t.color, "the chosen tab is ink, the rest muted", { on: t.color, off: t.offColor })
      expect(t.line.h === 2 && t.line.w === t.line.tabW && t.line.opacity === "1" && t.line.bg === "rgb(26, 26, 46)" && t.offLine === "0", "a 2px ink line under the chosen tab only, as wide as its word", t.line)
      expect(t.line.bottom === t.barBottom - 1, "the line sits on the bar's bottom edge (just above its hairline)", { line: t.line.bottom, bar: t.barBottom })
      expect(!g.switcher && g.rowOrder.nav >= 0 && g.rowOrder.nav < g.rowOrder.logo && g.rowOrder.logo < g.rowOrder.name, "no chevron switcher; the hamburger comes before the picture and the name", g.rowOrder)
      expect(g.shadow !== "none" && /^1px /.test(g.hairline), "the bar has a hairline and a soft shadow under it", { shadow: g.shadow, hairline: g.hairline })
      expect(g.chips.join() === "All,General,Announcements,🏺Critique,Glaze lab,Kiln room,Saved" && g.chipOn === "all", "the spaces as chips, All chosen, Saved at the end", g.chips)
      expect(g.messages === "2" && g.bell === "4" && g.me, "Messages and Storelib's bell with their counts, and my picture", { messages: g.messages, bell: g.bell })
      expect(g.topVar === `${g.height}px`, "--community-top is the bar's measured height", { topVar: g.topVar, height: g.height })
      expect(g.theme === "#ffffff", "the browser's bar is white to match", g.theme)
      expect(g.bg === "rgb(248, 249, 250)", "the page is #f8f9fa", g.bg)
      if (!phone) expect(g.stats.join("|") === "8kMembers|191Online|2Admins", "the side card: Members, Online, Admins", g.stats)
      else expect(g.stats.length === 0, "no side card on a phone", g.stats)
      expect(calls.filter((c) => c.url.endsWith("/presence") && c.method === "POST").length === 1, "the heartbeat is sent once on load", calls.filter((c) => c.url.endsWith("/presence")))
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect((await violet(p)) === 0, "no violet fill")
      /* The bar and the pills stay put while the feed scrolls; the side card sticks under them. */
      const tops = []
      for (const y of [500, 1200]) {
        await p.evaluate((v) => window.scrollTo(0, v), y)
        await sleep(80)
        tops.push(await p.evaluate(() => Math.round(document.querySelector("[data-community-top]").getBoundingClientRect().top)))
      }
      expect(tops.every((t) => t === 0), "the bar stays at the top while the page scrolls", tops)
      if (!phone) {
        const card = await p.evaluate(() => Math.round(document.querySelector("[data-community-aside] > div").getBoundingClientRect().top))
        expect(card === g.height + 24, "the side card sticks 24px under the bar", { card, bar: g.height })
      }
      await shot(p, `${label}-feed-scrolled`)
      await p.evaluate(() => window.scrollTo(0, 0))
      if (phone) {
        const small = await smallTargets(p)
        expect(small.length === 0, "every control is at least 40px tall", small.slice(0, 8))
        const track = await p.evaluate(() => {
          const t = document.querySelector("[data-community-tabs] > div")
          return { scrolls: t.scrollWidth > t.clientWidth, w: t.clientWidth }
        })
        expect(track.scrolls, "on a phone the tabs scroll sideways inside their row", track)
      }

      /* NAVIGATOR */
      /* Storelib's one navigator (components/nav/place-navigator.tsx): a popover on a computer, the app's sheet on a phone. */
      await p.click("[data-place-navigator-trigger]")
      await sleep(phone ? 650 : 400)
      const sw = await p.evaluate(() => {
        const box = [...document.querySelectorAll("[data-place-navigator-panel]")].find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden" && !b.closest("[inert]") })
        return box ? { kind: box.getAttribute("data-place-navigator-panel"), text: box.innerText.replace(/\s+/g, " ").trim(), links: [...box.querySelectorAll("a")].map((a) => a.getAttribute("href")), current: box.querySelector("[data-current]")?.getAttribute("href") ?? null } : null
      })
      expect(!!sw && sw.kind === (phone ? "sheet" : "popover"), `the hamburger opens the navigator as a ${phone ? "sheet" : "popover"}`, sw?.kind)
      expect(!!sw && /Your communities/.test(sw.text) && sw.links.join() === "/community/clay-studio,/community/night-runners,/community/film-photo-club,/explore?type=communities,/explore,/sell" && sw.current === "/community/clay-studio", "my communities (this one marked), Discover communities, Explore, Start creating", sw && { links: sw.links, current: sw.current })
      await shot(p, `${label}-navigator`)
      await p.keyboard.press("Escape")
      await sleep(phone ? 650 : 250)

      /* MY MENU */
      await p.click("[data-community-me]")
      await sleep(phone ? 650 : 250)
      const menu = await p.evaluate(() => [...(document.querySelector("[data-action-sheet]") || document.querySelector("[data-action-list]"))?.querySelectorAll("a") ?? []].map((a) => a.getAttribute("href")))
      expect(menu.join() === "/@samc,/library,/account/settings,/explore", "my menu: profile, library, settings, explore", menu)
      await shot(p, `${label}-me-menu`)
      await p.keyboard.press("Escape")
      await sleep(phone ? 650 : 250)

      /* MESSAGES opens the existing panel */
      await p.click("[data-community-messages-button]")
      await sleep(500)
      const panel = await p.evaluate(() => document.querySelector("[data-community-messages]")?.getAttribute("data-community-messages") ?? null)
      expect(panel === (phone ? "phone" : "panel"), "Messages opens the conversations panel", panel)
      if (!phone) {
        const pr = await rect(p, "[data-community-messages]")
        expect(pr && pr.y >= g.height, "the panel opens below the bar, not over it", { panel: pr, bar: g.height })
      }
      await shot(p, `${label}-messages`)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── A SPACE ─────────────────────────────────────────────────────── */
    {
      const { p, errors } = await open("space", "/community/clay-studio/space/critique", vp)
      const s = await p.evaluate(() => ({ on: document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip"), pill: document.querySelector("[data-community-tabs] [aria-current=page]")?.textContent?.trim(), desc: !!document.querySelector("[data-space-description]") }))
      expect(s.on === "critique" && s.pill === "Community" && s.desc, "a space: its chip chosen, its line under the chips, Community still marked", s)
      await shot(p, `${label}-space`)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── ABOUT, a signed in visitor of a paid community ──────────────── */
    {
      const { p, errors, calls } = await open("about", "/community/clay-studio/about", vp)
      await shot(p, `${label}-about`)
      await shot(p, `${label}-about-full`, true)
      const a = await p.evaluate(() => {
        const y = (s) => Math.round(document.querySelector(s)?.getBoundingClientRect().top ?? -1)
        return {
          pills: !!document.querySelector("[data-community-tabs]"),
          title: document.querySelector("[data-community-sheet] h1")?.textContent,
          rating: document.querySelector("[data-community-rating]")?.textContent,
          thumbs: document.querySelectorAll("[data-gallery-thumb]").length,
          main: document.querySelector("[data-gallery-main]")?.getAttribute("data-gallery-main"),
          info: [...document.querySelectorAll("[data-community-info] li")].map((li) => li.textContent.trim()),
          stats: [...document.querySelectorAll((innerWidth >= 1024 ? "[data-join-card]" : "[data-join-summary]") + " [data-stat]")].map((d) => d.textContent.trim()),
          paying: [...document.querySelectorAll("[data-review-paying]")].map((s) => s.textContent.trim()),
          reviewLinks: [...document.querySelectorAll("[data-review] [data-person-link]")].map((a) => a.getAttribute("href")),
          order: { gallery: y("[data-community-gallery]"), summary: y("[data-join-summary]"), info: y("[data-community-info]"), description: y("[data-community-description]") },
        }
      })
      expect(!a.pills, "a visitor gets the bar without the member's tabs", a.pills)
      expect(a.title === "Clay Studio" && /4\.9 · 121 reviews/.test(a.rating || ""), "the title, then stars and the review count", a.rating)
      expect(a.main === "image" && a.thumbs === 6, "the gallery: a large picture and a strip of six", { main: a.main, thumbs: a.thumbs })
      expect(a.info.join("|") === "Private|8k members|$9/month|By Mara Lindqvist", "the facts line: private, members, price, By creator", a.info)
      expect(a.stats.join("|") === "8kMembers|191Online|2Admins", "Members, Online, Admins", a.stats)
      expect(a.paying.join("|") === "· Still a paying member after 3 months|· Still a paying member after 4 days", "Still a paying member only where it is true", a.paying)
      expect(a.reviewLinks.join() === "/@ayla,/joemoss", "a reviewer's name opens their page (none for no username)", a.reviewLinks)
      expect(a.order.gallery < a.order.info && a.order.info < a.order.description, "gallery, then the facts line, then the description", a.order)
      if (phone) expect(a.order.summary > a.order.gallery && a.order.summary < a.order.info, "on a phone the card's content sits right under the media", a.order)

      /* A thumbnail changes the picture; the video plays in place. */
      const before = await p.evaluate(() => document.querySelector("[data-gallery-main] img")?.getAttribute("src"))
      await p.evaluate(() => document.querySelectorAll("[data-gallery-thumb]")[2].click())
      await sleep(150)
      const after = await p.evaluate(() => ({ src: document.querySelector("[data-gallery-main] img")?.getAttribute("src"), selected: [...document.querySelectorAll("[data-gallery-thumb]")].findIndex((t) => t.getAttribute("aria-selected") === "true") }))
      expect(!!after.src && after.src !== before && after.selected === 2, "a thumbnail changes the large picture", { changed: after.src !== before, selected: after.selected })
      await p.evaluate(() => document.querySelectorAll("[data-gallery-thumb]")[1].click())
      await sleep(150)
      const playBtn = await p.evaluate(() => !!document.querySelector("[data-gallery-play]"))
      await p.evaluate(() => document.querySelector("[data-gallery-play]")?.click())
      await sleep(400)
      const video = await p.evaluate(() => !!document.querySelector("[data-gallery-video]"))
      expect(playBtn && video && calls.some((c) => /\/videos\/a1111111-1111-4111-8111-111111111111\/play$/.test(c.url)), "a video shows a play button and plays in place from its signed address", { playBtn, video })
      await shot(p, `${label}-about-video`)

      if (!phone) {
        /* The card sticks under the bar while the long page scrolls. */
        const bar = await p.evaluate(() => Math.round(document.querySelector("[data-community-top]").getBoundingClientRect().height))
        const tops = []
        for (const y of [900, 1800, 2600]) {
          await p.evaluate((v) => window.scrollTo(0, v), y)
          await sleep(80)
          tops.push(await p.evaluate(() => Math.round(document.querySelector("[data-join-card-sticky]").getBoundingClientRect().top)))
        }
        expect(tops.every((t) => t === bar + 24), "the join card sticks 24px under the bar while the page scrolls", { tops, bar })
        const cardBottom = await p.evaluate(() => Math.round(document.querySelector("[data-join-card-sticky]").getBoundingClientRect().bottom))
        expect(cardBottom <= 900, "and all of it is on screen", cardBottom)
        await shot(p, `${label}-about-scrolled`)
        await p.evaluate(() => window.scrollTo(0, 0))
      } else {
        const bar = await p.evaluate(() => {
          const r = document.querySelector("[data-join-bar]").getBoundingClientRect()
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, button: document.querySelector("[data-join-bar] [data-join-state]")?.textContent?.trim() }
        })
        expect(bar.bottom === bar.vh && /Join for \$9\/month/.test(bar.button || ""), "the join bar is pinned to the bottom with the button", bar)
        await p.evaluate(() => window.scrollTo(0, 1600))
        await sleep(100)
        const later = await p.evaluate(() => ({ bottom: Math.round(document.querySelector("[data-join-bar]").getBoundingClientRect().bottom), top: Math.round(document.querySelector("[data-community-top]").getBoundingClientRect().top) }))
        expect(later.bottom === bar.vh && later.top === 0, "and stays there while the page scrolls, as does the bar at the top", later)
        await shot(p, `${label}-about-scrolled`)
        await p.evaluate(() => window.scrollTo(0, 0))
        const small = await smallTargets(p)
        expect(small.length === 0, "every control is at least 40px tall", small.slice(0, 8))
        const card = await p.evaluate(() => getComputedStyle(document.querySelector("[data-join-card]")).display)
        expect(card === "none", "no side card on a phone", card)
      }
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect((await violet(p)) === 0, "no violet fill")
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── ABOUT, signed out, a free community with no gallery ─────────── */
    {
      const { p, errors } = await open("about-visitor", "/community/night-runners", vp)
      await shot(p, `${label}-about-visitor`)
      const v = await p.evaluate(() => ({
        login: document.querySelector("[data-community-login]")?.getAttribute("href"),
        messages: !!document.querySelector("[data-community-messages-button]"),
        bell: !!document.querySelector("[data-notification-bell]"),
        gallery: !!document.querySelector("[data-community-gallery]"),
        stats: [...document.querySelectorAll((innerWidth >= 1024 ? "[data-join-card]" : "[data-join-summary]") + " [data-stat]")].map((d) => d.getAttribute("data-stat")),
        creator: document.querySelector("[data-info=creator] a")?.getAttribute("href"),
      }))
      expect(/^\/login\?next=/.test(v.login || "") && !v.messages && !v.bell, "signed out: Log in, no Messages, no bell", v)
      expect(!v.gallery, "no gallery and no cover: no empty media box", v.gallery)
      expect(v.stats.join() === "members,admins", "Online is left out when it cannot be known", v.stats)
      expect(v.creator === "/@dev", "a creator without a storefront opens at /@handle", v.creator)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── ABOUT for a member, inside the frame ────────────────────────── */
    {
      const { p, errors } = await open("about-member", "/community/clay-studio/about", vp)
      await shot(p, `${label}-about-member`)
      const m = await p.evaluate(() => ({ pill: document.querySelector("[data-community-tabs] [aria-current=page]")?.textContent?.trim(), button: document.querySelector("[data-join-state=open]")?.textContent?.trim() }))
      expect(m.pill === "About" && m.button === "Open community", "a member's About: the tab marked and Open community", m)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── MEMBERS and a MEMBER ────────────────────────────────────────── */
    {
      const { p, errors } = await open("members", "/community/clay-studio/members", vp)
      await shot(p, `${label}-members`, true)
      const m = await p.evaluate(() => ({
        pill: document.querySelector("[data-community-tabs] [aria-current=page]")?.textContent?.trim(),
        links: [...document.querySelectorAll("[data-member-list] [data-person-link]")].map((a) => a.getAttribute("href")),
        ids: [...document.querySelectorAll("[data-member-list] [data-person-link]")].map((a) => a.getAttribute("data-person-id")),
        message: document.querySelectorAll("[data-member-list] [data-member-message]").length,
      }))
      expect(m.pill === "Members", "Members marked", m.pill)
      expect(m.links.join() === "/mara,/@priya,/@samc,/@jonasb,/community/clay-studio/members/u-leo", "a name opens the person's page: storefront, profile, or (no handle yet) the address that finds it", m.links)
      expect(m.ids.join() === "u-mara,u-priya,u-me,u-jonas,u-leo", "every name carries who it is, for the card", m.ids)
      expect(m.message === 4, "Message beside everybody but me", m.message)
      if (phone) {
        const small = await smallTargets(p)
        expect(small.length === 0, "every control is at least 40px tall", small.slice(0, 8))
      }
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
    /* ── THE LEADERBOARD's names ─────────────────────────────────────── */
    {
      const { p, errors } = await open("leaderboard", "/community/clay-studio/leaderboard", vp)
      const l = await p.evaluate(() => [...document.querySelectorAll("[data-leaderboard-list] [data-person-link]")].map((a) => `${a.getAttribute("href")}#${a.getAttribute("data-person-id")}`))
      expect(l.join() === "/mara#u-mara,/@priya#u-priya,/@samc#u-me,/@jonasb#u-jonas", "the leaderboard's names open their pages and carry who they are", l)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── ?dm=<id>: a profile's Message button ───────────────────────── */
    {
      const { p, errors, calls } = await open("feed", "/community/clay-studio?dm=u-jonas", vp)
      await sleep(350)
      const m = await p.evaluate(() => ({ panel: document.querySelector("[data-community-messages]")?.getAttribute("data-community-messages") ?? null, search: location.search, path: location.pathname, thread: document.querySelector("[data-community-messages]")?.innerText?.includes("Jonas Berg") ?? false }))
      expect(m.panel === (phone ? "phone" : "panel") && m.thread, "?dm= opens that conversation in the panel, on the community's own page", m)
      expect(m.path === "/community/clay-studio" && !/dm=/.test(m.search) && /case=feed/.test(m.search), "and ?dm leaves the address, everything else stays", { path: m.path, search: m.search })
      expect(calls.filter((c) => c.url.endsWith("/dms") && c.method === "POST").length === 1, "the conversation is opened on the server once", calls.filter((c) => c.url.includes("/dms")))
      await shot(p, `${label}-dm-link`)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── THE PERSON CARD ─────────────────────────────────────────────── */
    if (!phone) {
      const { p, errors, calls } = await open("feed", "/community/clay-studio", vp)
      await p.evaluate(() => {
        window.__cardLog = []
        new MutationObserver(() => {
          const c = document.querySelector("[data-person-card]")
          const last = window.__cardLog[window.__cardLog.length - 1]
          const state = c ? (c.getAttribute("data-leaving") ? "leaving" : "open") : "gone"
          if (!last || last.state !== state) window.__cardLog.push({ state, t: performance.now() })
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-leaving"] })
      })
      const center = (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 30), y: r.top + r.height / 2 } }, sel)
      const name = '[data-post="p-photo"] header a[data-person-id]:not(.shrink-0)'
      await p.mouse.move(700, 860)
      await sleep(100)
      const at = await center(name)
      const t0 = await p.evaluate(() => {
        /* Every frame for a second: the card's opacity, its scale and shift, and its box, from the frame it appears. */
        window.__frames = []
        const start = performance.now()
        const tick = () => {
          const c = document.querySelector("[data-person-card]")
          if (c) {
            const cs = getComputedStyle(c)
            const r = c.getBoundingClientRect()
            window.__frames.push({ t: Math.round(performance.now() - start), o: Number(cs.opacity), tf: cs.transform, x: Math.round(r.left), box: `${c.offsetLeft},${c.offsetTop},${c.offsetWidth},${c.offsetHeight}` })
          }
          if (performance.now() - start < 1000) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        return performance.now()
      })
      await p.mouse.move(at.x, at.y)
      await sleep(200)
      const early = await p.evaluate(() => !!document.querySelector("[data-person-card]"))
      expect(!early, "resting 200ms on a name opens nothing yet", early)
      await sleep(350)
      const opened = await p.evaluate((t) => { const e = window.__cardLog.find((x) => x.state === "open"); return e ? Math.round(e.t - t) : null }, t0)
      expect(opened !== null && opened >= 340 && opened <= 520, "the card opens about 350ms after the pointer comes to rest", opened)
      await sleep(250)
      /* Its opening frames: opacity, scale and shift, the box itself never moving or resizing. */
      const frames = await p.evaluate(() => window.__frames)
      const first = frames[0]
      const full = frames.find((f) => f.o >= 0.999)
      const card = await p.evaluate(() => {
        const c = document.querySelector("[data-person-card]")
        if (!c) return null
        const r = c.getBoundingClientRect()
        return {
          text: c.innerText.replace(/\s+/g, " ").trim(),
          level: c.querySelector("[data-person-card-level]")?.textContent,
          profile: c.querySelector("[data-person-card-profile]")?.getAttribute("href"),
          buttons: [...c.querySelectorAll("a, button")].map((b) => b.textContent.trim()),
          box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) },
        }
      })
      expect(!!card && /Leo Martins/.test(card.text) && /@leom · Level 2 Regular/.test(card.text) && /Active 2h ago/.test(card.text) && /Weekend potter/.test(card.text) && /4 communities \(1 in common\)/.test(card.text) && /Owner of 1 community/.test(card.text), "the card: name, handle and level, Active 2h ago, bio, 4 communities (1 in common), Owner of 1 community", card?.text)
      expect(!!card && card.level === "2" && card.profile === "/@leom" && card.buttons.join() === "Profile,Follow,Message", "the level on the photo, and Profile, Follow, Message", card && { level: card.level, buttons: card.buttons })
      expect(!!card && card.box.y > at.y && card.box.b <= 900 && card.box.x >= 12, "the card sits under the name, inside the window", card?.box)
      expect(!!first && first.o < 0.9 && !!full && full.t - first.t <= 220 && frames.some((f) => f.tf !== "none" && f.o < 1) && new Set(frames.map((f) => f.box)).size === 1, "it fades and settles in within ~150ms, by opacity, scale and shift only, its box where it ends from the first frame", { first, full, n: frames.length, boxes: [...new Set(frames.map((f) => f.box))], mid: frames.slice(0, 5).map((f) => [f.t, f.o.toFixed(2)]) })
      await shot(p, `${label}-person-card`)
      /* Crossing from the name into the card keeps it. */
      await p.mouse.move(card.box.x + 40, card.box.y + 30, { steps: 4 })
      await sleep(400)
      const kept = await p.evaluate(() => !!document.querySelector("[data-person-card]:not([data-leaving])"))
      expect(kept, "moving from the name into the card keeps it open", kept)
      /* Follow, then Message opens the panel in place. */
      await p.click("[data-person-card-follow]")
      await sleep(150)
      const followed = await p.evaluate(() => document.querySelector("[data-person-card-follow]")?.getAttribute("data-person-card-follow"))
      const tick = await p.evaluate(() => { const b = document.querySelector("[data-person-card-follow]"); const svg = b.querySelector("svg"); const r = b.getBoundingClientRect(); return { check: Math.round(svg?.getBoundingClientRect().width ?? 0), fits: b.scrollWidth <= Math.ceil(r.width) } })
      expect(tick.check === 14 && tick.fits, "Following shows its check and fits its button", tick)
      expect(followed === "following" && calls.some((c) => c.url === "/api/follow" && c.method === "POST"), "Follow follows (POST /api/follow) and shows Following", followed)
      await shot(p, `${label}-person-card-following`)
      /* Leaving: still there within the grace, gone shortly after. */
      await p.evaluate(() => (window.__cardLog = []))
      const t1 = await p.evaluate(() => performance.now())
      await p.mouse.move(1300, 860)
      await sleep(90)
      const inGrace = await p.evaluate(() => !!document.querySelector("[data-person-card]:not([data-leaving])"))
      await sleep(400)
      const closed = await p.evaluate((t) => ({ gone: !document.querySelector("[data-person-card]"), leaving: window.__cardLog.find((x) => x.state === "leaving")?.t - t, at: window.__cardLog.find((x) => x.state === "gone")?.t - t }), t1)
      expect(inGrace && closed.gone && closed.leaving >= 140 && closed.leaving <= 260 && closed.at - closed.leaving >= 90, "after the pointer leaves it waits ~160ms, then fades out over ~120ms", { inGrace, ...closed })
      /* Message from the card opens the panel, not a page. */
      await p.mouse.move(at.x, at.y)
      await sleep(550)
      await p.click("[data-person-card-message]")
      await sleep(450)
      const msg = await p.evaluate(() => ({ panel: document.querySelector("[data-community-messages]")?.getAttribute("data-community-messages") ?? null, card: !!document.querySelector("[data-person-card]"), path: location.pathname, nav: (window.__router || []).filter((x) => x[0] !== "prefetch") }))
      expect(msg.panel === "panel" && !msg.card && msg.path === "/community/clay-studio" && msg.nav.length === 0, "Message opens the conversation in the panel, in place; the card closes", msg)
      await shot(p, `${label}-person-card-message`)
      await p.keyboard.press("Escape")
      await sleep(300)
      /* Keyboard: focus on a name opens the card; Tab steps in; Escape closes and hands focus back. */
      await p.mouse.move(1300, 860)
      let focused = null
      for (let i = 0; i < 60 && !focused; i++) {
        await p.keyboard.press("Tab")
        focused = await p.evaluate(() => document.activeElement?.getAttribute("data-person-id") ?? null)
      }
      await sleep(500)
      const kb = await p.evaluate(() => !!document.querySelector("[data-person-card]"))
      await p.keyboard.press("Tab")
      const inside = await p.evaluate(() => !!document.activeElement?.closest("[data-person-card]"))
      await p.keyboard.press("Escape")
      await sleep(100)
      const back = await p.evaluate(() => ({ card: !!document.querySelector("[data-person-card]"), on: document.activeElement?.getAttribute("data-person-id") ?? null }))
      expect(!!focused && kb && inside && !back.card && back.on === focused, "keyboard focus on a name opens it, Tab steps into it, Escape closes it and focus goes back", { focused, kb, inside, back })
      /* A name near the bottom of the window: the card opens over it instead, fully on screen. */
      await p.keyboard.press("Escape")
      await p.mouse.move(1300, 860)
      const lowName = '[data-post="p-text"] header a[data-person-id]:not(.shrink-0)'
      await p.evaluate((sel) => { const el = document.querySelector(sel); window.scrollBy(0, el.getBoundingClientRect().top - 820) }, lowName)
      await sleep(200)
      const low = await center(lowName)
      await p.mouse.move(low.x, low.y)
      await sleep(600)
      const up = await p.evaluate(() => { const c = document.querySelector("[data-person-card]"); if (!c) return null; const r = c.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) } })
      expect(!!up && up.bottom < low.y && up.top >= 12, "near the bottom of the window the card opens above the name", { up, name: Math.round(low.y) })
      await shot(p, `${label}-person-card-above`)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    } else {
      const { p, errors, calls } = await open("feed", "/community/clay-studio", vp)
      await p.tap('[data-post="p-photo"] header a[data-person-id]:not(.shrink-0)')
      await sleep(700)
      const t = await p.evaluate(() => ({ card: !!document.querySelector("[data-person-card]"), nav: (window.__router || []).filter((x) => x[0] === "link").map((x) => x[1]) }))
      expect(!t.card && !calls.some((c) => c.url.includes("/people/")) && t.nav.join() === "/community/clay-studio/members/u-leo", "on a phone a tap on a name goes to the person, and no card opens", t)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks passed")
process.exit(broken ? 1 : 0)
