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
 *   - a row darkens while pressed; a pointer resting on an email's row, or
 *     a finger on it, reads its page ahead;
 *   - the email's page opens and goes back with Orders' own move
 *     (app/app/orders/order-motion.ts), measured the way
 *     scripts/check-orders-page.mjs measures an order: on the first frame
 *     after the click, pushed from the right edge in about 300ms on a phone
 *     and on a computer whole at once with its cards faded in over about
 *     150ms, gone at once on the way back with the list there whole, not
 *     settling in (no fade, no rise: "an animation bump throughout the whole
 *     page, coming up and down"), the list drawn whenever the email is not
 *     over it, at the same tab and scroll, and the row it came from tinted
 *     and then fading;
 *   - an automation's row reads ahead on hover and opens its builder, and
 *     its switch turns it on without opening it;
 *   - the subscribers' table: fifty 48px rows to a page, a long address cut
 *     and not wrapped, the first column pinned on a phone, the page never
 *     scrolling sideways, a row's actions a sheet on a phone and a dropdown
 *     on a computer; a buyer who did not ask for news is a Customer, and the
 *     Status filter finds them;
 *   - a contact opens as its own page over the list, like an order, with everything in it
 *     laid out on its first frame, rising once and going down once, and in
 *     the side panel on a computer, also already filled (its runs are read
 *     from a stand-in that answers after RUNS_DELAY_MS).
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

  async function openPage(vp) {
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
    return { p, errors }
  }

  /*
    Every frame of an email coming in or going back, read the way
    scripts/check-orders-page.mjs reads an order's: where the layer is, how
    opaque, whether the list is drawn, and how much of the stage neither
    covers (a blank).
  */
  const recordFrames = (p, ms) => p.evaluate((ms) => {
    window.__mf = []
    window.__clickAt = null
    const onClick = () => { if (window.__clickAt === null) window.__clickAt = performance.now() }
    document.addEventListener("click", onClick, { capture: true, once: true })
    document.addEventListener("touchend", onClick, { capture: true, once: true })
    const t0 = performance.now()
    const opacityOf = (el) => { let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o }
    const tick = () => {
      const stage = document.querySelector(".orders-stage").getBoundingClientRect()
      const detail = document.querySelector("[data-email-detail]")
      const list = document.querySelector(".orders-list")
      const lr = list.getBoundingClientRect()
      const dr = detail?.getBoundingClientRect()
      const bar = detail?.querySelector("[data-orders-bar]")?.getBoundingClientRect()
      const listShown = getComputedStyle(list).visibility !== "hidden"
      const dOpacity = detail ? opacityOf(detail) : 0
      const spans = []
      if (listShown) spans.push([Math.max(stage.left, lr.left), Math.min(stage.right, lr.right)])
      if (detail && dOpacity >= 0.999) spans.push([Math.max(stage.left, dr.left), Math.min(stage.right, dr.right)])
      spans.sort((a, b) => a[0] - b[0])
      let covered = 0
      let reach = stage.left
      for (const [a, b] of spans) {
        if (b <= reach) continue
        covered += b - Math.max(a, reach)
        reach = b
      }
      const body = detail?.querySelector(".orders-body")
      window.__mf.push({
        t: performance.now(),
        detail: dr ? { left: dr.left, opacity: dOpacity, leaving: detail.hasAttribute("data-leaving"), title: detail.querySelector("h1")?.textContent ?? "" } : null,
        body: body ? opacityOf(body) : null,
        /* What is in the list, as drawn: back on a computer settles it in (the list itself, the scroller, holds still). */
        listFade: Math.min(1, ...[...list.children].filter((c) => c.getClientRects().length).map(opacityOf)),
        /* And how far anything in it sits from its place (the old settle moved it 2px). */
        listRise: Math.max(0, ...[...list.children].filter((c) => c.getClientRects().length).map((c) => { const t = getComputedStyle(c).transform; return t && t !== "none" ? Math.abs(new DOMMatrixReadOnly(t).m42) : 0 })),
        bar: bar ? `${(bar.left - dr.left).toFixed(1)},${bar.width.toFixed(1)}x${bar.height.toFixed(1)}` : null,
        listShown,
        listLeft: lr.left,
        listTop: list.scrollTop,
        blank: Math.max(0, Math.round(stage.width - covered)),
        picked: document.querySelector(".orders-list tr[data-picked]")?.dataset.picked ?? null,
      })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  const readFrames = (p) => p.evaluate(() => ({ frames: window.__mf, clickAt: window.__clickAt }))

  function arrival({ frames, clickAt }) {
    const after = frames.filter((f) => clickAt !== null && f.t >= clickAt)
    const first = after.find((f) => f.detail)
    const shown = after.filter((f) => f.detail)
    const rest = shown.find((f) => Math.abs(f.detail.left) < 0.5 && f.detail.opacity >= 0.999)
    const lefts = shown.map((f) => f.detail.left)
    const opacities = shown.map((f) => f.detail.opacity)
    return {
      ms: first ? Math.round(first.t - clickAt) : null,
      framesBefore: first ? after.indexOf(first) : null,
      title: first?.detail.title ?? "",
      firstLeft: first ? Math.round(first.detail.left) : null,
      firstOpacity: first ? Number(first.detail.opacity.toFixed(3)) : null,
      restMs: rest && first ? Math.round(rest.t - first.t) : null,
      frames: shown.length,
      monotonic: lefts.every((l, i) => i === 0 || l <= lefts[i - 1] + 0.5) && opacities.every((o, i) => i === 0 || o >= opacities[i - 1] - 0.001),
      bars: [...new Set(shown.map((f) => f.bar))],
      listDuring: shown.filter((f) => (rest ? f.t < rest.t : true)).every((f) => f.listShown),
      listLeftMin: Math.round(Math.min(...after.map((f) => f.listLeft))),
      listAfter: after.at(-1)?.listShown,
      blank: Math.max(0, ...after.map((f) => f.blank)),
      blankFrames: after.filter((f) => f.blank > 0).length,
      picked: [...new Set(after.map((f) => f.picked))],
      layerMin: shown.length ? Math.min(...shown.map((f) => f.detail.opacity)) : null,
      bodyFirst: first?.body ?? null,
      bodyRestMs: (() => { const r = shown.find((f) => (f.body ?? 1) >= 0.999); return r && first ? Math.round(r.t - first.t) : null })(),
      bodyMonotonic: shown.every((f, i) => i === 0 || (f.body ?? 1) >= (shown[i - 1].body ?? 1) - 0.001),
    }
  }

  function departure({ frames, clickAt }) {
    const after = frames.filter((f) => clickAt !== null && f.t >= clickAt)
    const firstMove = after.find((f) => f.detail && (f.detail.left > 0.5 || f.detail.opacity < 0.999))
    const gone = after.find((f) => !f.detail)
    const lefts = after.filter((f) => f.detail).map((f) => f.detail.left)
    const opacities = after.filter((f) => f.detail).map((f) => f.detail.opacity)
    return {
      startMs: firstMove ? Math.round(firstMove.t - clickAt) : null,
      goneMs: gone ? Math.round(gone.t - clickAt) : null,
      moveMs: gone && firstMove ? Math.round(gone.t - firstMove.t) : null,
      framesWithoutList: after.filter((f) => !f.listShown).length,
      blank: Math.max(0, ...after.map((f) => f.blank)),
      monotonic: lefts.every((l, i) => i === 0 || l >= lefts[i - 1] - 0.5) && opacities.every((o, i) => i === 0 || o <= opacities[i - 1] + 0.001),
      leavingInert: after.filter((f) => f.detail && f.detail.leaving).length,
      listLeftFirst: after[0] ? Math.round(after[0].listLeft) : null,
      listLeftLast: after.at(-1) ? Math.round(after.at(-1).listLeft) : null,
      scrollTops: [...new Set(after.map((f) => f.listTop))],
      picked: [...new Set(after.map((f) => f.picked))],
      /* On a computer: the email at rest on every frame it is there, and the list's settling in once it is gone. */
      layerStill: after.filter((f) => f.detail).every((f) => f.detail.opacity >= 0.999 && Math.abs(f.detail.left) < 0.5),
      listUncovered: after.filter((f) => !f.listShown && !(f.detail && f.detail.opacity >= 0.999 && Math.abs(f.detail.left) < 0.5)).length,
      ...(() => {
        const from = gone ? after.filter((f) => f.t >= gone.t) : []
        const fades = from.map((f) => f.listFade)
        const whole = from.find((f) => f.listFade >= 0.999)
        return {
          listFadeMin: fades.length ? Math.min(...fades) : null,
          listRiseMax: from.length ? Math.max(...from.map((f) => f.listRise)) : null,
          listFadeFirst: fades.length ? Number(fades[0].toFixed(3)) : null,
          listFadeMs: whole && gone ? Math.round(whole.t - gone.t) : null,
          listFadeMonotonic: fades.every((o, i) => i === 0 || o >= fades[i - 1] - 0.001),
        }
      })(),
    }
  }

  for (const [label, vp] of [
    ["phone 360", { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["desktop 1440", { width: 1440, height: 900 }],
  ]) {
    console.log(`\n${label}`)
    const phone = vp.width < 640
    const { p, errors } = await openPage(vp)
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

    /* An email's page over the list, with Orders' own move. */
    await p.click('[data-tab="published"]')
    await sleep(250)
    await p.evaluate(() => { document.querySelector(".orders-list").scrollTop = 260 })
    await sleep(100)
    /* A row in plain view, not one scrolled under the bar. */
    const id = await p.evaluate(() => {
      const barBottom = document.querySelector("[data-orders-bar]").getBoundingClientRect().bottom
      const rows = [...document.querySelectorAll("[data-campaign-row]")]
      const seen = rows.find((r) => { const b = r.getBoundingClientRect(); return b.top > barBottom + 4 && b.bottom < innerHeight - 90 })
      return seen?.getAttribute("data-campaign-row") ?? null
    })
    const rb = await (await p.$(`[data-campaign-row="${id}"]`)).boundingBox()
    const spot = { x: rb.x + 40, y: rb.y + rb.height / 2 }
    const listScroll = await p.evaluate(() => document.querySelector(".orders-list").scrollTop)
    const clsBefore = await p.evaluate(() => window.__cls)
    if (phone) {
      /* A finger on the row, a moment, then up. */
      await p.touchscreen.touchStart(spot.x, spot.y)
      await sleep(200)
    } else {
      await p.mouse.move(spot.x, spot.y)
      await sleep(300)
    }
    const readAhead = await p.evaluate((i) => window.__requests.some((q) => q.url.includes(`/campaigns/${i}/report`)), id)
    expect(readAhead, phone ? "a finger on an email's row reads its page before it lifts" : "a pointer resting on an email's row reads its page ahead")
    await recordFrames(p, 700)
    if (phone) await p.touchscreen.touchEnd()
    else {
      await p.mouse.down()
      await p.mouse.up()
    }
    await sleep(800)
    const opening = arrival(await readFrames(p))
    const clsOpen = (await p.evaluate(() => window.__cls)) - clsBefore
    const search = await p.evaluate(() => location.search)
    console.log(`  ..    click to the email's first frame: ${opening.ms}ms, ${opening.framesBefore} frames before it, ${phone ? `its left edge at ${opening.firstLeft}px of ${vp.width}` : `at opacity ${opening.firstOpacity}`}; at rest ${opening.restMs}ms later over ${opening.frames} frames; the list ${phone ? `moved to ${opening.listLeftMin}px and ` : ""}was drawn under it until then: ${opening.listDuring}, after: ${opening.listAfter}; blank frames ${opening.blankFrames}; bar in the layer ${JSON.stringify(opening.bars)}; layout shift ${clsOpen.toFixed(4)}`)
    expect(opening.ms !== null && opening.framesBefore === 0 && opening.title.length > 0, "the email's page and its bar are there on the first frame after the click", { ms: opening.ms, title: opening.title })
    if (phone) {
      expect(opening.firstLeft >= vp.width * 0.77 && opening.monotonic, "on a phone it starts at the right edge, not at rest, and only moves left", { first: opening.firstLeft, monotonic: opening.monotonic })
      expect(opening.restMs !== null && opening.restMs >= 240 && opening.restMs <= 360, "and is in place in about 300ms, as an order is", opening.restMs)
      expect(opening.listDuring && opening.listAfter === false && Math.abs(opening.listLeftMin + vp.width * 0.3) <= 8, "the list stays drawn underneath, moving a third of the way left, then rests hidden", { min: opening.listLeftMin, after: opening.listAfter })
    } else {
      /* Since c69b54d3 ("a solid order bar") an order's layer is not faded
         on a computer: its bar is whole on the first frame and only the
         cards (.orders-body) fade in. The email moves as an order does, so
         what fades is measured now, not the layer. */
      expect(opening.layerMin >= 0.999 && opening.bodyFirst !== null && opening.bodyFirst < 0.5 && opening.bodyRestMs !== null && opening.bodyRestMs >= 90 && opening.bodyRestMs <= 220 && opening.bodyMonotonic, "on a computer the email and its bar are whole on the first frame; only its cards fade in, quickly and only one way, as an order's do", { layer: opening.layerMin, cards: opening.bodyFirst, restMs: opening.bodyRestMs })
      expect(opening.listAfter === false, "the list is not drawn under the settled email", { after: opening.listAfter })
    }
    expect(opening.bars.length === 1, "its bar travels with it, at one size and place inside it", opening.bars)
    expect(opening.blankFrames === 0, "no frame shows neither the list nor the email", opening.blank)
    expect(opening.picked.includes("held"), "the row it came from is tinted under it", opening.picked)
    expect(clsOpen < 0.001, "opening an email shifts nothing", clsOpen)
    expect(search.includes(`email=${id}`), "the address names the email", search)
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
    await p.evaluate(() => { document.querySelector("[data-email-detail]").scrollTop = 0 })
    await sleep(100)

    /* Back: the list drawn on every frame, the email off it and gone. */
    await recordFrames(p, 700)
    if (phone) await p.tap('button[aria-label="Back to emails"]')
    else await p.click('button[aria-label="Back to emails"]')
    await sleep(750)
    const back = departure(await readFrames(p))
    const afterBack = await p.evaluate(() => ({ detail: !!document.querySelector("[data-email-detail]"), search: location.search }))
    console.log(`  ..    back: the email starts to go ${back.startMs}ms after the click and is gone at ${back.goneMs}ms (${back.moveMs}ms of ${phone ? "slide" : "fade"}); ${phone ? `the list from ${back.listLeftFirst}px to ${back.listLeftLast}px, ` : ""}frames without the list ${back.framesWithoutList}; blank ${back.blank}px; list scrollTop on every frame ${JSON.stringify(back.scrollTops)}; row tint ${JSON.stringify(back.picked)}`)
    if (phone) expect(!afterBack.detail && back.framesWithoutList === 0 && back.blank === 0, "back draws the list under the email on every frame", back.framesWithoutList)
    else expect(!afterBack.detail && back.listUncovered === 0 && back.blank === 0, "back draws the list on every frame the email is not over it", back.listUncovered)
    if (phone) {
      expect(back.monotonic && back.moveMs !== null && back.moveMs >= 220 && back.moveMs <= 360, "the email slides off to the right in about 300ms, only one way", back.moveMs)
      expect(back.listLeftFirst <= -vp.width * 0.28 && back.listLeftLast === 0, "while the list slides back from a third of the way left", { first: back.listLeftFirst, last: back.listLeftLast })
    } else {
      /* Was "the email fades off it" and "is marked leaving while it goes":
         since c69b54d3 back on a computer takes an order (and so an email)
         away at once. Since cea30d1c the list settled in over
         ORDER_LIST_BACK_MS, from half faded and 2px low, and that settle
         was the owner's "bump throughout the whole page, coming up and
         down": Emails now asks order-motion for none (`settle: false`), and
         the list is whole on every frame. Orders keeps its settle. */
      expect(back.layerStill && back.leavingInert === 0 && back.goneMs !== null && back.goneMs <= 300, "the email goes at once, never faded, moved or drawn leaving", { gone: back.goneMs, still: back.layerStill, leaving: back.leavingInert })
      expect(back.listFadeMin === 1 && back.listRiseMax === 0, "and the list is there whole: nothing in it fades or rises", { fade: back.listFadeMin, rise: back.listRiseMax })
    }
    if (phone) expect(back.leavingInert > 0, "the leaving email is marked leaving (inert) while it goes", back.leavingInert)
    expect(back.scrollTops.length === 1 && back.scrollTops[0] === listScroll, "and the list is exactly as far down as it was, on every frame", { tops: back.scrollTops, was: listScroll })
    expect(back.picked.includes("fading"), "the row the email came from is tinted, then fades", back.picked)
    expect(afterBack.search.includes("tab=published") && !afterBack.search.includes("email="), "on the same tab, and the address forgets the email", afterBack.search)

    /* The subscribers' table. */
    await p.click('[data-tab="subscribers"]')
    await sleep(250)
    await p.evaluate(() => { document.querySelector(".orders-list").scrollTop = 0 })
    await sleep(100)
    const S = "section[aria-label=Subscribers]"
    const rows = await p.$$eval(`${S} tbody tr`, (r) => r.map((x) => Math.round(x.getBoundingClientRect().height)))
    expect(rows.length === 50 && rows.every((h) => h === 48), "fifty dense 48px rows to a page", { count: rows.length, heights: [...new Set(rows)] })
    expect((await p.$$eval(`${S} button`, (b) => b.map((x) => x.textContent.trim()))).includes("Next"), "and a Next page")
    const long = await p.$eval(`${S} tbody tr:nth-child(4) td span`, (el) => ({ cut: el.scrollWidth > el.clientWidth, h: Math.round(el.closest("td").getBoundingClientRect().height), ell: getComputedStyle(el).textOverflow }))
    expect(long.cut && long.h === 48 && long.ell === "ellipsis", "a long address is cut, not wrapped", long)
    const customerRow = await p.$eval(`${S} tbody tr:nth-child(8)`, (r) => r.textContent)
    expect(/Customer/.test(customerRow) && !/Unsubscribed/.test(customerRow), "a buyer who did not ask for news shows as a Customer", customerRow.slice(0, 60))
    await p.evaluate(() => [...document.querySelectorAll("section[aria-label=Subscribers] button")].find((b) => b.textContent.trim() === "Status").click())
    await sleep(300)
    await p.evaluate(() => [...document.querySelectorAll("[role=menu] *")].find((el) => el.childElementCount === 0 && el.textContent.trim() === "Customers").click())
    await sleep(200)
    const onlyCustomers = await p.$$eval(`${S} tbody tr`, (r) => r.map((x) => /Customer/.test(x.textContent)))
    expect(onlyCustomers.length === 6 && onlyCustomers.every(Boolean), "the Status filter shows the customers alone", onlyCustomers.length)
    await p.click(`${S} button[aria-label="Clear Status"]`)
    await sleep(200)
    const sideways = () => p.evaluate(() => { const l = document.querySelector(".orders-list"); return l.scrollWidth - l.clientWidth })
    expect((await sideways()) === 0, "the page never scrolls sideways", await sideways())
    if (phone) {
      const cell = `${S} tbody tr td`
      const before = await p.$eval(cell, (td) => Math.round(td.getBoundingClientRect().left))
      await p.$eval(`${S} .overflow-x-auto`, (el) => { el.scrollLeft = 200 })
      await sleep(50)
      const after = await p.$eval(cell, (td) => Math.round(td.getBoundingClientRect().left))
      expect(before === after, "the email column stays put while the table scrolls", { before, after })
      const col = await p.$eval(cell, (td) => Math.round(td.getBoundingClientRect().width))
      expect(col <= 220, "and is narrow enough to leave the scrolling columns in view", col)
      await p.$eval(`${S} .overflow-x-auto`, (el) => { el.scrollLeft = 0 })
    }
    const btn = await p.$(`${S} tbody tr:first-child td:last-child button`)
    await btn.evaluate((b) => b.scrollIntoView({ block: "center", inline: "end" }))
    const hit = await btn.evaluate((b) => { const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("button") === b })
    expect(hit, "the actions button is not covered by the pinned column", hit)
    await btn.click()
    await sleep(450)
    const menu = await p.evaluate(() => {
      const sheet = [...document.querySelectorAll("[role=dialog]")].find((d) => /Copy email/.test(d.textContent))
      const drop = document.querySelector("[role=menu]")
      return { sheet: !!sheet, dropdown: !!drop && /Copy email/.test(drop.textContent) }
    })
    expect(phone ? menu.sheet && !menu.dropdown : menu.dropdown && !menu.sheet, `a row's actions are a ${phone ? "sheet" : "dropdown"}`, menu)
    await p.screenshot({ path: join(shots, `${tag}-subscriber-actions.png`) })
    await p.keyboard.press("Escape")
    await sleep(450)

    /* An automation switched on from its row, without opening it. */
    await p.click('[data-tab="flows"]')
    await sleep(250)
    const navBefore = await p.evaluate(() => window.__nav.length)
    await p.click('[data-flow-row="f2"] [role=switch]')
    await sleep(400)
    const toggled = await p.evaluate((n) => ({ nav: window.__nav.slice(n), requests: window.__requests.map((q) => q.url).filter((u) => u.includes("/flows/f2/status")), on: document.querySelector('[data-flow-row="f2"] [role=switch]').getAttribute("aria-checked") }), navBefore)
    expect(toggled.requests.length === 1 && toggled.on === "true" && !toggled.nav.some((l) => /(push|link) \/app\/emails\/flow\/f2/.test(l)), "an automation is switched on from its row without opening it", toggled)

    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    await p.close()
  }

  /* ── A contact, opened from its row, as its own page over the list ──── */
  const contactFrames = (p, ms) => p.evaluate((ms) => {
    window.__cf = []
    window.__tapAt = null
    const at = () => { if (window.__tapAt === null) window.__tapAt = performance.now() }
    document.addEventListener("touchend", at, { capture: true, once: true })
    document.addEventListener("click", at, { capture: true, once: true })
    const t0 = performance.now()
    const tick = () => {
      const page = document.querySelector("[data-contact-page]")
      const body = page?.querySelector("[data-contact-body]")
      window.__cf.push({
        t: performance.now(),
        x: page ? Math.round(new DOMMatrixReadOnly(getComputedStyle(page).transform === "none" ? "matrix(1,0,0,1,0,0)" : getComputedStyle(page).transform).m41) : null,
        busy: body ? body.querySelectorAll("[aria-busy]").length : 0,
        runs: body ? body.querySelectorAll("li").length : 0,
        bar: page ? !!page.querySelector("h1") : false,
      })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  const readContact = (p) => p.evaluate(() => ({ frames: window.__cf, tapAt: window.__tapAt, asked: window.__runsAsked || [], url: location.search }))
  const rowSpot = (p, n) => p.evaluate((n) => {
    const td = document.querySelector(`section[aria-label=Subscribers] tbody tr:nth-child(${n}) td:nth-child(2)`)
    td.scrollIntoView({ block: "center" })
    const r = td.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, n)
  const opening = ({ frames, tapAt }) => {
    const seen = frames.filter((f) => tapAt !== null && f.t >= tapAt && f.x !== null)
    const first = seen[0]
    const xs = seen.map((f) => f.x)
    return {
      ms: first ? Math.round(first.t - tapAt) : null,
      firstX: first?.x ?? null,
      firstBusy: first?.busy ?? null,
      firstRuns: first?.runs ?? null,
      firstBar: first?.bar ?? null,
      busyFrames: seen.filter((f) => f.busy > 0).length,
      runs: [...new Set(seen.map((f) => f.runs))],
      oneWay: xs.every((x, i) => i === 0 || x <= xs[i - 1]),
      restX: xs.at(-1),
      frames: seen.length,
    }
  }

  console.log("\na contact, 390 wide")
  {
    const { p, errors } = await openPage({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await sleep(300)
    /* A thumb on the second row (person1, who has two automations), resting a moment, then up. */
    const spot = await rowSpot(p, 2)
    await contactFrames(p, 1100)
    await p.touchscreen.touchStart(spot.x, spot.y)
    await sleep(RUNS_DELAY_MS + 40)
    await p.touchscreen.touchEnd()
    await sleep(1100)
    const a = await readContact(p)
    const o = opening(a)
    console.log(`  ..    tap to the page's first frame ${o.ms}ms, at x ${o.firstX}px with ${o.firstRuns} runs laid out and ${o.firstBusy} loading blocks; settled at ${o.restX}px over ${o.frames} frames`)
    expect(a.asked[0] === "person1@example.com", "the finger on the row asked for the contact's runs before it lifted", a.asked)
    expect(/contact=/.test(a.url), "the page is a real address (?contact=), so back and a reload work", a.url)
    expect(o.firstX !== null && o.firstX > 100 && o.restX === 0 && o.oneWay, "on a phone the page is pushed in from the right edge, one way, like an order", { firstX: o.firstX, restX: o.restX, oneWay: o.oneWay })
    expect(o.firstBar && o.firstBusy === 0 && o.firstRuns === 2 && o.busyFrames === 0 && o.runs.length === 1, "with its bar and content already laid out on the first frame, nothing popping in after", o)
    await p.screenshot({ path: join(shots, "phone-contact.png") })

    /* Back: the page goes, the list is where it was. */
    await p.evaluate(() => document.querySelector("[data-contact-page] button[aria-label='Back to subscribers']").click())
    await sleep(700)
    const back = await p.evaluate(() => ({ page: !!document.querySelector("[data-contact-page]"), rows: document.querySelectorAll("section[aria-label=Subscribers] tbody tr").length, url: location.search }))
    expect(!back.page && back.rows > 0 && !/contact=/.test(back.url), "Back takes the page away and the list is still there", back)

    /* A quick tap on a contact nobody asked about yet: it waits for the runs, a moment, then comes in once, filled. */
    const quick = await rowSpot(p, 5)
    await contactFrames(p, 1100)
    await p.touchscreen.tap(quick.x, quick.y)
    await sleep(1100)
    const q = opening(await readContact(p))
    console.log(`  ..    a quick tap: first frame ${q.ms}ms after it, ${q.firstBusy} loading blocks, "None yet" laid out: ${q.firstRuns === 0 && q.firstBusy === 0}`)
    expect(q.firstBusy === 0 && q.busyFrames === 0 && q.oneWay, "a quick tap too: the page comes in once, already filled", q)
    expect(q.ms !== null && q.ms <= RUNS_DELAY_MS + 120, "after waiting no longer than the answer took", q.ms)
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
    await p.close()
  }

  console.log("\na contact, 1280 wide")
  {
    const { p, errors } = await openPage({ width: 1280, height: 860 })
    const spot = await rowSpot(p, 2)
    /* The pointer rests on the row, as a hand does before it clicks. */
    await p.mouse.move(spot.x, spot.y)
    await sleep(RUNS_DELAY_MS + 200)
    await contactFrames(p, 700)
    await p.mouse.click(spot.x, spot.y)
    await sleep(700)
    const o = opening(await readContact(p))
    const layout = await p.evaluate(() => ({ sheets: document.querySelectorAll("[data-sheet-panel], aside[role=dialog]").length, cards: document.querySelectorAll("[data-contact-body] > section").length }))
    console.log(`  ..    the page: first frame ${o.ms}ms after the click, ${o.firstRuns} runs and ${o.firstBusy} loading blocks on it; ${layout.cards} cards`)
    expect(o.firstBar && o.firstBusy === 0 && o.firstRuns === 2 && o.busyFrames === 0 && o.firstX === 0 && layout.sheets === 0 && layout.cards === 2, "on a computer a page over the list, bar in place and filled on its first frame, no panel or sheet", { o, layout })
    expect(o.ms !== null && o.ms <= 80, "at once, the pointer resting on the row having asked already", o.ms)
    await p.screenshot({ path: join(shots, "desktop-contact.png") })
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
