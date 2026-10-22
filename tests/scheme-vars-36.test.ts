/**
 * ===========================================================================
 *  ROUND 36: A SCHEME COLOUR UNDER A FINGER IS ITS VARIABLES ALONE
 * ===========================================================================
 * The owner: "Use CSS variables for instant color ... changes appear
 * immediately". The builder's canvas draws a .storelib section's scheme
 * colours as the variables its root holds, where its template allows
 * (lib/storelib-theme/scheme-vars.ts); while a colour of a scheme is dragged
 * those sections are not drawn again, their roots' variables are written
 * (lib/website-builder/scheme-var-patch.ts). The published page prints the
 * colours, byte for byte as before. scripts/check-scheme-vars.ts holds the two
 * to the same computed styles in Chromium; scripts/check-editor-live-edit.mjs
 * measures the drag.
 *
 * Run with:  npx tsx --conditions=react-server tests/scheme-vars-36.test.ts
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { readsSchemeAsVariables, schemeAsVariables, schemeFollowingSettings } from "@/lib/storelib-theme/scheme-vars"
import { resolveSectionColors } from "@/lib/storelib-theme/color-schemes"
import { compileBlock, compileSection } from "@/lib/storelib-theme/storelib/compile"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { schemeColoursOnly, schemeVarWriter } from "@/lib/website-builder/scheme-var-patch"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWHICH TEMPLATES READ THEIR SCHEME ONLY WHERE A VARIABLE CAN STAND IN")
{
  const plain = `<section class="s" style="--s-bg: {{ scheme.bg }}; --s-text: {{ scheme.text }}; --mark: {{ settings.marker | default: scheme.border }};">{{ settings.heading }}</section>`
  check("colours printed as they are, in a style attribute", readsSchemeAsVariables(plain, ""))
  check("in the section's CSS", readsSchemeAsVariables("<p>x</p>", ".s { color: {{ scheme.heading }}; }"))
  check("in a <style> of the template", readsSchemeAsVariables("<style>.x { color: {{ scheme.heading }} }</style><p>x</p>", ""))
  check("a quote inside a tag of the language does not end the attribute", readsSchemeAsVariables(`<div style="{% if settings.mode == "a" %}x{% endif %} --c: {{ scheme.text }}">`, ""))
  check("not through a filter (a colour worked out from it)", !readsSchemeAsVariables(`<div style="background: {{ scheme.bg | alpha: 0.5 }}">`, ""))
  check("nor after a default and a filter", !readsSchemeAsVariables(`<div style="--r: {{ settings.c | default: scheme.heading | alpha: 0.55 }}">`, ""))
  check("nor in a tag (a choice made on the colour)", !readsSchemeAsVariables(`{% if scheme.bg == '#ffffff' %}<p>x</p>{% endif %}`, ""))
  check("nor outside CSS: an SVG's fill takes no variable", !readsSchemeAsVariables(`<svg fill="{{ scheme.text }}"></svg>`, ""))
  check("nor in another attribute that only looks like it", !readsSchemeAsVariables(`<div data-style="{{ scheme.text }}"></div>`, ""))
  check("a colour setting that follows the scheme is held to the same", !readsSchemeAsVariables(`<div style="--a: {{ settings.star | alpha: 0.4 }}"></div>`, "", ["star"]) && readsSchemeAsVariables(`<div style="--a: {{ settings.star }}"></div>`, "", ["star"]))
  check("which settings follow the scheme, from the schema", JSON.stringify(schemeFollowingSettings([{ id: "star", type: "color", default: "scheme.accent" }, { id: "x", type: "color", default: "#fff" }, { id: "t", type: "text", default: "scheme.text" }])) === '["star"]')
  const s = resolveSectionColors({}, { color_scheme: "dark" })
  const v = schemeAsVariables(s.scheme, s.legacy)
  check("the scheme as variables: semantic and older names alike, the fixed colours as they are", v.heading === "var(--scheme-heading)" && v.bg === "var(--scheme-background)" && v.primary_btn_bg === "var(--scheme-button-primary)" && v.sale_badge_bg === s.legacy.sale_badge_bg, { heading: v.heading, bg: v.bg })
  const g = resolveSectionColors({ color_schemes: { white: { gradient: "linear-gradient(135deg, #fde68a 0%, #f472b6 100%)" } } }, { color_scheme: "white" })
  check("a scheme with a gradient keeps the gradient where a section paints its root", schemeAsVariables(g.scheme, g.legacy).bg === g.legacy.bg && g.legacy.bg.startsWith("linear-gradient"))
}

console.log("\nTHE DEFAULT THEME")
{
  const dir = "themes/default"
  const as: string[] = [], not: string[] = []
  for (const f of readdirSync(join(dir, "sections")).filter((n) => n.endsWith(".storelib"))) {
    const r = compileSection(read(join(dir, "sections", f)), { file: `sections/${f}` })
    if (r.ok) (r.value.schemeVars ? as : not).push(f)
  }
  const blocks = readdirSync(join(dir, "blocks")).filter((n) => n.endsWith(".storelib")).map((f) => compileBlock(read(join(dir, "blocks", f)), { file: `blocks/${f}`, type: f.replace(".storelib", "") }))
  check(`${as.length} of its ${as.length + not.length} sections read their scheme as variables (the one that works a colour out prints colours)`, as.length >= 55 && not.every((f) => f === "hero.storelib"), not)
  check("and every block", blocks.every((b) => b.ok && b.value.schemeVars === true))

  const theme = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as unknown as ThemeSettingsValues
  const schema = STORELIB_SCHEMAS.hero_centered
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  const instance = { id: "h1", type: "hero_centered", settings: { ...settings, color_scheme: "dark" }, blocks: [] } as unknown as SectionInstance
  const live = renderStorelibSection(instance, theme, { template: "index" }, {})
  const canvas = renderStorelibSection(instance, theme, { template: "index", in_editor: true }, {}, undefined, undefined, undefined, { schemeVariables: true })
  const editor = renderStorelibSection(instance, theme, { template: "index", in_editor: true }, {})
  check("the published page prints the colours, and its root is not marked", live.ok && !live.html.includes("var(--scheme-") && !live.html.includes("data-scheme-vars"))
  check("so does any drawing that does not ask (the picker's previews)", editor.ok && !editor.html.includes("data-scheme-vars"))
  check("the canvas prints the variables, its root marked, and its root still holds the colours", canvas.ok && /--s-heading: var\(--scheme-heading\)/.test(canvas.html) && /data-scheme-vars/.test(canvas.html) && /--scheme-heading:#/.test(canvas.html))
  const hero = { id: "h2", type: "hero", settings: {}, blocks: [] } as unknown as SectionInstance
  const heroCanvas = renderStorelibSection(hero, theme, { template: "index", in_editor: true }, {}, undefined, undefined, undefined, { schemeVariables: true })
  check("a section that works a colour out prints colours on the canvas too", !heroCanvas.ok || !heroCanvas.html.includes("data-scheme-vars"))
}

console.log("\nWHILE A SCHEME COLOUR IS DRAGGED")
{
  const base = { page_width: 1200, color_schemes: { white: { background: "#ffffff" } } }
  check("a colour of a scheme moved is a scheme colour only", schemeColoursOnly(base, { ...base, color_schemes: { white: { background: "#fafafa" } } }))
  check("another setting moved with it is not", !schemeColoursOnly(base, { page_width: 1100, color_schemes: { white: { background: "#fafafa" } } }))
  check("a gradient given to a scheme is not (it paints the root itself)", !schemeColoursOnly(base, { ...base, color_schemes: { white: { background: "#ffffff", gradient: "linear-gradient(90deg, #000000 0%, #ffffff 100%)" } } }))
  check("a scheme added is not", !schemeColoursOnly(base, { ...base, color_schemes: { white: { background: "#ffffff" }, mine: { background: "#000000" } } }))
  /* A root, as far as the writer touches one. */
  const fakeRoot = (scheme: string) => {
    const props = new Map<string, string>()
    return { isConnected: true, getAttribute: (n: string) => (n === "data-color-scheme" ? scheme : null), style: { getPropertyValue: (k: string) => props.get(k) ?? "", setProperty: (k: string, v: string) => { props.set(k, v) } }, props }
  }
  const w = schemeVarWriter()
  const a = fakeRoot("white"), b = fakeRoot("dark")
  const live = { ...base, color_schemes: { white: { background: "#fafafa" } } }
  w.write(base, live, [{ id: "a", root: a as unknown as HTMLElement, settings: {} }, { id: "b", root: b as unknown as HTMLElement, settings: {} }])
  check("only the variables the colour changes are written, on the roots of its scheme", a.props.get("--scheme-background") === "#fafafa" && b.props.size === 0, [...a.props])
  check("the sections written keep the committed theme", w.has("a") && w.has("b"))
  const committed = { ...base, color_schemes: { white: { background: "#f0f0f0" } } }
  w.letGo(committed)
  check("once committed a root shows the committed colour until it is drawn with it, and nothing is written by hand", a.props.get("--scheme-background") === "#f0f0f0" && !w.has("a"))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the canvas keeps the committed theme for a section whose colours are written as its variables", /onScreen\(id\) && !patchCanvasThemeVars\.byVariables\(id\)\) \? theme : committedTheme/.test(editor))
  check("the patcher writes a scheme colour only onto the roots drawn with variables, on screen", /if \(schemeColoursOnly\(base as unknown as Record<string, unknown>, theme as unknown as Record<string, unknown>\)\) \{/.test(editor) && /querySelector<HTMLElement>\("\[data-scheme-vars\]"\)/.test(editor))
  const live2 = read("components/website-builder/sections/storelib-live.tsx")
  check("only the builder's canvas asks for variables", /canvas \? CANVAS_RENDER : undefined/.test(live2) && /const CANVAS_RENDER = \{ schemeVariables: true \} as const/.test(live2))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
