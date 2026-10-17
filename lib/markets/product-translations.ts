import "server-only"

/**
 * ===========================================================================
 *  ONE PRODUCT IN THE WEBSITE'S OTHER LANGUAGES (Products › Translations)
 * ===========================================================================
 * A product's title, description and search engine text, per language, kept
 * beside the product and never in it: the product row is read here, never
 * written. Each field of each language is its own translation row
 * (site_translations, `product:<id>:<field>`), so a change to one never
 * reaches another language, another field, or the merchant's own words.
 *
 *   view           the original of each field and its value in every other
 *                  language of the website, with where it stands
 *   saveField      a person's translation of one field: the original it is
 *                  written for is read from the product here, never taken
 *                  from the request, so "outdated" always means the
 *                  product's words changed since
 *   translateAuto  Translate automatically, pressed: the fields with no
 *                  translation, or Storelib AI's own whose original changed,
 *                  in one language. Never one a person wrote, never the
 *                  product itself. Nothing is translated unless asked here
 *                  or by the store's own "Translate changes automatically".
 *   showOriginal   Always show the original: none of the product's
 *                  translations are drawn (lib/markets/live.ts), and none
 *                  are made, until it is turned off. Kept, not deleted.
 *
 * Every function names the store (the caller's own, through lib/team) and
 * finds the product inside it: another store's product id reads as not found.
 */
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { storeIdentity } from "@/lib/store/identity-server"
import { editorLanguages } from "./model"
import { localizationOf, originalProductsOf, productTranslationRows, saveTranslations, setProductShowsOriginal } from "./server"
import { PRODUCT_TRANSLATED_FIELDS, aiMayWrite, productKey, statusOf, translationMap, type ProductTranslatedField } from "./translate"
import { draftReusing } from "./translate-ai"
import { detectLanguage } from "./detect-language"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type ProductField = { field: ProductTranslatedField; source: string; rich: boolean }
export type ProductFieldValue = { value: string; status: "missing" | "outdated" | "draft" | "done"; ai: boolean }
export interface ProductTranslationsView {
  ready: boolean
  defaultLanguage: string
  /** The website's other languages, published or not, in the store's order. */
  languages: { code: string; published: boolean }[]
  showOriginal: boolean
  /** False until SQL part 211 has run: the switch says so. */
  showOriginalReady: boolean
  fields: ProductField[]
  values: Record<string, Partial<Record<ProductTranslatedField, ProductFieldValue>>>
}

type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string }
const NOT_FOUND = { ok: false as const, status: 404, error: "That product isn't in your store." }

const isRich = (field: ProductTranslatedField, text: string) => field === "description" && /<[a-z][\s\S]*>/i.test(text)

/** The product, inside this store only, with the fields that are translated. Never written. */
async function productOf(db: Db, creatorId: string, productId: string): Promise<Record<string, unknown> | null> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return null
  const { data } = await db.from("products").select("id, title, description, seo_title, seo_description").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

function fieldsOf(product: Record<string, unknown>): ProductField[] {
  const out: ProductField[] = []
  for (const f of PRODUCT_TRANSLATED_FIELDS) {
    const v = product[f]
    if (typeof v === "string" && v.trim()) out.push({ field: f, source: v, rich: isRich(f, v) })
  }
  return out
}

async function storeLanguages(db: Db, creatorId: string) {
  const loc = (await localizationOf(db, creatorId, (await readStoreCurrency(db, creatorId)).currency)).value
  const others = editorLanguages(loc).filter((l) => l !== loc.defaultLanguage)
  return { loc, others }
}

export async function productTranslationsView(db: Db, creatorId: string, productId: string): Promise<Result<ProductTranslationsView>> {
  const product = await productOf(db, creatorId, productId)
  if (!product) return NOT_FOUND
  const [{ loc, others }, originals] = await Promise.all([storeLanguages(db, creatorId), originalProductsOf(db, creatorId)])
  const fields = fieldsOf(product)
  /* Every language's rows for this product in one query (server.ts productTranslationRows). */
  const read = await productTranslationRows(db, creatorId, productId, others)
  const values: ProductTranslationsView["values"] = {}
  for (const code of others) {
    const map = translationMap(read.byLocale[code] ?? [])
    values[code] = {}
    for (const f of fields) {
      const row = map.get(productKey(productId, f.field))
      values[code][f.field] = { value: row?.value ?? "", status: statusOf(row, f.source), ai: row?.source === "ai" }
    }
  }
  return {
    ok: true,
    value: {
      ready: read.ready,
      defaultLanguage: loc.defaultLanguage,
      languages: others.map((code) => ({ code, published: loc.languages.some((l) => l.code === code && l.published) })),
      showOriginal: originals.ids.includes(productId),
      showOriginalReady: originals.ready,
      fields,
      values,
    },
  }
}

/** A person's translation of one field in one language; an empty value takes it away and the original shows. */
export async function saveProductField(db: Db, creatorId: string, productId: string, locale: unknown, field: unknown, value: unknown, userId: string | null): Promise<Result<{ status: ProductFieldValue["status"] }>> {
  if (typeof field !== "string" || !(PRODUCT_TRANSLATED_FIELDS as readonly string[]).includes(field)) return { ok: false, status: 400, error: "That isn't a field a product translates." }
  const f = field as ProductTranslatedField
  const product = await productOf(db, creatorId, productId)
  if (!product) return NOT_FOUND
  const { others } = await storeLanguages(db, creatorId)
  if (typeof locale !== "string" || !others.includes(locale)) return { ok: false, status: 400, error: "Add this language to your website first." }
  const source = typeof product[f] === "string" ? (product[f] as string) : ""
  if (!source.trim()) return { ok: false, status: 400, error: "Write this in the original language first." }
  const text = typeof value === "string" ? value : ""
  const saved = await saveTranslations(db, creatorId, locale, [{ key: productKey(productId, f), value: text, source, approved: true, rich: isRich(f, source) }], userId)
  if (saved.ok === false) return { ok: false, status: saved.status, error: saved.error }
  return { ok: true, value: { status: text.trim() ? "done" : "missing" } }
}

/** Translate automatically, pressed for one language: only what has no translation, or Storelib AI's own whose original changed. */
/** `draft`: the translator, Storelib AI's by default (translate-ai.ts draftReusing); a test passes its own so nothing leaves the machine. */
export async function translateProductAuto(db: Db, creatorId: string, productId: string, locale: unknown, userId: string | null, deadlineAt: number, opts: { draft?: typeof draftReusing } = {}): Promise<Result<{ translated: number }>> {
  const product = await productOf(db, creatorId, productId)
  if (!product) return NOT_FOUND
  const [{ loc, others }, originals] = await Promise.all([storeLanguages(db, creatorId), originalProductsOf(db, creatorId)])
  if (typeof locale !== "string" || !others.includes(locale)) return { ok: false, status: 400, error: "Add this language to your website first." }
  if (originals.ids.includes(productId)) return { ok: false, status: 409, error: "This product is set to show its original words in every language." }
  const fields = fieldsOf(product)
  const read = await productTranslationRows(db, creatorId, productId, [locale])
  const map = translationMap(read.byLocale[locale] ?? [])
  const todo = fields.filter((f) => aiMayWrite(map.get(productKey(productId, f.field)), f.source))
  if (todo.length === 0) return { ok: true, value: { translated: 0 } }
  /* From the language the product is really written in, else the website's own. */
  const from = detectLanguage(fields.map((f) => f.source)) ?? loc.defaultLanguage
  const store = await storeIdentity(db, creatorId).catch(() => null)
  const { drafts, unavailable, reason } = await (opts.draft ?? draftReusing)(todo.map((f) => ({ key: productKey(productId, f.field), source: f.source })), read.byLocale[locale] ?? [], from, locale, store?.name || "the store", { deadlineAt })
  if (drafts.size === 0) return { ok: false, status: unavailable ? 503 : 502, error: reason ?? "Automatic translation isn't available right now. You can still write each translation yourself." }
  const items = todo.filter((f) => drafts.has(productKey(productId, f.field))).map((f) => ({ key: productKey(productId, f.field), value: drafts.get(productKey(productId, f.field))!, source: f.source, approved: true, ai: true, rich: f.rich }))
  /* keepManual: one a person saved while this was translating is read again just before the write and left alone. */
  const saved = await saveTranslations(db, creatorId, locale, items, userId, { keepManual: true })
  if (saved.ok === false) return { ok: false, status: saved.status, error: saved.error }
  return { ok: true, value: { translated: saved.saved } }
}

export async function setShowOriginal(db: Db, creatorId: string, productId: string, on: unknown, userId: string | null): Promise<Result<{ showOriginal: boolean }>> {
  if (typeof on !== "boolean") return { ok: false, status: 400, error: "Bad request." }
  const product = await productOf(db, creatorId, productId)
  if (!product) return NOT_FOUND
  const saved = await setProductShowsOriginal(db, creatorId, productId, on, userId)
  if (saved.ok === false) return { ok: false, status: saved.status, error: saved.error }
  return { ok: true, value: { showOriginal: on } }
}
