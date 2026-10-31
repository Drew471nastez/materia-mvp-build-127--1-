/**
 * AN EMAIL THAT WOULD STATE AN AMOUNT WITHOUT KNOWING ITS CURRENCY IS HELD.
 *
 * Every order records the currency Stripe charged (orders.currency), so this
 * should only ever meet an old row or a bug. When it does, the email is not
 * sent with a guessed "$", nor with a bare number nobody can read: it is
 * held, and flagged on the admin's Health view (lib/observability/report)
 * with the order, so a person checks the currency and sends it by hand.
 */

/** What the hold is recorded as, in the email log and the delivery's reason. */
export const CURRENCY_UNKNOWN_HOLD = "Held: the order's currency is unknown, so no amount was sent."

export function knownCurrency(value: unknown): string | null {
  return typeof value === "string" && /^[a-z]{3}$/i.test(value.trim()) ? value.trim().toUpperCase() : null
}

const amountOf = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : 0)

/**
 * A notification's data that carries money (any `...Cents` field above zero,
 * at the top or in a basket's lines) but no currency it can be written in.
 * A free claim, or data with no amount at all, is not held.
 */
export function moneyWithoutCurrency(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== "object") return false
  if (knownCurrency(payload.currency)) return false
  const hasAmount = (o: Record<string, unknown>) => Object.entries(o).some(([k, v]) => /Cents$/.test(k) && amountOf(v) > 0)
  if (hasAmount(payload)) return true
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  return lines.some((l) => l && typeof l === "object" && hasAmount(l as Record<string, unknown>))
}

/** Flags one held email for the admin. Never throws: the payment it belongs to is already done. */
export async function flagHeldEmail(details: { email: string; orderId?: string | null; type?: string | null }): Promise<void> {
  /* `email` here is the kind of email ("Receipt", "Sale"), never an address. */
  const kind = details.email
  console.error("[email] held: currency unknown", kind, details.orderId ? String(details.orderId).slice(0, 8) : "")
  await import("@/lib/observability/report")
    .then(({ reportError }) =>
      reportError({
        source: "notify",
        where: `${details.email} email held: currency unknown`,
        error: new Error("An email with an amount had no currency and was not sent"),
        context: { orderId: details.orderId ?? null, type: details.type ?? null },
      }),
    )
    .catch(() => undefined)
}
