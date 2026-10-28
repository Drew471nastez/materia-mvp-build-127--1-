/**
 * ===========================================================================
 *  A STRIPE CUSTOMER IS REPLACED ONLY WHEN STRIPE SAYS IT IS GONE
 * ===========================================================================
 * getOrCreateStripeCustomer (lib/stripe.ts) used to create a new customer on
 * any error retrieving the stored one: a timeout or a Stripe outage gave a
 * paying creator a fresh, empty customer, and every read after that found no
 * subscription on it. Now:
 *
 *  - retrieve answers the customer: it is kept.
 *  - retrieve answers `deleted: true`, or fails with 404 resource_missing
 *    (an id from test mode, or removed): verified gone, a new one is made.
 *  - anything else (timeout, connection, 5xx, rate limit, auth): the error
 *    is thrown. Nothing is created and nothing is written.
 *
 * A new customer is created under an idempotency key named after the creator
 * and the id it replaces, so two requests at once make one customer, and the
 * creator's row is only written if it still holds the id that was checked.
 *
 * Reads never create: `checkStripeCustomer` only says what Stripe says.
 */
import { isStripeNotFound, STRIPE_READ_TIMEOUT_MS, withDeadline } from "./subscription-state"

export type CustomerCheck = "present" | "deleted" | "missing"

export interface CustomerDeps {
  retrieve(id: string, options: { timeout: number }): Promise<{ id: string; deleted?: boolean }>
  create(
    params: { email?: string; metadata: Record<string, string> },
    options: { idempotencyKey: string; timeout: number },
  ): Promise<{ id: string }>
  /** Write the new id only where the row still holds `expected`; answer the id the row holds afterwards. */
  persist(creatorId: string, expected: string | null, next: string): Promise<{ stored: string | null }>
  timeoutMs?: number
  warn?: (message: string) => void
}

/** What Stripe says about a stored customer id. Throws when Stripe could not be asked. */
export async function checkStripeCustomer(deps: Pick<CustomerDeps, "retrieve" | "timeoutMs">, id: string): Promise<CustomerCheck> {
  const timeout = deps.timeoutMs ?? STRIPE_READ_TIMEOUT_MS
  try {
    const c = await withDeadline(deps.retrieve(id, { timeout }), timeout + 500, "customers.retrieve")
    return c?.deleted ? "deleted" : "present"
  } catch (error) {
    if (isStripeNotFound(error)) return "missing"
    throw error
  }
}

export async function resolveStripeCustomer(
  deps: CustomerDeps,
  args: { creatorId: string; existingCustomerId: string | null; email: string | undefined; userId: string; username: string },
): Promise<string> {
  const warn = deps.warn ?? ((m: string) => console.warn(m))
  const timeout = deps.timeoutMs ?? STRIPE_READ_TIMEOUT_MS
  const existing = args.existingCustomerId || null
  if (existing) {
    /* Throws on a transient failure: the caller's request fails, and the stored customer is untouched. */
    const state = await checkStripeCustomer(deps, existing)
    if (state === "present") return existing
    warn(`[Stripe] customer ${existing} is ${state} on these keys; creating a replacement for creator ${args.creatorId}`)
  }

  const customer = await deps.create(
    { email: args.email, metadata: { creator_id: args.creatorId, user_id: args.userId, username: args.username } },
    { idempotencyKey: `storelib-creator-customer:${args.creatorId}:${existing ?? "none"}`, timeout: Math.max(timeout, 10_000) },
  )
  const { stored } = await deps.persist(args.creatorId, existing, customer.id)
  if (stored && stored !== customer.id) {
    /* Another request stored a different customer first: that one is the creator's. */
    warn(`[Stripe] creator ${args.creatorId} already holds ${stored}; ${customer.id} was not stored`)
    return stored
  }
  return customer.id
}
