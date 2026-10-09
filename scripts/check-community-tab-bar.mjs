/**
 * ===========================================================================
 *  THE PHONE'S TAB BAR INSIDE A COMMUNITY, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real community frame (scripts/render-community-shell.tsx fixtures)
 * with the real buyer tab bar after it (scripts/render-community-tab-bar.tsx),
 * on a 390x844 phone and at 1440x900, pressed with touches:
 *
 *   SHOWN     inside a community the bar is there: across the foot, 56px,
 *             Home, Search, Library, Profile; Home lit on every page of it
 *   TARGETS   Home is the community's home, Library /account/library,
 *             Profile /account; a press on Home from a space goes to
 *             /community/<slug>; on the home itself it scrolls to the top
 *   SEARCH    a press on Search opens the community's own search screen
 *             with its field focused, and it finds the community's posts
 *   VISITOR   on the community's page for somebody signed out there is no
 *             tab bar (lib/nav/buyer-tabs.ts), and the join bar is the foot
 *   OUTSIDE   on /explore the bar is as it was: Home is /explore, and Search
 *             is the site's search even with a community's button mounted
 *   ROOM      the last thing on the page ends above the bar; a chat space's
 *             field is lifted over it; nothing scrolls sideways
 *   DESKTOP   no bar at 1440
 *
 *   PROBE_CSS=source node scripts/check-community-tab-bar.mjs
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
const stubs = join(root, ".community-tabs-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-tabs-")), "shots")
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
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: { id: "u-me" } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }), then: (f) => f({ data: [] }) }; return q },
  }
}
/* The Storelib account menu behind the community bar's "..." (round 7) reads it too. */
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-tab-bar.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-tabs-probe/navigation.js", "next/link": "./.community-tabs-probe/link.jsx", "next/image": "./.community-tabs-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        let body = {}
        if (short.endsWith("/presence")) body = { ok: true, ready: true }
        else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, communities: [] }
        else if (short.startsWith("/api/notifications/inbox")) body = { unread: 0, items: [], nextCursor: null }
        else if (short.includes("/dms")) body = { ready: true, unread: 0, conversations: [] }
        else if (short.includes("/posts?")) body = { pinned: [], posts: [], nextCursor: null }
        else if (/\/search\?q=/.test(short)) {
          const q = decodeURIComponent(short.split("q=")[1] || "").toLowerCase()
          const posts = [{ id: "p-text", title: null, snippet: "Glaze tip that saved me a whole batch: test tiles on the same shelf height.", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), space: { slug: "general", name: "General" }, author: { name: "Priya Raman", avatarUrl: null } }].filter((x) => x.snippet.toLowerCase().includes(q))
          body = { results: { q, posts, members: [], spaces: [{ id: "s-glaze", slug: "glaze-lab", name: "Glaze lab", kind: "feed", description: null }].filter((x) => x.name.toLowerCase().includes(q)) } }
        }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/media/`)) return r.respond({ status: 404, body: "" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(500)
    return { p, errors }
  }

  const bar = (p) =>
    p.evaluate(() => {
      const el = document.querySelector("[data-buyer-tab-bar]")
      if (!el) return null
      const r = el.getBoundingClientRect()
      const tabs = [...el.querySelectorAll("[data-buyer-tab]")]
      return {
        shown: getComputedStyle(el).display !== "none" && r.height > 0,
        top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height),
        keys: tabs.map((t) => t.getAttribute("data-buyer-tab")),
        labels: tabs.map((t) => t.getAttribute("aria-label")),
        hrefs: tabs.map((t) => t.getAttribute("href")),
        current: tabs.findIndex((t) => t.getAttribute("aria-current") === "page"),
        heights: tabs.map((t) => Math.round(t.getBoundingClientRect().height)),
        slots: tabs.map((t) => { const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }),
        html: document.documentElement.getAttribute("data-buyer-tabs"),
        sideways: document.documentElement.scrollWidth - innerWidth,
      }
    })
  const touchTap = async (p, x, y) => {
    const cdp = await p.createCDPSession()
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }] })
    await sleep(60)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(400)
  }
  const pushes = (p) => p.evaluate(() => (window.__router || []).filter(([k]) => k === "push" || k === "link").map(([, h]) => h))

  /* ── SHOWN, on the community's home ────────────────────────────────── */
  console.log("\nphone 390, a member on /community/clay-studio")
  {
    const { p, errors } = await open("/community/clay-studio?case=feed&signedin=1", PHONE)
    const s = await bar(p)
    expect(s && s.shown && s.bottom === 844 && s.width === 390 && s.height === 56, "SHOWN: the bar across the foot, full width, 56px", s && { top: s.top, bottom: s.bottom, width: s.width, height: s.height })
    expect(s.keys.join() === "home,search,library,profile" && s.labels.join() === "Home,Search,Library,Profile", "Home, Search, Library, Profile", s.labels)
    expect(s.hrefs[0] === "/community/clay-studio" && s.hrefs[2] === "/account/library" && s.hrefs[3] === "/account", "TARGETS: Home is the community's home; Library and Profile global", s.hrefs)
    expect(s.current === 0, "Home is lit", s.current)
    expect(s.heights.every((h) => h >= 40), "every tab at least 40px to press", s.heights)
    expect(s.html === "shown" && s.sideways <= 0, "the page knows the bar is there; nothing sideways", { html: s.html, sideways: s.sideways })
    const top = await p.evaluate(() => { const t = document.querySelector("[data-community-top]"); return t ? Math.round(t.getBoundingClientRect().top) : null })
    expect(top === 0, "the community's own bar is still at the top", top)
    await p.screenshot({ path: join(shots, "phone-community-home.png") })
    /* ROOM: scrolled to the end, the last of the page is above the bar. */
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(200)
    const room = await p.evaluate(() => {
      const barTop = document.querySelector("[data-buyer-tab-bar]").getBoundingClientRect().top
      const app = document.getElementById("app")
      let last = 0
      for (const el of app.querySelectorAll("*")) {
        if (getComputedStyle(el).position === "fixed" || el.closest("[data-community-top]")) continue
        const r = el.getBoundingClientRect()
        if (r.height > 0 && r.width > 0) last = Math.max(last, r.bottom)
      }
      return { barTop: Math.round(barTop), last: Math.round(last) }
    })
    expect(room.last <= room.barTop, "ROOM: the end of the page is above the bar, not under it", room)
    await p.screenshot({ path: join(shots, "phone-community-end.png") })
    await p.evaluate(() => window.scrollTo(0, 400))
    await sleep(150)
    await p.evaluate(() => { window.__router = [] })
    await touchTap(p, s.slots[0].x, s.slots[0].y)
    const after = await p.evaluate(() => ({ y: Math.round(scrollY), pushed: (window.__router || []).filter(([k]) => k === "push").length }))
    expect(after.pushed === 0 && after.y < 400, "on the community's home, Home goes to the top of it rather than reloading it", after)

    /* ── SEARCH ── */
    await p.evaluate(() => { window.__router = [] })
    await touchTap(p, s.slots[1].x, s.slots[1].y)
    const opened = await p.evaluate(() => ({
      screen: !!document.querySelector("[data-community-search-screen]"),
      focused: document.activeElement?.hasAttribute("data-community-search-input") ?? false,
      site: document.querySelector("[data-search-overlay]")?.getAttribute("data-search-overlay") ?? null,
      pushed: (window.__router || []).filter(([k]) => k === "push" || k === "link").map(([, h]) => h),
    }))
    expect(opened.screen && opened.focused, "SEARCH: the community's own search screen opens, its field focused", opened)
    expect(opened.site !== "open" && opened.pushed.length === 0, "  not the site's search, and no navigation", opened)
    await p.type("[data-community-search-input]", "glaze")
    await sleep(700)
    const found = await p.evaluate(() => document.querySelector("[data-community-search-screen]")?.textContent?.includes("Glaze tip") ?? false)
    expect(found, "  and it finds the community's posts", found)
    await p.screenshot({ path: join(shots, "phone-community-search.png") })
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  /* ── TARGETS: Home from a space ────────────────────────────────────── */
  console.log("\nphone 390, a member in a space")
  {
    const { p, errors } = await open("/community/clay-studio/space/critique?case=space&signedin=1", PHONE)
    const s = await bar(p)
    expect(s && s.shown && s.current === 0 && s.hrefs[0] === "/community/clay-studio", "the bar, Home lit, Home is the community's home", s && { current: s.current, home: s.hrefs[0] })
    await p.evaluate(() => { window.__router = [] })
    await touchTap(p, s.slots[0].x, s.slots[0].y)
    const went = await pushes(p)
    expect(went.includes("/community/clay-studio"), "a press on Home goes to /community/clay-studio", went)
    /* A chat space fills the screen to its foot: its field is lifted over the bar. */
    const chat = await p.evaluate(() => {
      const d = document.createElement("div")
      d.setAttribute("data-chat", "")
      d.className = "pb-3"
      document.getElementById("app").appendChild(d)
      const v = getComputedStyle(d).paddingBottom
      d.remove()
      return v
    })
    expect(chat === "68px", "a chat space's foot is lifted by the bar's height and its own 12px", chat)
    await p.screenshot({ path: join(shots, "phone-community-space.png") })
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  /* ── VISITOR ───────────────────────────────────────────────────────── */
  console.log("\nphone 390, somebody not in it, on the community's page")
  {
    const { p, errors } = await open("/community/clay-studio/about?case=about-visitor", PHONE)
    const s = await bar(p)
    const jb = await p.evaluate(() => { const j = document.querySelector("[data-join-bar]"); if (!j) return null; const r = j.getBoundingClientRect(); const row = j.querySelector("[data-join-bar-row]").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), rowBottom: Math.round(row.bottom), vh: innerHeight, pb: getComputedStyle(j).paddingBottom } })
    /*
      DRIFT, NOT A REGRESSION: this section used to expect the tab bar here, with the join bar standing on it. A later round
      took the bar off a community's pages for somebody signed out ("visitors keep the join page clear", lib/nav/buyer-tabs.ts
      buyerTabsBelongOn, pinned by tests/native-app-links.test.ts "signed-out visitors on a community see no tab bar"). So a
      visitor gets no bar, and the join bar is the foot itself: its white to the screen's edge, its button 12px above it.
    */
    expect(!s || !s.shown, "no tab bar for somebody signed out; the join page stays clear", s && { shown: s.shown })
    expect(jb && jb.bottom === jb.vh && jb.vh - jb.rowBottom === 12, "the join bar runs to the screen's foot, its button 12px above it", jb)
    await p.screenshot({ path: join(shots, "phone-community-visitor.png") })
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(errors.length === 0 && sideways <= 0, "no page error, nothing sideways", { errors, sideways })
    await p.close()
  }

  /* ── OUTSIDE ───────────────────────────────────────────────────────── */
  console.log("\nphone 390, outside a community (/explore)")
  {
    /*
      DRIFT: the fixture draws the member frame on every address, and the frame now enters the community context itself
      (shell-frame.tsx, so Home has the community's id and name too). In the product that frame only exists under
      /community/<slug>. So Home with no community behind it is read on a page drawn without the member frame (the
      visitor's frame enters nothing), and the page with the frame mounted checks round 12's rule: Home stays the
      community's, and Search is still the site's.
    */
    {
      const { p: q } = await open("/explore?case=about-visitor&signedin=1", PHONE)
      const s0 = await bar(q)
      expect(s0 && s0.shown && s0.hrefs[0] === "/explore" && s0.current === 0, "with no community behind it, Home is /explore, as before", s0 && { home: s0.hrefs[0], current: s0.current })
      await q.close()
    }
    const { p, errors } = await open("/explore?case=feed&signedin=1", PHONE)
    const s = await bar(p)
    expect(s && s.shown && s.hrefs[0] === "/community/clay-studio", "with a community entered, Home leads back to it from /explore (round 12)", s && { home: s.hrefs[0], current: s.current })
    await touchTap(p, s.slots[1].x, s.slots[1].y)
    const which = await p.evaluate(() => ({ community: !!document.querySelector("[data-community-search-screen]"), site: document.querySelector("[data-search-overlay]")?.getAttribute("data-search-overlay") ?? null }))
    expect(!which.community && which.site === "open", "Search is the site's search, even with a community's button on the page", which)
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  /* ── CONTEXT (round 12) ───────────────────────────────────────────── */
  console.log("\nphone 390, the community stays Home from Profile and Library, in one tab")
  {
    const { p, errors } = await open("/community/clay-studio?case=feed&signedin=1", PHONE)
    await sleep(400)
    for (const path of ["/account", "/account/library", "/explore/search"]) {
      await p.goto(`${ORIGIN}${path}?case=feed&signedin=1`, { waitUntil: "load" })
      await sleep(700)
      const s = await bar(p)
      const stored = await p.evaluate(() => sessionStorage.getItem("storelib:community-context"))
      expect(s && s.shown && s.hrefs[0] === "/community/clay-studio" && stored === "clay-studio", `${path}: Home is still the community's`, s && { home: s.hrefs[0], current: s.current, stored })
    }
    /* The navigator's Explore ends it: the next page's Home is Storelib's again. */
    await p.evaluate(() => sessionStorage.removeItem("storelib:community-context"))
    /* Drawn without the member frame, which would enter the community again (see OUTSIDE). */
    await p.goto(`${ORIGIN}/account?case=about-visitor&signedin=1`, { waitUntil: "load" })
    await sleep(700)
    const after = await bar(p)
    expect(after && after.hrefs[0] === "/explore", "once it has ended, Home is Explore again", after && { home: after.hrefs[0] })
    await p.screenshot({ path: join(shots, "phone-context-account.png") })
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  /* ── DESKTOP ───────────────────────────────────────────────────────── */
  console.log("\n1440, inside a community")
  {
    const { p, errors } = await open("/community/clay-studio?case=feed&signedin=1", DESK)
    const s = await bar(p)
    expect(!s || !s.shown, "no bar on a computer", s && { shown: s.shown })
    await p.screenshot({ path: join(shots, "desktop-community.png") })
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
