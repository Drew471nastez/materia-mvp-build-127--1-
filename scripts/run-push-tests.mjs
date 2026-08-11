/**
 * Runs every suite under tests/.
 *
 * tsc into a scratch directory, then node. There is no test runner in this
 * project and this does not add one: a runner is a dependency, a config file
 * and a watch mode, for a suite that is two files. If this grows past a
 * handful this should become vitest — that is the point at which the
 * dependency pays for itself, and not before.
 *
 * Both suites are compiled TOGETHER and run in separate processes. Together,
 * because they share modules and one tsc invocation is faster than two;
 * separately, because each suite calls process.exit(1) on failure and a shared
 * process would let the first failure hide the second suite entirely.
 *
 * `server-only` resolves to an empty module outside a bundler, so the modules
 * under test import cleanly here.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename, dirname, relative } from "node:path"

const SUITES = [
  "tests/push-notifications.test.ts",
  "tests/activity-notifications.test.ts",
  "tests/auth-session.test.ts",
  "tests/auth-guards.test.ts",
  "tests/no-image-transforms.test.ts",
  "tests/image-pipeline.test.ts",
  "tests/thread-loading-shell.test.ts",
  "tests/image-fit.test.ts",
  "tests/letterbox.test.ts",
  "tests/reprocess.test.ts",
  "tests/messaging-integrity.test.ts",
  "tests/shipping-flow.test.ts",
  "tests/checkout-pricing.test.ts",
  "tests/sheet-motion.test.ts",
  "tests/drafts.test.ts",
  "tests/photo-reorder.test.ts",
  "tests/own-listing.test.ts",
  "tests/nav-chrome.test.ts",
  "tests/one-arrival.test.ts",
  "tests/messages-chrome.test.ts",
  "tests/desktop-home.test.ts",
  "tests/identity.test.ts",
  "tests/sql-aggregate.test.ts",
]

const out = mkdtempSync(join(tmpdir(), "storelib-push-"))
const tsconfigPath = "tsconfig.tests.generated.json"
let anyFailed = false
try {
  // A real tsconfig rather than a file list, because the modules under test
  // import each other through the `@/…` alias. Passing files on the command
  // line gives tsc no baseUrl and no paths, so the first cross-module alias
  // import fails to RESOLVE — TS2307, exit 2, before a single assertion runs.
  // Written into the PROJECT ROOT, not the temp dir. tsc resolves `node_modules`
  // and `typeRoots` relative to the config file, so a config living in /tmp
  // cannot see @types/node — "Cannot find type definition file for 'node'",
  // exit 2, before any assertion runs. Removed in the finally block below.
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: ".",
        target: "es2022",
        module: "esnext",
        moduleResolution: "bundler",
        skipLibCheck: true,
        strict: false,
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
      files: SUITES,
    }),
  )
  execFileSync("npx", ["tsc", "-p", tsconfigPath], { stdio: "inherit" })

  // Emitted ESM needs real extensions, and `server-only` is not resolvable
  // from a temp directory — it contributes nothing to these modules anyway.
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  for (const file of walk(out)) {
    if (!file.endsWith(".js")) continue
    let src = readFileSync(file, "utf8")
    // `@/lib/x` → a real relative path. tsc RESOLVES the alias for type
    // checking but emits the specifier verbatim, so Node then fails with
    // ERR_MODULE_NOT_FOUND on a package called "@/lib". rootDir is the repo
    // root, so the output mirrors the repo layout and the target is simply the
    // same path under `out`.
    src = src.replace(/from\s+["']@\/([^"']+)["']/g, (m, rest) => {
      let rel = relative(dirname(file), join(out, rest)).replace(/\\/g, "/")
      if (!rel.startsWith(".")) rel = `./${rel}`
      return m.replace(`@/${rest}`, rel.endsWith(".js") ? rel : `${rel}.js`)
    })
    src = src.replace(/from\s+["'](\.[^"']*?)["']/g, (m, spec) =>
      spec.endsWith(".js") ? m : m.replace(spec, `${spec}.js`))
    src = src.replace(/^\s*import\s+["']server-only["'];?\s*$/gm, "")
    writeFileSync(file, src)
  }
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')

  // Real packages, for suites that use one.
  //
  // The `@/…` rewrite above only handles this project's own modules. A BARE
  // specifier — `sharp` in tests/reprocess.test.ts — is resolved by Node
  // walking up from the importing file looking for node_modules, and the
  // importing file is in a temp directory that has none. So it fails with
  // ERR_MODULE_NOT_FOUND on a package that is plainly installed.
  //
  // A symlink rather than a copy: node_modules is hundreds of megabytes and
  // this runs on every push. Failing softly, because a symlink can be refused
  // (Windows without developer mode, an exotic filesystem) and every suite that
  // does not import a package still runs perfectly without it.
  try {
    symlinkSync(join(process.cwd(), "node_modules"), join(out, "node_modules"), "junction")
  } catch {
    /* suites importing real packages will say so themselves */
  }

  const compiled = walk(out)
  for (const suite of SUITES) {
    const wanted = basename(suite).replace(/\.ts$/, ".js")
    const entry = compiled.find((f) => f.endsWith(wanted))
    if (!entry) throw new Error(`compiled test not found for ${suite}`)
    console.log(`\n──────── ${suite} ────────`)
    try {
      execFileSync(process.execPath, [entry], { stdio: "inherit" })
    } catch {
      // The suite already printed which assertions failed. Recorded and
      // carried on, so a failure in the first suite does not hide the second.
      anyFailed = true
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true })
  if (existsSync(tsconfigPath)) unlinkSync(tsconfigPath)
}

if (anyFailed) {
  console.log("\nsome suites failed")
  process.exit(1)
}
console.log("\nall suites passed")
