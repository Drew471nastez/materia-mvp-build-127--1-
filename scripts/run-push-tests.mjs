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
import { join, basename } from "node:path"

const SUITES = [
  "tests/auth-session.test.ts",
  "tests/no-image-transforms.test.ts",
  "tests/page-performance.test.ts",
  "tests/sql-aggregate.test.ts",
  "tests/spam-defence.test.ts",
  "tests/digital-platform.test.ts",
  "tests/sites.test.ts",
  "tests/agent-loop.test.ts",
  "tests/openai-provider.test.ts",
  "tests/theme-agent.test.ts",
  "tests/storelib-ai.test.ts",
  "tests/client-errors.test.ts",
  "tests/react-binding.test.ts",
  "tests/oauth-errors.test.ts",
  "tests/session-durability.test.ts",
  "tests/creator-page.test.ts",
  "tests/contact-gate.test.ts",
  "tests/hook-order.test.ts",
  "tests/link-navigation.test.ts",
  "tests/rsc-boundary.test.ts",
  "tests/editor-resync.test.ts",
  "tests/bar-colors.test.ts",
  "tests/cover-focal.test.ts",
  "tests/theme-presets.test.ts",
  "tests/sheet-reserve.test.ts",
  "tests/featured-order.test.ts",
  "tests/product-bars.test.ts",
  "tests/policy-pages.test.ts",
  "tests/section-responsive.test.ts",
  "tests/anthropic-provider.test.ts",
  "tests/theme-code-editor.test.ts",
  "tests/section-settings.test.ts",
  "tests/section-render.test.ts",
  "tests/theme-settings.test.ts",
  "tests/app-sidebar.test.ts",
  "tests/analytics-chart.test.ts",
  "tests/website-builder.test.ts",
  "tests/storelib-theme.test.ts",
  "tests/storelib-package.test.ts",
  "tests/storelib-hardening.test.ts",
  "tests/agent-own-sections.test.ts",
  "tests/theme-file-drafts.test.ts",
  "tests/storelib-blocks.test.ts",
  "tests/storelib-parity.test.ts",
  "tests/preview-link.test.ts",
  "tests/published-site.test.ts",
  "tests/shop-products.test.ts",
  "tests/canvas-scroll.test.ts",
  "tests/editor-fixes.test.ts",
  "tests/builder-round-3.test.ts",
  "tests/contrast.test.ts",
  "tests/responsive-settings.test.ts",
  "tests/storelib-security.test.ts",
  "tests/storelib-performance.test.ts",
  "tests/design-tokens.test.ts",
  "tests/manual.test.ts",
  "tests/sanitize.test.ts",
  "tests/site-pages.test.ts",
  "tests/admin-auth.test.ts",
  "tests/stuck-layer.test.ts",
  "tests/site-cache-and-buttons.test.ts",
  "tests/keyboard-watch.test.ts",
  "tests/agent-attachments.test.ts",
  "tests/work-panel.test.ts",
  "tests/native-feel.test.ts",
  "tests/theme-media.test.ts",
  "tests/settings-flow.test.ts",
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
        /**
         * The section renderers are TSX, and tests/section-render.test.ts
         * imports them to render each section for real. `react-jsx` is what
         * Next.js compiles them with; without it tsc refuses the JSX and the
         * suite cannot see a section at all.
         */
        jsx: "react-jsx",
        skipLibCheck: true,
        strict: false,
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
      files: SUITES,
    }),
  )
  /**
   * `pnpm exec`, not `npx`. This project is pnpm — one lockfile, a
   * `packageManager` field, a pnpm-shaped node_modules — and npx is the one
   * command in it that was not. That is not only tidiness: npx will FETCH a
   * package from the registry when it cannot find the binary locally, so a
   * broken install turns into a silent download of some other tsc and a suite
   * that passes against the wrong compiler. `pnpm exec` fails instead.
   */
  execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })

  /**
   * NOTHING IS REWRITTEN. Resolution is a loader hook — see
   * scripts/push-test-loader.mjs.
   *
   * It used to be three regexes over the emitted text, which could not tell
   * code from data: one of them rewrote `import App from "./App"` INSIDE a
   * template literal in tests/sites.test.ts's project fixture, and the suite
   * then failed against code that was correct.
   */
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })

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
      execFileSync(
        process.execPath,
        ["--import", join(process.cwd(), "scripts/push-test-register.mjs"), entry],
        { stdio: "inherit", env: { ...process.env, PUSH_TEST_OUT: out } },
      )
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
