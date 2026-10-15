/**
 * ===========================================================================
 *  WHAT A WEBSITE'S LANGUAGE AND CURRENCY SELECTOR OFFERS
 * ===========================================================================
 * The choice a page of a builder theme draws under its footer
 * (components/website-builder/theme/language-switch.tsx): every published
 * language, and the currencies prices can be shown in, the store's own and
 * each active market's that a visitor can be in (it has countries), while
 * the day's exchange rates are fresh. The live site (lib/markets/live.ts
 * languageChoice) and the builder's canvas (use-preview-market.ts) both ask
 * this, so the canvas offers what the website does.
 *
 * A market's currency is the one its checkout charges when Storelib can
 * charge it (lib/markets/checkout-charge); for any other, `note` says what
 * the card is charged in, so no currency is offered as one it is not.
 *
 * Pure.
 */
import type { SiteLanguageChoice } from "@/components/website-builder/theme/language-switch"
import { languageName } from "./locales"
import { chargeNote, currencyMarkOf } from "./money"
import type { Pricing } from "./pricing"

/** A market as the selector reads it. */
export interface ChoiceMarket {
  id: string
  name: string
  currency: string
  countries: string[]
}

/** A currency as the selector names it, its code and the mark its prices are written with: "RON lei", "EUR €", "PLN zł". */
export function currencyLabel(code: string): string {
  const mark = currencyMarkOf(code).mark
  return mark && mark !== code ? `${code} ${mark}` : code
}

export function languageChoiceOf(input: {
  defaultLanguage: string
  /** The published languages other than the default, in the store's order. */
  others: string[]
  /** The language the page is drawn in; null, the website's own. */
  locale: string | null | undefined
  markets: ChoiceMarket[]
  /** Whether the day's exchange rates are fresh (lib/markets/money fxFresh). */
  fresh: boolean
  /** The market the page's prices are shown in; null, the store's own. */
  pricing: Pricing | null
  /** The store's own currency. */
  base: string
  /** What the card is charged in. */
  charge: string
}): SiteLanguageChoice {
  const all = [input.defaultLanguage, ...input.others]
  const code = (input.locale && all.find((l) => l.toLowerCase() === input.locale!.toLowerCase())) || input.defaultLanguage
  const currencies =
    input.fresh && input.markets.length
      ? [{ id: "home", label: currencyLabel(input.base), country: "home" }, ...input.markets.filter((m) => m.countries.length).map((m) => ({ id: m.id, label: `${m.name} (${currencyLabel(m.currency)})`, country: m.countries[0] }))]
      : []
  return {
    code,
    defaultLanguage: input.defaultLanguage,
    languages: all.map((c) => ({ code: c, name: languageName(c) })),
    ...(currencies.length > 1
      ? {
          currency: {
            options: currencies,
            current: input.pricing ? input.pricing.market.id : "home",
            /* Said plainly before anyone pays, only when the card is charged in another currency than the one shown. */
            note: input.pricing ? chargeNote(input.pricing.currency, input.charge) : null,
          },
        }
      : {}),
  }
}
