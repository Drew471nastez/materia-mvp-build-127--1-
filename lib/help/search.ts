/**
 * ===========================================================================
 *  SEARCHING THE HELP CENTRE
 * ===========================================================================
 * Thirty or so articles, searched in the browser as somebody types and on
 * the server for /help/search, with the same function both times.
 *
 * EVERY WORD HAS TO MATCH SOMEWHERE. "refund partial" is two things the
 * person wants and an article that only mentions one of them is not an
 * answer. A word matches the start of a word in the article, so "pay" finds
 * "payouts" and "payment", and a plural finds its singular.
 *
 * WHERE IT MATCHED DECIDES THE ORDER. A title that says it outranks a
 * keyword, which outranks the summary, which outranks the body. A title that
 * contains the whole phrase goes first, and between equals the shorter
 * title, which is usually the article about exactly that.
 */
import { ALL_HELP_ARTICLES, articleText, helpCategory, plainText, type HelpArticle } from "./articles"

export interface HelpResult {
  article: HelpArticle
  score: number
  /** A sentence from the article with a match in it, for the result line. */
  snippet: string
}

/** Lower case, accents off, split on anything that is not a letter or digit. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** "refunds" and "refund" are the same search. Short words are left alone. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1)
  return w
}

/** Words so common they would match every article. */
const STOP = new Set(["a", "an", "the", "to", "of", "and", "or", "in", "on", "for", "is", "it", "my", "i", "do", "how", "can", "what", "with", "your", "you", "me"])

export function queryTerms(query: string): string[] {
  return [...new Set(words(query).filter((w) => !STOP.has(w)).map(stem))]
}

interface Indexed {
  article: HelpArticle
  fields: { weight: number; words: string[] }[]
  title: string
  sentences: string[]
}

let index: Indexed[] | null = null
function built(): Indexed[] {
  if (index) return index
  index = ALL_HELP_ARTICLES.map((article) => {
    const category = helpCategory(article.category)?.title ?? ""
    const body = articleText(article)
    return {
      article,
      title: article.title.toLowerCase(),
      fields: [
        { weight: 8, words: words(article.title).map(stem) },
        { weight: 5, words: (article.keywords ?? []).flatMap(words).map(stem) },
        { weight: 3, words: words(article.summary).map(stem) },
        { weight: 2, words: words(category).map(stem) },
        { weight: 1, words: words(body).map(stem) },
      ],
      sentences: [plainText(article.summary), ...body.split(/(?<=[.!?:])\s+/)],
    }
  })
  return index
}

function fieldScore(term: string, fieldWords: string[]): boolean {
  return fieldWords.some((w) => w.startsWith(term))
}

function snippetFor(entry: Indexed, terms: string[]): string {
  const hit = entry.sentences.find((s) => {
    const ws = words(s).map(stem)
    return terms.some((t) => ws.some((w) => w.startsWith(t)))
  })
  const text = (hit ?? entry.article.summary).trim()
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, "")}...` : text
}

/** `physical`: whether the physical products guide is on (it is left out of results when off). */
export function searchHelp(query: string, limit = 8, opts: { physical?: boolean } = {}): HelpResult[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []
  const phrase = query.trim().toLowerCase()
  const results: HelpResult[] = []
  for (const entry of built()) {
    if (!opts.physical && helpCategory(entry.article.category)?.physical) continue
    let score = 0
    let all = true
    for (const term of terms) {
      let best = 0
      for (const f of entry.fields) if (f.weight > best && fieldScore(term, f.words)) best = f.weight
      if (best === 0) { all = false; break }
      score += best
    }
    if (!all) continue
    if (phrase.length > 2 && entry.title.includes(phrase)) score += 20
    results.push({ article: entry.article, score, snippet: snippetFor(entry, terms) })
  }
  return results
    .sort((a, b) => b.score - a.score || a.article.title.length - b.article.title.length || a.article.title.localeCompare(b.article.title))
    .slice(0, limit)
}
