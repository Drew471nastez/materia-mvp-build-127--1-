import "server-only"

/**
 * ===========================================================================
 *  A COMMUNITY'S OWN CHECKOUT: WHAT THE MODAL NEEDS, AND ONE TRIAL A PERSON
 * ===========================================================================
 * The plan picker and the checkout modal on a community's page (components/
 * community/public/join-flow.tsx) pay through the memberships engine exactly
 * as /checkout does (/api/memberships/checkout, then Stripe.js, then
 * /api/memberships/confirm, with the webhook as the record). What is
 * community specific is read here:
 *
 *   the plan        one of the community's plans on sale now, with its prices
 *                   and trial (the same options the page draws, lib/../public)
 *   the trial       ONE FREE TRIAL PER PERSON PER COMMUNITY. The memberships
 *                   engine gives a trial only on a first membership of that
 *                   product; a community sells each plan through its own
 *                   product, so Standard's trial and then Premium's was two.
 *                   Any membership this person ever had of any of the
 *                   community's plans (archived ones too) ends it.
 *   the terms       the community's refund policy, the EU withdrawal waiver
 *                   where it applies, and the buyer's way of writing money,
 *                   as app/checkout/page.tsx reads them
 */
import { ownerFilter } from "@/lib/memberships/server"
import type { JoinOption } from "@/components/community/public/types"
import type { CommunityRow } from "../types"
import { creatorTakesPayments, optionsFor, readPlans, readProducts, readTiers } from "./public"
import type { Db } from "./db"

export interface Person {
  id: string
  email: string | null
  emailConfirmed: boolean
}

/** Every product that sells or sold one of the community's plans, archived plans included. */
export async function communityPlanProducts(db: Db, communityId: string): Promise<string[]> {
  const { data } = await db.from("community_tiers").select("product_id").eq("community_id", communityId).not("product_id", "is", null).limit(100)
  return [...new Set(((data as { product_id: string | null }[] | null) ?? []).map((r) => r.product_id).filter((x): x is string => !!x))]
}

/** Whether this person already had a membership (a trial included) of any of the community's plans: no second free trial. */
export async function communityTrialUsed(db: Db, communityId: string, person: Person): Promise<boolean> {
  const products = await communityPlanProducts(db, communityId)
  if (products.length === 0) return false
  const { data, error } = await db
    .from("memberships")
    .select("id, status")
    .in("product_id", products)
    .or(ownerFilter({ id: person.id, email: person.email, emailConfirmed: person.emailConfirmed }))
    .neq("status", "incomplete")
    .limit(1)
  /* Unreadable: no trial rather than a second one. */
  if (error) return true
  return (data?.length ?? 0) > 0
}

/** The community's plans as its page sells them, in the creator's order. */
export async function communityOptions(db: Db, community: CommunityRow): Promise<JoinOption[]> {
  const tiers = await readTiers(db, [community.id])
  const productIds = tiers.map((t) => t.product_id).filter(Boolean) as string[]
  const [products, plans, creator] = await Promise.all([
    readProducts(db, productIds),
    readPlans(db, productIds),
    community.creator_id ? db.from("creators").select("stripe_account_id, stripe_onboarding_status, charges_enabled").eq("id", community.creator_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return optionsFor(community.slug, tiers, products, plans, creatorTakesPayments(creator.data))
}
