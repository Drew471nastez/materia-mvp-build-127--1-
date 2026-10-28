import "server-only"
import Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkStripeCustomer, resolveStripeCustomer, type CustomerCheck, type CustomerDeps } from "@/lib/billing/stripe-customer"

/*
  MADE ON FIRST USE, NOT WHEN THE FILE LOADS. A build reads every route to collect its page data, and a Preview environment
  without STRIPE_SECRET_KEY failed the whole build there ("Neither apiKey nor config.authenticator provided"). Production,
  where the key is set, behaves exactly as before: the first call makes the client and every call after uses it.
*/
let client: Stripe | null = null
function stripeClient(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY as string)
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
