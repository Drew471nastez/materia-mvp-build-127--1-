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
import { existsSync, readFileSync } from "node:fs"
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

/**
 * JSON, without the import attribute Node now insists on.
 *
 * lib/website-builder/section-schemas.ts imports forty-nine section schemas as
 * JSON — `import faq from "…/faq.json"` — which a bundler handles and Node 22
 * refuses without `with { type: "json" }`. Adding that attribute to the
 * production module to satisfy a test runner would be the tail wagging the
 * dog, and it is the kind of syntax that breaks a build for reasons nobody
 * remembers a year later.
 *
 * Handing the file back as a module with a default export is exactly what a
 * bundler does with it, so the code under test sees precisely what it sees in
 * production — and the workaround stays inside the harness, where it belongs.
 */
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const source = readFileSync(new URL(url), "utf8")
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${source};`,
    }
  }
  return nextLoad(url, context)
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: EMPTY_MODULE, shortCircuit: true }

  /**
   * A `?query` suffix is the standard way to ask Node for a FRESH instance of
   * a module — which a test needs when the module reads an environment
   * variable once, at construction. It has to come off before the path is
   * looked up on disk and go back on the resolved URL, or the second import
   * returns the cached first one and the test silently checks nothing.
   */
  const query = specifier.includes("?") ? specifier.slice(specifier.indexOf("?")) : ""
  const bare = query ? specifier.slice(0, specifier.indexOf("?")) : specifier

  // The project's own alias. tsc resolves `@/…` for type checking and then
  // emits it untouched, so Node would look for a package called "@/lib".
  if (bare.startsWith("@/") && OUT) {
    const found = existingFile(join(OUT, bare.slice(2)))
    if (found) return { url: pathToFileURL(found).href + query, shortCircuit: true }
  }

  // A relative .json import resolves straight to the file; `existingFile`
  // would find it too, but only because it exists — being explicit keeps a
  // future extension guess from turning `x.json` into `x.json.js`.
  if (bare.startsWith(".") && bare.endsWith(".json") && context.parentURL?.startsWith("file:")) {
    const candidate = new URL(bare, new URL(".", context.parentURL))
    if (existsSync(candidate.pathname)) return { url: candidate.href, shortCircuit: true }
  }

  // Extensionless relative imports, which is how tsc emits them.
  if (bare.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentDir = new URL(".", context.parentURL)
    const candidate = new URL(bare, parentDir)
    const found = existingFile(candidate.pathname)
    if (found) return { url: pathToFileURL(found).href + query, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
