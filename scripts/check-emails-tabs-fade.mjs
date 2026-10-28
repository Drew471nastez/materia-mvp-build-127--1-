/**
 * ===========================================================================
 *  EMAILS ON A PHONE: THE VIEWS FADE INSTEAD OF BEING CUT, NO TRY PRO, A PULL
 * ===========================================================================
 * The whole Emails page (scripts/render-emails-probe.tsx, the stand-ins
 * copied from scripts/check-emails-r24.mjs) at 320, 390 and 430 wide with
 * touch, and 1280 for a computer, measured:
 *
 *   VIEWS     every label the track's edge cuts is under a fade on that
 *             side, and a side that fades has something hidden behind it;
 *             the chosen view, pressed one by one, is whole and clear of
 *             either fade; at the end of the row only the start fades
 *   TOP       no Try Pro strip on a phone (none drawn, 0px), so the bar
 *             with the title starts at the very top of the pane; from md the
 *             strip is there at 40px
 *   PULL      a finger pulled down from the top reads the open view again
 *             and the spinner is gone again soon after the rows come back
 *
 *   node scripts/check-emails-tabs-fade.mjs      (SHOTS_DIR=... keeps the pictures)
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

const stubs = join(root, ".emails-fade-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-emails-fade-")), "shots")
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
    /* A contact's automation runs (app/app/emails/contact-detail.tsx), answered late. */
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
      "--alias:@/lib/supabase/client=./.emails-fade-probe/supabase-client.js",
      "--alias:next/navigation=./.emails-fade-probe/navigation.js",
      "--alias:next/link=./.emails-fade-probe/link.jsx",
      `--outfile=${join(stubs, "app.js")}`,
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}#app{height:100vh}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  /* The fade's width, app/globals.css .edge-fade. */
  const FADE = 24

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

  /* Every label against the track's edges, and what the mask says at each end. */
  const readTrack = (p) =>
    p.evaluate((FADE) => {
      const t = document.querySelector("[data-email-tabs] [data-segmented-pills]")
      const tr = t.getBoundingClientRect()
      const mask = getComputedStyle(t).maskImage || getComputedStyle(t).webkitMaskImage || "none"
      const hiddenLeft = t.scrollLeft > 1
      const hiddenRight = t.scrollLeft + t.clientWidth < t.scrollWidth - 1
      const cs = getComputedStyle(t)
      const fadeStart = t.hasAttribute("data-fade-start") && mask !== "none" && cs.getPropertyValue("--fade-l").trim() === FADE + "px"
      const fadeEnd = t.hasAttribute("data-fade-end") && mask !== "none" && cs.getPropertyValue("--fade-r").trim() === FADE + "px"
      const cut = []
      for (const b of t.querySelectorAll("[role=tab]")) {
        const r = b.getBoundingClientRect()
        if (r.left < tr.left - 0.5 && r.right > tr.left + 0.5) cut.push({ tab: b.dataset.tab, side: "start", shown: Math.round(r.right - tr.left) })
        if (r.right > tr.right + 0.5 && r.left < tr.right - 0.5) cut.push({ tab: b.dataset.tab, side: "end", shown: Math.round(tr.right - r.left) })
      }
      const on = t.querySelector("[aria-selected=true]").getBoundingClientRect()
      const clearL = tr.left + (fadeStart ? FADE : 0) - 1
      const clearR = tr.right - (fadeEnd ? FADE : 0) + 1
      return {
        width: Math.round(tr.width),
        scroll: Math.round(t.scrollLeft),
        max: t.scrollWidth - t.clientWidth,
        hiddenLeft, hiddenRight, fadeStart, fadeEnd, mask: mask.slice(0, 90), cut,
        chosenClear: on.left >= clearL && on.right <= clearR,
        chosen: [Math.round(on.left - tr.left), Math.round(tr.right - on.right)],
        pageWide: document.documentElement.scrollWidth - innerWidth,
      }
    }, FADE)

  const summary = []
  for (const [name, vp] of [
    ["phone 320", { width: 320, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["phone 390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["phone 430", { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["computer 1280", { width: 1280, height: 860 }],
  ]) {
    console.log(`\n${name}`)
    const phone = vp.width < 768
    const { p, errors } = await openPage(vp)
    const tag = name.replace(" ", "-")

    /* TOP */
    const top = await p.evaluate(() => {
      const pane = document.querySelector("[data-emails-page] .orders-pane")
      const strips = [...document.querySelectorAll("[data-page-strip]")].map((s) => Math.round(s.getBoundingClientRect().height))
      const bar = document.querySelector("[data-orders-bar]")
      return { strips, gap: Math.round(bar.getBoundingClientRect().top - pane.getBoundingClientRect().top), scrollTop: pane.scrollTop }
    })
    if (phone) expect(top.strips.every((h) => h === 0) && top.gap === 0, "no Try Pro strip, and the title bar starts at the top of the pane", top)
    else expect(top.strips.length === 1 && top.strips[0] === 40 && top.gap === 40, "a computer keeps the strip, 40px, the bar under it", top)

    /* VIEWS */
    const judge = (label, s) => {
      const okCut = s.cut.every((c) => (c.side === "end" ? s.fadeEnd : s.fadeStart))
      const okSides = s.fadeStart === s.hiddenLeft && s.fadeEnd === s.hiddenRight
      expect(okCut && okSides, `${label}: every cut label is under a fade, and only a side with more fades`, { cut: s.cut, fadeStart: s.fadeStart, fadeEnd: s.fadeEnd, scroll: s.scroll, max: s.max })
      expect(s.chosenClear, `${label}: the chosen view is whole and clear of the fades`, s.chosen)
      expect(s.pageWide <= 0, `${label}: the page does not scroll sideways`, s.pageWide)
      return s
    }
    const first = judge("at rest", await readTrack(p))
    summary.push({ name, width: first.width, overflow: first.max, cutAtRest: first.cut, fades: [first.fadeStart, first.fadeEnd] })
    await p.screenshot({ path: join(shots, `${tag}-rest.png`), clip: { x: 0, y: 0, width: vp.width, height: 160 } })
    for (const view of ["messages", "flows", "customer", "published", "scheduled", "drafts", "flows", "subscribers"]) {
      await p.evaluate((v) => document.querySelector(`[data-email-tabs] [data-tab="${v}"]`).click(), view)
      await sleep(350)
      const s = judge(`chose ${view}`, await readTrack(p))
      if (view === "customer") await p.screenshot({ path: join(shots, `${tag}-customer.png`), clip: { x: 0, y: 0, width: vp.width, height: 160 } })
      if (view === "drafts" && phone) expect(!s.fadeEnd && s.fadeStart === s.hiddenLeft, "at the end of the row only the start fades", [s.fadeStart, s.fadeEnd])
    }
    if (phone) {
      /* A finger's scroll to the middle: both ends fade. */
      await p.evaluate(() => {
        const t = document.querySelector("[data-email-tabs] [data-segmented-pills]")
        t.scrollLeft = (t.scrollWidth - t.clientWidth) / 2
      })
      await sleep(100)
      /* The finger moved the row off the chosen view on purpose: only the fades are judged here. */
      const mid = await readTrack(p)
      expect(mid.fadeStart && mid.fadeEnd && mid.cut.every((c) => (c.side === "end" ? mid.fadeEnd : mid.fadeStart)), "in the middle both ends fade, over every cut label", { cut: mid.cut, fades: [mid.fadeStart, mid.fadeEnd] })
      await p.screenshot({ path: join(shots, `${tag}-middle.png`), clip: { x: 0, y: 0, width: vp.width, height: 160 } })
      await p.evaluate(() => (document.querySelector("[data-email-tabs] [data-segmented-pills]").scrollLeft = 0))
      await sleep(100)
    } else {
      const s = await readTrack(p)
      expect(s.max <= 0 && s.mask === "none", "a computer's row fits and has no mask", { max: s.max, mask: s.mask })
    }

    /* PULL */
    if (phone) {
      const before = await p.evaluate(() => window.__requests.length)
      const cdp = await p.createCDPSession()
      const x = Math.round(vp.width / 2), y0 = 230
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] })
      for (let i = 1; i <= 16; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + i * 12 }] })
        await sleep(16)
      }
      const held = await p.evaluate(() => {
        const c = document.querySelector("[data-emails-page] [data-pull-content]")
        return { phase: c?.dataset.ptrPhase ?? null, transform: c ? getComputedStyle(c).transform : null }
      })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      const t0 = Date.now()
      let settled = null
      while (Date.now() - t0 < 6000) {
        const phase = await p.evaluate(() => document.querySelector("[data-emails-page] [data-pull-content]")?.dataset.ptrPhase ?? "idle")
        if (phase === "idle" && Date.now() - t0 > 50) {
          settled = Date.now() - t0
          break
        }
        await sleep(20)
      }
      const asked = await p.evaluate((n) => window.__requests.slice(n).map((r) => r.url), before)
      expect(held.phase === "ready" || held.phase === "pulling", "the pull moves the page under the finger", held)
      expect(asked.length > 0, "letting go reads the open view again", asked.slice(0, 6))
      expect(settled !== null && settled < 1500, "and the spinner is gone again soon (ms after letting go)", settled)
      summary[summary.length - 1].pull = { requests: asked.length, settledMs: settled }
    }

    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    await p.close()
  }
  await browser.close()
  console.log("\nsummary")
  for (const s of summary) console.log(`  ${s.name.padEnd(14)} track ${s.width}px  overflow ${s.overflow}px  cut at rest ${JSON.stringify(s.cutAtRest)}  fades [start,end] ${JSON.stringify(s.fades)}${s.pull ? `  pull: ${s.pull.requests} reads, idle ${s.pull.settledMs}ms after release` : ""}`)
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   pictures: ${shots}`)
process.exit(broken ? 1 : 0)
