import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { storeCurrencyOf } from "@/lib/store/currency"
import { storeIdentity } from "@/lib/store/identity-server"
import { normalizeLocale } from "@/lib/markets/locales"
import { editorLanguages } from "@/lib/markets/model"
import { localizationOf, saveTranslations, siteTexts, translationsOf } from "@/lib/markets/server"
import { statusOf, translationMap } from "@/lib/markets/translate"
import { canDraftWithAi, draftTranslations } from "@/lib/markets/translate-ai"
import { recordActivity } from "@/lib/activity/log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Up to this many texts a press: a whole small website, a large one in a few presses. */
const PER_PRESS = 150

/**
 * POST { locale }: "Translate with AI". The website's texts in that language
 * that are missing, or outdated drafts AI wrote before (a value a person
 * wrote and approved is never sent or replaced, even when its original
 * changed: it is left for them), drafted by Storelib AI
 * (lib/markets/translate-ai.ts) and saved as drafts to review. The store's
 * own, through its owner; a few presses an hour, as each one is a paid call.
 */
export async function POST(request: Request) {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  if (!canDraftWithAi()) return physicalJson({ error: "Translating with AI isn't available right now. You can still write each translation yourself." }, 503)
  const limited = await rateLimit({ bucket: "site-translations-ai", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 6, seconds: 3600 }, { limit: 30, seconds: 86400 }], message: "Translating with AI can be used a few times an hour. Try again later." })
  if (limited) return limited
  const body = await readBody(request)
  /* The service role client the caller came with (lib/physical/auth shopCaller): a private column, read on the server only. */
  const db = c.db
  const { data } = await db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle()
  const loc = (await localizationOf(c.db, c.creatorId, storeCurrencyOf((data as { payout_currency?: string | null } | null)?.payout_currency))).value
  const locale = normalizeLocale(body?.locale)
  if (!locale || locale === loc.defaultLanguage || !editorLanguages(loc).includes(locale)) return physicalJson({ error: "Add this language to your website first." }, 400)

  const [groups, saved, store] = await Promise.all([siteTexts(c.db, c.creatorId), translationsOf(c.db, c.creatorId, locale), storeIdentity(c.db, c.creatorId).catch(() => null)])
  const map = translationMap(saved.rows)
  /*
    What AI may draft: what is missing, and what it drafted before whose
    original changed. A translation a person wrote and approved stays as it
    is when its original changes: it stays live (an outdated approved value is
    still shown) and is listed as outdated for the person to look at, rather
    than replaced by a hidden draft that would put the original back on the
    live site until someone reviewed it.
  */
  const draftable = (t: { key: string; source: string }) => {
    const row = map.get(t.key)
    const s = statusOf(row, t.source)
    if (s === "missing") return true
    return s === "outdated" && !(row?.source === "manual" && row.status === "approved")
  }
  const todo = groups
    .flatMap((g) => g.items)
    .filter(draftable)
    .slice(0, PER_PRESS)
  if (todo.length === 0) return physicalJson({ drafted: 0, left: 0 })
  const { drafts, unavailable } = await draftTranslations(todo.map((t) => ({ key: t.key, source: t.source })), loc.defaultLanguage, locale, store?.name || "the store")
  if (unavailable && drafts.size === 0) return physicalJson({ error: "Translating with AI isn't available right now. You can still write each translation yourself." }, 503)
  const items = todo.filter((t) => drafts.has(t.key)).map((t) => ({ key: t.key, value: drafts.get(t.key)!, source: t.source, approved: false, ai: true, rich: /<[a-z][\s\S]*>/i.test(t.source) }))
  const done = await saveTranslations(c.db, c.creatorId, locale, items, c.userId)
  if (done.ok === false) return physicalJson({ error: done.error }, done.status)
  await recordActivity(c.db, c, { action: "website.translations", meta: { locale, drafted: done.saved } })
  const remaining = groups.flatMap((g) => g.items).filter((t) => !drafts.has(t.key) && draftable(t)).length
  return physicalJson({ drafted: done.saved, left: remaining })
}
