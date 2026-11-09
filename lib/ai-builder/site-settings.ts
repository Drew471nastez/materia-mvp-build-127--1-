/**
 * ===========================================================================
 *  A WEBSITE'S OWN THEME SETTINGS (round N, N5)
 * ===========================================================================
 * An AI-built website has a design system of its own: a palette with names
 * like Ink and Clay, a display face, a grain overlay that is on or off. Its
 * Theme settings should be exactly those, with the labels and controls the
 * site's designer would give them, not the default theme's Buttons, Product
 * cards and Breadcrumbs.
 *
 * The agent declares them with set_tokens `settings`: groups of labelled
 * settings, each a colour, font, range, select or toggle. They are stored as
 * the Theme setting `design_settings` (the draft, like every Theme setting)
 * and every one comes out as a CSS variable `--t-<id>` the AI's components
 * read:
 *
 *   bound      `token: "colors.accent"` (any DesignTokens path below): the
 *              value IS that token, so it is still a Theme setting the
 *              platform understands (scheme colours for buttons, a font
 *              that is loaded, the type scale). `--t-<id>` mirrors it.
 *   its own    no token: the value lives in `custom_tokens[id]`, which the
 *              page already prints as `--t-<id>` (theme-css.ts).
 *
 * Fonts are always bound (heading, body or accent) because only those three
 * are loaded from Google Fonts. Everything is checked here, once, so the
 * panel, the agent tool and the page agree on what is kept.
 *
 * Pure, no React, safe in the published page's bundle.
 */
import { ACCENT_FONT_OPTIONS, BODY_FONT_OPTIONS, HEADING_FONT_OPTIONS } from "@/lib/website-builder/font-options"
import { CUSTOM_TOKEN_PREFIX, CUSTOM_TOKENS_SETTING, type DesignTokens, type ValidationIssue } from "./types"
import { DESIGN_SETTINGS_SETTING, MAX_CUSTOM_TOKENS, SCALE_TOKENS, TOKEN_NAME, cleanTokenValue, customTokens, themeSettingsToTokens, tokenPatch, type TokenGroup } from "./tokens"

export { DESIGN_SETTINGS_SETTING }

export const DESIGN_CONTROLS = ["color", "font", "range", "select", "toggle"] as const
export type DesignControl = (typeof DESIGN_CONTROLS)[number]

export interface DesignOption {
  value: string
  label: string
}

/** One setting of the site's own, as stored. */
export interface DesignSetting {
  /** Its CSS variable is `--t-<id>`. */
  id: string
  label: string
  type: DesignControl
  /** The DesignTokens value it stands for (DESIGN_BINDINGS), when it is one. */
  token?: DesignBinding
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: DesignOption[]
  /** A toggle's CSS values. */
  on?: string
  off?: string
  info?: string
}

export interface DesignGroup {
  id: string
  label: string
  settings: DesignSetting[]
}

export interface DesignSettings {
  groups: DesignGroup[]
}

/** What the agent sends: the stored shape, loosely, plus a starting `value` for a setting of its own. */
export interface DesignSettingInput extends Partial<Omit<DesignSetting, "token" | "options">> {
  token?: string
  options?: (DesignOption | string)[]
  value?: unknown
}
export interface DesignGroupInput {
  id?: string
  label?: string
  settings?: DesignSettingInput[]
}

/* ── the tokens a setting may stand for ───────────────────────────────── */

interface BindingSpec {
  group: TokenGroup
  type: DesignControl
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: DesignOption[]
}

const SHADOW_OPTIONS: DesignOption[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
]
const MOTION_OPTIONS: DesignOption[] = [
  { value: "none", label: "None" },
  { value: "subtle", label: "Subtle" },
  { value: "expressive", label: "Lively" },
]
const fonts = (list: { label: string; value: unknown }[]): DesignOption[] => list.filter((o) => typeof o.value === "string" && o.value !== "").map((o) => ({ value: o.value as string, label: o.label }))

/** Every DesignTokens path a setting can stand for, with the control and the limits the Theme setting has. */
export const DESIGN_BINDINGS = {
  "colors.background": { group: "colors", type: "color" },
  "colors.surface": { group: "colors", type: "color" },
  "colors.text": { group: "colors", type: "color" },
  "colors.muted": { group: "colors", type: "color" },
  "colors.accent": { group: "colors", type: "color" },
  "colors.accentText": { group: "colors", type: "color" },
  "colors.border": { group: "colors", type: "color" },
  "colors.inverse.background": { group: "colors", type: "color" },
  "colors.inverse.text": { group: "colors", type: "color" },
  "colors.inverse.accent": { group: "colors", type: "color" },
  "fonts.heading": { group: "fonts", type: "font", options: fonts(HEADING_FONT_OPTIONS) },
  "fonts.body": { group: "fonts", type: "font", options: fonts(BODY_FONT_OPTIONS) },
  "fonts.accent": { group: "fonts", type: "font", options: fonts(ACCENT_FONT_OPTIONS) },
  "typeScale.base": { group: "typeScale", type: "range", min: 12, max: 22, step: 1, unit: "px" },
  "typeScale.ratio": { group: "typeScale", type: "range", min: 1.05, max: 1.6, step: 0.01, unit: "" },
  "radius.small": { group: "radius", type: "range", min: 0, max: 32, step: 1, unit: "px" },
  "radius.medium": { group: "radius", type: "range", min: 0, max: 24, step: 1, unit: "px" },
  "radius.large": { group: "radius", type: "range", min: 0, max: 40, step: 1, unit: "px" },
  "spacing.sectionY": { group: "spacing", type: "range", min: 0, max: 240, step: 4, unit: "px" },
  "spacing.pageWidth": { group: "spacing", type: "range", min: 900, max: 1800, step: 20, unit: "px" },
  "spacing.gutter": { group: "spacing", type: "range", min: 8, max: 80, step: 4, unit: "px" },
  "spacing.scale": { group: "spacing", type: "range", min: 0.5, max: 2, step: 0.1, unit: "" },
  "motion.level": { group: "motion", type: "select", options: MOTION_OPTIONS },
  "motion.durationMs": { group: "motion", type: "range", min: 200, max: 1200, step: 50, unit: "ms" },
  shadow: { group: "shadow", type: "select", options: SHADOW_OPTIONS },
} as const satisfies Record<string, BindingSpec>
export type DesignBinding = keyof typeof DESIGN_BINDINGS

const isBinding = (v: unknown): v is DesignBinding => typeof v === "string" && Object.prototype.hasOwnProperty.call(DESIGN_BINDINGS, v)
const binding = (b: DesignBinding): BindingSpec => DESIGN_BINDINGS[b] as BindingSpec
/** The choices a bound setting offers (the fonts that load, the shadow levels), or none. */
export const bindingOptions = (b: DesignBinding | undefined): DesignOption[] => (b ? binding(b).options ?? [] : [])

/* ── limits ───────────────────────────────────────────────────────────── */

export const MAX_DESIGN_GROUPS = 10
export const MAX_GROUP_SETTINGS = 24
export const MAX_DESIGN_SETTINGS = 64
const MAX_LABEL = 40
const MAX_INFO = 160
const MAX_OPTIONS = 12
const UNITS = ["", "px", "rem", "em", "%", "ms", "s", "vw", "vh", "deg", "fr"] as const
/** A colour a person can pick: hex, or rgb/hsl/oklch written plainly. */
const COLOR = /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|oklch|oklab)\([0-9.,%\s/+-]+\)|transparent)$/i

/** A label as the panel prints it: one line, no control characters, at most `max`. */
function cleanLabel(v: unknown, max = MAX_LABEL): string {
  if (typeof v !== "string") return ""
  return v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim()
}

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null)
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40)

function cleanOptions(raw: unknown): DesignOption[] {
  if (!Array.isArray(raw)) return []
  const out: DesignOption[] = []
  for (const o of raw) {
    const value = cleanTokenValue(typeof o === "object" && o ? (o as DesignOption).value : o)
    const label = cleanLabel(typeof o === "object" && o ? (o as DesignOption).label : o) || (value ?? "")
    if (value === null || out.some((x) => x.value === value)) continue
    out.push({ value, label })
    if (out.length >= MAX_OPTIONS) break
  }
  return out
}

/**
 * The site's settings, checked: what the panel draws and the page prints.
 * Anything left out is said in `issues` (for the agent); the rest is kept.
 */
export function cleanDesignSettings(raw: unknown, issues: ValidationIssue[] = []): DesignSettings {
  const warn = (code: string, message: string) => issues.push({ severity: "warning", code, message })
  const groupsIn = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as DesignSettings).groups) ? (raw as DesignSettings).groups : []
  const groups: DesignGroup[] = []
  const ids = new Set<string>()
  const groupIds = new Set<string>()
  let total = 0
  let own = 0
  for (const g of groupsIn.slice(0, MAX_DESIGN_GROUPS) as DesignGroupInput[]) {
    if (!g || typeof g !== "object") continue
    const label = cleanLabel(g.label)
    if (!label) { warn("settings.group_label", "A settings group needs a label, e.g. \"Palette\"."); continue }
    let gid = slug(typeof g.id === "string" && g.id ? g.id : label) || `group_${groups.length + 1}`
    while (groupIds.has(gid)) gid = `${gid}_2`
    const settings: DesignSetting[] = []
    for (const s of (Array.isArray(g.settings) ? g.settings : []).slice(0, MAX_GROUP_SETTINGS)) {
      if (total >= MAX_DESIGN_SETTINGS) { warn("settings.too_many", `A site keeps ${MAX_DESIGN_SETTINGS} settings at most.`); break }
      const clean = cleanSetting(s, warn)
      if (!clean) continue
      if (ids.has(clean.id)) { warn("settings.duplicate", `"${clean.id}" is declared twice. Each setting has its own id.`); continue }
      if (!clean.token && own >= MAX_CUSTOM_TOKENS) { warn("settings.too_many", `A site keeps ${MAX_CUSTOM_TOKENS} values of its own at most.`); continue }
      ids.add(clean.id)
      total++
      if (!clean.token) own++
      settings.push(clean)
    }
    if (!settings.length) { warn("settings.group_empty", `"${label}" has no setting that could be kept.`); continue }
    groupIds.add(gid)
    groups.push({ id: gid, label, settings })
  }
  return { groups }
}

function cleanSetting(s: DesignSettingInput | null | undefined, warn: (code: string, message: string) => void): DesignSetting | null {
  if (!s || typeof s !== "object") return null
  const id = String(s.id ?? "").trim().toLowerCase().replace(/^--t-/, "")
  const label = cleanLabel(s.label)
  if (!TOKEN_NAME.test(id)) { warn("settings.id", `"${String(s.id ?? "").slice(0, 40)}" is not a setting id: lowercase letters, digits and dashes, starting with a letter.`); return null }
  if ((SCALE_TOKENS as readonly string[]).includes(id)) { warn("settings.id", `"${id}" is one of the site's scale tokens (--t-${id}). Pick another id.`); return null }
  if (!label) { warn("settings.label", `"${id}" needs a label the person reads, e.g. "Accent".`); return null }
  const info = cleanLabel(s.info, MAX_INFO)
  const base = { id, label, ...(info ? { info } : {}) }

  if (s.token !== undefined && s.token !== "") {
    if (!isBinding(s.token)) { warn("settings.token", `"${id}": token "${String(s.token).slice(0, 40)}" is not one of ${Object.keys(DESIGN_BINDINGS).join(", ")}.`); return null }
    const b = binding(s.token)
    if (b.type === "range") {
      const lo = finite(s.min)
      const hi = finite(s.max)
      const min = lo !== null && lo >= b.min! && lo < b.max! ? lo : b.min!
      const max = hi !== null && hi <= b.max! && hi > min ? hi : b.max!
      return { ...base, type: "range", token: s.token, min, max, step: b.step, unit: b.unit }
    }
    if (b.type === "select") {
      /* The agent may rename the choices, never add one the token does not have. */
      const named = cleanOptions(s.options)
      const options = b.options!.map((o) => ({ value: o.value, label: named.find((n) => n.value === o.value)?.label ?? o.label }))
      return { ...base, type: "select", token: s.token, options }
    }
    return { ...base, type: b.type, token: s.token }
  }

  const type = s.type
  if (!type || !(DESIGN_CONTROLS as readonly string[]).includes(type)) { warn("settings.type", `"${id}": type is one of ${DESIGN_CONTROLS.join(", ")}.`); return null }
  if (type === "font") { warn("settings.font", `"${id}": a font setting stands for token fonts.heading, fonts.body or fonts.accent, so the font is loaded.`); return null }
  if (type === "color") return { ...base, type }
  if (type === "range") {
    const min = finite(s.min)
    const max = finite(s.max)
    if (min === null || max === null || !(max > min)) { warn("settings.range", `"${id}": a range needs min and max, with max above min.`); return null }
    const step = finite(s.step)
    const unit = typeof s.unit === "string" ? s.unit.trim() : ""
    if (!(UNITS as readonly string[]).includes(unit)) { warn("settings.unit", `"${id}": unit is one of ${UNITS.filter(Boolean).join(", ")} or none.`); return null }
    return { ...base, type, min, max, step: step !== null && step > 0 && step <= max - min ? step : Math.round(((max - min) / 100) * 1000) / 1000 || 1, unit }
  }
  if (type === "select") {
    const options = cleanOptions(s.options)
    if (options.length < 2) { warn("settings.options", `"${id}": a select needs at least two options, each a value and a label.`); return null }
    return { ...base, type, options }
  }
  const on = cleanTokenValue(s.on ?? "1")
  const off = cleanTokenValue(s.off ?? "0")
  if (on === null || off === null || on === off) { warn("settings.toggle", `"${id}": a toggle's on and off are two different CSS values, e.g. "1" and "0".`); return null }
  return { ...base, type: "toggle", on, off }
}

/** The site's settings as stored, checked; null when it declared none. */
export function readDesignSettings(theme: Record<string, unknown> | null | undefined): DesignSettings | null {
  const raw = theme?.[DESIGN_SETTINGS_SETTING]
  if (!raw) return null
  const clean = cleanDesignSettings(raw)
  return clean.groups.length ? clean : null
}

/* ── a setting's value ────────────────────────────────────────────────── */

function tokenAt(tokens: DesignTokens, path: DesignBinding): unknown {
  switch (path) {
    case "typeScale.base": return (tokens.typeScale ?? { base: 16 }).base
    case "typeScale.ratio": return (tokens.typeScale ?? { ratio: 1.25 }).ratio
    case "motion.durationMs": return tokens.motion.durationMs ?? 600
    case "shadow": return tokens.shadow ?? "none"
  }
  if (path.startsWith("colors.inverse.")) {
    const k = path.slice("colors.inverse.".length) as "background" | "text" | "accent"
    return tokens.colors.inverse?.[k] ?? { background: tokens.colors.text, text: tokens.colors.background, accent: tokens.colors.accent }[k]
  }
  const [head, key] = path.split(".") as [keyof DesignTokens, string]
  return (tokens[head] as Record<string, unknown> | undefined)?.[key]
}

function withToken(tokens: DesignTokens, path: DesignBinding, value: unknown): DesignTokens {
  const n = (v: unknown) => finite(v) ?? 0
  switch (path) {
    case "typeScale.base": return { ...tokens, typeScale: { ratio: 1.25, ...tokens.typeScale, base: n(value) } }
    case "typeScale.ratio": return { ...tokens, typeScale: { base: 16, ...tokens.typeScale, ratio: n(value) } }
    case "motion.level": return { ...tokens, motion: { level: value as DesignTokens["motion"]["level"], durationMs: tokens.motion.durationMs } }
    case "motion.durationMs": return { ...tokens, motion: { ...tokens.motion, durationMs: n(value) } }
    case "shadow": return { ...tokens, shadow: value as DesignTokens["shadow"] }
  }
  if (path.startsWith("colors.inverse.")) {
    const k = path.slice("colors.inverse.".length)
    const inv = tokens.colors.inverse ?? { background: tokens.colors.text, text: tokens.colors.background, accent: tokens.colors.accent }
    return { ...tokens, colors: { ...tokens.colors, inverse: { ...inv, [k]: String(value) } } }
  }
  const [head, key] = path.split(".") as ["colors" | "fonts" | "radius" | "spacing", string]
  const isNumber = head === "radius" || head === "spacing"
  return { ...tokens, [head]: { ...(tokens[head] as object), [key]: isNumber ? n(value) : String(value) } }
}

/** A value for one setting, as the page would keep it, or null when it cannot be kept. */
export function normalizeDesignValue(s: DesignSetting, v: unknown): string | number | null {
  switch (s.type) {
    case "color": {
      const t = typeof v === "string" ? v.trim() : ""
      return COLOR.test(t) ? t : null
    }
    case "font": {
      const t = typeof v === "string" ? v.trim() : ""
      return s.token && binding(s.token).options?.some((o) => o.value === t) ? t : null
    }
    case "range": {
      const n = finite(typeof v === "string" ? parseFloat(v) : v)
      if (n === null) return null
      const clamped = Math.min(s.max ?? n, Math.max(s.min ?? n, n))
      const rounded = Math.round(clamped * 1000) / 1000
      return s.token ? rounded : `${rounded}${s.unit ?? ""}`
    }
    case "select": {
      const t = typeof v === "string" ? v.trim() : String(v ?? "")
      return s.options?.some((o) => o.value === t) ? t : null
    }
    case "toggle": {
      if (v === true || v === s.on) return s.on ?? "1"
      if (v === false || v === s.off) return s.off ?? "0"
      return null
    }
  }
}

/** What a setting holds now: a bound one reads its token, one of its own `custom_tokens`, else a starting value. */
export function designValue(theme: Record<string, unknown> | null | undefined, s: DesignSetting, tokens: DesignTokens = themeSettingsToTokens(theme)): string | number | boolean {
  if (s.token) {
    const v = tokenAt(tokens, s.token)
    return typeof v === "number" || typeof v === "string" ? v : ""
  }
  const own = customTokens(theme)[s.id]
  if (s.type === "toggle") return own === s.on
  if (own !== undefined) return s.type === "range" ? (finite(parseFloat(own)) ?? s.min ?? 0) : own
  return s.type === "range" ? (s.min ?? 0) : s.type === "select" ? (s.options?.[0]?.value ?? "") : ""
}

/**
 * The Theme settings to write when one setting changes: the token's own
 * settings for a bound one (tokenPatch: one group, only what moved), the
 * custom map for one of the site's own. Empty when the value cannot be kept.
 */
export function designPatch(theme: Record<string, unknown> | null | undefined, s: DesignSetting, value: unknown): Record<string, unknown> {
  const v = normalizeDesignValue(s, value)
  if (v === null) return {}
  if (s.token) {
    const tokens = themeSettingsToTokens(theme)
    return tokenPatch(binding(s.token).group, withToken(tokens, s.token, v), theme)
  }
  const now = customTokens(theme)
  if (now[s.id] === String(v)) return {}
  return { [CUSTOM_TOKENS_SETTING]: { ...now, [s.id]: String(v) } }
}

/* ── on the page ──────────────────────────────────────────────────────── */

const SHADOW_CSS: Record<string, string> = {
  none: "none",
  sm: "0 1px 3px rgba(15, 23, 42, 0.10)",
  md: "0 4px 14px -4px rgba(15, 23, 42, 0.16)",
  lg: "0 12px 32px -12px rgba(15, 23, 42, 0.28)",
}

/**
 * `--t-<id>` for each bound setting, read from its token. A setting of the
 * site's own is already printed from `custom_tokens` (customTokenVars), so
 * only bound ones are here. Spread after the scale in themeVars: a bound id
 * can never be a scale name (cleanDesignSettings refuses it).
 */
export function designVars(theme: Record<string, unknown> | null | undefined): Record<string, string> {
  const schema = readDesignSettings(theme)
  if (!schema) return {}
  const tokens = themeSettingsToTokens(theme)
  const out: Record<string, string> = {}
  for (const g of schema.groups) {
    for (const s of g.settings) {
      if (!s.token) continue
      const v = tokenAt(tokens, s.token)
      let css: string | null = null
      if (s.token.startsWith("fonts.")) css = `var(--theme-font-${s.token.slice(6)})`
      else if (s.token === "shadow") css = SHADOW_CSS[String(v)] ?? "none"
      else if (s.type === "range") css = finite(v) !== null ? `${finite(v)}${s.unit ?? ""}` : null
      else css = cleanTokenValue(v)
      if (css !== null) out[`${CUSTOM_TOKEN_PREFIX}${s.id}`] = css
    }
  }
  return out
}

/* ── the agent's call ─────────────────────────────────────────────────── */

/**
 * set_tokens `settings`: the declared groups, checked, and the starting value
 * of each setting of the site's own. `current` is the site's settings with the
 * call's tokens already laid over, so a bound setting reads the new token.
 * Returns the settings to write (`design_settings`, and `custom_tokens` when a
 * value was given) and what was left out.
 */
export function designSettingsWrite(input: unknown, current: Record<string, unknown>): { settings: Record<string, unknown>; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  const groupsIn = Array.isArray(input) ? (input as DesignGroupInput[]) : []
  if (!Array.isArray(input)) issues.push({ severity: "warning", code: "settings.shape", message: "settings is a list of groups: [{ label, settings: [{ id, label, type, token?, value? }] }]." })
  const schema = cleanDesignSettings(groupsIn, issues)
  const custom = { ...customTokens(current) }
  const given = new Map<string, unknown>()
  for (const g of groupsIn) for (const s of Array.isArray(g?.settings) ? g.settings : []) if (s && typeof s === "object" && "value" in s) given.set(String(s.id ?? "").trim().toLowerCase().replace(/^--t-/, ""), s.value)
  const out: Record<string, unknown> = {}
  const kept: DesignGroup[] = []
  for (const g of schema.groups) {
    const settings: DesignSetting[] = []
    for (const s of g.settings) {
      if (s.token) { settings.push(s); continue }
      const v = given.has(s.id) ? normalizeDesignValue(s, given.get(s.id)) : null
      if (v !== null) custom[s.id] = String(v)
      else if (custom[s.id] === undefined || normalizeDesignValue(s, s.type === "toggle" ? custom[s.id] : s.type === "range" ? parseFloat(custom[s.id]) : custom[s.id]) === null) {
        /* No usable value: a range or select starts at its first, a toggle off; a colour has no honest default. */
        const start = s.type === "range" ? normalizeDesignValue(s, s.min) : s.type === "select" ? s.options![0].value : s.type === "toggle" ? s.off! : null
        if (start === null) {
          issues.push({ severity: "warning", code: "settings.value", message: `"${s.id}" was left out: give it a value (${s.type === "color" ? "a colour like #1d1b18" : "one it accepts"}).` })
          continue
        }
        if (given.has(s.id)) issues.push({ severity: "warning", code: "settings.value", message: `"${s.id}": that value cannot be used, so it starts at ${start}.` })
        custom[s.id] = String(start)
      }
      settings.push(s)
    }
    if (settings.length) kept.push({ ...g, settings })
  }
  out[DESIGN_SETTINGS_SETTING] = { groups: kept }
  if (JSON.stringify(custom) !== JSON.stringify(customTokens(current))) out[CUSTOM_TOKENS_SETTING] = custom
  return { settings: out, issues }
}

/* ── which Theme settings groups a free site shows ────────────────────── */

/**
 * On a FREE site (the AI's own chrome, site_chrome "home", and a design of
 * its own) the default theme's groups style things the site does not have:
 * the built-in header, footer, buttons, product cards, breadcrumbs and the
 * old announcement bar. Theme settings shows the site's own groups first and
 * then only these, which act on every site whatever draws it:
 *
 *   branding    store name, logo and favicon (the tab, `shop`, `theme.logo`)
 *   social      the links (`shop.socials`)
 *   cart        what Add to cart does, through the site's own hooks too
 *   cookies     whether visitors are asked before tracking
 *   animations  scroll motion, the intro and page transitions
 *   custom_css  the site's own CSS
 *
 * The rest stay reachable under one "Built-in sections" row, for a page
 * that still holds one (the product page can).
 */
export const FREE_SITE_PLATFORM_GROUPS = ["branding", "social", "cart", "cookies", "animations", "custom_css"] as const
/** Default theme groups that only style its built-in sections. */
export const BUILT_IN_SECTION_GROUPS = ["color_schemes", "colors", "typography", "buttons", "layout", "product_cards"] as const
/** Fields of a kept group that only steer the built-in header and footer. */
export const FREE_SITE_HIDDEN_FIELDS: ReadonlySet<string> = new Set(["social_show_in_footer", "social_show_in_header"])

/** A free site: home's chrome is the whole site's and the AI gave it a design of its own. */
export function isFreeSite(theme: Record<string, unknown> | null | undefined, ownDesign: boolean): boolean {
  /* universal-chrome.ts homeChromeOnly, read here without importing the section parser into the page's bundle. */
  return !!theme && theme.site_chrome === "home" && ownDesign
}

/** The groups a free site's Theme settings lists after its own, in this order. */
export function freeSitePlatformGroups<G extends { id: string }>(groups: readonly G[]): G[] {
  return FREE_SITE_PLATFORM_GROUPS.flatMap((id) => groups.filter((g) => g.id === id))
}

/** The default theme groups kept behind "Built-in sections". */
export function builtInSectionGroups<G extends { id: string }>(groups: readonly G[]): G[] {
  return BUILT_IN_SECTION_GROUPS.flatMap((id) => groups.filter((g) => g.id === id))
}
