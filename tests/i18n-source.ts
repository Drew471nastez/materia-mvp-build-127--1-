/**
 * ===========================================================================
 *  A SOURCE FILE AS IT READ BEFORE ITS WORDS WENT INTO tt()
 * ===========================================================================
 * Many suites read a component's source and look for its wording:
 * /label: "Print label"/, />Plans and pricing<\/h2>/. Round 25 put every
 * sentence a creator reads into tt() (lib/i18n/text.ts), so the same file
 * now says label: tt("Print label") or get label() { return tt("Print label") }.
 *
 * untt() turns those back into the plain strings the suites were written
 * against, so each keeps checking what it checked: the words, where they
 * are, and the code around them. That the words are translated is
 * tests/i18n25.test.ts's to check.
 *
 *   {tt("Saved")}                       Saved            (a JSX child; ' as &apos;)
 *   label={tt("Saved")}                 label="Saved"    (an attribute)
 *   tt("Saved")                         "Saved"
 *   tt("Sent {when}", { when })         `Sent ${when}`   ({when} in JSX)
 *   get label() { return tt("Saved") }  label: "Saved"
 *   msg("Saved"), ttx("person", "Left") "Saved", "Left"
 *   tt(STEPS[0][0])                     STEPS[0][0]
 */
import { createRequire } from "node:module"
import { join } from "node:path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ts: any = createRequire(join(process.cwd(), "package.json"))("typescript")

type Edit = [start: number, end: number, text: string]

/** fileName decides how it is parsed: a .ts file is not JSX (<T>(x) is a generic there). */
export function untt(source: string, fileName = "file.tsx"): string {
  if (!/\b(tt|msg|ttx)\(/.test(source)) return source
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const edits: Edit[] = []

  /** The message and its values: tt("A {x}", { x: y.z }) → ["A {x}", { x: "y.z" }]. */
  const parts = (call: any): { text: string; vars: Record<string, string> } | null => {
    const name = call.expression?.getText(sf)
    const args = call.arguments
    const at = name === "ttx" ? 1 : 0
    const first = args[at]
    if (!first || !(ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) return null
    const vars: Record<string, string> = {}
    const obj = args[at + 1]
    if (obj && ts.isObjectLiteralExpression(obj)) {
      for (const p of obj.properties) {
        if (ts.isPropertyAssignment(p)) vars[p.name.getText(sf)] = p.initializer.getText(sf)
        else if (ts.isShorthandPropertyAssignment(p)) vars[p.name.text] = p.name.text
      }
    }
    return { text: first.text, vars }
  }
  const asString = (text: string) => JSON.stringify(text)
  const asTemplate = (text: string, vars: Record<string, string>) =>
    "`" + text.replace(/[`\\]/g, (c) => "\\" + c).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? "${" + vars[k] + "}" : m)) + "`"
  const asCode = (text: string, vars: Record<string, string>) => (Object.keys(vars).length && /\{\w+\}/.test(text) ? asTemplate(text, vars) : asString(text))
  /* JSX text in this codebase writes an apostrophe as &apos; (react/no-unescaped-entities). */
  const asJsx = (text: string, vars: Record<string, string>) => text.replace(/'/g, "&apos;").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? "{" + vars[k] + "}" : m))

  const isOurs = (n: any) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(tt|msg|ttx)$/.test(n.expression.text)

  const visit = (node: any): void => {
    /* get label() { return tt("Saved") } → label: "Saved" */
    if (ts.isGetAccessorDeclaration(node) && node.body && node.body.statements.length === 1) {
      const ret = node.body.statements[0]
      if (ts.isReturnStatement(ret) && ret.expression && isOurs(ret.expression)) {
        const p = parts(ret.expression)
        if (p) {
          edits.push([node.getStart(sf), node.getEnd(), `${node.name.getText(sf)}: ${asCode(p.text, p.vars)}`])
          return
        }
      }
    }
    /* tt(STEPS[0][0]), tt(label): a word kept elsewhere, drawn as it was. */
    if (isOurs(node) && node.arguments.length === 1 && !ts.isStringLiteral(node.arguments[0]) && !ts.isNoSubstitutionTemplateLiteral(node.arguments[0])) {
      edits.push([node.getStart(sf), node.getEnd(), node.arguments[0].getText(sf)])
      return
    }
    if (isOurs(node)) {
      const p = parts(node)
      if (p) {
        const parent = node.parent
        if (ts.isJsxExpression(parent) && parent.expression === node) {
          if (ts.isJsxAttribute(parent.parent)) {
            edits.push([parent.getStart(sf), parent.getEnd(), Object.keys(p.vars).length ? `{${asTemplate(p.text, p.vars)}}` : `"${p.text}"`])
          } else {
            edits.push([parent.getStart(sf), parent.getEnd(), asJsx(p.text, p.vars)])
          }
        } else {
          edits.push([node.getStart(sf), node.getEnd(), asCode(p.text, p.vars)])
        }
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  let out = source
  for (const [a, b, text] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + text + out.slice(b)
  return out
}
