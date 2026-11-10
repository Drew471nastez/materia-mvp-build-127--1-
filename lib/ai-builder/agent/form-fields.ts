/**
 * ===========================================================================
 *  EVERY FIELD SAYS WHAT IT WANTS (round Q)
 * ===========================================================================
 * Andrew: "form inputs must always have placeholder text, and labels". A
 * field with neither is a blank box a visitor has to guess at, and a screen
 * reader says "edit text" and nothing else.
 *
 * Every <input> a visitor types into and every <textarea> in a component's
 * markup needs:
 *   - a placeholder (non-empty, a setting is fine: {{ settings.x }})
 *   - a label: a <label for="its id">, a <label> around it, aria-label or
 *     aria-labelledby. The label may be visually hidden; it must exist.
 * A <select> needs the label only. Hidden, submit, button, checkbox, radio,
 * range, file, colour and image inputs need no placeholder (a checkbox or a
 * radio still needs its label). Pure: the agent's validateFile and the
 * tests read it.
 */
import type { ValidationIssue } from "../types"

const NO_PLACEHOLDER = /^(?:hidden|submit|button|reset|image|checkbox|radio|range|file|color|date|time|datetime-local|month|week)$/i
const NO_FIELD = /^(?:hidden|submit|button|reset|image)$/i

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
  if (m) return (m[1] ?? m[2] ?? m[3] ?? "").trim()
  return new RegExp(`\\s${name}(?=[\\s>/])`, "i").test(tag) ? "" : null
}

/** The template part of a component file: what is drawn, without its style, script or schema. */
function markupOf(text: string): string {
  const t = /<template>([\s\S]*?)<\/template>/i.exec(text)?.[1] ?? text
  return t.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ").replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/gi, " ")
}

export interface FieldProblem {
  kind: "label" | "placeholder"
  tag: string
}

/** The fields in some markup that miss a label or a placeholder. */
export function fieldProblems(text: string): FieldProblem[] {
  const html = markupOf(text)
  const labelsFor = new Set([...html.matchAll(/<label\b[^>]*\sfor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").trim()).filter(Boolean))
  const out: FieldProblem[] = []
  for (const m of html.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
    const name = m[1].toLowerCase()
    const tag = m[0]
    const type = name === "input" ? (attr(tag, "type") ?? "text") : name
    if (name === "input" && NO_FIELD.test(type)) continue
    const before = html.slice(0, m.index ?? 0)
    const inLabel = before.lastIndexOf("<label") > before.lastIndexOf("</label>")
    const id = attr(tag, "id")
    const labelled = inLabel || !!attr(tag, "aria-label") || !!attr(tag, "aria-labelledby") || (!!id && labelsFor.has(id))
    if (!labelled) out.push({ kind: "label", tag: tag.slice(0, 160) })
    const wantsPlaceholder = name === "textarea" || (name === "input" && !NO_PLACEHOLDER.test(type))
    if (wantsPlaceholder && !attr(tag, "placeholder")) out.push({ kind: "placeholder", tag: tag.slice(0, 160) })
  }
  return out
}

/** The issues validateFile reports for a component's fields: errors, so a form is never shipped blank. */
export function fieldIssues(path: string, text: string): ValidationIssue[] {
  const p = fieldProblems(text)
  const issues: ValidationIssue[] = []
  const labels = p.filter((x) => x.kind === "label")
  const holders = p.filter((x) => x.kind === "placeholder")
  if (labels.length) issues.push({ severity: "error", code: "form.label", message: `${labels.length} field${labels.length === 1 ? "" : "s"} with no label (${labels[0].tag}). Give each a <label for="its id">, a <label> around it, or aria-label; it may be visually hidden.`, path })
  if (holders.length) issues.push({ severity: "error", code: "form.placeholder", message: `${holders.length} field${holders.length === 1 ? "" : "s"} with no placeholder (${holders[0].tag}). Give each input and textarea a placeholder that shows what to type ("you@example.com"), from a setting if it should be editable.`, path })
  return issues
}
