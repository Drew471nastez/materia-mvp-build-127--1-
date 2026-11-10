/**
 * ===========================================================================
 *  RETRIEVAL: THE TWO TO FOUR REFERENCES THIS BRIEF NEEDS
 * ===========================================================================
 * Spec 2.6: never every reference in every request. The same retrieval the
 * knowledge library uses (BM25 over the record's words, with its tokenizer,
 * ../library/retrieve.ts), plus structured boosts, then a selection for
 * DIFFERENT jobs:
 *
 *   1. score: BM25 over title, summary, tags, industries, tone, layout, type
 *      and what to borrow (title and tags weighted up); + industry, style,
 *      tone and density matches; a reference that fits the business badly
 *      (`fitsPoorly`) or is about another industry is pushed down; the
 *      admin's own screenshots (`admin-upload`) are preferred over the
 *      general library; quality is a small prior; id breaks ties.
 *   2. select: one per wanted role first (identity, composition, functional,
 *      motion when motion is wanted), then the rest by score minus a
 *      similarity penalty, so the set does not come from one industry or one
 *      trope; at most one design system, one style and one principle unless
 *      those kinds are asked for; never two records that are the same thing
 *      (dedupKey) or analyse the same brand.
 *
 * Deterministic: the same brief and records give the same ids in the same
 * order. Disabled records are never returned. Pure, browser safe; the
 * admin's uploaded records arrive as `extra` from ./store.ts on the server.
 */
import { tokenize } from "../library/retrieve"
import { PRINCIPLE_REFERENCES } from "./principles"
import { SEED_REFERENCES } from "./seed"
import { dedupKey, type DesignReference, type ReferenceDensity, type ReferenceKind, type ReferenceRole } from "./types"
import { VENDORED_REFERENCES } from "./vendored.generated"

export interface ReferenceQuery {
  /** The creator's words or the brief as text. */
  text?: string
  industry?: string
  styles?: string[]
  tone?: string[]
  density?: ReferenceDensity
  /** Motion wanted: "expressive" adds a motion reference to the roles. */
  motion?: "quiet" | "balanced" | "expressive"
  /** Roles to fill, in order. Default identity, composition, functional (+ motion when expressive). */
  roles?: ReferenceRole[]
  /** Only these kinds. */
  kinds?: ReferenceKind[]
  /** Words the brief rules out ("purple glow", "serif"): records tagged with them are pushed down. */
  avoid?: string[]
  /** Records asked for by id: first when they exist and are enabled. */
  ids?: string[]
  exclude?: string[]
}

/**
 * Anything brief shaped: a string, a ReferenceQuery, or a creative brief
 * from the direction lane (O2) with fields like businessType, industry,
 * brandAttributes, visualPreferences, visualExclusions, motionLevel.
 */
export type BriefLike = string | ReferenceQuery | Record<string, unknown>

export interface SearchOptions {
  /** How many to return. Default 4, at most 8. */
  limit?: number
  /** The admin's uploaded records (./store.ts). Same id as a built in record replaces it. */
  extra?: DesignReference[]
}

export interface RankedReference {
  ref: DesignReference
  score: number
  why: string[]
}

/* ── the corpus ─────────────────────────────────────────────────────────── */

export function builtInReferences(): readonly DesignReference[] {
  return BUILT_IN
}
const BUILT_IN: DesignReference[] = [...SEED_REFERENCES, ...PRINCIPLE_REFERENCES, ...VENDORED_REFERENCES]

interface Doc {
  ref: DesignReference
  tf: Map<string, number>
  len: number
  key: string
}

function docText(r: DesignReference): string {
  const tags = r.styleTags.join(" ")
  const inds = r.industries.join(" ")
  return [
    r.title,
    r.title,
    r.title,
    r.summary,
    tags,
    tags,
    inds,
    inds,
    r.tone.join(" "),
    r.layout.topology,
    r.layout.hero,
    r.type.display,
    r.type.strategy,
    r.palette.strategy,
    r.imagery,
    r.motion.character,
    r.borrow.join(" "),
    r.details.join(" "),
  ].join(" ")
}

function toDoc(ref: DesignReference): Doc {
  const words = tokenize(docText(ref))
  const tf = new Map<string, number>()
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1)
  return { ref, tf, len: words.length, key: dedupKey(ref) }
}

let builtDocs: Doc[] | null = null
function builtInDocs(): Doc[] {
  if (!builtDocs) {
    const seen = new Set<string>()
    builtDocs = []
    for (const r of BUILT_IN) {
      if (seen.has(r.id)) throw new Error(`duplicate reference id: ${r.id}`)
      seen.add(r.id)
      builtDocs.push(toDoc(r))
    }
  }
  return builtDocs
}

/** The corpus for one call: built in records, with the admin's records added (a same id record replaces the built in one when newer). */
function corpus(extra: DesignReference[] | undefined): Doc[] {
  const base = builtInDocs()
  if (!extra?.length) return base
  const byId = new Map(base.map((d) => [d.ref.id, d]))
  for (const r of extra) {
    const had = byId.get(r.id)
    if (!had || had.ref.version < r.version || r.source.origin === "admin-upload") byId.set(r.id, toDoc(r))
  }
  return [...byId.values()]
}

/* ── the query ──────────────────────────────────────────────────────────── */

const str = (v: unknown) => (typeof v === "string" ? v : "")
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" && v ? [v] : [])

/** A ReferenceQuery from whatever brief shape was handed in. */
export function queryFrom(brief: BriefLike): ReferenceQuery {
  if (typeof brief === "string") return { text: brief }
  const b = brief as Record<string, unknown>
  const motion = str(b.motion ?? b.motionLevel ?? b.motionTier).toLowerCase()
  const text = [str(b.text), str(b.prompt), str(b.offer), str(b.audience), str(b.primaryAction), str(b.concept), ...strs(b.brandAttributes), ...strs(b.mood), ...strs(b.visualPreferences)].filter(Boolean).join(". ")
  return {
    text: text || undefined,
    industry: str(b.industry) || str(b.businessType) || str(b.category) || undefined,
    styles: [...strs(b.styles), ...strs(b.visualPreferences), ...strs(b.style)].slice(0, 12),
    tone: [...strs(b.tone), ...strs(b.brandAttributes), ...strs(b.personality)].slice(0, 12),
    density: (["airy", "balanced", "compact"] as const).find((d) => d === str(b.density)) ?? undefined,
    motion: motion === "minimal" || motion === "quiet" ? "quiet" : motion === "expressive" || motion === "immersive" ? "expressive" : motion ? "balanced" : undefined,
    roles: strs(b.roles).filter((r): r is ReferenceRole => ["identity", "composition", "functional", "motion"].includes(r)),
    kinds: strs(b.kinds).filter((k): k is ReferenceKind => ["site", "section", "system", "style", "principle"].includes(k)),
    avoid: [...strs(b.avoid), ...strs(b.visualExclusions), ...strs(b.exclusions)].slice(0, 12),
    ids: strs(b.ids),
    exclude: strs(b.exclude),
  }
}

/* ── scoring ────────────────────────────────────────────────────────────── */

const K1 = 1.2
const B = 0.75

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** A label matches when the slugs are equal or one's words contain the other ("personal trainer" ~ "trainer"). */
function labelMatch(labels: string[], wanted: string[]): boolean {
  if (!labels.length || !wanted.length) return false
  const ls = labels.map(norm).filter(Boolean)
  const ws = wanted.map(norm).filter(Boolean)
  return ws.some((w) => ls.some((l) => l === w || l.split("-").includes(w) || w.split("-").includes(l)))
}

/** Industry words, stemmed, so "coaches" meets "coach" and "photography" meets "photographer" loosely. */
function industryWords(s: string): string[] {
  return tokenize(s).filter((w) => w.length > 2)
}

function scoreDoc(doc: Doc, q: ReferenceQuery, terms: string[], df: Map<string, number>, N: number, avgLen: number): { score: number; why: string[] } {
  const r = doc.ref
  const why: string[] = []
  let score = 0
  for (const t of new Set(terms)) {
    const f = doc.tf.get(t)
    if (!f) continue
    const n = df.get(t) ?? 0
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / avgLen)))
  }
  if (score > 0) why.push(`text ${score.toFixed(2)}`)

  if (q.industry) {
    const wanted = [q.industry, ...industryWords(q.industry)]
    const ownWords = r.industries.flatMap(industryWords)
    if (labelMatch(r.industries, wanted) || industryWords(q.industry).some((w) => ownWords.includes(w))) {
      score += 6
      why.push("industry")
    } else if (r.industries.length && r.kind !== "principle") {
      score *= 0.35
    }
    if (labelMatch(r.fitsPoorly, wanted)) {
      score *= 0.15
      why.push("fits poorly")
    }
  }
  if (q.styles?.length && labelMatch(r.styleTags, q.styles)) {
    score += 4
    why.push("style")
  }
  if (q.tone?.length && labelMatch(r.tone, q.tone)) {
    score += 2
    why.push("tone")
  }
  if (q.density && r.density === q.density) {
    score += 1
    why.push("density")
  }
  if (q.avoid?.length && (labelMatch(r.styleTags, q.avoid) || q.avoid.some((a) => a.length > 3 && r.title.toLowerCase().includes(a.toLowerCase())))) {
    score *= 0.2
    why.push("ruled out")
  }
  if (r.source.origin === "admin-upload") {
    score += 3
    why.push("curated screenshot")
  }
  if (r.kind === "system") score *= 0.8
  if (r.kind === "style") score *= 0.6
  score += r.quality * 0.3
  return { score, why }
}

/** Every enabled record that matches, best first, without selection. */
export function rankReferences(brief: BriefLike, opts: { extra?: DesignReference[] } = {}): RankedReference[] {
  const q = queryFrom(brief)
  const docs = corpus(opts.extra).filter((d) => d.ref.enabled)
  const kinds = new Set(q.kinds ?? [])
  const exclude = new Set(q.exclude ?? [])
  const pinned = new Set(q.ids ?? [])
  /* Motion wanted is a word to match too, so a motion reference can be found for the motion role. */
  const terms = tokenize([q.text, q.industry, ...(q.styles ?? []), ...(q.tone ?? []), q.motion === "expressive" ? "motion scroll reveal entrance" : ""].filter(Boolean).join(" ").slice(0, 6_000))
  const df = new Map<string, number>()
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) ?? 0) + 1)
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length)
  const signal = terms.length > 0 || !!q.industry || !!q.styles?.length
  return docs
    .filter((d) => !exclude.has(d.ref.id))
    .filter((d) => pinned.has(d.ref.id) || !kinds.size || kinds.has(d.ref.kind))
    .map((d) => {
      const s = scoreDoc(d, q, terms, df, docs.length, avgLen)
      return { ref: d.ref, score: pinned.has(d.ref.id) ? 1_000 + s.score : s.score, why: pinned.has(d.ref.id) ? ["asked for", ...s.why] : s.why, key: d.key }
    })
    .filter((r) => !signal || r.score > r.ref.quality * 0.3 + 0.001)
    .sort((a, b) => b.score - a.score || a.ref.id.localeCompare(b.ref.id))
    .map(({ ref, score, why }) => ({ ref, score: Math.round(score * 1000) / 1000, why }))
}

/* ── selection ──────────────────────────────────────────────────────────── */

function features(r: DesignReference): Set<string> {
  return new Set([...r.styleTags.map((t) => `s:${norm(t)}`), ...r.industries.map((t) => `i:${norm(t)}`), `k:${r.kind}`, `m:${r.palette.mode}`])
}
function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / Math.max(1, a.size + b.size - inter)
}

/** One per kind for the kinds that are background, not pictures of a page. */
const KIND_CAP: Partial<Record<ReferenceKind, number>> = { system: 1, style: 1, principle: 1 }

export const DEFAULT_REFERENCE_LIMIT = 4
export const MAX_REFERENCE_LIMIT = 8

/**
 * THE SHARED NAME (round O): the references for this brief, a small set
 * chosen for different jobs. Deterministic.
 */
export function searchReferences(brief: BriefLike, opts: SearchOptions = {}): DesignReference[] {
  return selectReferences(brief, opts).map((r) => r.ref)
}

/** searchReferences with scores and reasons (for tests, logs and the admin's preview). */
export function selectReferences(brief: BriefLike, opts: SearchOptions = {}): RankedReference[] {
  const q = queryFrom(brief)
  const limit = Math.max(1, Math.min(MAX_REFERENCE_LIMIT, Math.floor(opts.limit ?? DEFAULT_REFERENCE_LIMIT)))
  const ranked = rankReferences(q, { extra: opts.extra })
  const roles: ReferenceRole[] = q.roles?.length ? q.roles : q.motion === "expressive" ? ["identity", "composition", "functional", "motion"] : ["identity", "composition", "functional"]
  const askedKinds = new Set(q.kinds ?? [])
  const picked: RankedReference[] = []
  const keys = new Set<string>()
  const subjects = new Set<string>()
  const kindCount = new Map<ReferenceKind, number>()
  const feats = new Map<string, Set<string>>()
  const featOf = (r: DesignReference) => feats.get(r.id) ?? (feats.set(r.id, features(r)), feats.get(r.id)!)

  const allowed = (c: RankedReference) => {
    if (picked.some((p) => p.ref.id === c.ref.id)) return false
    if (keys.has(dedupKey(c.ref))) return false
    const subject = c.ref.source.subject?.toLowerCase()
    if (subject && subjects.has(subject)) return false
    const cap = askedKinds.has(c.ref.kind) ? undefined : KIND_CAP[c.ref.kind]
    if (cap !== undefined && (kindCount.get(c.ref.kind) ?? 0) >= cap) return false
    return true
  }
  const take = (c: RankedReference, why?: string) => {
    picked.push(why ? { ...c, why: [...c.why, why] } : c)
    keys.add(dedupKey(c.ref))
    if (c.ref.source.subject) subjects.add(c.ref.source.subject.toLowerCase())
    kindCount.set(c.ref.kind, (kindCount.get(c.ref.kind) ?? 0) + 1)
  }
  const diversified = (c: RankedReference) => c.score - 3 * Math.max(0, ...picked.map((p) => similarity(featOf(p.ref), featOf(c.ref))))
  const best = (pool: RankedReference[]) => {
    let top: RankedReference | null = null
    let topScore = -Infinity
    for (const c of pool) {
      const s = diversified(c)
      if (s > topScore || (s === topScore && top && c.ref.id < top.ref.id)) {
        top = c
        topScore = s
      }
    }
    return top
  }

  /*
    The pool roles and the fill draw from: close enough to the best match, and, when the brief names a business,
    about that business or about any business. A restaurant is never handed the trainer's page to fill a role.
  */
  const top = ranked.find((c) => c.why[0] !== "asked for")?.score ?? 0
  const offTopic = (c: RankedReference) => !!q.industry && c.ref.industries.length > 0 && c.ref.kind !== "principle" && !c.why.includes("industry")
  const pool = ranked.filter((c) => c.score >= top * 0.35 && !offTopic(c))

  /* Pinned first, as asked. */
  for (const c of ranked) if (c.why[0] === "asked for" && picked.length < limit && allowed(c)) take(c)
  /* One per role, in the order the roles are wanted. */
  for (const role of roles) {
    if (picked.length >= limit) break
    if (picked.some((p) => p.ref.roles.includes(role))) continue
    const c = best(pool.filter((x) => x.ref.roles.includes(role) && allowed(x))) ?? best(ranked.filter((x) => x.ref.roles.includes(role) && !offTopic(x) && allowed(x)))
    if (c) take(c, `role ${role}`)
  }
  /* The rest by score, penalised for looking like what is already picked; never off topic. */
  while (picked.length < limit) {
    const c = best(pool.filter(allowed)) ?? best(ranked.filter((x) => !offTopic(x) && allowed(x)))
    if (!c) break
    take(c)
  }
  return picked
}

/** A record by id among the built in ones and the given extras. */
export function referenceById(id: string, extra?: DesignReference[]): DesignReference | undefined {
  return extra?.find((r) => r.id === id) ?? BUILT_IN.find((r) => r.id === id)
}
