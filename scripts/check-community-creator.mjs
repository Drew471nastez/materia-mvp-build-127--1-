/**
 * ===========================================================================
 *  THE CREATOR'S COMMUNITY SCREENS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-creator.tsx) in a stand-in
 * for the /app shell, at 1440x900 and on a 390x844 phone:
 *
 *   FITS       nothing scrolls sideways, on the page or in the pane
 *   TAPS       on a phone every button, link, field and tab is 40px or more
 *   STICKY     the bar with the name and the section tabs stays at the top
 *              while the section scrolls under it
 *   HEADER     the name and the actions beside it never overlap
 *   TABS       on a phone the section tabs scroll sideways and the one you
 *              are on is in view
 *   OVERVIEW   the next steps that are not done, the figures in a grid
 *   CREATE     the five fields, who can join, the price only for paid, and
 *              Create in reach on a phone
 *   MEMBERS    a page of rows (a table on a computer, a list on a phone),
 *              Show more for the next page, the status pills with counts
 *   SETTINGS   the tab row, the save bar appearing on a change, the tiers
 *
 *   PROBE_CSS=source node scripts/check-community-creator.mjs
 * Screenshots land in SHOTS_DIR (or a temp dir, printed at the end).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".community-creator-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || "/app/community"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-creator.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-creator-probe/navigation.js", "next/link": "./.community-creator-probe/link.jsx" },
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
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  )

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const CASES = (process.env.CASES || "list,create,create-paid,overview,members,members-pending,settings,settings-access,feed,events,moderation,analytics").split(",")
  for (const [label, vp] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
    const phone = label.startsWith("phone")
    for (const c of CASES) {
      console.log(`\n${label} ${c}`)
      const p = await browser.newPage()
      await p.setViewport(vp)
      const errors = []
      p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      await p.goto(`file://${join(stubs, "index.html")}?case=${c}`, { waitUntil: "load" })
      await sleep(400)
      expect(errors.length === 0, "renders without an error", errors)

      if (c === "create-paid") {
        await p.click('[data-choice="paid"]')
        await sleep(150)
      }

      const fits = await p.evaluate(() => {
        const pane = document.querySelector(".orders-pane")
        return { doc: document.scrollingElement.scrollWidth - innerWidth, pane: pane ? pane.scrollWidth - pane.clientWidth : 0 }
      })
      expect(fits.doc <= 0 && fits.pane <= 0, "FITS: nothing scrolls sideways", fits)

      if (phone) {
        const small = await p.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll("main button, main a[href], main input, main select, main textarea, main [role=tab]")) {
            const r = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest("[hidden],[aria-hidden=true]")) continue
            if (el.matches("input[type=file]")) continue
            if (el.closest("p") && el.tagName === "A") continue
            if (r.height < 40 || (r.width < 40 && el.tagName !== "TEXTAREA")) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
          }
          return out
        })
        expect(small.length === 0, "TAPS: every control is 40px or more on a phone", small.slice(0, 8))
      }

      const hasBar = await p.$("[data-orders-bar]")
      if (hasBar) {
        const header = await p.evaluate(() => {
          const h1 = document.querySelector("[data-orders-bar] h1")?.getBoundingClientRect()
          const buttons = [...document.querySelectorAll("[data-orders-bar] h1 ~ *, [data-orders-bar] h1")].map((x) => x.getBoundingClientRect())
          const actions = [...document.querySelectorAll("[data-orders-bar] a, [data-orders-bar] button")].filter((b) => !b.closest("nav") && b.getBoundingClientRect().width > 0).map((b) => b.getBoundingClientRect())
          const overlap = h1 ? actions.some((a) => a.left < h1.right - 1 && a.right > h1.left + 1 && a.top < h1.bottom && a.bottom > h1.top) : false
          return { overlap, h1: h1 ? Math.round(h1.width) : 0, n: buttons.length }
        })
        expect(!header.overlap && header.h1 > 40, "HEADER: the name and the actions do not overlap", header)
        const pane = await p.$(".orders-pane")
        const before = await p.evaluate(() => Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().top))
        const scrolled = await p.evaluate(() => {
          const pane = document.querySelector(".orders-pane")
          pane.scrollTop = 500
          return pane.scrollTop
        })
        await sleep(120)
        const after = await p.evaluate(() => ({ top: Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().top), scrolledFlag: document.querySelector("[data-orders-bar]").dataset.scrolled }))
        if (scrolled > 0) expect(after.top === before, "STICKY: the bar stays put while the pane scrolls", { before, after, scrolled })
        await p.evaluate(() => (document.querySelector(".orders-pane").scrollTop = 0))
        void pane
      }

      const tabs = await p.$("[data-section-tabs]")
      if (tabs) {
        const t = await p.evaluate(() => {
          const s = document.querySelector("[data-section-tabs]")
          const a = s.querySelector('[aria-current="page"]')
          const sr = s.getBoundingClientRect()
          const ar = a?.getBoundingClientRect()
          const kids = [...s.children].map((k) => k.getBoundingClientRect())
          const overlap = kids.some((k, i) => i > 0 && k.left < kids[i - 1].right - 0.5)
          return { scrolls: s.scrollWidth > s.clientWidth, activeInView: ar ? ar.left >= sr.left - 1 && ar.right <= sr.right + 1 : false, overlap, n: kids.length, active: a?.textContent }
        })
        expect(t.activeInView && !t.overlap, "TABS: the section you are on is in view, no tab over another", t)
        if (phone) expect(t.scrolls, "TABS: on a phone they scroll sideways", t)
      }

      if (c === "overview") {
        const o = await p.evaluate(() => ({ steps: [...document.querySelectorAll("[data-step]")].map((s) => s.dataset.step), figures: document.querySelectorAll("[data-figure]").length, cols: getComputedStyle(document.querySelector("[data-figures]")).gridTemplateColumns.split(" ").length }))
        expect(o.steps.join(",") === "publish,invite,welcome,course,customize", "OVERVIEW: only the steps not done yet, in order", o.steps)
        expect(o.figures === 7 && o.cols === (phone ? 2 : 4), "OVERVIEW: seven figures in a grid", o)
      }
      if (c === "create" || c === "create-paid") {
        const f = await p.evaluate(() => ({
          name: !!document.querySelector("#c-name"),
          focused: document.activeElement?.id,
          price: !!document.querySelector("[data-paid-fields]"),
          choices: document.querySelectorAll("[data-choice]").length,
          submit: (() => {
            const r = document.querySelector("[data-create-submit]").getBoundingClientRect()
            return { bottom: Math.round(r.bottom), h: Math.round(r.height) }
          })(),
        }))
        expect(f.name && f.choices === 3, "CREATE: the name and three ways to join", f)
        expect(f.price === (c === "create-paid"), "CREATE: the price only for a paid community", f.price)
        expect(f.submit.bottom <= vp.height, "CREATE: Create is on screen without scrolling", f.submit)
        if (c === "create") expect(f.focused === "c-name", "CREATE: the name field has the cursor", f.focused)
      }
      if (c === "members") {
        const m = await p.evaluate(() => ({ rows: [...document.querySelectorAll("[data-member-row]")].filter((r) => r.getBoundingClientRect().height > 0).length, more: !!document.querySelector("[data-load-more]"), pills: document.querySelectorAll("[data-status]").length, invites: document.querySelectorAll("[data-invites] li").length }))
        expect(m.rows === 12 && m.more, "MEMBERS: a page of rows and Show more", m)
        expect(m.pills >= 5, "MEMBERS: the status pills with their counts", m.pills)
      }
      if (c === "settings") {
        await p.focus("#g-tagline")
        await p.keyboard.type(" Every day.")
        await sleep(120)
        const bar = await p.evaluate(() => {
          const b = document.querySelector("[data-save-bar]")
          if (!b) return null
          const r = b.getBoundingClientRect()
          return { bottom: Math.round(r.bottom), top: Math.round(r.top) }
        })
        expect(bar !== null && bar.bottom <= vp.height, "SETTINGS: a change brings the save bar, on screen", bar)
      }
      if (c === "settings-access") {
        const a = await p.evaluate(() => ({ tiers: document.querySelectorAll("[data-tier]").length }))
        expect(a.tiers === 2, "SETTINGS: both tiers with their prices", a)
      }

      await p.screenshot({ path: join(shots, `${label}-${c}.png`), fullPage: false })
      if (c === "members" || c === "overview" || c === "settings-access") {
        const h = await p.evaluate(() => document.querySelector(".orders-pane")?.scrollHeight ?? 0)
        if (h > vp.height) {
          await p.evaluate(() => (document.querySelector(".orders-pane").scrollTop = 600))
          await sleep(100)
          await p.screenshot({ path: join(shots, `${label}-${c}-scrolled.png`) })
        }
      }
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
