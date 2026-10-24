/**
 * ===========================================================================
 *  A SECTION'S SCHEME COLOURS, PRINTED AS THE VARIABLES ITS ROOT HOLDS
 * ===========================================================================
 * The owner, round 36: "Use CSS variables for instant color ... changes
 * appear immediately". A section drawn from a .storelib file prints its
 * scheme's colours where its template says (`--s-bg: {{ scheme.bg }}`), as
 * the colours themselves. So a colour of a scheme dragged in Theme settings
 * drew every section on screen again through its template and replaced its
 * markup, every value (scripts/check-editor-live-edit.mjs, "drag scheme
 * colour": 10 draws for 61 values with the CPU slowed 4x).
 *
 * The section's root already holds the same colours as custom properties
 * (render.ts: `--scheme-background` and the rest, color-schemes.ts
 * schemeVars). A template that prints a scheme colour only where CSS reads
 * it, as it is (no filter works it out), draws the same page with
 * `var(--scheme-background)` in that place: the browser substitutes the
 * root's value, which is the colour it printed before. Drawn that way, a
 * scheme colour changes the root's variables and nothing else, which the
 * builder's canvas writes by hand while a finger is down
 * (app/website-builder/editor/[installId]/page.tsx canvasThemePatcher).
 *
 * WHICH TEMPLATES. Every read of `scheme`, and of a colour setting that
 * follows the scheme until somebody picks one (`"default": "scheme.accent"`),
 * must be an output printed as it is (`{{ scheme.bg }}`, or a setting with
 * `| default: scheme.bg` and nothing after) inside a `style="..."`
 * attribute, a <style> element or the section's CSS. A read in a tag (`{% if
 * scheme.bg == ... %}`), through a filter (`| alpha: 0.5`), or anywhere else
 * (an SVG's `fill="..."`, which takes no variable) keeps the section printing
 * the colours themselves.
 *
 * Only the builder's canvas draws this way (renderSection's
 * `schemeVariables`): the published page prints the colours, as it always
 * has. tests/scheme-vars-36.test.ts and scripts/check-scheme-vars.ts hold
 * that the two look the same, element for element, for every section type of
 * the default theme.
 */

import { LEGACY_FIXED, LEGACY_TO_SEMANTIC, SCHEME_COLOR_KEYS, SCHEME_CSS_VARS, type ColorScheme } from "./color-schemes"

const COMMENTS = /\{#[\s\S]*?#\}|\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g
const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g
const STYLE_ELEMENT = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi

/**
 * Whether a template and its CSS read the scheme only in ways that print a
 * variable in its place: see WHICH TEMPLATES above. `following` are the ids
 * of the colour settings whose default names a scheme colour.
 */
export function readsSchemeAsVariables(template: string, css: string, following: readonly string[] = []): boolean {
  const ids = following.filter((id) => /^[A-Za-z_][\w-]*$/.test(id))
  const setting = ids.length ? `(?:block\\.)?settings\\.(?:${ids.join("|")})\\b` : null
  const ref = new RegExp(`(^|[^\\w.$])(?:scheme\\s*[.\\[]${setting ? `|${setting}` : ""})`)
  const value = `(?:scheme\\.[a-z_][a-z0-9_]*${setting ? `|${setting}` : ""})`
  const plain = new RegExp(`^\\{\\{-?\\s*(?:${value}|[A-Za-z_][\\w.]*\\s*\\|\\s*default:\\s*${value})\\s*-?\\}\\}$`)
  const reads = (text: string, inCss: (at: number, stripped: string) => boolean): boolean => {
    const clean = text.replace(COMMENTS, (m) => " ".repeat(m.length))
    /* The markup with every tag of the language blanked out, so a quote inside one does not end an attribute. */
    const stripped = clean.replace(LIQUID, (m) => "x".repeat(m.length))
    for (const m of clean.matchAll(LIQUID)) {
      const body = m[0]
      if (!ref.test(body)) continue
      if (!plain.test(body)) return false
      if (!inCss(m.index!, stripped)) return false
    }
    return true
  }
  const inStyleAttribute = (at: number, stripped: string): boolean => {
    for (const q of ['"', "'"]) {
      const open = stripped.lastIndexOf(`style=${q}`, at)
      if (open <= 0 || !/\s/.test(stripped[open - 1])) continue
      const close = stripped.indexOf(q, open + 7)
      if (close < at) continue
      /* Inside a tag: its `<` after the last `>` before the attribute. */
      if (stripped.lastIndexOf("<", open) > stripped.lastIndexOf(">", open)) return true
    }
    for (const s of stripped.matchAll(STYLE_ELEMENT)) if (at > s.index! && at < s.index! + s[0].length) return true
    return false
  }
  return reads(template, inStyleAttribute) && reads(css, () => true)
}

/** The ids of a schema's colour settings whose default follows the scheme (`"default": "scheme.accent"`). */
export function schemeFollowingSettings(settings: readonly { id?: unknown; type?: unknown; default?: unknown }[] | undefined): string[] {
  return (settings ?? []).filter((s) => s.type === "color" && typeof s.default === "string" && s.default.trim().startsWith("scheme.") && typeof s.id === "string").map((s) => s.id as string)
}

/**
 * The scheme a section's template reads, every colour of it as the variable
 * its root holds: the semantic names and the older slot names alike. A
 * section painting its root with `scheme.bg` keeps the gradient itself when
 * the scheme has one (a `background-color` cannot take it either way), and
 * the fixed colours that were never the scheme's stay as they are.
 */
export function schemeAsVariables(scheme: ColorScheme, legacy: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...legacy, ...scheme }
  for (const key of SCHEME_COLOR_KEYS) out[key] = `var(${SCHEME_CSS_VARS[key]})`
  for (const [slot, key] of Object.entries(LEGACY_TO_SEMANTIC)) out[slot] = `var(${SCHEME_CSS_VARS[key]})`
  for (const [slot, v] of Object.entries(LEGACY_FIXED)) out[slot] = v
  if (scheme.gradient) out.bg = legacy.bg
  return out
}
