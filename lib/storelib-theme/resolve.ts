/**
 * ===========================================================================
 *  WHAT A SETTING IS WORTH, RIGHT NOW
 * ===========================================================================
 * A template instance stores only what a person changed. Everything else is
 * decided here, in one order, every time:
 *
 *   1. Storelib's own default for the control type     (registry fallback)
 *   2. the theme's settings, for tokens                 (theme)
 *   3. the section schema's default                     (setting.default)
 *   4. the instance's value                             (saved)
 *   5. for a block, the block instance's value          (saved, per block)
 *
 * Later wins. `resolved = saved ?? schemaDefault ?? controlFallback`, with
 * the theme supplying tokens rather than per-setting values, which is why
 * it is a level rather than a step in the chain. Documented in
 * docs/theme/07-settings-resolution.md, and this file is that document's
 * implementation.
 *
 * Three transformations happen on the way through, so a template never has
 * to do them:
 *
 *   RESPONSIVE  a setting marked `responsive: true` comes out as
 *               `{desktop, tablet, mobile}` with every breakpoint filled,
 *               whatever the person set. Set desktop only, and tablet and
 *               mobile inherit it. Set all three, and each is its own.
 *
 *   ASSETS      an `asset://…` reference in an image, video or file setting
 *               comes out as the URL this account serves it from. The
 *               template sees a URL; the stored data never contains one.
 *
 *   UNKNOWN     a saved key the schema does not declare is passed through
 *               untouched. A theme from a later engine, or a setting that
 *               was renamed, keeps its data.
 */
import { controlFor, holdsValue, type ValueKind } from "./controls/registry"
import { BREAKPOINTS, isAssetRef, type Breakpoint, type ResponsiveValue, type SectionInstanceData, type SectionSchema, type SettingDefinition } from "./types"

export interface ResolveOptions {
  /** `asset://…` → URL. Missing references resolve to "". */
  assets?: Record<string, string>
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Fill a responsive value downwards: mobile ← tablet ← desktop. */
export function fillResponsive<T>(v: unknown, fallback: T): ResponsiveValue<T> {
  if (isPlain(v) && BREAKPOINTS.some((b) => b in v)) {
    const desktop = (v.desktop ?? fallback) as T
    const tablet = (v.tablet ?? desktop) as T
    const mobile = (v.mobile ?? tablet) as T
    return { desktop, tablet, mobile }
  }
  const one = (v === undefined ? fallback : v) as T
  return { desktop: one, tablet: one, mobile: one }
}

function resolveAsset(v: unknown, kind: ValueKind, assets: Record<string, string>): unknown {
  if (kind === "asset") return isAssetRef(v) ? (assets[v] ?? "") : v
  if (kind === "asset_list" && Array.isArray(v)) return v.map((x) => (isAssetRef(x) ? (assets[x] ?? "") : x))
  return v
}

/**
 * One setting, resolved. Exposed for the editor, which shows the resolved
 * value in a control and a "reset to default" affordance when it differs.
 */
export function resolveOne(def: SettingDefinition, saved: unknown, opts: ResolveOptions = {}): unknown {
  const control = controlFor(def.type)
  if (!control || control.value === "none") return undefined
  const fallback = def.default !== undefined ? def.default : control.fallback
  const assets = opts.assets ?? {}
  if (def.responsive && control.responsive) {
    const r = fillResponsive(saved, fallback)
    return {
      desktop: resolveAsset(r.desktop, control.value, assets),
      tablet: resolveAsset(r.tablet, control.value, assets),
      mobile: resolveAsset(r.mobile, control.value, assets),
    }
  }
  return resolveAsset(saved === undefined ? fallback : saved, control.value, assets)
}

export function resolveSettings(
  defs: SettingDefinition[],
  saved: Record<string, unknown> | undefined,
  opts: ResolveOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const declared = new Set<string>()
  for (const def of defs) {
    if (!holdsValue(def.type)) continue
    declared.add(def.id)
    out[def.id] = resolveOne(def, saved?.[def.id], opts)
  }
  // Unknown keys survive. They are not the engine's to drop.
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (!declared.has(k)) out[k] = v
  }
  return out
}

/**
 * A whole instance against its schema: settings, then each block in
 * `block_order` against its block definition. Blocks whose type the schema
 * no longer declares are kept with their raw settings, so a section update
 * that drops a block type does not silently drop the content in it.
 */
export function resolveInstance(
  schema: SectionSchema,
  instance: SectionInstanceData,
  opts: ResolveOptions = {},
): { settings: Record<string, unknown>; blocks: { id: string; type: string; settings: Record<string, unknown> }[] } {
  const settings = resolveSettings(schema.settings, instance.settings, opts)
  const byType = new Map((schema.blocks ?? []).map((b) => [b.type, b]))
  const order = instance.block_order ?? Object.keys(instance.blocks ?? {})
  const blocks = order
    .map((id) => {
      const b = instance.blocks?.[id]
      if (!b || b.hidden) return null
      const def = byType.get(b.type)
      return { id, type: b.type, settings: def ? resolveSettings(def.settings, b.settings, opts) : { ...(b.settings ?? {}) } }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
  return { settings, blocks }
}

/**
 * The inverse, for saving: keep only what differs from the default, so a
 * template stays small and a later change to a default reaches every
 * instance that never overrode it.
 */
export function stripDefaults(defs: SettingDefinition[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const byId = new Map(defs.map((d) => [d.id, d]))
  for (const [k, v] of Object.entries(values)) {
    const def = byId.get(k)
    if (!def) { out[k] = v; continue }
    const control = controlFor(def.type)
    const fallback = def.default !== undefined ? def.default : control?.fallback
    if (v === undefined) continue
    if (def.responsive && isPlain(v)) {
      const f = fillResponsive(v, fallback)
      if (f.desktop === fallback && f.tablet === fallback && f.mobile === fallback) continue
      // Collapse a value that is the same at every breakpoint.
      out[k] = f.desktop === f.tablet && f.tablet === f.mobile ? f.desktop : { desktop: f.desktop, tablet: f.tablet, mobile: f.mobile }
      continue
    }
    if (JSON.stringify(v) === JSON.stringify(fallback)) continue
    out[k] = v
  }
  return out
}

/**
 * The theme's tokens, from its settings. Sections read `theme.colors.primary`
 * rather than `theme.settings.primary_color`, so a theme can rename a
 * setting without every section noticing — and the raw settings are still
 * there under `theme.settings` for anything a token does not cover.
 */
/**
 * The five schemes every theme starts with. Copied here rather than imported:
 * this package must not reach into the application, and these are data. A
 * theme's own `color_schemes` setting overrides any of them by name.
 */
export const DEFAULT_SCHEMES: Record<string, Record<string, string>> = {
  white: { bg: "#ffffff", text: "#5C5B63", heading: "#0f172a", paragraph: "#5C5B63", border: "#e2e8f0", link: "#0f172a", accent: "#1f2937", primary_btn_bg: "#000000", primary_btn_text: "#ffffff", secondary_btn_bg: "#ffffff", secondary_btn_text: "#0f172a" },
  light: { bg: "#f8fafc", text: "#0f172a", heading: "#0f172a", paragraph: "#475569", border: "#e2e8f0", link: "#0f172a", accent: "#1f2937", primary_btn_bg: "#0f172a", primary_btn_text: "#ffffff", secondary_btn_bg: "#ffffff", secondary_btn_text: "#0f172a" },
  dark: { bg: "#1f2937", text: "#f8fafc", heading: "#ffffff", paragraph: "#cbd5e1", border: "#374151", link: "#f8fafc", accent: "#e5e7eb", primary_btn_bg: "#ffffff", primary_btn_text: "#0f172a", secondary_btn_bg: "transparent", secondary_btn_text: "#ffffff" },
  black: { bg: "#000000", text: "#ffffff", heading: "#ffffff", paragraph: "#cbd5e1", border: "#1f2937", link: "#ffffff", accent: "#e5e7eb", primary_btn_bg: "#ffffff", primary_btn_text: "#000000", secondary_btn_bg: "transparent", secondary_btn_text: "#ffffff" },
  highlight: { bg: "#fde2e4", text: "#1f2937", heading: "#1f2937", paragraph: "#475569", border: "#fbcfd1", link: "#1f2937", accent: "#0f172a", primary_btn_bg: "#1f2937", primary_btn_text: "#fde2e4", secondary_btn_bg: "transparent", secondary_btn_text: "#1f2937" },
}

export function themeTokens(settings: Record<string, unknown>): Record<string, unknown> {
  const s = (k: string, d: unknown = undefined) => (settings[k] === undefined ? d : settings[k])
  const own = isPlain(settings.color_schemes) ? (settings.color_schemes as Record<string, unknown>) : {}
  const schemes: Record<string, Record<string, unknown>> = {}
  for (const [name, base] of Object.entries(DEFAULT_SCHEMES)) {
    schemes[name] = { ...base, ...(isPlain(own[name]) ? (own[name] as Record<string, unknown>) : {}) }
  }
  for (const [name, v] of Object.entries(own)) if (!schemes[name] && isPlain(v)) schemes[name] = v
  return {
    schemes,
    colors: {
      primary: s("primary_color", "#6366f1"),
      secondary: s("secondary_color", "#111827"),
      accent: s("accent_color", "#f59e0b"),
      background: s("background_color", "#ffffff"),
      surface: s("surface_color", "#f9fafb"),
      text: s("text_color", "#111827"),
      muted: s("muted_color", "#6b7280"),
    },
    typography: {
      heading: s("font_heading", "Inter"),
      body: s("font_body", "Inter"),
    },
    radius: {
      small: 4,
      medium: Number(s("border_radius", 8)),
      large: Number(s("border_radius", 8)) * 2,
      pill: 9999,
    },
    spacing: { small: 16, medium: 32, large: 64, xlarge: 96 },
    settings,
  }
}

export type { Breakpoint }
