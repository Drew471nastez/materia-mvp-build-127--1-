/**
 * ===========================================================================
 *  WHAT ARE YOU SELLING? MEASURED
 * ===========================================================================
 * The question before a new product (app/(storelib)/app/products/new/kind-chooser.tsx,
 * drawn by scripts/render-new-product.tsx) at 390x844 and 1280x800:
 *
 *   SHAPE     a sheet on the phone's bottom edge, full width; a dialog in
 *             the middle of a computer's window, at most 520px wide
 *   ROWS      a digital product, a video course and Import, whatever the
 *             communities switch says (a community is made from the
 *             Community page now, ./product-kinds); never Membership.
 *             Each with its drawing and its name; every row at least 56px
 *             tall, nothing scrolls sideways. Changed on purpose (products
 *             round 42): this probe still asked for "What are you
 *             selling?", Paid community and no Import row, none of which
 *             the chooser has had for several rounds
 *   MOTION    the phone's sheet rises, every frame higher than
 *             the last, at a 4x slower CPU; the longest gap between frames
 *             is reported
 *   KEYS      the first answer has the focus; down, up (wrapping), End and
 *             Home move it; Escape closes and the focus is back on New product
 *   ANSWERS   Digital product and Video course open their editors
 *             (/app/products/new?type=digital, ?type=course) by the router;
 *             Import opens the link form in place and goes nowhere, with
 *             the link field focused (on a phone in the tap itself, so the
 *             keyboard comes with it); nothing is posted anywhere by a
 *             pick; both editors were fetched ahead
 *   PAGE      /app/products/new with no kind: the same answers, and a pick
 *             replaces the page with its editor
 *
 * At 390x844 and 1440x900, with communities off and on.
 *
 *   PROBE_CSS=source node scripts/check-new-product.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const inter = interFaces(root)
const stubs = join(root, ".new-product-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-new-product-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `const log = (kind, href) => (window.__nav = window.__nav || []).push({ kind, href, at: performance.now() })
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back", ""), refresh() {} }
export const usePathname = () => "/app/products"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-new-product.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.new-product-probe/navigation.js", "next/link": "./.new-product-probe/link.jsx" },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")

/* The communities switch, answered in the page from the hash; anything posted anywhere is written down (nothing should be). */
const server = `
window.__posts = []
const realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  const json = (x, status) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  if (url.startsWith("/api/platform/flags")) return json({ communities: location.hash.endsWith("-on") }, 200)
  if (init && init.method && init.method !== "GET") window.__posts.push(url)
  return realFetch(input, init)
}
`
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${server}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

async function openPage(vp, hash = "sheet") {
  const p = await browser.newPage()
  await p.setViewport(vp)
  /* A computer has a mouse. This headless Chromium answers (pointer: fine) with false even when told otherwise, and the
     link form asks it before focusing its field on a computer, so on the computer sizes the page is answered for it. */
  if (!vp.hasTouch) {
    await p.evaluateOnNewDocument(() => {
      const real = window.matchMedia.bind(window)
      window.matchMedia = (q) => {
        const m = real(q)
        if (q.trim() !== "(pointer: fine)") return m
        return { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
      }
    })
  }
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname === "/__probe") return r.respond({ status: 200, contentType: "text/html", body: html })
    return r.respond({ status: 404, body: "" })
  })
  await p.goto(`https://storelib.com/__probe#${hash}`, { waitUntil: "domcontentloaded" })
  await p.waitForFunction(() => document.querySelector("[data-new-product], [data-kind-page]"))
  return { p, errors }
}

/** The chooser's box, once it has stopped moving (three frames alike). */
async function settled(p) {
  return p.evaluate(async () => {
    let last = ""
    let same = 0
    for (let i = 0; i < 120 && same < 3; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      const el = document.querySelector("[data-new-product-chooser]")
      const r = el?.getBoundingClientRect()
      const key = r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : ""
      same = key && key === last ? same + 1 : 0
      last = key
    }
    const el = document.querySelector("[data-new-product-chooser]")
    if (!el) return null
    const r = el.getBoundingClientRect()
    const panel = el.closest("[role=dialog]") || el.parentElement
    const pr = panel.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, panelTop: pr.top, panelBottom: pr.bottom, panelLeft: pr.left, panelWidth: pr.width }
  })
}

const nav = (p) => p.evaluate(() => (window.__nav || []).filter((n) => n.kind !== "prefetch").map((n) => `${n.kind} ${n.href}`))

for (const [label, vp, phone] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
  ["desktop-1440", { width: 1440, height: 900 }, false],
]) {
  for (const on of [false, true]) {
  const tag = `${label}-communities-${on ? "on" : "off"}`
  const sheet = on ? "sheet-on" : "sheet"
  /* The communities switch no longer adds an answer: the same rows either way. */
  const want = "digital,course,import"
  console.log(`\n${tag}`)
  /* ── SHAPE, ROWS, MOTION ─────────────────────────────────────────── */
  {
    const { p, errors } = await openPage(vp, sheet)
    /* The switch is read with the page, before New product is pressed (as in the app, where the header has asked already). */
    await p.waitForFunction(() => performance.now() > 0)
    await sleep(150)
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    /* Every frame of the opening, from the press. */
    await p.evaluate(() => {
      window.__frames = []
      window.__rowsSeen = []
      const t0 = performance.now()
      const tick = () => {
        const el = document.querySelector("[data-new-product-chooser]")
        const r = el?.getBoundingClientRect()
        window.__frames.push({ t: performance.now() - t0, top: r ? r.top : null })
        if (el) window.__rowsSeen.push(el.querySelectorAll("[data-kind]").length)
        if (performance.now() - t0 < 900) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      document.querySelector("[data-new-product]").click()
    })
    await sleep(1100)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const frames = await p.evaluate(() => window.__frames)
    const seen = frames.filter((f) => f.top !== null)
    const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t)
    const longest = Math.round(Math.max(...gaps))
    const first = seen[0]
    if (phone) {
      const rising = seen.every((f, i) => i === 0 || f.top <= seen[i - 1].top + 0.5)
      const moved = seen.length > 1 && seen[0].top - seen[seen.length - 1].top > 100
      expect(rising && moved, "MOTION: the sheet rises, every frame higher than the last (4x slower CPU)", { frames: seen.length, from: Math.round(seen[0]?.top), to: Math.round(seen[seen.length - 1]?.top) })
    } else {
      expect(seen.length > 0, "MOTION: the dialog is there", { frames: seen.length })
    }
    const counts = await p.evaluate(() => [...new Set(window.__rowsSeen)])
    expect(counts.length === 1 && counts[0] === want.split(",").length, "ROWS: the same answers on every frame from the first (no row arrives late)", counts)
    console.log(`        first drawn ${Math.round(first?.t ?? -1)}ms after the press; longest gap between frames ${longest}ms at 4x slower CPU`)

    const box = await settled(p)
    if (phone) {
      expect(box && Math.abs(box.panelBottom - vp.height) <= 1 && box.panelWidth >= vp.width - 1, "SHAPE: a sheet on the bottom edge, the full width", box)
    } else {
      const mid = box ? box.panelLeft + box.panelWidth / 2 : 0
      expect(box && Math.abs(mid - vp.width / 2) <= 2 && box.panelWidth <= 520 && box.panelTop > 100, "SHAPE: a dialog in the middle, at most 520px wide", box)
    }
    const rows = await p.evaluate(() =>
      [...document.querySelectorAll("[data-new-product-chooser] [data-kind]")].map((b) => ({
        kind: b.getAttribute("data-kind"),
        h: Math.round(b.getBoundingClientRect().height),
        art: !!b.querySelector("svg"),
        text: b.innerText.replace(/\s+/g, " ").trim(),
      })),
    )
    expect(rows.map((r) => r.kind).join() === want, `ROWS: ${want}`, rows.map((r) => r.kind))
    expect(!rows.some((r) => /membership/i.test(`${r.kind} ${r.text}`)), "ROWS: no Membership anywhere", rows.map((r) => r.text))
    expect(rows.every((r) => r.h >= 56 && r.art), "ROWS: each at least 56px tall, with its drawing", rows.map((r) => r.h))
    expect(/Digital product/.test(rows[0]?.text) && /Video course/.test(rows[1]?.text) && /Import/.test(rows[2]?.text), "ROWS: the names", rows.map((r) => r.text))
    /* The title is the sheet's header on a phone and the dialog's first line on a computer. */
    const title = await p.evaluate(() => (document.querySelector("[data-new-product-chooser]")?.closest("[role=dialog]")?.querySelector("h2")?.textContent ?? "").trim())
    expect(title === "Create new product", "the question", title)
    const fit = await p.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, width: innerWidth }))
    expect(fit.scroll <= fit.width, "FIT: nothing scrolls sideways", fit)
    const prefetched = await p.evaluate(() => (window.__nav || []).filter((n) => n.kind === "prefetch").map((n) => n.href))
    expect(prefetched.includes("/app/products/new?type=digital") && prefetched.includes("/app/products/new?type=course"), "FAST: both editors fetched ahead when it opened", prefetched)
    await p.screenshot({ path: join(shots, `${tag}-chooser.png`) })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── KEYS ─────────────────────────────────────────────────────────── */
  if (!phone) {
    const { p } = await openPage(vp, sheet)
    await sleep(150)
    await p.focus("[data-new-product]")
    await p.keyboard.press("Enter")
    await settled(p)
    const focused = async () => p.evaluate(() => {
      const el = document.activeElement
      return el?.getAttribute("data-kind") || (el?.hasAttribute("data-new-product") ? "opener" : el?.tagName)
    })
    const order = [await focused()]
    for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "End", "Home"]) {
      await p.keyboard.press(key)
      order.push(await focused())
    }
    const keysWant = "digital,course,import,digital,import,import,digital"
    expect(order.join(",") === keysWant, "KEYS: first answer focused; down, down, down (wraps), up (wraps), End, Home", order)
    await p.keyboard.press("Escape")
    await sleep(400)
    const after = await p.evaluate(() => ({ open: !!document.querySelector("[data-new-product-chooser]"), opener: document.activeElement?.hasAttribute("data-new-product") }))
    expect(!after.open && after.opener, "KEYS: Escape closes, and the focus is back on New product", after)
    /* Enter on an answer picks it */
    await p.keyboard.press("Enter")
    await settled(p)
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("Enter")
    await sleep(300)
    expect((await nav(p)).includes("push /app/products/new?type=course"), "KEYS: Enter on Video course opens the course editor", await nav(p))
    await p.close()
  }

  /* ── ANSWERS ──────────────────────────────────────────────────────── */
  for (const [kind, goes] of [
    ["digital", "push /app/products/new?type=digital"],
    ["course", "push /app/products/new?type=course"],
  ]) {
    const { p, errors } = await openPage(vp, sheet)
    await sleep(150)
    await p.click("[data-new-product]")
    await settled(p)
    const t0 = await p.evaluate(() => performance.now())
    if (phone) await p.tap(`[data-new-product-chooser] [data-kind="${kind}"]`)
    else await p.click(`[data-new-product-chooser] [data-kind="${kind}"]`)
    await p.waitForFunction((w) => (window.__nav || []).some((n) => `${n.kind} ${n.href}` === w), { timeout: 5000 }, goes).catch(() => {})
    const went = await nav(p)
    const at = await p.evaluate((w) => (window.__nav || []).find((n) => `${n.kind} ${n.href}` === w)?.at ?? null, goes)
    const posts = await p.evaluate(() => window.__posts.length)
    expect(went.length === 1 && went[0] === goes && posts === 0, `ANSWERS: ${kind} opens ${goes.slice(5)}, nothing posted`, { went, posts, ms: at === null ? null : Math.round(at - t0) })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* Import: the link form in place, nowhere to go, the field focused (a phone: in the tap's own task). */
  {
    const { p, errors } = await openPage(vp, sheet)
    await sleep(150)
    await p.click("[data-new-product]")
    await settled(p)
    await p.evaluate(() => window.addEventListener("click", () => { window.__importFocus = document.activeElement?.id ?? null }, { once: true }))
    if (phone) await p.tap(`[data-new-product-chooser] [data-kind="import"]`)
    else await p.click(`[data-new-product-chooser] [data-kind="import"]`)
    await sleep(400)
    const state = await p.evaluate(() => ({ form: !!document.querySelector("[data-new-product-chooser] [data-link-import]"), inTap: window.__importFocus, now: document.activeElement?.id ?? null, posts: window.__posts.length }))
    const went = await nav(p)
    expect(state.form && went.length === 0 && state.posts === 0, "ANSWERS: Import opens the link form in place, goes nowhere, posts nothing", { ...state, went })
    expect(phone ? state.inTap === "product-import-url" : state.now === "product-import-url", phone ? "ANSWERS: Import puts the focus in the link field in the tap itself (the keyboard comes with it)" : "ANSWERS: Import puts the focus in the link field", state)
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── PAGE ─────────────────────────────────────────────────────────── */
  {
    const { p, errors } = await openPage(vp, on ? "page-on" : "page")
    await p.waitForSelector("[data-kind-page] [data-kind]")
    await sleep(150)
    const page = await p.evaluate(() => ({
      title: document.querySelector("[data-kind-page] h1")?.textContent,
      kinds: [...document.querySelectorAll("[data-kind-page] [data-kind]")].map((b) => b.getAttribute("data-kind")),
      focus: document.activeElement?.getAttribute("data-kind") ?? null,
      scroll: document.scrollingElement.scrollWidth,
    }))
    expect(page.title === "Create new product" && page.kinds.join() === want && page.scroll <= vp.width, "PAGE: the same question and answers", page)
    if (!phone) expect(page.focus === "digital", "PAGE: the first answer has the focus on a computer", page.focus)
    await p.screenshot({ path: join(shots, `${tag}-page.png`) })
    await p.click(`[data-kind-page] [data-kind="course"]`)
    await sleep(200)
    const replaced = "replace /app/products/new?type=course"
    expect((await nav(p)).join() === replaced, `PAGE: a pick replaces the page with where it goes (${replaced.slice(8)})`, await nav(p))
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }
  }
}

await browser.close()
if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
console.log(`\nscreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
