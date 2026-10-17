import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { recordActivity } from "@/lib/activity/log-server"
import { siteLanguages } from "@/lib/markets/live"
import { cachedTranslations } from "@/lib/markets/server"
import { checkoutKey } from "@/lib/markets/checkout-words"
import { isBuiltInWordKey, translationMap } from "@/lib/markets/translate"
import { languageName, normalizeLocale } from "@/lib/markets/locales"
import { EDITABLE_TEXTS, PROTECTED_TEXTS, TEXT_GROUPS, editableById, placeholdersOf, validateOverride } from "@/lib/checkout-text/registry"
import { defaultFor } from "@/lib/checkout-text/words"
import { readOverrideRows, writeOverride } from "@/lib/checkout-text/server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Checkout › Checkout text. GET ?lang=: the store's languages,
 * each editable text with what checkout shows by default in that language
 * (the merchant's translation, Storelib's curated words, a machine
 * translation, the English) and the store's own words for it, and the
 * locked ones with why. PUT { lang, changes: [{ id, text }] }: each checked
 * (lib/checkout-text/registry validateOverride) and kept with the default it
 * replaced; an empty text goes back to the default. The owner's, or a team
 * member's whose role has the store (shopCaller). Never anything a buyer
 * pays: amounts, legal text and payment words are not in the registry.
 */

async function languagesOf(creatorId: string): Promise<string[]> {
  const langs = await siteLanguages(creatorId).catch(() => null)
  if (!langs) return ["en"]
  return [...new Set([langs.defaultLanguage, ...langs.others])]
}

/** The language asked for, when it is one of the store's; else the website's own. */
function pick(langs: string[], asked: unknown): string {
  const want = normalizeLocale(asked)
  return (want && langs.find((l) => l.toLowerCase() === want.toLowerCase())) || langs[0] || "en"
}

async function defaultsFor(creatorId: string, lang: string, own: boolean): Promise<Map<string, string>> {
  const rows = await cachedTranslations(creatorId, lang).catch(() => [])
  /* The website's own language translates only Storelib's own words (translate.ts BUILT_IN_GROUPS), as the checkout reads it. */
  const map = translationMap(rows.filter((r) => r.status === "approved" && (!own || isBuiltInWordKey(r.key))))
  return new Map(EDITABLE_TEXTS.map((e) => [e.id, defaultFor(e.source, lang, map, checkoutKey)]))
}

export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const langs = await languagesOf(c.creatorId)
  const lang = pick(langs, new URL(request.url).searchParams.get("lang"))
  const [defaults, stored, shop, currency] = await Promise.all([
    defaultsFor(c.creatorId, lang, lang === langs[0]),
    readOverrideRows(c.db, c.creatorId, lang),
    c.db.from("creators").select("display_name, username").eq("id", c.creatorId).maybeSingle(),
    readStoreCurrency(c.db, c.creatorId).catch(() => ({ currency: "USD" })),
  ])
  const byId = new Map(stored.rows.map((r) => [r.textId, r]))
  const row = shop?.data as { display_name?: string | null; username?: string | null } | null
  return physicalJson({
    ready: stored.ready,
    lang,
    languages: langs.map((code) => ({ code, name: languageName(code, "en"), own: languageName(code) })),
    shopName: (row?.display_name || row?.username || "Your store").slice(0, 80),
    currency: (currency as { currency: string }).currency,
    groups: TEXT_GROUPS,
    items: EDITABLE_TEXTS.map((e) => {
      const kept = byId.get(e.id)
      const def = defaults.get(e.id) ?? e.source
      return {
        id: e.id,
        group: e.group,
        source: e.source,
        note: e.note,
        max: e.max,
        placeholders: placeholdersOf(e.source),
        default: def,
        value: kept?.value ?? "",
        /* Storelib's words for it changed after the store wrote its own: theirs still shows, and the editor says so. */
        defaultChanged: !!kept && !!kept.defaultText && kept.defaultText !== def,
      }
    }),
    locked: PROTECTED_TEXTS,
  })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !Array.isArray(body.changes)) return physicalJson({ error: "Bad request." }, 400)
  if (body.changes.length > EDITABLE_TEXTS.length) return physicalJson({ error: "Too many changes at once." }, 400)
  const langs = await languagesOf(c.creatorId)
  const want = normalizeLocale(body.lang)
  const lang = want && langs.find((l) => l.toLowerCase() === want.toLowerCase())
  if (!lang) return physicalJson({ error: "That language isn't on your website." }, 400)
  /* Every change checked before any is written, so one bad field never leaves half a save. */
  const checked: { id: string; text: string | null }[] = []
  for (const raw of body.changes as { id?: unknown; text?: unknown }[]) {
    const entry = typeof raw?.id === "string" ? editableById(raw.id) : undefined
    if (!entry) return physicalJson({ error: "That text can't be changed.", id: raw?.id ?? null }, 400)
    const v = validateOverride(entry, raw.text)
    if (!v.ok) return physicalJson({ error: v.error, id: entry.id }, 400)
    checked.push({ id: entry.id, text: v.text })
  }
  const defaults = await defaultsFor(c.creatorId, lang, lang === langs[0])
  for (const ch of checked) {
    const def = defaults.get(ch.id) ?? editableById(ch.id)!.source
    /* The same as the default is no change: kept as "use the default", so a later better default reaches the checkout. */
    const value = ch.text && ch.text !== def ? ch.text : null
    const saved = await writeOverride(c.db, c.creatorId, lang, ch.id, value, def, c.userId)
    if (!saved.ok) return physicalJson({ error: saved.error }, saved.status)
  }
  await recordActivity(c.db, c, { action: "settings.checkout" }).catch(() => undefined)
  return physicalJson({ ok: true, saved: checked.length })
}
