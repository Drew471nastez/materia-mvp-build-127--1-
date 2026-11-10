/**
 * ===========================================================================
 *  RANKING THE BRAIN: RELEVANCE, BUSINESS FIT, THEN DIVERSITY
 * ===========================================================================
 * The same BM25 the knowledge library uses (../retrieve.ts tokenize), over
 * each record's words, plus structured boosts, then a diversity pass:
 *
 *   1. relevance  BM25 over title (x3), summary (x2), tags (x2) and the
 *                 record's own fields (rule, when, moves, statement...).
 *   2. fit        the business named by the brief: a record about that
 *                 business is lifted, a record about OTHER businesses is
 *                 lowered, one that `fitsPoorly` is pushed down hard. A
 *                 recipe also gains from realising the chosen art direction.
 *   3. diversity  maximal marginal relevance (MMR): each next pick maximises
 *                 lambda * relevance - (1 - lambda) * similarity to what is
 *                 already picked (Jaccard over tags plus area or role), so
 *                 six craft moves are six different moves, not six tracking
 *                 rules.
 *
 * Deterministic: equal scores break by id. The per kind indexes are built
 * once per process. Pure.
 */
import { tokenize } from "../retrieve"
import type { BrainRecord } from "./types"

export interface BrainQuery {
  /** The brief's words plus anything the caller adds (moods, recipe tags). */
  text: string
  /** A BUSINESS_KINDS id, "general" when unknown. */
  business: string
  objective?: string
  /** O2 art direction ids, primary first. */
  directions?: string[]
  /** Ids to lift (a recipe's own patterns). */
  prefer?: string[]
}

export interface Scored<T extends BrainRecord> {
  record: T
  score: number
  why: string[]
}

const K1 = 1.2
const B = 0.75

interface Doc {
  tf: Map<string, number>
  len: number
}
interface Index {
  docs: Map<string, Doc>
  df: Map<string, number>
  avgLen: number
  n: number
}

function fieldsOf(r: BrainRecord): string[] {
  const base = [r.title, r.title, r.title, r.summary, r.summary, r.tags.join(" "), r.tags.join(" "), r.businesses.join(" ")]
  switch (r.kind) {
    case "technique":
      return [...base, r.area, r.rule, r.check]
    case "pattern":
      return [...base, r.role, r.when, r.moves.join(" "), r.compositions.join(" ").replace(/-/g, " ")]
    case "recipe":
      return [...base, r.surfaces, r.motion, r.image.direction, r.type.usage, r.directions.join(" ").replace(/-/g, " ")]
    case "standard":
      return [...base, r.area, r.statement]
  }
}

const indexes = new WeakMap<readonly BrainRecord[], Index>()

function indexOf(records: readonly BrainRecord[]): Index {
  const had = indexes.get(records)
  if (had) return had
  const docs = new Map<string, Doc>()
  const df = new Map<string, number>()
  let total = 0
  for (const r of records) {
    const words = tokenize(fieldsOf(r).join(" "))
    const tf = new Map<string, number>()
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1)
    for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1)
    docs.set(r.id, { tf, len: words.length })
    total += words.length
  }
  const idx = { docs, df, avgLen: total / Math.max(1, records.length), n: records.length }
  indexes.set(records, idx)
  return idx
}

function bm25(doc: Doc, terms: string[], idx: Index): number {
  let score = 0
  for (const t of terms) {
    const f = doc.tf.get(t)
    if (!f) continue
    const n = idx.df.get(t) ?? 0
    const idf = Math.log(1 + (idx.n - n + 0.5) / (n + 0.5))
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / idx.avgLen)))
  }
  return score
}

/** Every record scored for the query, best first. */
export function rankBrain<T extends BrainRecord>(records: readonly T[], q: BrainQuery): Scored<T>[] {
  const idx = indexOf(records)
  const terms = [...new Set(tokenize(`${q.text} ${q.business.replace(/-/g, " ")}`.slice(0, 6_000)))]
  const prefer = new Set(q.prefer ?? [])
  const dirs = q.directions ?? []
  return records
    .map((r) => {
      const why: string[] = []
      let score = bm25(idx.docs.get(r.id)!, terms, idx)
      if (score > 0) why.push(`text ${score.toFixed(2)}`)
      if (r.businesses.includes(q.business)) {
        score += r.kind === "recipe" ? 10 : 5
        why.push("business")
      } else if (r.businesses.length && q.business !== "general") {
        score *= 0.5
      }
      if (r.fitsPoorly.includes(q.business)) {
        score = score * 0.2 - 2
        why.push("fits poorly")
      }
      if (r.kind === "recipe" && dirs.length) {
        const at = r.directions.indexOf(dirs[0])
        if (at >= 0) {
          score += 6 - at
          why.push("direction")
        } else if (dirs.slice(1).some((d) => r.directions.includes(d))) {
          score += 2
          why.push("secondary direction")
        }
      }
      if (r.kind === "standard" && q.objective && r.objectives.includes(q.objective)) {
        score += 3
        why.push("objective")
      }
      if (prefer.has(r.id)) {
        score += 4
        why.push("in the recipe")
      }
      score += r.quality * 0.3
      return { record: r, score: Math.round(score * 1000) / 1000, why }
    })
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id))
}

function features(r: BrainRecord): Set<string> {
  const f = new Set(r.tags.map((t) => `t:${t}`))
  if (r.kind === "technique") f.add(`a:${r.area}`)
  if (r.kind === "pattern") f.add(`r:${r.role}`)
  if (r.kind === "standard") f.add(`a:${r.area}`)
  return f
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / Math.max(1, a.size + b.size - inter)
}

/**
 * Maximal marginal relevance over a ranked list: `k` picks that are relevant
 * and unlike each other. `lambda` 1 is pure relevance, 0 pure novelty.
 */
export function mmr<T extends BrainRecord>(ranked: Scored<T>[], k: number, lambda = 0.7, seed: Scored<T>[] = []): Scored<T>[] {
  const top = ranked[0]?.score || 1
  const picked: Scored<T>[] = [...seed]
  const feats = new Map<string, Set<string>>()
  const featOf = (r: BrainRecord) => feats.get(r.id) ?? (feats.set(r.id, features(r)), feats.get(r.id)!)
  const pool = ranked.filter((c) => !picked.some((p) => p.record.id === c.record.id))
  while (picked.length < seed.length + k && pool.length) {
    let best = -1
    let bestScore = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i]
      const sim = picked.length ? Math.max(...picked.map((p) => jaccard(featOf(p.record), featOf(c.record)))) : 0
      const s = lambda * (c.score / top) - (1 - lambda) * sim
      if (s > bestScore + 1e-9 || (Math.abs(s - bestScore) <= 1e-9 && best >= 0 && c.record.id < pool[best].record.id)) {
        best = i
        bestScore = s
      }
    }
    picked.push(pool.splice(best, 1)[0])
  }
  return picked.slice(seed.length)
}
