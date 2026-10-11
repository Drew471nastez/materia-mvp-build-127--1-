/**
 * An imported Shopify theme that is not perfect still draws, as Shopify
 * draws it: a Liquid typo is a comment and not a lost layout, a tag that
 * fails at runtime is a comment where it stood, the Overlay group's own
 * sections draw, the original store's handles fall back to this shop's
 * products and menus, and an `html` setting keeps its SVG and its style.
 *
 *   npx tsx tests/compat-resilience.test.ts
 */
import { Ctx, renderString } from "../lib/storelib-theme/compat/runtime"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { parseCompat } from "../lib/storelib-theme/compat/parser"
import { typedValue } from "../lib/storelib-theme/compat/objects"
import { compatOf } from "../lib/storelib-theme/compat/install"
import { floatsOverPage } from "../lib/storelib-theme/section-groups"
import { compatHtmlFieldsOf, htmlFieldsOf, sanitizeSettings } from "../lib/website-builder/sanitize"
import { sanitizeSection } from "../lib/website-builder/sanitize-sections"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}

const throws = (f: () => unknown) => {
  try {
    f()
    return false
  } catch {
    return true
  }
}

async function main() {
console.log("\nLiquid read leniently\n")
{
  const env = { snippet: () => null, filter: (n: string) => (n === "boom" ? () => { throw new Error("no way") } : compatFilter(n)) }
  const lax = (src: string, g: Record<string, unknown> = {}) => renderString(src, new Ctx(g, env), { lax: true })
  check("strict reading still refuses a typo (the import report and the code editor's save)", throws(() => parseCompat("{% if x and %}a{% endif %}")) && throws(() => parseCompat("{{ x")) && throws(() => parseCompat("{% endif %}")))
  check("`if x and` reads as `if x`", lax("{% if x and %}yes{% endif %}", { x: true }) === "yes" && lax("{% if x and %}yes{% endif %}", { x: false }) === "")
  check("`| append:` with no value is the value", lax("{{ 'a' | append: }}") === "a")
  check("a stray end tag is a comment and the rest draws", /^<!-- Template syntax error[^>]*-->after$/.test(lax("{% endif %}after")), lax("{% endif %}after"))
  check("a block never closed draws to the end of the file", lax("{% if true %}open") === "open")
  check("an unclosed {{ is text", lax("a {{ b") === "a {{ b")
  check("a {% for %} that is not \"item in list\" is a comment", /Template syntax error/.test(lax("{% for x %}y{% endfor %}z")) && lax("{% for x %}y{% endfor %}z").endsWith("z"))
  check("an unclosed comment runs to the end", lax("a{% comment %}hidden") === "a")
  check("a {% liquid %} line that is not a tag is skipped", lax("{% liquid\n  assign a = 'ok'\n  ???\n  echo a\n%}") === "ok")
  check("a `when` that does not read does not lose the case", lax("{% case 1 %}{% when , %}a{% else %}b{% endcase %}") === "b" || lax("{% case 1 %}{% when , %}a{% else %}b{% endcase %}") === "a")
  const out = lax("<h1>{{ 'x' | boom }}</h1><p>{{ 'still here' }}</p>")
  check("a filter that fails is a comment where it stood, and the rest of the section draws", /^<h1><!-- Template error \(line 1\): no way --><\/h1><p>still here<\/p>$/.test(out), out)
  check("  a comment never closes early or opens markup", !/<!-- Template error[^>]*--[^>]/.test(lax("{{ 'x' | boom }}")))
}

console.log("\nThe original store's handles\n")
{
  const card = (i: number) => ({ id: `p${i}`, settings: { title: `Shirt ${i}`, slug: `shirt-${i}`, price: "$10.00" } })
  const r = { products: [card(1), card(2)], collections: [], menus: { "main-menu": { title: "Main", links: [{ title: "Shop", url: "/collections/all" }] }, footer: { title: "Footer", links: [{ title: "Terms", url: "/terms" }] } }, imageUrl: (v: string) => v, schemes: {}, currentPath: "/" } as never
  const p = typedValue("product", "the-original-store-shirt", r) as { title?: string } | null
  check("a product handle this shop lacks is its first product", p?.title === "Shirt 1", p)
  check("  a handle it has is that product", (typedValue("product", "shirt-2", r) as { title?: string } | null)?.title === "Shirt 2")
  check("  no product picked stays empty", typedValue("product", "", r) === null)
  const list = typedValue("product_list", ["gone-1", "gone-2"], r) as unknown[]
  check("a product list of handles this shop lacks is as many of its products", list.length === 2)
  const menu = typedValue("link_list", "main-menu-1", r) as { links?: { title: string }[] }
  check("a menu handle this shop lacks is its main menu", menu?.links?.[0]?.title === "Shop", menu)
  const foot = typedValue("link_list", "footer-legal", r) as { links?: { title: string }[] }
  check("  a footer's is its footer menu", foot?.links?.[0]?.title === "Terms", foot)
}

console.log("\nGroups\n")
{
  check("a popup, a phone tab bar and back to top float over the page", ["promo-popup", "newsletter_popup", "mobile-bottom-nav", "mobile_nav_bar", "back-to-top", "sticky-tab-bar"].every(floatsOverPage))
  check("  a header, a footer and a hero do not", !["header", "footer", "hero-banner", "featured-collection"].some(floatsOverPage))
  const c = compatOf({ compat: { kind: "shopify", theme: "T", chrome_groups: { "main-header": "header", "x": "evil" } } })
  check("a header group under the theme's own name is kept, nothing else", c?.chrome_groups?.["main-header"] === "header" && !("x" in (c?.chrome_groups ?? {})))
}

console.log("\nAn imported section's settings, saved\n")
{
  const fields = [{ id: "custom", type: "html" }, { id: "description", type: "textarea" }, { id: "intro", type: "richtext" }]
  const svg = `<svg class="icon"><use href="#i"/></svg><style>.x{color:red}</style><my-el>x</my-el>`
  const own = { banner: { section: compatHtmlFieldsOf(fields), blocks: {}, exact: true } }
  const out = sanitizeSection({ type: "banner", settings: { custom: svg, description: `<span style="color:red">${svg}</span>`, intro: `<p onclick="x()">Hi</p><script>alert(1)</script>` } }, own)
  check("an `html` setting keeps its SVG, style and custom element", out.settings?.custom === svg, out.settings?.custom)
  check("  a textarea called description is left as the theme wrote it", String(out.settings?.description).includes("<svg"))
  check("  rich text is still cleaned", !/script|onclick/.test(String(out.settings?.intro)) && /Hi/.test(String(out.settings?.intro)), out.settings?.intro)
  const ours = sanitizeSettings({ custom_html: "<script>alert(1)</script><b>x</b>" }, htmlFieldsOf([]))
  check("a section of Storelib's own is cleaned by id as before", !/script/.test(String(ours.custom_html)))
}

console.log("\nWhat Posturex (Materia) leaned on\n")
{
  const env = { snippet: () => null, filter: compatFilter }
  const r = (src: string, g: Record<string, unknown> = {}, reg: Record<string, unknown> = {}) => {
    const c = new Ctx(g, env)
    Object.assign(c.registers, reg)
    return renderString(src, c, { lax: true })
  }
  check("prose inside a comment in {% liquid %} is not read as tags (strict too)", !throws(() => parseCompat("{%- liquid\n  comment\n    (request.page_type == 'index'). On every page\n  endcomment\n  assign a = 1\n-%}{{ a }}")) && r("{%- liquid\n  comment\n    if this were read it would break\n  endcomment\n  assign a = 'ok'\n-%}{{ a }}") === "ok")
  check("{% when 'collection' and x %} is the value 'collection', as Liquid reads it", r("{% case t %}{% when 'collection' and c.handle %}yes{% else %}no{% endcase %}", { t: "collection", c: { handle: "all" } }) === "yes")
  const compat = { compat: { translate: (k: string) => ({ "cart.free_shipping": 'Spend <span class="price">{{ amount }}</span> more', "cart.note_html": "<b>{{ name }}</b>" } as Record<string, string>)[k] ?? null } }
  const attr = r(`<div data-x="{{ 'cart.free_shipping' | t }}">`, {}, compat)
  check("a plain key's translation is escaped, so it stays inside its attribute", attr === '<div data-x="Spend &lt;span class=&quot;price&quot;&gt;{{ amount }}&lt;/span&gt; more">', attr)
  check("  and `{{ amount }}` stays for the theme's script when no amount is passed", attr.includes("{{ amount }}"))
  check("  an _html key is not escaped, and a passed value fills in", r(`{{ 'cart.note_html' | t: name: 'Ann' }}`, {}, compat) === "<b>Ann</b>")
}
{
  const { hashOf } = await import("../lib/storelib-theme/compat/objects")
  const env = { snippet: () => null, filter: compatFilter }
  const out = renderString("{% for p in props %}{{ p.first }}={{ p.last }};{% endfor %}{{ props.size }}|{{ props | json }}", new Ctx({ props: hashOf({ _bundle: "Bundle & Save", Size: "L" }) }, env))
  check("a line's properties loop as [name, value] pairs, and size and json see only the values", out === '_bundle=Bundle & Save;Size=L;2|{"_bundle":"Bundle & Save","Size":"L"}', out)
}
{
  const svg = String(compatFilter("payment_type_svg_tag")!("shopify_pay", [], {}, {} as never))
  check("Shop Pay and the other common methods draw as marks, held to the card's width", /<svg[^>]+viewBox="0 0 38 24"/.test(svg) && /textLength=/.test(svg) && /#5A31F4/.test(svg))
  const buy = String(compatFilter("payment_button")!(null, [], {}, {} as never))
  check("payment_button draws a Buy it now that the page's script sends to the checkout", /data-storelib-buy-now/.test(buy) && /shopify-payment-button__button/.test(buy))
}
{
  const { CompatTheme } = await import("../lib/storelib-theme/compat/theme")
  const theme = new CompatTheme({
    "layout/theme.liquid": "<html><body>{{ content_for_layout }}</body></html>",
    "sections/bad.liquid": "<p>bad</p>{% javascript %}<script>var x = 1;</script>{% endjavascript %}",
    "sections/broken.liquid": "<p>b</p>{% javascript %}function ({{% endjavascript %}",
    "sections/good.liquid": "<p>good</p>{% javascript %}window.__good = 1;{% endjavascript %}",
  }, {}, { assetUrl: (n) => `/a/${n}` })
  const js = theme.javascriptBundle()
  let reads = true
  try { new Function(js) } catch { reads = false }
  check("one section's broken script never stops the others: the bundle reads, the good one is in, the broken one is out", reads && /window\.__good = 1/.test(js) && /var x = 1/.test(js) && !/function \(\{/.test(js), js.slice(0, 200))
}

console.log("\nAn earlier import's Overlay group, the canvas's links\n")
{
  const { overlayFromFiles } = await import("../lib/storelib-theme/shopify/convert")
  const rows: Record<string, string> = {
    "layout/theme.storelib": '<template compat="shopify">\n{%- liquid\n  sections \'header-group\'\n-%}<main>{{ content_for_layout }}</main>{%- liquid\n  sections \'footer-group\'\n  sections \'overlay-group\'\n-%}\n</template>',
    "shopify/sections/overlay-group.json": JSON.stringify({ type: "custom.overlay", name: "Overlay", sections: { bar: { type: "mobile-navigation-bar", settings: {} }, top: { type: "Back-to-top-pro", settings: {} }, pop: { type: "promobanner", disabled: true, settings: {} } }, order: ["bar", "top", "pop"] }),
    "sections/mobile-navigation-bar.storelib": "",
    "sections/back-to-top-pro.storelib": "",
    "sections/promobanner.storelib": "",
  }
  const got = overlayFromFiles(rows, { "Back-to-top-pro": "back-to-top-pro" })
  check("a theme imported before its overlay group was read gets it back from its own files, renamed types and hidden ones included", got.slots.join() === "overlay-group" && got.sections.map((x) => `${x.type}${x.hidden ? "(h)" : ""}@${x.slot}`).join(" ") === "mobile-navigation-bar@overlay-group back-to-top-pro@overlay-group promobanner(h)@overlay-group", got)
  const { compatPageForHref } = await import("../lib/storelib-theme/compat/install")
  check("/pages/wishlist is not the theme's page template unless the site has a wishlist page", compatPageForHref("/pages/wishlist", ["home", "page"]) === null && compatPageForHref("/pages/wishlist", ["wishlist"])?.key === "wishlist")
  const { CANVAS_BRIDGE } = await import("../lib/storelib-theme/compat/canvas-bridge")
  let bridgeReads = true
  try { new Function(CANVAS_BRIDGE) } catch { bridgeReads = false }
  check("the canvas's script reads as JavaScript (one bad escape and the canvas does nothing)", bridgeReads)
  check("the canvas lends a link the website's address under the pointer and gives it back before a click", /window\.__slSite/.test(CANVAS_BRIDGE) && /giveBack\(\);\s*var s = sectionOf/.test(CANVAS_BRIDGE))
  check("  and a phone tab bar's link opens its page in the builder, as a header's does", /\[class\*='shopify-section-group-'\]/.test(CANVAS_BRIDGE) && /mobile-navigation-bar/.test(CANVAS_BRIDGE))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
}
void main()
