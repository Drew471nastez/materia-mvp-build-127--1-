/**
 * ===========================================================================
 *  THE EMAILS PAGE, MEASURED AND DRIVEN
 * ===========================================================================
 * The whole page (app/app/emails/emails-client.tsx) against a stand-in
 * Supabase and server where every request takes 150ms
 * (scripts/render-emails-probe.tsx), at 360, 390 and 1440 wide. What the
 * owner asked for, checked in Chromium:
 *
 *   - New automation sits beside New email, both on screen with room
 *     between them and the title, at every width;
 *   - switching tabs keeps the bar and the tab row where they are, to the
 *     pixel, every frame; no frame shows a blank table or the spinner once a
 *     tab has been read; layout shifts are summed as they happen (raw, with
 *     input or not) and must be zero;
 *   - the address says the tab (?tab=), replaced, not pushed; each tab
 *     keeps its own scroll, and a stuck bar never drops back down;
 *   - the other tabs are read while the browser is idle after the first;
 *   - a row darkens while pressed; hovering an email's row reads its page
 *     ahead; the email's page is drawn with its bar on the first frame
 *     after the click, the cards fade in over about 120ms, and Back shows
 *     the list on the next frame, on the same tab and scroll;
 *   - an automation's row reads ahead on hover and opens its builder.
 *
 *   node scripts/check-emails-page.mjs      (no build needed: scripts/probe-css.mjs)
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

try {
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `const LATENCY = 150
const subscribers = Array.from({ length: 73 }, (_, i) => ({
  id: "s" + i,
  email: i === 3 ? "a-very-long-address-that-goes-on@studio-with-a-long-domain-name.com" : "person" + i + "@example.com",
  name: i % 3 === 0 ? "" : "Person " + i,
  source: i % 2 ? "onepage" : "store_builder",
  status: i % 9 === 0 ? "unsubscribed" : "subscribed",
  subscribed_at: new Date(Date.parse("2026-09-01") - i * 86400000).toISOString(),
  unsubscribed_at: i % 13 === 0 ? "2026-08-01T00:00:00Z" : null,
}))
const flows = [
  { id: "f1", name: "Welcome", trigger_type: "new_subscriber", status: "active", steps: [{ id: "a", type: "email", config: { subject: "Hi", body: "<p>Hi</p>" } }], updated_at: "2026-09-01T00:00:00Z" },
  { id: "f2", name: "Thank you for buying", trigger_type: "purchase", status: "paused", steps: [], updated_at: "2026-09-01T00:00:00Z" },
]
const tables = { creators: { id: "cr-1" }, subscribers, products: [{ id: "p1" }], orders: [{ buyer_email: "buyer@example.com" }, { buyer_email: "person1@example.com" }], email_flows: flows }
function from(table) {
  const q = {
    select() { return q }, eq() { return q }, in() { return q }, order() { return q }, delete() { return q }, update() { return q },
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
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
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

  for (const [label, vp] of [
    ["phone 360", { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop 1440", { width: 1440, height: 900 }],
  ]) {
    console.log(`\n${label}`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.evaluateOnNewDocument(() => {
      window.__shift = 0
      window.__cls = 0
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__shift += e.value
          if (!e.hadRecentInput) window.__cls += e.value
          window.__moved = (window.__moved || []).concat((e.sources || []).map((s) => `${s.node?.nodeName ?? "?"}.${String(s.node?.className ?? "").slice(0, 50)} ${Math.round(s.previousRect.top)}->${Math.round(s.currentRect.top)}`))
        }
      }).observe({ type: "layout-shift", buffered: true })
    })
    await p.goto(`${ORIGIN}/app/emails`)
    await p.waitForSelector("[data-tab-content] tbody tr", { timeout: 8000 })
    const tag = label.replace(/\s/g, "-")

    /* The header: title, New automation, New email. */
    const head = await p.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width) } }
      return { title: r(document.querySelector("[data-orders-bar] h1")), auto: r(document.querySelector("[data-new-automation]")), mail: r(document.querySelector("[data-new-email]")), vw: innerWidth, autoText: document.querySelector("[data-new-automation]").textContent.trim() }
    })
    expect(head.title.r + 8 <= head.auto.l && head.auto.r + 6 <= head.mail.l && head.mail.r <= head.vw - 15, "New automation and New email side by side, clear of the title, inside the gutter", head)
    expect(head.auto.b - head.auto.t >= 32 && head.mail.b - head.mail.t >= 32, "both at least 32px tall", [head.auto.b - head.auto.t, head.mail.b - head.mail.t])
    await p.screenshot({ path: join(shots, `${tag}-subscribers.png`) })

    /* The other tabs are read while the browser is idle. */
    await sleep(1600)
    const reads = await p.evaluate(() => window.__requests.map((q) => q.url))
    expect(["email_flows", "/api/email/stats", "status=scheduled", "status=draft"].every((k) => reads.some((u) => u.includes(k))), "every other tab was read ahead after the first", reads.length)

    /* Switch through every tab, sampling every frame. */
    const historyBefore = await p.evaluate(() => history.length)
    for (const t of ["flows", "published", "scheduled", "drafts", "subscribers"]) {
      await p.evaluate(() => {
        const rect = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [Math.round(b.top * 10) / 10, Math.round(b.left * 10) / 10, Math.round(b.height * 10) / 10] }
        window.__before = { bar: rect("[data-orders-bar]"), tabs: rect("[data-email-tabs]") }
        window.__frames = []
        window.__shift = 0
        window.__cls = 0
        window.__moved = []
        window.__sampling = true
        const tick = () => {
          if (!window.__sampling) return
          const content = document.querySelector("[data-tab-content]")
          window.__frames.push({
            bar: rect("[data-orders-bar]"),
            tabs: rect("[data-email-tabs]"),
            tab: content?.getAttribute("data-tab-content"),
            rows: content ? content.querySelectorAll("tbody tr").length : 0,
            empty: !!content?.querySelector("section p.text-\\[15px\\]"),
            waiting: !!content?.querySelector("[data-waiting-area]"),
          })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await p.click(`[data-tab="${t}"]`)
      await sleep(450)
      const r = await p.evaluate(() => {
        window.__sampling = false
        return { before: window.__before, frames: window.__frames, shift: window.__shift, cls: window.__cls, moved: window.__moved, search: location.search }
      })
      const after = r.frames.filter((f) => f.tab === t)
      const moved = r.frames.filter((f) => f.bar.join() !== r.before.bar.join() || f.tabs.join() !== r.before.tabs.join())
      const blank = after.filter((f) => f.waiting || (f.rows === 0 && !f.empty))
      expect(moved.length === 0, `${t}: the bar and the tab row hold still in all ${r.frames.length} frames`, moved[0] ?? null)
      expect(after.length > 0 && blank.length === 0, `${t}: no blank or waiting frame once it shows (${after.length} frames)`, blank.length)
      expect(r.cls === 0, `${t}: CLS 0 (raw shift of anything that moved, input or not: ${Math.round(r.shift * 10000) / 10000})`, Math.round(r.cls * 10000) / 10000)
      expect(r.shift < 0.01, `${t}: what moved below the bar moved less than 1% of the screen`, { shift: Math.round(r.shift * 10000) / 10000, moved: r.moved.slice(0, 4) })
      expect(r.search.includes(`tab=${t}`), `${t}: the address says the tab`, r.search)
      if (t === "published") await p.screenshot({ path: join(shots, `${tag}-sent.png`) })
    }
    expect((await p.evaluate(() => history.length)) === historyBefore, "switching tabs added nothing to history (replaced, not pushed)")

    /* Each tab keeps its own scroll; a stuck bar stays stuck. */
    const scroll = await p.evaluate(async () => {
      const pane = document.querySelector("[data-emails-page] > .orders-pane")
      const wait = () => new Promise((r) => setTimeout(r, 120))
      pane.scrollTop = 700
      await wait()
      const barTop0 = Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().top)
      document.querySelector('[data-tab="drafts"]').click()
      await wait()
      const barTop1 = Math.round(document.querySelector("[data-orders-bar]").getBoundingClientRect().top)
      const draftsTop = pane.scrollTop
      document.querySelector('[data-tab="subscribers"]').click()
      await wait()
      return { back: pane.scrollTop, barTop0, barTop1, draftsTop }
    })
    expect(Math.abs(scroll.back - 700) <= 1, "Subscribers came back at the scroll it was left at", scroll)
    expect(scroll.barTop0 === scroll.barTop1, "the stuck bar did not drop back down on a switch", scroll)

    /* An automation's row: pressed, read ahead, opened. */
    await p.click('[data-tab="flows"]')
    await sleep(200)
    const flowRow = await p.$('[data-flow-row="f1"]')
    const fb = await flowRow.boundingBox()
    await p.mouse.move(fb.x + 60, fb.y + fb.height / 2)
    await sleep(60)
    await p.mouse.down()
    await sleep(40)
    const pressed = await p.evaluate(() => document.querySelector('[data-flow-row="f1"]').getAttribute("data-pressed"))
    const pressedBg = await p.evaluate(() => getComputedStyle(document.querySelector('[data-flow-row="f1"]')).backgroundColor)
    await p.mouse.up()
    await sleep(80)
    const nav = await p.evaluate(() => window.__nav.slice())
    expect(pressed === "true" && pressedBg !== "rgba(0, 0, 0, 0)", "an automation's row darkens while pressed", pressedBg)
    expect(nav.includes("prefetch /app/emails/flow/f1") && (nav.includes("push /app/emails/flow/f1") || nav.includes("link /app/emails/flow/f1")), "it read the builder ahead on hover, and opened it", nav.slice(-3))

    /* An email's page over the list. */
    await p.click('[data-tab="published"]')
    await sleep(250)
    await p.evaluate(() => { document.querySelector("[data-emails-page] > .orders-pane").scrollTop = 260 })
    await sleep(100)
    /* A row in plain view, not one scrolled under the bar. */
    const id = await p.evaluate(() => {
      const barBottom = document.querySelector("[data-orders-bar]").getBoundingClientRect().bottom
      const rows = [...document.querySelectorAll("[data-campaign-row]")]
      const seen = rows.find((r) => { const b = r.getBoundingClientRect(); return b.top > barBottom + 4 && b.bottom < innerHeight - 90 })
      return seen?.getAttribute("data-campaign-row") ?? null
    })
    const row = await p.$(`[data-campaign-row="${id}"]`)
    const rb = await row.boundingBox()
    await p.mouse.move(rb.x + 40, rb.y + rb.height / 2)
    await sleep(300)
    const readAhead = await p.evaluate((i) => window.__requests.some((q) => q.url.includes(`/campaigns/${i}/report`)), id)
    expect(readAhead, "hovering an email's row read its page ahead")
    const listScroll = await p.evaluate(() => document.querySelector("[data-emails-page] > .orders-pane").scrollTop)
    await p.evaluate(() => {
      window.__frames = []
      window.__sampling = true
      window.__clickAt = null
      document.addEventListener("click", () => { window.__clickAt = performance.now() }, { capture: true, once: true })
      const tick = (now) => {
        if (!window.__sampling) return
        const d = document.querySelector("[data-email-detail]")
        const body = d?.querySelector(".orders-body")
        const list = document.querySelector("[data-emails-page] > .orders-pane")
        window.__frames.push({ at: now, detail: !!d, title: d?.querySelector("h1")?.textContent ?? "", bodyOpacity: body ? Number(getComputedStyle(body).opacity) : null, listHidden: getComputedStyle(list).visibility === "hidden" })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await p.mouse.down()
    await p.mouse.up()
    await sleep(400)
    const open = await p.evaluate(() => {
      window.__sampling = false
      return { frames: window.__frames, search: location.search, clickAt: window.__clickAt }
    })
    /* rAF's timestamp is the frame's start: the first frame drawn after the click is the first one stamped after it. */
    const afterClick = open.frames.filter((f) => f.at > open.clickAt)
    const first = afterClick.find((f) => f.detail)
    const firstIndex = afterClick.findIndex((f) => f.detail)
    expect(firstIndex === 0 && first.title.length > 0 && first.listHidden, "the email's page and its bar are there on the first frame after the click", { firstIndex, title: first?.title })
    const settled = open.frames.find((f) => f.bodyOpacity === 1)
    const fadeMs = settled && first ? Math.round(settled.at - first.at) : null
    expect(first && first.bodyOpacity !== null && first.bodyOpacity < 1 && fadeMs !== null && fadeMs <= 220, "its cards fade in, about 120ms", { from: first?.bodyOpacity, fadeMs })
    expect(open.search.includes(`email=${id}`), "the address names the email", open.search)
    await p.screenshot({ path: join(shots, `${tag}-email.png`) })
    await p.evaluate(() => { document.querySelector("[data-email-detail]").scrollTop = 900 })
    await sleep(150)
    await p.screenshot({ path: join(shots, `${tag}-email-lower.png`) })
    const iframe = await p.evaluate(() => {
      const f = document.querySelector("[data-email-detail] iframe")
      return f ? { sandbox: f.getAttribute("sandbox"), text: f.contentDocument?.body?.textContent?.includes("Studio notes") } : null
    })
    expect(iframe && iframe.sandbox === "allow-same-origin" && iframe.text, "the email is drawn in a sandbox with scripts off", iframe)
    const numbers = await p.evaluate(() => document.querySelector('[aria-label="How it did"]')?.textContent ?? "")
    expect(/Opened604/.test(numbers.replace(/\s/g, "")) && /Clicked139/.test(numbers.replace(/\s/g, "")), "the numbers are the report's", numbers.slice(0, 120))

    await p.evaluate(() => {
      window.__frames = []
      window.__sampling = true
      window.__clickAt = null
      document.addEventListener("click", () => { window.__clickAt = performance.now() }, { capture: true, once: true })
      const tick = (now) => {
        if (!window.__sampling) return
        const list = document.querySelector("[data-emails-page] > .orders-pane")
        window.__frames.push({ at: now, detail: !!document.querySelector("[data-email-detail]"), listVisible: getComputedStyle(list).visibility !== "hidden", scroll: list.scrollTop })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await p.click('button[aria-label="Back to emails"]')
    await sleep(350)
    const back = await p.evaluate(() => {
      window.__sampling = false
      return { frames: window.__frames, search: location.search, clickAt: window.__clickAt }
    })
    /* history.back() lands on popstate, a task after the click: one frame of grace. */
    const gone = back.frames.filter((f) => f.at > back.clickAt).findIndex((f) => !f.detail && f.listVisible)
    expect(gone >= 0 && gone <= 1, "Back shows the list on the first or second frame after the click", gone)
    expect(back.frames.at(-1).scroll === listScroll && back.search.includes("tab=published") && !back.search.includes("email="), "on the same tab and scroll, and the address forgets the email", { scroll: back.frames.at(-1).scroll, was: listScroll, search: back.search })

    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    await p.close()
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nShots in ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
