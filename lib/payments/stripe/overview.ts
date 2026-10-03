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
  hadConnection,
  resolveCountryForStart,
  syncStripeAccountFull,
  type StripeSyncResult,
} from "./connect"
import { countryCode } from "@/lib/checkout/countries"
import { badgeFromUxState, BADGE_COPY } from "./creator-badge"
import { beatOfStatus, getStorelibPaymentsStatus, STATUS_PILL, statusFactsOf } from "./status"
import {
  paymentUxStateOf,
  snapshotFromCreatorRow,
  stripeCheckoutReady,
  stripeRequirementNotes,
  stripeStageCopy,
  stripeStageOf,
} from "./facts"
import { prepareStorelibAccount } from "./verification"

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
  let synced: StripeSyncResult | null = null
  let unreachable = false
  if (rowBefore?.stripe_account_id && options?.sync !== false) {
    try {
      synced = await syncStripeAccountFull(creator.id, "system")
      snapshot = synced.snapshot
    } catch (e) {
      unreachable = true
      console.error("[payments/stripe] sync failed", e instanceof Error ? e.message.slice(0, 160) : "unknown")
    }
  }

  /* A sync that let an unreachable account go has changed the row: read it again, so nothing below uses the old id. */
  const row = synced && !synced.released ? rowBefore : await readCreatorStripe(creator.id)
  const reconnect = !row?.stripe_account_id && row ? await hadConnection(creator.id, row.stripe_connected_at) : false
  const person = row ? await profileForCreator(row.user_id) : null
  const live = synced?.account ?? null
  const facts = live ? payoutFactsOf(live) : null
  /* Without a fresh read, fall back to the cached flags; never to "active" unless Stripe said so last time. */
  const paymentsStatus =
    synced?.status ??
    getStorelibPaymentsStatus(
      statusFactsOf(
        row?.stripe_account_id
          ? {
              charges_enabled: snapshot.chargesEnabled,
              payouts_enabled: snapshot.payoutsEnabled,
              details_submitted: snapshot.detailsSubmitted,
              requirements: { currently_due: snapshot.currentlyDue },
            }
          : null,
        snapshot.chargesEnabled && snapshot.payoutsEnabled ? [{ status: "new" }] : [],
        { everActive: !!row?.stripe_connected_at, reconnect },
      ),
    )

  const stage = stripeStageOf(snapshot)
  const uxState = paymentUxStateOf(snapshot)
  const badge = badgeFromUxState(uxState)
  const beat = beatOfStatus(paymentsStatus.status)
  const statusLabel = STATUS_PILL[paymentsStatus.status].label
  const copy = { ...stripeStageCopy(stage), title: `Storelib Payments`, line: BADGE_COPY[badge].line, action: BADGE_COPY[badge].cta ?? stripeStageCopy(stage).action }

  let balances: HubOverview["balances"] = []
  let payouts: HubOverview["payouts"] = []
  let payoutDestination = null as HubOverview["payoutDestination"]
  let balancesAt: string | null = null
  let nextPayout: HubOverview["nextPayout"] = null
  const bank = synced?.banks.find((b) => b.default_for_currency) ?? synced?.banks[0]
  if (bank) payoutDestination = maskExternalAccount(bank)

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
    paymentsStatus,
    stripeUnreachable: unreachable,
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
