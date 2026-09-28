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
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
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
    window.__nav = { path, search: search ? "?" + search : "" }
    window.__who = who
    try {
      localStorage.clear()
      if (who !== "guest") localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false }))
    } catch {}
  }, path, search || "", who)
  await p.goto(ORIGIN + address, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
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
  for (const width of [360, 390, 430]) {
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
    for (const path of ["/library", "/account"]) {
      const { p, errors } = await open(PHONE(width), path, "buyer")
      const s = await p.evaluate(READ)
      await p.screenshot({ path: join(shots, `${path.slice(1)}-buyer-${width}-top.png`), clip: { x: 0, y: 0, width, height: 190 } })
      await p.evaluate(() => window.scrollTo(0, 900))
      await sleep(400)
      const d = await p.evaluate(READ)
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await sleep(300)
      const end = await p.evaluate(READ)
      await p.screenshot({ path: join(shots, `${path.slice(1)}-buyer-${width}-end.png`) })
      expect(s.header && s.bar, `${path}: the header and the tab bar`, { header: s.header, bar: s.bar })
      expect(!s.strip && !d.strip, `${path}: no "Search for anything" bar, at the top or scrolled`, [s.strip, d.strip])
      expect(!s.library && s.controls.includes("Wishlist") && s.controls.includes("Open profile menu"), `${path}: no Library icon; the heart and the photo`, s.controls)
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
  console.log("\ndesktop 1280")
  for (const [path, who, footer] of [["/explore", "buyer", false], ["/explore", "guest", true], ["/library", "buyer", false], ["/account", "buyer", false], ["/", "buyer", true], ["/", "guest", true]]) {
    const { p, errors } = await open(DESK, path, who)
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(300)
    const s = await p.evaluate(READ)
    const tag = `${path} ${who}:`
    expect(s.header && !s.bar, `${tag} the header, no tab bar`, { header: s.header, bar: s.bar })
    expect(s.footer === footer, `${tag} ${footer ? "the black footer" : "no black footer"}`, s.footer)
    if (who === "buyer" && path !== "/") expect(s.library, `${tag} the computer's header keeps its Library icon`, s.controls)
    if (path !== "/" ) await p.screenshot({ path: join(shots, `desk-${path.slice(1)}-${who}.png`) })
    expect(errors.length === 0, `${tag} no errors`, errors)
    await p.close()
  }

  /* ── ICONS AT 1x, 2x, 3x ───────────────────────────────────────────────── */
  console.log("\nthe tab bar's icons")
  for (const dpr of [1, 2, 3]) {
    for (const [address, tab] of [["/explore", 0], ["/explore?q=drum", 1], ["/library", 2], ["/account", 3]]) {
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

  /* ── SEARCH, FULL SCREEN ───────────────────────────────────────────────── */
  console.log("\nsearch, full screen (390, signed in)")
  {
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
    expect(open1.title === "Search" && open1.field.radius !== "0px" && open1.field.font === "16px", "a big Search title and a rounded 16px field (image 27)", open1)
    await p.screenshot({ path: join(shots, "search-open.png") })

    /* Typing: loading, then results. */
    await p.keyboard.type("mar", { delay: 40 })
    await sleep(120)
    const loading = await p.evaluate(() => ({ state: document.querySelector("[data-search-state]")?.dataset.searchState, sections: [...document.querySelectorAll("[data-search-section]")].map((s) => s.dataset.searchSection) }))
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

    /* Again, from the product page browsed from Storelib: recent searches. */
    const slot2 = await p.evaluate(() => { const r = document.querySelector('[data-buyer-tab="search"]')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })
    expect(!!slot2, "the product, opened from search, keeps the tab bar (discover mode)", slot2)
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
  console.log("\n/explore/search")
  for (const vp of [PHONE(390), DESK]) {
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
