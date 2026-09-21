/**
 * ===========================================================================
 *  A DESCRIPTION SHOWS THE CHARACTER, NOT ITS NAME
 * ===========================================================================
 * A product's description read
 *
 *     ...so everyone can purchase calligraphy &nbsp; affordable...
 *
 * on the live page, with the entity spelled out in the middle of a sentence.
 *
 * The description is written in a rich text editor and stored as HTML, and
 * the renderer decides how to draw it by looking for TAGS. A description
 * whose formatting has been stripped — pasted as plain text, or saved
 * through something that removed the markup — keeps its entities and loses
 * its tags, so it fails that test, is treated as plain text, and every
 * `&nbsp;` in it is printed as six characters.
 *
 * That is the right test to keep: text with no tags in it IS text, and
 * feeding it to a HTML renderer would be worse. What was missing is that
 * text out of a HTML field is still encoded, so it has to be decoded before
 * it is shown.
 *
 * ONE PASS, WHICH IS THE WHOLE CARE HERE. Decoding `&amp;` first and the
 * rest afterwards turns `&amp;nbsp;` — which is how a creator writes the
 * literal text "&nbsp;" — into a space, and there is no way back from that.
 * A single scan cannot do it: whatever an entity decodes to is output, never
 * re-read.
 *
 * SAFE TO RENDER. What comes out of this goes into a React text node, so a
 * decoded `<` is escaped again on the way to the page and cannot become
 * markup. This must never be used to build HTML.
 */

/** The named entities a rich text field actually produces. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  middot: "·",
  bull: "•",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  times: "×",
  divide: "÷",
  laquo: "«",
  raquo: "»",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
}

/**
 * A code point that is not worth putting on a page: the C0 controls, the
 * surrogate halves, and anything past the last real character. An entity
 * naming one of those is left exactly as it was written rather than turned
 * into something invisible or replaced with a question mark in a box.
 */
function printable(code: number): boolean {
  if (!Number.isFinite(code)) return false
  if (code === 9 || code === 10 || code === 13) return true
  if (code < 32) return false
  if (code >= 0xd800 && code <= 0xdfff) return false
  return code <= 0x10ffff
}

export function decodeHtmlEntities(input: string): string {
  if (!input || input.indexOf("&") === -1) return input
  return input.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X"
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (!printable(code)) return whole
      return String.fromCodePoint(code)
    }
    /* Case sensitive, because HTML's named entities are: `&AMP;` is its own
       entity and `&Nbsp;` is not one at all. Anything unknown is left as the
       author typed it rather than guessed at. */
    const named = NAMED[body]
    return named === undefined ? whole : named
  })
}
