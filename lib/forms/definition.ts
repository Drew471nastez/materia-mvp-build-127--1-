import { normaliseAction, type NativeAction } from "./actions"
export type FieldType =
  "single" | "multiple" | "text" | "textarea" | "name" | "email" | "phone"
export interface FormField {
  id: string
  type: FieldType
  label: string
  required: boolean
  description?: string
  options?: { id: string; label: string; score?: number }[]
}
export interface FormDefinition {
  title: string
  description: string
  mode: "form" | "quiz"
  fields: FormField[]
  button_text: string
  consent_text: string
  privacy_url?: string
  marketing_opt_in: boolean
  completion: {
    message: string
    action?: NativeAction
    include_answers?: boolean
  }
}
export interface PublicForm {
  id: string
  revision: number
  definition: FormDefinition
}
export type LeadStatus = "new" | "contacted" | "qualified" | "converted"
export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
]
export class FormValidationError extends Error {}
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : ""
const ID = /^[\w-]{1,64}$/
const fail = (message: string): never => {
  throw new FormValidationError(message)
}
export function validateDefinition(
  raw: unknown,
  publish = true,
): FormDefinition {
  if (!raw || typeof raw !== "object")
    return fail("The form could not be read.")
  const d = raw as Record<string, any>
  if (!Array.isArray(d.fields) || d.fields.length < 1 || d.fields.length > 30)
    return fail("Use between 1 and 30 questions.")
  const seen = new Set<string>()
  const fields: FormField[] = d.fields.map((r: any) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      !ID.test(r.id || "") ||
      seen.has(r.id)
    )
      return fail("Every question needs a unique ID.")
    seen.add(r.id)
    if (
      ![
        "single",
        "multiple",
        "text",
        "textarea",
        "name",
        "email",
        "phone",
      ].includes(r.type)
    )
      return fail("Choose a supported question type.")
    const label = text(r.label, 200)
    if (publish && !label) return fail("Name each question before publishing.")
    const field: FormField = {
      id: r.id,
      type: r.type,
      label,
      required: r.required === true,
      description: text(r.description, 500),
    }
    if (["single", "multiple"].includes(r.type)) {
      if (
        !Array.isArray(r.options) ||
        r.options.length < 1 ||
        r.options.length > 30
      )
        return fail("Choice questions need 1 to 30 options.")
      const choices = new Set<string>()
      field.options = r.options.map((o: any) => {
        if (
          typeof o?.id !== "string" ||
          !ID.test(o?.id || "") ||
          choices.has(o.id)
        )
          return fail("Each answer option needs a unique ID.")
        choices.add(o.id)
        const label = text(o.label, 200)
        if (publish && !label) return fail("Name each answer option.")
        return {
          id: o.id,
          label,
          ...(typeof o.score === "number" && Number.isFinite(o.score)
            ? { score: Math.max(0, Math.min(1000, Math.round(o.score))) }
            : {}),
        }
      })
    }
    return field
  })
  const title = text(d.title, 160)
  if (publish && !title) return fail("Give the form a title before publishing.")
  const consent = text(d.consent_text, 600)
  if (publish && !consent)
    return fail("Add a consent notice before publishing.")
  const action = d.completion?.action
    ? normaliseAction(d.completion.action)
    : undefined
  if (d.completion?.action && !action)
    return fail("Complete the form’s next action or choose a success message.")
  if (d.privacy_url && !/^https:\/\/[^\s]+$/.test(d.privacy_url))
    return fail("Use an https privacy policy address.")
  return {
    title,
    description: text(d.description, 1000),
    mode: d.mode === "quiz" ? "quiz" : "form",
    fields,
    button_text: text(d.button_text, 80) || "Send",
    consent_text: consent,
    privacy_url: text(d.privacy_url, 2048) || undefined,
    marketing_opt_in: d.marketing_opt_in === true,
    completion: {
      message:
        text(d.completion?.message, 1000) ||
        "Thanks. Your answers have been received.",
      ...(action ? { action } : {}),
      include_answers: d.completion?.include_answers === true,
    },
  }
}
export type Answer = {
  field_id: string
  label: string
  value: string | string[]
  type: FieldType
}
export function validateAnswers(
  def: FormDefinition,
  raw: unknown,
): {
  answers: Answer[]
  name: string | null
  email: string | null
  phone: string | null
  score: number
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return fail("Your answers could not be read.")
  const input = raw as Record<string, unknown>
  let name: string | null = null,
    email: string | null = null,
    phone: string | null = null,
    score = 0
  const answers = def.fields.map((field) => {
    const value = input[field.id]
    let kept: string | string[] = ""
    if (field.type === "multiple") {
      if (value !== undefined && !Array.isArray(value))
        return fail(`Choose valid answers for ${field.label}.`)
      const ids = [...new Set((value || []) as unknown[])]
      if (
        ids.length > 30 ||
        ids.some(
          (id) =>
            typeof id !== "string" || !field.options?.some((o) => o.id === id),
        )
      )
        return fail(`Choose valid answers for ${field.label}.`)
      kept = ids.map((id) => {
        const choice = field.options!.find((o) => o.id === id)!
        score += choice.score || 0
        return choice.label
      })
    } else if (field.type === "single") {
      if (value) {
        const option = field.options?.find((o) => o.id === value)
        if (!option) return fail(`Choose a valid answer for ${field.label}.`)
        kept = option.label
        score += option.score || 0
      }
    } else {
      if (value !== undefined && typeof value !== "string")
        return fail(`Enter text for ${field.label}.`)
      if (typeof value === "string" && value.length > 4000)
        return fail(`${field.label} is too long.`)
      kept = text(value, 4000)
    }
    if (field.required && !kept.length) return fail(`Complete ${field.label}.`)
    if (typeof kept === "string" && kept) {
      if (field.type === "email") {
        if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(kept) || kept.length > 254)
          return fail("Enter a valid email address.")
        email = kept.toLowerCase()
      }
      if (field.type === "name") name = kept.slice(0, 200)
      if (field.type === "phone") {
        if (
          !/^[+\d\s().-]{7,30}$/.test(kept) ||
          kept.replace(/\D/g, "").length < 7 ||
          kept.replace(/\D/g, "").length > 15
        )
          return fail("Enter a valid phone number.")
        phone = kept
      }
    }
    return {
      field_id: field.id,
      label: field.label,
      value: kept,
      type: field.type,
    }
  })
  return { answers, name, email, phone, score }
}
export function csvCell(value: unknown): string {
  let s = typeof value === "string" ? value : JSON.stringify(value ?? "")
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}
