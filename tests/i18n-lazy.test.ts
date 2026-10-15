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
  check("every other locale is the same object in both", (["en", "ro", "pt-BR", "it", "nl", "pl"] as const).every((c) => full.dictionaries[c] === core.coreDictionaries[c]))
  const provider = readFileSync(join(process.cwd(), "components/locale-provider.tsx"), "utf8")
  check("the client provider imports the core only", /from "@\/lib\/i18n\/dictionaries-core"/.test(provider) && !/from "@\/lib\/i18n\/dictionaries"/.test(provider))
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
