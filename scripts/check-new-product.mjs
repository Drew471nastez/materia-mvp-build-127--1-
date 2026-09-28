/**
 * ===========================================================================
 *  WHAT ARE YOU SELLING? MEASURED
 * ===========================================================================
 * The question before a new product (app/app/products/new/kind-chooser.tsx,
 * drawn by scripts/render-new-product.tsx) at 390x844 and 1280x800:
 *
 *   SHAPE     a sheet on the phone's bottom edge, full width; a dialog in
 *             the middle of a computer's window, at most 520px wide
 *   ROWS      three answers, each with its drawing, its name and one line;
 *             every row at least 56px tall, nothing scrolls sideways
 *   MOTION    the phone's sheet rises, every frame higher than
 *             the last, at a 4x slower CPU; the longest gap between frames
 *             is reported
 *   KEYS      the first answer has the focus; down, up (wrapping), End and
 *             Home move it; Escape closes and the focus is back on New product
 *   ANSWERS   Digital product and Video course open their editors
 *             (/app/products/new?type=digital, ?type=course) by the router;
 *             Membership makes its draft first, then opens its screen on
 *             Settings; both editors were fetched ahead when it opened
 *   FAILURE   a membership that could not be made says so in the sheet,
 *             which stays
 *   PAGE      /app/products/new with no kind: the same three, and a pick
 *             replaces the page with its editor
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

/* /api/app/memberships, answered in the page: a draft after 250ms, or the refusal the route gives. */
const server = `
window.__posts = []
window.__membership = "ok"
const realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  if (!url.startsWith("/api/app/memberships")) return realFetch(input, init)
  window.__posts.push(JSON.parse(init.body))
  await new Promise((r) => setTimeout(r, 250))
  const json = (x, status) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  if (window.__membership === "fail") return json({ error: "Memberships are not set up on Storelib yet." }, 503)
  return json({ productId: "m-1" }, 200)
}
`
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${server}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

async function openPage(vp, hash = "sheet") {
  const p = await browser.newPage()
  await p.setViewport(vp)
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
  ["desktop-1280", { width: 1280, height: 800 }, false],
]) {
  console.log(`\n${label}`)
  /* ── SHAPE, ROWS, MOTION ─────────────────────────────────────────── */
  {
    const { p, errors } = await openPage(vp)
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    /* Every frame of the opening, from the press. */
    await p.evaluate(() => {
      window.__frames = []
      const t0 = performance.now()
      const tick = () => {
        const el = document.querySelector("[data-new-product-chooser]")
        const r = el?.getBoundingClientRect()
        window.__frames.push({ t: performance.now() - t0, top: r ? r.top : null })
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
    expect(rows.map((r) => r.kind).join() === "digital,course,membership", "ROWS: digital, course, membership", rows.map((r) => r.kind))
    expect(rows.every((r) => r.h >= 56 && r.art), "ROWS: each at least 56px tall, with its drawing", rows.map((r) => r.h))
    expect(/Digital product/.test(rows[0]?.text) && /Video course/.test(rows[1]?.text) && /Membership/.test(rows[2]?.text), "ROWS: the names and their lines", rows.map((r) => r.text))
    const title = await p.evaluate(() => document.querySelector("[data-new-product-chooser]")?.innerText.split("\n")[0])
    expect(title === "What are you selling?", "the question", title)
    const fit = await p.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, width: innerWidth }))
    expect(fit.scroll <= fit.width, "FIT: nothing scrolls sideways", fit)
    const prefetched = await p.evaluate(() => (window.__nav || []).filter((n) => n.kind === "prefetch").map((n) => n.href))
    expect(prefetched.includes("/app/products/new?type=digital") && prefetched.includes("/app/products/new?type=course"), "FAST: both editors fetched ahead when it opened", prefetched)
    await p.screenshot({ path: join(shots, `${label}-chooser.png`) })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── KEYS ─────────────────────────────────────────────────────────── */
  if (!phone) {
    const { p } = await openPage(vp)
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
    expect(order.join(",") === "digital,course,membership,digital,membership,membership,digital", "KEYS: first answer focused; down, down, down (wraps), up (wraps), End, Home", order)
    await p.screenshot({ path: join(shots, `${label}-keyboard.png`) })
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
  for (const [kind, want] of [
    ["digital", "push /app/products/new?type=digital"],
    ["course", "push /app/products/new?type=course"],
    ["membership", "push /app/memberships/m-1?tab=settings&new=1"],
  ]) {
    const { p, errors } = await openPage(vp)
    await p.click("[data-new-product]")
    await settled(p)
    const t0 = await p.evaluate(() => performance.now())
    if (phone) await p.tap(`[data-new-product-chooser] [data-kind="${kind}"]`)
    else await p.click(`[data-new-product-chooser] [data-kind="${kind}"]`)
    if (kind === "membership") {
      await sleep(80)
      const busy = await p.evaluate(() => ({ spinner: !!document.querySelector('[data-kind="membership"][aria-busy="true"]'), open: !!document.querySelector("[data-new-product-chooser]") }))
      expect(busy.spinner && busy.open, "ANSWERS: Membership says it is setting up while its draft is made", busy)
    }
    await p.waitForFunction((w) => (window.__nav || []).some((n) => `${n.kind} ${n.href}` === w), { timeout: 5000 }, want).catch(() => {})
    const went = await nav(p)
    const at = await p.evaluate((w) => (window.__nav || []).find((n) => `${n.kind} ${n.href}` === w)?.at ?? null, want)
    const posts = await p.evaluate(() => window.__posts.length)
    expect(went.length === 1 && went[0] === want && (kind === "membership" ? posts === 1 : posts === 0), `ANSWERS: ${kind} opens ${want.slice(5)}`, { went, posts, ms: at === null ? null : Math.round(at - t0) })
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
  }

  /* ── FAILURE ──────────────────────────────────────────────────────── */
  {
    const { p } = await openPage(vp)
    await p.evaluate(() => (window.__membership = "fail"))
    await p.click("[data-new-product]")
    await settled(p)
    await p.click('[data-new-product-chooser] [data-kind="membership"]')
    await p.waitForSelector("[data-new-product-chooser] [role=alert]", { timeout: 3000 }).catch(() => {})
    const state = await p.evaluate(() => ({ alert: document.querySelector("[data-new-product-chooser] [role=alert]")?.textContent, open: !!document.querySelector("[data-new-product-chooser]"), went: (window.__nav || []).filter((n) => n.kind !== "prefetch").length }))
    expect(state.open && /not set up/.test(state.alert || "") && state.went === 0, "FAILURE: the reason in the sheet, which stays, and nothing opens", state)
    await p.screenshot({ path: join(shots, `${label}-membership-failed.png`) })
    await p.close()
  }

  /* ── PAGE ─────────────────────────────────────────────────────────── */
  {
    const { p, errors } = await openPage(vp, "page")
    await p.waitForSelector("[data-kind-page] [data-kind]")
    const page = await p.evaluate(() => ({
      title: document.querySelector("[data-kind-page] h1")?.textContent,
      kinds: [...document.querySelectorAll("[data-kind-page] [data-kind]")].map((b) => b.getAttribute("data-kind")),
      focus: document.activeElement?.getAttribute("data-kind") ?? null,
      scroll: document.scrollingElement.scrollWidth,
    }))
    expect(page.title === "What are you selling?" && page.kinds.join() === "digital,course,membership" && page.scroll <= vp.width, "PAGE: the same question and three answers", page)
    if (!phone) expect(page.focus === "digital", "PAGE: the first answer has the focus on a computer", page.focus)
    await p.screenshot({ path: join(shots, `${label}-page.png`) })
    await p.click('[data-kind-page] [data-kind="course"]')
    await sleep(200)
    expect((await nav(p)).join() === "replace /app/products/new?type=course", "PAGE: a pick replaces the page with its editor", await nav(p))
    expect(errors.length === 0, "no errors on the page", errors)
    await p.close()
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
