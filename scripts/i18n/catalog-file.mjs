/**
 * The catalogs are TypeScript modules (lib/i18n/catalog/<code>.ts) so each
 * language is its own chunk, fetched only by the dashboard that speaks it,
 * and nothing needs resolveJsonModule. Their body is plain JSON, one
 * sentence per line, which is what these two read and write.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const HEAD = (code) => `/**
 * The dashboard's words in ${code}: each English sentence, as tt() is given it
 * in the code, and the words for it. Generated and checked by
 * scripts/check-i18n.mjs; edit freely, but keep the body valid JSON (quoted
 * keys, no trailing comma). A sentence missing here shows in English.
 */
const words: Record<string, string> = `

export function readCatalog(path) {
  if (!existsSync(path)) return {}
  const text = readFileSync(path, "utf8")
  const start = text.indexOf("= {")
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) return {}
  return JSON.parse(text.slice(start + 2, end + 1))
}

export function writeCatalog(path, code, words) {
  const sorted = Object.fromEntries(Object.keys(words).sort().map((k) => [k, words[k]]))
  writeFileSync(path, HEAD(code) + JSON.stringify(sorted, null, 1) + "\n\nexport default words\n")
}
