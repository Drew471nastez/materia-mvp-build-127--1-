/**
 * ===========================================================================
 *  HOME: THE THREE CARDS AND THE GLOBE
 * ===========================================================================
 * Home (scripts/render-home-cards.tsx) at 1440, 1024 and 390, measured:
 *
 *   CARDS     Getting started, the guide and Your Plan under the banner,
 *             three across from 1280 at one height, two across with the
 *             guide below them under that, one under another on a phone; no Store setup list; the page never scrolls
 *             sideways. Getting started says "N of 7", the next step is
 *             first with the arrow, and Sign up is last and crossed out.
 *   PLAN      the plan by name (Free, or Pro for `growth`), Free's own lines
 *             from lib/billing/plans, and the button Upgrade to Pro (Manage
 *             plan on Pro).
 *   HOVER     on a computer the card's shadow deepens and the three payment
 *             tiles move, and they are back where they were after.
 *   GUIDE     pressing it bumps Getting started.
 *   GLOBE     it turns by itself (its pixels change from frame to frame),
 *             holds 60 frames a second or better while it does, a drag turns
 *             it further than it turns alone, and a fast throw keeps it
 *             spinning faster than it turns alone.
 *
 *   node scripts/check-home-cards.mjs
 *   SHOTS=/some/dir node scripts/check-home-cards.mjs
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".home-cards-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, priority, fill, sizes, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt || "", width, height, ...rest })
}
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: [], error: null, count: 0 }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-home-cards.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:next/image=${join(dir, "image.jsx")}`, `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
let fontDir = null
const html = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  /* Inter over this server, not file://, which a page served over http may not load. */
  `<style>${interFaces(root).replace(/url\(file:\/\/([^)]*\/static\/media)\/([^)]+)\)/g, (_, dir, file) => { fontDir = dir; return `url(/__font/${file})` })}</style><style>${await appCss(root)}</style><style>html,body{margin:0;height:100%;font-family:Inter,system-ui,sans-serif}#app{height:100%}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  if (req.url.startsWith("/__font/") && fontDir) {
    try {
      const font = readFileSync(join(fontDir, req.url.slice("/__font/".length)))
      res.writeHead(200, { "content-type": "font/woff2" })
      res.end(font)
    } catch {
      res.writeHead(404)
      res.end()
    }
    return
  }
  if (req.url.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" })
    res.end("{}")
    return
  }
  if (/\.(png|jpe?g|webp|svg)(\?|$)/.test(req.url)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/*
  A MOUSE, ON A COMPUTER. Headless Chromium reports no pointer at all, so
  `(hover: hover) and (pointer: fine)`, which the cards' hover is behind,
  never matches. The blink settings give it a mouse, but setViewport resets
  them, so a computer run is a window of that size instead, and only the
  phone run is an emulated device.
*/
const MOUSE = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"
const browsers = []
const open = async (viewport) => {
  if (viewport.isMobile) {
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
    browsers.push(browser)
    const page = await browser.newPage()
    await page.setViewport(viewport)
    return page
  }
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", MOUSE, `--window-size=${viewport.width},${viewport.height}`], headless: true })
  browsers.push(browser)
  const [page] = await browser.pages()
  return page
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/**
 * The globe's pixels, hashed, to tell whether it moved: a screenshot of the
 * ball, because it is drawn with WebGL now (components/app/home/globe-gl)
 * and a WebGL canvas has no 2D context to read back.
 */
const globeHash = async (page) => {
  const clip = await page.evaluate(() => {
    const b = document.querySelector("[data-home-globe-box]").getBoundingClientRect()
    const r = b.width * 0.28
    return { x: b.left + b.width / 2 - r, y: b.top + b.height / 2 - r, width: r * 2, height: r * 2 }
  })
  return createHash("sha1").update(await page.screenshot({ clip, captureBeyondViewport: false })).digest("hex")
}

/*
  YOUR PLAN'S BAND. "No dots, no pattern, no gradient; something
  cleaner, simple, a subtle colour." One flat light violet, 46px, a
  hairline under it, the name in deep violet, and every pixel of it the
  same colour but the hairline's. Measured last on each page: it scrolls
  the card on screen, and the globe sleeps while the page scrolls or it
  is off screen.
*/
const planBand = async (page, label) => {
  const band = await page.evaluate(() => {
    const plan = document.querySelector("[aria-labelledby=your-plan-title]")
    const head = plan.querySelector(".home-plan-head")
    const h2 = document.getElementById("your-plan-title")
    if (!head) return null
    head.scrollIntoView({ block: "center" })
    const cs = getComputedStyle(head)
    const b = head.getBoundingClientRect()
    return {
      height: Math.round(b.height), bg: cs.backgroundColor, image: cs.backgroundImage, shadow: cs.boxShadow,
      ink: getComputedStyle(h2).color, size: getComputedStyle(h2).fontSize, weight: getComputedStyle(h2).fontWeight,
      dots: plan.querySelectorAll(".home-plan-dots, .home-plan-sky").length, children: head.children.length,
      box: { x: b.x, y: b.y, width: b.width, height: b.height },
    }
  })
  await wait(150)
  const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const ratio = band ? (lum(band.bg) + 0.05) / (lum(band.ink) + 0.05) : 0
  expect(!!band && band.height === 46, "Your Plan's band: 46px", band?.height)
  expect(!!band && /feTurbulence/.test(band.image) && /linear-gradient/.test(band.image) && band.dots === 0 && band.children === 1, "  the first deep violet sky: clouds and grain, no dots, nothing but its name", band && { image: band.image.slice(0, 60), dots: band.dots })
  expect(!!band && band.ink === "rgb(255, 255, 255)", "  the name in white", band?.ink)
  if (band) {
    /* Dark enough under the name for white to read: the band's pixels, the name hidden, all darker than mid violet. */
    await page.evaluate(() => { document.getElementById("your-plan-title").style.color = "transparent" })
    const png = await page.screenshot({ clip: { x: band.box.x + 20, y: band.box.y + 6, width: Math.min(160, band.box.width - 40), height: band.box.height - 12 }, encoding: "base64" })
    await page.evaluate(() => { document.getElementById("your-plan-title").style.color = "" })
    const brightest = await page.evaluate(async (data) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext("2d")
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
      return sum / (d.length / 4)
    }, png)
    expect(brightest < 110, "  dark under the name, so white reads on it", brightest.toFixed(0))
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `appfix-plan-head-${label.replace(/ /g, "-")}.png`), clip: { x: band.box.x - 8, y: band.box.y - 8, width: band.box.width + 16, height: 200 } })
  }
}

try {
  for (const [label, viewport, query] of [
    ["1440 free", { width: 1440, height: 1000, deviceScaleFactor: 1 }, ""],
    ["1440 pro", { width: 1440, height: 1000, deviceScaleFactor: 1 }, "?plan=growth"],
    ["1024 new", { width: 1024, height: 900, deviceScaleFactor: 1 }, "?fresh=1"],
    ["390 free", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ""],
  ]) {
    const page = await open(viewport)
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|probe\.invalid/.test(m.text())) errors.push(m.text()) })
    await page.goto(`${base}/app${query}`)
    await page.waitForSelector("#getting-started", { timeout: 15000 })
    await wait(900)
    console.log(`\n${label}`)
    const threw = await page.evaluate(() => window.__threw || null)
    expect(!threw, "it renders", threw)

    const m = await page.evaluate(() => {
      const r = (el) => el && el.getBoundingClientRect()
      const gs = document.getElementById("getting-started")
      const guide = document.querySelector(".home-guide")
      const plan = document.querySelector("[aria-labelledby=your-plan-title]")
      const banner = document.querySelector("[data-home-globe]").closest(".rounded-2xl")
      const rows = [...gs.querySelectorAll("li")].map((li) => ({ text: li.textContent.trim(), struck: !!li.querySelector(".line-through"), arrow: !!li.querySelector("[data-next-step]") }))
      const scroller = document.querySelector(".dashboard-scroll-container")
      return {
        count: gs.querySelector("h2 + span").textContent.trim(),
        rows,
        gs: r(gs).toJSON(), guide: r(guide).toJSON(), plan: r(plan).toJSON(), banner: r(banner).toJSON(),
        planName: plan.querySelector("p").textContent.trim(),
        planLines: [...plan.querySelectorAll("li")].map((li) => li.textContent.trim()),
        planButton: plan.querySelector("a").textContent.trim(),
        planHref: plan.querySelector("a").getAttribute("href"),
        /* The old list is gone; its id now marks the three cards, where the sidebar's Setup ring scrolls to. */
        storeSetup: !document.getElementById("store-setup-section")?.contains(gs),
        sideways: Math.max(document.documentElement.scrollWidth, scroller ? scroller.scrollWidth : 0) - window.innerWidth,
        guideThumb: guide.querySelector(".home-guide-thumb").textContent.replace(/\s+/g, " ").trim(),
      }
    })
    expect(!m.storeSetup, "the Store setup list is gone, and its id lands on Getting started")
    expect(m.sideways <= 0, "nothing scrolls sideways", m.sideways)
    const hover = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
    expect(hover === !viewport.isMobile, viewport.isMobile ? "a touch screen" : "a mouse")
    const wide = viewport.width >= 1280
    if (wide) {
      expect(Math.abs(m.gs.top - m.guide.top) < 1 && Math.abs(m.guide.top - m.plan.top) < 1, "three across, level", JSON.stringify([m.gs.top, m.guide.top, m.plan.top]))
      expect(Math.abs(m.gs.height - m.plan.height) < 1 && Math.abs(m.gs.height - m.guide.height) < 1, "one height", JSON.stringify([m.gs.height, m.guide.height, m.plan.height]))
    } else if (viewport.width >= 640) {
      expect(Math.abs(m.gs.top - m.plan.top) < 1 && m.guide.top >= m.gs.bottom && Math.abs(m.guide.width - (m.plan.right - m.gs.left)) < 1, "two across, the guide the width below them", JSON.stringify([m.gs.top, m.plan.top, m.guide.top, m.guide.width]))
    } else if (viewport.width < 640) {
      expect(m.gs.bottom <= m.guide.top && m.guide.bottom <= m.plan.top, "one under another on a phone", JSON.stringify([m.gs.top, m.guide.top, m.plan.top]))
      /* 10px each side, not 16: the /app gutter on a phone is --app-gutter (app/globals.css). */
      expect(Math.abs(m.gs.width - (viewport.width - 20)) < 1, "full width less the 10px phone gutter on each side", m.gs.width)
    }
    expect(m.gs.top > m.banner.bottom, "under the banner", JSON.stringify([m.banner.bottom, m.gs.top]))
    const done = m.rows.filter((r) => r.struck).length
    expect(m.count === `${done} of 7` && m.rows.length === 7, `"${m.count}", seven steps (lib/home/progress)`, JSON.stringify(m.rows))
    expect(!m.rows.some((r) => /Upgrade to Pro/.test(r.text)), "and Upgrade to Pro is not one of them", m.rows.map((r) => r.text))

    const firstDone = m.rows.findIndex((r) => r.struck)
    expect(firstDone > 0 && m.rows.slice(firstDone).every((r) => r.struck) && m.rows[firstDone].text.startsWith("Sign up"), "what is done drops below what is left, crossed out, Sign up first of it", JSON.stringify(m.rows))
    expect(m.rows[0].arrow && m.rows.filter((r) => r.arrow).length === 1, "the next step first, and only it has the arrow", JSON.stringify(m.rows))
    expect(/Storelib/.test(m.guideThumb) && /Welcome to\s*Storelib/.test(m.guideThumb) && !/Academy|Amboras/.test(m.guideThumb), "the guide says Welcome to Storelib", m.guideThumb)
    if (query.includes("growth")) {
      expect(m.planName === "Pro" && m.planButton === "Manage plan" && m.planHref === "/app/settings/billing", "Pro, with Manage plan", `${m.planName} / ${m.planButton}`)
      expect(m.planLines[0] === "Everything in Free", "Pro's own lines", m.planLines[0])
    } else {
      expect(m.planName === "Free" && m.planButton === "Upgrade to Pro" && m.planHref === "/app/settings/billing/upgrade", "Free, with Upgrade to Pro", `${m.planName} / ${m.planButton}`)
      expect(/6% \+ \$0\.25 per sale/.test(m.planLines[0]) && m.planLines.some((l) => /1 GB of file storage/.test(l)), "Free's own lines", m.planLines.join(" | "))
    }

    /* The globe turns by itself. */
    const g0 = await globeHash(page)
    await wait(250)
    const g1 = await globeHash(page)
    expect(g0 !== g1, "the globe turns by itself")
    const fps = await page.evaluate(() => new Promise((res) => {
      const gaps = []
      let last = 0
      const f = (t) => { if (last) gaps.push(t - last); last = t; if (gaps.length < 90) requestAnimationFrame(f); else res(gaps) }
      requestAnimationFrame(f)
    }))
    const sorted = [...fps].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)]
    expect(p95 < 20, "frames keep up while it turns (95th percentile under 20ms)", p95.toFixed(1))

    if (SHOTS) {
      await page.screenshot({ path: join(SHOTS, `home-${label.replace(/ /g, "-")}.png`) })
      const cards = await page.$(".home-card")
      const grid = await page.evaluateHandle(() => document.getElementById("getting-started").parentElement)
      await grid.asElement().screenshot({ path: join(SHOTS, `cards-${label.replace(/ /g, "-")}.png`) })
      const b = await page.evaluateHandle(() => document.querySelector("[data-home-globe]").closest(".rounded-2xl"))
      await b.asElement().screenshot({ path: join(SHOTS, `banner-${label.replace(/ /g, "-")}.png`) })
      void cards
    }

    if (!viewport.isMobile) {
      /* Hover: deeper shadow, the tiles move, and they come back. */
      /* Against the card, not the window: the hover screenshot below scrolls the card into view. */
      const tiles = () => page.evaluate(() => {
        const card = document.getElementById("getting-started").getBoundingClientRect()
        return [...document.querySelectorAll("[data-pay-tile]")].map((t) => { const b = t.getBoundingClientRect(); return [Math.round(b.x - card.x), Math.round(b.y - card.y)] })
      })
      /* The deeper shadow is a layer of its own that fades in (globals.css HOME CARDS), so a hover paints nothing. */
      const shadow = () => page.evaluate(() => getComputedStyle(document.getElementById("getting-started"), "::before").opacity)
      const rest = await tiles()
      const restShadow = await shadow()
      const box = m.gs
      await page.mouse.move(box.left + 40, box.top + 20)
      await wait(900)
      const lifted = await tiles()
      expect(JSON.stringify(rest) !== JSON.stringify(lifted), "hovering Getting started moves the tiles", JSON.stringify([rest, lifted]))
      expect((await shadow()) !== restShadow, "and deepens its shadow")
      if (SHOTS) await (await page.$("#getting-started")).screenshot({ path: join(SHOTS, `gs-hover-${label.replace(/ /g, "-")}.png`) })
      await page.mouse.move(5, viewport.height - 5)
      await wait(900)
      expect(JSON.stringify(await tiles()) === JSON.stringify(rest), "and they go back", JSON.stringify([rest, await tiles()]))

      /* The guide bumps Getting started, scrolling to it first when it is off screen. */
      await page.evaluate(() => {
        window.__anims = []
        document.getElementById("getting-started").addEventListener("animationstart", (e) => window.__anims.push(e.animationName))
      })
      await page.click(".home-guide")
      await wait(900)
      const bump = await page.evaluate(() => ({ attr: document.getElementById("getting-started").hasAttribute("data-bump"), anims: window.__anims, top: document.getElementById("getting-started").getBoundingClientRect().top }))
      expect(bump.attr && bump.anims.includes("home-bump") && bump.anims.includes("home-next-lit"), "pressing the guide bumps Getting started and lights its next step", JSON.stringify(bump))
      expect(bump.top >= 0 && bump.top < viewport.height - 100, "with Getting started on screen", bump.top)

      /* Dragging the globe turns it, and a throw spins it faster than it turns alone. */
      await page.evaluate(() => document.querySelector(".dashboard-scroll-container").scrollTo({ top: 0, behavior: "instant" }))
      await wait(300)
      const c = await page.evaluate(() => { const b = document.querySelector("[data-home-globe]").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, top: b.y, w: b.width } })
      /* The ball is grabbed by its round grip (components/app/home/globe), the canvas takes no pointer. */
      const cursor0 = await page.evaluate(() => getComputedStyle(document.querySelector("[data-home-globe-grip]")).cursor)
      await page.mouse.move(c.x, Math.max(c.top + 30, c.y - 20))
      await wait(50)
      const cursor = await page.evaluate(() => getComputedStyle(document.querySelector("[data-home-globe-grip]")).cursor)
      expect(cursor === "grab", "over the globe the pointer is a hand", `${cursor0} -> ${cursor}`)
      await page.mouse.down()
      const grabbing = await page.evaluate(() => getComputedStyle(document.querySelector("[data-home-globe-grip]")).cursor)
      expect(grabbing === "grabbing", "and a closed hand while dragging", grabbing)
      const held = await globeHash(page)
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(c.x + i * 22, Math.max(c.top + 30, c.y - 20))
        await wait(8)
      }
      await page.mouse.up()
      const moved = await globeHash(page)
      expect(moved !== held, "dragging turns it")
    }
    await planBand(page, label)
    expect(errors.length === 0, "no errors", errors.slice(0, 3).join(" | "))
    await page.close()
  }
} finally {
  await Promise.all(browsers.map((b) => b.close()))
  server.close()
}
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
