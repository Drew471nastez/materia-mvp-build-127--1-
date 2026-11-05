/**
 * ===========================================================================
 *  EMAILS ON A PHONE, ROUND 24: ORDERS' ROWS, ANALYTICS' PILLS
 * The owner's round 24: the Emails page redesigned "like Orders, with the
 * pill shapes of the analytics", on a phone and a computer. The page is
 * built and served as scripts/check-emails-page.mjs builds it (the same
 * stand-ins, copied from there), at 390 and 1440 wide, and measured:
 *
 *   - the views are one track with a white pill that slides to the one
 *     pressed, and the track never makes the page scroll sideways;
 *   - on a phone each subscriber, message and email is a row of its own at
 *     Orders' sizes (17 / 15 / 14px), no table to swipe; a computer keeps
 *     the table;
 *   - a finger that lands on a row and scrolls never darkens it.
 *
 *   node scripts/check-emails-r24.mjs      (SHOTS_DIR=... keeps the pictures)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const stubs = join(root, ".emails-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-emails-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.test"
const RUNS_DELAY_MS = 120

try {
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `const LATENCY = 150
const subscribers = Array.from({ length: 73 }, (_, i) => ({
  id: "s" + i,
  email: i === 3 ? "a-very-long-address-that-goes-on@studio-with-a-long-domain-name.com" : "person" + i + "@example.com",
  name: i % 3 === 0 ? "" : "Person " + i,
  source: i % 2 ? "onepage" : "store_builder",
  status: i % 9 === 0 ? "unsubscribed" : i % 10 === 7 ? "customer" : "subscribed",
  subscribed_at: new Date(Date.parse("2026-09-01") - i * 86400000).toISOString(),
  unsubscribed_at: i % 13 === 0 ? "2026-08-01T00:00:00Z" : null,
}))
const flows = [
  { id: "f1", name: "Welcome", trigger_type: "new_subscriber", status: "active", steps: [{ id: "a", type: "email", config: { subject: "Hi", body: "<p>Hi</p>" } }], updated_at: "2026-09-01T00:00:00Z" },
  { id: "f2", name: "Thank you for buying", trigger_type: "purchase", status: "paused", steps: [], updated_at: "2026-09-01T00:00:00Z" },
]
const tables = { creators: { id: "cr-1" }, subscribers, products: [{ id: "p1" }], orders: [{ buyer_email: "buyer@example.com" }, { buyer_email: "person1@example.com" }], email_flows: flows }
const RUNS = {
  "person1@example.com": [
    { id: "r1", status: "active", exit_reason: null, started_at: "2026-09-20T10:00:00Z", flow_id: "f1", email_flows: { name: "Welcome" } },
    { id: "r2", status: "completed", exit_reason: null, started_at: "2026-09-02T10:00:00Z", flow_id: "f2", email_flows: { name: "Thank you for buying" } },
  ],
}
function from(table) {
  let eqValue = null
  const q = {
    select() { return q }, eq(_c, v) { eqValue = v; return q }, in() { return q }, order() { return q }, delete() { return q }, update() { return q },
    /* A contact's automation runs (app/(storelib)/app/emails/contact-detail.tsx), answered late. */
    limit() {
      if (table !== "email_flow_runs") return q
      ;(window.__runsAsked = window.__runsAsked || []).push(eqValue)
      return new Promise((r) => setTimeout(() => r({ data: RUNS[eqValue] || [], error: null }), ${RUNS_DELAY_MS}))
    },
    maybeSingle() { window.__requests.push({ method: "SUPABASE", url: table, at: performance.now() }); return new Promise((r) => setTimeout(() => r({ data: tables[table] ?? null, error: null }), LATENCY)) },
    then(res, rej) { window.__requests.push({ method: "SUPABASE", url: table, at: performance.now() }); return new Promise((r) => setTimeout(() => r({ data: tables[table] ?? [], error: null }), LATENCY)).then(res, rej) },
  }
  return q
}
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }) },
    from,
    rpc: () => new Promise((r) => setTimeout(() => r({ data: [{ flow_id: "f1", sent: 412, opened: 252, clicked: 40, failed: 0, in_progress: 6 }], error: null }), LATENCY)),
  }
}
`,
  )
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useSyncExternalStore } from "react"
const listeners = new Set()
const notify = () => listeners.forEach((l) => l())
for (const m of ["pushState", "replaceState"]) {
  const orig = history[m].bind(history)
  history[m] = (...a) => { orig(...a); notify() }
}
window.addEventListener("popstate", notify)
window.__nav = []
const router = { push(u) { window.__nav.push("push " + u) }, replace(u) { window.__nav.push("replace " + u) }, prefetch(u) { window.__nav.push("prefetch " + u) }, back() {}, refresh() {} }
export const useRouter = () => router
export const usePathname = () => location.pathname
export function useSearchParams() {
  const s = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => location.search)
  return new URLSearchParams(s)
}
export function redirect() {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default function Link({ href, children, prefetch, onClick, ...rest }) {
  return React.createElement("a", { href, ...rest, onClick: (e) => { e.preventDefault(); window.__nav.push("link " + href); onClick && onClick(e) } }, children)
}
`,
  )
  execFileSync(
    "npx",
    [
      "esbuild",
      "scripts/render-emails-probe.tsx",
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      /* A module that reads another public setting at run time finds an empty one, as Next leaves it. */
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      /* The Customer emails tab draws previews with the receipt's template, which reads this one (Next inlines it). */
      "--define:process.env.NEXT_PUBLIC_APP_URL=undefined",
      "--alias:@=.",
      "--alias:@/lib/supabase/client=./.emails-probe/supabase-client.js",
      "--alias:next/navigation=./.emails-probe/navigation.js",
      "--alias:next/link=./.emails-probe/link.jsx",
      `--outfile=${join(stubs, "app.js")}`,
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

  async function openPage(vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.goto(`${ORIGIN}/app/emails`)
    await p.waitForSelector("[data-tab-content] [data-contact-row]", { timeout: 8000 }).catch(() => fail(`No rows drawn. Errors on the page: ${errors.join(" | ") || "none"}`))
    await sleep(500)
    return { p, errors }
  }

  for (const [name, vp] of [["phone 390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["computer 1440", { width: 1440, height: 900 }]]) {
    console.log(`\n${name}`)
    const phone = vp.width < 640
    const { p, errors } = await openPage(vp)
    await p.screenshot({ path: join(shots, `${name.replace(" ", "-")}-subscribers.png`) })

    const tabs = await p.evaluate(() => {
      const track = document.querySelector("[data-email-tabs] [data-segmented-pills]")
      const pill = track?.querySelector("span[aria-hidden]")
      const on = track?.querySelector("[aria-selected=true]")
      const r = (e) => e?.getBoundingClientRect()
      return { track: !!track, radius: track ? getComputedStyle(track).borderTopLeftRadius : null, pill: pill ? { left: Math.round(r(pill).left), width: Math.round(r(pill).width) } : null, on: on ? { left: Math.round(r(on).left), width: Math.round(r(on).width) } : null, pageWide: document.documentElement.scrollWidth - innerWidth }
    })
    expect(tabs.track && parseFloat(tabs.radius) >= 20, "the views are a rounded track", tabs.radius)
    expect(!!tabs.pill && !!tabs.on && Math.abs(tabs.pill.left - tabs.on.left) <= 1 && Math.abs(tabs.pill.width - tabs.on.width) <= 1, "its white pill sits under the chosen view", tabs)
    expect(tabs.pageWide <= 0, "the page never scrolls sideways", tabs.pageWide)

    /* Press Messages: the pill follows it. */
    await p.evaluate(() => document.querySelector('[data-email-tabs] [data-tab="messages"]').click())
    await sleep(450)
    const moved = await p.evaluate(() => {
      const pill = document.querySelector("[data-email-tabs] [data-segmented-pills] > span[aria-hidden]").getBoundingClientRect()
      const on = document.querySelector('[data-email-tabs] [data-tab="messages"]').getBoundingClientRect()
      return { pill: Math.round(pill.left), on: Math.round(on.left), selected: document.querySelector('[data-email-tabs] [data-tab="messages"]').getAttribute("aria-selected"), url: location.search }
    })
    expect(moved.selected === "true" && Math.abs(moved.pill - moved.on) <= 1, "pressing Messages moves the pill to it", moved)
    await p.evaluate(() => document.querySelector('[data-email-tabs] [data-tab="subscribers"]').click())
    await sleep(450)

    const rows = await p.evaluate(() => {
      const shown = (e) => !!e && e.getClientRects().length > 0
      const li = [...document.querySelectorAll("[data-email-phone-row]")].filter(shown)
      const table = [...document.querySelectorAll("[data-tab-content] table")].some(shown)
      const first = li[0]
      const size = (sel) => { const e = first?.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : null }
      return { phoneRows: li.length, table, head: size(".text-\\[17px\\]"), line: size(".text-\\[15px\\]"), meta: size(".text-\\[14px\\]"), height: first ? Math.round(first.getBoundingClientRect().height) : null }
    })
    if (phone) {
      expect(rows.phoneRows > 0 && !rows.table, "a phone shows rows, not a table", rows)
      expect(rows.head === 17 && rows.meta === 14, "at Orders' sizes: 17px, then 14px", rows)
    } else expect(rows.phoneRows === 0 && rows.table, "a computer keeps the table", rows)

    if (phone) {
      /* A finger lands on a row and scrolls away at once: the row is never darkened. */
      const row = await p.$("[data-email-phone-row]")
      const box = await row.boundingBox()
      const cdp = await p.createCDPSession()
      const x = box.x + 40, y = box.y + box.height / 2
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
      const tint = []
      /* The moment between the finger landing and the scroll taking it: where the old row flashed. */
      await sleep(40)
      tint.push(await p.evaluate(() => getComputedStyle(document.querySelector("[data-email-phone-row]")).backgroundColor))
      for (let i = 1; i <= 6; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 30 }] })
        tint.push(await p.evaluate(() => getComputedStyle(document.querySelector("[data-email-phone-row]")).backgroundColor))
        await sleep(30)
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await sleep(200)
      tint.push(await p.evaluate(() => getComputedStyle(document.querySelector("[data-email-phone-row]")).backgroundColor))
      expect(tint.every((c) => c === "rgba(0, 0, 0, 0)" || c === "rgb(255, 255, 255)"), "a row under a scrolling finger stays as it is", [...new Set(tint)])
      await p.evaluate(() => document.querySelector("[data-tab-content]")?.closest(".orders-pane, .page-scroll")?.scrollTo?.(0, 0))

      for (const view of ["messages", "flows", "published"]) {
        await p.evaluate((v) => document.querySelector(`[data-email-tabs] [data-tab="${v}"]`).click(), view)
        await sleep(900)
        await p.screenshot({ path: join(shots, `${name.replace(" ", "-")}-${view}.png`) })
      }
      const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      expect(wide <= 0, "no view makes the page scroll sideways", wide)
    }
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   pictures: ${shots}`)
process.exit(broken ? 1 : 0)
