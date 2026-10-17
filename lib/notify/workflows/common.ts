/**
 * ===========================================================================
 *  WHAT EVERY WORKFLOW SHARES
 * ===========================================================================
 * A workflow reads one event and says which notifications it plans and which
 * pending ones it cancels. It never reads the database: whatever it needs is
 * in the event or the context, and whatever must still be true at send time
 * is a named condition the worker checks then.
 *
 * The idempotency key of a job is
 *
 *   <type>:<recipient>:<entity>:<step>
 *
 * where the step is "once" for something said once in a lifetime (the
 * welcome, the first sale), a workflow step ("day_1") for a reminder, and the
 * event's own key for something that can truly happen again (a payout, a
 * password change). A second copy of the same event plans the same keys, and
 * notification_jobs keeps one of each.
 */
import { REGISTRY } from "../registry"
import type { DomainEvent, EntityType, NotificationType, PlannedJob, RecipientType } from "../types"

export interface WorkflowContext {
  now: number
  /** The Storelib user a creator notification goes to, resolved from the creator when the event had none. */
  userId: string | null
  creatorId: string | null
}

export interface CancelRequest {
  workflow: string
  recipientUserId: string
  reason: string
}

export interface Plan {
  jobs: PlannedJob[]
  cancel: CancelRequest[]
}

export type Workflow = (event: DomainEvent, ctx: WorkflowContext) => Plan | null

export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS

/** Workflows whose pending jobs are cancelled together. */
export const WORKFLOWS = {
  onboardingProduct: "onboarding_product",
  onboardingPayment: "onboarding_payment",
  /* Payout setup begun and left unfinished (unfinished.ts). Its own name, so connecting Stripe can cancel it and the
     "you have not started" reminders together, and so starting can cancel those without cancelling itself. */
  payoutSetup: "payout_setup",
  /* Getting started with steps left (unfinished.ts). */
  storeSetup: "store_setup",
  /* Selling physical products begun and not ready for an order (unfinished.ts). */
  physicalSetup: "physical_setup",
  /* Physical products on sale with a blocking gap (physical.ts). */
  physicalReadiness: "physical_readiness",
  /* Stripe still asking for details (unfinished.ts). */
  verification: "verification",
} as const

/** Text a person wrote to be read whole: a community owner's own email (round AG, COMMUNITY_BROADCAST). */
const LONG_TEXT_KEYS = new Set(["message"])

const SECRET_KEY = /token|secret|password|authorization|signature|api[_-]?key|iban|account[_-]?number|routing|cvc/i

/**
 * The facts a template may read (lib/notify/templates/catalog.ts DATA_KEYS),
 * from an event's payload: strings, numbers and booleans only, short, and
 * never a field whose name says it is secret. Two exceptions, on purpose:
 * receiptToken, the buyer's own receipt link the receipt template needs, and
 * a card or bank "last4", kept only when it is exactly four digits.
 */
export function safeData(payload: Record<string, unknown> | null | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...(payload ?? {}), ...extra })) {
    if (SECRET_KEY.test(k) && k !== "receiptToken") continue
    if (/last4$/i.test(k)) {
      if (typeof v === "string" && /^\d{4}$/.test(v)) out[k] = v
      continue
    }
    if (typeof v === "string") out[k] = v.slice(0, LONG_TEXT_KEYS.has(k) ? 4000 : 500)
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v
    else if (typeof v === "boolean") out[k] = v
    else if (v === null) out[k] = null
  }
  return out
}

export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

export interface JobOptions {
  recipientType?: RecipientType
  recipientUserId?: string | null
  recipientEmail?: string | null
  entityType?: EntityType | null
  entityId?: string | null
  /** "once", a workflow step, or omitted for the event's own key. */
  step?: string | null
  workflow?: string | null
  delayMs?: number
  /** From the run time. */
  expiresInMs?: number | null
  data?: Record<string, unknown>
}

export function job(type: NotificationType, event: DomainEvent, ctx: WorkflowContext, o: JobOptions = {}): PlannedJob | null {
  const entry = REGISTRY[type]
  const recipientType = o.recipientType ?? entry.recipient
  const recipientUserId = o.recipientUserId !== undefined ? o.recipientUserId : recipientType === "creator" ? ctx.userId : null
  const recipientEmail = o.recipientEmail ? o.recipientEmail.trim().toLowerCase() : null
  if (recipientType === "creator" && !recipientUserId) return null
  if (recipientType === "customer" && !recipientEmail) return null
  const entityType = o.entityType !== undefined ? o.entityType : event.entityType ?? null
  const entityId = o.entityId !== undefined ? o.entityId : event.entityId ?? null
  const runAt = ctx.now + Math.max(0, o.delayMs ?? 0)
  const who = recipientUserId ? `u:${recipientUserId}` : `e:${recipientEmail}`
  const step = o.step ?? null
  const key = `${type}:${who}:${entityId ?? "-"}:${step ?? event.key}`
  return {
    type,
    recipientType,
    recipientUserId,
    recipientEmail,
    creatorId: ctx.creatorId,
    entityType,
    entityId,
    idempotencyKey: key,
    step,
    workflow: o.workflow ?? null,
    runAt: new Date(runAt).toISOString(),
    expiresAt: o.expiresInMs ? new Date(runAt + o.expiresInMs).toISOString() : null,
    data: safeData(event.payload, { occurredAt: event.occurredAt, ...(o.data ?? {}) }),
  }
}

export function plan(jobs: (PlannedJob | null)[], cancel: CancelRequest[] = []): Plan {
  return { jobs: jobs.filter((j): j is PlannedJob => j !== null), cancel }
}

export function cancelFor(ctx: WorkflowContext, workflow: string, reason: string): CancelRequest[] {
  return ctx.userId ? [{ workflow, recipientUserId: ctx.userId, reason }] : []
}
