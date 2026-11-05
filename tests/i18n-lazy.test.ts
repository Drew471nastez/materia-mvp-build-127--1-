/**
 * ROUND 27: SPANISH, FRENCH AND GERMAN LOAD WHEN CHOSEN.
 * The language picker counts their keys without loading them
 * (lib/i18n/dictionaries-core.ts LAZY_LOCALE_SIZES); these must match the files,
 * and the client provider must never import the full map.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}

async function main() {
  const core = await import("../lib/i18n/dictionaries-core")
  const full = await import("../lib/i18n/dictionaries")
  for (const code of core.LAZY_LOCALES) {
    const size = Object.keys(full.dictionaries[code]).length
    check(`${code}: the picker's count is the file's (${size})`, core.LAZY_LOCALE_SIZES[code] === size, { said: core.LAZY_LOCALE_SIZES[code], size })
    const lazy = await core.loadLazyDictionary(code)
    check(`${code}: loading it gives the same dictionary the server reads`, lazy === full.dictionaries[code])
    check(`${code}: not in the part every page carries`, !(code in core.coreDictionaries))
  }
  /* Changed on purpose (round 12, PLATPERF): Romanian is lazy too, so it is no longer in the core. */
  check("every other locale is the same object in both", (["en", "pt-BR", "it", "nl", "pl"] as const).every((c) => full.dictionaries[c] === core.coreDictionaries[c]))
  const sizes = await import("../lib/i18n/locale-sizes")
  check("the picker's counts are the files', every locale", (Object.keys(full.dictionaries) as (keyof typeof sizes.LOCALE_SIZES)[]).every((c) => sizes.LOCALE_SIZES[c] === Object.keys(full.dictionaries[c]).length), sizes.LOCALE_SIZES)
  const provider = readFileSync(join(process.cwd(), "components/locale-provider.tsx"), "utf8")
  const words = readFileSync(join(process.cwd(), "lib/i18n/locale-words.ts"), "utf8")
  /* Changed on purpose (round 12, PLATPERF): the provider is in the root layout, on every page (published websites and the dashboard too), so it imports no dictionary at all; the words module does, imported by what calls t(). */
  check("the client provider imports no dictionary, only types and sizes", !/from "@\/lib\/i18n\/dictionaries(-core)?"/.test(provider.replace(/import type [^\n]*\n/g, "")) && /from "@\/lib\/i18n\/words-registry"/.test(provider))
  check("  the words module imports the core only", /from "\.\/dictionaries-core"/.test(words) && !/from "\.\/dictionaries"/.test(words))
  const users = ["app/(storelib)/(auth)/signup/page.tsx", "components/platform/language-currency-modal.tsx", "components/platform/language-modal.tsx"]
  check("  and every component that translates with t() imports the words", users.every((f) => /import "@\/lib\/i18n\/locale-words"/.test(readFileSync(join(process.cwd(), f), "utf8"))))
  /* Changed on purpose (round 46): the platform header says only base words, so it imports those (lib/i18n/locale-words-shell.ts), and a word it lacks fetches the rest (tests/shell-weight-r46.test.ts). */
  check("  the platform header imports the base words", /import "@\/lib\/i18n\/locale-words-shell"/.test(readFileSync(join(process.cwd(), "components/platform/platform-header-client.tsx"), "utf8")))
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
