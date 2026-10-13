/**
 * ===========================================================================
 *  WHAT A FLOW IS, IN ONE PLACE
 * ===========================================================================
 * A flow is a trigger, a rule for who may enter, and a list of steps read top
 * to bottom. The builder draws this, the engine (lib/automations/engine.ts)
 * runs it, and both read it through the functions here so they cannot
 * disagree about what a step means.
 *
 *   email       send one email
 *   wait        hold the person here for a while
 *   condition   continue only if something is true; everyone else leaves
 *
 * OLDER FLOWS. Before this, a flow was one email step with its own delay
 * (`config.delay_value` and `config.delay_unit`), and a separate "delay"
 * step type existed on paper. `normalizeSteps` reads both shapes, so a flow
 * saved years ago runs and draws the same as one saved today: an email with
 * a delay becomes a wait followed by that email, with a stable id.
 *
 * Nothing here touches the database or the DOM; it is imported by the
 * builder in the browser and by the engine on the server, and tested alone.
 */

import { fieldProblems } from "./merge-fields"
import { tt } from "@/lib/i18n/text"

export type TriggerType = "new_subscriber" | "purchase" | "first_purchase" | "abandoned_checkout"
export type WaitUnit = "minutes" | "hours" | "days"
export type ConditionCheck = "no_purchase_since_entry" | "purchased_since_entry" | "opened_previous_email" | "not_opened_previous_email"

export interface EmailStep {
  id: string
  type: "email"
  config: { subject: string; body: string; preview_text?: string }
}
export interface WaitStep {
  id: string
  type: "wait"
  config: { amount: number; unit: WaitUnit }
}
export interface ConditionStep {
  id: string
  type: "condition"
  config: { check: ConditionCheck }
}
export type FlowStep = EmailStep | WaitStep | ConditionStep
export type StepType = FlowStep["type"]

/**
 * Who may enter, and how often.
 *
 *   once    a person goes through this flow one time, ever
 *   after   again, but not within `days` of their last time
 *   each    every trigger is its own entry: every order, say
 */
export type EntryRule = { mode: "once" } | { mode: "after"; days: number } | { mode: "each" }

/**
 * Who a flow may email, on top of "not unsubscribed, not bounced":
 *
 *   buyers        anyone the trigger is about. For a purchase flow that is
 *                 every buyer, the way a purchase follow-up has always gone
 *                 out on this platform (lib/email-automation standingOf): a
 *                 note about the order they just placed.
 *   subscribers   only people who agreed to hear from the creator: they
 *                 joined the list, or ticked "Email me news and offers" at
 *                 checkout. Offers and "see what is new" belong here.
 */
export type Audience = "buyers" | "subscribers"

export interface TriggerConfig {
  /** Which template the flow was made from, so the chooser can say "You have this". */
  template?: string
  entry?: EntryRule
  /** Purchase flows only: which products start it. Empty or missing means any. */
  product_ids?: string[]
  /** Purchase flows only. Missing means the template's, or buyers. */
  audience?: Audience
}

export interface FlowRecord {
  id: string
  name: string
  trigger_type: string
  trigger_config?: TriggerConfig | null
  status: string
  steps: unknown
}

/**
 * What can start a flow, each one emitted somewhere real:
 *
 *   new_subscriber       every sign-up route (app/api/subscribe, subscribers,
 *                        website-builder/subscribe, onepage/*)
 *   purchase             every order: a paid checkout (lib/checkout/
 *                        fulfil-payment), a basket (fulfil-cart-session), a
 *                        free claim (app/api/checkout/process, quick-free)
 *   first_purchase       the same moment, when the buyer has no earlier order
 *                        with this creator (engine.ts enroll)
 *   abandoned_checkout   a checkout that reached Pay with an address and had
 *                        no order an hour later (lib/automations/abandoned.ts,
 *                        from the hourly cron). Recorded once
 *                        supabase/sql/RUN_CHECKOUT_CONTACTS.sql has run.
 *
 * `marketing`: the trigger is itself a reason to sell, so only people who
 * agreed to hear from the creator are sent anything, whatever the flow says.
 */
export const TRIGGERS: Record<TriggerType, { name: string; sentence: string; marketing: boolean; purchase: boolean }> = {
  new_subscriber: { name: "Joins your list", get sentence() { return tt("Someone joins your email list") }, marketing: false, purchase: false },
  purchase: { name: "Buys a product", get sentence() { return tt("Someone buys from you") }, marketing: false, purchase: true },
  first_purchase: { name: "First order", get sentence() { return tt("Someone buys from you for the first time") }, marketing: false, purchase: true },
  abandoned_checkout: { name: "Leaves checkout", get sentence() { return tt("Someone starts checkout and does not pay") }, marketing: true, purchase: false },
}

/** The order a person meets them in: joining, checkout, a first order, any order. */
export const TRIGGER_ORDER: TriggerType[] = ["new_subscriber", "abandoned_checkout", "first_purchase", "purchase"]

export function isTriggerType(v: unknown): v is TriggerType {
  return v === "new_subscriber" || v === "purchase" || v === "first_purchase" || v === "abandoned_checkout"
}

/** A flow about an order: which products start it can be chosen. */
export function isPurchaseTrigger(t: TriggerType): boolean {
  return TRIGGERS[t].purchase
}

/** Templates whose emails sell rather than serve an order, for a flow that never chose. */
const SELLING_TEMPLATES = new Set(["win_back"])

/**
 * Who this flow may email. A trigger that is a reason to sell (a checkout
 * left behind) is subscribers only, always. A purchase flow says, and one
 * that never said is what its template was made for. Everything else is
 * the people the trigger is about.
 */
export function audienceOf(trigger: TriggerType, config: TriggerConfig | null | undefined): Audience {
  if (TRIGGERS[trigger].marketing) return "subscribers"
  if (!isPurchaseTrigger(trigger)) return "buyers"
  if (config?.audience === "subscribers" || config?.audience === "buyers") return config.audience
  return config?.template && SELLING_TEMPLATES.has(config.template) ? "subscribers" : "buyers"
}

/** `phrase` finishes "Continue only if ...". `short` is the check in a list of steps. */
export const CONDITIONS: Record<ConditionCheck, { label: string; phrase: string; short: string; needsEmailBefore: boolean }> = {
  no_purchase_since_entry: { get label() { return tt("Has not bought anything since entering") }, get phrase() { return tt("they have not bought anything since entering") }, get short() { return tt("only if they have not bought since") }, needsEmailBefore: false },
  purchased_since_entry: { get label() { return tt("Has bought something since entering") }, get phrase() { return tt("they have bought something since entering") }, get short() { return tt("only if they bought since") }, needsEmailBefore: false },
  opened_previous_email: { get label() { return tt("Opened the email before this") }, get phrase() { return tt("they opened the email before this") }, get short() { return tt("only if they opened it") }, needsEmailBefore: true },
  not_opened_previous_email: { get label() { return tt("Did not open the email before this") }, get phrase() { return tt("they did not open the email before this") }, get short() { return tt("only if they did not open it") }, needsEmailBefore: true },
}

export function isConditionCheck(v: unknown): v is ConditionCheck {
  return typeof v === "string" && v in CONDITIONS
}

export const MAX_STEPS = 20
export const MAX_WAIT_DAYS = 365
export const MAX_SUBJECT = 200
export const MAX_BODY = 100_000

const UNIT_MS: Record<WaitUnit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }

export function waitMs(step: Pick<WaitStep, "config">): number {
  const amount = Number.isFinite(step.config.amount) ? Math.max(0, step.config.amount) : 0
  return amount * (UNIT_MS[step.config.unit] ?? UNIT_MS.days)
}

/** "3 days", "1 hour", "45 minutes". */
export function waitText(step: Pick<WaitStep, "config">): string {
  const n = step.config.amount
  const unit = step.config.unit
  /* One whole message per unit, so each language can bend its own word. */
  if (unit === "minutes") return tt("{n, plural, one {# minute} other {# minutes}}", { n })
  if (unit === "hours") return tt("{n, plural, one {# hour} other {# hours}}", { n })
  return tt("{n, plural, one {# day} other {# days}}", { n })
}

function asUnit(v: unknown): WaitUnit {
  return v === "minutes" || v === "hours" || v === "days" ? v : "days"
}

function asAmount(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Any stored shape, as today's list of steps. Unknown step types are dropped
 * rather than guessed at. The order is the stored `order` when every step
 * has one, and the array's order otherwise.
 */
export function normalizeSteps(raw: unknown): FlowStep[] {
  if (!Array.isArray(raw)) return []
  const items = raw.filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
  const ordered = items.every((s) => typeof s.order === "number") ? [...items].sort((a, b) => (a.order as number) - (b.order as number)) : items
  const out: FlowStep[] = []
  const seen = new Set<string>()
  const idOf = (s: Record<string, unknown>, i: number) => {
    let id = typeof s.id === "string" && s.id.trim() ? s.id.trim().slice(0, 64) : `step_${i}`
    while (seen.has(id)) id = `${id}_`
    seen.add(id)
    return id
  }
  ordered.forEach((s, i) => {
    const config = (s.config && typeof s.config === "object" ? s.config : {}) as Record<string, unknown>
    if (s.type === "email") {
      const id = idOf(s, i)
      /* The old shape: a delay that belonged to the email. */
      const legacyDelay = asAmount(config.delay_value)
      if (legacyDelay > 0) {
        const waitId = `${id}_wait`
        seen.add(waitId)
        out.push({ id: waitId, type: "wait", config: { amount: legacyDelay, unit: config.delay_unit === "days" || config.delay_unit === "hours" ? config.delay_unit : "minutes" } })
      }
      out.push({
        id,
        type: "email",
        config: {
          subject: typeof config.subject === "string" ? config.subject : "",
          body: typeof config.body === "string" ? config.body : "",
          ...(typeof config.preview_text === "string" && config.preview_text ? { preview_text: config.preview_text } : {}),
        },
      })
    } else if (s.type === "wait" || s.type === "delay") {
      const amount = s.type === "wait" ? asAmount(config.amount) : asAmount(config.delay_value)
      const unit = s.type === "wait" ? asUnit(config.unit) : config.delay_unit === "days" || config.delay_unit === "hours" ? config.delay_unit : "minutes"
      out.push({ id: idOf(s, i), type: "wait", config: { amount, unit } })
    } else if (s.type === "condition") {
      const check = isConditionCheck(config.check) ? config.check : "no_purchase_since_entry"
      out.push({ id: idOf(s, i), type: "condition", config: { check } })
    }
  })
  return out
}

/** The steps as they are saved: today's shape, nothing else. */
export function serializeSteps(steps: FlowStep[]): FlowStep[] {
  return steps.map((s) => {
    if (s.type === "email") {
      return { id: s.id, type: "email", config: { subject: s.config.subject, body: s.config.body, ...(s.config.preview_text ? { preview_text: s.config.preview_text } : {}) } }
    }
    if (s.type === "wait") return { id: s.id, type: "wait", config: { amount: asAmount(s.config.amount), unit: asUnit(s.config.unit) } }
    return { id: s.id, type: "condition", config: { check: s.config.check } }
  })
}

export function defaultEntry(trigger: TriggerType): EntryRule {
  if (trigger === "purchase") return { mode: "each" }
  if (trigger === "first_purchase") return { mode: "once" }
  if (trigger === "abandoned_checkout") return { mode: "after", days: 7 }
  return { mode: "after", days: 30 }
}

/** The stored rule, checked; the trigger's default when there is none or it makes no sense. */
export function entryRule(trigger: TriggerType, config: TriggerConfig | null | undefined): EntryRule {
  /* A first order happens once; any other rule would be a promise it cannot keep. */
  if (trigger === "first_purchase") return { mode: "once" }
  const e = config?.entry as Record<string, unknown> | undefined
  if (e?.mode === "once") return { mode: "once" }
  if (e?.mode === "each" && trigger === "purchase") return { mode: "each" }
  if (e?.mode === "after") {
    const days = asAmount(e.days)
    if (days >= 1 && days <= MAX_WAIT_DAYS) return { mode: "after", days }
  }
  return defaultEntry(trigger)
}

export function entryText(trigger: TriggerType, rule: EntryRule): string {
  if (trigger === "first_purchase") return tt("Their first order only")
  if (rule.mode === "once") return tt("Once per person")
  if (rule.mode === "each") return trigger === "purchase" ? tt("Every order") : tt("Every time")
  return tt("Again after {days, plural, one {# day} other {# days}}", { days: rule.days })
}

/**
 * The key two triggers for the same entry share, so the database's unique
 * index turns the second into nothing. The engine adds the time window for
 * "after" under a lock (see supabase/sql/RUN_EMAIL_AUTOMATIONS.sql,
 * enroll_email_flow); the day in the key is only there so a person can have
 * more than one entry over time at all.
 */
export function dedupeKey(rule: EntryRule, input: { email: string; eventId?: string | null; now: number }): string {
  const email = input.email.trim().toLowerCase()
  if (rule.mode === "each" && input.eventId) return `event:${input.eventId}`
  if (rule.mode === "after") return `contact:${email}:${new Date(input.now).toISOString().slice(0, 10)}`
  return `contact:${email}`
}

/** The step after this one, or null at the end. */
export function stepAfter(steps: FlowStep[], id: string): FlowStep | null {
  const i = steps.findIndex((s) => s.id === id)
  return i >= 0 && i + 1 < steps.length ? steps[i + 1] : null
}

/**
 * The step a job points at, when the flow may have been edited since the job
 * was queued: the step itself if it is still there; if it was removed, the
 * one that now follows the step before it; null when neither can be found.
 *
 * A job with no step before it is a run's first (enroll_email_flow writes it
 * with none). Its step removed, what stands in its place is the flow's first
 * step now. It used to be nothing: the run was ended as "the rest of the
 * flow was removed" while the rest was all still there, so somebody waiting
 * on a welcome whose first email was being retried got none of the series
 * when the creator took that first email out.
 */
export function resolveStep(steps: FlowStep[], stepId: string, afterStepId: string | null | undefined): FlowStep | null {
  const own = steps.find((s) => s.id === stepId)
  if (own) return own
  if (afterStepId) return stepAfter(steps, afterStepId)
  return steps[0] ?? null
}

/** The email step before this one, for "opened the email before this". */
export function emailBefore(steps: FlowStep[], id: string): EmailStep | null {
  const i = steps.findIndex((s) => s.id === id)
  for (let j = i - 1; j >= 0; j--) {
    const s = steps[j]
    if (s.type === "email") return s
  }
  return null
}

/* ─── Checking a flow before it can be turned on ────────────────────── */

export interface Problem {
  stepId: string | null
  message: string
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()

/**
 * What stops this flow from sending properly, in the creator's words, one
 * line per problem. An empty list means it can be turned on.
 */
export function problemsOf(trigger: string, steps: FlowStep[], opts: { fields?: boolean } = {}): Problem[] {
  const checkFields = opts.fields !== false
  const out: Problem[] = []
  if (!isTriggerType(trigger)) out.push({ stepId: null, message: tt("Choose what starts this flow.") })
  if (steps.length === 0) out.push({ stepId: null, message: tt("Add at least one email.") })
  if (steps.length > MAX_STEPS) out.push({ stepId: null, message: tt("A flow can have up to {maxSteps} steps.", { maxSteps: MAX_STEPS }) })
  if (steps.length > 0 && !steps.some((s) => s.type === "email")) out.push({ stepId: null, message: tt("Add at least one email. Without one this flow sends nothing.") })
  steps.forEach((s, i) => {
    if (s.type === "email") {
      if (!s.config.subject.trim()) out.push({ stepId: s.id, message: tt("Email {count} needs a subject.", { count: emailNumber(steps, s.id) }) })
      else if (s.config.subject.length > MAX_SUBJECT) out.push({ stepId: s.id, message: tt("Email {count} has a subject over {maxSubject} characters.", { count: emailNumber(steps, s.id), maxSubject: MAX_SUBJECT }) })
      if (!textOf(s.config.body) && !/<img\b/i.test(s.config.body)) out.push({ stepId: s.id, message: tt("Email {count} is empty.", { count: emailNumber(steps, s.id) }) })
      if (s.config.body.length > MAX_BODY) out.push({ stepId: s.id, message: tt("Email {count} is too long to send.", { count: emailNumber(steps, s.id) }) })
      if (checkFields && isTriggerType(trigger)) {
        for (const p of fieldProblems(`${s.config.subject} ${s.config.preview_text ?? ""} ${s.config.body}`, trigger)) {
          out.push({ stepId: s.id, message: tt("Email {count}: {p}", { count: emailNumber(steps, s.id), p }) })
        }
      }
    } else if (s.type === "wait") {
      if (!(s.config.amount >= 1)) out.push({ stepId: s.id, message: tt("A wait needs a length of at least 1.") })
      else if (waitMs(s) > MAX_WAIT_DAYS * UNIT_MS.days) out.push({ stepId: s.id, message: tt("A wait can be up to {maxWaitDays} days.", { maxWaitDays: MAX_WAIT_DAYS }) })
    } else if (s.type === "condition") {
      if (CONDITIONS[s.config.check].needsEmailBefore && !emailBefore(steps, s.id)) {
        out.push({ stepId: s.id, message: tt("This check looks at the email before it, and there is none.") })
      }
      if (i === steps.length - 1) out.push({ stepId: s.id, message: tt("A check at the end does nothing. Add an email after it, or remove it.") })
    }
  })
  const last = steps[steps.length - 1]
  if (last && last.type === "wait") out.push({ stepId: last.id, message: tt("A wait at the end does nothing. Add an email after it, or remove it.") })
  return out
}

/** "1" for the first email step, "2" for the second. */
export function emailNumber(steps: FlowStep[], id: string): number {
  let n = 0
  for (const s of steps) {
    if (s.type === "email") n++
    if (s.id === id) return n
  }
  return n
}

/* ─── What will happen, in words ────────────────────────────────────── */

/**
 * The flow read aloud, one line per step, with the time it happens counted
 * from the trigger: "Right away: Welcome to the studio", "After 3 days: ...".
 */
export function timeline(steps: FlowStep[]): Array<{ stepId: string; when: string; what: string }> {
  let elapsed = 0
  const out: Array<{ stepId: string; when: string; what: string }> = []
  for (const s of steps) {
    if (s.type === "wait") {
      elapsed += waitMs(s)
      continue
    }
    const when = elapsed === 0 ? tt("Right away") : tt("After {elapsed}", { elapsed: durationText(elapsed) })
    if (s.type === "email") out.push({ stepId: s.id, when, what: `Email: ${s.config.subject.trim() || tt("No subject yet")}` })
    else out.push({ stepId: s.id, when, what: tt("Only if {phrase}", { phrase: CONDITIONS[s.config.check].phrase }) })
  }
  return out
}

export function durationText(ms: number): string {
  const days = ms / UNIT_MS.days
  if (days >= 1 && Number.isInteger(days)) return `${days} day${days === 1 ? "" : "s"}`
  const hours = ms / UNIT_MS.hours
  if (hours >= 1 && Number.isInteger(hours)) return `${hours} hour${hours === 1 ? "" : "s"}`
  const minutes = Math.round(ms / UNIT_MS.minutes)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const d = Math.floor(h / 24)
  if (d > 0) return tt("{d, plural, one {# day} other {# days}} {value} h", { d, value: h % 24 })
  return tt("{h} h {m} min", { h, m })
}

/** The steps as words, in order: "Email, wait 3 days, email". */
export function stepsText(steps: FlowStep[]): string {
  const words = steps.map((s) => (s.type === "email" ? "email" : s.type === "wait" ? tt("wait {s}", { s: waitText(s) }) : CONDITIONS[s.config.check].short))
  const text = words.join(", ")
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : tt("No steps yet")
}

/** "2 emails over 3 days", "1 email". */
export function stepSummary(steps: FlowStep[]): string {
  const emails = steps.filter((s) => s.type === "email").length
  const total = steps.reduce((sum, s) => sum + (s.type === "wait" ? waitMs(s) : 0), 0)
  const e = `${emails} email${emails === 1 ? "" : "s"}`
  return total > 0 && emails > 1 ? tt("{e} over {total}", { e, total: durationText(total) }) : total > 0 ? tt("{e} after {total}", { e, total: durationText(total) }) : e
}

/* ─── New steps ─────────────────────────────────────────────────────── */

export function newStepId(): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `s_${Date.now().toString(36)}_${rnd}`
}

export function blankStep(type: StepType, id = newStepId()): FlowStep {
  if (type === "email") return { id, type, config: { subject: "", body: "" } }
  if (type === "wait") return { id, type, config: { amount: 1, unit: "days" } }
  return { id, type, config: { check: "no_purchase_since_entry" } }
}
