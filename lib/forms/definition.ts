import { normaliseAction, webUrl, UUID, type NativeAction } from "./actions"
import { guardFormula } from "@/lib/csv/formula-guard"

/*
  ONE FORM ENGINE for OnePage, websites and creator pages.

  A definition is checked here when it is saved (validateDefinition) and
  every answer is checked here against the published revision before it is
  kept (validateAnswers). The browser renders the same definition with the
  same rules (visibleFields, formSteps), so what a visitor sees and what the
  server accepts cannot drift apart.
*/

export type FieldType =
  | "text"
  | "textarea"
  | "name"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "dropdown"
  | "single"
  | "multiple"
  | "checkboxes"
  | "rating"
  | "consent"
  | "file"

export const FIELD_TYPES: { id: FieldType; label: string }[] = [
  { id: "text", label: "Short answer" },
  { id: "textarea", label: "Paragraph" },
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "dropdown", label: "Dropdown" },
  { id: "single", label: "Single choice" },
  { id: "multiple", label: "Multiple choice" },
  { id: "checkboxes", label: "Checkboxes" },
  { id: "rating", label: "Rating" },
  { id: "consent", label: "Consent" },
  { id: "file", label: "File upload" },
]

const TYPE_IDS = FIELD_TYPES.map((t) => t.id) as string[]
export const CHOICE_TYPES: FieldType[] = ["dropdown", "single", "multiple", "checkboxes"]
export const MULTI_TYPES: FieldType[] = ["multiple", "checkboxes"]
export const isChoice = (t: FieldType) => CHOICE_TYPES.includes(t)
export const isMulti = (t: FieldType) => MULTI_TYPES.includes(t)

export type ConditionOp = "is" | "is_not" | "includes" | "answered" | "empty" | "gte" | "lte"
export const CONDITION_OPS: { id: ConditionOp; label: string }[] = [
  { id: "is", label: "is" },
  { id: "is_not", label: "is not" },
  { id: "includes", label: "includes" },
  { id: "answered", label: "is answered" },
  { id: "empty", label: "is empty" },
  { id: "gte", label: "is at least" },
  { id: "lte", label: "is at most" },
]
export interface Condition {
  field: string
  op: ConditionOp
  value?: string
}

export interface FieldOption {
  id: string
  label: string
  score?: number
}
export interface FormField {
  id: string
  type: FieldType
  label: string
  required: boolean
  description?: string
  placeholder?: string
  options?: FieldOption[]
  /** Number bounds, or the top of a rating scale (3 to 10). */
  min?: number
  max?: number
  /** Starts a new step when the form is shown in steps. */
  new_step?: boolean
  /** Shown only when every condition holds. Only earlier questions can be named. */
  show_if?: Condition[]
}

export interface QuizResult {
  id: string
  min: number
  max: number
  title: string
  message: string
  action?: NativeAction
}

export interface WeeklyWindow {
  day: number
  start: string
  end: string
}
/** One date that differs from the week: other hours, or none (a day off). In the owner's zone. */
export interface DateOverride {
  date: string
  windows: { start: string; end: string }[]
}
/*
  WHERE THE MEETING HAPPENS (round AR). A video link the creator pastes, a
  Google Meet made for each booking (needs Google Calendar connected), a
  phone call (the creator's number, or the visitor's when none is given),
  an address, or nothing said. A video link stays on the server until a
  time is booked (publicDefinition), as Calendly does.
*/
export type BookingLocationKind = "none" | "video" | "google_meet" | "phone" | "in_person"
export const BOOKING_LOCATION_KINDS: BookingLocationKind[] = ["none", "video", "google_meet", "phone", "in_person"]
export interface BookingLocation {
  kind: BookingLocationKind
  /** The video address, the phone number or the street address. */
  value?: string
}
export interface BookingSettings {
  duration: number
  /** Round AR: other lengths the visitor may choose, besides `duration` (the first offered). */
  durations?: number[]
  buffer: number
  timezone: string
  weekly: WeeklyWindow[]
  /** Round AR: dates with other hours, or none. */
  overrides?: DateOverride[]
  notice_hours: number
  days_ahead: number
  /** Round AR: at most this many active bookings of this form in one of the owner's days. Unset: no limit. */
  max_per_day?: number
  /** True: the owner approves each request. False: a free slot is confirmed at once. */
  approval: boolean
  /** A Storelib product the visitor pays for through the existing checkout. */
  payment_product_id?: string
  /** Round AR: where it happens. */
  location?: BookingLocation
  /** Round AR: a short mark over the booking, such as "Most booked". */
  badge?: string
}

export type CompletionKind = "message" | "action" | "gated"
export interface FormDefinition {
  title: string
  description: string
  /** "quiz" adds up option scores and picks a result by range. */
  mode: "form" | "quiz"
  layout: "single" | "steps" | "one_by_one"
  fields: FormField[]
  button_text: string
  consent_text: string
  privacy_url?: string
  marketing_opt_in: boolean
  results?: QuizResult[]
  booking?: BookingSettings
  completion: {
    kind?: CompletionKind
    message: string
    action?: NativeAction
    include_answers?: boolean
    /** Revealed by the server only after a response is kept. */
    gated?: { url: string; label: string }
  }
}
export interface PublicForm {
  id: string
  revision: number
  definition: FormDefinition
  /** Round AR: a paid booking's price as the checkout will charge it ("$40.00"), read from its product. */
  price?: string | null
}
export type LeadStatus = "new" | "contacted" | "qualified" | "converted"
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "converted"]
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
}

export const MAX_FIELDS = 40
export const MAX_OPTIONS = 30
export class FormValidationError extends Error {}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const ID = /^[\w-]{1,64}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const fail = (message: string): never => {
  throw new FormValidationError(message)
}
const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function validateCondition(raw: unknown, earlier: Map<string, FormField>): Condition {
  const c = (raw || {}) as Record<string, unknown>
  const target = typeof c.field === "string" ? earlier.get(c.field) : undefined
  if (!target) return fail("A visibility rule can only depend on an earlier question.")
  const op = CONDITION_OPS.some((o) => o.id === c.op) ? (c.op as ConditionOp) : fail("Choose how each visibility rule compares.")
  const value = text(c.value, 200)
  if (["is", "is_not", "includes", "gte", "lte"].includes(op) && !value) return fail("Give each visibility rule a value.")
  if ((op === "gte" || op === "lte") && !Number.isFinite(Number(value))) return fail("Compare numbers with a number.")
  if (isChoice(target.type) && ["is", "is_not", "includes"].includes(op) && !target.options?.some((o) => o.id === value))
    return fail("A visibility rule names an answer that no longer exists.")
  return { field: target.id, op, ...(value ? { value } : {}) }
}

export function validateBooking(raw: unknown): BookingSettings {
  const b = (raw || {}) as Record<string, unknown>
  if (!validTimeZone(b.timezone)) return fail("Choose a valid time zone for bookings.")
  if (!Array.isArray(b.weekly) || b.weekly.length > 70) return fail("Add your weekly availability.")
  const weekly = (b.weekly as unknown[]).map((w) => {
    const r = (w || {}) as Record<string, unknown>
    const day = typeof r.day === "number" && Number.isInteger(r.day) && r.day >= 0 && r.day <= 6 ? r.day : fail("Availability needs a weekday.")
    const start = typeof r.start === "string" && TIME.test(r.start) ? r.start : fail("Use HH:MM times for availability.")
    const end = typeof r.end === "string" && TIME.test(r.end) ? r.end : fail("Use HH:MM times for availability.")
    if (end <= start) return fail("Each availability window must end after it starts.")
    return { day, start, end }
  })
  const product = text(b.payment_product_id, 36)
  if (product && !UUID.test(product)) return fail("Choose a valid product for the booking payment.")
  const duration = int(b.duration, 5, 480, 30)
  const durations = Array.isArray(b.durations)
    ? [...new Set((b.durations as unknown[]).filter((n): n is number => typeof n === "number" && Number.isFinite(n)).map((n) => Math.round(n)))]
        .filter((n) => n >= 5 && n <= 480 && n !== duration)
        .sort((x, y) => x - y)
        .slice(0, 5)
    : []
  const rawOverrides = b.overrides === undefined || b.overrides === null ? [] : b.overrides
  if (!Array.isArray(rawOverrides) || rawOverrides.length > 120) return fail("Use at most 120 date changes.")
  const seen = new Set<string>()
  const overrides: DateOverride[] = (rawOverrides as unknown[]).map((o) => {
    const r = (o || {}) as Record<string, unknown>
    const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && validDate(r.date) ? r.date : fail("Each date change needs a date.")
    if (seen.has(date)) return fail("Each date can be changed once.")
    seen.add(date)
    const list = Array.isArray(r.windows) ? (r.windows as unknown[]).slice(0, 6) : []
    const windows = list.map((w) => {
      const x = (w || {}) as Record<string, unknown>
      const start = typeof x.start === "string" && TIME.test(x.start) ? x.start : fail("Use HH:MM times for availability.")
      const end = typeof x.end === "string" && TIME.test(x.end) ? x.end : fail("Use HH:MM times for availability.")
      if (end <= start) return fail("Each availability window must end after it starts.")
      return { start, end }
    })
    return { date, windows }
  })
  const loc = (b.location || null) as Record<string, unknown> | null
  let location: BookingLocation | undefined
  if (loc && BOOKING_LOCATION_KINDS.includes(loc.kind as BookingLocationKind) && loc.kind !== "none") {
    const kind = loc.kind as BookingLocationKind
    const value = text(loc.value, 500)
    if (kind === "video") {
      const url = value ? webUrl(value) : null
      if (value && (!url || !/^https:\/\//.test(url))) return fail("Use an https meeting link.")
      location = url ? { kind, value: url } : { kind }
    } else if (kind === "phone") {
      const digits = value.replace(/\D/g, "")
      if (value && (digits.length < 7 || digits.length > 15)) return fail("Enter a valid phone number for the call.")
      location = value ? { kind, value } : { kind }
    } else if (kind === "in_person") location = value ? { kind, value } : { kind }
    else location = { kind }
  }
  const badge = text(b.badge, 24)
  const maxPerDay = int(b.max_per_day, 0, 50, 0)
  return {
    duration,
    ...(durations.length ? { durations } : {}),
    buffer: int(b.buffer, 0, 240, 0),
    timezone: b.timezone as string,
    weekly,
    ...(overrides.length ? { overrides: overrides.sort((x, y) => x.date.localeCompare(y.date)) } : {}),
    notice_hours: int(b.notice_hours, 0, 720, 12),
    days_ahead: int(b.days_ahead, 1, 365, 30),
    ...(maxPerDay ? { max_per_day: maxPerDay } : {}),
    approval: b.approval !== false,
    ...(product ? { payment_product_id: product } : {}),
    ...(location ? { location } : {}),
    ...(badge ? { badge } : {}),
  }
}

/**
 * Round AR: an address typed the way people type one. "mysite.com/privacy"
 * is "https://mysite.com/privacy"; a blank or spaces-only field is no
 * address. Anything with its own scheme is left for the check to judge.
 */
export function typedHttpsUrl(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : ""
  if (!s) return ""
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("/")) return s
  return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s) ? `https://${s}` : s
}

/**
 * Round AR: the builder's draft as it is sent to be saved: addresses as
 * typed made whole (typedHttpsUrl), and nothing else changed, so what comes
 * back from the save is what was on screen.
 */
export function draftForSave(d: FormDefinition): FormDefinition {
  const privacy = typedHttpsUrl(d.privacy_url)
  const gated = d.completion?.gated
  return {
    ...d,
    privacy_url: privacy || undefined,
    completion: { ...d.completion, ...(gated ? { gated: { ...gated, url: typedHttpsUrl(gated.url) } } : {}) },
  }
}

/** Every length a visitor may choose, the default first. */
export function bookingDurations(b: Pick<BookingSettings, "duration" | "durations">): number[] {
  return [b.duration, ...(b.durations || []).filter((n) => n !== b.duration)]
}

export function validateDefinition(raw: unknown, publish = true): FormDefinition {
  if (!raw || typeof raw !== "object") return fail("The form could not be read.")
  const d = raw as Record<string, any>
  const hasBooking = !!d.booking && typeof d.booking === "object"
  if (!Array.isArray(d.fields) || d.fields.length > MAX_FIELDS || (d.fields.length < 1 && !hasBooking))
    return fail(`Use between 1 and ${MAX_FIELDS} questions.`)
  const earlier = new Map<string, FormField>()
  const fields: FormField[] = d.fields.map((r: any) => {
    if (!r || typeof r.id !== "string" || !ID.test(r.id || "") || earlier.has(r.id)) return fail("Every question needs a unique ID.")
    if (!TYPE_IDS.includes(r.type)) return fail("Choose a supported question type.")
    const type = r.type as FieldType
    const label = text(r.label, 300)
    if (publish && !label) return fail("Name each question before publishing.")
    const field: FormField = { id: r.id, type, label, required: r.required === true }
    const description = text(r.description, 500)
    if (description) field.description = description
    const placeholder = text(r.placeholder, 120)
    if (placeholder && !isChoice(type) && !["rating", "consent", "file"].includes(type)) field.placeholder = placeholder
    if (r.new_step === true) field.new_step = true
    if (isChoice(type)) {
      if (!Array.isArray(r.options) || r.options.length < 1 || r.options.length > MAX_OPTIONS)
        return fail(`Choice questions need 1 to ${MAX_OPTIONS} options.`)
      const choices = new Set<string>()
      field.options = r.options.map((o: any) => {
        if (typeof o?.id !== "string" || !ID.test(o?.id || "") || choices.has(o.id)) return fail("Each answer option needs a unique ID.")
        choices.add(o.id)
        const optionLabel = text(o.label, 200)
        if (publish && !optionLabel) return fail("Name each answer option.")
        return {
          id: o.id,
          label: optionLabel,
          ...(typeof o.score === "number" && Number.isFinite(o.score) ? { score: Math.max(-1000, Math.min(1000, Math.round(o.score))) } : {}),
        }
      })
    }
    if (type === "number") {
      if (typeof r.min === "number" && Number.isFinite(r.min)) field.min = r.min
      if (typeof r.max === "number" && Number.isFinite(r.max)) field.max = r.max
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) return fail("A number's minimum is above its maximum.")
    }
    if (type === "rating") field.max = int(r.max, 3, 10, 5)
    if (Array.isArray(r.show_if) && r.show_if.length) {
      if (r.show_if.length > 5) return fail("Use at most 5 visibility rules per question.")
      field.show_if = r.show_if.map((c: unknown) => validateCondition(c, earlier))
    }
    earlier.set(field.id, field)
    return field
  })
  const title = text(d.title, 160)
  if (publish && !title) return fail("Give the form a title before publishing.")
  const consent = text(d.consent_text, 600)
  if (publish && !consent) return fail("Add a consent notice before publishing.")
  const action = d.completion?.action ? normaliseAction(d.completion.action) : undefined
  if (d.completion?.action && !action) return fail("Complete the form’s next action or choose a success message.")
  /* Round AR: judged as it is kept (trimmed), so a field of spaces is no address rather than a refusal. */
  const privacyUrl = typedHttpsUrl(text(d.privacy_url, 2048))
  if (privacyUrl && !/^https:\/\/[^\s]+$/.test(privacyUrl)) return fail("Use an https privacy policy address.")
  const mode = d.mode === "quiz" ? "quiz" : "form"
  const layout = ["single", "steps", "one_by_one"].includes(d.layout) ? d.layout : mode === "quiz" ? "one_by_one" : "single"
  let results: QuizResult[] | undefined
  if (Array.isArray(d.results) && d.results.length) {
    if (d.results.length > 10) return fail("Use at most 10 quiz results.")
    const ids = new Set<string>()
    results = d.results.map((r: any) => {
      if (typeof r?.id !== "string" || !ID.test(r.id) || ids.has(r.id)) return fail("Each quiz result needs a unique ID.")
      ids.add(r.id)
      const min = int(r.min, -100000, 100000, 0),
        max = int(r.max, -100000, 100000, 0)
      if (min > max) return fail("A quiz result’s lowest score is above its highest.")
      const resultTitle = text(r.title, 120)
      if (publish && !resultTitle) return fail("Name each quiz result.")
      const resultAction = r.action ? normaliseAction(r.action) : undefined
      if (r.action && !resultAction) return fail("Complete each quiz result’s button.")
      return { id: r.id, min, max, title: resultTitle, message: text(r.message, 1000), ...(resultAction ? { action: resultAction } : {}) }
    })
  }
  const booking = hasBooking ? validateBooking(d.booking) : undefined
  if (booking && publish && !booking.weekly.length && !booking.overrides?.some((o) => o.windows.length)) return fail("Add at least one availability window.")
  let kind: CompletionKind = ["message", "action", "gated"].includes(d.completion?.kind) ? d.completion.kind : action ? "action" : "message"
  let gated: { url: string; label: string } | undefined
  if (kind === "gated") {
    const url = webUrl(typedHttpsUrl(text(d.completion?.gated?.url, 2048)))
    if (!url || !/^https:\/\//.test(url)) {
      if (publish) return fail("Add the https address visitors get after sending.")
    }
    gated = { url: url && /^https:\/\//.test(url) ? url : "", label: text(d.completion?.gated?.label, 80) || "Open your download" }
  }
  if (kind === "action" && !action) kind = "message"
  return {
    title,
    description: text(d.description, 1000),
    mode,
    layout,
    fields,
    button_text: text(d.button_text, 80) || "Send",
    consent_text: consent,
    privacy_url: privacyUrl || undefined,
    marketing_opt_in: d.marketing_opt_in === true,
    ...(results ? { results } : {}),
    ...(booking ? { booking } : {}),
    completion: {
      kind,
      message: text(d.completion?.message, 1000) || "Thanks. Your answers have been received.",
      ...(action && kind === "action" ? { action } : {}),
      include_answers: d.completion?.include_answers === true,
      ...(gated ? { gated } : {}),
    },
  }
}

/**
 * What a visitor's browser may see before sending: the gated address and
 * the quiz results stay on the server until a response has been kept.
 */
export function publicDefinition(def: FormDefinition): FormDefinition {
  const { results: _results, ...rest } = def
  void _results
  /* A video link is told once a time is booked (the confirmation and its email), never before. */
  const booking = def.booking?.location?.kind === "video" ? { ...def.booking, location: { kind: "video" as const } } : def.booking
  return {
    ...rest,
    ...(booking ? { booking } : {}),
    completion: {
      ...def.completion,
      ...(def.completion.gated ? { gated: { url: "", label: def.completion.gated.label } } : {}),
    },
  }
}

/* ── Conditional visibility and steps, shared by the browser and the server ── */

export type RawValues = Record<string, unknown>

function valueSet(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[]
  if (typeof v === "string") return v.trim() ? [v.trim()] : []
  if (typeof v === "number" && Number.isFinite(v)) return [String(v)]
  if (v === true) return ["yes"]
  return []
}

export function conditionHolds(c: Condition, value: unknown): boolean {
  const values = valueSet(value)
  switch (c.op) {
    case "answered":
      return values.length > 0
    case "empty":
      return values.length === 0
    case "is":
      return values.length === 1 && values[0].toLowerCase() === (c.value || "").toLowerCase()
    case "is_not":
      return !(values.length === 1 && values[0].toLowerCase() === (c.value || "").toLowerCase())
    case "includes":
      return values.some((v) => v.toLowerCase() === (c.value || "").toLowerCase())
    case "gte":
    case "lte": {
      const n = Number(values[0]),
        bound = Number(c.value)
      if (!values.length || !Number.isFinite(n) || !Number.isFinite(bound)) return false
      return c.op === "gte" ? n >= bound : n <= bound
    }
    default:
      return false
  }
}

/** The questions a visitor sees for these answers. A rule on a hidden question reads it as empty. */
export function visibleFields(def: Pick<FormDefinition, "fields">, values: RawValues): FormField[] {
  const shown = new Set<string>()
  const out: FormField[] = []
  for (const field of def.fields) {
    const ok = (field.show_if || []).every((c) => conditionHolds(c, shown.has(c.field) ? values[c.field] : undefined))
    if (ok) {
      shown.add(field.id)
      out.push(field)
    }
  }
  return out
}

/** The visible questions grouped into the steps the visitor goes through. */
export function formSteps(def: Pick<FormDefinition, "fields" | "layout">, values: RawValues): FormField[][] {
  const fields = visibleFields(def, values)
  if (def.layout === "one_by_one") return fields.map((f) => [f])
  if (def.layout !== "steps") return fields.length ? [fields] : []
  const steps: FormField[][] = []
  for (const f of fields) {
    if (!steps.length || f.new_step) steps.push([f])
    else steps[steps.length - 1].push(f)
  }
  return steps
}

/* ── Answers ── */

export type Answer = {
  field_id: string
  label: string
  value: string | string[]
  type: FieldType
  file?: { id: string; name: string; type: string; size: number }
}
export const FILE_REF = /^[0-9a-f]{32}\.[A-Za-z0-9_-]{16,64}$/

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TEXT_MAX: Partial<Record<FieldType, number>> = { text: 500, name: 200, email: 254, phone: 30, textarea: 4000, number: 40, date: 10 }

export function validDate(v: string): boolean {
  const m = DATE.exec(v)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 1900 && +m[1] <= 2200
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
  files: { field_id: string; ref: string }[]
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Your answers could not be read.")
  const input = raw as Record<string, unknown>
  let name: string | null = null,
    email: string | null = null,
    phone: string | null = null,
    score = 0
  const files: { field_id: string; ref: string }[] = []
  /* Hidden questions are dropped whatever was sent for them, and are never required. */
  const answers = visibleFields(def, input).map((field): Answer => {
    const value = input[field.id]
    const label = field.label || "this question"
    let kept: string | string[] = ""
    if (isMulti(field.type)) {
      if (value !== undefined && value !== null && !Array.isArray(value)) return fail(`Choose valid answers for ${label}.`)
      const ids = [...new Set((value || []) as unknown[])]
      if (ids.length > MAX_OPTIONS || ids.some((id) => typeof id !== "string" || !field.options?.some((o) => o.id === id)))
        return fail(`Choose valid answers for ${label}.`)
      kept = field.options!.filter((o) => ids.includes(o.id)).map((o) => {
        score += o.score || 0
        return o.label
      })
    } else if (field.type === "single" || field.type === "dropdown") {
      if (value !== undefined && value !== null && value !== "") {
        const option = typeof value === "string" ? field.options?.find((o) => o.id === value) : undefined
        if (!option) return fail(`Choose a valid answer for ${label}.`)
        kept = option.label
        score += option.score || 0
      }
    } else if (field.type === "rating") {
      if (value !== undefined && value !== null && value !== "") {
        const n = Number(value)
        if (!Number.isInteger(n) || n < 1 || n > (field.max || 5)) return fail(`Choose a rating for ${label}.`)
        kept = String(n)
      }
    } else if (field.type === "consent") {
      if (value === true || value === "yes") kept = "Yes"
      else if (value !== undefined && value !== null && value !== false && value !== "") return fail(`Tick ${label} or leave it.`)
    } else if (field.type === "file") {
      if (value !== undefined && value !== null && value !== "") {
        if (typeof value !== "string" || !FILE_REF.test(value)) return fail(`Upload ${label} again.`)
        files.push({ field_id: field.id, ref: value })
        kept = "file"
      }
    } else {
      if (value !== undefined && value !== null && typeof value !== "string" && typeof value !== "number") return fail(`Enter text for ${label}.`)
      const s = value === undefined || value === null ? "" : String(value)
      const max = TEXT_MAX[field.type] ?? 500
      if (s.length > max + 200) return fail(`${label} is too long.`)
      kept = text(s, max)
    }
    if (field.required && !kept.length) return fail(`Complete ${label}.`)
    if (typeof kept === "string" && kept) {
      if (field.type === "email") {
        if (!EMAIL.test(kept) || kept.length > 254) return fail("Enter a valid email address.")
        email = email ?? kept.toLowerCase()
      }
      if (field.type === "name") name = name ?? kept.slice(0, 200)
      if (field.type === "phone") {
        const digits = kept.replace(/\D/g, "").length
        if (!/^[+\d\s().-]{7,30}$/.test(kept) || digits < 7 || digits > 15) return fail("Enter a valid phone number.")
        phone = phone ?? kept
      }
      if (field.type === "number") {
        const n = Number(kept)
        if (!Number.isFinite(n)) return fail(`Enter a number for ${label}.`)
        if (field.min !== undefined && n < field.min) return fail(`${label} must be at least ${field.min}.`)
        if (field.max !== undefined && n > field.max) return fail(`${label} must be at most ${field.max}.`)
      }
      if (field.type === "date" && !validDate(kept)) return fail(`Enter a valid date for ${label}.`)
    }
    return { field_id: field.id, label: field.label, value: kept, type: field.type }
  })
  return { answers, name, email, phone, score, files }
}

/** The quiz result whose range holds this score, the first that matches. */
export function pickResult(results: QuizResult[] | undefined, score: number): QuizResult | null {
  return (results || []).find((r) => score >= r.min && score <= r.max) || null
}

export function answerText(a: Pick<Answer, "value">): string {
  return Array.isArray(a.value) ? a.value.join(", ") : a.value
}

/**
 * {name}, {email}, {phone}, {score}, {result}, {answers} and any question's
 * ID, filled from a kept response. Control characters other than a line
 * break are removed; encoding for the address is the action's job.
 */
export function fillTemplate(
  template: string,
  input: { answers: Answer[]; name?: string | null; email?: string | null; phone?: string | null; score?: number; result?: string | null },
): string {
  const vars: Record<string, string> = {
    name: input.name || "",
    email: input.email || "",
    phone: input.phone || "",
    score: String(input.score ?? 0),
    result: input.result || "",
    answers: input.answers.filter((a) => a.type !== "file").map((a) => `${a.label}: ${answerText(a)}`).join("\n"),
  }
  for (const a of input.answers) if (a.type !== "file") vars[a.field_id] = answerText(a)
  return template
    .replace(/\{([\w-]{1,64})\}/g, (whole, key: string) => (Object.hasOwn(vars, key) ? vars[key] : whole))
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .slice(0, 4000)
}

export function csvCell(value: unknown): string {
  const s = typeof value === "string" ? value : value === null || value === undefined ? "" : typeof value === "number" ? String(value) : JSON.stringify(value)
  return '"' + guardFormula(s).replace(/"/g, '""') + '"'
}
