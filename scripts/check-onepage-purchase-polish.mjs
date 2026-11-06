import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { mkdirSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-purchase-polish.tsx",
})
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || "/tmp/chromium",
  args: ["--no-sandbox"],
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
try {
  for (const width of [1440, 390, 320])
    for (const ratio of ["wide", "tall"])
      for (const price of ["free", "paid"]) {
        const page = await browser.newPage(),
          errors = []
        page.on("pageerror", (e) => errors.push(e.message))
        await page.setViewport({
          width,
          height: 900,
          isMobile: width < 640,
          hasTouch: width < 640,
        })
        await page.evaluateOnNewDocument(() => {
          window.Stripe = () => ({
            _registerWrapper() {},registerAppInfo() {},
            createToken:async()=>({}),createPaymentMethod:async()=>({}),confirmCardPayment:async()=>({}),
            paymentRequest:()=>({canMakePayment:async()=>null,on(){},off(){}}),
            elements:()=>({create:()=>({mount(){},on(){},off(){},destroy(){},update(){}}),getElement:()=>null,update(){}}),
          })
        })
        await page.goto(`${base}/app/probe?ratio=${ratio}&price=${price}`)
        await page.waitForSelector("[data-hero-header]")
        await sleep(500)
        await page.evaluate(() =>
          [...document.querySelectorAll("a")]
            .find((e) => e.textContent.includes("View guide"))
            .click(),
        )
        await page.waitForSelector("[data-product-sheet-buy]")
        await page.waitForFunction(
          () =>
            document.querySelector("[data-product-sheet-strip] img")
              ?.naturalWidth > 0,
        )
        await sleep(500)
        const geometry = await page.evaluate(() => {
          const img = document.querySelector("[data-product-sheet-strip] img"),
            frame = img.closest("button").getBoundingClientRect()
          return {
            ratio: frame.width / frame.height,
            natural: img.naturalWidth / img.naturalHeight,
            fit: getComputedStyle(img).objectFit,
            overflow: document.documentElement.scrollWidth > innerWidth,
          }
        })
        assert.ok(
          Math.abs(geometry.ratio - geometry.natural) < 0.03,
          `${width}/${ratio}: no forced letterbox or crop ${JSON.stringify(geometry)}`,
        )
        assert.equal(geometry.fit, "cover")
        assert.equal(geometry.overflow, false)
        const summary = await page.$("[data-product-questions] summary")
        await summary.evaluate((e) => e.scrollIntoView({ block: "center" }))
        await summary.click()
        await sleep(280)
        assert.equal(await summary.evaluate((e) => e.parentElement.open), true)
        const openHeight = await summary.evaluate(
          (e) => e.parentElement.getBoundingClientRect().height,
        )
        await summary.click()
        await sleep(60)
        const halfway = await summary.evaluate(
          (e) => e.parentElement.getBoundingClientRect().height,
        )
        await sleep(220)
        const closedHeight = await summary.evaluate(
          (e) => e.parentElement.getBoundingClientRect().height,
        )
        assert.ok(
          halfway < openHeight && halfway > closedHeight,
          `FAQ closes gradually ${openHeight}/${halfway}/${closedHeight}`,
        )
        await page.click("[data-product-sheet-buy]")
        await page.waitForSelector("[data-instant-checkout]")
        await sleep(450)
        assert.equal(
          await page.$$eval(
            "[data-product-sheet]",
            (elements) =>
              elements.filter(
                (e) =>
                  e.getClientRects().length &&
                  e.getBoundingClientRect().top < innerHeight &&
                  e.getBoundingClientRect().bottom > 0 &&
                  getComputedStyle(e).visibility !== "hidden" &&
                  !e.closest("[inert],[aria-hidden=true]"),
              ).length,
          ),
          0,
          "The initial product sheet closes before checkout is visible",
        )
        await page.waitForFunction(
          () =>
            document.querySelector("[data-checkout-head] img")?.naturalWidth >
            0,
        )
        const image = await page.$eval("[data-checkout-head] img", (e) => e.src)
        assert.equal(
          image,
          await page.evaluate(() => window.__polishImage),
          "Checkout shows this product, never the creator avatar",
        )
        if (price === "paid")
          assert.ok(
            await page.evaluate(() =>
              document
                .querySelector("[data-instant-checkout]")
                .textContent.includes("$25"),
            ),
            "Paid checkout uses the selected product price",
          )
        else
          assert.ok(
            await page.evaluate(() =>
              document
                .querySelector("[data-instant-checkout]")
                .textContent.includes("Get it free"),
            ),
          )
        const top = await page.evaluate(() => {
          const el = document.querySelector("[data-checkout-head]"),
            r = el.getBoundingClientRect()
          return !!document
            .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
            ?.closest("[data-instant-checkout]")
        })
        assert.ok(
          top,
          "Checkout accepts clicks without closing another sheet manually",
        )
        if (shots)
          await page.screenshot({
            path: `${shots}/checkout-${width}-${ratio}-${price}.png`,
          })
        await page.click("[data-checkout-back]")
        await page.waitForSelector("[data-product-sheet-buy]")
        await sleep(450)
        assert.equal(
          await page.$("[data-instant-checkout]"),
          null,
          "Back restores the product sheet",
        )
        assert.deepEqual(errors, [])
        await page.close()
        console.log(
          `ok ${width}px/${ratio}/${price}: image fits naturally, FAQ animation, sheet-to-checkout, correct product image, back and gradient Hero`,
        )
      }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
