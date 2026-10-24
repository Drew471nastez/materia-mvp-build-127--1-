/**
 * ===========================================================================
 *  A SCHEME COLOUR UNDER A FINGER, WRITTEN AS THE VARIABLES IT CHANGES
 * ===========================================================================
 * The owner, round 36: "Use CSS variables for instant color ... changes
 * appear immediately". The builder's canvas draws a .storelib section's
 * scheme colours as `var(--scheme-*)` where its template allows
 * (lib/storelib-theme/scheme-vars.ts), and marks its root
 * `data-scheme-vars`. While a colour of a scheme is dragged, such a section
 * on screen is not drawn again: the variables its root holds that the new
 * colour changes are written onto it, and nothing else on the page moves
 * (the editor's canvasThemePatcher calls this; EditorCanvasPage keeps the
 * committed theme for these sections). When the value is committed the
 * section is drawn once with it; until that drawing lands, its root shows
 * the committed colours, so nothing flashes back.
 */

import { resolveSectionColors, themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import { sameSettingValue } from "./same-setting"

type O = Record<string, unknown>

/**
 * Whether `theme` differs from `base` only in its colour schemes' colours:
 * no other setting, no scheme added, taken away, renamed or given another
 * gradient (a gradient is painted as the root's own background, not a
 * variable).
 */
export function schemeColoursOnly(base: O, theme: O): boolean {
  if (base === theme) return false
  const keys = new Set([...Object.keys(base), ...Object.keys(theme)])
  let schemes = false
  for (const k of keys) {
    if (sameSettingValue(base[k], theme[k])) continue
    if (k !== "color_schemes") return false
    schemes = true
  }
  if (!schemes) return false
  const a = themeColorSchemes(base), b = themeColorSchemes(theme)
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false
  return ka.every((k) => a[k].gradient === b[k].gradient && a[k].name === b[k].name)
}

/** A section root drawn with its scheme as variables, and the section's settings. */
export type SchemeRoot = { id: string; root: HTMLElement; settings: O }

export function schemeVarWriter() {
  /* Each root written: the scheme it was drawn for, and the properties written on it. */
  const written = new Map<HTMLElement, { chosen: O; keys: Set<string> }>()
  const ids = new Set<string>()
  /* A root given `theme`'s colours: the committed theme's, which its next drawing has too. */
  const settle = (root: HTMLElement, theme: O) => {
    const w = written.get(root)
    written.delete(root)
    if (!w || !root.isConnected) return
    const vars = resolveSectionColors(theme, w.chosen).vars
    for (const k of w.keys) if (vars[k] !== undefined && root.style.getPropertyValue(k) !== vars[k]) root.style.setProperty(k, vars[k])
  }
  return {
    /** Whether this section's colours are being written by hand: it keeps the committed theme. */
    has: (id: string) => ids.has(id),
    /** The roots on screen, written for `theme` where it differs from `base`; a root written before and not now gets `base`'s. */
    write(base: O, theme: O, roots: readonly SchemeRoot[]) {
      ids.clear()
      const seen = new Set<HTMLElement>()
      for (const { id, root, settings } of roots) {
        /* The scheme the section was drawn with, as its root names it (a section that saved none drew the theme's default). */
        const chosen = { color_scheme: root.getAttribute("data-color-scheme") ?? "", color_overrides: settings.color_overrides }
        const want = resolveSectionColors(theme, chosen).vars
        const had = resolveSectionColors(base, chosen).vars
        const w = written.get(root) ?? { chosen, keys: new Set<string>() }
        for (const [k, v] of Object.entries(want)) {
          if (v === had[k] && !w.keys.has(k)) continue
          w.keys.add(k)
          if (root.style.getPropertyValue(k) !== v) root.style.setProperty(k, v)
        }
        written.set(root, w)
        seen.add(root)
        ids.add(id)
      }
      for (const root of [...written.keys()]) if (!seen.has(root)) settle(root, base)
    },
    /** Every root written is given `theme`'s colours (the committed theme), and none is written by hand from now. */
    letGo(theme: O) {
      for (const root of [...written.keys()]) settle(root, theme)
      ids.clear()
    },
  }
}
