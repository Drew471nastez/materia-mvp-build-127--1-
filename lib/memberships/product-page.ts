import "server-only"

/**
 * What a membership's product page needs beyond any product's: whether its
 * price is per month or per year (the page writes "$9/month"), and, for a
 * signed in member with access, their membership, so the page offers "Open
 * your membership" instead of Join. Read with the service role and checked
 * against the signed in person (lib/memberships/access.ts). Never throws:
 * a product page does not fail over this, it falls back to Join.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { canReadMembership } from "./access"
import { viewerOf } from "./server"

export interface ProductPageMembership {
  interval: "month" | "year"
  memberHref: string | null
  trialDays: number
}

export async function membershipForProductPage(productId: string, user: { id: string; email?: string | null; email_confirmed_at?: string | null } | null): Promise<ProductPageMembership | null> {
  try {
    const admin = createAdminClient()
    const { data: plan } = await admin.from("membership_plans").select("monthly_price_cents, yearly_price_cents, trial_days").eq("product_id", productId).maybeSingle()
    const interval = plan?.monthly_price_cents ? "month" : plan?.yearly_price_cents ? "year" : "month"
    const viewer = viewerOf(user)
    let memberHref: string | null = null
    if (viewer) {
      const access = await canReadMembership(admin, viewer, productId)
      if (access.allowed && access.membership) memberHref = `/account/library/memberships/${access.membership.id}`
    }
    return { interval, memberHref, trialDays: plan?.trial_days ?? 0 }
  } catch {
    return { interval: "month", memberHref: null, trialDays: 0 }
  }
}
