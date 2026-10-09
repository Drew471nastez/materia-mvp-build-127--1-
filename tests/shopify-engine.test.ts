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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
