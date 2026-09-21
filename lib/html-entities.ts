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

/**
 * ===========================================================================
 *  THE SAME TEXT, WITH NO MARKUP IN IT, FOR SOMEWHERE THAT SHOWS NO MARKUP
 * ===========================================================================
 * A product shared to WhatsApp previewed as
 *
 *     <div class="w-full my-[1px]"><div data-slate-node="element" …
 *
 * because the description is rich text stored as HTML and it was handed to
 * the page's meta description untouched. A meta description is plain text by
 * definition: every reader of it — a chat app's preview, a search result, a
 * card on a social network — prints exactly what it is given.
 *
 * BLOCKS BECOME SPACES, not nothing. Removing `</p><p>` without leaving a gap
 * runs the last word of one paragraph into the first word of the next, and a
 * preview is mostly made of the first sentence or two, so that shows up
 * immediately. Anything that was a line in the source becomes a space here.
 *
 * WHAT IT IS NOT FOR: this is a summary, not a sanitiser. It is for putting
 * text somewhere that will not render HTML. Nothing that builds HTML should
 * use it — a tag stripper is the wrong tool for that and always has been.
 */

/** Tags after which words must not run together. */
const BLOCKY = /<\/?(?:p|div|br|li|ul|ol|tr|td|th|h[1-6]|section|article|header|footer|blockquote|pre|figure|figcaption)\b[^>]*>/gi

export function plainSummary(input: string | null | undefined, maxChars = 200): string {
  if (!input) return ""
  const text = decodeHtmlEntities(
    input
      /* A script or a style would otherwise contribute its CONTENTS as text. */
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(BLOCKY, " ")
      .replace(/<[^>]*>/g, ""),
  )
    /* Every kind of space, including the non-breaking one a decode just
       produced, collapsed to one. */
    .replace(/\s+/g, " ")
    .trim()

  if (text.length <= maxChars) return text
  /* Cut at a word rather than mid-syllable, unless the first word is longer
     than the whole budget. */
  const cut = text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
