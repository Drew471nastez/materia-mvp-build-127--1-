/**
 * Runs scripts/ai-builder/eval.ts the way the push suites run (compiled by the
 * project's tsc into a temporary folder, then node with
 * scripts/push-test-register.mjs), passing its arguments through:
 *
 *   node scripts/ai-builder/eval.mjs [--out DIR] [--scenarios fitness,clothing] [--engines agent,native]
 *   STORELIB_LIVE_AI_EVAL=1 ANTHROPIC_API_KEY=... node scripts/ai-builder/eval.mjs --live --out DIR
 *
 * See eval.ts for what it does, the live gate and the spend caps.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, existsSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const out = mkdtempSync(join(tmpdir(), "storelib-eval-"))
const tsconfigPath = "tsconfig.eval.generated.json"
let code = 0
try {
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: ".", target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", skipLibCheck: true, strict: true, baseUrl: ".", paths: { "@/*": ["./*"] } },
      files: ["scripts/ai-builder/eval.ts"],
    }),
  )
  execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')
  try {
    symlinkSync(join(process.cwd(), "node_modules"), join(out, "node_modules"), "junction")
  } catch {
    /* the run will say what it cannot import */
  }
  execFileSync(process.execPath, ["--import", join(process.cwd(), "scripts/push-test-register.mjs"), join(out, "scripts/ai-builder/eval.js"), ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, PUSH_TEST_OUT: out } })
} catch (e) {
  code = typeof e?.status === "number" ? e.status : 1
} finally {
  rmSync(out, { recursive: true, force: true })
  if (existsSync(tsconfigPath)) unlinkSync(tsconfigPath)
}
process.exit(code)
