/**
 * The dashboard in seven languages, round 25.
 *
 * "The dashboard language setting offers English, Espanol, German, French.
 * Add three more [...] and make the WHOLE creator dashboard and app translate
 * correctly in every language. Missing keys fall back to English, never show
 * raw keys. Also the time zone setting must work."
 *
 *   SEVEN        English, Spanish, French, German, Portuguese (Brazil),
 *                Italian and Polish are offered, each with its own words
 *   tt()         an English sentence is the key: a missing translation reads
 *                in English, a missing dot key reads as words, never as a key
 *   PLURALS      ICU plurals by Intl.PluralRules, so Polish has few and many
 *   CATALOGS     every catalog keeps each sentence's {placeholders}, and none
 *                is empty
 *   COMPLETE     scripts/check-i18n.mjs finds no bare sentence, no tt() that
 *                runs before the words arrive, and no gap in any language
 *   DATES        dates and numbers in the chosen language and time zone
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { formatMessage, humanizeKey, makeTt, LOCALE_TAG, msg, setCatalog, tt, ttx } from "../lib/i18n/text"
import { getTranslation, translations, LANGUAGES } from "../lib/i18n/translations"
import { instantAt, wallClockIn, zoned } from "../lib/i18n/format"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const LANGS = ["es", "fr", "de", "pt-BR", "it", "pl"] as const

/* The catalogs, read as data (their body is JSON, see scripts/i18n/catalog-file.mjs). */
function catalog(code: string): Record<string, string> {
  const text = read(`lib/i18n/catalog/${code}.ts`)
  return JSON.parse(text.slice(text.indexOf("= {") + 2, text.lastIndexOf("}") + 1))
}
const catalogs = Object.fromEntries(LANGS.map((l) => [l, catalog(l)])) as Record<(typeof LANGS)[number], Record<string, string>>

console.log("\nSeven languages, each with its own words\n")
{
  const offered = Object.keys(translations).sort()
  check("the dashboard's dot keys exist in all seven", JSON.stringify(offered) === JSON.stringify(["de", "en", "es", "fr", "it", "pl", "pt-BR"].sort()), offered)
  const en = Object.keys(translations.en)
  for (const code of ["es", "fr", "de", "pt-BR", "it", "pl"] as const) {
    const dict = (translations as Record<string, Record<string, string>>)[code]
    const missing = en.filter((k) => !dict[k])
    check(`${code}: every dot key has its words`, missing.length === 0, missing.slice(0, 5))
  }
  check("each is listed by its own name", ["Português (Brasil)", "Italiano", "Polski"].every((n) => LANGUAGES.some((l) => l.name === n)))
  const picker = read("lib/i18n/app-languages.ts")
  check("the picker offers what has words, named in the dashboard's own language under it", /LANGUAGES\.filter\(\(l\) => l\.code in translations\)/.test(picker) && /nameIn\(here, l\.code\)/.test(picker))
  check("dates are written in each language's own form", LOCALE_TAG["pt-BR"] === "pt-BR" && LOCALE_TAG.pl === "pl-PL" && LOCALE_TAG.it === "it-IT")
}

console.log("\nA missing word reads in English, a missing key as words, never as a key\n")
{
  const de = makeTt("de", { "Save changes": "Änderungen speichern" })
  check("a translated sentence reads in the language", de("Save changes") === "Änderungen speichern")
  check("a sentence with no words yet reads in English", de("A sentence nobody translated") === "A sentence nobody translated")
  check("English reads as written", makeTt("en", catalogs.de)("Save changes") === "Save changes")
  check("a dot key no dictionary has reads as words", humanizeKey("settings.saveChanges") === "Save changes" && humanizeKey("nav.upgrade_to_pro") === "Upgrade to pro")
  check("getTranslation never returns a key", getTranslation("pl", "settings.title") === "Ustawienia" && getTranslation("xx", "settings.title") === "Settings" && !/\./.test(getTranslation("pl", "no.such.key" as never)))
  check("msg() marks a sentence and returns it unchanged", msg("Lifetime access") === "Lifetime access")
  /* One English word, two meanings: "Left" the side and "Left" someone who went. */
  setCatalog("de", catalogs.de)
  check("a word with two meanings is told apart by its context", tt("Left") === "Links" && ttx("person", "Left") === "Ausgetreten", [tt("Left"), ttx("person", "Left")])
  setCatalog("de", {})
  check("a context with no words yet reads in English, never the other meaning", ttx("person", "Left") === "Left")
  setCatalog("en", {})
  const ctx = read("lib/i18n/context.tsx")
  check("the provider fetches the language's words before it draws /app", /void bringWords\(lang\)\.then\(\(\) => \{[\s\S]*?setIsHydrated\(true\)/.test(ctx))
  check("a new choice draws /app again with the new words", /<Fragment key=\{language\}>\{children\}<\/Fragment>/.test(ctx) && /void bringWords\(next\)\.then\(\(\) => setLanguageState\(next\)\)/.test(ctx))
  check("the server reads the same choice from the cookie", /document\.cookie = `\$\{LANGUAGE_STORAGE_KEY\}=\$\{lang\}/.test(ctx) && /export async function getServerTt/.test(read("lib/i18n/server.ts")))
  check("each language is its own chunk", (read("lib/i18n/text.ts").match(/await import\("\.\/catalog\//g) ?? []).length === 6)
}

console.log("\nPlurals, numbers and choices\n")
{
  const one = "{count, plural, one {# order} other {# orders}}"
  check("English one and other", formatMessage(one, { count: 1 }, "en-US") === "1 order" && formatMessage(one, { count: 1200 }, "en-US") === "1,200 orders")
  const pl = "{count, plural, one {# zamówienie} few {# zamówienia} many {# zamówień} other {# zamówienia}}"
  check("Polish few and many", formatMessage(pl, { count: 1 }, "pl-PL") === "1 zamówienie" && formatMessage(pl, { count: 3 }, "pl-PL") === "3 zamówienia" && formatMessage(pl, { count: 5 }, "pl-PL") === "5 zamówień" && formatMessage(pl, { count: 22 }, "pl-PL") === "22 zamówienia")
  check("an exact case wins", formatMessage("{n, plural, =0 {none} one {# file} other {# files}}", { n: 0 }, "en-US") === "none")
  check("# writes the number in the language's digits", formatMessage("{n, plural, other {# Artikel}}", { n: 1234 }, "de-DE") === "1.234 Artikel")
  check("select", formatMessage("{kind, select, course {Course} other {Product}}", { kind: "course" }, "en-US") === "Course")
  check("plain values", formatMessage("Receipt emailed {date}", { date: "Oct 12" }, "en-US") === "Receipt emailed Oct 12")
  check("a value that is not given stays visible rather than vanishing", formatMessage("Hello {name}", {}, "en-US") === "Hello {name}")
}

console.log("\nEvery catalog keeps the sentence's placeholders\n")
{
  /* A word inside a plural branch ("one {rate}") is wording, not a value. */
  const names = (s: string) => [...s.matchAll(/(?<![,}]\s*(?:zero|one|two|few|many|other|=\d+)\s*)\{\s*([A-Za-z_]\w*)\s*(?:[,}])/g)].map((m) => m[1]).sort().filter((v, i, a) => a.indexOf(v) === i).join(",")
  for (const code of LANGS) {
    const bad = Object.entries(catalogs[code]).filter(([en, tr]) => names(en) !== names(tr))
    const empty = Object.entries(catalogs[code]).filter(([, tr]) => !tr || !tr.trim())
    const braces = Object.values(catalogs[code]).filter((tr) => (tr.match(/\{/g) ?? []).length !== (tr.match(/\}/g) ?? []).length)
    check(`${code}: ${Object.keys(catalogs[code]).length} sentences, placeholders kept, none empty, braces balanced`, !bad.length && !empty.length && !braces.length, { bad: bad.slice(0, 3), empty: empty.slice(0, 3), braces: braces.slice(0, 3) })
  }
  const dashes = LANGS.flatMap((l) => Object.entries(catalogs[l]).filter(([en, tr]) => tr.includes("—") && !en.includes("—")).map(([en]) => `${l}: ${en}`))
  check("no translation adds an em dash", dashes.length === 0, dashes.slice(0, 5))
}

console.log("\nThe whole dashboard is translated (scripts/check-i18n.mjs)\n")
{
  const out = execFileSync("node", ["scripts/check-i18n.mjs", "--json"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString()
  const r = JSON.parse(out)
  console.log(`        ${r.total} sentences in ${r.files} files; ${r.untranslated} bare; ${Object.entries(r.perLanguage).map(([l, v]: [string, any]) => `${l} ${(v.coverage * 100).toFixed(1)}%`).join(", ")}`)
  check("no sentence a creator reads is left outside tt()", r.untranslated === 0, r.untranslatedList?.slice(0, 10))
  check("no tt() runs when its module loads, before the words arrive", r.atImport === 0, r.atImportList?.slice(0, 10))
  check("no translation drops or renames a placeholder", r.badPlaceholders === 0, r.badPlaceholderList?.slice(0, 5))
  for (const code of LANGS) check(`${code}: every sentence has its words`, r.perLanguage[code].coverage === 1, r.missing?.[code]?.slice(0, 5))
}

console.log("\nDates and numbers in the chosen language and time zone\n")
{
  check("a zone given on purpose is kept (a date-only value at UTC midnight)", zoned({ timeZone: "UTC", month: "short" }).timeZone === "UTC")
  check("otherwise the creator's zone is added", typeof zoned({ month: "short" }).timeZone === "string")
  const at = instantAt(2026, 9, 12, 9, 0, "Europe/Warsaw")
  check("9:00 on 12 October in Warsaw is 07:00 UTC (summer time)", at.toISOString() === "2026-10-12T07:00:00.000Z", at.toISOString())
  const w = wallClockIn(Date.UTC(2026, 0, 15, 23, 30), "America/Sao_Paulo")
  check("and the wall clock reads back in the zone", w.d === 15 && w.h === 20 && w.min === 30, w)
  const composer = read("components/email/compose/composer.tsx")
  check("an email is scheduled in the zone chosen in Settings, not the device's", /const tz = React\.useMemo\(\(\) => appTimeZone\(\), \[\]\)/.test(composer) && /const at = instantAt\(y, \(m \|\| 1\) - 1, d \|\| 1, hour, 0, tz\)/.test(composer))
  check("community events and OnePage schedules start from the chosen zone", /return appTimeZone\(\)/.test(read("components/community/creator/events-section.tsx")) && /return appTimeZone\(\)/.test(read("lib/onepage/schedule.ts")))
  const range = read("lib/date-range/range.ts")
  check("the period button and date boxes are written by Intl outside English", /formatRange\(utc\(r\.start\), utc\(r\.end\)\)/.test(range) && /month: "long", year: "numeric", timeZone: "UTC"/.test(range))
  check("and a typed date is read in the language too (d/m/y, month names)", /const dayFirst = !appLocale\(\)\.startsWith\("en-US"\)/.test(range))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
