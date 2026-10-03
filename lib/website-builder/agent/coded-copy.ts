/**
 * ===========================================================================
 *  AN EDITABLE COPY OF ONE OF STORELIB'S OWN SECTIONS
 * ===========================================================================
 * The built in sections are never rewritten by an agent
 * (lib/agent-access/protected.ts): one changed for one site is a section
 * that can no longer be updated or trusted. When a creator wants a change to
 * one that its settings cannot make, the copy is the way: the same file under
 * a new type and a new name, written into their own theme, and the section
 * they have open switched over to it with every setting and block it had.
 *
 * Only the schema's `type` and `name` change. The template, the CSS, the
 * script and every setting id stay exactly as shipped, which is what lets the
 * open section keep its settings and blocks across the switch.
 *
 * Pure: the caller checks and saves the result like any other write.
 */
import { SECTION_TYPE } from "./selected-section"

export type CodedCopy =
  | { ok: true; type: string; path: string; name: string; source: string }
  | { ok: false; error: string }

/** "pricing" → "pricing_custom", then "pricing_custom_2" and so on, clear of every type already taken. */
export function copyTypeFor(type: string, taken: ReadonlySet<string>): string {
  const base = `${type}_custom`.slice(0, 56)
  if (!taken.has(base)) return base
  for (let n = 2; n < 100; n++) {
    const next = `${base}_${n}`
    if (!taken.has(next)) return next
  }
  return `${base}_${Date.now().toString(36)}`
}

/** "Pricing" → "Pricing (your copy)", then "Pricing (your copy 2)". Names are compared without case. */
export function copyNameFor(name: string, taken: ReadonlySet<string>): string {
  const clean = name.replace(/\s+/g, " ").trim() || "Section"
  const first = `${clean} (your copy)`
  if (!taken.has(first.toLowerCase())) return first
  for (let n = 2; n < 100; n++) {
    const next = `${clean} (your copy ${n})`
    if (!taken.has(next.toLowerCase())) return next
  }
  return `${clean} (your copy ${Date.now().toString(36)})`
}

/**
 * The copy's source: the shipped file with its schema's `type` and `name`
 * replaced, inside `<schema>` only, so a "type" that appears in the template
 * or in a setting is never touched.
 */
export function makeCodedCopy(input: {
  type: string
  source: string
  takenTypes: ReadonlySet<string>
  /** Lower case. */
  takenNames: ReadonlySet<string>
}): CodedCopy {
  if (!SECTION_TYPE.test(input.type)) return { ok: false, error: "That section type is not a file name." }
  if (input.type === "header" || input.type === "footer") {
    return { ok: false, error: `The ${input.type} is not copied: a second one would have no cart, search or menus. Change it through its settings.` }
  }
  const at = input.source.indexOf("<schema>")
  if (at < 0) return { ok: false, error: "That section has no schema to copy." }
  const head = input.source.slice(0, at)
  let schema = input.source.slice(at)

  const typeField = new RegExp(`("type"\\s*:\\s*)"${input.type}"`)
  if (!typeField.test(schema)) return { ok: false, error: "That section's schema does not name its type, so it cannot be copied safely." }
  const nameField = /("name"\s*:\s*)"((?:[^"\\]|\\.)*)"/
  const nameMatch = schema.match(nameField)
  const shippedName = nameMatch ? nameMatch[2] : input.type

  const type = copyTypeFor(input.type, input.takenTypes)
  const name = copyNameFor(shippedName, input.takenNames)
  schema = schema.replace(typeField, `$1"${type}"`)
  schema = nameMatch ? schema.replace(nameField, `$1${JSON.stringify(name)}`) : schema
  return { ok: true, type, path: `sections/${type}.storelib`, name, source: head + schema }
}
