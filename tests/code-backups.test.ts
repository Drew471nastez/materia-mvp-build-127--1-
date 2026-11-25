/**
 * A backup of a website holds its code as well as its settings and pages,
 * and a restore brings the code back as a draft, recorded in each file's
 * history.
 *
 *   npx tsx tests/code-backups.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const backups = read("lib/website-builder/backups.ts")

console.log("\nWhat a backup holds\n")
{
  check("the code files are part of the snapshot", /files\?: \{ path: string; content: string \}\[\]/.test(backups))
  check("  read as the editor shows them: the draft where there is one", /* Changed on purpose (round 27): through fileCols, references resolved (theme-file-refs.ts). */ /from\("store_theme_custom_files"\)\.select\(await fileCols\("path, content, draft_content"\)\)/.test(backups) && /content: editorContent\(f\)/.test(backups))
  check("  in a fixed order, so the same code hashes the same and is not stored twice", /\.sort\(\(a, b\) => a\.path\.localeCompare\(b\.path\)\)/.test(backups) && /fingerprintOf\(snapshot\)/.test(backups))
  check("  and a database without that table still takes backups as before", /let files[\s\S]{0,700}catch \{\s*files = undefined/.test(backups))
}

console.log("\nWhat a restore does with it\n")
{
  /* Changed on purpose (round Z4): one file at a time never finished on a 504 file theme. The restore is bulk and all or nothing now, in lib/website-builder/restore-snapshot.ts; tests/restore-backup.test.ts runs it. */
  const restore = read("lib/website-builder/restore-snapshot.ts")
  check("each file goes back as a draft, nothing goes live", /return restoreSnapshot\(db, installId, snapshot, opts\)/.test(backups) && /path: f\.path, content: before \? before\.content : "", draft_content: f\.content/.test(restore))
  check("  and is a version in that file's history, so the restore can be stepped back from", /from\("store_theme_file_versions"\)\.insert\(group\)/.test(restore) && /kind: "restore"/.test(restore))
  check("  an old backup without files leaves the code alone", /const wanted = \(snapshot\.files \?\? \[\]\)/.test(restore))
  /* Changed on purpose (round M): the restore steps are lib/website-builder/restore-backup.ts, shared with the AI job's Undo. */
  check("  the restore route still takes a safety copy first", (() => { const r = read("lib/website-builder/restore-backup.ts"); return r.indexOf("takeBackup(") > 0 && r.indexOf("takeBackup(") < r.indexOf("await applySnapshot(") })())
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
