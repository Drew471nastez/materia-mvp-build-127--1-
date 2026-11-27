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
const files = args.length ? args : execSync("git ls-files", { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().split("\n").filter((f) => inScope(f) || inLibScope(f))

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


for (const rel of files) {
  const path = `${root}/${rel}`
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch {
    continue
  }
  const { sf, findings } = scanSource(text, rel)
  /* An English plural (n === 1 ? "item" : "items") needs a person: the sentence around it becomes one plural message. */
  for (const f of findings) if (f.kind === "plural" && !f.translated && !f.ignored) manual.push(`${rel}:${f.line}\tplural\t${f.text}`)
  let todo = findings.filter((f) => !f.translated && !f.ignored && f.kind !== "plural")
  if (!todo.length) continue
  if (isServerFile(rel, text) && !process.argv.includes("--server")) {
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
  /*
   * Outermost first. A finding inside another's range is carried by it: the
   * outer one's values are written from the source with the inner ones
   * already in tt(), so "Order cancelled. ${error || "The refund did not go
   * through."}" translates both sentences.
   */
  todo.sort((a, b) => a.start - b.start || b.end - a.end)
  const within = (inner, outer) => inner !== outer && inner.start >= outer.start && inner.end <= outer.end
  const top = todo.filter((f) => !todo.some((o) => within(f, o)))
  const childrenIn = (lo, hi) => {
    const inside = todo.filter((f) => f.start >= lo && f.end <= hi)
    return inside.filter((f) => !inside.some((o) => within(f, o)))
  }
  const codeWith = (lo, hi) => {
    let code = text.slice(lo, hi)
    for (const c of childrenIn(lo, hi).sort((a, b) => b.start - a.start)) {
      code = code.slice(0, c.start - lo) + render(c, true) + code.slice(c.end - lo)
      wrapped++
    }
    return code
  }
  const vars = (values) => {
    if (!values?.length) return ""
    const parts = values.map(([name, expr]) => {
      const code = codeWith(expr.getStart(sf), expr.getEnd())
      return code === name ? name : `${name}: ${code}`
    })
    return `, { ${parts.join(", ")} }`
  }
  function render(f, nested = false) {
    if (f.kind === "text") return `{tt(${q(f.text)}${vars(f.values)})}`
    const call = f.template ? `tt(${q(f.text)}${vars(f.values)})` : `tt(${q(f.node.text)})`
    const inAttr = f.node.parent && ts.isJsxAttribute(f.node.parent)
    return inAttr && !nested ? `{${call}}` : call
  }
  const edits = [] // { start, end, text }
  const getters = new Map() // property node → list of inner edits
  for (const f of top) {
    if (f.kind === "text") {
      const first = f.nodes[0]
      const last = f.nodes[f.nodes.length - 1]
      let start = first.getStart(sf)
      let end = last.getEnd()
      if (ts.isJsxText(first)) {
        const raw = first.text
        let skip = raw.length - raw.replace(/^\s+/, "").length
        if (f.lead && raw.slice(skip).startsWith(f.lead)) skip += f.lead.length
        start = first.pos + skip
      }
      if (ts.isJsxText(last)) {
        const raw = last.text
        let skip = raw.length - raw.replace(/\s+$/, "").length
        if (f.trail && raw.slice(0, raw.length - skip).endsWith(f.trail)) skip += f.trail.length
        end = last.getEnd() - skip
      }
      edits.push({ start, end, text: render(f) })
      wrapped++
      continue
    }
    const replacement = render(f)
    if (atModuleLevel(f.node)) {
      const prop = moduleProperty(f.node)
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
  if (process.argv.includes("--server")) {
    /* A server component: tt comes from the request (lib/i18n/server), bound at the top of each async function that uses it. */
    const sf2 = ts.createSourceFile(rel, out, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const bodies = new Set()
    const find = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "tt") {
        let p = n.parent
        let top = null
        while (p) {
          if ((ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.body && ts.isBlock(p.body)) top = p
          p = p.parent
        }
        if (top) bodies.add(top)
        else manual.push(`${rel}\tserver-no-function`)
      }
      ts.forEachChild(n, find)
    }
    find(sf2)
    const inserts = []
    for (const fn of bodies) {
      if (/getServerTt\(/.test(fn.body.getText(sf2))) continue
      const isAsync = fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
      if (!isAsync) inserts.push({ at: fn.getStart(sf2), text: "async " , fix: fn.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword) ? "after-modifiers" : "" , fn })
      inserts.push({ at: fn.body.getStart(sf2) + 1, text: "\n  const { tt } = await getServerTt()" })
    }
    for (const ins of inserts.sort((a, b) => b.at - a.at)) {
      let at = ins.at
      if (ins.fix === "after-modifiers") {
        const mods = ins.fn.modifiers.filter((m) => m.kind !== ts.SyntaxKind.AsyncKeyword)
        at = mods[mods.length - 1].getEnd() + 1
      }
      out = out.slice(0, at) + ins.text + out.slice(at)
    }
    const sf3 = ts.createSourceFile(rel, out, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const last = sf3.statements.filter((x) => ts.isImportDeclaration(x)).pop()
    if (!/getServerTt/.test(text)) out = last ? out.slice(0, last.getEnd()) + `\nimport { getServerTt } from "@/lib/i18n/server"` + out.slice(last.getEnd()) : `import { getServerTt } from "@/lib/i18n/server"\n` + out
  } else if (!/from\s*["']@\/lib\/i18n\/text["']/.test(out)) {
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
