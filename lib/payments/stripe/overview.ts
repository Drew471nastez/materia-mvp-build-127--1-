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
  payoutFactsOf,
  profileForCreator,
  readCreatorStripe,
  resolveCountryForStart,
  syncStripeAccount,
} from "./connect"
import { countryCode } from "@/lib/checkout/countries"
import { badgeFromUxState, BADGE_COPY } from "./creator-badge"
import { beatFromRequirements, creatorStatusLabel } from "./onboarding-steps"
import {
  paymentUxStateOf,
  snapshotFromCreatorRow,
  stripeCheckoutReady,
  stripeRequirementNotes,
  stripeStageCopy,
  stripeStageOf,
} from "./facts"
import { stripe } from "@/lib/stripe"
import { prepareStorelibAccount, verificationView } from "./verification"

function mergeSnapshotFromRow(
  row: Awaited<ReturnType<typeof readCreatorStripe>>,
): ReturnType<typeof snapshotFromCreatorRow> {
  if (!row) {
    return snapshotFromCreatorRow({})
  }
  return snapshotFromCreatorRow(row)
}

export async function stripeOverview(creator: CreatorRef, options?: { sync?: boolean }): Promise<HubOverview> {
  const configured = stripeConfigured()
  const publishableKey = stripePublishableKey()
  const rowBefore = await readCreatorStripe(creator.id)

  let snapshot = mergeSnapshotFromRow(rowBefore)
  const shouldSync = options?.sync !== false
  if (rowBefore?.stripe_account_id && shouldSync) {
    try {
      snapshot = await syncStripeAccount(creator.id, "system")
    } catch (e) {
      console.error("[payments/stripe] sync failed", e instanceof Error ? e.message : e)
    }
  }

  const row = await readCreatorStripe(creator.id)
  const person = row ? await profileForCreator(row.user_id) : null
  const live = row?.stripe_account_id ? await stripe.accounts.retrieve(row.stripe_account_id).catch(() => null) : null
  const facts = live ? payoutFactsOf(live) : null
  const verification = live ? verificationView(live) : null

  const stage = stripeStageOf(snapshot)
  const uxState = paymentUxStateOf(snapshot)
  const badge = badgeFromUxState(uxState)
  const beat = beatFromRequirements({
    hasAccount: !!snapshot.accountId,
    detailsSubmitted: snapshot.detailsSubmitted,
    hasBank: snapshot.hasExternalAccount,
    currentlyDue: snapshot.currentlyDue,
    pastDue: snapshot.pastDue,
    pendingVerification: snapshot.pendingVerification,
    chargesEnabled: snapshot.chargesEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
  })
  const actionRequired =
    snapshot.pastDue.length > 0 ||
    !!snapshot.disabledReason ||
    (snapshot.chargesEnabled && !snapshot.payoutsEnabled && beat !== "bank" && beat !== "done")
  const statusLabel = creatorStatusLabel(beat, actionRequired)
  const copy = { ...stripeStageCopy(stage), title: `Storelib Payments`, line: BADGE_COPY[badge].line, action: BADGE_COPY[badge].cta ?? stripeStageCopy(stage).action }

  let balances: HubOverview["balances"] = []
  let payouts: HubOverview["payouts"] = []
  let payoutDestination = null as HubOverview["payoutDestination"]
  let balancesAt: string | null = null
  let nextPayout: HubOverview["nextPayout"] = null

  if (row?.stripe_account_id && snapshot.chargesEnabled) {
    try {
      balances = await fetchStripeBalances(row.stripe_account_id)
      balancesAt = new Date().toISOString()
      const payoutList = await fetchStripePayouts(row.stripe_account_id)
      const upcoming = payoutList.find((p) => p.status === "pending" || p.status === "in_transit")
      if (upcoming) {
        nextPayout = {
          amountMinor: upcoming.amountMinor,
          currency: upcoming.currency,
          arrivalDate: upcoming.arrivalDate ?? upcoming.createdAt,
        }
      }
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
    badge,
    uxState,
    chargesEnabled: snapshot.chargesEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
    prefill: {
      firstName: person?.first_name ?? "",
      lastName: person?.last_name ?? "",
      country: countryCode(person?.country),
    },
    payoutHint: facts,
    verification,
    beat,
    statusLabel,
    nextPayout,
  }
}

export async function stripeStartOnboarding(creator: CreatorRef, input: { kind: "individual" | "business"; country: string }) {
  const country = await resolveCountryForStart(creator, input.country)
  await ensureStripeAccount(creator, { kind: input.kind, country })
  return stripeOverview(creator)
}

export async function stripeAccountSession(creator: CreatorRef, purpose: "onboarding" | "management" | "payouts" | "balances") {
  if (purpose === "onboarding" || purpose === "management") await prepareStorelibAccount(creator)
  return createStripeAccountSession(creator.id, purpose)
}
