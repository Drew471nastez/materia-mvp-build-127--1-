import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { storeIdentity } from "@/lib/store/identity-server"
import { normalizeLocale } from "@/lib/markets/locales"
import { editorLanguages } from "@/lib/markets/model"
import { localizationOf, saveTranslations, siteTexts, translationsOf } from "@/lib/markets/server"
import { BUILT_IN_GROUPS, aiMayWrite, isEnglish, translationMap } from "@/lib/markets/translate"
import { canDraftWithAi, draftReusing } from "@/lib/markets/translate-ai"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Up to this many texts a press: a whole small website, a large one in a few presses. */
const PER_PRESS = 150

/**
 * No batch starts after this much of the press: what came back by then is
 * saved and counted, and the rest is the next press's (the sheet asks
 * again until nothing is left). Leaves room inside maxDuration for the save.
 */
const DRAFT_WINDOW_MS = 85_000

/**
 * POST { locale }: "Translate with AI". The website's texts in that language
 * that are missing or outdated, drafted by Storelib AI. A translation the
 * merchant wrote or edited is never sent or replaced, outdated or not: it
 * shows as outdated in the sheet for them to update. Drafted by Storelib AI
 * (lib/markets/translate-ai.ts) and saved as drafts to review. The store's
 * own, through its owner; twelve presses an hour, which is one whole "Translate
 * everything" (the sheet presses up to twelve times), as each is a paid call.
 * What AI may write is lib/markets/translate.ts aiMayWrite, the same rule as
 * the hourly job's (lib/markets/auto-translate.ts).
 */

export async function POST(request: Request) {
  const started = Date.now()
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  if (!canDraftWithAi()) return physicalJson({ error: "Translating with AI isn't available right now. You can still write each translation yourself." }, 503)
  const limited = await rateLimit({ bucket: "site-translations-ai", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 12, seconds: 3600 }, { limit: 40, seconds: 86400 }], message: "Translating with AI can be used a few times an hour. Try again later." })
  if (limited) return limited
  const body = await readBody(request)
  const loc = (await localizationOf(c.db, c.creatorId, SHOP_CURRENCY)).value
  const locale = normalizeLocale(body?.locale)
  /* The website's own language, when it is not English: the shop's own words and the checkout's only (translate.ts BUILT_IN_GROUPS). */
  const own = !!locale && locale === loc.defaultLanguage && !isEnglish(locale)
  if (!locale || (!own && (locale === loc.defaultLanguage || !editorLanguages(loc).includes(locale)))) return physicalJson({ error: "Add this language to your website first." }, 400)

  const [allGroups, saved, store] = await Promise.all([siteTexts(c.db, c.creatorId), translationsOf(c.db, c.creatorId, locale), storeIdentity(c.db, c.creatorId).catch(() => null)])
  const groups = own ? allGroups.filter((g) => BUILT_IN_GROUPS.has(g.id)) : allGroups
  const map = translationMap(saved.rows)
  const todo = groups
    .flatMap((g) => g.items)
    .filter((t) => aiMayWrite(map.get(t.key), t.source))
    .slice(0, PER_PRESS)
  if (todo.length === 0) return physicalJson({ drafted: 0, left: 0 })
  /* One already translated under another key is reused (lib/markets/translate-ai.ts draftReusing); the rest go to Storelib AI. */
  const { drafts, unavailable } = await draftReusing(todo.map((t) => ({ key: t.key, source: t.source })), saved.rows, loc.defaultLanguage, locale, store?.name || "the store", { deadlineAt: started + DRAFT_WINDOW_MS })
  if (unavailable && drafts.size === 0) return physicalJson({ error: "Translating with AI isn't available right now. You can still write each translation yourself." }, 503)
  const items = todo.filter((t) => drafts.has(t.key)).map((t) => ({ key: t.key, value: drafts.get(t.key)!, source: t.source, approved: false, ai: true, rich: /<[a-z][\s\S]*>/i.test(t.source) }))
  /* keepManual: one the merchant saved while this was drafting is read again just before the write and left alone. */
  const done = await saveTranslations(c.db, c.creatorId, locale, items, c.userId, { keepManual: true })
  if (done.ok === false) return physicalJson({ error: done.error }, done.status)
  await recordActivity(c.db, c, { action: "website.translations", meta: { locale, drafted: done.saved } })
  const remaining = groups.flatMap((g) => g.items).filter((t) => !drafts.has(t.key) && aiMayWrite(map.get(t.key), t.source)).length
  return physicalJson({ drafted: done.saved, left: remaining })
}
