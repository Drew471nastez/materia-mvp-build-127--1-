/**
 * ===========================================================================
 *  ROUND 31: A COMMUNITY'S ANALYTICS, MEASURED
 * ===========================================================================
 * The real section (scripts/render-community-analytics-round31.tsx) at
 * 1440x900 and on a 390x844 phone, with the answer the API gives for the
 * period in the address:
 *
 *   CHARTS      the Growth, Activity and Paid memberships charts draw a line
 *               with a shape (not the grey placeholder) and the dashed period
 *               before it, under figure tabs with values
 *   TABS        a figure tab moves its chart to that figure
 *   PERIOD      choosing Last 7 days in the /app date picker asks for seven
 *               days and redraws the chart with seven dates
 *   LISTS       sources, countries, devices, joins, top posts, contributors,
 *               members who stayed, events and programs have rows
 *   BEFORE 184  no visits, sources or engagement are drawn, the lists that
 *               need the part say how to get them, nothing sold, no money
 *   GA          Google Analytics says connected with its ID, or offers Connect
 *   FITS        nothing scrolls sideways on the page; a phone's tab strips
 *               scroll inside themselves
 *   TAPS        on a phone every tab, link and button is 40px or more
 *
 *   node scripts/check-community-analytics-round31.mjs
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
const stubs = join(root, ".community-analytics-r31-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-analytics-")), "shots")
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
    `export const usePathname = () => "/app/community/c0000000-0000-4000-8000-000000000001/analytics"
const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })\n`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-analytics-round31.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-analytics-r31-probe/navigation.js", "next/link": "./.community-analytics-r31-probe/link.jsx", "next/image": "./.community-analytics-r31-probe/image.jsx" },
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
  const CASES = (process.env.CASES || "full,period,nopart,quiet,fail").split(",")
  for (const [label, vp] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const phone = label.startsWith("phone")
    for (const c of CASES) {
      console.log(`\n${label} ${c}`)
      /* Changed on purpose (round 32): a browser of its own for each case. Answers are kept per period in this browser's storage now (lib/communities/client/report-cache), and every case is the same community at the same address. */
      const ctx = await browser.createBrowserContext()
      const p = await ctx.newPage()
      await p.setViewport(vp)
      const errors = []
      p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      const data = c === "period" ? "full" : c
      await p.goto(`file://${join(stubs, "index.html")}?case=${data}`, { waitUntil: "load" })
      await sleep(1600)
      expect(errors.length === 0, "renders without an error", errors)

      /* What the page shows, measured. */
      const look = () =>
        p.evaluate(() => {
          const trend = (name) => {
            const card = document.querySelector(`[data-trend="${name}"]`)
            if (!card) return null
            const line = card.querySelector("[data-trend-line]")
            const d = line?.getAttribute("d") || ""
            const ys = [...d.matchAll(/[ML,\s]([\d.]+)[ ,]([\d.]+)/g)].map((m) => Number(m[2]))
            const tabs = [...card.querySelectorAll("[role=tab]")].map((t) => ({ tab: t.getAttribute("data-tab"), text: t.textContent.trim(), h: Math.round(t.getBoundingClientRect().height), sel: t.getAttribute("aria-selected") }))
            const dates = [...card.querySelectorAll(".recharts-cartesian-axis-tick-value")].map((t) => t.textContent)
            return {
              loading: card.querySelector("[data-chart-loading]")?.getAttribute("data-chart-loading"),
              shape: ys.length ? Math.round(Math.max(...ys) - Math.min(...ys)) : 0,
              path: d,
              compared: (card.querySelector("[data-trend-compared]")?.getAttribute("d") || "").length > 10,
              chartFor: card.querySelector("[data-chart-for]")?.getAttribute("data-chart-for"),
              tabs,
              dates,
              note: card.querySelector("[data-trend-note]")?.textContent ?? null,
            }
          }
          const lists = Object.fromEntries([...document.querySelectorAll("[data-card]")].map((el) => [el.getAttribute("data-card"), { rows: el.querySelectorAll("[data-row-key]").length, empty: el.querySelector("[data-empty]")?.textContent ?? null }]))
          const wide = [...document.querySelectorAll("body *")].filter((el) => {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.right <= document.documentElement.clientWidth + 1) return false
            for (let a = el.parentElement; a; a = a.parentElement) if (a.hasAttribute("data-scroll-x")) return false
            return true
          }).length
          const ga = document.querySelector("[data-ga]")
          return {
            growth: trend("growth"),
            activity: trend("activity"),
            money: trend("money"),
            lists,
            pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            wide,
            ga: ga ? { state: ga.getAttribute("data-ga"), text: ga.textContent.trim().slice(0, 140) } : null,
            notice: document.querySelector("[role=alert], [data-notice]")?.textContent ?? [...document.querySelectorAll("p")].find((x) => /could not be loaded/.test(x.textContent))?.textContent ?? null,
            asks: window.__asks.length,
            lastAsk: window.__asks[window.__asks.length - 1] ?? null,
            allAsks: window.__asks.slice(),
            smallTaps: [...document.querySelectorAll("[data-analytics] button, [data-analytics] a, [data-analytics] [role=tab]")]
              .filter((el) => el.getClientRects().length && el.closest("[data-analytics]"))
              /* /app Analytics' own picker button and report card tabs and "View all" are 32px there too: listed apart, not this section's to change. */
              .map((el) => ({ t: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height), shared: !!el.closest("[data-analytics-controls]") || (!!el.closest("[data-card]") && (el.closest("header") !== null || /^View all/.test((el.textContent || "").trim()))) }))
              .filter((x) => x.h < 40),
          }
        })

      let m = await look()
      expect(m.pageScroll <= 0 && m.wide === 0, "nothing scrolls sideways on the page", { pageScroll: m.pageScroll, wide: m.wide })

      if (data === "full") {
        expect(m.growth?.loading === "false" && m.growth.shape > 10, "Growth draws a line with a shape", m.growth && { loading: m.growth.loading, shape: m.growth.shape })
        expect(m.growth?.compared === true, "and the dashed period before it", m.growth?.compared)
        expect(m.activity?.loading === "false" && m.activity.shape > 10, "Activity draws a line with a shape", m.activity && m.activity.shape)
        expect(m.money?.loading === "false" && m.money.shape > 5, "Paid memberships draws a line with a shape", m.money && m.money.shape)
        expect(m.growth?.tabs.map((t) => t.tab).join() === "members,joined,left,visits,joinRate", "Growth's figures: members, joined, left, visits, join rate", m.growth?.tabs.map((t) => t.tab))
        expect(m.activity?.tabs.map((t) => t.tab).join() === "active,posts,comments,reactions,engagement", "Activity's figures: active, posts, comments, reactions, engagement", m.activity?.tabs.map((t) => t.tab))
        expect(m.money?.tabs.map((t) => t.tab).join() === "revenue,mrr,subscribers,newPaid,cancellations", "Money's figures: revenue, monthly revenue, subscribers, new, cancellations", m.money?.tabs.map((t) => t.tab))
        expect(m.growth.dates.length >= 3, "the chart has dates along it", m.growth.dates.slice(0, 4))
        for (const card of ["traffic", "countries", "devices", "joins", "posts", "contributors", "cohorts", "invites", "events", "programs"]) expect((m.lists[card]?.rows ?? 0) > 0, `the ${card} list has rows`, m.lists[card])
        expect(m.ga?.state === "connected" && /G-7XK2Q9PL0D/.test(m.ga.text), "Google Analytics says it is connected, with its ID", m.ga)
        if (phone) {
          const own = m.smallTaps.filter((x) => !x.shared)
          expect(own.length === 0, "every figure tab, post, list row link and button of the section is 40px or more", own.slice(0, 6))
          console.log(`  note  shared /app Analytics controls under 40px, as on /app Analytics: ${JSON.stringify(m.smallTaps.filter((x) => x.shared).map((x) => `${x.t} ${x.h}px`))}`)
        }
        await p.screenshot({ path: join(shots, `${label}-${c}-top.png`) })
        await p.screenshot({ path: join(shots, `${label}-${c}-full.png`), fullPage: true })

        /* A figure tab moves its chart. */
        const before = (await look()).growth.path
        await p.click('[data-trend="growth"] [data-tab="visits"]')
        await sleep(900)
        m = await look()
        expect(m.growth.chartFor === "visits" && m.growth.tabs.find((t) => t.tab === "visits")?.sel === "true", "Visits moves the Growth chart to visits", m.growth.chartFor)
        expect(m.growth.shape > 10 && m.growth.path !== before, "and redraws its line", { shape: m.growth.shape, changed: m.growth.path !== before })
        expect(/Counted since/.test(m.growth.note ?? ""), "with the day counting began under it", m.growth.note)
        await p.click('[data-trend="money"] [data-tab="cancellations"]')
        await sleep(500)
        const why = await p.$$eval('[data-revenue-detail="cancellations"] [data-row-key]', (els) => els.map((e) => e.getAttribute("data-row-key")))
        expect(why.join() === "too_busy,too_expensive,none", "Cancellations lists why, by reason", why)
      }

      if (c === "period") {
        const asked = m.asks
        const datesBefore = m.growth.dates.length
        await p.click("[data-analytics-controls] button")
        await sleep(phone ? 700 : 350)
        await p.click('[data-row="last_7_days"]')
        await sleep(phone ? 1600 : 1100)
        m = await look()
        /* Changed on purpose (round 32): opening the picker asks for its usual periods ahead, so the seven days are one of the asks, not always the last. */
        const spans = m.allAsks.slice(asked).map((a) => { const q = new URLSearchParams(a); return (Date.parse(q.get("end")) - Date.parse(q.get("start"))) / 86_400_000 })
        const days = spans.find((d) => d > 6 && d <= 7) ?? spans[spans.length - 1] ?? 0
        expect(m.asks > asked && days > 6 && days <= 7, "Last 7 days asks for seven days", { asks: m.asks, days: Math.round(days * 10) / 10 })
        expect(m.growth.loading === "false" && m.growth.dates.length > 0 && m.growth.dates.length !== datesBefore, "and the chart redraws with its dates", { before: datesBefore, after: m.growth.dates.length, dates: m.growth.dates })
        expect(/range=last_7_days/.test(await p.evaluate(() => location.search)), "the period is kept in the address", await p.evaluate(() => location.search))
        await p.screenshot({ path: join(shots, `${label}-${c}.png`) })
      }

      if (c === "nopart") {
        expect(m.growth.tabs.map((t) => t.tab).join() === "members,joined,left", "before part 184 Growth has no visits or join rate", m.growth.tabs.map((t) => t.tab))
        expect(!m.activity.tabs.some((t) => t.tab === "engagement"), "and Activity no engagement", m.activity.tabs.map((t) => t.tab))
        expect(m.money === null, "nothing sold: no money chart", m.money)
        expect(/SQL part 184/.test(m.lists.traffic?.empty ?? ""), "sources say how to get them", m.lists.traffic)
        expect(!m.lists.contributors && !m.lists.cohorts, "no contributor or retention list without the part", Object.keys(m.lists))
        expect(m.ga?.state === "off" && /Connect/.test(m.ga.text), "Google Analytics offers Connect", m.ga)
        await p.screenshot({ path: join(shots, `${label}-${c}.png`), fullPage: true })
      }

      if (c === "quiet") {
        expect(m.growth.loading === "false", "a quiet period still draws its chart", m.growth.loading)
        expect((m.lists.traffic?.rows ?? 1) === 0 && !!m.lists.traffic?.empty, "the lists say there was nothing", m.lists.traffic)
        await p.screenshot({ path: join(shots, `${label}-${c}.png`), fullPage: true })
      }

      if (c === "fail") {
        expect(/could not be loaded/.test(m.notice ?? ""), "a failed answer says so", m.notice)
        await p.screenshot({ path: join(shots, `${label}-${c}.png`) })
      }
      await ctx.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
