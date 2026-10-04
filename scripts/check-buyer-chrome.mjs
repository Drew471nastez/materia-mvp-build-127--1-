/**
 * ===========================================================================
 *  THE HEADER, THE FOOTER, THE TAB BAR AND SEARCH, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real ConditionalHeader, ConditionalFooter and phone tab bar (with the
 * search screen it opens), rendered by scripts/render-buyer-chrome.tsx at
 * storelib.com addresses, signed in and signed out, at 360, 390, 430 and
 * 1280. The owner's second round, as numbers:
 *
 *   HEADER    where the tab bar is, a signed in phone header has no Library
 *             icon; the heart and the photo stay. Where it is not (a legal
 *             page), the Library icon is still there. /account has the
 *             header, like the library.
 *   STRIP     the search bar that followed the page down under the header
 *             is gone where the tab bar is, and from the library and the
 *             account at the top of the page (image 25).
 *   FOOTER    the black footer: on the homepage always, on Explore only for
 *             somebody signed out, never on the library or the account,
 *             at a phone's width and a computer's.
 *   ICONS     the tab bar at 1x, 2x and 3x with each tab on: Search keeps its
 *             glass, Profile is a person.
 *   ACCOUNT   on a phone /account and /account/* have no black header
 *             (the profile draws its own light bar), from the first frame;
 *             the tab bar stays; on a computer the header is there.
 *   BADGE     the wishlist count's white figures, found pixel by pixel in
 *             screenshots, centred on the red disc within 0.5px, for 1, 5,
 *             9, 12 and 99+, at 1x, 2x and 3x, on a phone and a computer.
 *   MENU      the header's menu sheet at 360, 390 and 430: frame by frame at
 *             4x CPU throttle, it starts moving within three frames of the
 *             tap, only rises (no jump back, no step over a fifth of its
 *             height), the backdrop only darkens, and it closes the same way.
 *   SEARCH    the tab bar's Search opens a full screen search over the page:
 *             the field has the focus from the press, the header is covered,
 *             the page holds still; it arrives and leaves on opacity and
 *             translate only, frame by frame at 4x CPU throttle; typing shows
 *             products, creators and categories; arrows and Enter open one;
 *             the screen stays until that page is up; Enter searches Explore;
 *             recent searches come back; nothing found says so; Escape and
 *             Back close it.
 *
 * Pictures go to SHOTS_DIR (or a temp folder), and are meant to be looked at.
 *
 *   PROBE_CSS=source node scripts/check-buyer-chrome.mjs
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
/*
  Inter, served from the storelib.com origin the page is on: a page at an
  https address may not load a file:// font, so without this every picture
  and every measurement here was in the fallback face.
*/
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".buyer-chrome-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-buyer-chrome-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* PROBE_ONLY=badge,menu runs only those parts: header, desktop, icons, badge, menu, search, page. */
const only = (part) => !process.env.PROBE_ONLY || process.env.PROBE_ONLY.split(",").includes(part)
const ORIGIN = "https://storelib.com"

const thumb = (hue) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="hsl(${hue},70%,78%)"/><circle cx="48" cy="44" r="20" fill="hsl(${hue},55%,45%)"/></svg>`)

const STUBS = {
  /* The router: the address changes a moment after a push, with the URL, as Next commits it. */
  "next-navigation.js": `import { useSyncExternalStore } from "react"
const nav = window.__nav
const subs = new Set()
const notify = () => subs.forEach((f) => f())
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const log = (k, a) => (window.__router ||= []).push([k, a])
const commit = (h, how) => setTimeout(() => {
  const [p, q] = h.split("?")
  nav.path = p; nav.search = q ? "?" + q : ""
  if (how === "push") history.pushState({ __NA: true }, "", h)
  else history.replaceState({ __NA: true }, "", h)
  notify()
}, window.__navMs ?? 150)
window.addEventListener("popstate", () => { nav.path = location.pathname; nav.search = location.search; notify() })
const router = {
  push: (h) => { log("push", h); commit(h, "push") },
  replace: (h) => { log("replace", h); commit(h, "replace") },
  prefetch: (h) => log("prefetch", h),
  back: () => { log("back"); history.back() },
  refresh: () => {},
}
export const usePathname = () => useSyncExternalStore(subscribe, () => nav.path, () => nav.path)
export const useRouter = () => router
export const useSearchParams = () => { const s = useSyncExternalStore(subscribe, () => nav.search, () => nav.search); return new URLSearchParams(s) }
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
  "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
  "next-image.jsx": `import React from "react"
const PUBLIC = ""
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, quality, className, style, ...rest }) {
  const url = typeof src === "string" ? (src.startsWith("/") ? PUBLIC + src : src) : ""
  return React.createElement("img", { src: url, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`,
  /*
    WHO IS LOOKING, and WHAT A SEARCH FINDS. The header asks for the user,
    the profile and the creator row; the search screen asks products by
    text and by creator, and profiles for the creators' photos. Answers
    come back after 220ms, a real round trip, so the loading state is seen.
  */
  "supabase-client.jsx": `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const T = ${JSON.stringify({ a: thumb(12), b: thumb(200), c: thumb(140), d: thumb(280), e: thumb(40) })}
const C = {
  maria: { id: "c1", user_id: "u10", display_name: "Maria Keys", slug: "mariakeys", username: null, avatar_url: null },
  theo: { id: "c2", user_id: "u11", display_name: "Theo Grant", slug: "theo", username: null, avatar_url: null },
  marc: { id: "c3", user_id: "u12", display_name: "Marco Lune", slug: "marcolune", username: null, avatar_url: null },
}
const P = [
  { id: "p1", title: "Lo-fi drum kit", slug: "lofi-drums", thumbnail_url: T.a, price_cents: 1900, creators: C.maria, d: "drums for beats" },
  { id: "p2", title: "Marble texture pack", slug: "marble", thumbnail_url: T.b, price_cents: 0, creators: C.theo, d: "textures" },
  { id: "p3", title: "Market research template", slug: "market-research", thumbnail_url: T.c, price_cents: 2900, compare_at_cents: 3900, creators: C.theo, d: "notion" },
  { id: "p4", title: "Piano one shots", slug: "piano", thumbnail_url: T.d, price_cents: 1200, creators: C.maria, d: "keys" },
  { id: "p5", title: "Night city LUTs", slug: "luts", thumbnail_url: T.e, price_cents: 900, pay_what_you_want: true, pwyw_min_price_cents: 500, creators: C.marc, d: "video grading" },
]
const termOf = (f) => ((/%([^%]*)%/.exec(f || "") || [])[1] || "").toLowerCase()
function answer(q) {
  if (q.table === "profiles") {
    if (q.in) return [{ id: "u10", avatar_url: T.a, display_name: "Maria Keys" }]
    return who() === "guest" ? null : { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: false }
  }
  if (q.table === "creators") return null
  if (q.table === "products") {
    const t = termOf(q.or)
    ;(window.__searches ||= []).push(t)
    if (q.opts && q.opts.referencedTable) return P.filter((p) => (p.creators.display_name + " " + p.creators.slug).toLowerCase().includes(t))
    return P.filter((p) => (p.title + " " + p.d).toLowerCase().includes(t))
  }
  return null
}
function chain(table) {
  const q = { table }
  const b = {
    select() { return b }, eq() { return b }, limit() { return b }, order() { return b }, single() { return b }, maybeSingle() { return b },
    or(f, opts) { q.or = f; q.opts = opts; return b },
    in(k, v) { q.in = v; return b },
    then(res) { setTimeout(() => res({ data: answer(q), error: null }), table === "products" ? 220 : 10) },
  }
  return b
}
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: who() === "guest" ? null : USER }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
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
    entryPoints: [join(root, "scripts/render-buyer-chrome.tsx")],
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

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files"] })
const PHONE = (width, dpr = 2) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: dpr })
const DESK = { width: 1280, height: 860, deviceScaleFactor: 1 }

async function open(vp, address, who, { consent = false } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    /* The logo and anything else under public/, from this checkout. */
    if (u.startsWith(ORIGIN + "/")) {
      const file = join(root, "public", decodeURIComponent(new URL(u).pathname))
      if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "application/octet-stream", body: readFileSync(file) })
    }
    if (u.startsWith("data:") || u.startsWith("file:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  if (consent) await p.setCookie({ name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: ORIGIN })
  const [path, search] = address.split("?")
  await p.evaluateOnNewDocument((path, search, who) => {
    /* The tallest the header has ever been drawn on this page, every frame from the first. */
    window.__headerEver = 0
    const watch = () => {
      const h = document.getElementById("platform-header-root")?.getBoundingClientRect().height || 0
      if (h > window.__headerEver) window.__headerEver = h
      if (performance.now() < 4000) requestAnimationFrame(watch)
    }
    requestAnimationFrame(watch)
    window.__nav = { path, search: search ? "?" + search : "" }
    window.__who = who
    try {
      localStorage.clear()
      if (who !== "guest") localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false }))
    } catch {}
  }, path, search || "", who)
  await p.goto(ORIGIN + address, { waitUntil: "load" })
  await p.evaluate(() => Promise.all([document.fonts.load("400 16px Inter"), document.fonts.load("600 16px Inter")]).catch(() => {}).then(() => document.fonts.ready))
  await sleep(600)
  return { p, errors }
}

/* What the chrome is doing right now. */
const READ = () => {
  const root = document.getElementById("platform-header-root")
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert]") }
  const controls = root ? [...root.querySelectorAll("a, button")].filter(shown).map((e) => (e.getAttribute("aria-label") || e.textContent).trim()).filter(Boolean) : []
  const strip = document.querySelector("[data-header-search-strip]")
  const bar = document.querySelector("[data-buyer-tab-bar]")
  const footer = document.querySelector("footer")
  return {
    header: !!root && root.getBoundingClientRect().height > 40,
    headerH: root ? Math.round(root.getBoundingClientRect().height) : 0,
    controls,
    library: controls.some((c) => /library/i.test(c)),
    strip: !!strip && shown(strip),
    bar: !!bar && getComputedStyle(bar).display !== "none",
    footer: !!footer && footer.getBoundingClientRect().height > 0,
    sideways: document.documentElement.scrollWidth - innerWidth,
  }
}

try {
  /* ── HEADER, STRIP AND FOOTER ON A PHONE ───────────────────────────────── */
  if (only("header")) for (const width of [360, 390, 430]) {
    console.log(`\nphone ${width}`)
    for (const who of ["buyer", "guest"]) {
      const { p, errors } = await open(PHONE(width), "/explore", who)
      const top = await p.evaluate(READ)
      await p.screenshot({ path: join(shots, `explore-${who}-${width}-top.png`), clip: { x: 0, y: 0, width, height: 190 } })
      await p.evaluate(() => window.scrollTo(0, 1600))
      await sleep(500)
      const down = await p.evaluate(READ)
      await p.screenshot({ path: join(shots, `explore-${who}-${width}-scrolled.png`), clip: { x: 0, y: await p.evaluate(() => scrollY), width, height: 190 }, captureBeyondViewport: false })
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await sleep(300)
      await p.screenshot({ path: join(shots, `explore-${who}-${width}-end.png`) })
      const tag = `/explore ${who}:`
      expect(top.header && top.bar, `${tag} the header and the tab bar`, { header: top.header, bar: top.bar })
      if (who === "buyer") {
        expect(!top.library && top.controls.includes("Wishlist") && top.controls.includes("Open profile menu"), `${tag} no Library icon in the header; the heart and the photo stay`, top.controls)
        expect(!top.footer, `${tag} no black footer`, top.footer)
      } else {
        expect(top.controls.includes("Wishlist") && top.controls.some((c) => /sign in/i.test(c)), `${tag} the heart and Sign in`, top.controls)
        expect(top.footer, `${tag} the black footer, for somebody signed out`, top.footer)
      }
      expect(!down.strip, `${tag} scrolled past the page's field, no search strip under the header`, down.strip)
      expect(top.sideways <= 0 && down.sideways <= 0, `${tag} nothing sideways`, [top.sideways, down.sideways])
      expect(errors.length === 0, `${tag} no errors`, errors)
      await p.close()
    }
    for (const path of ["/account/library", "/account", "/account/settings"]) {
      const { p, errors } = await open(PHONE(width), path, "buyer")
      const own = path.startsWith("/account")
      const s = await p.evaluate(READ)
      await p.screenshot({ path: join(shots, `${path.slice(1).replace(/\//g, "-")}-buyer-${width}-top.png`), clip: { x: 0, y: 0, width, height: 190 } })
      await p.evaluate(() => window.scrollTo(0, 900))
      await sleep(400)
      const d = await p.evaluate(READ)
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await sleep(300)
      const end = await p.evaluate(READ)
      await p.screenshot({ path: join(shots, `${path.slice(1).replace(/\//g, "-")}-buyer-${width}-end.png`) })
      /* The profile has the site header, as the library does: one bar, never
         its own second one under it ("the profile page needs to have the
         header on it"). */
      expect(s.header && s.bar, `${path}: the header and the tab bar`, { header: s.header, bar: s.bar })
      if (own) {
        const bars = await p.evaluate(() => document.querySelectorAll("[data-account-phone-bar]").length)
        expect(bars === 0, `${path}: and no second bar of its own under it`, bars)
      } else {
        expect(!s.library && s.controls.includes("Wishlist") && s.controls.includes("Open profile menu"), `${path}: no Library icon; the heart and the photo`, s.controls)
      }
      expect(!s.strip && !d.strip, `${path}: no "Search for anything" bar, at the top or scrolled`, [s.strip, d.strip])
      expect(!end.footer, `${path}: no black footer`, end.footer)
      expect(errors.length === 0, `${path}: no errors`, errors)
      await p.close()
    }
    for (const [path, who] of [["/", "guest"], ["/", "buyer"], ["/privacy", "buyer"]]) {
      const { p, errors } = await open(PHONE(width), path, who)
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await sleep(300)
      const s = await p.evaluate(READ)
      const tag = `${path} ${who}:`
      expect(!s.bar && s.footer, `${tag} no tab bar, the black footer`, { bar: s.bar, footer: s.footer })
      if (path === "/privacy") expect(s.library, `${tag} no tab bar here, so the Library icon stays in the header`, s.controls)
      expect(errors.length === 0, `${tag} no errors`, errors)
      await p.close()
    }
  }

  /* ── A COMPUTER ────────────────────────────────────────────────────────── */
  if (only("desktop")) console.log("\ndesktop 1280")
  if (only("desktop")) for (const [path, who, footer] of [["/explore", "buyer", false], ["/explore", "guest", true], ["/account/library", "buyer", false], ["/account", "buyer", false], ["/account/settings", "buyer", false], ["/", "buyer", true], ["/", "guest", true]]) {
    const { p, errors } = await open(DESK, path, who)
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(300)
    const s = await p.evaluate(READ)
    const tag = `${path} ${who}:`
    expect(s.header && !s.bar, `${tag} the header, no tab bar`, { header: s.header, bar: s.bar })
    expect(s.footer === footer, `${tag} ${footer ? "the black footer" : "no black footer"}`, s.footer)
    if (who === "buyer" && path !== "/") expect(s.library, `${tag} the computer's header keeps its Library icon`, s.controls)
    /* Scrolled to the end, the header is still stuck to the top: on /account it is inside a box that is not a box (display: contents), which must not stop it sticking. */
    if (path !== "/") {
      const stuck = await p.evaluate(async () => {
        /* Room to scroll, on a page too short for it. */
        const room = document.createElement("div")
        room.style.height = "2000px"
        document.querySelector("main").append(room)
        window.scrollTo(0, 1200)
        await new Promise((r) => setTimeout(r, 200))
        return { top: document.getElementById("platform-header-root")?.getBoundingClientRect().top, y: scrollY }
      })
      expect(stuck.y >= 1000 && stuck.top === 0, `${tag} scrolled down, the header is still stuck to the top`, stuck)
    }
    if (path !== "/" ) await p.screenshot({ path: join(shots, `desk-${path.slice(1).replace(/\//g, "-")}-${who}.png`) })
    expect(errors.length === 0, `${tag} no errors`, errors)
    await p.close()
  }

  /* ── ICONS AT 1x, 2x, 3x ───────────────────────────────────────────────── */
  if (only("icons")) console.log("\nthe tab bar's icons")
  if (only("icons")) for (const dpr of [1, 2, 3]) {
    for (const [address, tab] of [["/explore", 0], ["/explore?q=drum", 1], ["/account/library", 2], ["/account", 3]]) {
      const { p } = await open(PHONE(390, dpr), address, "buyer")
      const s = await p.evaluate(() => {
        const tabs = [...document.querySelectorAll("[data-buyer-tab]")]
        return {
          current: tabs.findIndex((t) => t.getAttribute("aria-current") === "page"),
          inks: tabs.map((t) => +getComputedStyle(t.querySelector('[data-part="ink"]')).opacity),
          img: tabs.some((t) => t.querySelector("img")),
          tint: tabs[1].querySelector('[data-part="ink"] circle')?.getAttribute("fill-opacity"),
        }
      })
      expect(s.current === tab && s.inks[tab] === 1 && s.inks.filter((o) => o === 1).length === 1 && !s.img, `@${dpr}x ${address}: tab ${tab} on, the only one filled, no photo`, s)
      if (tab === 1) expect(s.tint === "0.12", `@${dpr}x the active Search is glass with a faint tint`, s.tint)
      await p.screenshot({ path: join(shots, `icons-${dpr}x-tab${tab}.png`), clip: { x: 0, y: 844 - 64, width: 390, height: 64 } })
      await p.close()
    }
  }

  /* ── BADGE: the count centred on its disc, measured in pixels ─────────── */
  if (only("badge")) console.log("\nthe wishlist badge")
  if (only("badge")) {
    /*
      The disc is the badge's own box. The figures are found in the pixels:
      inside the disc (2px in from its edge, clear of the ring and anything
      behind it), whatever is lighter than the red by more than half the way
      to white. Their box's centre against the disc's, in CSS pixels.
    */
    const inkOf = async (p, dpr) => {
      const r = await p.evaluate(() => {
        const b = [...document.querySelectorAll("[data-count-badge]")].find((e) => e.getBoundingClientRect().width > 0)
        if (!b) return null
        const x = b.getBoundingClientRect()
        const t = b.firstElementChild.getBoundingClientRect()
        return { x: x.left, y: x.top, w: x.width, h: x.height, text: b.textContent, font: getComputedStyle(b.firstElementChild).fontFamily.split(",")[0], tb: [t.top - x.top, t.height], nudge: b.style.marginTop }
      })
      if (process.env.PROBE_VERBOSE) console.log(JSON.stringify(r))
      if (!r) return null
      const pad = 3
      const clip = { x: Math.floor(r.x) - pad, y: Math.floor(r.y) - pad, width: Math.ceil(r.w) + pad * 2 + 1, height: Math.ceil(r.h) + pad * 2 + 1 }
      const buf = await p.screenshot({ clip, captureBeyondViewport: false })
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
      /* The disc in image pixels, and a test for "inside it, 2px in". */
      const dx0 = (r.x - clip.x) * dpr, dy0 = (r.y - clip.y) * dpr, dw = r.w * dpr, dh = r.h * dpr
      const rad = dh / 2, inset = 2 * dpr
      const inside = (px, py) => {
        const cx = Math.min(Math.max(px, dx0 + rad), dx0 + dw - rad)
        const cy = dy0 + rad
        return Math.hypot(px - cx, py - cy) <= rad - inset
      }
      /*
        Each pixel's share of white: 0 on the red (its green channel), 1 on
        white. An edge is placed inside its pixel by how much of that pixel
        the ink covers, so a 1x image is read to a fraction of a pixel rather
        than rounded to a whole one.
      */
      /* The red itself: the least green pixel inside the disc. */
      let red = 255
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (inside(x + 0.5, y + 0.5)) red = Math.min(red, data[(y * info.width + x) * info.channels + 1])
      }
      const cols = new Float64Array(info.width), rows = new Float64Array(info.height)
      let n = 0
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (!inside(x + 0.5, y + 0.5)) continue
        const i = (y * info.width + x) * info.channels
        const w = Math.max(0, Math.min(1, (data[i + 1] - red) / (255 - red)))
        if (w < 0.1) continue
        n++
        cols[x] = Math.max(cols[x], w)
        rows[y] = Math.max(rows[y], w)
      }
      if (!n) return { text: r.text, n }
      const span = (a) => {
        let lo = a.findIndex((v) => v > 0), hi = a.length - 1
        while (hi > 0 && !(a[hi] > 0)) hi--
        return [lo + (1 - a[lo]), hi + a[hi]]
      }
      const [x0, x1] = span(Array.from(cols)), [y0, y1] = span(Array.from(rows))
      const ink = { cx: (x0 + x1) / 2 / dpr + clip.x, cy: (y0 + y1) / 2 / dpr + clip.y }
      /* The disc is the badge's own box, where it was laid out (and drawn: it is not a layer of its own). */
      const disc = { cx: r.x + r.w / 2, cy: r.y + r.h / 2 }
      return { text: r.text, w: r.w, h: r.h, dx: Math.round((ink.cx - disc.cx) * 100) / 100, dy: Math.round((ink.cy - disc.cy) * 100) / 100, n, clip }
    }
    for (const [vp, where] of [[(dpr) => PHONE(390, dpr), "phone"], [(dpr) => ({ ...DESK, deviceScaleFactor: dpr }), "computer"]]) {
      for (const dpr of [1, 2, 3]) {
        const { p, errors } = await open(vp(dpr), "/explore", "buyer")
        const worst = { dx: 0, dy: 0 }
        const all = []
        for (const count of [1, 5, 9, 12, 100]) {
          await p.evaluate((count) => window.dispatchEvent(new CustomEvent("wishlist-updated", { detail: { count } })), count)
          await sleep(120)
          const m = await inkOf(p, dpr)
          all.push(m)
          if (m && m.n) {
            worst.dx = Math.max(worst.dx, Math.abs(m.dx))
            worst.dy = Math.max(worst.dy, Math.abs(m.dy))
          }
          if (m?.clip) await p.screenshot({ path: join(shots, `badge-${where}-${dpr}x-${m.text.replace("+", "plus")}.png`), clip: { ...m.clip, x: m.clip.x - 14, width: m.clip.width + 18, y: m.clip.y, height: m.clip.height + 10 }, captureBeyondViewport: false })
        }
        const texts = all.map((m) => m?.text).join()
        expect(texts === "1,5,9,12,99+" && all.every((m) => m && m.n > 0 && m.h === 18), `BADGE ${where} @${dpr}x: 1, 5, 9, 12 and 99+ on an 18px disc`, all.map((m) => m && { t: m.text, w: m.w, h: m.h }))
        /* The old badge, measured the same way: 0.54px low at 3x and 0.7px at 2x on a phone in Inter, and 0.8 to 1.9px high in a fallback face. */
        expect(worst.dx <= 0.5 && worst.dy <= 0.5, `BADGE ${where} @${dpr}x: the figures are centred on the disc within 0.5px`, all.map((m) => m && `${m.text}: ${m.dx}, ${m.dy}`))
        /*
          AND IN ANOTHER FONT. Centring the figures rather than the line is
          what makes this hold before Inter has loaded, or on a system face:
          the same counts drawn in the system serif, whose line box puts the
          figures somewhere else entirely.
        */
        await p.addStyleTag({ content: '[data-count-badge] *{font-family:serif !important}' })
        const other = []
        for (const count of [5, 12, 100]) {
          await p.evaluate((count) => window.dispatchEvent(new CustomEvent("wishlist-updated", { detail: { count } })), count)
          await sleep(120)
          other.push(await inkOf(p, dpr))
        }
        const off = Math.max(...other.map((m) => (m && m.n ? Math.max(Math.abs(m.dx), Math.abs(m.dy)) : 99)))
        /* A serif's figures are not quite its cap height, so this one is allowed a little more. */
        expect(off <= 0.75, `BADGE ${where} @${dpr}x: and in a serif fallback, still within 0.75px`, other.map((m) => m && `${m.text}: ${m.dx}, ${m.dy}`))
        expect(errors.length === 0, `BADGE ${where} @${dpr}x: no errors`, errors)
        await p.close()
      }
    }
  }

  /* ── MENU: the header's menu sheet, frame by frame ───────────────────── */
  if (only("menu")) console.log("\nthe header's menu sheet")
  if (only("menu")) for (const width of [360, 390, 430]) {
    const { p, errors } = await open(PHONE(width), "/explore", "buyer")
    await sleep(1200)
    const cdp = await p.createCDPSession()
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1 }] })
    const btn = await p.evaluate(() => { const b = document.querySelector('[aria-label="Open categories"]'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    const kept = await p.evaluate(() => [...document.querySelectorAll("[data-sheet-root]")].some((r) => r.querySelector("[data-category-browser]")))
    if (!process.env.PROBE_UNKEPT) expect(kept, `MENU ${width}: the menu sheet is already in the page before the tap (built ahead, kept)`, kept)
    /* Every frame: where the menu's panel is, how dark the backdrop is, and anything that held the main thread. */
    const film = (ms) => p.evaluate((ms) => {
      window.__film = []
      window.__long = []
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: "longtask" }) } catch {}
      const t0 = performance.now()
      const tick = () => {
        const root = [...document.querySelectorAll("[data-sheet-root]")].find((r) => r.querySelector("[data-category-browser]"))
        const panel = root?.querySelector("[data-sheet-panel]")
        const scrim = root?.firstElementChild
        const r = panel?.getBoundingClientRect()
        window.__film.push({ t: Math.round(performance.now() - t0), top: r ? Math.round(r.top * 10) / 10 : null, h: r ? Math.round(r.height) : null, dim: scrim ? +(+getComputedStyle(scrim).opacity).toFixed(3) : null, state: root?.getAttribute("data-app-sheet") ?? null, vis: root ? getComputedStyle(root).visibility : null })
        if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, ms)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await film(1400)
    await sleep(60)
    const tapAt = await p.evaluate(() => performance.now())
    await touch("touchStart", btn.x, btn.y)
    await sleep(30)
    await touch("touchEnd")
    await sleep(110)
    await p.screenshot({ path: join(shots, `menu-${width}-opening.png`), captureBeyondViewport: false })
    await sleep(1500)
    const opening = await p.evaluate(() => ({ film: window.__film, long: window.__long, t0: performance.timeOrigin }))
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await p.screenshot({ path: join(shots, `menu-${width}-open.png`) })
    const f = opening.film
    const rest = f[f.length - 1]
    const startIdx = f.findIndex((x) => x.state === "open")
    const moving = f.slice(startIdx).filter((x) => x.top != null && x.top > rest.top + 0.5 && x.top < 844)
    const firstMove = f.slice(startIdx).find((x) => x.top != null && x.top < 844 - 0.5)
    const firstShown = startIdx >= 0 ? f[startIdx] : null
    const rises = f.slice(startIdx).every((x, i, a) => i === 0 || x.top == null || a[i - 1].top == null || x.top <= a[i - 1].top + 0.5)
    const darkens = f.slice(startIdx).every((x, i, a) => i === 0 || x.dim == null || a[i - 1].dim == null || x.dim >= a[i - 1].dim - 0.002)
    const steps = f.slice(startIdx).map((x, i, a) => (i === 0 || x.top == null || a[i - 1].top == null ? 0 : a[i - 1].top - x.top))
    const bigStep = Math.max(...steps) / (rest.h || 1)
    if (process.env.PROBE_VERBOSE) console.log(JSON.stringify({ f, long: opening.long }))
    expect(rest.state === "open" && rest.top < 844 - 200 && rest.dim > 0.9, `MENU ${width}: open, resting, the backdrop dimmed`, rest)
    expect(moving.length >= 5 && rises && darkens, `MENU ${width}: it rises over several frames, only ever up, while the backdrop only darkens`, { moving: moving.length, rises, darkens })
    expect(bigStep < 0.2, `MENU ${width}: no frame jumps more than a fifth of its height (at 4x CPU throttle)`, { biggest: Math.round(bigStep * 100) / 100 })
    const gap = firstMove ? f.indexOf(firstMove) - startIdx : null
    expect(firstShown && firstMove && gap <= 3, `MENU ${width}: it is moving within three frames of being shown (at 4x CPU throttle)`, { shown: firstShown?.t, moving: firstMove?.t, frames: gap })
    /* Built on the tap, before it was kept, this was 130 to 230ms of long tasks at 4x; kept, 60 to 150ms, the header's own render. */
    expect(Math.max(0, ...opening.long) < 200 && opening.long.length <= 2, `MENU ${width}: the tap holds the main thread under 200ms at 4x CPU throttle`, opening.long)

    /* Weights in the menu's category list: categories 600, then a category's subcategories 500. */
    const weights = await p.evaluate(async () => {
      const root = [...document.querySelectorAll("[data-sheet-root]")].find((r) => r.querySelector("[data-category-browser]"))
      const groups = [...root.querySelectorAll("[data-browse-level=root] [data-browse-group]")].map((b) => getComputedStyle(b).fontWeight)
      const opener = root.querySelector("[data-browse-level=root] [data-browse-group][aria-haspopup]")
      opener.click()
      await new Promise((r) => setTimeout(r, 500))
      const items = [...root.querySelectorAll("[data-browse-level=sub] [data-browse-option]")].map((b) => getComputedStyle(b).fontWeight)
      return { groups: [...new Set(groups)], items: [...new Set(items)] }
    })
    await p.screenshot({ path: join(shots, `menu-${width}-sub.png`) })
    expect(weights.groups.join() === "600" && weights.items.join() === "500", `MENU ${width}: categories 600, subcategories 500`, weights)

    /* Closing: a tap on the backdrop. */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await film(1200)
    await sleep(40)
    await touch("touchStart", width / 2, 60)
    await touch("touchEnd")
    await sleep(1300)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const closing = await p.evaluate(() => window.__film)
    const c0 = closing.findIndex((x) => x.state === "closing")
    const out = closing.slice(Math.max(0, c0))
    const falls = out.every((x, i, a) => i === 0 || x.top == null || a[i - 1].top == null || x.top >= a[i - 1].top - 0.5)
    const lightens = out.every((x, i, a) => i === 0 || x.dim == null || a[i - 1].dim == null || x.dim <= a[i - 1].dim + 0.002)
    const outMoving = out.filter((x) => x.dim != null && x.dim > 0.02 && x.dim < 0.98)
    const last = closing[closing.length - 1]
    expect(c0 >= 0 && falls && lightens && outMoving.length >= 3 && last.dim === 0, `MENU ${width}: a tap outside closes it over several frames, only falling, the backdrop only lightening`, { frames: outMoving.length, falls, lightens, last })
    /* Opened again, it starts from the first level. */
    await touch("touchStart", btn.x, btn.y)
    await touch("touchEnd")
    await sleep(700)
    const again = await p.evaluate(() => { const root = [...document.querySelectorAll("[data-sheet-root]")].find((r) => r.querySelector("[data-category-browser]")); return { sub: root.querySelector("[data-browse-level=sub]")?.getAttribute("aria-hidden") } })
    expect(again.sub === "true", `MENU ${width}: opened again, it is back on the first level`, again)
    expect(errors.length === 0, `MENU ${width}: no errors`, errors)
    await p.close()
  }

  /* ── SEARCH, FULL SCREEN ───────────────────────────────────────────────── */
  if (only("search")) console.log("\nsearch, full screen (390, signed in)")
  if (only("search")) {
    const { p, errors } = await open(PHONE(390), "/explore", "buyer", { consent: true })
    const cdp = await p.createCDPSession()
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 10, radiusY: 10, force: 1 }] })
    const slot = await p.evaluate(() => { const r = document.querySelector('[data-buyer-tab="search"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    const closedBefore = await p.evaluate(() => { const o = document.querySelector("[data-search-overlay]"); const cs = getComputedStyle(o); return { state: o.dataset.searchOverlay, visibility: cs.visibility, opacity: cs.opacity, pe: cs.pointerEvents } })
    expect(closedBefore.state === "closed" && closedBefore.visibility === "hidden" && closedBefore.pe === "none", "closed, the screen is in the page, hidden and out of the hit test", closedBefore)

    /* Frames of the way in, at 4x CPU throttle, sampled from the touch on and not disturbed by screenshots. */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await p.evaluate(() => {
      window.__frames = []
      const o = document.querySelector("[data-search-overlay]")
      const t0 = performance.now()
      const tick = () => {
        const cs = getComputedStyle(o)
        window.__frames.push({ t: Math.round(performance.now() - t0), opacity: +(+cs.opacity).toFixed(3), translate: cs.translate, visibility: cs.visibility })
        if (performance.now() - t0 < 1100) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await touch("touchStart", slot.x, slot.y)
    await sleep(40)
    await touch("touchEnd")
    const atRelease = await p.evaluate(() => ({ focused: document.activeElement?.hasAttribute("data-search-screen-field") ?? false, state: document.querySelector("[data-search-overlay]").dataset.searchOverlay }))
    await sleep(1300)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const frames = await p.evaluate(() => window.__frames)
    if (process.env.PROBE_VERBOSE) console.log(JSON.stringify(frames))
    const moving = frames.filter((f) => f.opacity > 0 && f.opacity < 1)
    const ys = frames.map((f) => parseFloat((f.translate.split(" ")[1] || "0")))
    const monotonic = frames.every((f, i) => i === 0 || f.opacity >= frames[i - 1].opacity - 0.001)
    expect(atRelease.focused && atRelease.state === "open", "the press opens it with the field already focused (the keyboard comes up with the tap)", atRelease)
    expect(moving.length >= 3 && monotonic && ys[ys.length - 1] === 0 && Math.max(...ys) <= 14, "it arrives over several frames: opacity only rising, rising 14px into place", { frames: frames.length, moving: moving.length, lastY: ys[ys.length - 1], maxY: Math.max(...ys) })
    expect(!frames.some((f) => f.visibility === "hidden" && f.opacity > 0), "never painted while hidden, never hidden while painted", frames.slice(0, 4))
    const open1 = await p.evaluate(() => ({
      covered: !!document.elementFromPoint(195, 20)?.closest("[data-search-overlay]"),
      barCovered: !!document.elementFromPoint(195, 820)?.closest("[data-search-overlay]"),
      overflow: getComputedStyle(document.documentElement).overflow,
      modal: document.querySelector("[data-search-overlay]").getAttribute("aria-modal"),
      title: document.querySelector("[data-search-screen] h1")?.textContent,
      placeholder: document.querySelector("[data-search-screen-field]").placeholder,
      field: (() => { const r = document.querySelector("[data-search-screen-field]").getBoundingClientRect(); const cs = getComputedStyle(document.querySelector("[data-search-screen-field]")); return { h: r.height, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, font: cs.fontSize } })(),
    }))
    expect(open1.covered && open1.barCovered, "no site header and no tab bar while it is open: the screen covers both", open1)
    expect(open1.overflow === "hidden" && open1.modal === "true", "the page under it holds still, and it is a declared modal", open1)
    expect(open1.title === "Search" && open1.field.font === "16px", "a big Search title and a 16px field (image 27)", open1)
    const fieldLook = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector("[data-search-screen-field]")); return { radius: cs.borderTopLeftRadius, shadow: cs.boxShadow } })
    expect(fieldLook.radius === "12px" && /inset/.test(fieldLook.shadow) && (fieldLook.shadow.match(/rgba/g) || []).length >= 3, "the field is a 12px rounded rectangle, not a pill, with a little depth (a shade inside, a shadow under)", fieldLook)
    await p.screenshot({ path: join(shots, "search-open.png") })

    /* ── A CATEGORY OPENS ITS SUBCATEGORIES, pushed in, frame by frame ── */
    const browse = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-search-level="root"] [data-search-section="browse"] [data-search-row="category"]')]
      const card = document.querySelector('[data-search-level="root"] [data-search-card]')
      return { weights: [...new Set(rows.map((r) => getComputedStyle(r.querySelector("span")).fontWeight))], opens: rows.filter((r) => r.dataset.searchOpens).length, n: rows.length, card: card ? getComputedStyle(card).boxShadow : null }
    })
    expect(browse.weights.join() === "600" && browse.opens >= 3 && /rgba/.test(browse.card || ""), "Browse categories: 600, on a card with a little depth, and the categories with subcategories open them", browse)
    const opener = await p.evaluate(() => { const a = document.querySelector('[data-search-level="root"] [data-search-row="category"][data-search-opens]'); a.scrollIntoView({ block: "center" }); const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: a.dataset.searchOpens, label: a.textContent.trim() } })
    await sleep(100)
    await p.evaluate(() => { window.__router = [] })
    const pushFilm = (ms) => p.evaluate((ms) => {
      window.__push = []
      const root = document.querySelector('[data-search-level="root"]'), sub = document.querySelector('[data-search-level="sub"]'), veil = document.querySelector("[data-search-veil]")
      const t0 = performance.now()
      const tick = () => {
        const r = root.getBoundingClientRect(), s = sub.getBoundingClientRect()
        window.__push.push({ t: Math.round(performance.now() - t0), root: Math.round(r.left * 10) / 10, sub: Math.round(s.left * 10) / 10, veil: +(+getComputedStyle(veil).opacity).toFixed(3), vis: getComputedStyle(sub).visibility })
        if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, ms)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await pushFilm(900)
    await sleep(40)
    await touch("touchStart", opener.x, opener.y)
    await sleep(30)
    await touch("touchEnd")
    await sleep(160)
    await p.screenshot({ path: join(shots, "search-push-mid.png"), captureBeyondViewport: false })
    await sleep(900)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const pushIn = await p.evaluate(() => window.__push)
    await p.screenshot({ path: join(shots, "search-sub.png") })
    const inMoving = pushIn.filter((f) => f.sub > 0.5 && f.sub < 389.5)
    const inMono = pushIn.every((f, i, a) => i === 0 || f.sub <= a[i - 1].sub + 0.5)
    const sub = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-search-level="sub"] [data-search-row="category"]')]
      return { back: document.querySelector("[data-search-back]")?.textContent.trim(), first: rows[0]?.textContent.trim(), n: rows.length, weights: [...new Set(rows.map((r) => getComputedStyle(r.querySelector("span")).fontWeight))], backWeight: getComputedStyle(document.querySelector("[data-search-back]")).fontWeight, rootInert: document.querySelector('[data-search-level="root"]').inert, overlay: document.querySelector("[data-search-overlay]").dataset.searchOverlay, router: window.__router }
    })
    if (process.env.PROBE_VERBOSE) console.log(JSON.stringify(pushIn))
    const endIn = pushIn[pushIn.length - 1]
    expect(inMoving.length >= 4 && inMono && endIn.sub === 0 && Math.abs(endIn.root - -97.5) < 1 && endIn.veil > 0.05, "SUBCATEGORIES: tapped, the level slides in from the right over several frames (only ever left), the list under it moves a quarter over and dims", { moving: inMoving.length, mono: inMono, end: endIn })
    expect(sub.back === opener.label && /^All /.test(sub.first || "") && sub.n >= 3 && sub.weights.join() === "500" && sub.backWeight === "600" && sub.rootInert, "a back row named for the category, All first, the subcategories at 500", sub)
    expect(sub.overlay === "open" && !(sub.router || []).some(([k]) => k === "push" || k === "replace"), "and nothing navigated: it is a level of the search screen", sub.router)
    /* Back: the same move reversed. */
    const backAt = await p.evaluate(() => { const r = document.querySelector("[data-search-back]").getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await pushFilm(900)
    await sleep(40)
    await touch("touchStart", backAt.x, backAt.y)
    await sleep(30)
    await touch("touchEnd")
    await sleep(1000)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const pushOut = await p.evaluate(() => window.__push)
    const outMovingP = pushOut.filter((f) => f.sub > 0.5 && f.sub < 389.5)
    const outMono = pushOut.every((f, i, a) => i === 0 || f.sub >= a[i - 1].sub - 0.5)
    const endOut = pushOut[pushOut.length - 1]
    expect(outMovingP.length >= 4 && outMono && endOut.root === 0 && endOut.veil === 0 && endOut.vis === "hidden", "back: the level slides out over several frames, the list comes back, and the level is no longer painted", { moving: outMovingP.length, mono: outMono, end: endOut })
    /* Escape in a level goes back, not out of search. */
    await p.evaluate((x) => document.querySelector(`[data-search-level="root"] [data-search-opens="${x}"]`).click(), opener.id)
    await sleep(500)
    await p.focus("[data-search-screen-field]")
    await p.keyboard.press("Escape")
    await sleep(500)
    const esc1 = await p.evaluate(() => ({ overlay: document.querySelector("[data-search-overlay]").dataset.searchOverlay, sub: document.querySelector('[data-search-level="sub"]').getAttribute("aria-hidden") }))
    expect(esc1.overlay === "open" && esc1.sub === "true", "Escape in a category goes back to the list, and search stays open", esc1)

    /* Typing: loading, then results. */
    await p.keyboard.type("mar", { delay: 40 })
    await sleep(120)
    const loading = await p.evaluate(() => ({
      state: document.querySelector("[data-search-state]")?.dataset.searchState,
      sections: [...document.querySelectorAll("[data-search-section]")].map((s) => s.dataset.searchSection),
      skeleton: [...document.querySelectorAll("[data-search-loading] > div:not(:first-child)")].map((r) => Math.round(r.getBoundingClientRect().height)),
      thumb: (() => { const t = document.querySelector("[data-search-loading] > div:not(:first-child) > div"); return t ? Math.round(t.getBoundingClientRect().width) : 0 })(),
    }))
    await p.screenshot({ path: join(shots, "search-typing.png") })
    await sleep(600)
    const res = await p.evaluate(() => ({
      state: document.querySelector("[data-search-state]")?.dataset.searchState,
      sections: [...document.querySelectorAll("[data-search-section]")].map((s) => s.dataset.searchSection),
      products: [...document.querySelectorAll('[data-search-row="product"]')].map((a) => ({ text: a.textContent, href: a.getAttribute("href"), img: !!a.querySelector("img") })),
      creators: [...document.querySelectorAll('[data-search-row="creator"]')].map((a) => a.getAttribute("href")),
      searches: window.__searches || [],
    }))
    await p.screenshot({ path: join(shots, "search-results.png") })
    expect(loading.state === "waiting" || loading.state === "results", "while the answer is out it shows it is looking, not an empty screen", loading)
    expect(res.state === "results" && res.sections.join() === "products,creators,categories", "results: products, then creators, then categories", res.sections)
    expect(res.products.length >= 2 && res.products.every((x) => x.img && /\?layout=discover$/.test(x.href)) && /Maria Keys/.test(res.products.find((x) => /drum/i.test(x.text))?.text || "") && /\$19\.00/.test(res.products.find((x) => /drum/i.test(x.text))?.text || ""), "each product: picture, title, creator, price, opening in discover mode", res.products)
    expect(res.creators.includes("/mariakeys?layout=discover"), "creators link to their page", res.creators)
    expect(res.searches.filter((t) => t === "m" || t === "ma").length === 0, "debounced: the word typed at speed was one question, not one per letter", res.searches)

    /* The product rows, bigger and cleaner, and the placeholder in their exact shape. */
    const rowsLook = await p.evaluate(() => {
      const a = document.querySelector('[data-search-row="product"]')
      const img = a.querySelector("span")
      const f = (sel) => { const cs = getComputedStyle(a.querySelector(sel)); return `${cs.fontSize}/${cs.fontWeight}` }
      return { h: Math.round(a.getBoundingClientRect().height), thumb: [Math.round(img.getBoundingClientRect().width), Math.round(img.getBoundingClientRect().height)], title: f("[data-search-title]"), creator: f("[data-search-creator]"), price: f("[data-search-price]"), order: [...a.querySelectorAll("[data-search-title],[data-search-creator],[data-search-price]")].map((e) => Math.round(e.getBoundingClientRect().top)) }
    })
    expect(rowsLook.thumb.join() === "60,60" && rowsLook.h >= 76 && rowsLook.title === "15px/500" && rowsLook.creator === "13px/400" && rowsLook.price === "14px/600" && rowsLook.order[0] < rowsLook.order[1] && rowsLook.order[1] < rowsLook.order[2], "PRODUCTS: a 60px picture, then the title, the creator and the price, each on its own line", rowsLook)
    expect(loading.skeleton.length === 3 && loading.skeleton.every((h) => h === rowsLook.h) && loading.thumb === 60, "the wait is three placeholder rows of exactly a result's height and picture", { skeleton: loading.skeleton, row: rowsLook.h, thumb: loading.thumb })
    await p.screenshot({ path: join(shots, "search-results-rows.png"), clip: { x: 0, y: 150, width: 390, height: 420 }, captureBeyondViewport: false })

    /* NO FLICKER: another letter, every frame until its answer is in: the last products stay, at full strength. */
    await p.evaluate(() => {
      window.__flick = []
      const t0 = performance.now()
      const tick = () => {
        const sec = document.querySelector('[data-search-section="products"]')
        window.__flick.push({ t: Math.round(performance.now() - t0), products: sec ? sec.querySelectorAll('[data-search-row="product"]').length : 0, opacity: sec ? +getComputedStyle(sec).opacity : null, skeleton: !!document.querySelector("[data-search-loading]") })
        if (performance.now() - t0 < 900) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await p.keyboard.type("i")
    await sleep(1000)
    const flick = await p.evaluate(() => window.__flick)
    expect(flick.length > 20 && flick.every((f) => f.products > 0 && f.opacity === 1 && !f.skeleton), "NO FLICKER: typing on, the last products stay on screen at full strength until the next answer replaces them", { frames: flick.length, gaps: flick.filter((f) => !f.products || f.opacity !== 1 || f.skeleton).slice(0, 3) })
    await p.keyboard.press("Backspace")
    await sleep(700)

    /* Keyboard: down to the first product and Enter. */
    await p.evaluate(() => { window.__router = [] })
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("ArrowDown")
    const lit = await p.evaluate(() => { const f = document.querySelector("[data-search-screen-field]"); const id = f.getAttribute("aria-activedescendant"); return { id, kind: id ? document.getElementById(id)?.dataset.searchRow : null, selected: id ? document.getElementById(id)?.getAttribute("aria-selected") : null } })
    expect(lit.kind === "product" && lit.selected === "true", "arrows walk the rows from the field (aria-activedescendant)", lit)
    await p.evaluate(() => {
      window.__leave = []
      const o = document.querySelector("[data-search-overlay]")
      const t0 = performance.now()
      const tick = () => { window.__leave.push({ t: Math.round(performance.now() - t0), opacity: +(+getComputedStyle(o).opacity).toFixed(3), path: location.pathname }); if (performance.now() - t0 < 700) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await p.keyboard.press("Enter")
    await sleep(60)
    const during = await p.evaluate(() => ({ state: document.querySelector("[data-search-overlay]").dataset.searchOverlay, path: location.pathname }))
    await sleep(800)
    const after = await p.evaluate(() => ({ state: document.querySelector("[data-search-overlay]").dataset.searchOverlay, path: location.pathname, search: location.search, entry: !!(history.state && history.state.storelibSearch), overflow: document.documentElement.style.overflow, router: window.__router, leave: window.__leave }))
    const firstGone = after.leave.findIndex((f) => f.opacity < 1)
    const litHref = res.products[0].href
    const litPath = litHref.split("?")[0]
    expect(after.router.some(([k, h]) => k === "replace" && h === litHref), "Enter opens the lit product, replacing the screen's own history entry", { lit: litHref, router: after.router })
    expect(during.state === "open" && during.path === "/explore", "the screen stays while that page loads", during)
    expect(after.state === "closed" && after.path === litPath && !after.entry && after.overflow === "", "and goes once it is up, letting the page scroll again", { state: after.state, path: after.path, entry: after.entry })
    const fade = after.leave.filter((f) => f.opacity > 0 && f.opacity < 1)
    expect(firstGone >= 0 && after.leave[firstGone].path === litPath && fade.length >= 1, "it fades only after the new page is in place (no flash of the old one), over frames", { around: after.leave.slice(Math.max(0, firstGone - 1), firstGone + 3), fading: fade.length })
    await p.screenshot({ path: join(shots, "search-after-result.png") })

    /*
      The product a result opened is the creator's shop: no tab bar on it
      (lib/nav/buyer-tabs.ts), and its own buy bar is the thing at its foot.
      So the rest of the search checks open the screen again from Explore,
      which is where the bar lives.
    */
    const onProduct = await p.evaluate(() => document.querySelectorAll("[data-buyer-tab-bar]").length)
    expect(onProduct === 0, "the product a result opened has no tab bar: it is the creator's page", onProduct)
    /* Back to Explore inside this same document (the stub listens for
       popstate), so what was just searched is still in this page's recents. */
    await p.evaluate(() => { history.pushState({ __NA: true }, "", "/explore"); window.dispatchEvent(new PopStateEvent("popstate")) })
    await sleep(300)
    const slot2 = await p.evaluate(() => { const r = document.querySelector('[data-buyer-tab="search"]')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })
    expect(!!slot2, "back on Explore, the bar is there to open the screen again", slot2)
    if (slot2) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await touch("touchStart", slot2.x, slot2.y)
      await touch("touchEnd")
      await p.screenshot({ path: join(shots, "search-open-early.png") })
      await sleep(90)
      await p.screenshot({ path: join(shots, "search-open-mid.png") })
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      await sleep(450)
      const rec = await p.evaluate(() => [...document.querySelectorAll('[data-search-row="recent"]')].map((a) => a.textContent.replace(/Remove.*/, "").trim()))
      expect(rec[0] === "mar", "what was searched comes back as a recent search", rec)
      await p.screenshot({ path: join(shots, "search-recent.png") })
      await p.keyboard.type("zzqx", { delay: 30 })
      await sleep(700)
      const empty = await p.evaluate(() => ({ state: document.querySelector("[data-search-state]")?.dataset.searchState, text: document.querySelector("[data-search-empty]")?.textContent, browse: !!document.querySelector('[data-search-section="browse"]') }))
      expect(empty.state === "empty" && /No results for/.test(empty.text || "") && empty.browse, "nothing found: says so, and offers the categories", empty)
      await p.screenshot({ path: join(shots, "search-empty.png") })
      await p.keyboard.press("Escape")
      await sleep(80)
      const cleared = await p.evaluate(() => ({ value: document.querySelector("[data-search-screen-field]").value, state: document.querySelector("[data-search-overlay]").dataset.searchOverlay }))
      expect(cleared.value === "" && cleared.state === "open", "Escape clears the words first", cleared)
      await p.keyboard.press("Escape")
      await sleep(450)
      const esc = await p.evaluate(() => ({ state: document.querySelector("[data-search-overlay]").dataset.searchOverlay, entry: !!(history.state && history.state.storelibSearch) }))
      expect(esc.state === "closed" && !esc.entry, "and then closes, taking its history entry back", esc)
    }

    /* Enter with nothing lit: Explore's results, and Search is the tab you are on. */
    const slot3 = await p.evaluate(() => { const r = document.querySelector('[data-buyer-tab="search"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await touch("touchStart", slot3.x, slot3.y)
    await touch("touchEnd")
    await sleep(400)
    await p.keyboard.type("drum", { delay: 30 })
    await p.keyboard.press("Enter")
    await sleep(900)
    const q = await p.evaluate(() => ({ path: location.pathname, search: location.search, state: document.querySelector("[data-search-overlay]").dataset.searchOverlay, current: [...document.querySelectorAll("[data-buyer-tab]")].findIndex((t) => t.getAttribute("aria-current") === "page") }))
    expect(q.path === "/explore" && q.search === "?q=drum" && q.state === "closed" && q.current === 1, "Enter goes to Explore's results, and the Search tab is on there", q)
    await p.screenshot({ path: join(shots, "search-explore-results.png") })

    /* Opened on the results, it starts from their words; the X and Back both close it, with frames of the way out. */
    await touch("touchStart", slot3.x, slot3.y)
    await touch("touchEnd")
    await sleep(400)
    const pre = await p.evaluate(() => document.querySelector("[data-search-screen-field]").value)
    expect(pre === "drum", "opened from Explore's results, it starts from their words", pre)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await p.evaluate(() => {
      window.__out = []
      const o = document.querySelector("[data-search-overlay]")
      const t0 = performance.now()
      const tick = () => { const cs = getComputedStyle(o); window.__out.push({ t: Math.round(performance.now() - t0), opacity: +(+cs.opacity).toFixed(3), translate: cs.translate, visibility: cs.visibility }); if (performance.now() - t0 < 600) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
      document.querySelector("[data-search-close]").click()
    })
    await sleep(80)
    await p.screenshot({ path: join(shots, "search-closing.png") })
    await sleep(700)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const out = await p.evaluate(() => window.__out)
    const fading = out.filter((f) => f.opacity > 0 && f.opacity < 1)
    const falling = out.every((f, i) => i === 0 || f.opacity <= out[i - 1].opacity + 0.001)
    expect(fading.length >= 2 && falling && out[out.length - 1].opacity === 0 && out[out.length - 1].visibility === "hidden", "the X: it leaves over several frames, only fading, then is hidden", { frames: out.length, fading: fading.length, last: out[out.length - 1] })
    const closedAfter = await p.evaluate(() => ({ path: location.pathname, search: location.search, overflow: document.documentElement.style.overflow }))
    expect(closedAfter.path === "/explore" && closedAfter.search === "?q=drum" && closedAfter.overflow === "", "and you are where you were", closedAfter)
    await p.screenshot({ path: join(shots, "search-closed.png") })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── /explore/search at its own address ─────────────────────────────── */
  if (only("page")) console.log("\n/explore/search")
  if (only("page")) for (const vp of [PHONE(390), DESK]) {
    const { p, errors } = await open(vp, "/explore/search", "buyer")
    const s = await p.evaluate(() => {
      const page = document.querySelector("[data-search-page]")
      const r = page.getBoundingClientRect()
      return { top: Math.round(r.top), focused: document.activeElement?.hasAttribute("data-search-screen-field") ?? false, covered: !!document.elementFromPoint(innerWidth / 2, 20)?.closest("[data-search-page]"), footer: !!document.querySelector("footer") }
    })
    if (vp.isMobile) expect(s.covered && s.focused, "phone: the same screen, full screen over the header, field focused", s)
    else expect(!s.covered && s.top > 40 && s.focused, "computer: the same screen in the page, under the header", s)
    expect(!s.footer, "no footer under a search screen", s.footer)
    await p.screenshot({ path: join(shots, `search-page-${vp.width}.png`) })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
