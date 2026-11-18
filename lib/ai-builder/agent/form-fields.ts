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

/**
 * ===========================================================================
 *  EVERY FORM GOES SOMEWHERE (round 56)
 * ===========================================================================
 * A form the page cannot send is a form a visitor fills in for nothing. The
 * page sends a form by the rule in lib/website-builder/form-intent.ts; this
 * reads DRAWN markup (no template tags left) and names each form that rule
 * cannot send, or sends to a place that cannot take what it asks for:
 *
 *   nowhere      no data-storelib-form, no action and no email box: the
 *                page stops it and nothing is sent
 *   unknown      data-storelib-form="<something else>": not a kind the page
 *                knows, so it would be guessed at
 *   native       data-storelib-form="native" with no action to post to
 *   no_email     a sign up or a contact form with no email box: there is
 *                nobody to write back to
 *   file         a sign up or a contact form with a file box: those take
 *                words only, so the file would be lost (a published Storelib
 *                form takes files: data-storelib-native-form)
 *   no_message   a contact form that asks only for a name and an email: the
 *                message would be empty, and the endpoint refuses that
 *
 * Not checked: a shop's filters (data-storelib-filters) and a search form
 * (role="search", a search box, or an action to /search), which the page and
 * the browser handle. Pure, so the tests and the render check share it.
 */
export type FormProblemKind = "nowhere" | "unknown" | "native" | "no_email" | "file" | "no_message"

export interface FormProblem {
  kind: FormProblemKind
  /** The form's opening tag, cut short, so the message says which. */
  tag: string
  message: string
}

const KNOWN_FORMS = new Set(["subscribe", "contact", "native"])
/** Names the contact endpoint reads that are not the message itself. */
const CONTACT_BARE = new Set(["name", "email", "company", "consent", "subject"])

/** Whether a form is a search box or a shop's filters, which go where the browser sends them. */
export function isSearchForm(tag: string, inner: string): boolean {
  if (/\sdata-storelib-filters\b/i.test(tag) || /\srole\s*=\s*["']?search/i.test(tag)) return true
  const action = attr(tag, "action") ?? ""
  if (/^\/search(?:[?#]|$)/.test(action)) return true
  return /<input\b[^>]*\stype\s*=\s*["']?search/i.test(inner)
}

export function formProblems(html: string): FormProblem[] {
  const out: FormProblem[] = []
  for (const m of html.matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/gi)) {
    const tag = m[1]
    const inner = m[2]
    if (isSearchForm(tag, inner)) continue
    const short = tag.slice(0, 120)
    const declared = (attr(tag, "data-storelib-form") ?? "").trim().toLowerCase()
    const action = (attr(tag, "action") ?? "").trim()
    const hasAction = action !== "" && action !== "#"
    const fields = [...inner.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)].map((f) => ({ el: f[1].toLowerCase(), tag: f[0], type: f[1].toLowerCase() === "input" ? (attr(f[0], "type") ?? "text").toLowerCase() : f[1].toLowerCase(), name: (attr(f[0], "name") ?? "").toLowerCase() }))
    const email = fields.some((f) => f.type === "email" || f.name === "email")
    const file = fields.some((f) => f.type === "file")
    const push = (kind: FormProblemKind, message: string) => out.push({ kind, tag: short, message })
    if (declared && !KNOWN_FORMS.has(declared)) {
      push("unknown", `A form says data-storelib-form="${declared}", which the page does not know (${short}). Use "contact" for a message to the creator, "subscribe" for an email sign up, or "native" with an action.`)
      continue
    }
    const intent = declared || (hasAction ? "native" : email ? "subscribe" : "")
    if (!intent) {
      push("nowhere", `A form goes nowhere (${short}): it has no data-storelib-form, no action and no email box, so the page stops it and nothing is sent. Make it data-storelib-form="contact" (name, email, message) or "subscribe" (an email box), or place a published form with data-storelib-native-form.`)
      continue
    }
    if (intent === "native") {
      if (!hasAction) push("native", `A form is data-storelib-form="native" with no action to post to (${short}). Give it the address it posts to, or make it "contact" or "subscribe".`)
      continue
    }
    const what = intent === "contact" ? "A contact form" : "A sign up form"
    if (!email) push("no_email", `${what} has no email box (${short}). Add <input type="email" name="email"> with its label: without it nobody can be written back to.`)
    if (file) push("file", `${what} has a file box (${short}). It sends words only, so the file would be lost. Leave the file out, or place a published Storelib form (data-storelib-native-form), which takes files.`)
    if (intent === "contact" && !fields.some((f) => f.name && !CONTACT_BARE.has(f.name) && !/^(hidden|submit|button|reset|image|file)$/.test(f.type))) {
      push("no_message", `A contact form asks only for a name and an email (${short}), so the message would be empty. Add <textarea name="message"> or the question it is for (every other named field reaches the creator under its label).`)
    }
  }
  return out
}
