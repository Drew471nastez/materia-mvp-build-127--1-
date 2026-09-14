/**
 * ===========================================================================
 *  SIX WORDS OF A BIO, ON ONE LINE
 * ===========================================================================
 * The product page's bar on a phone says who is selling: a picture, a name,
 * and one line of what they do. One line is the whole point, so the cut is
 * made HERE, in a string, rather than left to the layout.
 *
 * A CSS `truncate` alone would not do it. That cuts mid-word at whatever
 * width the phone happens to be, so the same bio reads "Handmade ceramic
 * ta…" on one device and "Handmade ceramic tablewa…" on the next, and a
 * long first word can fill the line on its own. Counting words gives the
 * same six words to everybody.
 *
 * `truncate` still belongs on the element underneath this, as the backstop
 * for six words that are each very long. Belt and braces: this decides what
 * is said, that stops it overflowing.
 */

/** Six is what the owner asked for, and six fits the line at 375px. */
export const BIO_WORD_LIMIT = 6

/**
 * The bio is a plain textarea, so it can arrive with newlines, runs of
 * spaces, and a trailing one. Any whitespace is a word break and collapses
 * to a single space: a bio written as three short lines has to read as one.
 */
export function shortBio(bio?: string | null, limit: number = BIO_WORD_LIMIT): string {
  const words = (bio ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  if (words.length === 0) return ""
  if (words.length <= limit) return words.join(" ")
  /*
    One ellipsis character, not three periods: three dots can be broken
    across a line end by the browser, and a single glyph cannot.
  */
  return `${words.slice(0, limit).join(" ")}…`
}
