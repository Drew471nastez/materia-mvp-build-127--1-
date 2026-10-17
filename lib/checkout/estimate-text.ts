import type { CheckoutT } from "@/lib/markets/checkout-words"

/**
 * A delivery estimate (lib/physical/rates.ts deliveryEstimate) in the visitor's
 * language: "3 to 5 business days" read back into its numbers and said again
 * through ct, so each shape is one sentence to translate. Anything else is
 * shown as it was written.
 */
export function estimateText(ct: CheckoutT, text: string): string {
  let m = /^(\d+) business days?$/.exec(text)
  if (m) return ct("{count, plural, one {# business day} other {# business days}}", { count: Number(m[1]) })
  m = /^(\d+) to (\d+) business days$/.exec(text)
  if (m) return ct("{min} to {max} business days", { min: m[1], max: m[2] })
  m = /^Up to (\d+) business days$/.exec(text)
  if (m) return ct("Up to {count} business days", { count: m[1] })
  m = /^From (\d+) business days$/.exec(text)
  if (m) return ct("From {count} business days", { count: m[1] })
  return text
}
