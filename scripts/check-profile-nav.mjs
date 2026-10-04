/**
 * ===========================================================================
 *  OPENING A PROFILE AND GOING BACK, FRAME BY FRAME
 * ===========================================================================
 * "Opening a user profile page and going back feels smooth (the page lands
 * cleanly, no jump, the avatar/cover appear without popping); the back icon
 * next to the avatar in the profile top bar is smooth and works on the
 * first tap." The real skeleton and profile (scripts/render-profile-nav.tsx)
 * on a 390x844 phone, a finger, the CPU slowed four times, the cover and
 * photo from a host that answers 450ms late:
 *
 *   OPEN       tap a name in a scrolled feed; the profile's skeleton holds
 *              the page's shape (with the bar the profile opens with), and
 *              when the profile lands its photo and name are where the
 *              skeleton had them (no jump), and they stay put on every
 *              frame after
 *   NO POP     the cover is clear until it has loaded and then fades in
 *              over several frames; the photo the same (components/app/
 *              app-avatar)
 *   BACK       the chevron answers the first tap; a double tap goes back
 *              once; the feed is back on the next frames at the scroll it
 *              was left at
 *
 * A filmstrip of the open and the back goes to SHOTS_DIR.
 *
 *   PROBE_CSS=source node scripts/check-profile-nav.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".profile-nav-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-profile-nav-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const frames = (p, n = 2) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

const FACE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><rect width="128" height="128" fill="#c9b8a6"/><circle cx="64" cy="52" r="24" fill="#f3ebe2"/><rect x="28" y="86" width="72" height="44" rx="22" fill="#f3ebe2"/></svg>`
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 600" width="1600" height="600"><rect width="1600" height="600" fill="#cfdbd5"/><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/></svg>`
const IMAGE_DELAY_MS = 450

/* In the page: one sample per frame of what could jump or pop. */
const SAMPLER = () => {
  const samples = []
  let on = true
  const tick = () => {
    const sk = document.querySelector("[aria-label='Loading profile']")
    const prof = document.querySelector("[data-member-profile]")
    const feed = document.querySelector("[data-probe-feed]")
    let s = { t: performance.now(), at: feed ? "feed" : sk ? "skeleton" : prof ? "profile" : "none", y: Math.round(scrollY) }
    if (sk) {
      const av = sk.querySelector("span.rounded-full")
      s.avatarTop = Math.round(av.getBoundingClientRect().top)
      s.shown = Number(getComputedStyle(sk.querySelector(".skeleton-deferred")).opacity)
    }
    if (prof) {
      const av = document.querySelector("[data-profile-header] [class*='ring-2']")
      const name = document.querySelector("[data-profile-name]")
      const cover = document.querySelector("[data-profile-cover-image]")
      const shell = document.querySelector(".library-content-enter")
      s.avatarTop = av ? Math.round(av.getBoundingClientRect().top) : null
      s.nameTop = name ? Math.round(name.getBoundingClientRect().top) : null
      s.cover = cover ? Number(getComputedStyle(cover).opacity) : null
      s.page = shell ? Number(getComputedStyle(shell).opacity) : 1
      const photo = document.querySelector("[data-profile-header] img")
      s.photo = photo ? Number(getComputedStyle(photo).opacity) : null
    }
    samples.push(s)
    if (on) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__nav = { samples, stop: () => { on = false } }
}

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => location.pathname\nexport const useRouter = () => ({ push: (h) => (window.__pushes ||= []).push(h), replace() {}, prefetch() {}, back() {}, refresh() {} })\nexport const useSearchParams = () => new URLSearchParams("")\nexport const redirect = () => {}\nexport const notFound = () => {}\n`)
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })\n`,
  )
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-profile-nav.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.profile-nav-probe/navigation.js", "next/link": "./.profile-nav-probe/link.jsx", "next/image": "./.profile-nav-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })

  const open = async () => {
    const p = await browser.newPage()
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (req) => {
      const url = req.url()
      if (url.startsWith("https://probe.test/")) return req.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("https://img.test/")) {
        const body = url.includes("cover") ? COVER : FACE
        return void setTimeout(() => req.respond({ status: 200, contentType: "image/svg+xml", body }).catch(() => {}), IMAGE_DELAY_MS)
      }
      return req.continue()
    })
    await p.goto("https://probe.test/index.html?wait=600", { waitUntil: "load" })
    await frames(p, 3)
    const cdp = await p.createCDPSession()
    return { p, errors, cdp }
  }
  const tapAt = async (cdp, pt) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pt.x, y: pt.y }] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }
  const centreOf = (p, sel) => p.evaluate((sel) => { const r = [...document.querySelectorAll(sel)].find((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.top >= 0 && b.bottom <= innerHeight }).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)

  /* ── The measured run ─────────────────────────────────────────────── */
  console.log("\nphone-390, a finger, CPU slowed 4x: open a profile from a scrolled feed, then back")
  {
    const { p, errors, cdp } = await open()
    await p.evaluate(() => window.scrollTo(0, 600))
    await frames(p, 3)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await p.evaluate(SAMPLER)
    await tapAt(cdp, await centreOf(p, "[data-probe-open]"))
    await wait(600 + 1800)
    const open1 = await p.evaluate(() => { window.__nav.stop(); return window.__nav.samples })
    const sk = open1.filter((s) => s.at === "skeleton")
    const pr = open1.filter((s) => s.at === "profile")
    const skShown = sk.filter((s) => s.shown > 0.5)
    expect(sk.length > 0 && pr.length > 0 && errors.length === 0, "the skeleton, then the profile, no errors", { skeleton: sk.length, profile: pr.length, errors })
    const skTop = skShown.length ? skShown[skShown.length - 1].avatarTop : sk[sk.length - 1]?.avatarTop
    const prTops = [...new Set(pr.map((s) => s.avatarTop).filter((v) => v !== null))]
    expect(skShown.length > 0 && prTops.length === 1 && Math.abs(prTops[0] - skTop) <= 1, "no jump: the photo lands where the skeleton held it (the bar included), and stays there on every frame", { skeleton: skTop, profile: prTops })
    const names = [...new Set(pr.map((s) => s.nameTop).filter((v) => v !== null))]
    expect(names.length === 1, "  the name holds still on every frame too", names)
    const covers = pr.map((s) => s.cover).filter((v) => v !== null)
    const mid = covers.filter((v) => v > 0.02 && v < 0.98)
    expect(covers[0] === 0 && covers[covers.length - 1] === 1 && mid.length >= 3, "no pop: the cover is clear until it loads, then fades in over several frames", { first: covers[0], last: covers[covers.length - 1], between: mid.length })
    const photos = pr.map((s) => s.photo).filter((v) => v !== null)
    const pmid = photos.filter((v) => v > 0.02 && v < 0.98)
    expect(photos[photos.length - 1] === 1 && (photos[0] === 1 || pmid.length >= 2), "  and the photo fades in too", { first: photos[0], last: photos[photos.length - 1], between: pmid.length })
    const pages = pr.map((s) => s.page)
    expect(pages[pages.length - 1] === 1 && pages.filter((v) => v > 0.02 && v < 0.98).length >= 2, "the page lands with a short fade, not a cut", { first: pages[0], between: pages.filter((v) => v > 0.02 && v < 0.98).length })

    /* Back: a double tap on the chevron. */
    await p.evaluate(SAMPLER)
    const chev = await centreOf(p, "[data-profile-back-button]")
    const t0 = await p.evaluate(() => performance.now())
    /*
      A double tap: the second press reaches the chevron before the feed is
      back (a later one lands on the feed, which is the page's business, not
      the chevron's). A real tap, then a press on the same chevron at once.
    */
    await p.evaluate(() => {
      window.__second = false
      const again = (e) => {
        const b = e.target.closest?.("[data-profile-back-button]")
        if (!b) return
        document.removeEventListener("click", again, true)
        setTimeout(() => { window.__second = b.isConnected; b.click() }, 0)
      }
      document.addEventListener("click", again, true)
    })
    await tapAt(cdp, chev)
    await wait(1400)
    const second = await p.evaluate(() => window.__second)
    const back = await p.evaluate(() => { window.__nav.stop(); return { samples: window.__nav.samples, pops: window.__pops || 0, pushes: window.__pushes || [], y: Math.round(scrollY), feed: !!document.querySelector("[data-probe-feed]") } })
    const firstFeed = back.samples.find((s) => s.at === "feed")
    if (process.env.NAV_DEBUG) console.log(JSON.stringify(back.samples.map((s) => [Math.round(s.t - t0), s.at, s.y])))
    expect(second && back.pops === 1 && back.pushes.length === 0, "the first tap goes back, and a double tap goes back once (no fallback push)", { second, pops: back.pops, pushes: back.pushes })
    expect(!!firstFeed && firstFeed.t - t0 < 250 && firstFeed.y === 600 && back.y === 600 && back.feed, "the feed is back at once, at the scroll it was left at", { ms: firstFeed ? Math.round(firstFeed.t - t0) : null, y: firstFeed?.y, end: back.y })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await p.close()
  }

  /* ── The filmstrip, to look at ───────────────────────────────────── */
  {
    const { p, cdp } = await open()
    await p.evaluate(() => window.scrollTo(0, 600))
    await frames(p, 3)
    await p.screenshot({ path: join(shots, "film-0-feed.png") })
    await tapAt(cdp, await centreOf(p, "[data-probe-open]"))
    for (const [i, ms] of [[1, 120], [2, 300], [3, 250], [4, 120], [5, 160], [6, 250], [7, 400]]) {
      await wait(ms)
      await p.screenshot({ path: join(shots, `film-${i}.png`) })
    }
    await tapAt(cdp, await centreOf(p, "[data-profile-back-button]"))
    await wait(40)
    await p.screenshot({ path: join(shots, "film-8-back-pressed.png") })
    await wait(300)
    await p.screenshot({ path: join(shots, "film-9-feed-again.png") })
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `${broken} failed` : "all passed")
process.exit(broken ? 1 : 0)
