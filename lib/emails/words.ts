/**
 * ===========================================================================
 *  A BUYER'S EMAILS IN THE LANGUAGE THEY BOUGHT IN
 * ===========================================================================
 * The emails a store's buyer gets (order confirmed, shipped, a return, a
 * refund) write each sentence through et("…"), the English sentence being
 * the key, as the checkout's words are (lib/markets/checkout-words.ts). Each
 * is a text of the website (Translate › Order emails, key `email:<hash>`),
 * drafted by Storelib AI and translated by the hourly job with the rest. An
 * email is built in the language the order was placed in (its origin's
 * `lang`, lib/orders/order-source.ts), with that store's approved
 * translations; a sentence with none reads in English.
 *
 * The templates are synchronous, so the language is set around one build
 * (inEmailLanguage) rather than handed through every helper: the templates
 * keep their signatures, and English is exactly what it was.
 */
import { formatMessage, type Vars } from "@/lib/i18n/text"

let words: Record<string, string> | null = null
let lang = "en"

/** A sentence in the email's language, its {blanks} filled; English when it has no translation. */
export function et(source: string, vars?: Vars): string {
  const template = (words && words[source]) || source
  if (!vars && template.indexOf("{") === -1) return template
  return formatMessage(template, vars ?? {}, lang)
}

/** The language the email being built is in ("fr"), for its <html lang> and its dates. */
export function emailLanguage(): string {
  return lang
}

/** Builds one email in a language. Synchronous only: the language is the build's, and put back after it. */
export function inEmailLanguage<T>(language: string | null | undefined, translations: Record<string, string> | null | undefined, build: () => T): T {
  const was = { words, lang }
  words = translations && Object.keys(translations).length ? translations : null
  lang = language || "en"
  try {
    return build()
  } finally {
    words = was.words
    lang = was.lang
  }
}
