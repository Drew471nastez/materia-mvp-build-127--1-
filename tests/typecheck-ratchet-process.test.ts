import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const scratch = mkdtempSync(join(tmpdir(), "storelib-typecheck-process-"))
try {
  const run = (body: string) => {
    writeFileSync(join(scratch, "pnpm"), `#!/bin/sh\n${body}\n`, { mode: 0o700 })
    return spawnSync(process.execPath, ["scripts/ci/typecheck-ratchet.mjs"], { encoding: "utf8", env: { ...process.env, PATH: scratch } })
  }
  assert.equal(run("exit 0").status, 0, "completed compiler with no errors passes")
  const failed = run("echo 'compiler process failed' >&2\nexit 1")
  assert.equal(failed.status, 1, "failed process cannot be treated as zero type errors")
  assert.match(failed.stderr, /TypeScript did not complete/)
  assert.equal(run("echo 'new-file.ts(1,1): error TS2322: wrong type'\nexit 2").status, 1, "new diagnostics still fail the ratchet")
  assert.equal(run("echo 'error TS6053: File missing.ts not found'\nexit 2").status, 1, "missing inputs cannot pass the per-file baseline")
  assert.equal(run("echo 'error TS5023: Unknown compiler option'\nexit 1").status, 1, "invalid compiler options fail closed too")
  assert.equal(run("kill -TERM $$").status, 1, "terminated compiler fails closed")
  console.log("Typecheck process checks: clean exit, failed process, new errors, missing inputs, invalid options, and termination passed")
} finally { rmSync(scratch, { recursive: true, force: true }) }
