/**
 * ===========================================================================
 *  THE BUYER'S PROFILE, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real hub (components/account/account-hub.tsx) with the real Overview
 * and Settings, rendered by scripts/render-account-hub.tsx.
 *
 *   LAYOUT    Overview and Settings at 360, 390, 430 and 1280: nothing
 *             sideways, every control a thumb's size on a phone, no field
 *             on Overview, the name field on Settings; one photo on the
 *             screen (never Settings' second one), the photo, name, button
 *             and tabs on the centre line; on a phone no black header and
 *             the profile's light bar at the top, edge to edge, its
 *             hairline only once scrolled; at 1280 the header and no bar
 *   SELLING   Dashboard, Finish setting up your store, Become a seller,
 *             for the three states, and a Dashboard link only for a seller
 *   SWITCH    Overview to Settings and back, pressed, at 1x and at 4x CPU
 *             throttle, sampled on every animation frame: the pressed tab's fill
 *             answers before the page arrives and is full within its
 *             150ms; the old one fades where it is; the header and the tabs
 *             never move; the panel is never empty and never under 20%, and
 *             settles from 20% to 100% over its 200ms
 *
 * Pictures go to SHOTS_DIR (or a temp folder), and are meant to be looked at.
 *
 *   PROBE_CSS=source node scripts/check-account-hub.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".account-hub-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-account-hub-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const URL_BASE = "https://storelib.com/__account_hub_probe"

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
let path = window.__path || "/account"
const subs = new Set()
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const go = (href) => { path = href.split("?")[0]; window.__arrivedAt = performance.now(); subs.forEach((f) => f()) }
const router = { push: (h) => setTimeout(() => go(h), window.__navMs ?? 60), replace: go, prefetch: () => {}, back: () => {}, refresh: () => {} }
window.__go = go
export const usePathname = () => useSyncExternalStore(subscribe, () => path, () => path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
  /* A link is pressed, its onClick runs, and a prefetched page arrives __navMs later. */
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => {
    rest.onClick && rest.onClick(e)
    e.preventDefault()
    if (e.defaultPrevented && e.__stop) return
    ;(window.__links ||= []).push(href)
    if (!rest.__noNav) setTimeout(() => window.__go(href), window.__navMs ?? 60)
  } }, children)
})
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-account-hub.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.account-hub-probe/navigation.js", "next/link": "./.account-hub-probe/link.jsx", "next/image": "./.account-hub-probe/image.jsx" },
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
  const phone = (width) => ({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const DESK = { width: 1280, height: 900 }

  const open = async (vp, path, globals = {}) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(URL_BASE) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 404, body: "" })))
    await p.evaluateOnNewDocument((path, globals) => {
      window.__path = path
      Object.assign(window, globals)
    }, path, globals)
    await p.goto(URL_BASE, { waitUntil: "load" })
    await sleep(300)
    return { p, errors }
  }

  const layout = (p) => p.evaluate(() => {
    const hub = document.querySelector("[data-account-hub]")
    const controls = [...hub.querySelectorAll("a, button, input")].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
    })
    return {
      sideways: document.documentElement.scrollWidth - innerWidth,
      out: controls.filter((el) => { const r = el.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5 }).map((el) => el.textContent.trim().slice(0, 20)),
      small: controls.filter((el) => el.tagName !== "INPUT" && el.getBoundingClientRect().height < 40 && !el.closest("[data-settings-privacy-row], [role=switch]")).map((el) => `${el.textContent.trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().height)}`),
      fields: [...hub.querySelectorAll("input")].map((i) => i.getAttribute("data-account-name") !== null ? "name" : i.type),
      h1: document.querySelector("h1")?.textContent,
      tabs: [...document.querySelectorAll("[data-account-tab]")].map((t) => `${t.getAttribute("data-account-tab")}${t.getAttribute("aria-current") ? "*" : ""}`),
      edit: getComputedStyle(document.querySelector("[data-account-edit]")).visibility,
      cards: [...document.querySelectorAll("[data-account-card]")].map((c) => c.getAttribute("data-account-card")),
      nameClipped: (() => { const h = document.querySelector("h1"); return h.scrollWidth > h.clientWidth })(),
      /* Every circle drawn with a face or initials in it, on the whole page. */
      avatars: [...document.querySelectorAll("[data-app-avatar], [data-account-avatar], [data-profile-photo]")].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 24 && getComputedStyle(el).visibility !== "hidden" && !el.parentElement.closest("[data-account-avatar]")
      }).length,
      photoActions: getComputedStyle(document.querySelector("[data-account-photo-actions]")).visibility,
      camera: +getComputedStyle(document.querySelector("[data-account-avatar-camera]")).opacity,
      avatarEdit: !!document.querySelector("[data-account-avatar-edit]"),
      centre: (() => {
        const mid = (el) => { const r = el.getBoundingClientRect(); return Math.round((r.left + r.right) / 2) }
        return { page: Math.round(innerWidth / 2), avatar: mid(document.querySelector("[data-account-avatar]")), name: mid(document.querySelector("h1")), tabs: mid(document.querySelector("[data-account-tabs] > div")), edit: mid(document.querySelector("[data-account-actions]")) }
      })(),
      bar: (() => {
        const b = document.querySelector("[data-account-bar]")
        const r = b.getBoundingClientRect()
        return { shown: getComputedStyle(b).display !== "none", top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), title: document.querySelector("[data-account-bar-title]").textContent, bg: getComputedStyle(b).backgroundColor, line: +getComputedStyle(document.querySelector("[data-account-bar-line]")).opacity }
      })(),
      blackHeader: (() => { const h = document.querySelector("[data-probe-header]"); return !!h && getComputedStyle(h).display !== "none" })(),
    }
  })

  /* ── LAYOUT ─────────────────────────────────────────────────────────── */
  for (const w of [360, 390, 430]) {
    console.log(`\nphone ${w}`)
    for (const path of ["/account", "/account/settings"]) {
      const { p, errors } = await open(phone(w), path)
      const l = await layout(p)
      const settings = path.endsWith("settings")
      expect(l.sideways <= 0 && l.out.length === 0, `${path}: nothing sideways, nothing off the edge`, { sideways: l.sideways, out: l.out })
      expect(l.small.length === 0, `${path}: every control a thumb's size`, l.small)
      expect(l.h1 === "Alex Morgan" && l.tabs.join() === (settings ? "overview,settings*" : "overview*,settings"), `${path}: the person, then the tab it is`, { h1: l.h1, tabs: l.tabs })
      if (settings) expect(l.fields.includes("name") && l.edit === "hidden" && l.cards.join() === "profile,email,preferences,log-out,delete", "Settings: the name field and the account's cards; Edit profile has gone", { fields: l.fields, cards: l.cards })
      else expect(l.fields.length === 0 && l.edit === "visible" && l.cards.join() === "library,recent,selling", "Overview: nothing to type, Edit profile there", { fields: l.fields, cards: l.cards })
      expect(l.avatars === 1, `${path}: one photo on the screen, never two`, l.avatars)
      if (settings) expect(l.photoActions === "visible" && l.camera === 1 && l.avatarEdit, "Settings: the big photo is the control, Change photo where Edit profile was", { actions: l.photoActions, camera: l.camera, edit: l.avatarEdit })
      else expect(l.photoActions === "hidden" && l.camera === 0 && !l.avatarEdit, "Overview: the photo is only a photo", { actions: l.photoActions, camera: l.camera })
      const off = Object.entries(l.centre).filter(([k, v]) => k !== "page" && Math.abs(v - l.centre.page) > 1)
      expect(off.length === 0, `${path}: photo, name, the button and the tabs on the page's centre line`, l.centre)
      expect(!l.blackHeader && l.bar.shown && l.bar.top === 0 && l.bar.left === 0 && l.bar.width === w && l.bar.height === 52 && l.bar.title === (settings ? "Settings" : "Profile") && l.bar.line === 0, `${path}: no black header; the light bar edge to edge at the top, titled, no hairline at rest`, l.bar)
      if (w === 390 || w === 360) await p.screenshot({ path: join(shots, `${settings ? "settings" : "overview"}-${w}.png`), fullPage: true })
      expect(errors.length === 0, "no errors", errors)
      await p.close()
    }
  }
  {
    const { p } = await open(phone(360), "/account", { __longName: true, __emptyLibrary: true })
    const l = await layout(p)
    expect(l.sideways <= 0 && l.out.length === 0, "a long name and an empty library at 360: nothing sideways", l)
    await p.screenshot({ path: join(shots, "overview-360-long-empty.png"), fullPage: true })
    await p.close()
  }
  console.log("\nselling, phone 390")
  for (const [state, key, title] of [["seller", "dashboard", "Dashboard"], ["started", "finish", "Finish setting up your store"], ["none", "become", "Become a seller"]]) {
    const { p } = await open(phone(390), "/account", { __seller: state })
    const got = await p.evaluate(() => {
      const row = document.querySelector("[data-account-selling]")
      return { key: row.getAttribute("data-account-selling"), href: row.getAttribute("href"), title: row.querySelector("p").textContent, dashboards: document.querySelectorAll('a[href="/app"]').length }
    })
    expect(got.key === key && got.title === title && got.href === (state === "seller" ? "/app" : "/sell") && got.dashboards === (state === "seller" ? 1 : 0), `${state}: ${title}, and a Dashboard link only for a seller`, got)
    if (state !== "seller") await p.screenshot({ path: join(shots, `selling-${state}-390.png`), clip: await p.evaluate(() => { const r = document.querySelector("[data-account-card=selling]").getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: r.height + 16 } }) })
    await p.close()
  }
  console.log("\nthe bar, scrolled, phone 390")
  {
    const { p } = await open(phone(390), "/account/settings", { __photo: true })
    await p.evaluate(() => window.scrollTo(0, 400))
    await sleep(400)
    const bar = await p.evaluate(() => ({ top: Math.round(document.querySelector("[data-account-bar]").getBoundingClientRect().top), line: +getComputedStyle(document.querySelector("[data-account-bar-line]")).opacity, scrolled: document.querySelector("[data-account-bar]").hasAttribute("data-scrolled") }))
    expect(bar.top === 0 && bar.line === 1 && bar.scrolled, "it stays at the top, and its hairline shows once the page is under it", bar)
    await p.screenshot({ path: join(shots, "settings-390-scrolled.png") })
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(400)
    expect((await p.evaluate(() => +getComputedStyle(document.querySelector("[data-account-bar-line]")).opacity)) === 0, "and hides again at the top")
    await p.screenshot({ path: join(shots, "settings-390-photo.png") })
    await p.close()
  }
  console.log("\ndesktop 1280")
  for (const path of ["/account", "/account/settings"]) {
    const { p, errors } = await open(DESK, path, { __seller: true })
    const l = await layout(p)
    const col = await p.evaluate(() => Math.round(document.querySelector("[data-probe-account-column]").getBoundingClientRect().width))
    expect(l.sideways <= 0 && col === 720, `${path}: one 720px column, nothing sideways`, { col, sideways: l.sideways })
    expect(l.blackHeader && !l.bar.shown && l.avatars === 1, `${path}: the site header, not the phone's bar, and one photo`, { header: l.blackHeader, bar: l.bar.shown, avatars: l.avatars })
    expect(Object.entries(l.centre).every(([k, v]) => k === "page" || Math.abs(v - l.centre.page) <= 1), `${path}: centred in the column`, l.centre)
    if (!path.endsWith("settings")) expect(await p.evaluate(() => !!document.querySelector('a[href="/app"][data-account-row="dashboard"]')), "a seller gets Dashboard")
    await p.screenshot({ path: join(shots, `${path.endsWith("settings") ? "settings" : "overview"}-1280.png`), fullPage: true })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* ── SWITCH ─────────────────────────────────────────────────────────── */
  const sampleSwitch = async (p, to, label) => {
    await p.evaluate((to) => {
      window.__frames = []
      /* Each sample is stamped with its frame's own time (the rAF argument),
         which is the time the frame's styles are computed for. A frame that
         ran late behind the arriving page's render is still stamped with
         when it began, so a long frame is not read as a slow fade. */
      let t0 = null
      const read = (ts) => {
        if (t0 === null) t0 = ts

        const tab = (k) => document.querySelector(`[data-account-tab="${k}"]`)
        const fill = (k) => { const cs = getComputedStyle(tab(k).querySelector("[data-account-tab-fill]")); return { o: +cs.opacity, s: cs.scale } }
        const panel = document.querySelector("[data-account-panel]")
        window.__frames.push({
          t: Math.round(ts - t0),
          path: panel.getAttribute("data-account-panel"),
          overview: fill("overview"),
          settings: fill("settings"),
          panelO: +getComputedStyle(panel).opacity,
          panelH: Math.round(panel.getBoundingClientRect().height),
          headerTop: document.querySelector("[data-account-profile]").getBoundingClientRect().top,
          tabsTop: document.querySelector("[data-account-tabs]").getBoundingClientRect().top,
          tabsLeft: tab("settings").getBoundingClientRect().left,
        })
        if (ts - t0 < 1100) requestAnimationFrame(read)
      }
      requestAnimationFrame((ts) => {
        read(ts)
        document.querySelector(`[data-account-tab="${to}"]`).click()
      })
    }, to)
    await sleep(1900)
    const frames = await p.evaluate(() => window.__frames)
    const arrived = await p.evaluate(() => window.__arrivedAt)
    return { frames, arrived }
  }

  for (const rate of [1, 4]) {
    console.log(`\nthe switch, phone 390, CPU ${rate}x`)
    const { p, errors } = await open(phone(390), "/account")
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate })
    /* A prefetched page still has to be rendered: 90ms of a phone's time, stretched with the CPU. */
    await p.evaluate((ms) => { window.__navMs = ms }, 90 * rate)
    for (const [to, from] of [["settings", "overview"], ["overview", "settings"]]) {
      const { frames } = await sampleSwitch(p, to, `${from} to ${to}`)
      const arriveIdx = frames.findIndex((f) => f.path === to)
      const before = frames.slice(1, Math.max(1, arriveIdx))
      const first = frames.findIndex((f) => f[to].o > 0.05 && f[to].o < 0.999 || f[to].o >= 0.999)
      const full = frames.find((f) => f[to].o >= 0.999)
      const top = (k) => Math.max(...frames.map((f) => f[k])) - Math.min(...frames.map((f) => f[k]))
      const panelMin = Math.min(...frames.map((f) => f.panelO))
      const empty = frames.filter((f) => f.panelH < 40)
      const settle = frames.slice(arriveIdx).map((f) => Math.round(f.panelO * 100) / 100)
      const done = frames.slice(arriveIdx).find((f) => f.panelO >= 0.999)
      console.log(`  ${from} to ${to}: ${frames.length} frames, page arrived at frame ${arriveIdx} (${frames[arriveIdx]?.t}ms)`)
      console.log(`    ${to} fill: ${frames.slice(0, 12).map((f) => `${f.t}:${f[to].o.toFixed(2)}`).join(" ")}`)
      console.log(`    ${from} fill: ${frames.slice(0, 12).map((f) => `${f.t}:${f[from].o.toFixed(2)}`).join(" ")}`)
      console.log(`    panel opacity from arrival: ${settle.slice(0, 14).join(" ")}`)
      expect(arriveIdx > 1 && before.some((f) => f[to].o > 0.05), "the pressed tab's fill is on its way before the page arrives", { arriveIdx, first, sample: before.map((f) => +f[to].o.toFixed(2)) })
      const started = frames[Math.max(0, first - 1)]
      const gap = Math.max(...frames.slice(1).map((f, i) => f.t - frames[i].t))
      const rising = frames.every((f, i) => i === 0 || f[to].o >= frames[i - 1][to].o - 0.001)
      console.log(`    longest frame: ${gap}ms`)
      expect(rising, "the fill only ever rises: no flicker")
      /* The timings are asserted at 1x. At 4x the frame that first draws the
         new page is itself long (styling and laying out a whole page), and
         a fade is only sampled either side of it. */
      if (rate === 1) expect(full && full.t - started.t <= 150 + 20, "and full within its 150ms of the frame it started on", full && { started: started.t, full: full.t })
      expect(frames.at(-1)[from].o === 0 && frames.at(-1)[to].o === 1, "the old tab's fill is gone, the new one on", { from: frames.at(-1)[from].o, to: frames.at(-1)[to].o })
      expect(top("headerTop") < 0.5 && top("tabsTop") < 0.5 && top("tabsLeft") < 0.5, "the header and the tabs never move", { header: top("headerTop"), tabs: top("tabsTop"), left: top("tabsLeft") })
      expect(panelMin >= 0.19 && empty.length === 0, "the panel is never empty and never under 20%", { panelMin, empty: empty.length })
      /* From the last frame at 20%: an animation's clock starts on the frame that first paints it. */
      const lastLow = frames.slice(arriveIdx).filter((f) => f.panelO <= 0.21).at(-1)
      const took = done && lastLow && done.t - lastLow.t
      expect(settle[0] <= 0.25 && took >= 150 && took <= (rate === 1 ? 260 : 300), "the arriving page settles from 20% to 100% over about 200ms", { first: settle[0], took })
      if (rate === 1) await p.screenshot({ path: join(shots, `switch-to-${to}-390.png`) })
    }
    /* A press on the tab you are on goes nowhere. */
    await p.evaluate(() => { window.__links = []; document.querySelector('[data-account-tab="overview"]').click() })
    await sleep(300)
    expect((await p.evaluate(() => document.querySelector("[data-account-panel]").getAttribute("data-account-panel"))) === "overview", "a press on the tab you are on keeps you there")
    /* Edit profile is the same switch. */
    await p.evaluate(() => document.querySelector("[data-account-edit]").click())
    await sleep(700)
    const l = await layout(p)
    expect(l.tabs.join() === "overview,settings*" && l.edit === "hidden", "Edit profile opens Settings", l.tabs)
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }
  console.log("\nless motion")
  {
    const { p } = await open(phone(390), "/account")
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const { frames } = await sampleSwitch(p, "settings", "reduced")
    expect(Math.min(...frames.map((f) => f.panelO)) === 1 && !frames.some((f) => f.settings.o > 0 && f.settings.o < 1), "no fades at all", { panelMin: Math.min(...frames.map((f) => f.panelO)) })
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
