/**
 * ===========================================================================
 *  ROUND 58 (f5): THE OFFER MODAL AND A MATERIA PRODUCT PAGE, IN CHROMIUM
 * ===========================================================================
 *   node scripts/check-offers-r58.mjs      (SHOTS=<dir> keeps the screenshots)
 *   PART=admin or PART=materia runs one half.
 *
 * ADMIN (round 58, retired in round 60 for scripts/check-offers-flow-r60.mjs). Products › Upsells and bundles (scripts/render-offers-r58.tsx, the
 * real OffersClient and its modal against a stubbed API) at 360, 390, 768
 * and 1280. New offer opens the modal (a centred dialog from 768px, the
 * bottom sheet on a phone): how long it takes to settle, the layout shift
 * of the page under it, nothing wider than the screen, 16px fields on a
 * phone. Each kind is picked, filled and created, and the body the modal
 * sent is read back; Create with nothing chosen says what is missing and
 * sends nothing. The /app/offers/new?kind= and /app/offers/<id> addresses
 * open on their form.
 *
 * MATERIA. tests/offers-r58.test.ts with OFFERS_R58_SERVE=1 keeps its store
 * answering over HTTP through the real site route; the tee's page draws the
 * tiers and the socks upsell (the Clothing template has no Upsell block:
 * round 58's buy-buttons fallback), ticking the upsell and Add to Cart puts
 * both in the cart at the offer's price, and the mug's Add bundle puts the
 * set in at 20% off, read from /cart.js.
 */
import { execFileSync, spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, readdirSync, statSync, symlinkSync, unlinkSync, existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename } from "node:path"
import { createRequire } from "node:module"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const require = createRequire(join(root, "package.json"))
const { chromium } = require("playwright")
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), "offers-r58-shots-"))
mkdirSync(SHOTS, { recursive: true })
/* Changed on purpose (r60): the offer is no longer made in a modal; the admin half is scripts/check-offers-flow-r60.mjs now, and this script runs the Materia half. */
const PART = "materia"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)?.slice(0, 600)})`}`)
  if (!ok) broken++
}
const settle = (page, ms = 600) => page.waitForTimeout(ms)
const browser = await chromium.launch()

/* ─── ADMIN ─────────────────────────────────────────────────────────── */
if (PART === "all" || PART === "admin") {
  const out = mkdtempSync(join(tmpdir(), "offers-r58-admin-"))
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-offers-r58.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;', '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, "--loader:.css=empty"], { stdio: ["ignore", "inherit", "inherit"] })
  writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${await appCss(root)}</style><style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

  const open = async (width, view = "list", reduced = false) => {
    const phone = width < 768
    const ctx = await browser.newContext({ viewport: { width, height: phone ? 800 : width === 768 ? 1024 : 860 }, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone, reducedMotion: reduced ? "reduce" : "no-preference" })
    const page = await ctx.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
    await page.addInitScript((v) => {
      window.__view = v
      window.__cls = 0
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
    }, view)
    await page.goto(`file://${join(out, "index.html")}`)
    await settle(page, 700)
    return { ctx, page, errors, phone }
  }
  /* The modal's panel, sampled every frame until it has not moved for 300ms: when it settled, and whether anything but transform and opacity changed on the way. */
  const motion = (page) => page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now()
    let last = null, changed = t0, sizes = new Set()
    const tick = () => {
      const el = document.querySelector("[data-offer-editor]")
      const t = performance.now()
      if (el) {
        const box = el.closest("[data-sheet-panel],[role=dialog]") ?? el
        const r = box.getBoundingClientRect()
        let op = 1
        for (let n = box; n && n !== document.documentElement; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
        sizes.add(`${Math.round(box.offsetWidth)}x${Math.round(box.offsetHeight)}`)
        const now = `${Math.round(r.top)}:${Math.round(r.left)}:${op.toFixed(2)}`
        if (now !== last) { last = now; changed = t }
      }
      if ((el && t - changed > 300) || t - t0 > 2500) return resolve({ ms: Math.round(changed - t0), layoutSizes: [...sizes] })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
  const sent = (page) => page.evaluate(() => window.__sent)

  for (const width of [360, 390, 768, 1280]) {
    console.log(`\nADMIN at ${width}\n`)
    let { ctx, page, errors, phone } = await open(width)
    const clsBefore = await page.evaluate(() => window.__cls)
    await page.click("[data-offer-new]")
    const m = await motion(page)
    const D = await page.evaluate(() => {
      const box = document.querySelector("[data-offer-editor]").closest("[data-sheet-panel],[role=dialog]")
      const r = box.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), kinds: [...document.querySelectorAll("[data-kind]")].map((b) => b.getAttribute("data-kind")), over: document.documentElement.scrollWidth - innerWidth, cls: window.__cls }
    })
    expect(phone ? D.bottom >= (await page.viewportSize()).height - 1 && D.width === width : Math.abs(D.left + D.width / 2 - width / 2) <= 2 && D.width <= 600, phone ? `a bottom sheet the screen's width (${D.width}px, bottom ${D.bottom})` : `a dialog in the middle, at most 600px (${D.width}px)`)
    expect(m.ms <= 450 && m.layoutSizes.length === 1, `settled in ${m.ms}ms, its size never changed on the way (transform and opacity only)`, m)
    expect(D.cls - clsBefore === 0 && D.over <= 0, `no layout shift under it (CLS +${(D.cls - clsBefore).toFixed(3)}), nothing wider than the screen`, D)
    expect(D.kinds.join() === "bundle,checkout,quantity_break", "New offer asks the kind first, as Add product does", D.kinds)
    await page.screenshot({ path: join(SHOTS, `after-new-kind-${width}.png`) })

    /* A BUNDLE: Create with nothing picked says what is missing, then picked and created. */
    await page.click('[data-kind="bundle"]')
    await settle(page, 250)
    await page.click("[data-offer-save]")
    await settle(page, 200)
    const msgs = await page.evaluate(() => [...document.querySelectorAll("[data-problem] p")].map((p) => p.textContent).filter((t) => /Tick|Pick|Type|Give/.test(t)))
    expect(msgs.some((t) => /2 to 5 products/.test(t)) && (await sent(page)).length === 0, "Create with no products says so under the field and sends nothing", msgs)
    const font = await page.$eval("#offer-title", (el) => [getComputedStyle(el).fontSize, Math.round(el.getBoundingClientRect().height)])
    expect(phone ? font[0] === "16px" && font[1] >= 44 : font[1] >= 36, `the name field: ${font[0]}, ${font[1]}px high`, font)
    await page.click(`[data-product-picker="offer-products"] [data-pick="${A}"]`)
    await page.click(`[data-product-picker="offer-products"] [data-pick="${B}"]`)
    await settle(page, 120)
    const line = await page.$eval("[data-offer-price]", (el) => el.textContent)
    expect(/\$36(\.00)? instead of \$40(\.00)?/.test(line), `what the buyer pays, from the checkout's arithmetic: "${line}"`)
    await page.screenshot({ path: join(SHOTS, `after-new-bundle-${width}.png`) })
    await page.click("[data-offer-save]")
    await settle(page, 700)
    const posted = (await sent(page)).filter((x) => x.method === "POST")
    const rows = await page.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((el) => el.getClientRects().length > 0).length)
    expect(posted.length === 1 && posted[0].body.kind === "bundle" && posted[0].body.productIds.join() === `${A},${B}` && posted[0].body.discountValue === 10 && posted[0].body.formCurrency === "USD" && !("priceCents" in posted[0].body), "Create sends the bundle, its products and 10%, never a price", posted[0]?.body)
    expect(rows === 4 && !(await page.$("[data-offer-editor]")), "the modal closes and the new row is in the list", rows)
    expect(errors.length === 0, "no script error", errors)
    await ctx.close()

    /* AN UPSELL, from its address (/app/offers/new?kind=checkout). */
    ;({ ctx, page, errors, phone } = await open(width, "checkout"))
    await page.click(`[data-product-picker="offer-products"] [data-pick="${C}"]`)
    await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === "Certain products")?.click())
    await settle(page, 120)
    await page.click(`[data-product-picker="offer-triggers"] [data-pick="${A}"]`)
    await page.evaluate(() => [...document.querySelectorAll('[data-choice-grid] [role="radio"]')].find((b) => b.textContent.trim() === "Amount")?.click())
    await settle(page, 120)
    await page.screenshot({ path: join(SHOTS, `after-new-upsell-${width}.png`) })
    await page.click("[data-offer-save]")
    await settle(page, 600)
    const up = (await sent(page)).find((x) => x.method === "POST")?.body
    expect(up?.kind === "checkout" && up.productIds.join() === C && up.triggerIds.join() === A && up.discountType === "fixed" && up.discountValue === 500 && up.placements.join() === "product,cart,checkout", "an upsell from its own address: one product, its trigger, $5.00 off, shown on the product page, cart and checkout", up)
    await ctx.close()

    /* A QUANTITY BREAK, Buy 2 get 1 free and Buy 3 get 2 free as the modal starts it, then 15% on a third tier. */
    ;({ ctx, page, errors, phone } = await open(width, "quantity"))
    await page.click(`[data-product-picker="offer-products"] [data-pick="${B}"]`)
    await page.click("[data-tier-add]")
    await settle(page, 120)
    await page.screenshot({ path: join(SHOTS, `after-new-quantity-${width}.png`), fullPage: false })
    await page.click("[data-offer-save]")
    await settle(page, 600)
    const qb = (await sent(page)).find((x) => x.method === "POST")?.body
    expect(qb?.kind === "quantity_break" && qb.productIds.join() === B && qb.tiers.length === 3 && qb.tiers[0].quantity === 2 && qb.tiers[0].freeQuantity === 1 && qb.tiers[2].discountType === "percent", "a quantity break: Buy 2 get 1 free, Buy 3 get 2 free, and a third tier at a percent", qb?.tiers)
    const selects = await page.evaluate(() => document.querySelectorAll("select").length)
    expect(selects === 0, "no platform select anywhere in the form", selects)
    await ctx.close()

    /* EDIT, from /app/offers/<id>: Save is off until something changes; Delete asks first. */
    ;({ ctx, page, errors, phone } = await open(width, "edit"))
    const before = await page.$eval("[data-offer-save]", (b) => b.disabled)
    await page.fill("#offer-title", "Breakfast pair")
    const after = await page.$eval("[data-offer-save]", (b) => b.disabled)
    await page.screenshot({ path: join(SHOTS, `after-edit-${width}.png`) })
    await page.click("[data-offer-save]")
    await settle(page, 600)
    const put = (await sent(page)).find((x) => x.method === "PUT")?.body
    const renamed = await page.evaluate(() => document.body.innerText.includes("Breakfast pair"))
    expect(before === true && after === false && put?.id === "11111111-1111-4111-8111-111111111111" && put?.title === "Breakfast pair" && renamed, "edit: Save off until a change, then PUT with the id; the row says the new name", { before, after, put: put && { id: put.id, title: put.title }, renamed })
    await ctx.close()
  }

  /* Reduced motion: the dialog is in place at once. */
  const { ctx, page } = await open(1280, "list", true)
  await page.click("[data-offer-new]")
  const r = await motion(page)
  expect(r.ms <= 50, `with reduced motion the dialog is in place at once (${r.ms}ms)`, r)
  await ctx.close()
}

/* ─── MATERIA ───────────────────────────────────────────────────────── */
if (PART === "all" || PART === "materia") {
  const suite = "tests/offers-r58.test.ts"
  const out = mkdtempSync(join(tmpdir(), "offers-r58-"))
  const cfg = `tsconfig.offers-r58-${process.pid}.generated.json`
  writeFileSync(cfg, JSON.stringify({ compilerOptions: { outDir: out, rootDir: ".", target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", skipLibCheck: true, strict: false, noEmitOnError: false, baseUrl: ".", paths: { "@/*": ["./*"] } }, files: [suite] }))
  try {
    execFileSync(process.execPath, ["--max-old-space-size=4096", "node_modules/typescript/bin/tsc", "-p", cfg], { stdio: "ignore" })
  } catch {
    /* Errors in unrelated files under the loose options; the suite is still emitted. */
  } finally {
    if (existsSync(cfg)) unlinkSync(cfg)
  }
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')
  symlinkSync(join(root, "node_modules"), join(out, "node_modules"), "junction")
  const walk = (d) => readdirSync(d).flatMap((f) => (f === "node_modules" ? [] : statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
  const entry = walk(out).find((f) => basename(f) === "offers-r58.test.js")
  const child = spawn(process.execPath, ["--import", join(root, "scripts/push-test-register.mjs"), entry], { env: { ...process.env, PUSH_TEST_OUT: out, OFFERS_R58_SERVE: "1" }, stdio: ["ignore", "pipe", "inherit"] })
  const port = await new Promise((resolve, reject) => {
    let seen = ""
    child.stdout.on("data", (b) => {
      seen += b.toString()
      const m = /SERVING (\d+)/.exec(seen)
      if (m) resolve(Number(m[1]))
    })
    child.on("exit", (code) => reject(new Error(`the suite ended (${code}) before serving:\n${seen.split("\n").filter((l) => /FAIL|passed/.test(l)).join("\n")}`)))
  })
  process.on("exit", () => child.kill())
  const origin = `http://localhost:${port}`
  const facts = await (await fetch(`${origin}/__facts`)).json()
  const cartJs = (page) => page.evaluate(async () => (await fetch("/cart.js", { headers: { accept: "application/json" } })).json())

  for (const [w, h, tag] of [[390, 844, "phone"], [1280, 900, "desktop"]]) {
    console.log(`\nMATERIA ${tag} ${w}x${h}\n`)
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 768, hasTouch: w < 768 })
    const page = await ctx.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
    await page.addInitScript(() => {
      window.__cls = 0
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
    })
    await page.goto(`${origin}/products/bee-tee`, { waitUntil: "networkidle", timeout: 60000 })
    await settle(page, 1200)
    const tee = await page.evaluate(() => {
      const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
      const up = document.querySelector('storelib-product-offers[data-kind="upsell_pro"]')
      const tiers = [...document.querySelectorAll('storelib-product-offers[data-kind="quantity_offer"] .po-tier__label')].filter(shown).map((e) => e.textContent.trim())
      return { tiers, upsell: up && shown(up) ? up.innerText.replace(/\s+/g, " ").trim().slice(0, 200) : null, cls: Number(window.__cls.toFixed(4)) }
    })
    expect(tee.tiers[0] === "Buy 2 get 1 free" && tee.tiers.length === 2, "the tee's tiers show", tee.tiers)
    expect(!!tee.upsell && /Bee Socks/.test(tee.upsell) && /\$7\.00/.test(tee.upsell), "the socks upsell shows under the buttons, at $7.00 (no Upsell block in the section)", tee.upsell)
    expect(tee.cls < 0.1, `the page's layout shift while the offers draw: ${tee.cls}`)
    const upBox = await page.$('storelib-product-offers[data-kind="upsell_pro"]')
    if (upBox) await upBox.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(SHOTS, `materia-tee-${tag}.png`) })
    /* Tick the upsell, then Add to Cart: both go in, the socks at the offer's price. */
    const ticked = await page.evaluate(() => {
      const root = document.querySelector('storelib-product-offers[data-kind="upsell_pro"]')
      const box = root?.querySelector('input[type="checkbox"], [role="checkbox"], button')
      if (!box) return false
      box.click()
      return true
    })
    await settle(page, 300)
    await page.click("#product-form-main [name=add]").catch(() => null)
    await settle(page, 1800)
    const c1 = await cartJs(page)
    const socks = c1.items?.find((i) => i.product_id === facts.socks || String(i.product_id) === facts.socks)
    /* Materia starts on the tier the break marks (Buy 2 get 1 free), so Add to Cart puts three tees in, the third free. */
    const teeLine = c1.items?.find((i) => String(i.product_id) === facts.tee)
    expect(ticked && !!socks && socks.final_line_price === 700 && teeLine?.quantity === 3 && teeLine?.final_line_price === 6000 && c1.total_price === 6700, "the upsell ticked and Add to Cart on the marked tier: three tees for $60.00 and the socks for $7.00", { ticked, n: c1.item_count, total: c1.total_price, items: c1.items?.map((i) => [i.title, i.quantity, i.final_line_price]) })
    await page.goto(`${origin}/products/honey-mug`, { waitUntil: "networkidle", timeout: 60000 })
    await settle(page, 1200)
    const bundle = await page.evaluate(() => {
      const root = document.querySelector('storelib-product-offers[data-kind="bundle"]')
      return root && root.getClientRects().length ? root.innerText.replace(/\s+/g, " ").trim().slice(0, 300) : null
    })
    expect(!!bundle && /Mug and cap/.test(bundle) && /Bee Cap/.test(bundle), "the mug's bundles show under the buttons (no Bundle block in the section)", bundle)
    const bundleBox = await page.$('storelib-product-offers[data-kind="bundle"]')
    if (bundleBox) await bundleBox.scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(SHOTS, `materia-mug-${tag}.png`) })
    const pressed = await page.evaluate(() => {
      const root = document.querySelector('storelib-product-offers[data-kind="bundle"]')
      const btn = [...(root?.querySelectorAll("button") ?? [])].find((b) => /add/i.test(b.textContent))
      if (!btn) return null
      btn.click()
      return btn.textContent.trim()
    })
    await settle(page, 1800)
    const c2 = await cartJs(page)
    const capLine = c2.items?.find((i) => String(i.product_id) === facts.cap)
    expect(!!pressed && !!capLine && c2.total_discount >= 1000, `the bundle's "${pressed}" puts the cap in beside the mug, and the cart takes the set's 20% off (with the socks' $3.00)`, { n: c2.item_count, total: c2.total_price, discount: c2.total_discount, items: c2.items?.map((i) => [i.title, i.quantity, i.final_line_price]) })
    expect(errors.length === 0, "no uncaught script error", errors.slice(0, 5))
    await ctx.close()
  }
  child.kill()
}

await browser.close()
console.log(broken ? `\n${broken} checks failed` : "\nall checks passed")
console.log(`screenshots: ${SHOTS}`)
process.exit(broken ? 1 : 0)
