import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { rateLimit } from "@/lib/api/rate-limit"
import { storeCurrencyOf } from "@/lib/store/currency"
import { normalizeLocale } from "@/lib/markets/locales"
import { editorLanguages } from "@/lib/markets/model"
import { localizationOf, saveTranslations, siteTexts, translationsOf } from "@/lib/markets/server"
import { statusOf, translationMap } from "@/lib/markets/translate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET  /api/store/translations?locale=fr   every piece of text on the store's
 *      website (lib/markets/server siteTexts), each with its value in that
 *      language and where it stands: missing, outdated (the original changed
 *      since), draft or done
 * GET  ?values=1&locale=fr   the approved values only, by key (the builder's preview)
 * PUT  { locale, items: [{ key, value, source, approved, rich }] }   saved;
 *      an empty value takes the translation away
 *
 * The store's own, through its owner (lib/team: the website is not open to
 * team members yet). Only a language the website has may be read or written.
 */
async function storeLanguages(c: { db: any; creatorId: string }) {
  /* The service role client the caller came with (lib/physical/auth shopCaller): a private column, read on the server only. */
  const db = c.db
  const { data } = await db.from("creators").select("payout_currency").eq("id", c.creatorId).maybeSingle()
  const loc = await localizationOf(c.db, c.creatorId, storeCurrencyOf((data as { payout_currency?: string | null } | null)?.payout_currency))
  return { ready: loc.ready, loc: loc.value, languages: editorLanguages(loc.value) }
}

export async function GET(request: Request) {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  const { ready, loc, languages } = await storeLanguages(c)
  const url = new URL(request.url)
  const asked = normalizeLocale(url.searchParams.get("locale"))
  const locale = asked && asked !== loc.defaultLanguage && languages.includes(asked) ? asked : null
  /*
    ?values=1, THE BUILDER'S PREVIEW IN ANOTHER LANGUAGE: the approved
    translations only, by key, as the live site lays them over (lib/markets
    live.ts). A language that is not published yet can be previewed too.
  */
  if (url.searchParams.get("values") === "1") {
    const published = loc.languages.filter((l) => l.published).map((l) => l.code)
    if (!locale) return physicalJson({ locale: null, defaultLanguage: loc.defaultLanguage, languages, published, values: {} })
    const saved = await translationsOf(c.db, c.creatorId, locale)
    /* With the hash of the original each was written for: a menu link's is laid over only while that is still its title (localizeMenus). */
    const values: Record<string, { v: string; h: string }> = {}
    for (const r of saved.rows) if (r.status === "approved" && r.value) values[r.key] = { v: r.value, h: r.sourceHash }
    return physicalJson({ locale, defaultLanguage: loc.defaultLanguage, languages, published, values })
  }
  if (!locale) return physicalJson({ ready, locale: null, defaultLanguage: loc.defaultLanguage, languages, groups: [] })
  const [groups, saved] = await Promise.all([siteTexts(c.db, c.creatorId), translationsOf(c.db, c.creatorId, locale)])
  const map = translationMap(saved.rows)
  let done = 0
  let total = 0
  const out = groups.map((g) => ({
    id: g.id,
    title: g.title,
    items: g.items.map((t) => {
      const row = map.get(t.key)
      const status = statusOf(row, t.source)
      total++
      if (status === "done") done++
      return { ...t, rich: /<[a-z][\s\S]*>/i.test(t.source), value: row?.value ?? "", status, ai: row?.source === "ai" }
    }),
  }))
  return physicalJson({ ready: ready && saved.ready, locale, defaultLanguage: loc.defaultLanguage, languages, groups: out, progress: { done, total } })
}

export async function PUT(request: Request) {
  const c = await shopCaller("website")
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "site-translations", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 120, seconds: 600 }, { limit: 2000, seconds: 86400 }], message: "That is a lot of saves at once. Wait a minute and try again." })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const { loc, languages } = await storeLanguages(c)
  const locale = normalizeLocale(body.locale)
  if (!locale || locale === loc.defaultLanguage || !languages.includes(locale)) return physicalJson({ error: "Add this language to your website first." }, 400)
  const saved = await saveTranslations(c.db, c.creatorId, locale, body.items, c.userId)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  await recordActivity(c.db, c, { action: "website.translations", meta: { locale, saved: saved.saved, removed: saved.removed } })
  return physicalJson({ saved: saved.saved, removed: saved.removed })
}
