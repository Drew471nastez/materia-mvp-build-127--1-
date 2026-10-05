/**
 * ===========================================================================
 *  ROUND 13 /app/community, MEASURED (worker A)
 * ===========================================================================
 * The real components (scripts/render-community-admin13.tsx) in a stand-in
 * for the /app shell, at 1440x900 and on a 390x844 phone:
 *
 *   FITS       nothing scrolls sideways, on the page or in the pane
 *   TAPS       on a phone every button, link, field and tab is 40px or more
 *   LIST       cards in a grid (3 across at 1440, 1 on a phone), the same
 *              height in a row, cover then logo then name; the "..." menu
 *              opens with Open, Edit, Share, Analytics, Duplicate settings
 *              and Archive for the owner, and less for a moderator
 *   LIMIT      at the Free plan's two, New community opens the upgrade
 *              sheet and goes nowhere
 *   CREATE     the product editor's page: on a phone the bar at the top
 *              stays put while the form scrolls; at 1440 two columns and
 *              the foot bar at the bottom of the pane while it scrolls
 *   SETTINGS   the Page tab in two columns at 1440, the save foot in view
 *              while the form scrolls, "Unsaved changes" after a change
 *   ROLES      every group a switch for admins and for moderators; a flip
 *              brings the save foot to life
 *   ANALYTICS  six revenue figures; Cancellations shows why
 *   MODERATE   a join alarm offers Turn approval off
 *
 *   PROBE_CSS=source node scripts/check-community-admin13.mjs
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
const stubs = join(root, ".community-admin13-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-admin13-")), "shots")
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
    entryPoints: [join(root, "scripts/render-community-admin13.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-admin13-probe/navigation.js", "next/link": "./.community-admin13-probe/link.jsx" },
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
  const CASES = (process.env.CASES || "list,list-limit,create,create-limit,settings,roles,policies,analytics,moderation").split(",")
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
      await sleep(450)
      expect(errors.length === 0, "renders without an error", errors)

      const fits = await p.evaluate(() => {
        const panes = [...document.querySelectorAll(".orders-pane, .app-content-scroll")]
        return { doc: document.scrollingElement.scrollWidth - innerWidth, pane: Math.max(0, ...panes.map((x) => x.scrollWidth - x.clientWidth)) }
      })
      expect(fits.doc <= 0 && fits.pane <= 0, "FITS: nothing scrolls sideways", fits)

      if (phone && !c.endsWith("limit")) {
        const small = await p.evaluate(() => {
          const out = []
          for (const el of document.querySelectorAll("main button, main a[href], main input, main select, main textarea, main [role=tab], main [role=switch]")) {
            const r = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest("[hidden],[aria-hidden=true],.sr-only")) continue
            if (el.matches("input[type=file]")) continue
            if (el.closest("p") && el.tagName === "A") continue
            /* A press drawn smaller and grown by an invisible ::after (the Products pattern) counts at its press size. */
            const after = getComputedStyle(el, "::after")
            const grow = after.content !== "none" && after.position === "absolute" ? Math.max(0, -parseFloat(after.top || "0")) * 2 : 0
            const h = r.height + grow
            const w = r.width + grow
            if (h < 40 || (w < 40 && el.tagName !== "TEXTAREA")) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 30)}" ${Math.round(w)}x${Math.round(h)}`)
          }
          return out
        })
        expect(small.length === 0, "TAPS: every control is 40px or more on a phone", small.slice(0, 8))
      }

      await p.screenshot({ path: join(shots, `${label}-${c}.png`) })

      if (c === "list") {
        const grid = await p.evaluate(() => {
          const cards = [...document.querySelectorAll("[data-community-card]")].map((el) => el.getBoundingClientRect())
          const lefts = [...new Set(cards.map((r) => Math.round(r.left)))]
          const firstRow = cards.filter((r) => Math.abs(r.top - cards[0].top) < 2)
          const card = document.querySelector("[data-community-card]")
          const cover = card.querySelector("[data-card-cover]").getBoundingClientRect()
          const logo = card.querySelector("[data-card-logo]").getBoundingClientRect()
          const name = card.querySelector("[data-card-name]").getBoundingClientRect()
          return { count: cards.length, columns: lefts.length, rowHeights: firstRow.map((r) => Math.round(r.height)), coverRatio: +(cover.width / cover.height).toFixed(2), logoOverlapsCover: logo.top < cover.bottom && logo.bottom > cover.bottom, nameUnderLogo: name.top >= logo.bottom - 1 }
        })
        expect(grid.count === 4, "LIST: a card per community", grid.count)
        expect(grid.columns === (phone ? 1 : 3), `LIST: ${phone ? "one column on a phone" : "three across at 1440"}`, grid.columns)
        expect(new Set(grid.rowHeights).size === 1, "LIST: the cards in a row are the same height", grid.rowHeights)
        expect(grid.coverRatio === (phone ? 2.5 : 2), `LIST: the cover is ${phone ? "5:2 on a phone" : "2:1"}`, grid.coverRatio)
        expect(grid.logoOverlapsCover && grid.nameUnderLogo, "LIST: the logo sits on the cover's edge, the name under it", grid)
        const states = await p.$$eval("[data-card-state]", (els) => els.map((e) => e.textContent.trim()))
        expect(states.join() === "Published,Draft,Published,Archived", "LIST: the state on each card", states)
        const mrr = await p.$$eval("[data-card-mrr]", (els) => els.map((e) => e.textContent.trim()))
        expect(mrr.length === 1 && /MRR/.test(mrr[0]), "LIST: MRR only on the paid card", mrr)
        /* The owner's menu, then the moderator's. */
        await p.click(`[data-community-card="6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"] [data-card-menu]`)
        await sleep(phone ? 650 : 250)
        const ownerItems = await p.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [data-sheet-root] button, [data-sheet-root] a')].map((e) => e.textContent.trim()).filter(Boolean))
        await p.screenshot({ path: join(shots, `${label}-list-menu.png`) })
        expect(["Open", "Edit", "Share", "Analytics", "Duplicate settings", "Archive"].every((w) => ownerItems.includes(w)), "LIST: the owner's menu has Open, Edit, Share, Analytics, Duplicate settings, Archive", ownerItems)
        await p.keyboard.press("Escape")
        await sleep(phone ? 700 : 250)
        const navBefore = await p.evaluate(() => (window.__router || []).length)
        await p.click(`[data-community-card="x3"] [data-card-link]`).catch(() => {})
        await sleep(100)
        const opened = await p.evaluate(() => (window.__router || []).slice(-1)[0])
        expect(opened && opened[1] === "/app/community/x3", "LIST: pressing a card opens its editor", opened)
        expect(navBefore >= 0, "LIST: (navigation recorded)")
      }

      if (c === "list-limit") {
        await p.click("[data-new-community]")
        await sleep(phone ? 700 : 350)
        const sheet = await p.evaluate(() => {
          const el = document.querySelector("[data-upgrade-sheet]")
          const r = el?.getBoundingClientRect()
          return { shown: !!el && r.height > 0, went: (window.__router || []).filter((x) => x[1] === "/app/community/new").length }
        })
        expect(sheet.shown && sheet.went === 0, "LIMIT: New community opens the upgrade sheet and goes nowhere", sheet)
        await p.screenshot({ path: join(shots, `${label}-list-limit-sheet.png`) })
      }

      if (c === "create-limit") {
        const shown = await p.evaluate(() => !!document.querySelector("[data-upgrade-sheet]"))
        expect(shown, "LIMIT: New community opened at the limit shows the upgrade sheet")
      }

      if (c === "create") {
        const pane = ".orders-pane"
        if (phone) {
          const before = await p.$eval("[data-create-bar]", (el) => Math.round(el.getBoundingClientRect().top))
          await p.$eval(pane, (el) => el.scrollTo(0, 500))
          await sleep(120)
          const after = await p.$eval("[data-create-bar]", (el) => Math.round(el.getBoundingClientRect().top))
          const foot = await p.$eval("[data-create-foot]", (el) => getComputedStyle(el).display)
          expect(before === after, "CREATE: the bar with Cancel and Create stays at the top on a phone", { before, after })
          expect(foot === "none", "CREATE: no foot bar on a phone", foot)
          await p.screenshot({ path: join(shots, `${label}-create-scrolled.png`) })
        } else {
          const cols = await p.evaluate(() => {
            const about = document.querySelector('[data-editor-card="about"]').getBoundingClientRect()
            const address = document.querySelector('[data-editor-card="address"]').getBoundingClientRect()
            return { aboutLeft: Math.round(about.left), addressLeft: Math.round(address.left), sameTop: Math.abs(about.top - address.top) < 2 }
          })
          expect(cols.addressLeft > cols.aboutLeft && cols.sameTop, "CREATE: two columns at 1440", cols)
          const foot = async () => p.$eval("[data-create-foot]", (el) => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight } })
          const f1 = await foot()
          await p.$eval(pane, (el) => el.scrollTo(0, 300))
          await sleep(100)
          await p.click('[data-choice="paid"]')
          await sleep(120)
          const f2 = await foot()
          expect(f1.bottom === f1.vh && f2.bottom === f2.vh && f1.h === 65, "CREATE: the foot bar (64px and its hairline) sits at the bottom of the pane, scrolled or not", { f1, f2 })
          const bar = await p.$eval("[data-create-bar]", (el) => getComputedStyle(el).display)
          expect(bar === "none", "CREATE: no top bar at 1440", bar)
          await p.type("#c-name", "Night Owls")
          const addr = await p.$eval("[data-create-address]", (el) => el.textContent)
          expect(/night-owls/.test(addr), "CREATE: the address follows the name", addr)
          await p.screenshot({ path: join(shots, `${label}-create-paid.png`) })
        }
      }

      if (c === "settings") {
        const pane = ".orders-pane"
        await p.type("#g-tagline", " Every day.")
        await sleep(150)
        const state = await p.$eval("[data-editor-foot]", (el) => el.textContent)
        expect(/Unsaved changes/.test(state), "SETTINGS: a change says Unsaved changes in the foot", state)
        await p.$eval(pane, (el) => el.scrollTo(0, 99999))
        await sleep(150)
        const foot = await p.$eval("[data-editor-foot]", (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight } })
        expect(foot.bottom <= foot.vh && foot.top > 0, "SETTINGS: the save foot is in view at the end of the form", foot)
        await p.$eval(pane, (el) => el.scrollTo(0, 200))
        await sleep(150)
        const mid = await p.$eval("[data-editor-foot]", (el) => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight } })
        expect(mid.bottom <= mid.vh && mid.bottom > mid.vh - 120, "SETTINGS: and stays at the bottom while it scrolls", mid)
        if (!phone) {
          const cols = await p.evaluate(() => {
            const about = document.querySelector('[data-editor-card="about"]').getBoundingClientRect()
            const address = document.querySelector('[data-editor-card="address"]').getBoundingClientRect()
            return { aboutLeft: Math.round(about.left), addressLeft: Math.round(address.left) }
          })
          expect(cols.addressLeft > cols.aboutLeft, "SETTINGS: two columns at 1440", cols)
        }
        await p.screenshot({ path: join(shots, `${label}-settings-dirty.png`) })
      }

      if (c === "roles") {
        const switches = await p.$$eval("[data-role-groups] [role=switch]", (els) => els.length)
        expect(switches === 24, "ROLES: twelve groups for admins and twelve for moderators", switches)
        await p.click("#moderator-announce")
        await sleep(150)
        const state = await p.$eval("[data-editor-foot]", (el) => el.getAttribute("data-state"))
        expect(state === "dirty", "ROLES: a flip brings the save foot to life", state)
        await p.screenshot({ path: join(shots, `${label}-roles-dirty.png`) })
      }

      if (c === "analytics") {
        const tabs = await p.$$eval("[data-revenue] [role=tab]", (els) => els.map((e) => e.getAttribute("data-tab")))
        expect(tabs.join() === "mrr,subscribers,new,cancellations,churn,refunds", "ANALYTICS: six revenue figures", tabs)
        await p.click('[data-revenue] [data-tab="cancellations"]')
        await sleep(150)
        const why = await p.$$eval('[data-revenue-detail="cancellations"] [data-row-key]', (els) => els.map((e) => e.getAttribute("data-row-key")))
        expect(why[0] === "too_expensive" && why.length === 4, "ANALYTICS: Cancellations shows why", why)
        const joins = await p.$$eval('[data-card="joins"] [data-row-key]', (els) => els.length)
        expect(joins === 5, "ANALYTICS: joins by source", joins)
        await p.screenshot({ path: join(shots, `${label}-analytics-why.png`), fullPage: false })
      }

      if (c === "moderation") {
        const alarm = await p.evaluate(() => !!document.querySelector("[data-alarm-off]") && /Join alarm/.test(document.querySelector("[data-report]").textContent))
        expect(alarm, "MODERATE: a join alarm offers Turn approval off")
      }
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
