/**
 * ===========================================================================
 *  ROUND 60 (h4): NEW OFFER ASKS THE KIND, THEN THE OFFER'S OWN PAGE
 * ===========================================================================
 *   node scripts/check-offers-flow-r60.mjs      (SHOTS=<dir> keeps the screenshots)
 *
 * The real OffersClient, its New offer chooser and OfferEditor
 * (scripts/render-offers-r60.tsx) against a stubbed API, served over HTTP so
 * the address and the history are real, at 360, 390, 768 and 1280:
 *
 *   THE CHOOSER  New offer opens it (a bottom sheet the screen's width on a
 *                phone, a dialog of at most 520px in the middle from 768px):
 *                how long it takes to settle and to leave, sampled every
 *                frame, its size never changing on the way (transform and
 *                opacity only), no layout shift under it.
 *   THE MOVE     a kind closes it and the address becomes
 *                /app/offers/new?kind=<kind>, the page drawn, the chooser gone.
 *   THE PAGE     its title, a way back, sections, no platform select, 16px
 *                fields and 44px targets on a phone, the save bar (the top
 *                bar under lg, the foot bar from lg) in view while scrolled,
 *                nothing wider than the screen.
 *   SAVING       Create with nothing picked says what is missing and sends
 *                nothing; picked, the buyer's price line; Create sends the
 *                body and the list comes back with the new row, said and
 *                tinted. Edit: Save off until a change, Ctrl+S sends PUT,
 *                the list shows the new name. Leaving with a change asks
 *                "Discard changes?". Delete asks, sends DELETE, the row goes.
 *   ADDRESSES    /app/offers/new?kind=checkout and quantity_break open their
 *                form; /app/offers/new opens the list with the chooser.
 *   REDUCED      with reduced motion the chooser is in place at once.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const require = createRequire(join(root, "package.json"))
const { chromium } = require("playwright")
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), "offers-r60-shots-"))
mkdirSync(SHOTS, { recursive: true })
let broken = 0
const results = []
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)?.slice(0, 500)})`}`)
  results.push({ ok, what })
  if (!ok) broken++
}
const settle = (page, ms = 600) => page.waitForTimeout(ms)

const out = mkdtempSync(join(tmpdir(), "offers-r60-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-offers-r60.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;', '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, `--alias:next/navigation=${join(root, "scripts/probe-router-r60.ts")}`, "--loader:.css=empty"], { stdio: ["ignore", "inherit", "inherit"] })
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${await appCss(root)}</style><style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
const js = readFileSync(join(out, "probe.js"))
const server = createServer((req, res) => {
  if (req.url === "/probe.js") return res.writeHead(200, { "content-type": "text/javascript" }), res.end(js)
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const SAVED = "11111111-1111-4111-8111-111111111111"

const open = async (width, path = "/app/offers", reduced = false) => {
  const phone = width < 768
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 800 : width === 768 ? 1024 : 860 }, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone, reducedMotion: reduced ? "reduce" : "no-preference" })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  await page.addInitScript(() => {
    window.__cls = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
  })
  await page.goto(`${origin}${path}`)
  await settle(page, 700)
  return { ctx, page, errors, phone }
}
const sent = (page) => page.evaluate(() => window.__sent)
const where = (page) => page.evaluate(() => location.pathname + location.search)

/*
  THE CHOOSER'S BOX, every frame until it has not moved for 300ms (opening)
  or until it is gone (closing): when it settled, every size it had (one
  means nothing was laid out again), and how many frames it took.
*/
const motion = (page, closing = false) => page.evaluate((closing) => new Promise((resolve) => {
  const t0 = performance.now()
  let last = null, changed = t0, sizes = new Set(), frames = 0
  const tick = () => {
    const el = document.querySelector("[data-offer-chooser]")
    const t = performance.now()
    frames++
    if (el) {
      const box = el.closest("[data-sheet-panel],[role=dialog]") ?? el
      const r = box.getBoundingClientRect()
      let op = 1
      for (let n = box; n && n !== document.documentElement; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
      sizes.add(`${Math.round(box.offsetWidth)}x${Math.round(box.offsetHeight)}`)
      const now = `${Math.round(r.top)}:${Math.round(r.left)}:${op.toFixed(2)}`
      if (now !== last) { last = now; changed = t }
    }
    if (closing && !el) return resolve({ ms: Math.round(t - t0), layoutSizes: [...sizes], frames })
    if (!closing && el && t - changed > 300) return resolve({ ms: Math.round(changed - t0), layoutSizes: [...sizes], frames })
    if (t - t0 > 2500) return resolve({ ms: -1, layoutSizes: [...sizes], frames, timeout: true })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), closing)

/*
  Controls whose press is under 44px high or wide on a phone, in the offer
  page. The press is the box plus the app's invisible ::after press area
  (editor-buttons PRESS_AREA); a switch inside a row the whole of which
  turns it ([data-switch-row], SwitchRow) presses as that row.
*/
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll("[data-offer-editor] button, [data-offer-editor] input, [data-offer-editor] [role=radio], [data-offer-editor] [role=checkbox]")]
  .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
  .map((el) => {
    const row = el.getAttribute("role") === "switch" ? el.parentElement?.closest("[data-switch-row], [data-offer-editor] div.cursor-pointer") : null
    const r = (row ?? el).getBoundingClientRect()
    const a = getComputedStyle(el, "::after")
    const grow = a.content !== "none" && a.position === "absolute" ? { y: -(parseFloat(a.top) || 0) - (parseFloat(a.bottom) || 0), x: -(parseFloat(a.left) || 0) - (parseFloat(a.right) || 0) } : { x: 0, y: 0 }
    return { t: (el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().slice(0, 30), h: Math.round(r.height + Math.max(0, grow.y)), w: Math.round(r.width + Math.max(0, grow.x)) }
  })
  .filter((x) => x.h < 44 || x.w < 44))

for (const width of [360, 390, 768, 1280]) {
  console.log(`\nAT ${width}\n`)
  let { ctx, page, errors, phone } = await open(width)

  /* ── The chooser opens ── */
  const clsBefore = await page.evaluate(() => window.__cls)
  await page.click("[data-offer-new]")
  const m = await motion(page)
  const box = await page.evaluate(() => {
    const el = document.querySelector("[data-offer-chooser]").closest("[data-sheet-panel],[role=dialog]")
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), kinds: [...document.querySelectorAll("[data-offer-chooser] [data-kind]")].map((b) => b.getAttribute("data-kind")), rowH: [...document.querySelectorAll("[data-offer-chooser] [data-kind]")].map((b) => Math.round(b.getBoundingClientRect().height)), over: document.documentElement.scrollWidth - innerWidth, cls: window.__cls, focus: document.activeElement?.getAttribute("data-kind") }
  })
  expect(phone ? box.bottom >= (await page.viewportSize()).height - 1 && box.width === width : Math.abs(box.left + box.width / 2 - width / 2) <= 2 && box.width <= 520, phone ? `the chooser is a bottom sheet the screen's width (${box.width}px)` : `the chooser is a dialog in the middle, at most 520px (${box.width}px)`)
  expect(m.ms >= 0 && m.ms <= 500 && m.layoutSizes.length === 1, `opened and settled in ${m.ms}ms over ${m.frames} frames, its size never changed (transform and opacity only)`, m)
  expect(box.cls - clsBefore === 0 && box.over <= 0, `no layout shift under it (CLS +${(box.cls - clsBefore).toFixed(3)}), nothing wider than the screen`, box)
  expect(box.kinds.join() === "bundle,checkout,quantity_break" && box.rowH.every((h) => h >= 44), "Bundle, Upsell, Quantity break, each row at least 44px", box.rowH)
  await page.screenshot({ path: join(SHOTS, `chooser-${width}.png`) })

  /* ── It closes ── */
  await page.click("[data-offer-chooser-close]")
  const c = await motion(page, true)
  expect(c.ms >= 0 && c.ms <= 600 && c.layoutSizes.length <= 1, `closed in ${c.ms}ms over ${c.frames} frames, its size never changed`, c)
  expect((await where(page)) === "/app/offers", "closing leaves the address on the list")

  /* ── A kind goes to the page ── */
  await page.click("[data-offer-new]")
  await motion(page)
  const t0 = Date.now()
  await page.click('[data-offer-chooser] [data-kind="bundle"]')
  await page.waitForSelector("[data-offer-editor]", { timeout: 4000 })
  const arrived = Date.now() - t0
  await settle(page, 500)
  const at = await where(page)
  const pg = await page.evaluate(() => ({
    title: document.querySelector("[data-offer-title]")?.textContent,
    chooser: !!document.querySelector("[data-offer-chooser]"),
    selects: document.querySelectorAll("select").length,
    sections: document.querySelectorAll("[data-editor-main] > section").length,
    over: document.documentElement.scrollWidth - innerWidth,
    bar: (() => { const b = [...document.querySelectorAll("[data-editor-bar],[data-editor-foot]")].find((x) => x.getClientRects().length); return b ? b.getAttribute("data-editor-bar") !== null ? "top" : "foot" : null })(),
    back: [...document.querySelectorAll("[data-leave-button],[aria-label='Back to offers']")].filter((x) => x.getClientRects().length).length,
    nav: window.__nav,
  }))
  expect(at === "/app/offers/new?kind=bundle" && !pg.chooser, `Bundle closes the chooser and the address is ${at} (page drawn ${arrived}ms after the press, stubbed data)`, pg.nav)
  expect(pg.title === "New bundle" && pg.back >= 1, `the page: "${pg.title}", with a way back`)
  expect(pg.sections >= 4 && pg.selects === 0 && pg.over <= 0, `sections (${pg.sections}), no platform select, nothing wider than the screen`, pg)
  expect(width >= 1024 ? pg.bar === "foot" : pg.bar === "top", `the save bar: ${pg.bar === "top" ? "the top bar, which the keyboard cannot cover" : "the foot bar of the pane"}`, pg.bar)
  const font = await page.$eval("#offer-title", (el) => [getComputedStyle(el).fontSize, Math.round(el.getBoundingClientRect().height)])
  expect(phone ? font[0] === "16px" && font[1] >= 44 : font[1] >= 36, `the name field: ${font[0]}, ${font[1]}px high`, font)
  if (phone) {
    const small = await smallTargets(page)
    expect(small.length === 0, "every button and field on the page is at least 44px on a phone", small)
  }
  await page.screenshot({ path: join(SHOTS, `page-bundle-${width}.png`) })

  /* ── Create with nothing picked, then picked ── */
  await page.click("[data-save-button]:visible")
  await settle(page, 400)
  const msgs = await page.evaluate(() => [...document.querySelectorAll("[data-problem] p")].map((p) => p.textContent).filter((t) => /Tick|Pick|Type|Give/.test(t)))
  expect(msgs.some((t) => /2 to 5 products/.test(t)) && (await sent(page)).length === 0, "Create with no products says so under the field and sends nothing", msgs)
  await page.click(`[data-product-picker="offer-products"] [data-pick="${A}"]`)
  await page.click(`[data-product-picker="offer-products"] [data-pick="${B}"]`)
  await settle(page, 150)
  const line = await page.$eval("[data-offer-price]", (el) => el.textContent)
  expect(/\$36(\.00)? instead of \$40(\.00)?/.test(line), `what the buyer pays: "${line}"`)
  /* Scrolled to the end, the save bar is still in view. */
  await page.evaluate(() => { const p = document.querySelector("[data-offer-editor]"); p.scrollTop = p.scrollHeight })
  await settle(page, 200)
  const barIn = await page.evaluate(() => { const b = [...document.querySelectorAll("[data-editor-bar],[data-editor-foot]")].find((x) => x.getClientRects().length); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 })
  expect(barIn, "scrolled to the end, the save bar is still on screen")
  await page.screenshot({ path: join(SHOTS, `page-bundle-end-${width}.png`) })
  await page.evaluate(() => { document.querySelector("[data-offer-editor]").scrollTop = 0 })
  await page.click("[data-save-button]:visible")
  await page.waitForSelector("[data-offers]", { timeout: 9000 })
  await settle(page, 900)
  const posted = (await sent(page)).filter((x) => x.method === "POST")
  const back = await page.evaluate(() => ({
    at: location.pathname,
    rows: [...document.querySelectorAll("[data-row]")].filter((el) => el.getClientRects().length > 0).length,
    said: document.body.innerText.includes("Buy it together created"),
    tinted: [...document.querySelectorAll("[data-row]")].filter((el) => el.getClientRects().length > 0).some((el) => [el, ...el.children].some((x) => x.getAnimations?.().length)),
  }))
  expect(posted.length === 1 && posted[0].body.kind === "bundle" && posted[0].body.productIds.join() === `${A},${B}` && posted[0].body.discountValue === 10 && posted[0].body.formCurrency === "USD" && !("priceCents" in posted[0].body), "Create sends the bundle, its products and 10% in the form's currency, never a price", posted[0]?.body)
  expect(back.at === "/app/offers" && back.rows === 4 && back.said && back.tinted, "back on the list: the new row is there, said in the pill and tinted", back)
  await page.screenshot({ path: join(SHOTS, `list-after-create-${width}.png`) })
  expect(errors.length === 0, "no script error", errors)

  /* ── Edit: a row opens the same page; Save is off until a change; Ctrl+S saves ── */
  await page.evaluate((id) => {
    const row = [...document.querySelectorAll(`[data-row="${id}"]`)].find((el) => el.getClientRects().length)
    ;(row.querySelector("[data-row-open]") ?? row.querySelector("button")).click()
  }, SAVED)
  await page.waitForSelector("[data-offer-editor]", { timeout: 4000 })
  await settle(page, 400)
  const editAt = await where(page)
  const before = await page.$eval("[data-save-button]:visible", (b) => b.disabled)
  await page.fill("#offer-title", "Breakfast pair")
  const after = await page.$eval("[data-save-button]:visible", (b) => b.disabled)
  await settle(page, 300)
  await page.screenshot({ path: join(SHOTS, `page-edit-${width}.png`) })
  await page.keyboard.press("Control+s")
  await page.waitForSelector("[data-offers]", { timeout: 4000 })
  await settle(page, 900)
  const put = (await sent(page)).find((x) => x.method === "PUT")?.body
  const renamed = await page.evaluate(() => document.body.innerText.includes("Breakfast pair"))
  expect(editAt === `/app/offers/${SAVED}` && before === true && after === false && put?.id === SAVED && put?.title === "Breakfast pair" && renamed && (await where(page)) === "/app/offers", "edit: its own address, Save off until a change, Ctrl+S sends PUT with the id, the list shows the new name", { editAt, before, after, put: put && { id: put.id, title: put.title }, renamed })

  /* ── Leaving with a change asks first ── */
  await page.evaluate((id) => {
    const row = [...document.querySelectorAll(`[data-row="${id}"]`)].find((el) => el.getClientRects().length)
    ;(row.querySelector("[data-row-open]") ?? row.querySelector("button")).click()
  }, SAVED)
  await page.waitForSelector("[data-offer-editor]", { timeout: 4000 })
  await settle(page, 300)
  await page.fill("#offer-title", "Changed my mind")
  await page.click("[data-leave-button]:visible")
  await settle(page, 400)
  const asked = await page.evaluate(() => document.body.innerText.match(/Discard changes\?/)?.[0] ?? "")
  expect(/Discard changes\?/.test(asked) && (await where(page)) === `/app/offers/${SAVED}`, "leaving with a change asks \"Discard changes?\" and stays until answered", asked.slice(0, 80))
  await page.click("[data-confirm]")
  await page.waitForSelector("[data-offers]", { timeout: 4000 })
  await settle(page, 300)
  expect((await sent(page)).filter((x) => x.method === "PUT").length === 1, "Discard goes back to the list and sends nothing")
  /* A press right after a way back is taken as the echo of the back and eaten (lib/navigation/go-back swallowEchoClicks): a person waits that long anyway. */
  await settle(page, 900)

  /* ── Delete ── */
  await page.evaluate((id) => {
    const row = [...document.querySelectorAll(`[data-row="${id}"]`)].find((el) => el.getClientRects().length)
    ;(row.querySelector("[data-row-open]") ?? row.querySelector("button")).click()
  }, SAVED)
  await page.waitForSelector("[data-offer-editor]", { timeout: 4000 })
  await settle(page, 300)
  await page.click("[data-delete-offer]")
  await settle(page, 300)
  await page.click("[data-confirm]")
  await page.waitForSelector("[data-offers]", { timeout: 4000 })
  await settle(page, 400)
  const del = (await sent(page)).find((x) => x.method === "DELETE")?.body
  const gone = await page.evaluate((id) => ![...document.querySelectorAll(`[data-row="${id}"]`)].some((el) => el.getClientRects().length), SAVED)
  expect(del?.id === SAVED && gone, "Delete asks, sends DELETE, the row is gone from the list", del)
  expect(errors.length === 0, "no script error through create, edit, discard and delete", errors)
  await ctx.close()

  /* ── An upsell and a quantity break from their addresses ── */
  ;({ ctx, page, errors, phone } = await open(width, "/app/offers/new?kind=checkout"))
  await page.click(`[data-product-picker="offer-products"] [data-pick="${C}"]`)
  await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Certain products")?.click())
  await settle(page, 120)
  await page.click(`[data-product-picker="offer-triggers"] [data-pick="${A}"]`)
  await page.evaluate(() => [...document.querySelectorAll('[data-choice-grid] [role="radio"]')].find((b) => b.textContent.trim() === "Amount")?.click())
  await settle(page, 200)
  await page.screenshot({ path: join(SHOTS, `page-upsell-${width}.png`) })
  await page.click("[data-save-button]:visible")
  await settle(page, 700)
  const up = (await sent(page)).find((x) => x.method === "POST")?.body
  expect(up?.kind === "checkout" && up.productIds.join() === C && up.triggerIds.join() === A && up.discountType === "fixed" && up.discountValue === 500 && up.placements.join() === "product,cart,checkout", "an upsell from /app/offers/new?kind=checkout: one product, its trigger, $5.00 off", up)
  await ctx.close()

  ;({ ctx, page, errors, phone } = await open(width, "/app/offers/new?kind=quantity_break"))
  await page.click(`[data-product-picker="offer-products"] [data-pick="${B}"]`)
  await page.click("[data-tier-add]")
  await page.click("[data-offer-more] > button")
  await settle(page, 250)
  await page.screenshot({ path: join(SHOTS, `page-quantity-${width}.png`), fullPage: false })
  if (phone) {
    const small = await smallTargets(page)
    expect(small.length === 0, "a quantity break's page with More options open: every target at least 44px", small)
  }
  await page.click("[data-save-button]:visible")
  await settle(page, 700)
  const qb = (await sent(page)).find((x) => x.method === "POST")?.body
  expect(qb?.kind === "quantity_break" && qb.productIds.join() === B && qb.tiers.length === 3 && qb.tiers[0].quantity === 2 && qb.tiers[0].freeQuantity === 1 && qb.tiers[2].discountType === "percent", "a quantity break from its address: Buy 2 get 1 free, Buy 3 get 2 free, a third tier at a percent", qb?.tiers)
  expect(errors.length === 0, "no script error", errors)
  await ctx.close()

  ;({ ctx, page } = await open(width, "/app/offers/new"))
  const landed = await page.evaluate(() => ({ chooser: !!document.querySelector("[data-offer-chooser]"), at: location.pathname }))
  expect(landed.chooser && landed.at === "/app/offers", "/app/offers/new with no kind: the list with the chooser open", landed)
  await ctx.close()
}

/* Reduced motion: the chooser is in place at once, on a computer and a phone. */
for (const width of [390, 1280]) {
  const { ctx, page } = await open(width, "/app/offers", true)
  await page.click("[data-offer-new]")
  const r = await motion(page)
  expect(r.ms >= 0 && r.ms <= 50, `with reduced motion at ${width} the chooser is in place at once (${r.ms}ms)`, r)
  await ctx.close()
}

await browser.close()
server.close()
writeFileSync(join(SHOTS, "results.json"), JSON.stringify(results, null, 1))
console.log(broken ? `\n${broken} checks failed` : "\nall checks passed")
console.log(`screenshots: ${SHOTS}`)
process.exit(broken ? 1 : 0)
