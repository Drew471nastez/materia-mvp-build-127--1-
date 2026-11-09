/**
 * ===========================================================================
 *  THE EMAILS PAGE, MEASURED AND DRIVEN
 * ===========================================================================
 * The whole page (app/(storelib)/app/emails/emails-client.tsx) against a stand-in
 * Supabase and server where every request takes 150ms
 * (scripts/render-emails-probe.tsx), at 360, 390 and 1440 wide. What the
 * owner asked for, checked in Chromium:
 *
 *   (Round 52: rewritten for the three tabs, Campaigns | Automations |
 *   Settings. The subscribers and a contact moved to Contacts, so their
 *   checks went with them; scripts/check-emails-r52.mjs looks at every tab,
 *   Forms and the empty, loading and error states.)
 *
 *   - the header: on a computer the tab's one main action (New email on
 *     Campaigns), on a phone Automation and New email side by side (round
 *     w5), clear of the title and inside the gutter;
 *   - switching views (a computer's tabs and Campaigns' pills, a phone's one
 *     row of views) keeps the bar and the tab row where they are, to the
 *     pixel, every frame; no frame shows a blank table once a view has been
 *     read; layout shifts are summed as they happen and must be zero; the
 *     address says the view (?tab=, &show=), replaced, not pushed;
 *   - the other views are read while the browser is idle after the first;
 *   - an automation's row darkens while pressed, reads its builder ahead on
 *     hover and opens it, and its switch turns it on without opening it;
 *   - an email's page opens and goes back with Orders' own move
 *     (app/(storelib)/app/orders/order-motion.ts): on the first frame after
 *     the click, rising from below on a phone and whole at once with its
 *     cards faded in on a computer, gone at once on the way back with the
 *     list there whole, at the same view and scroll, the row it came from
 *     tinted and then fading.
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
    /* A table's rows, or a phone's own (round 24: Emails draws only the one that fits the width). */
    await p.waitForSelector("[data-tab-content] tbody tr, [data-tab-content] li[data-email-phone-row]", { timeout: 8000 })
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
      /* Under a settled email the list is hidden by opacity, not visibility (globals.css .orders-stage[data-order-open]). */
      const listShown = getComputedStyle(list).visibility !== "hidden" && Number(getComputedStyle(list).opacity) > 0
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
        detail: dr ? { left: dr.left, top: dr.top - stage.top, stageH: stage.height, opacity: dOpacity, leaving: detail.hasAttribute("data-leaving"), title: detail.querySelector("h1")?.textContent ?? "" } : null,
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
        picked: document.querySelector(".orders-list tr[data-picked], .orders-list li[data-picked]")?.dataset.picked ?? null,
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
    const rest = shown.find((f) => Math.abs(f.detail.left) < 0.5 && Math.abs(f.detail.top) < 0.5 && f.detail.opacity >= 0.999)
    const lefts = shown.map((f) => f.detail.left)
    const tops = shown.map((f) => f.detail.top)
    const opacities = shown.map((f) => f.detail.opacity)
    return {
      ms: first ? Math.round(first.t - clickAt) : null,
      framesBefore: first ? after.indexOf(first) : null,
      title: first?.detail.title ?? "",
      firstLeft: first ? Math.round(first.detail.left) : null,
      /* Since Orders' phone move became a rise (order-motion.ts, translate3d(0, y)): where its top starts, as a share of the stage. */
      firstTopShare: first ? Number((first.detail.top / first.detail.stageH).toFixed(2)) : null,
      risesOneWay: tops.every((t, i) => i === 0 || t <= tops[i - 1] + 0.5),
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
    const firstMove = after.find((f) => f.detail && (f.detail.left > 0.5 || f.detail.top > 0.5 || f.detail.opacity < 0.999))
    const gone = after.find((f) => !f.detail)
    const lefts = after.filter((f) => f.detail).map((f) => f.detail.left)
    const tops = after.filter((f) => f.detail).map((f) => f.detail.top)
    const opacities = after.filter((f) => f.detail).map((f) => f.detail.opacity)
    return {
      fallsOneWay: tops.every((t, i) => i === 0 || t >= tops[i - 1] - 0.5),
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

    /* The header: on a computer the title and the tab's one action; on a phone Automation and New email (round w5). */
    const head = await p.evaluate((phone) => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width) } }
      const shown = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length) ?? null
      return {
        title: r(document.querySelector("[data-orders-bar] h1")),
        auto: r(shown(phone ? "[data-phone-new-automation]" : "[data-new-automation]")),
        mail: r(shown(phone ? "[data-phone-new-email]" : "[data-new-email]")),
        vw: innerWidth,
      }
    }, phone)
    if (phone) {
      /* Inside the page's gutter, which on a phone is the shared 10px (--app-gutter, app/globals.css) rather than 16. */
      expect(head.auto && head.mail && head.title.r + 8 <= head.auto.l && head.auto.r + 6 <= head.mail.l && head.mail.r <= head.vw - 10, "Automation and New email side by side, clear of the title, inside the gutter", head)
      expect(head.auto.b - head.auto.t >= 40 && head.mail.b - head.mail.t >= 40, "both at least 40px tall for a thumb", [head.auto.b - head.auto.t, head.mail.b - head.mail.t])
    } else {
      expect(head.mail && !head.auto && head.title.r + 8 <= head.mail.l && head.mail.r <= head.vw - 15, "Campaigns has one main action, New email, clear of the title", head)
    }
    await p.screenshot({ path: join(shots, `${tag}-campaigns.png`) })

    /* The other tabs are read while the browser is idle. */
    await sleep(1600)
    const reads = await p.evaluate(() => window.__requests.map((q) => q.url))
    expect(["/api/email/area?part=flows", "/api/email/stats", "status=scheduled", "status=draft"].every((k) => reads.some((u) => u.includes(k))), "every other tab was read ahead after the first", reads.length)

    /* Switch through every tab, sampling every frame. */
    const historyBefore = await p.evaluate(() => history.length)
    /* A phone's one row of views; a computer's tabs and Campaigns' pills: what to press, the view it draws, what the address says. */
    const steps = phone
      ? [["flows", "tab=automations"], ["published", "show=sent"], ["scheduled", "show=scheduled"], ["drafts", "show=drafts"], ["all", "tab=campaigns"]].map(([v, q]) => ({ press: `[data-email-views-phone] [data-tab="${v}"]`, t: v, q }))
      : [
          { press: '[data-email-tabs] [data-tab="automations"]', t: "flows", q: "tab=automations" },
          { press: '[data-email-tabs] [data-tab="campaigns"]', t: "all", q: "tab=campaigns" },
          { press: '[data-filter-pill="sent"]', t: "published", q: "show=sent" },
          { press: '[data-filter-pill="scheduled"]', t: "scheduled", q: "show=scheduled" },
          { press: '[data-filter-pill="drafts"]', t: "drafts", q: "show=drafts" },
          { press: '[data-filter-pill="all"]', t: "all", q: "tab=campaigns" },
        ]
    for (const { press, t, q } of steps) {
      await p.evaluate(() => {
        const rect = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return [Math.round(b.top * 10) / 10, Math.round(b.left * 10) / 10, Math.round(b.height * 10) / 10] }
        window.__before = { bar: rect("[data-orders-bar]"), tabs: rect(innerWidth < 640 ? "[data-email-views-phone]" : "[data-email-tabs]") }
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
            tabs: rect(innerWidth < 640 ? "[data-email-views-phone]" : "[data-email-tabs]"),
            tab: content?.getAttribute("data-tab-content"),
            rows: content ? content.querySelectorAll("tbody tr, li[data-email-phone-row], li[data-flow-row]").length : 0,
            empty: !!content?.querySelector("section p.text-\\[15px\\]"),
            waiting: !!content?.querySelector("[data-waiting-area]"),
          })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await p.click(press)
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
      /*
        Changed on purpose (round 52): "what moved below the bar moved less than 1% of the screen" is gone. It held
        while every tab drew the same table; now Campaigns has its pills and Automations a list of its own, and All
        puts the scheduled and drafts among the sent, so the rows a click asks for are different rows in different
        places. What must not move is the bar and the tab row (above) and nothing may shift without input (CLS 0).
      */
      expect(r.search.includes(q), `${t}: the address says it (${q})`, r.search)
      if (t === "published") await p.screenshot({ path: join(shots, `${tag}-sent.png`) })
    }
    expect((await p.evaluate(() => history.length)) === historyBefore, "switching tabs added nothing to history (replaced, not pushed)")

    /* An automation's row: pressed, read ahead, opened. */
    await p.click(phone ? '[data-email-views-phone] [data-tab="flows"]' : '[data-email-tabs] [data-tab="automations"]')
    await sleep(200)
    /* An automation is a row of its own below 768px (li) and a table row above it (tr); the one drawn is pressed. */
    const FLOW = vp.width < 768 ? 'li[data-flow-row="f1"]' : 'tr[data-flow-row="f1"]'
    const flowRow = await p.$(FLOW)
    const fb = await flowRow.boundingBox()
    await p.mouse.move(fb.x + 60, fb.y + fb.height / 2)
    await sleep(60)
    await p.mouse.down()
    await sleep(40)
    const pressed = await p.evaluate((sel) => document.querySelector(sel).getAttribute("data-pressed"), FLOW)
    const pressedBg = await p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, FLOW)
    await p.mouse.up()
    await sleep(80)
    const nav = await p.evaluate(() => window.__nav.slice())
    expect(pressed === "true" && pressedBg !== "rgba(0, 0, 0, 0)", "an automation's row darkens while pressed", pressedBg)
    expect(nav.includes("prefetch /app/emails/flow/f1") && (nav.includes("push /app/emails/flow/f1") || nav.includes("link /app/emails/flow/f1")), "it read the builder ahead on hover, and opened it", nav.slice(-3))

    /* An email's page over the list, with Orders' own move. */
    if (phone) await p.click('[data-email-views-phone] [data-tab="published"]')
    else {
      await p.click('[data-email-tabs] [data-tab="campaigns"]')
      await sleep(250)
      await p.click('[data-filter-pill="sent"]')
    }
    await sleep(250)
    await p.evaluate(() => { document.querySelector(".orders-list").scrollTop = 260 })
    await sleep(100)
    /* A row in plain view, not one scrolled under the bar. */
    const id = await p.evaluate(() => {
      const barBottom = document.querySelector("[data-orders-bar]").getBoundingClientRect().bottom
      /* The row drawn at this width: a phone's own (li, round 24) or the table's. */
      const rows = [...document.querySelectorAll("[data-campaign-row]")].filter((r) => r.getClientRects().length > 0)
      const seen = rows.find((r) => { const b = r.getBoundingClientRect(); return b.top > barBottom + 4 && b.bottom < innerHeight - 90 })
      return seen?.getAttribute("data-campaign-row") ?? null
    })
    const rb = await (await p.$(`${vp.width < 640 ? "li" : "tr"}[data-campaign-row="${id}"]`)).boundingBox()
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
      /* Changed with Orders (app/(storelib)/app/orders/order-motion.ts): on a phone an order, and so an email, rises from below the screen in 360ms over a list that holds still; it was pushed in from the right over a list moving a third of the way left. */
      expect(opening.firstTopShare !== null && opening.firstTopShare >= 0.77 && opening.risesOneWay && opening.firstLeft === 0, "on a phone it starts below the screen, not at rest, and only rises", { firstTop: opening.firstTopShare, oneWay: opening.risesOneWay, left: opening.firstLeft })
      expect(opening.restMs !== null && opening.restMs >= 300 && opening.restMs <= 440, "and is in place in about 360ms, as an order is", opening.restMs)
      expect(opening.listDuring && opening.listAfter === false && opening.listLeftMin === 0, "the list stays drawn underneath, holding still, then rests hidden", { min: opening.listLeftMin, after: opening.listAfter })
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
      expect(back.fallsOneWay && back.moveMs !== null && back.moveMs >= 200 && back.moveMs <= 340, "the email falls away below the screen in about 280ms, only one way", back.moveMs)
      expect(back.listLeftFirst === 0 && back.listLeftLast === 0, "while the list under it holds still", { first: back.listLeftFirst, last: back.listLeftLast })
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
    expect(afterBack.search.includes("show=sent") && !afterBack.search.includes("email="), "on the same tab, and the address forgets the email", afterBack.search)

    /* An automation switched on from its row, without opening it. */
    await p.click(phone ? '[data-email-views-phone] [data-tab="flows"]' : '[data-email-tabs] [data-tab="automations"]')
    await sleep(250)
    const navBefore = await p.evaluate(() => window.__nav.length)
    const F2 = `${vp.width < 768 ? "li" : "tr"}[data-flow-row="f2"] [role=switch]`
    await p.click(F2)
    await sleep(400)
    const toggled = await p.evaluate((n, sel) => ({ nav: window.__nav.slice(n), requests: window.__requests.map((q) => q.url).filter((u) => u.includes("/flows/f2/status")), on: document.querySelector(sel).getAttribute("aria-checked") }), navBefore, F2)
    expect(toggled.requests.length === 1 && toggled.on === "true" && !toggled.nav.some((l) => /(push|link) \/app\/emails\/flow\/f2/.test(l)), "an automation is switched on from its row without opening it", toggled)

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
