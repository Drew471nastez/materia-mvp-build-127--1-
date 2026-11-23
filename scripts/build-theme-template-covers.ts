/**
 * ===========================================================================
 *  THE TEMPLATES' COVERS: EACH HOME PAGE, DRAWN BY STORELIB'S OWN ENGINE
 * ===========================================================================
 *   npx tsx scripts/build-theme-template-covers.ts [template ...] [--out DIR] [--pages] [--all] [--empty] [--png]
 *
 * For each template in CODE_TEMPLATES (or the ones named): compose it from
 * theme-packages/, import it with the converter Add uses, serve it with the
 * compat engine's answer() (scripts/theme-templates/site.ts) and photograph
 * its home page whole in Chromium, at 1440 wide and at a phone's 390. The
 * two pictures are the listing's cover and second screenshot:
 *
 *   public/themes/materia/<template>.webp
 *   public/themes/materia/<template>-phone.webp
 *
 * The shop on the cover is the template's sample shop (scripts/theme-
 * templates/shops.ts): a few products with pictures, as a creator's store
 * has them. --empty draws a store with no products yet instead, and --pages
 * the product, collection, about, contact and FAQ pages too, and --all every
 * other page a template has (with --pages); all three write PNGs to --out for
 * looking at, never to public/.
 *
 * Prints what the import reported, what the page asked for and did not get,
 * and what the theme's scripts threw. No database, no live store.
 *
 * REBUILD THE LIVE PREVIEWS WITH THE COVERS. The marketplace's Preview frames
 * each template's real website, prerendered to public/theme-previews/ by
 *
 *   npx tsx scripts/build-template-previews.ts [template ...]
 *
 * A template changed here is changed there only once that has run too.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { importTemplate, serve, siteFor } from "./theme-templates/site"
import { SAMPLE_SHOPS } from "./theme-templates/shops"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const args = process.argv.slice(2)
const flag = (n: string) => args.includes(n)
const value = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const OUT = value("--out")
const names = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The whole page as one picture, a screen at a time. Chromium's own "full
 * page" capture paints what is off screen without the theme having shown it
 * (product cards came out empty), so the page is scrolled as a visitor
 * scrolls it and each screen is photographed where it stands. What is fixed
 * to the screen (a sticky header, back to top, the phone tab bar) is let go
 * of, or it would be in every one.
 */
async function wholePage(p: import("puppeteer-core").Page, width: number, height: number, scale: number): Promise<Buffer> {
  /* Let go of before the first screen: what sticks while scrolling keeps its place in the page, and what floats over it (back to top, the phone tab bar) is left out. The header stays for the first screen. */
  const release = (headerToo: boolean) =>
    p.evaluate((all) => {
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const pos = getComputedStyle(el).position
        const inHeader = !!el.closest(".shopify-section-group-header-group, header")
        if (pos === "sticky") el.style.setProperty("position", "static", "important")
        else if (pos === "fixed" && el.offsetHeight > 0 && el.offsetHeight < innerHeight * 0.5 && (all || !inHeader)) el.style.setProperty("display", "none", "important")
      }
    }, headerToo)
  await release(false)
  await sleep(300)
  const total = await p.evaluate(() => document.documentElement.scrollHeight)
  const tiles: { input: Buffer; top: number; left: number }[] = []
  for (let y = 0; y < total; y += height) {
    const at = await p.evaluate(async (to) => {
      scrollTo(0, to)
      await new Promise((r) => setTimeout(r, 350))
      return scrollY
    }, y)
    /* A header that pins itself only once the page has scrolled is let go of here, past the first screen. */
    if (y > 0) { await release(true); await sleep(120) }
    const shot = Buffer.from((await p.screenshot({ type: "png" })) as Uint8Array)
    /* The last screen stops short of where it was asked to go: only its new part is kept. */
    const skip = Math.round((y - at) * scale)
    const input = skip > 0 ? await sharp(shot).extract({ left: 0, top: skip, width: Math.round(width * scale), height: Math.round(height * scale) - skip }).toBuffer() : shot
    tiles.push({ input, top: Math.round(y * scale), left: 0 })
  }
  return sharp({ create: { width: Math.round(width * scale), height: Math.round(total * scale), channels: 3, background: "#ffffff" } }).composite(tiles).png().toBuffer()
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] })
  let failed = 0
  try {
    for (const t of CODE_TEMPLATES.filter((x) => names.length === 0 || names.includes(x.template))) {
      const id = `${CODE_THEME_PACKAGE}/${t.template}`
      const imported = await importTemplate(id)
      const shop = SAMPLE_SHOPS[t.template] ?? { name: t.name, products: [] }
      const built = siteFor(imported, { name: shop.name, products: flag("--empty") ? [] : shop.products })
      const { base, server, missing } = await serve(built, join("scripts", "theme-templates", "products", t.template), { eager: true })
      const firstProduct = built.site.products[0]?.settings.slug as string | undefined
      const pages: [string, string][] = [["home", "/"]]
      if (flag("--pages")) pages.push(["product", firstProduct ? `/products/${firstProduct}` : "/products/sample"], ["collection", "/collections/all"], ["about", "/pages/about"], ["contact", "/pages/contact"], ["faqs", "/pages/faqs"])
      /* --all: every other page the template carries (a lookbook, a licence, tour dates), and the pages the theme's own files draw. */
      if (flag("--all")) {
        const drawn = new Set(["home", "product", "collection", "about", "contact", "faqs", "cart", "search", "404", "collections", "list-collections", "blog", "article", "password", "page", "wishlist"])
        for (const key of Object.keys(built.site.pages)) if (!drawn.has(key)) pages.push([key, `/pages/${key}`])
        pages.push(["collections", "/collections"], ["cart", "/cart"], ["search", "/search"], ["notfound", "/pages-that-are-not/here"])
      }
      console.log(`\n${t.name} (${id}): ${imported.fileCount} files, ${(imported.zipBytes / 1048576).toFixed(1)} MB, skipped ${imported.report.skipped.length}, notes ${imported.report.notes.length}`)
      for (const [vpName, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]] as const) {
        for (const [pageName, path] of pages) {
          const p = await browser.newPage()
          await p.setViewport(vp)
          const errors: string[] = []
          p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
          await p.evaluateOnNewDocument("window.__name = (f) => f")
          const res = await p.goto(`${base}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => { errors.push(String(e).slice(0, 120)); return null })
          /*
            As a visitor with a mouse sees the cards (templates round 23):
            headless Chromium answers (hover: none), cannot be told
            otherwise, and the cards then drew their quick view button, their
            add to cart bar and their second picture on every card.
          */
          await p.addStyleTag({ content: ".product-item .pc-qv, .product-item .product-grid .product-item__inner .pc-form--media { opacity: 0 !important; } .product-item .product__media.show_secondary.peek-secondary > .secondary-image { opacity: 0 !important; }" }).catch(() => undefined)
          /* Scrolled top to bottom once, so pictures loaded lazily and sections revealed on scroll are in the photograph. */
          await p.evaluate(async () => {
            const step = Math.round(innerHeight * 0.8)
            for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
            scrollTo(0, 0)
          }).catch(() => undefined)
          await sleep(900)
          const facts = await p.evaluate(() => ({
            height: document.documentElement.scrollHeight,
            sections: document.querySelectorAll("[id^='shopify-section-']").length,
            broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc.slice(0, 120)),
            overflow: document.documentElement.scrollWidth - innerWidth,
            vendor: /shopify/i.test(document.body.innerText),
          })).catch(() => null)
          const png = await wholePage(p, vp.width, vp.height, "deviceScaleFactor" in vp ? vp.deviceScaleFactor : 1)
          const ok = !!res && (res.status() < 400 || (pageName === "notfound" && res.status() === 404)) && !!facts && facts.broken.length === 0 && !facts.vendor
          if (!ok) failed++
          console.log(`  ${ok ? "ok  " : "FAIL"} ${vpName} ${pageName}: ${res?.status() ?? "no answer"}, ${facts?.sections} sections, ${facts?.height}px tall, overflow ${facts?.overflow}px${facts?.broken.length ? `, broken pictures ${JSON.stringify(facts.broken)}` : ""}${errors.length ? `, script errors ${JSON.stringify([...new Set(errors)].slice(0, 4))}` : ""}`)
          if (OUT || flag("--pages") || flag("--all") || flag("--empty") || flag("--png")) {
            const dir = OUT ?? join("scripts", "theme-templates", ".out")
            mkdirSync(dir, { recursive: true })
            writeFileSync(join(dir, `${t.template}-${pageName}-${vpName}${flag("--empty") ? "-empty" : ""}.png`), png)
          } else if (pageName === "home") {
            const dir = join("public", "themes", CODE_THEME_PACKAGE)
            mkdirSync(dir, { recursive: true })
            const width = vpName === "desktop" ? 1200 : 390
            await sharp(png).resize({ width }).webp({ quality: vpName === "desktop" ? 72 : 74 }).toFile(join(dir, `${t.template}${vpName === "phone" ? "-phone" : ""}.webp`))
          }
          await p.close()
        }
      }
      if (missing.length) console.log(`  asked for and not there: ${JSON.stringify([...new Set(missing)].slice(0, 12))}`)
      server.close()
    }
  } finally {
    await browser.close()
  }
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
