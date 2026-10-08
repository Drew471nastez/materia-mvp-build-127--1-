/**
 * ===========================================================================
 *  THE SITE'S PALETTE, CHANGED WHERE IT LIVES
 * ===========================================================================
 * "Premium dark website for a photography course" needs a dark palette with
 * one considered accent. The assistant could only reach it section by
 * section: pick the "dark" scheme on each, then override a colour here and
 * there. The result was the product's default dark grey with a stray hex on
 * every section, which is the opposite of a palette.
 *
 * A theme's colours are its colour schemes (lib/storelib-theme/color-schemes):
 * a handful of named sets of seventeen semantic values that every section
 * reads. Changing a scheme recolours every section that uses it, coherently.
 * This is the tool for that, held to the same rules a person editing the
 * scheme in Website settings is:
 *
 *   - only the scheme's own keys, only colours;
 *   - text and headings readable on the background, button text readable on
 *     the button (4.5:1 for text, 3:1 for headings), checked here so a dark
 *     palette with grey body text is refused with the numbers;
 *   - hover colours derived when not given, the way the editor derives them;
 *   - a new scheme only under a new lowercase key, never more than eight.
 *
 * The write is an ordinary update_theme of `color_schemes`, merged with the
 * schemes already there (update_theme merges at the top level, so sending
 * one scheme alone would drop the others).
 *
 * Pure, browser safe.
 */

import {
  BUILT_IN_SCHEME_KEYS,
  SCHEME_COLOR_KEYS,
  automaticHover,
  themeColorSchemes,
  type SchemeColorKey,
} from "@/lib/storelib-theme/color-schemes"
import { contrastRatio } from "./review"
import type { ThemeOp, ThemeState } from "./operations"

export const MAX_SCHEMES = 8

export const SET_COLOR_SCHEME_TOOL = {
  name: "set_color_scheme",
  description:
    "Set one colour scheme's colours, or add a scheme. Every section on it changes with it: this is how a palette reaches the whole site. Built in: white, light, dark, black, highlight. Send only what changes; text must read on the background (4.5:1) and button text on the button. Then set sections' color_scheme to it.",
  parameters: {
    type: "object",
    properties: {
      scheme: { type: "string", description: 'The scheme key: a built-in one, or a new lowercase key like "night".' },
      name: { type: "string", description: 'What the creator sees it called, e.g. "Night". "" to keep the current name.' },
      colorsJson: { type: "string", description: 'JSON object as a string, key → hex. Keys: background, background_secondary, text, text_muted, heading, accent, link, border, primary_button_background, primary_button_text, primary_button_border, secondary_button_background, secondary_button_text, secondary_button_border, input_background, input_text, input_border.' },
    },
    required: ["scheme", "name", "colorsJson"],
    additionalProperties: false,
  },
} as const

const HEX = /^#[0-9a-f]{6}$|^#[0-9a-f]{3}$/i
const SETTABLE = new Set<string>(SCHEME_COLOR_KEYS.filter((k) => !k.includes("_hover_")))

export function setColorScheme(argumentsJson: string, state: ThemeState): { output: string; op?: ThemeOp; failed?: true } {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argumentsJson || "{}")
  } catch {
    return { output: "The arguments were not JSON.", failed: true }
  }
  const key = typeof args.scheme === "string" ? args.scheme.trim() : ""
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key)) return { output: 'Name the scheme with a lowercase key, e.g. "dark" or "night".', failed: true }
  let colors: Record<string, unknown>
  try {
    colors = typeof args.colorsJson === "string" && args.colorsJson.trim() ? JSON.parse(args.colorsJson) : {}
  } catch {
    return { output: "colorsJson was not a JSON object. Nothing was changed.", failed: true }
  }
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) return { output: "colorsJson must be a JSON object of key → hex.", failed: true }

  const unknown = Object.keys(colors).filter((k) => !SETTABLE.has(k))
  if (unknown.length) return { output: `A scheme has no ${unknown.map((u) => `"${u}"`).join(", ")}. Nothing was changed. Its keys: ${[...SETTABLE].join(", ")}.`, failed: true }
  const bad = Object.entries(colors).filter(([, v]) => typeof v !== "string" || !(HEX.test(v.trim()) || (v === "transparent")))
  if (bad.length) return { output: `${bad.map(([k]) => k).join(", ")} must be a hex colour like "#1a1a1a". Nothing was changed.`, failed: true }

  const all = themeColorSchemes(state.settings)
  const isNew = !all[key]
  if (isNew && Object.keys(all).length >= MAX_SCHEMES) {
    return { output: `The theme already has ${Object.keys(all).length} schemes, which is the most it keeps. Change one of them: ${Object.keys(all).join(", ")}.`, failed: true }
  }
  const base = all[key] ?? all.white
  const merged: Record<string, string> = { ...(base as unknown as Record<string, string>) }
  for (const [k, v] of Object.entries(colors)) merged[k] = String(v).trim().toLowerCase()
  /* The hovers follow the buttons unless they were set: the editor derives them the same way. */
  Object.assign(merged, automaticHover(merged as Record<SchemeColorKey, string>))

  const problems: string[] = []
  const pair = (fg: string, bg: string, min: number, what: string) => {
    if (merged[bg] === "transparent" || merged[fg] === "transparent") return
    const ratio = contrastRatio(merged[fg], merged[bg])
    if (ratio !== null && ratio < min) problems.push(`${what} is ${ratio.toFixed(2)}:1 (${merged[fg]} on ${merged[bg]}), it needs ${min}:1`)
  }
  pair("text", "background", 4.5, "text on the background")
  pair("heading", "background", 3, "headings on the background")
  pair("text_muted", "background", 3, "muted text on the background")
  pair("primary_button_text", "primary_button_background", 4.5, "primary button text on the button")
  if (merged.secondary_button_background === "transparent") pair("secondary_button_text", "background", 4.5, "secondary button text on the background")
  else pair("secondary_button_text", "secondary_button_background", 4.5, "secondary button text on the button")
  pair("input_text", "input_background", 4.5, "input text on the input")
  if (problems.length) return { output: `Not changed, because people could not read it: ${problems.join("; ")}. Adjust those colours and send it again.` }

  const name = typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 40) : base.name
  const own = state.settings.color_schemes && typeof state.settings.color_schemes === "object" ? (state.settings.color_schemes as Record<string, unknown>) : {}
  const stored: Record<string, unknown> = { name, gradient: (base as { gradient?: string }).gradient ?? "" }
  for (const k of SCHEME_COLOR_KEYS) stored[k] = merged[k]
  const next = { ...own, [key]: stored }
  const builtIn = (BUILT_IN_SCHEME_KEYS as readonly string[]).includes(key)
  return {
    output: `${isNew ? "Added" : "Updated"} the colour scheme "${key}" (${name}): ${Object.keys(colors).join(", ")}. ${isNew || !builtIn ? `Sections use it with update_section color_scheme "${key}".` : "Every section on it changes with it."}`,
    op: { kind: "update_theme", settings: { color_schemes: next } },
  }
}
