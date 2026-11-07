/**
 * PRODUCT SHEET TO INSTANT CHECKOUT, MEASURED (round AK).
 *
 * "Clicking Get It Free or Purchase opens checkout UNDER the product modal." The real OnePage product block, sheet
 * and checkout (scripts/render-onepage-checkout-stack.tsx) at a computer's width and a phone's, free, paid, with
 * variants, a product that ships, and inside the editor's preview. For each one:
 *
 *   stacking    from the frame the checkout enters the document, every frame for 700ms: the checkout's own head is
 *               what elementFromPoint finds, and the sheet is gone (not visible, or inert)
 *   backdrops   the most dimming layers on screen at once (Radix overlay, phone sheet scrim, checkout backdrop)
 *   focus       inside the checkout once it is up, and still inside after 12 Tabs and 12 Shift+Tabs
 *   scroll      the page's scrollY and width the same before the sheet, under the checkout and after it
 *   image       the checkout head shows the product's picture (its URL), not the creator's avatar
 *   bars        the edge columns of the checkout picture and of the sheet's first slide, sampled from a screenshot:
 *               the share of edge pixels that are the editor's light grey padding (0 is no bar)
 *   ways out    Escape and the browser's Back each close the checkout alone; the page is usable after (no hold on
 *               <html>, no pointer-events lock on <body>, no sheet left up); the checkout's Back reopens the sheet
 *
 *   PROBE_CSS=source CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/check-onepage-checkout-stack.mjs
 *   REPORT=1 prints the numbers without failing (to measure a version that is known to be broken).
 */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
if (process.env.SHOTS) mkdirSync(process.env.SHOTS, { recursive: true })
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-checkout-stack.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
}

/* The share of a strip of pixels that is the product editor's padding: light, all but colourless. */
async function barShare(page, rect, save) {
  if (!rect || rect.width < 4 || rect.height < 4) return null
  /* The screen as it is (viewport coordinates, whatever the page behind is scrolled to), cut to the frame in the page. */
  const png = await page.screenshot({ captureBeyondViewport: false, encoding: "base64" })
  if (save && process.env.SHOTS) writeFileSync(`${process.env.SHOTS}/${save}.png`, Buffer.from(png, "base64"))
  return page.evaluate(async (data, rect) => {
    const img = new Image()
    img.src = "data:image/png;base64," + data
    await img.decode()
    const k = img.naturalWidth / innerWidth
    const c = document.createElement("canvas")
    c.width = Math.round(rect.width * k)
    c.height = Math.round(rect.height * k)
    const ctx = c.getContext("2d")
    ctx.drawImage(img, rect.x * k, rect.y * k, rect.width * k, rect.height * k, 0, 0, c.width, c.height)
    const px = ctx.getImageData(0, 0, c.width, c.height).data
    /* A column in from each side and a row in from top and bottom, over the middle 70%: clear of rounded corners. */
    const inset = Math.max(2, Math.round(c.width * 0.03))
    const [y0, y1] = [Math.round(c.height * 0.15), Math.round(c.height * 0.85)]
    const [x0, x1] = [Math.round(c.width * 0.15), Math.round(c.width * 0.85)]
    let bar = 0
    let all = 0
    const look = (x, y) => {
      const i = (y * c.width + x) * 4
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]]
      all++
      if (Math.min(r, g, b) >= 214 && Math.max(r, g, b) - Math.min(r, g, b) <= 10) bar++
    }
    for (let y = y0; y < y1; y++) {
      look(inset, y)
      look(c.width - 1 - inset, y)
    }
    for (let x = x0; x < x1; x++) {
      look(x, inset)
      look(x, c.height - 1 - inset)
    }
    return Math.round((bar / all) * 1000) / 1000
  }, png, rect)
}

/* Visible dimming layers, counted. */
const BACKDROPS = `(() => {
  const seen = (e) => { if (!e || !e.isConnected) return false; const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest("[aria-hidden=true][data-app-sheet-rest]") }
  const list = [...document.querySelectorAll("[data-slot=dialog-overlay], [data-sheet-root] > div:first-child, [data-instant-checkout] > [aria-hidden]")]
  return list.filter(seen).length
})()`

const scenarios = []
for (const width of [1440, 390]) for (const price of ["free", "paid", "variants", "physical"]) scenarios.push({ width, price, preview: false })
scenarios.push({ width: 390, price: "paid", preview: true }, { width: 1440, price: "free", preview: true })

const rows = []
try {
  for (const { width, price, preview } of scenarios) {
    const name = `${width}px/${price}${preview ? "/preview" : ""}`
    if (process.env.ONLY && !name.startsWith(process.env.ONLY)) continue
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.setViewport({ width, height: 860, isMobile: width < 640, hasTouch: width < 640 })
    await page.evaluateOnNewDocument(() => {
      window.Stripe = () => ({
        _registerWrapper() {}, registerAppInfo() {},
        createToken: async () => ({}), createPaymentMethod: async () => ({}), confirmCardPayment: async () => ({}),
        paymentRequest: () => ({ canMakePayment: async () => null, on() {}, off() {} }),
        elements: () => ({ create: () => ({ mount() {}, on() {}, off() {}, destroy() {}, update() {} }), getElement: () => null, update() {} }),
      })
    })
    await page.goto(`${base}/app/probe?price=${price}${preview ? "&preview=1" : ""}`)
    await page.waitForSelector("[data-hero-header], [data-onepage-header], h1")
    await sleep(600)
    await page.evaluate(() => window.scrollTo(0, 40))
    await sleep(100)
    const before = await page.evaluate(() => ({ y: window.scrollY, w: document.documentElement.clientWidth }))
    const openSheet = async () => {
      const found = await page.evaluate(() => {
        const cta = [...document.querySelectorAll("a,button")].find((e) => e.textContent.includes("View guide"))
        cta?.click()
        return !!cta
      })
      if (!found) return false
      await page.waitForSelector("[data-product-sheet-buy]", { visible: true })
      await page.waitForFunction(() => document.querySelector("[data-product-sheet-strip] img")?.naturalWidth > 0)
      await sleep(700)
      return true
    }
    await openSheet()
    const row = { name }

    /* The sheet's first picture: bars inside its frame. */
    /* The first slide's frame, once the sheet has stopped moving. */
    const slideRect = () =>
      page.evaluate(() => {
        const el = document.querySelector("[data-product-sheet-strip] > *")
        const r = el?.getBoundingClientRect()
        return r ? { x: r.x, y: r.y, width: Math.min(r.width, innerWidth - r.x), height: Math.min(r.height, innerHeight - r.y) } : null
      })
    let slide = await slideRect()
    for (let i = 0; i < 20; i++) {
      await sleep(100)
      const next = await slideRect()
      if (next && slide && Math.abs(next.y - slide.y) < 0.5) break
      slide = next
    }
    row.sheetBars = await barShare(page, slide, `${width}-${price}${preview ? "-preview" : ""}-sheet`)

    if (price === "physical") {
      const buy = await page.$eval("[data-product-sheet-buy]", (e) => ({ tag: e.tagName, href: e.getAttribute("href") || "" }))
      row.physicalLink = buy.tag === "A" && /checkout|cart/.test(buy.href)
      check(row.physicalLink, `${name}: a product that ships buys on its website checkout (${JSON.stringify(buy)})`)
      check(row.sheetBars !== null && row.sheetBars < 0.02, `${name}: no bars in the sheet gallery (${row.sheetBars})`)
      rows.push(row)
      await page.close()
      continue
    }

    if (price === "variants") {
      await page.evaluate(() => [...document.querySelectorAll("[data-product-sheet] button")].find((e) => e.textContent.trim().startsWith("Deluxe"))?.click())
      await sleep(200)
    }

    /* From the frame the checkout enters: the stack, every frame for 700ms. */
    await page.evaluate((BACKDROPS) => {
      window.__stack = { frames: 0, notTop: 0, sheetVisible: 0, maxBackdrops: 0, firstFrame: null }
      const count = () => (0, eval)(BACKDROPS)
      let start = 0
      const sample = () => {
        const co = document.querySelector("[data-instant-checkout]")
        if (co) {
          if (!start) start = performance.now()
          const head = co.querySelector("[data-checkout-head]")
          const r = head?.getBoundingClientRect()
          const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 40)) : null
          const top = !!hit?.closest("[data-instant-checkout]")
          const sheets = [...document.querySelectorAll("[data-product-sheet]")].filter((e) => {
            const b = e.getBoundingClientRect()
            return e.getClientRects().length && b.top < innerHeight && b.bottom > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("[inert],[aria-hidden=true]")
          }).length
          const s = window.__stack
          s.frames++
          if (!top) s.notTop++
          if (sheets) s.sheetVisible++
          s.maxBackdrops = Math.max(s.maxBackdrops, count())
          if (!s.firstFrame) s.firstFrame = { top, sheets, bodyPointer: getComputedStyle(document.body).pointerEvents }
          if (performance.now() - start > 700) return
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }, BACKDROPS)
    const tapped = Date.now()
    await page.click("[data-product-sheet-buy]")
    await page.waitForSelector("[data-instant-checkout]", { timeout: 4000 }).catch(() => null)
    row.checkoutAfterMs = Date.now() - tapped
    await sleep(900)
    const stack = await page.evaluate(() => window.__stack)
    Object.assign(row, { frames: stack.frames, notTopFrames: stack.notTop, sheetVisibleFrames: stack.sheetVisible, maxBackdrops: stack.maxBackdrops })
    check(stack.frames > 0, `${name}: the checkout opened`)
    check(stack.notTop === 0, `${name}: the checkout is topmost in every frame (${stack.notTop}/${stack.frames} under something)`)
    check(stack.sheetVisible === 0, `${name}: the sheet is closed while the checkout shows (${stack.sheetVisible} frames)`)
    check(stack.maxBackdrops <= 1, `${name}: one backdrop at a time (${stack.maxBackdrops})`)

    const settled = await page.evaluate(() => {
      const co = document.querySelector("[data-instant-checkout]")
      return {
        focusIn: !!co && co.contains(document.activeElement),
        bodyPointer: getComputedStyle(document.body).pointerEvents,
        img: co?.querySelector("[data-checkout-head] img")?.getAttribute("src") || null,
        /* The picture's frame (the file inside it is larger: its padding is outside the frame). */
        imgRect: (() => { const img = co?.querySelector("[data-checkout-head] img"); const r = (img?.closest("[data-framed-picture]") ?? img)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null })(),
        product: window.__productImage,
        avatar: window.__avatar,
        text: co?.textContent || "",
      }
    })
    row.focusInside = settled.focusIn
    row.checkoutBars = await barShare(page, settled.imgRect, `${width}-${price}${preview ? "-preview" : ""}-checkout`)
    /* The page under the checkout, before any Tab (a keyboard focus move may scroll a page held still, as it should). */
    const under = await page.evaluate(() => ({ y: window.scrollY, w: document.documentElement.clientWidth }))
    check(settled.focusIn, `${name}: focus moves into the checkout`)
    let escaped = 0
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab")
      if (!(await page.evaluate(() => !!document.querySelector("[data-instant-checkout]")?.contains(document.activeElement)))) escaped++
    }
    await page.keyboard.down("Shift")
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab")
      if (!(await page.evaluate(() => !!document.querySelector("[data-instant-checkout]")?.contains(document.activeElement)))) escaped++
    }
    await page.keyboard.up("Shift")
    row.tabsOutside = escaped
    check(escaped === 0, `${name}: Tab stays inside the checkout (${escaped}/24 outside)`)

    row.image = settled.img === settled.product ? "product" : settled.img === settled.avatar ? "AVATAR" : settled.img ? "other" : "none"
    check(row.image === "product", `${name}: the checkout shows the product's picture (${row.image})`)
    check(row.checkoutBars !== null && row.checkoutBars < 0.02, `${name}: no bars in the checkout picture (${row.checkoutBars})`)
    check(row.sheetBars !== null && row.sheetBars < 0.02, `${name}: no bars in the sheet gallery (${row.sheetBars})`)
    if (price === "variants") check(settled.text.includes("$40"), `${name}: the checkout carries the chosen variant's price`)
    if (price === "paid") check(settled.text.includes("$25"), `${name}: the checkout carries the price`)
    if (price === "free") check(/free/i.test(settled.text), `${name}: the checkout says it is free`)

    row.scrollJump = Math.abs(under.y - before.y)
    row.widthJump = Math.abs(under.w - before.w)

    /* Escape: the checkout alone closes, and the page is usable. */
    await page.keyboard.press("Escape")
    await sleep(700)
    const afterEscape = await page.evaluate(() => ({
      /* Read before the scroll test below moves the page and puts it back. */
      y: window.scrollY,
      checkout: !!document.querySelector("[data-instant-checkout]"),
      sheet: [...document.querySelectorAll("[data-product-sheet]")].some((e) => { const b = e.getBoundingClientRect(); return e.getClientRects().length && b.top < innerHeight && b.bottom > 0 && !e.closest("[inert],[aria-hidden=true]") }),
      hold: document.documentElement.hasAttribute("data-op-hold") || document.documentElement.style.overflow === "hidden" || document.body.hasAttribute("data-scroll-locked") || (() => { const y = scrollY; scrollBy(0, 30); const moved = scrollY !== y; scrollTo(0, y); return !moved })(),
      bodyPointer: getComputedStyle(document.body).pointerEvents,
      hash: location.hash,
      path: location.pathname,
    }))
    row.escapeClean = !afterEscape.checkout && !afterEscape.sheet && !afterEscape.hold && afterEscape.bodyPointer !== "none"
    row.scrollJump = Math.max(row.scrollJump, Math.abs(afterEscape.y - before.y))
    check(row.escapeClean, `${name}: Escape closes the checkout and leaves the page usable ${JSON.stringify(afterEscape)}`)
    check(row.scrollJump <= 1, `${name}: the page does not scroll under the windows (${row.scrollJump}px: before ${before.y}, under ${under.y}, after ${afterEscape.y})`)
    check(row.widthJump <= 1, `${name}: the page keeps its width (${row.widthJump}px)`)

    /* The browser's Back: closes the checkout, stays on the page. */
    await openSheet()
    await page.click("[data-product-sheet-buy]")
    await page.waitForSelector("[data-instant-checkout]", { timeout: 4000 }).catch(() => null)
    await sleep(700)
    await page.evaluate(() => history.back())
    await sleep(900)
    const afterBack = await page.evaluate(() => ({
      checkout: !!document.querySelector("[data-instant-checkout]"),
      sheet: [...document.querySelectorAll("[data-product-sheet]")].some((e) => { const b = e.getBoundingClientRect(); return e.getClientRects().length && b.top < innerHeight && b.bottom > 0 && !e.closest("[inert],[aria-hidden=true]") }),
      hold: document.documentElement.hasAttribute("data-op-hold"),
      bodyPointer: getComputedStyle(document.body).pointerEvents,
      path: location.pathname,
      history: history.length,
      state: JSON.stringify(history.state),
    }))
    row.backClean = !afterBack.checkout && !afterBack.sheet && !afterBack.hold && afterBack.bodyPointer !== "none" && afterBack.path === "/app/probe"
    check(row.backClean, `${name}: the browser's Back closes the checkout and stays on the page ${JSON.stringify(afterBack)}`)

    /* The checkout's own Back: the sheet again, and then the page. */
    if (!(await openSheet())) {
      check(false, `${name}: the page is still there after Back (${await page.evaluate(() => location.href)})`)
      rows.push(row)
      await page.close()
      continue
    }
    await page.click("[data-product-sheet-buy]")
    await page.waitForSelector("[data-instant-checkout]", { timeout: 4000 }).catch(() => null)
    await sleep(700)
    const hasBack = await page.$("[data-checkout-back]")
    if (hasBack) {
      await page.click("[data-checkout-back]")
      await sleep(900)
      const back = await page.evaluate(() => ({
        checkout: !!document.querySelector("[data-instant-checkout]"),
        sheet: !!document.querySelector("[data-product-sheet-buy]") && [...document.querySelectorAll("[data-product-sheet]")].some((e) => { const b = e.getBoundingClientRect(); return e.getClientRects().length && b.top < innerHeight && b.bottom > 0 && !e.closest("[inert],[aria-hidden=true]") }),
      }))
      await page.keyboard.press("Escape")
      await sleep(800)
      const end = await page.evaluate(() => ({
        sheet: [...document.querySelectorAll("[data-product-sheet]")].some((e) => { const b = e.getBoundingClientRect(); return e.getClientRects().length && b.top < innerHeight && b.bottom > 0 && !e.closest("[inert],[aria-hidden=true]") }),
        hold: document.documentElement.hasAttribute("data-op-hold"),
        bodyPointer: getComputedStyle(document.body).pointerEvents,
      }))
      row.returnClean = !back.checkout && back.sheet && !end.sheet && !end.hold && end.bodyPointer !== "none"
      check(row.returnClean, `${name}: the checkout's Back reopens the sheet, which then closes cleanly ${JSON.stringify({ back, end })}`)
    }
    row.errors = errors.length
    check(errors.length === 0, `${name}: no page errors ${JSON.stringify(errors)}`)
    rows.push(row)
    await page.close()
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}

for (const r of rows) console.log(JSON.stringify(r))
if (failures.length) {
  console.log(`\n${failures.length} failed:\n- ` + failures.join("\n- "))
  if (!report) assert.fail(`${failures.length} checks failed`)
} else console.log(`\nok: ${rows.length} scenarios, checkout on top with one backdrop, focus held, product picture without bars, clean ways out`)
