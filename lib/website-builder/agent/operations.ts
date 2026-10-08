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

import { nameOf, schemaOf, type SchemaMap } from "./schemas"
import { THEME_SETTINGS_GROUPS } from "../theme-settings-schema"
import type { BlockInstance, BlockSchema, SchemaField, SectionInstance } from "../types"
import { blockAt, countAll, freshBlocks, insertAt, moveAt, removeAt, resolvePath, updateAt } from "../block-tree"
import { addableBlocks, themeBlockCatalog } from "../storelib-schemas"
import { acceptsType } from "@/lib/storelib-theme/schema/validate"

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
      /**
       * THE SECTION, BUILT, for a type written in the same run (create_section
       * in ./loop.ts). The editor learns the new file from the `code` event a
       * moment earlier, but its schema lookup is a render behind the stream,
       * so an add that relied on it would find no schema and do nothing.
       * Used only when the type cannot be built here.
       */
      section?: SectionInstance
    }
  /**
   * `unset`: settings the section holds that its schema no longer declares,
   * cleared. Only those: a declared setting is changed, never removed. It is
   * how a value left behind by a rewritten section file stops being carried
   * on the page (./project-check.ts names them).
   */
  | { kind: "update_section"; id: string; settings: Record<string, unknown>; unset?: string[] }
  | { kind: "move_section"; id: string; index: number }
  | { kind: "remove_section"; id: string }
  | { kind: "rename_section"; id: string; name: string }
  /**
   * HIDING IS NOT DELETING, and the difference is the creator's work.
   *
   * "Take the FAQ off for now", "hide the newsletter until launch" — every one
   * of those is temporary, and the only tool the agent had was remove_section.
   * So the questions somebody wrote were gone, and the only way back was Undo,
   * in that session, before a reload. The editor's own eye toggle has always
   * done this properly; the agent writes through the same flag.
   */
  | { kind: "set_section_visibility"; id: string; hidden: boolean }
  /**
   * THE OPEN SECTION SWITCHED TO ITS EDITABLE COPY (./coded-copy.ts). Same
   * id, same settings, same blocks: only the type it is drawn from changes,
   * to a file with the same schema under a new name. Never the header or
   * the footer.
   */
  | { kind: "set_section_type"; id: string; sectionType: string }
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
      /** The block to add it inside, by path (`outer/inner`) or id. Absent: the section itself. */
      parentId?: string
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
export function buildSection(id: string, type: string, schemas?: SchemaMap): SectionInstance | null {
  const schema = schemaOf(schemas, type)
  if (!schema) return null
  const preset = schema.presets?.[0]
  return {
    id,
    type,
    name: schema.name,
    settings: { ...(preset?.settings ?? {}) },
    /*
      The preset's blocks with ids of this section's own, so a preset added
      twice is two sets of blocks. Derived from the section id and the order,
      not drawn at random: the server and the browser both apply this, and
      must arrive at the same ids. A static block keeps its id.
    */
    blocks: (() => {
      let n = 0
      return freshBlocks(preset?.blocks ? JSON.parse(JSON.stringify(preset.blocks)) : [], () => `${id}-b${++n}`)
    })(),
    hidden: false,
  }
}

/** "kind": "header" or "footer" written in a section's schema. Only an explicit kind: an announcement bar in the header group is not the header. */
export function declaredChromeKind(schema: unknown): "header" | "footer" | null {
  const kind = (schema as { kind?: unknown } | undefined)?.kind
  return kind === "header" || kind === "footer" ? kind : null
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
export function applyOp(state: ThemeState, op: ThemeOp, schemas?: SchemaMap): ThemeState {
  switch (op.kind) {
    case "add_section": {
      /* With the lookup: a section the creator wrote is added like any other. */
      const built = buildSection(op.id, op.sectionType, schemas)
      const shipped = !built && op.section && op.section.id === op.id && op.section.type === op.sectionType ? (JSON.parse(JSON.stringify(op.section)) as SectionInstance) : null
      const section = built ?? shipped
      if (!section) return state
      if (op.settings) section.settings = { ...section.settings, ...op.settings }

      /*
        A SECTION THAT SAYS IT IS THE HEADER (or the footer), "kind": "header" in its schema, IS the header: it goes in the
        header group at the top (the footer group at the end) and the one that was showing is hidden, never removed. Added
        as a body section, it was the header on the home page only after a repair at render, and missing (or doubled) on
        the shop, search, account and 404 pages, which take the header from home without one: the owner's "coded headers
        disappear". The built-in stays, hidden, so its logo still reaches theme.logo (../chrome-logo.ts) and undo has it.
      */
      const chromeKind = declaredChromeKind(schemaOf(schemas, op.sectionType))
      if (chromeKind) {
        const placed = { ...section, group: chromeKind } as SectionInstance
        /* Whatever was the header (the built-in, or a coded one before this), hidden. One header, one footer. */
        const sameKind = (s: SectionInstance) => s.type === chromeKind || declaredChromeKind(schemaOf(schemas, s.type)) === chromeKind
        const rest = state.sections.map((s) => (!s.hidden && sameKind(s) ? { ...s, hidden: true } : s))
        if (chromeKind === "header") {
          const lastHeader = rest.reduce((n, s, i) => ((s as { group?: string }).group === "header" || s.type === "header" ? i : n), -1)
          return { ...state, sections: [...rest.slice(0, lastHeader + 1), placed, ...rest.slice(lastHeader + 1)] }
        }
        const firstFooter = rest.findIndex((s) => (s as { group?: string }).group === "footer" || s.type === "footer")
        const at = firstFooter < 0 ? rest.length : firstFooter
        return { ...state, sections: [...rest.slice(0, at), placed, ...rest.slice(at)] }
      }

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
          s.id === op.id ? { ...s, settings: withoutKeys({ ...s.settings, ...op.settings }, op.unset) } : s,
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

    case "set_section_visibility": {
      if (!state.sections.some((s) => s.id === op.id)) return state
      return {
        ...state,
        sections: state.sections.map((s) => (s.id === op.id ? { ...s, hidden: op.hidden } : s)),
      }
    }

    case "set_section_type": {
      const target = state.sections.find((s) => s.id === op.id)
      if (!target || target.type === "header" || target.type === "footer") return state
      if (op.sectionType === "header" || op.sectionType === "footer" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(op.sectionType)) return state
      return {
        ...state,
        sections: state.sections.map((s) => (s.id === op.id ? { ...s, type: op.sectionType } : s)),
      }
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
      const section = state.sections.find((s) => s.id === op.sectionId)
      if (!section) return state
      const parent = op.parentId ? resolvePath(section.blocks, op.parentId) : []
      if (!parent) return state
      const parentType = parent.length ? blockAt(section.blocks, parent)?.block.type ?? null : null
      const spec = blockSpecFor(section.type, parentType, op.blockType, schemas)
      if (!spec) return state
      const block: BlockInstance = {
        id: op.blockId,
        type: op.blockType,
        settings: { ...defaultsFor(spec), ...(op.settings ?? {}) },
      }
      return editBlocks(state, op.sectionId, (blocks) => insertAt(blocks, parent, block, op.index))
    }

    case "update_block":
      return editBlocks(state, op.sectionId, (blocks) => {
        const path = resolvePath(blocks, op.blockId)
        return path ? updateAt(blocks, path, (b) => ({ ...b, settings: { ...b.settings, ...op.settings } })) : blocks
      })

    case "move_block":
      return editBlocks(state, op.sectionId, (blocks) => {
        const path = resolvePath(blocks, op.blockId)
        return path ? moveAt(blocks, path, op.index) : blocks
      })

    case "remove_block":
      /**
       * CASCADES, because the editor's own delete does: everything inside the
       * block goes with it, and so does any header link whose `parent_id`
       * names it. Removing a parent and leaving its children produced blocks
       * whose parent was gone, which render as stray top-level links or as
       * nothing, and quietly corrupted a navigation nobody thought they had
       * touched. A static block is the template's, and stays.
       */
      return editBlocks(state, op.sectionId, (blocks) => {
        const path = resolvePath(blocks, op.blockId)
        if (!path || blockAt(blocks, path)?.block.static) return blocks
        return removeAt(blocks, path)
      })

    default:
      return state
  }
}

/** A copy without the named keys. */
function withoutKeys(settings: Record<string, unknown>, keys?: string[]): Record<string, unknown> {
  if (!keys?.length) return settings
  const out = { ...settings }
  for (const k of keys) delete out[k]
  return out
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
export function applyOps(state: ThemeState, ops: ThemeOp[], schemas?: SchemaMap): ThemeState {
  // Not `reduce(applyOp, …)`: reduce hands its callback the index as a third
  // argument, which would arrive where the schema lookup goes.
  return ops.reduce((acc, op) => applyOp(acc, op, schemas), state)
}

/* ========================================================================== */
/*  WHAT THE MODEL IS TOLD                                                    */
/* ========================================================================== */

/**
 * `header` and `paragraph` are not settings.
 *
 * They are the editor's own furniture — a group title and a note — and they
 * carry no value. 163 of the schema's fields are `header`. Listing them as
 * things the model may write is an invitation to write one, and a write to one
 * merges a key nothing reads: success reported, nothing changed. The same
 * silent failure the id check exists to prevent.
 */
const NOT_A_SETTING = new Set(["header", "paragraph"])

function writableFields(type: string, schemas?: SchemaMap): SchemaField[] {
  return (schemaOf(schemas, type)?.fields ?? []).filter((f) => !NOT_A_SETTING.has(f.type))
}

function writableBlockFields(sectionType: string, blockType: string, schemas?: SchemaMap): SchemaField[] {
  return ((blockSpecs(sectionType, schemas).find((b) => b.type === blockType) ?? themeBlockCatalog()[blockType])?.fields ?? []).filter(
    (f) => !NOT_A_SETTING.has(f.type),
  )
}

/** The field ids a section type actually accepts, for validating a write. */
export function fieldIds(type: string, schemas?: SchemaMap): string[] {
  return writableFields(type, schemas).map((f) => f.id)
}

/* ========================================================================== */
/*  THE CONTROLS, DESCRIBED — AND THE VALUES THEY WILL TAKE                   */
/* ========================================================================== */
/*
 * Every field in this editor is a CONTROL: a slider with a range, a picker
 * with a list, a colour well, a toggle, a text box. The model was shown field
 * IDS and nothing else, so it was writing values blind — "rounded" into a
 * select whose options are simple | boxed | bordered, 500 into a slider that
 * stops at 16, "yes" into a toggle, "warm beige" into a colour.
 *
 * Every one of those merges cleanly and is then ignored by the renderer. The
 * tool reports success and the page does not move. It is the same silent
 * failure as an unknown id, one level down, and it is the reason a request
 * could come back "done" with nothing to see.
 *
 * So: the model is told what each control is and what it accepts, and a value
 * that does not fit is refused with the list rather than merged.
 */

/** One field as the model needs to see it: what it is, and what it will take. */
export function describeField(f: SchemaField): string {
  const accepts = (): string => {
    switch (f.type) {
      case "select":
      case "radio": {
        const values = (f.options ?? []).map((o) => o.value)
        return values.length > 0 ? `one of ${values.join(" | ")}` : "a string"
      }
      case "toggle":
        return "true or false"
      case "range":
      case "number": {
        const bounds =
          f.min !== undefined && f.max !== undefined
            ? `${f.min}-${f.max}`
            : f.min !== undefined
              ? `at least ${f.min}`
              : f.max !== undefined
                ? `at most ${f.max}`
                : "any"
        return `number ${bounds}${f.step !== undefined ? ` step ${f.step}` : ""}${
          f.unit ? ` ${f.unit}` : ""
        }`
      }
      case "color":
        return 'a hex colour like "#1a1a1a"'
      case "image":
      case "video":
        return "an image/video URL, or \"\" for none"
      case "link":
        return 'a URL or a path like "/about"'
      case "richtext":
        return "HTML, e.g. <p>one paragraph</p><p>another</p>"
      case "textarea":
        return "a few sentences"
      case "icon":
        return "an icon name"
      case "font":
        return 'a CSS font stack like "Georgia, serif"'
      default:
        return "a short string"
    }
  }

  /**
   * The SCHEMA's default, labelled as such. It was written as "now …", which
   * is a different claim and a false one — the current value is in CURRENT
   * SETTINGS a few lines down, and the two are only equal on a section nobody
   * has touched.
   */
  const dflt =
    f.default === undefined || f.default === "" ? "" : `, default ${JSON.stringify(f.default)}`
  return `${f.id} — ${f.label}: ${f.type}, ${accepts()}${dflt}`
}

function describeFieldList(fields: SchemaField[], indent = "  "): string {
  return fields.length > 0
    ? fields.map((f) => `${indent}${describeField(f)}`).join("\n")
    : `${indent}none`
}

/** Every control on a section type, for a model that is about to write one. */
export function describeFields(type: string, schemas?: SchemaMap): string {
  return describeFieldList(writableFields(type, schemas))
}

export interface SettingsCheck {
  /** The values to apply, with anything safely coercible already coerced. */
  settings?: Record<string, unknown>
  /** Why nothing was applied. Written for the model to act on. */
  error?: string
  /** What was coerced, so the tool output can say so rather than hide it. */
  notes: string[]
}

/**
 * Check a write against the controls it is writing to.
 *
 * Coercion is deliberate and narrow: "60" into a slider and "true" into a
 * toggle are unambiguous, and refusing them costs a round trip to fix a
 * quoting slip. Everything else is refused WITH THE LIST, because a value that
 * has to be guessed at is a value that will be guessed wrong twice.
 */
export function checkSettings(
  fields: SchemaField[],
  settings: Record<string, unknown>,
  what: string,
): SettingsCheck {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const unknown = Object.keys(settings).filter((key) => !byId.has(key))
  if (unknown.length > 0) {
    return {
      notes: [],
      error: `${what} has no field${unknown.length === 1 ? "" : "s"} called ${unknown
        .map((u) => `"${u}"`)
        .join(", ")}. Nothing was changed. It accepts:\n${describeFieldList(fields)}`,
    }
  }

  const out: Record<string, unknown> = {}
  const notes: string[] = []

  for (const [id, raw] of Object.entries(settings)) {
    const field = byId.get(id)!
    const refuse = (why: string): SettingsCheck => ({
      notes: [],
      error: `"${id}" ${why}. Nothing was changed. ${describeField(field)}`,
    })

    let value = raw

    switch (field.type) {
      case "select":
      case "radio": {
        const values = (field.options ?? []).map((o) => o.value)
        if (typeof value !== "string") return refuse("must be a string")
        if (values.length > 0 && !values.includes(value)) {
          return refuse(`is not one of that control's choices`)
        }
        break
      }

      case "toggle": {
        if (typeof value === "string" && (value === "true" || value === "false")) {
          notes.push(`${id}: "${value}" read as ${value === "true"}`)
          value = value === "true"
        }
        if (typeof value !== "boolean") return refuse("must be true or false")
        break
      }

      case "range":
      case "number": {
        if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
          notes.push(`${id}: "${value}" read as ${Number(value)}`)
          value = Number(value)
        }
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return refuse("must be a number")
        }
        /**
         * CLAMPED, not refused. A slider that stops at 16 and a model that
         * asked for 24 agree about the direction and disagree about the
         * amount; the control's own maximum is the answer, and it is what the
         * editor's slider would have produced from the same drag.
         */
        let n = value as number
        if (field.min !== undefined && n < field.min) {
          notes.push(`${id}: ${n} raised to the control's minimum, ${field.min}`)
          n = field.min
        }
        if (field.max !== undefined && n > field.max) {
          notes.push(`${id}: ${n} lowered to the control's maximum, ${field.max}`)
          n = field.max
        }
        value = n
        break
      }

      case "color": {
        if (typeof value !== "string") return refuse("must be a string")
        const ok =
          value === "" ||
          /^#[0-9a-f]{3,8}$/i.test(value.trim()) ||
          /^(rgb|hsl)a?\([^)]*\)$/i.test(value.trim()) ||
          value.trim() === "transparent"
        if (!ok) return refuse("is not a colour this editor can render")
        break
      }

      default: {
        if (typeof value !== "string") {
          return refuse("must be a string")
        }
      }
    }

    out[id] = value
  }

  return { settings: out, notes }
}

/** The block types a section accepts, and how many of them it will take. */
/**
 * The block types a section takes: the ones it declares for itself, or the
 * theme blocks (blocks/*.storelib) its `accepts` lets in.
 */
export function blockSpecs(sectionType: string, schemas?: SchemaMap): BlockSchema[] {
  const schema = schemaOf(schemas, sectionType)
  if (schema?.blocks?.length) return schema.blocks
  return addableBlocks(schema, themeBlockCatalog())
}

/** The schema of a block of `type` placed directly in the section (parentType null) or inside a block of `parentType`. */
export function blockSpecFor(sectionType: string, parentType: string | null, type: string, schemas?: SchemaMap): BlockSchema | undefined {
  if (parentType === null) return blockSpecs(sectionType, schemas).find((b) => b.type === type)
  const catalog = themeBlockCatalog()
  const parent = catalog[parentType]
  return parent?.accepts?.length && acceptsType(parent.accepts, type) ? catalog[type] : undefined
}

export function maxBlocks(sectionType: string, schemas?: SchemaMap): number | undefined {
  return schemaOf(schemas, sectionType)?.max_blocks
}

/** The field ids one block type accepts, for validating a write. */
export function blockFieldIds(sectionType: string, blockType: string, schemas?: SchemaMap): string[] {
  return writableBlockFields(sectionType, blockType, schemas).map((f) => f.id)
}

/** Every control on one block type, described. */
export function describeBlockFields(sectionType: string, blockType: string, indent = "  ", schemas?: SchemaMap): string {
  return describeFieldList(writableBlockFields(sectionType, blockType, schemas), indent)
}

/** The controls themselves, for checkSettings. */
export function fieldsFor(type: string, schemas?: SchemaMap): SchemaField[] {
  return writableFields(type, schemas)
}

export function blockFieldsFor(sectionType: string, blockType: string, schemas?: SchemaMap): SchemaField[] {
  return writableBlockFields(sectionType, blockType, schemas)
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
export function describeTheme(state: ThemeState, page: string, schemas?: SchemaMap): string {
  const lines = state.sections.map((s, i) => {
    const schema = schemaOf(schemas, s.type)
    const heading =
      typeof s.settings?.heading === "string" && s.settings.heading.trim()
        ? ` — "${String(s.settings.heading).slice(0, 60)}"`
        : ""
    /**
     * A type with no schema here used to be the normal case for a section the
     * creator wrote: this list was built from the theme the site shipped with,
     * and their file lives in their install. It is built per request out of
     * their own files now, so their sections are described like any other and
     * their settings can be written. What is left here is the genuinely
     * unknown type — a file deleted since the page was saved — which can still
     * be moved, hidden, duplicated and removed.
     */
    return `  ${i}. [${s.id}] ${s.type}${s.hidden ? " (hidden)" : ""}${heading}${
      schema ? "" : "  ← no file for this type any more; it can be moved, hidden, duplicated or removed, but not edited"
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
export function describeSection(section: SectionInstance, schemas?: SchemaMap): string {
  const specs = blockSpecs(section.type, schemas)
  const cap = maxBlocks(section.type, schemas)
  const parts = [
    `${section.type} [${section.id}] "${section.name}"${section.hidden ? " — HIDDEN from the page" : ""}`,
    `CONTROLS THIS SECTION HAS\n${describeFields(section.type, schemas)}`,
    `CURRENT SETTINGS\n${JSON.stringify(section.settings, null, 2).slice(0, 5_000)}`,
  ]

  if (specs.length > 0) {
    parts.push(
      [
        `BLOCK TYPES THIS SECTION TAKES${cap !== undefined ? ` (at most ${cap})` : ""}:`,
        ...specs.map((b) =>
          [`  ${b.type} — ${b.name}`, describeBlockFields(section.type, b.type, "      ", schemas)].join("\n"),
        ),
      ].join("\n"),
    )
    const blocks = section.blocks ?? []
    /* Blocks inside blocks, indented, each with the path the block tools take. */
    const catalog = themeBlockCatalog()
    const lines: string[] = []
    const walk = (list: BlockInstance[], above: string[], indent: string) => {
      list.forEach((b, i) => {
        const path = [...above, b.id].join("/")
        const flags = [b.static ? "static, placed by the template" : "", b.hidden ? "hidden" : ""].filter(Boolean).join(", ")
        lines.push(`${indent}${i}. [${path}] ${b.type}${flags ? ` (${flags})` : ""} ${JSON.stringify(b.settings).slice(0, 400)}`)
        const holds = catalog[b.type]?.accepts
        if (b.blocks?.length) walk(b.blocks, [...above, b.id], `${indent}    `)
        else if (holds?.length) lines.push(`${indent}    (holds blocks: ${holds.join(", ")}; none yet)`)
      })
    }
    walk(blocks, [], "  ")
    parts.push(
      blocks.length > 0
        ? `CURRENT BLOCKS (${countAll(blocks)}), in order. Use the [path] as blockId; to add inside a block, pass its path as parentBlockId.\n${lines.join("\n")}`
        : "CURRENT BLOCKS: none — this section is empty until you add some.",
    )
  }

  return parts.join("\n\n")
}

/**
 * THE THEME'S OWN SETTINGS, and which of them exist.
 *
 * Seventy-two fields across twelve groups — colours, type, buttons, layout,
 * animation, the announcement bar. The model was shown the CURRENT VALUES as a
 * JSON dump and never the ids it was allowed to write, so "give the whole site
 * a warmer palette" — the panel's own suggested prompt — was a guess at what a
 * colour field might be called.
 *
 * An id that does not exist merges into the settings and is then ignored by
 * the renderer: success reported, nothing changed. The same silent failure the
 * section and block writes already refuse, still live here because the theme
 * settings live in a different schema and were missed.
 */
export function themeFieldIds(): string[] {
  return themeFieldsFor().map((f) => f.id)
}

/**
 * The settings, grouped, as the model reads them.
 *
 * Labels and types rather than current values: what it needs before writing is
 * "there is a field called `body_font` and it is a font", not what the font
 * happens to be right now — it is given the current values separately.
 */
export function describeThemeSettings(): string {
  return THEME_SETTINGS_GROUPS.map((group) => {
    const fields = (group.fields ?? []).filter((f) => !NOT_A_SETTING.has(f.type))
    if (fields.length === 0) return null
    return [`${group.label}`, ...fields.map((f) => `  ${describeField(f)}`)].join("\n")
  })
    .filter(Boolean)
    .join("\n")
}

/** The theme's own controls, for checkSettings. */
export function themeFieldsFor(): SchemaField[] {
  return THEME_SETTINGS_GROUPS.flatMap((group) =>
    (group.fields ?? []).filter((f) => !NOT_A_SETTING.has(f.type)),
  )
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
  products: Array<{
    title: string
    type: string
    priceCents: number
    published: boolean
    /**
     * The rest of the product data API (lib/website-builder/shop-products),
     * optional so a caller with only the basics still describes a store: the
     * id and page address a product picker and a buy link need, the sale
     * price, and the options a product is bought as.
     */
    id?: string
    url?: string
    compareAtCents?: number | null
    payWhatYouWant?: boolean
    options?: Array<{ name: string; priceCents: number }>
  }>
  /** The site's address, when known, for copy that names it. */
  address?: string | null
  /** The creator's collections, for a collection_picker or collection_list (Products › Collections). */
  collections?: Array<{ id: string; title: string; handle: string; published: boolean }>
}

export function describeStore(facts: StoreFacts): string {
  if (facts.totalProducts === 0) {
    return [
      `STORE: ${facts.storeName}${facts.live ? " (live)" : " (not published yet)"}`,
      "It has no products yet. Do not write copy that promises a catalogue, and do not add a product section: it would render empty.",
    ].join("\n")
  }

  const money = (cents: number) =>
    cents === 0 ? "free" : `${(cents / 100).toFixed(2)}`

  return [
    `STORE: ${facts.storeName}${facts.live ? " (live)" : " (not published yet)"}${facts.address ? `, at ${facts.address}` : ""}`,
    `${facts.publishedProducts} published of ${facts.totalProducts} products. Prices in USD. A product picker takes a product's page address; a buy button is its checkout.`,
    "PRODUCTS",
    ...facts.products.map((p) => {
      const where = [p.id ? `id ${p.id}` : "", p.url ? p.url : ""].filter(Boolean).join(", ")
      const was = typeof p.compareAtCents === "number" && p.compareAtCents > p.priceCents ? ` (was ${money(p.compareAtCents)})` : ""
      const price = p.payWhatYouWant ? `pay what you want from ${money(p.priceCents)}` : money(p.priceCents)
      const options = p.options?.length ? `; options: ${p.options.slice(0, 6).map((o) => `${o.name} ${money(o.priceCents)}`).join(", ")}` : ""
      return `  ${p.title}${where ? ` [${where}]` : ""}: ${p.type}, ${price}${was}${options}${p.published ? "" : " (draft)"}`
    }),
    facts.products.length < facts.totalProducts
      ? `  …and ${facts.totalProducts - facts.products.length} more.`
      : "",
    facts.collections?.length
      ? ["COLLECTIONS (a collection_picker or collection_list takes the id)", ...facts.collections.map((c) => `  ${c.title} [id ${c.id}, /collections/${c.handle}]${c.published ? "" : " (hidden)"}`)].join("\n")
      : "",
    /* How these become a section's products: never copied in as text. */
    "BIND, NEVER COPY: a product section shows these through the store, not as typed text. product_grid or product_featured with source shop, chosen (a product_list of ids) or collection (a collection id); a single product through a product_picker set to its address, or to @current on the product page. A section you write loops products or reads a product_picker / product_list / collection_picker; never type a name, price or picture from this list into a setting, a block or the markup.",
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
export function describeSectionTypes(addable: string[], schemas?: SchemaMap): string {
  return addable
    .map((type) => {
      const schema = schemaOf(schemas, type)
      if (!schema) return null
      const purpose = schema.description ? ` — ${schema.description}` : ""
      return `  ${type}: ${schema.name}${purpose}`
    })
    .filter(Boolean)
    .join("\n")
}
