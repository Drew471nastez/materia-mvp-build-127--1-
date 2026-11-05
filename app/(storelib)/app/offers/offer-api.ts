import { tt } from "@/lib/i18n/text"
import type { Offer } from "@/lib/offers/offers"

export type OfferAnswer = { ok: true; offer?: Offer } | { ok: false; error: string }

/** One write to the store's offers (app/api/store/offers), answered in words a seller can act on. */
export async function sendOffer(method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown): Promise<OfferAnswer> {
  try {
    const res = await fetch("/api/store/offers", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: typeof data?.error === "string" ? data.error : tt("That did not go through. Try again.") }
    return { ok: true, offer: data?.offer as Offer | undefined }
  } catch {
    return { ok: false, error: tt("No connection. Try again in a moment.") }
  }
}
