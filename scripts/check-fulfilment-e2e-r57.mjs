/**
 * ===========================================================================
 *  ROUND 57 (E2), MEASURED: EVERYTHING AFTER AN ORDER IS PAID
 * ===========================================================================
 * Compiles tests/fulfilment-e2e-r57.test.ts (strict, as scripts/run-push-tests.mjs
 * does) and runs it: the real route handlers and server functions over the
 * journey harness, Supabase in memory, Stripe's webhooks signed, Printful,
 * Supabase Storage's signer and a 3PL's https endpoint stubbed at the network.
 * Prints each check by section, then the counts, and exits 1 when any failed.
 *
 *   node scripts/check-fulfilment-e2e-r57.mjs [--verbose]
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { tmpdir } from "node:os"

const SUITE = "tests/fulfilment-e2e-r57.test.ts"
const verbose = process.argv.includes("--verbose")
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "fulfilment-e2e-r57-"))
const cfg = "tsconfig.fulfilment-e2e-r57.json"
let code = 1
try {
  writeFileSync(cfg, JSON.stringify({ compilerOptions: { outDir: out, rootDir: ".", target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", skipLibCheck: true, strict: true, baseUrl: ".", paths: { "@/*": ["./*"] } }, files: [SUITE] }))
  execFileSync("pnpm", ["exec", "tsc", "-p", cfg], { stdio: "inherit" })
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')
  symlinkSync(join(root, "node_modules"), join(out, "node_modules"), "junction")
  const walk = (d) => readdirSync(d).flatMap((f) => (f === "node_modules" ? [] : statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
  const entry = walk(out).find((f) => basename(f) === basename(SUITE).replace(/\.ts$/, ".js"))
  const run = spawnSync(process.execPath, ["--import", join(root, "scripts/push-test-register.mjs"), entry], { env: { ...process.env, PUSH_TEST_OUT: out }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  const text = `${run.stdout ?? ""}${run.stderr ?? ""}`
  if (verbose) process.stdout.write(text)
  /* Only the journey's own lines: its sections, its checks and their details. */
  for (const line of text.split("\n")) if (/^\d+\. |^ {2}(ok|FAIL) |^ {8}\S|^\d+ passed, \d+ failed$/.test(line)) console.log(line)
  code = run.status ?? 1
} finally {
  rmSync(out, { recursive: true, force: true })
  if (existsSync(cfg)) unlinkSync(cfg)
}
process.exit(code)
