/**
 * Round AY (track AY-4): a deleted website page, its theme settings and its
 * code files can be put back.
 *
 * Part 66 keeps a 90 day copy of every deleted row of the tables that hold
 * creators' work (public.deleted_rows, put back with
 * storelib_restore_deleted_row). Its list had store_theme_installs but none of
 * the tables a website is made of, so a page deleted in the editor
 * (DELETE /api/website-builder/themes/[installId]/sections) was gone for good,
 * and a deleted website came back as an install row with no pages, settings or
 * code (the cascade took them, untracked). Part 466 adds the same trigger to
 * store_theme_pages, store_theme_settings and store_theme_custom_files.
 *
 * Proven on the production shaped harness (scripts/sql-harness, editor
 * scenario): before, deleting a page left 0 copies and restoring a deleted
 * website gave 0 pages, 0 settings, 0 code files; after, 1 copy per page and
 * the whole website came back with its sections.
 */
import { readFileSync } from "node:fs"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

const sql = read("supabase/sql/run-now/466_website_pages_deleted_rows_kept.sql")
const lines = sql.split("\n").filter((l) => l.trim() !== "")
const body = lines.slice(1).join("\n")

check("part 466 and its migration are the same text", sql === read("supabase/migrations/20271466_website_pages_deleted_rows_kept.sql"))
check("the first line is one /* comment */", /^\/\*.*\*\/$/.test(lines[0]))
for (const t of ["store_theme_pages", "store_theme_settings", "store_theme_custom_files"]) {
  check(`${t} is on the list`, new RegExp(`ARRAY\\[[^\\]]*'${t}'`).test(body))
}
check("the same trigger as part 66, after the delete, row by row", body.includes("AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.storelib_keep_deleted_row()"))
check("skipped with a notice where part 66 has not run", /to_regprocedure\('public\.storelib_keep_deleted_row\(\)'\) IS NULL OR to_regclass\('public\.deleted_rows'\) IS NULL THEN RAISE NOTICE/.test(body))
check("a table that is not there is skipped", /to_regclass\('public\.' \|\| t\) IS NULL THEN RAISE NOTICE/.test(body))
check("non destructive: no row deleted or changed, no table or column dropped", !/\b(DELETE FROM|UPDATE\s+public|TRUNCATE|DROP TABLE|DROP COLUMN|ALTER TABLE)\b/i.test(body))
check("backups, releases and chats stay off the list on purpose (pruned or deleted by design)", !/store_theme_backups|site_releases|theme_chat_/.test(body))
check("ends by reloading the API schema", lines[lines.length - 1].trim() === "notify pgrst, 'reload schema';")

const readme = read("supabase/sql/run-now/README.md")
check("the README lists part 466 after part 464", readme.indexOf("`466_website_pages_deleted_rows_kept.sql`") > readme.indexOf("`464_onepage_drafts_private.sql`") && readme.includes("`466_website_pages_deleted_rows_kept.sql`"))
const after = read("supabase/sql/run-now/99_check_after.sql")
check("the check after says whether part 466 holds, without failing where the table is missing", /to_regclass\('public\.store_theme_pages'\) is null or exists \(select 1 from pg_trigger where tgname = 'store_theme_pages_keep_deleted' and tgrelid = to_regclass\('public\.store_theme_pages'\)\)\) as p466_website_pages_deleted_rows_kept/.test(after))
check("the backups guide names part 466", read("docs/operations/backups.md").includes("466_website_pages_deleted_rows_kept.sql"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
