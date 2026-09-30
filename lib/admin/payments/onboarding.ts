import "server-only"

import { paymentUxStateOf, snapshotFromCreatorRow } from "@/lib/payments/stripe/facts"

type Db = { from: (table: string) => { select: (cols: string) => any } } // eslint-disable-line @typescript-eslint/no-explicit-any

export type OnboardingStage =
  | "signed_up"
  | "setup_started"
  | "account_created"
  | "kyc_submitted"
  | "action_required"
  | "payments_active"
  | "payout_enabled"

export async function buildOnboardingFunnel(db: Db) {
  const { data, error } = await db
    .from("creators")
    .select(
      "id, slug, display_name, created_at, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, details_submitted, stripe_requirements",
    )
    .order("created_at", { ascending: false })
    .limit(2000)

  if (error || !data) return { unavailable: true as const }

  const counts: Record<OnboardingStage, number> = {
    signed_up: 0,
    setup_started: 0,
    account_created: 0,
    kyc_submitted: 0,
    action_required: 0,
    payments_active: 0,
    payout_enabled: 0,
  }

  const stuck: Record<OnboardingStage, Array<{ id: string; label: string }>> = {
    signed_up: [],
    setup_started: [],
    account_created: [],
    kyc_submitted: [],
    action_required: [],
    payments_active: [],
    payout_enabled: [],
  }

  for (const row of data as Array<Record<string, unknown>>) {
    counts.signed_up++
    const id = String(row.id)
    const label = String(row.display_name || row.slug || id).slice(0, 80)
    const hasAccount = Boolean(row.stripe_account_id)
    if (hasAccount) counts.setup_started++
    if (hasAccount) counts.account_created++
    const details = row.details_submitted === true
    if (details) counts.kyc_submitted++

    const snap = snapshotFromCreatorRow(row as Parameters<typeof snapshotFromCreatorRow>[0])
    const ux = paymentUxStateOf(snap)
    if (ux === "ACTION_REQUIRED") {
      counts.action_required++
      if (stuck.action_required.length < 25) stuck.action_required.push({ id, label })
    }
    if (snap.chargesEnabled) {
      counts.payments_active++
    } else if (hasAccount && stuck.setup_started.length < 25) {
      stuck.setup_started.push({ id, label })
    }
    if (snap.payoutsEnabled) counts.payout_enabled++
    else if (snap.chargesEnabled && stuck.payments_active.length < 25) {
      stuck.payments_active.push({ id, label })
    }
  }

  return { counts, stuck, scanned: data.length }
}
