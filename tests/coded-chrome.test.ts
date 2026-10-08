/**
 * ===========================================================================
 *  A CODED HEADER IS THE HEADER, ON EVERY PAGE, WITH THE LOGO
 * ===========================================================================
 * The owner: "coded headers and footers are always bugged: the logo doesn't
 * show, they disappear." Two causes, both driven here with the real code:
 *
 *   GROUP   a section whose schema says "kind": "header" was added as a body
 *           section, so pages that take the header from home without a repair
 *           (the shop, search, account, 404) lost it or drew two. Added now, it
 *           joins the header group and the header that was showing is hidden.
 *   LOGO    the built-in header keeps the logo the creator uploaded in its own
 *           settings; a coded header read theme.logo, which was Branding only.
 *           theme.logo now falls back to the built-in header's, on the canvas
 *           and on the published page alike.
 *
 * Run with:  npm run test:push
 */
import { applyOp, buildSection, declaredChromeKind, type ThemeState } from "@/lib/website-builder/agent/operations"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { chromeOf, withUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { headerLogoOf, themeWithHeaderLogo } from "@/lib/website-builder/chrome-logo"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}

const HEADER = `<template>
<header class="hdr">
  <a class="hdr__logo" href="{{ routes.root_url }}">{% if theme.logo.url != "" %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}" style="height: {{ theme.logo.height }}px">{% else %}{{ theme.logo.text }}{% endif %}</a>
  <nav>{% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}</nav>
</header>
</template>
<style>
.hdr { display: flex; gap: 16px; }
</style>
<schema>
{ "language_version": 1, "type": "own_header", "name": "Own header", "kind": "header", "settings": [ { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" } ], "presets": [{ "name": "Own header" }] }
</schema>
`
const sources = { "sections/own_header.storelib": HEADER }
const schemas = schemaMapFor(sources)
const make = (id: string, type: string): SectionInstance => {
  const s = buildSection(id, type, schemas)
  if (!s) throw new Error(`no ${type}`)
  return s
}

console.log("\nGROUP: a coded header joins the header group and replaces the one showing")
check("the schema's kind is read", declaredChromeKind(schemas.own_header) === "header" && declaredChromeKind(schemas.hero_split) === null)
const builtIn = make("header-1", "header")
builtIn.settings = { ...builtIn.settings, logo_url: "https://cdn.example/logo.png", logo_height: 40, logo_text: "Linen Co" }
const home: ThemeState = { sections: [builtIn, make("hero-1", "hero_split"), make("footer-1", "footer")], settings: {} }
const after = applyOp(home, { kind: "add_section", id: "own-1", sectionType: "own_header", index: 2 }, schemas)
const own = after.sections.find((s) => s.id === "own-1") as SectionInstance & { group?: string }
check("it is in the header group", own?.group === "header", JSON.stringify(own?.group))
check("at the top, whatever index was asked", after.sections.findIndex((s) => s.id === "own-1") === 1 && after.sections[0].id === "header-1", after.sections.map((s) => s.id).join(","))
check("the built-in header is hidden, not removed", after.sections.find((s) => s.id === "header-1")?.hidden === true)
check("the body is untouched", after.sections.find((s) => s.id === "hero-1")?.hidden === false)
const second = applyOp(after, { kind: "add_section", id: "own-2", sectionType: "own_header" }, schemas)
check("a second coded header hides the first: one header", second.sections.filter((s) => (s.id === "own-1" || s.id === "own-2") && !s.hidden).map((s) => s.id).join() === "own-2")
const contact = withUniversalChrome([make("contact-hdr", "header"), make("form-1", "hero_split"), make("contact-ftr", "footer")], chromeOf(after.sections))
check("another page (taken from home, no repair) draws the coded header", contact.some((s) => s.id === "own-1" && !s.hidden), contact.map((s) => `${s.id}${s.hidden ? "(hidden)" : ""}`).join(","))
check("and does not draw the built-in one as well", !contact.some((s) => s.type === "header" && !s.hidden))
const hero = applyOp(home, { kind: "add_section", id: "hero-2", sectionType: "hero_split" }, schemas)
check("an ordinary section is placed as before, before the footer", hero.sections.map((s) => s.id).join(",") === "header-1,hero-1,hero-2,footer-1", hero.sections.map((s) => s.id).join(","))

console.log("\nLOGO: the logo uploaded in the built-in header reaches theme.logo")
const logo = headerLogoOf(after.sections)
check("the hidden built-in header's logo is read", logo?.logo_url === "https://cdn.example/logo.png" && logo?.logo_height === 40 && logo?.logo_text === "Linen Co", JSON.stringify(logo))
const theme = {} as ThemeSettingsValues
const filled = themeWithHeaderLogo(theme, logo) as unknown as Record<string, unknown>
check("an empty Branding takes it", filled.logo_url === "https://cdn.example/logo.png" && filled.logo_height === 40 && filled.brand_name === "Linen Co")
const branded = { logo_url: "https://cdn.example/brand.png" } as unknown as ThemeSettingsValues
check("Branding wins when it has a picture", (themeWithHeaderLogo(branded, logo) as unknown as Record<string, unknown>).logo_url === "https://cdn.example/brand.png")
check("nothing to add is the same object", themeWithHeaderLogo(theme, null) === theme)
const words = make("header-w", "header")
words.settings = { ...words.settings, logo_mode: "text", logo_url: "https://cdn.example/old.png", logo_text: "Words" }
check("a header set to words lends no picture", headerLogoOf([words])?.logo_url === "")

const drawn = renderWithSources(sources, after.sections, theme, "index")
const html = drawn["own-1"]?.html ?? ""
check("the published render draws the coded header with the uploaded logo", /<img src="https:\/\/cdn\.example\/logo\.png"/.test(html), html.slice(0, 300))
check("at the built-in header's height", /height: 40px/.test(html))
const none = renderWithSources(sources, [make("own-x", "own_header")], theme, "index")
check("with no logo anywhere, it prints the words instead of an empty image", !/<img/.test(none["own-x"]?.html ?? "<img"), none["own-x"]?.html?.slice(0, 200))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
