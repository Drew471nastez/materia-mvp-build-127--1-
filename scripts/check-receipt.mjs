/**
 * ===========================================================================
 *  THE RECEIPT: CALM, NO VIOLET, AND EVERY BUTTON ON IT DOES ITS JOB
 * ===========================================================================
 * The real receipt page (scripts/render-receipt.tsx) at 390x844 and
 * 1440x900, for five orders: a free PDF (the owner's screenshots), a paid
 * card order with a code and a tip, one product with several files, a
 * course with a link product (nothing to download), and the free PDF opened
 * by a guest. A server here answers every /api call the page makes.
 *
 *   NO VIOLET      no element on the page paints a violet text, fill or
 *                  border (hue 250 to 290, saturated), in any case.
 *   PRINT          a light grey button with a border and a shadow.
 *   FILES          the file rows start at the card's content edge (not under
 *                  the title), a long name is cut in the middle with the
 *                  whole name in `title`, nothing scrolls sideways.
 *   DOWNLOAD       pressing it asks /api/download/<id>?receipt=<token>,
 *                  shows a pending label while the server thinks, and the
 *                  browser starts a download of the signed URL. A refusal
 *                  shows the server's words next to the file.
 *   RESEND         posts the order id and token, says Sent; a 429 shows the
 *                  server's words.
 *   WRONG ADDRESS  on a guest order opens the change form and posts the new
 *                  address; on an account's order it explains instead.
 *   LIBRARY        the row lifts on hover and its arrow moves.
 *   REVIEW         the buyer's own photo (or initial), no violet badge, the
 *                  stars fill on hover and stay on a press, posting sends
 *                  the rating and text, a refusal says why.
 *   TOTALS         the paid order shows subtotal, discount with its code,
 *                  tip, total, and the card; the help line has the refund
 *                  policy.
 *   SELLER         the photo and name link to the seller's page; a soft grey
 *                  pill fades in behind them on hover (150ms), a press sinks
 *                  it, a keyboard focus rings it, and a phone gets 44px.
 *   CONTACT        "Contact seller" opens the support address with Write
 *                  email (mailto, subject "Order <number>") and Copy (the
 *                  clipboard really holds it); with no support address it is
 *                  a form that posts to /api/receipt/contact and says Sent,
 *                  or the server's words.
 *   ACCOUNT EMAIL  on the buyer's own account order the card names the
 *                  account email, Resend posts to: "account", and "Send a
 *                  copy to another email" posts /api/receipt/send-copy; signed
 *                  out, the same order explains and offers Sign in; a guest
 *                  order keeps Wrong address.
 *   REFUNDED       says so, closes the files, shows the refund.
 *   CLEAN          no console error and no page error in any case, and the
 *                  page rendered on a server and hydrated in the browser
 *                  (React's development build, which reports every
 *                  difference) logs no hydration warning.
 *
 *   PROBE_CSS=source node scripts/check-receipt.mjs
 *   SHOTS=/some/dir PROBE_CSS=source node scripts/check-receipt.mjs
 *   SHOTS_ONLY=1 also skips the assertions (for a before picture).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const SHOTS_ONLY = process.env.SHOTS_ONLY === "1"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".receipt-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() { window.__refreshes = (window.__refreshes || 0) + 1 }, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src, alt, width, height, ...rest }) }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-receipt.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
  /* The same page with React's development build, for the hydration pass. */
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-receipt.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe-dev.js")}`,
    '--define:process.env.NODE_ENV="development"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
  /* And the server's render of it, in Node. */
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-receipt-ssr.tsx"),
    "--bundle", "--format=esm", "--platform=node", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "ssr.mjs")}`,
    '--define:process.env.NODE_ENV="development"', "--packages=external",
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const { renderReceipt } = await import(pathToFileURL(join(dir, "ssr.mjs")).href)
/*
 * This Chromium answers (hover: none) in headless mode whatever is emulated,
 * so Tailwind's hover rules (inside `@media (hover: hover)`) would never
 * apply. The computer-sized pages get the stylesheet with that condition
 * opened, which is what a mouse gets; the phone-sized ones keep it closed.
 */
const sheet = await appCss(root)
const mouseSheet = sheet.replace(/@media \(hover: ?hover\)/g, "@media all")
/* Inter's faces point at the build's files by file://, which a page served
   over http may not load (a console error on every page). The probe's own
   server hands them out instead. */
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+?)\/([^/)]+)\)/g, (_, folder, name) => {
  fontFiles.set(name, join(folder, name))
  return `url(/__font/${name})`
})
const probeJs = readFileSync(join(dir, "probe.js"), "utf8")
const probeDevJs = readFileSync(join(dir, "probe-dev.js"), "utf8")
const pageHtml = (css, { markup = "", js = probeJs, env = "production" } = {}) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app">${markup}</div><script>window.process={env:{NODE_ENV:"${env}"}}</script><script>${js}</script></body></html>`
const html = pageHtml(sheet)
const mouseHtml = pageHtml(mouseSheet)
rmSync(dir, { recursive: true, force: true })

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">${body}</svg>`
const IMAGES = {
  "/seller.png": svg('<rect width="96" height="96" fill="#111"/><text x="48" y="56" font-size="26" fill="#fff" text-anchor="middle" font-family="sans-serif">loud</text>'),
  "/thumb.png": svg('<rect width="96" height="96" fill="#c9a27a"/><rect x="14" y="40" width="50" height="40" fill="#8a5a33"/><circle cx="60" cy="30" r="14" fill="#2b2b2b"/>'),
  "/buyer.png": svg('<rect width="96" height="96" fill="#e8d5c4"/><circle cx="48" cy="38" r="18" fill="#6b4a3a"/><rect x="18" y="62" width="60" height="40" rx="20" fill="#35506b"/>'),
}

/** What the page asked the server, and how the server should answer next. */
const asked = []
const answer = {
  download: "ok",
  resend: "ok",
  change: "ok",
  copy: "ok",
  contact: "ok",
  review: "ok",
  reviewCheck: { isLoggedIn: true, hasPurchased: true, hasReviewed: false, existingReview: null },
}
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (IMAGES[url.pathname]) {
    res.writeHead(200, { "content-type": "image/svg+xml" })
    res.end(IMAGES[url.pathname])
    return
  }
  if (url.pathname.startsWith("/__font/") && fontFiles.has(url.pathname.slice(8))) {
    res.writeHead(200, { "content-type": "font/woff2" })
    res.end(readFileSync(fontFiles.get(url.pathname.slice(8))))
    return
  }
  if (url.pathname === "/files/signed.pdf") {
    res.writeHead(200, { "content-type": "application/pdf", "content-disposition": 'attachment; filename="signed.pdf"' })
    res.end("%PDF-1.4\n%probe\n")
    return
  }
  if (url.pathname.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => { raw += c })
    req.on("end", () => {
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { /* not json */ }
      asked.push({ method: req.method, path: url.pathname, query: url.search, body })
      let status = 200
      let out = {}
      let delay = 150
      if (url.pathname.startsWith("/api/download/")) {
        delay = 600
        /* "cross" is what production really answers: storage is another
           origin, and the name rides along as `download`, which is what
           makes storage send Content-Disposition: attachment. */
        if (answer.download === "cross") out = { success: true, downloadUrl: `${filesBase}/files/signed.pdf?download=signed.pdf`, fileName: "signed.pdf", expiresIn: 300 }
        else if (answer.download === "inline") out = { success: true, downloadUrl: `${filesBase}/files/signed.pdf`, fileName: "signed.pdf", expiresIn: 300 }
        else if (answer.download === "ok") out = { success: true, downloadUrl: `${base}/files/signed.pdf`, fileName: "signed.pdf", expiresIn: 300 }
        else { status = 403; out = { error: "This order was refunded, so its files are closed.", reason: "refunded" } }
      } else if (url.pathname === "/api/receipt/resend") {
        delay = 400
        if (answer.resend === "ok") out = { success: true, remainingAttempts: 4 }
        else { status = 429; out = { error: "This receipt has been sent 5 times today. Try again tomorrow.", limitReached: true } }
      } else if (url.pathname === "/api/receipt/update-email") {
        delay = 400
        if (answer.change === "ok") out = { success: true }
        else { status = 403; out = { error: "The address can only be changed in the first week. Reply to your receipt email and the seller can help." } }
      } else if (url.pathname === "/api/receipt/send-copy") {
        delay = 400
        if (answer.copy === "ok") out = { success: true }
        else { status = 429; out = { error: "A copy was just sent. Try again in a few minutes." } }
      } else if (url.pathname === "/api/receipt/contact") {
        delay = 400
        if (answer.contact === "ok") out = { success: true }
        else { status = 429; out = { error: "You have written 5 times today. The seller will reply by email.", limitReached: true } }
      } else if (url.pathname === "/api/reviews/check") {
        out = answer.reviewCheck
      } else if (url.pathname === "/api/reviews") {
        delay = 400
        if (answer.review === "ok") out = { review: { id: "r1", rating: body.rating, content: body.content } }
        else { status = 409; out = { error: "You already reviewed this product." } }
      }
      setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, delay)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  if (url.searchParams.get("ssr") === "1") {
    /* Rendered here, as the server would, then hydrated by React's development build. */
    const markup = renderReceipt(url.searchParams.get("ssrcase") || url.searchParams.get("case") || "free", base)
    res.end(pageHtml(url.searchParams.get("mouse") === "1" ? mouseSheet : sheet, { markup, js: probeDevJs, env: "development" }))
    return
  }
  res.end(url.searchParams.get("mouse") === "1" ? mouseHtml : html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/*
 * THE FILE ITSELF, ON ANOTHER ORIGIN. Supabase storage is not storelib.com,
 * and a different port here is a different origin in exactly the same way,
 * so an anchor's `download` is ignored against it just as it is in
 * production. This is what the receipt's Download used to navigate to.
 */
const fileAsks = []
const fileServer = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  fileAsks.push({ path: url.pathname, query: url.search })
  if (url.pathname === "/files/signed.pdf") {
    /* Storage answers the `download` parameter with an attachment under
       that name (lib/storage/download.ts). WITHOUT it the PDF comes back
       inline, which is the shape the owner reported: the browser drew it
       over the receipt. Both shapes are run below. */
    const name = url.searchParams.get("download")
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": name === null ? "inline" : `attachment; filename="${name || "signed.pdf"}"`,
    })
    res.end("%PDF-1.4\n%probe\n")
    return
  }
  res.writeHead(404, { "content-type": "text/plain" })
  res.end("no")
})
await new Promise((r) => fileServer.listen(0, "127.0.0.1", r))
const filesBase = `http://127.0.0.1:${fileServer.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  if (SHOTS_ONLY) return
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* Every painted colour on the page that reads as violet. */
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
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    for (const p of ["color", "backgroundColor", "borderTopColor", "fill", "stroke"]) {
      if (p === "color" && !el.childNodes.length) continue
      if (p.startsWith("border") && parseFloat(s.borderTopWidth) === 0) continue
      if ((p === "fill" || p === "stroke") && el.namespaceURI !== "http://www.w3.org/2000/svg") continue
      if (violet(s[p])) out.push(el.tagName.toLowerCase() + "." + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 60) + " " + p + " " + s[p])
    }
    if (/rgba?\\([^)]*\\)/.test(s.boxShadow) && s.boxShadow.match(/rgba?\\([^)]*\\)/g).some(violet)) out.push(el.tagName.toLowerCase() + " box-shadow " + s.boxShadow)
  }
  return out
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const VIEWPORTS = [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]
const CASES = ["free", "paid", "multi", "nofiles", "guest", "signedout", "nosupport", "refunded"]
const SIGNED_OUT = new Set(["guest", "signedout", "nosupport"])

/* Everything the page says to the console, per page. */
const logs = new WeakMap()
async function open(viewport, which, reviewCheck, { ssr = false, ssrcase = "" } = {}) {
  answer.reviewCheck = reviewCheck ?? (SIGNED_OUT.has(which)
    /* What /api/reviews/check answers a guest now that the card asks with the receipt token (the token proves the purchase). */
    ? { isLoggedIn: false, hasPurchased: true, hasReviewed: false, viaReceipt: true, existingReview: null }
    : { isLoggedIn: true, hasPurchased: true, hasReviewed: false, existingReview: null })
  const page = await browser.newPage()
  const said = []
  logs.set(page, said)
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") said.push(`${m.type()}: ${m.text()}`) })
  page.on("pageerror", (e) => said.push(`pageerror: ${e.message}`))
  await page.setViewport(viewport)
  await page.goto(`${base}/receipt/x?case=${which}${viewport.hasTouch ? "" : "&mouse=1"}${ssr ? "&ssr=1" : ""}${ssrcase ? `&ssrcase=${ssrcase}` : ""}`, { waitUntil: "networkidle0" })
  await page.evaluate(() => document.fonts.ready)
  await wait(150)
  return page
}

try {
  /* ── Pictures of every case, and the checks that hold for all of them ── */
  for (const [label, viewport] of VIEWPORTS) {
    for (const which of CASES) {
      const page = await open(viewport, which)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-${which}-${label}.png`), fullPage: true })
      if (!SHOTS_ONLY) {
        console.log(`\n${which} at ${label}`)
        const said = logs.get(page) ?? []
        expect(said.length === 0, "no console error, no page error", said.slice(0, 3).join(" | "))
        const violet = await page.evaluate(VIOLET_SCAN)
        expect(violet.length === 0, "nothing on the page is violet", violet.slice(0, 4).join(" | "))
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow <= 0, "nothing scrolls sideways", `${overflow}px`)
        const print = await page.evaluate(() => {
          const b = [...document.querySelectorAll("button")].find((x) => /Print/.test(x.textContent || ""))
          if (!b) return null
          const s = getComputedStyle(b)
          const r = b.getBoundingClientRect()
          return { bg: s.backgroundColor, border: s.borderTopWidth, shadow: s.boxShadow, h: r.height, w: r.width }
        })
        expect(!!print && /rgb\((2[3-5]\d), (2[3-5]\d), (2[3-5]\d)\)/.test(print.bg) && print.border !== "0px" && print.shadow !== "none",
          "Print is a light grey button with a border and a shadow", JSON.stringify(print))
        expect(!!print && print.h >= (label === "390" ? 36 : 32), "and is a comfortable target", JSON.stringify(print))

        const rows = await page.evaluate(() => {
          const list = [...document.querySelectorAll("[data-receipt-file]")]
          return list.map((li) => {
            const card = li.closest("[data-receipt-item]")
            const name = li.querySelector("[data-file-name]")
            const btn = li.querySelector("button")
            const cr = card.getBoundingClientRect()
            const lr = li.getBoundingClientRect()
            const pad = parseFloat(getComputedStyle(card).paddingLeft)
            return {
              leftGap: Math.round(lr.left - cr.left - pad),
              title: name?.getAttribute("title"),
              nameText: name?.textContent,
              nameFits: name ? name.scrollWidth <= name.clientWidth + 1 : false,
              btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
              btnBg: btn ? getComputedStyle(btn).backgroundColor : "",
              btnShadow: btn ? getComputedStyle(btn).boxShadow : "",
            }
          })
        })
        if (which === "free" || which === "guest" || which === "multi" || which === "paid") {
          expect(rows.length > 0, "the files are listed", JSON.stringify(rows))
          expect(rows.every((r) => Math.abs(r.leftGap) <= 1), "file rows start at the card's content edge", JSON.stringify(rows.map((r) => r.leftGap)))
          expect(rows.every((r) => r.title && r.title.length >= (r.nameText || "").replace("…", "").length), "the whole name is in title", JSON.stringify(rows.map((r) => r.title)))
          expect(rows.every((r) => r.nameFits), "no name runs past its row", JSON.stringify(rows.map((r) => r.nameText)))
          expect(rows.every((r) => r.btnShadow !== "none" && r.btnH >= 36), "Download has depth and room", JSON.stringify(rows[0]))
          const gap = await page.evaluate(() => {
            const card = document.querySelector("[data-receipt-item]")
            const head = card.querySelector("[data-item-head]")
            const first = card.querySelector("[data-receipt-file]")
            return Math.round(first.getBoundingClientRect().top - head.getBoundingClientRect().bottom)
          })
          expect(gap >= 8 && gap <= 20, "the files sit right under their product", `${gap}px`)
        }
        if (which === "free" || which === "guest") {
          /* The cut is CSS's ellipsis on the head, so it is measured, not read. */
          const cut = await page.evaluate(() => {
            const name = document.querySelector("[data-receipt-file] [data-file-name]")
            const head = name?.querySelector("[data-name-head]")
            const tail = head?.nextElementSibling
            return { cut: head ? head.scrollWidth > head.clientWidth : false, tail: tail?.textContent || "", tailShown: tail ? tail.getBoundingClientRect().right <= name.getBoundingClientRect().right + 1 : false }
          })
          if (label === "390") expect(cut.cut && cut.tail.endsWith(".pdf") && cut.tailShown, "a UUID name is cut in the middle and keeps its end and extension", JSON.stringify(cut))
        }
        if (which === "nofiles") {
          const text = await page.evaluate(() => document.querySelector("[data-receipt-items]")?.textContent || "")
          expect(/Open course/.test(text), "the course has its button")
          expect(/No files come with this item|Nothing to download/.test(text), "the link product says there is nothing to download", text.slice(0, 200))
        }
        if (which === "paid") {
          const text = await page.evaluate(() => document.querySelector("[data-receipt-totals]")?.textContent || "")
          expect(/Subtotal\$30\.00/.test(text), "subtotal before the code", text)
          expect(/AUTUMN20/.test(text) && /−\$6\.00/.test(text), "the discount with its code", text)
          expect(/Tip\$3\.00/.test(text), "the tip", text)
          expect(/Total\$27\.00/.test(text), "the total", text)
          expect(/Visa ending 4242/.test(text), "the card", text)
          const help = await page.evaluate(() => document.querySelector("[data-receipt-help]")?.textContent || "")
          /* The address used to be printed in the help line; it is now one
             press away, behind Contact seller (checked in "contact seller"). */
          expect(/Questions about this order\?/.test(help) && /Contact seller/.test(help), "the help line offers Contact seller", help)
          expect(/30-day money back guarantee/.test(help), "the refund policy", help)
        }
        if (which === "refunded") {
          const text = await page.evaluate(() => document.querySelector("[data-receipt]")?.textContent || "")
          expect(/This order was refunded/.test(text), "the headline says it was refunded", text.slice(0, 120))
          expect(/Refunded, files closed/.test(text), "the line says its files are closed", text.slice(0, 400))
          expect(rows.length === 0 && !(await page.$("[data-receipt-file] button")), "no Download is offered")
          const totals = await page.evaluate(() => document.querySelector("[data-receipt-totals]")?.textContent || "")
          expect(/Refunded−\$24\.00/.test(totals), "the refund is in the totals", totals)
        }
        const seller = await page.evaluate(() => {
          const a = document.querySelector("[data-seller-link]")
          if (!a) return null
          const r = a.getBoundingClientRect()
          const img = a.querySelector("img, [data-avatar], span")
          return { href: a.getAttribute("href"), h: Math.round(r.height), bg: getComputedStyle(a).backgroundColor, dur: getComputedStyle(a).transitionDuration, props: getComputedStyle(a).transitionProperty, left: Math.round((img?.getBoundingClientRect().left ?? 0) - (document.querySelector("header")?.getBoundingClientRect().left ?? 0)) }
        })
        expect(!!seller && seller.href === "https://storelib.com/andrewrullz", "the seller's photo and name link to their page", JSON.stringify(seller))
        expect(!!seller && seller.h >= 44, "and are a 44px target", JSON.stringify(seller))
        expect(!!seller && /rgba\(0, 0, 0, 0\)|transparent/.test(seller.bg), "with no pill until a pointer arrives", seller?.bg)
        expect(!!seller && /0\.15s/.test(seller.dur) && /background-color/.test(seller.props), "the pill fades in over 150ms", JSON.stringify(seller))
        expect(!!seller && Math.abs(seller.left) <= 1, "the photo stays on the page's edge", JSON.stringify(seller))
        const contact = await page.evaluate(() => [...document.querySelectorAll("[data-receipt-contact] button")].find((b) => /Contact seller/.test(b.textContent || ""))?.getBoundingClientRect().height ?? 0)
        expect(contact >= 36, "Contact seller is there and easy to press", String(contact))
        if (!SIGNED_OUT.has(which) && which !== "refunded") {
          const lib = await page.$("a[href='/library']")
          if (lib) {
            const before = await page.evaluate((a) => ({ shadow: getComputedStyle(a).boxShadow, arrow: a.querySelector("[data-arrow]")?.getBoundingClientRect().left ?? 0 }), lib)
            await lib.hover()
            await wait(350)
            const after = await page.evaluate((a) => ({ shadow: getComputedStyle(a).boxShadow, arrow: a.querySelector("[data-arrow]")?.getBoundingClientRect().left ?? 0 }), lib)
            expect(before.shadow !== "none", "the library row has a raised surface", before.shadow)
            if (label === "1440") expect(after.arrow - before.arrow >= 1.5, "its arrow moves on hover", `${before.arrow} -> ${after.arrow}`)
          } else expect(false, "the library row is there")
        }
      }
      await page.close()
    }
  }

  if (!SHOTS_ONLY) {
    /* ── Download: pending, a real download, and a refusal ─────────────── */
    console.log("\ndownload")
    for (const [label, viewport] of VIEWPORTS) {
      const page = await open(viewport, "free")
      const cdp = await page.createCDPSession()
      await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: join(root, ".receipt-downloads"), eventsEnabled: true })
      let began = null
      cdp.on("Browser.downloadWillBegin", (e) => { began = e })
      asked.length = 0
      answer.download = "ok"
      const btn = await page.$("[data-receipt-file] button")
      await btn.click()
      await wait(200)
      const pending = await page.evaluate((b) => ({ text: b.textContent, busy: b.getAttribute("aria-busy"), disabled: b.disabled }), btn)
      expect(/Preparing/.test(pending.text) && pending.disabled, `${label}: pending while the link is fetched`, JSON.stringify(pending))
      await wait(1200)
      const call = asked.find((a) => a.path.startsWith("/api/download/"))
      expect(!!call && call.path.endsWith(`/f0000000-0000-4000-8000-000000000001`) && /receipt=rcpt_/.test(call.query), `${label}: asks the download route with the receipt token`, JSON.stringify(call))
      expect(!!began && /\/files\/signed\.pdf$/.test(began.url), `${label}: the browser starts the download`, JSON.stringify(began))
      const doneText = await page.evaluate((b) => b.textContent, btn)
      expect(/Downloaded/.test(doneText), `${label}: then says Downloaded`, doneText)

      answer.download = "refused"
      await wait(3200)
      await btn.click()
      await wait(1100)
      const err = await page.evaluate(() => document.querySelector("[data-receipt-file] [role=alert]")?.textContent || "")
      expect(/refunded/.test(err), `${label}: a refusal shows the server's words`, err)
      await page.close()
    }

    /* ── The file opens in a tab of its own, the receipt stays ─────────── */
    /*
     * The owner's report: "it downloads it, then opens it, it opens in the
     * same receipt page, and the receipt page completely disappears."
     * The address is on storage's origin and `download` is ignored across
     * origins, so the click was a plain navigation. Here the file lives on
     * a second port, which is a second origin, and the run asserts the page
     * the buyer is on never moves.
     */
    console.log("\nthe receipt survives a download from another origin")
    const browserCdp = await browser.target().createCDPSession()
    await browserCdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: join(root, ".receipt-downloads"), eventsEnabled: true })
    for (const [label, viewport] of VIEWPORTS) {
      const page = await open(viewport, "free")
      let began = null
      const onBegin = (e) => { began = e }
      browserCdp.on("Browser.downloadWillBegin", onBegin)
      const tabs = []
      const onTarget = (t) => { if (t.type() === "page") tabs.push(t.url()) }
      browser.on("targetcreated", onTarget)
      fileAsks.length = 0
      asked.length = 0
      answer.download = "cross"
      const was = page.url()
      const btn = await page.$("[data-receipt-file] button")
      await btn.click()
      await wait(2200)
      browser.off("targetcreated", onTarget)
      browserCdp.off("Browser.downloadWillBegin", onBegin)

      expect(page.url() === was, `${label}: the receipt's address never changed`, `${was} -> ${page.url()}`)
      const alive = await page.evaluate(() => ({
        receipt: !!document.querySelector("[data-receipt]"),
        files: document.querySelectorAll("[data-receipt-file]").length,
        head: document.querySelector("h1")?.textContent || "",
        totals: !!document.querySelector("[data-receipt-totals]"),
      }))
      expect(alive.receipt && alive.files > 0 && alive.totals && /Thanks/.test(alive.head), `${label}: the receipt is still drawn, files and all`, JSON.stringify(alive))
      /* Changed on purpose: the empty tab opened for the file showed the owner a blank about:blank page. The file now saves where the button is. */
      expect(tabs.length === 0, `${label}: no tab and no about:blank, the file saves where the button is`, JSON.stringify(tabs))
      const note = await page.evaluate(() => !!document.querySelector("[data-download-open]"))
      expect(!note, `${label}: an attachment needs no note`, note)
      const got = fileAsks.find((a) => a.path === "/files/signed.pdf")
      expect(!!got && /download=signed\.pdf/.test(got.query), `${label}: the file was asked for with the name storage answers as an attachment`, JSON.stringify(got))
      expect(!!began && began.suggestedFilename === "signed.pdf" && began.url.startsWith(filesBase), `${label}: it came back as an attachment and was saved, not drawn`, JSON.stringify(began && { url: began.url, name: began.suggestedFilename }))
      const doneText = await page.evaluate((b) => b.textContent, btn)
      expect(/Downloaded/.test(doneText), `${label}: the row says Downloaded`, doneText)
      const said = (logs.get(page) ?? []).filter((l) => !/Download the React DevTools/.test(l))
      expect(said.length === 0, `${label}: nothing in the console`, said.slice(0, 3).join(" | "))
      await page.close()
    }

    /*
     * AND THE OWNER'S CASE EXACTLY. A file that comes back without the
     * attachment header is drawn by the browser rather than saved. Before
     * this fix that drawing happened in the receipt's own tab and took the
     * receipt with it. The header is asked for on every signed address the
     * server makes, but the page must not depend on getting it.
     */
    console.log("\nand when the file comes back drawable")
    for (const [label, viewport] of VIEWPORTS) {
      const page = await open(viewport, "free")
      const tabs = []
      const onTarget = (t) => { if (t.type() === "page") tabs.push(t.url()) }
      browser.on("targetcreated", onTarget)
      answer.download = "inline"
      const was = page.url()
      await (await page.$("[data-receipt-file] button")).click()
      await wait(2000)
      browser.off("targetcreated", onTarget)
      expect(page.url() === was, `${label}: the receipt's address never changed`, `${was} -> ${page.url()}`)
      const alive = await page.evaluate(() => ({
        receipt: !!document.querySelector("[data-receipt]"),
        files: document.querySelectorAll("[data-receipt-file]").length,
        head: document.querySelector("h1")?.textContent || "",
      }))
      expect(alive.receipt && alive.files > 0 && /Thanks/.test(alive.head), `${label}: the receipt is still there, the PDF did not take its place`, JSON.stringify(alive))
      expect(tabs.length === 0, `${label}: nothing opened by itself`, JSON.stringify(tabs))
      const drawnNote = await page.evaluate(() => {
        const box = document.querySelector("[data-download-open]")
        const a = box?.querySelector("a")
        const r = a?.getBoundingClientRect()
        return box ? { text: box.textContent, href: a?.getAttribute("href"), target: a?.getAttribute("target"), onScreen: !!r && r.height >= 32 && r.bottom <= window.innerHeight && r.right <= window.innerWidth } : null
      })
      expect(!!drawnNote && /signed\.pdf is ready to open/.test(drawnNote.text || "") && drawnNote.href.startsWith(filesBase) && drawnNote.target === "_blank" && drawnNote.onScreen, `${label}: the drawn file is one press away, on the buyer's own press`, JSON.stringify(drawnNote))
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-free-${label}-drawable.png`), fullPage: false })
      await page.close()
    }

    /*
     * AND WITH POP-UPS BLOCKED OUTRIGHT. window.open answers null for some
     * people. There is no pop-up any more, so nothing changes for them.
     */
    console.log("\nwith pop-ups blocked")
    for (const [label, viewport] of VIEWPORTS) {
      const page = await open(viewport, "free")
      await page.evaluate(() => { window.open = () => { window.__opened = (window.__opened || 0) + 1; return null } })
      let began = null
      const onBegin = (e) => { began = e }
      browserCdp.on("Browser.downloadWillBegin", onBegin)
      answer.download = "cross"
      const was = page.url()
      await (await page.$("[data-receipt-file] button")).click()
      await wait(1600)
      browserCdp.off("Browser.downloadWillBegin", onBegin)
      const opened = await page.evaluate(() => window.__opened || 0)
      expect(page.url() === was && opened === 0, `${label}: window.open is never called, the address never changes`, { opened, url: page.url() })
      expect(!!began && began.suggestedFilename === "signed.pdf", `${label}: and the file is saved all the same`, began && began.suggestedFilename)
      const row = await page.evaluate(() => document.querySelector("[data-receipt-file] [role=alert]")?.textContent || "")
      expect(row === "", `${label}: with nothing to apologise for next to the file`, row)
      await page.close()
    }
    answer.download = "ok"
    rmSync(join(root, ".receipt-downloads"), { recursive: true, force: true })

    /* ── Resend and Wrong address ──────────────────────────────────────── */
    console.log("\nresend and wrong address")
    {
      const page = await open(VIEWPORTS[0][1], "guest")
      asked.length = 0
      answer.resend = "ok"
      const resend = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Resend"))
      const resendStyle = await page.evaluate((b) => ({ color: getComputedStyle(b).color, h: b.getBoundingClientRect().height }), resend)
      expect(!/139, 92, 246|124, 58, 237|109, 40, 217/.test(resendStyle.color), "Resend is not violet", resendStyle.color)
      await resend.click()
      await wait(100)
      const sending = await page.evaluate((b) => b.textContent, resend)
      expect(/Sending/.test(sending), "Resend says Sending while it waits", sending)
      await wait(600)
      const call = asked.find((a) => a.path === "/api/receipt/resend")
      expect(!!call && call.body.orderId === "1be1ac18-0000-4000-8000-000000000001" && call.body.receiptToken?.startsWith("rcpt_") && call.body.resendType === "buyer" && call.body.to === undefined,
        "posts the order id, its token and resendType buyer, to the order's address", JSON.stringify(call?.body))
      const note = await page.evaluate(() => document.querySelector("[data-receipt-email] [role=status]")?.textContent || "")
      expect(/Sent/.test(note), "says Sent", note)

      answer.resend = "limited"
      await resend.click()
      await wait(700)
      const limitNote = await page.evaluate(() => document.querySelector("[data-receipt-email] [role=status]")?.textContent || "")
      expect(/5 times today/.test(limitNote), "a limit shows the server's words", limitNote)

      asked.length = 0
      const wrong = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => /Wrong address/.test(b.textContent || "")))
      await wrong.click()
      await wait(100)
      const input = await page.$("#receipt-new-email")
      expect(!!input, "Wrong address opens a field for the right one")
      await input.type("ghita@example.com")
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send here")?.click())
      await wait(700)
      const change = asked.find((a) => a.path === "/api/receipt/update-email")
      expect(!!change && change.body.newEmail === "ghita@example.com" && change.body.receiptToken?.startsWith("rcpt_"), "posts the new address with the token", JSON.stringify(change?.body))
      const changed = await page.evaluate(() => document.querySelector("[data-receipt-email] [role=status]")?.textContent || "")
      expect(/ghita@example\.com/.test(changed), "and says where it went", changed)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-guest-390-email-changed.png"), fullPage: true })
      await page.close()
    }
    {
      /* An order on an account, signed out: the route would refuse a token
         change and a copy needs the account, so it says how. This pin used
         to read "account settings"; that page could not change where Resend
         sent (Resend used the order's address), so it now asks to sign in. */
      const page = await open(VIEWPORTS[1][1], "signedout")
      asked.length = 0
      const first = await page.evaluate(() => document.querySelector("[data-receipt-email]")?.textContent || "")
      expect(/Receipt emailed to na••••@gmail\.com/.test(first), "signed out, the order's masked address", first)
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Wrong address/.test(b.textContent || ""))?.click())
      await wait(200)
      const text = await page.evaluate(() => document.querySelector("[data-receipt-email]")?.textContent || "")
      expect(!(await page.$("#receipt-new-email")), "an account's order does not offer a form the server refuses")
      expect(/This order is on an account\. Sign in to send a copy somewhere else\./.test(text), "it says to sign in", text)
      const signIn = await page.evaluate(() => document.querySelector("[data-receipt-email] a")?.getAttribute("href") || "")
      expect(/^\/login\?redirect=%2Freceipt%2F/.test(signIn), "and Sign in comes back to this receipt", signIn)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-signedout-1440-wrong-address.png"), fullPage: false })
      await page.close()
    }
    for (const [label, viewport] of VIEWPORTS) {
      /* The buyer's own account: Resend to the account email, or a copy elsewhere. */
      const page = await open(viewport, "free")
      asked.length = 0
      answer.resend = "ok"
      const first = await page.evaluate(() => document.querySelector("[data-receipt-email]")?.textContent || "")
      expect(/Receipt goes to ghita\.nastase@gmail\.com/.test(first), `${label}: the buyer's account email is named`, first)
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Resend")?.click())
      await wait(700)
      const call = asked.find((a) => a.path === "/api/receipt/resend")
      expect(!!call && call.body.to === "account" && call.body.resendType === "buyer" && call.body.receiptToken?.startsWith("rcpt_"), `${label}: Resend asks for the account email`, JSON.stringify(call?.body))
      expect(!(await page.$("#receipt-new-email")), `${label}: no field until asked`)
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Send a copy to another email/.test(b.textContent || ""))?.click())
      await wait(250)
      const input = await page.$("#receipt-new-email")
      expect(!!input, `${label}: Send a copy opens a field`)
      const hint = await page.evaluate(() => document.querySelector("[data-receipt-email]")?.textContent || "")
      expect(/Only this copy goes there/.test(hint) && /Settings/.test(hint), `${label}: says it is one copy and where the account email is changed`, hint)
      const settings = await page.evaluate(() => [...document.querySelectorAll("[data-receipt-email] a")].map((a) => a.getAttribute("href")))
      expect(settings.includes("/account/settings"), `${label}: Settings is the buyer's settings (/account/settings)`, JSON.stringify(settings))
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-free-${label}-copy-open.png`), fullPage: label === "390" })
      asked.length = 0
      answer.copy = "ok"
      await input.type("work@studio.example")
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send copy")?.click())
      await wait(150)
      const pending = await page.evaluate(() => [...document.querySelectorAll("[data-receipt-email] button")].map((b) => b.textContent).join("|"))
      expect(/Sending/.test(pending), `${label}: Send copy says Sending while it waits`, pending)
      await wait(600)
      const copy = asked.find((a) => a.path === "/api/receipt/send-copy")
      expect(!!copy && copy.body.email === "work@studio.example" && copy.body.orderId === "1be1ac18-0000-4000-8000-000000000001" && copy.body.receiptToken?.startsWith("rcpt_"),
        `${label}: posts the address, the order id and its token`, JSON.stringify(copy?.body))
      const sent = await page.evaluate(() => document.querySelector("[data-receipt-email] [role=status]")?.textContent || "")
      expect(/Copy sent to work@studio\.example/.test(sent), `${label}: and says where the copy went`, sent)
      expect(!(await page.$("#receipt-new-email")), `${label}: the field closes`)
      if (label === "1440") {
        answer.copy = "limited"
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Send a copy to another email/.test(b.textContent || ""))?.click())
        await wait(200)
        await page.type("#receipt-new-email", "work@studio.example")
        await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send copy")?.click())
        await wait(700)
        const limited = await page.evaluate(() => document.querySelector("[data-receipt-email] [role=status]")?.textContent || "")
        expect(/A copy was just sent/.test(limited), "a refused copy shows the server's words", limited)
        await page.type("#receipt-new-email", "x")
        await page.evaluate(() => { const i = document.querySelector("#receipt-new-email"); i.value = "" })
      }
      await page.close()
    }

    /* ── Contact seller ────────────────────────────────────────────────── */
    console.log("\ncontact seller")
    for (const [label, viewport] of VIEWPORTS) {
      const page = await open(viewport, "paid")
      await browser.defaultBrowserContext().overridePermissions(base, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"])
      expect(!(await page.$("#receipt-contact")), `${label}: closed until asked`)
      await page.evaluate(() => [...document.querySelectorAll("[data-receipt-contact] button")].find((b) => /Contact seller/.test(b.textContent || ""))?.click())
      await wait(300)
      const panel = await page.evaluate(() => {
        const p = document.querySelector("#receipt-contact")
        const mail = p?.querySelector("a[href^='mailto:']")
        const btn = [...document.querySelectorAll("[data-receipt-contact] button")].find((b) => /Contact seller/.test(b.textContent || ""))
        return { text: p?.textContent || "", mailto: mail?.getAttribute("href") || "", expanded: btn?.getAttribute("aria-expanded"), opacity: p ? getComputedStyle(p).opacity : "" }
      })
      expect(/help@andrewrullz\.com/.test(panel.text), `${label}: the seller's support address`, panel.text)
      expect(panel.mailto === "mailto:help@andrewrullz.com?subject=Order%201BE1AC18", `${label}: Write email opens mail with the order number as the subject`, panel.mailto)
      expect(panel.expanded === "true", `${label}: the button says it is open`, panel.expanded)
      expect(panel.opacity === "1", `${label}: the panel has faded in`, panel.opacity)
      await page.evaluate(() => [...document.querySelectorAll("#receipt-contact button")].find((b) => /Copy/.test(b.textContent || ""))?.click())
      await wait(200)
      const clip = await page.evaluate(async () => { try { return await navigator.clipboard.readText() } catch (e) { return "unreadable: " + e } })
      const copied = await page.evaluate(() => document.querySelector("#receipt-contact")?.textContent || "")
      expect(clip === "help@andrewrullz.com", `${label}: Copy puts the address on the clipboard`, clip)
      expect(/Copied/.test(copied), `${label}: and says Copied`, copied)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-paid-${label}-contact.png`), fullPage: label === "390" })
      await page.close()
    }
    for (const [label, viewport] of VIEWPORTS) {
      /* No support address: a form, sent through Storelib to the seller. */
      const page = await open(viewport, "nosupport")
      await page.evaluate(() => [...document.querySelectorAll("[data-receipt-contact] button")].find((b) => /Contact seller/.test(b.textContent || ""))?.click())
      await wait(300)
      const field = await page.$("#receipt-contact-message")
      expect(!!field, `${label}: a message field`)
      const panel = await page.evaluate(() => document.querySelector("#receipt-contact")?.textContent || "")
      expect(!/@andrewrullz/.test(panel) && /They reply to na••••@gmail\.com/.test(panel), `${label}: no seller address, and where the reply goes`, panel)
      const empty = await page.evaluate(() => { document.querySelector("#receipt-contact form button[type=submit]")?.click(); return true })
      await wait(100)
      const emptyNote = await page.evaluate(() => document.querySelector("#receipt-contact [role=alert]")?.textContent || "")
      expect(empty && /Write a message first/.test(emptyNote), `${label}: an empty message is caught before it is sent`, emptyNote)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-nosupport-${label}-contact.png`), fullPage: label === "390" })
      asked.length = 0
      answer.contact = "ok"
      await field.type("Hi, the zip will not open on my Mac. Can you help?")
      await page.evaluate(() => document.querySelector("#receipt-contact form button[type=submit]")?.click())
      await wait(150)
      const sending = await page.evaluate(() => document.querySelector("#receipt-contact form button[type=submit]")?.textContent || "")
      expect(/Sending/.test(sending), `${label}: says Sending while it waits`, sending)
      await wait(600)
      const call = asked.find((a) => a.path === "/api/receipt/contact")
      expect(!!call && /zip will not open/.test(call.body.message) && call.body.orderId === "1be1ac18-0000-4000-8000-000000000001" && call.body.receiptToken?.startsWith("rcpt_"),
        `${label}: posts the message, the order id and its token`, JSON.stringify(call?.body))
      const sent = await page.evaluate(() => document.querySelector("#receipt-contact [role=status]")?.textContent || "")
      expect(/Sent to AndrewRullz\. They reply to na••••@gmail\.com\./.test(sent), `${label}: then says Sent and where the reply goes`, sent)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-nosupport-${label}-contact-sent.png`), fullPage: false })
      await page.close()
    }
    {
      const page = await open(VIEWPORTS[1][1], "nosupport")
      await page.evaluate(() => [...document.querySelectorAll("[data-receipt-contact] button")].find((b) => /Contact seller/.test(b.textContent || ""))?.click())
      await wait(300)
      answer.contact = "limited"
      await page.type("#receipt-contact-message", "Following up on my order.")
      await page.evaluate(() => document.querySelector("#receipt-contact form button[type=submit]")?.click())
      await wait(700)
      const err = await page.evaluate(() => document.querySelector("#receipt-contact [role=alert]")?.textContent || "")
      expect(/5 times today/.test(err), "a refused message shows the server's words", err)
      expect(!!(await page.$("#receipt-contact-message")), "and keeps what was written", "")
      const kept = await page.evaluate(() => document.querySelector("#receipt-contact-message")?.value || "")
      expect(/Following up/.test(kept), "the text is still there to send again", kept)
      answer.contact = "ok"
      await page.close()
    }

    /* ── The seller's name: hover, press, keyboard ─────────────────────── */
    console.log("\nseller link")
    {
      const page = await open(VIEWPORTS[1][1], "free")
      const link = await page.$("[data-seller-link]")
      const bg = () => page.evaluate((a) => getComputedStyle(a).backgroundColor, link)
      const before = await bg()
      await link.hover()
      await wait(60)
      const mid = await bg()
      await wait(250)
      const after = await bg()
      expect(/rgba\(0, 0, 0, 0\)/.test(before) && after === "rgb(234, 236, 240)", "hover fades a light grey pill in", `${before} -> ${mid} -> ${after}`)
      expect(mid !== after || mid === "rgb(234, 236, 240)", "on its way there it is in between (a fade, not a jump)", `${mid}`)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-free-1440-seller-hover.png"), clip: { x: 360, y: 0, width: 720, height: 220 } })
      const top = await page.evaluate((a) => a.getBoundingClientRect().top, link)
      await page.mouse.down()
      await wait(200)
      const pressed = await page.evaluate((a) => ({ top: a.getBoundingClientRect().top, bg: getComputedStyle(a).backgroundColor }), link)
      await page.mouse.move(0, 0)
      await page.mouse.up()
      expect(pressed.top - top >= 0.9 && pressed.bg === "rgb(227, 230, 234)", "a press sinks it a pixel and darkens it a little", JSON.stringify({ top, pressed }))
      await page.close()
    }
    {
      const page = await open(VIEWPORTS[1][1], "free")
      await page.keyboard.press("Tab")
      await wait(200)
      const focus = await page.evaluate(() => {
        const a = document.activeElement
        return { seller: a?.hasAttribute("data-seller-link"), shadow: a ? getComputedStyle(a).boxShadow : "" }
      })
      expect(focus.seller && focus.shadow !== "none", "Tab reaches it first and rings it", JSON.stringify(focus))
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-free-1440-seller-focus.png"), clip: { x: 360, y: 0, width: 720, height: 220 } })
      await page.close()
    }
    {
      /* A phone: no hover (its sheet keeps hover rules closed), a press
         still answers. Headless Chromium never sets :active for an emulated
         touch (it waits for a gesture that never comes), so the press is a
         pointer press at phone size. On iOS, :active needs a touchstart
         listener on the document, which components/platform/stuck-layer-guard adds. */
      const page = await open(VIEWPORTS[0][1], "free")
      const box = await page.evaluate(() => { const r = document.querySelector("[data-seller-link]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height } })
      const idle = await page.evaluate(() => getComputedStyle(document.querySelector("[data-seller-link]")).backgroundColor)
      await page.mouse.move(box.x, box.y)
      await page.mouse.down()
      await wait(200)
      const touched = await page.evaluate(() => getComputedStyle(document.querySelector("[data-seller-link]")).backgroundColor)
      await page.mouse.up()
      expect(/rgba\(0, 0, 0, 0\)/.test(idle), "390: no hover pill on a phone", idle)
      expect(touched === "rgb(227, 230, 234)", "390: a press shows the pressed pill", touched)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-free-390-top.png"), clip: { x: 0, y: 0, width: 390, height: 260 } })
      await page.close()
    }

    /* ── Rendered on a server, hydrated in the browser ─────────────────── */
    console.log("\nhydration")
    {
      /* First, that this pass can fail: the server draws one order and the
         browser hydrates another. React must say so. */
      const page = await open(VIEWPORTS[1][1], "free", undefined, { ssr: true, ssrcase: "paid" })
      await wait(300)
      const said = logs.get(page) ?? []
      expect(said.some((l) => /hydrat/i.test(l)), "a planted mismatch is reported (the check can fail)", said.slice(0, 2).join(" | "))
      await page.close()
    }
    for (const [label, viewport] of VIEWPORTS) {
      for (const which of CASES) {
        const page = await open(viewport, which, undefined, { ssr: true })
        await wait(300)
        const said = (logs.get(page) ?? []).filter((l) => !/Download the React DevTools/.test(l))
        const hydrated = await page.evaluate(() => !!document.querySelector("[data-receipt]"))
        expect(hydrated && said.length === 0, `${which} at ${label}: hydrates with nothing in the console`, said.slice(0, 3).join(" | "))
        await page.close()
      }
    }

    /* ── Review ────────────────────────────────────────────────────────── */
    console.log("\nreview")
    for (const [label, viewport] of VIEWPORTS) {
      const page = await open(viewport, "free")
      const avatar = await page.evaluate(() => {
        const card = document.querySelector("#review")
        const img = card?.querySelector("img")
        return { src: img?.getAttribute("src") || "", text: card?.textContent || "" }
      })
      expect(/buyer\.png$/.test(avatar.src), `${label}: the buyer's own photo`, avatar.src)
      const stars = await page.$$("#review [data-star]")
      expect(stars.length === 5, `${label}: five stars`)
      if (label === "1440") {
        await stars[3].hover()
        await wait(250)
        const lit = await page.evaluate(() => [...document.querySelectorAll("#review [data-star]")].map((s) => s.getAttribute("data-lit")))
        expect(lit.join() === "true,true,true,true,false", "hover fills up to the star", lit.join())
      }
      await stars[4].click()
      await page.mouse.move(0, 0)
      await wait(250)
      const chosen = await page.evaluate(() => ({
        lit: [...document.querySelectorAll("#review [data-star]")].map((s) => s.getAttribute("data-lit")).join(),
        pressed: [...document.querySelectorAll("#review [data-star]")].map((s) => s.getAttribute("aria-checked")).join(),
      }))
      expect(chosen.lit === "true,true,true,true,true" && /true/.test(chosen.pressed), `${label}: a press keeps five`, JSON.stringify(chosen))
      await page.type("#review textarea", "Clean files and quick to set up.")
      asked.length = 0
      answer.review = "ok"
      await page.evaluate(() => [...document.querySelectorAll("#review button")].find((b) => /Post review/i.test(b.textContent || ""))?.click())
      await wait(100)
      const posting = await page.evaluate(() => document.querySelector("#review")?.textContent || "")
      expect(/Posting/.test(posting), `${label}: says Posting while it waits`, posting.slice(0, 120))
      await wait(600)
      const post = asked.find((a) => a.path === "/api/reviews" && a.method === "POST")
      expect(!!post && post.body.rating === 5 && /Clean files/.test(post.body.content) && post.body.productId, `${label}: posts the rating and text`, JSON.stringify(post?.body))
      const thanks = await page.evaluate(() => document.querySelector("#review")?.textContent || "")
      expect(/Thanks for your review|Review posted/i.test(thanks), `${label}: then thanks the buyer`, thanks.slice(0, 160))
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-free-${label}-reviewed.png`), fullPage: true })
      await page.close()
    }
    {
      const page = await open(VIEWPORTS[1][1], "free")
      const stars = await page.$$("#review [data-star]")
      await stars[2].click()
      await page.type("#review textarea", "Good value for the price.")
      answer.review = "conflict"
      await page.evaluate(() => [...document.querySelectorAll("#review button")].find((b) => /Post review/i.test(b.textContent || ""))?.click())
      await wait(700)
      const err = await page.evaluate(() => document.querySelector("#review [role=alert]")?.textContent || "")
      expect(/already reviewed/.test(err), "a refusal says why", err)
      await page.close()
    }
    {
      /* The signed-in person has not got this order on their account yet. */
      const page = await open(VIEWPORTS[0][1], "free", { isLoggedIn: true, hasPurchased: false, hasReviewed: false })
      const text = await page.evaluate(() => document.querySelector("#review")?.textContent || "")
      expect(!/Post review/.test(text), "no form is offered that the server would refuse", text.slice(0, 160))
      await page.close()
    }
    {
      const page = await open(VIEWPORTS[0][1], "guest")
      const text = await page.evaluate(() => document.querySelector("#review")?.textContent || "")
      /* Changed on purpose: the receipt token proves the purchase, so a guest posts from here without an account
         (components/reviews/receipt-review, the review request email lands here). Asking with the token is pinned too. */
      expect(/Post review/.test(text) && !/Sign in to post/.test(text), "a guest posts from the receipt link without signing in", text.slice(0, 200))
      expect(asked.some((a) => a.path === "/api/reviews/check" && /receiptToken=/.test(a.query)), "the card asks with the line's receipt token")
      const initial = await page.evaluate(() => document.querySelector("#review [data-reviewer]")?.textContent?.trim() || "")
      expect(initial === "GH", "a guest's card shows their initials on a neutral circle (AppAvatar's two letters)", initial)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-guest-390-review.png"), fullPage: true })
      await page.close()
    }
  }

  /* ── Phones from 360 to 430, and the skeleton laid over the page ──────
     The owner: "not mobile responsive, the buttons misaligned, the loading
     structure feels cheap". At every phone width: nothing sideways, every
     file's Download the same size and centred on its row, the whole file
     name readable where it fits, the price beside the first line of the
     name. Then the route's skeleton is drawn at the same width and its
     parts are measured against the real ones. */
  if (!SHOTS_ONLY) {
    console.log("\nphone widths and the skeleton")
    for (const width of [360, 390, 430, 1280]) {
      const vp = { width, height: 860, isMobile: width < 640, hasTouch: width < 640, deviceScaleFactor: 2 }
      const page = await open(vp, "multi")
      const m = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-receipt-file]")]
        const btns = rows.map((r) => {
          const b = r.querySelector("[data-receipt-download]").getBoundingClientRect()
          const line = r.firstElementChild.getBoundingClientRect()
          return { w: Math.round(b.width), h: Math.round(b.height), off: Math.round(Math.abs(b.top + b.height / 2 - (line.top + line.height / 2))), right: Math.round(b.right) }
        })
        const cut = rows.filter((r) => { const h = r.querySelector("[data-name-head]"); return h.scrollWidth > h.clientWidth + 1 }).length
        const head = document.querySelector("[data-item-head]")
        const title = head.querySelector("p").getBoundingClientRect()
        const price = head.lastElementChild.getBoundingClientRect()
        const card = document.querySelector("[data-receipt-items]").getBoundingClientRect()
        const help = document.querySelector("[data-receipt-contact] button").getBoundingClientRect()
        return { over: document.documentElement.scrollWidth - window.innerWidth, btns, cut, priceOff: Math.round(Math.abs(price.top - title.top)), cardRight: Math.round(card.right), helpRight: Math.round(help.right), cardTop: Math.round(card.top) }
      })
      expect(m.over <= 0, `${width}: nothing wider than the screen`, m.over)
      expect(new Set(m.btns.map((b) => `${b.w}x${b.h}`)).size === 1 && new Set(m.btns.map((b) => b.right)).size === 1 && m.btns.every((b) => b.off <= 1), `${width}: every Download one size, one right edge, centred on its row`, m.btns)
      expect(width < 400 || m.cut === 0, `${width}: every file name whole`, m.cut)
      expect(m.priceOff <= 3, `${width}: the price sits beside the name's first line`, m.priceOff)
      expect(Math.abs(m.helpRight - m.cardRight) <= 1, `${width}: Contact seller lines up with the cards' edge`, { help: m.helpRight, card: m.cardRight })
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `receipt-multi-${width}.png`), fullPage: true })
      await page.close()

      const sk = await open(vp, "loading")
      await wait(700)
      const k = await sk.evaluate(() => {
        const main = document.querySelector("[data-receipt-loading]")
        const cards = [...main.querySelectorAll(".rounded-2xl")].map((c) => c.getBoundingClientRect())
        return { opacity: getComputedStyle(main).opacity, over: document.documentElement.scrollWidth - window.innerWidth, cardTop: Math.round(cards[0].top), cardRight: Math.round(cards[0].right) }
      })
      expect(k.opacity === "1" && k.over <= 0, `${width}: the skeleton shows (after its short wait) and fits`, k)
      expect(Math.abs(k.cardTop - m.cardTop) <= 12 && Math.abs(k.cardRight - m.cardRight) <= 1, `${width}: its order card sits where the real one lands`, { skeleton: k.cardTop, page: m.cardTop })
      if (SHOTS) await sk.screenshot({ path: join(SHOTS, `receipt-loading-${width}.png`) })
      await sk.close()
    }
  }
} finally {
  await browser.close()
  server.close()
  fileServer.close()
}

if (SHOTS_ONLY) console.log(`\npictures in ${SHOTS}`)
else {
  console.log(broken ? `\n${broken} failed` : "\nall held")
  if (broken) process.exit(1)
}
