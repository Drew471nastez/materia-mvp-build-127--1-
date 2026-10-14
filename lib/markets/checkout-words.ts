/**
 * ===========================================================================
 *  THE CHECKOUT IN THE WEBSITE'S LANGUAGES
 * ===========================================================================
 * The website's own checkout (app/checkout/site) draws its words through
 * ct("…") (app/checkout/parts/words.tsx), the English sentence being the key
 * as in the dashboard. Each sentence is a text of the website like any other
 * (Translate › Checkout, key `checkout:<hash of the sentence>`): drafted by
 * Storelib AI with the rest, translated automatically when that is on, and
 * written by the merchant when they want their own. The checkout shows the
 * approved translation of each in the visitor's language and the English
 * where there is none, so a page is never half empty.
 *
 * Country names come from the browser's own list in that language
 * (Intl.DisplayNames); the address fields' names (ZIP code, Prefecture) are
 * texts here too, since they differ by country.
 *
 * Pure, so the server, the checkout and the tests agree.
 */
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { addressFormat } from "@/lib/address/format"
import { addressWordsFor, inSentence, taxIdFor } from "@/lib/checkout/business"
import { FAIL_COPY } from "@/lib/net/request"
import { BUYER_UNAVAILABLE } from "@/lib/payments/stripe/readiness"
import { formatMessage, type Vars } from "@/lib/i18n/text"
import { CHECKOUT_SENTENCES } from "./checkout-words.generated"
import { sourceHash, valueFor, type Translatable, type TranslateOpts, type TranslationMap } from "./translate"

/** "zip code", "ZIP code" kept: a label put inside a sentence, lowered only where that reads right. */
export function lowerLabel(label: string): string {
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)
}

/** The address fields' own names, each country's, and the sentences that name them. */
export function addressSentences(): string[] {
  const out = new Set<string>()
  for (const code of COUNTRY_CODES) {
    const f = addressFormat(code)
    out.add(f.postal.label)
    out.add(`Enter the ${lowerLabel(f.postal.label)}.`)
    if (f.region) {
      out.add(f.region.label)
      out.add(`Choose your ${lowerLabel(f.region.label)}.`)
      out.add(`Choose your ${lowerLabel(f.region.label)} to see delivery options.`)
    }
  }
  return [...out]
}

/** Buying for a business: each country's names for its postal code, its region and its tax number, and the sentences that name them. */
export function businessSentences(): string[] {
  const out = new Set<string>()
  for (const code of COUNTRY_CODES) {
    const w = addressWordsFor(code)
    out.add(w.postal)
    out.add(w.region)
    out.add(`Enter the ${inSentence(w.postal)}.`)
    out.add(`Check the ${inSentence(w.postal)}.`)
    out.add(taxIdFor(code).label)
  }
  return [...out]
}

let all: string[] | null = null
/** Every sentence the checkout can show, once each. */
export function checkoutSentences(): string[] {
  all = all ?? [...new Set([...CHECKOUT_SENTENCES, ...addressSentences(), ...businessSentences(), ...Object.values(FAIL_COPY), BUYER_UNAVAILABLE])]
  return all
}

export const checkoutKey = (sentence: string) => `checkout:${sourceHash(sentence)}`

/** Every sentence as a line in Translate › Checkout. */
export function checkoutTranslatables(): Translatable[] {
  return checkoutSentences().map((s) => ({ key: checkoutKey(s), source: s, label: s.length > 60 ? `${s.slice(0, 57)}...` : s, where: "Checkout", multiline: s.length > 80 }))
}

/** The approved, current translation of each sentence that has one, by its English. */
export function checkoutWordsFrom(map: TranslationMap | null | undefined, opts: TranslateOpts = { approvedOnly: true, fresh: true }): Record<string, string> {
  const words: Record<string, string> = {}
  if (!map || map.size === 0) return words
  for (const s of checkoutSentences()) {
    const v = valueFor(map, checkoutKey(s), opts, s)
    if (v) words[s] = v
  }
  return words
}

export type CheckoutT = (source: string, vars?: Vars) => string

/** ct for one language: the sentence's translation, or the English, with {placeholders} filled the language's way. */
export function checkoutT(language: string, words: Record<string, string>): CheckoutT {
  const locale = language || "en"
  return (source, vars) => {
    const template = words[source] || source
    if (!vars && template.indexOf("{") === -1) return template
    return formatMessage(template, vars ?? {}, locale)
  }
}

/** A sentence a server route sends to the checkout, marked so it is listed and translated where it is shown. */
export function checkoutMsg<T extends string>(source: T): T {
  return source
}

/** A country's name in the checkout's language. */
export function countryNameIn(code: string, language: string): string {
  if (code === "XK") return "Kosovo"
  try {
    return new Intl.DisplayNames([language || "en", "en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}
