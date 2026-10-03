/**
 * ===========================================================================
 *  WHAT A DISPUTE MEANS, WITHOUT CALLING STRIPE
 * ===========================================================================
 * The rules lib/stripe/disputes.ts acts on and Payouts draws, kept pure so
 * they are tested as they are (tests/payment-disputes.test.ts).
 *
 * AN INQUIRY IS NOT A CHARGEBACK. Stripe's `warning_` statuses are a bank
 * asking questions before deciding whether to open a case. No money moves,
 * so nothing is taken back from the creator; it is only recorded, and the
 * creator is told it may become a dispute.
 *
 * THE FEE IS STRIPE'S, NOT A GUESS. Stripe's dispute fee depends on the
 * country and currency of the account (it is not $15 everywhere), and it is
 * on the balance transaction that took the money. When that is not on the
 * event, the fee is unknown and counted as 0, never made up.
 *
 * NEVER MORE THAN THE CREATOR RECEIVED. Storelib charges each sale on its
 * own Stripe account and transfers the creator's share (destination
 * charges), so a dispute takes the money from Storelib. What Storelib takes
 * back from the creator is a reversal of that transfer, which can never be
 * more than what is left of it.
 */

export type DisputeOutcome = "won" | "lost" | "inquiry_closed"

/** A bank asking questions, before any money moves. */
export function isInquiry(status: string | null | undefined): boolean {
  return typeof status === "string" && status.startsWith("warning_")
}

/** Closed one way or the other. */
export function isClosed(status: string | null | undefined): boolean {
  return status === "won" || status === "lost" || status === "warning_closed"
}

export function outcomeOf(status: string | null | undefined): DisputeOutcome | null {
  if (status === "won") return "won"
  if (status === "lost") return "lost"
  if (status === "warning_closed") return "inquiry_closed"
  return null
}

/**
 * Stripe's dispute fee, from the balance transaction that withdrew the
 * money (a negative amount with a fee). Unknown is 0, never a guessed $15.
 */
export function disputeFeeMinor(balanceTransactions: unknown): number {
  if (!Array.isArray(balanceTransactions)) return 0
  let fee = 0
  for (const bt of balanceTransactions) {
    if (!bt || typeof bt !== "object") continue
    const t = bt as { amount?: unknown; fee?: unknown }
    if (typeof t.amount === "number" && t.amount < 0 && typeof t.fee === "number" && t.fee > 0) fee += t.fee
  }
  return fee
}

/** How much of the creator's transfer can still be taken back: never more than the dispute, never more than is left. */
export function reversibleMinor(transfer: { amount: number; amount_reversed?: number | null } | null | undefined, disputeAmount: number): number {
  if (!transfer || !Number.isFinite(transfer.amount) || !Number.isFinite(disputeAmount)) return 0
  const left = Math.max(0, transfer.amount - Math.max(0, transfer.amount_reversed ?? 0))
  return Math.max(0, Math.min(Math.floor(disputeAmount), left))
}

/** Stripe's reason, as a creator reads it. */
const REASONS: Record<string, string> = {
  fraudulent: "The buyer's bank says the card owner did not make this payment.",
  unrecognized: "The buyer does not recognise the payment on their statement.",
  product_not_received: "The buyer says they did not get what they paid for.",
  product_unacceptable: "The buyer says the product was not as described.",
  duplicate: "The buyer says they were charged twice.",
  subscription_canceled: "The buyer says they had cancelled.",
  credit_not_processed: "The buyer says a promised refund never arrived.",
  bank_cannot_process: "The buyer's bank could not process the payment.",
  check_returned: "The payment was returned by the bank.",
  customer_initiated: "The buyer asked their bank to reverse the payment.",
  debit_not_authorized: "The buyer says they did not authorise the payment.",
  incorrect_account_details: "The buyer's bank says the account details were wrong.",
  insufficient_funds: "The buyer's bank says there were not enough funds.",
  noncompliant: "The buyer's bank says the payment broke card network rules.",
  general: "The buyer asked their bank to reverse the payment.",
}

export function reasonWords(reason: string | null | undefined): string {
  return (reason && REASONS[reason]) || REASONS.general
}

export type DisputeStage = "inquiry" | "respond" | "review" | "won" | "lost" | "closed"

/** Where a case is, for the creator: what is happening and whether anything is needed. */
export function stageOf(status: string | null | undefined): DisputeStage {
  switch (status) {
    case "warning_needs_response":
    case "warning_under_review":
      return "inquiry"
    case "warning_closed":
      return "closed"
    case "needs_response":
      return "respond"
    case "under_review":
      return "review"
    case "won":
      return "won"
    case "lost":
      return "lost"
    default:
      return "review"
  }
}

export const STAGE_WORDS: Record<DisputeStage, { label: string; line: string; tone: "neutral" | "attention" | "critical" | "good" }> = {
  inquiry: { label: "Inquiry", line: "The buyer's bank is asking questions. No money has been taken. Storelib answers it for you.", tone: "neutral" },
  respond: { label: "Open", line: "Storelib is answering the bank. Add anything that proves the sale so it can be sent with the response.", tone: "attention" },
  review: { label: "With the bank", line: "The response has been sent. The buyer's bank decides, which usually takes 60 to 75 days.", tone: "neutral" },
  won: { label: "Won", line: "The bank decided for you. The money was returned to your balance.", tone: "good" },
  lost: { label: "Lost", line: "The bank decided for the buyer. The amount stays with them.", tone: "critical" },
  closed: { label: "Closed", line: "The bank closed its inquiry without opening a dispute.", tone: "neutral" },
}

/** Only what a creator may add as evidence: plain text, trimmed, at most 4000 characters. */
export function cleanCreatorNote(input: unknown): string | null {
  if (typeof input !== "string") return null
  const text = input.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim()
  if (text.length < 10) return null
  return text.slice(0, 4000)
}
