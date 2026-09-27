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
 *   SELLER     the Reviews list in /app: the filters by stars, a review with
 *              no reply offers Reply and posts it, a reported one is marked
 *              hidden, the report dialog names its reasons.
 *   RECEIPT    a guest from the email's fourth star: four stars chosen, the
 *              form posts with the receipt token and no sign in; their own
 *              review shows the seller's reply with Edit and Delete.
 *   LIBRARY    the same card on a product in the library.
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
let own = false
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/buyer.png") { res.writeHead(200, { "content-type": "image/svg+xml" }); res.end(BUYER_SVG); return }
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
const open = async (vp, query) => {
  const page = await browser.newPage()
  await page.setViewport(vp)
  await page.goto(`${base}/?${query}`, { waitUntil: "networkidle0" })
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
      const s = await page.evaluate(() => ({
        tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent),
        rows: document.querySelectorAll("[data-review-row]").length,
        hidden: /Hidden, reported/.test(document.getElementById("app")?.textContent || ""),
        summary: document.querySelector("[data-reviews-summary]")?.textContent,
        product: !!document.querySelector("select"),
      }))
      expect(s.tabs.join("|") === "All5|No reply3|5 star2|4 star1|3 star0|2 star1|1 star0|Hidden1", "filters by stars, with counts, and No reply and Hidden", s.tabs.join("|"))
      expect(s.rows === 5 && s.hidden, "every review, the reported one marked hidden", JSON.stringify(s))
      expect(/4\.0/.test(s.summary || "") && /4 reviews/.test(s.summary || ""), "the average of the published ones", s.summary)
      expect(s.product, "a product filter when there is more than one product")
      await shot(page, `seller-reviews-${size}`)
      await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => /^1 star/.test(t.textContent || ""))?.click())
      await wait(150)
      const oneStar = await page.evaluate(() => document.querySelectorAll("[data-review-row]").length)
      expect(oneStar === 0, "the 1 star filter shows none (the hidden one is not counted)", String(oneStar))
      await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => /^No reply/.test(t.textContent || ""))?.click())
      await wait(150)
      await page.evaluate(() => [...document.querySelectorAll("[data-review-row] button")].find((b) => b.textContent?.trim() === "Reply")?.click())
      await wait(200)
      await page.type("#review-reply", "Thank you, a dark version is coming.")
      asked.length = 0
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Post reply/.test(b.textContent || ""))?.click())
      await wait(500)
      const put = asked.find((a) => a.method === "PUT" && /\/reply$/.test(a.path))
      expect(!!put && /dark version/.test(put.body.text), "Reply posts the words to the reply route", JSON.stringify(asked))
      await shot(page, `seller-reviews-replied-${size}`)
      await page.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((t) => /^All/.test(t.textContent || ""))?.click())
      await wait(150)
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
      const s = await page.evaluate(() => ({ text: document.getElementById("app")?.textContent || "", img: !!document.querySelector("[data-reviewer] img") }))
      expect(/Leave a review/.test(s.text) && /Post review/.test(s.text) && s.img, "Leave a review, with their own photo", s.text.slice(0, 120))
      await shot(page, `library-review-${size}`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}

console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
