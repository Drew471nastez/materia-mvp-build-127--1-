/**
 * Round I: a website's browser tab says the same thing on every page kind,
 * for a Storelib theme and an imported one, and Website settings previews
 * exactly that (lib/website-builder/tab-title.ts).
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/tab-title.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pageNumberOf, siteStoreName, siteTabTitle, tabTitleTemplate, withTabTitle, TAB_SEPARATOR } from "../lib/website-builder/tab-title"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { pageSeoForSite } from "../lib/website-builder/page-seo"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const eq = (label: string, got: string, want: string) => check(`${label}: "${want}"`, got === want, { got })

async function main() {
  console.log("\nThe rule, page by page\n")
  {
    const store = "Linen & Co"
    eq("home is the site title exactly", siteTabTitle({ page: { kind: "home" }, storeName: store, siteTitle: "Handmade linen shirts" }), "Handmade linen shirts")
    eq("home with no site title is the store's name", siteTabTitle({ page: { kind: "home" }, storeName: store, siteTitle: "  " }), store)
    eq("a page", siteTabTitle({ page: { kind: "page", name: "About" }, storeName: store }), "About | Linen & Co")
    eq("a page's own SEO title, exactly", siteTabTitle({ page: { kind: "page", name: "About" }, storeName: store, ownTitle: "Our studio in Lisbon" }), "Our studio in Lisbon")
    eq("a product", siteTabTitle({ page: { kind: "product", name: "Linen shirt" }, storeName: store }), "Linen shirt | Linen & Co")
    eq("a product's SEO title, exactly", siteTabTitle({ page: { kind: "product", name: "Linen shirt" }, storeName: store, ownTitle: "Relaxed linen shirt, sand" }), "Relaxed linen shirt, sand")
    eq("a collection", siteTabTitle({ page: { kind: "collection", name: "Summer" }, storeName: store }), "Summer | Linen & Co")
    eq("search with words", siteTabTitle({ page: { kind: "search", query: " shirts  " }, storeName: store }), "Search: shirts | Linen & Co")
    eq("search with none", siteTabTitle({ page: { kind: "search" }, storeName: store }), "Search | Linen & Co")
    eq("cart", siteTabTitle({ page: { kind: "cart" }, storeName: store }), "Your cart | Linen & Co")
    eq("checkout", siteTabTitle({ page: { kind: "checkout" }, storeName: store }), "Checkout | Linen & Co")
    eq("not found", siteTabTitle({ page: { kind: "not-found" }, storeName: store }), "Page not found | Linen & Co")
    eq("page 2 of a list", siteTabTitle({ page: { kind: "collection", name: "Summer" }, storeName: store, pageNumber: 2 }), "Summer | Page 2 | Linen & Co")
    eq("the store is never said twice", siteTabTitle({ page: { kind: "collection", name: "Linen & Co essentials" }, storeName: store }), "Linen & Co essentials")
    eq("whatever its case", siteTabTitle({ page: { kind: "product", name: "LINEN & CO tote" }, storeName: store }), "LINEN & CO tote")
    check("one separator, the one SEO & Social shows", TAB_SEPARATOR === " | ")
    eq("the checkout's template", tabTitleTemplate(store), "%s | Linen & Co")
    eq("no line breaks or runs of spaces", siteTabTitle({ page: { kind: "page", name: "About\n\n us" }, storeName: " Linen\t& Co " }), "About us | Linen & Co")
    eq("the store's name: brand name first", siteStoreName({ brandName: "Linen", storeName: "Linen LLC", displayName: "Ana", handle: "ana" }), "Linen")
    eq("then Store details' name", siteStoreName({ brandName: "", storeName: "Linen LLC", displayName: "Ana", handle: "ana" }), "Linen LLC")
    eq("then the person's", siteStoreName({ storeName: " ", displayName: "Ana Pop", handle: "ana" }), "Ana Pop")
    eq("never 'username | Storelib'", siteStoreName({ handle: "andrewrullz" }), "andrewrullz")
    check("?page= read safely", pageNumberOf("3") === 3 && pageNumberOf(["2"]) === 2 && pageNumberOf("x") === 1 && pageNumberOf("-4") === 1 && pageNumberOf(undefined) === 1)
  }

  console.log("\nAn imported theme's <title> is set to the line\n")
  {
    const dawn = `<html><head><meta charset="utf-8"><title>Old – Shop</title><meta property="og:title" content="Old"><meta name="twitter:title" content='Old'></head><body><svg><title>icon</title></svg></body></html>`
    const out = withTabTitle(dawn, `Summer | Linen & Co`)
    check("the head's <title> says it, escaped", /<title>Summer \| Linen &amp; Co<\/title>/.test(out) && !/Old – Shop/.test(out), out)
    check("and the share card's titles", /property="og:title" content="Summer \| Linen &amp; Co"/.test(out) && /name="twitter:title" content="Summer \| Linen &amp; Co"/.test(out))
    check("nothing in the body is touched", /<svg><title>icon<\/title><\/svg>/.test(out))
    check("a theme with no <title> gets one", /<head><title>Home<\/title>/.test(withTabTitle("<html><head></head><body></body></html>", "Home")))
    check("a document with no head is left alone", withTabTitle("<p>x</p>", "Home") === "<p>x</p>")
  }

  console.log("\nThrough the imported theme's own live page (Dawn's <title> markup)\n")
  {
    const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
    /* Dawn's layout/theme.liquid <title>, word for word, with its og:title. */
    const layout = `<html><head>{{ content_for_header }}<title>{{ page_title }}{%- if current_tags %} &ndash; tagged "{{ current_tags | join: ', ' }}"{% endif -%}{%- if current_page != 1 %} &ndash; Page {{ current_page }}{% endif -%}{%- unless page_title contains shop.name %} &ndash; {{ shop.name }}{% endunless -%}</title><meta property="og:title" content="{{ page_title | default: shop.name }}"></head><body><h1 class="pt">{{ page_title }}</h1>{{ content_for_layout }}</body></html>`
    const files = { "layout/theme.storelib": wrapCompatTemplate(layout), "sections/hero.storelib": section("hero", `<p>hi</p>`) }
    const hero = [{ id: "hero", type: "hero" }]
    const settings = { seo_title: "Handmade linen shirts", page_seo: { about: { title: "Our studio in Lisbon" } } }
    const card = { id: "p1", type: "product", settings: { title: "Linen shirt", slug: "linen-shirt", price: 4000, seo_title: "Relaxed linen shirt, sand" } }
    const plainCard = { id: "p2", type: "product", settings: { title: "Tote", slug: "tote", price: 2000 } }
    const site: SiteData = {
      creatorId: "c",
      theme: new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` }),
      pages: { home: hero, about: hero, contact: hero, product: hero, collection: hero, search: hero, cart: hero, collections: hero },
      products: [card, plainCard] as never,
      collections: [{ id: "k1", title: "Summer", handle: "summer", products: [card] as never, products_count: 1 }] as never,
      menus: {},
      shop: { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}" },
      host: "linen.test",
      seo: (key) => pageSeoForSite(settings, key),
    }
    const tab = async (url: string) => {
      const [p, q] = url.split("?")
      const r = await answer(site, { method: "GET", path: p, query: new URLSearchParams(q ?? ""), body: null, cart: [] })
      const html = String(r.body)
      return { title: (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/&amp;/g, "&"), og: (html.match(/property="og:title" content="([^"]*)"/)?.[1] ?? "").replace(/&amp;/g, "&"), pt: html.match(/<h1 class="pt">([\s\S]*?)<\/h1>/)?.[1] ?? "", status: r.status }
    }
    const home = await tab("/")
    eq("home: the site title exactly, not '<title> – <shop>'", home.title, "Handmade linen shirts")
    check("and its share title the same", home.og === home.title, home)
    eq("a page with its own SEO title", (await tab("/pages/about")).title, "Our studio in Lisbon")
    eq("a page without", (await tab("/pages/contact")).title, "Contact | Linen & Co")
    const product = await tab("/products/linen-shirt")
    eq("a product's SEO title, exactly", product.title, "Relaxed linen shirt, sand")
    check("and it is the theme's page_title too, as on Shopify", product.pt === "Relaxed linen shirt, sand", product)
    eq("a product without one", (await tab("/products/tote")).title, "Tote | Linen & Co")
    eq("a collection", (await tab("/collections/summer")).title, "Summer | Linen & Co")
    eq("its second page", (await tab("/collections/summer?page=2")).title, "Summer | Page 2 | Linen & Co")
    eq("the collections list", (await tab("/collections")).title, "Collections | Linen & Co")
    eq("search", (await tab("/search?q=shirt")).title, "Search: shirt | Linen & Co")
    eq("cart", (await tab("/cart")).title, "Your cart | Linen & Co")
    const missing = await tab("/nothing-here-at-all/really")
    check(`not found: "Page not found | Linen & Co"`, missing.status === 404 && missing.title === "Page not found | Linen & Co", missing)
  }

  console.log("\nOne function behind every place that says it\n")
  {
    const render = read("app/(site)/w/[username]/render-site.tsx")
    check("the live page's metadata uses it", /const rawTitle = siteTabTitle\(\{/.test(render) && /title: \{ absolute: rawTitle \}/.test(render))
    check("and so does the share card", /themeMetadata\([^)]*\{ title: rawTitle,/.test(render))
    check("no more '{username} | Storelib' anywhere on a website", !/\| Storelib`/.test(render))
    check("a preview link's tab is the draft page's", /THE PREVIEW'S TAB IS THE PAGE'S/.test(render) && /previewInstall\(username, previewToken\)/.test(render))
    const routes = "app/(site)/w/[username]"
    check("cart says 'Your cart', never 'Cart | Storelib'", /\{ page: \{ kind: "cart" \} \}/.test(read(`${routes}/cart/page.tsx`)) && !/title: "Cart"/.test(read(`${routes}/cart/page.tsx`)))
    check("search says what was searched", /kind: "search", query: q \?\? ""/.test(read(`${routes}/search/page.tsx`)))
    check("a collection says its own name", /kind: "collection", name/.test(read(`${routes}/collections/[handle]/page.tsx`)))
    check("the shop says its page", /pageNumber: pageNumberOf\(asked\.page\)/.test(read(`${routes}/products/page.tsx`)))
    check("a product page", /siteTabTitle\(\{ page: \{ kind: "product", name \}, storeName: site\.brand, ownTitle \}\)/.test(read("components/website-builder/theme/render-product.tsx")))
    check("the 404", /siteTabTitle\(\{ page: \{ kind: "not-found" \}/.test(read("lib/website-builder/published-site.ts")))
    check("the checkout", /tabTitleTemplate\(brand\.name\)/.test(read("app/checkout/site/layout.tsx")) && !/·/.test(read("app/checkout/site/layout.tsx").replace(/\/\*[\s\S]*?\*\//g, "")))
    check("an imported theme's live page", /withTabTitle\(out, tabTitleOf\(site, route\.page, route\.ownTitle\)\)/.test(read("lib/storelib-theme/compat/site.ts")))
    const seo = read("components/website-builder/website-settings/seo.tsx")
    check("SEO & Social previews with it", /siteTabTitle\(\{ page: \{ kind: "home" \}, storeName: store, siteTitle:/.test(seo) && /<BrowserTabPreview/.test(seo))
    check("and its placeholder is the store's name", /placeholder=\{preview\.store\}/.test(seo) && !/\| Storelib/.test(seo))
    check("Pages previews each page with it", /siteTabTitle\(\{ page: key === "404"/.test(read("components/website-builder/website-settings/pages.tsx")))
    check("General's favicon row shows the same home tab", /<BrowserTabPreview icon=\{[^}]*\}[^>]*title=\{homeTitle\}/.test(read("components/website-builder/website-settings/general.tsx")))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("an empty site title is no longer filled with '{username} | Storelib'", !/const canonical = `\$\{handle\} \| Storelib`/.test(editor) && /NO MADE UP SITE TITLE/.test(editor))
    /* Changed on purpose (round I): "{username} | Storelib", the one the editor wrote most, is cleared as an old default too. */
    check("only the titles the editor wrote itself are cleared", /current === "My Store \| Storelib" \|\| madeUp\.includes\(current\.toLowerCase\(\)\)/.test(editor) && /\[inst\.name, data\.username, data\.siteHandle\]/.test(editor))
    /* A live page moves to the next by loading it whole (lib/website-builder/live-navigation.ts), so each tab comes from that page's own <title>; the 404 drawn in place sets it itself. */
    check("live navigation loads whole pages, so the tab is each page's own", /cross-document view transition/.test(read("lib/website-builder/live-navigation.ts")) && /document\.title = page\.title/.test(read("components/website-builder/site-not-found-page.tsx")))
  }

  console.log("\nThe favicon picker is small\n")
  {
    const picker = read("components/website-builder/editor/image-picker.tsx")
    check("its own layout, a 48px tile", /layout === "icon"/.test(picker) && /h-12 w-12 shrink-0/.test(picker))
    check("on a checkerboard, so a transparent icon reads", /conic-gradient\(/.test(picker))
    check("Upload, or Replace and Remove, as words", /shown \? "Replace" : "Upload"/.test(picker) && /data-wb-image-remove/.test(picker))
    check("the whole row takes a dropped picture", /data-wb-image-layout="icon"[\s\S]{0,600}onDrop=/.test(picker))
    check("checked like every other upload", /if \(!ALLOWED_TYPES\.has\(file\.type\)\)/.test(picker) && /MAX_IMAGE_BYTES/.test(picker))
    const general = read("components/website-builder/website-settings/general.tsx")
    check("no big box in General", !/max-w-\[220px\]/.test(general) && /layout="icon"/.test(general))
    check("still saved with the draft", /<Card footer=\{GOES_LIVE\}>\s*\n\s*<Row label="Favicon"/.test(general))
  }

  /* Round I: the site title the editor wrote by itself reads as empty, so the home tab is the store's name. */
  check("an old made-up site title ({handle} | Storelib) gives the store's name on home", siteTabTitle({ page: { kind: "home" }, storeName: "AndrewRullz", siteTitle: "andrewrullz | Storelib" }) === "AndrewRullz")
  check("and a title the creator wrote stays exactly", siteTabTitle({ page: { kind: "home" }, storeName: "AndrewRullz", siteTitle: "AndrewRullz | Posture gear" }) === "AndrewRullz | Posture gear")
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
main()
