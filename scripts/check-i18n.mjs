#!/usr/bin/env node
/**
 * ===========================================================================
 *  IS EVERY WORD OF THE DASHBOARD TRANSLATED?
 * ===========================================================================
 * node scripts/check-i18n.mjs            summary per language, exit 1 on a gap
 * node scripts/check-i18n.mjs --list     every gap, with its file and line
 * node scripts/check-i18n.mjs --json     the numbers, for tests/i18n25.test.ts
 * node scripts/check-i18n.mjs --root DIR measure another checkout (before/after)
 *
 * Four things keep the dashboard whole in every language:
 *
 *   untranslated   a sentence a creator reads that is not inside tt() (or a
 *                  t("dot.key")): scripts/i18n/scan.mjs decides what reads as
 *                  words. Mark a deliberate exception with // i18n-ignore.
 *   missing        a tt() sentence a language's catalog has no words for
 *                  (lib/i18n/catalog/<code>.ts). It shows in English there,
 *                  never as a key, but it is a gap.
 *   placeholders   a translation that drops or renames a {value}: the number
 *                  or the name would vanish from the sentence.
 *   at import      a tt() that runs when its module loads, before the
 *                  language's words have arrived, so it would stay English.
 *
 * Coverage per language is the share of the dashboard's distinct sentences
 * (in tt(), in t("dot.key"), and still bare) that read in that language.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { execSync } from "node:child_process"
import { join } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const here = fileURLToPath(new URL(".", import.meta.url))
const argv = process.argv.slice(2)
const rootArg = argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : null
const root = rootArg ?? join(here, "..")
const LIST = argv.includes("--list")
const JSON_OUT = argv.includes("--json")

/* The scanner of the checkout being measured, or this one's when it has none (a "before"). */
const scanPath = existsSync(join(root, "scripts/i18n/scan.mjs")) && !argv.includes("--own-scan") ? join(root, "scripts/i18n/scan.mjs") : join(here, "i18n/scan.mjs")
const { scanSource, inScope, LIB_SCOPE } = await import(scanPath)
const require = createRequire(import.meta.url)
const ts = require("typescript")

export const LANGUAGES = ["es", "fr", "de", "pt-BR", "it", "pl"]

const files = execSync("git ls-files", { cwd: root })
  .toString()
  .split("\n")
  .filter((f) => inScope(f) || (LIB_SCOPE ?? []).some((r) => r.test(f)))

/* ---- the catalogs ------------------------------------------------------ */
const { readCatalog } = await import(join(here, "i18n/catalog-file.mjs"))
const catalogs = {}
for (const lang of LANGUAGES) catalogs[lang] = readCatalog(join(root, "lib/i18n/catalog", `${lang}.ts`))

/* The dot-key dictionary (lib/i18n/translations.ts), read as data. */
function readDotKeys() {
  const p = join(root, "lib/i18n/translations.ts")
  if (!existsSync(p)) return {}
  const sf = ts.createSourceFile(p, readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true)
  const out = {}
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && n.name.getText() === "translations") {
      let init = n.initializer
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init))) init = init.expression
      if (init && ts.isObjectLiteralExpression(init)) {
        for (const lang of init.properties) {
          if (!ts.isPropertyAssignment(lang) || !ts.isObjectLiteralExpression(lang.initializer)) continue
          const code = lang.name.text ?? lang.name.getText().replace(/["']/g, "")
          out[code] = {}
          for (const p of lang.initializer.properties) {
            if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))) out[code][p.name.text] = p.initializer.text
          }
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}
const dot = readDotKeys()

/* ---- the code ---------------------------------------------------------- */
const untranslated = []
const atImport = []
const ttMessages = new Map() // source → first place
const dotKeys = new Map()

function isFunctionLike(n) {
  return ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n)
}
function atModuleLevel(node) {
  for (let p = node.parent; p; p = p.parent) if (isFunctionLike(p)) return false
  return true
}

for (const rel of files) {
  const p = join(root, rel)
  if (!existsSync(p)) continue
  const text = readFileSync(p, "utf8")
  const { findings } = scanSource(text, rel)
  const server = !/^\s*["']use client["']/.test(text)
  for (const f of findings) {
    if (f.ignored) continue
    if (f.kind === "tt") {
      if (!ttMessages.has(f.text)) ttMessages.set(f.text, `${rel}:${f.line}`)
      if (f.call !== "msg" && atModuleLevel(f.node) && !(server && /\/(page|layout)\.tsx$/.test(rel))) atImport.push(`${rel}:${f.line}\t${f.text}`)
      continue
    }
    if (f.kind === "key") {
      if (!dotKeys.has(f.text)) dotKeys.set(f.text, `${rel}:${f.line}`)
      continue
    }
    /* A server page's thrown error goes to the log and to app/(storelib)/app/error.tsx, which says its own words. */
    if (f.kind === "error" && server && /^app\/.*\/(page|layout)\.tsx$/.test(rel)) continue
    if (!f.translated) untranslated.push({ where: `${rel}:${f.line}`, kind: f.kind, text: f.text })
  }
}

/* ---- the numbers ------------------------------------------------------- */
/* A word inside a plural branch ("one {rate}") is wording, not a value: skip it. */
const placeholderNames = (s) => [...s.matchAll(/(?<![,}]\s*(?:zero|one|two|few|many|other|=\d+)\s*)\{\s*([A-Za-z_]\w*)\s*(?:[,}])/g)].map((m) => m[1]).sort().filter((v, i, a) => a.indexOf(v) === i)

const bare = new Set(untranslated.map((u) => u.text))
const dotUsed = [...dotKeys.keys()].filter((k) => dot.en && k in dot.en)
const total = ttMessages.size + dotUsed.length + [...bare].filter((t) => !ttMessages.has(t)).length

const perLanguage = {}
const missing = {}
const badPlaceholders = []
for (const lang of LANGUAGES) {
  let ok = 0
  missing[lang] = []
  for (const [src, where] of ttMessages) {
    const tr = catalogs[lang][src]
    if (typeof tr === "string" && tr.trim()) {
      ok++
      const a = placeholderNames(src).join(",")
      const b = placeholderNames(tr).join(",")
      if (a !== b) badPlaceholders.push(`${lang}\t${where}\t${src}\t→ ${tr}`)
    } else missing[lang].push(`${where}\t${src}`)
  }
  for (const k of dotUsed) if (dot[lang]?.[k]) ok++
  else missing[lang].push(`dot-key\t${k}`)
  perLanguage[lang] = { translated: ok, total, coverage: total ? ok / total : 1 }
}

const stale = {}
for (const lang of LANGUAGES) stale[lang] = Object.keys(catalogs[lang]).filter((k) => !ttMessages.has(k)).length

const result = {
  files: files.length,
  messages: ttMessages.size,
  dotKeys: dotUsed.length,
  untranslated: untranslated.length,
  untranslatedUnique: bare.size,
  atImport: atImport.length,
  badPlaceholders: badPlaceholders.length,
  total,
  perLanguage,
  stale,
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ...result, untranslatedList: untranslated.slice(0, 2000), atImportList: atImport, badPlaceholderList: badPlaceholders, missing }, null, 1))
} else {
  console.log(`Dashboard sentences: ${total} (${ttMessages.size} in tt(), ${dotUsed.length} dot keys, ${bare.size} still bare) across ${files.length} files`)
  console.log("")
  console.log("language   translated   coverage")
  console.log(`en         ${String(total).padStart(10)}   100.0%`)
  for (const lang of LANGUAGES) {
    const r = perLanguage[lang]
    console.log(`${lang.padEnd(10)} ${String(r.translated).padStart(10)}   ${(r.coverage * 100).toFixed(1).padStart(5)}%`)
  }
  console.log("")
  console.log(`untranslated (not in tt): ${untranslated.length}   at import: ${atImport.length}   placeholder mismatches: ${badPlaceholders.length}`)
  if (LIST) {
    if (untranslated.length) console.log("\nUNTRANSLATED\n" + untranslated.map((u) => `${u.where}\t${u.kind}\t${JSON.stringify(u.text)}`).join("\n"))
    if (atImport.length) console.log("\nAT IMPORT\n" + atImport.join("\n"))
    if (badPlaceholders.length) console.log("\nPLACEHOLDERS\n" + badPlaceholders.join("\n"))
    for (const lang of LANGUAGES) if (missing[lang].length) console.log(`\nMISSING ${lang} (${missing[lang].length})\n` + missing[lang].slice(0, 300).join("\n"))
  }
  const gaps = untranslated.length + atImport.length + badPlaceholders.length + LANGUAGES.reduce((n, l) => n + missing[l].length, 0)
  process.exitCode = gaps ? 1 : 0
}
