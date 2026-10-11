/**
 * ===========================================================================
 *  WHAT AN IMPORTED THEME DRAWS, FEATURE BY FEATURE, WITHOUT A BROWSER
 * ===========================================================================
 *   npx tsx scripts/check-theme-features.ts <theme.zip>
 *
 * The import's own converter and the live site's own handler, as
 * scripts/check-shopify-theme.ts uses them, then the HTML of the home page
 * and a product page read for each thing a premium theme leans on: the
 * header and footer (group or plain {% section %}), the overlay group (a
 * phone tab bar, a popup), icons as inline SVG, include and render, the
 * payment icons, the featured product by handle and by product setting, a
 * collection's products, the theme's CSS and JS, and no Liquid left raw.
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import { convertShopifyTheme, conversionSummary } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"

let failed = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

async function main() {
  const zip = await JSZip.loadAsync(readFileSync(process.argv[2]))
  const r = await convertShopifyTheme(zip, { fallbackName: "stress" })
  if (!r.ok) throw new Error(r.error)
  console.log(`${r.theme.name}: ${conversionSummary(r.report)}`)
  for (const n of r.report.notes.slice(0, 40)) console.log("   note:", typeof n === "string" ? n : JSON.stringify(n))
  const files = r.theme.files
  const theme = themeOfInstall(files, r.theme.settings, { assetUrl: (n) => `/assets/${n}`, assetText: (n) => files[`shopify/assets/${n}`] ?? null })
  const products = Array.from({ length: 4 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    settings: { title: `Linen shirt ${i + 1}`, price: `$${40 + i * 5}.00`, compare_price: i === 0 ? "$90.00" : "", image: `https://img.test/p${i}.png`, images: [`https://img.test/p${i}.png`], url: `/products/linen-shirt-${i + 1}`, slug: `linen-shirt-${i + 1}`, kind: "physical", available: true, category: "Shirts", description: "<p>Washed linen.</p>", variants: [{ id: `v-${i}`, name: "Default", price: "", compare_price: "", available: true }], options: [] },
  }))
  const collections = [{ id: "c1", title: "Summer", handle: "summer", description: "", image: "", url: "/collections/summer", products: products.slice(0, 3), products_count: 3 }]
  const menus = { "main-menu": { title: "Main", links: [{ title: "Home", url: "/" }, { title: "Shop", url: "/collections/all" }] } }
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const site: SiteData = { creatorId: "c", theme, pages, products, collections, menus, shop: { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}", policies: [] }, host: "127.0.0.1" }
  const get = async (path: string) => (await answer(site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [], note: "", ajax: false })).body as string

  const home = await get("/")
  const has = (re: RegExp, h = home) => re.test(h)
  check("no Liquid left raw", !has(/\{\{|\{%/), (home.match(/.{0,40}(\{\{|\{%).{0,40}/) ?? [""])[0])
  check("no Liquid error text", !has(/(Liquid|Template) (syntax )?error/i), (home.match(/.{0,60}(Liquid|Template) (syntax )?error.{0,80}/i) ?? [""])[0])
  check("announcement (plain {% section %})", has(/class="announce">Free shipping over \$50/))
  check("header (plain {% section %})", has(/class="site-header"/))
  check("  menu links from linklists", has(/class="nav-link[^"]*" href="\/collections\/all">Shop</))
  check("  icon by {% render 'icon', icon: %}", has(/icon-search/) && has(/icon-menu/))
  check("  icon by {% include %}", has(/icon-cart/))
  check("  custom element kept", has(/<header-drawer/))
  check("footer (plain {% section %})", has(/class="site-footer"/))
  check("  copyright year and link_to", has(/&copy; 20\d\d <a href="\/"[^>]*>Linen &amp; Co<\/a>|&copy; 20\d\d <a href="\/"[^>]*>Linen & Co<\/a>/), (home.match(/footer-copy">.{0,120}/) ?? [""])[0])
  check("  payment icons are pictures, not words", has(/payment-icons"><li><svg/), (home.match(/payment-icons">.{0,200}/) ?? [""])[0])
  check("  customer form", has(/<form[^>]*footer-newsletter/))
  check("overlay group: phone tab bar", has(/class="mobile-bottom-nav"/) && has(/mbn-item" href="\/cart"/))
  check("  its icons, one from an SVG asset", has(/icon-home/) && has(/icon-bag/))
  check("overlay group: popup", has(/<newsletter-popup/) && has(/popup__title">Get 10% off/))
  check("back to top ({% include %} in layout)", has(/class="back-to-top"/))
  check("featured product by all_products[handle]", has(/fp-title">Linen shirt 1</), (home.match(/featured-product">.{0,200}/s) ?? [""])[0].replace(/\s+/g, " ").slice(0, 200))
  check("  its price, compare at and Sale badge", has(/fp-price">\$40\.00/) && has(/fp-compare">\$90\.00/) && has(/badge--sale/))
  check("  its picture by img_url and image_url", has(/fp-image" src="[^"]*img\.test\/p0/) && has(/fp-image-2/))
  check("  its variants and Add to cart", has(/<option value="[^"]+">Default/) && has(/>Add to cart</))
  check("featured product by a product setting", has(/fpo-title">Linen shirt 2</) && has(/fpo-price">\$45\.00/), (home.match(/class="fpo">.{0,160}/) ?? [""])[0])
  const grid = (home.match(/<section class="collection-grid">[\s\S]*?<\/section>/) ?? [""])[0]
  check("a collection's products by handle", (grid.match(/class="card"/g) ?? []).length === 3 && /card-title">Linen shirt 1/.test(grid) && /<h2>Summer<\/h2>/.test(grid))
  check("render ... for over a collection", ((home.match(/<div class="ks-render-for">[\s\S]*?<\/div>/) ?? [""])[0].match(/class="card"/g) ?? []).length === 3)
  check("  the discount badge in the card", has(/class="badge">-5\d%</), (home.match(/class="badge">[^<]*/) ?? [""])[0])
  check("theme CSS (.css.liquid) linked", has(/<link[^>]+theme\.css/), (home.match(/<link[^>]+css[^>]*>/) ?? [""])[0])
  check("vendor.js by script_tag and theme.js", has(/<script[^>]+vendor\.js/) && has(/theme\.js/))
  check("settings colour reaches the page", has(/--brand: #ff3366/))
  const ks = (home.match(/<section class="ks">[\s\S]*?<\/section>/) ?? [""])[0]
  console.log("   kitchen sink:", ks.replace(/\s+/g, " ").slice(0, 1800))
  check("kitchen sink: capture, asset_url, img_tag, render for, tablerow, cycle, json, where/map, paginate", /ks-capture">HELLO LINEN & CO|ks-capture">HELLO LINEN &AMP; CO/i.test(ks) && /ks-asset-img" src="\/assets\/arrow\.svg"/.test(ks) && /<img[^>]+arrow\.svg[^>]*alt="Arrow"/.test(ks) && (ks.match(/class="card"/g) ?? []).length === 3 && /<td[^>]*>Linen shirt 1/.test(ks) && /class="odd">1<\/li><li class="even">2/.test(ks) && /"title":"Linen shirt 1"/.test(ks) && /ks-where">Linen shirt 1, Linen shirt 2, Linen shirt 3/.test(ks) && /ks-paginate">Linen shirt 1;Linen shirt 2;</.test(ks))
  check("  metafield missing is blank, not an error", /ks-meta">\[\]/.test(ks))
  check("  a section's {% style %}, {% stylesheet %} and {% javascript %} reach the page", /\.ks\{color: #ff3366;\}/.test(home) && /ks-capture\{font-weight:700\}/.test(home) && /ksLoaded/.test(home))
  const css = (await answer(site, { method: "GET", path: "/assets/theme.css", query: new URLSearchParams(), body: null, cart: [], note: "", ajax: false })).body as string
  void css

  const product = await get("/products/linen-shirt-3")
  check("product page (templates/product.liquid)", has(/pt-title">Linen shirt 3/, product) && has(/pt-price">\$50\.00/, product), (product.match(/product-template">.{0,160}/) ?? ["no product-template"])[0])
  check("  in the header and footer", has(/site-header/, product) && has(/site-footer/, product))
  check("  and the overlay group", has(/mobile-bottom-nav/, product))

  console.log(failed ? `\n${failed} failed\n` : "\nall passed\n")
  if (failed) process.exit(1)
}
void main()
