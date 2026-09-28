/**
 * ===========================================================================
 *  THE BUYER'S TAB BAR AND THE ACCOUNT PAGE, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real bar (components/nav/buyer-tab-bar.tsx), the real search screen and
 * the real account page, rendered by scripts/render-buyer-tab-bar.tsx at a
 * storelib.com address, pressed with touches the way a thumb presses them.
 *
 *   BAR       a plain white bar across the foot of a 390px phone: full width,
 *             56px, white, a shadow along its top; Home, Search, Library,
 *             Profile in that order; the page you are on is the filled icon
 *   ROOM      the last line of the page ends above the bar, not under it
 *   PRESS     the glass comes up under the finger on the frame it lands,
 *             on the slot it landed on; the icon gives a little; the page
 *             changes and the tab it went to fills; the glass clears
 *   SLIDE     the glass follows the finger one to one, lifts and stretches,
 *             and the slot it is let go over is where the page goes
 *   KEYBOARD  the bar slides away while a field has the focus, and back
 *   STACK     a product page browsed from Storelib: the buy bar stands on
 *             the tab bar, both whole; on the open web the bar is not there
 *   ACCOUNT   /account (the profile's Overview) at 390 and 1280, nothing
 *             sideways; the Profile tab is a person icon, filled when you
 *             are on it, on Overview and on Settings
 *   DESKTOP   no bar at 1280, and no room left for one
 *
 * Pictures go to SHOTS_DIR (or a temp folder), and are meant to be looked at.
 *
 *   PROBE_CSS=source node scripts/check-buyer-tab-bar.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".buyer-tabs-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-buyer-tabs-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const URL_BASE = "https://storelib.com/__buyer_tabs_probe"

try {
  /* The router: a path the page can subscribe to, changed NAV_MS after a
     push, the way a page arrives after the press that asked for it. */
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
let path = window.__path || "/explore"
let search = window.__search || ""
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const go = (href) => { const [p, q] = href.split("?"); path = p; search = q ? "?" + q : ""; subs.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = {
  push: (h) => { log("push", h); setTimeout(() => go(h), window.__navMs ?? 140) },
  replace: (h) => { log("replace", h); go(h) },
  prefetch: (h) => log("prefetch", h),
  back: () => log("back"),
  refresh: () => log("refresh"),
}
window.__go = go
export const usePathname = () => useSyncExternalStore(subscribe, () => path, () => path)
export const useRouter = () => router
export const useSearchParams = () => { const s = useSyncExternalStore(subscribe, () => search, () => search); return new URLSearchParams(s) }
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-buyer-tab-bar.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.buyer-tabs-probe/navigation.js", "next/link": "./.buyer-tabs-probe/link.jsx", "next/image": "./.buyer-tabs-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1280, height: 800 }

  /** A page at `path`, signed in or not, with the page's own search. */
  const open = async (vp, path, { search = "", signedIn = false, seller = false } = {}) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(URL_BASE) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 404, body: "" })))
    const avatar = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f59e0b"/><circle cx="32" cy="26" r="12" fill="#7c2d12"/><rect x="12" y="42" width="40" height="22" rx="11" fill="#7c2d12"/></svg>`)
    await p.evaluateOnNewDocument((path, search, signedIn, seller, avatar) => {
      window.__path = path
      window.__search = search
      window.__signedIn = signedIn
      window.__seller = seller
      try {
        localStorage.setItem("storelib_consent", "x")
        if (signedIn) localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: avatar, displayName: "Alex Morgan", username: "alex", isSeller: seller }))
        else localStorage.removeItem("_sl_auth_v1")
      } catch {}
    }, path, search, signedIn, seller, avatar)
    await p.goto(URL_BASE + search, { waitUntil: "load" })
    await sleep(350)
    return { p, errors }
  }

  const barState = (p) => p.evaluate(() => {
    const bar = document.querySelector("[data-buyer-tab-bar]")
    if (!bar) return null
    const r = bar.getBoundingClientRect()
    const cs = getComputedStyle(bar)
    const tabs = [...bar.querySelectorAll("[data-buyer-tab]")]
    const lens = bar.querySelector("[data-buyer-tabs-lens]")
    const lr = lens.getBoundingClientRect()
    return {
      top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, left: r.left, width: r.width, height: Math.round(r.height * 10) / 10,
      display: cs.display, bg: cs.backgroundColor, shadow: cs.boxShadow !== "none",
      labels: tabs.map((t) => t.getAttribute("aria-label")),
      current: tabs.findIndex((t) => t.getAttribute("aria-current") === "page"),
      inks: tabs.map((t) => { const ink = t.querySelector('[data-part="ink"]'); return ink ? +getComputedStyle(ink).opacity : null }),
      slots: tabs.map((t) => { const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width } }),
      lens: { state: lens.getAttribute("data-buyer-tabs-lens"), cx: lr.left + lr.width / 2, w: lr.width, bg: getComputedStyle(lens).backgroundColor, scale: getComputedStyle(lens).scale, transform: getComputedStyle(lens).transform },
      html: document.documentElement.getAttribute("data-buyer-tabs"),
      h: (() => { const probe = document.createElement("div"); probe.style.cssText = "position:absolute;height:var(--buyer-tabs-h, 0px)"; document.body.appendChild(probe); const v = probe.getBoundingClientRect().height; probe.remove(); return v })(),
    }
  })
  const alpha = (rgba) => { const m = /rgba?\(([^)]+)\)/.exec(rgba || ""); if (!m) return 1; const parts = m[1].split(",").map((s) => +s.trim()); return parts.length === 4 ? parts[3] : 1 }
  const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 10, radiusY: 10, force: 1 }] })
  const shotBar = (p, name) => p.screenshot({ path: join(shots, name), clip: { x: 0, y: 844 - 120, width: 390, height: 120 } })

  /* ── BAR ─────────────────────────────────────────────────────────────── */
  console.log("\nphone 390, /explore, signed out")
  {
    const { p, errors } = await open(PHONE, "/explore")
    const s = await barState(p)
    expect(s && s.bottom === 844 && s.left === 0 && s.width === 390 && s.height === 56, "BAR: across the foot of the phone, full width, 56px", s && { top: s.top, bottom: s.bottom, width: s.width, height: s.height })
    expect(s.bg === "rgb(255, 255, 255)" && s.shadow, "white, with a shadow along its top", { bg: s.bg, shadow: s.shadow })
    expect(s.labels.join() === "Home,Search,Library,Log in", "Home, Search, Library, then Profile (Log in while signed out)", s.labels)
    expect(s.current === 0 && s.inks[0] === 1 && s.inks.slice(1, 3).every((o) => o === 0), "Home is the page you are on: its icon filled, the others line", { current: s.current, inks: s.inks })
    expect(s.lens.state === "clear" && alpha(s.lens.bg) === 0, "no glass at rest", s.lens)
    expect(s.html === "shown" && s.h === 56, "it tells the page how tall it is", { html: s.html, h: s.h })
    await shotBar(p, "phone-rest-explore.png")

    /* ── ROOM ── */
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(150)
    const room = await p.evaluate(() => ({ last: document.querySelector("[data-footer-last]").getBoundingClientRect().bottom, bar: document.querySelector("[data-buyer-tab-bar]").getBoundingClientRect().top, sideways: document.documentElement.scrollWidth - innerWidth }))
    expect(room.last <= room.bar, "ROOM: the last line of the page ends above the bar", room)
    expect(room.sideways <= 0, "nothing scrolls sideways", room.sideways)
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(100)

    /* ── PRESS ── */
    const cdp = await p.createCDPSession()
    const lib = s.slots[2]
    await p.evaluate(() => { window.__router = [] })
    await touch(cdp, "touchStart", lib.x + 9, lib.y)
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const down = await barState(p)
    const pulse = await p.evaluate(() => [...document.querySelectorAll('[data-buyer-tab="library"] *')].some((el) => el.getAnimations().some((a) => a.id === "tap")))
    await shotBar(p, "phone-press-library.png")
    await sleep(40)
    await touch(cdp, "touchEnd")
    expect(down.lens.state === "lit" && Math.abs(down.lens.cx - lib.x) < 1, "PRESS: the glass is under the finger on the slot it landed on, on its centre", { state: down.lens.state, off: Math.round((down.lens.cx - lib.x) * 100) / 100 })
    expect(pulse, "and the icon gives a little under it")
    await sleep(60)
    const mid = await barState(p)
    await shotBar(p, "phone-release-library.png")
    await sleep(500)
    const after = await barState(p)
    const log = await p.evaluate(() => window.__router)
    expect(log.some(([k, h]) => k === "push" && h === "/library"), "the press opens the library", log)
    expect(log.some(([k, h]) => k === "prefetch" && h === "/library"), "and asked for it the moment the finger landed", log.filter(([k]) => k === "prefetch"))
    expect(mid.lens.state === "clear" && alpha(mid.lens.bg) > 0.1, "let go, the glass clears over the ink's curve rather than vanishing", { alpha: alpha(mid.lens.bg) })
    expect(after.current === 2 && after.inks[2] === 1 && after.inks[0] === 0 && alpha(after.lens.bg) === 0, "the page arrives, Library fills, and the glass is gone", { current: after.current, inks: after.inks, alpha: alpha(after.lens.bg) })
    await shotBar(p, "phone-rest-library.png")

    /* ── SLIDE ── from Library across to Home, slowly, then let go on Search. */
    await p.evaluate(() => { window.__router = [] })
    const cpu = await p.createCDPSession()
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const a = after.slots[2], b = after.slots[0]
    await touch(cdp, "touchStart", a.x, a.y)
    const trail = []
    const steps = 22
    for (let i = 1; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps
      await touch(cdp, "touchMove", x, a.y)
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const st = await barState(p)
      trail.push({ finger: x, lens: st.lens.cx, scale: st.lens.scale, transform: st.lens.transform, state: st.lens.state })
      if (i === 8 || i === 15) await shotBar(p, `phone-slide-${i}.png`)
    }
    const settled = trail.slice(8)
    const worst = Math.max(...settled.map((t) => Math.abs(t.lens - t.finger)))
    expect(settled.every((t) => t.state === "lit") && worst < 3, "SLIDE: the glass follows the finger, within 3px once it has picked it up", { worst: Math.round(worst * 10) / 10 })
    expect(trail.some((t) => t.scale === "1.04"), "and lifts while it is held", [...new Set(trail.map((t) => t.scale))])
    expect(trail.some((t) => /matrix\(1\.0[1-9]/.test(t.transform)), "and stretches along the way it moves", trail.slice(3, 6).map((t) => t.transform))
    /* Back to Search and let go there. */
    const c = after.slots[1]
    for (let i = 1; i <= 8; i++) {
      await touch(cdp, "touchMove", b.x + ((c.x - b.x) * i) / 8, a.y)
      await sleep(16)
    }
    await sleep(120)
    await touch(cdp, "touchEnd")
    await cpu.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await sleep(700)
    const slideLog = await p.evaluate(() => window.__router)
    const opened = await p.evaluate(() => ({
      overlay: document.querySelector("[data-search-overlay]")?.getAttribute("data-search-overlay"),
      focused: document.activeElement?.hasAttribute("data-search-screen-field") ?? false,
      locked: getComputedStyle(document.documentElement).overflow,
      entry: !!(history.state && history.state.storelibSearch),
    }))
    expect(opened.overlay === "open" && !slideLog.some(([k]) => k === "push" || k === "link"), "let go over Search, and the search screen opens over the page (no route, and nothing under the bar is clicked)", { opened, slideLog })

    /* ── KEYBOARD ── the field has the focus from the press itself. */
    await sleep(350)
    const away = await barState(p)
    expect(opened.focused, "the search screen's field has the focus as it opens", opened)
    expect(opened.locked === "hidden" && opened.entry, "the page under it holds still, and it has a history entry of its own", opened)
    expect(away.top >= 844 && away.html === "away", "KEYBOARD: while it does, the bar has slid away", { top: away.top, html: away.html })
    await p.screenshot({ path: join(shots, "phone-search-focused.png") })
    /* The X: Back pops the screen's entry and the screen goes. */
    await p.evaluate(() => document.querySelector("[data-search-close]").click())
    await sleep(500)
    const shut = await p.evaluate(() => ({
      overlay: document.querySelector("[data-search-overlay]")?.getAttribute("data-search-overlay"),
      visibility: getComputedStyle(document.querySelector("[data-search-overlay]")).visibility,
      locked: document.documentElement.style.overflow,
      entry: !!(history.state && history.state.storelibSearch),
    }))
    expect(shut.overlay === "closed" && shut.visibility === "hidden" && shut.locked === "" && !shut.entry, "the X closes it, lets the page go and takes its entry back", shut)
    const back = await barState(p)
    expect(back.bottom === 844 && back.html === "shown" && back.current === 2, "and the bar comes back, still on Library", { bottom: back.bottom, current: back.current })
    await p.screenshot({ path: join(shots, "phone-search-closed.png") })
    /* A tap on Search: no mouse click follows onto whatever the screen has there. */
    await p.evaluate(() => { window.__router = []; window.__ev = []; for (const t of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "focusin", "focusout", "touchstart", "touchend"]) document.addEventListener(t, (e) => window.__ev.push(`${t}:${e.target.tagName}${e.target.getAttribute?.("data-buyer-tab") ?? ""}${e.target.hasAttribute?.("data-buyer-tab-bar") ? "#bar" : ""}${e.target.closest?.("[data-buyer-tab-bar]") ? "@in" : "@out"}`), true) })
    await touch(cdp, "touchStart", back.slots[1].x, back.slots[1].y)
    await sleep(50)
    await touch(cdp, "touchEnd")
    await sleep(100)
    const events = await p.evaluate(() => window.__ev)
    expect(!events.some((e) => /^(mousedown|click)/.test(e)), "a tap on Search: no mouse click follows onto the screen it opened", events)
    const again = await p.evaluate(() => ({ pushes: (window.__router || []).filter(([k]) => k === "push").length, focused: document.activeElement?.hasAttribute("data-search-screen-field") ?? false, overlay: document.querySelector("[data-search-overlay]")?.getAttribute("data-search-overlay") }))
    expect(again.pushes === 0 && again.focused && again.overlay === "open", "and it opens again with the field focused", again)
    /* Back (Android's, the browser's) closes it too. */
    await p.evaluate(() => history.back())
    await sleep(450)
    const popped = await p.evaluate(() => document.querySelector("[data-search-overlay]")?.getAttribute("data-search-overlay"))
    expect(popped === "closed", "Back closes it", popped)
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── ACCOUNT ─────────────────────────────────────────────────────────── */
  console.log("\nphone 390, /account, signed in")
  {
    const { p, errors } = await open(PHONE, "/account", { signedIn: true })
    await sleep(400)
    const s = await barState(p)
    const prof = await p.evaluate(() => {
      const tab = document.querySelector('[data-buyer-tab="profile"]')
      const ink = tab.querySelector('[data-part="ink"]')
      return { img: !!tab.querySelector("img"), ink: ink ? +getComputedStyle(ink).opacity : null, label: tab.getAttribute("aria-label") }
    })
    expect(s.current === 3 && prof.label === "Profile" && prof.ink === 1, "the Profile tab is on: the person filled", { current: s.current, ...prof })
    expect(!prof.img, "and it is a person icon, not the photo (the photo is in the header)", prof)
    await shotBar(p, "phone-rest-account.png")
    const page = await p.evaluate(() => ({
      cards: [...document.querySelectorAll("[data-account-card]")].map((c) => c.getAttribute("data-account-card")),
      sideways: document.documentElement.scrollWidth - innerWidth,
      h1: document.querySelector("h1")?.textContent,
      tabs: [...document.querySelectorAll("[data-account-tab]")].map((t) => `${t.getAttribute("data-account-tab")}${t.getAttribute("aria-current") ? "*" : ""}`),
      facts: [...document.querySelectorAll("[data-account-fact]")].map((r) => r.getAttribute("data-account-fact")),
      fields: document.querySelectorAll("[data-account-hub] input").length,
      sell: !!document.querySelector('a[href="/sell"]'),
      smallTargets: [...document.querySelectorAll("[data-account-hub] button, [data-account-hub] a")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 }).map((el) => `${el.textContent.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().height)}`),
    }))
    expect(page.h1 === "Alex Morgan" && page.tabs.join() === "overview*,settings", "ACCOUNT: a profile, headed by the person, on Overview", { h1: page.h1, tabs: page.tabs })
    expect(page.cards.join() === "library,recent,selling" && page.fields === 0, "the library in facts, recent purchases, selling; nothing to type", page)
    expect(page.facts.join() === "purchases,courses,memberships,reviews,wishlist" && page.sell, "purchases, courses, memberships, reviews, wishlist, and Become a seller", page.facts)
    expect(page.sideways <= 0, "nothing scrolls sideways at 390", page.sideways)
    expect(page.smallTargets.length === 0, "every control is a thumb's size", page.smallTargets)
    await p.screenshot({ path: join(shots, "account-390.png"), fullPage: true })
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(150)
    const room = await p.evaluate(() => ({ last: document.querySelector("[data-footer-last]").getBoundingClientRect().bottom, bar: document.querySelector("[data-buyer-tab-bar]").getBoundingClientRect().top }))
    expect(room.last <= room.bar, "the account page ends above the bar too", room)
    /* The name field is a field, on Settings: the bar gets out of its way. */
    await p.evaluate(() => window.__go("/account/settings"))
    await sleep(300)
    const onSettings = await barState(p)
    expect(onSettings.current === 3, "Settings is still the Profile tab", onSettings.current)
    await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector("[data-account-name]").focus() })
    await sleep(400)
    const typing = await barState(p)
    expect(typing.top >= 844, "typing a name, the bar is out of the way", typing.top)
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── STACK ───────────────────────────────────────────────────────────── */
  console.log("\nphone 390, a product page")
  {
    const { p, errors } = await open(PHONE, "/maria/preset-pack", { search: "?layout=discover" })
    const s = await barState(p)
    expect(!!s && s.current === 0, "browsed from Storelib, the bar is there, on Home", s && { current: s.current })
    await p.evaluate(() => window.scrollTo(0, 1100))
    await sleep(800)
    const stack = await p.evaluate(() => {
      const buy = document.querySelector('[class*="fixed bottom-0 left-0 right-0 z-50"]')
      const b = buy.getBoundingClientRect(), t = document.querySelector("[data-buyer-tab-bar]").getBoundingClientRect()
      return { buyTop: Math.round(b.top), buyBottom: Math.round(b.bottom * 10) / 10, tabsTop: Math.round(t.top * 10) / 10, opacity: getComputedStyle(buy).opacity }
    })
    expect(stack.opacity === "1" && Math.abs(stack.buyBottom - stack.tabsTop) < 0.6, "STACK: the buy bar stands on the tab bar, both whole", stack)
    await p.screenshot({ path: join(shots, "phone-product-stack.png"), clip: { x: 0, y: (await p.evaluate(() => scrollY)) + 844 - 200, width: 390, height: 200 } })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }
  {
    const { p } = await open(PHONE, "/maria/preset-pack")
    const s = await barState(p)
    await p.evaluate(() => window.scrollTo(0, 1100))
    await sleep(800)
    const buy = await p.evaluate(() => Math.round(document.querySelector('[class*="fixed bottom-0 left-0 right-0 z-50"]').getBoundingClientRect().bottom))
    expect(s === null && buy === 844, "on the open web the same page is the creator's: no bar, and the buy bar at the foot", { bar: s, buy })
    await p.close()
  }
  for (const path of ["/checkout", "/app", "/"]) {
    const { p } = await open(PHONE, path)
    expect((await barState(p)) === null, `not on ${path}`)
    await p.close()
  }

  /* ── DESKTOP ─────────────────────────────────────────────────────────── */
  console.log("\ndesktop 1280")
  {
    const { p, errors } = await open(DESK, "/account", { signedIn: true, seller: true })
    const d = await p.evaluate(() => ({
      display: getComputedStyle(document.querySelector("[data-buyer-tab-bar]")).display,
      room: document.querySelector("[data-buyer-tabs-room]").getBoundingClientRect().height,
      h: getComputedStyle(document.documentElement).getPropertyValue("--buyer-tabs-h").trim(),
      width: Math.round(document.querySelector("[data-probe-account-column]").getBoundingClientRect().width),
      dashboard: !!document.querySelector('a[href="/app"]'),
      sideways: document.documentElement.scrollWidth - innerWidth,
    }))
    expect(d.display === "none" && d.room === 0 && d.h === "", "DESKTOP: no bar, no room left for one", d)
    expect(d.width === 720 && d.sideways <= 0, "the profile is one 720px column", d.width)
    expect(d.dashboard, "a seller gets Dashboard where a buyer gets Become a seller")
    await p.screenshot({ path: join(shots, "account-1280.png"), fullPage: true })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
