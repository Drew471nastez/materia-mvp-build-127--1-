/**
 * ===========================================================================
 *  WHAT THE AI DOES TO A THEME, AS DATA
 * ===========================================================================
 * The editor already has one canonical state: `sections` and the theme
 * settings, held in the page and written by every panel, every drag and every
 * colour picker. The AI has to write THAT — not a copy of it, and not a
 * separate representation that has to be reconciled afterwards.
 *
 * So the model does not return a theme. It returns OPERATIONS, and both sides
 * apply them with the function below:
 *
 *   - the server applies them to its working copy, so the next tool call sees
 *     the result of the last one;
 *   - the browser applies the same operations, in order, to the state the
 *     panels are already editing — which is what makes the preview move while
 *     the run is still going, and what makes Undo and Save work afterwards
 *     without knowing an AI was involved.
 *
 * ONE IMPLEMENTATION, USED TWICE. Two appliers that agree today are two
 * appliers that disagree the first time either is edited, and the symptom
 * would be a preview that does not match what was saved — the single most
 * confusing bug this editor could have.
 *
 * This file is deliberately free of `server-only` and of any import that
 * cannot run in a browser, because half its job happens there.
 */

import { SECTION_SCHEMAS } from "../section-schemas"
import type { BlockInstance, BlockSchema, SectionInstance } from "../types"

/** The theme state an operation acts on. Exactly what the editor holds. */
export interface ThemeState {
  sections: SectionInstance[]
  settings: Record<string, unknown>
}

/**
 * `id` is decided by the SERVER, even for an add, and travels in the
 * operation. If each side minted its own the two would drift apart on the
 * first insert, and every later operation naming that section would miss.
 */
export type ThemeOp =
  | {
      kind: "add_section"
      id: string
      sectionType: string
      /** Where in the list. Clamped between header and footer on apply. */
      index?: number
      settings?: Record<string, unknown>
    }
  | { kind: "update_section"; id: string; settings: Record<string, unknown> }
  | { kind: "move_section"; id: string; index: number }
  | { kind: "remove_section"; id: string }
  | { kind: "rename_section"; id: string; name: string }
  | { kind: "update_theme"; settings: Record<string, unknown> }
  /**
   * BLOCKS ARE WHERE THE CONTENT LIVES for half the library.
   *
   * Twenty-four of the fifty section types keep their real content in blocks —
   * a FAQ's questions, a pricing table's tiers, a testimonial's quotes, a
   * gallery's images. Without these operations the agent could change a FAQ's
   * heading, its padding and its accordion style, and never one question. That
   * is exactly what "it changed nothing I can see" looked like.
   */
  | {
      kind: "add_block"
      sectionId: string
      blockId: string
      blockType: string
      index?: number
      settings?: Record<string, unknown>
    }
  | { kind: "update_block"; sectionId: string; blockId: string; settings: Record<string, unknown> }
  | { kind: "move_block"; sectionId: string; blockId: string; index: number }
  | { kind: "remove_block"; sectionId: string; blockId: string }

/**
 * The header and the footer are structure, not content.
 *
 * The editor pins them to the top and bottom and syncs them across every page,
 * so a section inserted above the header or below the footer is not a layout
 * choice — it is a broken page. The editor's own insert clamps for this
 * reason; the AI writes through the same clamp rather than being trusted to
 * remember.
 */
function clampIndex(sections: SectionInstance[], wanted: number): number {
  const headerIdx = sections.findIndex((s) => s.type === "header")
  const footerIdx = sections.findIndex((s) => s.type === "footer")
  const min = headerIdx !== -1 ? headerIdx + 1 : 0
  const max = footerIdx !== -1 ? footerIdx : sections.length
  return Math.max(min, Math.min(max, wanted))
}

/** A new section, filled from its schema's first preset — as the editor does. */
export function buildSection(id: string, type: string): SectionInstance | null {
  const schema = SECTION_SCHEMAS[type]
  if (!schema) return null
  const preset = schema.presets?.[0]
  return {
    id,
    type,
    name: schema.name,
    settings: { ...(preset?.settings ?? {}) },
    blocks: preset?.blocks ? JSON.parse(JSON.stringify(preset.blocks)) : [],
    hidden: false,
  }
}

/**
 * Apply one operation. Pure: never mutates what it is given.
 *
 * An operation that cannot be applied — an id that is not there, a section
 * type that does not exist — returns the state UNCHANGED rather than throwing.
 * On the server the tool has already reported the problem to the model; in the
 * browser this is replaying what the server did, and a throw there would take
 * down the editor over a section somebody deleted a second earlier.
 */
export function applyOp(state: ThemeState, op: ThemeOp): ThemeState {
  switch (op.kind) {
    case "add_section": {
      const section = buildSection(op.id, op.sectionType)
      if (!section) return state
      if (op.settings) section.settings = { ...section.settings, ...op.settings }

      const sections = [...state.sections]
      const at = op.index === undefined ? clampIndex(sections, sections.length) : clampIndex(sections, op.index)
      sections.splice(at, 0, section)
      return { ...state, sections }
    }

    case "update_section": {
      if (!state.sections.some((s) => s.id === op.id)) return state
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === op.id ? { ...s, settings: { ...s.settings, ...op.settings } } : s,
        ),
      }
    }

    case "rename_section": {
      if (!state.sections.some((s) => s.id === op.id)) return state
      return {
        ...state,
        sections: state.sections.map((s) => (s.id === op.id ? { ...s, name: op.name } : s)),
      }
    }

    case "move_section": {
      const from = state.sections.findIndex((s) => s.id === op.id)
      if (from === -1) return state
      const moving = state.sections[from]
      /**
       * The header and footer do not move. Dragging one is not something the
       * editor allows either, and an AI that could would produce a page whose
       * navigation is halfway down it.
       */
      if (moving.type === "header" || moving.type === "footer") return state

      const rest = state.sections.filter((_, i) => i !== from)
      rest.splice(clampIndex(rest, op.index), 0, moving)
      return { ...state, sections: rest }
    }

    case "remove_section": {
      const target = state.sections.find((s) => s.id === op.id)
      if (!target) return state
      // Same reason: a page with no header is not a page somebody asked for.
      if (target.type === "header" || target.type === "footer") return state
      return { ...state, sections: state.sections.filter((s) => s.id !== op.id) }
    }

    case "update_theme":
      return { ...state, settings: { ...state.settings, ...op.settings } }

    case "add_block": {
      const spec = SECTION_SCHEMAS[
        state.sections.find((s) => s.id === op.sectionId)?.type ?? ""
      ]?.blocks?.find((b) => b.type === op.blockType)
      if (!spec) return state
      const block: BlockInstance = {
        id: op.blockId,
        type: op.blockType,
        settings: { ...defaultsFor(spec), ...(op.settings ?? {}) },
      }
      return editBlocks(state, op.sectionId, (blocks) => {
        const next = [...blocks]
        const at = op.index === undefined ? next.length : Math.max(0, Math.min(next.length, op.index))
        next.splice(at, 0, block)
        return next
      })
    }

    case "update_block":
      return editBlocks(state, op.sectionId, (blocks) =>
        blocks.some((b) => b.id === op.blockId)
          ? blocks.map((b) =>
              b.id === op.blockId ? { ...b, settings: { ...b.settings, ...op.settings } } : b,
            )
          : blocks,
      )

    case "move_block":
      return editBlocks(state, op.sectionId, (blocks) => {
        const from = blocks.findIndex((b) => b.id === op.blockId)
        if (from === -1) return blocks
        const rest = blocks.filter((_, i) => i !== from)
        rest.splice(Math.max(0, Math.min(rest.length, op.index)), 0, blocks[from])
        return rest
      })

    case "remove_block":
      /**
       * CASCADES, because the editor's own delete does.
       *
       * Header nav links nest: a submenu item carries `parent_id` pointing at
       * the link it sits under. Removing the parent and leaving the children
       * produces blocks whose parent is gone — they render as stray top-level
       * links, or as nothing, depending on the section. `removeBlock` in the
       * editor has always cascaded; an AI delete that did not would quietly
       * corrupt a navigation nobody thought they had touched.
       */
      return editBlocks(state, op.sectionId, (blocks) =>
        blocks.filter(
          (b) => b.id !== op.blockId && (b.settings?.parent_id as string | undefined) !== op.blockId,
        ),
      )

    default:
      return state
  }
}

/**
 * Rewrite one section's blocks. Pure, and a no-op for a section that is not
 * there — the browser is replaying what the server did, and somebody may have
 * deleted that section by hand a second earlier.
 */
function editBlocks(
  state: ThemeState,
  sectionId: string,
  change: (blocks: BlockInstance[]) => BlockInstance[],
): ThemeState {
  if (!state.sections.some((s) => s.id === sectionId)) return state
  return {
    ...state,
    sections: state.sections.map((s) =>
      s.id === sectionId ? { ...s, blocks: change(s.blocks ?? []) } : s,
    ),
  }
}

/**
 * A block's starting settings, from its schema's own field defaults.
 *
 * A block added with nothing in it renders as an empty row — a blank FAQ
 * question with no answer — which reads as the editor being broken rather than
 * as a block waiting to be filled.
 */
function defaultsFor(spec: BlockSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of spec.fields ?? []) {
    if (field.default !== undefined) out[field.id] = field.default
  }
  return out
}

/** Apply a list, in order. The server's working copy and the browser's agree. */
export function applyOps(state: ThemeState, ops: ThemeOp[]): ThemeState {
  return ops.reduce(applyOp, state)
}

/* ========================================================================== */
/*  WHAT THE MODEL IS TOLD                                                    */
/* ========================================================================== */

/** The field ids a section type actually accepts, for validating a write. */
export function fieldIds(type: string): string[] {
  return (SECTION_SCHEMAS[type]?.fields ?? []).map((f) => f.id)
}

/** The block types a section accepts, and how many of them it will take. */
export function blockSpecs(sectionType: string): BlockSchema[] {
  return SECTION_SCHEMAS[sectionType]?.blocks ?? []
}

export function maxBlocks(sectionType: string): number | undefined {
  return SECTION_SCHEMAS[sectionType]?.max_blocks
}

/** The field ids one block type accepts, for validating a write. */
export function blockFieldIds(sectionType: string, blockType: string): string[] {
  return (blockSpecs(sectionType).find((b) => b.type === blockType)?.fields ?? []).map((f) => f.id)
}

/**
 * The page as it stands, in as few tokens as will do.
 *
 * Ids are included because every operation addresses a section by id, and a
 * model that has to guess one will guess wrong. Settings are NOT — there are
 * forty-nine section types with dozens of fields each, and dumping all of them
 * would fill the context before the model had read the request. It asks for
 * the ones it needs.
 */
export function describeTheme(state: ThemeState, page: string): string {
  const lines = state.sections.map((s, i) => {
    const schema = SECTION_SCHEMAS[s.type]
    const heading =
      typeof s.settings?.heading === "string" && s.settings.heading.trim()
        ? ` — "${String(s.settings.heading).slice(0, 60)}"`
        : ""
    return `  ${i}. [${s.id}] ${s.type}${s.hidden ? " (hidden)" : ""}${heading}${
      schema ? "" : "  ← unknown type, cannot be edited"
    }`
  })

  return [
    `PAGE: ${page}`,
    lines.length > 0 ? `SECTIONS (in order)\n${lines.join("\n")}` : "SECTIONS: none yet",
  ].join("\n\n")
}

/**
 * ONE SECTION IN FULL: its settings, its blocks, and what each will accept.
 *
 * The blocks are the part that matters. Twenty-four of the fifty section types
 * keep their real content in them — a FAQ's questions, a pricing table's
 * tiers, a gallery's images — and a model shown only the section's settings
 * can change a FAQ's heading and its padding while believing it has rewritten
 * the questions. That is what "it changed nothing I can see" looked like.
 */
export function describeSection(section: SectionInstance): string {
  const allowed = fieldIds(section.type)
  const specs = blockSpecs(section.type)
  const cap = maxBlocks(section.type)
  const parts = [
    `${section.type} [${section.id}] "${section.name}"`,
    `FIELDS THIS SECTION ACCEPTS: ${allowed.join(", ") || "none"}`,
    `CURRENT SETTINGS\n${JSON.stringify(section.settings, null, 2).slice(0, 5_000)}`,
  ]

  if (specs.length > 0) {
    parts.push(
      [
        `BLOCK TYPES THIS SECTION TAKES${cap !== undefined ? ` (at most ${cap})` : ""}:`,
        ...specs.map((b) => `  ${b.type} — fields: ${(b.fields ?? []).map((f) => f.id).join(", ")}`),
      ].join("\n"),
    )
    const blocks = section.blocks ?? []
    parts.push(
      blocks.length > 0
        ? `CURRENT BLOCKS (${blocks.length}), in order\n${blocks
            .map(
              (b, i) =>
                `  ${i}. [${b.id}] ${b.type} ${JSON.stringify(b.settings).slice(0, 400)}`,
            )
            .join("\n")}`
        : "CURRENT BLOCKS: none — this section is empty until you add some.",
    )
  }

  return parts.join("\n\n")
}

/**
 * WHAT THE STORE ACTUALLY SELLS.
 *
 * Without this the agent knows the shape of a page and nothing about the
 * business behind it, so "write a better headline" produces a headline about
 * a generic shop — and every product section it adds is a promise about
 * products it has never seen.
 *
 * Deliberately small: names, kinds and prices. Not descriptions, not images,
 * not order history. Enough to write copy that is true, and nothing that would
 * fill the context or leave a customer's details in a model's transcript.
 */
export interface StoreFacts {
  storeName: string
  live: boolean
  totalProducts: number
  publishedProducts: number
  products: Array<{ title: string; type: string; priceCents: number; published: boolean }>
}

export function describeStore(facts: StoreFacts): string {
  if (facts.totalProducts === 0) {
    return [
      `STORE: ${facts.storeName}${facts.live ? " (live)" : " (not published yet)"}`,
      "It has no products yet. Do not write copy that promises a catalogue, and do not add a product section — it would render empty.",
    ].join("\n")
  }

  const money = (cents: number) =>
    cents === 0 ? "free" : `${(cents / 100).toFixed(2)}`

  return [
    `STORE: ${facts.storeName}${facts.live ? " (live)" : " (not published yet)"}`,
    `${facts.publishedProducts} published of ${facts.totalProducts} products.`,
    "PRODUCTS",
    ...facts.products.map(
      (p) => `  ${p.title} — ${p.type}, ${money(p.priceCents)}${p.published ? "" : " (draft)"}`,
    ),
    facts.products.length < facts.totalProducts
      ? `  …and ${facts.totalProducts - facts.products.length} more.`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Every section type that can be added, with what it is for.
 *
 * Sent once per run rather than fetched by a tool: it is the vocabulary, and a
 * model that has to ask what words exist before it can use one spends a turn
 * on something that never changes.
 */
export function describeSectionTypes(addable: string[]): string {
  return addable
    .map((type) => {
      const schema = SECTION_SCHEMAS[type]
      if (!schema) return null
      const purpose = schema.description ? ` — ${schema.description}` : ""
      return `  ${type}: ${schema.name}${purpose}`
    })
    .filter(Boolean)
    .join("\n")
}
