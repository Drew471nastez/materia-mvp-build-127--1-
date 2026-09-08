/**
 * Every way the site can change, as one closed set of operations.
 *
 * ===========================================================================
 *  ONE SET, TWO CALLERS
 * ===========================================================================
 * A colour picker calls `updateSectionProps`. The agent calls
 * `updateSectionProps`. There is no second path, which is what makes "the AI
 * and the visual editor operate on the same state" true by construction rather
 * than by discipline.
 *
 * Every operation is PURE: document in, document out. No database, no clock,
 * no randomness. That is what lets the whole surface be tested without a
 * network, and what makes undo a matter of keeping the previous value.
 *
 * ===========================================================================
 *  VALIDATION IS THE POINT, NOT A COURTESY
 * ===========================================================================
 * A prop the editor cannot render is worse than a refused edit: the control
 * disappears, or shows a value nothing will honour, and the creator's next
 * move is to change something that has already stopped meaning anything. So an
 * unknown prop is refused, and a value of the wrong shape is refused, by name.
 *
 * The refusals are sentences rather than codes because the agent reads them —
 * "hero has no prop called backgroundColor; did you mean background?" is
 * something a model can act on in the same turn.
 */

import { sectionSpec } from "./sections"
import type { Page, PropSpec, PropValue, SectionInstance, SiteDocument, Theme } from "./schema"

export type OpResult = { ok: true; doc: SiteDocument } | { ok: false; error: string }

const THEME_KEYS: Array<keyof Theme> = [
  "background",
  "surface",
  "text",
  "muted",
  "primary",
  "primaryText",
  "border",
  "radius",
  "container",
  "fontHeading",
  "fontBody",
]

/** A new revision on every write. Nothing else is allowed to set it. */
function commit(doc: SiteDocument, pages: Page[], theme?: Theme): SiteDocument {
  return { revision: doc.revision + 1, theme: theme ?? doc.theme, pages }
}

function findPage(doc: SiteDocument, pageId: string): Page | null {
  return doc.pages.find((page) => page.id === pageId || page.path === pageId) ?? null
}

function nearest(name: string, candidates: string[]): string | null {
  const lower = name.toLowerCase()
  return (
    candidates.find((c) => c.toLowerCase() === lower) ??
    candidates.find((c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())) ??
    null
  )
}

/** Null when the value fits the spec, otherwise why it does not. */
export function propError(name: string, spec: PropSpec, value: PropValue): string | null {
  switch (spec.kind) {
    case "text":
    case "longtext":
    case "image":
    case "url":
    case "color":
      return typeof value === "string" ? null : `"${name}" takes text, not ${typeof value}.`
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) return `"${name}" takes a number.`
      if (spec.min !== undefined && value < spec.min) return `"${name}" cannot be below ${spec.min}.`
      if (spec.max !== undefined && value > spec.max) return `"${name}" cannot be above ${spec.max}.`
      return null
    case "boolean":
      return typeof value === "boolean" ? null : `"${name}" is true or false.`
    case "select":
      if (typeof value !== "string" || !(spec.options ?? []).includes(value)) {
        return `"${name}" is one of: ${(spec.options ?? []).join(", ")}.`
      }
      return null
    case "list": {
      if (!Array.isArray(value)) return `"${name}" takes a list.`
      if (spec.maxItems !== undefined && value.length > spec.maxItems) {
        return `"${name}" holds at most ${spec.maxItems} items.`
      }
      for (const [index, entry] of value.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return `"${name}" item ${index + 1} should be an object.`
        }
        for (const [key, inner] of Object.entries(entry as Record<string, PropValue>)) {
          const itemSpec = spec.item?.[key]
          if (!itemSpec) {
            const known = Object.keys(spec.item ?? {})
            return `"${name}" items have no field called "${key}". They have: ${known.join(", ")}.`
          }
          const bad = propError(`${name}[${index}].${key}`, itemSpec, inner)
          if (bad) return bad
        }
      }
      return null
    }
    default:
      return null
  }
}

export function addSection(
  doc: SiteDocument,
  input: { pageId: string; type: string; id: string; index?: number; props?: Record<string, PropValue> },
): OpResult {
  const page = findPage(doc, input.pageId)
  if (!page) return { ok: false, error: `There is no page "${input.pageId}".` }

  const spec = sectionSpec(input.type)
  if (!spec) return { ok: false, error: `There is no section type "${input.type}".` }

  if (doc.pages.some((p) => p.sections.some((s) => s.id === input.id))) {
    return { ok: false, error: `A section with id "${input.id}" already exists.` }
  }

  const props: Record<string, PropValue> = {}
  for (const [name, value] of Object.entries(input.props ?? {})) {
    const propSpec = spec.props[name]
    if (!propSpec) {
      const suggestion = nearest(name, Object.keys(spec.props))
      return {
        ok: false,
        error: `${input.type} has no prop called "${name}"${suggestion ? `; did you mean "${suggestion}"?` : `. It has: ${Object.keys(spec.props).join(", ")}.`}`,
      }
    }
    const bad = propError(name, propSpec, value)
    if (bad) return { ok: false, error: bad }
    props[name] = value
  }

  const section: SectionInstance = { id: input.id, type: input.type, props }
  const sections = [...page.sections]
  const at = input.index === undefined ? sections.length : Math.max(0, Math.min(input.index, sections.length))
  sections.splice(at, 0, section)

  return { ok: true, doc: commit(doc, doc.pages.map((p) => (p === page ? { ...p, sections } : p))) }
}

export function updateSectionProps(
  doc: SiteDocument,
  input: { sectionId: string; props: Record<string, PropValue> },
): OpResult {
  for (const page of doc.pages) {
    const section = page.sections.find((s) => s.id === input.sectionId)
    if (!section) continue

    const spec = sectionSpec(section.type)
    if (!spec) return { ok: false, error: `"${section.type}" is not a native section.` }

    const props = { ...section.props }
    for (const [name, value] of Object.entries(input.props)) {
      const propSpec = spec.props[name]
      if (!propSpec) {
        const suggestion = nearest(name, Object.keys(spec.props))
        return {
          ok: false,
          error: `${section.type} has no prop called "${name}"${suggestion ? `; did you mean "${suggestion}"?` : `. It has: ${Object.keys(spec.props).join(", ")}.`}`,
        }
      }
      const bad = propError(name, propSpec, value)
      if (bad) return { ok: false, error: bad }
      props[name] = value
    }

    const updated = { ...section, props }
    return {
      ok: true,
      doc: commit(
        doc,
        doc.pages.map((p) =>
          p === page ? { ...p, sections: p.sections.map((s) => (s === section ? updated : s)) } : p,
        ),
      ),
    }
  }
  return { ok: false, error: `There is no section with id "${input.sectionId}".` }
}

export function moveSection(doc: SiteDocument, input: { sectionId: string; index: number }): OpResult {
  for (const page of doc.pages) {
    const from = page.sections.findIndex((s) => s.id === input.sectionId)
    if (from === -1) continue

    const sections = [...page.sections]
    const [section] = sections.splice(from, 1)
    const to = Math.max(0, Math.min(input.index, sections.length))
    sections.splice(to, 0, section)

    return { ok: true, doc: commit(doc, doc.pages.map((p) => (p === page ? { ...p, sections } : p))) }
  }
  return { ok: false, error: `There is no section with id "${input.sectionId}".` }
}

export function removeSection(doc: SiteDocument, input: { sectionId: string }): OpResult {
  for (const page of doc.pages) {
    if (!page.sections.some((s) => s.id === input.sectionId)) continue
    return {
      ok: true,
      doc: commit(
        doc,
        doc.pages.map((p) =>
          p === page ? { ...p, sections: p.sections.filter((s) => s.id !== input.sectionId) } : p,
        ),
      ),
    }
  }
  return { ok: false, error: `There is no section with id "${input.sectionId}".` }
}

export function duplicateSection(doc: SiteDocument, input: { sectionId: string; newId: string }): OpResult {
  for (const page of doc.pages) {
    const at = page.sections.findIndex((s) => s.id === input.sectionId)
    if (at === -1) continue
    if (doc.pages.some((p) => p.sections.some((s) => s.id === input.newId))) {
      return { ok: false, error: `A section with id "${input.newId}" already exists.` }
    }

    const copy: SectionInstance = {
      ...page.sections[at],
      id: input.newId,
      props: { ...page.sections[at].props },
    }
    const sections = [...page.sections]
    sections.splice(at + 1, 0, copy)
    return { ok: true, doc: commit(doc, doc.pages.map((p) => (p === page ? { ...p, sections } : p))) }
  }
  return { ok: false, error: `There is no section with id "${input.sectionId}".` }
}

export function updateTheme(doc: SiteDocument, input: Partial<Theme>): OpResult {
  const theme = { ...doc.theme }
  for (const [key, value] of Object.entries(input)) {
    if (!THEME_KEYS.includes(key as keyof Theme)) {
      return { ok: false, error: `The theme has no "${key}". It has: ${THEME_KEYS.join(", ")}.` }
    }
    if ((key === "radius" || key === "container") && typeof value !== "number") {
      return { ok: false, error: `"${key}" is a number.` }
    }
    if (key !== "radius" && key !== "container" && typeof value !== "string") {
      return { ok: false, error: `"${key}" is text.` }
    }
    ;(theme as Record<string, unknown>)[key] = value
  }
  return { ok: true, doc: commit(doc, doc.pages, theme) }
}

export function createPage(
  doc: SiteDocument,
  input: { id: string; path: string; name: string },
): OpResult {
  if (doc.pages.some((p) => p.id === input.id)) {
    return { ok: false, error: `A page with id "${input.id}" already exists.` }
  }
  if (doc.pages.some((p) => p.path === input.path)) {
    return { ok: false, error: `A page already answers to "${input.path}".` }
  }
  if (!input.path.startsWith("/")) {
    return { ok: false, error: `A path starts with "/" — "${input.path}" does not.` }
  }
  return {
    ok: true,
    doc: commit(doc, [...doc.pages, { id: input.id, path: input.path, name: input.name, sections: [] }]),
  }
}
