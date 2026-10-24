/**
 * ===========================================================================
 *  THE SECTION FRAMEWORK MAKES WHATEVER ANYBODY WRITES COME OUT RIGHT
 * ===========================================================================
 * An AI coded a website for the owner. Its header took the logo as a text
 * box holding an address, built its menu out of "Link 1 label", "Link 1
 * URL" pairs, and sat in the page as a second header. Each of those is held
 * here at the framework level, so it is right for any section by anybody:
 *
 *   a picture declared as text is READ as an image_picker, with a warning,
 *   and nothing stored is lost; the panel draws the picker with an address
 *   box under it
 *
 *   a link_list is one of the site's menus, its links and sub links drawn
 *   the same in the builder and on the published site
 *
 *   the theme's general settings (logo, buttons, layout, animation, socials)
 *   are readable from any section, with Theme settings' own defaults
 *
 *   colour settings per element follow the scheme and an override, and an
 *   agent's section without any is handed back a note
 *
 *   enabled_on, disabled_on and kind are typed, validated and taught
 *
 *   a section's `animation` setting is accepted and documented
 *
 *   the compile's mistakes are said in words, never a stack trace
 *
 *   npx tsx tests/section-framework-t.test.ts
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { validateSectionSchema } from "@/lib/storelib-theme/schema/validate"
import { isImageInDisguise, numberedLinkPairs, sectionGroupsOf, SECTION_ANIMATIONS } from "@/lib/storelib-theme/schema/normalise"
import { renderSection } from "@/lib/storelib-theme/render"
import { resolveOne, themeTokens } from "@/lib/storelib-theme/resolve"
import { chromeRoleOf, declaredKind } from "@/lib/storelib-theme/chrome"
import { checkSectionIntegration, sectionAdvice } from "@/lib/storelib-ai/integration"
import { validateSection } from "@/lib/storelib-ai/validate"
import { siteMenus } from "@/lib/website-builder/storefront-data"
import { customAddableSections, schemaFromStorelib } from "@/lib/website-builder/storelib-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { agentRulesBrief, agentRulesText, builderAgentRules } from "@/lib/agent-rules"
import { selectSkills, skillsForRequest } from "@/lib/agent-skills"
import { pageAgentReference } from "@/lib/storelib-ai/reference"
import { DEVELOPER_DOCS } from "@/lib/developers/content.generated"
import type { CompiledSection } from "@/lib/storelib-theme/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail !== "" ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A section as the owner's AI wrote its header: a text logo, links as pairs, a heading and a button. */
const LUCA_HEADER = `<template>
<header class="lh" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }};">
  {% if settings.logo_url %}<img class="lh__logo" src="{{ settings.logo_url }}" alt="{{ settings.logo_text }}" width="120" height="40">{% endif %}
  <nav>
    <a href="{{ settings.link_1_url | url }}">{{ settings.link_1_label }}</a>
    <a href="{{ settings.link_2_url | url }}">{{ settings.link_2_label }}</a>
    <a href="{{ settings.link_3_url | url }}">{{ settings.link_3_label }}</a>
  </nav>
</header>
</template>
<style>
.lh { display: flex; gap: 16px; color: var(--s-text); background: var(--s-bg); }
</style>
<schema>
{
  "type": "luca_header",
  "name": "Luca top",
  "settings": [
    { "type": "text", "id": "logo_url", "label": "Logo URL", "default": "https://lucadragoste.ro/logo-ld.png" },
    { "type": "text", "id": "logo_text", "label": "Logo text", "default": "Luca Dragoste" },
    { "type": "text", "id": "link_1_label", "label": "Link 1 label", "default": "Ghostwriting" },
    { "type": "url", "id": "link_1_url", "label": "Link 1 URL", "default": "#ghostwriting" },
    { "type": "text", "id": "link_2_label", "label": "Link 2 label", "default": "Portfolio" },
    { "type": "url", "id": "link_2_url", "label": "Link 2 URL", "default": "#portfolio" },
    { "type": "text", "id": "link_3_label", "label": "Link 3 label", "default": "Pricing" },
    { "type": "url", "id": "link_3_url", "label": "Link 3 URL", "default": "#pricing" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" }
  ],
  "presets": [{ "name": "Luca top" }]
}
</schema>
`

/** A small native section, written the way the built-ins are, with the setting under test spliced in. */
function native(extraSettings: string, body = "", type = "probe_band"): string {
  return `<template>
<section class="s" data-scheme="{{ settings.color_scheme }}" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --s-heading: {{ scheme.heading }}; --s-pt: {{ settings.padding_top }}px; --s-pb: {{ settings.padding_bottom }}px;">
  <div class="s__in">
    {% if settings.heading %}<h2 class="s__h">{{ settings.heading }}</h2>{% endif %}
    ${body}
  </div>
</section>
</template>
<style>
.s { container-type: inline-size; background: var(--s-bg); color: var(--s-text); }
.s__in { padding: var(--s-pt) 24px var(--s-pb); }
.s__h { color: var(--s-heading); font-size: var(--section-heading-size, 32px); font-weight: var(--section-heading-weight, 700); line-height: var(--section-heading-line-height, 1.15); }
</style>
<schema>
{
  "type": "${type}",
  "name": "Probe ${type}",
  "category": "text",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Made to be changed" },
    ${extraSettings}
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "range", "id": "padding_top", "label": "Top padding", "default": 80, "min": 0, "max": 160, "step": 4, "unit": "px" },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "default": 80, "min": 0, "max": 160, "step": 4, "unit": "px" }
  ],
  "presets": [{ "name": "Probe ${type}" }]
}
</schema>
`
}

function compiled(source: string, file = "sections/probe.storelib"): CompiledSection {
  const r = compileSection(source, { file })
  if (r.ok === false) throw new Error(`did not compile: ${r.errors.map((e) => e.message).join(" | ")}`)
  return r.value
}

function draw(c: CompiledSection, settings: Record<string, unknown> = {}, extra: Partial<Parameters<typeof renderSection>[0]> = {}) {
  return renderSection({ compiled: c, id: "s-1", instance: { type: c.type, settings }, theme: {}, page: { template: "home" }, ...extra }).html
}

function main() {
  /* ── 1. a picture declared as text ─────────────────────────────────── */
  console.log("\n1. Pictures declared as text are read as pictures")
  {
    const r = compileSection(LUCA_HEADER, { file: "sections/luca_header.storelib" })
    check("the AI's header still compiles", r.ok === true, r.ok === false ? r.errors : "")
    if (r.ok === true) {
      const logo = r.value.schema.settings.find((s) => s.id === "logo_url")
      check("logo_url, declared text with a picture's address, is read as an image_picker", logo?.type === "image_picker", logo)
      check("and the type it was written with is kept beside it", logo?.declared_type === "text", logo)
      check("logo_text, the store name, stays text", r.value.schema.settings.find((s) => s.id === "logo_text")?.type === "text")
      check("a link stays a url", r.value.schema.settings.find((s) => s.id === "link_1_url")?.type === "url")
      const w = (r.warnings ?? []).map((x) => x.message)
      check("the compile says so, naming image_picker", w.some((m) => /logo_url/.test(m) && /image_picker/.test(m)), w)
      check("and names link_list for the numbered link pairs", w.some((m) => /link_list/.test(m) && /3 links/.test(m)), w)
      /* Nothing stored is lost. */
      const saved = draw(r.value, { logo_url: "https://cdn.example.com/brand/logo.png" })
      check("an address saved while it was a text box is the picture", saved.includes('src="https://cdn.example.com/brand/logo.png"'), saved.slice(0, 300))
      const word = draw(r.value, { logo_url: "logo-ld" })
      check("a word typed there is still drawn as it was, never dropped", word.includes('src="logo-ld"'), word.slice(0, 300))
      const script = draw(r.value, { logo_url: "javascript:alert(1)" })
      check("a script address is still refused", !/javascript:/i.test(script))
      const dflt = draw(r.value)
      check("untouched, the default picture is drawn", dflt.includes('src="https://lucadragoste.ro/logo-ld.png"'))
    }
    const editor = schemaFromStorelib(LUCA_HEADER, "sections/luca_header.storelib")
    check("the sidebar's schema has an image_picker, so it draws the picker", editor.ok === true && editor.schema.fields.find((f) => f.id === "logo_url")?.type === "image_picker")

    const cases: [string, Record<string, unknown>, boolean][] = [
      ["author_image, text, empty", { type: "text", id: "author_image", label: "Photo" }, true],
      ["image_url, url, a .webp", { type: "url", id: "image_url", label: "Image", default: "https://x.test/a.webp" }, true],
      ["avatar_src, text, a storage path", { type: "text", id: "avatar_src", label: "Avatar", default: "https://p.supabase.co/storage/v1/object/public/b/u/1" }, true],
      ["image_alt stays text", { type: "text", id: "image_alt", label: "Image description" }, false],
      ["logo_text stays text", { type: "text", id: "logo_text", label: "Logo text" }, false],
      ["logo_link stays a url", { type: "url", id: "logo_link", label: "Logo link", default: "/" }, false],
      ["button_url stays a url", { type: "url", id: "button_url", label: "Button link", default: "/shop" }, false],
      ["a word default says it is not a picture", { type: "text", id: "logo", label: "Logo", default: "Luca" }, false],
      ["video_src stays text", { type: "text", id: "video_src", label: "Video" }, false],
      ["an image_picker is left alone", { type: "image_picker", id: "image", label: "Image" }, false],
    ]
    for (const [name, s, want] of cases) check(name, isImageInDisguise(s) === want, s)

    /* What Storelib ships is never second-guessed. */
    const builtins = readdirSync("themes/default/sections").filter((f) => f.endsWith(".storelib"))
    const touched = builtins.filter((f) => {
      const c = compileSection(read(`themes/default/sections/${f}`), { file: `sections/${f}` })
      return c.ok === true && (c.warnings ?? []).some((w) => /holds a picture/.test(w.message))
    })
    check(`none of the ${builtins.length} built-in sections has a picture read differently`, touched.length === 0, touched)

    const strict = checkSectionIntegration(LUCA_HEADER).map((f) => f.id)
    check("an agent's file with a text logo is refused, with the fix", strict.includes("integration-image-setting") || strict.includes("integration-chrome"), strict)
    const notHeader = LUCA_HEADER.replace("<header", "<div").replace("</header>", "</div>")
    const ids = checkSectionIntegration(notHeader).map((f) => f.id)
    check("and with the numbered links refused too", ids.includes("integration-image-setting") && ids.includes("integration-menu"), ids)
    check("numberedLinkPairs counts the pairs", numberedLinkPairs([{ id: "link_1_label" }, { id: "link_1_url" }, { id: "nav_2_text" }, { id: "nav_2_link" }, { id: "heading" }]) === 2)
  }

  /* ── 2. menus ─────────────────────────────────────────────────────── */
  console.log("\n2. link_list is the site's menu, with its sub links")
  {
    const MENU_SECTION = native(
      `{ "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },`,
      `<nav>{% for link in settings.menu.links %}<a class="top" href="{{ link.url | url }}">{{ link.title }}</a>{% for child in link.links %}<a class="child" href="{{ child.url | url }}">{{ child.title }}</a>{% for g in child.links %}<a class="grand" href="{{ g.url | url }}">{{ g.title }}</a>{% endfor %}{% endfor %}{% endfor %}</nav>`,
      "menu_band",
    )
    const c = compiled(MENU_SECTION, "sections/menu_band.storelib")
    /* The header's own links, as Website settings › Navigation builds them. */
    const header = {
      id: "header", type: "header", name: "Header", settings: {},
      blocks: [
        { id: "n1", type: "nav_link", settings: { label: "Courses", url: "/products" } },
        { id: "n1a", type: "nav_link", settings: { label: "Beginner", url: "/products/beginner", parent_id: "n1" } },
        { id: "n2", type: "nav_link", settings: { label: "About", link_type: "page", target_id: "about" } },
      ],
    }
    const theme = {
      menus: {
        footer: { title: "Footer", links: [{ title: "Help", url: "/help", links: [{ title: "Shipping", url: "/shipping", links: [{ title: "Rates", url: "/shipping#rates" }] }] }] },
      },
    }
    const menus = siteMenus(theme, [header])
    check("main-menu is the header's links", menus["main-menu"]?.links.map((l) => l.title).join(",") === "Courses,About", menus["main-menu"])
    const html = draw(c, {}, { data: { menus } })
    check("the section draws the top links", /class="top" href="\/products">Courses/.test(html) && /href="\/about">About/.test(html), html.slice(0, 600))
    check("and the sub link under its parent", /Courses<\/a><a class="child" href="\/products\/beginner">Beginner/.test(html), html.slice(0, 600))
    const foot = draw(c, { menu: "footer" }, { data: { menus } })
    check("another menu, three levels deep", /class="child" href="\/shipping">Shipping/.test(foot) && /class="grand" href="\/shipping#rates">Rates/.test(foot), foot.slice(0, 600))
    const none = draw(c, { menu: "nope" }, { data: { menus } })
    check("a menu that does not exist is empty, never an error", !/class="top"/.test(none))
    const bad = siteMenus({ menus: { x: { title: "X", links: [{ title: "Evil", url: "javascript:alert(1)" }] } } }, [])
    check("an address in a menu is made safe", !/javascript/i.test(draw(c, { menu: "x" }, { data: { menus: bad } })))
    /* Both surfaces hand the engine the same menus. */
    check("the published site passes siteMenus to the engine", /menus: siteMenus\(site\.themeSettings/.test(read("lib/website-builder/published-site.ts")))
    /* Changed on purpose (round 34): handed the page's header alone (the one section siteMenus reads), so an edit elsewhere keeps the same menus. */
    check("and so does the builder's canvas", /siteMenus\(activeThemeSettings, menuHeader \? \[menuHeader\] : \[\]\)/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /menus: canvasMenus/.test(read("app/website-builder/editor/[installId]/page.tsx")))
    check("the sidebar draws link_list as the menu picker", /case "link_list":\s*\n\s*return <MenuPickerControl/.test(read("components/website-builder/editor/controls/index.tsx")))
    check("a url setting is drawn by the link picker", /if \(kind === "url"\) \{\s*\n\s*return <LinkFieldEditor/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  }

  /* ── 3. theme globals ─────────────────────────────────────────────── */
  console.log("\n3. The theme's general settings are readable from a section")
  {
    const t = themeTokens({ logo_url: "https://cdn.test/logo.png", logo_width: 40, brand_name: "Luca", social_linkedin: "https://linkedin.com/in/luca", button_style: "outline", animation_style: "fade-in" }) as Record<string, Record<string, unknown>>
    check("theme.logo", t.logo.url === "https://cdn.test/logo.png" && t.logo.width === 40 && t.logo.text === "Luca" && t.logo.mobile_url === "https://cdn.test/logo.png", t.logo)
    check("theme.buttons", t.buttons.style === "outline" && t.buttons.radius === 8, t.buttons)
    /* Round 25: off until switched on, which is what every page has always drawn (section-anchors.ts themeAnimation). */
    check("theme.animation", t.animation.style === "fade-in" && t.animation.enabled === false && (themeTokens({ animations_enabled: true }) as Record<string, Record<string, unknown>>).animation.enabled === true, t.animation)
    check("theme.socials", Array.isArray(t.socials) && (t.socials as unknown as { key: string }[])[0]?.key === "linkedin", t.socials)
    /* The defaults are Theme settings' own. */
    const empty = themeTokens({}) as Record<string, Record<string, unknown>>
    const field = (id: string) => THEME_SETTINGS_GROUPS.flatMap((g) => g.fields ?? []).find((f) => f.id === id)?.default
    const pairs: [unknown, unknown, string][] = [
      [empty.logo.width, field("logo_width"), "logo_width"],
      [empty.buttons.style, field("button_style"), "button_style"],
      [empty.buttons.shape, field("button_shape"), "button_shape"],
      [empty.buttons.radius, field("button_border_radius"), "button_border_radius"],
      [empty.buttons.hover, field("button_transition"), "button_transition"],
      [empty.layout.page_width, field("page_width"), "page_width"],
      [empty.layout.padding_x, field("content_padding_x"), "content_padding_x"],
      [empty.layout.section_gap, field("section_gap"), "section_gap"],
      [empty.layout.spacing_scale, field("spacing_scale"), "spacing_scale"],
      [empty.layout.card_radius, field("border_radius"), "border_radius"],
      [empty.layout.image_radius, field("image_border_radius"), "image_border_radius"],
      [empty.layout.card_shadow, field("card_shadow"), "card_shadow"],
      [empty.animation.enabled, field("animations_enabled"), "animations_enabled"],
      [empty.animation.style, field("animation_style"), "animation_style"],
      [empty.animation.duration, field("animation_duration"), "animation_duration"],
      [empty.animation.stagger, field("animation_stagger"), "animation_stagger"],
    ]
    const off = pairs.filter(([a, b]) => a !== b)
    check("every default is the one Theme settings gives", off.length === 0, off.map(([a, b, id]) => `${id}: ${String(a)} vs ${String(b)}`))

    const GLOBALS = native(
      "",
      `<a class="brand" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ theme.logo.text }}" width="{{ theme.logo.width }}" height="40">{% else %}{{ theme.logo.text | default: shop.name }}{% endif %}</a><p class="b" data-style="{{ theme.buttons.style }}" data-anim="{{ theme.animation.style }}" data-w="{{ theme.layout.page_width }}">{% for link in shop.socials %}<a href="{{ link.url | url }}">{{ link.label }}</a>{% endfor %}</p>`,
      "globals_band",
    )
    const c = compiled(GLOBALS, "sections/globals_band.storelib")
    const html = renderSection({ compiled: c, id: "g", instance: { type: c.type }, theme: { logo_url: "https://cdn.test/logo.png", logo_width: 40, brand_name: "Luca", social_linkedin: "https://linkedin.com/in/luca", button_style: "outline" }, page: { template: "home" } }).html
    check("a section prints the logo with its width and the store name", html.includes('src="https://cdn.test/logo.png"') && html.includes('alt="Luca"') && html.includes('width="40"'), html.slice(0, 500))
    check("the button style, layout and animation", html.includes('data-style="outline"') && html.includes('data-w="1280"') && html.includes('data-anim="fade-up"'), html.slice(0, 600))
    check("and the social links", html.includes('href="https://linkedin.com/in/luca">LinkedIn'), html.slice(0, 600))
    const bare = renderSection({ compiled: c, id: "g", instance: { type: c.type }, theme: { brand_name: "Luca" }, page: { template: "home" } }).html
    check("with no logo, the store name instead", /class="brand"[^>]*>Luca<\/a>/.test(bare), bare.slice(0, 400))
    const doc = DEVELOPER_DOCS["dynamic-values"] ?? ""
    check("every global is documented", ["theme.logo.url", "theme.buttons", "theme.layout", "theme.animation", "theme.socials", "## Menus"].every((s) => doc.includes(s)))
  }

  /* ── 4. colours per element ───────────────────────────────────────── */
  console.log("\n4. A colour setting for each element")
  {
    const bare = native("", `<p class="t">{{ settings.heading }}</p><a class="s__btn" href="/">Go</a>`, "bare_band")
    const advice = sectionAdvice(bare)
    check("a section drawing a heading, text and a button with no colour setting gets a note", advice.some((a) => a.id === "advice-colour-settings" && /heading_color/.test(a.message) && /button_color/.test(a.message)), advice)
    check("as a warning, never a refusal", advice.length > 0 && advice.every((a) => a.severity === "warning"))
    const plain = native("", `<p class="t">{{ settings.heading }}</p>`, "bare_band")
    const v = validateSection(plain, { path: "sections/bare_band.storelib", expectType: "bare_band", strict: true })
    check("an agent's save goes through and carries the note back", v.ok === true && v.findings.some((f) => f.id === "advice-colour-settings"), v.ok === false ? (v.reason === "quality" ? v.findings.map((f) => f.id) : v.errors) : "")
    check("the builder's code tool returns it with the save", /sectionAdvice\((?:prepared\.)?source\)/.test(read("lib/website-builder/agent/loop.ts")))

    const COLOURED = native(
      `{ "type": "color", "id": "heading_color", "label": "Heading", "default": "scheme.heading" },
    { "type": "color", "id": "card_color", "label": "Cards", "default": "scheme.background_secondary" },`,
      `<div class="card" style="--h: {{ settings.heading_color }}; --c: {{ settings.card_color }};">x</div>`,
      "coloured_band",
    )
    check("with colour settings, no note", /* Changed on purpose (round AI: a plain-text heading gets its own rich text note) */ !sectionAdvice(COLOURED).some((a) => a.id === "advice-colour-settings"))
    const c = compiled(COLOURED, "sections/coloured_band.storelib")
    const untouched = draw(c, { color_scheme: "dark" })
    const darkHeading = /--h: (#[0-9a-f]{3,8})/i.exec(untouched)?.[1]
    check("untouched, it is the scheme's colour", !!darkHeading && !/scheme\./.test(untouched), untouched.slice(0, 400))
    check("a colour the creator picked wins", draw(c, { heading_color: "#ff0000" }).includes("--h: #ff0000"))
    const viaAdvanced = draw(c, { heading_color: "", color_overrides: { heading: "#123456" } })
    check("blanked by Advanced colors, it follows the override", viaAdvanced.includes("--h: #123456"), viaAdvanced.slice(0, 400))
    check("and a plain colour may still be emptied", resolveOne({ type: "color", id: "x", default: "#000000" }, "") === "")
    check("the rules and skills say it", /color setting for every element|A colour setting for every element/i.test(agentRulesText()) && /heading_color/.test(skillsForRequest("give this section its own colours")))
  }

  /* ── 5. placement ─────────────────────────────────────────────────── */
  console.log("\n5. enabled_on, disabled_on and kind")
  {
    const base = { type: "x", name: "X", settings: [] }
    const ok = (s: Record<string, unknown>) => validateSectionSchema({ ...base, ...s }).ok
    const why = (s: Record<string, unknown>) => {
      const r = validateSectionSchema({ ...base, ...s })
      return r.ok === false ? r.errors.map((e) => `${e.path}: ${e.message}`).join(" | ") : ""
    }
    check("enabled_on header is valid", ok({ enabled_on: { groups: ["header"] } }))
    check("disabled_on footer is valid", ok({ disabled_on: { groups: ["footer"] } }))
    check("\"*\" is valid", ok({ enabled_on: { groups: ["*"] } }))
    check("a group that does not exist is refused, naming the three", /"sidebar" is not a section group.*"header", "footer", "template"/.test(why({ enabled_on: { groups: ["sidebar"] } })), why({ enabled_on: { groups: ["sidebar"] } }))
    check("both at once is refused", /not both/.test(why({ enabled_on: { groups: ["header"] }, disabled_on: { groups: ["footer"] } })))
    check("kind header is valid", ok({ kind: "header" }))
    check("kind nav is refused", /kind is "header" or "footer"/.test(why({ kind: "nav" })))
    check("kind header outside the header group is refused", /Add "header" to enabled_on.groups/.test(why({ kind: "header", enabled_on: { groups: ["template"] } })))
    check("the typed schema keeps them", (() => { const r = validateSectionSchema({ ...base, kind: "footer", enabled_on: { groups: ["footer"] } }); return r.ok === true && r.value.kind === "footer" && r.value.enabled_on?.groups?.[0] === "footer" })())

    check("groups: nothing said is the page", sectionGroupsOf({}).join() === "template")
    check("groups: an announcement is the header group", sectionGroupsOf({ category: "announcement" }).join() === "header")
    check("groups: enabled_on wins over the category", sectionGroupsOf({ category: "announcement", enabled_on: { groups: ["template"] } }).join() === "template")
    check("groups: disabled_on is every other group", sectionGroupsOf({ disabled_on: { groups: ["header"] } }).join() === "footer,template")
    check("groups: kind header is the header group alone", sectionGroupsOf({ kind: "header", enabled_on: { groups: ["*"] } }).join() === "header")

    check("an announcement bar in the header group is not refused as a header", chromeRoleOf({ schema: { name: "Announcement bar", enabled_on: { groups: ["header"] } } }) === null)
    check("a section that declares kind header is not refused", chromeRoleOf({ schema: { name: "Header", kind: "header" }, type: "studio_header" }) === null && declaredKind({ kind: "header" }) === "header")
    check("a header that does not say so still is", chromeRoleOf({ schema: { name: "Site header" } }) === "header")
    const namedHeader = checkSectionIntegration(LUCA_HEADER.replace('"name": "Luca top"', '"name": "Header"'))
    check("a file named Header is not refused for being a header", !namedHeader.some((f) => f.id === "integration-chrome"), namedHeader.map((f) => f.id))

    const OWN = LUCA_HEADER
      .replace('"name": "Luca top",', '"name": "Luca header",\n  "kind": "header",')
      .replace(/<nav>[\s\S]*?<\/nav>/, '<nav>{% for link in settings.menu.links %}<a href="{{ link.url | url }}">{{ link.title }}</a>{% endfor %}</nav>')
      .replace(/\{ "type": "text", "id": "link_1_label"[\s\S]*?"default": "#pricing" \},/, '{ "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },')
      .replace('{ "type": "text", "id": "logo_url", "label": "Logo URL", "default": "https://lucadragoste.ro/logo-ld.png" }', '{ "type": "image_picker", "id": "logo_url", "label": "Logo" }')
    const ownIds = checkSectionIntegration(OWN).map((f) => f.id)
    check("a header of the creator's own, with a menu and an image, passes the header rules", !ownIds.includes("integration-chrome") && !ownIds.includes("integration-header-menu") && !ownIds.includes("integration-image-setting") && !ownIds.includes("integration-menu"), ownIds)
    check("without a link_list it is told to read the site's menu", checkSectionIntegration(OWN.replace('"type": "link_list"', '"type": "text"')).some((f) => f.id === "integration-header-menu"))
    const unread = checkSectionIntegration(OWN.replace(/<nav>[\s\S]*?<\/nav>/, '<nav>{% for b in section.blocks %}<a href="{{ b.settings.url | url }}">{{ b.settings.label }}</a>{% endfor %}</nav>'))
    check("a header that declares the menu and draws other links is refused, so Navigation reaches the site", unread.some((f) => f.id === "integration-header-menu-read" && f.severity === "error"), unread.map((f) => f.id))
    check("a header that draws the menu without its sub links is told how to show them", ownIds.includes("integration-header-sublinks") && !ownIds.includes("integration-header-menu-read"), ownIds)
    const withSubs = checkSectionIntegration(OWN.replace("{% endfor %}</nav>", '{% for child in link.links %}<a href="{{ child.url | url }}">{{ child.title }}</a>{% endfor %}{% endfor %}</nav>')).map((f) => f.id)
    check("and one that draws them hears nothing about it", !withSubs.includes("integration-header-sublinks") && !withSubs.includes("integration-header-menu-read"), withSubs)
    const ed = schemaFromStorelib(OWN, "sections/luca_header.storelib")
    check("the editor's schema carries kind", ed.ok === true && ed.schema.kind === "header")
    check("and Add section never offers it for a page body", ed.ok === true && !customAddableSections({ luca_header: { ...ed.schema, type: "luca_header" } }).includes("luca_header"))
    check("a second file of the same kind is refused on save", /kindTaken\(kind, other\)/.test(read("lib/website-builder/save-theme-file.ts")))
  }

  /* ── 6. animation ─────────────────────────────────────────────────── */
  console.log("\n6. A section's own animation")
  {
    const ANIM = native(`{ "type": "select", "id": "animation", "label": "Animation", "default": "theme", "options": [${SECTION_ANIMATIONS.map((v) => `{ "label": "${v}", "value": "${v}" }`).join(", ")}] },`, "", "anim_band")
    const r = compileSection(ANIM, { file: "sections/anim_band.storelib" })
    check("the animation setting compiles", r.ok === true, r.ok === false ? r.errors : "")
    check("and is not called unread: the page reads it", r.ok === true && !(r.warnings ?? []).some((w) => /settings\.animation/.test(w.message)), r.ok === true ? r.warnings : "")
    const odd = compileSection(ANIM.replace('"value": "zoom"', '"value": "slide"'), { file: "sections/anim_band.storelib" })
    check("a value the page does not play is a warning, not an error", odd.ok === true && (odd.warnings ?? []).some((w) => /"slide" plays as "theme"/.test(w.message)), odd.ok === true ? odd.warnings : odd.errors)
    /* Changed on purpose: a section can also come in from either side, blur in or rise. */
    check("the values are theme, none, fade, fade_up, zoom, both sides, blur and rise", SECTION_ANIMATIONS.join() === "theme,none,fade,fade_up,zoom,slide_left,slide_right,blur,rise")
    const docs = DEVELOPER_DOCS.schema ?? ""
    check("documented: it overrides the theme", /### A section's own animation/.test(docs) && /overrides the theme's animation/.test(docs))
    check("taught: the skills and the rules", /id animation/.test(skillsForRequest("animate this section with a fade")) && /id animation/.test(agentRulesText()))
  }

  /* ── 7. the header, taught everywhere ─────────────────────────────── */
  console.log("\n7. Every AI path says: design the header, keep the live values")
  {
    const builder = builderAgentRules()
    const loop = read("lib/website-builder/agent/loop.ts")
    check("Storelib AI: a header is designed freely and keeps live values", /HEADER AND FOOTER ARE DESIGNED FREELY/.test(loop) && /"kind": "header"/.test(loop) && /link_list/.test(loop) && /data-storelib-cart/.test(loop))
    check("Storelib AI: pictures, menus and colours, through the shared rules in its prompt", /never a text or url setting holding an address/.test(builder) && /one link_list setting/.test(builder) && /colour setting for every element/.test(builder) && /builderAgentRules\(\)/.test(loop))
    check("the shared rules reach the builder too", /link_list/.test(builder) && /image_picker/.test(builder))
    const outside = agentRulesText()
    check("MCP and AGENTS.md: design freely, keep live values", /Design it freely/.test(outside) && /"kind": "header"/.test(outside) && /link_list/.test(outside) && /announcement/.test(outside))
    check("the MCP brief says it on connect", /HEADER AND FOOTER: design them however/.test(agentRulesBrief({ siteName: "S", agentName: "A" })))
    const skills = selectSkills("make my header look like this, with my logo", { fallback: false }).map((s) => s.id)
    check("a header request selects the header skill first", skills[0] === "site-header", skills)
    const headerSkill = skillsForRequest("redesign the header")
    check("the header skill says to design it and wire live values", /Design the header or footer however/.test(headerSkill) && /link_list/.test(headerSkill) && /data-storelib-cart/.test(headerSkill))
    check("the framework reference has menus, images and a free header", /MENUS: one link_list setting/.test(pageAgentReference()) && /HEADER AND FOOTER: design them freely/.test(pageAgentReference()))
    const hf = DEVELOPER_DOCS["header-and-footer"] ?? ""
    check("the docs: a header of your own, and above the header", /## A header of your own/.test(hf) && /## Above the header/.test(hf) && /"kind": "header"/.test(hf))
    const manual = read("docs/storelib-manual.md")
    check("the manual says it too", /"kind": "header"/.test(manual) && /theme\.logo\.\{url/.test(manual))
    /* The words the rules ban, and em dashes, are not in what was added. */
    const added = [outside, builder, skillsForRequest("redesign the header"), hf, DEVELOPER_DOCS.schema ?? ""].join("\n")
    check("no em dashes in the taught text", !/\u2014/.test(added))
    const banned = /\b(unlock|elevate|seamless|powerful|effortlessly|supercharge)\b/i
    const stripped = added.replace(/Never write unlock, elevate, seamless, powerful, effortlessly, supercharge or transform/g, "")
    check("no banned words in the taught text", !banned.test(stripped), stripped.match(banned)?.[0])
  }

  /* ── 8. guard rails ───────────────────────────────────────────────── */
  console.log("\n8. Whatever is written, the answer is words")
  {
    const notString = compileSection(undefined as unknown as string, { file: "sections/x.storelib" })
    check("no file at all: a sentence", notString.ok === false && /Storelib could not read this file/.test(notString.errors[0].message))
    const arr = compileSection(`<template><p>x</p></template>\n<schema>[1, 2]</schema>`, { file: "sections/x.storelib" })
    check("a schema that is a list: says it is one JSON object", arr.ok === false && arr.errors.some((e) => /one JSON object/.test(e.message)), arr.ok === false ? arr.errors : "")
    const noName = validateSectionSchema({ type: "x", settings: [] })
    check("a missing name: \"name\" is missing", noName.ok === false && noName.errors.some((e) => e.message === '"name" is missing'), noName.ok === false ? noName.errors : "")
    const wrong = validateSectionSchema({ type: "x", name: "X", settings: {} })
    check("settings as an object: should be an array", wrong.ok === false && wrong.errors.some((e) => /"settings" should be an array, not an object/.test(e.message)), wrong.ok === false ? wrong.errors : "")
    const all = [notString, arr, noName, wrong].flatMap((r) => (r.ok === false ? r.errors.map((e) => e.message) : []))
    check("no stack traces anywhere", all.every((m) => !/\n\s+at |node_modules|\.ts:\d+/.test(m)), all)

    check("a range with no default starts at its min, not 0", resolveOne({ type: "range", id: "size", min: 40, max: 120 }, undefined) === 40)
    const RANGE = native(`{ "type": "range", "id": "size", "label": "Size", "min": 40, "max": 120, "step": 2 },`, `<p style="--x: {{ settings.size }}px">{{ settings.heading }}</p>`, "range_band")
    const rr = compileSection(RANGE, { file: "sections/range_band.storelib" })
    check("and the compile says so", rr.ok === true && (rr.warnings ?? []).some((w) => /"size" has no default, so it starts at its lowest value, 40/.test(w.message)))
    check("drawn at 40px", rr.ok === true && draw(rr.value).includes("--x: 40px"))
    const NOALT = native(`{ "type": "image_picker", "id": "image", "label": "Picture" },`, `{% if settings.image %}<img src="{{ settings.image }}">{% endif %}`, "noalt_band")
    const na = compileSection(NOALT, { file: "sections/noalt_band.storelib" })
    check("an image with no alt is a warning", na.ok === true && (na.warnings ?? []).some((w) => /no alt/.test(w.message)))
    const undeclared = compileSection(native("", `<p>{{ settings.subheading }}</p>`, "und_band"), { file: "sections/und_band.storelib" })
    check("a setting read but never declared is an error at its line, in words", undeclared.ok === false && undeclared.errors.some((e) => /No setting is called "subheading"/.test(e.message) && typeof e.line === "number"))
  }

  /* ── 9. the image control ─────────────────────────────────────────── */
  console.log("\n9. The image control: the picker, and an address under it")
  {
    const ctl = read("components/website-builder/editor/controls/image-picker-control.tsx")
    const idx = read("components/website-builder/editor/controls/index.tsx")
    check("image_picker is drawn by the image control", /case "image_picker":[\s\S]{0,140}<ImagePickerControl/.test(idx))
    check("the control is the picker with an address box under it", ctl.indexOf("<WbImagePicker") > 0 && ctl.indexOf("<WbImagePicker") < ctl.indexOf("data-image-address"))
    check("choosing a file replaces the address", /onChange=\{\(next\) => commit\(next \?\? ""\)\}/.test(ctl))
    const page = read("app/website-builder/editor/[installId]/page.tsx")
    check("the older image fields in the section panel use it too", (page.match(/<ImagePickerControl/g) ?? []).length >= 2)
  }

  console.log(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(`\n  Failed: ${failures.join(", ")}\n`)
    process.exit(1)
  }
}

main()
