/**
 * ===========================================================================
 *  THE CUSTOMS DECLARATION OF A PARCEL THAT LEAVES THE COUNTRY
 * ===========================================================================
 * A product's Shipping section has always asked where it was made and for
 * its HS code, "for customs forms", and nothing read either: a label for
 * another country was quoted with no declaration, so a carrier that wants
 * one offered no rate, or sold a label that customs then held.
 *
 * Here the declaration is put together from the order, and only from it:
 *
 *   value        what the buyer paid for the line (its price less its
 *                discount, never delivery or tax). An item given away is
 *                declared at its own price, which is what it is worth.
 *   weight       the line's weight as sold
 *   origin       the product's Country of origin
 *   tariff       the product's HS code, when it has one
 *
 * NOTHING IS FILLED IN FOR A FORM. A line with no origin, no weight or no
 * price stops the label with a sentence naming the product and where to add
 * what is missing. A declaration is a signed statement to a customs office;
 * a guess on one is the seller's fine.
 *
 * Pure, so the tests read it as it is.
 */
import { isEuCountry } from "@/lib/physical/quick-setup"
import type { CustomsForm, CustomsLine } from "./types"

/** What a declaration is made from, one per line in the parcel. */
export interface CustomsSource {
  title: string
  variantName: string | null
  sku: string | null
  /** How many of this line are in this parcel. */
  quantity: number
  /** One unit's price, in the order's minor units. */
  unitCents: number
  /** The whole line's discount, and how many units the line has, so a partial parcel carries its share. */
  lineDiscountCents: number
  lineQuantity: number
  /** One unit's weight as sold, in grams. 0 when the product has none. */
  gramsEach: number
  originCountry: string | null
  hsCode: string | null
}

/**
 * Above this, per tariff number, a parcel leaving the United States needs an
 * electronic export filing (15 CFR 30.37(a)): an ITN, which only the
 * exporter can file. Storelib never claims the exemption for a parcel that
 * is over it.
 */
export const US_FILING_LIMIT_USD_CENTS = 250_000

/** Does a parcel between these two countries cross a customs border? Not inside one country, nor between two countries of the EU. */
export function crossesCustoms(from: string | null | undefined, to: string | null | undefined): boolean {
  const a = String(from ?? "").trim().toUpperCase()
  const b = String(to ?? "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(a) || !/^[A-Z]{2}$/.test(b) || a === b) return false
  return !(isEuCountry(a) && isEuCountry(b))
}

const named = (titles: string[]) => {
  const unique = [...new Set(titles)]
  const shown = unique.slice(0, 3).map((t) => `"${t}"`).join(", ")
  return unique.length > 3 ? `${shown} and ${unique.length - 3} more` : shown
}

export type CustomsOutcome = { needed: false } | { needed: true; form: CustomsForm } | { needed: true; error: string }

export function customsFor(input: { from: string; to: string; currency: string; signer: string; providerName: string; lines: CustomsSource[] }): CustomsOutcome {
  if (!crossesCustoms(input.from, input.to)) return { needed: false }
  const from = input.from.trim().toUpperCase()
  const to = input.to.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()
  const lines = input.lines.filter((l) => l.quantity > 0)
  if (lines.length === 0) return { needed: true, error: "Choose the items in this parcel first: customs wants each one listed." }

  const noOrigin = lines.filter((l) => !/^[A-Za-z]{2}$/.test(String(l.originCountry ?? "").trim()))
  if (noOrigin.length) {
    return { needed: true, error: `This parcel goes to another country, so customs asks where each item was made. Add the country of origin to ${named(noOrigin.map((l) => l.title))} (the product's Shipping section, Customs info), then get rates again.` }
  }
  const noWeight = lines.filter((l) => !(l.gramsEach > 0))
  if (noWeight.length) {
    return { needed: true, error: `This parcel goes to another country, so customs asks for each item's weight. Add the weight to ${named(noWeight.map((l) => l.title))} (the product's Shipping section), then get rates again.` }
  }

  const out: CustomsLine[] = []
  const worthless: string[] = []
  for (const l of lines) {
    const list = Math.max(0, Math.round(l.unitCents)) * l.quantity
    /* Its share of the line's discount: the whole of it when the whole line is in the parcel. */
    const share = l.lineQuantity > 0 ? Math.round((Math.max(0, l.lineDiscountCents) * l.quantity) / l.lineQuantity) : 0
    const paid = Math.max(0, list - share)
    /* Given away (a free gift, a 100% code): declared at its own price, which is its value. */
    const cents = paid > 0 ? paid : list
    if (!(cents > 0)) {
      worthless.push(l.title)
      continue
    }
    const hs = String(l.hsCode ?? "").replace(/[^0-9]/g, "")
    out.push({
      description: [l.title, l.variantName].filter(Boolean).join(", ").slice(0, 200) || "Item",
      quantity: l.quantity,
      grams: Math.max(1, Math.round(l.gramsEach * l.quantity)),
      cents,
      currency,
      originCountry: String(l.originCountry).trim().toUpperCase(),
      hsCode: hs.length >= 4 ? hs : null,
      sku: l.sku?.trim() ? l.sku.trim() : null,
    })
  }
  if (worthless.length) {
    return { needed: true, error: `Customs asks for each item's value, and ${named(worthless)} has no price on this order. Buy this label in ${input.providerName}, where you can enter it.` }
  }

  let usExemption: CustomsForm["usExemption"] = null
  if (from === "US" && currency === "USD") {
    /* The limit is per tariff number; items with none are counted together, which can only be stricter. */
    const byTariff = new Map<string, number>()
    for (const l of out) byTariff.set(l.hsCode ?? "", (byTariff.get(l.hsCode ?? "") ?? 0) + l.cents)
    if ([...byTariff.values()].some((cents) => cents > US_FILING_LIMIT_USD_CENTS)) {
      return { needed: true, error: `This parcel is worth more than $2,500, so US customs wants an export filing (an ITN) from you before it ships. Storelib can't file it. Buy this label in ${input.providerName}, where you can enter your ITN.` }
    }
    usExemption = to === "CA" ? "30.36" : "30.37a"
  }
  return { needed: true, form: { lines: out, signer: input.signer.trim().slice(0, 100) || "Store", usExemption } }
}
