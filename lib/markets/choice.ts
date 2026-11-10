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
import { naturalCountry } from "./market-countries"
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
  /** The charge note in the page's language (lib/markets/checkout-words chargeNoteIn); without it, the English. */
  say?: (display: string, charge: string) => string | null
}): SiteLanguageChoice {
  const all = [input.defaultLanguage, ...input.others]
  const code = (input.locale && all.find((l) => l.toLowerCase() === input.locale!.toLowerCase())) || input.defaultLanguage
  /*
    A CURRENCY IS NAMED BY ITS CURRENCY, NEVER BY ITS MARKET (round Q). The
    label was `${market name} (${currency})`, so a market a creator called
    "All" (every other country) offered "All (BRL R$)" next to "EUR €": a
    word of the creator's settings in the visitor's switch. And two markets
    in one currency offered it twice. One option per currency now, labelled
    "EUR €"; where two markets share it, the one the page is priced in
    stands for it, else the first (the store's own first of all).
  */
  const current = input.pricing ? input.pricing.market.id : "home"
  const offered =
    input.fresh && input.markets.length
      ? [{ id: "home", label: currencyLabel(input.base), country: "home", code: input.base.toUpperCase() }, ...input.markets.filter((m) => m.countries.length).map((m) => ({ id: m.id, label: currencyLabel(m.currency), country: naturalCountry(m.currency, m.countries) ?? m.countries[0], code: m.currency.toUpperCase() }))]
      : []
  /* In the place of the first of its currency, so the store's own stays first. */
  const currencies = offered.flatMap((o, i) => {
    const same = offered.filter((x) => x.code === o.code)
    if (offered.indexOf(same[0]) !== i) return []
    return [same.find((x) => x.id === current) ?? same[0]]
  })
  return {
    code,
    defaultLanguage: input.defaultLanguage,
    languages: all.map((c) => ({ code: c, name: languageName(c) })),
    ...(currencies.length > 1
      ? {
          currency: {
            options: currencies,
            current: currencies.some((o) => o.id === current) ? current : "home",
            /* Said plainly before anyone pays, only when the card is charged in another currency than the one shown. */
            note: input.pricing ? (input.say ?? chargeNote)(input.pricing.currency, input.charge) : null,
          },
        }
      : {}),
  }
}
