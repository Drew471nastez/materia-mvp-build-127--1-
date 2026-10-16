/**
 * ===========================================================================
 *  ROUND 32: THE COMMUNITY ADMIN'S CONTENT AND PEOPLE SECTIONS, MEASURED
 * ===========================================================================
 * The owner, on production: the community admin on a computer "looks
 * horrible, too shrunk"; every selector should be Storelib's own and a
 * bottom sheet on a phone; every function should work. The real components
 * (scripts/render-community-content-round32.tsx) in headless Chromium at
 * 1440, 1280 and 390 (touch), against a stub of the /app API:
 *
 *   LAYOUT    for Spaces, Posts, Learn, Calendar, Members (and its
 *             requests), Moderation (queue, restricted, log): the list card
 *             fills the section's width; on a computer it is a table whose
 *             main column is at least 260px and whose every column holds its
 *             words (none under 64px); all rows of a table are one height;
 *             nothing scrolls sideways, nothing in a row overlaps; no
 *             browser <select> anywhere, forms included
 *   MEMBERS   a row opens the member sheet; its Make a moderator, the menu's
 *             Mute (24 hours) and Remove reach PATCH members/<id>; Role,
 *             Joined and Sort ask the server again with role=, joined=,
 *             sort=; Show more sends the cursor; two picked rows are removed
 *             together; a request's Approve and a bulk Approve send approve;
 *             Complimentary access picks its tier in the app's pick
 *   QUEUE     Dismiss, Remove post (with its confirmation), Approve on a
 *             held post, the Reason filter (reason=), Unban on Restricted,
 *             the audit log as a table
 *   CONTENT   Spaces: Archive, a move, the editor's Kind pick, Save; Posts:
 *             search (q=), the space filter (space=), Pinned (show=pinned),
 *             Pin; Calendar: the editor's Kind pick and the time zone search,
 *             Cancel event; Learn: a row opens the program, Move down
 *   PHONE     at 390 every filter opens the shared bottom sheet, the member
 *             sheet rises from the bottom, a row's menu is a sheet
 *
 * Pictures go to SHOTS_DIR (.round32-shots by default); look at them, then
 * delete the folder.
 *
 *   node scripts/check-community-content-round32.mjs [LAYOUT MEMBERS QUEUE CONTENT PHONE]
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".community-round32-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round32-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const PRELUDE = `window.__sent = [];`

/* What the stub answers a members read with: a page of people, the second page after the cursor. */
const personRow = (i, over = {}) => ({
  userId: uid(300 + i), name: `Member ${i}`, username: `member${i}`, avatarUrl: null, email: `member${i}@example.com`, role: "member", status: "active", source: "free",
  tierId: null, tierName: null, level: 1, points: i, joinedAt: new Date(Date.now() - i * 86400000).toISOString(), requestedAt: null, requestNote: null, lastActiveAt: null, mutedUntil: null, approved: false, acted: null, ...over,
})

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "${uid(1)}" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-content-round32.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-round32-probe/navigation.js", "next/link": "./.community-round32-probe/link.jsx", "next/image": "./.community-round32-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const VIEWS = { 1440: { width: 1440, height: 900, deviceScaleFactor: 1 }, 1280: { width: 1280, height: 860, deviceScaleFactor: 1 }, 390: PHONE }

  /** The stub of the API: every write is logged in window.__sent, every read answered from the shapes the routes answer. */
  async function open(caseName, vp, extra = "") {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(PRELUDE)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        const method = r.method()
        const path = short.split("?")[0]
        const qs = new URLSearchParams(short.split("?")[1] || "")
        let sent = null
        try {
          sent = r.postData() ? JSON.parse(r.postData()) : null
        } catch {
          sent = r.postData()
        }
        p.evaluate((x) => window.__sent.push(x), { short, method, sent }).catch(() => {})
        let body = { ok: true }
        const base = `/api/app/community/${ID}`
        if (path === `${base}/members` && method === "GET") {
          const status = qs.get("status") || "active"
          const rows = qs.get("cursor") ? [personRow(60), personRow(61)] : status === "pending" ? [personRow(1, { status: "pending", requestedAt: new Date().toISOString(), joinedAt: null })] : [personRow(1), personRow(2), personRow(3)]
          body = { rows, next: null, capped: false, counts: qs.get("counts") ? { active: 1284, pending: 1, restricted: 4, expired: 12, cancelled: 30 } : undefined }
        } else if (path.startsWith(`${base}/members/`) && method === "PATCH") body = { status: "active", role: "member", mutedUntil: null }
        else if (path === `${base}/moderation` && method === "GET") body = { rows: [], next: null }
        else if (path === `${base}/moderation` && method === "POST") body = { status: "removed" }
        else if (path === `${base}/audit`) body = { rows: [], next: null }
        else if (path === `${base}/spaces` && method === "GET") body = { spaces: [] }
        else if (path === `${base}/posts` && method === "GET") body = { rows: [], next: null }
        else if (path === `${base}/events` && method === "GET") body = { upcoming: [], past: [], tickets: { ready: true, canSell: true, currency: "usd", communityPolicy: null } }
        else if (path === `${base}/learn` && method === "GET") body = { error: "stub" }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("blob:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}/app/community/${ID}?case=${caseName}${extra}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(600)
    return { p, errors }
  }
  const box = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom), shown: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 }
    }, sel)
  const sent = (p) => p.evaluate(() => window.__sent.slice())
  const writes = async (p) => (await sent(p)).filter((x) => x.method !== "GET")
  const reads = async (p) => (await sent(p)).filter((x) => x.method === "GET")
  /** Presses the first visible element that matches and whose words match. */
  const press = (p, sel, words) =>
    p.evaluate(
      (sel, words) => {
        const re = words ? new RegExp(words) : null
        const el = [...document.querySelectorAll(sel)].find((e) => {
          const b = e.getBoundingClientRect()
          return b.width > 0 && b.height > 0 && (!re || re.test(e.textContent || e.getAttribute("aria-label") || ""))
        })
        if (!el) return false
        el.click()
        return true
      },
      sel,
      words ?? null,
    )
  const menuItem = (p, words) => press(p, "[role=menuitem], [data-action-sheet] button", words)
  const tapAt = async (p, sel) => {
    const b = await box(p, sel)
    if (!b) return false
    await p.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2)
    return true
  }

  /* ── LAYOUT ───────────────────────────────────────────────────────────── */
  if (want("LAYOUT")) {
    console.log("\nLAYOUT: width, columns, row heights, overflow, no browser select")
    const CASES = [
      ["spaces", "[data-spaces] > section"],
      ["feed", "[data-feed] > section"],
      ["learn", "[data-program-list]"],
      ["events", "[data-events] > section"],
      ["members", "[data-members-table]"],
      ["members-pending", "[data-members-table]"],
      ["moderation", "[data-moderation] > section"],
      ["moderation-restricted", "[data-moderation] > section"],
      ["moderation-audit", "[data-moderation] > section"],
    ]
    const summary = []
    for (const [name, cardSel] of CASES) {
      for (const width of [1440, 1280, 390]) {
        const { p, errors } = await open(name, VIEWS[width])
        const m = await p.evaluate((cardSel) => {
          const card = document.querySelector(cardSel)
          const body = document.querySelector("[data-community-body]")
          const scroller = document.querySelector(".app-content-scroll") || document.scrollingElement
          if (!card || !body) return null
          const cb = card.getBoundingClientRect()
          const bs = getComputedStyle(body)
          const inner = body.getBoundingClientRect().width - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight)
          const table = [...card.querySelectorAll("table")].find((t) => t.getBoundingClientRect().width > 0)
          let cols = null
          let rowHeights = null
          let tableOver = 0
          if (table) {
            cols = [...table.querySelectorAll("thead th")].map((th) => ({ text: th.textContent.trim(), w: Math.round(th.getBoundingClientRect().width) }))
            rowHeights = [...table.querySelectorAll("tbody tr")].map((tr) => Math.round(tr.getBoundingClientRect().height))
            tableOver = Math.round(table.scrollWidth - card.clientWidth)
          }
          /* In every visible row, the words never run under the row's controls. */
          let overlaps = 0
          for (const rowEl of card.querySelectorAll("li, tr")) {
            const words = rowEl.querySelector("[data-row-open]")
            const ctl = rowEl.querySelector("[data-row-control]")
            if (!words || !ctl) continue
            const a = words.getBoundingClientRect()
            const c = ctl.getBoundingClientRect()
            if (a.width === 0 || c.width === 0) continue
            if (a.right > c.left + 1 && a.left < c.right && a.bottom > c.top && a.top < c.bottom) overlaps++
          }
          /* Text paragraphs (a report's words, a post's) on a computer: their width. */
          const paras = [...card.querySelectorAll("[data-report-preview], [data-feed-open]")].map((x) => Math.round(x.getBoundingClientRect().width)).filter((w) => w > 0)
          return {
            card: Math.round(cb.width),
            inner: Math.round(inner),
            fill: +(cb.width / inner).toFixed(3),
            cols,
            rowHeights,
            tableOver,
            sideways: Math.round(scroller.scrollWidth - scroller.clientWidth),
            pageSideways: Math.round(document.documentElement.scrollWidth - window.innerWidth),
            overlaps,
            selects: document.querySelectorAll("select").length,
            narrowestPara: paras.length ? Math.min(...paras) : null,
          }
        }, cardSel)
        await p.screenshot({ path: join(shots, `${name}-${width}.png`) })
        if (!m) {
          expect(false, `${name} ${width}: the card is there`)
          await p.close()
          continue
        }
        const desk = width !== 390
        const textCols = (m.cols || []).filter((c) => c.text)
        const main = textCols.length ? Math.max(...textCols.map((c) => c.w)) : 0
        const narrow = textCols.length ? Math.min(...textCols.map((c) => c.w)) : null
        const heights = m.rowHeights || []
        const spread = heights.length ? Math.max(...heights) - Math.min(...heights) : 0
        summary.push({ name, width, card: m.card, inner: m.inner, main, narrow, rows: heights.length ? `${Math.min(...heights)}-${Math.max(...heights)}` : "-", para: m.narrowestPara })
        expect(m.fill >= 0.99, `${name} ${width}: the card fills the section (${m.card} of ${m.inner}px)`, m.fill)
        if (desk && name !== "feed" && name !== "moderation" && name !== "moderation-restricted") {
          expect(!!m.cols && main >= 260 && narrow >= 64, `${name} ${width}: a table; main column ${main}px, narrowest ${narrow}px`, m.cols)
          expect(spread <= 1, `${name} ${width}: every row one height`, heights)
          expect(m.tableOver <= 0, `${name} ${width}: the table fits its card`, m.tableOver)
        }
        if (desk && m.narrowestPara !== null) expect(m.narrowestPara >= 360, `${name} ${width}: words get a wide column (${m.narrowestPara}px)`, m.narrowestPara)
        if (!desk) expect(!m.cols, `${name} 390: a phone gets the list, not the table`)
        expect(m.sideways <= 0 && m.pageSideways <= 0, `${name} ${width}: nothing scrolls sideways`, { pane: m.sideways, page: m.pageSideways })
        expect(m.overlaps === 0, `${name} ${width}: no words under a row's controls`, m.overlaps)
        expect(m.selects === 0, `${name} ${width}: no browser select`, m.selects)
        expect(errors.length === 0, `${name} ${width}: no page errors`, errors)
        await p.close()
      }
    }
    console.log("\n  case                    width  card/inner   main  narrowest  row heights  text")
    for (const s of summary) console.log(`  ${s.name.padEnd(22)} ${String(s.width).padStart(5)}  ${String(s.card).padStart(5)}/${String(s.inner).padEnd(5)} ${String(s.main || "-").padStart(5)}  ${String(s.narrow ?? "-").padStart(9)}  ${s.rows.padStart(11)}  ${s.para ?? "-"}`)

    /* The forms: no browser select inside them either. */
    for (const [name, opener, form] of [
      ["spaces", "[data-space-new]", "[data-form-sheet='space']"],
      ["events", "[data-event-new]", "[data-form-sheet='event']"],
    ]) {
      const { p, errors } = await open(name, VIEWS[1440])
      await p.click(opener)
      await sleep(600)
      const f = await p.evaluate((form) => ({ open: !!document.querySelector(form), selects: document.querySelectorAll("select").length, picks: document.querySelectorAll(`${form} [data-select], ${form} [data-choice-field]`).length }), form)
      expect(f.open && f.selects === 0 && f.picks >= 1, `${name}: its form has no browser select, only the app's picks`, f)
      await p.screenshot({ path: join(shots, `${name}-form-1440.png`) })
      expect(errors.length === 0, `${name} form: no page errors`, errors)
      await p.close()
    }
  }

  /* ── MEMBERS ──────────────────────────────────────────────────────────── */
  if (want("MEMBERS")) {
    console.log("\nMEMBERS: the sheet, the menu, filters, sort, more, picked rows")
    const { p, errors } = await open("members", VIEWS[1440])
    /* Row 3 is a member (rows 1 and 2 are an admin and a moderator). */
    const third = "table [data-member-row]:nth-child(3)"
    const r3 = await box(p, `${third} td:nth-child(5)`)
    await p.mouse.click(r3.x + r3.w / 2, r3.y + r3.h / 2)
    await sleep(500)
    const sheet = await p.evaluate(() => {
      const s = document.querySelector("[data-member-sheet]")
      return s ? { facts: s.querySelectorAll("[data-facts] dt").length, choices: [...s.querySelectorAll("[data-member-choice]")].map((b) => b.textContent.trim()), message: s.querySelector("[data-member-message]")?.getAttribute("href") } : null
    })
    expect(!!sheet && sheet.facts >= 5 && sheet.choices.includes("Make a moderator") && /\?dm=/.test(sheet.message || ""), "pressing a row opens the member: facts, Message, and the choices", sheet)
    await p.screenshot({ path: join(shots, "member-sheet-1440.png") })
    await press(p, "[data-member-choice]", "^Make a moderator$")
    await sleep(600)
    let w = await writes(p)
    expect(w.some((x) => /\/members\/[0-9a-f-]+$/.test(x.short) && x.method === "PATCH" && x.sent?.action === "role" && x.sent?.role === "moderator"), "Make a moderator sends role moderator", w.slice(-1))
    /* The row's menu: Mute, 24 hours. */
    await p.click(`${third} [data-row-control] button[aria-label^="Actions for"]`)
    await sleep(400)
    await menuItem(p, "^Mute$")
    await sleep(500)
    await p.click("[data-mute-confirm]")
    await sleep(600)
    w = await writes(p)
    expect(w.some((x) => x.sent?.action === "mute" && x.sent?.until === 24), "the menu's Mute sends mute for 24 hours", w.slice(-1))
    /* Remove, with its confirmation. */
    await p.click(`${third} [data-row-control] button[aria-label^="Actions for"]`)
    await sleep(400)
    await menuItem(p, "^Remove from the community$")
    await sleep(500)
    await press(p, "[role=dialog] button", "^Remove$")
    await sleep(600)
    w = await writes(p)
    expect(w.some((x) => x.sent?.action === "remove"), "Remove from the community asks, then sends remove", w.slice(-1))
    /* Complimentary access picks its tier in the app's pick. */
    await p.click(`table [data-member-row]:nth-child(2) [data-row-control] button[aria-label^="Actions for"]`)
    await sleep(400)
    const comp = await menuItem(p, "^Give complimentary access$")
    await sleep(500)
    const compPick = await p.evaluate(() => ({ pick: !!document.querySelector("[data-select='comp-tier']"), selects: document.querySelectorAll("select").length }))
    expect(comp && compPick.pick && compPick.selects === 0, "Complimentary access picks its tier in the app's pick", compPick)
    await p.keyboard.press("Escape")
    await sleep(400)
    /* Filters and the order: each asks the server again. */
    const before = (await reads(p)).length
    await p.click("[data-pick='role']")
    await sleep(350)
    await press(p, "[data-pick-menu='role'] [data-row]", "^Moderators$")
    await sleep(500)
    await p.click("[data-pick='joined']")
    await sleep(350)
    await press(p, "[data-pick-menu='joined'] [data-row]", "30 days")
    await sleep(500)
    await p.click("[data-pick='sort']")
    await sleep(350)
    await press(p, "[data-pick-menu='sort'] [data-row]", "Recently active")
    await sleep(600)
    const asked = (await reads(p)).slice(before).map((x) => x.short)
    const lastAsk = asked[asked.length - 1] || ""
    expect(/role=moderator/.test(lastAsk) && /joined=30/.test(lastAsk) && /sort=active/.test(lastAsk), "Role, Joined and Sort ask the server with role=, joined= and sort=", lastAsk)
    await p.screenshot({ path: join(shots, "members-filtered-1440.png") })
    await p.close()

    const m2 = await open("members", VIEWS[1440])
    await m2.p.click("[data-load-more]")
    await sleep(600)
    const more = (await reads(m2.p)).map((x) => x.short).find((x) => /cursor=next1/.test(x))
    const rowsNow = await m2.p.evaluate(() => document.querySelectorAll("table [data-member-row]").length)
    expect(!!more && rowsNow === 16, "Show more sends the cursor and adds the next page", { more, rowsNow })
    /* Two picked rows, removed together. */
    await m2.p.evaluate(() => {
      const boxes = [...document.querySelectorAll("table [data-member-row] input[type=checkbox]")]
      boxes[3].click()
      boxes[5].click()
    })
    await sleep(300)
    const bar = await m2.p.evaluate(() => ({ bar: document.querySelector("[data-bulk-bar]")?.textContent, actions: [...document.querySelectorAll("[data-bulk]")].map((b) => b.getAttribute("data-bulk")) }))
    expect(/2 selected/.test(bar.bar || "") && bar.actions.includes("remove") && bar.actions.includes("export"), "picking two rows brings the bar with Export selected and Remove", bar)
    /* Scrolled down the list, the bar is still on screen, at its foot. */
    await m2.p.evaluate(() => document.querySelector(".app-content-scroll")?.scrollBy(0, 2000))
    await sleep(500)
    const floating = await box(m2.p, "[data-bulk-bar] [role=region]")
    expect(!!floating && floating.bottom <= 900 && floating.y >= 780 && floating.w >= 500, "the bar floats at the foot of the screen wherever the list is scrolled", floating)
    await m2.p.screenshot({ path: join(shots, "members-picked-1440.png") })
    await m2.p.click("[data-bulk='export']")
    await sleep(300)
    await m2.p.click("[data-bulk='remove']")
    await sleep(500)
    await press(m2.p, "[role=dialog] button", "^Remove$")
    await sleep(900)
    const removed = (await writes(m2.p)).filter((x) => x.sent?.action === "remove")
    expect(removed.length === 2, "Remove sends remove for each of the two", removed.map((x) => x.short))
    expect(m2.errors.length === 0 && errors.length === 0, "members: no page errors", [...errors, ...m2.errors])
    await m2.p.close()

    const rq = await open("members-pending", VIEWS[1440])
    await rq.p.click("table [data-member-row] [data-approve]")
    await sleep(600)
    let ap = (await writes(rq.p)).filter((x) => x.sent?.action === "approve")
    expect(ap.length === 1, "a request's Approve sends approve", ap.map((x) => x.short))
    await rq.p.evaluate(() => document.querySelector("table thead input[type=checkbox]")?.click())
    await sleep(300)
    await rq.p.click("[data-bulk='approve']")
    await sleep(900)
    ap = (await writes(rq.p)).filter((x) => x.sent?.action === "approve")
    expect(ap.length >= 2, "picking all and Approve approves each", ap.length)
    expect(rq.errors.length === 0, "requests: no page errors", rq.errors)
    await rq.p.close()
  }

  /* ── QUEUE ────────────────────────────────────────────────────────────── */
  if (want("QUEUE")) {
    console.log("\nQUEUE: the reports, restricted, the log")
    const { p, errors } = await open("moderation", VIEWS[1440])
    const cols = await p.evaluate(() => {
      const r = document.querySelector("[data-report]")
      const why = r?.querySelector("[data-report-why]")?.getBoundingClientRect()
      const words = r?.querySelector("[data-report-preview]")?.getBoundingClientRect()
      const acts = r?.querySelector("[data-report-actions]")?.getBoundingClientRect()
      return why && words && acts ? { why: [Math.round(why.left), Math.round(why.width)], words: [Math.round(words.left), Math.round(words.width)], actions: [Math.round(acts.left), Math.round(acts.width)], top: [Math.round(why.top), Math.round(acts.top)] } : null
    })
    expect(!!cols && cols.why[0] < cols.words[0] && cols.words[0] + cols.words[1] <= cols.actions[0] + 1 && Math.abs(cols.top[0] - cols.top[1]) <= 6, "a report is three columns: why, the words, the buttons, top aligned", cols)
    await p.click("[data-report]:nth-child(1) [data-report-dismiss]")
    await sleep(500)
    let w = await writes(p)
    expect(w.some((x) => x.method === "PATCH" && x.sent?.status === "dismissed"), "Dismiss sends dismissed", w.slice(-1))
    await p.click("[data-report] [data-report-remove]")
    await sleep(500)
    await press(p, "[role=dialog] button", "^Remove$")
    await sleep(600)
    w = await writes(p)
    expect(w.some((x) => x.method === "POST" && x.sent?.action === "remove" && x.sent?.targetType === "comment"), "Remove comment asks, then sends remove for the comment", w.slice(-1))
    const { p: p2, errors: e2 } = await open("moderation", VIEWS[1440])
    await p2.click("[data-report-approve]")
    await sleep(700)
    w = await writes(p2)
    expect(w.some((x) => x.sent?.action === "restore") && w.some((x) => x.sent?.status === "resolved"), "Approve on a held post restores it and resolves its report", w.map((x) => x.sent))
    await p2.click("[data-pick='report-reason']")
    await sleep(350)
    await press(p2, "[data-pick-menu='report-reason'] [data-row]", "^Harassment$")
    await sleep(600)
    const asked = (await reads(p2)).map((x) => x.short).filter((x) => /moderation\?/.test(x)).pop()
    expect(/reason=harassment/.test(asked || ""), "the Reason filter asks the server with reason=", asked)
    await p2.close()
    await p.screenshot({ path: join(shots, "moderation-acted-1440.png") })
    await p.close()

    const r = await open("moderation-restricted", VIEWS[1440])
    const tabCount = await r.p.evaluate(() => document.querySelector("[data-filter='restricted']")?.textContent)
    expect(/4/.test(tabCount || ""), "Restricted counts the removed too (one muted, suspended, banned and removed each)", tabCount)
    await r.p.click("[data-restricted-row='banned'] [data-undo]")
    await sleep(500)
    await press(r.p, "[role=dialog] button", "^Unban$")
    await sleep(600)
    const ub = (await writes(r.p)).find((x) => x.sent?.action === "unban")
    expect(!!ub, "Unban on Restricted asks, then sends unban", ub?.short)
    const a = await open("moderation-audit", VIEWS[1440])
    const audit = await a.p.evaluate(() => [...document.querySelectorAll("[data-audit] table tbody tr")].length)
    expect(audit === 5, "the audit log is a table of who, what, why and when", audit)
    expect(errors.length + e2.length + r.errors.length + a.errors.length === 0, "moderation: no page errors", [...errors, ...e2, ...r.errors, ...a.errors])
    await r.p.close()
    await a.p.close()
  }

  /* ── CONTENT ──────────────────────────────────────────────────────────── */
  if (want("CONTENT")) {
    console.log("\nCONTENT: Spaces, Posts, Calendar, Learn")
    const s0 = await open("spaces", VIEWS[1440])
    await s0.p.click("table [data-space-row]:nth-child(1) button[aria-label^='Move'][aria-label$='down']")
    await sleep(500)
    await s0.p.click("table [data-space-row]:nth-child(2) [data-row-control] button[aria-label^='Actions for']")
    await sleep(400)
    await menuItem(s0.p, "^Archive$")
    await sleep(500)
    let w = await writes(s0.p)
    expect(w.some((x) => x.method === "PATCH" && x.sent?.archived === true) && w.some((x) => x.method === "PUT" && x.sent?.ids?.[0] === "s2"), "a move sends the new order, Archive sends archived", w.map((x) => x.method))
    expect(s0.errors.length === 0, "spaces: no page errors", s0.errors)
    await s0.p.close()
    const s = await open("spaces", VIEWS[1440])
    const cell = await box(s.p, "table [data-space-row]:nth-child(1) td:nth-child(2)")
    await s.p.mouse.click(cell.x + cell.w / 2, cell.y + cell.h / 2)
    await sleep(600)
    await s.p.click("[data-select='space-kind']")
    await sleep(400)
    await press(s.p, "[data-pick-menu='space-kind'] [data-row]", "^Resources$")
    await sleep(400)
    await s.p.click("[data-space-save]")
    await sleep(600)
    w = await writes(s.p)
    expect(w.some((x) => x.method === "PATCH" && x.sent?.kind === "resources"), "the editor's Kind pick is what Save sends", w.slice(-1).map((x) => x.sent?.kind))
    expect(s.errors.length === 0, "spaces: no page errors", s.errors)
    await s.p.close()

    const f = await open("feed", VIEWS[1440])
    await f.p.type("[data-feed] [data-search] input", "prompt")
    await sleep(700)
    await f.p.click("[data-pick='post-space']")
    await sleep(350)
    await press(f.p, "[data-pick-menu='post-space'] [data-row]", "^Announcements$")
    await sleep(600)
    let asked = (await reads(f.p)).map((x) => x.short).filter((x) => /\/posts\?/.test(x)).pop() || ""
    expect(/q=prompt/.test(asked) && /space=s2/.test(asked), "the search and the space ask the server with q= and space=", asked)
    await f.p.click("[data-filter='pinned']")
    await sleep(500)
    asked = (await reads(f.p)).map((x) => x.short).filter((x) => /\/posts\?/.test(x)).pop() || ""
    expect(/show=pinned/.test(asked), "Pinned asks for show=pinned", asked)
    await f.p.close()
    const f2 = await open("feed", VIEWS[1440])
    await f2.p.click("li[data-feed-row]:nth-child(2) [data-row-control] button")
    await sleep(400)
    await menuItem(f2.p, "^Pin to the top$")
    await sleep(500)
    w = await writes(f2.p)
    expect(w.some((x) => x.sent?.action === "pin"), "Pin sends pin", w.slice(-1).map((x) => x.sent))
    await f2.p.click("[data-load-more]")
    await sleep(500)
    expect((await reads(f2.p)).some((x) => /cursor=c1/.test(x.short)), "Show more in the foot sends the cursor")
    expect(f.errors.length + f2.errors.length === 0, "posts: no page errors", [...f.errors, ...f2.errors])
    await f2.p.close()

    const e = await open("events", VIEWS[1440])
    const ecell = await box(e.p, "table [data-event-row]:nth-child(1) td:nth-child(3)")
    await e.p.mouse.click(ecell.x + ecell.w / 2, ecell.y + ecell.h / 2)
    await sleep(600)
    await e.p.click("[data-select='event-kind']")
    await sleep(400)
    await press(e.p, "[data-pick-menu='event-kind'] [data-row]", "^Workshop$")
    await sleep(400)
    await e.p.click("#ev-zone")
    await sleep(500)
    const zone = await e.p.evaluate(() => {
      const input = [...document.querySelectorAll("input")].find((i) => /Search a city/.test(i.placeholder || ""))
      return { search: !!input, rows: document.querySelectorAll("[data-choice-row], [role=option]").length }
    })
    expect(zone.search && zone.rows > 50, "the time zone opens the account's zone search, not a select", zone)
    await e.p.screenshot({ path: join(shots, "event-zone-1440.png") })
    await e.p.keyboard.press("Escape")
    await sleep(300)
    await e.p.click("[data-event-save]")
    await sleep(600)
    w = await writes(e.p)
    expect(w.some((x) => x.method === "PATCH" && x.sent?.kind === "workshop"), "the editor's Kind pick is what Save sends", w.slice(-1).map((x) => x.sent?.kind))
    expect(e.errors.length === 0, "events: no page errors", e.errors)
    await e.p.close()
    /* A fresh page: the save above read the (empty) stub list back. */
    const e2 = await open("events", VIEWS[1440])
    await e2.p.click("table [data-event-row]:nth-child(1) [data-row-control] button")
    await sleep(400)
    await menuItem(e2.p, "^Cancel event$")
    await sleep(500)
    await e2.p.click("[data-cancel-confirm]")
    await sleep(600)
    w = await writes(e2.p)
    expect(w.some((x) => x.sent?.status === "cancelled"), "Cancel event asks, then sends cancelled", w.slice(-1).map((x) => x.sent))
    expect(e2.errors.length === 0, "events: no page errors", e2.errors)
    await e2.p.close()

    const l = await open("learn", VIEWS[1440])
    await l.p.click("table [data-program-row]:nth-child(1) [data-row-control] button")
    await sleep(400)
    await menuItem(l.p, "^Move down$")
    await sleep(500)
    w = await writes(l.p)
    expect(w.some((x) => x.method === "PUT" && Array.isArray(x.sent?.ids) && x.sent.ids[0] === "pg2"), "Learn's Move down sends the new order", w.slice(-1).map((x) => x.sent))
    const lcell = await box(l.p, "table [data-program-row]:nth-child(1) td:nth-child(3)")
    await l.p.mouse.click(lcell.x + lcell.w / 2, lcell.y + lcell.h / 2)
    await sleep(700)
    const opened = await l.p.evaluate(() => !document.querySelector("[data-program-list]"))
    expect(opened, "pressing a program's row opens its editor")
    await l.p.screenshot({ path: join(shots, "learn-program-1440.png") })
    expect(l.errors.length === 0, "learn: no page errors", l.errors)
    await l.p.close()
  }

  /* ── PHONE ────────────────────────────────────────────────────────────── */
  if (want("PHONE")) {
    console.log("\nPHONE: sheets from the bottom")
    const { p, errors } = await open("members", PHONE)
    for (const pick of ["role", "joined", "sort"]) {
      await tapAt(p, `[data-pick='${pick}']`)
      await sleep(700)
      const s = await p.evaluate((pick) => {
        const el = document.querySelector(`[data-pick-sheet='${pick}']`)
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom) }
      }, pick)
      expect(!!s && s.top > 300 && s.bottom <= 844, `${pick}: the shared bottom sheet`, s)
      if (pick === "role") await p.screenshot({ path: join(shots, "members-role-sheet-390.png") })
      await p.keyboard.press("Escape")
      await p.evaluate(() => document.querySelector("[data-sheet-backdrop], [data-sheet-scrim]")?.click())
      await sleep(700)
    }
    await tapAt(p, "ul [data-member-row]:nth-child(3) [data-row-open]")
    await sleep(900)
    const sh = await p.evaluate(() => {
      const el = document.querySelector("[data-member-sheet]")
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { top: Math.round(b.top), choices: el.querySelectorAll("[data-member-choice]").length }
    })
    expect(!!sh && sh.top > 80 && sh.choices > 3, "the member sheet rises from the bottom with the choices", sh)
    await p.screenshot({ path: join(shots, "member-sheet-390.png") })
    expect(errors.length === 0, "phone members: no page errors", errors)
    await p.close()
    const m = await open("moderation", PHONE)
    await tapAt(m.p, "[data-report] [data-row-control] button, [data-report] button[aria-label='Report actions']")
    await sleep(800)
    const menu = await m.p.evaluate(() => !!document.querySelector("[data-action-sheet]"))
    expect(menu, "a report's menu is the action sheet")
    await m.p.screenshot({ path: join(shots, "moderation-menu-390.png") })
    expect(m.errors.length === 0, "phone moderation: no page errors", m.errors)
    await m.p.close()
    console.log(`  pictures: ${shots}`)
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
