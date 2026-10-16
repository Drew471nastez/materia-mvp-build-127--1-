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
 *   GA          Google Analytics says connected with its ID, under Traffic; not
 *               connected, it is not mentioned (round 33)
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
            traffic: trend("traffic"),
            activity: trend("activity"),
            content: trend("content"),
            money: trend("money"),
            lists,
            pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            wide,
            ga: ga ? { state: ga.getAttribute("data-ga"), text: ga.textContent.trim().slice(0, 140) } : null,
            notice: document.querySelector("[role=alert], [role=status], [data-notice]")?.textContent ?? [...document.querySelectorAll("p")].find((x) => /could not be loaded/.test(x.textContent))?.textContent ?? null,
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

      /*
        Changed on purpose (round 33): the section is an overview and five sections (Growth, Traffic, Engagement,
        Content, Revenue), one on screen at a time, so each chart and list is measured with its own section chosen;
        Growth's visits and join rate are Traffic's chart now, Activity is Engagement and Content, and Google
        Analytics is one line under Traffic when connected and not mentioned when it is not
        (scripts/check-community-analytics-round33.mjs measures the overview and the sections themselves).
      */
      const show = async (section) => {
        await p.evaluate((s) => document.querySelector(`[data-section-tab="${s}"]`)?.click(), section)
        await sleep(700)
        return look()
      }
      let m = await look()
      expect(m.pageScroll <= 0 && m.wide === 0, "nothing scrolls sideways on the page", { pageScroll: m.pageScroll, wide: m.wide })

      if (data === "full") {
        const lists = {}
        const taps = []
        const seen = {}
        for (const s of ["growth", "traffic", "engagement", "content", "revenue"]) {
          const x = await show(s)
          Object.assign(lists, x.lists)
          taps.push(...x.smallTaps)
          seen[s] = x
          expect(x.pageScroll <= 0 && x.wide === 0, `${s}: nothing scrolls sideways on the page`, { pageScroll: x.pageScroll, wide: x.wide })
        }
        const g = seen.growth.growth
        expect(g?.loading === "false" && g.shape > 10, "Growth draws a line with a shape", g && { loading: g.loading, shape: g.shape })
        expect(g?.compared === true, "and the dashed period before it", g?.compared)
        expect(seen.traffic.traffic?.loading === "false" && seen.traffic.traffic.shape > 10, "Traffic draws a line with a shape", seen.traffic.traffic && seen.traffic.traffic.shape)
        expect(seen.engagement.activity?.loading === "false" && seen.engagement.activity.shape > 10, "Engagement draws a line with a shape", seen.engagement.activity && seen.engagement.activity.shape)
        expect(seen.content.content?.loading === "false" && seen.content.content.shape > 10, "Content draws a line with a shape", seen.content.content && seen.content.content.shape)
        expect(seen.revenue.money?.loading === "false" && seen.revenue.money.shape > 5, "Paid memberships draws a line with a shape", seen.revenue.money && seen.revenue.money.shape)
        expect(g?.tabs.map((t) => t.tab).join() === "members,joined,left,churn", "Growth's figures: members, joined, left, member churn", g?.tabs.map((t) => t.tab))
        expect(seen.traffic.traffic?.tabs.map((t) => t.tab).join() === "visits,prospects,joinRate", "Traffic's figures: visits, from non-members, join rate", seen.traffic.traffic?.tabs.map((t) => t.tab))
        expect(seen.engagement.activity?.tabs.map((t) => t.tab).join() === "active,engagement,rsvps,lessons", "Engagement's figures: active, engagement, RSVPs, lessons", seen.engagement.activity?.tabs.map((t) => t.tab))
        expect(seen.content.content?.tabs.map((t) => t.tab).join() === "posts,comments,reactions", "Content's figures: posts, comments, reactions", seen.content.content?.tabs.map((t) => t.tab))
        expect(seen.revenue.money?.tabs.map((t) => t.tab).join() === "revenue,mrr,subscribers,newPaid,cancellations", "Money's figures: revenue, monthly revenue, subscribers, new, cancellations", seen.revenue.money?.tabs.map((t) => t.tab))
        expect(g.dates.length >= 3, "the chart has dates along it", g.dates.slice(0, 4))
        for (const card of ["traffic", "countries", "devices", "joins", "new-returning", "leave-reasons", "posts", "spaces", "contributors", "cohorts", "invites", "events", "programs"]) expect((lists[card]?.rows ?? 0) > 0, `the ${card} list has rows`, lists[card])
        expect(seen.traffic.ga?.state === "connected" && /G-7XK2Q9PL0D/.test(seen.traffic.ga.text), "Google Analytics says it is connected, with its ID, under Traffic", seen.traffic.ga)
        if (phone) {
          const own = taps.filter((x) => !x.shared)
          expect(own.length === 0, "every figure tab, section tab, post, list row link and button of the section is 40px or more", own.slice(0, 6))
          console.log(`  note  shared /app Analytics controls under 40px, as on /app Analytics: ${JSON.stringify([...new Set(taps.filter((x) => x.shared).map((x) => `${x.t} ${x.h}px`))])}`)
        }
        m = await show("growth")
        await p.screenshot({ path: join(shots, `${label}-${c}-top.png`) })
        await p.screenshot({ path: join(shots, `${label}-${c}-full.png`), fullPage: true })

        /* A figure tab moves its chart. */
        m = await show("traffic")
        const before = m.traffic.path
        await p.click('[data-trend="traffic"] [data-tab="prospects"]')
        await sleep(900)
        m = await look()
        expect(m.traffic.chartFor === "prospects" && m.traffic.tabs.find((t) => t.tab === "prospects")?.sel === "true", "From non-members moves the Traffic chart to it", m.traffic.chartFor)
        expect(m.traffic.shape > 10 && m.traffic.path !== before, "and redraws its line", { shape: m.traffic.shape, changed: m.traffic.path !== before })
        expect(/Counted since/.test(m.traffic.note ?? ""), "with the day counting began under it", m.traffic.note)
        await show("revenue")
        await p.click('[data-trend="money"] [data-tab="cancellations"]')
        await sleep(500)
        const why = await p.$$eval('[data-revenue-detail="cancellations"] [data-row-key]', (els) => els.map((e) => e.getAttribute("data-row-key")))
        expect(why.join() === "too_busy,too_expensive,none", "Cancellations lists why, by reason", why)
      }

      if (c === "period") {
        m = await show("growth")
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
        expect(m.growth.tabs.map((t) => t.tab).join() === "members,joined,left,churn", "before part 184 Growth has its four figures, none of them visits", m.growth.tabs.map((t) => t.tab))
        expect(!m.lists.cohorts && !m.lists["new-returning"], "and no retention or new and returning list without the part", Object.keys(m.lists))
        const e = await show("engagement")
        expect(e.activity.tabs.map((t) => t.tab).join() === "active", "Engagement has active members alone: no engagement, RSVPs or lessons", e.activity.tabs.map((t) => t.tab))
        expect(!e.lists.contributors, "no contributor list without the part", Object.keys(e.lists))
        expect(!(await p.$('[data-section-tab="revenue"]')), "nothing sold: no Revenue section")
        const t = await show("traffic")
        expect(t.traffic === null && /SQL part 184/.test(t.notice ?? ""), "Traffic says how to count visits, with no empty chart", { trend: t.traffic, notice: t.notice })
        expect(t.ga === null, "Google Analytics not connected: not mentioned", t.ga)
        await p.screenshot({ path: join(shots, `${label}-${c}.png`), fullPage: true })
      }

      if (c === "quiet") {
        expect(m.growth.loading === "false", "a quiet period still draws its chart", m.growth.loading)
        m = await show("traffic")
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
