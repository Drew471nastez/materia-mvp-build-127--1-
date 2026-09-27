/**
 * ===========================================================================
 *  THE PAGE FROM THE REPORT, BEFORE AND AFTER THE PRODUCTS ARE READ
 * ===========================================================================
 * scripts/render-deleted-product.tsx mounts the real /links component twice:
 * once from the blocks as `onepages.published_blocks` holds them, and once
 * after they have been resolved against the catalogue
 * (lib/onepage/live-products.ts), where one product has been deleted and the
 * other has been repriced since the block was made.
 *
 * Measured at 390px and at 1280px:
 *
 *   BEFORE  the deleted product's row is drawn, with its cover and $29.00,
 *           and its button points at /p/seo-geo-aeo-content-guide
 *   AFTER   that row is not in the page at all, and the product that is
 *           still on sale reads the price and the address it has NOW
 *   PAGE    nothing scrolls sideways at either width
 *
 *   PROBE_CSS=source node scripts/check-deleted-product.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const css = await appCss(root)
const work = join(root, ".deleted-product-probe")
mkdirSync(work, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-deleted-product-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

execFileSync(
  "npx",
  [
    "esbuild", "scripts/render-deleted-product.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    "--banner:js=var process={env:{NODE_ENV:'production'}};",
    `--outfile=${join(work, "app.js")}`, "--log-level=error",
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const js = readFileSync(join(work, "app.js"), "utf8")
writeFileSync(
  join(work, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head>`
    + `<body><div id="before"></div><div id="after"></div>`
    + `<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
)

const DELETED = "SEO + GEO/AEO Content Guide"
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
for (const [label, vp] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1280", { width: 1280, height: 900 }],
]) {
  console.log(`\n${label}`)
  const page = await browser.newPage()
  await page.setViewport(vp)
  await page.setRequestInterception(true)
  page.on("request", (r) => (r.url().startsWith("file:") || r.url().startsWith("data:") ? r.continue() : r.respond({ status: 200, contentType: "text/html", body: "" })))
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`file://${join(work, "index.html")}`)
  await sleep(900)

  const side = (id) =>
    page.evaluate((sel) => {
      const root = document.querySelector(sel)
      const text = root.innerText
      const links = [...root.querySelectorAll("a")].map((a) => a.getAttribute("href") || "")
      const covers = [...root.querySelectorAll("img")].length
      return { text, links, covers }
    }, `#${id}`)

  const before = await side("before")
  const after = await side("after")

  expect(before.text.includes(DELETED), "BEFORE: the deleted product is on the page", before.text.includes(DELETED))
  expect(before.text.includes("$29.00"), "BEFORE: at the price the block remembered", /\$\d+\.\d\d/.exec(before.text)?.[0])
  expect(before.links.some((h) => h.includes("seo-geo-aeo-content-guide")), "BEFORE: with a button to a page that is now a 404",
    before.links.filter((h) => h.includes("/p/")))

  expect(!after.text.includes(DELETED), "AFTER: it is not in the page at all")
  expect(!after.text.includes("$29.00"), "AFTER: and neither is its price")
  expect(!after.links.some((h) => h.includes("seo-geo-aeo-content-guide")), "AFTER: nothing links to it",
    after.links.filter((h) => h.includes("/p/")))

  expect(after.text.includes("Founder Office Hours"), "AFTER: the product still on sale is drawn")
  expect(after.text.includes("$12.00") && !after.text.includes("$9.00"),
    "AFTER: at the price the product has now, not the one the block remembered",
    { has12: after.text.includes("$12.00"), has9: after.text.includes("$9.00") })
  expect(after.links.some((h) => h.includes("/p/office-hours") && !h.includes("office-hours-old")),
    "AFTER: and at the address it has now", after.links.filter((h) => h.includes("/p/")))
  expect(after.covers > 0, "AFTER: the page still has its pictures", after.covers)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow <= 0, "nothing scrolls sideways", overflow)
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))

  await page.screenshot({ path: join(shots, `onepage-deleted-product-${label}.png`), fullPage: true })
  await page.close()
}
await browser.close()

console.log(`\nScreenshots: ${shots}`)
if (broken > 0) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
console.log("\nall ok")
