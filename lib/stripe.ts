import "server-only"
import Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"

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
 * Validates an existing Stripe customer ID, or creates a new one if it's
 * stale/invalid (e.g. created with test keys but now using live keys).
 * Updates the creators table with the new customer ID if recreated.
 */
export async function getOrCreateStripeCustomer({
  creatorId,
  existingCustomerId,
  email,
  userId,
  username,
}: {
  creatorId: string
  existingCustomerId: string | null
  email: string | undefined
  userId: string
  username: string
}): Promise<string> {
  // If we have a stored customer ID, validate it against the current Stripe keys
  if (existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(existingCustomerId)
      if ((existing as any).deleted) {
        console.warn(
          `Stripe customer ${existingCustomerId} was deleted. Creating new live customer.`
        )
      } else {
        return existingCustomerId // Valid customer, use it
      }
    } catch (err: any) {
      // Customer doesn't exist on current keys (test→live migration, etc.)
      console.warn(
        `Stripe customer ${existingCustomerId} not found (likely test-mode ID). Creating new live customer.`
      )
    }
  }

  // Create a fresh customer on the current (live) keys
  const customer = await stripe.customers.create({
    email,
    metadata: {
      creator_id: creatorId,
      user_id: userId,
      username,
    },
  })

  // Persist the new customer ID. A server owned column: only the service role may write it (run-now part 63).
  await createAdminClient()
    .from("creators")
    .update({ stripe_customer_id: customer.id })
    .eq("id", creatorId)

  return customer.id
}
