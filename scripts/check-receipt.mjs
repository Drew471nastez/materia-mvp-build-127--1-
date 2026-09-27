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
 *                  tip, total, and the card; the help line names the
 *                  seller's address and the refund policy.
 *
 *   PROBE_CSS=source node scripts/check-receipt.mjs
 *   SHOTS=/some/dir PROBE_CSS=source node scripts/check-receipt.mjs
 *   SHOTS_ONLY=1 also skips the assertions (for a before picture).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
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
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
/*
 * This Chromium answers (hover: none) in headless mode whatever is emulated,
 * so Tailwind's hover rules (inside `@media (hover: hover)`) would never
 * apply. The computer-sized pages get the stylesheet with that condition
 * opened, which is what a mouse gets; the phone-sized ones keep it closed.
 */
const sheet = await appCss(root)
const mouseSheet = sheet.replace(/@media \(hover: ?hover\)/g, "@media all")
const pageHtml = (css) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
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
        if (answer.download === "ok") out = { success: true, downloadUrl: `${base}/files/signed.pdf`, fileName: "signed.pdf", expiresIn: 300 }
        else { status = 403; out = { error: "This order was refunded, so its files are closed.", reason: "refunded" } }
      } else if (url.pathname === "/api/receipt/resend") {
        delay = 400
        if (answer.resend === "ok") out = { success: true, remainingAttempts: 4 }
        else { status = 429; out = { error: "This receipt has been sent 5 times today. Try again tomorrow.", limitReached: true } }
      } else if (url.pathname === "/api/receipt/update-email") {
        delay = 400
        if (answer.change === "ok") out = { success: true }
        else { status = 403; out = { error: "The address can only be changed in the first week. Reply to your receipt email and the seller can help." } }
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
  res.end(url.searchParams.get("mouse") === "1" ? mouseHtml : html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

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
const CASES = ["free", "paid", "multi", "nofiles", "guest"]

async function open(viewport, which, reviewCheck) {
  answer.reviewCheck = reviewCheck ?? (which === "guest"
    ? { isLoggedIn: false, hasPurchased: false, hasReviewed: false }
    : { isLoggedIn: true, hasPurchased: true, hasReviewed: false, existingReview: null })
  const page = await browser.newPage()
  await page.setViewport(viewport)
  await page.goto(`${base}/receipt/x?case=${which}${viewport.hasTouch ? "" : "&mouse=1"}`, { waitUntil: "networkidle0" })
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
          expect(/help@andrewrullz\.com/.test(help), "the seller's address to write to", help)
          expect(/30-day money back guarantee/.test(help), "the refund policy", help)
        }
        if (which !== "guest") {
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
      expect(!!call && call.body.orderId === "1be1ac18-0000-4000-8000-000000000001" && call.body.receiptToken?.startsWith("rcpt_") && call.body.resendType === "buyer",
        "posts the order id, its token and resendType buyer", JSON.stringify(call?.body))
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
      /* An order already on an account: the route would refuse a token change. */
      const page = await open(VIEWPORTS[1][1], "free")
      asked.length = 0
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Wrong address/.test(b.textContent || ""))?.click())
      await wait(200)
      const text = await page.evaluate(() => document.querySelector("[data-receipt-email]")?.textContent || "")
      expect(!(await page.$("#receipt-new-email")), "an account's order does not offer a form the server refuses")
      expect(/account settings/i.test(text), "it says where the address is changed", text)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-free-1440-wrong-address.png"), fullPage: false })
      await page.close()
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
      expect(/Sign in/.test(text), "a guest is asked to sign in to post", text.slice(0, 200))
      const initial = await page.evaluate(() => document.querySelector("#review [data-reviewer]")?.textContent?.trim() || "")
      expect(initial === "G", "a guest's card shows their initial on a neutral circle", initial)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, "receipt-guest-390-review.png"), fullPage: true })
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}

if (SHOTS_ONLY) console.log(`\npictures in ${SHOTS}`)
else {
  console.log(broken ? `\n${broken} failed` : "\nall held")
  if (broken) process.exit(1)
}
