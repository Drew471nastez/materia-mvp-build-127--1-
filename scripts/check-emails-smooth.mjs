/**
 * ===========================================================================
 *  EMAILS, ROUND 28: TABS WITHOUT A FLASH, A BAR THAT SCROLLS AWAY, FAMILIES
 *  THAT FILTER IN PLACE, AN EDITOR THAT OPENS AT ONCE, A CONTACT AND BACK
 * ===========================================================================
 * The whole Emails page (scripts/render-emails-smooth-probe.tsx) in headless
 * Chromium at 1280 wide (and 390 for the bar), against a stand-in server whose
 * routes wait as long as each case says. Every frame of a switch is sampled
 * (requestAnimationFrame) and judged:
 *
 *   BLANK      a frame where the table card has no rows, no empty state and
 *              no visible skeleton: the flash this round is about. Must be 0.
 *   HELD       the last tab's rows still drawn while the chosen one reads
 *   SKELETON   a frame with a visible skeleton (only a read slower than the
 *              hold, 300ms, may show one)
 *   OPACITY    the lowest opacity the content had during the crossfade
 *              (never below 0.5: no fade from nothing)
 *   READY      ms from the click to the chosen tab's own rows
 *
 *   BAR        scrolled 600px, the title bar is above the pane's top (it is
 *              not sticky), on a computer and a phone
 *   FAMILIES   All / Digital / Physical on Customer emails: the list is the
 *              same element after a switch (not remounted), no frame below
 *              0.9 opacity, the chips have no grey track
 *   EDITOR     an email opened from the list: the dialog's fields are there
 *              in the first frames, the preview arrives (ms)
 *   CONTACT    a subscriber opened from 1500px down and closed with Back:
 *              the list's scroll is where it was, the contact page shows
 *              the purchases card
 *
 *   node scripts/check-emails-smooth.mjs      (SHOTS_DIR=... keeps the pictures)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { loadavg, tmpdir } from "node:os"
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

const stubs = join(root, ".emails-smooth-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-emails-smooth-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.test"
/* Thresholds for a machine shared with other work (os.loadavg is printed): the bar's answer and a cached tab's draw. */
const BAR_MS = 80
const READY_MS = 400
const ROWS = "[data-contact-row],[data-message-row],[data-flow-row],[data-campaign-row],[data-customer-email]"

try {
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
const router = { push(u) { window.__nav.push("push " + u) }, replace(u) { window.__nav.push("replace " + u) }, prefetch(u) { window.__nav.push("prefetch " + u) }, back() { history.back() }, refresh() {} }
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
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }) }, from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (r) => Promise.resolve({ data: [], error: null }).then(r) }; return q } } }`)
  execFileSync(
    "npx",
    [
      "esbuild",
      "scripts/render-emails-smooth-probe.tsx",
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      "--define:process.env.NEXT_PUBLIC_APP_URL=undefined",
      "--alias:@=.",
      "--alias:@/lib/supabase/client=./.emails-smooth-probe/supabase-client.js",
      "--alias:next/navigation=./.emails-smooth-probe/navigation.js",
      "--alias:next/link=./.emails-smooth-probe/link.jsx",
      `--outfile=${join(stubs, "app.js")}`,
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const page = (delays, defaultDelay) =>
    `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}#app{height:100vh}</style><script>window.__delays=${JSON.stringify(delays)};window.__defaultDelay=${defaultDelay};</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

  async function openPage(vp, { delays = {}, defaultDelay = 150, path = "/app/emails" } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.setRequestInterception(true)
    const html = page(delays, defaultDelay)
    p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.goto(`${ORIGIN}${path}`)
    await p.waitForSelector("[data-tab-content] " + ROWS, { timeout: 10000 }).catch(() => fail(`No rows drawn. Errors on the page: ${errors.join(" | ") || "none"}`))
    /* The frame sampler: one record per frame while it runs. */
    await p.evaluate((ROWS) => {
      window.__sample = (ms) =>
        new Promise((resolve) => {
          const out = []
          const t0 = performance.now()
          /* The longest task the main thread ran in the window: the draw of the new tab, mostly. */
          let longest = 0
          const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => (longest = Math.max(longest, e.duration))))
          try { po.observe({ type: "longtask" }) } catch {}
          const tick = () => {
            const content = document.querySelector("[data-tab-content]")
            const table = content?.querySelectorAll(":scope > section")[1]
            const rows = table ? table.querySelectorAll(ROWS).length : 0
            const empty = table ? table.querySelectorAll(".items-center.text-center p").length : 0
            const skeleton = [...(table?.querySelectorAll("[data-shimmer]") ?? [])].some((s) => parseFloat(getComputedStyle(s).opacity) > 0.05 && s.getBoundingClientRect().height > 0)
            out.push({ t: Math.round(performance.now() - t0), chosen: document.querySelector('[data-email-tabs] [aria-selected="true"]')?.getAttribute("data-tab") ?? null, tab: content?.getAttribute("data-tab-content"), pending: content?.getAttribute("data-tab-pending") ?? null, rows, empty, skeleton, opacity: content ? parseFloat(getComputedStyle(content).opacity) : 0 })
            if (performance.now() - t0 < ms) requestAnimationFrame(tick)
            else {
              po.disconnect()
              resolve({ list: out, longest: Math.round(longest) })
            }
          }
          requestAnimationFrame(tick)
        })
    }, ROWS)
    return { p, errors }
  }

  /** Click a tab and sample every frame for `ms`; judged against the tab chosen. */
  async function switchTo(p, tab, ms = 900, { hoverFirst = 0 } = {}) {
    if (hoverFirst) {
      await p.hover(`[data-email-tabs] [data-tab="${tab}"]`)
      await sleep(hoverFirst)
    }
    const sampling = p.evaluate((ms) => window.__sample(ms), ms)
    /* How long the click itself held the main thread: React draws a click's update before the click returns. */
    const clickMs = await p.evaluate((tab) => {
      const t0 = performance.now()
      document.querySelector(`[data-email-tabs] [data-tab="${tab}"]`).click()
      return Math.round(performance.now() - t0)
    }, tab)
    const sampled = await sampling
    const frames = sampled.list
    const blank = frames.filter((f) => f.rows === 0 && f.empty === 0 && !f.skeleton)
    const held = frames.filter((f) => f.tab !== tab && f.rows > 0)
    const skel = frames.filter((f) => f.skeleton)
    const ready = frames.find((f) => f.tab === tab && (f.rows > 0 || f.empty > 0))
    const bar = frames.find((f) => f.chosen === tab)
    return { barMs: bar ? bar.t : null, clickMs, longestTask: sampled.longest, frames: frames.length, blank: blank.length, held: held.length, skeletonFrames: skel.length, minOpacity: Math.min(...frames.map((f) => f.opacity)), readyMs: ready ? ready.t : null, firstBlank: blank[0] ?? null }
  }

  const DESK = { width: 1280, height: 860 }
  const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  const TABS = ["messages", "flows", "customer", "published", "scheduled", "drafts", "subscribers"]
  const summary = []

  /* ── 1. Warm: every tab read ahead while idle, then switched through ── */
  console.log("\nWARM: the tabs read ahead while the page was idle (150ms a read)")
  {
    const { p, errors } = await openPage(DESK)
    await sleep(2500)
    for (const tab of TABS) {
      const r = await switchTo(p, tab, 500)
      /* The bar answers in a frame or two; the rows are drawn from the cache with no request waited on, as fast as the machine draws them (READY_MS, generous: this runs beside other work). */
      expect(r.blank === 0 && r.barMs !== null && r.barMs <= BAR_MS && r.readyMs !== null && r.readyMs <= READY_MS && r.skeletonFrames === 0 && r.minOpacity >= 0.5, `${tab}: bar ${r.barMs}ms, rows ${r.readyMs}ms, no blank frame, no skeleton, never below 0.5 opacity`, { barMs: r.barMs, readyMs: r.readyMs, longestTask: r.longestTask, blank: r.blank, skeleton: r.skeletonFrames, minOpacity: +r.minOpacity.toFixed(2) })
      summary.push({ case: "warm", tab, ...r })
    }
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2))
    await p.close()
  }

  /* ── 2. Cold and quick: a read of 220ms, under the hold ── */
  console.log("\nCOLD, A QUICK READ (220ms): the last tab's rows stay until the next tab's come, no skeleton")
  {
    const { p, errors } = await openPage(DESK, { delays: { "/api/email/area?part=flows": 220, "/api/email/campaigns?status=draft": 220 }, defaultDelay: 150 })
    /* Before the idle read ahead has reached them: switched at once. */
    for (const tab of ["flows", "drafts"]) {
      const asked = await p.evaluate((u) => window.__requests.some((r) => r.url.startsWith(u)), tab === "flows" ? "/api/email/area?part=flows" : "/api/email/campaigns?status=draft")
      const r = await switchTo(p, tab, 800)
      /* Held while its read was on its way; a read the idle read ahead had already finished needs no hold. */
      expect(r.blank === 0 && r.barMs <= BAR_MS && r.skeletonFrames === 0 && r.readyMs !== null && r.readyMs <= 220 + READY_MS, `${tab}: held the last rows ${r.held} frames, no skeleton, no blank, ready in ${r.readyMs}ms`, { readAheadStarted: asked, readyMs: r.readyMs, held: r.held, blank: r.blank, skeleton: r.skeletonFrames })
      summary.push({ case: "cold 220ms", tab, ...r })
    }
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2))
    await p.close()
  }

  /* ── 3. Cold and slow: a read of 1400ms, past the hold ── */
  console.log("\nCOLD, A SLOW READ (1400ms): the last rows for 300ms, then the table's own skeleton, never blank")
  {
    const { p, errors } = await openPage(DESK, { delays: { "/api/email/stats": 1400 }, defaultDelay: 150 })
    const r = await switchTo(p, "published", 2000)
    expect(r.blank === 0 && r.held > 0 && r.skeletonFrames > 0 && r.readyMs !== null, `published: held ${r.held} frames, skeleton ${r.skeletonFrames} frames, no blank frame, ready in ${r.readyMs}ms`, { readyMs: r.readyMs, held: r.held, blank: r.blank, skeleton: r.skeletonFrames, firstBlank: r.firstBlank })
    summary.push({ case: "cold 1400ms", tab: "published", ...r })
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2))
    await p.close()
  }

  /* ── 4. Hover first: a pointer resting on a tab reads it ahead ── */
  console.log("\nHOVER, THEN CLICK 180ms LATER (a 160ms read)")
  {
    const { p } = await openPage(DESK, { delays: { "/api/email/area?part=messages": 160 }, defaultDelay: 150 })
    const r = await switchTo(p, "messages", 600, { hoverFirst: 180 })
    expect(r.blank === 0 && r.readyMs !== null && r.readyMs <= READY_MS && !r.skeletonFrames, `messages: ready ${r.readyMs}ms after the click, read during the hover`, { readyMs: r.readyMs, held: r.held })
    summary.push({ case: "hover first", tab: "messages", ...r })
    await p.close()
  }

  /* ── 5. The bar scrolls away ── */
  console.log("\nBAR: not sticky")
  for (const [name, vp] of [["computer 1280", DESK], ["phone 390", PHONE]]) {
    const { p } = await openPage(vp)
    const at = await p.evaluate(async () => {
      const pane = document.querySelector("[data-emails-page] .orders-pane")
      const bar = document.querySelector("[data-orders-bar]")
      const before = Math.round(bar.getBoundingClientRect().top - pane.getBoundingClientRect().top)
      pane.scrollTop = 600
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const after = Math.round(bar.getBoundingClientRect().bottom - pane.getBoundingClientRect().top)
      return { before, barBottomAfter600: after, position: getComputedStyle(bar).position, scrollTop: pane.scrollTop }
    })
    expect(at.position !== "sticky" && at.barBottomAfter600 < 0, `${name}: scrolled 600px, the title, buttons and tabs are above the pane (bar bottom ${at.barBottomAfter600}px)`, at)
    await p.screenshot({ path: join(shots, `bar-${name.replace(" ", "-")}-scrolled.png`) })
    /* A switch with the bar half in view does not move the scroll. */
    const kept = await p.evaluate(async () => {
      const pane = document.querySelector("[data-emails-page] .orders-pane")
      pane.scrollTop = 30
      await new Promise((r) => requestAnimationFrame(r))
      document.querySelector('[data-email-tabs] [data-tab="drafts"]').click()
      await new Promise((r) => setTimeout(r, 400))
      return pane.scrollTop
    })
    expect(kept === 30, `${name}: a tab switch leaves the scroll where it was`, kept)
    await p.close()
  }

  /* ── 6. Customer emails: the families filter in place ── */
  console.log("\nFAMILIES: All / Digital / Physical, in place")
  {
    const { p, errors } = await openPage(DESK)
    await sleep(1500)
    await p.evaluate(() => document.querySelector('[data-email-tabs] [data-tab="customer"]').click())
    await p.waitForSelector("[data-customer-email-list] [data-segmented-pills]")
    await sleep(400)
    const chips = await p.evaluate(() => {
      const t = document.querySelector("[data-customer-email-list] [data-segmented-pills]")
      return { variant: t.getAttribute("data-segmented-pills"), track: getComputedStyle(t).backgroundColor, options: [...t.querySelectorAll("[role=tab]")].map((b) => b.dataset.tab), oldTrack: !!document.querySelector("[data-customer-email-list] [data-segmented-tabs]") }
    })
    expect(chips.variant === "chips" && (chips.track === "rgba(0, 0, 0, 0)" || chips.track === "transparent") && !chips.oldTrack, "the switch is Analytics' chips, no grey track", chips)
    for (const fam of chips.options.filter((o) => o !== "all").concat("all")) {
      const r = await p.evaluate(async (fam) => {
        const list = document.querySelector("#customer-emails-view")
        const before = list.querySelectorAll("[data-customer-email]").length
        let minOpacity = 1
        let frames = 0
        let stop = false
        const watch = () => {
          if (stop) return
          const el = document.querySelector("#customer-emails-view")
          if (el) minOpacity = Math.min(minOpacity, parseFloat(getComputedStyle(el).opacity))
          frames++
          requestAnimationFrame(watch)
        }
        requestAnimationFrame(watch)
        const t0 = performance.now()
        document.querySelector(`[data-customer-email-list] [data-segmented-pills] [data-tab="${fam}"]`).click()
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        const drawnMs = Math.round(performance.now() - t0)
        await new Promise((r) => setTimeout(r, 300))
        stop = true
        const after = document.querySelector("#customer-emails-view")
        return { same: after === list, before, after: after.querySelectorAll("[data-customer-email]").length, minOpacity, frames, drawnMs }
      }, fam)
      expect(r.same && r.minOpacity >= 0.99 && r.after > 0, `${fam}: the same list element, filtered (${r.before} to ${r.after} rows), no fade (lowest opacity ${r.minOpacity}), drawn in ${r.drawnMs}ms`, r)
    }
    await p.screenshot({ path: join(shots, "customer-families.png"), clip: { x: 0, y: 0, width: 1280, height: 520 } })

    /* ── 7. The editor opens at once ── */
    console.log("\nEDITOR: opened from the list")
    const open = await p.evaluate(async () => {
      const row = document.querySelector('[data-customer-email="receipt"]')
      const id = row.getAttribute("data-customer-email")
      const t0 = performance.now()
      row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      row.click()
      let fields = null
      let preview = null
      let skeletonSeen = false
      while (performance.now() - t0 < 3000 && (fields === null || preview === null)) {
        await new Promise((r) => requestAnimationFrame(r))
        if (fields === null && document.querySelector(`[data-email-editor="${id}"] [data-email-field="subject"]`)) fields = Math.round(performance.now() - t0)
        if (document.querySelector("[data-preview-skeleton]")) skeletonSeen = true
        if (preview === null && document.querySelector(`[data-email-preview="${id}"] iframe`)) preview = Math.round(performance.now() - t0)
      }
      const subject = document.querySelector('[data-email-field="subject"]')?.value
      const parts = [...document.querySelectorAll("[data-email-field]")].map((f) => f.getAttribute("data-email-field"))
      return { id, fieldsMs: fields, previewMs: preview, skeletonSeen, subject, parts }
    })
    expect(open.fieldsMs !== null && open.fieldsMs <= READY_MS, `the fields are there ${open.fieldsMs}ms after the click`, open)
    expect(open.previewMs !== null && open.previewMs <= 1000, `the preview is drawn ${open.previewMs}ms after the click (templates read on press; skeleton meanwhile: ${open.skeletonSeen})`, { previewMs: open.previewMs })
    expect(open.parts.join() === "subject,preheader,heading,body,button,footer", "six parts to write: subject, preview text, heading, text, button, footer note", open.parts)
    expect(open.subject === "Your order from {{shop_name}}", "the saved subject is in the field", open.subject)
    await sleep(500)
    await p.screenshot({ path: join(shots, "editor.png") })
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2))
    await p.close()
  }

  /* ── 8. A contact, and back to where the list was ── */
  console.log("\nCONTACT: opened from 1500px down, and Back")
  {
    const { p, errors } = await openPage(DESK)
    await sleep(800)
    const r = await p.evaluate(async () => {
      const pane = document.querySelector("[data-emails-page] .orders-list")
      pane.scrollTop = 1500
      await new Promise((r) => requestAnimationFrame(r))
      const rows = [...document.querySelectorAll("[data-contact-row]")]
      const row = rows.find((el) => el.getBoundingClientRect().top > 200 && el.getBoundingClientRect().top < 700)
      const t0 = performance.now()
      row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }))
      row.click()
      let opened = null
      while (performance.now() - t0 < 3000 && opened === null) {
        await new Promise((r) => requestAnimationFrame(r))
        if (document.querySelector("[data-contact-page]:not([data-leaving])")) opened = Math.round(performance.now() - t0)
      }
      await new Promise((r) => setTimeout(r, 700))
      const purchases = document.querySelector("[data-contact-orders]")?.textContent ?? ""
      const location = document.querySelector("[data-contact-location]")?.textContent ?? ""
      const consent = document.querySelector("[data-contact-consent]")?.textContent ?? ""
      const t1 = performance.now()
      history.back()
      let closed = null
      while (performance.now() - t1 < 3000 && closed === null) {
        await new Promise((r) => requestAnimationFrame(r))
        if (!document.querySelector("[data-contact-page]")) closed = Math.round(performance.now() - t1)
      }
      return { openedMs: opened, closedMs: closed, scrollAfter: pane.scrollTop, purchases, location, consent }
    })
    expect(r.openedMs !== null && r.openedMs <= 400, `the contact's page is up ${r.openedMs}ms after the click`, r.openedMs)
    expect(/3/.test(r.purchases) && /129/.test(r.purchases) && /Cluj-Napoca, Romania/.test(r.location) && r.consent.length > 0, "it shows orders, total spent, last order, location and consent", { purchases: r.purchases, location: r.location, consent: r.consent })
    expect(r.closedMs !== null && r.scrollAfter === 1500, `Back closes it in ${r.closedMs}ms and the list is where it was (${r.scrollAfter}px)`, r)
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2))
    await p.close()
  }

  await browser.close()
  console.log(`\nsummary (ms from the click; load average ${loadavg().map((n) => n.toFixed(1)).join(" ")})`)
  for (const s of summary) console.log(`  ${s.case.padEnd(12)} ${s.tab.padEnd(12)} bar ${String(s.barMs).padStart(4)}ms  longest task ${String(s.longestTask).padStart(4)}ms  ready ${String(s.readyMs).padStart(5)}ms   held ${String(s.held).padStart(3)}   skeleton ${String(s.skeletonFrames).padStart(3)}   blank ${s.blank}   min opacity ${s.minOpacity.toFixed(2)}`)
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   pictures: ${shots}`)
process.exit(broken ? 1 : 0)
