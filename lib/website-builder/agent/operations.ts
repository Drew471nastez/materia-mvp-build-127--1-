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
import type { SectionInstance } from "../types"

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

    default:
      return state
  }
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
