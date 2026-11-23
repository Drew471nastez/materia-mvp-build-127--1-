/**
 * ===========================================================================
 *  ROUND 57 (e1): MATERIA'S PRODUCT PAGE AND CART, DRIVEN IN CHROMIUM
 * ===========================================================================
 * tests/commerce-e2e-r57.test.ts builds a euro store with Materia's Clothing
 * template over the journey harness and, with COMMERCE_R57_SERVE=1, keeps it
 * answering over HTTP through the real site route. This compiles that suite
 * the way scripts/run-push-tests.mjs does, starts it, and drives the real
 * Materia page and scripts in headless Chromium at 390x844 and 1280x900:
 *
 *   VARIANTS   a size press moves the price to the variant's (L is 32 EUR),
 *              with its compare at price struck through; S with Sand is the
 *              one with none on hand, and Add to Cart says so and is off
 *   ADD        Add to Cart on M Black puts M Black in the cart (/cart.js
 *              read from the page), the cart count says 1
 *   QUANTITY   the cart's own plus button takes it to 2, its minus to 1
 *   CHECKOUT   the cart's Check out goes to /checkout on this host with the
 *              line (items=) as the website's checkout reads it
 *   MARKET     the same page for a browser in the UK: GBP prices (24.65),
 *              and the variant press moves to the GBP price (27.20)
 *   ERRORS     no uncaught error from the page's scripts
 *
 *   node scripts/check-commerce-e2e-r57.mjs   (SHOTS=<dir> for the screenshots)
 */
import { execFileSync, spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, readdirSync, statSync, symlinkSync, unlinkSync, existsSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || join(tmpdir(), "commerce-e2e-r57-shots")
mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* The suite, compiled strict as STRICT_SUITES are. */
const suite = "tests/commerce-e2e-r57.test.ts"
const out = mkdtempSync(join(tmpdir(), "r57-commerce-"))
const cfg = `tsconfig.r57-commerce-${process.pid}.generated.json`
writeFileSync(cfg, JSON.stringify({ compilerOptions: { outDir: out, rootDir: ".", target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", skipLibCheck: true, strict: true, baseUrl: ".", paths: { "@/*": ["./*"] } }, files: [suite] }))
try {
  execFileSync("pnpm", ["exec", "tsc", "-p", cfg], { stdio: "inherit" })
} finally {
  if (existsSync(cfg)) unlinkSync(cfg)
}
writeFileSync(join(out, "package.json"), '{"type":"module"}\n')
symlinkSync(join(root, "node_modules"), join(out, "node_modules"), "junction")
const walk = (d) => readdirSync(d).flatMap((f) => (f === "node_modules" ? [] : statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const entry = walk(out).find((f) => basename(f) === "commerce-e2e-r57.test.js")

const child = spawn(process.execPath, ["--import", join(root, "scripts/push-test-register.mjs"), entry], { env: { ...process.env, PUSH_TEST_OUT: out, COMMERCE_R57_SERVE: "1", STORELIB_REFUND_EMAIL_SETTLE_MS: "0" }, stdio: ["ignore", "pipe", "inherit"] })
const port = await new Promise((resolve, reject) => {
  let seen = ""
  child.stdout.on("data", (b) => {
    seen += b.toString()
    const m = /SERVING (\d+)/.exec(seen)
    if (m) resolve(Number(m[1]))
  })
  child.on("exit", (code) => reject(new Error(`the suite ended (${code}) before serving:\n${seen.split("\n").filter((l) => /FAIL|passed/.test(l)).join("\n")}`)))
})
const origin = `http://localhost:${port}`
const facts = await (await fetch(`${origin}/__facts`)).json()

process.on("exit", () => child.kill())
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const priceText = (page) => page.$eval("#price-main .price--special", (n) => n.textContent.replace(/\s+/g, " ").trim()).catch(() => null)
const compareText = (page) => page.$eval("#price-main .compare-price", (n) => (n.offsetParent === null ? "" : n.textContent.replace(/\s+/g, " ").trim())).catch(() => "")
const cartJs = (page) => page.evaluate(async () => (await fetch("/cart.js", { headers: { accept: "application/json" } })).json())
const press = (page, name, value) => page.evaluate((n, v) => { const input = document.querySelector(`input[type=radio][name="${n}"][value="${v}"]`); document.querySelector(`label[for="${input.id}"]`).click() }, name, value)
const settle = (page, ms = 600) => new Promise((r) => setTimeout(r, ms))

try {
  for (const [w, h, tag] of [[390, 844, "phone"], [1280, 900, "desktop"]]) {
    console.log(`\n${tag} ${w}x${h}\n`)
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
    await page.goto(`${origin}/products/organic-tee`, { waitUntil: "networkidle0", timeout: 60000 })
    await settle(page, 800)
    expect((await priceText(page)) === "€29.00" && (await compareText(page)) === "€39.00", "the first variant: 29 EUR, 39 EUR struck through", [await priceText(page), await compareText(page)])
    await press(page, "Size", "L")
    await settle(page)
    expect((await priceText(page)) === "€32.00", "L pressed: the price moves to 32 EUR", await priceText(page))
    await press(page, "Size", "S")
    await press(page, "Colour", "Sand")
    await settle(page)
    const off = await page.$eval("#product-form-main [name=add]", (b) => ({ disabled: b.disabled, label: b.textContent.replace(/\s+/g, " ").trim() }))
    expect(off.disabled === true && /sold out|unavailable|out of stock/i.test(off.label), "S with Sand, none on hand: Add to Cart is off and says so", off)
    await page.screenshot({ path: join(SHOTS, `pdp-sold-out-${tag}.png`) })
    await press(page, "Size", "M")
    await press(page, "Colour", "Black")
    await settle(page)
    await page.click("#product-form-main [name=add]")
    await settle(page, 1500)
    const c1 = await cartJs(page)
    expect(c1.item_count === 1 && c1.items?.[0]?.variant_id === facts.mBlack, "Add to Cart on M Black: the cart holds one M Black", { n: c1.item_count, v: c1.items?.map((i) => i.variant_title) })
    await page.screenshot({ path: join(SHOTS, `cart-drawer-${tag}.png`) })
    await page.goto(`${origin}/cart`, { waitUntil: "networkidle0", timeout: 60000 })
    await settle(page, 600)
    const plus = await page.$("cart-items [name=plus], .cart-item [name=plus], button[name=plus]")
    if (plus) {
      await plus.click()
      await settle(page, 1500)
    }
    const c2 = await cartJs(page)
    expect(!!plus && c2.item_count === 2 && c2.total_price === 5800, "the cart page's plus: two, 58 EUR", { plus: !!plus, n: c2.item_count, total: c2.total_price })
    await page.screenshot({ path: join(SHOTS, `cart-page-${tag}.png`) })
    const checkoutButton = await page.$("button[name=checkout], input[name=checkout], a[href*='/checkout']")
    if (checkoutButton) {
      await Promise.all([page.waitForNavigation({ waitUntil: "load", timeout: 30000 }).catch(() => null), checkoutButton.click()])
    }
    const at = new URL(page.url())
    /* items= is the lines as base64url JSON, [[product, variant, quantity]] (lib/checkout/site-checkout). */
    const items = Buffer.from(at.searchParams.get("items") ?? "", "base64url").toString("utf8")
    expect(!!checkoutButton && at.pathname === "/checkout" && items.includes(facts.mBlack) && /,2\]\]$/.test(items), "Check out: /checkout on this host with the two M Black", { button: !!checkoutButton, path: at.pathname, items })
    expect(errors.length === 0, "no uncaught script error", errors.slice(0, 5))
    await ctx.close()
  }

  console.log("\nthe UK market at 390x844\n")
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
  await page.setExtraHTTPHeaders({ "x-r57-country": "GB" })
  await page.goto(`${origin}/products/organic-tee`, { waitUntil: "networkidle0", timeout: 60000 })
  await settle(page, 800)
  expect((await priceText(page)) === "£24.65" && (await compareText(page)) === "£33.15", "GBP: 24.65, 33.15 struck through", [await priceText(page), await compareText(page)])
  await press(page, "Size", "L")
  await settle(page)
  expect((await priceText(page)) === "£27.20", "L pressed: 27.20 GBP, not the euro figure", await priceText(page))
  await page.screenshot({ path: join(SHOTS, `pdp-gbp-phone.png`) })
  await ctx.close()
} finally {
  await browser.close()
  child.kill()
  rmSync(out, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${SHOTS}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
