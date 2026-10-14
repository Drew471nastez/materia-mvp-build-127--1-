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
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
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
  const ENTRIES = {
    hub: "scripts/render-account-hub.tsx",
    library: "scripts/render-buyer-library.tsx",
    settings: "scripts/render-account-settings.tsx",
    explore: "scripts/render-explore-page.tsx",
    membership: "scripts/render-community-membership.tsx",
    courses: "scripts/render-courses-index.tsx",
  }
  const pages = {}
  for (const [k, entry] of Object.entries(ENTRIES)) {
    try {
      pages[k] = await bundle(entry, `${k}.js`)
    } catch (e) {
      console.log(`  skip ${k}: ${String(e).slice(0, 200)}`)
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
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect()
        /* Dots and badges (a status light, a count) keep their colour on purpose. */
        if (b.width < 14 || b.height < 14 || b.bottom < 0 || b.top > innerHeight) continue
        if (el.closest("img, video, svg, picture, [data-community-mark], [data-keep-bright]")) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue
        const bg = parse(cs.backgroundColor)
        if (bg && bg.a > 0.35 && bg.l > 0.55 && !(el.getAttribute("data-appearance-switch") || el.closest("[data-appearance-switch]"))) out.push({ what: "background", el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`, bg: cs.backgroundColor })
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          const w = parseFloat(cs[`border${side}Width`])
          const c = parse(cs[`border${side}Color`])
          if (w >= 1 && c && c.a > 0.3 && c.l > 0.45) {
            out.push({ what: `border ${side}`, el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`, color: cs[`border${side}Color`] })
            break
          }
        }
      }
      return out.slice(0, 12)
    })
  const goDark = async (p) => {
    const btn = await p.$("[data-appearance-button]")
    if (btn) await btn.click()
    await sleep(700)
  }

  const PATHS = { hub: "/account", library: "/account/library", settings: "/account/settings", explore: "/explore", membership: "/community/clay-studio/membership", courses: "/account/library/courses" }
  for (const kind of Object.keys(pages)) {
    if (!want(kind.toUpperCase())) continue
    for (const vp of [DESK, PHONE]) {
      const { p, errors } = await open(kind, PATHS[kind], vp)
      await sleep(600)
      await p.evaluate(() => { document.documentElement.setAttribute("data-sl-dark", ""); document.documentElement.style.colorScheme = "dark" })
      await sleep(400)
      const ground = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const patches = await lightPatches(p)
      await p.screenshot({ path: join(shots, `${kind}-${vp.width}-dark.png`) })
      expect(ground === "rgb(17, 17, 19)", `${kind} ${vp.width}: the ground is charcoal`, ground)
      expect(patches.length === 0, `${kind} ${vp.width}: no light surface or light border on screen`, patches)
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
