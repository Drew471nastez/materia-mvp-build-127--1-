/**
 * ===========================================================================
 *  A THEME VALUE THE PAGE ONLY READS AS A CSS VARIABLE
 * ===========================================================================
 * The owner, round 1022: "Theme settings › the button corner radius, the
 * slider feels heavy". While a theme value is under a finger the canvas
 * writes the theme's variables onto the sections on screen (editor page.tsx
 * canvasThemePatcher) and also draws those sections again with the value,
 * for whatever a template prints from it. For the settings below nothing
 * does: every section reads them as the variable, so drawing the sections
 * again was all cost. With the CPU slowed 4x it was most of a frame per
 * value (scripts/check-editor-live.mjs, theme radius: the sections and the
 * header rendered again for every one, frames p95 50ms).
 *
 * Each setting is listed with what a section's own file could print it as:
 * the token in `theme` (lib/storelib-theme/resolve.ts themeGlobals) and the
 * raw `theme.settings.<id>`. None of the bundled sections prints any of them
 * (tests/editor-live-updates.test.ts holds that); a section of the
 * creator's own that does is drawn again as before.
 *
 * Not here: Card corner radius (`theme.radius.medium` is printed by fifty
 * sections), Section gap (its rule only exists above zero), colours (the
 * schemes have their own path, lib/website-builder/scheme-var-patch.ts),
 * type (the typography stylesheet).
 */
export const VARIABLE_ONLY_THEME_SETTINGS: Readonly<Record<string, readonly string[]>> = {
  button_border_radius: ["buttons.radius"],
  content_padding_x: ["layout.padding_x"],
  page_width: ["layout.page_width"],
  spacing_scale: ["layout.spacing_scale"],
  image_border_radius: ["layout.image_radius"],
  input_radius: [],
  input_border_width: [],
  input_border_opacity: [],
  pill_radius: [],
  pill_border_width: [],
  popup_radius: [],
  popup_border: [],
  container_border: [],
  media_border: [],
  badge_radius: [],
}

/** The settings whose values differ between two themes. */
export function changedThemeKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  if (a === b) return []
  const out: string[] = []
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) out.push(k)
  return out
}

/**
 * Whether a theme change can be shown by its variables alone: every setting
 * it moves is listed above, and no section file of the install's own prints
 * any of them. `sources` are the install's saved .storelib files.
 */
export function drawnByVariablesAlone(keys: readonly string[], sources: Record<string, string>): boolean {
  if (keys.length === 0) return false
  const texts = Object.values(sources)
  for (const k of keys) {
    const tokens = VARIABLE_ONLY_THEME_SETTINGS[k]
    if (!tokens) return false
    const reads = [`theme.settings.${k}`, ...tokens.map((t) => `theme.${t}`)]
    if (texts.some((src) => reads.some((r) => src.includes(r)))) return false
  }
  return true
}
