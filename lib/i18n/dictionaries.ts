/**
 * Marketplace UI dictionaries, every locale (lib/i18n/dictionaries-core.ts has
 * the part every page carries). Single source of truth for translatable
 * strings read by `useLocale().t(key)` and the server's t().
 */
import { coreDictionaries, type LocaleCode } from "./dictionaries-core"
// Fully translated locales. Unlike the per-surface dicts, each of these is one
// flat, complete map -- see the header of lib/i18n/dict/es.ts for why.
import { esDict } from "./dict/es"
import { frDict } from "./dict/fr"
import { deDict } from "./dict/de"

export type { LocaleCode } from "./dictionaries-core"

export const dictionaries: Record<LocaleCode, Record<string, string>> = {
  ...coreDictionaries,
  es: esDict,
  de: deDict,
  fr: frDict,
}
