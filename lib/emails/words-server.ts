import "server-only"

/**
 * The language a buyer's email is written in, and its words: the language
 * the order was placed in (its origin's `lang`, lib/orders/order-source.ts)
 * when it is still one of the website's published languages, else the
 * website's own. With the store's approved translations of the email
 * sentences in it (lib/markets/checkout-words emailWordsFrom); a website
 * written in another language than English has its own (translate.ts
 * BUILT_IN_GROUPS).
 */
import { siteLanguages } from "@/lib/markets/live"
import { cachedTranslations } from "@/lib/markets/server"
import { emailWordsIn } from "@/lib/markets/checkout-words"
import { checkoutOverrides } from "@/lib/checkout-text/server"
import { isBuiltInWordKey, isEnglish, translationMap } from "@/lib/markets/translate"
import { ownWordsApply, type BuyerChannel } from "./buyer-channel"

export interface EmailLanguage {
  lang: string
  words: Record<string, string>
  /** The website's own language: the store's own email wording (Settings › Customer emails) is in it. */
  own: boolean
}

export async function emailLanguageFor(creatorId: string, asked: unknown): Promise<EmailLanguage> {
  const langs = await siteLanguages(creatorId).catch(() => null)
  if (!langs) return { lang: "en", words: {}, own: true }
  const want = typeof asked === "string" ? asked.toLowerCase() : ""
  const other = want ? langs.others.find((l) => l.toLowerCase() === want) ?? null : null
  /* The store's own checkout words (Settings › Checkout › Checkout text) where an email says the same sentence, and Storelib's curated words (lib/checkout-text/words.ts). */
  const lang = other ?? langs.defaultLanguage
  const overridesRead = checkoutOverrides(creatorId, lang).catch(() => ({}) as Record<string, string>)
  if (other) {
    const [rows, overrides] = await Promise.all([cachedTranslations(creatorId, other).catch(() => []), overridesRead])
    return { lang: other, words: emailWordsIn(other, translationMap(rows.filter((r) => r.status === "approved")), overrides), own: false }
  }
  if (isEnglish(lang)) return { lang, words: emailWordsIn(lang, null, await overridesRead), own: true }
  const [rows, overrides] = await Promise.all([cachedTranslations(creatorId, lang).catch(() => []), overridesRead])
  return { lang, words: emailWordsIn(lang, translationMap(rows.filter((r) => r.status === "approved" && isBuiltInWordKey(r.key))), overrides), own: true }
}

/**
 * THE LANGUAGE BY WHERE THEY BOUGHT (lib/emails/buyer-channel.ts). On the
 * website: the language they used there, or the website's own. Anywhere on
 * Storelib (the creator page, Explore, a community): English, with the
 * store's own English checkout words where an email says the same sentence,
 * and the store's own email wording only when the website is written in
 * English too (it is written in the website's language).
 */
export async function buyerEmailLanguage(creatorId: string, channel: BuyerChannel, asked: unknown): Promise<EmailLanguage> {
  if (channel === "website") return emailLanguageFor(creatorId, asked)
  const [langs, overrides] = await Promise.all([siteLanguages(creatorId).catch(() => null), checkoutOverrides(creatorId, "en").catch(() => ({}) as Record<string, string>)])
  return { lang: "en", words: emailWordsIn("en", null, overrides), own: ownWordsApply("en", langs?.defaultLanguage) }
}

/** The website's published languages, its own first, for the previews in Emails. */
export async function websiteEmailLanguages(creatorId: string): Promise<{ defaultLanguage: string; others: string[] }> {
  const langs = await siteLanguages(creatorId).catch(() => null)
  return { defaultLanguage: langs?.defaultLanguage || "en", others: langs?.others ?? [] }
}
