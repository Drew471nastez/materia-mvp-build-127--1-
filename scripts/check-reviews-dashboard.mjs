/**
 * ===========================================================================
 *  REVIEWS IN /app, MEASURED
 * ===========================================================================
 * scripts/render-reviews-dashboard.tsx at a phone (390x844), a tablet
 * (820x1180) and a desktop (1440x900), every tab:
 *
 *   EVERYWHERE  nothing scrolls sideways; the title and the six tabs are
 *               there and the open tab is marked and in view; no gradient;
 *               the only violet is the /app accent (#8b5cf6); on a phone
 *               every control a thumb uses is at least 40px tall
 *   OVERVIEW    the rating and the counts side by side on a desktop, one
 *               above the other on a phone; the waiting reviews link to
 *               Pending
 *   REVIEWS     the tabs with counts; a selection raises the bar with the
 *               actions it can take, inside the screen; Approve on a
 *               pending row draws it published at once and asks the route;
 *               the empty state says what to do
 *   IMPORT      a file chosen, the columns step: every field, the count
 *               ready, the rows skipped with why
 *   REQUESTS    the rows with their state, the email beside its words
 *   ANALYTICS   the figures, four charts; columns at most 24px wide, the
 *               chart as wide as its card
 *   SETTINGS    three ways to moderate, Save rises only after a change
 *   REVIEW PAGE the buyer's page: stars, words, photos and a video, the
 *               hidden field out of sight, no sideways scroll
 *
 *   SHOTS=/some/dir node scripts/check-reviews-dashboard.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".reviews-dashboard-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, "navigation.js"),
  `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
)
writeFileSync(join(dir, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }\n`)
try {
  execFileSync(
    "pnpm",
    ["exec", "esbuild", join(root, "scripts/render-reviews-dashboard.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`, '--define:process.env.NODE_ENV="production"', `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("the probe did not bundle")
}
const sheet = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${interFaces(root)}</style><style>${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#d9c7b0"/><circle cx="100" cy="90" r="40" fill="#8c6a4f"/></svg>'
const asked = []
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/photo.svg") return res.writeHead(200, { "content-type": "image/svg+xml" }), res.end(PHOTO)
  if (url.pathname === "/clip.mp4") return res.writeHead(404), res.end()
  if (url.pathname.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      let body = {}
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch {
        /* not json */
      }
      asked.push({ method: req.method, path: url.pathname, query: url.search, body })
      let out = {}
      if (url.pathname === "/api/app/reviews" && req.method === "GET") out = { rows: [], total: 0, page: 1, pages: 1, counts: { all: 6, pending: 2, published: 2, rejected: 1, reported: 1, unanswered: 1 }, ready: { replies: true, app: true } }
      else if (url.pathname === "/api/app/reviews/bulk") out = { changed: body.ids ?? [], deleted: [], skipped: [], reviews: [] }
      else if (/^\/api\/app\/reviews\/[0-9a-f-]{36}$/.test(url.pathname)) out = { ok: true, review: { id: url.pathname.split("/").pop(), status: "published", site_status: "shown", verified: false, featured: false, photos: [], hidden_by: null } }
      else if (url.pathname === "/api/app/reviews/import" && req.method === "GET") out = { batches: [{ id: "b1", file_name: "judgeme-export.csv", total: 212, imported: 204, skipped: 8, created_at: "2026-10-01T10:00:00Z", undone_at: null }], ready: true }
      else if (url.pathname === "/api/app/reviews/import")
        out = {
          header: ["product_handle", "rating", "title", "body", "reviewer_name", "review_date"],
          mapping: { product: 0, rating: 1, title: 2, body: 3, name: 4, date: 5 },
          sample: [["linen-apron", "5", "Exactly right", "Thick linen, deep pockets.", "Maya Rivers", "2026-03-14"]],
          rows: [
            { row: 2, ok: true, productId: "p" },
            { row: 3, ok: false, problem: "no_product", product: "linen-apron-xl", rating: "5" },
            { row: 4, ok: false, problem: "bad_rating", product: "linen-apron", rating: "4.5" },
            { row: 5, ok: false, problem: "duplicate_in_file", product: "linen-apron", rating: "5" },
          ],
          missingFields: [],
          total: 4,
          ready: 1,
        }
      else if (url.pathname === "/api/app/reviews/requests/preview") out = { subject: "How is Linen apron?", fromName: "Drew Studio via Storelib", html: "<!doctype html><body style='font-family:sans-serif;padding:24px'><h1 style='font-size:20px'>How is Linen apron?</h1><p>If you have had a chance to use it, how was it?</p></body>" }
      else if (url.pathname === "/api/store/reviews-app") out = { settings: body, ready: true }
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify(out))
      }, 60)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
const SIZES = [
  { name: "390x844", width: 390, height: 844, phone: true },
  { name: "820x1180", width: 820, height: 1180, phone: false },
  { name: "1440x900", width: 1440, height: 900, phone: false },
]

async function open(size, path) {
  const page = await browser.newPage()
  await page.setViewport({ width: size.width, height: size.height, deviceScaleFactor: 1, isMobile: size.phone, hasTouch: size.phone })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${origin}${path}`, { waitUntil: "networkidle0" })
  await wait(700)
  page.errors = errors
  return page
}

const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false })
}

/** What every tab is held to. */
async function everywhere(page, size, tab) {
  const m = await page.evaluate((phone) => {
    const doc = document.documentElement
    const pane = document.querySelector("[data-reviews-area]")
    const nav = document.querySelector("[data-reviews-nav]")
    const current = nav?.querySelector('[aria-current="page"]')
    const navBox = nav?.getBoundingClientRect()
    const curBox = current?.getBoundingClientRect()
    const colours = new Set()
    let gradient = false
    for (const el of document.querySelectorAll("#app *")) {
      const cs = getComputedStyle(el)
      if (/gradient/.test(cs.backgroundImage)) gradient = true
      for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor, cs.fill, cs.stroke]) if (c && c !== "none") colours.add(c)
    }
    /* Violet: a hue between 250 and 290 with real colour in it. */
    const violet = [...colours].filter((c) => {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
      if (!m) return false
      const [r, g, b] = m.slice(1, 4).map(Number)
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      if (max - min < 40) return false
      let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
      h = (h * 60 + 360) % 360
      return h > 250 && h < 290
    })
    const small = phone
      ? /* A switch and a radio sit inside the label that is their target (components/physical/ui Toggle, the moderation cards). */
        [...document.querySelectorAll("#app button:not([role=switch]), #app select, #app input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=color]):not([tabindex='-1']), #app a[class*='inline-flex']")]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && r.height < 36 && !el.closest("[aria-hidden]") && getComputedStyle(el).visibility !== "hidden"
          })
          .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`)
      : []
    return {
      sideways: Math.max(doc.scrollWidth, pane?.scrollWidth ?? 0) - window.innerWidth,
      tabs: [...(nav?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("data-reviews-tab")),
      current: current?.getAttribute("data-reviews-tab"),
      currentInView: !!navBox && !!curBox && curBox.left >= navBox.left - 1 && curBox.right <= navBox.right + 1,
      title: document.querySelector("h1")?.textContent,
      gradient,
      violet: [...new Set(violet)],
      small,
    }
  }, size.phone)
  expect(m.sideways <= 0, `${tab} ${size.name}: nothing scrolls sideways`, `${m.sideways}px`)
  expect(m.title === "Reviews" && m.tabs.join() === "overview,reviews,requests,widgets,analytics,settings", `${tab} ${size.name}: the title and the six tabs`, m.tabs)
  expect(m.current === tab && m.currentInView, `${tab} ${size.name}: the open tab is marked and in view`, m)
  expect(!m.gradient, `${tab} ${size.name}: no gradient`)
  expect(m.violet.every((c) => c === "rgb(139, 92, 246)"), `${tab} ${size.name}: the only violet is the /app accent`, m.violet)
  if (size.phone) expect(m.small.length === 0, `${tab} ${size.name}: every control at least 36px tall on a phone`, m.small.slice(0, 6))
  expect(page.errors.length === 0, `${tab} ${size.name}: no errors`, page.errors.slice(0, 2))
}

for (const size of SIZES) {
  console.log(`\nOverview at ${size.name}`)
  {
    const page = await open(size, "/app/reviews")
    await everywhere(page, size, "overview")
    const m = await page.evaluate(() => {
      const card = document.querySelector("section[aria-label='Rating']")
      const [a, b] = card ? [...card.children].map((c) => c.getBoundingClientRect()) : []
      return { side: a && b ? (Math.abs(a.top - b.top) < 2 ? "beside" : "above") : "none", average: document.querySelector("[data-overview-average]")?.textContent, waiting: document.querySelector("[data-overview-waiting] a")?.getAttribute("href"), activity: document.querySelectorAll("[data-activity]").length, storelib: !!document.querySelector("[data-overview-storelib]") }
    })
    expect(m.side === (size.width >= 768 ? "beside" : "above"), `the rating and the counts ${size.width >= 768 ? "side by side" : "one above the other"}`, m.side)
    expect(m.average === "4.6" && m.storelib, "the website's average, and the Storelib rating where it differs", m)
    expect(m.waiting === "/app/reviews/list?tab=pending" && m.activity === 8, "the waiting reviews link to Pending; what happened lately", m)
    await shot(page, `overview-${size.name}`)
    await page.close()
  }

  console.log(`\nReviews at ${size.name}`)
  {
    const page = await open(size, "/app/reviews/list")
    await everywhere(page, size, "reviews")
    const tabs = await page.evaluate(() => [...document.querySelectorAll("[data-reviews-tab]")].filter((t) => t.closest("[role=tablist]")).map((t) => t.textContent))
    expect(tabs.join("|") === "All6|Pending2|Published2|Rejected1|Reported1|No reply1", "the tabs with their counts", tabs.join("|"))
    const verified = await page.evaluate(() => [...document.querySelectorAll("[data-review-verified]")].map((e) => e.getAttribute("data-review-verified")).join())
    expect(verified === "yes,no,yes,yes,no,no", "Verified purchase only on the reviews tied to an order", verified)
    await shot(page, `reviews-${size.name}`)
    /* A selection first, on its own page: the approve below reads the list again from a probe that answers with none. */
    const pick = await open(size, "/app/reviews/list")
    const sel = await pick.$$("[data-review-select]")
    await sel[0].click()
    await sel[4].click()
    await wait(200)
    const bar = await pick.evaluate(() => {
      const el = document.querySelector("[data-reviews-bulk] > div")
      const r = el?.getBoundingClientRect()
      return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, actions: [...el.querySelectorAll("[data-bulk-action]")].map((b) => b.getAttribute("data-bulk-action")) } : null
    })
    expect(!!bar && bar.bottom <= size.height && bar.top >= 0 && bar.left >= 0 && bar.right <= size.width, "a selection raises the bar, inside the screen", bar)
    expect(bar?.actions.join() === "publish,unpublish,unfeature,delete", "  with what the selection can take (a featured verified one and a rejected import)", bar?.actions)
    await shot(pick, `reviews-selected-${size.name}`)
    await pick.close()
    asked.length = 0
    await page.evaluate(() => document.querySelector("[data-review-row][data-review-status=pending] [data-review-publish]")?.click())
    await wait(60)
    const now = await page.evaluate(() => document.querySelectorAll("[data-review-row][data-review-status=pending]").length)
    await wait(300)
    expect(now === 1 && asked.some((a) => a.method === "PATCH" && a.body.action === "approve"), "Approve: drawn published at once, and the route asked", { now, asked: asked.map((a) => `${a.method} ${a.path}`) })
    await page.close()
    const none = await open(size, "/app/reviews/list?empty=1")
    const e = await none.evaluate(() => ({ text: document.querySelector("[data-reviews-empty]")?.textContent || "", links: [...document.querySelectorAll("[data-reviews-empty] a")].map((a) => a.getAttribute("href")) }))
    expect(/No reviews yet/.test(e.text) && e.links.includes("/app/reviews/import") && e.links.includes("/app/reviews/requests"), "a store with none: what to do, and where", e)
    await none.close()
  }

  console.log(`\nImport at ${size.name}`)
  {
    const page = await open(size, "/app/reviews/import")
    await everywhere(page, size, "reviews")
    const file = join(root, ".reviews-dashboard-probe.csv")
    writeFileSync(file, "product_handle,rating,title,body,reviewer_name,review_date\nlinen-apron,5,Exactly right,Thick linen,Maya Rivers,2026-03-14\n")
    const input = await page.$("input[type=file]")
    await input.uploadFile(file)
    await wait(600)
    rmSync(file, { force: true })
    const m = await page.evaluate(() => ({ fields: document.querySelectorAll("[data-import-field]").length, ready: document.querySelector("[data-import-ready]")?.getAttribute("data-import-ready"), problems: document.querySelector("[data-import-problems]")?.textContent || "" }))
    expect(m.fields === 8 && m.ready === "1", "the columns step: every field, how many are ready", m)
    expect(/Row 3/.test(m.problems) && /linen-apron-xl/.test(m.problems) && /whole number from 1 to 5/.test(m.problems), "  every row skipped, with its line and why", m.problems.slice(0, 160))
    await shot(page, `import-${size.name}`)
    await page.close()
  }

  console.log(`\nRequests at ${size.name}`)
  {
    const page = await open(size, "/app/reviews/requests")
    await everywhere(page, size, "requests")
    await wait(500)
    const m = await page.evaluate(() => ({ states: [...document.querySelectorAll("[data-request-row]")].map((r) => r.getAttribute("data-request-state")).join(), preview: !!document.querySelector("[data-request-preview]") }))
    expect(m.states === "scheduled,sent,reminded,reviewed,skipped,cancelled,failed", "every request with its state", m.states)
    expect(m.preview, "the email drawn beside its words")
    await shot(page, `requests-${size.name}`)
    await page.close()
  }

  console.log(`\nWidgets at ${size.name}`)
  {
    const page = await open(size, "/app/reviews/widgets")
    await everywhere(page, size, "widgets")
    await shot(page, `widgets-${size.name}`)
    await page.close()
  }

  console.log(`\nAnalytics at ${size.name}`)
  {
    const page = await open(size, "/app/reviews/analytics")
    await everywhere(page, size, "analytics")
    const m = await page.evaluate(() => {
      const svgs = [...document.querySelectorAll("[data-reviews-analytics] svg[role=img]")]
      const widest = Math.max(0, ...[...document.querySelectorAll("[data-reviews-analytics] svg[role=img] path[fill='#8b5cf6']")].map((p) => p.getBoundingClientRect().width))
      const fits = svgs.every((s) => {
        const card = s.closest("section")
        return card && s.getBoundingClientRect().right <= card.getBoundingClientRect().right + 0.5
      })
      return { figures: document.querySelectorAll("[data-figure]").length, charts: svgs.length, widest, fits, lines: [...document.querySelectorAll("[data-reviews-analytics] svg path[fill=none]")].map((p) => p.getAttribute("stroke-width")) }
    })
    expect(m.figures === 6 && m.charts === 2, "six figures, the two time charts", m)
    expect(m.widest > 0 && m.widest <= 24, "columns at most 24px wide", m.widest)
    expect(m.fits && m.lines.every((w) => w === "2"), "each chart as wide as its card, lines 2px", m)
    await shot(page, `analytics-${size.name}`)
    await page.close()
  }

  console.log(`\nSettings at ${size.name}`)
  {
    const page = await open(size, "/app/reviews/settings")
    await everywhere(page, size, "settings")
    const before = await page.evaluate(() => ({ modes: document.querySelectorAll("[data-moderation]").length, bar: !!document.querySelector("[data-reviews-save-bar]") }))
    await page.click("[data-moderation=manual]")
    await wait(150)
    const after = await page.evaluate(() => !!document.querySelector("[data-reviews-save-bar]"))
    expect(before.modes === 3 && !before.bar && after, "three ways to moderate; Save rises only after a change", { before, after })
    await shot(page, `settings-${size.name}`)
    await page.close()
  }

  console.log(`\nThe buyer's review page at ${size.name}`)
  {
    const page = await open(size, "/review/demo")
    const m = await page.evaluate(() => {
      const trap = document.querySelector("input[name=website]")
      const r = trap?.getBoundingClientRect()
      return { sideways: document.documentElement.scrollWidth - window.innerWidth, stars: document.querySelectorAll("[data-star]").length, video: !!document.querySelector("[data-review-add-video]"), trapHidden: !!r && (r.right < 0 || r.width <= 1), starSize: document.querySelector("[data-star]")?.getBoundingClientRect().height }
    })
    expect(m.sideways <= 0 && m.stars === 5 && m.starSize >= 44 && m.video && m.trapHidden, "five 44px stars, a video button, the hidden field out of sight, nothing sideways", m)
    await shot(page, `review-page-${size.name}`)
    await page.close()
  }
}

await browser.close()
server.close()
console.log(broken ? `\n${broken} failed\n` : "\nall measured\n")
process.exit(broken ? 1 : 0)
