import "server-only"

/**
 * The language a website's checkout is drawn in: the one picked on the
 * checkout itself, else the language of the page the visitor came from (its
 * Back address: "/fr/cart" is French, "/cart" the website's default), else,
 * only when that page is unknown, the one they chose on the website
 * (sl_lang); always one of the website's published languages, else the
 * website's own. What it settles on is kept with the order, and every email
 * and page about the order after it reads it (lib/markets/buyer-language.ts). With it, the approved translations the
 * checkout shows (lib/markets/checkout-words.ts checkoutWordsIn: the store's
 * own words, then curated, then machine; lib/checkout-text) and the map the order's
 * titles are translated with (checkout-quote.ts).
 */
import { cachedTranslations } from "./server"
import { siteLanguages } from "./live"
import { localeFromPath } from "./locales"
import { checkoutWordsIn } from "./checkout-words"
import { checkoutOverrides } from "@/lib/checkout-text/server"
import { isBuiltInWordKey, isEnglish, translationMap, type TranslationMap } from "./translate"
import { buyerLanguage, type BuyerLanguageFacts } from "./buyer-language"

export interface CheckoutLanguage {
  lang: string
  words: Record<string, string>
  map: TranslationMap | null
  /** The website's own language and its published ones, for the checkout's own language selector. */
  available?: string[]
}

/**
 * The published language asked for, or null for the website's own.
 *
 * THE PAGE THEY CAME FROM DECIDES WHEN THERE IS ONE. A page with no language
 * in its address (/cart, /products/mug) is in the website's default
 * language, so the checkout opened from it is too. The remembered choice
 * (sl_lang) is read only when the checkout does not know the page: it is a
 * cookie from any earlier visit, which the proxy can also write from the
 * browser's language or the visitor's country, and it used to win over an
 * English /cart, so an English store's checkout, and every email and page
 * of the order after it, came out in Romanian.
 */
export function pickCheckoutLanguage(others: readonly string[], back: string | null | undefined, chosen: string | null | undefined): string | null {
  const path = back ? (() => { try { return new URL(back, "https://x.invalid").pathname } catch { return null } })() : null
  if (path) return localeFromPath(path, others)?.locale ?? null
  const c = (chosen ?? "").trim().toLowerCase()
  return (c && others.find((l) => l.toLowerCase() === c)) || null
}

/**
 * `picked`: chosen on the checkout itself (its language selector, ?lang=),
 * which wins over the page the visitor came from; the website's own
 * language is a choice too.
 */
export async function checkoutLanguage(creatorId: string, back: string | null | undefined, chosen: string | null | undefined, picked?: string | null): Promise<CheckoutLanguage> {
  const langs = await siteLanguages(creatorId)
  const available = [langs.defaultLanguage, ...langs.others]
  const p = (picked ?? "").trim().toLowerCase()
  const pickedOwn = !!p && p === langs.defaultLanguage.toLowerCase()
  const asked = pickedOwn ? null : (p && langs.others.find((l) => l.toLowerCase() === p)) || pickCheckoutLanguage(langs.others, back, chosen)
  /* The store's own words for the language (Settings › Checkout › Checkout text), read beside its translations. */
  const lang = asked ?? langs.defaultLanguage
  const overridesRead = checkoutOverrides(creatorId, lang).catch(() => ({}) as Record<string, string>)
  if (!asked) {
    /* The website's own language, when it is not English: its translations of the checkout's words (translate.ts BUILT_IN_GROUPS). */
    if (isEnglish(langs.defaultLanguage)) return { lang, words: checkoutWordsIn(lang, null, await overridesRead), map: null, available }
    const [all, overrides] = await Promise.all([cachedTranslations(creatorId, lang).catch(() => []), overridesRead])
    const rows = all.filter((r) => r.status === "approved" && isBuiltInWordKey(r.key))
    return { lang, words: checkoutWordsIn(lang, translationMap(rows), overrides), map: null, available }
  }
  const [rows, overrides] = await Promise.all([cachedTranslations(creatorId, asked).catch(() => []), overridesRead])
  const map = translationMap(rows.filter((r) => r.status === "approved"))
  return { lang: asked, words: checkoutWordsIn(asked, map, overrides), map, available }
}

/**
 * A page about a placed order (its receipt, its order page, its thank you
 * page, order help, the review form) in the order's language and its words:
 * lib/markets/buyer-language.ts decides which, the same rule as its emails.
 * English with no words for an order bought on Storelib, or when the
 * store's languages cannot be read.
 */
export async function buyerPageLanguage(creatorId: string, facts: Omit<BuyerLanguageFacts, "defaultLanguage" | "published">): Promise<CheckoutLanguage> {
  if (facts.channel === "storelib") return { lang: "en", words: {}, map: null }
  const langs = await siteLanguages(creatorId).catch(() => null)
  if (!langs) return { lang: "en", words: {}, map: null }
  const { lang } = buyerLanguage({ ...facts, defaultLanguage: langs.defaultLanguage, published: langs.others })
  return checkoutLanguage(creatorId, null, null, lang)
}
