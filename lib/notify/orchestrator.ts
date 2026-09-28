/**
 * ===========================================================================
 *  FROM ONE EVENT TO THE NOTIFICATIONS IT MEANS
 * ===========================================================================
 * handle() runs every workflow over the event and collects what they plan and
 * cancel. Pure: the same event and context always give the same jobs with
 * the same idempotency keys, which is what lets an event be handled twice
 * (a crash after planning, a lease that ran out) and still leave one job per
 * notification in notification_jobs.
 *
 * An event no workflow cares about (user.created, product.updated,
 * store.updated) plans nothing.
 */
import type { DomainEvent, PlannedJob } from "./types"
import type { CancelRequest, Workflow, WorkflowContext } from "./workflows/common"
import { customer } from "./workflows/customer"
import { memberships } from "./workflows/memberships"
import { domains } from "./workflows/domains"
import { onboarding } from "./workflows/onboarding"
import { payments } from "./workflows/payments"
import { payouts } from "./workflows/payouts"
import { products } from "./workflows/products"
import { sales } from "./workflows/sales"
import { security } from "./workflows/security"
import { subscriptions } from "./workflows/subscriptions"
import { unfinished } from "./workflows/unfinished"

export type { CancelRequest, WorkflowContext }

export const WORKFLOW_LIST: readonly Workflow[] = [onboarding, unfinished, products, payments, payouts, sales, customer, memberships, subscriptions, domains, security]

export interface HandleResult {
  jobs: PlannedJob[]
  cancel: CancelRequest[]
}

export function handle(event: DomainEvent, ctx: WorkflowContext): HandleResult {
  const jobs: PlannedJob[] = []
  const cancel: CancelRequest[] = []
  const seen = new Set<string>()
  for (const workflow of WORKFLOW_LIST) {
    const planned = workflow(event, ctx)
    if (!planned) continue
    for (const j of planned.jobs) {
      if (seen.has(j.idempotencyKey)) continue
      seen.add(j.idempotencyKey)
      jobs.push(j)
    }
    cancel.push(...planned.cancel)
  }
  return { jobs, cancel }
}
