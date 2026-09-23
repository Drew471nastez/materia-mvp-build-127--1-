/**
 * Pure: which line of a payment each refund belongs to, for
 * lib/checkout/refunds.ts, kept apart from Stripe so it can be tested alone.
 */

/**
 * How much of the payment's refunds belongs to each line. A refund made with
 * the Refund button names its order; one made in the Dashboard does not, and
 * is laid over the lines in order. A full refund covers every line in full.
 */
export function allocateRefunds(
  lines: { id: string; amount_cents: number | null }[],
  refunds: { amount: number; orderId: string | null }[],
  fullyRefunded: boolean,
): Map<string, number> {
  const out = new Map(lines.map((l) => [l.id, 0]))
  const cap = (id: string) => Math.max(0, lines.find((l) => l.id === id)?.amount_cents || 0)
  if (fullyRefunded) {
    for (const l of lines) out.set(l.id, cap(l.id))
    return out
  }
  let unnamed = 0
  for (const r of refunds) {
    if (r.orderId && out.has(r.orderId)) out.set(r.orderId, Math.min(cap(r.orderId), (out.get(r.orderId) ?? 0) + r.amount))
    else unnamed += r.amount
  }
  for (const l of lines) {
    if (unnamed <= 0) break
    const room = cap(l.id) - (out.get(l.id) ?? 0)
    const take = Math.min(room, unnamed)
    out.set(l.id, (out.get(l.id) ?? 0) + take)
    unnamed -= take
  }
  return out
}
