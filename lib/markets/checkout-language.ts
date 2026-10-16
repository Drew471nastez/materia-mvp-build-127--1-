import "server-only"

/**
 * The language a website's checkout is drawn in: the language of the page
 * the visitor came from (its Back address, "/fr/cart"), else the one they
 * chose on the website (sl_lang), when it is one of the website's published
 * languages; else the website's own. With it, the approved translations the
 * checkout shows (lib/markets/checkout-words.ts) and the map the order's
 * titles are translated with (checkout-quote.ts).
 */
import { cachedTranslations } from "./server"
import { siteLanguages } from "./live"
import { localeFromPath } from "./locales"
import { checkoutWordsFrom } from "./checkout-words"
import { isBuiltInWordKey, isEnglish, translationMap, type TranslationMap } from "./translate"

export interface CheckoutLanguage {
  lang: string
  words: Record<string, string>
  map: TranslationMap | null
  /** The website's own language and its published ones, for the checkout's own language selector. */
  available?: string[]
}

/** The published language asked for, or null for the website's own. */
export function pickCheckoutLanguage(others: readonly string[], back: string | null | undefined, chosen: string | null | undefined): string | null {
  const path = back ? (() => { try { return new URL(back, "https://x.invalid").pathname } catch { return null } })() : null
  const fromPath = path ? localeFromPath(path, others) : null
  if (fromPath) return fromPath.locale
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
  if (!asked) {
    /*
      The website's own language: its translations of the checkout's words
      (translate.ts BUILT_IN_GROUPS), Storelib's hand written ones included.
      In English, only the store's own wording (Settings › Checkout ›
      Checkout text, source "manual"): English is what the code says.
    */
    const english = isEnglish(langs.defaultLanguage)
    const rows = (await cachedTranslations(creatorId, langs.defaultLanguage).catch(() => [])).filter((r) => r.status === "approved" && isBuiltInWordKey(r.key) && (!english || r.source === "manual"))
    return { lang: langs.defaultLanguage, words: rows.length ? checkoutWordsFrom(translationMap(rows)) : {}, map: null, available }
  }
  const rows = await cachedTranslations(creatorId, asked).catch(() => [])
  const map = translationMap(rows.filter((r) => r.status === "approved"))
  return { lang: asked, words: checkoutWordsFrom(map), map, available }
}
