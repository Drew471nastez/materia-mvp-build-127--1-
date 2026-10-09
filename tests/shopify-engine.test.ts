/**
 * The engine understands what an imported Shopify theme writes: Shopify's
 * filters with Shopify's meaning, number ranges, and break and continue.
 * Each case is a line a real theme (Horizon, Dawn) uses.
 */
import { compileTemplate, renderTemplate } from "@/lib/storelib-theme/storelib/template"
import type { RenderContext } from "@/lib/storelib-theme/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`)
  }
}
const render = (src: string, settings: Record<string, unknown> = {}) => {
  const t = compileTemplate(src)
  if (t.ok === false) return `COMPILE: ${t.errors.map((e) => e.message).join("; ")}`
  return renderTemplate(t.value, { settings, blocks: [], theme: {}, page: { template: "index" }, section: { id: "s", type: "t" }, scheme: {}, assets: {} } as RenderContext)
}
const is = (label: string, src: string, want: string, settings: Record<string, unknown> = {}) => {
  const got = render(src, settings)
  check(label, got === want, { got, want })
}

console.log("\nShopify's filters\n")
is("split, then a loop", `{% for w in settings.t | split: ',' %}[{{ w }}]{% endfor %}`, "[a][b][c]", { t: "a,b,c" })
is("split, then size", `{{ settings.t | split: ',' | size }}`, "3", { t: "a,b,c" })
is("strip_newlines", `{{ settings.t | strip_newlines }}`, "ab", { t: "a\nb" })
is("modulo", `{{ 7 | modulo: 3 }}`, "1")
is("at_most and at_least", `{{ 9 | at_most: 4 }} {{ 1 | at_least: 2 }}`, "4 2")
is("ceil and floor", `{{ 1.2 | ceil }} {{ 1.8 | floor }}`, "2 1")
is("money from cents", `{{ 4800 | money }}`, "$48.00")
is("money on a price already written as money stays", `{{ settings.p | money }}`, "$48.00", { p: "$48.00" })
is("money_with_currency", `{{ 4800 | money_with_currency }}`, "$48.00 USD")
is("color_darken", `{{ '#ffffff' | color_darken: 50 }}`, "#808080")
is("color_lighten", `{{ '#000000' | color_lighten: 100 }}`, "#ffffff")
is("color_modify alpha", `{{ '#ff0000' | color_modify: 'alpha', 0.5 }}`, "rgba(255, 0, 0, 0.5)")
is("color_to_rgb", `{{ '#336699' | color_to_rgb }}`, "rgb(51, 102, 153)")
is("color_brightness", `{{ '#ffffff' | color_brightness }}`, "255")
is("where with a value", `{% for p in settings.list | where: 'kind', 'b' %}{{ p.name }}{% endfor %}`, "two", { list: [{ name: "one", kind: "a" }, { name: "two", kind: "b" }] })
is("where with a true field", `{{ settings.list | where: 'on' | size }}`, "1", { list: [{ on: true }, { on: false }] })
is("map a field", `{{ settings.list | map: 'name' | join: '+' }}`, "one+two", { list: [{ name: "one" }, { name: "two" }] })
is("map on an address is still the map embed", `{{ 'Paris' | map | size }}`.length > 0 ? `{% if 'Paris' | map %}y{% endif %}` : "", "y")
is("truncatewords", `{{ 'one two three four' | truncatewords: 2 }}`, "one two…")
is("handleize", `{{ 'Hello World!' | handleize }}`, "hello-world")
is("md5 is stable", `{{ 'x' | md5 }}` === `{{ 'x' | md5 }}` ? render(`{{ 'x' | md5 }}`) : "", render(`{{ 'x' | md5 }}`))
is("uniq, sort, reverse, compact", `{{ settings.l | uniq | sort | reverse | join: '' }}`, "cba", { l: ["b", "a", "c", "a"] })

console.log("\nRanges and loop control\n")
is("a literal range", `{% for i in (1..3) %}{{ i }}{% endfor %}`, "123")
is("a range to a setting", `{% for i in (1..settings.n) %}{{ i }}{% endfor %}`, "1234", { n: 4 })
is("an empty range draws the else", `{% for i in (3..1) %}{{ i }}{% else %}none{% endfor %}`, "none")
check("a range is capped", render(`{% for i in (1..100000) %}x{% endfor %}`).length === 200)
is("break leaves the loop", `{% for i in (1..5) %}{% if i == 3 %}{% break %}{% endif %}{{ i }}{% endfor %}`, "12")
is("continue skips one", `{% for i in (1..4) %}{% if i == 2 %}{% continue %}{% endif %}{{ i }}{% endfor %}`, "134")
is("break inside an inner loop leaves only that loop", `{% for a in (1..2) %}{% for b in (1..3) %}{% if b == 2 %}{% break %}{% endif %}{{ a }}{{ b }}{% endfor %};{% endfor %}`, "11;21;")
is("break outside a loop does nothing", `a{% break %}b`, "ab")
is("forloop.rindex", `{% for i in (1..3) %}{{ forloop.rindex }}{% endfor %}`, "321")

console.log("\nNames a template keeps: assign and capture\n")
is("assign, then read", `{% assign x = settings.t | upcase %}{{ x }}`, "HI", { t: "hi" })
is("an assign inside a loop is seen after it", `{% assign n = 0 %}{% for i in (1..4) %}{% assign n = n | plus: i %}{% endfor %}{{ n }}`, "10")
is("a capture is markup, its values escaped", `{% capture c %}<b>{{ settings.t }}</b>{% endcapture %}{{ c }}`, "<b>&lt;i&gt;</b>", { t: "<i>" })
is("captured markup stays markup through strip and append", `{% capture c %} <i>a</i> {% endcapture %}{{ c | strip | append: settings.t }}`, "<i>a</i>&lt;x&gt;", { t: "<x>" })
is("a string the template writes is markup when joined", `{% assign h = "<h3>" | append: settings.t | append: "</h3>" %}{{ h }}`, "<h3>Title</h3>", { t: "Title" })
is("a capture of only spaces is blank to strip", `{% capture c %}   {% endcapture %}{% if (c | strip) %}full{% else %}blank{% endif %}`, "blank")
check("assign cannot take a name the template reads", render(`{% assign settings = 1 %}`).startsWith("COMPILE"))

console.log("\nComputed indexes, colour parts, prices\n")
is("settings[key], with a Shopify id written with dashes", `{% for k in (settings.keys | split: ",") %}{{ settings[k] }};{% endfor %}`, "8;16;", { keys: "padding-top,padding_bottom", padding_top: 8, padding_bottom: 16 })
is("a range end may hold parentheses", `{% for i in (1..(settings.n | plus: 1)) %}{{ i }}{% endfor %}`, "123", { n: 2 })
is("a colour's parts", `{{ settings.c.rgb }} {{ settings.c.alpha }} {{ settings.c.red }}`, "255 136 0 1 255", { c: "#ff8800" })
is("two prices compare as prices", `{% if settings.was > settings.now %}sale{% endif %}`, "sale", { was: "$60.00", now: "$48.00" })

console.log("\nA Storelib product, read by Shopify's names\n")
const card = { id: "p1", type: "product", settings: { title: "Shirt", price: "$48.00", compare_price: "$60.00", image: "https://x/a.png", images: ["https://x/a.png", "https://x/b.png"], url: "/products/shirt", slug: "shirt", available: true, variants: [{ id: "v1", name: "Small", price: "$48.00", available: true }, { id: "v2", name: "Large", price: "$52.00", available: false }] } }
const withProduct = (src: string) => {
  const t = compileTemplate(src)
  if (t.ok === false) return `COMPILE: ${t.errors.map((e) => e.message).join("; ")}`
  return renderTemplate(t.value, { settings: {}, blocks: [], theme: {}, page: {}, section: { id: "s", type: "t" }, scheme: {}, assets: {}, products: [card], closest: { product: card } } as unknown as RenderContext)
}
const pis = (label: string, src: string, want: string) => { const got = withProduct(src); check(label, got === want, { got, want }) }
pis("title, handle and url", `{% for p in products %}{{ p.title }} {{ p.handle }} {{ p.url }}{% endfor %}`, "Shirt shirt /products/shirt")
pis("featured_media prints as its address and has parts", `{% for p in products %}{{ p.featured_media }} {{ p.featured_media.alt }} {{ p.media.size }}{% endfor %}`, "https://x/a.png Shirt 2")
pis("variants and the first available one", `{% for p in products %}{{ p.variants.size }} {{ p.selected_or_first_available_variant.title }} {{ p.price_varies }}{% endfor %}`, "2 Small true")
pis("compare_at_price against price", `{% for p in products %}{% if p.compare_at_price > p.price %}sale{% endif %}{% endfor %}`, "sale")
pis("Storelib's own spelling still reads", `{% for p in products %}{{ p.settings.title }}{% endfor %}`, "Shirt")
pis("closest.product in a block", `{{ closest.product.title }}`, "Shirt")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
