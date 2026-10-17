/**
 * ===========================================================================
 *  THE CHECKOUT'S WORDS IN A LANGUAGE: WHO WINS
 * ===========================================================================
 * Why this exists: the checkout's words used to be machine translated per
 * store, sentence by sentence, with no context. "Pay {shop}" was cut around
 * its placeholder and the bare word "Pay" went to a free translation memory,
 * which answered with the noun ("Salariul", a monthly wage, in Romanian);
 * "Remove" came back as a noun too ("Îndepărtare"), "Apply" as "squeeze",
 * "Ship" as "a boat". The answer was then kept in the shared memory and
 * handed to every store that asked again.
 *
 * Now each sentence is read from, first to last:
 *
 *   1. the store's own words for it (Settings › Checkout › Checkout text,
 *      lib/checkout-text/registry.ts), only for the sentences a store may
 *      reword
 *   2. a translation the merchant wrote in Translate › Checkout
 *   3. Storelib's curated dictionary (./dict), written and checked by a
 *      person: Romanian complete, the most seen sentences in eight more
 *   4. an approved machine translation (now asked with context, by a
 *      translator that reads whole sentences: lib/markets/translate-ai.ts)
 *   5. the English
 *
 * Pure: the checkout page, its emails, the editor and the tests agree.
 */
import ro from "./dict/ro"
import { CORE_DICTIONARIES } from "./dict/core"
import { EDITABLE_TEXTS } from "./registry"
import type { TranslationMap } from "@/lib/markets/translate"
import { sourceHash } from "@/lib/markets/translate"

const CURATED: Readonly<Record<string, Record<string, string>>> = { ro, ...CORE_DICTIONARIES }

/** The curated words for a language: its own ("pt-BR"), else its base language's ("ro-MD" reads Romanian). Empty for English or a language with none. */
export function curatedWords(language: string | null | undefined): Record<string, string> {
  const lang = (language ?? "").trim()
  if (!lang || /^en(-|$)/i.test(lang)) return {}
  const exact = Object.keys(CURATED).find((k) => k.toLowerCase() === lang.toLowerCase())
  if (exact) return CURATED[exact]
  const base = lang.split("-")[0].toLowerCase()
  return CURATED[base] ?? {}
}

/** The languages Storelib has curated checkout words for. */
export const curatedLanguages = (): string[] => Object.keys(CURATED)

/**
 * What a translator needs to know about a short sentence that reads two
 * ways out of context. Sent with the sentence to the machine translator
 * (lib/markets/open-translate.ts) and shown under it in the editor.
 */
const NOTES: Record<string, string> = {
  ...Object.fromEntries(EDITABLE_TEXTS.map((e) => [e.source, e.note])),
  "Pay {amount} in cash when you pick it up.": "Instruction to the buyer. A verb.",
  "Pay {amount} in cash when it's delivered.": "Instruction to the buyer. A verb.",
  "Open": "A pickup point's state: open for business now.",
  "Track": "A button: follow the parcel. A verb.",
  "Track package": "A button: follow the parcel.",
  "Tip": "A gratuity for the shop, as a row on a receipt.",
  "Other": "A tip choice: another amount the buyer types.",
  "None": "A tip choice: no tip.",
  "Choose": "A button that picks an option. A verb.",
  "Option": "A product option, such as a size.",
  "Standard": "The name of a delivery speed.",
  "Copy": "A button that copies an email address. A verb.",
  "Print": "A button that prints the receipt. A verb.",
  "Send": "A button that sends a message. A verb.",
  "Cancel": "A button that closes a form without sending. A verb.",
  "Close": "A button that closes a panel. A verb.",
  "Resend": "A button that sends the receipt again. A verb.",
  "Download": "A button that downloads a file. A verb.",
  "Preparing": "A download being prepared.",
  "Processing": "The pay button while a payment is in progress.",
  "Sending": "A button while an email is being sent.",
  "Adding": "A button while the order is added to a library.",
  "Shipped": "An order's state: it has been sent.",
  "Delivered": "An order's state: it arrived.",
  "Confirmed": "An order's state.",
  "Cancelled": "An order's state.",
  "Refunded": "An order's state: the money was given back.",
  "Pickup": "A delivery choice: the buyer collects the order.",
  "Items": "The products in the order.",
  "Yours": "Products the buyer already owns.",
  "Course": "An online course the buyer bought.",
  "Seller": "The shop selling the order.",
  "Area": "A part of a country in an address, like a district.",
  "County": "A part of a country in an address.",
  "State": "A part of a country in an address, like a US state.",
}

export function noteFor(source: string): string | null {
  return NOTES[source] ?? null
}

export interface LayerInput {
  /** Every sentence the words are for (lib/markets/checkout-words checkoutSentences, or the emails'). */
  sentences: readonly string[]
  language: string
  /** The store's approved translations in that language (Translate › Checkout), by key. */
  rows?: TranslationMap | null
  keyOf: (sentence: string) => string
  /** The store's own words (registry ids already turned into their English sentence). */
  overrides?: Record<string, string> | null
}

/** The words a checkout in `language` draws, by English sentence: only what differs from the English. */
export function layeredWords(input: LayerInput): Record<string, string> {
  const curated = curatedWords(input.language)
  const words: Record<string, string> = {}
  for (const s of input.sentences) {
    const row = input.rows?.get(input.keyOf(s))
    const usable = row && row.status === "approved" && row.value.trim() ? row : null
    /* The merchant's own translation stays theirs, even once its English changed (lib/markets/translate.ts needsReview). */
    const manual = usable && usable.source === "manual" ? usable.value : null
    /* A machine translation only while it was written for the English as it is now. */
    const machine = usable && usable.source === "ai" && (!usable.sourceHash || usable.sourceHash === sourceHash(s)) ? usable.value : null
    const v = input.overrides?.[s] || manual || curated[s] || machine
    if (v && v !== s) words[s] = v
  }
  return words
}

/** The default a store sees for a sentence in the editor: everything but its own words. */
export function defaultFor(source: string, language: string, rows: TranslationMap | null | undefined, keyOf: (s: string) => string): string {
  return layeredWords({ sentences: [source], language, rows, keyOf })[source] ?? source
}
