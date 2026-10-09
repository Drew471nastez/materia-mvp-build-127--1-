/**
 * A Shopify theme zip renders its sections with the settings they were given.
 * Horizon's resource-list prints an error and nothing else when settings is missing.
 */
import { Liquid } from "liquidjs"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { shopifyInstallFromFiles } from "../lib/shopify-theme/from-zip"
import { isShopifyTheme, renderShopifySection, type ShopifyFiles } from "../lib/shopify-theme/render"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}

const snippet = `{% liquid
  assign list_items = list_items | default: ''
  assign settings = settings | default: empty
  unless settings != empty
    echo '<!-- Error: settings parameter required for resource-list snippet -->'
    break
  endunless
  echo settings.layout_type
%}
`

const section = `{% render 'resource-list',
  list_items: '',
  settings: section.settings,
  content_type: 'products'
%}
<h2>{{ section.settings.heading }}</h2>
{% schema %}
{ "name": "Featured collection" }
{% endschema %}
`

const files: ShopifyFiles = new Map([
  ["layout/theme.liquid", "<html>{{ content_for_layout }}</html>"],
  ["snippets/resource-list.liquid", snippet],
  ["sections/featured-collection.liquid", section],
  ["templates/index.json", JSON.stringify({
    sections: {
      feat: { type: "featured-collection", settings: { heading: "Shop all", layout_type: "grid" } },
    },
    order: ["feat"],
  })],
])

async function main() {
  check("a theme with layout/theme.liquid and a section is a Shopify theme", isShopifyTheme(files))
  check("a Storelib package is not", !isShopifyTheme(new Map([["theme.json", "{}"]])))

  const rendered = await renderShopifySection(files, {
    id: "feat",
    type: "featured-collection",
    settings: { heading: "Shop all", layout_type: "grid" },
  }, {})

  check("the section keeps its schema name", rendered.name === "Featured collection", rendered.name)
  check("resource-list receives settings, so the error comment is not the page", !rendered.html.includes("settings parameter required"), rendered.html)
  check("the layout type is drawn", rendered.html.includes("grid"), rendered.html)
  check("the heading is drawn", rendered.html.includes("Shop all"), rendered.html)

  /* liquidjs itself: an empty settings object must not count as missing. */
  const engine = new Liquid()
  const probe = await engine.parseAndRender(
    `{% if settings != empty %}yes{% else %}no{% endif %}`,
    { settings: { layout_type: "grid" } },
  )
  check("a settings object is not empty", probe === "yes", probe)

  const built = await shopifyInstallFromFiles(files)
  check("the home page is one section", built.sections.length === 1 && built.sections[0]?.name === "Featured collection", built.sections)
  const file = built.files[0]?.content ?? ""
  const compiled = compileSection(file, { file: built.files[0]?.path })
  check("the rendered section compiles as a Storelib section", compiled.ok === true, compiled.ok ? null : compiled)
  check("the compiled section does not carry the resource-list error", compiled.ok === true && !file.includes("settings parameter required"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
