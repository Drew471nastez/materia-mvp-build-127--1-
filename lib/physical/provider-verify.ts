import "server-only"

/**
 * ===========================================================================
 *  IS THIS KEY REAL? ASKED OF THE PROVIDER ITSELF
 * ===========================================================================
 * Saving a Shippo, Printful or Gelato key used to store it and say nothing
 * about it. Now the key is put to the provider's own API once, on save, with
 * the cheapest read each offers, and the answer is kept on the integration:
 * the account it belongs to when the provider says (a Printful store's name),
 * or what was wrong. A key the provider refuses is not stored as working.
 *
 * Reads only. Nothing here creates an order, a label or a shipment, so a
 * check costs the merchant nothing at the provider.
 *
 * A provider without a documented read that a single key can make
 * (ShipStation's two-part keys, CJ's token exchange) answers "unchecked":
 * the key is kept, and the card says it was not checked.
 */

export type VerifyResult =
  | { state: "verified"; account: string | null; mode?: "test" | "live" }
  | { state: "rejected"; error: string }
  | { state: "unreachable"; error: string }
  | { state: "unchecked" }

const TIMEOUT_MS = 8000

async function ask(url: string, headers: Record<string, string>): Promise<{ status: number; body: unknown } | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  } catch {
    return null
  }
}

function refused(name: string, status: number): VerifyResult {
  if (status === 401 || status === 403) return { state: "rejected", error: `${name} did not accept that key.` }
  if (status === 429) return { state: "unreachable", error: `${name} is busy. Save again in a minute.` }
  return { state: "unreachable", error: `${name} answered ${status}. Try again in a moment.` }
}

const unreachable = (name: string): VerifyResult => ({ state: "unreachable", error: `${name} could not be reached. Try again in a moment.` })

/** The provider's verdict on a key. */
export async function verifyProviderKey(provider: string, key: string): Promise<VerifyResult> {
  switch (provider) {
    case "shippo": {
      /* Shippo: ShippoToken auth; a test key starts shippo_test_, a live one shippo_live_. */
      const r = await ask("https://api.goshippo.com/carrier_accounts/?results=1", { Authorization: `ShippoToken ${key}` })
      if (!r) return unreachable("Shippo")
      if (r.status !== 200) return refused("Shippo", r.status)
      return { state: "verified", account: null, mode: key.startsWith("shippo_test_") ? "test" : "live" }
    }
    case "printful": {
      const r = await ask("https://api.printful.com/stores", { Authorization: `Bearer ${key}` })
      if (!r) return unreachable("Printful")
      if (r.status !== 200) return refused("Printful", r.status)
      const stores = (r.body as { result?: { name?: unknown }[] } | null)?.result
      const name = Array.isArray(stores) && typeof stores[0]?.name === "string" ? (stores[0].name as string) : null
      return { state: "verified", account: name }
    }
    case "gelato": {
      const r = await ask("https://product.gelatoapis.com/v3/catalogs", { "X-API-KEY": key })
      if (!r) return unreachable("Gelato")
      if (r.status !== 200) return refused("Gelato", r.status)
      return { state: "verified", account: null }
    }
    case "printify": {
      const r = await ask("https://api.printify.com/v1/shops.json", { Authorization: `Bearer ${key}` })
      if (!r) return unreachable("Printify")
      if (r.status !== 200) return refused("Printify", r.status)
      const shops = r.body as { title?: unknown }[] | null
      const name = Array.isArray(shops) && typeof shops[0]?.title === "string" ? (shops[0].title as string) : null
      return { state: "verified", account: name }
    }
    case "easypost": {
      const r = await ask("https://api.easypost.com/v2/addresses?page_size=1", { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` })
      if (!r) return unreachable("EasyPost")
      if (r.status !== 200) return refused("EasyPost", r.status)
      return { state: "verified", account: null, mode: key.startsWith("EZTK") ? "test" : "live" }
    }
    default:
      return { state: "unchecked" }
  }
}
