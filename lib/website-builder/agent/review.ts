/**
 * ===========================================================================
 *  THE AGENT READS ITS OWN WORK BACK
 * ===========================================================================
 * Until now the loop applied operations and stopped. Whatever came out came
 * out: if a colour change left the body text at 1.4:1 against its background,
 * the run reported success and somebody found an unreadable section later.
 *
 * The code agent in lib/sites has four verification stages — it bundles,
 * typechecks and renders before it will admit to being finished. A theme has
 * nothing to compile, so there was nothing to run and the idea was dropped.
 * That was the wrong conclusion. A theme has plenty that can be WRONG; it just
 * is not the compiler that knows it.
 *
 * These are the checks that are worth having, in the sense that each one names
 * a failure that has an objective answer and a clear fix:
 *
 *   - text nobody can read, by the WCAG contrast ratio;
 *   - a section added and then left holding its preset's demo copy;
 *   - a heading blanked to nothing;
 *   - the same question, tier or quote written twice.
 *
 * Every one is a statement about the page, not a matter of taste — the model
 * is handed the finding and fixes it, rather than being lectured about design.
 *
 * PURE, and free of any import that cannot run in a browser, so the same
 * findings can be shown in the editor later without a round trip.
 */

import { resolveSectionColors, type SchemeColorKey } from "@/lib/storelib-theme/color-schemes"
import { houseStyleFindings, readHouseStyle } from "./house-style"
import { blockCatalogFor, schemaOf, type SchemaMap } from "./schemas"
import type { BlockInstance, SchemaField, SectionInstance } from "../types"
import type { ThemeState } from "./operations"

export interface Finding {
  sectionId: string
  /** Written for the model to act on: what is wrong, and what would fix it. */
  message: string
}

/* ========================================================================== */
/*  CONTRAST                                                                  */
/* ========================================================================== */

/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Not an approximation and not a "looks dark enough" heuristic: the ratio is
 * the number the accessibility guidelines are written in, it is what an
 * auditor will measure, and it gives the model something exact to aim at
 * rather than an adjective.
 */
export function parseColor(value: unknown): [number, number, number] | null {
  if (typeof value !== "string") return null
  const text = value.trim().toLowerCase()

  const hex = /^#([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    const digits = hex[1]
    if (digits.length === 3 || digits.length === 4) {
      // #abc and #abcd — each digit doubled. Alpha, if present, is dropped:
      // a translucent colour sits on something this function cannot see, and
      // guessing what is behind it would produce a confident wrong answer.
      const [r, g, b] = [0, 1, 2].map((i) => parseInt(digits[i] + digits[i], 16))
      return [r, g, b]
    }
    if (digits.length === 6 || digits.length === 8) {
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16))
      return [r, g, b]
    }
    return null
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(text)
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return [parts[0], parts[1], parts[2]]
    }
  }

  if (text === "white") return [255, 255, 255]
  if (text === "black") return [0, 0, 0]
  return null
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (raw: number) => {
    const c = Math.min(255, Math.max(0, raw)) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number | null {
  const first = parseColor(a)
  const second = parseColor(b)
  if (!first || !second) return null
  const one = relativeLuminance(first)
  const two = relativeLuminance(second)
  const lighter = Math.max(one, two)
  const darker = Math.min(one, two)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Which background a foreground colour actually sits on.
 *
 * The schemas follow a convention — `button_text_color` over `button_color`,
 * `badge_text_color` over `badge_color`, `highlight_text_color` over
 * `highlight_bg_color` — and the plain `text_color` sits on the section's
 * `bg_color`. Pairing them by name is what makes this check specific enough to
 * act on instead of a general warning that the section is dark.
 */
const PAIRS: Array<[foreground: string, backgrounds: string[]]> = [
  ["text_color", ["bg_color", "content_bg_color", "card_bg_color"]],
  ["heading_color", ["bg_color", "content_bg_color"]],
  ["button_text_color", ["button_color"]],
  ["cta_text_color", ["cta_color"]],
  ["badge_text_color", ["badge_color"]],
  ["highlight_text_color", ["highlight_bg_color", "highlight_color"]],
  ["nav_link_color", ["header_bg_color", "bg_color"]],
  ["buy_button_text_color", ["buy_button_color"]],
]

/**
 * 4.5:1 is the WCAG AA threshold for body text. Large text is allowed 3:1, but
 * a section's `text_color` is used for body copy far more often than for a
 * heading, so the stricter number is the honest one to check — and a heading
 * that clears 4.5 has lost nothing.
 */
const MINIMUM_RATIO = 4.5

/**
 * WHAT A SECTION OF THIS TYPE SHIPS WITH.
 *
 * The obvious answer — `field.default` — is wrong for most of the library. The
 * schemas are inconsistent: some fields carry a `default`, and for many others
 * the shipped value lives only in `presets[0].settings`, which is what
 * `buildSection` actually copies when a section is created. A hero's `heading`
 * has no `default` at all and arrives as "Build Something Great" from the
 * preset.
 *
 * Two checks below were written against `field.default` and were therefore
 * DEAD — an emptied heading and a section left holding its demo copy both went
 * unreported, and the suite caught it rather than the code shipping silent.
 */
function shippedValue(type: string, fieldId: string, schemas?: SchemaMap): unknown {
  const schema = schemaOf(schemas, type)
  const preset = schema?.presets?.[0]?.settings?.[fieldId]
  if (preset !== undefined) return preset
  return (schema?.fields ?? []).find((f) => f.id === fieldId)?.default
}

function readableColor(section: SectionInstance, id: string, theme: Record<string, unknown>): string | null {
  const value = section.settings?.[id]
  if (typeof value === "string" && value.trim()) return value
  // A field the section leaves unset falls through to what the type ships with
  // and then to the theme — which is what the renderer does, so it is what
  // this has to do to be talking about the same pixels.
  const shipped = shippedValue(section.type, id)
  if (typeof shipped === "string" && shipped.trim()) return shipped
  /**
   * And then to the section's colour scheme, which is where a colour comes
   * from when nothing else names one. Since the presets stopped baking
   * colours this is the usual case rather than the unusual one: `text_color`
   * unset means the scheme's text, and that is the pixel the reader sees.
   */
  const fromScheme = SCHEME_FALLBACK[id]
  if (fromScheme) {
    const scheme = resolveSectionColors(theme, section.settings).scheme
    const value = scheme[fromScheme]
    if (typeof value === "string" && value.trim() && value !== "transparent") return value
  }
  if (id === "bg_color" && typeof theme.background_color === "string") return theme.background_color
  if (id === "text_color" && typeof theme.text_color === "string") return theme.text_color
  return null
}

/** Which of the scheme's twenty-one a section field falls back to. */
const SCHEME_FALLBACK: Record<string, SchemeColorKey> = {
  bg_color: "background",
  content_bg_color: "background",
  card_bg_color: "background_secondary",
  header_bg_color: "background_secondary",
  text_color: "text",
  heading_color: "heading",
  button_color: "primary_button_background",
  button_text_color: "primary_button_text",
  cta_color: "primary_button_background",
  cta_text_color: "primary_button_text",
  badge_color: "primary_button_background",
  badge_text_color: "primary_button_text",
  highlight_bg_color: "primary_button_background",
  highlight_text_color: "primary_button_text",
  buy_button_color: "primary_button_background",
  buy_button_text_color: "primary_button_text",
  nav_link_color: "text",
}

/**
 * ONLY A PAIR THIS RUN ACTUALLY WROTE.
 *
 * Checked against every shipped preset before this rule existed, and nine
 * sections reported a problem the model had nothing to do with: the product's
 * own indigo button is white on #6366f1, which is 4.47:1 — three hundredths
 * under AA — and several image-overlay sections declare white text beside a
 * pale `bg_color` that the reader never sees behind it.
 *
 * A run asked to shorten a heading would have been handed all of that and sent
 * off to "fix" colours nobody complained about, burning turns and changing a
 * page in ways nobody asked for. The check is worth having exactly where the
 * model chose the colour, and nowhere else.
 */
/**
 * A pair the rest of the page already uses is this site's standard, not
 * something this edit introduced.
 *
 * The product's own button is white on #6366f1 — 4.47:1, three hundredths
 * under AA. A model that reuses it is being consistent, which is what it was
 * asked to be, and telling it to fix the brand colour is an argument it cannot
 * win and should not be having.
 */
function pairIsEstablished(
  state: ThemeState,
  section: SectionInstance,
  fg: string,
  bg: string,
  touched: Set<string>,
  schemas?: SchemaMap,
): boolean {
  return state.sections.some((other) => {
    if (other.id === section.id || touched.has(other.id)) return false
    const ids = new Set((schemaOf(schemas, other.type)?.fields ?? []).map((f) => f.id))
    for (const [foreground, backgrounds] of PAIRS) {
      if (!ids.has(foreground)) continue
      const backgroundId = backgrounds.find((id) => ids.has(id))
      if (!backgroundId) continue
      const otherFg = readableColor(other, foreground, state.settings)
      const otherBg = readableColor(other, backgroundId, state.settings)
      if (
        otherFg?.toLowerCase() === fg.toLowerCase() &&
        otherBg?.toLowerCase() === bg.toLowerCase()
      ) {
        return true
      }
    }
    return false
  })
}

export function contrastFindings(
  section: SectionInstance,
  theme: Record<string, unknown>,
  written: Set<string>,
  state?: ThemeState,
  touched?: Set<string>,
  schemas?: SchemaMap,
): Finding[] {
  const ids = new Set((schemaOf(schemas, section.type)?.fields ?? []).map((f) => f.id))
  const out: Finding[] = []

  for (const [foreground, backgrounds] of PAIRS) {
    if (!ids.has(foreground)) continue
    const backgroundIds = backgrounds.filter((id) => ids.has(id))
    if (!written.has(foreground) && !backgroundIds.some((id) => written.has(id))) continue
    const fg = readableColor(section, foreground, theme)
    if (!fg) continue

    const backgroundId = backgroundIds[0]
    if (!backgroundId) continue
    const bg = readableColor(section, backgroundId, theme)
    if (!bg) continue

    const ratio = contrastRatio(fg, bg)
    if (ratio === null || ratio >= MINIMUM_RATIO) continue
    if (state && touched && pairIsEstablished(state, section, fg, bg, touched)) continue

    out.push({
      sectionId: section.id,
      message: `${foreground} (${fg}) on ${backgroundId} (${bg}) has a contrast ratio of ${ratio.toFixed(
        2,
      )}:1. Anything under ${MINIMUM_RATIO}:1 is hard to read and fails WCAG AA. Change one of the two — usually the text — until it clears ${MINIMUM_RATIO}:1.`,
    })
  }

  return out
}

/* ========================================================================== */
/*  CONTENT                                                                   */
/* ========================================================================== */

/** The fields that carry words somebody reads. */
function textFields(type: string, schemas?: SchemaMap): SchemaField[] {
  return (schemaOf(schemas, type)?.fields ?? []).filter(
    (f) => f.type === "text" || f.type === "textarea" || f.type === "richtext",
  )
}

/**
 * Copy that is obviously nobody's. Short and literal on purpose: a longer list
 * starts flagging real sentences, and a false finding sends the model off to
 * "fix" writing that was already fine.
 */
const PLACEHOLDERS = [
  "lorem ipsum",
  "your headline here",
  "your text here",
  "add your text",
  "heading here",
  "insert text",
  "placeholder",
]

function looksLikePlaceholder(value: unknown): boolean {
  if (typeof value !== "string") return false
  const text = value.toLowerCase()
  return PLACEHOLDERS.some((p) => text.includes(p))
}

/**
 * ===========================================================================
 *  COPY THAT READS AS MACHINE-WRITTEN, CAUGHT IN WHAT THIS RUN WROTE
 * ===========================================================================
 * The rulebook bans a short list of words and the em dash (CLAUDE.md, and
 * lib/agent-rules "Copy"). Said in a prompt, that is followed most of the
 * time; checked here, the rest of the time it comes back to be rewritten
 * before anybody sees it. Only in words the run itself wrote, so a creator's
 * own dash in their own heading is theirs.
 */
const SLOP_WORDS = /\b(unlock(s|ed|ing)?|elevate[sd]?|elevating|seamless(ly)?|powerful|effortless(ly)?|supercharge[sd]?|transform(s|ed|ing|ative)?|game[- ]changer|cutting[- ]edge|next[- ]level)\b/i

export function copyProblem(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const text = value.replace(/<[^>]*>/g, " ")
  if (/—/.test(text)) return "an em dash"
  const word = text.match(SLOP_WORDS)
  return word ? `"${word[0]}"` : null
}

function copyFindings(section: SectionInstance, written: Set<string>, blocks: Set<string>, schemas?: SchemaMap): Finding[] {
  const out: Finding[] = []
  for (const field of textFields(section.type, schemas)) {
    if (!written.has(field.id)) continue
    const problem = copyProblem(section.settings?.[field.id])
    if (problem) {
      out.push({
        sectionId: section.id,
        message: `"${field.id}" on this ${section.type} uses ${problem}. The site's copy rules do not allow it: say the same thing in plain words, with a comma or a full stop where a dash was.`,
      })
    }
  }
  for (const block of section.blocks ?? []) {
    if (!blocks.has(block.id)) continue
    for (const [id, value] of Object.entries(block.settings ?? {})) {
      const problem = copyProblem(value)
      if (problem) {
        out.push({
          sectionId: section.id,
          message: `The ${block.type} block [${block.id}] has ${problem} in "${id}". The site's copy rules do not allow it: say it in plain words.`,
        })
        break
      }
    }
  }
  return out
}

/**
 * A section that was ADDED in this run and still holds the preset's demo copy.
 *
 * THE CONTENT IS IN THE BLOCKS, and the first version of this check missed
 * that entirely — it compared the section's own text fields, and a FAQ has two
 * of those while its five actual questions are blocks. "Add an FAQ about my
 * course" answered with the shipped "Do you offer discounts for bulk orders?"
 * would have passed.
 *
 * Compared byte for byte against what the preset ships rather than against a
 * list of suspicious phrases, so it is exact: "Frequently asked questions" is
 * fine copy for somebody to keep, and it is not fine as the ENTIRE result of
 * asking for a section about their business.
 *
 * Only for sections the run created. Editing a section is not a promise to
 * rewrite every word in it.
 */
function untouchedPresetFindings(section: SectionInstance, schemas?: SchemaMap): Finding[] {
  const preset = schemaOf(schemas, section.type)?.presets?.[0]
  const out: Finding[] = []

  const presetBlocks = preset?.blocks ?? []
  const blocks = section.blocks ?? []
  if (presetBlocks.length > 0 && blocks.length === presetBlocks.length) {
    const identical = blocks.every(
      (block, i) =>
        JSON.stringify(block.settings ?? {}) === JSON.stringify(presetBlocks[i]?.settings ?? {}),
    )
    if (identical) {
      out.push({
        sectionId: section.id,
        message: `You added this ${section.type} and left all ${blocks.length} of its entries exactly as the preset ships them. Those are demo content — a FAQ's questions, a pricing table's tiers — and they are the part anybody actually reads. Write the real ones with update_block, using read_store if you need to know what this shop sells.`,
      })
    }
  }

  /**
   * The section's own copy, held to a softer bar: EVERY text field the preset
   * filled, still untouched, and at least two of them. One is not a signal —
   * a newsletter whose heading is "Join our newsletter" is a heading somebody
   * would have written anyway, and firing on it costs a round trip to be told
   * the default was right.
   */
  const shipped = textFields(section.type)
    .map((f) => [f.id, shippedValue(section.type, f.id)] as const)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)

  if (shipped.length >= 2 && shipped.every(([id, value]) => section.settings?.[id] === value)) {
    out.push({
      sectionId: section.id,
      message: `You added this ${section.type} and left every one of its text fields (${shipped
        .map(([id]) => id)
        .join(", ")}) exactly as the preset shipped them. That is demo copy, not this store's.`,
    })
  }

  return out
}

/**
 * A SECTION THAT CAME OUT THIN.
 *
 * "Build me a good complex section" answered with a pricing table holding one
 * tier is the complaint this exists for. The model stops when the request is
 * technically answered, and a section with one entry in it technically is one.
 *
 * The bar is the preset's own block count, halved — a type that ships three
 * tiers is telling you three is what this section looks like when it is
 * finished. Halved rather than matched, because "two plans, not three" is a
 * real request and being argued with over it would be worse than the thinness
 * it prevents. Below half, or below two, is not a smaller version of the
 * section: it is an unfinished one.
 *
 * Only for sections this run ADDED. Trimming an existing section is somebody's
 * decision, not a mistake.
 */
function thinFindings(section: SectionInstance, schemas?: SchemaMap): Finding[] {
  const schema = schemaOf(schemas, section.type)
  const takesBlocks = (schema?.blocks ?? []).length > 0
  if (!takesBlocks) return []

  const expected = (schema?.presets?.[0]?.blocks ?? []).length
  if (expected < 2) return []

  const have = (section.blocks ?? []).length
  const floor = Math.max(2, Math.ceil(expected / 2))
  if (have >= floor) return []

  return [
    {
      sectionId: section.id,
      message: `This ${section.type} has ${have} ${
        have === 1 ? "entry" : "entries"
      } in it. The type ships with ${expected}, which is what it looks like finished — one or two makes the section look unfinished rather than concise. Add more with add_block, written properly. If fewer was actually what the creator asked for, say so in your reply instead of changing it.`,
    },
  ]
}

/**
 * A block with nothing in it renders as a gap in a list, which is worse than
 * one fewer entry — it looks broken rather than short.
 */
/**
 * THEME BLOCKS are judged by what they will draw. A Group has no words of its
 * own and a picture has none at all, so "no text in it" says nothing about
 * them; a Heading left at its file's default is not empty. So a section of
 * theme blocks is read through each block's text fields, defaults applied,
 * at every depth, and a block that has no text fields is not judged.
 */
const TEXT_TYPES = new Set(["text", "textarea", "richtext", "inline_richtext"])
const MEDIA_TYPES = new Set(["image_picker", "video_picker", "video_url", "image_gallery"])

function themeBlockTexts(section: SectionInstance, schemas?: SchemaMap): { block: BlockInstance; texts: string[] }[] | null {
  if (!schemaOf(schemas, section.type)?.accepts?.length) return null
  const catalog = blockCatalogFor(schemas)
  const out: { block: BlockInstance; texts: string[] }[] = []
  const walk = (list: BlockInstance[] | undefined) => {
    for (const block of list ?? []) {
      const all = catalog[block.type]?.fields ?? []
      const fields = all.filter((f) => TEXT_TYPES.has(f.type))
      /* A picture or a video is what such a block is for; its caption is not. */
      const media = all.some((f) => MEDIA_TYPES.has(f.type))
      if (fields.length && !media) {
        out.push({
          block,
          texts: fields.map((f) => {
            const v = block.settings?.[f.id] ?? f.default
            return typeof v === "string" ? v.replace(/<[^>]*>/g, " ").trim() : ""
          }),
        })
      }
      walk(block.blocks)
    }
  }
  walk(section.blocks)
  return out
}

function emptyBlockFindings(section: SectionInstance, schemas?: SchemaMap): Finding[] {
  const themed = themeBlockTexts(section, schemas)
  const empty = themed
    ? themed.filter((t) => t.texts.every((v) => v === "")).map((t) => t.block)
    : (section.blocks ?? []).filter((block) => {
        const values = Object.values(block.settings ?? {})
        return !values.some((v) => typeof v === "string" && v.trim().length > 0)
      })
  if (empty.length === 0) return []
  return [
    {
      sectionId: section.id,
      message: `${empty.length} of this ${section.type}'s entries have no text in them at all. They render as gaps. Fill them or remove them.`,
    },
  ]
}

function emptyFindings(section: SectionInstance, written: Set<string>): Finding[] {
  const out: Finding[] = []
  for (const field of textFields(section.type)) {
    if (!written.has(field.id)) continue
    const value = section.settings?.[field.id]
    const shipped = shippedValue(section.type, field.id)
    const wasFilled = typeof shipped === "string" && shipped.trim().length > 0
    if (wasFilled && typeof value === "string" && value.trim() === "") {
      out.push({
        sectionId: section.id,
        message: `"${field.id}" (${field.label}) is now empty on this ${section.type}. It renders as a blank space. Either write something or, if it genuinely should not show, use the section's own toggle for it.`,
      })
    }
  }
  return out
}

/**
 * What identifies a block to a reader: a FAQ's question, a tier's name, a
 * quote's text.
 *
 * By NAME, in this order, rather than "the first string in the object". That
 * was the first attempt and it compared a counter's `unit` — every counter
 * block on the shipped preset has "k" in it — so a perfectly good stats
 * section reported all of its entries as repeats of each other.
 */
const IDENTIFYING = ["question", "heading", "title", "name", "label", "quote", "text", "body"]

function identity(settings: Record<string, unknown>): string | null {
  for (const id of IDENTIFYING) {
    const value = settings[id]
    if (typeof value === "string" && value.trim()) return value
  }
  // Nothing named like a label: two blocks are only the same if EVERYTHING in
  // them is, which is unambiguous where a guess would not be.
  const json = JSON.stringify(settings)
  return json === "{}" ? null : json
}

function duplicateBlockFindings(section: SectionInstance, schemas?: SchemaMap): Finding[] {
  const themed = themeBlockTexts(section, schemas)
  /* A theme block is the same as another only in what it says: three empty picture slots are three pictures to choose. */
  const identities: (string | null)[] = themed
    ? themed.map((t) => (t.texts.some((v) => v !== "") ? `${t.block.type}:${t.texts.join("|")}` : null))
    : (section.blocks ?? []).map((block) => identity(block.settings ?? {}))
  if (identities.length < 2) return []

  const seen = new Map<string, number>()
  const duplicates: string[] = []
  for (const first of identities) {
    if (typeof first !== "string") continue
    const key = first.trim().toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    if (count === 2) duplicates.push(first.trim().slice(0, 60))
  }

  if (duplicates.length === 0) return []
  return [
    {
      sectionId: section.id,
      message: `This ${section.type} has the same entry more than once: ${duplicates
        .map((d) => `"${d}"`)
        .join(", ")}. Rewrite or remove the repeat.`,
    },
  ]
}

/* ========================================================================== */

export interface ReviewInput {
  state: ThemeState
  /**
   * Every section type this install can see: the theme's, and the ones the
   * creator wrote. Built per request, so one creator's sections never reach
   * another's review. Absent, it is the built-in map, which is what the
   * review saw before — see ./schemas.
   */
  schemas?: SchemaMap
  /** Sections this run wrote to. Nothing else is anybody's business here. */
  touched: string[]
  /** Sections this run created, which are held to a higher bar on copy. */
  added: string[]
  /**
   * Sections whose BLOCKS this run added to or removed from.
   *
   * "Make this section complex" on a section that already exists is the same
   * request as building one, and answering it with a single new entry is the
   * same failure. Held to the same bar — but only when the run actually worked
   * on the content, so editing a heading on a short section is not an occasion
   * to argue about its length.
   */
  filled?: string[]
  /**
   * Which FIELDS the run set, per section. The difference between "this
   * section is involved" and "the model chose this value", and the whole
   * reason the checks below do not fire on the product's own presets.
   */
  written?: Record<string, string[]>
  /** Which BLOCKS the run wrote words into, per section: added or updated. */
  writtenBlocks?: Record<string, string[]>
}

/**
 * What is wrong with the work, if anything.
 *
 * ONLY THE SECTIONS THIS RUN TOUCHED. A page can be carrying a contrast
 * problem somebody made by hand two months ago, and a run asked to shorten a
 * heading has no business rewriting it — or being blocked by it.
 */
export function reviewSections(input: ReviewInput): Finding[] {
  const { state, touched, added } = input
  /** This install's sections, theirs included. See ./schemas. */
  const schemas = input.schemas
  const findings: Finding[] = []
  /**
   * The page's own system, read from the page. See ./house-style for why this
   * matters more than any amount of instruction about taste: coherence comes
   * from a shared vocabulary, and an edit that invents a fourth near-identical
   * grey is what makes a page read as machine-made.
   */
  const style = readHouseStyle(state, touched, schemas)

  for (const id of new Set(touched)) {
    const section = state.sections.find((s) => s.id === id)
    if (!section || !schemaOf(schemas, section.type)) continue

    const written = new Set(input.written?.[id] ?? [])

    findings.push(
      ...contrastFindings(section, state.settings, written, state, new Set(touched), schemas),
    )
    findings.push(...houseStyleFindings({ section, written, style }))
    findings.push(...copyFindings(section, written, new Set(input.writtenBlocks?.[id] ?? []), schemas))
    findings.push(...emptyFindings(section, written))
    findings.push(...duplicateBlockFindings(section, schemas))
    findings.push(...emptyBlockFindings(section, schemas))
    if (added.includes(id)) findings.push(...untouchedPresetFindings(section))
    if (added.includes(id) || (input.filled ?? []).includes(id)) {
      findings.push(...thinFindings(section))
    }

    for (const field of textFields(section.type)) {
      if (written.has(field.id) && looksLikePlaceholder(section.settings?.[field.id])) {
        findings.push({
          sectionId: id,
          message: `"${field.id}" on this ${section.type} still reads like a placeholder. Write what it should actually say.`,
        })
      }
    }
  }

  return findings
}

/** The findings as the model reads them, grouped by section. */
export function describeFindings(findings: Finding[], state: ThemeState): string {
  const bySection = new Map<string, string[]>()
  for (const finding of findings) {
    const list = bySection.get(finding.sectionId) ?? []
    list.push(finding.message)
    bySection.set(finding.sectionId, list)
  }

  const blocks = [...bySection].map(([id, messages]) => {
    const section = state.sections.find((s) => s.id === id)
    const name = section ? `${section.type} [${id}]` : `[${id}]`
    return [`${name}:`, ...messages.map((m) => `  - ${m}`)].join("\n")
  })

  return [
    "BEFORE YOU FINISH — these are problems with the changes you just made, checked against the page as it now stands:",
    ...blocks,
    "Fix them with the tools, then reply. If one of them is genuinely wrong about your change, say why in your reply instead of changing anything.",
  ].join("\n\n")
}
