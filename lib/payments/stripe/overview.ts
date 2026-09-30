import "server-only"

import { payoutStatusOf, type PayoutStatus } from "../model"
import type { CreatorRef, HubOverview } from "../hub-types"
import { stripeConfigured, stripeConnectEnv, stripePublishableKey } from "./config"
import {
  createStripeAccountSession,
  ensureStripeAccount,
  fetchStripeBalances,
  fetchStripePayouts,
  maskExternalAccount,
  readCreatorStripe,
  resolveCountryForStart,
  syncStripeAccount,
} from "./connect"
import { snapshotFromCreatorRow, stripeCheckoutReady, stripeRequirementNotes, stripeStageCopy, stripeStageOf } from "./facts"
import { stripe } from "@/lib/stripe"

const FRESH_MS = 60_000

function mergeSnapshotFromRow(
  row: Awaited<ReturnType<typeof readCreatorStripe>>,
): ReturnType<typeof snapshotFromCreatorRow> {
  if (!row) {
    return snapshotFromCreatorRow({})
  }
  return snapshotFromCreatorRow(row)
}

export async function stripeOverview(creator: CreatorRef): Promise<HubOverview> {
  const configured = stripeConfigured()
  const publishableKey = stripePublishableKey()
  const rowBefore = await readCreatorStripe(creator.id)
  const stale =
    !rowBefore?.stripe_requirements_updated_at ||
    Date.now() - Date.parse(rowBefore.stripe_requirements_updated_at) > FRESH_MS

  let snapshot = mergeSnapshotFromRow(rowBefore)
  if (rowBefore?.stripe_account_id && stale) {
    try {
      snapshot = await syncStripeAccount(creator.id, "system")
    } catch (e) {
      console.error("[payments/stripe] sync failed", e instanceof Error ? e.message : e)
    }
  }

  const row = await readCreatorStripe(creator.id)

  const stage = stripeStageOf(snapshot)
  const copy = stripeStageCopy(stage)

  let balances: HubOverview["balances"] = []
  let payouts: HubOverview["payouts"] = []
  let payoutDestination = null as HubOverview["payoutDestination"]
  let balancesAt: string | null = null

  if (row?.stripe_account_id && snapshot.chargesEnabled) {
    try {
      balances = await fetchStripeBalances(row.stripe_account_id)
      balancesAt = new Date().toISOString()
      const payoutList = await fetchStripePayouts(row.stripe_account_id)
      payouts = payoutList.map((p) => {
        const mapped = payoutStatusOf(p.status)
        return {
          id: p.id,
          amountMinor: p.amountMinor,
          currency: p.currency,
          status: mapped.status as PayoutStatus,
          statusText: mapped.text,
          createdAt: p.createdAt,
        }
      })
      const ext = await stripe.accounts.listExternalAccounts(row.stripe_account_id, { object: "bank_account", limit: 1 })
      if (ext.data[0]) payoutDestination = maskExternalAccount(ext.data[0])
    } catch (e) {
      console.error("[payments/stripe] balances/payouts", e instanceof Error ? e.message : e)
    }
  }

  return {
    provider: "stripe",
    environment: stripeConnectEnv(),
    configured,
    tableMissing: false,
    stage,
    copy,
    kind: snapshot.accountKind,
    requirements: stage === "action" ? stripeRequirementNotes(snapshot) : [],
    checkoutOpen: stripeCheckoutReady(snapshot),
    balances,
    balancesAt,
    payoutDestination,
    payouts,
    can: {
      embeddedOnboarding: configured && !!publishableKey,
      hostedOnboarding: false,
      embeddedPayoutForm: configured && !!publishableKey,
      requestPayout: false,
    },
    unavailable: !publishableKey ? ["embedded_components"] : [],
    stripe: { publishableKey },
  }
}

export async function stripeStartOnboarding(creator: CreatorRef, input: { kind: "individual" | "business"; country: string }) {
  const country = await resolveCountryForStart(creator, input.country)
  await ensureStripeAccount(creator, { kind: input.kind, country })
  return stripeOverview(creator)
}

export async function stripeAccountSession(creatorId: string, purpose: "onboarding" | "management" | "payouts" | "balances") {
  return createStripeAccountSession(creatorId, purpose)
}
