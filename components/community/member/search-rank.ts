/**
 * ===========================================================================
 *  HOW A COMMUNITY'S SEARCH RANKS WHAT IT FINDS (round 10, ask 29)
 * ===========================================================================
 * One set of rules for the server (lib/communities/server/search.ts) and the
 * browser (search.tsx, the preloaded index answering on the first key), so
 * the first results and the server's agree.
 *
 * WORDS. What was typed is cut into words (at most SEARCH_WORDS), each
 * matched without case or accents ("cafe" finds "Café"). Every word must be
 * somewhere in the item (in any of its fields) for it to count at all.
 *
 * SCORE. Each word scores in the field where it does best, times the field's
 * weight (a title counts more than a body):
 *
 *   the whole field is the word         8
 *   the field starts with the word      6
 *   a word in the field starts with it  4
 *   it is inside a word                 1
 *
 * and the words typed in order, together, in one field add 3 more. A
 * little for being recent breaks ties (at most 1, fading over 30 days), so
 * a fresh post with the same words comes first.
 *
 * MARKS. markRanges gives the stretches of a text to draw in bold: every
 * place a word starts a word (or, failing that, sits inside one), found on
 * the folded text and mapped back to the original characters.
 *
 * Pure and browser safe.
 */

/** Words a search uses at most. */
export const SEARCH_WORDS = 4

/** One character without its accents, lower case. */
function foldChar(ch: string): string {
  return ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** A text without accents, lower case. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** The words of a search: folded, without repeats, the longest kept when there are too many. */
export function searchWords(q: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of fold(q).split(/[^\p{L}\p{N}#+&'.-]+/u)) {
    const t = w.replace(/^[.'-]+|[.'-]+$/g, "")
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  /* A word that is the start of another one typed adds nothing. */
  const kept = out.filter((w) => !out.some((o) => o !== w && o.startsWith(w)))
  return kept.length > SEARCH_WORDS ? [...kept].sort((a, b) => b.length - a.length).slice(0, SEARCH_WORDS) : kept
}

const WORD_CHAR = /[\p{L}\p{N}]/u

/** How well one word sits in one folded text. */
export function wordScore(text: string, word: string): number {
  if (!text || !word) return 0
  if (text === word) return 8
  if (text.startsWith(word)) return 6
  let at = text.indexOf(word)
  let best = 0
  while (at >= 0) {
    const before = at === 0 ? "" : text[at - 1]
    if (!before || !WORD_CHAR.test(before)) return 4
    best = 1
    at = text.indexOf(word, at + 1)
  }
  return best
}

export interface RankField {
  text: string | null | undefined
  /** How much this field counts: a title 3, a name 3, a body 1. */
  weight: number
}

const DAY_MS = 86_400_000

/**
 * The item's score for these words, or 0 when a word is nowhere in it.
 * `at` (ms) gives the recent a little more.
 */
export function rankItem(fields: RankField[], words: string[], at: number | null = null, now: number = Date.now()): number {
  if (!words.length) return 0
  const folded = fields.map((f) => ({ text: fold(f.text || ""), weight: f.weight }))
  let total = 0
  for (const w of words) {
    let best = 0
    for (const f of folded) best = Math.max(best, wordScore(f.text, w) * f.weight)
    if (best === 0) return 0
    total += best
  }
  if (words.length > 1) {
    const phrase = words.join(" ")
    if (folded.some((f) => f.text.includes(phrase))) total += 3
  }
  if (at !== null && Number.isFinite(at)) {
    const age = Math.max(0, now - at)
    total += Math.max(0, 1 - age / (30 * DAY_MS))
  }
  return total
}

/** The items with a score above 0, best first, at most `limit` (ties keep their order). */
export function rankAll<T>(items: T[], score: (item: T) => number, limit: number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item)
}

/**
 * The stretches of `text` to draw in bold for these words, in order and not
 * overlapping, as [start, end) in the original text's characters.
 */
export function markRanges(text: string, words: string[]): [number, number][] {
  if (!text || !words.length) return []
  /* The folded text, and for each of its characters the original one it came from. */
  let folded = ""
  const from: number[] = []
  let i = 0
  for (const ch of text) {
    const f = foldChar(ch)
    for (let k = 0; k < f.length; k++) {
      folded += f[k]
      from.push(i)
    }
    i += ch.length
  }
  from.push(i)
  const ranges: [number, number][] = []
  for (const w of words) {
    let at = folded.indexOf(w)
    const inside: [number, number][] = []
    let found = false
    while (at >= 0 && ranges.length < 60) {
      const before = at === 0 ? "" : folded[at - 1]
      const range: [number, number] = [from[at], from[at + w.length] ?? text.length]
      if (!before || !WORD_CHAR.test(before)) {
        ranges.push(range)
        found = true
      } else inside.push(range)
      at = folded.indexOf(w, at + w.length)
    }
    if (!found) ranges.push(...inside)
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}
