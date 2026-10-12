/**
 * ===========================================================================
 *  A TRANSLATED PAGE MUST NOT TAKE THE APP DOWN (lib/ui/dom-guard.ts)
 * ===========================================================================
 * "Failed to execute 'insertBefore' on 'Node'" on /app/products: a browser's
 * translator swapped a text node React held, and React's next insert beside
 * it threw. Driven here on stand-in nodes; the same was measured in Chromium
 * with a translator's replacement played over the Products list and over a
 * two-line component, which threw exactly the production message without
 * the guard and nothing with it.
 */
import { untt } from "./i18n-source"
import { installDomGuard } from "@/lib/ui/dom-guard"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

/* A parent that keeps its children in an array, with the browser's two refusals. */
type FakeNode = { name: string; parentNode: FakeNode | null; children: FakeNode[] }
const node = (name: string): FakeNode => ({ name, parentNode: null, children: [] })
function makeProto() {
  const calls: string[] = []
  const proto = {
    removeChild(this: FakeNode, child: FakeNode) {
      calls.push("remove")
      const i = this.children.indexOf(child)
      if (i < 0) throw new Error("NotFoundError: Failed to execute 'removeChild' on 'Node'")
      this.children.splice(i, 1)
      child.parentNode = null
      return child
    },
    insertBefore(this: FakeNode, n: FakeNode, ref: FakeNode | null) {
      calls.push("insert")
      if (n.parentNode) n.parentNode.children.splice(n.parentNode.children.indexOf(n), 1)
      const i = ref ? this.children.indexOf(ref) : this.children.length
      if (i < 0) throw new Error("NotFoundError: Failed to execute 'insertBefore' on 'Node'")
      this.children.splice(i, 0, n)
      n.parentNode = this
      return n
    },
  }
  return { proto, calls }
}
const append = (parent: FakeNode, child: FakeNode) => { parent.children.push(child); child.parentNode = parent }
/* What a translator does: the text node leaves, a <font> takes its place. */
function translate(text: FakeNode, wrap: boolean) {
  const parent = text.parentNode!
  const font = node("font")
  const i = parent.children.indexOf(text)
  parent.children[i] = font
  font.parentNode = parent
  if (wrap) append(font, text)
  else text.parentNode = null
  return font
}

console.log("\nWithout the guard, the production error")
{
  const { proto } = makeProto()
  const p = node("p"), text = node("#text")
  append(p, text)
  translate(text, false)
  let threw = ""
  try { proto.insertBefore.call(p, node("b"), text) } catch (e) { threw = (e as Error).message }
  check("inserting before a translated text node throws, as the browser does", /insertBefore/.test(threw), threw)
}

console.log("\nWith the guard")
{
  const { proto, calls } = makeProto()
  const warned: string[] = []
  check("it installs", installDomGuard(proto as never, (m) => warned.push(m)))
  check("and only once", !installDomGuard(proto as never, (m) => warned.push(m)))

  const p = node("p"), a = node("a"), b = node("b")
  append(p, a); append(p, b)
  const moved = node("i")
  proto.insertBefore.call(p, moved, b)
  check("an ordinary insert goes to the browser untouched", p.children.map((c) => c.name).join() === "a,i,b" && warned.length === 0, p.children.map((c) => c.name))
  proto.removeChild.call(p, moved)
  check("an ordinary removal too", p.children.map((c) => c.name).join() === "a,b" && warned.length === 0)

  const gone = node("#text")
  append(p, gone)
  translate(gone, false)
  const x = node("x")
  let threw = false
  try { proto.insertBefore.call(p, x, gone) } catch { threw = true }
  check("inserting before a text node the translator replaced does not throw", !threw)
  check("the new node is still drawn, at the end", p.children.at(-1) === x && x.parentNode === p, p.children.map((c) => c.name))

  const wrapped = node("#text")
  append(p, wrapped)
  const font = translate(wrapped, true)
  const y = node("y")
  proto.insertBefore.call(p, y, wrapped)
  check("before a text node the translator wrapped, it goes before the wrapper", p.children.indexOf(y) === p.children.indexOf(font) - 1, p.children.map((c) => c.name))

  threw = false
  let back: unknown
  try { back = proto.removeChild.call(p, gone) } catch { threw = true }
  check("removing a node that is already gone does not throw, and hands it back", !threw && back === gone)
  check("it says so once, in words that name the cause", warned.length === 1 && /translator or an extension/.test(warned[0]), warned)
  check("the browser's own methods ran for every call whose nodes were in place", calls.filter((c) => c === "insert").length >= 3, calls)
}

console.log("\nIt is in place before the app starts")
{
  const inst = untt(readFileSync(join(process.cwd(), "instrumentation-client.ts"), "utf8"), "instrumentation-client.ts")
  const at = inst.indexOf("guardDomAgainstTranslators()")
  check("instrumentation-client installs it first", at > 0 && at < inst.indexOf("watchRouterStarts()"))
  check("the app is not opted out of translation to get there", !/translate="no"|notranslate/.test(untt(readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8"), "app/layout.tsx")))
}

console.log("\nThe Products list keeps a changing word as the only child of its element")
{
  const list = untt(readFileSync(join(process.cwd(), "app/app/products/products-client.tsx"), "utf8"), "app/app/products/products-client.tsx")
  check("the view's name", /<span>\{viewLabel\}<\/span>/.test(list))
  check("the footer's count is one string", (/\{`\$\{from \+ 1\}\\u2013\$\{from \+ pageProducts\.length\} of /.test(list) || /\{from \+ 1\}–\{from \+ pageProducts\.length\} of \{/.test(list) /* one tt() message: still one string */) && !/&ndash;\{from/.test(list))
  check("the delete button's word, on both sides", /<span>\{deleteKind === "archive" \? "Archiving" : "Deleting"\}<\/span>/.test(list) && /<span>\{deleteQuestion\(productToDelete\.title, deleteKind\)\.confirm\}<\/span>/.test(list))
  check("a status word", /<span>\{label\}<\/span>/.test(list))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
