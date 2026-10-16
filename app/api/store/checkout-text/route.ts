import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { rateLimit } from "@/lib/api/rate-limit"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { normalizeLocale } from "@/lib/markets/locales"
import { editorLanguages } from "@/lib/markets/model"
import { localizationOf, savedTranslations, saveTranslations } from "@/lib/markets/server"
import { curatedValue } from "@/lib/markets/curated-words"
import { CHECKOUT_TEXT_WORDS, checkoutTextWord, checkWording, wordingError } from "@/lib/markets/checkout-text"
import { storeIdentity } from "@/lib/store/identity-server"
import { isEnglish, translationMap, valueFor } from "@/lib/markets/translate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET  /api/store/checkout-text?locale=ro   the cart's and checkout's words a
 *      store may reword (lib/markets/checkout-text.ts), each with what shows
 *      without the store's wording (`fallback`: Storelib's hand written words,
 *      else the automatic translation, else the English) and the store's own
 *      (`value`, empty when it has none)
 * PUT  { locale, items: [{ key, value }] }   saved as the store's own
 *      translation (source "manual", approved), which nothing automatic ever
 *      replaces; an empty value takes it away and Storelib's shows again
 *
 * Settings › Checkout, so the store's settings area (lib/team). Only a
 * language the website has, its default included: in English the rows are
 * kept in "en" and read for the store's own wording only.
 */
async function languagesOf(c: { db: any; creatorId: string }) {
  const loc = await localizationOf(c.db, c.creatorId, (await readStoreCurrency(c.db, c.creatorId)).currency)
  return { ready: loc.ready, defaultLanguage: loc.value.defaultLanguage, languages: [...new Set(editorLanguages(loc.value))] }
}

export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { ready, defaultLanguage, languages } = await languagesOf(c)
  const asked = normalizeLocale(new URL(request.url).searchParams.get("locale"))
  const locale = asked && languages.includes(asked) ? asked : defaultLanguage
  const [saved, store] = await Promise.all([savedTranslations(c.db, c.creatorId, locale), storeIdentity(c.db, c.creatorId, { skipStoreLogo: true }).catch(() => null)])
  const map = translationMap(saved.rows)
  const items = CHECKOUT_TEXT_WORDS.map((w) => {
    const row = map.get(w.key)
    const own = row?.source === "manual" && row.status === "approved" ? row.value : ""
    /* What a buyer reads without the store's wording: never an outdated machine translation (translate.ts valueFor). */
    const machine = row?.source === "ai" ? valueFor(map, w.key, { approvedOnly: true, fresh: true }, w.source) : null
    const fallback = isEnglish(locale) ? w.source : (curatedValue(locale, w.key) ?? machine ?? w.source)
    return { key: w.key, source: w.source, group: w.group, fallback, value: own }
  })
  /* The store's name, for the preview's "Pay {shop}". */
  return physicalJson({ ready: ready && saved.ready, locale, defaultLanguage, languages, shop: store?.name ?? "", items })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "checkout-text", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }, { limit: 600, seconds: 86400 }], message: "That is a lot of saves at once. Wait a minute and try again." })
  if (limited) return limited
  const body = await readBody(request)
  if (!body || !Array.isArray(body.items)) return physicalJson({ error: "Bad request." }, 400)
  const { languages } = await languagesOf(c)
  const locale = normalizeLocale(body.locale)
  if (!locale || !languages.includes(locale)) return physicalJson({ error: "Add this language to your website first." }, 400)
  if (body.items.length > CHECKOUT_TEXT_WORDS.length) return physicalJson({ error: "Bad request." }, 400)
  const writes: { key: string; value: string; source: string; approved: true }[] = []
  for (const raw of body.items as { key?: unknown; value?: unknown }[]) {
    /* Only the words Checkout text lists: never an amount, a tax line, the terms, a payment or security note. */
    const word = checkoutTextWord(raw?.key)
    if (!word) return physicalJson({ error: "That text can't be changed here." }, 400)
    const checked = checkWording(word, raw.value)
    if (checked.ok === false) return physicalJson({ error: wordingError(word, checked.problem) }, 400)
    writes.push({ key: word.key, value: checked.value, source: word.source, approved: true })
  }
  if (writes.length === 0) return physicalJson({ saved: 0, removed: 0 })
  /* No `ai`: saved as the store's own (source "manual"), which aiMayWrite and withCurated never replace. */
  const saved = await saveTranslations(c.db, c.creatorId, locale, writes, c.userId)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  await recordActivity(c.db, c, { action: "settings.checkout", meta: { checkoutText: locale, saved: saved.saved, removed: saved.removed } })
  return physicalJson({ saved: saved.saved, removed: saved.removed })
}
