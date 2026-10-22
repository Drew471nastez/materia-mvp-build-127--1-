/**
 * ===========================================================================
 *  THE CHECKOUT OPENS AT ITS TOP, AND "BUYING FOR A BUSINESS" OPENS CLEANLY
 * ===========================================================================
 * Measured in the real app (Next's own router and scroll handling, the real
 * Tailwind build), at a 390px phone and a 1280px laptop, plus 320px for the
 * address layout:
 *
 *   ARRIVAL   a Buy press from a page scrolled 1300px down: scrollY on the
 *             first checkout frame and at every frame for four seconds;
 *             a reload while scrolled; Forward back to the checkout; and Back
 *             from it still returning the page behind to where it was
 *   REVEAL    ticking the box: the frames the block grows over, whether
 *             anything above it moves (it must not), whether what is under it
 *             moves by exactly the block's growth (it must: nothing jumps),
 *             the fade, where the cursor went, and the same with reduced
 *             motion, which opens it at once
 *   FIELDS    every box's placeholder and its computed colour, its autofill
 *             name and keyboard, labels tied to boxes; City and Postcode
 *             side by side at 390 and stacked at 320; unticking keeps what
 *             was typed
 *
 * It needs a running app whose Supabase is the stand in this probe serves on
 * 127.0.0.1:54399 (one product, one creator), so the checkout renders with no
 * database:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
 *     STRIPE_SECRET_KEY=sk_test_x RESEND_API_KEY=re_x pnpm exec next dev -p 3917
 *   BASE=http://localhost:3917 node scripts/check-checkout-arrival.mjs
 *
 * Stripe's own fields need a publishable key, which the sandbox does not
 * have: they do not draw here, and the probe says so rather than claiming
 * the scroll stays at 0 once they mount.
 */
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const BASE = process.env.BASE || "http://localhost:3917"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-checkout-arrival-")), "shots")
mkdirSync(shots, { recursive: true })
const PRODUCT_ID = "2bfe1ed7-0769-4ff0-a4a4-efb90f13e897"
const CHECKOUT = `/checkout?productId=${PRODUCT_ID}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* ── The stand in database: PostgREST's shape, enough rows for /checkout ── */
const PRODUCT = { id: PRODUCT_ID, title: "Brand Content Guide", slug: "brand-guide", description: null, price_cents: 4900, thumbnail_url: null, type: "digital", status: "published", creator_id: "c0000000-0000-4000-8000-000000000001", pay_what_you_want: false }
const CREATOR = { id: PRODUCT.creator_id, user_id: "u0000000-0000-4000-8000-000000000001", slug: "luca" }
const PROFILE = { display_name: "Luca Dragoste", avatar_url: null, username: "luca" }
/* The store offers company invoices (Settings › Checkout, off by default), so "Buying for a business" is on its checkout. */
const SETTINGS = { checkout: { businessInvoice: true } }
const db = createServer((req, res) => {
  const table = (req.url || "").split("/rest/v1/")[1]?.split("?")[0]
  const single = String(req.headers.accept || "").includes("vnd.pgrst.object")
  const rows = table === "products" ? [PRODUCT] : table === "creators" ? [CREATOR] : table === "profiles" ? [PROFILE] : table === "store_settings" ? [SETTINGS] : []
  if (single && !rows[0]) {
    res.writeHead(406, { "content-type": "application/json" })
    return res.end(JSON.stringify({ code: "PGRST116", message: "no rows" }))
  }
  res.writeHead(200, { "content-type": "application/json", "content-range": `0-${rows.length}/${rows.length}` })
  res.end(JSON.stringify(single ? rows[0] : rows))
})
await new Promise((resolve) => db.once("error", () => resolve(null)).listen(54399, "127.0.0.1", () => resolve(null)))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const [label, vp] of [
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["laptop-1280", { width: 1280, height: 800 }],
  ]) {
    console.log(`\n${label}`)
    const p = await browser.newPage()
    await p.setViewport(vp)

    /* ── ARRIVAL: a Buy press from a scrolled page, as the product page's button does it (router.push) ── */
    await p.goto(`${BASE}/terms`, { waitUntil: "networkidle2", timeout: 240000 })
    await p.evaluate(() => window.scrollTo(0, 1300))
    await sleep(250)
    const before = await p.evaluate(() => Math.round(window.scrollY))
    await p.evaluate((url) => {
      window.__ys = []
      const t0 = performance.now()
      const tick = () => {
        if (location.pathname === "/checkout" && document.querySelector("[data-page=checkout]")) window.__ys.push([Math.round(performance.now() - t0), Math.round(window.scrollY)])
        if (performance.now() - t0 < 12000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      window.next.router.push(url)
    }, CHECKOUT)
    await p.waitForSelector("[data-page=checkout]", { timeout: 120000 })
    await sleep(4000)
    const ys = await p.evaluate(() => window.__ys)
    const stripeDrew = await p.evaluate(() => [...document.querySelectorAll("iframe")].some((f) => f.name.startsWith("__privateStripeFrame") && f.getBoundingClientRect().height > 100))
    expect(ys.length > 0 && ys[0][1] === 0, `a Buy press from ${before}px down: the first checkout frame is at the top`, ys[0])
    expect(ys.every(([, y]) => y === 0), `  and stays there for ${ys.length} frames (${ys.at(-1)?.[0] ?? 0}ms)`, Math.max(...ys.map(([, y]) => y)))
    console.log(`  note  Stripe's fields drew: ${stripeDrew} (no publishable key in the sandbox, so the scroll after they mount is not measured here)`)

    /* Back returns the page behind to where the buyer left it. */
    await p.evaluate(() => window.scrollTo(0, 400))
    await p.goBack({ waitUntil: "networkidle2" })
    await sleep(800)
    const back = await p.evaluate(() => [location.pathname, Math.round(window.scrollY)])
    expect(back[0] === "/terms" && Math.abs(back[1] - before) <= 2, "Back from the checkout: the page behind is where it was", back)

    /* Forward to the checkout, which it had left 400px down. */
    await p.goForward({ waitUntil: "networkidle2" })
    await p.waitForSelector("[data-page=checkout]")
    await sleep(1200)
    expect((await p.evaluate(() => window.scrollY)) === 0, "Forward to the checkout: at the top", await p.evaluate(() => window.scrollY))

    /* A reload while scrolled: the browser used to put it back part way down. */
    await p.evaluate(() => window.scrollTo(0, 500))
    await sleep(200)
    await p.reload({ waitUntil: "networkidle2" })
    await p.waitForSelector("[data-page=checkout]")
    await sleep(1500)
    expect((await p.evaluate(() => window.scrollY)) === 0, "a reload: at the top", await p.evaluate(() => window.scrollY))

    /* ── REVEAL ─────────────────────────────────────────────────────────── */
    await p.evaluate(() => document.getElementById("buying-for-business").scrollIntoView({ block: "center" }))
    await sleep(300)
    const reveal = await p.evaluate(async () => {
      const box = document.getElementById("buying-for-business")
      const block = document.querySelector("[data-business-reveal]")
      const fields = document.querySelector("[data-business-fields]")
      const above = box.closest("label")
      const below = document.getElementById("checkout-terms")
      const pay = document.querySelector("[data-pay]")
      const top = (el) => el.getBoundingClientRect().top
      const start = { above: top(above), below: top(below), pay: top(pay), h: block.getBoundingClientRect().height, y: window.scrollY }
      const frames = []
      box.click()
      const t0 = performance.now()
      await new Promise((done) => {
        const tick = () => {
          const h = block.getBoundingClientRect().height
          const cs = getComputedStyle(fields)
          frames.push({
            t: Math.round(performance.now() - t0),
            h: Math.round(h * 10) / 10,
            aboveMoved: Math.round((top(above) - start.above) * 10) / 10,
            /* What is under the block moves by the block's growth and nothing else. */
            belowJump: Math.round((top(below) - start.below - (h - start.h)) * 10) / 10,
            payJump: Math.round((top(pay) - start.pay - (h - start.h)) * 10) / 10,
            opacity: Number(cs.opacity).toFixed(2),
            translate: cs.translate,
          })
          if (performance.now() - t0 < 450) requestAnimationFrame(tick)
          else done()
        }
        requestAnimationFrame(tick)
      })
      return { start, frames, focus: document.activeElement?.id, scrolled: Math.round(window.scrollY - start.y) }
    })
    const growing = reveal.frames.filter((f, i) => i > 0 && f.h !== reveal.frames[i - 1].h)
    const settled = reveal.frames.at(-1)
    console.log(`  frames  ${reveal.frames.map((f) => `${f.t}ms:${f.h}px/${f.opacity}`).join(" ")}`)
    expect(growing.length >= 6 && growing.at(-1).t >= 150 && growing.at(-1).t <= 300, `REVEAL: the block grows over ${growing.length} frames, done by ${growing.at(-1)?.t}ms`, settled.h)
    expect(reveal.frames.every((f) => f.aboveMoved === 0), "  nothing above it moves", Math.max(...reveal.frames.map((f) => Math.abs(f.aboveMoved))))
    expect(reveal.frames.every((f) => Math.abs(f.belowJump) <= 0.5 && Math.abs(f.payJump) <= 0.5), "  what is under it moves with it and never jumps", Math.max(...reveal.frames.map((f) => Math.max(Math.abs(f.belowJump), Math.abs(f.payJump)))))
    expect(Number(reveal.frames[1]?.opacity ?? 1) < 1 && settled.opacity === "1.00", "  the fields fade in", [reveal.frames[1]?.opacity, settled.opacity])
    expect(reveal.focus === "business-company", "  the cursor goes to Company name", reveal.focus)
    await p.screenshot({ path: join(shots, `checkout-business-${label}.png`) })

    /* ── FIELDS ─────────────────────────────────────────────────────────── */
    const fields = await p.evaluate(() =>
      [...document.querySelectorAll("[data-business-fields] input, [data-business-fields] select")].map((el) => ({
        id: el.id,
        label: document.querySelector(`label[for="${el.id}"]`)?.textContent,
        placeholder: el.tagName === "SELECT" ? el.options[el.selectedIndex]?.text : el.placeholder,
        colour: el.tagName === "SELECT" ? getComputedStyle(el).color : getComputedStyle(el, "::placeholder").color,
        autocomplete: el.getAttribute("autocomplete"),
        inputmode: el.getAttribute("inputmode"),
      })),
    )
    for (const f of fields) console.log(`  field  ${f.id}  "${f.label}"  placeholder "${f.placeholder}"  ${f.colour}  autocomplete=${f.autocomplete}${f.inputmode ? ` inputmode=${f.inputmode}` : ""}`)
    expect(fields.length === 8 && fields.every((f) => f.placeholder && f.label), "FIELDS: all eight have a label and a placeholder", fields.length)
    expect(fields.every((f) => f.colour === "rgb(162, 167, 176)"), "  every placeholder is the checkout's light grey #a2a7b0", [...new Set(fields.map((f) => f.colour))])
    const want = { "business-company": "organization", "business-country": "country", "business-line1": "address-line1", "business-line2": "address-line2", "business-city": "address-level2", "business-postal": "postal-code", "business-region": "address-level1" }
    expect(fields.every((f) => !want[f.id] || want[f.id] === f.autocomplete), "  autofill names on every address box")
    const side = await p.evaluate(() => {
      const a = document.getElementById("business-city").getBoundingClientRect()
      const b = document.getElementById("business-postal").getBoundingClientRect()
      return { sameRow: Math.round(a.top) === Math.round(b.top), cityW: Math.round(a.width), postalW: Math.round(b.width) }
    })
    expect(side.sameRow, "  City and postal code side by side", side)

    /* Typed, unticked, ticked again: still there. */
    await p.type("#business-company", "Acme Ltd")
    await p.click("#buying-for-business")
    await sleep(350)
    const closed = await p.evaluate(() => ({ h: Math.round(document.querySelector("[data-business-reveal]").getBoundingClientRect().height), inert: document.querySelector("[data-business-reveal]").inert }))
    expect(closed.h === 0 && closed.inert, "unticked: closed and out of reach", closed)
    await p.click("#buying-for-business")
    await sleep(350)
    expect((await p.evaluate(() => document.getElementById("business-company").value)) === "Acme Ltd", "ticked again: what was typed is still there")

    /* Reduced motion: it opens at once. */
    await p.click("#buying-for-business")
    await sleep(350)
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const instant = await p.evaluate(async () => {
      document.getElementById("buying-for-business").click()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return Math.round(document.querySelector("[data-business-reveal]").getBoundingClientRect().height)
    })
    expect(instant > 300, "reduced motion: open on the next frame", instant)
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
    await p.close()
  }

  /* ── 320: the address stacks ────────────────────────────────────────── */
  console.log("\nphone-320")
  const p = await browser.newPage()
  await p.setViewport({ width: 320, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await p.goto(`${BASE}${CHECKOUT}`, { waitUntil: "networkidle2", timeout: 120000 })
  await p.waitForSelector("#buying-for-business")
  await p.evaluate(() => document.getElementById("buying-for-business").click())
  await sleep(400)
  const stack = await p.evaluate(() => {
    const a = document.getElementById("business-city").getBoundingClientRect()
    const b = document.getElementById("business-postal").getBoundingClientRect()
    return { stacked: b.top > a.bottom, width: Math.round(a.width), sideways: document.documentElement.scrollWidth - innerWidth }
  })
  expect(stack.stacked && stack.sideways <= 0, "City over postal code, full width, nothing sideways", stack)
  await p.evaluate(() => document.getElementById("business-company").scrollIntoView({ block: "start" }))
  await p.screenshot({ path: join(shots, "checkout-business-phone-320.png") })
  await p.close()
} finally {
  await browser.close()
  db.close()
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
