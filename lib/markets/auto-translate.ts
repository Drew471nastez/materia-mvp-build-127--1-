import "server-only"

/**
 * ===========================================================================
 *  TRANSLATE CHANGES AUTOMATICALLY: THE HOURLY JOB
 * ===========================================================================
 * For a store with Settings › Markets and languages' "Translate changes
 * automatically" on (store_localization.auto_translate, SQL part 175): the
 * website's text that is new, or changed since it was translated, is
 * translated into each of its other languages and goes live. Only that:
 * every translation carries the hash of the original it was written for
 * (lib/markets/translate sourceHash), so an unchanged text is never sent
 * again, and a text already translated under another key is reused with
 * no call at all (draftReusing).
 *
 * NEVER THE MERCHANT'S WORDS. A translation they wrote or edited is not
 * sent and not replaced, outdated or not (aiMayWrite), and it is read again
 * just before the write in case they saved one meanwhile (keepManual).
 *
 * RETRIED BY THE NEXT RUN. What was not done (no time left, Storelib AI
 * unreachable, a translation that lost a placeholder or a link and was
 * refused by lib/markets/draft-check.ts) is still missing or outdated, so
 * the next hour picks it up; the original shows meanwhile. What each run
 * did is kept on the store (auto_translate_run) for the switch to say.
 *
 * Called by /api/cron/translations, behind the cron secret.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { storeIdentity } from "@/lib/store/identity-server"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { autoTranslateMissing, localizationOf, marketsMissing, saveTranslations, siteTexts, translationsOf, type AutoTranslateRun } from "./server"
import { aiMayWrite, translationMap } from "./translate"
import { canDraftWithAi, draftReusing } from "./translate-ai"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Texts one language takes in one run: a new website in a few hours, a day's edits at once. */
export const PER_LANGUAGE = 150
/** Stores one run looks at, the longest waiting first. */
export const STORES_PER_RUN = 25

/** One store: each of its other languages in turn, until `deadlineAt`. */
export async function autoTranslateStore(db: Db, creatorId: string, deadlineAt: number): Promise<AutoTranslateRun | null> {
  const loc = (await localizationOf(db, creatorId, SHOP_CURRENCY)).value
  if (!loc.autoTranslate) return null
  const locales = loc.languages.map((l) => l.code).filter((c) => c !== loc.defaultLanguage)
  const run: AutoTranslateRun = { at: new Date().toISOString(), translated: 0, left: 0 }
  if (locales.length === 0) return run
  const [groups, store] = await Promise.all([siteTexts(db, creatorId), storeIdentity(db, creatorId).catch(() => null)])
  const texts = groups.flatMap((g) => g.items)
  let unreachable = false
  for (const locale of locales) {
    const saved = await translationsOf(db, creatorId, locale)
    const map = translationMap(saved.rows)
    const todo = texts.filter((t) => aiMayWrite(map.get(t.key), t.source))
    if (todo.length === 0) continue
    /* No time for another call, or Storelib AI already said no: counted for the next run. */
    if (unreachable || Date.now() > deadlineAt - 20_000) {
      run.left += todo.length
      continue
    }
    const batch = todo.slice(0, PER_LANGUAGE)
    const { drafts, unavailable } = await draftReusing(batch.map((t) => ({ key: t.key, source: t.source })), saved.rows, loc.defaultLanguage, locale, store?.name || "the store", { deadlineAt })
    if (unavailable && drafts.size === 0) unreachable = true
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

/** The stores with it on, the one waiting longest first. Empty before part 175. */
async function storesToRun(db: Db): Promise<string[]> {
  const { data, error } = await db
    .from("store_localization")
    .select("creator_id")
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
  return ((data ?? []) as { creator_id: string }[]).map((r) => r.creator_id)
}

/** The hourly run: as many stores as fit before `deadlineAt`, each one's result kept on it. */
export async function runAutoTranslate(deadlineAt: number, db: Db = createAdminClient()): Promise<{ stores: number; translated: number; left: number; skipped?: string }> {
  if (!canDraftWithAi()) return { stores: 0, translated: 0, left: 0, skipped: "no AI key" }
  const ids = await storesToRun(db)
  const out = { stores: 0, translated: 0, left: 0 }
  for (const id of ids) {
    if (Date.now() > deadlineAt - 30_000) break
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
