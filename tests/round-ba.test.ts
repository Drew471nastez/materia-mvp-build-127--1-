/**
 * ===========================================================================
 *  ROUND BA: LIVE PAGE CHANGES FETCH ONCE, COLOUR SCHEMES IN GROUPS
 * ===========================================================================
 * A tap from one page of a published website to another fetched the page
 * twice on Next 16.0.10 (reproduced in a bare app: a [username] layout with
 * generateStaticParams returning [] fetched twice on 16.0.x, once on 16.1+).
 * Next is 16.1.7 now.
 *
 * Opening a colour scheme listed all of its colours in one run. They are in
 * groups now, on every theme: General colors, Primary button, Secondary
 * button, Inputs & fields, Additional colors.
 *
 * Run with:  npx tsx tests/round-ba.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { categoryFromHeading, groupSchemeFields, schemeCategoryOf, SCHEME_CATEGORY_ORDER } from "../lib/storelib-theme/scheme-categories"
import { SCHEME_COLOR_GROUPS, SCHEME_COLOR_KEYS } from "../lib/storelib-theme/color-schemes"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA page change fetches the page once\n")
{
  const pkg = JSON.parse(code("package.json")) as { dependencies: Record<string, string> }
  const [major, minor] = pkg.dependencies.next.split(".").map(Number)
  check("Next is 16.1 or later (16.0.x fetched a cached page twice on every change)", major === 16 && minor >= 1, pkg.dependencies.next)
  const pages = ["page.tsx", "products/page.tsx", "products/[slug]/page.tsx", "[page]/page.tsx", "collections/page.tsx", "collections/[handle]/page.tsx"]
  check("the website's pages still prerender on demand (generateStaticParams), so they stay cached", pages.every((f) => /export (async )?function generateStaticParams/.test(code(`app/(site)/w/[username]/${f}`))))
}

console.log("\nAn imported theme's scheme colours are grouped\n")
{
  const id = (k: string) => ({ id: `color_schemes::scheme-1::settings::${k}` })
  const dawn: [string, string][] = [["background", "general"], ["background_gradient", "general"], ["text", "general"], ["button", "primary_button"], ["button_label", "primary_button"], ["secondary_button_label", "secondary_button"], ["shadow", "general"]]
  check("Dawn's colours: background and text general, button primary, secondary button label secondary", dawn.every(([k, c]) => schemeCategoryOf(id(k)) === c), dawn.map(([k]) => [k, schemeCategoryOf(id(k))]))
  const horizon: [string, string][] = [["foreground_heading", "general"], ["primary", "general"], ["border", "general"], ["primary_button_hover_background", "primary_button"], ["secondary_button_border", "secondary_button"], ["input_text_color", "inputs"], ["input_hover_background", "inputs"], ["variant_background_color", "additional"], ["selected_variant_text_color", "additional"]]
  check("Horizon's: inputs before buttons, variant pills Additional even with background in the name", horizon.every(([k, c]) => schemeCategoryOf(id(k)) === c), horizon.map(([k]) => [k, schemeCategoryOf(id(k))]))
  check("a colour no rule knows is Additional colors", schemeCategoryOf(id("color_9")) === "additional")
  check("the theme's own heading wins over the name", schemeCategoryOf({ id: "a::b::settings::background", category: "Primary button" }) === "primary_button" && schemeCategoryOf({ id: "a::b::settings::x", category: "inputs" }) === "inputs")
  check("headings read as groups: Inputs, Secondary button, General", categoryFromHeading("Inputs") === "inputs" && categoryFromHeading("Secondary button") === "secondary_button" && categoryFromHeading("General") === "general" && categoryFromHeading("") === null)
  const fields = ["button", "background", "input_border", "text", "secondary_button_label", "badge_sale"].map(id)
  const groups = groupSchemeFields(fields)
  check("groups come in the fixed order, empty ones left out, every colour once", groups.map((g) => g.category).join(",") === "general,primary_button,secondary_button,inputs,additional" && groups.flatMap((g) => g.fields).length === fields.length)
  check("inside a group the theme's order is kept", groups[0].fields.map((f) => f.id.split("::").pop()).join(",") === "background,text")
  check("the five groups are General, Primary button, Secondary button, Inputs, Additional", SCHEME_CATEGORY_ORDER.join(",") === "general,primary_button,secondary_button,inputs,additional")

  const ui = code("components/website-builder/compat/compat-theme-settings.tsx")
  check("the editor draws the open scheme's colours by group, under header fields (the section settings' own heading)", /groupSchemeFields\(own\)/.test(ui) && /type: "header", label: categoryTitle\(g\.category\)/.test(ui) && /data-scheme-category=\{g\.category\}/.test(ui))
  check("  a scheme with one kind of colour stays a plain list", /groups\.length < 2\s*\n\s*\? own\.map/.test(ui))
  check("  each colour still writes to group::scheme::settings::id", /onChange\(top, writeAt\(values\[top\], rest, v\)\)/.test(ui))
  check("  group names are translated", ["General colors", "Primary button", "Secondary button", "Inputs & fields", "Additional colors"].every((w) => ui.includes(`tt("${w}")`)))
  const convert = code("lib/storelib-theme/shopify/convert.ts")
  check("an import keeps a scheme definition's headings as the group of the colours under them", /heading = categoryFromHeading\(/.test(convert) && /\.category = heading/.test(convert))
}

console.log("\nStorelib's own schemes use the same groups\n")
{
  const keys = SCHEME_COLOR_GROUPS.flatMap((g) => g.keys)
  check("every one of the 21 colours is in exactly one group", keys.length === SCHEME_COLOR_KEYS.length && new Set(keys).size === keys.length && SCHEME_COLOR_KEYS.every((k) => keys.includes(k)))
  check("General colors, Primary button, Secondary button, Inputs & fields", SCHEME_COLOR_GROUPS.map((g) => g.label).join(" | ") === "General colors | Primary button | Secondary button | Inputs & fields")
  const panel = code("components/website-builder/editor/design-panels.tsx")
  check("their headings look like a section's (11px, uppercase, wide tracking, a rule above)", /data-scheme-category=\{group\.label\}>\s*\n\s*<div className="pt-3 pb-1 border-t border-border mt-2">\s*\n\s*<span className="text-\[11px\] font-semibold text-muted-foreground uppercase tracking-widest">\{tt\(group\.label\)\}/.test(panel))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
