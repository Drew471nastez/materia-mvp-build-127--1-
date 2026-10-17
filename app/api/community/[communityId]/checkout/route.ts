import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { loadCommunity, viewerContext } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { checkoutGate } from "@/lib/communities/server/join"
import { communityOptions, communityTrialUsed } from "@/lib/communities/server/plan-checkout"
import { checkoutTermsFor } from "@/lib/communities/server/membership-lifecycle"
import { buyerLocale, withdrawalWaiverApplies } from "@/lib/communities/membership-policy"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * GET /api/community/<communityId>/checkout?plan=<tierId>
 *
 * What the community's own checkout (components/community/public/join-flow.tsx)
 * draws before anybody pays: the plan as the page sells it, who is paying (the
 * signed in account's email and name, so nothing is typed twice), whether
 * this person still gets the plan's free trial (one per community,
 * lib/communities/server/plan-checkout.ts), and the community's refund terms.
 * Paying itself goes through /api/memberships/checkout, which checks all of it
 * again; nothing here grants anything.
 *
 * Answers 401 signed out, and the checkout gate's own refusal (approval
 * needed, already a member, banned) with where to go instead.
 */
export async function GET(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const planId = new URL(request.url).searchParams.get("plan") ?? ""
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const viewer = await viewerContext(db, community, user.id)
  if (viewer.banned) return NextResponse.json({ error: "banned", message: "You can't join this community." }, { status: 403, headers: NO_STORE })
  const options = await communityOptions(db, community)
  const plan = options.find((o) => o.tierId === planId) ?? null
  if (!plan || plan.kind !== "paid" || !plan.checkout || !plan.productId) {
    return NextResponse.json({ error: "plan_unavailable", message: "That plan isn't available. Choose another." }, { status: 409, headers: NO_STORE })
  }
  const gate = await checkoutGate({ id: plan.productId, community_id: community.id }, user.id, db)
  if (gate.refusal) return NextResponse.json({ error: gate.refusal.code, message: gate.refusal.error, url: gate.refusal.url }, { status: gate.refusal.status, headers: NO_STORE })

  const email = (user.email ?? "").trim().toLowerCase()
  const person = { id: user.id, email: email || null, emailConfirmed: Boolean(user.email_confirmed_at || (user as { confirmed_at?: string | null }).confirmed_at) }
  const [used, terms, profile, h] = await Promise.all([
    (plan.trialDays ?? 0) > 0 ? communityTrialUsed(db, community.id, person) : Promise.resolve(false),
    checkoutTermsFor(db, { id: plan.productId, community_id: community.id }).catch(() => null),
    db.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    headers(),
  ])
  const name = String((profile.data as { display_name?: string | null } | null)?.display_name ?? "").trim() || email.split("@")[0]
  return NextResponse.json(
    {
      plan,
      buyer: { email, name },
      trialDays: used ? 0 : plan.trialDays ?? 0,
      trialUsed: used && (plan.trialDays ?? 0) > 0,
      terms: {
        communityName: terms?.communityName ?? community.name ?? "",
        refundPolicy: terms?.refundPolicy ?? null,
        waiver: withdrawalWaiverApplies(h.get("x-vercel-ip-country")),
        locale: buyerLocale(h.get("accept-language")),
      },
    },
    { headers: NO_STORE },
  )
}
