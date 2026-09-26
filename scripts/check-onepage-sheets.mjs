/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S SHEETS MOVE LIKE QUICK ACCESS
 * ===========================================================================
 * "Bring the same feel and smoothness to all mobile bottom sheets, the
 * OnePage editor included." Add block, a link's thumbnail, a block's
 * animation and its stats, and Add product were dialogs pushed to the bottom of a phone by hand, with
 * the drag written into React state. They are the shared sheet now
 * (components/ui/sheet-dialog.tsx over components/ui/bottom-sheet.tsx), and
 * this reads, in the real editor at 390px with real touch events, that each
 * one does what Quick access does:
 *
 *   SHARED      it is the shared sheet (`data-app-sheet`, `data-sheet-panel`)
 *               named for what it is, and no Radix dialog is drawn with it
 *   RISES       the first frame it exists it is below the screen, it only
 *               ever rises, and it comes to rest at 0
 *   FOLLOWS     every step of a drag from the grabber, the panel is where the
 *               finger put it, within two pixels (two frames is the most a
 *               finger can be ahead of what is painted)
 *   GIVES       a pull up gives on a rubber band, never past 80px, and it
 *               comes back to rest
 *   SPRINGS     a slow short pull let go springs back to rest
 *   FLICKS      a quick short flick closes it
 *   HANDS OFF   (Add block) a pull down on its list, at the list's top,
 *               moves the sheet rather than nothing
 *
 * And at 1440 Add block is still the centred dialog it was.
 *
 *   node scripts/check-onepage-sheets.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-sheets.mjs   (a picture of each, open)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

/* The same editor, stubs and page as scripts/check-onepage-editor.mjs. */
const dir = join(root, ".onepage-sheets-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/onepage"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
/* Every read answers with no rows (an array, so the Products tab can list them) that also says onboarding is done. */
writeFileSync(join(dir, "supabase.js"), `const result = { data: Object.assign([], { onboarding_completed: true }), error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-editor.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = await appCss(root)
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE_THEME={}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/app")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  res.writeHead(200, { "content-type": "application/json" })
  if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
  if (req.url.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ total_clicks: 3, total_views: 9, chart_data: [] }))
  res.end("{}")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(vp, hash) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]", { timeout: 8000 }).catch(() => { throw new Error(`the editor did not draw: ${errors.slice(0, 2).join(" | ")}`) })
  await sleep(900)
  return { p, errors, cdp: await p.target().createCDPSession() }
}

/* Where the panel is this frame, running animation included; null when there is no sheet. */
const panelY = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
  const el = document.querySelector("[data-app-sheet] [data-sheet-panel]")
  r(el ? new DOMMatrixReadOnly(getComputedStyle(el).transform).m42 : null)
}))))

/* Every frame of the panel from now for `ms`, into window.__frames. */
const record = (p, ms) => p.evaluate((ms) => {
  const frames = (window.__frames = [])
  const t0 = performance.now()
  const tick = () => {
    const el = document.querySelector("[data-app-sheet] [data-sheet-panel]")
    if (el) frames.push({ y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42, h: el.offsetHeight })
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, ms)

async function drag(s, from, dy, { steps = 8, pauseMs = 40, measure = false } = {}) {
  let lag = 0
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] })
  for (let k = 1; k <= steps; k++) {
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y + (dy * k) / steps }] })
    if (pauseMs) await sleep(pauseMs)
    /* From the second step: Chromium keeps its own 15px touch slop to itself. */
    if (measure && k >= 2) lag = Math.max(lag, Math.abs((await panelY(s.p)) - (dy * k) / steps))
  }
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  return lag
}
const grabber = (p) => p.evaluate(() => {
  const r = document.querySelector("[data-app-sheet] [data-sheet-handle]").getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + 6 }
})

/**
 * One sheet, every claim. `opener` opens it in the page; `label` is what it
 * is called; `list` (optional) is a selector for a list in it that should
 * hand a pull down at its top to the sheet.
 */
async function sheet(hash, name, label, opener, list) {
  console.log(`\n${name}`)
  const s = await open(PHONE, hash)
  const { p } = s
  const openIt = async () => {
    await record(p, 700)
    const found = await p.evaluate(opener)
    await sleep(750)
    return found
  }
  const found = await openIt()
  expect(found, "its button is on the page")
  if (!found) { await p.close(); return }
  if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `${name.replace(/\W+/g, "-").toLowerCase()}.png`) })
  const seen = await p.evaluate(() => {
    const root = document.querySelector("[data-app-sheet]")
    return {
      label: root?.getAttribute("aria-label") ?? null,
      state: root?.getAttribute("data-app-sheet") ?? null,
      panel: !!root?.querySelector("[data-sheet-panel]"),
      radix: !!document.querySelector("[data-slot=dialog-content]"),
    }
  })
  expect(seen.state === "open" && seen.panel && seen.label === label && !seen.radix, `it is the shared sheet, "${label}", and no dialog is drawn with it`, seen)
  const frames = await p.evaluate(() => window.__frames)
  const first = frames[0]
  const backwards = frames.slice(1).filter((f, i) => f.y > frames[i].y + 0.5).length
  const rest = await panelY(p)
  expect(!!first && first.y >= first.h * 0.9 && backwards === 0 && Math.abs(rest) < 0.5,
    "it rises from below the screen, only ever up, and comes to rest", { first: first && Math.round(first.y), h: first?.h, backwards, rest })

  const g = await grabber(p)
  const lag = await drag(s, g, 120, { steps: 8, pauseMs: 60, measure: true })
  await sleep(700)
  expect(lag <= 2, "a drag from the grabber: the panel is where the finger put it, within 2px", Math.round(lag * 10) / 10)
  expect(Math.abs(await panelY(p)) < 0.5, "a slow short pull let go springs back to rest")

  /* The rubber band is read off the frames: the lowest the panel went while the finger pulled it up. */
  await record(p, 900)
  await drag(s, g, -220, { steps: 8, pauseMs: 30 })
  const up = await p.evaluate(() => Math.min(...window.__frames.map((f) => f.y)))
  await sleep(700)
  expect(up < -1 && up >= -80.5 && Math.abs(await panelY(p)) < 0.5, "a pull up gives, never past 80px, and comes back", Math.round(up))

  if (list) {
    const box = await p.evaluate((sel) => {
      const el = document.querySelector(`[data-app-sheet] ${sel}`)
      if (!el) return null
      el.scrollTop = 0
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + 40, scrolls: el.scrollHeight > el.clientHeight + 1 }
    }, list)
    if (!box) expect(false, "its list is there")
    else {
      await record(p, 900)
      await drag(s, box, 90, { steps: 6, pauseMs: 40 })
      const moved = await p.evaluate(() => Math.max(...window.__frames.map((f) => f.y)))
      await sleep(700)
      expect(moved > 40, "a pull down on its list, at the list's top, moves the sheet", { moved: Math.round(moved), listScrolls: box.scrolls })
      if ((await panelY(p)) === null) await openIt()
    }
  }

  const g2 = await grabber(p)
  await drag(s, g2, 110, { steps: 4, pauseMs: 0 })
  await sleep(900)
  const gone = await p.evaluate(() => !document.querySelector("[data-app-sheet]"))
  expect(gone, "a quick flick closes it")
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await p.close()
}

const clickText = (text) => `(() => { const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && e.getClientRects().length); if (b) b.click(); return !!b })()`
const clickTitle = (title) => `(() => { const b = [...document.querySelectorAll('button[title="${title}"]')].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`

await sheet("links", "Add block", "Add Block", clickText("Add"), ".overflow-y-auto")
await sheet("links", "A link's thumbnail", "Edit Thumbnail", `(() => { const b = [...document.querySelectorAll("[data-scroll-container] button.w-10.h-10.rounded-lg")].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`)
await sheet("links", "A block's animation", "Animation", clickTitle("Animation"))
await sheet("links", "A block's stats", "Link Stats", clickTitle("View Stats"))
await sheet("products", "Add product", "Add Product", clickText("Add Product"))

console.log("\nAdd block at 1440")
{
  const { p, errors } = await open({ width: 1440, height: 900 }, "links")
  await p.evaluate(clickText("Add"))
  await sleep(600)
  const seen = await p.evaluate(() => ({
    dialog: !!document.querySelector("[data-slot=dialog-content]"),
    title: document.querySelector("[data-slot=dialog-content] [data-slot=dialog-title]")?.textContent ?? null,
    sheet: !!document.querySelector("[data-app-sheet]"),
  }))
  expect(seen.dialog && seen.title === "Add Block" && !seen.sheet, "it is the centred dialog it was, titled by Radix", seen)
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
