/**
 * ===========================================================================
 *  THE COMMUNITY'S OWN FRAME AND ITS ABOUT PAGE, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-shell.tsx) with fixtures, at
 * 1440x900 and on a 390x844 phone, each photographed:
 *
 *   TOP BAR     the community's bar is the only bar (no Storelib header):
 *               logo, name, By <creator> to their page, then the hamburger
 *               RIGHT of them (round 4), Messages with its count, the bell,
 *               my picture; no chevron switcher; a hairline and a soft shadow
 *               under it; it stays at the top while the page scrolls
 *   SLIMMER     round 4: the header's height measured against what it was
 *               before (109px on a computer, 101px on a phone, 65px and
 *               57px for a visitor): one 56px row from 1024px (the places
 *               are in the left column now), 44px + 40px of tabs on a phone,
 *               still 40px targets. Also at 1024 and 768.
 *   NO PILLS    round 4: every element of the bar, at rest, hovered and with
 *               the navigator open, is checked: none may have a corner
 *               radius of half its height or more AND a visible fill, border
 *               or shadow, except the pictures of people and communities
 *               (AppAvatar). Lines under 8px tall (the hamburger's three
 *               strokes, the tab's underline) are strokes, not shapes.
 *   NAVIGATOR   the hamburger opens the navigator (a menu on a computer, a
 *               sheet on a phone) with my communities, Discover communities
 *               and Explore Storelib
 *   THE WALL    round 5 (images/45.webp): from 1280px three columns, 280px
 *               left (the community card: cover, name, address, Members /
 *               Online with its green dot / Admins, seven faces and +N,
 *               Settings for staff; under it the places as soft tiles, the
 *               open one shaded), the feed, 300px right (Upcoming event, Top
 *               contributors). The right column is fully dynamic: both
 *               cards, only the event, only the contributors (each then at
 *               the top), none (no right column, the feed 324px wider);
 *               points off says "Most active". 1024 to 1279: two columns,
 *               the right cards under the left column. 768: one column.
 *   TABS        below 1024px (and on About) the places are a row of plain
 *               words under the bar; the chosen one ink with a 2px line on
 *               the bar's bottom edge
 *   SEARCH      the field in the bar (a phone: an icon, then the whole
 *               screen): nothing for one letter, one ask once typing
 *               pauses, posts / members / spaces grouped with the match in
 *               bold, arrows and Enter, Escape, "/" to focus
 *   FEED        spaces as chips (All chosen, near black), the composer
 *               closed as one "Share something..." field (round 7: its
 *               toolbar is inside the editor, events are made on the
 *               creator side), a post's space named in its line with Save
 *               behind its dots, the heartbeat sent on load
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
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
/* The About gallery is the product gallery's Swiper (round 11); its stylesheet is imported by the component, which the bundle here leaves out. */
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
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
  /*
    usePathname follows the address the way the app router's does: a navigation (the harness's __navigate, ?case=nav) or Back tells
    whoever reads it, so the frame is drawn again by the address alone, never by a parent. router.prefetch is logged with its kind and
    handed to the harness's cache.
  */
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h, o) => { log("prefetch", h); (window.__prefetchKinds ||= []).push(o && o.kind); window.__onPrefetch && window.__onPrefetch(h) }, back: () => log("back"), refresh: () => log("refresh") }
const subscribe = (cb) => { window.addEventListener("probe:path", cb); window.addEventListener("popstate", cb); return () => { window.removeEventListener("probe:path", cb); window.removeEventListener("popstate", cb) } }
const path = () => location.pathname
export const usePathname = () => useSyncExternalStore(subscribe, path, path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); window.__navigate && window.__navigate(href) } } }, children) })
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel(name) {
      const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }
      return ch
    },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => { window.__signedOut = true; return { error: null } } },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-shell.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-shell-probe/navigation.js", "next/link": "./.community-shell-probe/link.jsx" },
    plugins: [
      { name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } },
      /*
        RENDER COUNTS (round 9, "the frame never re-renders"): the probe's copy of the bar, the side cards and the chips counts each
        time its function runs, in window.__renders. Only this bundle is changed; the source is not.
      */
      {
        name: "render-counts",
        setup(b) {
          const counted = { "top-bar.tsx": ["CommunityTopBarInner"], "wall.tsx": ["WallCommunityCardInner", "WallUpcomingInner", "WallContributorsCardInner", "WallPlaces"], "space-chips.tsx": ["SpaceChips"] }
          b.onLoad({ filter: /components\/community\/member\/(top-bar|wall|space-chips)\.tsx$/ }, (a) => {
            let src = readFileSync(a.path, "utf8")
            for (const name of counted[a.path.split("/").pop()]) {
              const re = new RegExp(`(function ${name}\\([^\\n]*\\) \\{\\n)`)
              if (!re.test(src)) throw new Error(`render-counts: ${name} not found`)
              src = src.replace(re, `$1  ;(globalThis.__renders ||= {})["${name}"] = ((globalThis.__renders || {})["${name}"] || 0) + 1\n`)
            }
            return { contents: src, loader: "tsx" }
          })
        },
      },
    ],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000"><style>${fonts}${css}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
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
        else if (/\/search\?q=/.test(short)) {
          /* The fixture community's own words, matched as the server would: posts by title or text, members by name or handle, spaces by name. */
          const q = decodeURIComponent(short.split("q=")[1] || "").toLowerCase()
          const has = (v) => (v || "").toLowerCase().includes(q)
          const posts = [
            { id: "p-text", title: null, snippet: "Glaze tip that saved me a whole batch: test tiles on the same shelf height as the real pieces.", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), space: { slug: "general", name: "General" }, author: { name: "Priya Raman", avatarUrl: null } },
            { id: "p-photo", title: "First set of bowls that did not crack", snippet: "Slower drying under plastic for two days made the difference.", createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), space: { slug: "critique", name: "Critique" }, author: { name: "Leo Martins", avatarUrl: null } },
          ].filter((x) => has(x.title) || has(x.snippet))
          const members = [{ id: "u-jonas", name: "Jonas Berg", username: "jonasb", avatarUrl: null, href: "/@jonasb", role: null, bio: "glaze" }, { id: "u-priya", name: "Priya Raman", username: "priya", avatarUrl: null, href: "/@priya", role: "admin" }].filter((m) => has(m.name) || has(m.username) || (q === "gla" && m.id === "u-jonas"))
          const spaces = [{ id: "s-glaze", slug: "glaze-lab", name: "Glaze lab", kind: "feed", description: null }, { id: "s-crit", slug: "critique", name: "Critique", kind: "feed", description: "Post a piece, get honest notes." }].filter((x) => has(x.name))
          body = { results: { q, posts, members: members.map(({ bio, ...m }) => m), spaces } }
        }
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
      for (const el of document.querySelectorAll("button, a[data-community-nav], a[data-space-chip], [data-notification-bell], [data-account-more], [data-place-navigator], [data-community-login], [data-gallery-thumb], [data-join-bar] a, [data-join-bar] button, [role=radio]")) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || cs.display === "none") continue
        if (r.height < 40) out.push({ tag: el.tagName, text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(r.height) })
      }
      return out
    })
  /*
    THE PILL TEST. A shape is a pill (or a disc) when its smallest corner
    radius is at least half its height; it only reads as one when something
    draws it: a fill, a border or a shadow. Menus and panels that drop out
    of the bar are not the bar.
  */
  const pillsInBar = (p) =>
    p.evaluate(() => {
      const bar = document.querySelector("[data-community-top]")
      const alpha = (c) => {
        if (!c || c === "transparent") return 0
        const m = c.match(/^rgba?\(([^)]+)\)$/)
        if (!m) return 1
        const parts = m[1].split(/[\s,/]+/).filter(Boolean)
        return parts.length > 3 ? parseFloat(parts[3]) : 1
      }
      const shadowShows = (v) => v !== "none" && (v.match(/rgba?\([^)]*\)/g) ?? ["x"]).some((c) => alpha(c) > 0.01)
      const out = []
      let seen = 0
      for (const el of [bar, ...bar.querySelectorAll("*")]) {
        if (el.closest("[data-app-avatar]")) continue
        if (el.closest("[data-place-navigator-panel], [data-notification-panel], [role=dialog], [role=menu], [data-action-list]")) continue
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 8) continue
        seen++
        const cs = getComputedStyle(el)
        const rad = (v) => (v.endsWith("%") ? (parseFloat(v) / 100) * Math.min(r.width, r.height) : parseFloat(v) || 0)
        const radius = Math.min(rad(cs.borderTopLeftRadius), rad(cs.borderTopRightRadius), rad(cs.borderBottomLeftRadius), rad(cs.borderBottomRightRadius))
        if (radius < r.height / 2 - 0.5) continue
        const fill = alpha(cs.backgroundColor) > 0.01 || cs.backgroundImage !== "none"
        const border = ["Top", "Right", "Bottom", "Left"].some((k) => parseFloat(cs[`border${k}Width`]) > 0 && alpha(cs[`border${k}Color`]) > 0.01)
        const shadow = shadowShows(cs.boxShadow)
        if (fill || border || shadow) {
          const tag = [...el.attributes].filter((a) => a.name.startsWith("data-") || a.name === "aria-label").map((a) => `${a.name}${a.value ? `=${a.value}` : ""}`).join(" ")
          out.push({ el: `${el.tagName.toLowerCase()} ${tag}`.trim(), h: Math.round(r.height), radius: Math.round(radius), fill, border, shadow })
        }
      }
      return { pills: out, seen }
    })
  /* The bar's own measurements: its height, its first row, where the hamburger is against the name, whether the tabs share the row. */
  const barGeometry = (p) =>
    p.evaluate(() => {
      const top = document.querySelector("[data-community-top]").getBoundingClientRect()
      const lead = document.querySelector("[data-community-top-lead]").getBoundingClientRect()
      const trig = document.querySelector("[data-community-top] [data-place-navigator-trigger]").getBoundingClientRect()
      const name = document.querySelector("[data-community-identity]").getBoundingClientRect()
      const mark = document.querySelector("[data-community-top-lead] > a").getBoundingClientRect()
      const lines = [...document.querySelectorAll("[data-community-top] [data-navigator-lines] > span")].map((l) => { const r = l.getBoundingClientRect(); return { y: +r.top.toFixed(2), h: +r.height.toFixed(2), w: +r.width.toFixed(2) } })
      const tcs = getComputedStyle(document.querySelector("[data-community-top] [data-place-navigator-trigger]"))
      const tabsBox = document.querySelector("[data-community-tabs]")?.getBoundingClientRect() ?? null
      const tabs = tabsBox && tabsBox.width > 0 ? tabsBox : null
      const actions = document.querySelector("[data-community-top-actions]").getBoundingClientRect()
      return {
        height: Math.round(top.height),
        lead: Math.round(lead.height),
        trigger: { x: Math.round(trig.left), right: Math.round(trig.right), cy: Math.round(trig.top + trig.height / 2), h: Math.round(trig.height) },
        nameRight: Math.round(name.right),
        markRight: Math.round(mark.right),
        markX: Math.round(mark.left),
        markSize: Math.round(mark.height),
        lines,
        triggerLook: { bg: tcs.backgroundColor, border: `${tcs.borderTopWidth} ${tcs.borderTopColor}`, shadow: tcs.boxShadow, radius: tcs.borderTopLeftRadius, w: Math.round(trig.width) },
        leadCy: Math.round(lead.top + lead.height / 2),
        tabs: tabs && { top: Math.round(tabs.top), bottom: Math.round(tabs.bottom), x: Math.round(tabs.left), right: Math.round(tabs.right) },
        actionsX: Math.round(actions.left),
        vw: innerWidth,
      }
    })
  /* What the header measured on the base commit (57924054), before round 4. */
  const BEFORE = { desktop: 109, phone: 101, visitorDesktop: 65, visitorPhone: 57 }
  const violet = (p) => p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => /139, 92, 246|124, 58, 237/.test(getComputedStyle(e).backgroundColor)).length)
  const rect = (p, sel) =>
    p.evaluate((s) => {
      const r = document.querySelector(s)?.getBoundingClientRect()
      return r && r.width ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom) } : null
    }, sel)

  for (const [label, vp] of VIEWPORTS.filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}`)

    /* ── FEED: the bar, the wall's three columns, the chips, the composer ── */
    {
      const { p, errors, calls } = await open("feed", "/community/clay-studio", vp)
      await shot(p, `${label}-feed`)
      const g = await p.evaluate(() => {
        const top = document.querySelector("[data-community-top]")
        const r = top.getBoundingClientRect()
        const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== "none"
        return {
          platformHeader: !!document.getElementById("platform-header-root"),
          top: Math.round(r.top),
          height: Math.round(r.height),
          rowHeight: Math.round(document.querySelector("[data-community-top-lead]").getBoundingClientRect().height),
          name: document.querySelector("[data-community-identity] a")?.textContent,
          by: document.querySelector("[data-community-creator]")?.getAttribute("href"),
          byText: document.querySelector("[data-community-identity] p")?.textContent,
          tabsShown: vis(document.querySelector("[data-community-tabs]")),
          tabs: [...document.querySelectorAll("[data-community-tabs] a")].map((a) => a.textContent.trim()),
          current: document.querySelector("[data-community-tabs] [aria-current=page]")?.textContent?.trim(),
          places: [...document.querySelectorAll("[data-wall-places] a")].filter(vis).map((a) => a.textContent.trim()),
          placeOn: document.querySelector("[data-wall-places] [aria-current=page]")?.textContent?.trim() ?? null,
          placeLook: (() => {
            const on = document.querySelector("[data-wall-places] [aria-current=page]")
            const off = document.querySelector("[data-wall-places] a:not([aria-current])")
            if (!vis(on) || !off) return null
            const tiles = [...document.querySelectorAll("[data-wall-places] [data-place-tile]")].map((t) => getComputedStyle(t).backgroundColor)
            return { onBg: getComputedStyle(on).backgroundColor, offBg: getComputedStyle(off).backgroundColor, h: Math.round(on.getBoundingClientRect().height), tiles, chevrons: document.querySelectorAll("[data-wall-places] a [data-place-chevron] svg").length, lucide: document.querySelectorAll("[data-wall-places] svg.lucide").length }
          })(),
          tabLook: (() => {
            const on = document.querySelector("[data-community-tabs] [aria-current=page]")
            const off = document.querySelector("[data-community-tabs] a:not([aria-current])")
            if (!vis(on)) return null
            const line = on.querySelector("[data-tab-line]")
            const cs = getComputedStyle(on)
            const lr = line.getBoundingClientRect()
            return { bg: cs.backgroundColor, border: cs.borderTopWidth, color: cs.color, offColor: getComputedStyle(off).color, line: { h: Math.round(lr.height), w: Math.round(lr.width), tabW: Math.round(on.getBoundingClientRect().width), opacity: getComputedStyle(line).opacity, bg: getComputedStyle(line).backgroundColor, bottom: Math.round(lr.bottom) }, offLine: getComputedStyle(off.querySelector("[data-tab-line]")).opacity, barBottom: Math.round(top.getBoundingClientRect().bottom) }
          })(),
          shadow: getComputedStyle(top).boxShadow,
          barBg: getComputedStyle(top).backgroundColor,
          hairline: getComputedStyle(top).borderBottomWidth + " " + getComputedStyle(top).borderBottomColor,
          rowOrder: (() => {
            const x = (s) => Math.round(document.querySelector(s)?.getBoundingClientRect().left ?? -1)
            return { nav: x("[data-community-top-row] [data-place-navigator]"), logo: x("[data-community-top-lead] > a"), name: x("[data-community-identity]") }
          })(),
          switcher: !!document.querySelector("[data-community-switcher]"),
          chips: [...document.querySelectorAll("[data-space-chip]")].map((a) => a.textContent.trim()),
          chipOn: document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip"),
          chipAll: (() => { const a = document.querySelector('[data-space-chip="all"]'); return a ? getComputedStyle(a).backgroundColor : null })(),
          messages: document.querySelector("[data-community-messages-button] [data-count-badge]")?.textContent ?? null,
          bell: document.querySelector("[data-community-top] [data-notification-bell] [data-bell-badge]")?.textContent?.trim() ?? null,
          more: [...document.querySelectorAll("[data-community-top] [data-account-more]")].filter(vis).length,
          myPicture: [...document.querySelectorAll("[data-community-top-actions] [data-app-avatar]")].filter(vis).length,
          byShown: vis(document.querySelector("[data-community-by]")),
          bellIcon: Math.round(document.querySelector("[data-community-top] [data-notification-bell] svg.lucide-bell")?.getBoundingClientRect().width ?? 0),
          searchField: vis(document.querySelector('[data-community-search="field"]')),
          searchButton: vis(document.querySelector('[data-community-search="button"]')),
          placeholder: document.querySelector('[data-community-search="field"] input')?.getAttribute("placeholder"),
          stats: [...document.querySelectorAll("[data-wall-card] [data-wall-stat]")].filter(vis).map((d) => d.textContent.trim()),
          dot: vis(document.querySelector("[data-wall-card] [data-online-dot]")),
          faces: document.querySelectorAll("[data-wall-faces] [data-person-id]").length,
          moreFaces: document.querySelector("[data-wall-more]")?.textContent?.trim() ?? null,
          address: document.querySelector("[data-wall-address]")?.textContent?.trim() ?? null,
          addressBelowName: (() => { const n = document.querySelector("[data-wall-name]"); const a = document.querySelector("[data-wall-address]"); if (!vis(n) || !vis(a)) return null; const nr = n.getBoundingClientRect(); const ar = a.firstElementChild.getBoundingClientRect(); return { gap: Math.round(ar.top - nr.bottom), color: getComputedStyle(a).color, size: getComputedStyle(a).fontSize, left: Math.round(ar.left - nr.left) } })(),
          invites: [...document.querySelectorAll("[data-community-invite]")].map((x) => x.getAttribute("data-community-invite")),
          settings: !!document.querySelector("[data-wall-settings]"),
          composer: { state: document.querySelector("[data-composer]")?.getAttribute("data-composer"), buttons: [...document.querySelectorAll('[data-composer="closed"] button')].map((b) => b.textContent.trim()), actions: document.querySelectorAll("[data-composer-action]").length },
          upcoming: vis(document.querySelector("[data-wall-upcoming]")) ? document.querySelector("[data-wall-upcoming]").innerText.replace(/\s+/g, " ").trim() : null,
          contributors: vis(document.querySelector("[data-wall-contributors]")) ? [...document.querySelectorAll("[data-wall-contributor]")].map((r) => r.innerText.replace(/\s+/g, " ").trim()) : null,
          saveOnCard: !!document.querySelector('[data-post="p-text"] [data-save]'),
          spaceName: document.querySelector('[data-post="p-text"] [data-post-space]')?.textContent?.trim(),
          spaceHref: document.querySelector('[data-post="p-text"] [data-post-space]')?.getAttribute("href"),
          topVar: getComputedStyle(document.documentElement).getPropertyValue("--community-top").trim(),
          theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
          bg: getComputedStyle(document.querySelector("[data-community-shell]")).backgroundColor,
        }
      })
      expect(!g.platformHeader, "no Storelib header, only the community's bar", g.platformHeader)
      expect(g.top === 0 && g.rowHeight === (phone ? 56 : 64), "round 7, taller: the bar sits at the top, one 64px row on a computer, a 56px row over the tabs on a phone", { top: g.top, row: g.rowHeight })
      const geo = await barGeometry(p)
      const was = phone ? BEFORE.phone : BEFORE.desktop
      console.log(`        header height: ${was}px before round 4, ${phone ? 85 : 57}px in round 4, ${geo.height}px now (round 7)`)
      expect(geo.height === (phone ? 97 : 65), `comfortable, not fat: ${phone ? "56 + 40 of tabs + the hairline" : "one 64px row + the hairline, the places in the left column"}`, { before: was, now: geo.height })
      expect(geo.markSize === (phone ? 36 : 40), `the community's picture a bit bigger: ${phone ? 36 : 40}px (was ${phone ? 32 : 34})`, geo.markSize)
      expect(g.bellIcon === 24, "the bell a bit bigger: a 24px glyph (was 22)", g.bellIcon)
      if (!phone) expect(!g.tabsShown && !geo.tabs, "no row of tabs on a computer: the left column has the places", { shown: g.tabsShown })
      else expect(!!geo.tabs && geo.tabs.top >= geo.lead && geo.tabs.bottom === geo.height - 1 && geo.tabs.bottom - geo.tabs.top === 40 && geo.tabs.x === 0 && geo.tabs.right === geo.vw, "on a phone the places are a 40px row of tabs under the bar, edge to edge", geo.tabs)
      if (phone) expect(geo.trigger.right <= geo.markX && Math.abs(geo.trigger.cy - geo.leadCy) <= 1 && geo.trigger.h === 40, "on a phone the hamburger sits LEFT of the community's picture, centred in the row, a 40px target", geo)
      else expect(geo.trigger.x >= geo.nameRight && geo.nameRight > geo.markRight && Math.abs(geo.trigger.cy - geo.leadCy) <= 1 && geo.trigger.h === 40, "on a computer the hamburger sits right of the picture and the name, centred in the row, a 40px target", geo)
      {
        const L = geo.lines
        const gaps = L.length === 3 ? [L[1].y - L[0].y, L[2].y - L[1].y] : []
        expect(L.length === 3 && L.every((l) => l.h === 2 && l.w === 18 && Number.isInteger(l.y)) && gaps[0] === gaps[1], "the hamburger: three even 2px lines, 18px wide, on whole pixels, evenly spaced", L)
        const T = geo.triggerLook
        expect(T.bg === "rgb(248, 249, 250)" && /^1px rgb\(230, 232, 235\)$/.test(T.border) && T.shadow !== "none" && T.radius === "10px" && T.w === 40, "in a 40px button with the faintest grey ground, a hairline and a one pixel shadow, squared at 10px (not a pill)", T)
      }
      const pills = await pillsInBar(p)
      expect(pills.pills.length === 0 && pills.seen > 10, `nothing in the bar is pill shaped at rest (${pills.seen} elements looked at)`, pills.pills)
      if (!phone) {
        /* Headless Chromium answers (hover: none), so Tailwind's hover rules (inside @media (hover: hover)) never apply; this page is a computer, so they are let out of that guard for what follows. */
        const lifted = await p.evaluate(() => { let n = 0; for (const st of document.querySelectorAll("style")) { const t = st.textContent; if (t.includes("@media (hover: hover)")) { st.textContent = t.replaceAll("@media (hover: hover)", "@media all"); n++ } } return n && matchMedia("(hover: hover)").matches === false })
        expect(lifted, "the hover rules are live for the hover checks (the browser itself reports no hover)", lifted)
        const hovered = []
        for (const sel of ["[data-place-navigator-trigger]", "[data-community-messages-button]", "[data-community-top] [data-notification-bell]", "[data-community-top] [data-account-more]", '[data-community-search="field"] label']) {
          await p.hover(sel)
          await sleep(220)
          hovered.push(...(await pillsInBar(p)).pills.map((x) => ({ ...x, hover: sel })))
        }
        await p.mouse.move(700, 600)
        expect(hovered.length === 0, "nor when any of its controls is hovered (no disc appears behind an icon)", hovered)
      }
      expect(g.name === "Clay Studio" && g.by === "/mara" && /By Mara Lindqvist/.test(g.byText || ""), "the name, and By <creator> to their page", { name: g.name, by: g.by })
      expect(phone ? !g.byShown : g.byShown, phone ? "on a phone no By <creator> line: the picture and the name" : "By <creator> shows on a computer", g.byShown)
      if (phone) expect(!g.switcher && g.rowOrder.nav >= 0 && g.rowOrder.nav < g.rowOrder.logo && g.rowOrder.logo < g.rowOrder.name, "no chevron switcher; on a phone the hamburger, the picture, then the name", g.rowOrder)
      else expect(!g.switcher && g.rowOrder.logo >= 0 && g.rowOrder.logo < g.rowOrder.name && g.rowOrder.name < g.rowOrder.nav, "no chevron switcher; the picture, the name, then the hamburger", g.rowOrder)
      expect(g.shadow === "none" && /^1px /.test(g.hairline) && g.barBg === "rgb(255, 255, 255)", "round 9: one opaque white surface with a hairline at its bottom only (no shadow, no tint)", { shadow: g.shadow, hairline: g.hairline, bg: g.barBg })
      expect(g.chips.join() === "All,General,Announcements,🏺Critique,Glaze lab,Kiln room" && g.chipOn === "all" && g.chipAll === "rgb(26, 26, 46)", "round 9: the spaces as chips, All chosen in near black, no Saved chip", { chips: g.chips, all: g.chipAll })
      expect(g.invites.length === 0, "round 9: no Invite button on the card or at the end of the tabs (it is in the \"...\" menu)", g.invites)
      expect(g.messages === "2" && g.bell === "4" && g.more === 1 && g.myPicture === 0, "Messages and Storelib's bell with their counts, then a \"...\" (round 7: no picture of me in the bar)", { messages: g.messages, bell: g.bell, more: g.more, picture: g.myPicture })
      expect(phone ? !g.searchButton && !g.searchField : g.searchField && !g.searchButton && g.placeholder === "Search discussions, members, or content...", phone ? "round 9: no search icon in the bar on a phone (the tab bar's Search opens it)" : "the search field: Search discussions, members, or content..., and no search icon", { field: g.searchField, button: g.searchButton, placeholder: g.placeholder })
      expect(g.topVar === `${g.height}px`, "--community-top is the bar's measured height", { topVar: g.topVar, height: g.height })
      expect(g.theme === "#ffffff", "the browser's bar is white to match", g.theme)
      expect(g.bg === "rgb(248, 249, 250)", "the page is #f8f9fa", g.bg)
      /* Round 7 changed these on purpose: the composer is one field until pressed, and a card names its space in its line. */
      expect(g.composer.state === "closed" && g.composer.buttons.length === 1 && /Share something/.test(g.composer.buttons[0]) && g.composer.actions === 0, "the composer: one \"Share something...\" field, no row of Photo / Video / Poll under it", g.composer)
      expect(g.spaceName === "General" && /\/community\/clay-studio\/space\/general$/.test(g.spaceHref || "") && !g.saveOnCard, "a post: its space named in its line, linking to the space; Save is behind the card's dots", { space: g.spaceName, href: g.spaceHref, saveOnCard: g.saveOnCard })
      if (!phone) {
        expect(g.places.join() === "Community,Classroom,Calendar,Members,Leaderboards,About" && g.placeOn === "Community", "the left column lists the places, Community marked", { places: g.places, on: g.placeOn })
        const L = g.placeLook
        /* Round 11, ask 19: the tiles are one quiet grey with the hand drawn icons; the open one's is white (with a hairline and a one pixel shadow). */
        expect(!!L && L.onBg !== L.offBg && L.h >= 44 && L.chevrons === 6 && L.lucide === 0 && new Set(L.tiles).size === 2 && L.tiles[0] === "rgb(255, 255, 255)" && L.tiles.slice(1).every((c) => c === L.tiles[1]) && L.tiles.every((c) => !/139, 92, 246|124, 58, 237/.test(c)), "each place: a quiet tile with its hand drawn icon (no lucide), a word and a Solar chevron; the open one white and shaded", L)
        expect(g.stats.join("|") === "8kMembers|191Online|2Admins" && g.dot, "the community card: Members, Online with its green dot, Admins", { stats: g.stats, dot: g.dot })
        expect(g.faces === 7 && g.moreFaces === "+8k" && !g.settings, "seven faces and +8k; no Settings for a member", { faces: g.faces, more: g.moreFaces, settings: g.settings })
        const A = g.addressBelowName
        expect(g.address === "storelib.com/community/clay-studio" && !!A && A.gap >= 0 && A.gap <= 4 && A.left === 0 && A.size === "13px" && A.color === "rgb(138, 143, 152)", "round 9: the address again under the name, quiet grey, one line", { address: g.address, A })
        expect(/Upcoming event/.test(g.upcoming || "") && /Live critique: trimming feet/.test(g.upcoming || "") && /128 going/.test(g.upcoming || "") && /View event/.test(g.upcoming || ""), "Upcoming event: the date, the title, the time, 128 going, View event", g.upcoming)
        expect(!!g.contributors && g.contributors.length === 3 && /^1 (PR )?Priya Raman 420$/.test(g.contributors[0]) && /^3 Leo Martins 287$/.test(g.contributors[2]), "Top contributors: rank, name and points", g.contributors)
      } else {
        expect(g.tabs.join() === "Community,Classroom,Calendar,Members,Leaderboards,About" && g.current === "Community", "on a phone the places are the row of tabs, Community marked", g.tabs)
        const t = g.tabLook
        expect(!!t && t.bg === "rgba(0, 0, 0, 0)" && t.border === "0px" && t.color === "rgb(26, 26, 46)" && t.offColor !== t.color, "the tabs are plain words, the chosen one ink", t)
        expect(!!t && t.line.h === 2 && t.line.w === t.line.tabW && t.line.opacity === "1" && t.offLine === "0" && t.line.bottom === t.barBottom - 1, "a 2px ink line under the chosen tab, on the bar's bottom edge", t?.line)
        expect(g.stats.length === 0 && g.upcoming === null && g.contributors === null && g.places.length === 0, "no side columns on a phone", { stats: g.stats, places: g.places })
      }
      expect(calls.filter((c) => c.url.endsWith("/presence") && c.method === "POST").length === 1, "the heartbeat is sent once on load", calls.filter((c) => c.url.endsWith("/presence")))
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect((await violet(p)) === 0, "no violet fill")
      /* The bar stays put while the feed scrolls; the right column sticks under it. */
      const tops = []
      for (const y of [500, 1200]) {
        await p.evaluate((v) => window.scrollTo(0, v), y)
        await sleep(80)
        tops.push(await p.evaluate(() => Math.round(document.querySelector("[data-community-top]").getBoundingClientRect().top)))
      }
      expect(tops.every((t) => t === 0), "the bar stays at the top while the page scrolls", tops)
      if (!phone) {
        const card = await p.evaluate(() => Math.round(document.querySelector("[data-community-right-cards]").getBoundingClientRect().top))
        expect(card === g.height + 24, "the right column sticks 24px under the bar", { card, bar: g.height })
      }
      await shot(p, `${label}-feed-scrolled`)
      await p.evaluate(() => window.scrollTo(0, 0))
      if (phone) {
        const small = await smallTargets(p)
        expect(small.length === 0, "every control is at least 40px tall", small.slice(0, 8))
        const track = await p.evaluate(() => {
          const t = document.querySelector("[data-community-tabs-track]") || document.querySelector("[data-community-tabs] > div")
          return { scrolls: t.scrollWidth > t.clientWidth, w: t.clientWidth }
        })
        expect(track.scrolls, "on a phone the tabs scroll sideways inside their row", track)
      }

      /* NAVIGATOR */
      await p.click("[data-place-navigator-trigger]")
      await sleep(phone ? 650 : 400)
      const sw = await p.evaluate(() => {
        const box = [...document.querySelectorAll("[data-place-navigator-panel]")].find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden" && !b.closest("[inert]") })
        return box ? { kind: box.getAttribute("data-place-navigator-panel"), text: box.innerText.replace(/\s+/g, " ").trim(), links: [...box.querySelectorAll("a")].map((a) => a.getAttribute("href")), current: box.querySelector("[data-current]")?.getAttribute("href") ?? null } : null
      })
      expect(!!sw && sw.kind === (phone ? "sheet" : "popover"), `the hamburger opens the navigator as a ${phone ? "sheet" : "popover"}`, sw?.kind)
      expect(!!sw && /Your communities/.test(sw.text) && sw.links.join() === "/community/clay-studio,/community/night-runners,/community/film-photo-club,/explore?type=communities,/explore,/sell" && sw.current === "/community/clay-studio", "my communities (this one marked), Discover communities, Explore, Start creating", sw && { links: sw.links, current: sw.current })
      await shot(p, `${label}-navigator`)
      if (!phone) {
        const open = await pillsInBar(p)
        expect(open.pills.length === 0, "with the navigator open, its button shows no disc either", open.pills)
      }
      await p.keyboard.press("Escape")
      await sleep(phone ? 650 : 250)

      /*
        MY MENU (round 7): a quiet "..." with a little depth, opening EXACTLY the Storelib header's account menu (the same component,
        DesktopAccountMenu, on a computer; the same AccountSheet on a phone): Start creating (or Dashboard), Profile to /account (never
        the creator's own page or its editor), Settings, Language, Help, Discover, Log out.
      */
      const moreLook = await p.evaluate(() => {
        const b = [...document.querySelectorAll("[data-community-top] [data-account-more]")].find((x) => x.getBoundingClientRect().width > 0)
        const cs = getComputedStyle(b)
        const r = b.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, shadow: cs.boxShadow, radius: cs.borderTopLeftRadius, label: b.getAttribute("aria-label") }
      })
      expect(moreLook.w === 40 && moreLook.h === 40 && moreLook.radius === "10px" && moreLook.bg === "rgba(0, 0, 0, 0)" && moreLook.shadow === "none" && /^0px /.test(moreLook.border), "round 9: the \"...\" is flat, a 40px target with no ground, no hairline and no shadow at rest", moreLook)
      await p.evaluate(() => [...document.querySelectorAll("[data-community-top] [data-account-more]")].find((x) => x.getBoundingClientRect().width > 0).click())
      await sleep(phone ? 650 : 300)
      const menu = await p.evaluate((ph) => {
        const box = ph ? [...document.querySelectorAll("[data-account-sheet-body]")].find((b) => b.getBoundingClientRect().height > 0) : document.querySelector("[data-community-top] [data-account-menu]")
        if (!box) return null
        return { items: [...box.querySelectorAll("[data-account-item]")].map((a) => a.getAttribute("data-account-item")), hrefs: Object.fromEntries([...box.querySelectorAll("a[data-account-item]")].map((a) => [a.getAttribute("data-account-item"), a.getAttribute("href")])), who: box.querySelector("[data-account-who]")?.innerText.replace(/\s+/g, " ").trim(), text: box.innerText }
      }, phone)
      /* Round 11, ask 16: the community's short list (a member here, so no Dashboard). */
      expect(!!menu && menu.items.join() === "invite,saved,profile,settings,log-out", `the "..." opens the Storelib account ${phone ? "sheet" : "menu"} in its short form: Invite people, Saved posts, Profile, Settings, Log out`, menu?.items)
      expect(!!menu && menu.hrefs.saved === "/community/clay-studio/saved" && /Invite people/.test(menu.text) && /Saved posts/.test(menu.text), "Invite people and Saved posts (to this community's saved posts)", menu && { saved: menu.hrefs.saved })
      expect(!!menu && menu.hrefs.profile === "/account" && menu.hrefs.settings === "/account/settings" && !menu.hrefs.help && !menu.hrefs.discover && /Sam Carter @samc/.test(menu.who || ""), "Profile goes to /account (not /@samc or an editor) and Settings to /account/settings; my name and @handle on top", menu)
      await shot(p, `${label}-me-menu`)
      await p.evaluate((ph) => {
        const box = ph ? [...document.querySelectorAll("[data-account-sheet-body]")].find((b) => b.getBoundingClientRect().height > 0) : document.querySelector("[data-community-top] [data-account-menu]")
        box.querySelector('a[data-account-item="profile"]').click()
      }, phone)
      await sleep(phone ? 650 : 250)
      const went = await p.evaluate(() => (window.__router || []).filter((x) => x[0] === "link").map((x) => x[1]))
      expect(went.at(-1) === "/account", "and Profile is a link to /account", went)
      await p.keyboard.press("Escape")
      await sleep(phone ? 650 : 250)
      /* Round 9: Invite people, from the same menu, opens the invite sheet (on a phone once the account sheet has gone). */
      await p.evaluate(() => [...document.querySelectorAll("[data-community-top] [data-account-more]")].find((x) => x.getBoundingClientRect().width > 0).click())
      await sleep(phone ? 650 : 300)
      await p.evaluate((ph) => {
        const box = ph ? [...document.querySelectorAll("[data-account-sheet-body]")].find((b) => b.getBoundingClientRect().height > 0) : document.querySelector("[data-community-top] [data-account-menu]")
        box.querySelector('[data-account-item="invite"]').click()
      }, phone)
      await sleep(phone ? 900 : 400)
      const invite = await p.evaluate(() => {
        const sheet = [...document.querySelectorAll("[data-invite-sheet]")].find((b) => b.getBoundingClientRect().height > 0)
        const account = [...document.querySelectorAll("[data-account-sheet-body]")].some((b) => b.getBoundingClientRect().height > 0 && !b.closest("[inert]") && getComputedStyle(b).visibility !== "hidden")
        return { open: !!sheet, title: sheet?.querySelector("h2, [data-sheet-title]")?.textContent ?? sheet?.innerText.split("\n")[0], menu: !!document.querySelector('[data-community-top] [data-account-menu][data-state="open"]'), account }
      })
      expect(invite.open && !invite.menu, "Invite people opens the invite sheet and the menu closes", invite)
      await shot(p, `${label}-invite-from-menu`)
      await p.keyboard.press("Escape")
      await sleep(phone ? 650 : 300)

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

    /* ── SEARCH: real results, grouped, by keyboard; full screen on a phone ── */
    {
      const { p, errors, calls } = await open("feed", "/community/clay-studio", vp)
      if (!phone) {
        await p.click('[data-community-search="field"] input')
        await p.keyboard.type("g", { delay: 30 })
        await sleep(400)
        const one = await p.evaluate(() => ({ panel: !!document.querySelector("[data-community-search-panel]") }))
        /* Round 10: the preloaded index (?index=1, read on idle) is not a search; a search is ?q=. */
        expect(!one.panel && !calls.some((c) => c.url.includes("/search?q=")), "one letter asks nothing and opens nothing", { one, calls: calls.filter((c) => c.url.includes("/search?q=")) })
        await p.keyboard.type("la", { delay: 30 })
        await sleep(650)
        const asked = calls.filter((c) => c.url.includes("/search?q="))
        const r = await p.evaluate(() => {
          const panel = document.querySelector("[data-community-search-panel]")
          const pr = panel?.getBoundingClientRect()
          const field = document.querySelector('[data-community-search="field"]').getBoundingClientRect()
          return {
            groups: [...document.querySelectorAll("[data-search-group]")].map((g) => g.getAttribute("data-search-group")),
            options: [...document.querySelectorAll("[data-search-option]")].map((o) => o.textContent.replace(/\s+/g, " ").trim()),
            bold: [...document.querySelectorAll("[data-search-results] mark")].map((m) => m.textContent),
            role: document.querySelector('[data-community-search="field"] input')?.getAttribute("role"),
            expanded: document.querySelector('[data-community-search="field"] input')?.getAttribute("aria-expanded"),
            box: pr && { x: Math.round(pr.left), y: Math.round(pr.top), w: Math.round(pr.width), b: Math.round(pr.bottom) },
            field: { x: Math.round(field.left), b: Math.round(field.bottom), w: Math.round(field.width) },
          }
        })
        expect(asked.length === 1 && /\/search\?q=gla$/.test(asked[0].url), "it asks once the typing pauses, with what was typed", asked.map((c) => c.url))
        expect(r.groups.join() === "posts,members,spaces" && r.options.length === 3 && r.bold.length >= 2 && r.bold.every((b) => b.toLowerCase() === "gla"), "grouped results: posts, members, spaces, the match in bold", r)
        expect(r.role === "combobox" && r.expanded === "true" && !!r.box && r.box.y >= r.field.b && Math.abs(r.box.x - r.field.x) <= 1 && r.box.b <= 900, "a combobox with its list right under the field, on screen", { role: r.role, box: r.box, field: r.field })
        await shot(p, `${label}-search`)
        await p.keyboard.press("ArrowDown")
        await p.keyboard.press("ArrowDown")
        const k = await p.evaluate(() => ({ active: document.querySelector("[data-search-option][data-active]")?.textContent?.replace(/\s+/g, " ").trim(), desc: document.querySelector('[data-community-search="field"] input')?.getAttribute("aria-activedescendant"), selected: document.querySelector("[aria-selected=true]")?.id }))
        expect(!!k.active && /Jonas Berg/.test(k.active) && !!k.desc && k.desc === k.selected, "the arrows step through the results across the groups, and the field says which (aria-activedescendant)", k)
        await p.keyboard.press("ArrowUp")
        await p.keyboard.press("ArrowUp")
        const wrap = await p.evaluate(() => document.querySelector("[data-search-option][data-active]")?.getAttribute("data-search-option"))
        expect(wrap === "spaces", "and wrap around at the ends", wrap)
        await p.keyboard.press("Enter")
        await sleep(150)
        const nav = await p.evaluate(() => ({ to: (window.__router || []).filter((x) => x[0] === "push").map((x) => x[1]), panel: !!document.querySelector("[data-community-search-panel]") }))
        expect(nav.to.join() === "/community/clay-studio/space/glaze-lab" && !nav.panel, "Enter opens the chosen result and closes the list", nav)
        await p.click('[data-community-search="field"] input')
        await p.keyboard.type("zzz", { delay: 20 })
        await sleep(650)
        const none = await p.evaluate(() => document.querySelector("[data-search-message]")?.textContent)
        expect(/Nothing here matches "zzz"/.test(none || ""), "no match says so, plainly", none)
        await p.keyboard.press("Escape")
        await sleep(100)
        const esc = await p.evaluate(() => !!document.querySelector("[data-community-search-panel]"))
        expect(!esc, "Escape closes the list", esc)
        await p.keyboard.press("Escape")
        await p.keyboard.press("Escape")
        await p.evaluate(() => document.activeElement?.blur())
        await p.keyboard.press("/")
        const slash = await p.evaluate(() => document.activeElement?.hasAttribute("data-community-search-input"))
        expect(slash, '"/" puts the cursor in the search', slash)
      } else {
        /* Round 9: no icon in the bar; the tab bar's Search opens the same screen through the bridge (lib/nav/community-search-bridge). */
        await p.evaluate(() => window.__openCommunitySearch("clay-studio"))
        await sleep(350)
        const sc = await p.evaluate(() => {
          const s = document.querySelector("[data-community-search-screen]")
          const r = s?.getBoundingClientRect()
          return { open: !!s, box: r && { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, focused: document.activeElement?.hasAttribute("data-community-search-input"), font: getComputedStyle(document.querySelector("[data-community-search-screen] input")).fontSize, vh: innerHeight, vw: innerWidth }
        })
        expect(sc.open && sc.box.x === 0 && sc.box.y === 0 && sc.box.w === sc.vw && sc.box.h === sc.vh && sc.focused && sc.font === "16px", "on a phone the tab bar's Search opens the community search over the whole screen, the cursor in it (16px, so iOS does not zoom)", sc)
        await p.keyboard.type("gla", { delay: 30 })
        await sleep(650)
        const res = await p.evaluate(() => [...document.querySelectorAll("[data-community-search-screen] [data-search-option]")].map((o) => Math.round(o.getBoundingClientRect().height)))
        expect(res.length === 3 && res.every((h) => h >= 48), "the same grouped results, each a tall tap target", res)
        await shot(p, `${label}-search`)
        const small = await smallTargets(p)
        expect(small.length === 0, "every control on the search screen is at least 40px tall", small.slice(0, 8))
        await p.tap('[data-community-search-screen] [data-search-option="members"]')
        await sleep(200)
        const nav = await p.evaluate(() => ({ to: (window.__router || []).filter((x) => x[0] === "push").map((x) => x[1]), open: !!document.querySelector("[data-community-search-screen]"), overflow: document.documentElement.style.overflow }))
        expect(nav.to.join() === "/@jonasb" && !nav.open && nav.overflow === "", "a result opens it and the screen goes, the page scrolls again", nav)
        await p.evaluate(() => window.__openCommunitySearch("clay-studio"))
        await sleep(300)
        await p.tap("[data-community-search-close]")
        await sleep(200)
        const closed = await p.evaluate(() => !document.querySelector("[data-community-search-screen]"))
        expect(closed, "Cancel closes it", closed)
      }
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /*
      ── THE COLUMNS (round 9: the places back on the left) ───────────────
      Left: the community card and the places (Community, Classroom, Calendar, Members, Leaderboards, About) right under it, and
      nothing else (no Most active there). Right: the next event, then the top contributors / Most active, each only when there is
      one. The three columns and their cards are the same on every place, so the middle never moves between the feed and the
      classroom and the side columns never change.
    */
    if (!phone) {
      const widths = {}
      const columns = (p) =>
        p.evaluate(() => {
          const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), right: Math.round(b.right), b: Math.round(b.bottom) } : null }
          const kind = (s) => (s.hasAttribute("data-wall-upcoming") ? "event" : s.hasAttribute("data-wall-places") ? "places" : s.hasAttribute("data-wall-contributors") ? "contributors" : s.hasAttribute("data-wall-card") ? "card" : "other")
          const right = [...document.querySelectorAll("[data-community-right-cards] > *")].map(kind)
          const left = [...document.querySelectorAll("[data-community-left] > *")].map(kind)
          return { columns: document.querySelector("[data-community-columns]")?.getAttribute("data-community-columns"), left: r("[data-community-left]"), card: r("[data-wall-card]"), contributors: r("[data-wall-contributors]"), main: r("[data-community-main]"), right: r("[data-community-right]"), places: r("[data-wall-places]"), event: r("[data-wall-upcoming]"), rightOrder: right, leftOrder: left, search: r('[data-community-search="field"]'), mark: r("[data-community-top-lead] > a") }
        })
      for (const wall of ["both", "event", "contributors", "none"]) {
        const { p, errors } = await open("feed", `/community/clay-studio?wall=${wall}`, vp)
        const c = await columns(p)
        widths[wall] = c.main?.w
        console.log(`        ?wall=${wall}: left ${c.left?.w}px, feed ${c.main?.w}px, right ${c.right?.w ?? "none"}`)
        expect(c.columns === "three" && c.left?.w === 280 && c.right?.w === 300 && c.main.x === c.left.right + 24 && c.right.x === c.main.right + 24, `?wall=${wall}: three columns, 280px left, the feed, 300px right, 24px apart`, c)
        expect(c.leftOrder.join() === "card,places" && !!c.places && c.places.x === c.left.x && c.places.y === c.card.b + 12, "round 9: the places in the LEFT column, 12px under the community card, and nothing else there", { order: c.leftOrder, card: c.card, places: c.places })
        const want = [wall === "both" || wall === "event" ? "event" : null, wall === "both" || wall === "contributors" ? "contributors" : null].filter(Boolean)
        expect(c.rightOrder.join() === want.join() && (!c.contributors || c.contributors.x === c.right.x) && (!c.event || c.event.x === c.right.x), `the right column: ${want.length ? want.join(" then ") : "nothing (no event, no contributors)"}`, c.rightOrder)
        if (wall === "both") expect(c.contributors.y >= c.event.b + 12 && c.event.y === c.main.y, "the event at the top of the right column, the contributors 12px under it", { event: c.event, contributors: c.contributors, main: c.main })
        if (wall === "both") {
          expect(!!c.search && c.search.x === c.main.x && c.mark.x === c.left.x, "the search lines up with the feed, the logo with the left column", { search: c.search, main: c.main, mark: c.mark, left: c.left })
          await shot(p, `${label}-wall-both`)
          await p.evaluate(() => window.scrollTo(0, 0))
          await shot(p, `${label}-wall-both-full`, true)
        } else await shot(p, `${label}-wall-${wall}`)
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
      expect(new Set(Object.values(widths)).size === 1, "the feed is the same width whatever the side cards say", widths)
      /* Not a feed: the same three columns and the same side cards (the places on the left with Classroom marked), the middle where it was. */
      {
        const { p, errors } = await open("classroom", "/community/clay-studio/classroom", vp)
        const c = await columns(p)
        const on = await p.evaluate(() => document.querySelector("[data-wall-places] [aria-current=page]")?.textContent?.trim())
        expect(c.columns === "three" && on === "Classroom" && c.leftOrder.join() === "card,places" && c.rightOrder.join() === "event,contributors" && c.main.w === widths.both && c.main.x === c.left.right + 24, "the classroom: the same columns and the same side cards as the feed (nothing in the frame changes), Classroom marked", { c, on })
        await shot(p, `${label}-classroom`)
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
      /* The address under the name copies the community's link and says so for a moment, in the same place. */
      {
        const { p, errors } = await open("feed", "/community/clay-studio", vp)
        await p.evaluate(() => { window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copied.push(t) } }, configurable: true }) })
        const before = await p.evaluate(() => { const r = document.querySelector("[data-wall-address]").getBoundingClientRect(); return { h: Math.round(r.height), y: Math.round(r.top) } })
        await p.click("[data-wall-address]")
        await sleep(120)
        const after = await p.evaluate(() => { const a = document.querySelector("[data-wall-address]"); const r = a.getBoundingClientRect(); return { copied: window.__copied, text: a.textContent.trim(), h: Math.round(r.height), y: Math.round(r.top), went: (window.__router || []).filter((x) => x[0] === "link").length } })
        expect(after.copied.join() === "https://storelib.com/community/clay-studio" && after.text === "Link copied" && after.h === before.h && after.y === before.y && after.went === 0, "a press on the address copies the link and says Link copied in its place, nothing moves, no page opens", { before, after })
        await shot(p, `${label}-address-copied`)
        await sleep(1700)
        const back = await p.evaluate(() => document.querySelector("[data-wall-address]").textContent.trim())
        expect(back === "storelib.com/community/clay-studio", "and turns back into the address", back)
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
      /* Staff: Settings on the card, to the creator side; the composer's toolbar (round 7) opens with the editor. */
      {
        const { p, errors } = await open("feed", "/community/clay-studio?staff=1", vp)
        const st = await p.evaluate(() => ({ settings: document.querySelector("[data-wall-settings]")?.getAttribute("href") }))
        expect(st.settings === "/app/community/c0000000-0000-4000-8000-000000000001/settings", "staff: Settings opens the community's settings", st)
        await shot(p, `${label}-wall-staff`)
        /* Pressed, the composer opens (in place, or a screen of its own on a phone) and its toolbar's Poll adds a poll. */
        await p.click("[data-composer-open]")
        await sleep(450)
        await p.click('[data-composer-tool="poll"]')
        await sleep(150)
        const poll = await p.evaluate(() => ({ open: document.querySelector("[data-composer=sheet]") ? "sheet" : document.querySelector("[data-composer=open]") ? "open" : "closed", editor: !!document.querySelector("[data-composer-poll-editor]") }))
        expect(poll.open === (phone ? "sheet" : "open") && poll.editor, "the toolbar's Poll puts a poll in the opened composer", poll)
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
      {
        const { p, errors } = await open("feed", "/community/clay-studio?wall=activity", vp)
        const a = await p.evaluate(() => ({ head: document.querySelector("[data-wall-contributors]")?.innerText.replace(/\s+/g, " ").trim(), basis: document.querySelector("[data-wall-contributors]")?.getAttribute("data-wall-contributors") }))
        expect(a.basis === "activity" && /^Most active Posts and comments, last 30 days/.test(a.head || "") && /1 Jonas Berg 14/.test(a.head || ""), "points off: Most active, labelled as posts and comments over 30 days", a)
        await shot(p, `${label}-wall-activity`)
        expect(errors.length === 0, "no page errors", errors)
        await p.close()
      }
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

    /*
      ── SWITCHING SPACES AND SORTS IN PLACE (round 7, asks 9 and 10; round 9, ask 22) ──────
      The harness answers /posts and /bookmarks itself after 250ms (scripts/render-community-shell.tsx), so a list that is not
      cached costs exactly one ask and a quarter of a second, and a cached one should cost nothing. Each switch is timed from
      the click to the frame its posts are on screen, every frame in between sampled: the list on screen never empties into
      nothing and never shows a skeleton; round 9: the previous list stays for a moment, then a small spinner holds its place
      until the new one swaps in. ?idle=0 keeps the feed from reading the spaces ahead, so "uncached" is uncached here (the
      reading ahead is measured on its own below).
    */
    {
      const { p, errors } = await open("feed", "/community/clay-studio?idle=0", vp)
      /* One switch: click (or tap) a chip, then sample every frame until `done` holds. */
      const sw = (sel, done, how = "click") =>
        p.evaluate(
          (sel, done, how) =>
            new Promise((resolve) => {
              const calls0 = window.__feedCalls.length
              const tasks = []
              const po = typeof PerformanceObserver === "undefined" ? null : new PerformanceObserver((l) => tasks.push(...l.getEntries().map((e) => Math.round(e.duration))))
              try { po?.observe({ type: "longtask" }) } catch {}
              const el = document.querySelector(sel)
              const frames = []
              const t0 = performance.now()
              let last = t0
              const ok = new Function(`return (${done})`)
              if (how === "tap") el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }))
              el.click()
              const tick = () => {
                const now = performance.now()
                const list = document.querySelector("[data-feed-list]")
                frames.push({ dt: Math.round(now - last), at: Math.round(now - t0), posts: list ? list.querySelectorAll("[data-post]").length : -1, spinner: !!document.querySelector('[data-place-spinner="list"]'), skeleton: !!document.querySelector(".skeleton-deferred, [data-skeleton]"), empty: !!document.querySelector("[data-feed-empty]"), opacity: list ? Number(getComputedStyle(list).opacity) : null })
                last = now
                if (ok() || now - t0 > 3000) {
                  po?.disconnect()
                  resolve({ ms: Math.round(now - t0), done: ok(), frames, tasks, calls: window.__feedCalls.slice(calls0), path: location.pathname, key: document.querySelector("[data-feed-key]")?.getAttribute("data-feed-key") })
                }
                else requestAnimationFrame(tick)
              }
              requestAnimationFrame(tick)
            }),
          sel,
          done,
          how,
        )
      const how = phone ? "tap" : "click"
      const t = {}
      /* Uncached: one ask, the old list stays on screen until Glaze lab's arrives. */
      t.uncached = await sw('[data-space-chip="glaze-lab"]', '!!document.querySelector(\'[data-post="p-glaze-1"]\') && !document.querySelector(\'[data-post="p-pinned"]\')', how)
      expect(t.uncached.done && t.uncached.calls.length === 1 && /space=s-glaze/.test(t.uncached.calls[0]) && /sort=default/.test(t.uncached.calls[0]), "a space not seen yet: one ask for its first page (sort Default)", t.uncached.calls)
      expect(t.uncached.frames.every((f) => (f.posts > 0 || f.spinner) && !f.skeleton && !f.empty), "while it comes, there is always the old list or the spinner (never empty, no skeleton)", t.uncached.frames.map((f) => (f.spinner ? "spin" : f.posts)))
      {
        const F = t.uncached.frames
        const firstSpin = F.find((f) => f.spinner)
        const lastOld = [...F].reverse().find((f) => f.posts > 0 && !f.spinner && f.at < (firstSpin?.at ?? 0))
        expect(!!firstSpin && firstSpin.at >= 150 && !F.some((f) => f.at < 150 && f.spinner), "round 9: the old list stays for the first ~160ms, then a small spinner takes its place (no skeleton)", { firstSpin: firstSpin?.at, lastOld: lastOld?.at })
        const arrived = F.at(-1)
        expect(arrived.posts > 0 && arrived.opacity !== null && arrived.opacity < 0.6, "the new list comes in from nothing after the spinner (an opacity ease, not a cut)", { opacity: arrived.opacity })
      }
      expect(t.uncached.path === "/community/clay-studio/space/glaze-lab", "the address follows: /space/glaze-lab", t.uncached.path)
      const chipNow = await p.evaluate(() => document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip"))
      expect(chipNow === "glaze-lab", "the chip is chosen at once", chipNow)
      /* Cached: back to All, no ask, on the next frame. */
      t.cached = await sw('[data-space-chip="all"]', '!!document.querySelector(\'[data-post="p-pinned"]\')', how)
      /*
        Round 11 (C9, ask 14): the chip is drawn on the frame after the click by itself, and the list on the frame after that (the
        list waits two frame callbacks so the chip is painted first). Clicked from here, React draws the chip in a microtask after
        this script, so the first sampled frame is the chip's: the list is on the third sample at most.
      */
      expect(t.cached.done && t.cached.calls.length === 0 && t.cached.frames.length <= 3 && t.cached.ms <= 150, "a list already seen: no ask, the chip at once and the list on the frame after it", { ms: t.cached.ms, frames: t.cached.frames.length, calls: t.cached.calls })
      t.cachedAgain = await sw('[data-space-chip="glaze-lab"]', '!!document.querySelector(\'[data-post="p-glaze-1"]\')', how)
      expect(t.cachedAgain.calls.length === 0 && t.cachedAgain.frames.length <= 3, "and so is Glaze lab, the second time", { ms: t.cachedAgain.ms, frames: t.cachedAgain.frames.length, calls: t.cachedAgain.calls })
      {
        const o = [t.cached, t.cachedAgain].map((x) => x.frames.at(-1).opacity)
        /* The frame the list is first sampled on can be a frame into its 200ms ease on a loaded machine; scripts/check-community-frame11.mjs reads every frame of it. */
        expect(o.every((v) => v !== null && v >= 0.3) && o.some((v) => v < 1), "round 9: a cached list swaps in with a short crossfade (from about a third to full, never from nothing)", o)
      }
      /* A slow list: the spinner, alone in the middle column under the chips, thin and grey; then the list. */
      {
        await p.evaluate(() => { window.__feedLatency = 1500 })
        await p.evaluate((how) => { const el = document.querySelector('[data-space-chip="announcements"]'); if (how === "tap") el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })); el.click() }, how)
        await sleep(450)
        const sp = await p.evaluate(() => {
          const s = document.querySelector('[data-place-spinner="list"]')
          const g0 = s?.querySelector("svg")?.getBoundingClientRect()
          const g = g0 && { width: Number(s.querySelector("svg").getAttribute("width")), left: g0.left + g0.width / 2 - Number(s.querySelector("svg").getAttribute("width")) / 2, top: g0.top }
          const col = document.querySelector("[data-community-main]")?.getBoundingClientRect() ?? document.querySelector("[data-feed]").getBoundingClientRect()
          const chips = document.querySelector("[data-space-chips]").getBoundingClientRect()
          const stroke = s?.querySelector("line")
          return s && g ? { size: Math.round(g.width), cx: Math.round(g.left + g.width / 2), colCx: Math.round(col.left + col.width / 2), belowChips: g.top > chips.bottom, color: getComputedStyle(s.querySelector("svg")).color, strokeW: stroke?.getAttribute("stroke-width"), spokes: s.querySelectorAll("line").length, opacity: Number(getComputedStyle(s).opacity), anim: getComputedStyle(s.querySelector("[data-place-spinner-glyph]")).animationName, posts: document.querySelectorAll("[data-feed-list] [data-post]").length, chipOn: document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip") } : null
        })
        expect(!!sp && sp.size <= 24 && Math.abs(sp.cx - sp.colCx) <= 2 && sp.belowChips && sp.spokes === 8 && sp.strokeW === "2" && sp.color === "rgb(138, 143, 152)" && sp.opacity > 0.9 && sp.anim === "spin" && sp.posts === 0 && sp.chipOn === "announcements", "a list that is slow: a small thin grey spinner centred in the middle column under the chips, the chips staying as they are", sp)
        await shot(p, `${label}-space-spinner`)
        await p.waitForSelector('[data-community-feed="space:announcements"]:not([data-feed-waiting])', { timeout: 4000 })
        await p.evaluate(() => { window.__feedLatency = 250 })
        /* Back to Glaze lab (cached), where the steps below start from; a click in the page, so no pointer is left resting on a chip. */
        await p.evaluate(() => document.querySelector('[data-space-chip="glaze-lab"]').click())
        await sleep(300)
      }
      /* Ahead of the click: a pointer resting on General (a finger landing on it on a phone) asks for it; the click then costs nothing. */
      const before = await p.evaluate(() => window.__feedCalls.length)
      if (phone) await p.evaluate(() => document.querySelector('[data-space-chip="general"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })))
      else await p.hover('[data-space-chip="general"]')
      await sleep(400)
      const asked = await p.evaluate((n) => window.__feedCalls.slice(n), before)
      expect(asked.length === 1 && /space=s-general/.test(asked[0]), phone ? "a finger landing on a chip asks for its list ahead" : "a pointer resting on a chip asks for its list ahead", asked)
      t.prefetched = await sw('[data-space-chip="general"]', '!!document.querySelector(\'[data-community-feed="space:general"]\') && !document.querySelector(\'[data-feed-waiting]\')')
      expect(t.prefetched.calls.length === 0 && t.prefetched.frames.length <= 3, "so the click shows it on the frame after the chip's, with no ask of its own", { ms: t.prefetched.ms, frames: t.prefetched.frames.length, calls: t.prefetched.calls })
      /* Back goes to the list before, at once. */
      const back = await p.evaluate(() => new Promise((resolve) => { const t0 = performance.now(); let frames = 0; history.back(); const tick = () => { frames++; if (document.querySelector('[data-community-feed="space:glaze-lab"]') || performance.now() - t0 > 2000) resolve({ ms: Math.round(performance.now() - t0), frames, path: location.pathname, key: document.querySelector("[data-community-feed]")?.getAttribute("data-community-feed") }); else requestAnimationFrame(tick) }; requestAnimationFrame(tick) }))
      /* Counted in frames (Back's popstate, the chips, then the list two frame callbacks later), not milliseconds on a shared machine. */
      expect(back.path === "/community/clay-studio/space/glaze-lab" && back.key === "space:glaze-lab" && back.frames <= 4, "Back returns to the list before, from the cache", back)
      const long = [t.uncached, t.cached, t.cachedAgain, t.prefetched].flatMap((x) => x.frames.map((f) => f.dt))
      const tasks = [t.uncached, t.cached, t.cachedAgain, t.prefetched].flatMap((x) => x.tasks)
      if (process.env.FRAMES) console.log(JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.frames.map((f) => f.dt)]))))
      console.log(`        switch to content: uncached ${t.uncached.ms}ms (the 250ms answer), cached ${t.cached.ms}ms / ${t.cachedAgain.ms}ms, read ahead ${t.prefetched.ms}ms; longest frame ${Math.max(...long)}ms (headless, software paint); long tasks: ${tasks.length ? tasks.join(", ") + "ms" : "none"}; asks: 1, 0, 0, 0 (+1 ahead)`)
      expect(tasks.length === 0, "no long task (over 50ms of script) while switching", tasks)

      /* ── THE SORT MENU (ask 9): no Latest / Popular pills; a sliders button at the row's end (round 9: no Saved chip after it). ── */
      const sortLook = await p.evaluate(() => {
        const b = document.querySelector("[data-feed-sort-button]")
        const row = document.querySelector("[data-space-chips]")
        const r = b?.getBoundingClientRect()
        return {
          pills: [...document.querySelectorAll("[data-feed] button, [data-feed] [role=tab]")].filter((x) => /^(Latest|Popular)$/.test(x.textContent.trim())).length + document.querySelectorAll('[role=tablist][aria-label="Sort posts"]').length,
          button: !!b,
          atEnd: !!b && !!row && row.lastElementChild === b.closest("[data-feed-sort]") && !document.querySelector('[data-space-chip="saved"]'),
          size: r && Math.round(r.height),
          shadow: b && getComputedStyle(b).boxShadow,
          label: b?.getAttribute("aria-label"),
        }
      })
      expect(sortLook.pills === 0, "no Latest / Popular pills under the composer", sortLook.pills)
      expect(sortLook.button && sortLook.atEnd && sortLook.size === (phone ? 40 : 36) && sortLook.shadow !== "none" && sortLook.label === "Sort posts: Default", "a sliders button at the end of the chips row (no Saved chip), with the same little depth", sortLook)
      await p.click("[data-feed-sort-button]")
      await sleep(250)
      const menuNow = await p.evaluate(() => ({ items: [...document.querySelectorAll("[data-feed-sort-item]")].map((x) => `${x.getAttribute("data-feed-sort-item")}${x.getAttribute("aria-checked") === "true" ? "*" : ""}`), focus: document.activeElement?.getAttribute("data-feed-sort-item"), box: (() => { const r = document.querySelector("[data-feed-sort-menu]")?.getBoundingClientRect(); return r && { right: Math.round(r.right), w: Math.round(r.width), x: Math.round(r.left) } })(), vw: innerWidth }))
      expect(menuNow.items.join() === "default*,new,top,unread,saved" && menuNow.focus === "default" && menuNow.box && menuNow.box.x >= 0 && menuNow.box.right <= menuNow.vw, "the menu: Default (chosen, focused), New, Top, Unread, and Saved posts under a rule (round 9), on screen", menuNow)
      await shot(p, `${label}-sort-menu`)
      await p.keyboard.press("ArrowDown")
      await p.keyboard.press("ArrowDown")
      const top = await p.evaluate(() => new Promise((resolve) => {
        const n = window.__feedCalls.length
        const t0 = performance.now()
        document.activeElement.click()
        const tick = () => {
          const ids = [...document.querySelectorAll("[data-feed-list] [data-post]")].map((x) => x.getAttribute("data-post"))
          if ((!document.querySelector("[data-feed-waiting]") && /\|top$/.test(document.querySelector("[data-feed-key]")?.getAttribute("data-feed-key") || "")) || performance.now() - t0 > 3000) resolve({ ms: Math.round(performance.now() - t0), ids, calls: window.__feedCalls.slice(n), menu: !!document.querySelector("[data-feed-sort-menu]"), dot: !!document.querySelector("[data-feed-sort-dot]"), label: document.querySelector("[data-feed-sort-button]")?.getAttribute("aria-label") })
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }))
      expect(top.calls.length === 1 && /sort=top/.test(top.calls[0]) && /space=s-glaze/.test(top.calls[0]) && top.ids.join() === "p-glaze-1,p-glaze-2", "Top asks for this space's list (Glaze lab, where Back left us), most liked first", { calls: top.calls, ids: top.ids })
      expect(!top.menu && top.dot && top.label === "Sort posts: Top", "the menu closes; the choice shows on the button as a dot (and in its name), not as a pill", top)
      await p.click("[data-feed-sort-button]")
      await sleep(200)
      const checked = await p.evaluate(() => document.querySelector('[data-feed-sort-item][aria-checked="true"]')?.getAttribute("data-feed-sort-item"))
      expect(checked === "top", "opened again, the menu marks Top", checked)
      await p.keyboard.press("Escape")
      await sleep(150)
      const closed = await p.evaluate(() => ({ menu: !!document.querySelector("[data-feed-sort-menu]"), focus: document.activeElement?.hasAttribute("data-feed-sort-button") }))
      expect(!closed.menu && closed.focus, "Escape closes it and gives the focus back to the button", closed)
      /* The sort holds across spaces: All in Top is a new list (one ask), Unread another. */
      const allTop = await sw('[data-space-chip="all"]', '!document.querySelector("[data-feed-waiting]") && /\\|all\\|top$/.test(document.querySelector("[data-feed-key]")?.getAttribute("data-feed-key") || "")')
      const order = await p.evaluate(() => [...document.querySelectorAll("[data-feed-list] [data-post]")].map((x) => x.getAttribute("data-post")))
      expect(allTop.calls.length === 1 && /sort=top/.test(allTop.calls[0]) && order.slice(0, 2).join() === "p-pinned,p-last", "the sort holds across spaces: All in Top, most liked first, the pinned post in its place", { calls: allTop.calls, order })
      await p.click("[data-feed-sort-button]")
      await sleep(200)
      await p.click('[data-feed-sort-item="unread"]')
      await sleep(400)
      const unread = await p.evaluate(() => ({ ids: [...document.querySelectorAll("[data-feed-list] [data-post]")].map((x) => x.getAttribute("data-post")), call: window.__feedCalls.at(-1) }))
      expect(/sort=unread/.test(unread.call) && unread.ids.join() === "p-text,p-glaze-1", "Unread: only the posts with activity since the member was last here, newest activity first", unread)
      await shot(p, `${label}-sort-unread`)
      /* Round 9: Saved posts lives in this menu. Chosen, the feed switches to Saved in place; an order chosen there goes back to All. */
      await p.click("[data-feed-sort-button]")
      await sleep(200)
      await p.click('[data-feed-sort-item="saved"]')
      await p.waitForSelector('[data-community-feed="saved"]:not([data-feed-waiting])', { timeout: 3000 }).catch(() => {})
      await sleep(250)
      const sv = await p.evaluate(() => ({ path: location.pathname, ids: [...document.querySelectorAll("[data-feed-list] [data-post]")].map((x) => x.getAttribute("data-post")), line: document.querySelector("[data-saved-line]")?.textContent?.trim(), label: document.querySelector("[data-feed-sort-button]")?.getAttribute("aria-label"), dot: !!document.querySelector("[data-feed-sort-dot]"), chipOn: document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip") ?? null }))
      expect(sv.path === "/community/clay-studio/saved" && sv.ids.join() === "p-more" && /^Saved posts/.test(sv.line || "") && sv.label === "Sort posts: Saved posts" && sv.dot && sv.chipOn === null, "Saved posts from the menu: the saved list in place, said in a line under the chips, the button dotted, no chip chosen", sv)
      await shot(p, `${label}-saved-from-menu`)
      await p.click("[data-feed-sort-button]")
      await sleep(200)
      const svMenu = await p.evaluate(() => [...document.querySelectorAll("[data-feed-sort-item]")].map((x) => `${x.getAttribute("data-feed-sort-item")}${x.getAttribute("aria-checked") === "true" ? "*" : ""}`).join())
      expect(svMenu === "default,new,top,unread,saved*", "on Saved the menu marks Saved posts, no order", svMenu)
      await p.click('[data-feed-sort-item="new"]')
      await p.waitForSelector('[data-community-feed="all"]:not([data-feed-waiting])', { timeout: 3000 }).catch(() => {})
      await sleep(250)
      const outOf = await p.evaluate(() => ({ path: location.pathname, key: document.querySelector("[data-feed-key]")?.getAttribute("data-feed-key"), chipOn: document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip") }))
      expect(outOf.path === "/community/clay-studio" && /\|all\|new$/.test(outOf.key || "") && outOf.chipOn === "all", "and an order chosen there goes back to All in that order", outOf)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /* ── A PLACE IS MARKED AT ONCE, AND ITS LINK IS READ AHEAD ON HOVER (ask 10) ── */
    if (!phone) {
      const { p, errors } = await open("feed", "/community/clay-studio", vp)
      const mark = await p.evaluate(() => new Promise((resolve) => {
        const a = document.querySelector('[data-wall-places] a[data-community-nav="Members"]')
        a.click()
        requestAnimationFrame(() => requestAnimationFrame(() => resolve({ on: document.querySelector("[data-wall-places] [aria-current=page]")?.textContent?.trim(), went: (window.__router || []).filter((x) => x[0] === "link").map((x) => x[1]) })))
      }))
      expect(mark.on === "Members" && mark.went.at(-1) === "/community/clay-studio/members", "a click on a place marks it on the next frame, before its page arrives", mark)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    /*
      ── ROUND 9, ASK 22: THE PLACES AND THE SPACES INSIDE ONE FRAME, AT 4x CPU ON A SLOW NETWORK ──
      ?case=nav draws the frame once and swaps the page inside it as the app router does (scripts/render-community-shell.tsx).
      Once idle, every place is asked for in full (router.prefetch, kind "full") and the first page of every feed space is read,
      one after another. Then, at 4x CPU: Members, Classroom and Calendar (read ahead) swap in on the first frame with a fade and
      no spinner; Leaderboards is kept out of the cache (?cold=) and the network is slow (700ms), so it shows the small spinner
      after ~160ms, alone in the middle column, then fades in. Through all of it the frame is the SAME nodes, the bar and the side
      cards are never drawn again (their render counts, counted in this probe's bundle) and nothing in them changes but the mark
      on the place (a MutationObserver over the bar and both side columns). No skeleton anywhere.
    */
    {
      const { p, errors } = await open("nav", "/community/clay-studio?cold=leaderboard&latency=700", vp)
      const cdp = await p.target().createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await p.waitForFunction(() => (window.__feedSpans || []).filter((x) => !/cursor=/.test(x.url)).length >= 4 && window.__feedSpans.every((x) => x.end > 0), { timeout: 10000 }).catch(() => {})
      await sleep(300)
      const ahead = await p.evaluate(() => ({
        places: (window.__router || []).filter((x) => x[0] === "prefetch" && /^\/community\/clay-studio/.test(x[1])).map((x) => x[1]),
        kinds: window.__prefetchKinds || [],
        /* The first pages read ahead (a next page of the list on screen, cursor=, is the feed scrolling, not reading ahead). */
        spans: (window.__feedSpans || []).filter((x) => !/cursor=/.test(x.url)).map((x) => ({ url: x.url, start: Math.round(x.start), end: Math.round(x.end) })),
      }))
      expect(ahead.places.sort().join() === ["/community/clay-studio/about", "/community/clay-studio/classroom", "/community/clay-studio/events", "/community/clay-studio/leaderboard", "/community/clay-studio/members"].join() && ahead.kinds.every((k) => k === "full"), "once idle, every other place is asked for in full, once each (5 asks), never the one on screen", ahead.places)
      const spaces = ahead.spans.map((x) => (/space=([^&]+)/.exec(x.url) || [])[1] || "all")
      expect(spaces.join() === "s-general,s-ann,s-crit,s-glaze" && ahead.spans.every((x) => /sort=default/.test(x.url)), "and the first page of each feed space (4 asks: not All, which is on screen, not the chat space)", spaces)
      expect(ahead.spans.every((x, i) => i === 0 || x.start >= ahead.spans[i - 1].end - 1), "one after another, never in a burst", ahead.spans)
      console.log(`        read ahead on idle: ${ahead.places.length} places (full), ${ahead.spans.length} spaces, one at a time`)

      await p.evaluate(() => {
        const q = (sel) => document.querySelector(sel)
        window.__frame = { header: q("[data-community-top]"), row: q("[data-community-top-row]"), card: q("[data-wall-card]"), places: q("[data-wall-places]"), right: q("[data-community-right-cards]"), tabs: q("[data-community-tabs]"), shell: q("[data-community-shell]") }
        window.__renders0 = { ...(window.__renders || {}) }
        window.__muts = []
        const where = (n) => {
          const el = n.nodeType === 1 ? n : n.parentElement
          if (!el) return "other"
          if (el.closest("[data-community-tabs], [data-wall-places]")) return "mark"
          if (el.closest("[data-community-top]")) return "bar"
          if (el.closest("[data-community-left], [data-community-right]")) return "side"
          return "other"
        }
        const mo = new MutationObserver((list) => { for (const m of list) window.__muts.push({ where: where(m.target), type: m.type, attr: m.attributeName || null, tag: m.target.nodeType === 1 ? m.target.tagName : "#text" }) })
        for (const el of [q("[data-community-top]"), q("[data-community-left]"), q("[data-community-right]")]) if (el) mo.observe(el, { subtree: true, childList: true, attributes: true, characterData: true })
        window.__mo = mo
      })

      const go = (name) =>
        p.evaluate(
          (name) =>
            new Promise((resolve) => {
              const a = [...document.querySelectorAll(`[data-community-nav="${name}"]`)].find((x) => x.getBoundingClientRect().width > 0)
              const frames = []
              const tasks = []
              const po = new PerformanceObserver((l) => tasks.push(...l.getEntries().map((e) => Math.round(e.duration))))
              try { po.observe({ type: "longtask" }) } catch {}
              const t0 = performance.now()
              let last = t0
              a.click()
              const tick = () => {
                const now = performance.now()
                const body = document.querySelector("[data-community-body]")
                const sp = body?.querySelector('[data-place-spinner="page"]')
                const child = body?.firstElementChild
                const content = !!child && !sp
                if (sp && !window.__spinBox && Number(getComputedStyle(sp).opacity) > 0.9) {
                  const s = sp.querySelector("svg")
                  const r = s.getBoundingClientRect()
                  const main = (document.querySelector("[data-community-main]") || body).getBoundingClientRect()
                  const bar = document.querySelector("[data-community-top]").getBoundingClientRect()
                  window.__spinBox = { w: Number(s.getAttribute("width")), cx: Math.round(r.left + r.width / 2), mainCx: Math.round(main.left + main.width / 2), top: Math.round(r.top), barBottom: Math.round(bar.bottom), inMain: r.left >= main.left && r.right <= main.right }
                }
                frames.push({ at: Math.round(now - t0), dt: Math.round(now - last), spinner: sp ? Number(getComputedStyle(sp).opacity) : null, content, opacity: content ? Number(getComputedStyle(child).opacity) : null, skeleton: !!document.querySelector(".skeleton-deferred, [data-skeleton]"), mark: [...document.querySelectorAll("[data-community-nav][aria-current=page]")].map((x) => x.getAttribute("data-community-nav"))[0] ?? null })
                last = now
                const firstContent = frames.findIndex((f) => f.content)
                if ((firstContent >= 0 && now - t0 - frames[firstContent].at > 480) || now - t0 > 5000) {
                  po.disconnect()
                  resolve({ frames, tasks, path: location.pathname })
                } else requestAnimationFrame(tick)
              }
              requestAnimationFrame(tick)
            }),
          name,
        )
      const report = []
      for (const [name, path] of [["Members", "members"], ["Classroom", "classroom"], ["Calendar", "events"]]) {
        const r = await go(name)
        const F = r.frames
        const first = F.findIndex((f) => f.content)
        report.push(`${name} ${F[first]?.at}ms`)
        expect(r.path === `/community/clay-studio/${path}` && first === 0 && F.every((f) => f.spinner === null && !f.skeleton) && F[0].mark === name, `${name} (read ahead): on screen on the first frame after the click, marked at once, no spinner, no skeleton`, { first, at: F[first]?.at, mark: F[0].mark, spin: F.filter((f) => f.spinner !== null).length })
        expect(F[0].opacity < 1 && F.at(-1).opacity === 1, `${name} fades in (opacity ${F[0].opacity} on its first frame, 1 when settled)`, { first: F[0].opacity, last: F.at(-1).opacity })
      }
      /* Cold and slow: the spinner, photographed half way. */
      const coldP = go("Leaderboards")
      await sleep(520)
      await shot(p, `${label}-place-spinner`)
      const cold = await coldP
      const spinBox = await p.evaluate(() => window.__spinBox ?? null)
      {
        const F = cold.frames
        const first = F.findIndex((f) => f.content)
        const shown = F.filter((f) => f.spinner !== null && f.spinner > 0.05)
        report.push(`Leaderboards (cold, 700ms network) ${F[first]?.at}ms, spinner from ${shown[0]?.at}ms`)
        expect(F[0].mark === "Leaderboards" && F.every((f) => !f.skeleton) && first > 0, "a place not read ahead: marked at once, its loading screen in the middle, no skeleton", { mark: F[0].mark, first })
        expect(F.filter((f) => f.at < 140).every((f) => f.spinner === null || f.spinner < 0.05) && shown.length > 0 && shown[0].at >= 150, "the spinner shows only after a moment (~160ms), so a quick place never flashes it", { firstShown: shown[0]?.at, early: F.filter((f) => f.at < 140).map((f) => f.spinner) })
        expect(!!spinBox && spinBox.w <= 24 && spinBox.inMain && Math.abs(spinBox.cx - spinBox.mainCx) <= 2 && spinBox.top > spinBox.barBottom, "a small spinner (22px), centred in the middle column only, under the bar", spinBox)
        expect(first > 0 && F[first].opacity < 1 && F.at(-1).opacity === 1, "then the page fades in where the spinner was", { opacity: F[first]?.opacity, last: F.at(-1).opacity })
      }
      const home = await go("Community")
      {
        const F = home.frames
        report.push(`Community ${F[F.findIndex((f) => f.content)]?.at}ms`)
        expect(F[0].content && F.every((f) => f.spinner === null) && (await p.evaluate(() => !!document.querySelector("[data-community-feed]"))), "back to Community: the feed on the first frame, no spinner", { first: F[0] })
      }
      const frame = await p.evaluate(() => {
        const q = (sel) => document.querySelector(sel)
        const f = window.__frame
        const now = window.__renders || {}
        const r0 = window.__renders0
        const muts = window.__muts
        const by = (w) => muts.filter((m) => m.where === w)
        return {
          same: { header: f.header === q("[data-community-top]"), row: f.row === q("[data-community-top-row]"), card: f.card === q("[data-wall-card]"), places: f.places === q("[data-wall-places]"), right: f.right === q("[data-community-right-cards]"), tabs: f.tabs === q("[data-community-tabs]"), shell: f.shell === q("[data-community-shell]") },
          renders: Object.fromEntries(Object.keys(now).map((k) => [k, (now[k] || 0) - (r0[k] || 0)])),
          bar: by("bar"),
          side: by("side"),
          mark: by("mark").length,
        }
      })
      console.log(`        at 4x CPU: ${report.join("; ")}`)
      console.log(`        frame across 5 moves: renders ${JSON.stringify(frame.renders)}, mutations bar ${frame.bar.length}, side cards ${frame.side.length}, place marks ${frame.mark}`)
      const desk = !phone
      expect(Object.values(frame.same).every(Boolean), "the frame is the same nodes after five moves: the bar, its row, the card, the places, the right column, the tabs, the shell", frame.same)
      expect((frame.renders.CommunityTopBarInner || 0) === 0 && (frame.renders.WallCommunityCardInner || 0) === 0 && (frame.renders.WallUpcomingInner || 0) === 0 && (frame.renders.WallContributorsCardInner || 0) === 0, "the bar and the side cards are never drawn again (render counts 0); only the places' list marks the new place", frame.renders)
      expect(frame.bar.length === 0 && frame.side.length === 0 && (desk ? frame.mark > 0 : true), "nothing in the bar or the side cards changes; only the place mark moves", { bar: frame.bar.slice(0, 6), side: frame.side.slice(0, 6) })
      const allTasks = [cold, home].flatMap((x) => x.tasks)
      console.log(`        long tasks at 4x CPU while moving: ${allTasks.length ? allTasks.join(", ") + "ms" : "none"}`)

      /* The spaces, at 4x CPU, after the idle reading ahead: every chip is cached, so each switch asks nothing and is on screen at once. */
      const chip = (slug, sel) =>
        p.evaluate(
          (slug, sel) =>
            new Promise((resolve) => {
              const n = window.__feedCalls.length
              const t0 = performance.now()
              const el = document.querySelector(`[data-space-chip="${slug}"]`)
              el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }))
              el.click()
              let frames = 0
              const tick = () => {
                frames++
                if (document.querySelector(sel) || performance.now() - t0 > 3000) resolve({ ms: Math.round(performance.now() - t0), frames, calls: window.__feedCalls.slice(n), spinner: !!document.querySelector("[data-place-spinner]") })
                else requestAnimationFrame(tick)
              }
              requestAnimationFrame(tick)
            }),
          slug,
          sel,
        )
      const chips = []
      for (const [slug, post] of [["glaze-lab", "p-glaze-1"], ["critique", "p-photo"], ["general", "p-text"], ["all", "p-pinned"]]) chips.push({ slug, ...(await chip(slug, `[data-post="${post}"]`)) })
      console.log(`        spaces at 4x CPU, read ahead: ${chips.map((c) => `${c.slug} ${c.ms}ms/${c.frames}f/${c.calls.length} asks`).join(", ")}`)
      expect(chips.every((c) => c.calls.length === 0 && c.frames <= 3 && !c.spinner), "every space, read ahead on idle: no ask, no spinner, on screen on the first or second frame, at 4x CPU", chips)
      const after = await p.evaluate(() => ({ header: window.__frame.header === document.querySelector("[data-community-top]"), bar: window.__muts.filter((m) => m.where === "bar").length, renders: (window.__renders.CommunityTopBarInner || 0) - (window.__renders0.CommunityTopBarInner || 0) }))
      expect(after.header && after.bar === 0 && after.renders === 0, "and switching spaces leaves the bar alone too", after)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      await shot(p, `${label}-nav-after`)
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
          /* Round 11: the facts are quiet words under the name (no price, no members); the figures one panel under the media. */
          info: [...document.querySelectorAll("[data-community-info] [data-info]")].map((li) => li.textContent.replace(/\s+/g, " ").trim()),
          stats: [...document.querySelectorAll("[data-community-sheet] [data-stat]")].map((d) => d.textContent.trim()),
          paying: [...document.querySelectorAll("[data-review-paying]")].map((s) => s.textContent.trim()),
          reviewLinks: [...document.querySelectorAll("[data-review] [data-person-link]")].map((a) => a.getAttribute("href")),
          order: { gallery: y("[data-community-gallery]"), info: y("[data-community-info]"), stats: y("[data-community-sheet] [data-community-stats]"), description: y("[data-community-description]") },
        }
      })
      expect(!a.pills, "a visitor gets the bar without the member's tabs", a.pills)
      expect(a.title === "Clay Studio" && /4\.9 · 121 reviews/.test(a.rating || ""), "the title, then stars and the review count", a.rating)
      expect(a.main === "image" && a.thumbs === 6, "the gallery: a large picture and a strip of six", { main: a.main, thumbs: a.thumbs })
      expect(a.info[0] === "Private community" && a.info.at(-1) === "ByMara Lindqvist" && !a.info.some((t) => /\$|members/.test(t)), "the facts line: private, By creator, no price and no member count", a.info)
      expect(a.stats.join("|") === "8,012Members|191Online now", "Members and Online now in the sheet", a.stats)
      expect(a.paying.join("|") === "· Still a paying member after 3 months|· Still a paying member after 4 days", "Still a paying member only where it is true", a.paying)
      expect(a.reviewLinks.join() === "/@ayla,/joemoss", "a reviewer's name opens their page (none for no username)", a.reviewLinks)
      expect(a.order.info < a.order.gallery && a.order.gallery < a.order.stats && a.order.stats < a.order.description, "the facts line under the name, then the gallery, the figures and the description", a.order)

      /* A thumbnail changes the picture; the video plays in place. */
      const before = await p.evaluate(() => document.querySelector("[data-gallery-main] .swiper-slide-active img")?.getAttribute("src"))
      await p.evaluate(() => document.querySelectorAll("[data-gallery-thumb]")[2].click())
      await sleep(150)
      const after = await p.evaluate(() => ({ src: document.querySelector("[data-gallery-main] .swiper-slide-active img")?.getAttribute("src"), selected: [...document.querySelectorAll("[data-gallery-thumb]")].findIndex((t) => t.getAttribute("aria-selected") === "true") }))
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
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, button: document.querySelector("[data-join-bar] [data-join-state]")?.textContent?.trim(), price: document.querySelector("[data-join-bar-price]")?.textContent?.trim() }
        })
        expect(bar.bottom === bar.vh && bar.button === "Join" && /^\$9\/month/.test(bar.price || ""), "the join bar is pinned to the bottom: the price, and Join beside it", bar)
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
        stats: [...document.querySelectorAll("[data-community-sheet] [data-stat]")].map((d) => d.getAttribute("data-stat")),
        creator: document.querySelector("[data-info=creator] a")?.getAttribute("href"),
      }))
      expect(/^\/login\?next=/.test(v.login || "") && !v.messages && !v.bell, "signed out: Log in, no Messages, no bell", v)
      const vgeo = await barGeometry(p)
      const vwas = phone ? BEFORE.visitorPhone : BEFORE.visitorDesktop
      console.log(`        a visitor's bar: ${vwas}px before, ${vgeo.height}px now`)
      expect(vgeo.height === (phone ? 57 : 65), "a visitor's bar: one row (56px on a phone, 64px on a computer), no tabs", { before: vwas, now: vgeo.height })
      expect(phone ? vgeo.trigger.right <= vgeo.markX : vgeo.trigger.x >= vgeo.nameRight, phone ? "the hamburger left of the picture for a visitor too" : "the hamburger right of the name for a visitor too", vgeo)
      const vp2 = await pillsInBar(p)
      const login = await p.evaluate(() => { const l = document.querySelector("[data-community-login]"); const cs = getComputedStyle(l); return { h: Math.round(l.getBoundingClientRect().height), bg: cs.backgroundColor, border: cs.borderTopWidth } })
      expect(vp2.pills.length === 0 && login.bg === "rgba(0, 0, 0, 0)" && login.border === "0px" && login.h === 40, "Log in is a word in a 40px target, not an outlined pill; nothing else in the bar is a pill", { pills: vp2.pills, login })
      expect(!v.gallery, "no gallery and no cover: no empty media box", v.gallery)
      expect(v.stats.join() === "members", "Online is left out when it cannot be known", v.stats)
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
      /* The name in the upper part of the window, so the card has room to open under it. */
      await p.evaluate((sel) => { const el = document.querySelector(sel); window.scrollBy(0, el.getBoundingClientRect().top - 220) }, name)
      await sleep(150)
      const at = await center(name)
      const t0 = await p.evaluate((sel) => {
        /* Every frame for a second: the card's opacity, its scale and shift, and its box, from the frame it appears. */
        window.__frames = []
        const start = performance.now()
        const tick = () => {
          const c = document.querySelector("[data-person-card]")
          if (c) {
            const cs = getComputedStyle(c)
            const r = c.getBoundingClientRect()
            window.__frames.push({ t: Math.round(performance.now() - start), o: Number(cs.opacity), tf: cs.transform, x: Math.round(r.left), box: `${c.offsetLeft},${c.offsetTop},${c.offsetWidth},${c.offsetHeight}`, name: Math.round(document.querySelector(sel).getBoundingClientRect().top) })
          }
          if (performance.now() - start < 1000) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        return performance.now()
      }, name)
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
      expect(!!card && card.level === "2" && card.profile === "/@leom" && card.buttons.join() === "Profile,Follow", "the level on the photo, and Profile and Follow (round 9: no Message)", card && { level: card.level, buttons: card.buttons })
      expect(!!card && card.box.y > at.y && card.box.b <= 900 && card.box.x >= 12, "the card sits under the name, inside the window", card?.box)
      expect(!!first && first.o < 0.9 && !!full && full.t - first.t <= 220 && frames.some((f) => f.tf !== "none" && f.o < 1) && new Set(frames.map((f) => f.box)).size === 1, "it fades and settles in within ~150ms, by opacity, scale and shift only, its box where it ends from the first frame", { first, full, n: frames.length, boxes: [...new Set(frames.map((f) => f.box))], mid: frames.slice(0, 5).map((f) => [f.t, f.o.toFixed(2)]) })
      await shot(p, `${label}-person-card`)
      /* Crossing from the name into the card keeps it. */
      await p.mouse.move(card.box.x + 40, card.box.y + 30, { steps: 4 })
      await sleep(400)
      const kept = await p.evaluate(() => !!document.querySelector("[data-person-card]:not([data-leaving])"))
      expect(kept, "moving from the name into the card keeps it open", kept)
      /* Follow, then Message opens the panel in place. */
      /*
        Round 7: Follow was disabled while its request was out, so a quick
        second press did nothing until the server answered. Three quick
        presses now each flip it at once, and the server hears the last one.
      */
      const state = () => p.evaluate(() => { const b = document.querySelector("[data-person-card-follow]"); return `${b?.getAttribute("data-person-card-follow")}${b?.disabled ? " disabled" : ""}` })
      const presses = []
      for (let i = 0; i < 3; i++) {
        await p.click("[data-person-card-follow]")
        presses.push(await state())
        await sleep(60)
      }
      expect(presses.join() === "following,follow,following", "three quick presses each flip it at once, never disabled", presses)
      await sleep(150)
      const followed = await p.evaluate(() => document.querySelector("[data-person-card-follow]")?.getAttribute("data-person-card-follow"))
      const tick = await p.evaluate(() => { const b = document.querySelector("[data-person-card-follow]"); const svg = b.querySelector("svg"); const r = b.getBoundingClientRect(); return { check: Math.round(svg?.getBoundingClientRect().width ?? 0), fits: b.scrollWidth <= Math.ceil(r.width) } })
      expect(tick.check === 14 && tick.fits, "Following shows its check and fits its button", tick)
      await sleep(400)
      const follows = calls.filter((c) => c.url === "/api/follow" && c.method === "POST").length
      expect(followed === "following" && follows === 1, "Follow follows (one POST /api/follow, for the last press) and shows Following", { followed, follows })
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
      /* Round 9: the card has Profile and Follow only. */
      await p.mouse.move(at.x, at.y)
      await sleep(550)
      const noMsg = await p.evaluate(() => ({ card: !!document.querySelector("[data-person-card]"), message: !!document.querySelector("[data-person-card-message]") }))
      expect(noMsg.card && !noMsg.message, "the card has no Message button", noMsg)
      await p.keyboard.press("Escape")
      await sleep(300)
      /* Keyboard: focus on a name opens the card; Tab steps in; Escape closes and hands focus back. */
      await p.mouse.move(1300, 860)
      await p.evaluate(() => window.scrollTo(0, 0))
      await sleep(100)
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
  /* ── 1024 and 768: two columns with the right cards under the left, and the tablet ─── */
  if (!process.env.ONLY) {
    for (const [label, vp, want] of [["laptop-1024", { width: 1024, height: 768, deviceScaleFactor: 1 }, 65], ["tablet-768", { width: 768, height: 1024, deviceScaleFactor: 1 }, 97]]) {
      console.log(`\n${label}`)
      const { p, errors } = await open("feed", "/community/clay-studio", vp)
      await shot(p, `${label}-feed`)
      await shot(p, `${label}-feed-full`, true)
      const geo = await barGeometry(p)
      expect(geo.height === want, `the header is ${want}px (${want === 65 ? "one 64px row, the places in the left column" : "56 + 40 of tabs + the hairline"})`, geo.height)
      expect(geo.trigger.x >= geo.nameRight, "the hamburger right of the name", geo)
      const pills = await pillsInBar(p)
      expect(pills.pills.length === 0, "nothing pill shaped", pills.pills)
      const s = await sideScroll(p)
      expect(s.scroll <= s.width, "nothing scrolls sideways", s)
      const c = await p.evaluate(() => {
        const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), b: Math.round(b.bottom), right: Math.round(b.right) } : null }
        return { left: r("[data-community-left]"), main: r("[data-community-main]"), right: r("[data-community-right]"), places: r("[data-wall-places]"), card: r("[data-wall-card]"), event: r("[data-wall-upcoming]"), more: r("[data-wall-contributors]"), search: r('[data-community-search="field"]'), tabs: r("[data-community-tabs]") }
      })
      if (want === 65) {
        expect(!!c.left && c.left.w === 260 && !!c.places && c.places.y >= c.card.b && !!c.right && c.right.x === c.left.x && c.right.y >= c.left.b && !!c.event && c.event.y >= c.places.b && !!c.more && c.more.x === c.left.x && c.more.y >= c.event.b && c.main.x === c.left.right + 24, "from 1024px to 1279px: two columns, the card, the places, the event, then the contributors, all in the left column", c)
        expect(!c.tabs && !!c.search, "the places in the left column (no tabs), the search field in the bar", { tabs: c.tabs, search: c.search })
      } else {
        expect(!c.left && !c.right && !!c.main && c.main.w === 768 - 48 && !!c.tabs && !!c.search, "a tablet: one column, the row of tabs, the search field in the bar", c)
      }
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }
  await browser.close()
} finally {
  if (!process.env.KEEP_STUBS) rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks passed")
process.exit(broken ? 1 : 0)
