/**
 * ===========================================================================
 *  A SECTION'S OWN COLOURS, AND THE FIELDS THAT USED TO HOLD THEM
 * ===========================================================================
 * A section stores what it changed about its scheme in
 * `settings.color_overrides`, keyed by the scheme's semantic names. Before
 * that existed, sections had colour fields of their own: `bg_color`,
 * `text_color`, `button_color`, and a preset could bake a literal into one.
 * The renderers still honour those (`str(s.bg_color) || c.bg`), so a saved
 * section keeps its colours.
 *
 * The panel shows both as one thing. An override slot's value is the
 * override if there is one, else the old field, else "use the scheme";
 * writing a slot sets the override and blanks the old field, so there is
 * one source of truth from then on. Pure functions; the editor saves.
 */
import { SECTION_OVERRIDE_KEYS, type SchemeColorKey } from "@/lib/storelib-theme/color-schemes"

/** The older per-section fields each override slot supersedes. */
export const LEGACY_OVERRIDE_FIELDS: Partial<Record<SchemeColorKey, string[]>> = {
  background: ["bg_color"],
  text: ["text_color"],
  heading: ["heading_color"],
  accent: ["accent_color"],
  border: ["border_color"],
  primary_button_background: ["button_color", "cta_color"],
  primary_button_text: ["button_text_color", "cta_text_color"],
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function color(v: unknown): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : ""
}

/** The colour a slot is set to, or "" when the section uses its scheme. */
export function effectiveOverride(settings: Record<string, unknown>, key: SchemeColorKey): string {
  const overrides = isPlain(settings.color_overrides) ? settings.color_overrides : {}
  const own = color(overrides[key])
  if (own) return own
  for (const field of LEGACY_OVERRIDE_FIELDS[key] ?? []) {
    const v = color(settings[field])
    if (v) return v
  }
  return ""
}

/** Whether the section overrides anything at all. */
export function hasOverrides(settings: Record<string, unknown>): boolean {
  return SECTION_OVERRIDE_KEYS.some((key) => effectiveOverride(settings, key) !== "")
}

/**
 * The settings with one slot set (a colour) or cleared (""). The older
 * fields for that slot are blanked either way, so the renderer reads the
 * override, or the scheme, and never a stale literal.
 */
export function setOverride(settings: Record<string, unknown>, key: SchemeColorKey, value: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...settings }
  const overrides: Record<string, unknown> = isPlain(settings.color_overrides) ? { ...settings.color_overrides } : {}
  const v = color(value)
  if (v) overrides[key] = v
  else delete overrides[key]
  for (const field of LEGACY_OVERRIDE_FIELDS[key] ?? []) if (field in next) next[field] = ""
  if (Object.keys(overrides).length) next.color_overrides = overrides
  else delete next.color_overrides
  return next
}

/** Every slot back to the scheme. */
export function resetOverrides(settings: Record<string, unknown>): Record<string, unknown> {
  let next = settings
  for (const key of SECTION_OVERRIDE_KEYS) next = setOverride(next, key, "")
  return next
}
