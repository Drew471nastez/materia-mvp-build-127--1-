/**
 * THE OVERLAY GROUP OF AN IMPORTED THEME: EVERYTHING THAT FLOATS OVER THE
 * PAGE, IMPORTED, EDITABLE, IN ORDER, DRAWN ONCE.
 *
 * A theme's layout draws its overlay group file ({% sections 'overlay-group' %})
 * and, as often, sections of its own by name: an age verifier before the
 * page, a sticky add to cart bar, a cookie banner and a chat button after
 * the footer, inside a {% liquid %} block or as tags. Each comes into the
 * builder's Overlay group (lib/storelib-theme/shopify/convert.ts) with its
 * values from settings_data.json, in the order the layout draws them, and
 * the page draws each one once, where the layout says, and none switched
 * off. A cart drawer or a sticky add to cart bar is something that floats
 * too (lib/storelib-theme/section-groups.ts), not a header section.
 *
 * The browser half: scripts/check-shopify-theme.ts CHECKS=overlay.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/shopify-overlay-import.test.ts
 */
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}

const plain = (name: string, words: string) => `<div class="${name}">{{ section.settings.text | default: '${words}' }}</div>{% schema %}{"name":"${words}","settings":[{"type":"text","id":"text","label":"Text"}]}{% endschema %}`
const FILES: Record<string, string> = {
  "layout/theme.liquid": `<!doctype html><html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}{% section 'age-verifier' %}<main id="MainContent">{{ content_for_layout }}</main>{% sections 'footer-group' %}{% sections 'overlay-group' %}{% liquid
  section 'sticky-atc'
  section 'cookie-banner'
%}{% section 'chat-widget' %}{% section 'cart-drawer' %}</body></html>`,
  "sections/header.liquid": plain("hdr", "Header"),
  "sections/footer.liquid": plain("ftr", "Footer"),
  "sections/rich.liquid": plain("rich", "Rich text"),
  "sections/mobile-tab-bar.liquid": plain("tabs", "Tab bar"),
  "sections/promo-popup.liquid": plain("promo", "Promo popup"),
  "sections/age-verifier.liquid": plain("age", "Age verifier"),
  "sections/sticky-atc.liquid": plain("atc", "Sticky add to cart"),
  "sections/cookie-banner.liquid": plain("cookie", "Cookie banner"),
  "sections/chat-widget.liquid": plain("chat", "Chat"),
  "sections/cart-drawer.liquid": plain("drawer", "Cart drawer"),
  "sections/header-group.json": `{"type":"header","name":"Header","sections":{"header":{"type":"header"}},"order":["header"]}`,
  "sections/footer-group.json": `{"type":"footer","name":"Footer","sections":{"footer":{"type":"footer"}},"order":["footer"]}`,
  "sections/overlay-group.json": `{"type":"custom.overlay","name":"Overlay","sections":{"tabs":{"type":"mobile-tab-bar","settings":{"text":"Home Shop Cart"}},"promo":{"type":"promo-popup","disabled":true}},"order":["tabs","promo"]}`,
  "templates/index.json": `{"sections":{"r":{"type":"rich"}},"order":["r"]}`,
  "config/settings_schema.json": `[]`,
  "config/settings_data.json": `{"current":{"sections":{"cookie-banner":{"type":"cookie-banner","settings":{"text":"We use cookies"}}}}}`,
}

async function main() {
  const zip = new JSZip()
  for (const [k, v] of Object.entries(FILES)) zip.file(k, v)
  const r = await convertShopifyTheme(zip, { fallbackName: "overlay" })
  if (!r.ok) throw new Error(r.error)
  const home = r.theme.pages.find((p) => p.page_key === "home")!
  const group = (g: string) => home.sections.filter((s) => s.group === g).map((s) => s.id)

  console.log("\nImported\n")
  check("every section the layout floats over the page is in the Overlay group, in the order it is drawn", group("overlay").join() === "tabs,promo,age-verifier,sticky-atc,cookie-banner,chat-widget,cart-drawer", group("overlay"))
  check("  none of them in the header or the footer", group("header").join() === "header" && group("footer").join() === "footer", { header: group("header"), footer: group("footer") })
  check("  the one switched off in the theme is off", home.sections.find((s) => s.id === "promo")?.hidden === true)
  check("  a static one keeps its values from settings_data.json", (home.sections.find((s) => s.id === "cookie-banner")?.settings as { text?: string } | undefined)?.text === "We use cookies")

  console.log("\nDrawn\n")
  const files = r.theme.files
  const theme = themeOfInstall(files, r.theme.settings, { assetUrl: (n) => `/a/${n}`, assetText: () => null })
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const site: SiteData = { creatorId: "c", theme, pages, products: [], collections: [], menus: {}, shop: { name: "S", currency: "USD", moneyFormat: "${{amount}}" }, host: "x" }
  const html = String((await answer(site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })).body)
  const count = (id: string) => (html.match(new RegExp(`id="shopify-section-${id}"`, "g")) ?? []).length
  const shown = ["tabs", "age-verifier", "sticky-atc", "cookie-banner", "chat-widget", "cart-drawer"]
  check("each one shown is drawn once", shown.every((id) => count(id) === 1), Object.fromEntries(shown.map((id) => [id, count(id)])))
  check("  the one switched off is not drawn", count("promo") === 0 && !html.includes('class="promo"'))
  check("  where the layout draws it: the age verifier before the page, the rest after the footer", html.indexOf("shopify-section-age-verifier") < html.indexOf('id="MainContent"') && html.indexOf("shopify-section-footer") < html.indexOf("shopify-section-sticky-atc") && html.indexOf("shopify-section-sticky-atc") < html.indexOf("shopify-section-cookie-banner") && html.indexOf("shopify-section-cookie-banner") < html.indexOf("shopify-section-cart-drawer"))
  check("  with its own values", html.includes('<div class="cookie">We use cookies</div>') && html.includes('<div class="tabs">Home Shop Cart</div>'))
  const one = String((await answer(site, { method: "GET", path: "/", query: new URLSearchParams("section_id=cookie-banner"), body: null, cart: [] })).body)
  check("a theme's script can ask for one of them by its id (section rendering)", one.includes('<div class="cookie">We use cookies</div>') && (one.match(/shopify-section-cookie-banner/g) ?? []).length === 1, one.slice(0, 200))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
