/**
 * Module resolution for the compiled push-test suites.
 *
 * ===========================================================================
 *  WHY THIS EXISTS INSTEAD OF A FEW REGEXES
 * ===========================================================================
 *
 * The runner used to fix up the emitted JS by rewriting its text: `@/lib/x` to
 * a relative path, and `from "./x"` to `from "./x.js"`, because tsc emits the
 * specifier verbatim and Node needs a real extension.
 *
 * That rewrite could not tell code from data. tests/sites.test.ts imports the
 * Sites STARTER PROJECT, whose files are template literals containing lines
 * like `import App from "./App"` — and the regex rewrote the fixture, so the
 * suite was handed a project whose entry imported "./App.js", a file that does
 * not exist. Two assertions failed against code that was correct, and the
 * bundler was verified in a real browser before the harness was believed.
 *
 * A regex over source text will always be able to do that. A resolver hook
 * cannot: it only ever sees specifiers Node is actually resolving, so a string
 * inside a template literal is never a candidate.
 *
 * Registered by scripts/run-push-tests.mjs, which passes the compile output
 * directory in PUSH_TEST_OUT.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const OUT = process.env.PUSH_TEST_OUT

/** `server-only` is a bundler marker; outside one it is nothing. */
const EMPTY_MODULE = "data:text/javascript,export{}"

const EXTENSIONS = [".js", ".mjs", ".cjs"]

/** The first of `p`, `p.js`, `p/index.js` that is on disk. */
function existingFile(path) {
  if (existsSync(path) && !path.endsWith("/")) return path
  for (const ext of EXTENSIONS) if (existsSync(path + ext)) return path + ext
  for (const ext of EXTENSIONS) if (existsSync(join(path, `index${ext}`))) return join(path, `index${ext}`)
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: EMPTY_MODULE, shortCircuit: true }

  // The project's own alias. tsc resolves `@/…` for type checking and then
  // emits it untouched, so Node would look for a package called "@/lib".
  if (specifier.startsWith("@/") && OUT) {
    const found = existingFile(join(OUT, specifier.slice(2)))
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true }
  }

  // Extensionless relative imports, which is how tsc emits them.
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentDir = new URL(".", context.parentURL)
    const candidate = new URL(specifier, parentDir)
    const found = existingFile(candidate.pathname)
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
