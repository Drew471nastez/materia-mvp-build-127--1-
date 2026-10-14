/**
 * The order a website's checkout shows, in the visitor's language: each
 * product's title (`product:<id>:title`), its option's name made of option
 * words ("Small / Red", translate.ts optionKey), and the options a line can
 * be changed to. Ids, prices and quantities are untouched, so what is
 * charged never depends on the language. Pure: the server's first frame and
 * the checkout route's quotes use the same function.
 */
import type { SiteQuote } from "@/lib/checkout/site-quote-server"
import { optionKey, valueFor, type TranslateOpts, type TranslationMap } from "./translate"

const OPTS: TranslateOpts = { approvedOnly: true, fresh: true }

export function localizeQuote(quote: SiteQuote, map: TranslationMap | null | undefined, opts: TranslateOpts = OPTS): SiteQuote {
  if (!map || map.size === 0) return quote
  const title = <T extends { productId: string; title: string }>(l: T): T => {
    const v = valueFor(map, `product:${l.productId}:title`, opts, l.title)
    return v ? { ...l, title: v } : l
  }
  const word = (text: string) => (text.trim() ? (valueFor(map, optionKey(text), opts, text.trim()) ?? text) : text)
  /* "Small / Red": each value the shop translated; a name that is not made of values stays as the merchant wrote it. */
  const name = (text: string | null) => (text ? text.split(" / ").map((p) => word(p.trim())).join(" / ") : text)
  const choices = quote.choices
    ? Object.fromEntries(
        Object.entries(quote.choices).map(([id, c]) => [
          id,
          {
            options: c.options.map((o) => ({ name: word(o.name), values: o.values.map(word) })),
            variants: c.variants.map((v) => ({ ...v, name: name(v.name) ?? v.name, values: v.values.map(word) })),
          },
        ]),
      )
    : quote.choices
  return {
    ...quote,
    lines: quote.lines.map((l) => ({ ...title(l), variantName: name(l.variantName) })),
    short: quote.short?.map(title),
    owned: quote.owned?.map(title),
    stockIssues: quote.stockIssues.map(title),
    adjusted: quote.adjusted?.map(title),
    choices,
  }
}
