/**
 * Which settings of an imported Shopify theme's sections and blocks are
 * text a translation is laid over: read from the theme's own schemas. Kept
 * apart from ./compat.ts (server only) because the builder's canvas reads
 * them too, to preview the website in another language.
 */
import type { CompatTheme } from "@/lib/storelib-theme/compat/theme"
import type { SchemaField } from "@/lib/website-builder/types"
import { localizeCards, localizeRecord, themeWordKey, valueFor, type TranslateOpts, type TranslationMap } from "./translate"
import { UI_WORDS, uiKey, type UiWord } from "./ui-words"
import { reviewAppBlockSchema } from "@/lib/storelib-theme/compat/review-app-blocks"

type O = Record<string, unknown>

/** The theme's own schema settings, as the translation reader takes them ({ id, type }). */
function settingsOf(schema: O | undefined): SchemaField[] | undefined {
  const list = schema?.settings
  return Array.isArray(list) ? (list as SchemaField[]).filter((f) => f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string") : undefined
}

/** Which of a section's and a block's settings are text, for an imported theme: its section files' and theme blocks' schemas. */
export function compatFields(theme: CompatTheme): { fieldsOf: (t: string) => SchemaField[] | undefined; blockFieldsOf: (st: string, bt: string) => SchemaField[] | undefined } {
  /* Labels in the theme's own words ("Heading", not "t:sections.hero.settings.heading.label"), for the Translate sheet. */
  const named = (list: SchemaField[] | undefined) => list?.map((f) => ({ ...f, label: theme.schemaLabel((f as { label?: unknown }).label) || f.id }))
  return {
    fieldsOf: (t) => named(settingsOf(theme.schemaOf("sections", t))),
    blockFieldsOf: (st, bt) => {
      const own = (Array.isArray(theme.schemaOf("sections", st).blocks) ? (theme.schemaOf("sections", st).blocks as O[]) : []).find((b) => b.type === bt)
      /* Storelib Reviews' own app blocks have no file in the theme: their Heading is translated as the panel names it (review-app-blocks.ts). */
      return named(settingsOf(own) ?? settingsOf(theme.schemaOf("blocks", bt)) ?? reviewAppBlockSchema(bt)?.fields)
    },
  }
}

const LIVE = { approvedOnly: true, fresh: true }

/**
 * A product of an imported theme in a language, the one function the live
 * website (lib/markets/compat.ts) and the builder's canvas both lay it over
 * with: its card (title, plain description, options and variants' names,
 * translate.ts localizeCards), its search engine title, and the rich
 * description its page draws.
 */
export function compatCardIn<T extends { id: string; settings: unknown; descriptionHtml?: string }>(c: T, map: TranslationMap | null | undefined, opts: TranslateOpts = LIVE): T {
  if (!map || map.size === 0) return c
  const worded = localizeCards([{ id: c.id, settings: c.settings }], map, opts)[0].settings as O
  const settings = typeof worded.seo_title === "string" ? localizeRecord(worded, `product:${c.id}`, ["seo_title"], map, opts) : worded
  const html = c.descriptionHtml !== undefined ? (localizeRecord({ description: c.descriptionHtml }, `product:${c.id}`, ["description"], map, opts).description as string) : c.descriptionHtml
  return settings === c.settings && html === c.descriptionHtml ? c : { ...c, settings, ...(html !== undefined ? { descriptionHtml: html } : {}) }
}

/** A collection's own title and description in a language (collection:<id>), live and in the canvas alike. */
export function compatCollectionIn<T extends { id: string }>(c: T, map: TranslationMap | null | undefined, opts: TranslateOpts = LIVE): T {
  if (!map || map.size === 0) return c
  const record = c as unknown as O
  return localizeRecord(record, `collection:${c.id}`, (["title", "description"] as const).filter((f) => typeof record[f] === "string"), map, opts) as unknown as T
}

/** The theme's own words (`| t`) as the store translated them (tw:<key>), each only while written for the theme's word as it is now. */
export function compatThemeWords(defaults: { key: string; value: string }[], map: TranslationMap | null | undefined, opts: TranslateOpts = LIVE): Record<string, string> {
  const out: Record<string, string> = {}
  if (!map || map.size === 0) return out
  for (const w of defaults) {
    const v = valueFor(map, themeWordKey(w.key), opts, w.value)
    if (v) out[w.key] = v
  }
  return out
}

/**
 * Storelib's own words (Translate › Shop words, `ui:<name>`) as the store
 * translated them: what Storelib draws inside an imported theme (the review
 * widgets, Storelib Reviews' blocks and section) reads them as the page's
 * `i18n.uiWords`. The website (compat.ts) and the builder's canvas ask this
 * one function, so the canvas says what the website says.
 */
export function compatUiWords(map: TranslationMap | null | undefined, opts: TranslateOpts = LIVE): Record<string, string> {
  const out: Record<string, string> = {}
  if (!map || map.size === 0) return out
  for (const w of Object.keys(UI_WORDS) as UiWord[]) {
    const v = valueFor(map, uiKey(w), opts)
    if (v) out[w] = v
  }
  return out
}
