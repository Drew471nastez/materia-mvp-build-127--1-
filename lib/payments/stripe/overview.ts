import "server-only"

import { forgetPaymentsReadiness } from "./readiness-cache"
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
  platformCountry,
  platformCountryKnown,
  syncStripeAccountFull,
  type StripeSyncResult,
} from "./connect"
import { countryCode } from "@/lib/checkout/countries"
import { badgeFromUxState, BADGE_COPY } from "./creator-badge"
import { beatOfStatus, getStorelibPaymentsStatus, idOutstanding, STATUS_PILL, statusFactsOf } from "./status"
import {
  paymentUxStateOf,
  snapshotFromCreatorRow,
  stripeCheckoutReady,
  stripeRequirementNotes,
  stripeStageCopy,
  stripeStageOf,
} from "./facts"
import { prepareStorelibAccount } from "./verification"
import { setupCountryOf, type SetupCountry } from "./account-country"

function mergeSnapshotFromRow(
  row: Awaited<ReturnType<typeof readCreatorStripe>>,
): ReturnType<typeof snapshotFromCreatorRow> {
  if (!row) {
    return snapshotFromCreatorRow({})
  }
  return snapshotFromCreatorRow(row)
}

/*
 * HOW OLD A COPY MAY BE before opening Payouts asks Stripe again. The
 * account.updated and capability.updated webhooks keep the creators row
 * current; this is the fallback that reconciles anything a webhook missed,
 * without three Stripe calls every time somebody opens the page.
 */
const FRESH_FOR_MS = 60_000

export async function stripeOverview(creator: CreatorRef, options?: { sync?: boolean | "stale" }): Promise<HubOverview> {
  const configured = stripeConfigured()
  const publishableKey = stripePublishableKey()
  /* The creator row and the owner's profile in one round, not one after the other. */
  const [rowBefore, ownerProfile] = await Promise.all([readCreatorStripe(creator.id), profileForCreator(creator.userId).catch(() => null)])

  let snapshot = mergeSnapshotFromRow(rowBefore)
  let synced: StripeSyncResult | null = null
  let unreachable = false
  const syncedAt = rowBefore?.last_stripe_sync_at ? Date.parse(rowBefore.last_stripe_sync_at) : 0
  const freshEnough = options?.sync === "stale" && typeof rowBefore?.can_accept_payments === "boolean" && Date.now() - syncedAt < FRESH_FOR_MS
  if (rowBefore?.stripe_account_id && options?.sync !== false && !freshEnough) {
    try {
      synced = await syncStripeAccountFull(creator.id, "system")
      snapshot = synced.snapshot
      /* The sync found it ready, or no longer: the store's cached readiness ("Connect payments") goes now. */
      if ((rowBefore.can_accept_payments === true) !== (snapshot.canAcceptPayments === true)) await forgetPaymentsReadiness(creator.id)
    } catch (e) {
      unreachable = true
      console.error("[payments/stripe] sync failed", e instanceof Error ? e.message.slice(0, 160) : "unknown")
    }
  }

  /* A sync that let an unreachable account go has changed the row: read it again, so nothing below uses the old id. */
  const row = synced && !synced.released ? rowBefore : await readCreatorStripe(creator.id)
  const reconnect = !row?.stripe_account_id && row ? await hadConnection(creator.id, row.stripe_connected_at) : false
  const person = row ? (row.user_id === creator.userId ? ownerProfile : await profileForCreator(row.user_id)) : null
  /*
   * Which countries setup can open: the platform's country decides
   * (lib/payments/stripe/payout-regions). Only asked of Stripe when there is
   * no account yet and the page may wait; otherwise what is already known.
   */
  const platform = platformCountryKnown() ?? (!row?.stripe_account_id && options?.sync !== false ? await platformCountry().catch(() => null) : null)
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
              requirements: { currently_due: snapshot.currentlyDue, pending_verification: snapshot.pendingVerification, disabled_reason: snapshot.disabledReason, eventually_due: row?.stripe_eventually_due ?? [] },
              capabilities: snapshot.transfersStatus ? { transfers: snapshot.transfersStatus } : {},
            }
          : null,
        row?.payout_destination || (snapshot.chargesEnabled && snapshot.payoutsEnabled) ? [{ status: "new" }] : [],
        { everActive: !!row?.stripe_connected_at, reconnect },
      ),
    )

  /*
   * What the country step needs (./account-country): the account's country,
   * whether it can still change, and whether the seller chose it. Read from
   * the live account when this overview synced, else from the cached row,
   * where "chosen" is not known.
   */
  const setupCountry: SetupCountry = live
    ? setupCountryOf(live)
    : row?.stripe_account_id
      ? {
          country: (row.stripe_account_country ?? "").toUpperCase() || null,
          changeable: !row.details_submitted && !row.charges_enabled && !row.payouts_enabled,
          chosen: null,
        }
      : { country: null, changeable: false, chosen: null }

  /* The ID check is still ahead in setup: Stripe lists the document (now or eventually) and none is on file or being looked at. */
  const req = live?.requirements
  const listed = [...(req?.currently_due ?? snapshot.currentlyDue), ...(req?.eventually_due ?? row?.stripe_eventually_due ?? [])]
  const idAhead = !!row?.stripe_account_id && (live ? idOutstanding(live) : listed.includes("individual.verification.document") && !snapshot.pendingVerification.includes("individual.verification.document"))

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
  else if (!synced && row?.payout_destination) {
    /* The masked copy the last sync kept: never a full number. */
    const kept = row.payout_destination
    payoutDestination = { bankName: kept.bankName ?? null, country: kept.country ?? null, currency: kept.currency ?? null, last4: kept.last4 ?? null, holder: null }
  }

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
    setupCountry,
    platformCountry: platform,
    paymentsStatus,
    stripeUnreachable: unreachable,
    beat,
    statusLabel,
    nextPayout,
    idAhead,
  }
}

/**
 * The country step's Continue. With `session`, the Account Session for
 * Stripe's form is made beside the overview and comes back with it: the
 * form's frame then needs no request of its own after Continue, one round
 * trip less between the press and Stripe's first screen. A session that
 * cannot be made (Stripe slow, a platform setting) is left out, and the form
 * asks for its own as before.
 */
export async function stripeStartOnboarding(creator: CreatorRef, input: { kind: "individual" | "business"; country: string; session?: boolean }) {
  const country = await resolveCountryForStart(creator, input.country)
  await ensureStripeAccount(creator, { kind: input.kind, country })
  if (!input.session) return stripeOverview(creator)
  const [view, session] = await Promise.all([
    stripeOverview(creator),
    stripeAccountSession(creator, "onboarding").catch((error: unknown) => {
      console.warn(JSON.stringify({ evt: "stripe_start_session_skipped", creator: creator.id, msg: error instanceof Error ? error.message.slice(0, 160) : "unknown" }))
      return null
    }),
  ])
  return session ? { ...view, session: { purpose: "stripe_onboarding" as const, ...session } } : view
}

/**
 * ONE READ OF THE ROW, AND THE SYNC BESIDE THE SESSION. This read the
 * creator row twice and waited for a full sync (three Stripe calls) before
 * asking Stripe for the session, all in a line in front of the form's first
 * frame. The row is read once now, and anything that only brings Storelib's
 * cached copy up to date runs beside the session.
 */
export async function stripeAccountSession(creator: CreatorRef, purpose: "onboarding" | "management" | "payouts" | "balances") {
  const row = await readCreatorStripe(creator.id)
  const background: Promise<unknown>[] = []
  const prepared = purpose === "onboarding" || purpose === "management" ? await prepareStorelibAccount(creator, { row, background }) : null
  /* A swap during prepare put another account on the row: read it again rather than hand Stripe the old id. */
  const sameRow = !prepared || prepared.id === row?.stripe_account_id ? row : null
  const [session] = await Promise.all([createStripeAccountSession(creator.id, purpose, prepared, sameRow), ...background])
  return session as Awaited<ReturnType<typeof createStripeAccountSession>>
}
