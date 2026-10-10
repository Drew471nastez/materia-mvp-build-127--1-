/**
 * ===========================================================================
 *  ROUND 16: THE ACCOUNT PAGE FROM A COMMUNITY, AND EDIT PROFILE, PHOTOGRAPHED
 * ===========================================================================
 * The account layout's real pieces (scripts/render-account-pills16.tsx: the
 * community's bar over the profile, the site header's switch, the hub and
 * its pages, Edit profile's layer, the tab bar) served by a real HTTP server
 * at 390x844 (touch, 2x) and 1440x900. Run it in this checkout and in a copy
 * of commit 91eb630d (before round 15) with LABEL=before|after, and compare
 * the screenshots.
 *
 *   ACCOUNT  /account arriving from a community: the community's bar on top,
 *            Storelib's header not drawn, the profile under it
 *   EDIT     Edit profile pressed: the full screen layer, nothing of the
 *            community's header over it
 *   POSTS    /account/posts (this checkout only): the Posts pill lit, the
 *            list in the Activity list's look, 40px or more for every control
 *   TAB      inside a community, the Profile tab's press goes to /account
 *
 *   PROBE_CSS=source LABEL=after node scripts/check-account-pills16.mjs [SECTION ...]
 *   SHOTS_DIR=... keeps the screenshots.
 */
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const LABEL = process.env.LABEL || "now"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-account16-")), "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".account-pills16-probe")
mkdirSync(stubs, { recursive: true })
let broken = 0
const results = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const STUBS = {
  "next-navigation": `import { useSyncExternalStore } from "react"
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const path = () => location.pathname
const search = () => location.search
const go = (href, replace) => { (window.__links ||= []).push(href); history[replace ? "replaceState" : "pushState"]({}, "", href); subs.forEach((f) => f()) }
const router = { push: (h) => setTimeout(() => go(h, false), window.__navMs ?? 60), replace: (h) => setTimeout(() => go(h, true), window.__navMs ?? 60), prefetch: () => {}, back: () => history.back(), refresh: () => {}, forward: () => {} }
addEventListener("popstate", () => subs.forEach((f) => f()))
export const usePathname = () => useSyncExternalStore(subscribe, path, path)
export const useSearchParams = () => { const s = useSyncExternalStore(subscribe, search, search); return new URLSearchParams(s) }
export const useRouter = () => router
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}`,
  "next-link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => {
    rest.onClick && rest.onClick(e)
    if (e.defaultPrevented) return
    e.preventDefault()
    window.__routerPush ? window.__routerPush(href) : (window.__links ||= []).push(href)
  } }, children)
})
export const useLinkStatus = () => ({ pending: false })`,
  "next-image": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}`,
  "supabase-client": `const USER = { id: "u1", email: "alex@example.com", user_metadata: {} }
const rowFor = (table) => table === "profiles" ? { display_name: "Alex Morgan", avatar_url: null, username: "alexmorgan", is_creator: false } : null
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
      getSession: async () => ({ data: { session: { user: USER } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
    channel: () => { const ch = { on: () => ch, subscribe: () => ch, track: async () => "ok", untrack: async () => "ok", send: async () => "ok", presenceState: () => ({}) }; return ch },
    removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k}.jsx`), v)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-account-pills16.tsx")],
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
const js = readFileSync(join(stubs, "app.js"))
const css = await appCss(root)
const faces = interFaces(root)
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/__app.js"></script></body></html>`

const LOGO = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#1a1a2e"/><circle cx="48" cy="44" r="20" fill="#f4efe6"/></svg>`)
const TOP_BAR = {
  community: { id: "c1", slug: "clay-studio", name: "Clay Studio", logoUrl: LOGO },
  creator: { name: "Maya Okafor", href: "/mayao" },
  me: { name: "Alex Morgan", avatarUrl: null, profileHref: "/@alexmorgan", username: "alexmorgan" },
  communities: [{ id: "c1", slug: "clay-studio", name: "Clay Studio", logoUrl: LOGO }],
  manageHref: null,
}
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1")
  if (url.pathname === "/__app.js") {
    res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" })
    return res.end(js)
  }
  if (url.pathname.endsWith("/member-chrome")) {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify({ topBar: TOP_BAR }))
  }
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(404, { "content-type": "application/json" })
    return res.end("{}")
  }
  res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const ORIGIN = `http://127.0.0.1:${server.address().port}`

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--disable-gpu"] })

async function open(vp, path, globals = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.evaluateOnNewDocument((g) => Object.assign(window, g), { __photo: true, __cover: true, ...globals })
  await p.goto(ORIGIN + path, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(900)
  return { p, errors }
}

const facts = (p) =>
  p.evaluate(() => {
    const box = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }
    }
    const chrome = document.querySelector("[data-account-community-chrome]")
    const header = document.getElementById("platform-header-root")
    return {
      sideways: document.documentElement.scrollWidth - innerWidth,
      chrome: box(chrome),
      chromeName: chrome?.textContent?.includes("Clay Studio") ?? false,
      header: header ? box(header) : null,
      cover: box(document.querySelector("[data-profile-cover]")),
      owner: [...document.querySelectorAll("[data-profile-owner-pill]")].map((a) => [a.textContent.trim(), a.getAttribute("data-active")]),
      edit: box(document.querySelector("[data-profile-edit]")),
      tabs: [...document.querySelectorAll("[data-buyer-tab], nav[aria-label] a[href]")].filter((a) => a.closest("[data-buyer-tab-bar], [data-buyer-tabs]")).map((a) => [a.getAttribute("href"), a.getAttribute("aria-current")]),
      pending: document.documentElement.hasAttribute("data-account-community-pending"),
    }
  })

try {
  for (const [name, vp] of [["390", PHONE], ["1440", DESK]]) {
    const phone = name === "390"
    if (want("ACCOUNT")) {
      console.log(`\nACCOUNT ${name}: /account arriving from a community [${LABEL}]`)
      const { p, errors } = await open(vp, "/account")
      const f = await facts(p)
      results[`account${name}`] = f
      await p.screenshot({ path: join(shots, `${LABEL}-account-${name}.png`) })
      await p.screenshot({ path: join(shots, `${LABEL}-account-${name}-full.png`), fullPage: true })
      expect(errors.length === 0 && f.sideways <= 0, "no errors, nothing sideways", { errors, sideways: f.sideways })
      expect(!!f.chrome && f.chrome.top === 0 && f.chromeName, "the community's own bar is on top", f.chrome)
      expect(!f.header, "Storelib's header is not drawn under it", f.header)
      expect(!!f.cover && !!f.chrome && Math.abs(f.cover.top - f.chrome.bottom) <= 1, "the profile's cover starts right under the bar", { cover: f.cover, chrome: f.chrome })
      expect(!f.pending, "the held room for the bar is let go", f.pending)
      console.log(`        pills: ${JSON.stringify(f.owner)}`)
      await p.close()
    }

    if (want("EDIT")) {
      console.log(`\nEDIT ${name}: Edit profile from the account page [${LABEL}]`)
      const { p, errors } = await open(vp, "/account")
      if (phone) await p.tap("[data-profile-edit]")
      else await p.click("[data-profile-edit]")
      await sleep(1100)
      const after = await p.evaluate(() => {
        const links = window.__links || []
        const at = (x, y) => document.elementFromPoint(x, y)
        const top = at(innerWidth / 2, 20)
        const chrome = document.querySelector("[data-account-community-chrome]")
        return {
          links,
          path: location.pathname + location.search,
          topIsChrome: !!(top && chrome && chrome.contains(top)),
          topTag: top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : null,
          settings: !!document.querySelector("[data-account-settings]"),
        }
      })
      results[`edit${name}`] = after
      await p.screenshot({ path: join(shots, `${LABEL}-edit-${name}.png`) })
      expect(errors.length === 0, "no errors", errors)
      if (phone) {
        expect(after.settings && after.path === "/account", "on a phone Edit profile is the full screen layer over the page (no new address)", after)
        expect(!after.topIsChrome, "  and the community's header is not over it", after.topTag)
      } else {
        expect(after.links.includes("/account/settings?section=profile"), "on a computer Edit profile goes to Settings on its Profile tab", after.links)
      }
      await p.close()
    }

    if (want("POSTS")) {
      console.log(`\nPOSTS ${name}: /account/posts [${LABEL}]`)
      const { p, errors } = await open(vp, "/account/posts")
      const f = await facts(p)
      const list = await p.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-account-post]")]
        const dots = [...document.querySelectorAll("[data-account-post-more]")].map((b) => Math.round(b.getBoundingClientRect().height))
        const ul = document.querySelector("[data-account-posts] ul")
        const activityLook = ul ? getComputedStyle(ul) : null
        return { rows: rows.length, dots, radius: activityLook?.borderTopLeftRadius ?? null, bg: activityLook?.backgroundColor ?? null, more: !!document.querySelector("[data-account-posts-more]") }
      })
      results[`posts${name}`] = { ...f, list }
      await p.screenshot({ path: join(shots, `${LABEL}-posts-${name}.png`) })
      await p.screenshot({ path: join(shots, `${LABEL}-posts-${name}-full.png`), fullPage: true })
      expect(errors.length === 0 && f.sideways <= 0, "no errors, nothing sideways", { errors, sideways: f.sideways })
      expect(f.owner.some(([t, on]) => t === "Posts" && on === "true"), "the Posts pill is lit", f.owner)
      expect(!!f.chrome && !f.header, "under the community's bar, like Activity", { chrome: f.chrome, header: f.header })
      expect(list.rows === 3 && list.radius === "16px" && list.bg === "rgb(255, 255, 255)" && list.more, "three posts on the Activity list's white card, Show more under it", list)
      expect(list.dots.length === 3 && list.dots.every((h) => h >= 40), "each post's dots are 40px or more", list.dots)
      if (phone) {
        await p.tap("[data-account-post-more]")
        await sleep(700)
        const sheet = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button, [role=dialog] a, [role=menu] [role=menuitem]")].map((b) => b.textContent.trim()).filter(Boolean))
        await p.screenshot({ path: join(shots, `${LABEL}-posts-${name}-menu.png`) })
        expect(sheet.includes("Edit post") && sheet.includes("Delete post"), "the dots open Edit post and Delete post", sheet)
      }
      await p.close()
    }

    if (want("TAB") && phone) {
      console.log(`\nTAB ${name}: the Profile tab inside a community [${LABEL}]`)
      const { p, errors } = await open(vp, "/community/clay-studio/learn")
      const tabs = await p.evaluate(() => [...document.querySelectorAll("[data-buyer-tab]")].map((a) => [a.getAttribute("data-buyer-tab"), a.getAttribute("href")]))
      results[`tab${name}`] = tabs
      expect(errors.length === 0, "no errors", errors)
      expect(tabs.some(([k, h]) => k === "profile" && h === "/account"), "the tab bar's Profile is /account", tabs)
      await p.tap('[data-buyer-tab="profile"]')
      await sleep(900)
      const went = await p.evaluate(() => ({ links: window.__links || [], path: location.pathname + location.search }))
      results[`tabPress${name}`] = went
      expect(went.path === "/account", "pressed, it goes to /account (not ?profile=me)", went)
      await p.screenshot({ path: join(shots, `${LABEL}-tab-${name}.png`) })
      await p.close()
    }
  }
} finally {
  await browser.close()
  server.close()
  rmSync(stubs, { recursive: true, force: true })
}
writeFileSync(join(shots, `${LABEL}-results.json`), JSON.stringify(results, null, 2))
console.log(`\n${broken ? `${broken} failed` : "all passed"}; screenshots in ${shots}`)
if (broken) process.exit(1)
