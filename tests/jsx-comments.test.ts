/**
 * ===========================================================================
 *  A /* COMMENT *_/ IN JSX CHILDREN IS NOT A COMMENT, IT IS THE PAGE
 * ===========================================================================
 * This shipped. A thirty-line note explaining a loading-skeleton fix was
 * written directly inside a JSX element's children:
 *
 *     <div className="relative w-full h-full flex-shrink-0">
 *       /*
 *         `=== true`, NOT `!== false`, AND THAT IS THE WHOLE OF THE FLASH
 *         ...
 *       *_/
 *       {mediaLoading[item.id] === true && ...}
 *
 * In children position that is TEXT. It is not stripped, it is rendered, and
 * it went out to every creator page on the site: a wall of internal
 * commentary about `mediaLoading` and `document.getAnimations()` printed
 * above the media on a stranger's public storefront, in the middle of their
 * About section. It was reported with a screenshot.
 *
 * Nothing catches this on the way. It is valid JSX, so the build is green;
 * TypeScript is happy; the linter is happy; and the rendered text only shows
 * up if somebody looks at that particular section of that particular page.
 * The failure is silent everywhere except in front of a customer.
 *
 * WHAT THIS LOOKS FOR, and why it is narrow. A line beginning `/*` whose
 * nearest preceding non-blank line closed an opening tag — either a bare `>`
 * on its own line, or attributes ending in `>`. That is children position.
 *
 * The first version asked only for a previous line ending in `>` and
 * returned thirteen hits, every one of them a TypeScript generic:
 * `Record<string, string>`, `Promise<void>`, `React.Ref<HTMLElement | null>`.
 * A check that cries wolf thirteen times is a check that gets deleted, so the
 * rule requires the tag to have actually closed. Against the whole codebase
 * it finds nothing; with the bug put back it finds exactly it.
 *
 * The fix is always the same: wrap it in braces. `{/* ... *_/}`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const root = process.cwd()

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === "out") return []
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) return tsxFiles(p)
    return p.endsWith(".tsx") ? [p] : []
  })
}

console.log("\nNo comment is rendered as page text\n")

const hits: string[] = []
for (const file of tsxFiles(root)) {
  const lines = readFileSync(file, "utf8").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith("/*")) continue
    let j = i - 1
    while (j >= 0 && lines[j].trim() === "") j--
    if (j < 0) continue
    const prev = lines[j].trim()
    /*
      A previous line ending in ">" is nearly always a TypeScript generic.
      The case that actually renders is narrower: the opening tag closed,
      either on a line of its own or after its attributes.
    */
    const closedTag = prev === ">" || (/>$/.test(prev) && /=[{"']/.test(prev) && !prev.endsWith("/>"))
    if (closedTag) {
      hits.push(`        ${file.replace(root + "/", "")}:${i + 1}  (after \`${prev.slice(-50)}\`)`)
    }
  }
}

check(
  "no /* */ comment sits in JSX children position",
  hits.length === 0,
  hits.join("\n") + "\n        Wrap each one in braces: {/* ... */}. In children position it renders.",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
