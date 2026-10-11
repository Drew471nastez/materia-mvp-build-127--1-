/**
 * ===========================================================================
 *  A BROKEN THEME STILL DRAWS: THE CASES THAT USED TO BLANK A PAGE
 * ===========================================================================
 *   npx tsx scripts/check-theme-resilience.ts <theme.zip>
 *
 * The stress theme of scripts/check-theme-features.ts with what real themes
 * get wrong put back in: a Liquid typo in the layout, a filter that fails
 * at runtime in the header, an unclosed `{{` at the end, a menu and a
 * featured product named by the handles of the store the theme came from,
 * a popup drawn by a static {% section %}, and an Overlay group section
 * added in the builder with no group file of its own. Each must still draw
 * the header, the footer, the overlay and the page.
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
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
  const files = r.theme.files
  const theme = themeOfInstall(files, r.theme.settings, { assetUrl: (n) => `/assets/${n}`, assetText: (n) => files[`shopify/assets/${n}`] ?? null })
  const products = Array.from({ length: 3 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    settings: { title: `Linen shirt ${i + 1}`, price: `$${40 + i * 5}.00`, image: `https://img.test/p${i}.png`, images: [`https://img.test/p${i}.png`], url: `/products/linen-shirt-${i + 1}`, slug: `linen-shirt-${i + 1}`, kind: "physical", available: true, variants: [{ id: `v-${i}`, name: "Default", price: "", available: true }], options: [] },
  }))
  const menus = { "main-menu": { title: "Main", links: [{ title: "Home", url: "/" }, { title: "Shop", url: "/collections/all" }] } }
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const popupGroup = pages.home?.find((s) => s.id === "promo-popup")?.group
  check("a popup drawn by {% section %} imports into the Overlay group", popupGroup === "overlay", String(popupGroup))
  /* A section added to the Overlay group in the builder: no slot, no group file. */
  pages.home = [...(pages.home ?? []), { id: "added-bar", type: "promo-popup", group: "overlay", settings: { heading: "Added in the builder" } } as never]
  /* A product page holding a stale header of its own and no footer: it wears home's. */
  pages.product = [{ id: "stale", type: "announcement", group: "header", settings: { text: "STALE" } } as never, ...(pages.product ?? []).filter((s) => s.group !== "header" && s.group !== "footer")]
  const site: SiteData = { creatorId: "c", theme, pages, products, collections: [], menus, shop: { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}", policies: [] }, host: "127.0.0.1" }
  const get = async (path: string) => (await answer(site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [], note: "", ajax: false })).body as string

  const home = await get("/")
  const has = (re: RegExp, h = home) => re.test(h)
  check("a Liquid typo in the layout keeps the header", has(/class="site-header"/))
  check("  and the footer", has(/class="site-footer"/))
  check("  and the theme's CSS", has(/<link[^>]+theme\.css/))
  check("  and the overlay group", has(/class="mobile-bottom-nav"/) && has(/popup__title">Get 10% off/))
  check("  `if x and` reads as `if x`", !has(/lax-cond/))
  check("  `| append:` with no value is the value", has(/lax-append">ok</), (home.match(/lax-append">[^<]*/) ?? [""])[0])
  check("  a stray endif is a comment, not a lost page", has(/Template syntax error/))
  check("divided_by: 0 does not stop the header", has(/class="div0">/) && has(/class="nav-link/))
  check("a menu handle of the original store is the shop's main menu", has(/class="nav-link[^"]*" href="\/collections\/all">Shop</))
  check("a featured product handle of the original store is the shop's first product", has(/fp-title">Linen shirt 1</), (home.match(/featured-product">.{0,120}/s) ?? [""])[0].replace(/\s+/g, " "))
  check("a popup from a static {% section %} draws once", (home.match(/class="promo-popup"/g) ?? []).length === 2, `${(home.match(/class="promo-popup"/g) ?? []).length} drawn (1 static + 1 added)`)
  check("an Overlay section added in the builder draws, before </body>", /Added in the builder<\/div><\/div>[\s\S]*<\/body>/.test(home) && has(/id="shopify-section-added-bar"/))

  const product = await get("/products/linen-shirt-2")
  check("a product page wears home's header, not its stale copy", has(/site-header/, product) && !has(/STALE/, product))
  check("  and home's footer, which it lacked", has(/site-footer/, product))
  check("  and the Overlay section added in the builder", has(/Added in the builder/, product))

  console.log(failed ? `\n${failed} failed\n` : "\nall passed\n")
  if (failed) process.exit(1)
}
void main()
