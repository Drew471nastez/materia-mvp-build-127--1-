/**
 * ===========================================================================
 *  ROUND 27, LOOKED AT
 * ===========================================================================
 * The community frame in its dark look, photographed and measured (the
 * owner's screenshots: a white hover in the menu, a white "All" pill, white
 * hairlines round the composer and the cards):
 *
 *   COLUMNS   1440: the community card is back on the left, the page in the
 *             middle, the right column beside it, the tab row under the bar
 *   HEADER    the account menu opens from the person's picture, its first
 *             row is their profile, and a sun and moon sits beside the bell
 *   DARK      the switch turns the frame dark; no surface, hover, chosen
 *             pill or hairline inside it stays light (each measured), and
 *             pictures go to SHOTS_DIR (.round27-shots by default) to look at
 *
 *   PROBE_CSS=source node scripts/check-community-round27.mjs [section ...]
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
const stubs = join(root, ".community-round27-probe")
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
      alias: { "@": ".", "next/navigation": "./.community-round27-probe/navigation.js", "next/link": "./.community-round27-probe/link.jsx", "next/image": "./.community-round27-probe/image.jsx" },
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
  const pages = {
    member: await bundle("scripts/render-community-shell.tsx", "member.js"),
    creator: await bundle("scripts/render-community-creator.tsx", "creator.js"),
    courses: await bundle("scripts/render-courses-index.tsx", "courses.js"),
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
      for (const el of document.querySelectorAll("[data-community-shell] *, [role=menu] *, [role=menu]")) {
        const b = el.getBoundingClientRect()
        if (b.width < 4 || b.height < 4 || b.bottom < 0 || b.top > innerHeight) continue
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

  if (want("COLUMNS")) {
    console.log("\nCOLUMNS: the card on the left again, the tabs stay")
    const { p, errors } = await open("member", "/community/clay-studio", DESK)
    const left = await box(p, "[data-community-left]")
    const main = await box(p, "[data-community-main]")
    const right = await box(p, "[data-community-right]")
    const tabs = await box(p, "[data-community-top-tabs]")
    const card = await p.evaluate(() => !!document.querySelector("[data-community-left] [data-wall-settings], [data-community-left] img, [data-community-left] h2, [data-community-left] *"))
    expect(!!left?.shown && left.w >= 260 && left.w <= 290, "1440: a left column of about 280px", left)
    expect(card, "1440: the community card is in it")
    expect(!!main && main.x > left.x + left.w && !!right?.shown && right.x > main.x + main.w, "1440: card, page, right column, in that order", { left, main, right })
    expect(!!tabs?.shown, "1440: the tab row is still under the bar", tabs)
    const places = await p.evaluate(() => document.querySelectorAll("[data-community-left] [data-community-nav], [data-wall-places]").length)
    expect(places === 0, "1440: no list of places in the left column (they are the tab row)", places)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  if (want("HEADER")) {
    console.log("\nHEADER: the picture opens the menu; the switch is beside the bell")
    const { p, errors } = await open("member", "/community/clay-studio", DESK)
    const avatarBtn = await box(p, "[data-community-account] [data-header-avatar]")
    const more = await p.$("[data-community-account] [data-account-more]:not(.md\\:hidden)")
    const sw = await box(p, "[data-appearance-button]")
    const bell = await p.evaluate(() => { const b = [...document.querySelectorAll("[data-community-top-actions] button")].find((x) => x.querySelector("svg.lucide-bell")); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left) } })
    expect(!!avatarBtn?.shown && avatarBtn.w === 36, "1440: the menu button is the person's 36px picture", avatarBtn)
    expect(!more, "1440: no \"...\" button on a computer")
    expect(!!sw?.shown && (!bell || sw.x < bell.x), "1440: the sun and moon sits just before the bell", { sw, bell })
    await p.click("[data-community-account] [data-header-avatar]")
    await sleep(450)
    const who = await p.evaluate(() => { const a = document.querySelector("[data-account-menu] [data-account-who]"); return a ? { tag: a.tagName, href: a.getAttribute("href") } : null })
    const row = await p.evaluate(() => { const r = document.querySelector('[data-account-menu] [data-account-item="appearance"]'); return r ? { text: r.textContent.trim(), checked: r.getAttribute("aria-checked") } : null })
    expect(who?.tag === "A" && who.href === "/account", "the name at the top is a link to the profile", who)
    expect(!!row && /Dark mode/.test(row.text) && row.checked === "false", "the menu has Dark mode with its switch, off", row)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  if (want("DARK")) {
    console.log("\nDARK: nothing inside the frame stays light")
    for (const [name, path] of [["feed", "/community/clay-studio?case=feed"], ["members", "/community/clay-studio/members?case=members"], ["about", "/community/clay-studio/about?case=about-member"], ["learn", "/community/clay-studio/learn?case=classroom"], ["events", "/community/clay-studio/events?case=events"], ["leaderboard", "/community/clay-studio/leaderboard?case=leaderboard"]]) {
      const { p, errors } = await open("member", path, DESK)
      await sleep(900)
      await p.screenshot({ path: join(shots, `${name}-light.png`) })
      await goDark(p)
      const bg = await p.evaluate(() => getComputedStyle(document.querySelector("[data-community-shell]")).backgroundColor)
      const patches = await lightPatches(p)
      await p.screenshot({ path: join(shots, `${name}-dark.png`) })
      expect(bg === "rgb(17, 17, 19)", `${name}: the ground is the charcoal page`, bg)
      expect(patches.length === 0, `${name}: no light surface or light border on screen`, patches)
      expect(errors.length === 0, `${name}: no page errors`, errors)
      if (name === "feed") {
        /* The menu, open, with a row under the pointer. */
        await p.click("[data-community-account] [data-header-avatar]")
        await sleep(450)
        const rowBox = await box(p, '[data-account-menu] [data-account-item="saved"]')
        if (rowBox) await p.mouse.move(rowBox.x + 20, rowBox.y + rowBox.h / 2)
        await sleep(250)
        const hover = await p.evaluate(() => { const r = document.querySelector('[data-account-menu] [data-account-item="saved"]'); if (!r) return null; const cs = getComputedStyle(r); return { bg: cs.backgroundColor, color: cs.color } })
        const hl = hover ? lum(hover.bg) : null
        const tl = hover ? lum(hover.color) : null
        expect(!!hover && hl.l < 0.25 && tl.l > 0.6, "feed: a hovered menu row is a dark step with light words", hover)
        const menuPatches = await lightPatches(p)
        expect(menuPatches.length === 0, "feed: nothing light in the open menu", menuPatches)
        await p.screenshot({ path: join(shots, "menu-dark.png") })
        const chosen = await p.evaluate(() => { const c = document.querySelector('[data-space-chip][aria-current="page"]'); if (!c) return null; const cs = getComputedStyle(c); return { bg: cs.backgroundColor, color: cs.color } })
        if (chosen) expect(lum(chosen.bg).l < 0.3 && lum(chosen.color).l > 0.6, "feed: the chosen space pill is a graphite step with light words, not white", chosen)
      }
      await p.close()
    }
    console.log(`  pictures: ${shots}`)
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
