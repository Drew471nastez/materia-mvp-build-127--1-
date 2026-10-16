import "server-only"

/**
 * ===========================================================================
 *  TRANSLATE CHANGES AUTOMATICALLY
 * ===========================================================================
 * For a store with Settings › Languages & Currency's "Translate changes
 * automatically" on (store_localization.auto_translate, SQL part 175): the
 * website's text that is new, or changed since it was translated, is
 * translated into each of its other languages and goes live. Only that:
 * every translation carries the hash of the original it was written for
 * (lib/markets/translate sourceHash), so an unchanged text is never sent
 * again, and a text already translated under another key is reused with
 * no call at all (draftReusing).
 *
 * WHEN. A save that changes the website's words marks the store
 * (./translate-queue.ts, SQL part 186). Every five minutes
 * /api/cron/translation-jobs runs runChangedStores: the marked stores whose
 * last change has settled for SETTLE_MS, oldest first, each held by a lease
 * so two runs never translate the same store. A store that changed nothing
 * is never looked at, so the work grows with the edits, not the stores.
 * The hourly /api/cron/translations is the safety sweep: it only marks the
 * stores nothing has marked for a day (a change made somewhere no save
 * marks, Storelib's own words updated), a few dozen at a time. Before part
 * 186 it works through the stores itself, as it always did.
 *
 * NEVER THE MERCHANT'S WORDS. A translation they wrote or edited is not
 * sent and not replaced, outdated or not (aiMayWrite), and it is read again
 * just before the write in case they saved one meanwhile (keepManual). When
 * its original changes it stays live and is listed as Needs review
 * (translate.ts needsReview); Storelib AI's own are written again.
 *
 * RETRIED. What was not done (no time left, Storelib AI unreachable, a
 * translation that lost a placeholder or a link and was refused by
 * lib/markets/draft-check.ts) is still missing or outdated. A store that
 * made progress stays marked and the next run carries on; one the
 * translator could not be reached for is tried again RETRY_MS later; one
 * where nothing could be written is left to the daily sweep rather than
 * tried every five minutes. What each run did is kept on the store
 * (auto_translate_run) for the switch to say.
 */
import { defaultLanguageScope, writtenLanguage } from "./detect-language"
import { createAdminClient } from "@/lib/supabase/admin"
import { storeIdentity } from "@/lib/store/identity-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { autoTranslateMissing, glossaryOf, localizationOf, marketsMissing, saveTranslations, siteTexts, translationsOf, type AutoTranslateRun } from "./server"
import { BUILT_IN_GROUPS, aiMayWrite, isEnglish, translationMap } from "./translate"
import { canDraftWithAi, draftReusing } from "./translate-ai"
import { SETTLE_MS, queueMissing } from "./translate-queue"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Texts one language takes in one run: a new website in a few hours, a day's edits at once. */
export const PER_LANGUAGE = 150
/** Stores one run looks at, the longest waiting first (before part 186). */
export const STORES_PER_RUN = 25
/** Changed stores one three-minute run takes, the longest waiting first. */
export const CHANGED_PER_RUN = 20
/** How long a run holds a store: longer than one run's window, so another never takes it midway. */
const LEASE_MS = 6 * 60_000
/** A store the translator could not be reached for waits this long before the next try. */
const RETRY_MS = 10 * 60_000
/** The sweep marks a store nothing has marked for this long... */
export const SWEEP_AFTER_MS = 24 * 3_600_000
/** ...this many an hour, so it never crowds out the stores that changed. */
export const SWEEP_PER_RUN = 60

/** One store: each of its other languages in turn, until `deadlineAt`. */
export async function autoTranslateStore(db: Db, creatorId: string, deadlineAt: number): Promise<AutoTranslateRun | null> {
  const loc = (await localizationOf(db, creatorId, (await readStoreCurrency(db, creatorId)).currency)).value
  if (!loc.autoTranslate) return null
  const locales = loc.languages.map((l) => l.code).filter((c) => c !== loc.defaultLanguage)
  const run: AutoTranslateRun = { at: new Date().toISOString(), translated: 0, left: 0 }
  /* With the words not to translate (./glossary.ts): kept as written in every language. */
  const [groups, store, words] = await Promise.all([siteTexts(db, creatorId), storeIdentity(db, creatorId).catch(() => null), glossaryOf(db, creatorId)])
  /* The default language: every text when the website is written in another, else the shop's own words when it is not English (./detect-language.ts). */
  const written = writtenLanguage(groups)
  const scope = defaultLanguageScope(loc.defaultLanguage, written)
  const own = scope === "all" || !isEnglish(loc.defaultLanguage) ? [loc.defaultLanguage] : []
  if (locales.length === 0 && own.length === 0) return run
  const from = written ?? loc.defaultLanguage
  const texts = [...new Map(groups.flatMap((g) => g.items).map((t) => [t.key, t])).values()]
  const builtIn = groups.filter((g) => BUILT_IN_GROUPS.has(g.id)).flatMap((g) => g.items)
  let unreachable = false
  for (const locale of [...own, ...locales]) {
    const saved = await translationsOf(db, creatorId, locale)
    const map = translationMap(saved.rows)
    const todo = (locale === loc.defaultLanguage && scope === "builtIn" ? builtIn : texts).filter((t) => aiMayWrite(map.get(t.key), t.source))
    if (todo.length === 0) continue
    /* No time for another call, or Storelib AI already said no: counted for the next run. */
    if (unreachable || Date.now() > deadlineAt - 20_000) {
      run.left += todo.length
      continue
    }
    const batch = todo.slice(0, PER_LANGUAGE)
    const { drafts, unavailable, reused } = await draftReusing(batch.map((t) => ({ key: t.key, source: t.source })), saved.rows, from, locale, store?.name || "the store", { deadlineAt, glossary: words.glossary })
    /* Unreachable is the translator's: words reused at no cost (a hand written one with the same English, ./curated-words.ts) are saved all the same, and say nothing about it. */
    if (unavailable && drafts.size <= reused) unreachable = true
    /* Live at once, and labelled as Storelib AI's: the Translate sheet shows it, and an edit there makes it the merchant's. */
    const items = batch.filter((t) => drafts.has(t.key)).map((t) => ({ key: t.key, value: drafts.get(t.key)!, source: t.source, approved: true, ai: true, rich: /<[a-z][\s\S]*>/i.test(t.source) }))
    const done = items.length ? await saveTranslations(db, creatorId, locale, items, null, { keepManual: true }) : { ok: true as const, saved: 0, removed: 0 }
    const wrote = done.ok ? done.saved : 0
    run.translated += wrote
    run.left += Math.max(0, todo.length - (done.ok ? items.length : 0))
  }
  if (unreachable) run.error = "unavailable"
  return run
}

/** Written on the store for the switch; a database without part 175 has nowhere to write it, and nothing is lost. */
async function keepRun(db: Db, creatorId: string, run: AutoTranslateRun): Promise<void> {
  await db.from("store_localization").update({ auto_translate_run: run }).eq("creator_id", creatorId).then(
    () => undefined,
    () => undefined,
  )
}

type Listed = { creator_id: string; auto_translate_run?: Record<string, unknown> | null }

/** The stores with it on, the one waiting longest first. Empty before part 175. */
async function storesToRun(db: Db): Promise<Listed[]> {
  const { data, error } = await db
    .from("store_localization")
    .select("creator_id, auto_translate_run")
    .eq("auto_translate", true)
    .order("auto_translate_run->>at", { ascending: true, nullsFirst: true })
    .limit(STORES_PER_RUN)
    .then(
      (r: { data: unknown; error: { code?: string; message?: string } | null }) => r,
      (e: unknown) => ({ data: null, error: { message: String(e) } }),
    )
  if (error) {
    if (!autoTranslateMissing(error) && !marketsMissing(error)) console.error("[auto-translate] could not list the stores")
    return []
  }
  return ((data ?? []) as Listed[]).filter((r) => typeof r?.creator_id === "string")
}

/**
 * Holds a store for the hourly run before part 186, when there is no lease
 * column: the run kept on the store (auto_translate_run) is swapped for the
 * same run plus `claimed_until`, only while it is still the one read. A
 * second delivery of the cron read the same run, so its swap finds nothing
 * and it leaves the store; one that reads after sees the claim. The switch
 * reads only at, translated, left and error (server.ts readAutoTranslate),
 * so what it shows mid run does not change; keepRun writes the new run
 * without the claim, which lets it go.
 */
export async function claimQuietStore(db: Db, row: Listed, now: number): Promise<boolean> {
  const prev = row.auto_translate_run && typeof row.auto_translate_run === "object" && !Array.isArray(row.auto_translate_run) ? row.auto_translate_run : null
  const until = typeof prev?.claimed_until === "string" ? Date.parse(prev.claimed_until) : NaN
  if (Number.isFinite(until) && until > now) return false
  const update = db.from("store_localization").update({ auto_translate_run: { ...(prev ?? {}), claimed_until: iso(now + LEASE_MS) } }).eq("creator_id", row.creator_id)
  const { data } = await (prev === null ? update.is("auto_translate_run", null) : update.eq("auto_translate_run", JSON.stringify(prev))).select("creator_id").then(settled, failedRead)
  return Array.isArray(data) && data.length > 0
}

/* ── The changed stores, every five minutes ─────────────────────────── */

type Marked = { creator_id: string; translate_dirty_at: string }

const iso = (ms: number) => new Date(ms).toISOString()
const settled = (r: { data: unknown; error: { code?: string; message?: string } | null }) => r
const failedRead = (e: unknown) => ({ data: null, error: { message: String(e) } })

/** The marked stores whose last change has settled and that no run holds, oldest first. Null before part 186. */
async function changedStores(db: Db, now: number): Promise<Marked[] | null> {
  const { data, error } = await db
    .from("store_localization")
    .select("creator_id, translate_dirty_at")
    .eq("auto_translate", true)
    .not("translate_dirty_at", "is", null)
    .lte("translate_dirty_at", iso(now - SETTLE_MS))
    .or(`translate_lease_until.is.null,translate_lease_until.lt."${iso(now)}"`)
    .order("translate_dirty_at", { ascending: true })
    .limit(CHANGED_PER_RUN)
    .then(settled, failedRead)
  if (error) {
    if (queueMissing(error) || autoTranslateMissing(error) || marketsMissing(error)) return null
    console.error("[auto-translate] could not list the changed stores")
    return []
  }
  return ((data ?? []) as Marked[]).filter((r) => typeof r.creator_id === "string" && typeof r.translate_dirty_at === "string")
}

/** Holds the store for this run, while its mark is still the one read and no other run holds it. The lease written, or null when the store was not taken. */
async function claimStore(db: Db, s: Marked, now: number): Promise<string | null> {
  const lease = iso(now + LEASE_MS)
  const { data } = await db
    .from("store_localization")
    .update({ translate_lease_until: lease })
    .eq("creator_id", s.creator_id)
    .eq("translate_dirty_at", s.translate_dirty_at)
    .or(`translate_lease_until.is.null,translate_lease_until.lt."${iso(now)}"`)
    .select("creator_id")
    .then(settled, failedRead)
  return Array.isArray(data) && data.length > 0 ? lease : null
}

/**
 * What a run leaves on the store. `done`: the mark is cleared, unless the
 * store changed again while it ran (then the newer mark stays). `more`: it
 * made progress and has more, so it stays marked for the next run. `retry`:
 * the translator could not be reached, tried again RETRY_MS later. The
 * lease is let go in every case.
 */
export function outcomeOf(run: AutoTranslateRun | null): "done" | "more" | "retry" {
  if (!run) return "done"
  if (run.error) return "retry"
  /* Progress with more to do: go on. Nothing written though some is left: those texts came back refused, and are left to the daily sweep. */
  return run.left > 0 && run.translated > 0 ? "more" : "done"
}

/* Every write here is on this run's own lease: a run that outlived it leaves the store to the run that holds it now. */
async function settleStore(db: Db, s: Marked, outcome: "done" | "more" | "retry", lease: string): Promise<void> {
  const ignore = () => undefined
  if (outcome === "done") await db.from("store_localization").update({ translate_dirty_at: null, translate_lease_until: null }).eq("creator_id", s.creator_id).eq("translate_dirty_at", s.translate_dirty_at).eq("translate_lease_until", lease).then(ignore, ignore)
  if (outcome === "retry") await db.from("store_localization").update({ translate_dirty_at: iso(Date.now() + RETRY_MS - SETTLE_MS), translate_lease_until: null }).eq("creator_id", s.creator_id).eq("translate_dirty_at", s.translate_dirty_at).eq("translate_lease_until", lease).then(ignore, ignore)
  await db.from("store_localization").update({ translate_lease_until: null }).eq("creator_id", s.creator_id).eq("translate_lease_until", lease).then(ignore, ignore)
}

/**
 * Every five minutes: each store whose website changed a few minutes ago,
 * translated and put live, until `deadlineAt`. `skipped` says why nothing
 * ran (no AI key, or part 186 not run: the hourly run covers it then).
 */
export async function runChangedStores(deadlineAt: number, db: Db = createAdminClient()): Promise<{ stores: number; translated: number; left: number; skipped?: string }> {
  const out = { stores: 0, translated: 0, left: 0 }
  if (!canDraftWithAi()) return { ...out, skipped: "no AI key" }
  const list = await changedStores(db, Date.now())
  if (list === null) return { ...out, skipped: "no queue" }
  for (const s of list) {
    /* A store is started only with a minute left: it gets at least one language's call. */
    if (Date.now() > deadlineAt - 60_000) break
    const lease = await claimStore(db, s, Date.now())
    if (!lease) continue
    let run: AutoTranslateRun | null = null
    let outcome: "done" | "more" | "retry" = "retry"
    try {
      run = await autoTranslateStore(db, s.creator_id, deadlineAt)
      if (run) await keepRun(db, s.creator_id, run)
      outcome = outcomeOf(run)
    } catch (err) {
      console.error(`[auto-translate] a store failed: ${err instanceof Error ? err.name : "error"}`)
    }
    await settleStore(db, s, outcome, lease)
    if (!run) continue
    out.stores++
    out.translated += run.translated
    out.left += run.left
  }
  return out
}

/* ── The safety sweep, hourly ─────────────────────────────────────────── */

/** Marks the stores nothing has marked for a day, a few dozen at a time. Null before part 186. */
async function queueQuietStores(db: Db, now: number): Promise<number | null> {
  const { data, error } = await db
    .from("store_localization")
    .select("creator_id, auto_translate_run")
    .eq("auto_translate", true)
    .is("translate_dirty_at", null)
    .order("auto_translate_run->>at", { ascending: true, nullsFirst: true })
    .limit(SWEEP_PER_RUN)
    .then(settled, failedRead)
  if (error) return queueMissing(error) ? null : 0
  const quiet = ((data ?? []) as { creator_id: string; auto_translate_run?: { at?: unknown } | null }[])
    .filter((r) => {
      const at = typeof r.auto_translate_run?.at === "string" ? Date.parse(r.auto_translate_run.at) : NaN
      return !Number.isFinite(at) || at < now - SWEEP_AFTER_MS
    })
    .map((r) => r.creator_id)
  if (quiet.length === 0) return 0
  /* Marked as changed a settle ago, so the next three-minute run takes them; one marked meanwhile by a save keeps its own time. */
  await db.from("store_localization").update({ translate_dirty_at: iso(now - SETTLE_MS) }).in("creator_id", quiet).is("translate_dirty_at", null).then(
    () => undefined,
    () => undefined,
  )
  return quiet.length
}

/**
 * The hourly run. With part 186: the safety sweep, which only marks quiet
 * stores for the three-minute run. Before it: as many stores as fit before
 * `deadlineAt`, each one's result kept on it, as it always was.
 */
export async function runAutoTranslate(deadlineAt: number, db: Db = createAdminClient()): Promise<{ stores: number; translated: number; left: number; queued?: number; skipped?: string }> {
  if (!canDraftWithAi()) return { stores: 0, translated: 0, left: 0, skipped: "no AI key" }
  const queued = await queueQuietStores(db, Date.now())
  if (queued !== null) return { stores: 0, translated: 0, left: 0, queued }
  const rows = await storesToRun(db)
  const out = { stores: 0, translated: 0, left: 0 }
  for (const row of rows) {
    if (Date.now() > deadlineAt - 30_000) break
    const id = row.creator_id
    /* A second delivery of this cron, or a run still going: the store is theirs. */
    if (!(await claimQuietStore(db, row, Date.now()))) continue
    try {
      const run = await autoTranslateStore(db, id, deadlineAt)
      if (!run) continue
      await keepRun(db, id, run)
      out.stores++
      out.translated += run.translated
      out.left += run.left
    } catch (err) {
      /* One store's failure is that store's: the rest still run, and it is first in line next hour. */
      console.error(`[auto-translate] a store failed: ${err instanceof Error ? err.name : "error"}`)
    }
  }
  return out
}
