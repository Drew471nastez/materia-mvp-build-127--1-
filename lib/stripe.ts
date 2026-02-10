import "server-only"
import Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"

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
  const supabase = await createClient()

  const persistCustomerId = async (customerId: string) => {
    await supabase.from("creators").update({ stripe_customer_id: customerId }).eq("id", creatorId)
  }

  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId)
      if (!(customer as any).deleted) {
        return existingCustomerId
      }
    } catch {
      console.warn(`Stripe customer ${existingCustomerId} is invalid for current keyspace, attempting recovery by email.`)
    }
  }

  if (email) {
    const existingByEmail = await stripe.customers.list({ email, limit: 10 })
    if (existingByEmail.data.length > 0) {
      const ranked = await Promise.all(existingByEmail.data.map(async (customer) => {
        const subs = await stripe.subscriptions.list({ customer: customer.id, limit: 5 })
        const hasSubscribedState = subs.data.some((sub) => ["active", "trialing", "past_due"].includes(sub.status))
        const pms = await stripe.paymentMethods.list({ customer: customer.id, type: "card", limit: 1 })
        return { customerId: customer.id, score: (hasSubscribedState ? 100 : 0) + (pms.data.length > 0 ? 10 : 0) }
      }))

      ranked.sort((a, b) => b.score - a.score)
      if (ranked[0]?.customerId) {
        await persistCustomerId(ranked[0].customerId)
        return ranked[0].customerId
      }
    }
  }

  const customer = await stripe.customers.create({
    email,
    metadata: {
      creator_id: creatorId,
      user_id: userId,
      username,
    },
  })

  await persistCustomerId(customer.id)
  return customer.id
}
