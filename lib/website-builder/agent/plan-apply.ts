/**
 * ===========================================================================
 *  THE PLAN'S STRUCTURE IS BUILT BY CODE, NOT LEFT TO THE MODEL'S GOODWILL
 * ===========================================================================
 * "From my current theme create a full complete clothing brand website."
 * The run read the page, wrote a sentence, changed a few settings and
 * stopped: not one section removed, not one added, the header in the wrong
 * colours, the footer untouched. A plan the model is merely TOLD about is a
 * plan it may skip, and a model that sees an existing page is drawn to edit
 * it rather than replace it.
 *
 * So once a plan exists (./creative-plan.ts) its structure is applied here,
 * deterministically, before the model's first turn:
 *
 *   PALETTE   the plan's colours written into the BUILT-IN schemes (black and
 *             dark for a dark site, white and light for a light one). Built-in
 *             keys, because the header's and footer's colour scheme is a choice
 *             of those five: a palette under a new key never reaches them.
 *             Text that would not read on its background is corrected here.
 *   TYPE      the plan's two fonts.
 *   PAGE      the sections the plan drops are removed; the planned built-in
 *             sections are added in order, each on the scheme the plan gave
 *             it; kept sections are moved into place.
 *   CHROME    the header and footer put on the new palette.
 *
 * What is left to the model is what a model is for: the words, the entries,
 * the settings that make each section this business's, and the few sections
 * of its own the plan asked for (create_section, at the positions given).
 * The project check (./project-check.ts) then refuses to finish while any of
 * the added sections still holds its preset's demo copy.
 *
 * Pure. Every operation goes through the same applier the editor uses.
 */

import { applyOp, checkSettings, fieldsFor, type ThemeOp, type ThemeState } from "./operations"
import { contrastRatio, parseColor } from "./review"
import { setColorScheme } from "./scheme-edit"
import { nameOf, schemaOf, type SchemaMap } from "./schemas"
import { plannedLabel, type CreativePlan } from "./creative-plan"
import type { Intent } from "./intent"

export interface PlanApplied {
  /** In order, with what the chat says about each. */
  ops: { op: ThemeOp; label: string }[]
  state: ThemeState
  /** Section ids the plan's built-in sections were added as, by plan index. */
  placed: (string | null)[]
  /** Sections of the model's own still to write, with where they go. */
  toWrite: { label: string; type: string; after: string | null; purpose: string }[]
  /** The scheme keys the palette was written to. */
  schemes: { primary: string; alt: string } | null
  /** What could not be applied, for the model to do by hand. */
  skipped: string[]
}

const luminance = (hex: string): number => {
  const rgb = parseColor(hex)
  if (!rgb) return 1
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A text colour that reads on `bg`: the wanted one if it does, else near white or near black. */
function readable(wanted: string | undefined, bg: string, min: number): string {
  if (wanted && (contrastRatio(wanted, bg) ?? 0) >= min) return wanted
  /* Whichever of the two reads better: a red button is too dark for one and too light for the other to guess. */
  const soft = luminance(bg) < 0.4 ? "#f5f5f4" : "#111111"
  if ((contrastRatio(soft, bg) ?? 0) >= min) return soft
  return (contrastRatio("#ffffff", bg) ?? 0) >= (contrastRatio("#000000", bg) ?? 0) ? "#ffffff" : "#000000"
}

function mix(a: string, b: string, t: number): string {
  const x = parseColor(a)
  const y = parseColor(b)
  if (!x || !y) return a
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}

/** The full set of scheme colours for one surface, every pair readable. */
export function schemeColors(base: { background: string; text?: string; heading?: string; accent?: string; button?: string; buttonText?: string }): Record<string, string> {
  const bg = base.background
  const heading = readable(base.heading, bg, 4.5)
  const text = readable(base.text, bg, 4.5)
  const muted = readable(mix(text, bg, 0.3), bg, 3)
  const accent = base.accent && (contrastRatio(base.accent, bg) ?? 0) >= 3 ? base.accent : heading
  const button = base.button ?? accent
  const buttonText = readable(base.buttonText, button, 4.5)
  const border = mix(bg, text, 0.16)
  return {
    background: bg,
    background_secondary: mix(bg, text, 0.05),
    text,
    text_muted: muted,
    heading,
    accent,
    link: accent,
    border,
    primary_button_background: button,
    primary_button_text: buttonText,
    primary_button_border: button,
    secondary_button_background: "transparent",
    secondary_button_text: heading,
    secondary_button_border: heading,
    input_background: mix(bg, text, 0.04),
    input_text: text,
    input_border: border,
  }
}

const isBody = (s: { type: string; group?: unknown }) => s.type !== "header" && s.type !== "footer" && !s.group

/**
 * The plan, applied. `intent` decides how much of the old page may go: a
 * page redesign touches this page and its fonts only if the plan asked; a
 * new site or a new direction replaces the page and repaints the chrome.
 */
export function applyPlan(input: {
  plan: CreativePlan
  state: ThemeState
  schemas: SchemaMap
  addable: string[]
  intent: Intent
  newId: (type: string) => string
}): PlanApplied {
  const { plan, schemas, intent } = input
  let state = input.state
  const ops: PlanApplied["ops"] = []
  const skipped: string[] = []
  const push = (op: ThemeOp, label: string) => {
    state = applyOp(state, op, schemas)
    ops.push({ op, label })
  }
  const wholeSite = intent.kind === "FULL_SITE_REDESIGN" || intent.kind === "NEW_SITE_GENERATION"

  /* ── palette ── */
  let schemes: PlanApplied["schemes"] = null
  const c = plan.palette.colors
  const background = c.background
  if (background && parseColor(background)) {
    const dark = luminance(background) < 0.2
    const primary = dark ? "black" : "white"
    const alt = dark ? "dark" : "light"
    const main = schemeColors({ background, text: c.text, heading: c.heading, accent: c.accent, button: c.button, buttonText: c.button_text })
    const surfaceBg = c.surface && parseColor(c.surface) && Math.abs(luminance(c.surface) - luminance(background)) < 0.35 ? c.surface : mix(background, main.text, dark ? 0.07 : 0.04)
    const surface = schemeColors({ background: surfaceBg, text: c.text, heading: c.heading, accent: c.accent, button: c.button, buttonText: c.button_text })
    const name = plan.brand.name ? `${plan.brand.name} ${dark ? "dark" : "light"}` : dark ? "Dark" : "Light"
    /*
      A light site also gets its own dark band: the plan's darkest colour, so
      a section the plan marks dark is this brand's dark and not the theme's
      default grey. A dark site's light sections keep the theme's light ones.
    */
    const inkBase = [c.heading, c.text, "#0a0a0a"].find((x) => x && parseColor(x) && luminance(x) < 0.03) ?? "#0a0a0a"
    const ink = !dark ? schemeColors({ background: inkBase, accent: c.accent, button: "#ffffff", buttonText: inkBase }) : null
    const writes: [string, Record<string, string>, string][] = [
      [primary, main, name],
      [alt, surface, `${name} alt`],
      ...(ink ? ([["dark", ink, `${name} ink`]] as [string, Record<string, string>, string][]) : []),
    ]
    for (const [key, colors, label] of writes) {
      const set = setColorScheme(JSON.stringify({ scheme: key, name: label, colorsJson: JSON.stringify(colors) }), state)
      if (set.op) push(set.op, "Set the colours")
      else skipped.push(`the ${key} colour scheme: ${set.output}`)
    }
    schemes = { primary, alt }
  }

  /* ── type ── */
  if (wholeSite || intent.kind === "PAGE_REDESIGN") {
    const fonts: Record<string, string> = {}
    if (plan.typography.heading && plan.typography.heading !== state.settings.font_heading) fonts.font_heading = plan.typography.heading
    if (plan.typography.body && plan.typography.body !== state.settings.font_body) fonts.font_body = plan.typography.body
    if (Object.keys(fonts).length) push({ kind: "update_theme", settings: fonts }, "Set the fonts")
  }

  /* ── the page: what goes ── */
  const kept = new Set(plan.sections.filter((s) => s.use.startsWith("keep:")).map((s) => s.use.slice(5)))
  const going = new Set(plan.remove)
  if (wholeSite || intent.kind === "PAGE_REDESIGN") {
    for (const s of state.sections) if (isBody(s) && !kept.has(s.id)) going.add(s.id)
  }
  for (const id of going) {
    const s = state.sections.find((x) => x.id === id)
    if (!s || !isBody(s)) continue
    /*
      NOBODY SAID TO REMOVE ANY (./intent.ts confirmRemovals): the creator's section is hidden, not deleted. It stays
      in the page, out of sight, and Show brings it back; the reply says which were hidden.
    */
    if (intent.confirmRemovals) {
      if (!s.hidden) push({ kind: "set_section_visibility", id, hidden: true }, `Hid ${s.name?.trim() || nameOf(schemas, s.type)}`)
      continue
    }
    push({ kind: "remove_section", id }, `Removed ${s.name?.trim() || nameOf(schemas, s.type)}`)
  }

  /* ── the page: what comes, in order ── */
  const firstBody = () => {
    const at = state.sections.findIndex((s) => isBody(s))
    if (at >= 0) return at
    const header = state.sections.findIndex((s) => s.type === "header" || s.group === "header")
    return header >= 0 ? state.sections.filter((s) => s.type === "header" || s.group === "header").length : 0
  }
  const start = firstBody()
  const placed: (string | null)[] = []
  const toWrite: PlanApplied["toWrite"] = []
  let position = start
  plan.sections.forEach((planned, i) => {
    const schemeFor = () => {
      if (!schemes) return undefined
      const said = planned.scheme.toLowerCase()
      if (/\b(light|white|cream|ivory|paper)\b/.test(said)) return schemes.primary === "white" ? "white" : "light"
      if (/\b(dark|black|night)\b/.test(said)) return schemes.primary === "black" ? "black" : "dark"
      return i % 2 === 0 ? schemes.primary : schemes.alt
    }
    if (planned.use.startsWith("keep:")) {
      const id = planned.use.slice(5)
      const at = state.sections.findIndex((s) => s.id === id)
      if (at < 0) {
        placed.push(null)
        return
      }
      if (at !== position) push({ kind: "move_section", id, index: position }, `Moved ${nameOf(schemas, state.sections[at].type)}`)
      placed.push(id)
      position++
      return
    }
    if (planned.use.startsWith("new:")) {
      /* Written by the model, directly after the planned section before it (or the one of its own before that). */
      const before = toWrite.length && placed[i - 1] === null && plan.sections[i - 1]?.use.startsWith("new:") ? `new:${plan.sections[i - 1].use.slice(4)}` : [...placed].reverse().find(Boolean) ?? null
      toWrite.push({ label: plannedLabel(planned, schemas), type: planned.use.slice(4), after: before, purpose: [planned.purpose, planned.content, planned.layout].filter(Boolean).join(" ") })
      placed.push(null)
      return
    }
    if (!schemaOf(schemas, planned.use) || !input.addable.includes(planned.use)) {
      skipped.push(`${planned.use} could not be added`)
      placed.push(null)
      return
    }
    const id = input.newId(planned.use)
    const wanted: Record<string, unknown> = {}
    const scheme = schemeFor()
    if (scheme) wanted.color_scheme = scheme
    const checked: { settings?: Record<string, unknown>; error?: string } = Object.keys(wanted).length ? checkSettings(fieldsFor(planned.use, schemas), wanted, planned.use) : { settings: {} }
    const insertAt = Math.min(position, state.sections.length)
    push({ kind: "add_section", id, sectionType: planned.use, index: insertAt, settings: checked.error ? {} : checked.settings }, `Added ${plannedLabel(planned, schemas)}`)
    placed.push(id)
    position++
  })

  /* ── the chrome on the new palette ── */
  if (schemes && wholeSite) {
    for (const type of ["header", "footer"] as const) {
      const s = state.sections.find((x) => x.type === type && !x.hidden)
      if (!s) continue
      const wanted: Record<string, unknown> = { color_scheme: type === "header" ? schemes.primary : schemes.alt }
      const checked = checkSettings(fieldsFor(type, schemas), wanted, type)
      if (checked.error || s.settings?.color_scheme === wanted.color_scheme) continue
      push({ kind: "update_section", id: s.id, settings: checked.settings! }, `Put the ${type} on the new colours`)
    }
  }

  return { ops, state, placed, toWrite, schemes, skipped }
}

/** What the model is told the code already did, and what is left to it, in order. */
export function describeApplied(applied: PlanApplied, plan: CreativePlan, schemas?: SchemaMap): string {
  const lines: string[] = ["THE PLAN'S STRUCTURE IS ALREADY ON THE PAGE (done by the builder, not by you):"]
  if (applied.schemes) lines.push(`- The palette is written into the built-in schemes "${applied.schemes.primary}" (main) and "${applied.schemes.alt}" (alternate). The header and footer use them. Use these two keys for sections; adjust their colours with set_color_scheme if needed.`)
  if (applied.ops.some((o) => o.op.kind === "update_theme" && "font_heading" in o.op.settings)) lines.push(`- Fonts: headings ${plan.typography.heading}, body ${plan.typography.body}.`)
  const removed = applied.ops.filter((o) => o.op.kind === "remove_section").length
  if (removed) lines.push(`- ${removed} old section${removed === 1 ? " was" : "s were"} removed.`)
  const hid = applied.ops.filter((o) => o.op.kind === "set_section_visibility").length
  if (hid) lines.push(`- ${hid} old section${hid === 1 ? " was" : "s were"} HIDDEN, not removed: the creator did not ask for anything to be removed. Leave them hidden (never remove_section on them) and say in your reply that the old sections are hidden and can be shown again.`)
  const added = plan.sections
    .map((s, i) => (applied.placed[i] && !s.use.startsWith("keep:") ? `[${applied.placed[i]}] ${plannedLabel(s, schemas)} (${s.use})${s.content ? `: ${s.content}` : ""}` : null))
    .filter(Boolean)
  if (added.length) lines.push(`- Added, holding their preset's demo copy until you write them:\n${added.map((a) => `    ${a}`).join("\n")}`)
  lines.push(
    "",
    "YOUR JOB NOW, in the plan's order, several sections per turn:",
    "1. Every added section: read it (read_section), then write its real content about this business into its settings and EVERY block (update_section, update_block, add_block, remove_block). Demo copy left in any of them is refused at the end.",
    applied.toWrite.length
      ? `2. Write the sections of your own the plan asked for, in this order, with create_section, each placed where it says (index = the position after that section in the page listing): ${applied.toWrite.map((w) => `"${w.type}" (${w.label}) ${w.after ? (w.after.startsWith("new:") ? `directly after your "${w.after.slice(4)}"` : `directly after [${w.after}]`) : "first, right under the header"}${w.purpose ? `: ${w.purpose}` : ""}`).join("; ")}.`
      : "2. No sections of your own were planned; add one with create_section only if the page needs a moment no built-in type draws.",
    "3. The header: logo or store name, layout, transparent over the hero if the first section is a full bleed image, the menu (read_menus, edit_menu). The footer: its columns and text. On a whole new website the header and footer are yours to design: write the site's own with create_section (\"kind\": \"header\" or \"kind\": \"footer\"), reading the menu through a link_list, instead of keeping the theme's. On a page redesign keep the ones there unless the creator asks for new ones.",
    "4. Then stop and say in one sentence what the site now is.",
  )
  if (applied.skipped.length) lines.push(`Not applied, do these yourself: ${applied.skipped.join("; ")}.`)
  return lines.join("\n")
}
