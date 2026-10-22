/**
 * Which family an automation belongs with in Emails › Customer emails
 * (lib/emails/customer-catalog.ts), so it is listed beside the emails it
 * goes out with and never under another family's:
 *
 *   Leaves checkout          Digital products, beside Storelib's checkout
 *                            reminder, which it replaces while it is on
 *                            (lib/automations/abandoned.ts sweepAbandoned)
 *   Buys a product, First    the family of the products it is limited to:
 *   order                    Physical products when every one ships, Digital
 *                            products when none does, both when it is for any
 *                            product or for some of each
 *   Joins your list          none: it is about the list, not a purchase, and
 *                            stays under Automations only
 *
 * Pure.
 */
import type { EmailFamily } from "./buyer-channel"

export function flowFamilies(trigger: string, productIds: unknown, typeOf: (id: string) => string | null | undefined, physical: boolean): EmailFamily[] {
  if (trigger === "abandoned_checkout") return ["digital"]
  if (trigger !== "purchase" && trigger !== "first_purchase") return []
  const ids = Array.isArray(productIds) ? productIds.filter((x): x is string => typeof x === "string") : []
  const both: EmailFamily[] = physical ? ["digital", "physical"] : ["digital"]
  if (ids.length === 0) return both
  const kinds = new Set(ids.map((id) => (typeOf(id) === "physical" ? "physical" : typeOf(id) ? "digital" : "unknown")))
  if (kinds.has("unknown")) return both
  if (kinds.size === 1 && kinds.has("physical")) return physical ? ["physical"] : []
  if (kinds.size === 1) return ["digital"]
  return both
}
