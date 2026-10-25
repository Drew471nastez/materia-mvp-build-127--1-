/**
 * ===========================================================================
 *  A MACHINE TRANSLATION IS KEPT ONLY WHEN IT IS SOUND
 * ===========================================================================
 * On top of ./draft-check.ts (every placeholder, Liquid tag, HTML tag, link
 * and e-mail address, counted), a translation from a model must also:
 *
 *   - keep the store's name and every protected term the original has
 *   - keep every number: prices, sizes, codes, percentages (compared as
 *     digits, so "1,000.50" and "1.000,50" are the same number)
 *   - add nothing: a model that answers "Here is the translation: ..." or
 *     explains itself is several times longer than any translation is
 *   - not be empty
 *
 * One that fails is not kept: the original goes on showing and the text is
 * asked again (the next translator, or the next run). Pure, for the tests.
 */
import { keepsFixedParts } from "./draft-check"

/** Digits written in other scripts (Arabic, Persian, Devanagari, Bengali, Thai, full width), as 0-9. */
function westernDigits(t: string): string {
  return t.replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u09e6-\u09ef\u0e50-\u0e59\uff10-\uff19]/g, (c) => {
    const code = c.charCodeAt(0)
    for (const zero of [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0e50, 0xff10]) if (code >= zero && code <= zero + 9) return String(code - zero)
    return c
  })
}

/**
 * Every number of a text outside its markup, placeholders and links, as
 * digits, sorted: "€1,299.00 for 2" and "2 pour 1 299,00 €" are the same
 * ("129900", "2"). Order and grouping are free (a sentence moves its
 * numbers, a language groups thousands its own way: a point, a comma, an
 * apostrophe, a narrow space, or a space before three digits); a number
 * added, dropped or changed, or its digits swapped ("€39" written "€93"),
 * is not.
 */
export function numbersOf(text: string): string {
  const plain = westernDigits(text).replace(/<[^>]*>/g, " ").replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{[A-Za-z_][\w.]*\}/g, " ").replace(/\bhttps?:\/\/\S+/g, " ").replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, " ")
  return (plain.match(/\d(?:(?:[.,'\u00a0\u202f]| (?=\d{3}(?!\d)))?\d)*/g) ?? []).map((n) => n.replace(/\D/g, "")).sort().join(",")
}

/** Scripts written with far fewer characters than Latin text says the same. */
const DENSE = /^(zh|ja|ko|th)/i

/** Why a translation is refused, or null when it is sound. */
export function translationProblem(source: string, translated: string, opts: { keep?: string[]; to?: string; from?: string } = {}): string | null {
  const out = translated.trim()
  if (!out) return "empty"
  if (!keepsFixedParts(source, out)) return "lost a placeholder, tag or link"
  for (const k of opts.keep ?? []) if (k && source.includes(k) && !out.includes(k)) return "changed a protected name"
  const a = numbersOf(source)
  const b = numbersOf(out)
  if (a !== b) return "changed a number"
  const visible = (t: string) => t.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().length
  const s = visible(source)
  const t = visible(out)
  if (s >= 12) {
    const max = DENSE.test(opts.from ?? "") ? 6 : 3.5
    const min = DENSE.test(opts.to ?? "") ? 0.12 : 0.3
    if (t > s * max + 20) return "added text"
    if (t < s * min) return "left text out"
  }
  if (/^(here is|here's|translation:|sure[,!])/i.test(out) && !/^(here is|here's|translation:|sure[,!])/i.test(source.trim())) return "added text"
  return null
}

export const soundTranslation = (source: string, translated: string, opts: { keep?: string[]; to?: string; from?: string } = {}) => translationProblem(source, translated, opts) === null
