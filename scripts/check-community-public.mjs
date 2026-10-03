/**
 * ===========================================================================
 *  A COMMUNITY'S PUBLIC SIDE, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-public.tsx) at 1440x900 and
 * on a 390x844 phone:
 *
 *   SALES PAGE   from 1024px the join card sits to the right and STAYS PUT
 *                while the page scrolls (its top measured before and after
 *                a scroll); on a phone the card is gone and a bar is pinned
 *                to the bottom, still at the bottom after a scroll, with the
 *                body padded by the bar's own height so the footer's last
 *                line ends above it
 *   EXPLORE      three columns at 1440, one on a phone, every card the same
 *                height in a row
 *   LIBRARY      rows of at least 72px, nothing cut
 *   STOREFRONT   the cards in the creator's tokens
 *   EVERYWHERE   nothing scrolls sideways; on a phone every button, link and
 *                pill a finger presses is at least 40px tall
 *
 *   PROBE_CSS=source node scripts/check-community-public.mjs
 * Screenshots go to SHOTS_DIR (printed at the end).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".community-public-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`,
  )
  writeFileSync(
    join(stubs, "image.jsx"),
    `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-public.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-public-probe/navigation.js", "next/link": "./.community-public-probe/link.jsx", "next/image": "./.community-public-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(
    join(stubs, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const VIEWPORTS = [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]

  const open = async (vp, which) => {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.goto(`file://${join(stubs, "index.html")}?${which}`, { waitUntil: "load" })
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    return { p, errors }
  }
  const noSideways = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }))
  /* Every control a finger presses on a phone, and the ones under 40px. */
  const smallTargets = (p, scope = "body") =>
    p.evaluate((scope) => {
      const out = []
      const within = scope.split(",").map((s) => s.trim())
      for (const el of document.querySelectorAll(within.flatMap((w) => [`${w} a`, `${w} button`, `${w} summary`, `${w} [role=radio]`, `${w}:is(a, button)`]).join(", "))) {
        const r = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || style.display === "none" || style.visibility === "hidden") continue
        if (el.closest("[data-fake-header], [data-fake-footer]")) continue
        /* An inline link inside a sentence is text, not a target. */
        if (el.tagName === "A" && style.display === "inline" && el.closest("p")) continue
        if (r.height < 40) out.push({ text: (el.textContent || "").trim().slice(0, 30), h: Math.round(r.height) })
      }
      return out
    }, scope)

  for (const [label, vp] of VIEWPORTS) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}: the sales page`)
    for (const which of ["sales", "sales-free", "sales-member", "sales-pending"]) {
      const { p, errors } = await open(vp, which)
      await p.screenshot({ path: join(shots, `${label}-${which}-top.png`) })
      const side = await noSideways(p)
      expect(side.doc <= side.win, `${which}: nothing scrolls sideways`, side)
      expect(errors.length === 0, `${which}: no errors`, errors)
      const geo = await p.evaluate((phone) => {
        const card = document.querySelector("[data-join-card] > div")
        const bar = document.querySelector("[data-join-bar]")
        const r = (el) => (el ? el.getBoundingClientRect() : null)
        return {
          cardShown: !!card && getComputedStyle(document.querySelector("[data-join-card]")).display !== "none",
          cardTop: r(card)?.top ?? null,
          barShown: !!bar && getComputedStyle(bar).display !== "none",
          barBottom: r(bar)?.bottom ?? null,
          barH: bar?.offsetHeight ?? 0,
          bodyPad: parseFloat(getComputedStyle(document.body).paddingBottom) || 0,
          doc: document.documentElement.scrollHeight,
          button: (() => {
            const b = document.querySelector(phone ? "[data-join-bar] [data-join-state]" : "[data-join-card] [data-join-state]")
            return b ? { text: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) } : null
          })(),
          interval: !!document.querySelector(phone ? "[data-join-summary] [data-interval-choice]" : "[data-join-card] [data-interval-choice]"),
        }
      }, phone)
      if (!phone) {
        expect(geo.cardShown && !geo.barShown, `${which}: the card at the right, no bar`, geo)
        await p.evaluate(() => window.scrollTo(0, 900))
        await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const after = await p.evaluate(() => document.querySelector("[data-join-card] > div").getBoundingClientRect().top)
        if (which === "sales") {
          expect(geo.doc > 1800, "sales: the page is long enough to scroll", geo.doc)
          expect(Math.abs(after - 88) <= 1, "STICKY: after scrolling 900px the card's top is held at 88px, under the header", { before: Math.round(geo.cardTop), after: Math.round(after) })
          await p.screenshot({ path: join(shots, `${label}-${which}-scrolled.png`) })
          expect(geo.button?.text === "Join for $19/month" && geo.button.h >= 44, "the button says the price and is 44px", geo.button)
          expect(geo.interval, "monthly or yearly is offered in the card", geo.interval)
          await p.click("[data-join-card] [role=radio]:nth-child(2)")
          const yearly = await p.evaluate(() => document.querySelector("[data-join-card] [data-join-state]").textContent.trim())
          expect(yearly === "Join for $190/year", "choosing yearly changes the button", yearly)
          await p.click("[data-join-card] [data-join-state]")
          const went = await p.evaluate(() => (window.__router || []).filter(([k]) => k === "push").map(([, h]) => h))
          expect(went.some((h) => /\/checkout\?productId=prod-pro&interval=year&return=/.test(h)), "and pressing it goes to the existing checkout on the year", went)
        }
        if (which === "sales-pending") expect(geo.button?.text === "Request sent", "pending: Request sent, nothing to press", geo.button)
        if (which === "sales-member") expect(geo.button?.text === "Open community", "the owner: Open community", geo.button)
      } else {
        expect(!geo.cardShown && geo.barShown, `${which}: no card, a bar`, geo)
        expect(Math.abs(geo.barBottom - 844) <= 1, `${which}: the bar sits on the bottom edge`, geo.barBottom)
        expect(Math.abs(geo.bodyPad - geo.barH) <= 1 && geo.barH > 0, `${which}: the body is padded by the bar's own height`, { pad: geo.bodyPad, bar: geo.barH })
        expect((geo.button?.h ?? 0) >= 44, `${which}: the bar's button is 44px`, geo.button)
        await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const end = await p.evaluate(() => ({
          barBottom: document.querySelector("[data-join-bar]").getBoundingClientRect().bottom,
          barTop: document.querySelector("[data-join-bar]").getBoundingClientRect().top,
          footerLast: document.querySelector("[data-footer-last]").getBoundingClientRect().bottom,
        }))
        expect(Math.abs(end.barBottom - 844) <= 1, `${which}: scrolled to the end, the bar is still on the bottom edge`, end.barBottom)
        expect(end.footerLast <= end.barTop + 1, `${which}: the footer's last line ends above the bar`, end)
        await p.screenshot({ path: join(shots, `${label}-${which}-end.png`) })
        const small = await smallTargets(p)
        expect(small.length === 0, `${which}: every target is at least 40px`, small)
        if (which === "sales") {
          expect(geo.interval, "the interval choice is in the page under the tagline", geo.interval)
          await p.evaluate(() => window.scrollTo(0, 0))
          const summary = await p.evaluate(() => document.querySelector("[data-join-summary]").getBoundingClientRect().top)
          expect(summary < 700, "and on the first screen", Math.round(summary))
        }
        if (which === "sales-free") {
          expect(geo.button?.text === "Join for free", "signed out on a free one: Join for free", geo.button)
          await p.click("[data-join-bar] [data-join-state]")
          const went = await p.evaluate(() => (window.__router || []).map(([, h]) => h))
          expect(went.some((h) => /^\/login\?next=%2Fcommunity%2Fnight-runners%3Fjoin%3D1$/.test(h)), "and goes to sign in, back with ?join=1", went)
        }
      }
      await p.close()
    }

    console.log(`\n${label}: explore, library, storefront`)
    {
      const { p, errors } = await open(vp, "explore")
      await p.screenshot({ path: join(shots, `${label}-explore.png`), fullPage: true })
      const side = await noSideways(p)
      expect(side.doc <= side.win && errors.length === 0, "explore: nothing sideways, no errors", { side, errors })
      const cols = await p.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-community-card]")].map((c) => c.getBoundingClientRect())
        const firstRow = cards.filter((r) => Math.abs(r.top - cards[0].top) < 2)
        return { n: cards.length, perRow: firstRow.length, heights: [...new Set(firstRow.map((r) => Math.round(r.height)))] }
      })
      expect(cols.n === 7 && cols.perRow === (phone ? 1 : 3), `explore: ${phone ? "one column" : "three columns"}`, cols)
      expect(cols.heights.length === 1, "explore: the cards in a row are one height", cols.heights)
      if (phone) {
        const small = await smallTargets(p, "[data-explore-communities] nav, [data-explore-communities] form, [data-show-more]")
        expect(small.length === 0, "explore: the pills and Show more are at least 40px", small)
      }
      await p.close()
    }
    {
      const { p, errors } = await open(vp, "library")
      await p.screenshot({ path: join(shots, `${label}-library.png`) })
      const side = await noSideways(p)
      const rows = await p.evaluate(() => [...document.querySelectorAll("[data-community-row]")].map((r) => ({ h: Math.round(r.getBoundingClientRect().height), cut: r.scrollWidth > r.clientWidth + 1 })))
      expect(side.doc <= side.win && errors.length === 0, "library: nothing sideways, no errors", { side, errors })
      expect(rows.length === 4 && rows.every((r) => r.h >= 72 && !r.cut), "library: four rows of at least 72px, nothing cut", rows)
      await p.close()
    }
    {
      const { p, errors } = await open(vp, "library-empty")
      await p.screenshot({ path: join(shots, `${label}-library-empty.png`) })
      expect(errors.length === 0 && (await p.$("[data-communities-empty]")) !== null, "library: the empty state")
      await p.close()
    }
    {
      const { p, errors } = await open(vp, "storefront")
      await p.screenshot({ path: join(shots, `${label}-storefront.png`), fullPage: true })
      const side = await noSideways(p)
      const bg = await p.evaluate(() => getComputedStyle(document.querySelector("[data-community-card]")).backgroundColor)
      expect(side.doc <= side.win && errors.length === 0, "storefront: nothing sideways, no errors", { side, errors })
      expect(bg !== "rgba(0, 0, 0, 0)", "storefront: the cards take the page's card colour", bg)
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`${broken} failed`)
  process.exit(1)
}
console.log("all passed")
