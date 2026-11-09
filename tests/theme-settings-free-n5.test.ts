/**
 * Round N, N5: on an AI-built ("free") website, Theme settings are the site's
 * OWN design system, not the default theme's.
 *
 *   1. the audit: which default theme groups a free site keeps, which wait under Built-in sections
 *   2. declaring settings: cleanDesignSettings keeps what the panel and the page can use
 *   3. the agent's call: set_tokens `settings` stores them, values become --t-* on the page
 *   4. the panel: a change writes the token or the site's own value; the agent's `site` scheme is the one edited
 *   5. root causes fixed on the way: the agent's section rhythm reached the page; the panel read the wrong scheme
 *   6. a normal theme site is unchanged
 *   7. the editor wiring and copy
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/theme-settings-free-n5.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { themeVars } from "@/lib/website-builder/theme-css"
import {
  BUILT_IN_SECTION_GROUPS,
  DESIGN_SETTINGS_SETTING,
  FREE_SITE_HIDDEN_FIELDS,
  builtInSectionGroups,
  cleanDesignSettings,
  designPatch,
  designSettingsWrite,
  designValue,
  designVars,
  freeSitePlatformGroups,
  isFreeSite,
  readDesignSettings,
  type DesignGroupInput,
} from "@/lib/ai-builder/site-settings"
import { themeSettingsToTokens, tokensToThemeSettings as panelTokens } from "@/lib/ai-builder/tokens"
import { tokensToThemeSettings as agentTokens } from "@/lib/ai-builder/agent/tokens"
import { createToolSet } from "@/lib/ai-builder/agent/tools-impl"
import { memoryStore } from "@/lib/ai-builder/agent/memory-store"
import { newCheckpoint } from "@/lib/ai-builder/agent/state"
import { TOOL_SPECS } from "@/lib/ai-builder/agent/tool-specs"
import { DEFAULT_JOB_BUDGET, type ValidationIssue } from "@/lib/ai-builder/types"
import type { AgentJobInput } from "@/lib/ai-builder/agent/ports"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const PALETTE = { background: "#f4efe6", surface: "#ebe4d8", text: "#1d1b18", muted: "#5c564d", accent: "#c2410c", accentText: "#ffffff", border: "#d6cdbd", inverse: { background: "#1d1b18", text: "#f4efe6", accent: "#fdba74" } }

/** A design system as a designer would group it. */
const SETTINGS: DesignGroupInput[] = [
  {
    id: "palette",
    label: "Palette",
    settings: [
      { id: "paper", label: "Paper", token: "colors.background" },
      { id: "ink", label: "Ink", token: "colors.text" },
      { id: "clay", label: "Clay", token: "colors.accent" },
      { id: "moss", label: "Moss", type: "color", value: "#4d5b3a" },
    ],
  },
  {
    id: "type",
    label: "Type",
    settings: [
      { id: "display", label: "Display", token: "fonts.heading" },
      { id: "text-face", label: "Text", token: "fonts.body" },
      { id: "scale", label: "Scale", token: "typeScale.ratio" },
    ],
  },
  {
    id: "texture",
    label: "Texture",
    settings: [
      { id: "grain", label: "Paper grain", type: "toggle", on: "0.06", off: "0", value: true, info: "A faint grain over the page." },
      { id: "hero-overlay", label: "Hero overlay", type: "range", min: 0, max: 80, step: 5, unit: "%", value: 35 },
      { id: "edge", label: "Card edge", type: "select", options: [{ value: "0px", label: "None" }, { value: "1px", label: "Hairline" }, { value: "2px", label: "Bold" }], value: "1px" },
      { id: "wobble", label: "Wobble", type: "font" },
    ],
  },
]

function jobInput(): AgentJobInput {
  return { jobId: "11111111-2222-3333-4444-555555555555", creatorId: "creator-a", installId: "install-a", prompt: "A ceramics studio", mode: "blank", options: { generation: "blank" }, budget: { ...DEFAULT_JOB_BUDGET }, startedAt: 0, spentUsd: 0, lastEventSeq: 0 }
}

async function main() {
  console.log("\n1. the audit: what a free site keeps")
  {
    const platform = freeSitePlatformGroups(THEME_SETTINGS_GROUPS).map((g) => g.id)
    check("a free site keeps only the groups that act on every site", JSON.stringify(platform) === JSON.stringify(["branding", "social", "cart", "cookies", "animations", "custom_css"]), platform)
    const builtIn = builtInSectionGroups(THEME_SETTINGS_GROUPS).map((g) => g.id)
    check("the default theme's style groups wait under Built-in sections", JSON.stringify(builtIn) === JSON.stringify([...BUILT_IN_SECTION_GROUPS]), builtIn)
    const shown = new Set([...platform, ...builtIn])
    const dropped = THEME_SETTINGS_GROUPS.map((g) => g.id).filter((id) => !shown.has(id))
    check("the old announcement bar and menus are not on a free site's list", JSON.stringify(dropped.sort()) === JSON.stringify(["announcement", "menus"]), dropped)
    check("the built-in header and footer switches of Social links are hidden", FREE_SITE_HIDDEN_FIELDS.has("social_show_in_footer") && FREE_SITE_HIDDEN_FIELDS.has("social_show_in_header") && THEME_SETTINGS_GROUPS.find((g) => g.id === "social")!.fields.some((f) => f.id === "social_show_in_footer"))
    check("free = the AI's own chrome AND a design of its own", isFreeSite({ site_chrome: "home" }, true) && !isFreeSite({ site_chrome: "home" }, false) && !isFreeSite({}, true) && !isFreeSite(null, true))
  }

  console.log("\n2. declaring settings")
  {
    const issues: ValidationIssue[] = []
    const clean = cleanDesignSettings(SETTINGS, issues)
    check("groups keep the designer's order and labels", JSON.stringify(clean.groups.map((g) => g.label)) === JSON.stringify(["Palette", "Type", "Texture"]))
    const clay = clean.groups[0].settings.find((s) => s.id === "clay")!
    check("a bound setting takes its control from the token", clay.type === "color" && clay.token === "colors.accent")
    const scale = clean.groups[1].settings.find((s) => s.id === "scale")!
    check("a bound range takes the token's limits", scale.type === "range" && scale.min === 1.05 && scale.max === 1.6)
    check("a font of its own is refused (it would not load)", !clean.groups[2].settings.some((s) => s.id === "wobble") && issues.some((i) => i.code === "settings.font"))
    const bad = cleanDesignSettings([
      { label: "Bad", settings: [
        { id: "Bad Id", label: "x", type: "color" },
        { id: "radius-md", label: "Scale name", type: "range", min: 0, max: 4 },
        { id: "r", label: "Backwards", type: "range", min: 4, max: 1 },
        { id: "s", label: "One option", type: "select", options: [{ value: "a", label: "A" }] },
        { id: "t", label: "Same", type: "toggle", on: "1", off: "1" },
        { id: "u", label: "Odd unit", type: "range", min: 0, max: 4, unit: "parsecs" },
        { id: "v", label: "", type: "color" },
        { id: "w", label: "Unknown token", token: "colors.sparkle" },
        { id: "x", label: "Evil option", type: "select", options: [{ value: "url(x)", label: "A" }, { value: "red;}", label: "B" }] },
      ] },
      { label: "Twice", settings: [{ id: "ok", label: "Ok", type: "color" }, { id: "ok", label: "Again", type: "color" }] },
    ])
    check("bad ids, scale names, ranges, options, toggles, units, labels and tokens are all left out", bad.groups.length === 1 && bad.groups[0].label === "Twice" && bad.groups[0].settings.length === 1, bad)
    const many = cleanDesignSettings([{ label: "Many", settings: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, type: "color" as const })) }])
    check("a group keeps 24 settings at most", many.groups[0].settings.length === 24)
    check("labels are one plain line", cleanDesignSettings([{ label: "  Pal<b>ette\n ", settings: [{ id: "a", label: "A", type: "color" }] }]).groups[0].label === "Pal b ette")
  }

  console.log("\n3. the agent declares them with set_tokens")
  const store = memoryStore({ pages: { home: [] }, settings: { site_chrome: "home", background_color: "#ffffff" } })
  const cp = newCheckpoint()
  cp.concept = {} as never
  cp.sitePlan = {} as never /* round N3: the site plan opens the writes too */
  const events: unknown[] = []
  const tools = createToolSet({ job: jobInput(), deps: { store, models: {} as never, capabilities: async () => ({}) as never }, cp, emit: (e) => events.push(e), onFinish: async () => ({ ok: true }) as never, setPhase: () => undefined })
  const r = await tools.set_tokens({ tokens: { colors: PALETTE, fonts: { heading: "Fraunces", body: "Inter" }, typeScale: { base: 17, ratio: 1.3 }, shadow: "sm", spacing: { scale: 1, sectionY: 128, pageWidth: 1240, gutter: 28 } }, settings: SETTINGS })
  const site = store.project.settings
  check("set_tokens with settings is ok and says what changed", r.ok === true && r.changed.includes(DESIGN_SETTINGS_SETTING) && r.changed.includes("color_schemes"), r)
  check("what was left out is said (the unbound font)", (r.issues ?? []).some((i) => i.code === "settings.font"), r.issues)
  const declared = readDesignSettings(site)
  check("the declared groups are stored as a Theme setting", declared?.groups.length === 3 && declared.groups[2].settings.map((s) => s.id).join() === "grain,hero-overlay,edge", declared)
  const custom = site.custom_tokens as Record<string, string>
  check("values of the site's own are stored with their unit", custom.moss === "#4d5b3a" && custom.grain === "0.06" && custom["hero-overlay"] === "35%" && custom.edge === "1px", custom)
  const vars = themeVars(site as never) as Record<string, string>
  check("every setting is a --t-* on the page: its own ones", vars["--t-moss"] === "#4d5b3a" && vars["--t-grain"] === "0.06" && vars["--t-hero-overlay"] === "35%" && vars["--t-edge"] === "1px")
  check("and the bound ones mirror their token (the ratio reads back from the text sizes, so to the pixel)", vars["--t-clay"] === "#c2410c" && vars["--t-paper"] === "#f4efe6" && vars["--t-display"] === "var(--theme-font-heading)" && Math.abs(parseFloat(vars["--t-scale"]) - 1.3) < 0.02, Object.fromEntries(Object.entries(vars).filter(([k]) => k.startsWith("--t-"))))
  check("the type scale and shadow are Theme settings now (they were not taken)", (site.typography_styles as Record<string, { size: { desktop: number } }>).body.size.desktop === 17 && site.card_shadow === "sm")
  check("the agent's section rhythm reaches the page (it was replaced by 96px)", site.ai_section_y === 128 && vars["--t-section-y"] === "calc(128px * 1)", vars["--t-section-y"])
  check("the site's own scheme stays the default", site.default_color_scheme === "site")
  const again = await tools.set_tokens({ tokens: { colors: { ...PALETTE, accent: "#9a3412" } } })
  check("a later call without settings keeps them, and the bound value follows the token", again.ok && readDesignSettings(store.project.settings)?.groups.length === 3 && (themeVars(store.project.settings as never) as Record<string, string>)["--t-clay"] === "#9a3412")
  const none = await tools.set_tokens({ tokens: {} })
  check("set_tokens with nothing set is still not ok", none.ok === false && (none.issues ?? []).some((i) => i.severity === "error"))
  const onlySettings = await tools.set_tokens({ tokens: {}, settings: [{ label: "Motion", settings: [{ id: "pace", label: "Pace", token: "motion.level" }] }] })
  check("settings alone are a change; sending them replaces the list", onlySettings.ok && readDesignSettings(store.project.settings)?.groups.map((g) => g.label).join() === "Motion")
  check("an unusable starting value says so and starts at a safe one", designSettingsWrite([{ label: "X", settings: [{ id: "o", label: "O", type: "range", min: 0, max: 10, unit: "px", value: "lots" }] }], {}).issues.some((i) => i.code === "settings.value"))
  check("a colour with no value is left out, never guessed", !JSON.stringify(designSettingsWrite([{ label: "X", settings: [{ id: "c", label: "C", type: "color" }] }], {}).settings.design_settings).includes('"c"'))
  const spec = TOOL_SPECS.set_tokens.parameters as { properties: Record<string, { items?: { properties?: Record<string, { items?: { properties?: Record<string, { enum?: string[] }> } }> } }> }
  const settingProps = spec.properties.settings?.items?.properties?.settings?.items?.properties ?? {}
  check("the tool spec offers settings, with the bindable tokens listed", !!settingProps.token?.enum?.includes("colors.accent") && !!settingProps.type?.enum?.includes("toggle") && (TOOL_SPECS.set_tokens.parameters as { required: string[] }).required.join() === "tokens")
  check("the agent is told to declare them", /send settings: the site's own Theme settings/.test(read("lib/ai-builder/agent/prompts.ts")))

  console.log("\n4. the panel edits them")
  {
    await tools.set_tokens({ tokens: {}, settings: SETTINGS })
    const theme = store.project.settings
    const groups = readDesignSettings(theme)!.groups
    const clay = groups[0].settings.find((s) => s.id === "clay")!
    check("a bound colour shows the site's own accent, not the blank start's", designValue(theme, clay) === "#9a3412", designValue(theme, clay))
    const patch = designPatch(theme, clay, "#0f766e")
    const schemes = patch.color_schemes as Record<string, Record<string, string>> | undefined
    check("changing it rewrites the site scheme and keeps it the default", schemes?.site?.accent === "#0f766e" && schemes.site.primary_button_background === "#0f766e" && typeof schemes.site.primary_button_hover_background === "string" && patch.default_color_scheme === undefined && !("white" in (schemes ?? {}) && JSON.stringify(schemes!.white) !== JSON.stringify((theme.color_schemes as Record<string, unknown>).white)), patch)
    check("only the colour group's settings are written", Object.keys(patch).every((k) => ["color_schemes", "default_color_scheme", "background_color", "text_color", "primary_color"].includes(k)), Object.keys(patch))
    const overlay = groups[2].settings.find((s) => s.id === "hero-overlay")!
    check("a range of its own reads as a number and writes with its unit", designValue(theme, overlay) === 35 && (designPatch(theme, overlay, 50).custom_tokens as Record<string, string>)["hero-overlay"] === "50%")
    check("and is held to its limits", (designPatch(theme, overlay, 500).custom_tokens as Record<string, string>)["hero-overlay"] === "80%")
    const grain = groups[2].settings.find((s) => s.id === "grain")!
    check("a toggle reads on and writes its off value", designValue(theme, grain) === true && (designPatch(theme, grain, false).custom_tokens as Record<string, string>).grain === "0")
    const edge = groups[2].settings.find((s) => s.id === "edge")!
    check("a select only takes its own options", Object.keys(designPatch(theme, edge, "9px")).length === 0 && (designPatch(theme, edge, "2px").custom_tokens as Record<string, string>).edge === "2px")
    const display = groups[1].settings.find((s) => s.id === "display")!
    check("a font only takes one that loads", Object.keys(designPatch(theme, display, "Comic Sans MS")).length === 0 && designPatch(theme, display, "Playfair Display").font_heading === "Playfair Display")
    const moved = { ...theme, ...designPatch(theme, clay, "#0f766e") }
    check("the canvas follows: the next render's --t-clay is the new colour", (themeVars(moved as never) as Record<string, string>)["--t-clay"] === "#0f766e")
    const panel = read("components/website-builder/editor/site-settings-panel.tsx")
    check("the group panel writes through designPatch and draws the editor's controls", /designPatch\(theme, s, v\)/.test(panel) && /ColorField/.test(panel) && /FontPreviewPicker/.test(panel) && /SliderNumberControl/.test(panel) && /ChoiceControl/.test(panel))
  }

  console.log("\n5. the Design tokens panel reads the agent's scheme")
  {
    const agent = agentTokens({ colors: PALETTE }, {}).settings
    const back = themeSettingsToTokens(agent)
    check("an agent site's tokens read back from its `site` scheme", back.colors.accent === "#c2410c" && back.colors.surface === "#ebe4d8" && back.colors.inverse?.background === "#1d1b18", back.colors)
    const again = panelTokens({ ...back, colors: { ...back.colors, accent: "#2563eb" } }, agent)
    check("and a change there writes the `site` scheme, not `white`", (again.color_schemes as Record<string, { accent: string }>).site.accent === "#2563eb" && again.default_color_scheme === "site" && !("white" in (again.color_schemes as object)))
    const builtin = panelTokens({ ...back }, {})
    check("a site without the `site` scheme keeps the built-in path", builtin.default_color_scheme === "white" && "white" in (builtin.color_schemes as object))
    const refused = agentTokens({ custom: { "section-y": "200px", "page-width": "10px", fine: "2px" } }, {})
    check("the agent cannot shadow a scale token with a custom one", !("section-y" in (refused.settings.custom_tokens as object)) && (refused.settings.custom_tokens as Record<string, string>).fine === "2px" && refused.issues.some((i) => /scale tokens/.test(i.message)))
  }

  console.log("\n6. a normal theme site is unchanged")
  {
    const plain = { primary_color: "#6366f1", border_radius: 8 }
    check("no design settings, no new variables", Object.keys(designVars(plain)).length === 0 && !Object.keys(themeVars(plain as never)).some((k) => k.startsWith("--t-")))
    check("and no free-site list", !isFreeSite(plain, false) && readDesignSettings(plain) === null)
    check("a theme site whose agent declared settings is still not free", !isFreeSite({ ...plain, design_settings: { groups: [] } }, true))
  }

  console.log("\n7. the editor wiring and copy")
  {
    const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("both Theme settings lists go through the site's own panel first", (page.match(/const own = siteDesignPanel\(/g) ?? []).length === 2)
    check("both lists show the site's groups where Design tokens was", (page.match(/\{siteGroupRows\(\)\}/g) ?? []).length === 2 && !/showsDesignTokens\(settingsDraft as Record<string, unknown>, storelibSources\) \? <ThemeGroupRow/.test(page))
    check("a site group opens its own panel, with the editor's switch", /<SiteSettingsGroupPanel[\s\S]{0,200}renderToggle=\{\(p\) => <WbToggle/.test(page))
    check("Social links hides the built-in chrome switches on a free site, in both lists", (page.match(/FREE_SITE_HIDDEN_FIELDS\.has\(field\.id\) \|\| !siteDesignState\(\)\.free/g) ?? []).length === 2)
    const copy = [read("components/website-builder/editor/site-settings-panel.tsx"), read("lib/ai-builder/site-settings.ts"), page.slice(page.indexOf("THEME SETTINGS ON A FREE SITE"), page.indexOf("// ── General Settings mode ──"))].join("\n")
    const uiStrings = [...copy.matchAll(/tt\("([^"]+)"\)/g)].map((m) => m[1])
    check("UI copy is plain: no em dashes, no other platform's names", uiStrings.length >= 3 && uiStrings.every((t) => !/—|Shopify|Liquid/i.test(t)), uiStrings)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
