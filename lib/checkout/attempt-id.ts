/**
 * The checkout page's attempt id (PAY-9): one per checkout page view (or
 * checkout window), made the first time Pay is pressed and sent with every
 * /api/checkout/stripe-session request from that view. The server keys the
 * order on it together with what is charged (lib/checkout/checkout-attempts),
 * so pressing Pay again for the same order gets the same PaymentIntent, and a
 * changed order a new one. It opens nothing by itself: the tokens on the
 * PaymentIntent are always the server's.
 */
export function newCheckoutAttemptId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  } catch {
    /* an older browser: below */
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** The view's id, made on first use and the same after (a ref's holder). */
export function attemptIdOf(holder: { current: string | null }): string {
  if (!holder.current) holder.current = newCheckoutAttemptId()
  return holder.current
}

/**
 * The key a free order that ships is placed under (round AY): the same while the order (its signature) is
 * the same, so a press sent again after a lost answer finds the order the first placed
 * (lib/physical/checkout-server freeOrderOfKey); a new one once anything in the order changed. The caller
 * clears the holder when the server refused, so the next press is a new order.
 */
export function freeKeyFor(holder: { current: { key: string; sig: string } | null }, sig: string, make: () => string): string {
  if (holder.current && holder.current.sig === sig) return holder.current.key
  holder.current = { key: make(), sig }
  return holder.current.key
}
