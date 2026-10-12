/**
 * ===========================================================================
 *  THE DASHBOARD'S WORDS, WRITTEN IN ENGLISH WHERE THEY ARE USED
 * ===========================================================================
 * tt("No orders yet") is the English sentence and the key at once: the
 * component reads as it always did, and a language that has no word for it
 * yet shows the English one, never a key.
 *
 *   tt("Saved")
 *   tt("Receipt emailed {date}", { date })
 *   tt("{count, plural, one {# order} other {# orders}}", { count })
 *
 * The catalogs (lib/i18n/catalog/<code>.json) map each English sentence to the
 * language's own. Only the chosen language is fetched: LanguageProvider
 * loads it before it draws /app (lib/i18n/context.tsx), so the first frame
 * is already in the right language. scripts/check-i18n.mjs keeps every
 * sentence a creator reads inside tt() and every catalog complete.
 *
 * Messages are a small part of ICU MessageFormat: {name}, {n, number},
 * {n, plural, =0 {...} one {...} few {...} many {...} other {...}} with #
 * for the number, and {key, select, a {...} other {...}}. Plural categories
 * come from Intl.PluralRules, so Polish gets its few and many.
 */

export type DashboardLanguage = "en" | "es" | "fr" | "de" | "pt-BR" | "it" | "pl"
export type Vars = Record<string, string | number | null | undefined>

/** The BCP 47 tag dates and numbers are written in, per dashboard language. */
export const LOCALE_TAG: Record<string, string> = {
  en: "en-US",
  "en-GB": "en-GB",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  "pt-BR": "pt-BR",
  pt: "pt-PT",
  it: "it-IT",
  pl: "pl-PL",
  nl: "nl-NL",
}

const STORAGE_KEY = "storelib_language"

let active: string | null = null
let catalog: Record<string, string> = {}

/** The language tt() writes in now. */
export function activeLanguage(): string {
  if (active) return active
  /* Before the provider has said (a module read at import): the stored choice. */
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) return stored
    } catch {
      /* Storage refused: English. */
    }
  }
  return "en"
}

/** The locale tag for Intl in the dashboard's language ("de-DE"). */
export function activeLocale(): string {
  return LOCALE_TAG[activeLanguage()] ?? "en-US"
}

/** Called by LanguageProvider once the language's words are here. */
export function setCatalog(language: string, words: Record<string, string>): void {
  active = language
  catalog = words
}

/** The words of one language, fetched on its own (each is its own chunk). */
export async function loadCatalog(language: string): Promise<Record<string, string>> {
  switch (language) {
    case "es":
      return (await import("./catalog/es.json")).default as Record<string, string>
    case "fr":
      return (await import("./catalog/fr.json")).default as Record<string, string>
    case "de":
      return (await import("./catalog/de.json")).default as Record<string, string>
    case "pt-BR":
    case "pt":
      return (await import("./catalog/pt-BR.json")).default as Record<string, string>
    case "it":
      return (await import("./catalog/it.json")).default as Record<string, string>
    case "pl":
      return (await import("./catalog/pl.json")).default as Record<string, string>
    default:
      return {}
  }
}

/** Translate an English sentence into the dashboard's language. */
export function tt(source: string, vars?: Vars): string {
  const template = (active && active !== "en" && catalog[source]) || source
  if (!vars && template.indexOf("{") === -1) return template
  return formatMessage(template, vars ?? {}, activeLocale())
}

/**
 * A sentence kept in a constant and translated where it is shown, with
 * tt(value): msg() only marks it, so the catalogs and scripts/check-i18n.mjs
 * know it, and returns it unchanged (its literal type too, for `as const`
 * lists and keys that are compared).
 */
export function msg<T extends string>(source: T): T {
  return source
}

/** The same, bound to a language and its words: the server's tt (lib/i18n/server). */
export function makeTt(language: string, words: Record<string, string>): (source: string, vars?: Vars) => string {
  const locale = LOCALE_TAG[language] ?? "en-US"
  return (source, vars) => {
    const template = (language !== "en" && words[source]) || source
    if (!vars && template.indexOf("{") === -1) return template
    return formatMessage(template, vars ?? {}, locale)
  }
}

/**
 * A key no dictionary has, said as words rather than shown as a key:
 * "settings.saveChanges" reads "Save changes". Never a raw key on screen.
 */
export function humanizeKey(key: string): string {
  const last = key.split(".").pop() ?? key
  const words = last.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase()
  return words ? words[0].toUpperCase() + words.slice(1) : ""
}

/* ------------------------------------------------------------------------ */
/*  The message format                                                       */
/* ------------------------------------------------------------------------ */

const pluralRules = new Map<string, Intl.PluralRules>()
function pluralCategory(locale: string, n: number): string {
  let rules = pluralRules.get(locale)
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale)
    } catch {
      rules = new Intl.PluralRules("en-US")
    }
    pluralRules.set(locale, rules)
  }
  return rules.select(n)
}

const numberFormats = new Map<string, Intl.NumberFormat>()
export function formatNumberIn(locale: string, n: number): string {
  let f = numberFormats.get(locale)
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale)
    } catch {
      f = new Intl.NumberFormat("en-US")
    }
    numberFormats.set(locale, f)
  }
  return f.format(n)
}

/** Find the brace that closes the one at `open`. */
function closing(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** "=0 {none} one {# order} other {# orders}" into its cases. */
function cases(body: string): Map<string, string> {
  const out = new Map<string, string>()
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++
    const start = i
    while (i < body.length && body[i] !== "{" && !/\s/.test(body[i])) i++
    const key = body.slice(start, i)
    while (i < body.length && /\s/.test(body[i])) i++
    if (body[i] !== "{") break
    const end = closing(body, i)
    if (end < 0) break
    out.set(key, body.slice(i + 1, end))
    i = end + 1
  }
  return out
}

function valueText(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ""
  return String(v)
}

export function formatMessage(template: string, vars: Vars, locale: string, hash?: string): string {
  let out = ""
  let i = 0
  while (i < template.length) {
    const c = template[i]
    if (c === "#" && hash !== undefined) {
      out += hash
      i++
      continue
    }
    if (c !== "{") {
      out += c
      i++
      continue
    }
    const end = closing(template, i)
    if (end < 0) {
      out += template.slice(i)
      break
    }
    const inner = template.slice(i + 1, end)
    const comma = inner.indexOf(",")
    if (comma < 0) {
      const name = inner.trim()
      out += name in vars ? valueText(vars[name]) : `{${inner}}`
    } else {
      const name = inner.slice(0, comma).trim()
      const rest = inner.slice(comma + 1)
      const comma2 = rest.indexOf(",")
      const type = (comma2 < 0 ? rest : rest.slice(0, comma2)).trim()
      const body = comma2 < 0 ? "" : rest.slice(comma2 + 1)
      const value = vars[name]
      if (type === "number") {
        const n = Number(value)
        out += Number.isFinite(n) ? formatNumberIn(locale, n) : valueText(value)
      } else if (type === "plural") {
        const n = Number(value)
        const options = cases(body)
        const exact = options.get(`=${n}`)
        const chosen = exact ?? options.get(Number.isFinite(n) ? pluralCategory(locale, n) : "other") ?? options.get("other") ?? ""
        out += formatMessage(chosen, vars, locale, Number.isFinite(n) ? formatNumberIn(locale, n) : valueText(value))
      } else if (type === "select") {
        const options = cases(body)
        const chosen = options.get(valueText(value)) ?? options.get("other") ?? ""
        out += formatMessage(chosen, vars, locale, hash)
      } else {
        out += valueText(value)
      }
    }
    i = end + 1
  }
  return out
}
