/**
 * ===========================================================================
 *  THE EDITOR THROUGH A BAD NETWORK: OPENING, SECTION ACTIONS, PUBLISH
 * ===========================================================================
 * The owner (round 51):
 *   "Sometimes I reload the editor and it doesn't load at all. It's stuck on
 *    'Just a moment' loading, or shows completely blank."
 *   "When I move a section down, add a section or adjust something, it
 *    completely breaks the editor with errors, and I have to reload."
 *   "When I click Publish, sometimes it gets stuck forever and never
 *    publishes."
 *
 * The real editor (scripts/editor-probe-harness.mjs, nothing about the
 * editor stubbed), on a Storelib theme and on an imported theme (Materia,
 * scripts/canvas-probe-kit.mjs), with the routes made to misbehave through
 * PROBE_CHAOS (scripts/render-editor-probe.tsx): slow, failing, never
 * answering, and answering out of order.
 *
 *   OPENING   each way of misbehaving, a fresh tab each: how long until the
 *             editor is up or a problem with Try again is on screen. Stuck:
 *             neither after STUCK_MS (only a loader, or nothing).
 *   ACTIONS   ACTIONS presses of Move down, Move up, Add a section, Delete
 *             and Undo, a few hundred ms apart, while saves answer slowly,
 *             fail with a 503 or never answer: errors thrown in the page,
 *             console errors, the builder's error screen (probeBoundary),
 *             and whether the sidebar and the canvas agree at the end.
 *   PUBLISH   Publish pressed with the publish route slow, never answering,
 *             failing, and answering once its first answer was lost: how
 *             long the button stays busy, and whether it ends published.
 *
 *   npx tsx scripts/check-editor-r51.mjs        (ONLY=load|actions|publish)
 *
 * Prints the counts. Exits 1 when any opening is stuck, any action breaks
 * the editor, or any publish is left hanging.
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { importedTheme, STORELIB_GLOBALS, sleep } from "./canvas-probe-kit.mjs"

const STUCK_MS = Number(process.env.STUCK_MS ?? 30_000)
const ACTIONS = Number(process.env.ACTIONS ?? 100)
const ONLY = process.env.ONLY ?? ""
const KINDS = (process.env.KINDS ?? "storelib,imported").split(",")
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c636060606000000005000146a53e1a0000000049454e44ae426082", "hex")

const { bundle, css } = await import("./editor-probe-harness.mjs")
const compat = KINDS.includes("imported") ? await importedTheme() : null

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  if (url.pathname === "/") {
    const kind = url.searchParams.get("kind")
    const globals = kind === "imported" ? `window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};` : STORELIB_GLOBALS
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;${url.searchParams.get("live") ? "window.PROBE_LIVE=true;window.PROBE_HAS_DRAFT=true;" : ""}${globals}</script><script src="/editor-probe.js"></script></body></html>`)
    return
  }
  if (url.pathname === "/editor-probe.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" })
    res.end(readFileSync(bundle))
    return
  }
  const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
  if (asset && compat) {
    const text = compat.all[`shopify/assets/${decodeURIComponent(asset[1])}`]
    if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
    res.writeHead(200, { "Content-Type": asset[1].endsWith(".css") ? "text/css" : asset[1].endsWith(".js") ? "text/javascript" : "text/plain", "Access-Control-Allow-Origin": "*" })
    res.end(text)
    return
  }
  res.writeHead(404)
  res.end()
})
await new Promise((ok) => server.listen(0, "127.0.0.1", ok))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
})

/** A tab on the editor, `chaos` the body of PROBE_CHAOS (method `m`, address `u`, and `n`, a counter per key, in scope). */
async function open(kind, chaos = "", { live = false, phone = false } = {}) {
  const page = await browser.newPage()
  const errors = []
  const consoleErrors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 240)) })
  await page.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
  /* Every toast and save banner said, kept in the page (a MutationObserver from the first frame). */
  await page.evaluateOnNewDocument(`(() => {
    window.probeSaid = []
    window.probeRejections = []
    window.addEventListener("unhandledrejection", (e) => window.probeRejections.push(String(e.reason && (e.reason.stack || e.reason)).slice(0, 300)))
    const seen = new WeakSet()
    new MutationObserver(() => {
      for (const t of document.querySelectorAll("[data-sonner-toast], [data-save-problem]")) {
        if (seen.has(t)) continue
        seen.add(t)
        setTimeout(() => window.probeSaid.push((t.textContent || "").trim().slice(0, 120)), 50)
      }
    }).observe(document, { subtree: true, childList: true })
  })()`)
  await page.evaluateOnNewDocument(`(() => {
    const counts = {}
    const n = (k) => (counts[k] = (counts[k] || 0) + 1)
    window.PROBE_CHAOS = (m, u) => { ${chaos || "return null"} }
  })()`)
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = r.url()
    if (/example\.invalid/.test(u) || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
    if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) return r.continue()
    return r.respond({ status: 200, contentType: "text/plain", body: "" })
  })
  const t0 = Date.now()
  await page.goto(`${base}/?kind=${kind}${live ? "&live=1" : ""}`, { waitUntil: "domcontentloaded" })
  return { page, errors, consoleErrors, t0, js: (fn, ...a) => page.evaluate(fn, ...a) }
}

/** What the editor shows now: "editor" (the page drawn, no loader over it), "problem" (a problem with Try again), "boundary", or "loading". */
/* The imported theme's own document: the canvas frame's (an opaque origin, so read through the devtools protocol). */
async function frontIds(tab) {
  const f = await (await tab.page.$("[data-compat-frame='front']"))?.contentFrame().catch(() => null)
  if (!f) return null
  return f.evaluate(() => [...document.querySelectorAll(".shopify-section[id]")].map((s) => s.id.replace(/^shopify-section-/, ""))).catch(() => null)
}

async function stateOf(tab, kind) {
  const s = await tab.js(() => {
    if (document.getElementById("probe-boundary")) return "boundary"
    if (document.querySelector("[data-canvas-problem]")) return "problem"
    const loader = document.querySelector(".wb-canvas-loader:not([data-leaving='true'])")
    const drawn = document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 5
    if (loader) return "loading"
    if (drawn) return "editor"
    return document.querySelector("#app")?.textContent?.trim() ? "drawn?" : "blank"
  })
  if (s !== "drawn?") return s
  if (kind !== "imported") return "loading"
  const ids = await frontIds(tab)
  return ids && ids.length ? "editor" : "loading"
}

async function waitSettled(tab, kind, limit = STUCK_MS) {
  for (;;) {
    const s = await stateOf(tab, kind).catch(() => "loading")
    const ms = Date.now() - tab.t0
    if (s === "editor" || s === "problem" || s === "boundary") return { state: s, ms }
    if (ms > limit) return { state: `stuck (${s})`, ms }
    await sleep(250)
  }
}

let bad = 0
const line = (ok, label, detail) => {
  if (!ok) bad++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

/* ── OPENING ───────────────────────────────────────────────────────────── */
const INSTALL = `/\\/themes\\/probe-install$/.test(u)`
const HOME = `/\\/themes\\/probe-install\\/sections\\?page=home/.test(u) && m === "GET"`
const COMPAT_FILES = `/\\/files\\?compat=1/.test(u)`
const LOADS = [
  ["answers at once", ""],
  ["every route 2.5s", `return { delay: 2500 }`],
  ["the website's read never answers once", `if (${INSTALL} && n("i") === 1) return { hang: true }`],
  ["the home page's sections never answer once", `if (${HOME} && n("h") === 1) return { hang: true }`],
  ["the website's read answers 503 three times", `if (${INSTALL} && n("i") <= 3) return { status: 503 }`],
  ["the website's read answers 500 twice", `if (${INSTALL} && n("i") <= 2) return { status: 500 }`],
  ["the website's read 6s, sections at once", `if (${INSTALL}) return { delay: 6000 }`],
  ["sections 6s, the website's read at once", `if (${HOME}) return { delay: 6000 }`],
  ["the website's read never answers", `if (${INSTALL}) return { hang: true }`],
  ["the theme's files never answer once (imported)", `if (${COMPAT_FILES} && n("c") === 1) return { hang: true }`, "imported"],
  ["the theme's files answer 500 five times (imported)", `if (${COMPAT_FILES} && n("c") <= 5) return { status: 500 }`, "imported"],
]
const totals = { loads: 0, stuck: 0, blank: 0, boundary: 0, actions: 0, broke: 0, pageErrors: 0, publishes: 0, hung: 0 }

if (!ONLY || ONLY === "load") {
  console.log(`\nOPENING (stuck: no editor and no Try again after ${STUCK_MS / 1000}s)`)
  for (const kind of KINDS) {
    for (const [label, chaos, only] of LOADS) {
      if (only && only !== kind) continue
      if (process.env.CASE && !label.includes(process.env.CASE)) continue
      const tab = await open(kind, chaos)
      const r = await waitSettled(tab, kind)
      totals.loads++
      if (r.state.startsWith("stuck")) totals.stuck++
      if (r.state.includes("blank")) totals.blank++
      if (r.state === "boundary") totals.boundary++
      totals.pageErrors += tab.errors.length
      line(!r.state.startsWith("stuck") && r.state !== "boundary", `${kind}: ${label}`, `${r.state} at ${(r.ms / 1000).toFixed(1)}s${tab.errors.length ? `, ${tab.errors.length} errors: ${tab.errors[0]}` : ""}`)
      await tab.page.close()
    }
  }
}

/* ── ACTIONS ───────────────────────────────────────────────────────────── */
/* Saves: slow and in any order (0 to 1.8s), one in six a 503, one in twenty never answering. Reads answer. */
const SAVES = `if (m !== "GET" && /\\/themes\\/probe-install\\/(sections|settings)/.test(u)) { const r = Math.random(); if (r < 0.05) return { hang: true }; if (r < 0.22) return { status: 503 }; return { delay: Math.round(Math.random() * 1800) } }`

async function clickAt(page, p) { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up() }

async function rowMenu(tab, nth, item) {
  const more = await tab.js((nth) => {
    const rows = [...document.querySelectorAll("[data-section-group='template'] [data-section-row]")]
    if (!rows.length) return null
    const r = rows[Math.min(nth, rows.length - 1)]
    r.scrollIntoView({ block: "center" })
    const m = r.querySelector("[data-section-more]")
    if (!m) return null
    m.style.display = "flex"
    const q = m.getBoundingClientRect()
    return { x: q.left + q.width / 2, y: q.top + q.height / 2 }
  }, nth)
  if (!more) return "no row"
  await clickAt(tab.page, more)
  await sleep(120)
  const at = await tab.js((item) => {
    const i = document.querySelector(`[data-action-item='${item}']`)
    if (!i || i.getAttribute("data-disabled") !== null || i.getAttribute("aria-disabled") === "true") return null
    const q = i.getBoundingClientRect()
    return { x: q.left + q.width / 2, y: q.top + q.height / 2 }
  }, item)
  if (!at) { await tab.page.keyboard.press("Escape"); return `no ${item}` }
  await clickAt(tab.page, at)
  return true
}

async function addOne(tab, nth) {
  const opened = await tab.js(async (nth) => {
    const lines = document.querySelectorAll("[data-section-group='template'] [data-insert-section]")
    const l = lines[Math.min(nth, lines.length - 1)]
    if (!l) return false
    l.scrollIntoView({ block: "center" })
    l.click()
    for (let i = 0; i < 40; i++) {
      const card = [...document.querySelectorAll("[data-section-library] [data-library-card]")].find((c) => c.getClientRects().length && !c.hidden)
      if (card) return true
      await new Promise((r) => setTimeout(r, 100))
    }
    return false
  }, nth)
  if (!opened) return "no library"
  const card = await tab.js(() => {
    const cards = [...document.querySelectorAll("[data-section-library] [data-library-card]")].filter((c) => c.getClientRects().length && !c.hidden)
    const c = cards[Math.floor(Math.random() * Math.min(cards.length, 6))]
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + Math.min(40, r.height / 2) }
  })
  await clickAt(tab.page, card)
  await sleep(500)
  /* Back to the list: the library closes on its own after an add; Escape if it did not. */
  const still = await tab.js(() => !!document.querySelector("[data-section-library] [data-library-card]"))
  if (still) await tab.page.keyboard.press("Escape")
  return true
}

/* A section picked in the sidebar, then its toolbar's button pressed `times` times, `gap` ms apart. */
async function burst(tab, nth, label, times, gap) {
  const ok = await tab.js((nth) => {
    const rows = [...document.querySelectorAll("[data-section-group='template'] [data-section-row]")]
    const r = rows[Math.min(nth, rows.length - 1)]
    if (!r) return false
    r.scrollIntoView({ block: "center" })
    r.click()
    return true
  }, nth)
  if (!ok) return "no row"
  await sleep(350)
  let pressed = 0
  for (let i = 0; i < times; i++) {
    const did = await tab.js((label) => {
      const b = [...document.querySelectorAll(`button[aria-label='${label}']`)].find((x) => x.getClientRects().length && !x.disabled)
      if (!b) return false
      b.click()
      return true
    }, label)
    if (did) pressed++
    await sleep(gap)
  }
  return pressed ? true : `no ${label}`
}

async function backToList(tab) {
  for (let i = 0; i < 4; i++) {
    if (await tab.js(() => document.querySelectorAll("[data-section-group='template'] [data-section-row]").length > 0)) return true
    await tab.page.keyboard.press("Escape")
    await tab.js(() => { const b = [...document.querySelectorAll("[data-panel-back] button")].find((x) => x.getClientRects().length); b?.click() })
    await sleep(250)
  }
  return false
}

if (!ONLY || ONLY === "actions") {
  console.log(`\nACTIONS (${ACTIONS} per theme; saves slow, out of order, 17% 503, 5% never answering)`)
  for (const kind of KINDS) {
    const tab = await open(kind, SAVES)
    const ready = await waitSettled(tab, kind, 60_000)
    if (ready.state !== "editor") { line(false, `${kind}: the editor opened`, ready.state); await tab.page.close(); continue }
    await sleep(1500)
    const done = { move: 0, add: 0, delete: 0, undo: 0, skipped: 0 }
    let firstBreak = null
    for (let k = 0; k < ACTIONS; k++) {
      const before = tab.errors.length
      const roll = Math.random()
      const rows = await tab.js(() => document.querySelectorAll("[data-section-group='template'] [data-section-row]").length)
      let r
      if (!(await backToList(tab))) r = "no list"
      else if (roll < 0.25) { r = await burst(tab, Math.floor(Math.random() * rows), ["Move down", "Move up", "Duplicate"][Math.floor(Math.random() * 3)], 2 + Math.floor(Math.random() * 4), 40 + Math.random() * 120); if (r === true) done.move++ }
      else if (roll < 0.45) { r = await rowMenu(tab, Math.floor(Math.random() * rows), Math.random() < 0.6 ? "move-down" : "move-up"); if (r === true) done.move++ }
      else if (roll < 0.65 && rows < 18) { r = await addOne(tab, Math.floor(Math.random() * rows)); if (r === true) done.add++ }
      else if (roll < 0.8 && rows > 4) { r = await rowMenu(tab, Math.floor(Math.random() * rows), "delete"); if (r === true) done.delete++ }
      else { await tab.page.keyboard.down("Control"); await tab.page.keyboard.press("z"); await tab.page.keyboard.up("Control"); r = true; done.undo++ }
      if (r !== true) done.skipped++
      await sleep(150 + Math.random() * 250)
      const broke = await tab.js(() => !!document.getElementById("probe-boundary"))
      if ((tab.errors.length > before || broke) && !firstBreak) firstBreak = { at: k, error: tab.errors[before] ?? (await tab.js(() => window.probeBoundary?.[0])) }
      if (broke) { totals.broke++; break }
    }
    /* Settled: every save answered or given up on, and the sidebar and the canvas list the same sections. */
    await sleep(4000)
    await backToList(tab)
    const ids = kind === "imported" ? (await frontIds(tab)) ?? [] : null
    const agree = await tab.js((ids) => {
      const rows = [...document.querySelectorAll("[data-section-group='template'] [data-section-row]")].map((r) => r.getAttribute("data-section-row"))
      if (ids) return { rows: rows.length, canvas: ids.length, missing: rows.filter((r) => !ids.some((i) => i.endsWith(r))).length }
      const boxes = [...document.querySelectorAll("#wb-preview-root [data-section-box]")].map((b) => b.getAttribute("data-section-key"))
      const gone = rows.filter((r) => !boxes.includes(r)); return { rows: rows.length, canvas: boxes.length, missing: gone.length, which: gone.map((r) => [r, document.querySelector(`[data-section-row="${r}"]`)?.textContent?.trim().slice(0, 40)]) }
    }, ids)
    const boundary = await tab.js(() => window.probeBoundary ?? [])
    const rejections = await tab.js(() => window.probeRejections ?? [])
    tab.errors.push(...rejections.map((x) => `unhandled rejection: ${x}`))
    const said = await tab.js(() => window.probeSaid ?? [])
    const tally = {}
    for (const w of said) tally[w] = (tally[w] ?? 0) + 1
    console.log(`        said: ${JSON.stringify(tally)}`)
    console.log(`        console errors: ${tab.consoleErrors.length}${tab.consoleErrors.length ? `, first: ${tab.consoleErrors[0]}` : ""}`)
    totals.actions += done.move + done.add + done.delete + done.undo
    totals.pageErrors += tab.errors.length
    const per100 = ((tab.errors.length + boundary.length) * 100) / Math.max(1, done.move + done.add + done.delete + done.undo)
    line(!tab.errors.length && !boundary.length, `${kind}: ${done.move} moves, ${done.add} adds, ${done.delete} deletes, ${done.undo} undos (${done.skipped} skipped)`, `${tab.errors.length} page errors, ${boundary.length} error screens, ${per100.toFixed(1)} per 100 actions${firstBreak ? `; first at action ${firstBreak.at}: ${firstBreak.error}` : ""}`)
    line(agree.missing === 0, `${kind}: sidebar and canvas agree`, JSON.stringify(agree))
    /* Every write the editor sent, through the routes' own checks (their schema, cleaning and limits) in node: a write a route would refuse is a save that fails in production. */
    const refused = await replaySaves(await tab.js(() => window.probeSaves ?? []))
    line(refused.length === 0, `${kind}: every save is one the routes take`, refused.length ? `${refused.length} refused, first: ${refused[0]}` : "")
    if (process.env.DEBUG) console.log(tab.errors.slice(0, 5).join("\n"), "\n", boundary.slice(0, 2).join("\n"))
    await tab.page.close()
  }
}

async function replaySaves(saves) {
  const { z } = await import("zod")
  const { BlockInstanceSchema } = await import("../lib/website-builder/block-tree-schema.ts")
  const { blockTreeProblem } = await import("../lib/website-builder/block-tree.ts")
  const { sanitizeSections } = await import("../lib/website-builder/sanitize-sections.ts")
  const Section = z.object({ id: z.string().min(1).max(128), type: z.string().min(1).max(64), name: z.string().max(256).optional().default(""), label: z.string().max(80).optional(), settings: z.record(z.unknown()), blocks: z.array(BlockInstanceSchema).max(500).optional(), hidden: z.boolean().optional(), group: z.enum(["header", "footer", "overlay"]).optional(), slot: z.string().regex(/^[a-z0-9_-]{1,64}$/i).optional() })
  const Group = z.array(Section).max(25).nullable().optional()
  const Page = z.object({ page_key: z.string().min(1).max(64), sections: z.array(Section).max(500), mode: z.enum(["draft", "publish"]).optional() })
  const Sync = z.object({ header: Section.nullable(), footer: Section.nullable(), header_group: Group, footer_group: Group, overlay_group: Group, current_page: z.string().min(1).max(64), mode: z.enum(["draft", "publish"]) })
  const out = []
  for (const { url, body } of saves) {
    try {
      if (/sync-global$/.test(url)) {
        const r = Sync.safeParse(body)
        if (!r.success) { out.push(`sync-global: ${JSON.stringify(r.error.issues[0])}`); continue }
        const sent = [...(body.header_group ?? []), ...(body.footer_group ?? []), ...(body.overlay_group ?? [])]
        const p = sent.map((x) => blockTreeProblem(x)).find(Boolean)
        if (p) out.push(`sync-global 413: ${p}`)
        sanitizeSections(sent)
      } else if (/\/sections$/.test(url)) {
        const r = Page.safeParse(body)
        if (!r.success) { out.push(`sections: ${JSON.stringify(r.error.issues[0])}`); continue }
        const clean = sanitizeSections(body.sections)
        const p = clean.map((x) => blockTreeProblem(x)).find(Boolean)
        if (p) out.push(`sections 413: ${p}`)
        const ids = new Set()
        for (const x of body.sections) { if (ids.has(x.id)) out.push(`sections: the id ${x.id} twice on one page`); ids.add(x.id) }
      }
    } catch (e) {
      out.push(`${url.split("/").pop()} threw: ${String(e).slice(0, 160)}`)
    }
  }
  return out
}

/* ── PUBLISH ───────────────────────────────────────────────────────────── */
const PUB = `/\\/themes\\/probe-install\\/publish/.test(u)`
/* [what happens, PROBE_CHAOS, what the press must end in: "published" (said so) or "said" (a problem said, the button free)] */
const PUBLISHES = [
  ["answers at once", "", "published"],
  ["publish answers after 8s", `if (${PUB} && m === "POST") return { delay: 8000 }`, "published"],
  ["publish never answers (it never arrived)", `if (${PUB} && m === "POST") return { hang: true }; if (${PUB} && m === "GET") return { status: 200, body: { job: "unknown" } }`, "said"],
  ["publish runs past its deadline", `if (${PUB} && m === "POST") return { hang: true }; if (${PUB} && m === "GET") return { status: 200, body: { job: n("g") > 3 ? "expired" : "running" } }`, "said"],
  ["publish's first answer is lost, the publish went through", `if (${PUB} && m === "POST" && n("p") === 1) { window.probePublished = true; return { hang: true } } if (${PUB} && m === "GET") return window.probePublished ? { status: 200, body: { job: "done" } } : null`, "published"],
  ["publish answers a gateway's 503 once, never reached the job", `if (${PUB} && m === "POST" && n("p") === 1) return { status: 503 }; if (${PUB} && m === "GET") return { status: 200, body: { job: "unknown" } }`, "published"],
  ["publish answers once lost, no jobs kept (before SQL part 360)", `if (${PUB} && m === "POST" && n("p") === 1) return { hang: true }`, "published"],
  ["the save before publish never answers", `if (m === "PUT" && /\\/sections$/.test(u)) return { hang: true }`, "said"],
]

/* Where the editor's notice sits against the top bar: its box, the bar's bottom, and whether they overlap. */
async function noticePlace(tab) {
  await sleep(350)
  return tab.js(() => {
    const n = document.querySelector("[data-editor-notice] > div") ?? document.querySelector("div.z-\\[100\\] span.truncate")?.parentElement
    const bar = document.querySelector(".wb-editor-topbar")
    if (!n || !bar) return null
    const a = n.getBoundingClientRect()
    const b = bar.getBoundingClientRect()
    const d = document.querySelector("[data-ask-dock]")?.getBoundingClientRect()
    const overDock = !!d && d.height > 0 && a.top < d.bottom && a.bottom > d.top && a.left < d.right && a.right > d.left
    return { top: Math.round(a.top), bottom: Math.round(a.bottom), barBottom: Math.round(b.bottom), dockTop: d ? Math.round(d.top) : null, viewport: innerHeight, overBar: a.top < b.bottom && a.bottom > b.top, overDock }
  })
}

async function pressPublish(tab) {
  /* An edit first, so there is something to publish: a section moved. */
  await backToList(tab)
  await rowMenu(tab, 2, "move-down")
  await sleep(300)
  await tab.js(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Publish$/.test((x.textContent || "").trim()) && x.getClientRects().length); b?.click() })
  await sleep(600)
  /* The panel's own Publish. */
  const pressed = await tab.js(() => {
    const all = [...document.querySelectorAll("button")].filter((x) => /^Publish( changes)?$/.test((x.textContent || "").trim()) && x.getClientRects().length && !x.disabled)
    const b = all[all.length - 1]
    if (!b) return false
    b.click()
    return true
  })
  return pressed
}

if (!ONLY || ONLY === "publish") {
  console.log("\nPUBLISH (hung: still busy after 90s)")
  for (const [label, chaos, want] of PUBLISHES) {
    const tab = await open("storelib", chaos, { live: true })
    const ready = await waitSettled(tab, "storelib", 60_000)
    if (ready.state !== "editor") { line(false, `publish: the editor opened`, ready.state); await tab.page.close(); continue }
    await sleep(1500)
    const pressed = await pressPublish(tab)
    const t = Date.now()
    let busyFor = 0
    let toast = ""
    let placed = null
    for (;;) {
      await sleep(250)
      const s = await tab.js(() => ({
        busy: [...document.querySelectorAll("button")].some((x) => /^Publishing/.test((x.textContent || "").trim()) && x.getClientRects().length),
        toast: [...document.querySelectorAll("[data-sonner-toast], div.z-\\[100\\] span.truncate")].map((x) => x.textContent.trim()).filter(Boolean).join(" | "),
      }))
      if (s.toast) toast = s.toast
      if (s.toast && !placed) { placed = await noticePlace(tab); if (process.env.SHOT_DESK) await tab.page.screenshot({ path: process.env.SHOT_DESK }) }
      busyFor = Date.now() - t
      if (!s.busy && busyFor > 600) break
      if (busyFor > 90_000) break
    }
    const hung = busyFor > 90_000
    totals.publishes++
    if (hung) totals.hung++
    const ended = /saved and published/i.test(toast) ? "published" : toast ? "said" : "nothing said"
    if (ended !== want) totals.wrong = (totals.wrong ?? 0) + 1
    totals.busyMs = (totals.busyMs ?? 0) + busyFor
    line(pressed && !hung && ended === want, `publish: ${label}`, `ended ${ended} (want ${want}), `+ `${pressed ? "" : "not pressed; "}busy ${(busyFor / 1000).toFixed(1)}s, said: ${toast || "nothing"}`)
    if (placed) line(!placed.overBar && !placed.overDock, `publish: the notice is clear of the top bar and the Ask dock`, JSON.stringify(placed))
    await tab.page.close()
  }
}

/* ── THE NOTICE ON A PHONE ─────────────────────────────────────────────── */
if (!ONLY || ONLY === "publish" || ONLY === "notice") {
  console.log("\nTHE NOTICE AFTER PUBLISH, ON A PHONE (390 x 844)")
  const tab = await open("storelib", "", { live: true, phone: true })
  const ready = await waitSettled(tab, "storelib", 60_000)
  await sleep(1500)
  /* Something to publish: a section moved from the sheet's list. */
  await rowMenu(tab, 2, "move-down")
  await sleep(400)
  await tab.page.keyboard.press("Escape")
  const opened = await tab.js(() => { const b = [...document.querySelectorAll("button[aria-label='Publish']")].find((x) => x.getClientRects().length); b?.click(); return !!b })
  await sleep(1200)
  if (process.env.SHOT) await tab.page.screenshot({ path: process.env.SHOT.replace(".png", "-panel.png") })
  const pressedIn = await tab.js(() => {
    const all = [...document.querySelectorAll("button")].filter((x) => /^Publish( changes)?$/.test((x.textContent || "").trim()) && x.getClientRects().length && !x.disabled && x.getAttribute("aria-label") !== "Publish")
    all[all.length - 1]?.click()
    return all.map((b) => b.textContent.trim())
  })
  if (process.env.DEBUG) console.log("opened", opened, "pressed", pressedIn)
  let placed = null
  for (let i = 0; i < 40 && !placed; i++) {
    await sleep(200)
    const said = await tab.js(() => [...document.querySelectorAll("div.z-\\[100\\] span.truncate")].map((x) => x.textContent.trim()).filter(Boolean).join(" | "))
    if (said) placed = { said, ...(await noticePlace(tab)) }
  }
  if (process.env.SHOT) await tab.page.screenshot({ path: process.env.SHOT })
  line(ready.state === "editor" && !!placed && !placed.overBar, "phone: the notice is under the top bar, not on it", JSON.stringify(placed))
  await tab.page.close()
}

console.log(`\nTOTALS ${JSON.stringify(totals)}`)
await browser.close()
server.close()
process.exit(bad ? 1 : 0)
