/**
 * ===========================================================================
 *  SETTINGS STORELIB ADDS TO A THEME, AS A REPOSITORY AND AN AGENT SEE THEM
 * ===========================================================================
 * Theme settings in the builder are not only the theme's own. Storelib adds
 * panels of its own around them:
 *
 *   an imported theme   "Hover and focus" (./compat/overrides.ts), after the
 *                       theme's own groups. Values beside the theme's, under
 *                       `shopify` in the install's settings.
 *   a Storelib theme    Storelib's built-in groups (Logo and brand, Page
 *                       colors, Buttons and inputs, Layout...), which a
 *                       theme's config/settings_schema.json is laid over
 *                       (./theme-config.ts). Values at the top level.
 *
 * A repository used to hold only what had a value, and nothing of what the
 * panels are, so an agent could not see that a setting existed, let alone
 * change it. This file is the one description of them, for:
 *
 *   the builder         compatThemeGroups: the panel the Theme settings list
 *                       draws for an imported theme. A setting whose id the
 *                       theme's own settings_schema.json declares is drawn
 *                       where the theme puts it and left out of Storelib's
 *                       group; the group goes when the theme declares all
 *                       of it.
 *   the repository      platformSettingsDoc, written to
 *                       config/storelib_settings_schema.json (to read), and
 *                       withPlatformValues, every value, defaults included,
 *                       in config/settings.json.
 *   a push              withoutPlatformDefaults and checkPlatformValues: a
 *                       default that came back unchanged stays unset, so a
 *                       later change of Storelib's default still reaches the
 *                       site, and a value the control cannot take is said.
 *   MCP                 platformValueFields, the controls update_theme takes.
 *
 * Pure and browser safe.
 */
import { OVERRIDE_GROUP } from "./compat/overrides"
import { BUILT_IN_SCHEME_KEYS, DEFAULT_COLOR_SCHEMES } from "./color-schemes"
import { themeSettingsGroupsFor } from "./theme-config"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SchemaField } from "@/lib/website-builder/types"

/** Where the repository holds the description of Storelib's own settings. Storelib writes it; a change to it is not taken. */
export const PLATFORM_SETTINGS_PATH = "config/storelib_settings_schema.json"
/** An imported theme's Theme settings panel, made from its settings_schema.json (./compat/schema-sync.ts). */
export const COMPAT_PANEL_PATH = "shopify/config/settings_panel.json"

export type ThemeKind = "shopify" | "storelib"

type O = Record<string, unknown>
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v)

/** Draw something, hold nothing. */
const PRESENTATIONAL = new Set(["header", "paragraph", "divider"])

/** One group of controls, in the panel's own shape. */
export interface PanelGroup {
  name: string
  settings: SchemaField[]
}

/** Storelib's group for an imported theme, as a panel group. */
const HOVER_GROUP = OVERRIDE_GROUP as unknown as PanelGroup
/** Its id in the repository's description, stable whatever its name says. */
const HOVER_GROUP_ID = "storelib_hover_and_focus"

/** Ids a panel declares: `[{ name, settings: [{ id }] }]`, as settings_panel.json and settings_schema.json hold them. */
export function declaredIds(groups: unknown): Set<string> {
  const out = new Set<string>()
  if (!Array.isArray(groups)) return out
  for (const g of groups) {
    const list = isObj(g) ? (Array.isArray(g.settings) ? g.settings : Array.isArray(g.fields) ? g.fields : []) : []
    for (const s of list) if (isObj(s) && typeof s.id === "string" && s.id) out.add(s.id)
  }
  return out
}

/** The panel file's groups, or none when it does not read. */
export function readPanel(text: string | null | undefined): PanelGroup[] {
  if (typeof text !== "string" || !text.trim()) return []
  try {
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? (parsed.filter((g) => isObj(g) && typeof g.name === "string" && Array.isArray(g.settings)) as PanelGroup[]) : []
  } catch {
    return []
  }
}

/**
 * Storelib's Hover and focus for an imported theme, without what the theme
 * places itself: a setting the theme declares is the theme's, and a heading
 * left with nothing under it goes too. Null when the theme declares all of it.
 */
export function compatPlatformGroup(declared: ReadonlySet<string>): PanelGroup | null {
  const kept: SchemaField[] = []
  let heading: SchemaField | null = null
  for (const f of HOVER_GROUP.settings) {
    if (f.type === "header") {
      heading = f
      continue
    }
    if (declared.has(f.id)) continue
    if (heading) {
      kept.push(heading)
      heading = null
    }
    kept.push(f)
  }
  return kept.length ? { name: HOVER_GROUP.name, settings: kept } : null
}

/** The groups Theme settings lists for an imported theme: the theme's own panel, then what is left of Storelib's. */
export function compatThemeGroups(panel: PanelGroup[]): PanelGroup[] {
  const own = Array.isArray(panel) ? panel : []
  const mine = compatPlatformGroup(declaredIds(own))
  return mine ? [...own, mine] : own
}

/** Storelib's settings with a value, for one kind of theme: what the builder's panels take. */
export function platformValueFields(kind: ThemeKind, ctx: { declared?: ReadonlySet<string>; themeSchemaText?: string | null } = {}): SchemaField[] {
  if (kind === "shopify") {
    const group = compatPlatformGroup(ctx.declared ?? new Set())
    return (group?.settings ?? []).filter((f) => !PRESENTATIONAL.has(f.type))
  }
  return themeSettingsGroupsFor(ctx.themeSchemaText ?? null).flatMap((g) => g.fields.filter((f) => !PRESENTATIONAL.has(f.type)))
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Where a kind of theme keeps these values in the install's settings. */
function holder(settings: O, kind: ThemeKind): O {
  if (kind === "storelib") return settings
  return isObj(settings.shopify) ? settings.shopify : {}
}
function withHolder(settings: O, kind: ThemeKind, next: O): O {
  return kind === "storelib" ? next : { ...settings, shopify: next }
}

/**
 * The settings with every one of Storelib's values written out: a value not
 * chosen yet as its default, so an agent reading config/settings.json sees
 * what the site uses. A setting with no default and no value stays out.
 */
export function withPlatformValues(settings: O, kind: ThemeKind, ctx: { declared?: ReadonlySet<string>; themeSchemaText?: string | null } = {}): O {
  const base = isObj(settings) ? settings : {}
  const values = holder(base, kind)
  const add: O = {}
  for (const f of platformValueFields(kind, ctx)) {
    if (values[f.id] === undefined && f.default !== undefined) add[f.id] = f.default
  }
  if (!Object.keys(add).length) return base
  /* Only an imported theme's group has to be made when nothing was there: a Storelib theme's values are the settings themselves. */
  return withHolder(base, kind, { ...values, ...add })
}

/**
 * A pushed settings.json, with every one of Storelib's defaults that came
 * back as it was sent, and was not set before, left unset again. Without
 * this, the first push after an export would fix every default in place.
 */
export function withoutPlatformDefaults(incoming: O, before: O, kind: ThemeKind, ctx: { declared?: ReadonlySet<string>; themeSchemaText?: string | null } = {}): O {
  const was = holder(isObj(before) ? before : {}, kind)
  const now = holder(incoming, kind)
  let next: O | null = null
  for (const f of platformValueFields(kind, ctx)) {
    if (f.default === undefined || was[f.id] !== undefined || !(f.id in now)) continue
    if (!same(now[f.id], f.default)) continue
    next ??= { ...now }
    delete next[f.id]
  }
  return next ? withHolder(incoming, kind, next) : incoming
}

const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s/]+\))$/i

/**
 * Values for an imported theme's Storelib settings that its controls could
 * not take, each put back as it was and said in a line. A Storelib theme's
 * values are checked by the settings' own sanitiser.
 */
export function checkPlatformValues(incoming: O, before: O, kind: ThemeKind, ctx: { declared?: ReadonlySet<string> } = {}): { settings: O; notes: string[] } {
  if (kind !== "shopify") return { settings: incoming, notes: [] }
  const now = holder(incoming, kind)
  const was = holder(isObj(before) ? before : {}, kind)
  const notes: string[] = []
  let next: O | null = null
  const putBack = (f: SchemaField, why: string) => {
    next ??= { ...now }
    if (was[f.id] === undefined) delete next[f.id]
    else next[f.id] = was[f.id]
    notes.push(`"${f.id}" ${why}, so it was kept as it was`)
  }
  for (const f of platformValueFields(kind, ctx)) {
    if (!(f.id in now)) continue
    const v = now[f.id]
    if (v === null) continue
    if (f.type === "select") {
      const options = (f.options ?? []).map((o) => o.value)
      if (!options.includes(v as string)) putBack(f, `is one of ${options.join(", ")}`)
    } else if (f.type === "range") {
      const n = typeof v === "number" ? v : NaN
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) putBack(f, `is a number from ${f.min} to ${f.max}`)
    } else if (f.type === "color") {
      if (typeof v !== "string" || (v.trim() !== "" && !COLOUR.test(v.trim()))) putBack(f, 'is a colour such as "#1a1a2e", or "" for the theme\'s own')
    }
  }
  return { settings: next ? withHolder(incoming, kind, next) : incoming, notes }
}

/* ── the repository's description ─────────────────────────────────────── */

/** One setting as the description writes it: type, id and label first, then where it shows. */
function described(f: SchemaField, group: string, heading: string | null, extra: O): O {
  const { type, id, label, ...rest } = f as unknown as O
  return { type, id, label, ...rest, group, ...(heading ? { heading } : {}), ...extra }
}

/**
 * config/storelib_settings_schema.json: every setting Storelib adds to this
 * theme's Theme settings, with its id, type, label, options, default, the
 * group it shows in, and whether it is shown. Deterministic.
 */
export function platformSettingsDoc(kind: ThemeKind, ctx: { declared?: ReadonlySet<string>; themeSchemaText?: string | null } = {}): O {
  if (kind === "shopify") {
    const declared = ctx.declared ?? new Set<string>()
    const shownGroup = compatPlatformGroup(declared)
    let heading: string | null = null
    const settings = HOVER_GROUP.settings.map((f) => {
      if (f.type === "header") {
        heading = f.label
        return described(f, HOVER_GROUP.name, null, { shown: !!shownGroup?.settings.some((s) => s.id === f.id) })
      }
      const placed = declared.has(f.id)
      return described(f, HOVER_GROUP.name, heading, placed ? { shown: false, placed_by_theme: true } : { shown: true })
    })
    return {
      about:
        "Settings Storelib adds to this theme's Theme settings in the builder. Storelib writes this file on every Push, so a change to it is not taken. Their values are in config/settings.json under \"shopify\", beside the theme's own, with the default written out where none was chosen; change a value there and push.",
      owner: "storelib",
      values_in: "config/settings.json",
      values_at: "shopify",
      theme_placement:
        "When shopify/config/settings_schema.json declares one of these ids itself, the builder draws that setting where the theme puts it and leaves it out of Storelib's group (shown: false, placed_by_theme: true). When the theme declares every one, the group is not shown. The value stays at the same place in config/settings.json either way.",
      panels: [
        {
          id: HOVER_GROUP_ID,
          name: HOVER_GROUP.name,
          shown_in: "Theme settings, after the theme's own groups",
          shown: !!shownGroup,
          settings,
        },
      ],
    }
  }
  const theirs = typeof ctx.themeSchemaText === "string" && ctx.themeSchemaText.trim() ? declaredIds(safeJson(ctx.themeSchemaText)) : null
  return {
    about:
      "Settings Storelib gives every Storelib theme, in Theme settings in the builder. Storelib writes this file on every Push, so a change to it is not taken. Their values are in config/settings.json, with the default written out where none was chosen; change a value there and push.",
    owner: "storelib",
    values_in: "config/settings.json",
    values_at: "",
    theme_placement:
      "config/settings_schema.json is laid over these groups: it may move a setting within its group, reorder groups, change a label, default, range, unit or info. A setting keeps its id, type and group, because the theme's stylesheet reads it. One the file does not list is still shown, after the ones it does (listed_by_theme: false).",
    color_schemes: {
      values_in: "color_schemes in config/settings.json, by key. A built-in scheme keeps there only what differs from its colours below; a scheme of the theme's own is there whole. default_color_scheme names the one a section gets when it does not say.",
      built_in: Object.fromEntries(BUILT_IN_SCHEME_KEYS.map((k) => [k, DEFAULT_COLOR_SCHEMES[k]])),
    },
    panels: THEME_SETTINGS_GROUPS.map((g) => {
      let heading: string | null = null
      return {
        id: g.id,
        name: g.label,
        shown_in: "Theme settings",
        shown: true,
        settings: g.fields.map((f) => {
          if (f.type === "header") {
            heading = f.label
            return described(f, g.label, null, {})
          }
          return described(f, g.label, heading, theirs ? { listed_by_theme: theirs.has(f.id) } : {})
        }),
      }
    }),
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/* ── the live preview, as the builder's canvas tells a theme ──────────── */

/**
 * What a theme's own script hears in the builder's canvas when the creator
 * changes something, so it can redraw in place rather than wait for a reload.
 * One list, for README.md, AGENTS.md and storelib.json.
 */
export const LIVE_PREVIEW_EVENTS = [
  { event: "storelib:settings-change", when: "a theme, section or block setting changed in the builder. The canvas applies it without reloading the page; a script that read a setting once can read it again here." },
  { event: "storelib:section-load", when: "a section was drawn again in place after a change. A script that sets a section up once (a slider, a menu, a drawer) sets it up again for that section here." },
] as const
