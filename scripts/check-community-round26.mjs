/**
 * ===========================================================================
 *  ROUND 26, MEASURED
 * ===========================================================================
 * The real components in headless Chromium, with the probes' own stubs for
 * the router (as in check-community-frame12.mjs):
 *
 *   (TABS moved to check-community-round27.mjs COLUMNS: round 27 put the
 *   community card back on the left, the tab row staying under the bar.)
 *   DARK      the "..." menu's Dark mode turns the frame dark (the page, its
 *             cards), with the switch's soft class on <html> for a moment
 *             and gone after; Light mode turns it back
 *   SETTINGS  1440: the settings are a column of groups beside the panel,
 *             with no pill row; 390: one picker control instead; a panel you
 *             leave stays mounted (hidden), so what you typed is kept
 *   COURSES   1280: the Library's courses are cards, three to a row, each
 *             with an orange ring and its state in words
 *
 *   PROBE_CSS=source node scripts/check-community-round26.mjs [section ...]
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
const themeCss = readFileSync(join(root, "components/community/community-theme.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".community-round26-probe")
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
      alias: { "@": ".", "next/navigation": "./.community-round26-probe/navigation.js", "next/link": "./.community-round26-probe/link.jsx", "next/image": "./.community-round26-probe/image.jsx" },
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

  if (want("DARK")) {
    console.log("\nDARK: the menu switches the community between light and dark")
    const { p, errors } = await open("member", "/community/clay-studio", DESK)
    const bg = () => p.evaluate(() => getComputedStyle(document.querySelector("[data-community-shell]")).backgroundColor)
    const before = await bg()
    await p.click("[data-community-account] .hidden button")
    await sleep(400)
    const clickRow = (label) =>
      p.evaluate((label) => {
        const row = [...document.querySelectorAll("[role=menuitem], [role=menu] a, [role=menu] button")].find((el) => el.textContent?.trim() === label)
        if (!row) return false
        row.click()
        return true
      }, label)
    const pressed = await clickRow("Dark mode")
    await sleep(60)
    const softDuring = await p.evaluate(() => document.documentElement.classList.contains("community-theme-switching"))
    await sleep(700)
    const after = await bg()
    const softAfter = await p.evaluate(() => document.documentElement.classList.contains("community-theme-switching"))
    const card = await p.evaluate(() => {
      const el = document.querySelector("[data-community-right] .bg-white") || document.querySelector("[data-community-main] .bg-white")
      return el ? getComputedStyle(el).backgroundColor : null
    })
    const stored = await p.evaluate(() => localStorage.getItem("storelib:community-appearance"))
    expect(before === "rgb(248, 249, 250)", "light to begin with", before)
    expect(pressed, "the menu has Dark mode", pressed)
    expect(softDuring && !softAfter, "the soft switch is on for the moment of the change and off after", { softDuring, softAfter })
    expect(after === "rgb(14, 16, 20)", "the page is dark", after)
    expect(card === "rgb(23, 26, 33)", "a card is the dark surface", card)
    expect(stored === "dark", "the choice is kept for the next visit", stored)
    await p.click("[data-community-account] .hidden button")
    await sleep(400)
    const back = await clickRow("Light mode")
    await sleep(700)
    expect(back && (await bg()) === "rgb(248, 249, 250)", "Light mode turns it back", await bg())
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  if (want("SETTINGS")) {
    console.log("\nSETTINGS: a column of groups, not a second row of pills")
    {
      const { p, errors } = await open("creator", "/app/community/the-morning-writers/settings?case=settings", DESK)
      const groups = await box(p, "[data-settings-groups]")
      const picker = await box(p, "[data-settings-picker]")
      const panel = await box(p, '[data-settings-panel="page"]')
      const pills = await p.evaluate(() => document.querySelectorAll('[data-settings] [role="tablist"]').length)
      const heads = await p.evaluate(() => [...document.querySelectorAll("[data-settings-group] > p")].map((el) => el.textContent))
      expect(!!groups?.shown && groups.w >= 180 && groups.w <= 210, "1440: the groups column is drawn, about 196px", groups)
      expect(!picker?.shown, "1440: no picker", picker)
      expect(pills === 0, "1440: no pill row", pills)
      expect(!!panel && panel.x > groups.x + groups.w, "1440: the panel sits beside the column", { groups, panel })
      expect(heads.length >= 2, "1440: the settings are in named groups", heads)
      await p.type("#g-name", " Club")
      await p.click('[data-settings-tab="access"]')
      await sleep(250)
      const accessShown = await box(p, '[data-settings-panel="access"]')
      const pageKept = await p.evaluate(() => {
        const el = document.querySelector('[data-settings-panel="page"]')
        return el ? { hidden: el.hidden, name: el.querySelector("#g-name")?.value } : null
      })
      expect(!!accessShown?.shown, "1440: Access opens beside the column", accessShown)
      expect(!!pageKept && pageKept.hidden && /Club$/.test(pageKept.name || ""), "1440: Page stays mounted and hidden, with what was typed", pageKept)
      await p.click('[data-settings-tab="page"]')
      await sleep(200)
      const nameBack = await p.evaluate(() => document.querySelector("#g-name")?.value)
      expect(/Club$/.test(nameBack || ""), "1440: back on Page, the unsaved name is still there", nameBack)
      expect(errors.length === 0, "1440: no page errors", errors)
      await p.close()
    }
    {
      const { p, errors } = await open("creator", "/app/community/the-morning-writers/settings?case=settings", PHONE)
      const groups = await box(p, "[data-settings-groups]")
      const picker = await box(p, "[data-settings-picker] button")
      expect(!groups?.shown, "390: no column", groups)
      expect(!!picker?.shown && picker.h >= 44 && picker.h <= 46, "390: one 44px picker names the open settings", picker)
      const label = await p.evaluate(() => document.querySelector("[data-settings-picker] button")?.textContent)
      expect(/Page/.test(label || ""), "390: the picker says Page", label)
      await p.tap("[data-settings-picker] button")
      await sleep(700)
      const rows = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button, [role="dialog"] a')].map((el) => el.textContent?.trim()).filter(Boolean))
      expect(rows.includes("Access") && rows.includes("Notifications"), "390: the sheet lists the settings", rows)
      expect(errors.length === 0, "390: no page errors", errors)
      await p.close()
    }
  }

  if (want("COURSES")) {
    console.log("\nCOURSES: cards with a ring")
    const { p, errors } = await open("courses", "/account/library/courses", { width: 1280, height: 900, deviceScaleFactor: 1 })
    const cards = await p.evaluate(() => [...document.querySelectorAll("[data-course-row]")].map((el) => { const b = el.getBoundingClientRect(); return { y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), state: el.querySelector("[data-course-state]")?.textContent } }))
    const ring = await p.evaluate(() => [...document.querySelectorAll("[data-course-ring] circle")].map((c) => c.getAttribute("stroke")))
    expect(cards.length === 3 && new Set(cards.map((c) => c.y)).size === 1, "three cards in one row", cards)
    expect(new Set(cards.map((c) => c.h)).size === 1, "the cards are one height", cards.map((c) => c.h))
    expect(cards.map((c) => c.state).join() === "In progress,Not started,Completed", "each says where you are in words", cards.map((c) => c.state))
    expect(ring.includes("#f26b1d") && ring.includes("#fde7d9"), "the rings are orange on a pale orange track", ring)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
