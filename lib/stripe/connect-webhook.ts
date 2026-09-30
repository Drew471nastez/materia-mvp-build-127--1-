import "server-only"

import type Stripe from "stripe"
import { syncStripeAccount } from "@/lib/payments/stripe/connect"
import { createClient } from "@supabase/supabase-js"
import { emit } from "@/lib/notify/outbox"
import { createHash } from "node:crypto"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function payoutMethodFacts(ext: Stripe.ExternalAccount): Record<string, unknown> {
  return {
    externalAccountId: ext.id,
    kind: ext.object === "card" ? "card" : "bank_account",
    bankName: (ext as Stripe.BankAccount).bank_name || (ext as Stripe.Card).brand || null,
    last4: (ext as Stripe.BankAccount).last4 || (ext as Stripe.Card).last4 || null,
    currency: ext.currency || null,
    country: (ext as Stripe.BankAccount).country || null,
  }
}

/** Connected-account webhook events (event.account must be set). */
export async function handleConnectAccountEvent(event: Stripe.Event): Promise<void> {
  const accountId = typeof event.account === "string" ? event.account : null
  if (!accountId) return

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    const { data: creator } = await supabaseAdmin.from("creators").select("id, user_id, payouts_enabled").eq("stripe_account_id", account.id).maybeSingle()
    if (!creator) return

    const previousPayoutsEnabled = (creator as { payouts_enabled?: boolean }).payouts_enabled ?? false
    await syncStripeAccount(creator.id as string, "webhook")

    const userId = (creator as { user_id?: string }).user_id ?? null
    try {
      await (await import("@/lib/notifications/events")).noteStripeAccount(creator.id as string, account as any)
    } catch {
      /* optional */
    }

    const requirements = account.requirements
    const pastDue = requirements?.past_due ?? []
    const currentlyDue = requirements?.currently_due ?? []
    const due = [...new Set([...pastDue, ...currentlyDue])].sort()
    const payoutsEnabled = !!account.payouts_enabled
    const paused = previousPayoutsEnabled && !payoutsEnabled
    const deadline = requirements.current_deadline ?? null

    if (paused || (due.length > 0 && account.details_submitted)) {
      const asked = createHash("sha256").update(`${due.join(",")}|${deadline ?? ""}`).digest("hex").slice(0, 16)
      await emit({
        name: paused ? "payout.paused" : "payout.action_required",
        key: paused ? `payout:paused:${account.id}` : `payout:req:${asked}`,
        userId,
        creatorId: creator.id as string,
        entityType: "payment_setup",
        entityId: creator.id as string,
        correlationId: event.id,
        payload: { dueCount: due.length },
      })
    }
    return
  }

  if (event.type === "account.external_account.created" || event.type === "account.external_account.updated") {
    const ext = event.data.object as Stripe.ExternalAccount
    const connectedAccountId = event.account as string
    if (!connectedAccountId || !ext?.id) return

    const previous = (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes || {}
    const becameDefault =
      event.type === "account.external_account.updated" && previous.default_for_currency === false && (ext as Stripe.BankAccount).default_for_currency === true
    if (event.type === "account.external_account.updated" && !becameDefault) return

    const { data: creator } = await supabaseAdmin.from("creators").select("id, user_id").eq("stripe_account_id", connectedAccountId).maybeSingle()
    if (!creator) return

    await syncStripeAccount(creator.id as string, "webhook")

    await emit({
      name: becameDefault ? "payout_method.changed" : "payout_method.added",
      key: `payout_method:${ext.id}`,
      userId: (creator as { user_id?: string }).user_id ?? null,
      creatorId: creator.id as string,
      entityType: "payment_setup",
      entityId: creator.id as string,
      correlationId: event.id,
      payload: payoutMethodFacts(ext),
    })
  }
}
