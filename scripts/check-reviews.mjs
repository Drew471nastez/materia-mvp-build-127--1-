/**
 * ===========================================================================
 *  THE REVIEW SURFACES, MEASURED
 * ===========================================================================
 * scripts/render-reviews.tsx at 390x844 and 1440x900:
 *
 *   PRODUCT    the rating block (average, stars, a bar per star with its
 *              count) and the reviews: the buyer's photo or initials, name,
 *              "Verified purchase", stars, date, the words cut at six lines
 *              with Show more, and the seller's reply under its review.
 *   SELLER     Storelib Reviews' Reviews view (components/reviews/manage):
 *              the status tabs with the server's counts, a review with no
 *              reply offers Reply and posts it, a reported one is marked
 *              hidden, the report dialog names its reasons.
 *   RECEIPT    a guest from the email's fourth star: four stars chosen, the
 *              form posts with the receipt token and no sign in; their own
 *              review shows the seller's reply with Edit and Delete.
 *   LIBRARY    the same card on a product in the library.
 *   FACES      every kind of reviewer, on the light theme and a dark one: an
 *              account with a photo, an account with none, a guest named by
 *              their order, a review with no name anywhere, and a photo whose
 *              address 404s. No "?" is drawn, no circle is left empty, and
 *              the letters are measured against what they actually sit on.
 *              With the Leave a review card in the three states its circle
 *              used to be blank in: nobody known, a photo that 404s, and a
 *              photo whose host never answers.
 *
 * Everywhere: nothing violet, nothing scrolls sideways.
 *
 *   PROBE_CSS=source SHOTS=/some/dir node scripts/check-reviews.mjs
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
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".reviews-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-reviews.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const sheet = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const BUYER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#e8d5c4"/><circle cx="48" cy="38" r="18" fill="#6b4a3a"/><rect x="18" y="62" width="60" height="40" rx="20" fill="#35506b"/></svg>'
const asked = []
/** Requests deliberately left unanswered, cut loose at the end so the server can close. */
const hanging = []
let own = false
/* Storelib Reviews' Reviews view (components/reviews/manage): the store's list, a page from the server. */
const SELLER_PRODUCTS = [
  { id: "11111111-0000-4000-8000-000000000001", title: "Notion Budget", slug: "notion-budget", thumbnail_url: null },
  { id: "11111111-0000-4000-8000-000000000002", title: "Lightroom Presets Vol. 2", slug: "presets-2", thumbnail_url: null },
]
const sellerRow = (id, rating, content, extra = {}) => ({ id, product_id: SELLER_PRODUCTS[0].id, rating, title: null, content, created_at: "2026-09-20T10:00:00Z", edited_at: null, status: "published", hidden_by: null, on_storelib: true, verified: true, source: "storelib", featured: false, photos: [], reviewer_name: null, seller_reply: null, seller_reply_at: null, buyer: null, customer: null, product: SELLER_PRODUCTS[0], ...extra })
const SELLER_ROWS = [
  sellerRow("aaaaaaaa-0000-4000-8000-000000000001", 5, "Clean files and the setup guide is clear.", { buyer: { display_name: "Ghita Nastase", avatar_url: null }, seller_reply: "Thank you Ghita.", seller_reply_at: "2026-09-21T10:00:00Z" }),
  sellerRow("aaaaaaaa-0000-4000-8000-000000000002", 4, "Good template. I would like a dark version.", { reviewer_name: "Ana" }),
  sellerRow("aaaaaaaa-0000-4000-8000-000000000003", 5, "The first budget template I kept using.", { buyer: { display_name: "Mihai Popescu", avatar_url: null } }),
  sellerRow("aaaaaaaa-0000-4000-8000-000000000004", 2, "The import from my bank did not work.", { buyer: { display_name: "Lena", avatar_url: null } }),
  sellerRow("aaaaaaaa-0000-4000-8000-000000000005", 1, "Scam, call me on 0722 000 000.", { status: "hidden", hidden_by: "report", on_storelib: false, product_id: SELLER_PRODUCTS[1].id, product: SELLER_PRODUCTS[1], buyer: { display_name: "anon123", avatar_url: null } }),
]
function sellerList(tab) {
  const inTab = (r, t) => (t === "published" ? r.status === "published" : t === "pending" ? r.status === "pending" : t === "hidden" ? r.status === "hidden" && r.hidden_by === "seller" : t === "reported" ? r.status === "hidden" && r.hidden_by !== "seller" : t === "unanswered" ? r.status !== "hidden" && !r.seller_reply : true)
  const counts = Object.fromEntries(["all", "published", "pending", "hidden", "reported", "unanswered"].map((t) => [t, SELLER_ROWS.filter((r) => inTab(r, t)).length]))
  const rows = SELLER_ROWS.filter((r) => inTab(r, tab))
  return { rows, total: rows.length, page: 1, pageSize: 25, counts, ready: true }
}
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/buyer.png") { res.writeHead(200, { "content-type": "image/svg+xml" }); res.end(BUYER_SVG); return }
  /* A photo whose address is gone, and one whose host never answers. */
  if (url.pathname === "/gone.png") { res.writeHead(404); res.end("gone"); return }
  if (url.pathname === "/slow.png") { hanging.push(res); return }
  if (url.pathname.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { /* not json */ }
      asked.push({ method: req.method, path: url.pathname, query: url.search, body })
      let out = {}
      if (url.pathname === "/api/reviews/breakdown") out = { breakdown: { 5: 7, 4: 3, 3: 0, 2: 1, 1: 1 }, count: 12, average: 4.3 }
      else if (url.pathname === "/api/reviews/check") {
        out = own
          ? { isLoggedIn: false, hasPurchased: true, hasReviewed: true, viaReceipt: true, receiptToken: "rcpt_0123456789abcdefghijklmnopqrstuv", existingReview: { id: "r9", rating: 4, content: "Good template. The monthly view is what I needed; a dark version would be nice.", created_at: "2026-09-20T10:00:00Z", edited_at: null, hidden: false, seller_reply: "Thanks Ana. A dark version is on the way.", seller_reply_at: "2026-09-21T10:00:00Z" } }
          : { isLoggedIn: false, hasPurchased: true, hasReviewed: false, viaReceipt: true, existingReview: null }
      } else if (url.pathname === "/api/reviews" && req.method === "POST") out = { review: { id: "r10", rating: body.rating, content: body.content, created_at: new Date().toISOString() } }
      else if (url.pathname === "/api/app/reviews" && url.searchParams.get("only") === "products") out = { products: SELLER_PRODUCTS.map((p) => ({ id: p.id, title: p.title })) }
      else if (url.pathname === "/api/app/reviews") out = sellerList(url.searchParams.get("tab") || "all")
      else if (/\/reply$/.test(url.pathname)) out = { review: { seller_reply: body.text, seller_reply_at: new Date().toISOString() } }
      else if (/\/report$/.test(url.pathname)) out = { hidden: true }
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 120)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/**
 * ===========================================================================
 *  WHAT EVERY AVATAR ON THE PAGE IS HOLDING
 * ===========================================================================
 * For each <AppAvatar>: its state, its box, whether anything is drawn inside
 * it (letters or the person glyph), the letters themselves, and the colours
 * the letters are drawn in against what they sit on, composited down through
 * whatever is behind them so a half transparent circle is measured as it is
 * actually seen. `empty` is the failure this whole probe is about: a circle
 * with a size and nothing in it.
 */
const AVATAR_SCAN = `(() => {
  const luminance = (r, g, b) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  /*
    ANY COLOUR THE PAGE ACTUALLY USES. Reading rgba() with a regex and
    returning null for the rest means every oklch() design token counts as
    nothing painted, and the measurement then reads the colour BEHIND a
    solid disc. That hid white initials on a near white circle for a whole
    round. Painted into a canvas and read back instead, which speaks every
    syntax the browser can render.
  */
  const unreadable = []
  const pad = document.createElement("canvas")
  pad.width = 1
  pad.height = 1
  const ctx = pad.getContext("2d", { willReadFrequently: true })
  const parse = (c) => {
    if (!c) return null
    const m = c.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/)
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
    if (c === "transparent" || c === "none") return { r: 0, g: 0, b: 0, a: 0 }
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = "#010101"
    ctx.fillStyle = c
    if (ctx.fillStyle === "#010101") { unreadable.push(c); return null }
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  })
  /* What is actually behind this element: every painted background up the tree, flattened. */
  const behind = (el) => {
    let out = { r: 255, g: 255, b: 255, a: 1 }
    const chain = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n)
    for (const n of chain.reverse()) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0) out = over(c, out)
    }
    return out
  }
  const ratio = (fg, bg) => {
    const a = luminance(fg.r, fg.g, fg.b) + 0.05
    const b = luminance(bg.r, bg.g, bg.b) + 0.05
    return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100
  }
  const out = [...document.querySelectorAll("[data-app-avatar]")].map((el) => {
    const box = el.getBoundingClientRect()
    const mark = el.querySelector("span[aria-hidden], svg[aria-hidden]")
    const text = (el.textContent || "").trim()
    const img = el.querySelector("img")
    const ground = behind(el)
    const ink = mark ? parse(getComputedStyle(mark).color) || { r: 0, g: 0, b: 0, a: 1 } : null
    return {
      state: el.getAttribute("data-state"),
      w: Math.round(box.width),
      h: Math.round(box.height),
      text,
      glyph: !!el.querySelector("svg"),
      photo: !!img && getComputedStyle(img).opacity === "1",
      empty: box.width > 0 && !text && !el.querySelector("svg") && !(img && getComputedStyle(img).opacity === "1"),
      contrast: ink ? ratio(over({ ...ink, a: ink.a }, ground), ground) : null,
    }
  })
  if (unreadable.length) out.unreadable = [...new Set(unreadable)]
  return out
})()`

const VIOLET_SCAN = `(() => {
  const out = []
  const violet = (c) => {
    const m = c && c.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/)
    if (!m) return false
    const [r, g, b] = [m[1], m[2], m[3]].map(Number)
    const a = m[4] === undefined ? 1 : Number(m[4])
    if (a < 0.05) return false
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max - min < 40) return false
    let h
    if (max === r) h = ((g - b) / (max - min)) % 6
    else if (max === g) h = (b - r) / (max - min) + 2
    else h = (r - g) / (max - min) + 4
    h = (h * 60 + 360) % 360
    return h >= 250 && h <= 295
  }
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el)
    if (s.display === "none" || s.visibility === "hidden") continue
    for (const p of ["color", "backgroundColor", "borderTopColor"]) {
      if (p === "color" && !el.childNodes.length) continue
      if (p.startsWith("border") && parseFloat(s.borderTopWidth) === 0) continue
      if (violet(s[p])) out.push(el.tagName.toLowerCase() + " " + p + " " + s[p])
    }
  }
  return out
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const VIEWPORTS = [["390x844", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["1440x900", { width: 1440, height: 900, deviceScaleFactor: 1 }]]
const open = async (vp, query, settle = "networkidle0") => {
  const page = await browser.newPage()
  await page.setViewport(vp)
  await page.goto(`${base}/?${query}`, { waitUntil: settle })
  await wait(700)
  return page
}
const common = async (page, label) => {
  const violet = await page.evaluate(VIOLET_SCAN)
  expect(violet.length === 0, `${label}: nothing violet`, violet.slice(0, 3).join(" | "))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow <= 0, `${label}: nothing scrolls sideways`, `${overflow}px`)
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }) }

try {
  for (const [size, vp] of VIEWPORTS) {
    console.log(`\nProduct page reviews at ${size}`)
    {
      const page = await open(vp, "view=product")
      await common(page, `product ${size}`)
      const s = await page.evaluate(() => {
        const block = document.querySelector("[data-reviews-block]")
        const summary = document.querySelector("[data-rating-summary]")
        const cards = [...document.querySelectorAll("[data-review]")]
        const bars = [...document.querySelectorAll("[data-rating-summary] li")].map((li) => li.getAttribute("aria-label"))
        const first = cards[0]
        const summaryBox = summary?.getBoundingClientRect()
        const listBox = cards[0]?.getBoundingClientRect()
        return {
          heading: block?.querySelector("h2")?.textContent,
          average: summary?.textContent?.includes("4.3"),
          bars,
          cards: cards.length,
          verified: cards.every((c) => /Verified purchase/.test(c.textContent || "")),
          names: cards.map((c) => c.querySelector("p")?.textContent),
          avatar: !!first?.querySelector("img"),
          initials: cards[1]?.textContent?.includes("AN") || cards[1]?.textContent?.includes("A"),
          reply: !!first?.querySelector("[data-seller-reply]") && /Seller.s reply/.test(first?.textContent || ""),
          showMore: [...document.querySelectorAll("[data-review] button")].some((b) => /Show more/.test(b.textContent || "")),
          edited: /Edited/.test(cards[2]?.textContent || ""),
          side: summaryBox && listBox ? (summaryBox.right <= listBox.left + 1 ? "beside" : "above") : null,
          more: [...document.querySelectorAll("button")].some((b) => /Show more reviews/.test(b.textContent || "")),
        }
      })
      expect(/Reviews\s*\(12\)/.test(s.heading || ""), "a heading with the count", s.heading)
      expect(s.average && s.bars.join("|") === "5 stars: 7|4 stars: 3|3 stars: 0|2 stars: 1|1 stars: 1", "the average and a bar per star with its count", JSON.stringify(s.bars))
      expect(s.cards === 4 && s.verified, "each review says Verified purchase", JSON.stringify(s))
      expect(s.names[0] === "Ghita Nastase" && s.names[1] === "Ana", "named by the profile, or the guest's first name", JSON.stringify(s.names))
      expect(s.avatar, "the buyer's photo through AppAvatar")
      expect(s.reply, "the seller's reply under its review")
      expect(s.showMore, "a long review is cut with Show more")
      expect(s.edited, "an edited review says so")
      expect(s.more, "Show more reviews when there are more than the first ten")
      expect(size === "390x844" ? s.side === "above" : s.side === "beside", `the rating ${size === "390x844" ? "above" : "beside"} the reviews`, s.side)
      await shot(page, `product-reviews-${size}`)
      await page.close()
    }

    console.log(`\nThe seller's Reviews list at ${size}`)
    {
      const page = await open(vp, "view=seller")
      await common(page, `seller ${size}`)
      await wait(400)
      const s = await page.evaluate(() => ({
        tabs: [...document.querySelectorAll("[data-reviews-tab]")].map((t) => t.textContent),
        rows: document.querySelectorAll("[data-review-row]").length,
        hidden: /Hidden, reported/.test(document.getElementById("app")?.textContent || ""),
        product: [...document.querySelectorAll("select")].some((x) => /All products/.test(x.textContent || "")),
      }))
      expect(s.tabs.join("|") === "All5|Published4|Pending0|Hidden0|Reported1|No reply3", "the tabs say where each review stands, with counts from the server", s.tabs.join("|"))
      expect(s.rows === 5 && s.hidden, "every review, the reported one marked hidden", JSON.stringify(s))
      expect(s.product, "a product filter when there is more than one product")
      await shot(page, `seller-reviews-${size}`)
      await page.evaluate(() => [...document.querySelectorAll("[data-reviews-tab]")].find((t) => /^No reply/.test(t.textContent || ""))?.click())
      await wait(400)
      const unanswered = await page.evaluate(() => document.querySelectorAll("[data-review-row]").length)
      expect(unanswered === 3, "No reply asks the server for that tab", String(unanswered))
      await page.evaluate(() => [...document.querySelectorAll("[data-review-row] button")].find((b) => b.textContent?.trim() === "Reply")?.click())
      await wait(200)
      await page.type("[data-review-row] textarea", "Thank you, a dark version is coming.")
      asked.length = 0
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Post reply/.test(b.textContent || ""))?.click())
      await wait(500)
      const put = asked.find((a) => a.method === "PUT" && /\/reply$/.test(a.path))
      expect(!!put && /dark version/.test(put.body.text), "Reply posts the words to the reply route", JSON.stringify(asked))
      await shot(page, `seller-reviews-replied-${size}`)
      await page.evaluate(() => [...document.querySelectorAll("[data-reviews-tab]")].find((t) => /^All/.test(t.textContent || ""))?.click())
      await wait(400)
      await page.click("[data-review-row] button[aria-label^='Actions']")
      await wait(400)
      await page.evaluate(() => [...document.querySelectorAll("[role=menuitem], button, a")].find((b) => /Report review/.test(b.textContent || ""))?.click())
      await wait(400)
      const dialog = await page.evaluate(() => document.querySelector("[role=dialog]")?.textContent || "")
      expect(/Abusive/.test(dialog) && /Spam/.test(dialog) && /Report and hide/.test(dialog), "Report opens the reasons", dialog.slice(0, 120))
      await shot(page, `seller-report-${size}`)
      await page.close()
    }

    console.log(`\nThe receipt's review card at ${size}`)
    {
      own = false
      const page = await open(vp, "view=receipt&rate=4")
      await common(page, `receipt ${size}`)
      const lit = await page.evaluate(() => [...document.querySelectorAll("[data-star]")].map((s) => s.getAttribute("data-lit")).join())
      expect(lit === "true,true,true,true,false", "the email's fourth star arrives chosen", lit)
      const text = await page.evaluate(() => document.getElementById("app")?.textContent || "")
      expect(/Post review/.test(text) && !/Sign in to post/.test(text), "a guest with the receipt link posts without signing in", text.slice(0, 200))
      await shot(page, `receipt-form-${size}`)
      await page.type("textarea", "Good template, the monthly view is what I needed.")
      asked.length = 0
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Post review/.test(b.textContent || ""))?.click())
      await wait(500)
      const post = asked.find((a) => a.path === "/api/reviews" && a.method === "POST")
      expect(!!post && post.body.receiptToken && post.body.rating === 4, "it posts the stars with the receipt token", JSON.stringify(post?.body))
      const after = await page.evaluate(() => document.getElementById("app")?.textContent || "")
      expect(/Thanks for your review/.test(after) && /Edit/.test(after) && /Delete/.test(after), "then thanks them, with Edit and Delete", after.slice(0, 200))
      await shot(page, `receipt-posted-${size}`)
      await page.close()
    }
    {
      own = true
      const page = await open(vp, "view=receipt-own")
      const text = await page.evaluate(() => document.getElementById("app")?.textContent || "")
      expect(/Your review/.test(text) && /Reply from Maria Studio/.test(text) && /Edit/.test(text), "their own review, with the seller's reply", text.slice(0, 200))
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Delete")?.click())
      await wait(200)
      const confirm = await page.evaluate(() => document.getElementById("app")?.textContent || "")
      expect(/Delete your review\?/.test(confirm) && /Keep it/.test(confirm), "Delete asks first", confirm.slice(0, 200))
      await shot(page, `receipt-own-${size}`)
      await page.close()
    }

    console.log(`\nThe library's review card at ${size}`)
    {
      own = false
      const page = await open(vp, "view=library")
      await common(page, `library ${size}`)
      /* Changed on purpose: the owner asked for rating and reviewing to happen in one place, the library's
         Reviews tab. The product in the library carries one line that goes there, to this product. */
      const s = await page.evaluate(() => ({ text: document.getElementById("app")?.textContent || "", href: document.querySelector("[data-product-review]")?.getAttribute("href"), form: !!document.querySelector("textarea") }))
      expect(/Write a review/.test(s.text) && s.href === "/account/library/reviews?product=9a9a9a9a-0000-4000-8000-000000000001" && !s.form, "one line to the Reviews tab, focused on this product, and no second form here", s)
      await shot(page, `library-review-${size}`)
      await page.close()
    }

    /*
      ═══════════════════════════════════════════════════════════════════════
       EVERY KIND OF REVIEWER, ON THE LIGHT THEME AND THE DARK ONE
      ═══════════════════════════════════════════════════════════════════════
      "The user that left the review may be signed out, another account, so
      he doesn't have an account image at all, but it still needs to display
      something." The creator page drew `(buyerName || "?")[0]` and a guest
      review has no buyerName at all, so it was a grey box with a question
      mark in it and no name beside it.

      Five authors, both blocks that draw them, both themes: an account with
      a photo, an account with none, a guest named by their order, a review
      with no name anywhere, and a photo whose address 404s. Nothing may be a
      "?", nothing may be an empty circle, and the letters have to be legible
      on the background they actually sit on.
    */
    for (const theme of ["light", "dark"]) {
      console.log(`\nEvery kind of reviewer, ${theme} theme at ${size}`)
      const page = await open(vp, `view=reviewers&theme=${theme}`)
      await common(page, `reviewers ${theme} ${size}`)
      /*
        The rating bars were the platform's near black on a page whose own
        background is near black: darker than the track they run in. They
        take the page's text colour now, so they read either way.
      */
      const bars = await page.evaluate(`(() => {
        const track = document.querySelector("[data-rating-summary] li span:nth-child(2)")
        const fill = track && track.firstElementChild
        return { track: track && getComputedStyle(track).backgroundColor, fill: fill && getComputedStyle(fill).backgroundColor }
      })()`)
      expect(bars.fill !== bars.track, `the rating bars are not the colour of their track (${theme})`, JSON.stringify(bars))
      const avatars = await page.evaluate(AVATAR_SCAN)
      /* A colour the reader cannot resolve is a measurement that silently reads past a disc. */
      expect(!avatars.unreadable, "every colour behind the letters could be read", (avatars.unreadable || []).join(" | "))
      const text = await page.evaluate(() => document.getElementById("app")?.textContent || "")
      expect(avatars.length === 10, "five reviewers on the product page and five on the creator page", String(avatars.length))
      expect(!/\?/.test(text.replace(/How was [^?]*\?/g, "")), "not one question mark anywhere on the reviews", text.match(/.{0,20}\?.{0,20}/)?.[0] || "")
      const empties = avatars.filter((a) => a.empty)
      expect(empties.length === 0, "no avatar is an empty circle", JSON.stringify(empties))
      const sized = avatars.every((a) => a.w >= 28 && a.h >= 28 && a.w === a.h)
      expect(sized, "every avatar keeps its round box", JSON.stringify(avatars.map((a) => `${a.w}x${a.h}`)))
      const product = avatars.slice(0, 5)
      const creator = avatars.slice(5)
      expect(product[0].photo && creator[0].photo, "the buyer with a photo shows it", JSON.stringify([product[0], creator[0]]))
      expect(product[1].text === "MP" && creator[1].text === "MP", "a buyer with no photo is their initials", `${product[1].text} ${creator[1].text}`)
      expect(product[2].text === "AN" && creator[2].text === "AN", "a guest is the name on the order", `${product[2].text} ${creator[2].text}`)
      expect(product[3].glyph && !product[3].text && creator[3].glyph, "no name at all is a plain person, never a letter", JSON.stringify([product[3], creator[3]]))
      expect(product[4].text === "LI" && creator[4].text === "LI", "a photo that 404s falls back to the initials", `${product[4].text} ${creator[4].text}`)
      expect((text.match(/Verified buyer/g) || []).length >= 2, "and the nameless review reads Verified buyer", text.slice(0, 80))
      const marks = avatars.filter((a) => a.contrast !== null)
      const worst = marks.reduce((lo, a) => (a.contrast < lo ? a.contrast : lo), 99)
      expect(worst >= 4.5, `the letters carry on the ${theme} theme (worst ${worst}:1)`, JSON.stringify(marks.map((a) => `${a.text || "glyph"} ${a.contrast}`)))
      await shot(page, `reviewers-${theme}-${size}`)
      await page.close()
    }

    /*
      "Sometimes in the Leave a review the avatar is empty." Three ways it
      was: nobody known, a photo whose address 404s, and a photo whose host
      never answers, which left a bare ring under the heading for as long as
      the request hung.
    */
    for (const theme of ["light", "dark"]) {
      for (const [which, want] of [["unknown", ""], ["gone", "LI"], ["slow", "GN"]]) {
        /* The hanging photo never lets the network fall idle, so this one waits on the markup. */
        const page = await open(vp, `view=leave&case=${which}&theme=${theme}`, which === "slow" ? "domcontentloaded" : "networkidle0")
        const a = (await page.evaluate(AVATAR_SCAN))[0]
        expect(!!a && !a.empty && a.w === 48, `Leave a review, ${which}, ${theme}: the circle is never empty`, JSON.stringify(a))
        expect(a && (want ? a.text === want : a.glyph && !a.text), `  and holds ${want || "a plain person"}`, JSON.stringify(a))
        expect(a && a.contrast >= 4.5, `  legible on what it sits on (${a?.contrast}:1)`, JSON.stringify(a))
        await shot(page, `leave-${which}-${theme}-${size}`)
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
  for (const res of hanging) res.destroy()
  server.close()
}

console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
