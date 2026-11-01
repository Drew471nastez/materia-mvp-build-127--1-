/**
 * The four complete locales, each its own chunk, fetched the first time
 * somebody reads one (round 27). Its own file (round 46) so the platform
 * header's words (lib/i18n/locale-words-shell.ts) fetch them the same way
 * without importing the per-surface English dictionaries.
 */
import type { LazyLocale } from "./locale-sizes"

/** The lazy locale's dictionary, fetched once. */
export function loadLazyDictionary(code: LazyLocale): Promise<Record<string, string>> {
  if (code === "ro") return import("./dict/ro").then((m) => m.roDict)
  if (code === "es") return import("./dict/es").then((m) => m.esDict)
  if (code === "fr") return import("./dict/fr").then((m) => m.frDict)
  return import("./dict/de").then((m) => m.deDict)
}
