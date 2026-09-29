import "server-only"

/**
 * ===========================================================================
 *  STORELIB PAYMENTS' OWN ROWS (run-now part 76)
 * ===========================================================================
 * Every read and write of the payment tables, on the service role client:
 * the tables have row level security on and no policy, so a browser can
 * read none of them, and each function here is handed the creator it acts
 * for by a caller that has already checked who is signed in.
 *
 * What is kept is what Storelib needs to decide and to show, never more:
 *
 *   the account's statuses exactly as Airwallex sent them, so support can
 *   read the provider's word and the model (./model) translates it;
 *
 *   what Airwallex is asking for as CODES only. The account's requirements
 *   carry names and file ids; those never reach this table;
 *
 *   a payout destination as bank, country, currency and the last four. The
 *   account number itself is never written anywhere.
 *
 * A database without part 76 answers "nothing here" (`missing`), and every
 * caller treats that as Airwallex not being set up.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { AirwallexRequirements } from "./model"
import type { AwxBalance, AwxBeneficiary } from "./airwallex/resources"
import { toMinor } from "./money"

type Db = ReturnType<typeof createAdminClient>

export const PROVIDER = "airwallex" as const

export interface AccountRow {
  creator_id: string
  provider: "airwallex"
  provider_account_id: string | null
  account_kind: "individual" | "business" | null
  country: string | null
  lifecycle_status: string | null
  form_status: string | null
  next_action_type: string | null
  requirements: AirwallexRequirements | null
  hosted_flow_id: string | null
  payout_beneficiary_id: string | null
  payout_destination: PayoutDestination | null
  consent_at: string | null
  status_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface PayoutDestination {
  bankName: string | null
  country: string | null
  currency: string | null
  last4: string | null
  holder: "individual" | "business" | null
}

export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /does not exist|could not find the table/i.test(error.message ?? "")
}

export async function readAccount(creatorId: string, db: Db = createAdminClient()): Promise<{ row: AccountRow | null; missing: boolean }> {
  const { data, error } = await db.from("payment_accounts").select("*").eq("creator_id", creatorId).eq("provider", PROVIDER).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return { row: null, missing: true }
    throw new Error(error.message)
  }
  return { row: (data as AccountRow | null) ?? null, missing: false }
}

export async function accountByProviderId(accountId: string, db: Db = createAdminClient()): Promise<AccountRow | null> {
  const { data, error } = await db.from("payment_accounts").select("*").eq("provider", PROVIDER).eq("provider_account_id", accountId).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw new Error(error.message)
  }
  return (data as AccountRow | null) ?? null
}

/**
 * The row is written BEFORE the account is created at Airwallex: the
 * primary key (creator, provider) is the lock that stops two presses making
 * two accounts. `claimed` is false when a row was already there.
 */
export async function claimAccountRow(
  creatorId: string,
  facts: { kind: "individual" | "business"; country: string; consentAt: string },
  db: Db = createAdminClient(),
): Promise<{ claimed: boolean }> {
  const { error } = await db.from("payment_accounts").insert({
    creator_id: creatorId,
    provider: PROVIDER,
    account_kind: facts.kind,
    country: facts.country,
    consent_at: facts.consentAt,
  })
  if (!error) return { claimed: true }
  if (error.code === "23505") return { claimed: false }
  throw new Error(error.message)
}

/** A claim whose account creation failed: gone, so the creator can start again. */
export async function releaseClaim(creatorId: string, db: Db = createAdminClient()): Promise<void> {
  await db.from("payment_accounts").delete().eq("creator_id", creatorId).eq("provider", PROVIDER).is("provider_account_id", null)
}

export async function setProviderAccountId(creatorId: string, accountId: string, status: string | null, db: Db = createAdminClient()): Promise<void> {
  const { error } = await db
    .from("payment_accounts")
    .update({ provider_account_id: accountId, lifecycle_status: status, status_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("creator_id", creatorId)
    .eq("provider", PROVIDER)
  if (error) throw new Error(error.message)
}

/**
 * Only the codes of what Airwallex asks for: which kinds of requirement, and
 * each one's `error_code`. Names, file ids and messages are dropped.
 */
export function sanitizeRequirements(req: unknown): AirwallexRequirements | null {
  if (!req || typeof req !== "object") return null
  const r = req as Record<string, unknown>
  const codes = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => ({ error_code: typeof (x as { error_code?: unknown })?.error_code === "string" ? String((x as { error_code: string }).error_code).slice(0, 60) : undefined })) : null
  const out: AirwallexRequirements = {}
  if (r.agreement_to_terms_and_conditions_required) out.agreement_to_terms_and_conditions_required = true
  if (r.photo_file_id_required && typeof r.photo_file_id_required === "object") {
    const c = (r.photo_file_id_required as { error_code?: unknown }).error_code
    out.photo_file_id_required = { error_code: typeof c === "string" ? c.slice(0, 60) : undefined }
  }
  const holding = codes(r.photo_holding_id_required)
  if (holding?.length) out.photo_holding_id_required = holding
  const primary = codes(r.primary_identification_required)
  if (primary?.length) out.primary_identification_required = primary
  const secondary = codes(r.secondary_identification_required)
  if (secondary?.length) out.secondary_identification_required = secondary
  if (Array.isArray(r.reason_for_duplicate_account_required) && r.reason_for_duplicate_account_required.length) out.reason_for_duplicate_account_required = true
  if (Array.isArray(r.other) && r.other.length) out.other = r.other.map(() => ({}))
  return Object.keys(out).length ? out : null
}

/**
 * The account as Airwallex just described it. Answers the lifecycle it had
 * before, so the caller can log and announce a change once.
 */
export async function writeAccountState(
  creatorId: string,
  state: { lifecycle: string | null; nextActionType: string | null; requirements: unknown },
  db: Db = createAdminClient(),
): Promise<{ before: string | null }> {
  const { row } = await readAccount(creatorId, db)
  const before = row?.lifecycle_status ?? null
  const { error } = await db
    .from("payment_accounts")
    .update({
      lifecycle_status: state.lifecycle ? state.lifecycle.slice(0, 40) : null,
      next_action_type: state.nextActionType ? state.nextActionType.slice(0, 80) : null,
      requirements: sanitizeRequirements(state.requirements),
      status_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("creator_id", creatorId)
    .eq("provider", PROVIDER)
  if (error) throw new Error(error.message)
  return { before }
}

export async function setFormStatus(creatorId: string, status: string, db: Db = createAdminClient()): Promise<void> {
  await db.from("payment_accounts").update({ form_status: status, updated_at: new Date().toISOString() }).eq("creator_id", creatorId).eq("provider", PROVIDER)
}

export async function setHostedFlow(creatorId: string, flowId: string, db: Db = createAdminClient()): Promise<void> {
  await db.from("payment_accounts").update({ hosted_flow_id: flowId, updated_at: new Date().toISOString() }).eq("creator_id", creatorId).eq("provider", PROVIDER)
}

/* ── Payout destination ───────────────────────────────────────────────── */

/** A beneficiary reduced to what the hub shows. The account number stays at Airwallex. */
export function maskBeneficiary(b: AwxBeneficiary): PayoutDestination {
  const bank = b.beneficiary?.bank_details ?? {}
  const number = (bank.account_number || bank.iban || "").replace(/\s+/g, "")
  const entity = (b.beneficiary?.entity_type || "").toUpperCase()
  return {
    bankName: bank.bank_name ? String(bank.bank_name).slice(0, 80) : null,
    country: bank.bank_country_code ? String(bank.bank_country_code).slice(0, 2).toUpperCase() : null,
    currency: bank.account_currency ? String(bank.account_currency).slice(0, 3).toUpperCase() : null,
    last4: number.length >= 4 ? number.slice(-4) : null,
    holder: entity === "COMPANY" ? "business" : entity === "PERSONAL" ? "individual" : null,
  }
}

export async function setPayoutDestination(creatorId: string, beneficiaryId: string | null, destination: PayoutDestination | null, db: Db = createAdminClient()): Promise<void> {
  const { error } = await db
    .from("payment_accounts")
    .update({ payout_beneficiary_id: beneficiaryId, payout_destination: destination, updated_at: new Date().toISOString() })
    .eq("creator_id", creatorId)
    .eq("provider", PROVIDER)
  if (error) throw new Error(error.message)
}

/* ── Balances ─────────────────────────────────────────────────────────── */

export interface BalanceRow {
  currency: string
  available_minor: number
  pending_minor: number
  reserved_minor: number
  fetched_at: string
}

/** Airwallex's cash balances, in the smallest unit, as a cache the hub can show while it asks again. */
export async function saveBalances(creatorId: string, balances: AwxBalance[], db: Db = createAdminClient()): Promise<BalanceRow[]> {
  const now = new Date().toISOString()
  const rows = balances
    .filter((b) => (b.account_type ?? "cash").toLowerCase() === "cash" && /^[A-Za-z]{3}$/.test(b.currency))
    .map((b) => {
      const currency = b.currency.toUpperCase()
      return {
        creator_id: creatorId,
        provider: PROVIDER,
        currency,
        available_minor: toMinor(b.available_amount ?? 0, currency),
        pending_minor: toMinor(b.pending_amount ?? 0, currency),
        reserved_minor: toMinor(b.reserved_amount ?? 0, currency),
        fetched_at: now,
      }
    })
  if (rows.length) {
    const { error } = await db.from("payment_balances").upsert(rows, { onConflict: "creator_id,provider,currency" })
    if (error && !isMissingTable(error)) throw new Error(error.message)
  }
  return rows.map(({ currency, available_minor, pending_minor, reserved_minor, fetched_at }) => ({ currency, available_minor, pending_minor, reserved_minor, fetched_at }))
}

export async function cachedBalances(creatorId: string, db: Db = createAdminClient()): Promise<BalanceRow[]> {
  const { data, error } = await db.from("payment_balances").select("currency, available_minor, pending_minor, reserved_minor, fetched_at").eq("creator_id", creatorId).eq("provider", PROVIDER)
  if (error) return []
  return (data as BalanceRow[] | null) ?? []
}

/* ── The webhook ledger ───────────────────────────────────────────────── */

/**
 * Each event id once. `fresh` is a first delivery; `retry` an event seen
 * before that did not finish (failed, or still marked processing after a
 * crash), which is handled again; `done` one that finished, which is only
 * acknowledged.
 */
export async function claimEvent(
  e: { id: string; name: string; accountId: string | null; objectId: string | null; createdAt: string | null },
  db: Db = createAdminClient(),
): Promise<"fresh" | "retry" | "done" | "missing"> {
  const { error } = await db.from("payment_webhook_events").insert({
    provider: PROVIDER,
    event_id: e.id.slice(0, 200),
    name: e.name.slice(0, 120),
    account_id: e.accountId,
    object_id: e.objectId,
    event_created_at: e.createdAt ? safeDate(e.createdAt) : null,
  })
  if (!error) return "fresh"
  if (isMissingTable(error)) return "missing"
  if (error.code !== "23505") throw new Error(error.message)
  const { data } = await db.from("payment_webhook_events").select("outcome, attempts").eq("provider", PROVIDER).eq("event_id", e.id).maybeSingle()
  const row = data as { outcome: string; attempts: number } | null
  if (row && (row.outcome === "done" || row.outcome === "ignored")) return "done"
  await db.from("payment_webhook_events").update({ attempts: (row?.attempts ?? 1) + 1, outcome: "processing" }).eq("provider", PROVIDER).eq("event_id", e.id)
  return "retry"
}

export async function finishEvent(eventId: string, outcome: "done" | "ignored" | "failed", error: string | null, db: Db = createAdminClient()): Promise<void> {
  await db
    .from("payment_webhook_events")
    .update({ outcome, error: error ? error.slice(0, 500) : null, processed_at: new Date().toISOString() })
    .eq("provider", PROVIDER)
    .eq("event_id", eventId)
}

function safeDate(s: string): string | null {
  const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/* ── The audit trail ──────────────────────────────────────────────────── */

export async function audit(
  entry: { creatorId: string | null; kind: string; from?: string | null; to?: string | null; ref?: string | null; actor: "creator" | "webhook" | "system" | "admin" },
  db: Db = createAdminClient(),
): Promise<void> {
  try {
    await db.from("payment_audit_log").insert({
      creator_id: entry.creatorId,
      provider: PROVIDER,
      kind: entry.kind.slice(0, 60),
      from_state: entry.from ? entry.from.slice(0, 60) : null,
      to_state: entry.to ? entry.to.slice(0, 60) : null,
      ref: entry.ref ? entry.ref.slice(0, 200) : null,
      actor: entry.actor,
    })
  } catch {
    /* the trail is a record, never a reason for the change itself to fail */
  }
}
