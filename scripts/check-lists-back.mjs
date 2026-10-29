/**
 * ===========================================================================
 *  BACK TO THE ORDERS, PRODUCTS AND COUPONS LISTS, MEASURED EVERY FRAME
 * ===========================================================================
 * Emails lost its "bump" on the way back (scripts/check-emails-back.mjs):
 * the list faded in from nothing and rose 2px, the whole page, on every
 * Back. This is the same reading for the other lists with a way out and a
 * way back, at 390 and 1280, driving the real lists inside the real
 * NavigationLoadingBar and AppStage (scripts/render-lists-back.tsx), served
 * over http so the history is the browser's own:
 *
 *   ORDERS    an order opened over the list and closed by its own back
 *             arrow, and by the browser's back: on a computer the list was
 *             "settled in" from half opacity and 2px low; on a phone the
 *             order slides off (a sideways move, allowed) and the list
 *             underneath must not fade or rise. And the list left for
 *             another page (Payouts) and come back to by the browser's back:
 *             the stage's landing
 *   PRODUCTS  a product opened from the list, and the editor's Back (a
 *             history back), and the browser's back
 *   COUPONS   the same with a coupon
 *   OFFERS, COLLECTIONS, SIZE CHARTS
 *             the same with an offer, a collection and a size chart, all
 *             three through the one shared round trip
 *             (components/app/list-return.ts); and the way in, frame by
 *             frame: the list stays whole until the page is there, no frame
 *             is without a page, and the page lands as every page does
 *
 * On every one: from the first frame the list is there it is whole
 * (everything in it at opacity 1, nothing moved up or down) on every frame
 * after, as far down as it was left. And a visit to the list (the rail, a
 * link) still lands as every page does, which is also what shows the
 * reading can see a landing at all.
 *
 *   node scripts/check-lists-back.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".lists-back-probe")
mkdirSync(dir, { recursive: true })

/* The router, as far as these pages can see one (see render-emails-back.tsx). */
writeFileSync(
  join(dir, "navigation.js"),
  `import { useSyncExternalStore } from "react"
const subs = new Set()
let href = location.pathname + location.search
const commit = () => { href = location.pathname + location.search; for (const f of [...subs]) f() }
for (const m of ["pushState", "replaceState"]) {
  const original = history[m].bind(history)
  history[m] = (...a) => { original(...a); commit() }
}
/* Back and forward commit a moment after the popstate, as the real router's
   restore does: every popstate listener (the shell's own) has run by then. */
window.addEventListener("popstate", () => setTimeout(commit, 16))
window.__delay = 80
const later = (fn) => setTimeout(fn, window.__delay)
const router = {
  push(u) { later(() => history.pushState({ __NA: true }, "", u)) },
  replace(u) { later(() => history.replaceState({ __NA: true }, "", u)) },
  back() { history.back() },
  forward() { history.forward() },
  prefetch() {},
  refresh() {},
}
window.__push = (u) => router.push(u)
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => href.split("?")[0], () => "/app/orders")
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => href.split("?")[1] || "", () => ""))
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
)
writeFileSync(
  join(dir, "link.js"),
  `import { createElement } from "react"
export default function Link({ href, prefetch, replace, scroll, ...rest }) { return createElement("a", { href, ...rest }) }
`,
)
/* The lists get their rows as props (scripts/render-lists-back.tsx); a read from the browser answers empty. */
writeFileSync(
  join(dir, "supabase-client.js"),
  `const tables = { creators: { id: "cr-1" } }
function from(table) {
  const q = {
    select() { return q }, eq() { return q }, in() { return q }, order() { return q }, limit() { return q }, update() { return q }, delete() { return q },
    maybeSingle() { return new Promise((r) => setTimeout(() => r({ data: tables[table] ?? null, error: null }), 40)) },
    then(res, rej) { return new Promise((r) => setTimeout(() => r({ data: tables[table] ?? [], error: null }), 40)).then(res, rej) },
  }
  return q
}
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "ana@example.com" } } }) },
    from,
    rpc: () => new Promise((r) => setTimeout(() => r({ data: [], error: null }), 40)),
  }
}
`,
)
try {
  execFileSync(
    "npx",
    [
      "--no-install",
      "esbuild",
      join(root, "scripts/render-lists-back.tsx"),
      "--bundle",
      "--format=iife",
      "--platform=browser",
      "--jsx=automatic",
      "--log-level=error",
      `--outfile=${join(dir, "probe.js")}`,
      '--define:process.env.NODE_ENV="production"',
      "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
      `--alias:@/lib/supabase/client=${join(dir, "supabase-client.js")}`,
      `--alias:next/navigation=${join(dir, "navigation.js")}`,
      `--alias:next/link=${join(dir, "link.js")}`,
      `--alias:@=${root}`,
      "--loader:.css=empty",
      "--loader:.svg=dataurl",
    ],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
  )
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("the probe did not bundle")
}
const html =
  `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const shots = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), "storelib-lists-back-"))
mkdirSync(shots, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/*
  One reading per drawn frame, taken in a task right after the frame's
  callbacks (the stage starts its landing in a requestAnimationFrame of its
  own, so a reading inside this one would be from before it began). For the
  list: the lowest opacity anything in it is drawn at (its own, times every
  box above it) and the furthest anything in it sits from its place (the
  stage moves it with `translate`, order-motion with `transform`).
*/
const record = (p) =>
  p.evaluate(() => {
    window.__rec = []
    window.__recording = true
    const drawn = new MessageChannel()
    const frames = []
    const opacityOf = (el) => {
      let o = 1
      for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
      return o
    }
    const offsetOf = (el) => {
      const cs = getComputedStyle(el)
      const t = cs.translate && cs.translate !== "none" ? Number(String(cs.translate).split(" ")[1]?.replace("px", "") || 0) : 0
      const m = cs.transform && cs.transform !== "none" ? new DOMMatrixReadOnly(cs.transform).m42 : 0
      return Math.abs(t) + Math.abs(m)
    }
    const read = (t) => {
      const list = document.querySelector(".app-content-scroll .orders-list") || document.querySelector(".app-content-scroll > .orders-pane")
      const stage = document.querySelector(".app-content-scroll .orders-stage")
      const other = document.querySelector("[data-page]")
      /* Under an open order the list is hidden by the stage; it counts from the frame it is uncovered. */
      const shown = list && !other && !(stage && stage.hasAttribute("data-order-open"))
      const kids = shown ? [...list.children].filter((c) => c.getClientRects().length) : []
      window.__rec.push({
        t,
        page: shown ? "list" : other ? other.getAttribute("data-page") : list ? "covered" : null,
        opacity: kids.length ? Math.min(...kids.map(opacityOf)) : null,
        offset: kids.length ? Math.max(...kids.map(offsetOf)) : null,
        scrollTop: list ? list.scrollTop : null,
        rows: shown ? list.querySelectorAll("[data-order-id], [data-row]").length : 0,
        /* The stage fades what is IN a page that scrolls in its own box (components/app/app-stage playEntrance), so its children are read. */
        pageOpacity: other ? Math.min(opacityOf(other), ...[...other.children].filter((c) => c.getClientRects().length).map(opacityOf)) : null,
      })
    }
    drawn.port1.onmessage = () => {
      const t = frames.shift()
      if (t != null) read(t)
    }
    const tick = (t) => {
      if (!window.__recording) return
      frames.push(t)
      drawn.port2.postMessage(0)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
const stop = (p) => p.evaluate(() => { window.__recording = false; return window.__rec })

const LEFT_AT = 420
const only = process.env.ONLY ? process.env.ONLY.split(",") : null

/* What the frames after a Back say, and the checks on them. */
const judge = (label, frames, left) => {
  const back = frames.filter((f) => f.page === "list" && f.rows > 0)
  const first = back[0]
  const minOpacity = back.length ? Math.min(...back.map((f) => f.opacity)) : null
  const maxOffset = back.length ? Math.max(...back.map((f) => f.offset)) : null
  console.log(`  ..    ${label}: ${back.length} frames of the list; lowest opacity ${minOpacity}, furthest from its place ${maxOffset}px; first frame at scroll ${first?.scrollTop} (left at ${left})`)
  expect(back.length > 10, `${label}: the list comes back`, back.length)
  expect(minOpacity === 1, `${label}: whole on every frame, nothing in it fades in`, minOpacity)
  expect(maxOffset !== null && maxOffset < 0.01, `${label}: nothing in it rises or falls`, maxOffset)
  expect(!!first && back.every((f) => Math.abs(f.scrollTop - left) <= 1), `${label}: as far down as it was left, from its first frame`, [...new Set(back.map((f) => f.scrollTop))])
}

const leaveAt = async (p) => {
  await p.evaluate((y) => { (document.querySelector(".app-content-scroll .orders-list") || document.querySelector(".app-content-scroll > .orders-pane")).scrollTop = y }, LEFT_AT)
  await wait(300)
  return p.evaluate(() => (document.querySelector(".app-content-scroll .orders-list") || document.querySelector(".app-content-scroll > .orders-pane")).scrollTop)
}
/* A row in the middle of the screen, pressed as a person would. */
const pressRow = async (p, selector) => {
  const row = await p.evaluateHandle((sel) => [...document.querySelectorAll(sel)].find((r) => { const b = r.getBoundingClientRect(); return b.width > 0 && b.top > 180 && b.bottom < innerHeight - 90 }), selector)
  const el = row.asElement()
  if (!el) throw new Error(`no row in view for ${selector}`)
  await el.click()
}
const visitLands = async (p, href, label) => {
  await record(p)
  await p.evaluate((h) => window.__push(h), href)
  await wait(900)
  const visit = (await stop(p)).filter((f) => f.page === "list" && f.rows > 0)
  const visitFirst = visit[0]?.opacity ?? null
  expect(visitFirst !== null && visitFirst < 0.5 && visit.at(-1)?.opacity === 1, `${label}: a visit still lands as every page does (and the reading sees a landing)`, { first: visitFirst, last: visit.at(-1)?.opacity })
}

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 860, deviceScaleFactor: 1 }],
]) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))

  if (!only || only.includes("orders")) {
    console.log(`\nOrders, ${label} wide`)
    await p.goto(`${base}/app/orders`)
    await p.waitForSelector("[data-order-id]", { timeout: 8000 })
    await wait(700)
    const left = await leaveAt(p)
    const open = async () => {
      await pressRow(p, 'a[href^="?order="]')
      await p.waitForSelector(".orders-stage[data-order-open]", { timeout: 4000 })
      await wait(500)
    }
    await open()
    await record(p)
    await p.click('[aria-label="Back to orders"]')
    await wait(900)
    judge("an order's own back", await stop(p), left)
    await open()
    await record(p)
    await p.goBack()
    await wait(900)
    judge("the browser's back from an order", await stop(p), left)
    /* Away to another page of the app and back by the browser's back. */
    await p.evaluate(() => window.__push("/app/payouts"))
    await p.waitForSelector("[data-page=elsewhere]", { timeout: 4000 })
    await wait(500)
    await record(p)
    await p.goBack()
    await wait(900)
    judge("back to Orders from another page", await stop(p), left)
    if (label === "1280") await p.screenshot({ path: join(shots, `orders-back-${label}.png`) })
    await p.evaluate(() => window.__push("/app/payouts"))
    await p.waitForSelector("[data-page=elsewhere]", { timeout: 4000 })
    await wait(400)
    await visitLands(p, "/app/orders", "Orders")
  }

  for (const kind of ["products", "coupons"]) {
    if (only && !only.includes(kind)) continue
    console.log(`\n${kind === "products" ? "Products" : "Coupons"}, ${label} wide`)
    await p.goto(`${base}/app/${kind}`)
    await p.waitForSelector("[data-row]", { timeout: 8000 })
    await wait(700)
    const left = await leaveAt(p)
    const rowLink = kind === "products" ? 'a[href^="/app/products/p"]' : 'a[href^="/app/coupons/c"]'
    const open = async () => {
      await pressRow(p, rowLink)
      await p.waitForSelector("[data-page=editor]", { timeout: 4000 })
      await wait(700)
    }
    await open()
    await record(p)
    await p.click("[data-editor-back]")
    await wait(1100)
    judge("the editor's back", await stop(p), left)
    await open()
    await record(p)
    await p.goBack()
    await wait(1100)
    judge("the browser's back from the editor", await stop(p), left)
    await open()
    await wait(200)
    await visitLands(p, `/app/${kind}`, kind === "products" ? "Products" : "Coupons")
  }


  /* The lists the shared round trip serves (components/app/list-return.ts). */
  for (const [kind, href, label] of [
    ["offers", "/app/offers", "Upsells and bundles"],
    ["collections", "/app/products/collections", "Collections"],
    ["size-charts", "/app/products/size-charts", "Size charts"],
  ]) {
    if (only && !only.includes(kind)) continue
    console.log(`\n${label}, ${viewport.width} wide`)
    await p.goto(`${base}${href}`)
    await p.waitForSelector("[data-row]", { timeout: 8000 })
    await wait(700)
    const left = await leaveAt(p)
    const open = async (watch) => {
      if (watch) await record(p)
      await pressRow(p, "[data-row-open], tr[data-row]")
      await p.waitForSelector("[data-page=editor]", { timeout: 4000 })
      await wait(watch ? 1200 : 700)
      if (!watch) return
      const frames = await stop(p)
      const before = frames.filter((f) => f.page === "list")
      const blank = frames.filter((f) => f.page === null).length
      const inFrames = frames.filter((f) => f.page === "editor")
      const firstOpacity = inFrames[0]?.pageOpacity ?? null
      const lastOpacity = inFrames.at(-1)?.pageOpacity ?? null
      const rising = inFrames.every((f, i) => i === 0 || f.pageOpacity >= inFrames[i - 1].pageOpacity - 0.001)
      console.log(`  ..    the way in: ${before.length} frames of the list first (lowest opacity ${before.length ? Math.min(...before.map((f) => f.opacity)) : null}), ${blank} without a page, then the page from opacity ${firstOpacity?.toFixed(2)} to ${lastOpacity} over ${inFrames.filter((f) => f.pageOpacity < 1).length} frames`)
      expect(before.every((f) => f.opacity === 1 && f.offset < 0.01), `${label}: the list stays whole until the page is there`, before.length)
      expect(blank === 0, `${label}: no frame without a page on the way in`, blank)
      expect(inFrames.length > 10 && lastOpacity === 1 && rising, `${label}: the page lands in one even fade, and stays`, { firstOpacity, lastOpacity, rising })
    }
    await open(true)
    await record(p)
    await p.click("[data-editor-back]")
    await wait(1100)
    judge("the page's own back", await stop(p), left)
    await open(false)
    await record(p)
    await p.goBack()
    await wait(1100)
    judge("the browser's back from the page", await stop(p), left)
    if (label && viewport.width === 390) await p.screenshot({ path: join(shots, `${kind}-back-${label.replace(/ /g, "-")}.png`) })
    await open(false)
    await wait(200)
    await visitLands(p, href, label)
  }

  expect(errors.length === 0, `${label}: no errors on the page`, errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log(`\nshots: ${shots}\nAll checks passed`)
