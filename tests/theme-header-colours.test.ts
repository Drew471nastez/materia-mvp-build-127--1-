/**
 * Header > Icon colour and Menu link colour (templates round 21): a template
 * colours its header's icons (search, account, wishlist, cart, the phone
 * menu button) and its top menu links from the header's own settings, which
 * the creator can change in the editor. Night shop's red icons used to come
 * from a section of their own that only printed a style rule.
 *
 *   npx tsx tests/theme-header-colours.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import { answer } from "../lib/storelib-theme/compat/site"
import { importTemplate } from "../scripts/theme-templates/site"
import { auditSite } from "../scripts/theme-templates/fixtures"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`) }
}

const PKG = join(process.cwd(), "theme-packages", CODE_THEME_PACKAGE)

async function home(template: string): Promise<string> {
  const site = auditSite(await importTemplate(`${CODE_THEME_PACKAGE}/${template}`), template, false).site
  const out = await answer(site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })
  return String(out.body)
}

async function main() {
  const header = readFileSync(join(PKG, "base", "sections", "header.liquid"), "utf8")
  const schema = JSON.parse(header.slice(header.indexOf("{% schema %}") + 12, header.indexOf("{% endschema %}"))) as { settings: { id?: string; type: string }[] }
  const ids = new Map(schema.settings.filter((s) => s.id).map((s) => [s.id!, s.type]))
  check("the header has Icon colour, Icon colour on hover, Menu link colour and the menu button switch", ids.get("icon_color") === "color" && ids.get("icon_hover_color") === "color" && ids.get("menu_link_color") === "color" && ids.get("icon_color_menu_button") === "checkbox")

  const space = await home("space")
  const rule = /<style data-header-colours>([\s\S]*?)<\/style>/.exec(space)?.[1] ?? ""
  /* Changed on purpose (round 24): the owner asked for white icons on Night shop, red only on hover. */
  check("Night shop: its icons and its phone menu button are white with a red hover, from the header's settings", /\.header__action \.header-icon, \.nav-toggle\)\s*\{\s*color:\s*#ffffff/i.test(rule) && /:hover\s*\{\s*color:\s*#ff4b45/i.test(rule), rule.slice(0, 300))
  const group = JSON.parse(readFileSync(join(PKG, "templates", "space", "sections", "header-group.json"), "utf8")) as { sections: Record<string, { type: string }> }
  check("  and no style-only section does it any more", !Object.values(group.sections).some((s) => s.type === "space-header-icons") && !existsSync(join(PKG, "base", "sections", "space-header-icons.liquid")))

  const clothing = await home("clothing")
  check("a template that sets neither prints no rule: its header follows its colour scheme", !clothing.includes("data-header-colours"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
