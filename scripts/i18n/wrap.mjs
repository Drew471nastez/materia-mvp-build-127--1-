#!/usr/bin/env node
/**
 * ===========================================================================
 *  PUT THE DASHBOARD'S WORDS INSIDE tt()
 * ===========================================================================
 * node scripts/i18n/wrap.mjs [file ...]
 *
 * Rewrites each user-facing string scripts/i18n/scan.mjs finds into a tt()
 * call, and imports tt where it is new. Idempotent: a string already in tt()
 * is left alone, so it can run again after a merge brings in new words.
 *
 *   <p>No orders yet</p>          <p>{tt("No orders yet")}</p>
 *   placeholder="Search"          placeholder={tt("Search")}
 *   `Sent ${when}`                tt("Sent {when}", { when })
 *   You have {count} drafts       {tt("You have {count} drafts", { count })}
 *
 * A label in a list kept at the top of a module becomes a getter, so it is
 * read when it is drawn (after the language's words have arrived) rather
 * than when the module loads: label: "Profile" → get label() { return tt("Profile") }.
 *
 * What it cannot do safely it lists instead of changing: a server
 * component (no "use client"; its words come from lib/i18n/server), a
 * string held in a plain constant at module level, a file that already has
 * a tt of its own.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { createRequire } from "node:module"
import { scanSource, inScope, inLibScope, comparedStrings, bindsTt } from "./scan.mjs"
const require = createRequire(import.meta.url)
const ts = require("typescript")

const root = process.cwd()
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const dry = process.argv.includes("--dry")
const files = args.length ? args : execSync("git ls-files", { cwd: root }).toString().split("\n").filter((f) => inScope(f) || inLibScope(f))

const manual = []
let changedFiles = 0
let wrapped = 0

function isFunctionLike(n) {
  return ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isClassStaticBlockDeclaration?.(n)
}
function atModuleLevel(node) {
  let p = node.parent
  while (p) {
    if (isFunctionLike(p)) return false
    p = p.parent
  }
  return true
}
/** The nearest property assignment whose object sits at module level. */
function moduleProperty(node) {
  let p = node.parent
  let child = node
  while (p) {
    if (ts.isPropertyAssignment(p) && p.initializer === child) return p
    if (isFunctionLike(p)) return null
    child = p
    p = p.parent
  }
  return null
}

function isServerFile(rel, text) {
  if (/^\s*["']use client["']/.test(text)) return false
  if (/^app\//.test(rel) && /\/(page|layout|loading|not-found|template|default|route)\.tsx?$/.test(rel)) return true
  if (/_server\.ts$|\.server\.ts$|\/actions\.ts$/.test(rel)) return true
  if (/^\s*["']use server["']/.test(text)) return true
  if (/import\s+["']server-only["']/.test(text)) return true
  return false
}

const q = (s) => JSON.stringify(s)

function varsText(values, sourceText, sf) {
  if (!values?.length) return ""
  const parts = values.map(([name, expr]) => {
    const code = sourceText.slice(expr.getStart(sf), expr.getEnd())
    return code === name ? name : `${name}: ${code}`
  })
  return `, { ${parts.join(", ")} }`
}

for (const rel of files) {
  const path = `${root}/${rel}`
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch {
    continue
  }
  const { sf, findings } = scanSource(text, rel)
  let todo = findings.filter((f) => !f.translated && !f.ignored)
  if (!todo.length) continue
  if (isServerFile(rel, text)) {
    for (const f of todo) manual.push(`${rel}:${f.line}\tserver\t${f.text}`)
    continue
  }
  /* A local tt that is not ours. */
  if (bindsTt(sf)) {
    for (const f of todo) manual.push(`${rel}:${f.line}\tlocal-tt\t${f.text}`)
    continue
  }
  const compared = comparedStrings(sf)
  todo = todo.filter((f) => {
    if (f.kind !== "text" && !f.template && compared.has(f.node.text)) {
      manual.push(`${rel}:${f.line}\tcompared\t${f.text}`)
      return false
    }
    return true
  })
  /* Outermost first: a finding inside another's range is carried by it. */
  todo.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept = []
  for (const f of todo) {
    if (kept.length && f.start < kept[kept.length - 1].end) continue
    kept.push(f)
  }
  const edits = [] // { start, end, text }
  const getters = new Map() // property node → list of inner edits
  for (const f of kept) {
    let replacement
    if (f.kind === "text") {
      const first = f.nodes[0]
      const last = f.nodes[f.nodes.length - 1]
      let start = first.getStart(sf)
      let end = last.getEnd()
      if (ts.isJsxText(first)) start = first.getStart(sf) + (first.text.length - first.text.replace(/^\s+/, "").length)
      if (ts.isJsxText(last)) end = last.getEnd() - (last.text.length - last.text.replace(/\s+$/, "").length)
      replacement = `{tt(${q(f.text)}${varsText(f.values, text, sf)})}`
      edits.push({ start, end, text: replacement })
      wrapped++
      continue
    }
    const node = f.node
    const call = f.template ? `tt(${q(f.text)}${varsText(f.values, text, sf)})` : `tt(${q(node.text)})`
    const inAttr = node.parent && ts.isJsxAttribute(node.parent)
    replacement = inAttr ? `{${call}}` : call
    if (atModuleLevel(node)) {
      const prop = moduleProperty(node)
      if (!prop || !ts.isObjectLiteralExpression(prop.parent) || ts.isComputedPropertyName(prop.name)) {
        manual.push(`${rel}:${f.line}\tmodule-level\t${f.text}`)
        continue
      }
      if (!getters.has(prop)) getters.set(prop, [])
      getters.get(prop).push({ start: f.start, end: f.end, text: replacement })
      wrapped++
      continue
    }
    edits.push({ start: f.start, end: f.end, text: replacement })
    wrapped++
  }
  for (const [prop, inner] of getters) {
    const init = prop.initializer
    let initText = text.slice(init.getStart(sf), init.getEnd())
    const base = init.getStart(sf)
    for (const e of [...inner].sort((a, b) => b.start - a.start)) {
      initText = initText.slice(0, e.start - base) + e.text + initText.slice(e.end - base)
    }
    const name = prop.name.getText(sf)
    edits.push({ start: prop.getStart(sf), end: prop.getEnd(), text: `get ${name}() { return ${initText} }` })
  }
  if (!edits.length) continue
  edits.sort((a, b) => b.start - a.start)
  let out = text
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  if (!/from\s*["']@\/lib\/i18n\/text["']/.test(out)) {
    /* After the last import, or after the directive. */
    const sf2 = ts.createSourceFile(rel, out, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const imports = sf2.statements.filter((s) => ts.isImportDeclaration(s))
    const line = `import { tt } from "@/lib/i18n/text"\n`
    if (imports.length) {
      const at = imports[imports.length - 1].getEnd()
      out = out.slice(0, at) + "\n" + line.trimEnd() + out.slice(at)
    } else {
      const directive = sf2.statements.find((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && /^use (client|server)$/.test(s.expression.text))
      if (directive) out = out.slice(0, directive.getEnd()) + "\n\n" + line.trimEnd() + out.slice(directive.getEnd())
      else out = line + out
    }
  } else if (!/import\s*\{[^}]*\btt\b[^}]*\}\s*from\s*["']@\/lib\/i18n\/text["']/.test(out)) {
    out = out.replace(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/i18n\/text["']/, (m, names) => `import { tt, ${names.trim()} } from "@/lib/i18n/text"`)
  }
  if (!dry) writeFileSync(path, out)
  changedFiles++
}

console.log(`wrapped ${wrapped} strings in ${changedFiles} files; ${manual.length} left for a person`)
if (manual.length) {
  const out = process.env.I18N_MANUAL_OUT
  if (out) writeFileSync(out, manual.join("\n") + "\n")
  else console.log(manual.slice(0, 400).join("\n"))
}
