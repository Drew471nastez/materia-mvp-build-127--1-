/**
 * Round R6: each page's search result and share picture, read by the live
 * site whether it is built on Storelib's own themes or on one imported from
 * Shopify, and drawn in the dark on Website settings.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/page-seo-r6.test.ts
 */
import { readFileSync } from "node:fs"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { pageSeoForSite, pageSeoOf, typedPageSeo, withPageSeo } from "../lib/website-builder/page-seo"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")

async function main() {
  console.log("\nA page's own share picture")
  const one = withPageSeo({}, "about", { title: "About us", image: "https://storelib.com/media/a.png" })
  check("kept with its title", JSON.stringify(one) === JSON.stringify({ about: { title: "About us", image: "https://storelib.com/media/a.png" } }), one)
  check("cleared when emptied, the page dropped when nothing is left", JSON.stringify(withPageSeo({ page_seo: one }, "about", { title: "", image: "" })) === "{}")
  check("only an address a crawler can fetch", pageSeoOf({ page_seo: { about: { image: "javascript:alert(1)" } } }, "about").image === undefined && pageSeoOf({ page_seo: { about: { image: "/media/x.png" } } }, "about").image === "/media/x.png")
  check("the field shows what was typed", typedPageSeo({ page_seo: one }, "about").image === "https://storelib.com/media/a.png")

  console.log("\nWhat a page tells a search engine, for a theme that draws its own head")
  const settings = { seo_title: "Lunea", seo_description: "Sounds for producers", seo_og_image: "https://storelib.com/media/site.png", page_seo: { about: { title: "About Lunea", description: "Who we are", image: "https://storelib.com/media/about.png" }, faq: { hidden: true } } }
  check("home is the site's title and description", JSON.stringify(pageSeoForSite(settings, "home")) === JSON.stringify({ title: "Lunea", description: "Sounds for producers", image: "https://storelib.com/media/site.png", noindex: false }))
  check("a page with its own is its own", JSON.stringify(pageSeoForSite(settings, "about")) === JSON.stringify({ title: "About Lunea", description: "Who we are", image: "https://storelib.com/media/about.png", noindex: false }))
  check("a page kept out of search says noindex, with the site's description", pageSeoForSite(settings, "faq").noindex === true && pageSeoForSite(settings, "faq").description === "Sounds for producers")
  check("a product page keeps the product's own title", pageSeoForSite({ ...settings, page_seo: { product: { title: "Not this" } } }, "product").title === undefined)
  check("the whole site switched off in SEO & Social is noindex everywhere", pageSeoForSite({ seo_robots: false }, "about").noindex === true)

  console.log("\nThe imported theme's live pages")
  const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><head><title>{{ page_title }}</title><meta name="description" content="{{ page_description | escape }}"></head><body><main>{{ content_for_layout }}</main></body></html>`),
    "sections/text.storelib": section("text", `<p>Hello</p>`),
  }
  const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
  const site: SiteData = {
    creatorId: "c0ffee00-0000-4000-8000-000000000000", theme, pages: { home: [{ id: "t", type: "text" }], about: [{ id: "t", type: "text" }], faq: [{ id: "t", type: "text" }] },
    products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host: "lunea.test",
    seo: (key) => pageSeoForSite(settings, key),
  }
  const page = async (path: string) => String((await answer(site, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })).body)
  const home = await page("/")
  check("home's <title> and description are SEO & Social's", /<title>Lunea<\/title>/.test(home) && /content="Sounds for producers"/.test(home), home.slice(0, 300))
  check("  with the site's share picture", /<meta property="og:image" content="https:\/\/storelib\.com\/media\/site\.png"/.test(home))
  const about = await page("/pages/about")
  check("a page's own title, description and share picture", /<title>About Lunea<\/title>/.test(about) && /content="Who we are"/.test(about) && /og:image" content="https:\/\/storelib\.com\/media\/about\.png"/.test(about), about.slice(0, 400))
  const faq = await page("/pages/faq")
  check("a page kept out of search says so in its head", /<meta name="robots" content="noindex, follow"/.test(faq))
  check("  and a page that is not, does not", !/name="robots"/.test(about))

  console.log("\nWired in")
  check("the live route hands the theme the site's SEO", /seo: \(key\) => pageSeoForSite\(settings as Record<string, unknown>, key\)/.test(read("lib/website-builder/compat-site.ts")))
  const render = read("app/(site)/w/[username]/render-site.tsx")
  check("Storelib's own pages use a page's own share picture", /own\.image \? \{ \.\.\.settings, seo_og_image: own\.image \} : settings/.test(render))
  const pages = read("components/website-builder/website-settings/pages.tsx")
  check("Website settings › Pages has a social image per page", /Social image/.test(pages) && /set\(\{ image: url \?\? "" \}\)/.test(pages))
  const seo = read("components/website-builder/website-settings/seo.tsx")
  check("the search and share previews are dark on the dark page, not white cards", /<SearchResultPreview/.test(seo) && /<SearchResultPreview compact/.test(pages) && !/rounded-2xl bg-white/.test(seo) && !/rounded-xl bg-white p-4/.test(pages))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
