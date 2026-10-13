/**
 * Every theme setting the builder's sidebar can change, the assistant can
 * change too (lib/website-builder/agent/theme-extras.ts): the text styles,
 * the phone logo, the default colour scheme, a scheme's gradient, and how
 * each section arrives. They were refused as unknown ids because the
 * sidebar writes them from panels of its own, outside the schema. Checked
 * through the agent API's operations (lib/agent-access/page-ops.ts), which
 * hold a write to the same rules as the builder's assistant, and through
 * set_color_scheme itself.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { checkOps } from "@/lib/agent-access/page-ops"
import { schemaMapFor } from "@/lib/website-builder/agent/schemas"
import { setColorScheme } from "@/lib/website-builder/agent/scheme-edit"
import { applyOp, fieldsFor, type ThemeOp, type ThemeState } from "@/lib/website-builder/agent/operations"
import { describeThemeExtras } from "@/lib/website-builder/agent/theme-extras"
import { themeTypography } from "@/lib/storelib-theme/typography"
import { entranceSetting } from "@/lib/website-builder/section-anchors"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const section = (id: string, type: string, settings: Record<string, unknown> = {}): SectionInstance => ({ id, type, name: type, settings, blocks: [], hidden: false }) as SectionInstance

function main() {
  const schemas = schemaMapFor()
  const start: ThemeState = {
    sections: [section("h1", "header"), section("r1", "rich_text", { heading: "Hello" }), section("t1", "tabs_content", { animation: "slide" })],
    settings: { font_heading: "Inter", color_schemes: { white: {}, night: {} }, typography_styles: { body: { size: 17 } } },
  }
  const theme = (settings: Record<string, unknown>) => checkOps(start, [{ op: "update_theme", settings }], schemas)
  const themeAfter = (settings: Record<string, unknown>) => {
    const r = theme(settings)
    return r.ok ? (r.ops[0] as Extract<ThemeOp, { kind: "update_theme" }>).settings : null
  }

  console.log("\nText styles")
  const h1 = themeAfter({ typography_styles: { h1: { size: { desktop: 64, mobile: 40 }, weight: "800" } } })
  const styles = h1 ? themeTypography({ ...start.settings, ...h1 }).styles : null
  check("Heading 1's size on a computer and a phone, and its weight", styles?.h1.size.desktop === 64 && styles.h1.size.mobile === 40 && styles.h1.weight === "800", styles?.h1)
  check("  and the body style set before stays as it was", styles?.body.size.desktop === 17, styles?.body)
  const both = themeAfter({ typography_styles: { h2: { size: 30, transform: "uppercase", letter_spacing: 1 } } })
  const h2 = both ? themeTypography({ ...start.settings, ...both }).styles.h2 : null
  check("one size is both sizes; case and letter spacing", h2?.size.desktop === 30 && h2.size.mobile === 30 && h2.transform === "uppercase" && h2.letter_spacing === 1, h2)
  const big = theme({ typography_styles: { h1: { size: 900 } } })
  check("a size past the panel's limit is held to it, and said", big.ok && themeTypography({ ...start.settings, ...(big.ops[0] as { settings: Record<string, unknown> }).settings }).styles.h1.size.desktop === 200 && big.notes.some((n) => /outside 8 to 200/.test(n)), big)
  check("a style that does not exist is refused, naming the real ones", !theme({ typography_styles: { h7: { size: 20 } } }).ok && /The styles are: h1, h2/.test((theme({ typography_styles: { h7: { size: 20 } } }) as { error: string }).error))
  check("a weight the panel does not offer is refused", !theme({ typography_styles: { h1: { weight: "bold" } } }).ok)
  check("a field a style does not have is refused", !theme({ typography_styles: { h1: { colour: "red" } } }).ok)
  check("text styles and an ordinary setting in one write", (() => { const s = themeAfter({ typography_styles: { button: { weight: "600" } }, font_heading: "Inter" }); return !!s && !!s.typography_styles && s.font_heading === "Inter" })())

  console.log("\nThe phone logo and the default scheme")
  const logo = themeAfter({ use_mobile_logo: true, mobile_logo_url: "https://example.com/logo-small.png", mobile_logo_width: 120 })
  check("another logo on phones, its picture and its height (held to 80)", logo?.use_mobile_logo === true && logo.mobile_logo_url === "https://example.com/logo-small.png" && logo.mobile_logo_width === 80, logo)
  check("the default scheme is one the theme has", themeAfter({ default_color_scheme: "night" })?.default_color_scheme === "night")
  check("  never one it does not", !theme({ default_color_scheme: "sunset" }).ok)
  check("an id nothing has is still refused", !theme({ made_up_setting: 1 }).ok)
  check("the model is told about them under update_theme", /typography_styles/.test(describeThemeExtras()) && /mobile_logo_width/.test(describeThemeExtras()) && /default_color_scheme/.test(describeThemeExtras()) && /describeThemeExtras\(\)/.test(read("lib/website-builder/agent/loop.ts")))

  console.log("\nHow a section arrives")
  check("every body section has the entrance control", fieldsFor("rich_text", schemas).some((f) => f.id === "animation" && (f.options ?? []).some((o) => o.value === "zoom")))
  check("  the header and the footer do not", !fieldsFor("header", schemas).some((f) => f.id === "animation") && !fieldsFor("footer", schemas).some((f) => f.id === "animation"))
  const zoom = checkOps(start, [{ op: "update_section", section_id: "r1", settings: { animation: "zoom" } }], schemas)
  check("a section set to zoom", zoom.ok && (zoom.ops[0] as { settings: Record<string, unknown> }).settings.animation === "zoom", zoom)
  check("  an entrance that does not exist is refused", !checkOps(start, [{ op: "update_section", section_id: "r1", settings: { animation: "spin" } }], schemas).ok)
  const tabs = checkOps(start, [{ op: "update_section", section_id: "t1", settings: { animation: "fade_up" } }], schemas)
  const tabsAfter = tabs.ok ? applyOp(start, tabs.ops[0], schemas).sections.find((s) => s.id === "t1") : null
  check("an older tabs section keeps its slide switch and takes the entrance", tabsAfter?.settings.tab_animation === "slide" && tabsAfter && entranceSetting(tabsAfter) === "fade_up", tabsAfter?.settings)
  check("  the builder's assistant does the same", /found\.type === "tabs_content" && checked\.settings!\.animation !== undefined && found\.settings\?\.tab_animation === undefined/.test(read("lib/website-builder/agent/loop.ts")))

  console.log("\nA scheme's gradient")
  const scheme = (gradient: string) => setColorScheme(JSON.stringify({ scheme: "night", name: "", colorsJson: "{}", gradient }), start)
  const set = scheme("linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)")
  const stored = (r: ReturnType<typeof scheme>) => (((r.op as { settings?: { color_schemes?: Record<string, { gradient?: string }> } } | undefined)?.settings?.color_schemes ?? {}).night ?? {}).gradient
  check("a gradient is set", stored(set) === "linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)", set)
  const withGradient: ThemeState = set.op ? applyOp(start, set.op) : start
  const keep = setColorScheme(JSON.stringify({ scheme: "night", name: "", colorsJson: JSON.stringify({ accent: "#ff0066" }), gradient: "keep" }), withGradient)
  check("  \"keep\" leaves it as it was", stored(keep) === "linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)", keep)
  check("  \"\" removes it", stored(setColorScheme(JSON.stringify({ scheme: "night", name: "", colorsJson: "{}", gradient: "" }), withGradient)) === "")
  const injected = scheme("linear-gradient(red, blue)}; body{display:none")
  check("  anything that is not a gradient is refused, never written into the stylesheet", !injected.op && injected.failed === true, injected)

  console.log("\nIn the editor, an assistant's theme write does what the sidebar's does")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the logo goes into the header section too", /const logo = Object\.entries\(op\.settings\)\.filter\(\(\[key\]\) => key in LOGO_SYNC_THEME_TO_HEADER\)/.test(editor))
  check("and the favicon into an imported theme's own settings", /follows = \{ \.\.\.follows, \.\.\.faviconFollows\(/.test(editor))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
