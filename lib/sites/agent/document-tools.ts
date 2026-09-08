/**
 * The agent's structured edits: the same operations the visual editor calls.
 *
 * ===========================================================================
 *  WHY THE AGENT PREFERS THESE TO write_file
 * ===========================================================================
 * A model asked to make a hero black CAN edit src/sections/Hero.tsx, and the
 * result looks right and is wrong: the colour is now a literal in a component
 * instead of a prop, so the editor's colour picker shows the old value, the
 * creator changes it back, and nothing happens. The site and its controls have
 * come apart, and nobody can see where.
 *
 * Going through a prop keeps one state. The picker reads what the agent wrote,
 * and the agent reads what the picker wrote, because there is only one thing
 * to read.
 *
 * Raw file editing stays available — it is how a request the section library
 * cannot express gets done at all — but it is the second choice, and the tool
 * descriptions say so in the words the model reads.
 */

import {
  addSection,
  opError,
  createPage,
  duplicateSection,
  moveSection,
  removeSection,
  updateSectionProps,
  updateTheme,
} from "../document/operations"
import { describeSections, sectionSpec } from "../document/sections"
import type { PropValue, SiteDocument } from "../document/schema"
import type { ToolSpec } from "./types"

export const DOCUMENT_TOOL_NAMES = [
  "get_layout",
  "add_section",
  "update_section",
  "move_section",
  "remove_section",
  "duplicate_section",
  "update_theme",
  "create_page",
] as const

export type DocumentToolName = (typeof DOCUMENT_TOOL_NAMES)[number]

const anyProps = {
  type: "object",
  description: "Prop names and values, as named in the section's schema.",
  additionalProperties: true,
} as const

export const DOCUMENT_TOOLS: ToolSpec[] = [
  {
    name: "get_layout",
    description:
      "The site's pages, the sections on each one in order, and every section's current props. Read this before editing anything — it is the state the creator's visual controls are bound to.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "add_section",
    description:
      "Put a native section on a page. PREFER THIS over writing a component: a native section stays editable in the visual editor, and hand-written markup does not.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: 'Page id or path, e.g. "/" or "about".' },
        type: { type: "string", description: "One of the native section types." },
        id: { type: "string", description: "A short unique id for this instance." },
        index: { type: "number", description: "Position on the page. Omit to append." },
        props: anyProps,
      },
      required: ["page", "type", "id", "index", "props"],
      additionalProperties: false,
    },
  },
  {
    name: "update_section",
    description:
      "Change one or more props on a section. THIS IS HOW A VISUAL CHANGE IS MADE — a colour, a heading, an image, a layout. Editing the component file instead moves the value out of the creator's controls and breaks the picker that used to change it.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The section's id." },
        props: anyProps,
      },
      required: ["id", "props"],
      additionalProperties: false,
    },
  },
  {
    name: "move_section",
    description: "Reorder a section within its page.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        index: { type: "number", description: "Zero-based position to move it to." },
      },
      required: ["id", "index"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_section",
    description: "Take a section off its page.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "duplicate_section",
    description: "Copy a section, with its props, directly after the original.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, newId: { type: "string" } },
      required: ["id", "newId"],
      additionalProperties: false,
    },
  },
  {
    name: "update_theme",
    description:
      "Change the values every section reads: colours, radius, container width, fonts. THIS IS HOW A WHOLE-SITE REQUEST IS DONE — one write here reaches every section coherently, where editing sections one at a time drifts.",
    parameters: {
      type: "object",
      properties: {
        background: { type: "string" },
        surface: { type: "string" },
        text: { type: "string" },
        muted: { type: "string" },
        primary: { type: "string" },
        primaryText: { type: "string" },
        border: { type: "string" },
        radius: { type: "number" },
        container: { type: "number" },
        fontHeading: { type: "string" },
        fontBody: { type: "string" },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "create_page",
    description: "Add a page. Its path is what a link points at, e.g. \"/about\".",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        path: { type: "string" },
        name: { type: "string" },
      },
      required: ["id", "path", "name"],
      additionalProperties: false,
    },
  },
]

/** The layout as the model reads it: enough to edit, short enough to resend. */
export function describeLayout(doc: SiteDocument): string {
  const pages = doc.pages
    .map((page) => {
      const sections = page.sections
        .map((section, index) => {
          const spec = sectionSpec(section.type)
          const props = Object.entries(section.props)
            .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
            .join(" ")
          return `    ${index}. ${section.id} (${section.type}${spec ? "" : " — NOT a native section"})${props ? `\n       ${props}` : ""}`
        })
        .join("\n")
      return `  ${page.path} "${page.name}" [id: ${page.id}]\n${sections || "    (no sections)"}`
    })
    .join("\n\n")

  const theme = Object.entries(doc.theme)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ")

  return `PAGES\n${pages}\n\nTHEME\n  ${theme}\n\nSECTION TYPES AVAILABLE\n${describeSections()}`
}

export type DocumentToolResult = { doc: SiteDocument | null; output: string }

/**
 * One structured edit.
 *
 * Returns the new document, or null when nothing changed — the caller only
 * re-renders when something did, so a refused edit costs a message and not a
 * rebuild.
 */
export function executeDocumentTool(
  name: DocumentToolName,
  args: Record<string, unknown>,
  doc: SiteDocument,
): DocumentToolResult {
  const asProps = (value: unknown): Record<string, PropValue> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, PropValue>) : {}

  const str = (value: unknown): string => (typeof value === "string" ? value : "")
  const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined)

  switch (name) {
    case "get_layout":
      return { doc: null, output: describeLayout(doc) }

    case "add_section": {
      const result = addSection(doc, {
        pageId: str(args.page),
        type: str(args.type),
        id: str(args.id),
        index: num(args.index),
        props: asProps(args.props),
      })
      return result.ok
        ? { doc: result.doc, output: `Added ${str(args.type)} as "${str(args.id)}".` }
        : { doc: null, output: opError(result) }
    }

    case "update_section": {
      const result = updateSectionProps(doc, { sectionId: str(args.id), props: asProps(args.props) })
      return result.ok
        ? { doc: result.doc, output: `Updated ${str(args.id)}: ${Object.keys(asProps(args.props)).join(", ")}.` }
        : { doc: null, output: opError(result) }
    }

    case "move_section": {
      const result = moveSection(doc, { sectionId: str(args.id), index: num(args.index) ?? 0 })
      return result.ok
        ? { doc: result.doc, output: `Moved ${str(args.id)} to position ${num(args.index) ?? 0}.` }
        : { doc: null, output: opError(result) }
    }

    case "remove_section": {
      const result = removeSection(doc, { sectionId: str(args.id) })
      return result.ok
        ? { doc: result.doc, output: `Removed ${str(args.id)}.` }
        : { doc: null, output: opError(result) }
    }

    case "duplicate_section": {
      const result = duplicateSection(doc, { sectionId: str(args.id), newId: str(args.newId) })
      return result.ok
        ? { doc: result.doc, output: `Duplicated ${str(args.id)} as ${str(args.newId)}.` }
        : { doc: null, output: opError(result) }
    }

    case "update_theme": {
      const patch: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined && value !== null) patch[key] = value
      }
      const result = updateTheme(doc, patch)
      return result.ok
        ? { doc: result.doc, output: `Theme updated: ${Object.keys(patch).join(", ")}.` }
        : { doc: null, output: opError(result) }
    }

    case "create_page": {
      const result = createPage(doc, { id: str(args.id), path: str(args.path), name: str(args.name) })
      return result.ok
        ? { doc: result.doc, output: `Created page ${str(args.path)}.` }
        : { doc: null, output: opError(result) }
    }

    default:
      return { doc: null, output: `There is no tool called "${name}".` }
  }
}
