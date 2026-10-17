import "server-only"

import { paymentUxStateOf, snapshotFromCreatorRow } from "@/lib/payments/stripe/facts"
import { fetchStripeBalances, maskExternalAccount, readCreatorStripe, syncStripeAccount } from "@/lib/payments/stripe/connect"
import { getStorelibPaymentsStatus, statusFactsOf } from "@/lib/payments/stripe/status"
import { canAcceptPayments, sellerFactsOfAccount } from "@/lib/payments/stripe/readiness"
import { stripe } from "@/lib/stripe"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const CREATOR_COLS =
  "id, slug, display_name, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, details_submitted, stripe_requirements, stripe_connected_at, stripe_requirements_updated_at"

export async function listPaymentAccounts(db: Db, q: string | null, page: number, pageSize = 25) {
  let query = db.from("creators").select(CREATOR_COLS, { count: "exact" }).not("stripe_account_id", "is", null).order("created_at", { ascending: false })
  if (q?.trim()) {
    const t = q.trim()
    if (/^[0-9a-f-]{36}$/i.test(t)) query = query.or(`id.eq.${t},stripe_account_id.eq.${t}`)
    else query = query.or(`slug.ilike.%${t}%,display_name.ilike.%${t}%`)
  }
  const from = (Math.max(1, page) - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) return { ok: false as const, error: "Could not list accounts." }

  const rows = (data ?? []).map((c: Record<string, unknown>) => {
    const snap = snapshotFromCreatorRow(c as Parameters<typeof snapshotFromCreatorRow>[0])
    return {
      id: String(c.id),
      label: String(c.display_name || c.slug || c.id),
      stripeAccountId: c.stripe_account_id,
      storelibState: paymentUxStateOf(snap),
      chargesEnabled: snap.chargesEnabled,
      payoutsEnabled: snap.payoutsEnabled,
      kycSubmitted: snap.detailsSubmitted,
      actionRequired: paymentUxStateOf(snap) === "ACTION_REQUIRED",
      lastSync: c.stripe_requirements_updated_at ?? c.stripe_connected_at,
    }
  })

  return { ok: true as const, rows, total: count ?? rows.length, page }
}

export async function getPaymentAccountDetail(db: Db, creatorId: string) {
  const { data: creator, error } = await db.from("creators").select(CREATOR_COLS).eq("id", creatorId).maybeSingle()
  if (error || !creator) return { ok: false as const, error: "Creator not found." }
  if (!creator.stripe_account_id) return { ok: false as const, error: "No connected account." }

  const snap = snapshotFromCreatorRow(creator)
  let stripeAccount: Record<string, unknown> | null = null
  let balances: Array<{ currency: string; availableMinor: number; pendingMinor: number }> = []
  let bankMasked: { bankName: string | null; last4: string | null; country: string | null } | null = null
  let recentPayouts: unknown[] = []
  let recentPayments: unknown[] = []
  let live: Awaited<ReturnType<typeof stripe.accounts.retrieve>> | null = null

  if (process.env.STRIPE_SECRET_KEY?.trim()) {
    try {
      const acct = await stripe.accounts.retrieve(creator.stripe_account_id)
      live = acct
      stripeAccount = {
        id: acct.id,
        charges_enabled: acct.charges_enabled,
        payouts_enabled: acct.payouts_enabled,
        details_submitted: acct.details_submitted,
        disabled_reason: acct.requirements?.disabled_reason ?? null,
        business_type: acct.business_type,
        capabilities: acct.capabilities,
        requirements: {
          currently_due: acct.requirements?.currently_due ?? [],
          eventually_due: acct.requirements?.eventually_due ?? [],
          past_due: acct.requirements?.past_due ?? [],
          pending_verification: acct.requirements?.pending_verification ?? [],
        },
      }
      balances = await fetchStripeBalances(creator.stripe_account_id)
      const ext = await stripe.accounts.listExternalAccounts(creator.stripe_account_id, { object: "bank_account", limit: 1 })
      const masked = ext.data[0] ? maskExternalAccount(ext.data[0]) : null
      bankMasked = masked ? { bankName: masked.bankName, last4: masked.last4, country: masked.country } : null
      const payouts = await stripe.payouts.list({ limit: 8 }, { stripeAccount: creator.stripe_account_id })
      recentPayouts = payouts.data.map((p) => ({
        id: p.id,
        amountMinor: p.amount,
        currency: p.currency,
        status: p.status,
        arrival: p.arrival_date,
        created: p.created,
      }))
      const charges = await stripe.charges.list({ limit: 8 }, { stripeAccount: creator.stripe_account_id })
      recentPayments = charges.data.map((ch) => ({
        id: ch.id,
        amountMinor: ch.amount,
        currency: ch.currency,
        status: ch.status,
        created: ch.created,
      }))
    } catch (e) {
      stripeAccount = { error: e instanceof Error ? e.message.slice(0, 200) : "Could not load Stripe account" }
    }
  }

  const [orders, payoutsDb, webhooks] = await Promise.all([
    db
      .from("orders")
      .select("id, created_at, status, amount_cents, fee_cents, currency, stripe_payment_intent_id")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false })
      .limit(15),
    db.from("payouts").select("id, created_at, status, amount_cents, currency, arrival_date, failure_message").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(15),
    db.from("stripe_webhook_events").select("event_id, type, account, received_at, processed_at, last_error").eq("account", creator.stripe_account_id).order("received_at", { ascending: false }).limit(20),
  ])

  /*
   * THE SUMMARY THE ADMIN SCREEN DRAWS: what Stripe says, read live, beside
   * what Storelib cached from it. Masked bank only; never a document, never a
   * full account number, never an identity payload.
   */
  const cached = await readCreatorStripe(creatorId).catch(() => null)
  const lastWebhook = (webhooks.data ?? [])[0] as { event_id?: string; type?: string; received_at?: string } | undefined
  const summary = {
    connectedAccountId: creator.stripe_account_id,
    country: live?.country ?? null,
    accountType: live?.business_type ?? null,
    chargesEnabled: live ? !!live.charges_enabled : snap.chargesEnabled,
    payoutsEnabled: live ? !!live.payouts_enabled : snap.payoutsEnabled,
    transfers: (live?.capabilities as Record<string, string> | undefined)?.transfers ?? cached?.stripe_transfers_status ?? null,
    canAcceptPayments: live ? canAcceptPayments(sellerFactsOfAccount(live)) : cached?.can_accept_payments ?? null,
    storelibStatus: live ? getStorelibPaymentsStatus(statusFactsOf(live, live.external_accounts?.data ?? [], { everActive: !!cached?.stripe_connected_at })).status : cached?.payments_status ?? null,
    disabledReason: live?.requirements?.disabled_reason ?? cached?.stripe_disabled_reason ?? null,
    currentlyDue: live?.requirements?.currently_due ?? [],
    pastDue: live?.requirements?.past_due ?? [],
    eventuallyDue: live?.requirements?.eventually_due ?? cached?.stripe_eventually_due ?? [],
    pendingVerification: live?.requirements?.pending_verification ?? cached?.stripe_pending_verification ?? [],
    errors: (live?.requirements?.errors ?? []).map((e) => ({ requirement: e.requirement, code: e.code })),
    lastSynced: cached?.last_stripe_sync_at ?? null,
    latestWebhook: lastWebhook ? { id: lastWebhook.event_id ?? null, type: lastWebhook.type ?? null, at: lastWebhook.received_at ?? null } : null,
  }

  return {
    ok: true as const,
    creator: {
      id: creator.id,
      label: creator.display_name || creator.slug,
      storelibState: paymentUxStateOf(snap),
      snapshot: snap,
    },
    summary,
    stripeAccount,
    bankMasked,
    balances,
    recentPayouts,
    recentPayments,
    orders: orders.data ?? [],
    payouts: payoutsDb.data ?? [],
    webhookHistory: webhooks.data ?? [],
  }
}

export async function refreshPaymentAccount(db: Db, creatorId: string) {
  await syncStripeAccount(creatorId, "system")
  await db.from("admin_payments_audit_log").insert({
    action: "manual_resync_requested",
    actor: "admin session",
    after_state: { creatorId },
  })
  return getPaymentAccountDetail(db, creatorId)
}
