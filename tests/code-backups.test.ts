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
  check("  read as the editor shows them: the draft where there is one", /from\("store_theme_custom_files"\)\.select\("path, content, draft_content"\)/.test(backups) && /content: editorContent\(f\)/.test(backups))
  check("  in a fixed order, so the same code hashes the same and is not stored twice", /\.sort\(\(a, b\) => a\.path\.localeCompare\(b\.path\)\)/.test(backups) && /fingerprintOf\(snapshot\)/.test(backups))
  check("  and a database without that table still takes backups as before", /let files[\s\S]{0,700}catch \{\s*files = undefined/.test(backups))
}

console.log("\nWhat a restore does with it\n")
{
  check("each file goes back as a draft, nothing goes live", /const saved = await saveDraft\(db, installId, file\.path, file\.content\)/.test(backups))
  check("  and is a version in that file's history, so the restore can be stepped back from", /recordVersion\(db, installId, file\.path, file\.content, "restore"\)/.test(backups))
  check("  an old backup without files leaves the code alone", /for \(const file of snapshot\.files \?\? \[\]\)/.test(backups))
  check("  the restore route still takes a safety copy first", read("app/api/website-builder/themes/[installId]/backups/[backupId]/restore/route.ts").indexOf("takeBackup(") < read("app/api/website-builder/themes/[installId]/backups/[backupId]/restore/route.ts").indexOf("await applySnapshot("))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
