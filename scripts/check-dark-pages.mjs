/**
 * ===========================================================================
 *  STORELIB'S OWN PAGES IN THE DARK LOOK, LOOKED AT
 * ===========================================================================
 * Round 27: the person's dark choice applies to the account, its library and
 * settings, Explore and a community's Membership page as well. Each real page
 * (its render harness) is drawn, html[data-sl-dark] put on, and every element
 * on screen whose own background or border is still light is listed; the
 * pictures go to SHOTS_DIR (.round27-shots) to look at.
 *
 *   PROBE_CSS=source node scripts/check-dark-pages.mjs [hub library settings explore membership courses]
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
/* The community's own sheet, which its components import (the bundle leaves CSS out). */
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".dark-pages-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round27-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
if (!window.__pushPatched) {
  window.__pushPatched = true
  const push = history.pushState.bind(history)
  history.pushState = (s, u, url) => { push(s, u, url); queueMicrotask(() => window.dispatchEvent(new Event("probe:path"))) }
}
export const usePathname = () => {
  const [p, setP] = useState(location.pathname)
  useEffect(() => {
    const on = () => startTransition(() => setP(location.pathname))
    window.addEventListener("probe:path", on)
    window.addEventListener("popstate", on)
    on()
    return () => { window.removeEventListener("probe:path", on); window.removeEventListener("popstate", on) }
  }, [])
  return p
}
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const useSelectedLayoutSegments = () => []
export const permanentRedirect = () => {}
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: { id: "u-me", email: "sam@example.com", user_metadata: {} } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }; return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  const bundle = async (entry, out) => {
    await build({
      entryPoints: [join(root, entry)],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.dark-pages-probe/navigation.js", "next/link": "./.dark-pages-probe/link.jsx", "next/image": "./.dark-pages-probe/image.jsx" },
      plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, out),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, out), "utf8")
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  }
  /* Every real buyer screen there is a harness for: [name, harness, address]. */
  const SCREENS = [
    ["hub", "scripts/render-account-hub.tsx", "/account"],
    ["library", "scripts/render-buyer-library.tsx", "/account/library"],
    ["settings", "scripts/render-profile-round10.tsx", "/account/settings?case=settings"],
    ["explore", "scripts/render-explore-page.tsx", "/explore"],
    ["membership", "scripts/render-community-membership.tsx", "/community/clay-studio/membership"],
    ["courses", "scripts/render-courses-index.tsx", "/account/library/courses"],
    ["tabbar", "scripts/render-buyer-tab-bar.tsx", "/explore"],
    ["ctabbar", "scripts/render-community-tab-bar.tsx", "/community/clay-studio?case=feed&signedin=1"],
    ["header", "scripts/render-header-states.tsx", "/explore?path=/explore&who=buyer"],
    ["exploreheader", "scripts/render-explore-header.tsx", "/explore"],
    ["account", "scripts/render-account-center.tsx", "/account"],
    ["profile", "scripts/render-profile-round10.tsx", "/member/maya?case=profile"],
    ["navigator", "scripts/render-place-navigator.tsx", "/explore?mode=header"],
    ["categories", "scripts/render-header-categories.tsx", "/explore"],
    ["cheader", "scripts/render-community-header.tsx", "/community/studio-notes"],
    ["feed", "scripts/render-community-shell.tsx", "/community/clay-studio?case=feed"],
    ["members", "scripts/render-community-shell.tsx", "/community/clay-studio/members?case=members"],
    ["about", "scripts/render-community-shell.tsx", "/community/clay-studio/about?case=about-member"],
    ["events", "scripts/render-community-shell.tsx", "/community/clay-studio/events?case=events"],
    ["leaderboard", "scripts/render-community-shell.tsx", "/community/clay-studio/leaderboard?case=leaderboard"],
    ["saved", "scripts/render-community-shell.tsx", "/community/clay-studio/saved?case=saved"],
    ["visitor", "scripts/render-community-shell.tsx", "/community/clay-studio/about?case=about-visitor"],
    ["learn18", "scripts/render-learn18.tsx", "/community/salajanywood/learn/prog-1?lesson=lesson-1"],
  ]
  const pages = {}
  const built = {}
  for (const [k, entry] of SCREENS) {
    if (only.size && !only.has(k.toUpperCase())) continue
    try {
      if (!built[entry]) built[entry] = await bundle(entry, `${entry.replace(/\W+/g, "_")}.js`)
      pages[k] = built[entry]
    } catch (e) {
      console.log(`  skip ${k}: ${String(e).split("\n")[0].slice(0, 160)}`)
    }
  }
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(kind, path, vp) {
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
        else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null, available: true }
        else if (short.includes("/dms")) body = { ready: true, unread: 0, conversations: [] }
        else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: [] }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: pages[kind] })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(700)
    return { p, errors }
  }
  const box = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), shown: cs.display !== "none" && b.width > 0 && b.height > 0 }
    }, sel)

  const lum = (rgb) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(rgb || "")
    if (!m) return null
    const a = m[4] === undefined ? 1 : Number(m[4])
    return { l: (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255, a }
  }
  /* Every element on screen whose own background, or border, is light while the frame is dark. */
  const lightPatches = (p) =>
    p.evaluate(() => {
      const out = []
      const parse = (rgb) => {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(rgb || "")
        if (!m) return null
        return { l: (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255, a: m[4] === undefined ? 1 : Number(m[4]) }
      }
      const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 90)}`
      const KEEP = "img, video, picture, canvas, [data-community-mark], [data-keep-bright], [data-storelib-mark], [data-soft-img], iframe"
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest(KEEP)) continue
        const b = el.getBoundingClientRect()
        if (b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || cs.display === "none") continue
        /* Hidden by an ancestor's opacity (a closed menu kept mounted). */
        let hiddenUp = false
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a)
          if (Number(s.opacity) === 0 || s.visibility === "hidden") { hiddenUp = true; break }
        }
        if (hiddenUp) continue
        const isSvgPart = el instanceof SVGElement
        if (isSvgPart) {
          if (el.tagName.toLowerCase() === "svg" || b.width < 6) continue
          /* An icon's line or fill drawn in near black on the dark ground. */
          const fill = cs.fill === "none" ? null : parse(cs.fill)
          const stroke = cs.stroke === "none" ? null : parse(cs.stroke)
          const dark = (c) => c && c.a > 0.5 && c.l < 0.22
          const owner = el.closest("svg")
          const ob = owner ? getComputedStyle(owner) : null
          if ((dark(stroke) && parseFloat(cs.strokeWidth) > 0) || (dark(fill) && cs.fillOpacity !== "0")) {
            if (ob && Number(ob.opacity) > 0.1) out.push({ what: "dark icon", el: name(owner || el), fill: cs.fill, stroke: cs.stroke })
          }
          continue
        }
        if (b.width >= 14 && b.height >= 14) {
          const bg = parse(cs.backgroundColor)
          if (bg && bg.a > 0.35 && bg.l > 0.55 && !el.closest("[data-appearance-switch]")) out.push({ what: "light background", el: name(el), bg: cs.backgroundColor })
          for (const side of ["Top", "Right", "Bottom", "Left"]) {
            const w = parseFloat(cs[`border${side}Width`])
            const c = parse(cs[`border${side}Color`])
            if (w >= 1 && c && c.a > 0.3 && c.l > 0.45) {
              out.push({ what: `light border ${side}`, el: name(el), color: cs[`border${side}Color`] })
              break
            }
          }
        }
        /* Words drawn in near black on the dark ground. */
        const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        const ink = parse(cs.color)
        if (ownText && ink && ink.a > 0.5 && ink.l < 0.3) {
          /* Unless it sits on a light surface of its own (a white chip on purpose is reported above). */
          let ground = null
          for (let a = el; a; a = a.parentElement) {
            const g = parse(getComputedStyle(a).backgroundColor)
            if (g && g.a > 0.5) { ground = g; break }
          }
          if (!ground || ground.l < 0.5) out.push({ what: "dark text", el: name(el), color: cs.color, text: el.textContent.trim().slice(0, 40) })
        }
      }
      const seen = new Set()
      return out.filter((o) => { const k = `${o.what}|${o.el}`; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 25)
    })
  const goDark = async (p) => {
    const btn = await p.$("[data-appearance-button]")
    if (btn) await btn.click()
    await sleep(700)
  }

  /* The switch itself: the new look is on <html> in the same task as the press, the still fades and is gone, no long frame. */
  if (want("SWITCH") && pages.feed) {
    console.log("\nSWITCH: pressing the sun and moon")
    const { p, errors } = await open("feed", "/community/clay-studio", DESK)
    await sleep(700)
    for (const to of ["dark", "light"]) {
      const r = await p.evaluate(async () => {
        const html = document.documentElement
        const btn = document.querySelector("[data-appearance-button]")
        if (!btn) return null
        /* How long a frame takes on this machine with nothing happening (headless draws in software). */
        const idle = await new Promise((res) => { const ts = []; const f = (t) => { ts.push(t); if (ts.length < 11) requestAnimationFrame(f); else res((ts[10] - ts[0]) / 10) }; requestAnimationFrame(f) })
        const frames = []
        let last = performance.now()
        let on = true
        const tick = (t) => { frames.push(t - last); last = t; if (on) requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
        let flipped = null
        let pressedThen = null
        const mo = new MutationObserver(() => {
          if (flipped === null) { flipped = performance.now() - t0; pressedThen = btn.getAttribute("aria-pressed") }
        })
        mo.observe(html, { attributes: true, attributeFilter: ["data-sl-dark"] })
        const t0 = performance.now()
        btn.click()
        const took = performance.now() - t0
        await new Promise((res) => setTimeout(res, 450))
        on = false
        mo.disconnect()
        return { idle: Math.round(idle), took: Math.round(took), flipped: flipped === null ? null : Math.round(flipped), dark: html.hasAttribute("data-sl-dark"), pressed: btn.getAttribute("aria-pressed"), pressedThen, swapLeft: html.hasAttribute("data-theme-swap"), longest: Math.round(Math.max(...frames.slice(1))), body: getComputedStyle(document.body).backgroundColor }
      })
      expect(!!r, `to ${to}: the button is there`)
      if (!r) continue
      expect(r.dark === (to === "dark") && r.pressed === String(to === "dark"), `to ${to}: the look and the button are the new ones`, r)
      expect(r.flipped !== null && r.flipped <= 100, `to ${to}: <html> takes the new look within 100ms of the press (the still of the old one is taken first; measured about 60ms here)`, r)
      expect(!r.swapLeft, `to ${to}: the fade is over and gone after 450ms`, r)
      expect(r.took < 50 && r.longest <= 100, `to ${to}: the press itself takes under 50ms and no frame is longer than 100ms (one restyle of the page, under the still)`, r)
    }
    if (process.env.SWITCH_PROFILE) {
      const cost = await p.evaluate(async () => {
        const html = document.documentElement
        const out = []
        for (let i = 0; i < 4; i++) {
          const t0 = performance.now()
          html.toggleAttribute("data-sl-dark")
          void document.body.offsetHeight
          getComputedStyle(document.querySelector("[data-community-main]") || document.body).color
          out.push(Math.round(performance.now() - t0))
          await new Promise((r) => requestAnimationFrame(() => r()))
        }
        const base = []
        for (let i = 0; i < 4; i++) {
          const t0 = performance.now()
          html.style.setProperty("--probe-x", String(i))
          void document.body.offsetHeight
          getComputedStyle(document.querySelector("[data-community-main]") || document.body).color
          base.push(Math.round(performance.now() - t0))
          await new Promise((r) => requestAnimationFrame(() => r()))
        }
        const sheet = [...document.styleSheets].reduce((n, sh) => { try { return n + sh.cssRules.length } catch { return n } }, 0)
        return { styleAndLayout: out, everyElementRestyled: base, nodes: document.querySelectorAll("*").length, rules: sheet }
      })
      console.log("  profile", JSON.stringify(cost))
    }
    expect(errors.length === 0, "switch: no page errors", errors)
    await p.close()
  }

  const PATHS = Object.fromEntries(SCREENS.map(([k, , path]) => [k, path]))
  for (const kind of Object.keys(pages)) {
    for (const vp of [DESK, PHONE]) {
      const { p, errors } = await open(kind, PATHS[kind], vp)
      await sleep(700)
      await p.evaluate(() => { document.documentElement.setAttribute("data-sl-dark", ""); document.documentElement.style.colorScheme = "dark" })
      await sleep(400)
      const patches = await lightPatches(p)
      await p.screenshot({ path: join(shots, `${kind}-${vp.width}-dark.png`) })
      expect(patches.length === 0, `${kind} ${vp.width}: nothing left light, and no dark ink or icon on the dark ground`, patches)
      expect(errors.length === 0, `${kind} ${vp.width}: no page errors`, errors)
      await p.close()
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
