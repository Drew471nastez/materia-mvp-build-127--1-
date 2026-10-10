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

console.log("\nLiquid read leniently\n")
{
  const env = { snippet: () => null, filter: (n: string) => (n === "boom" ? () => { throw new Error("no way") } : compatFilter(n)) }
  const lax = (src: string, g: Record<string, unknown> = {}) => renderString(src, new Ctx(g, env), { lax: true })
  check("strict reading still refuses a typo (the import report and the code editor's save)", throws(() => parseCompat("{% if x and %}a{% endif %}")) && throws(() => parseCompat("{{ x")) && throws(() => parseCompat("{% endif %}")))
  check("`if x and` reads as `if x`", lax("{% if x and %}yes{% endif %}", { x: true }) === "yes" && lax("{% if x and %}yes{% endif %}", { x: false }) === "")
  check("`| append:` with no value is the value", lax("{{ 'a' | append: }}") === "a")
  check("a stray end tag is a comment and the rest draws", /^<!-- Liquid syntax error[^>]*-->after$/.test(lax("{% endif %}after")), lax("{% endif %}after"))
  check("a block never closed draws to the end of the file", lax("{% if true %}open") === "open")
  check("an unclosed {{ is text", lax("a {{ b") === "a {{ b")
  check("a {% for %} that is not \"item in list\" is a comment", /Liquid syntax error/.test(lax("{% for x %}y{% endfor %}z")) && lax("{% for x %}y{% endfor %}z").endsWith("z"))
  check("an unclosed comment runs to the end", lax("a{% comment %}hidden") === "a")
  check("a {% liquid %} line that is not a tag is skipped", lax("{% liquid\n  assign a = 'ok'\n  ???\n  echo a\n%}") === "ok")
  check("a `when` that does not read does not lose the case", lax("{% case 1 %}{% when , %}a{% else %}b{% endcase %}") === "b" || lax("{% case 1 %}{% when , %}a{% else %}b{% endcase %}") === "a")
  const out = lax("<h1>{{ 'x' | boom }}</h1><p>{{ 'still here' }}</p>")
  check("a filter that fails is a comment where it stood, and the rest of the section draws", /^<h1><!-- Liquid error \(line 1\): no way --><\/h1><p>still here<\/p>$/.test(out), out)
  check("  a comment never closes early or opens markup", !/<!-- Liquid error[^>]*--[^>]/.test(lax("{{ 'x' | boom }}")))
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
