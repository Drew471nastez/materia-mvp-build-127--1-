/**
 * ===========================================================================
 *  WHAT KIND OF FORM IS THIS (round 51, Contacts › Forms)
 * ===========================================================================
 * The Forms list says what each form is for, in one word, from what the
 * form already holds. Nothing is stored: a form is never asked to choose a
 * kind, and changing its questions changes the word.
 *
 *   quiz          it scores answers (mode "quiz")
 *   booking       it books a time (booking settings)
 *   lead          it gives something in return for an address (a private
 *                 link after sending), or asks for nothing but who they are
 *   application   it is split into steps or asks to apply, with a long answer
 *   survey        it asks no contact details and has choice or rating questions
 *   form          anything else (a contact form, a feedback form)
 *   website       a website's own contact form inbox, or a form from the
 *                 older website builder (site_forms); never a native form
 *
 * Pure, so the list, the server and the tests share one answer.
 */
import type { FormDefinition } from "./definition"

export type FormKind = "form" | "quiz" | "survey" | "application" | "lead" | "booking" | "website"

export const FORM_KINDS: readonly FormKind[] = ["form", "quiz", "survey", "application", "lead", "booking", "website"]

const CONTACT_TYPES = new Set(["name", "email", "phone"])
const CHOICE_TYPES = new Set(["dropdown", "single", "multiple", "checkboxes", "rating"])
const LONG_TYPES = new Set(["textarea", "file"])

export function formKind(def: Partial<FormDefinition> | null | undefined): FormKind {
  if (!def || typeof def !== "object") return "form"
  if (def.booking) return "booking"
  if (def.mode === "quiz") return "quiz"
  const fields = Array.isArray(def.fields) ? def.fields : []
  if (def.completion?.kind === "gated") return "lead"
  const contact = fields.filter((f) => CONTACT_TYPES.has(String(f.type)))
  const others = fields.filter((f) => !CONTACT_TYPES.has(String(f.type)) && f.type !== "consent")
  if (fields.length > 0 && others.length === 0) return "lead"
  const stepped = fields.some((f) => (f as { new_step?: boolean }).new_step === true)
  const applyWords = /\b(appl(y|ication)|apply now)\b/i.test(`${def.title ?? ""}`)
  if ((stepped || applyWords) && others.some((f) => LONG_TYPES.has(String(f.type)))) return "application"
  if (contact.length === 0 && others.filter((f) => CHOICE_TYPES.has(String(f.type))).length >= 2) return "survey"
  return "form"
}

/** Every form id written anywhere in a page's saved JSON, from a set of ids to look for. */
export function idsIn(json: unknown, wanted: ReadonlySet<string>): Set<string> {
  const found = new Set<string>()
  if (!json || wanted.size === 0) return found
  const text = typeof json === "string" ? json : JSON.stringify(json)
  if (!text) return found
  const ids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []
  for (const id of ids) {
    const lower = id.toLowerCase()
    if (wanted.has(lower)) found.add(lower)
  }
  return found
}

export type UsageKind = "onepage" | "website" | "creator_page"
export interface FormUsage {
  kind: UsageKind
  /** The page's own name: the OnePage's title, the website's name and page. */
  label: string
  /** Where the creator edits it. */
  href: string
}
