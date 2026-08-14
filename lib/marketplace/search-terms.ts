/**
 * ===========================================================================
 *  TURNING WHAT SOMEBODY TYPED INTO SOMETHING THE CATALOGUE CAN ANSWER
 * ===========================================================================
 *
 * One `ilike '%<the whole thing>%'` across title, description and brand was the
 * entire search, and it fails in three ordinary ways that all look identical
 * from the outside — an empty page:
 *
 *   TWO WORDS IN THE WRONG ORDER. "geaca nike" is one substring, so it matches
 *   a listing titled "Geaca Nike" and NOT one titled "Nike geaca de piele".
 *   Nobody types the title; they type the two words they remember.
 *
 *   DIACRITICS. Half this country's keyboards do not have ă/â/î/ș/ț on them,
 *   and the other half does not bother. "barbati" and "bărbați" are the same
 *   word to every shopper and two unrelated strings to `ILIKE`.
 *
 *   A TYPO, OR SOMETHING THAT IS NOT A WORD AT ALL. "jordn", "adiddas",
 *   "awdadawdaw12". The first two are one keystroke from a real answer.
 *
 * So a query is TOKENISED, and the tokens are asked for in three widening
 * tiers. Each tier is only reached when the one before it found nothing at
 * all — the page never shows a looser answer while a tighter one exists:
 *
 *   all    every token must appear somewhere in the row. Same precision as
 *          before, minus the word-order accident.
 *   any    at least one token appears. "geaca nike de piele" stops being a
 *          four-word phrase that must be present verbatim.
 *   fuzzy  each token cut back to its stem, so "jordn" asks for "jor%" and
 *          finds the Jordans.
 *
 * WHY WIDENING TIERS AND NOT JUST "any". Because "any" ALWAYS matches something
 * on a two-word query, and an unranked page of "everything containing the word
 * de" is worse than an empty one — it is an empty one that also lies. The tiers
 * keep the good answer when there is a good answer, and the tier that was
 * actually used is reported back so the page can say so out loud.
 *
 * ---------------------------------------------------------------------------
 * EVERYTHING HERE PRODUCES PostgREST FILTER SYNTAX, so read `safeTerm` first.
 * ---------------------------------------------------------------------------
 */

/** Longer than this is a paste, not a search. */
export const MAX_TERM_LENGTH = 100

/** More than this and the query is noise — and each one is a condition. */
export const MAX_TOKENS = 6

/**
 * ===========================================================================
 *  USER INPUT GOING INTO A PostgREST FILTER
 * ===========================================================================
 *
 * `or=(title.ilike.%x%,description.ilike.%x%,brand.ilike.%x%)` is a STRING that
 * PostgREST parses, and the term came out of the address bar. Four characters
 * in it change the meaning of that string rather than the value inside it:
 *
 *   `,`  separates the conditions, so `?q=a,creator_id.eq.<uuid>` appends a
 *        condition of the caller's choosing to the OR group;
 *   `)`  closes the group early, which is a malformed filter and a 500;
 *   `%`  and `_` are LIKE wildcards, so `?q=%` is "match every row" — a full
 *        scan of the catalogue on a public URL that costs nothing to request.
 *
 * It could not leak an unpublished listing — `status = 'published'` is a
 * separate filter, ANDed with the whole group, and RLS is under that again. But
 * "it cannot read what it should not" is the floor, not the goal: a filter
 * somebody else can write conditions into is a bug whether or not today's
 * schema makes it exploitable.
 *
 * TWO DEFENCES, because either alone is thin. The value is QUOTED by the
 * builders below, which makes commas, parentheses and dots literal to
 * PostgREST's parser — that is what its own documentation prescribes for values
 * containing reserved characters. And the four characters quoting cannot help
 * with are removed here: `"` and `\` would end the quoting, and `%`/`_` are
 * wildcards to Postgres itself rather than to PostgREST, so no amount of
 * quoting makes them literal.
 *
 * Removed rather than escaped, and replaced by a SPACE rather than by nothing:
 * this is a search term, so "levi%s" becoming "levi s" still finds the jeans,
 * while "levis" would silently search for something the person did not type.
 *
 * The one `_` that ever reaches a pattern is put there deliberately by
 * `foldPattern`, AFTER this has run.
 */
export function safeTerm(raw: string): string {
  return raw.slice(0, MAX_TERM_LENGTH).replace(/[%_"\\]/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Words that are in every listing and therefore narrow nothing.
 *
 * Dropped so "geaca de piele" is two real words rather than three conditions,
 * one of which matches half the catalogue. Both spellings of the Romanian ones,
 * because the whole point of the tier below is that people do not type ș.
 */
const STOPWORDS = new Set([
  "de", "din", "cu", "la", "pe", "in", "în", "si", "și", "sau", "un", "o", "al", "ale", "pentru",
  "the", "and", "for", "with",
])

/**
 * The words a query is actually made of.
 *
 * Split on whitespace AND on `-` and `/`, because "t-shirt" and "nike/adidas"
 * are two words somebody joined with punctuation, not one word containing it.
 *
 * A single character is dropped — the `t` of "t-shirt" is in every row — UNLESS
 * it is a digit, because a digit alone is the most specific token on this
 * marketplace: "jordan 4" and "jordan 1" are different shoes.
 *
 * And if the filter emptied the query — somebody searched for "de" — the raw
 * split is used instead. A stopword list must never be able to turn a search
 * into no search.
 */
export function searchTokens(raw: string): string[] {
  const term = safeTerm(raw).toLowerCase()
  if (!term) return []
  const all = term.split(/[\s/-]+/).filter(Boolean)
  const kept = all.filter((t) => (t.length >= 2 || /^\d+$/.test(t)) && !STOPWORDS.has(t))
  return (kept.length > 0 ? kept : all).slice(0, MAX_TOKENS)
}

/** The letters this language writes two ways, plus their bare forms. */
const FOLDABLE = /[aăâAĂÂiîIÎsșşSȘŞtțţTȚŢ]/g

/**
 * THE SAME WORD, SPELLED EITHER WAY, WITHOUT A SECOND COLUMN OR AN EXTENSION.
 *
 * `_` is LIKE's single-character wildcard, so "barbati" becomes `b_rb_t_` —
 * which matches "bărbați", "barbati", and every mixture of the two. It is
 * symmetric: somebody who DOES type the diacritics gets the same pattern and
 * finds the listings that do not.
 *
 * This costs the index — a leading-wildcard `ILIKE` is a trigram scan either
 * way (see idx_products_title_trgm) and `_` inside it is no worse — and it buys
 * the single most common near-miss on a Romanian marketplace.
 *
 * Three guards, because a pattern that is mostly wildcards matches mostly
 * everything: nothing shorter than three characters, at most 60% of the word
 * turned into wildcards, and at least two real letters left to anchor it. "sase"
 * would be `____` and is refused. And a word with nothing foldable in it needs
 * no second pattern at all — it already matches itself.
 */
export function foldPattern(token: string): string | null {
  if (token.length < 3) return null
  let folded = 0
  const out = token.replace(FOLDABLE, () => {
    folded++
    return "_"
  })
  if (folded === 0) return null
  if (folded / token.length > 0.6) return null
  if (token.length - folded < 2) return null
  return out
}

/**
 * The stem of a token, for the tier that runs when nothing else matched.
 *
 * A prefix rather than an edit distance: `ILIKE '%jor%'` is one pattern the
 * trigram index can serve, while "everything within one edit of jordn" is a
 * function call per row. It catches the typo people actually make — the end of
 * a word, where the fingers run out — and it is honest about what it cannot do,
 * which is a transposition in the middle.
 *
 * Nothing under five characters is relaxed. Cutting "nike" to "nik" changes
 * which listings match by almost nothing, and cutting "y2k" to "y2" changes it
 * to everything.
 */
export function relaxToken(token: string): string | null {
  if (token.length < 5) return null
  const keep = Math.max(3, Math.ceil(token.length * 0.6))
  if (keep >= token.length) return null
  return token.slice(0, keep)
}

export type MatchMode = "all" | "any" | "fuzzy"

/** Every column this pattern could appear in, as PostgREST conditions. */
function arms(columns: string[], pattern: string): string[] {
  return columns.map((c) => `${c}.ilike."%${pattern}%"`)
}

/** The ways one token may be written: itself, and its diacritic-blind shape. */
function patternsFor(token: string, mode: MatchMode): string[] {
  if (mode === "fuzzy") {
    const stem = relaxToken(token)
    return [stem ?? token]
  }
  const fold = foldPattern(token)
  return fold ? [token, fold] : [token]
}

/**
 * The `.or()` arguments to chain onto a query.
 *
 * CHAINED `.or()` CALLS ARE ANDed BY PostgREST, and that is the whole trick: a
 * separate group per token means "every word appears, anywhere, in any order",
 * which is the query somebody typing two words actually means. One group
 * containing every token means "any word appears".
 *
 * So "all" returns N groups and the other two return one, and the caller
 * applies them the same way in both cases.
 */
export function textFilterGroups(columns: string[], tokens: string[], mode: MatchMode): string[] {
  if (tokens.length === 0) return []
  const groupFor = (t: string) => patternsFor(t, mode).flatMap((p) => arms(columns, p)).join(",")
  if (mode === "all") return tokens.map(groupFor)
  return [tokens.map(groupFor).join(",")]
}

/**
 * WHICH TIERS ARE WORTH TRYING FOR THIS PARTICULAR QUERY, in order.
 *
 * On one token "all" and "any" are the same filter, so the second is not run —
 * a round trip that is guaranteed to return what the previous one returned is a
 * round trip nobody should pay for. And "fuzzy" is only offered when at least
 * one token is long enough to have a stem; on "nike" there is nothing to relax
 * and the tier would be a third identical query.
 */
export function matchModesFor(tokens: string[]): MatchMode[] {
  if (tokens.length === 0) return []
  const modes: MatchMode[] = ["all"]
  if (tokens.length > 1) modes.push("any")
  if (tokens.some((t) => relaxToken(t) !== null)) modes.push("fuzzy")
  return modes
}

/**
 * What the widened tier ended up searching for, in words, so the page can tell
 * somebody why they are looking at results for something they did not type.
 * "jordn" → "jor…", and the results page prints it.
 */
export function relaxedTermFor(tokens: string[], mode: MatchMode): string {
  if (mode !== "fuzzy") return tokens.join(" ")
  return tokens.map((t) => (relaxToken(t) ? `${relaxToken(t)}…` : t)).join(" ")
}

/**
 * A prefix tsquery for the full-text path: `jordan:* & 4:*`, or `|` for the
 * widened tier.
 *
 * Restricted to word characters and Latin-1/Latin-Extended accents so no
 * to_tsquery operator (`&` `|` `!` `<->` `(` `)` `:`) can survive into the query
 * string — a malformed tsquery raises a Postgres error, which costs a wasted
 * round-trip before the ILIKE tiers below it.
 */
export function buildTsQuery(tokens: string[], join: "&" | "|" = "&"): string {
  return tokens
    .map((t) => t.replace(/[^\wÀ-ɏ]/g, ""))
    .filter(Boolean)
    .map((token) => `${token}:*`)
    .join(` ${join} `)
}
