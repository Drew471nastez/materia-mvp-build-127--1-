import "server-only"
import Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

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
