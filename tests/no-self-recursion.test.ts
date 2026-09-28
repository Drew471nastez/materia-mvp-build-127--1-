/**
 * ===========================================================================
 *  NO FUNCTION CALLS ITSELF WITH NOWHERE TO STOP
 * ===========================================================================
 * A find and replace once turned the product page's buy bar price into
 *
 *     function barPriceText(product) { return product.price_cents ? perInterval(barPriceText(product), ...) : ... }
 *
 * so every priced product page threw "Maximum call stack size exceeded" the
 * moment the bar drew, and every buyer saw "Something went wrong on this
 * page" instead of the product. It was one line, it type checked, and no test
 * caught it, because a test that reads one function only guards that
 * function. tests/buyer-qa.test.ts now pins that one; this pins the shape,
 * everywhere.
 *
 * WHAT IT LOOKS FOR: a named function whose body calls its own name with its
 * own parameters, and whose body has no branch, no loop, no second return and
 * no callback around that call. Real recursion always has a way out, and a
 * way out is one of those. That is the whole rule, so it is quiet on the
 * recursive helpers this codebase genuinely has (walking blocks, folders,
 * rich text nodes) and loud on the shape that shipped.
 *
 * Source only. Test files are left out: a test may recurse on purpose, and a
 * test that hangs fails on its own.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

let passed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail, null, 1)}`}`)
  }
}

/** Where a named function starts: its name, its parameters and the brace its body opens with. */
const FUNCTION_HEAD = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)[^{]*\{/g

/** The body that brace opens, matched brace by brace: a nested function's body ends where it ends, not at the next line that starts with }. */
function bodyFrom(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return ""
}

/**
 * A function that calls ITSELF with exactly its own parameters, unchanged.
 * That is the whole rule, and it is the whole bug: a call that hands on the
 * same inputs it was given can never reach a different answer, whatever
 * branch it sits in. Real recursion always passes something smaller (a
 * child, a parent, a rest), so it is not flagged and does not need to be
 * excused.
 */
export function selfCallingFunctions(files: readonly string[], read: (f: string) => string): string[] {
  const found: string[] = []
  for (const file of files) {
    let src = ""
    try {
      src = read(file)
    } catch {
      continue
    }
    for (const head of src.matchAll(FUNCTION_HEAD)) {
      const [, name, params] = head
      const args = params
        .split(",")
        .map((a) => a.split(":")[0].trim().replace(/[?=].*/, ""))
        .filter(Boolean)
      if (!args.length) continue
      const body = bodyFrom(src, head.index + head[0].length - 1)
      /* Its own name, not a method of that name on something else: queue.push(patch) is not push calling push. */
      const calls = [...body.matchAll(new RegExp(`(?<![.\\w$])${name}\\s*\\(([^)]*)\\)`, "g"))].map((c) => c[1].trim())
      if (calls.some((c) => c === args.join(", "))) found.push(`${file}: ${name}(${args.join(", ")})`)
    }
  }
  return found
}

const SOURCE = ["*.ts", "*.tsx"]

console.log("\nNo function calls itself with nowhere to stop")
{
  const files = execFileSync("git", ["ls-files", ...SOURCE], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.startsWith("tests/") && !f.startsWith("node_modules/"))
  check("there are source files to read", files.length > 100, files.length)
  const found = selfCallingFunctions(files, (f) => readFileSync(f, "utf8"))
  check("no function calls itself with its own arguments, unchanged", found.length === 0, found)
}

/* The rule itself, on the line that shipped and on the recursion around it. */
console.log("\nThe rule knows the difference")
{
  const shipped = `
function barPriceText(product: ProductData): string {
  return product.price_cents ? perInterval(barPriceText(product), intervalOf(product)) : formatPrice(0)
}
`
  const fixed = `
function barPriceText(product: ProductData): string {
  return product.price_cents ? perInterval(formatPrice(product.price_cents), intervalOf(product)) : formatPrice(0)
}
`
  const honest = `
function countBlocks(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + 1 + countBlocks(b.children ?? []), 0)
}
`
  const guarded = `
function depthOf(node: Node): number {
  if (!node.parent) return 0
  return 1 + depthOf(node.parent)
}
`
  const read = (name: string) => ({ shipped, fixed, honest, guarded })[name as "shipped"] ?? ""
  check("it catches the line that shipped", selfCallingFunctions(["shipped"], read).length === 1)
  check("and passes the fix", selfCallingFunctions(["fixed"], read).length === 0)
  check("a real walk over children is not flagged", selfCallingFunctions(["honest"], read).length === 0)
  check("nor one that stops at the top", selfCallingFunctions(["guarded"], read).length === 0)
  /* A nested function's body ends at its own brace: the sheet's onEnd is not its neighbour's arrow (components/ui/bottom-sheet). */
  const nested = `
function outer() {
  function onEnd(e: TouchEvent) {
    stop()
  }
  const onLift = (e: TouchEvent) => onEnd(e)
}
`
  const method = `
function push(patch: Patch) {
  queue.push(patch)
}
`
  check("a method of the same name on something else is not it either", selfCallingFunctions(["method"], (n) => (n === "method" ? method : "")).length === 0)
  check("a neighbour calling it is not it calling itself", selfCallingFunctions(["nested"], (n) => (n === "nested" ? nested : "")).length === 0)
}

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
