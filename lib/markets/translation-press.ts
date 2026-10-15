import "server-only"

/**
 * ===========================================================================
 *  ONE ROUND OF "TRANSLATE WITH AI"
 * ===========================================================================
 * Up to PER_PRESS of the website's texts in one language that are missing,
 * or that Storelib AI drafted before and whose original changed, drafted by
 * Storelib AI and saved as drafts to review. A translation a person wrote is
 * never sent or replaced (lib/markets/translate.ts aiMayWrite, the same rule
 * as the hourly job's). Shared by the press route (app/api/store/
 * translations/draft) and the background job (./translation-jobs.ts), so
 * both write exactly the same way.
 */
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { storeIdentity } from "@/lib/store/identity-server"
import { editorLanguages } from "./model"
import { localizationOf, saveTranslations, siteTexts, translationsOf } from "./server"
import { BUILT_IN_GROUPS, aiMayWrite, isEnglish, statusOf, translationMap } from "./translate"
import { draftReusing } from "./translate-ai"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Up to this many texts a round: a whole small website, a large one in a few rounds. */
export const PER_PRESS = 150

export type PressResult =
  | { ok: true; drafted: number; left: number; done: number; total: number }
  | { ok: false; status: number; error: string }

export const AI_UNAVAILABLE = "Automatic translation isn't available right now. You can still write each translation yourself."

/** Whether `locale` is one this store may translate into: one of its languages, or its own when that is not English (the shop's own words only). */
export async function translatableLocale(db: Db, creatorId: string, locale: string | null): Promise<{ ok: true; own: boolean; defaultLanguage: string } | { ok: false }> {
  const loc = (await localizationOf(db, creatorId, (await readStoreCurrency(db, creatorId)).currency)).value
  const own = !!locale && locale === loc.defaultLanguage && !isEnglish(locale)
  if (!locale || (!own && (locale === loc.defaultLanguage || !editorLanguages(loc).includes(locale)))) return { ok: false }
  return { ok: true, own, defaultLanguage: loc.defaultLanguage }
}

/**
 * One round, stopping new batches at `deadlineAt`. `done` and `total` are
 * the language's texts that have a translation (a draft counts) and all of
 * them, after this round: what a progress bar shows.
 */
export async function draftRound(db: Db, creatorId: string, locale: string, userId: string | null, deadlineAt: number): Promise<PressResult> {
  const where = await translatableLocale(db, creatorId, locale)
  if (!where.ok) return { ok: false, status: 400, error: "Add this language to your website first." }
  const [allGroups, saved, store] = await Promise.all([siteTexts(db, creatorId), translationsOf(db, creatorId, locale), storeIdentity(db, creatorId).catch(() => null)])
  /* The website's own language, when it is not English: the shop's own words and the checkout's only (translate.ts BUILT_IN_GROUPS). */
  const groups = where.own ? allGroups.filter((g) => BUILT_IN_GROUPS.has(g.id)) : allGroups
  const all = groups.flatMap((g) => g.items)
  const map = translationMap(saved.rows)
  const todo = all.filter((t) => aiMayWrite(map.get(t.key), t.source)).slice(0, PER_PRESS)
  const counted = (drafted: Set<string>) => all.filter((t) => drafted.has(t.key) || statusOf(map.get(t.key), t.source) === "done" || statusOf(map.get(t.key), t.source) === "draft").length
  if (todo.length === 0) return { ok: true, drafted: 0, left: 0, done: counted(new Set()), total: all.length }
  /* One already translated under another key is reused (translate-ai.ts draftReusing); the rest go to Storelib AI. */
  const { drafts, unavailable, reason, busy } = await draftReusing(todo.map((t) => ({ key: t.key, source: t.source })), saved.rows, where.defaultLanguage, locale, store?.name || "the store", { deadlineAt })
  /* 429: every translator is out of allowance for now; the background job waits and carries on. */
  if (unavailable && drafts.size === 0) return { ok: false, status: busy ? 429 : 503, error: reason ?? AI_UNAVAILABLE }
  const items = todo.filter((t) => drafts.has(t.key)).map((t) => ({ key: t.key, value: drafts.get(t.key)!, source: t.source, approved: false, ai: true, rich: /<[a-z][\s\S]*>/i.test(t.source) }))
  /* keepManual: one the merchant saved while this was drafting is read again just before the write and left alone. */
  const done = await saveTranslations(db, creatorId, locale, items, userId, { keepManual: true })
  if (done.ok === false) return { ok: false, status: done.status, error: done.error }
  const written = new Set(items.map((i) => i.key))
  const left = all.filter((t) => !written.has(t.key) && aiMayWrite(map.get(t.key), t.source)).length
  return { ok: true, drafted: done.saved, left, done: counted(written), total: all.length }
}
