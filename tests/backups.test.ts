/**
 * ===========================================================================
 *  THE LAYERS THAT KEEP ANYTHING FROM BEING LOST
 * ===========================================================================
 * docs/operations/backups.md is the runbook. This keeps its pieces in place:
 * the deleted rows table (run-now part 66), the nightly off-site database
 * and file backups, the weekly restore drill, and the runbook itself. A
 * backup that quietly stopped running is found out on the day it is needed;
 * this suite finds it out on the day it is broken.
 */
import { readFileSync, existsSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

console.log("\nLayer 1: a deleted row can be put back")
{
  const sql = read("supabase/sql/run-now/66_deleted_rows_kept.sql")
  check("part 66 and its migration are the same text", sql === read("supabase/migrations/20261016_deleted_rows_kept.sql"))
  for (const t of ["products", "digital_assets", "orders", "entitlements", "payouts", "ledger_events", "creators", "profiles", "onepages", "store_theme_installs", "site_files", "subscribers", "email_flows"]) {
    check(`a deleted ${t} row is kept`, new RegExp(`ARRAY\\[[^\\]]*'${t}'`).test(sql))
  }
  check("kept AFTER the delete, whoever deleted it (security definer)", sql.includes("AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.storelib_keep_deleted_row()") && /storelib_keep_deleted_row\(\) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/.test(sql))
  check("a restore never overwrites a row that is back", sql.includes("ON CONFLICT DO NOTHING"))
  check("nobody but the server and the editor reads the copies", sql.includes("REVOKE ALL ON public.deleted_rows FROM anon, authenticated;"))
  check("copies are forgotten after 90 days, in batches", sql.includes("DEFAULT interval '90 days'") && sql.includes("LIMIT 50000"))
  check("the daily cleanup forgets them", /rpc\("storelib_purge_deleted_rows", \{\}\)/.test(read("app/api/cron/storage-cleanup/route.ts")))
  check("the check after says whether part 66 holds", read("supabase/sql/run-now/99_check_after.sql").includes("as p66_deleted_rows_kept"))
}

console.log("\nLayers 3 and 4: every night, off-site, encrypted")
{
  for (const f of ["scripts/backup/common.sh", "scripts/backup/backup-database.sh", "scripts/backup/backup-storage.sh", "scripts/backup/restore-drill.sh"]) {
    check(`${f} exists`, existsSync(f))
    let syntax = true
    try { execFileSync("bash", ["-n", f], { stdio: "pipe" }) } catch { syntax = false }
    check(`  and is valid bash`, syntax)
    if (!f.endsWith("common.sh")) {
      check(`  stops at the first failure`, read(f).includes("set -euo pipefail"))
      check(`  is executable`, (statSync(f).mode & 0o111) !== 0)
    }
  }
  const db = read("scripts/backup/backup-database.sh")
  check("the whole database is dumped, auth included (no --schema=public limit)", /pg_dump\)" "\$SUPABASE_DB_URL"/.test(db) && !/--schema=public/.test(db))
  check("nothing leaves unencrypted", /encrypt "\$f" "\$f\.gpg"/.test(db) && /put "\$work\/storelib-\$stamp\.dump\.gpg"/.test(db) && !/put "\$work\/storelib-\$stamp\.dump" /.test(db))
  check("AES256 with a passphrase only the owner holds", read("scripts/backup/common.sh").includes("--symmetric --cipher-algo AES256"))
  check("a suspiciously small dump fails the night", db.includes('if [ "$bytes" -lt 10000 ]'))
  check("the manifest carries row counts and a checksum", db.includes("row_counts") && db.includes('sha256sum "$work/storelib-$stamp.dump"'))
  const files = read("scripts/backup/backup-storage.sh")
  check("files are mirrored bucket by bucket from Supabase Storage", /rclone sync "supa:\$b" "dest:\$BACKUP_S3_BUCKET\/storage\/current\/\$b"/.test(files))
  check("a deleted or replaced file is kept, never dropped from the copy", files.includes('--backup-dir "dest:$BACKUP_S3_BUCKET/storage/changed/$day/$b"'))
  check("a connection string is never printed", read("scripts/backup/common.sh").includes("redact()") && db.includes('redact "$BACKUP_DEST"'))
}

console.log("\nLayer 5: the newest backup is restored every week")
{
  const drill = read("scripts/backup/restore-drill.sh")
  check("it refuses any database that has tables", drill.includes("the drill only restores into an empty database"))
  check("the checksum is compared before restoring", drill.indexOf("checksum differs") < drill.indexOf("pg_restore"))
  check("every table of the manifest is counted and must match", drill.includes('if [ "$have" != "$want" ]') && drill.includes('[ "$mismatch" -eq 0 ]'))
}

console.log("\nThe schedules")
{
  const nightly = read(".github/workflows/backup.yml")
  const weekly = read(".github/workflows/restore-drill.yml")
  check("the backup runs every night", /cron: "17 2 \* \* \*"/.test(nightly))
  check("  database and files both", nightly.includes("scripts/backup/backup-database.sh") && nightly.includes("scripts/backup/backup-storage.sh"))
  check("  with a Postgres client new enough for Supabase", nightly.includes("postgresql-client-17"))
  check("  two runs never overlap", nightly.includes("cancel-in-progress: false"))
  check("the drill runs every week into a throwaway Postgres", /cron: "41 5 \* \* 0"/.test(weekly) && weekly.includes("image: postgres:17") && weekly.includes("scripts/backup/restore-drill.sh"))
  check("  and its failure is not hidden by the log copy", /shell: bash\n\s*run: PG_BIN=\/usr\/lib\/postgresql\/17\/bin scripts\/backup\/restore-drill\.sh 2>&1 \| tee/.test(weekly))
  check("a failure tells the owner", [nightly, weekly].every((w) => w.includes("if: failure() && env.ALERT_WEBHOOK_URL != ''")))
  check("secrets come from GitHub, none are written here", ![nightly, weekly].some((w) => /(sk_live|eyJhbGci|postgresql:\/\/postgres:[^d])/.test(w)))
  check("until the secrets are set the jobs say so and stop green", [nightly, weekly].every((w) => w.includes("not configured yet") && w.includes("ok=false")))
}

console.log("\nThe runbook")
{
  const doc = read("docs/operations/backups.md")
  for (const heading of ["## What is kept, in layers", "## One time setup", "## Restoring", "### A row somebody deleted", "### From the off-site copy", "### Files: layer 4", "## Targets"]) {
    check(`it has "${heading.replace(/^#+ /, "")}"`, doc.includes(heading))
  }
  check("it names every secret the workflows read", ["SUPABASE_DB_URL", "BACKUP_PASSPHRASE", "BACKUP_S3_BUCKET", "BACKUP_S3_ENDPOINT", "BACKUP_S3_ACCESS_KEY_ID", "SUPABASE_S3_ACCESS_KEY_ID", "ALERT_WEBHOOK_URL"].every((s) => doc.includes(s)))
  check("it says Supabase's backups do not hold the files", doc.includes("do not include uploaded files"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
