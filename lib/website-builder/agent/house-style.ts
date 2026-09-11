/**
 * ===========================================================================
 *  THE PAGE'S OWN DESIGN SYSTEM, READ OFF THE PAGE
 * ===========================================================================
 * The tools people compare this to — Lovable, v0, the good ones — do not
 * produce coherent pages because their models have better taste. They produce
 * them because the model is given a SYSTEM to work in: a fixed palette, a
 * spacing scale, a type scale. The output looks designed because the
 * vocabulary is small and shared, not because each choice was inspired.
 *
 * This editor has that system and was not using it. Twelve of the fifty
 * sections take a named colour scheme; the other thirty-eight take raw colour
 * fields, and the model was handed those fields with no idea what the rest of
 * the page had already chosen. So it invented: a fourth near-identical grey, a
 * padding of 37 on a page where every other section is 60, a button in a blue
 * that is almost but not quite the blue three sections above it.
 *
 * Nobody can name what is wrong with a page like that, which is exactly why it
 * reads as machine-made.
 *
 * The system is not invented here either. It is READ OFF THE PAGE the creator
 * already has — their colours, their spacing, their rhythm — so an edit joins
 * what is there instead of importing a taste from somewhere else. A page with
 * no established rhythm yields no rules, and the model is left alone.
 *
 * PURE, and free of any import that cannot run in a browser.
 */

import { resolveSectionColors } from "@/lib/storelib-theme/color-schemes"
import { schemaOf, type SchemaMap } from "./schemas"
import type { SectionInstance } from "../types"
import type { ThemeState } from "./operations"
import { parseColor } from "./review"

/** Padding values the section library itself is built on. */
export const SPACING_SCALE = [0, 16, 24, 32, 40, 48, 60, 80, 96, 120]

export interface ColorUse {
  color: string
  uses: number
  /** A couple of places it appears, so the model can see what it is FOR. */
  where: string[]
}

export interface HouseStyle {
  /** Colours used more than once, most used first. The page's real palette. */
  palette: ColorUse[]
  /** Section backgrounds in page order — the page's rhythm. */
  backgrounds: string[]
  /** Padding values in use, most common first. */
  spacing: number[]
  /** True when enough sections agree for "the rhythm" to mean anything. */
  established: boolean
}

const COLOR_FIELD = /_color$|^color$|^gradient_(from|to)$/

function colorFields(type: string, schemas?: SchemaMap): string[] {
  return (schemaOf(schemas, type)?.fields ?? [])
    .filter((f) => f.type === "color")
    .map((f) => f.id)
}

/**
 * What this page has already decided.
 *
 * Only the sections that are actually on it, and only values that are actually
 * set — a schema default nobody chose is not a decision the page has made.
 */
export function readHouseStyle(state: ThemeState, exclude: string[] = [], schemas?: SchemaMap): HouseStyle {
  const counts = new Map<string, { uses: number; where: Set<string> }>()
  const backgrounds: string[] = []
  const spacing = new Map<number, number>()
  /**
   * THE BASELINE IS THE PAGE BEFORE THIS EDIT.
   *
   * Read from the finished state instead, and the model's own drift votes on
   * what the page's convention is: write #f9fafb onto a page of #f8fafc and
   * #f9fafb is now "in use", so the check that exists to catch exactly that
   * goes quiet. Both drift checks were silently dead until a driven test
   * showed them returning nothing on the cases they were written for.
   */
  const skip = new Set(exclude)

  for (const section of state.sections) {
    if (!schemaOf(schemas, section.type) || skip.has(section.id)) continue

    /**
     * THE COLOURS THE PAGE ACTUALLY DRAWS, which are mostly its colour
     * schemes. A section that sets nothing is not a section with no colours:
     * it is a section painted in the scheme it picked, and a model that
     * cannot see those colours invents a fourth grey beside them. Counted
     * first so the scheme is what the page "already uses".
     */
    const scheme = resolveSectionColors(state.settings, section.settings).scheme
    for (const key of ["background", "background_secondary", "text", "heading", "accent", "border", "primary_button_background"] as const) {
      const value = scheme[key]
      if (typeof value !== "string" || !parseColor(value)) continue
      const key2 = value.trim().toLowerCase()
      const entry = counts.get(key2) ?? { uses: 0, where: new Set<string>() }
      entry.uses++
      entry.where.add(`${section.type}.scheme`)
      counts.set(key2, entry)
    }
    if (parseColor(scheme.background)) backgrounds.push(scheme.background.trim().toLowerCase())

    for (const id of colorFields(section.type, schemas)) {
      const value = section.settings?.[id]
      if (typeof value !== "string" || !parseColor(value)) continue
      const key = value.trim().toLowerCase()
      const entry = counts.get(key) ?? { uses: 0, where: new Set<string>() }
      entry.uses++
      entry.where.add(`${section.type}.${id}`)
      counts.set(key, entry)
    }

    const background = section.settings?.bg_color
    if (typeof background === "string" && parseColor(background)) {
      backgrounds.push(background.trim().toLowerCase())
    }

    for (const id of ["padding_top", "padding_bottom"]) {
      const value = section.settings?.[id]
      if (typeof value === "number" && Number.isFinite(value)) {
        spacing.set(value, (spacing.get(value) ?? 0) + 1)
      }
    }
  }

  const palette: ColorUse[] = [...counts]
    .filter(([, v]) => v.uses > 1)
    .sort((a, b) => b[1].uses - a[1].uses)
    .slice(0, 12)
    .map(([color, v]) => ({ color, uses: v.uses, where: [...v.where].slice(0, 3) }))

  const usedSpacing = [...spacing]
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)

  /**
   * Three sections agreeing is a rhythm; two is a coincidence. Below that the
   * page has not decided anything yet and there is nothing to be consistent
   * with — telling a model to match a page of one section would be inventing a
   * rule and calling it the creator's.
   */
  const established =
    state.sections.filter((s) => schemaOf(schemas, s.type) && !skip.has(s.id)).length >= 3

  return { palette, backgrounds, spacing: usedSpacing, established }
}

/** Straight-line distance in sRGB. Crude, and only ever used for "these are the same colour". */
export function colorDistance(a: string, b: string): number | null {
  const one = parseColor(a)
  const two = parseColor(b)
  if (!one || !two) return null
  return Math.sqrt(
    (one[0] - two[0]) ** 2 + (one[1] - two[1]) ** 2 + (one[2] - two[2]) ** 2,
  )
}

/**
 * Close enough that nobody would call them different colours.
 *
 * Deliberately tiny. #f9fafb against #f8fafc is 1.4 and is drift; #ffffff
 * against #f8fafc is 10.3 and is a choice somebody could defend. A generous
 * threshold here would start arguing with deliberate decisions, which is worse
 * than not checking at all.
 */
export const SAME_COLOR_DISTANCE = 8

export function nearestInPalette(
  color: string,
  palette: ColorUse[],
): ColorUse | null {
  let best: ColorUse | null = null
  let bestDistance = Infinity
  for (const entry of palette) {
    if (entry.color === color.trim().toLowerCase()) return null // already the palette's
    const distance = colorDistance(color, entry.color)
    if (distance === null || distance > SAME_COLOR_DISTANCE) continue
    if (distance < bestDistance) {
      bestDistance = distance
      best = entry
    }
  }
  return best
}

/** The page's system, for the model's context. Short: it is read every turn. */
export function describeHouseStyle(style: HouseStyle): string {
  if (!style.established) return ""

  const lines: string[] = [
    "THIS PAGE'S OWN DESIGN SYSTEM. Match it unless the request is to change it.",
    /**
     * THE HOUSE HAS NO EM DASHES IN IT.
     *
     * Every piece of copy this agent writes lands on somebody's shop, and an
     * em dash reads as machine-written to the people who notice it. It is also
     * the single most common tell in generated text. The instruction is here,
     * in the style block, rather than buried in the loop prompt, because this
     * is the section the model is told to MATCH — a rule about how the page
     * reads belongs beside the rules about how it looks.
     */
    "Never use an em dash (—) in any copy you write. Use a comma, a colon, a full stop or a new sentence. The same goes for a hyphen standing in for one.",
  ]

  if (style.palette.length > 0) {
    lines.push(
      `Colours already in use: ${style.palette
        .map((p) => `${p.color} (${p.uses}×, ${p.where[0]})`)
        .join(", ")}. Reuse these rather than introducing a near-identical new one.`,
    )
  }

  if (style.backgrounds.length > 1) {
    lines.push(`Section backgrounds, in order: ${style.backgrounds.join(" → ")}.`)
  }

  if (style.spacing.length > 0) {
    lines.push(
      `Vertical padding in use: ${style.spacing.slice(0, 4).join(", ")}px. Stay on those values — the rhythm is what makes a page look composed.`,
    )
  }

  return lines.join("\n")
}

/**
 * WHERE A NEW EDIT BREAKS THE SYSTEM.
 *
 * Both checks are about drift rather than taste, and both are scoped to values
 * the run actually wrote — the same rule the contrast check learned the hard
 * way, after reporting nine of the shipped presets as broken.
 */
export function houseStyleFindings(input: {
  section: SectionInstance
  written: Set<string>
  style: HouseStyle
}): Array<{ sectionId: string; message: string }> {
  const { section, written, style } = input
  if (!style.established) return []
  const out: Array<{ sectionId: string; message: string }> = []

  for (const id of written) {
    const value = section.settings?.[id]

    if (COLOR_FIELD.test(id) && typeof value === "string") {
      const near = nearestInPalette(value, style.palette)
      if (near) {
        out.push({
          sectionId: section.id,
          message: `You set ${id} to ${value}, and this page already uses ${near.color} in ${near.uses} places (${near.where.join(", ")}). They are the same colour to anybody looking at the page, and having both is what makes a design look assembled rather than designed. Use ${near.color}.`,
        })
      }
    }

    if ((id === "padding_top" || id === "padding_bottom") && typeof value === "number") {
      const onScale = SPACING_SCALE.includes(value)
      const onPage = style.spacing.includes(value)
      if (!onPage && !onScale && style.spacing.length > 0) {
        out.push({
          sectionId: section.id,
          message: `You set ${id} to ${value}px. The rest of this page uses ${style.spacing
            .slice(0, 3)
            .join(", ")}px, and the library's scale is ${SPACING_SCALE.join(", ")}. An odd value breaks the vertical rhythm — pick the nearest one that gives you the effect you wanted.`,
        })
      }
    }
  }

  return out
}
