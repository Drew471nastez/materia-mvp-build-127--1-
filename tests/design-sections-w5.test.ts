/**
 * ===========================================================================
 *  DESIGN PRESETS AND THE SECTIONS A DESIGNED SITE IS BUILT FROM
 * ===========================================================================
 * lib/website-builder/design-presets.ts is a contract the site generator
 * codes against: at least twelve looks, each only values Theme settings has
 * controls for, each scheme readable (WCAG, lib/storelib-theme/contrast.ts).
 * The fourteen sections added with it are addable, fully editable (every
 * word a setting, a colour scheme, padding), draw a placeholder only in the
 * builder, and follow the house rules (lib/storelib-ai/quality.ts). And the
 * theme-wide pieces: Phone spacing, Show on, a group's column widths and
 * background picture, all of which leave an existing site exactly as it was.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DESIGN_PRESETS, presetById } from "@/lib/website-builder/design-presets"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { ACCENT_FONT_OPTIONS, BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/website-builder/font-options"
import { BUILT_IN_SCHEME_KEYS, DEFAULT_COLOR_SCHEMES, normalizeScheme } from "@/lib/storelib-theme/color-schemes"
import { contrastRatio, parseColor, schemeContrast } from "@/lib/storelib-theme/contrast"
import { TYPE_STYLE_KEYS } from "@/lib/storelib-theme/typography"
import { compileBlock, compileSection } from "@/lib/storelib-theme/storelib/compile"
import { renderSection } from "@/lib/storelib-theme/render"
import { listFromPreset, presetTree } from "@/lib/storelib-theme/blocks"
import { checkSectionQuality } from "@/lib/storelib-ai/quality"
import { themeStylesheet } from "@/lib/website-builder/theme-css"
import { showOnAttr } from "@/components/website-builder/sections/SectionRenderer"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DESIGN_PATTERNS } from "@/lib/storelib-ai/patterns"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const manifest = JSON.parse(read("themes/default/manifest.json")) as { addable_sections: string[]; retired_sections: string[]; section_categories: Record<string, string> }

const NEW_SECTIONS = ["hero_editorial", "hero_media", "marquee", "stats_band", "bento_grid", "feature_tabs", "sticky_story", "gallery_scroll", "testimonial_wall", "logo_cloud", "team_grid", "comparison_table", "cta_split", "newsletter_split"]

type Field = { id: string; type: string; options?: { value: string }[]; min?: number; max?: number; step?: number }
const FIELDS = new Map<string, Field>()
for (const g of THEME_SETTINGS_GROUPS) for (const f of g.fields as Field[]) FIELDS.set(f.id, f)
const WHOLE_OBJECTS = new Set(["color_schemes", "default_color_scheme", "typography_styles"])

function blocksCatalog() {
  const out: Record<string, unknown> = {}
  for (const b of ["button", "collection_card", "group", "heading", "image", "map", "spacer", "text", "video"]) {
    const r = compileBlock(read(`themes/default/blocks/${b}.storelib`), { type: b })
    if (r.ok) out[b] = r.value
  }
  return out
}
const BLOCKS = blocksCatalog()

function draw(type: string, opts: { preset?: number; settings?: Record<string, unknown>; blocks?: Record<string, unknown>[]; editor?: boolean; theme?: Record<string, unknown> } = {}) {
  const r = compileSection(read(`themes/default/sections/${type}.storelib`))
  if (!r.ok) throw new Error(`${type} does not compile`)
  const compiled = r.value
  const preset = (compiled.schema.presets ?? [])[opts.preset ?? 0] ?? {}
  const defaults: Record<string, unknown> = {}
  for (const f of compiled.schema.settings ?? []) if ((f as { id?: string }).id && (f as { default?: unknown }).default !== undefined) defaults[(f as { id: string }).id] = (f as { default: unknown }).default
  let i = 0
  const tree = listFromPreset(presetTree(preset as never), (t: string) => `${t}_${i++}`) as { settings: Record<string, unknown> }[]
  ;(opts.blocks ?? []).forEach((b, k) => { if (tree[k]) tree[k].settings = { ...tree[k].settings, ...b } })
  const instance = { type, settings: { ...defaults, ...((preset as { settings?: Record<string, unknown> }).settings ?? {}), ...(opts.settings ?? {}) }, blocks: tree }
  return renderSection({ compiled, id: "s1", instance, theme: opts.theme ?? {}, page: { template: "index", in_editor: opts.editor === true }, blocks: (t: string) => BLOCKS[t] ?? null } as never)
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Design presets: the contract the generator codes against")
  // ═══════════════════════════════════════════════════════════════════════
  check("at least twelve", DESIGN_PRESETS.length >= 12, DESIGN_PRESETS.length)
  check("every id is unique", new Set(DESIGN_PRESETS.map((p) => p.id)).size === DESIGN_PRESETS.length)
  check("presetById finds each one and nothing else", DESIGN_PRESETS.every((p) => presetById(p.id) === p) && presetById("nope") === undefined)
  check("each has a name, moods and a rhythm", DESIGN_PRESETS.every((p) => p.name && p.mood.length > 0 && p.sectionRhythm.length >= 4))
  /* Genuinely distinct: no two share a heading font, a body font and a primary colour all at once. */
  const signature = DESIGN_PRESETS.map((p) => `${p.settings.font_heading}|${p.settings.font_body}|${p.settings.primary_color}`)
  check("no two presets are the same look", new Set(signature).size === DESIGN_PRESETS.length)

  for (const p of DESIGN_PRESETS) {
    const s = p.settings as Record<string, unknown>
    const bad: string[] = []
    for (const [k, v] of Object.entries(s)) {
      if (WHOLE_OBJECTS.has(k)) continue
      const f = FIELDS.get(k)
      if (!f) { bad.push(`${k}: no such Theme setting`); continue }
      if ((f.type === "select" || f.type === "radio") && !f.options?.some((o) => o.value === v)) bad.push(`${k}: ${String(v)} is not an option`)
      if (f.type === "range" && (typeof v !== "number" || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) bad.push(`${k}: ${String(v)} out of range`)
      if (f.type === "toggle" && typeof v !== "boolean") bad.push(`${k}: not a switch value`)
      if (f.type === "color" && !parseColor(String(v))) bad.push(`${k}: not a colour`)
    }
    if (!HEADING_FONT_OPTIONS.some((o) => o.value === s.font_heading)) bad.push(`font_heading ${String(s.font_heading)}`)
    if (!BODY_FONT_OPTIONS.some((o) => o.value === s.font_body)) bad.push(`font_body ${String(s.font_body)}`)
    if (!ACCENT_FONT_OPTIONS.some((o) => o.value === (s.font_accent ?? ""))) bad.push(`font_accent ${String(s.font_accent)}`)
    const styles = (s.typography_styles ?? {}) as Record<string, { weight?: string; size?: { desktop: number; mobile: number } }>
    for (const [k, st] of Object.entries(styles)) {
      if (!(TYPE_STYLE_KEYS as readonly string[]).includes(k)) bad.push(`typography ${k}`)
      /* The weights the page loads (lib/website-builder/font-link.ts). */
      if (!["400", "500", "600", "700"].includes(String(st.weight))) bad.push(`typography ${k} weight ${String(st.weight)}`)
      if (!st.size || st.size.mobile > st.size.desktop) bad.push(`typography ${k} phone size above desktop`)
    }
    check(`${p.id}: every value is one Theme settings can show and edit`, bad.length === 0, bad)

    const schemes = (s.color_schemes ?? {}) as Record<string, unknown>
    check(`${p.id}: all five built-in schemes`, BUILT_IN_SCHEME_KEYS.every((k) => k in schemes))
    check(`${p.id}: its rhythm and its default name schemes it has`, p.sectionRhythm.every((k) => k in schemes) && String(s.default_color_scheme) in schemes)
    const unreadable: string[] = []
    for (const [key, raw] of Object.entries(schemes)) {
      const full = normalizeScheme(raw, (DEFAULT_COLOR_SCHEMES as Record<string, typeof DEFAULT_COLOR_SCHEMES.white>)[key] ?? DEFAULT_COLOR_SCHEMES.white)
      const c = schemeContrast(full)
      for (const f of c.failing) unreadable.push(`${key} ${f.fg} on ${f.bg} ${f.ratio.toFixed(2)}`)
      if (c.unknown.length) unreadable.push(`${key} unknown ${c.unknown.map((u) => u.fg).join(",")}`)
      const hover = contrastRatio(parseColor(full.primary_button_hover_text)!, parseColor(full.primary_button_hover_background)!)
      if (hover < 4.5) unreadable.push(`${key} hovered button ${hover.toFixed(2)}`)
      /* An outlined or ghost button draws its label in the button colour on the background (theme-css.ts). */
      if (s.button_style === "outline" || s.button_style === "ghost") {
        const o = contrastRatio(parseColor(full.primary_button_background)!, parseColor(full.background)!)
        if (o < 4.5) unreadable.push(`${key} outlined button ${o.toFixed(2)}`)
      }
    }
    check(`${p.id}: every scheme passes WCAG for what a visitor reads`, unreadable.length === 0, unreadable)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The new sections: addable, editable, and by the house rules")
  // ═══════════════════════════════════════════════════════════════════════
  for (const t of NEW_SECTIONS) {
    const src = read(`themes/default/sections/${t}.storelib`)
    const r = compileSection(src)
    check(`${t}: compiles`, r.ok === true, r.ok ? "" : (r as { errors?: unknown }).errors)
    if (!r.ok) continue
    const schema = r.value.schema
    const ids = new Set((schema.settings ?? []).map((f) => (f as { id?: string }).id))
    check(`${t}: in Add section, in a category the library has`, manifest.addable_sections.includes(t) && ADDABLE_SECTIONS.includes(t) && !manifest.retired_sections.includes(t) && !!schema.category && schema.category in manifest.section_categories)
    check(`${t}: a colour scheme and top and bottom padding`, ids.has("color_scheme") && ids.has("padding_top") && ids.has("padding_bottom"))
    check(`${t}: at least one preset`, (schema.presets ?? []).length > 0)
    const findings = checkSectionQuality(src)
    check(`${t}: no house-rule findings (media queries, colours, motion, alt)`, findings.length === 0, findings.map((f) => f.id))
    /* No colour written into the stylesheet: every one comes from the scheme or a setting. */
    const css = src.slice(src.indexOf("<style"), src.indexOf("</style>"))
    check(`${t}: no hex colour in its CSS`, !/#[0-9a-f]{3,8}\b/i.test(css), css.match(/#[0-9a-f]{3,8}\b/i)?.[0])
    for (let i = 0; i < (schema.presets ?? []).length; i++) {
      const live = draw(t, { preset: i })
      const editor = draw(t, { preset: i, editor: true })
      check(`${t} preset ${i + 1}: draws on the site and in the builder`, live.html.length > 200 && editor.html.length > 200)
      check(`${t} preset ${i + 1}: no builder placeholder on the published page`, !/class="ph"|Add a photograph|Add a picture|Add a portrait|in the sidebar/.test(live.html))
      const imgs = live.html.match(/<img\b[^>]*>/g) ?? []
      check(`${t} preset ${i + 1}: every picture has alt`, imgs.every((tag) => /\salt=/.test(tag)), imgs.find((tag) => !/\salt=/.test(tag)))
      check(`${t} preset ${i + 1}: no stock picture addresses in a preset`, !/unsplash|pexels|pixabay/.test(live.html))
    }
  }
  check("an image section shows its placeholder in the builder", /class="ph"/.test(draw("hero_editorial", { editor: true }).html) && /class="ph"/.test(draw("hero_media", { editor: true }).html))
  check("and a picture once it has one", /<img[^>]+src="https:\/\/cdn\.example\/a\.jpg"/.test(draw("hero_media", { settings: { image: "https://cdn.example/a.jpg" } }).html))

  section("Testimonials: instructions in the presets, never an invented person")
  const wall = read("themes/default/sections/testimonial_wall.storelib")
  const presetNames = [...wall.matchAll(/"name": "([^"]+)"/g)].map((m) => m[1])
  check("the only names are the setting's placeholder", presetNames.every((n) => ["Testimonial Wall", "Testimonial", "Customer's name"].includes(n)), presetNames)

  section("Marquee: loops, reads once, stops for less motion")
  const mq = draw("marquee")
  check("the track is drawn more than once, and the copies are hidden from screen readers", (mq.html.match(/class="mq__list/g) ?? []).length === 2 && /mq__copy" aria-hidden="true"/.test(mq.html))
  check("reduced motion stops it", /prefers-reduced-motion: reduce[\s\S]*mq__track[^}]*animation: none/.test(mq.css))
  check("speed and direction are settings", /--mq-dur: 32s/.test(mq.html) && /mq__track--left/.test(mq.html))

  section("Feature tabs: CSS only, one radio per tab")
  const ft = draw("feature_tabs")
  check("a radio and a label per tab, the first checked", (ft.html.match(/type="radio"/g) ?? []).length === 3 && /checked/.test(ft.html) && (ft.html.match(/<label class="ft__tab"/g) ?? []).length === 3)
  check("no script", !/<script/.test(ft.html))

  section("Comparison table: reads what the earlier one saved")
  const old = JSON.parse(read("themes/default/sections/comparison_table.json")) as { presets: { settings: Record<string, unknown>; blocks: { type: string; settings: Record<string, unknown> }[] }[] }
  const oldPreset = old.presets[0]
  const ctR = compileSection(read("themes/default/sections/comparison_table.storelib"))
  const ct = ctR.ok ? renderSection({ compiled: ctR.value, id: "c", instance: { type: "comparison_table", settings: oldPreset.settings, blocks: oldPreset.blocks.map((b, i) => ({ id: `b${i}`, ...b })) }, theme: {}, page: { template: "index" }, blocks: () => null } as never) : null
  check("the old columns and rows draw", !!ct && /Enterprise/.test(ct.html) && /Dedicated account manager/.test(ct.html) && /Advanced features/.test(ct.html))
  check("yes and no become a tick and a dash", !!ct && /ct__ic--yes/.test(ct.html) && /ct__ic--no/.test(ct.html))
  check("other values are written as typed", !!ct && /<td>500 GB<\/td>/.test(ct.html))
  check("the old highlighted column is still highlighted", !!ct && /ct--hl1/.test(ct.html))
  check("the .storelib file is the comparison table now", SECTION_SCHEMAS.comparison_table?.name === "Comparison Table")

  // ═══════════════════════════════════════════════════════════════════════
  section("The free layout section and forms are in Add section")
  // ═══════════════════════════════════════════════════════════════════════
  check("blocks_section", manifest.addable_sections.includes("blocks_section") && ADDABLE_SECTIONS.includes("blocks_section"))
  check("native_form", manifest.addable_sections.includes("native_form") && ADDABLE_SECTIONS.includes("native_form"))

  section("The assistant knows when to use each one")
  const named = new Set(DESIGN_PATTERNS.flatMap((p) => p.builtIn.map((b) => b.type)))
  const missing = [...NEW_SECTIONS, "blocks_section", "native_form"].filter((t) => !named.has(t))
  check("every new section is in a design pattern", missing.length === 0, missing)

  // ═══════════════════════════════════════════════════════════════════════
  section("Phone spacing and Show on")
  // ═══════════════════════════════════════════════════════════════════════
  const plain = themeStylesheet({})
  check("a theme that never set Phone spacing has no phone spacing rule", !/--theme-spacing-scale:/.test(plain))
  check("Phone spacing 1 is the same", !/--theme-spacing-scale:/.test(themeStylesheet({ spacing_scale_mobile: 1 })))
  const tight = themeStylesheet({ spacing_scale: 1.2, spacing_scale_mobile: 0.7 })
  check("below 1 it multiplies Spacing scale on a section 767px wide or less", /@container \(max-width:767px\)\{\[data-storelib-theme\] \[data-section\]\{--theme-spacing-scale:0\.84;\}\}/.test(tight), tight.match(/@container \(max-width:767px\)\{[^}]*--theme-spacing-scale[^}]*\}\}/)?.[0])
  check("the setting is in Layout", FIELDS.get("spacing_scale_mobile")?.type === "range")
  check("Show on: nothing for both", Object.keys(showOnAttr(undefined, false)).length === 0 && Object.keys(showOnAttr("both", false)).length === 0)
  check("Show on: desktop only on the site", showOnAttr("desktop", false)["data-show-on"] === "desktop")
  check("Show on: faint, not gone, in the builder", showOnAttr("mobile", true)["data-show-on-editor"] === "mobile" && !("data-show-on" in showOnAttr("mobile", true)))
  check("the stylesheet hides it on the other size", /@container \(max-width:767px\)\{[^}]*\[data-show-on="desktop"\]>\*\{display:none !important;\}/.test(plain) && /@container \(min-width:768px\)\{[^}]*\[data-show-on="mobile"\]>\*\{display:none !important;\}/.test(plain))

  // ═══════════════════════════════════════════════════════════════════════
  section("Group: column widths and a background picture, default unchanged")
  // ═══════════════════════════════════════════════════════════════════════
  const groupBlock = { id: "g", type: "group", settings: { direction: "row" }, blocks: [{ id: "h", type: "heading", settings: {} }, { id: "t", type: "text", settings: {} }] }
  const drawGroup = (settings: Record<string, unknown>) => {
    const r = compileSection(read("themes/default/sections/blocks_section.storelib"))
    if (!r.ok) return ""
    return renderSection({ compiled: r.value, id: "b", instance: { type: "blocks_section", settings: {}, blocks: [{ ...groupBlock, settings: { ...groupBlock.settings, ...settings } }] }, theme: {}, page: { template: "index" }, blocks: (t: string) => BLOCKS[t] ?? null } as never).html
  }
  const before = drawGroup({})
  check("a group saved before this draws with no new class and no picture", /class="sl-group sl-group--row/.test(before) && !/sl-group--r\d|sl-group--photo|sl-group__photo/.test(before))
  check("Equal is the same as nothing", !/sl-group--r\d/.test(drawGroup({ ratio: "equal" })))
  check("1 : 2 adds its class", /sl-group--r1_2/.test(drawGroup({ ratio: "1_2" })))
  const photo = drawGroup({ background_image: "https://cdn.example/g.jpg", overlay_opacity: 50 })
  check("a background picture with its veil", /sl-group--photo/.test(photo) && /class="sl-group__photo" src="https:\/\/cdn\.example\/g\.jpg" alt=""/.test(photo) && /sl-group__veil/.test(photo) && /--g-ov-a: 50%/.test(photo))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
