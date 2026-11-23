import "server-only"
import Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkStripeCustomer, resolveStripeCustomer, type CustomerCheck, type CustomerDeps } from "@/lib/billing/stripe-customer"
import { breakerTransport, StripeCircuitBreaker, STRIPE_MAX_NETWORK_RETRIES, STRIPE_TIMEOUT_MS, type Transport } from "@/lib/stripe/resilience"

/*
  MADE ON FIRST USE, NOT WHEN THE FILE LOADS. A build reads every route to collect its page data, and a Preview environment
  without STRIPE_SECRET_KEY failed the whole build there ("Neither apiKey nor config.authenticator provided"). Production,
  where the key is set, behaves exactly as before: the first call makes the client and every call after uses it.
*/
let client: Stripe | null = null
/*
  ONE BREAKER PER SERVER INSTANCE, kept on globalThis so a dev reload does not
  forget an outage it is in the middle of (lib/stripe/resilience.ts). Each
  attempt is bounded (STRIPE_TIMEOUT_MS, a call's own `timeout` wins), retried
  with the SDK's capped, jittered backoff, and refused at once while Stripe is
  known to be down.
*/
const g = globalThis as unknown as { __storelibStripeBreaker?: StripeCircuitBreaker }
export const stripeBreaker: StripeCircuitBreaker = (g.__storelibStripeBreaker ??= new StripeCircuitBreaker({
  onChange(from, to, snap) {
    const line = `[stripe] breaker ${from} -> ${to}`
    if (to === "open") console.error(line, { failures: snap.consecutiveFailures, cooldownMs: snap.cooldownMs })
    else console.warn(line)
  },
}))
/*
  A STUB STRIPE FOR TESTS. STRIPE_API_BASE points the client at a local
  double (tests/stripe-connect-onboarding.test.ts), as scripts/stripe-test-purchase.mjs
  already does. Honoured only with a test key, so a live key always talks to
  api.stripe.com whatever the environment says.
*/
function stubHost(): { host: string; port: number; protocol: "http" | "https" } | null {
  const base = (process.env.STRIPE_API_BASE ?? "").trim()
  if (!base || !(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_")) return null
  try {
    const u = new URL(base)
    const protocol = u.protocol === "http:" ? "http" : "https"
    return { host: u.hostname, port: Number(u.port) || (protocol === "http" ? 80 : 443), protocol }
  } catch {
    return null
  }
}
function stripeClient(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    timeout: STRIPE_TIMEOUT_MS,
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
    httpClient: breakerTransport(Stripe.createNodeHttpClient() as unknown as Transport, stripeBreaker) as unknown as Stripe.HttpClient,
    ...(stubHost() ?? {}),
  })
  return client
}
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const real = stripeClient()
    const value = Reflect.get(real as object, prop, real)
    return typeof value === "function" ? value.bind(real) : value
  },
})

/**
 * The creator's Stripe customer: the stored one while Stripe says it exists,
 * a new one only when Stripe verifies the stored one is deleted or missing
 * (lib/billing/stripe-customer.ts). A timeout or a Stripe error is thrown,
 * never answered with a replacement customer. For routes that are about to
 * charge or attach a card (checkout, setup, portal, payment method). Reads
 * use `checkStripeCustomer` and never create.
 */
export async function getOrCreateStripeCustomer(args: {
  creatorId: string
  existingCustomerId: string | null
  email: string | undefined
  userId: string
  username: string
}): Promise<string> {
  return resolveStripeCustomer(customerDeps(), args)
}

/** What Stripe says about a stored customer id ("present", "deleted", "missing"). Throws when Stripe could not be asked. */
export async function checkStoredStripeCustomer(id: string): Promise<CustomerCheck> {
  return checkStripeCustomer(customerDeps(), id)
}

function customerDeps(): CustomerDeps {
  return {
    retrieve: (id, options) => stripe.customers.retrieve(id, {}, options) as Promise<{ id: string; deleted?: boolean }>,
    create: (params, options) => stripe.customers.create(params, options),
    async persist(creatorId, expected, next) {
      const admin = createAdminClient()
      /* A server owned column: only the service role may write it (run-now part 63). Only over the id that was checked. */
      let q = admin.from("creators").update({ stripe_customer_id: next }).eq("id", creatorId)
      q = expected ? q.eq("stripe_customer_id", expected) : q.is("stripe_customer_id", null)
      const { data, error } = await q.select("stripe_customer_id")
      if (error) throw new Error(`creators.stripe_customer_id not written: ${error.message}`)
      if (Array.isArray(data) && data.length) return { stored: next }
      const { data: row } = await admin.from("creators").select("stripe_customer_id").eq("id", creatorId).maybeSingle()
      return { stored: (row?.stripe_customer_id as string | null) ?? null }
    },
  }
}
