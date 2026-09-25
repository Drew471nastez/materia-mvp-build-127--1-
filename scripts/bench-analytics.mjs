/**
 * Runs scripts/analytics-speed.ts: how long the Analytics page's answer takes
 * on a synthetic busy store, before and after, and that the database counts
 * every figure as Node does. Compiled the way scripts/run-push-tests.mjs
 * compiles the suites.
 *
 *   node scripts/bench-analytics.mjs
 *   EVENTS=200000 ANALYTICS_BENCH_PG="-h /tmp/pg -p 5432 -U postgres" node scripts/bench-analytics.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, readdirSync, statSync, symlinkSync, existsSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const out = mkdtempSync(join(tmpdir(), "storelib-bench-"))
const config = "tsconfig.bench.generated.json"
try {
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: { outDir: out, rootDir: ".", target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", skipLibCheck: true, strict: false, baseUrl: ".", paths: { "@/*": ["./*"] } },
      files: ["scripts/analytics-speed.ts"],
    }),
  )
  execFileSync("pnpm", ["exec", "tsc", "-p", config], { stdio: "inherit" })
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')
  try {
    symlinkSync(join(process.cwd(), "node_modules"), join(out, "node_modules"), "junction")
  } catch {
    /* nothing here imports a package */
  }
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return f === "node_modules" ? [] : statSync(p).isDirectory() ? walk(p) : [p]
  })
  const entry = walk(out).find((f) => f.endsWith("analytics-speed.js"))
  execFileSync(process.execPath, ["--import", join(process.cwd(), "scripts/push-test-register.mjs"), entry], { stdio: "inherit", env: { ...process.env, PUSH_TEST_OUT: out } })
} finally {
  rmSync(out, { recursive: true, force: true })
  if (existsSync(config)) unlinkSync(config)
}
