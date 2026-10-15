"use client"

/**
 * The checkout's words in the visitor's language (lib/markets/checkout-words.ts).
 * The website's checkout page reads the language from the page the visitor
 * came from and hands its approved translations here; every other checkout
 * (storelib.com's) has none and reads in English, as before.
 *
 *   const ct = useCt()
 *   ct("Enter your name.")
 *   ct("Pay {amount}", { amount })
 *
 * The sentences are listed by scripts/i18n/checkout-sentences.mjs, which
 * finds these calls; a sentence must be written out in the call, never
 * built, so it can be found and translated.
 */
import * as React from "react"
import { checkoutT, countryNameIn, type CheckoutT } from "@/lib/markets/checkout-words"
import { isRtl } from "@/lib/markets/locales"

interface CheckoutWordsValue {
  t: CheckoutT
  /** The language the checkout is drawn in ("fr"). */
  lang: string
}

const ENGLISH: CheckoutWordsValue = { t: checkoutT("en", {}), lang: "en" }
const Ctx = React.createContext<CheckoutWordsValue>(ENGLISH)

export function CheckoutWords({ lang, words, children }: { lang: string; words: Record<string, string>; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ t: checkoutT(lang, words), lang }), [lang, words])
  /* The page's own language and direction, for screen readers, hyphenation and a language written right to left. */
  React.useEffect(() => {
    const html = document.documentElement
    const was = { lang: html.lang, dir: html.dir }
    html.lang = lang
    html.dir = isRtl(lang) ? "rtl" : "ltr"
    return () => {
      html.lang = was.lang
      html.dir = was.dir
    }
  }, [lang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** The checkout's translator: the sentence in the visitor's language, or the English. */
export function useCt(): CheckoutT {
  return React.useContext(Ctx).t
}

/** The language the checkout is drawn in. */
export function useCheckoutLang(): string {
  return React.useContext(Ctx).lang
}

/** A country's name as the visitor reads it. */
export function useCountryName(): (code: string) => string {
  const lang = useCheckoutLang()
  return React.useCallback((code: string) => countryNameIn(code, lang), [lang])
}

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
