/**
 * AN EARLIER PUBLISH, LIVE AGAIN
 *
 * 1. The list of published versions (lib/website-builder/site-releases.ts
 *    releaseList, site-releases-server.ts listReleases): newest first, the
 *    live one marked only while the website is live, and hidden (not an
 *    error) until SQL parts 180 and 188 have run.
 * 2. The rollback call (rollbackRelease): its answer read, its refusals
 *    named, never a throw.
 * 3. SQL part 188 as text: one transaction under Publish's lock, the live
 *    rows written from the release, a new release pointed at, server only.
 * 4. The route: Publish's ownership check and rate limit, the draft backed
 *    up before anything is written, the caches Publish clears.
 * 5. The editor: "Restore this version" in Backups & Versions, asked first,
 *    every sentence in tt() and in the six catalogs.
 *
 * The function itself was run against Postgres 16 in the SQL harness
 * (scripts/sql-harness); this file reads its text.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/release-rollback.test.ts
 */
import { readFileSync, readdirSync } from "node:fs"
import { isReleaseId, releaseList, rollbackFailure, RELEASES_KEPT } from "../lib/website-builder/site-releases"
import { listReleases, releasesKnownMissing, resetReleasesMissing, rollbackRelease } from "../lib/website-builder/site-releases-server"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 300)}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

type Err = { code: string; message: string } | null

/** Just enough of supabase-js for listReleases: two tables, each answering once. */
function fakeDb(answers: { releases: { data: unknown; error: Err }; pointer: { data: unknown; error: Err } }) {
  const asked: { table: string; filters: unknown[] }[] = []
  const builder = (table: string) => {
    const filters: unknown[] = []
    asked.push({ table, filters })
    const answer = table === "site_releases" ? answers.releases : answers.pointer
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
      order: () => b,
      limit: (n: number) => { filters.push(["limit", n]); return Promise.resolve(answer) },
      maybeSingle: () => Promise.resolve(answer),
    }
    return b
  }
  return { db: { from: builder }, asked }
}

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const C = "33333333-3333-4333-8333-333333333333"

async function main() {
  console.log("\n1. The list of published versions")
  {
    const rows = [
      { id: A, created_at: "2026-10-01T10:00:00Z", file_count: 3, restored_from: null },
      { id: C, created_at: "2026-10-03T10:00:00Z", file_count: 3, restored_from: A },
      { id: B, created_at: "2026-10-02T10:00:00Z", file_count: null, restored_from: null },
    ]
    const list = releaseList(rows, C, true)
    check("newest first", list.map((r) => r.id).join() === [C, B, A].join(), list)
    check("the one the pointer names is live", list[0].live && !list[1].live && !list[2].live)
    check("one made by a restore says so", list[0].restored && !list[1].restored)
    check("a missing count reads as 0", list[1].files === 0)
    check("no version is live while the website is taken down", releaseList(rows, C, false).every((r) => !r.live))
    check("none is live after an edit cleared the pointer", releaseList(rows, null, true).every((r) => !r.live))
    check("a row that is not a release is left out", releaseList([...rows, { id: 5 as unknown as string, created_at: "x" }], null, true).length === 3)

    resetReleasesMissing()
    const ok = fakeDb({ releases: { data: rows, error: null }, pointer: { data: { release_id: B }, error: null } })
    const got = await listReleases(ok.db, A, true)
    check("listed for this website only, up to the number kept", ok.asked.some((q) => q.table === "site_releases" && JSON.stringify(q.filters).includes(JSON.stringify(["install_id", A])) && JSON.stringify(q.filters).includes(JSON.stringify(["limit", RELEASES_KEPT]))))
    check("available, with the live one marked", got.available === true && got.releases.find((r) => r.live)?.id === B, got)

    const before180 = fakeDb({ releases: { data: null, error: { code: "42P01", message: 'relation "public.site_releases" does not exist' } }, pointer: { data: null, error: { code: "42P01", message: "does not exist" } } })
    check("before part 180: hidden, not an error", (await listReleases(before180.db, A, true)).available === false)
    const before188 = fakeDb({ releases: { data: null, error: { code: "42703", message: "column site_releases.restored_from does not exist" } }, pointer: { data: null, error: null } })
    check("part 180 without part 188: hidden too (no rollback function to call)", (await listReleases(before188.db, A, true)).available === false)
    check("  and the live website's release reads are not turned off by it", releasesKnownMissing() === false)
    const down = fakeDb({ releases: { data: null, error: { code: "57014", message: "statement timeout" } }, pointer: { data: null, error: null } })
    let threw = false
    try { await listReleases(down.db, A, true) } catch { threw = true }
    check("a database that did not answer is an error, not an empty list", threw)
  }

  console.log("\n2. The rollback call")
  {
    let args: Record<string, unknown> | null = null
    let fn = ""
    const db = (answer: { data: unknown; error: Err } | Error) => ({
      rpc: (name: string, a: Record<string, unknown>) => {
        fn = name
        args = a
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
      },
    })
    const done = await rollbackRelease(db({ data: { release_id: C, was_live: [B], files: [{ path: "sections/header.liquid", content: "old" }, { path: 3 }] }, error: null }), { installId: A, creatorId: B, releaseId: C })
    check("one call to rollback_site_release with the install, the creator and the release", fn === "rollback_site_release" && JSON.stringify(args) === JSON.stringify({ p_install: A, p_creator: B, p_release: C }), args)
    check("its answer read: the new release, what was live, each file that changed", done.ok === true && done.releaseId === C && done.wasLive[0] === B && done.files.length === 1, done)
    const refused = async (error: Err) => {
      const r = await rollbackRelease(db({ data: null, error }), { installId: A, creatorId: B, releaseId: C })
      return r.ok ? "ok" : r.reason
    }
    check("part 188 not run: missing", (await refused({ code: "PGRST202", message: "Could not find the function public.rollback_site_release" })) === "missing")
    check("another website's or creator's release: not found", (await refused({ code: "P0002", message: "rollback: no such release of this website" })) === "not_found")
    check("a release with a file's text gone: unreadable", (await refused({ code: "22023", message: "rollback: 1 files of the release are missing" })) === "unreadable")
    check("anything else: failed", (await refused({ code: "40001", message: "serialization" })) === "failed")
    const thrown = await rollbackRelease(db(new Error("socket hang up")), { installId: A, creatorId: B, releaseId: C })
    check("never throws", thrown.ok === false && thrown.reason === "failed")
    const empty = await rollbackRelease(db({ data: {}, error: null }), { installId: A, creatorId: B, releaseId: C })
    check("an answer without a release is not a success", empty.ok === false)
    check("the failure names", rollbackFailure({ code: "42883" }) === "missing" && rollbackFailure(null) === "failed")
    check("a release id is a uuid", isReleaseId(A) && !isReleaseId("../backups") && !isReleaseId(""))
  }

  console.log("\n3. SQL part 188")
  {
    const RN = "supabase/sql/run-now"
    const file = readdirSync(RN).find((f) => /^188_/.test(f)) ?? ""
    const sql = read(`${RN}/${file}`)
    check("part 188 is the rollback", file === "188_site_release_rollback.sql")
    check("every line one whole statement (the README's rule)", sql.trimEnd().split("\n").length === 3 && sql.split("\n")[0].startsWith("/*") && sql.split("\n")[2] === "notify pgrst, 'reload schema';")
    check("skips itself without part 180 or the theme tables", /to_regclass\('public\.site_releases'\) IS NULL/.test(sql) && /RAISE NOTICE 'part 188/.test(sql))
    check("the function, made again safely", sql.includes("CREATE OR REPLACE FUNCTION public.rollback_site_release(p_install uuid, p_creator uuid, p_release uuid) RETURNS jsonb"))
    check("this creator's website and this website's release, or nothing", sql.includes("WHERE id = p_install AND creator_id = p_creator") && sql.includes("WHERE id = p_release AND install_id = p_install AND creator_id = p_creator"))
    check("under the same lock as Publish (part 130)", sql.includes("pg_advisory_xact_lock(hashtextextended('storelib-publish:' || p_creator::text, 0))") && read(`${RN}/130_theme_publish_in_one_step.sql`).includes("hashtextextended('storelib-publish:' || p_creator::text, 0)"))
    check("refuses a release with a file whose text is missing before writing anything", sql.indexOf("files of the release are missing") < sql.indexOf("INSERT INTO public.store_theme_settings"))
    check("the live settings written and their draft cleared", /INSERT INTO public\.store_theme_settings[^;]*ON CONFLICT \(install_id\) DO UPDATE SET settings = EXCLUDED\.settings, draft_settings = NULL/.test(sql))
    check("every page's live sections written, drafts cleared, pages it did not have removed", /ON CONFLICT \(install_id, page_key\) DO UPDATE SET sections = EXCLUDED\.sections, draft_sections = NULL/.test(sql) && /DELETE FROM public\.store_theme_pages t WHERE t\.install_id = p_install AND NOT EXISTS/.test(sql))
    check("every file from its blob, drafts cleared, files it did not have removed", /JOIN public\.theme_file_blobs b ON b\.sha256 = f->>'sha256' ORDER BY f->>'path' ON CONFLICT \(install_id, path\) DO UPDATE SET content = EXCLUDED\.content, draft_content = NULL/.test(sql) && /DELETE FROM public\.store_theme_custom_files c WHERE c\.install_id = p_install AND NOT EXISTS/.test(sql))
    check("switched live the way Publish switches it", sql.includes("UPDATE public.store_theme_installs SET status = 'unpublished' WHERE creator_id = p_creator AND status = 'published' AND id <> p_install") && sql.includes("SET status = 'published', published_at = now() WHERE id = p_install"))
    check("kept as a new release, marked where it came from, and pointed at", sql.includes("INSERT INTO public.site_releases (creator_id, install_id, manifest, file_count, total_bytes, restored_from)") && sql.includes("ON CONFLICT (install_id) DO UPDATE SET release_id = EXCLUDED.release_id"))
    check("the pointer set after the rows are written, its rev counted up", sql.indexOf("INSERT INTO public.site_live_releases") > sql.indexOf("INSERT INTO public.store_theme_custom_files") && sql.includes("rev = public.site_live_releases.rev + 1"))
    check("server only", sql.includes("REVOKE ALL ON FUNCTION public.rollback_site_release(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated") && sql.includes("GRANT EXECUTE ON FUNCTION public.rollback_site_release(uuid, uuid, uuid) TO service_role") && sql.includes("SECURITY DEFINER SET search_path = public, pg_temp"))
    check("no copy, em dash or AI word in its words", !/[—]|seamless|effortless|unlock|elevate/i.test(sql))
    const migrations = readdirSync("supabase/migrations").map((f) => read(`supabase/migrations/${f}`))
    check("a byte for byte copy in migrations", migrations.includes(sql))
    check("its README row and its column in the check after", read(`${RN}/README.md`).includes("| `188_site_release_rollback.sql` |") && /as p188_site_release_rollback[,;]/.test(read(`${RN}/99_check_after.sql`)))
    check("in the files the owner runs, and in the admin's list of parts", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 188_site_release_rollback.sql") && read("lib/admin/sql-parts.generated.ts").includes('part: "188"'))
  }

  console.log("\n4. The route")
  {
    const route = read("app/api/website-builder/themes/[installId]/releases/[releaseId]/restore/route.ts")
    const publish = read("app/api/website-builder/themes/[installId]/publish/route.ts")
    const list = read("app/api/website-builder/themes/[installId]/releases/route.ts")
    const owner = '.from("creators").select("id").eq("user_id", user.id)'
    check("the creator is the signed in owner, as in Publish", route.includes(owner) && list.includes(owner) && publish.includes('.from("creators")') && publish.includes('.eq("user_id", user.id)'))
    check("and the install is theirs", route.includes('.eq("creator_id", creator.id)') && list.includes('.eq("creator_id", creator.id)'))
    check("counted as a publish", route.includes('bucket: "site-publish"') && route.includes("LIMITS.sitePublish"))
    check("the release is this website's and this creator's before anything is written", route.indexOf('.eq("install_id", installId)') < route.indexOf("takeBackup(") && route.includes('.eq("creator_id", creator.id)'))
    check("the draft backed up first, and nothing happens without it", route.indexOf("takeBackup(") < route.indexOf("rollbackRelease(") && /source: "restore"/.test(route) && /if \(safety\.error\)[\s\S]{0,200}status: 500/.test(route))
    check("the caches Publish clears, after the write", route.includes("await revalidatePublishedSite(creator.id)") && route.indexOf("rollbackRelease(") < route.indexOf("await revalidatePublishedSite("))
    check("the record kept after the answer: history, file versions, pruning", route.includes("theme_publish_history") && route.includes('recordVersion(admin, installId, file.path, file.content, "restore")') && route.includes("pruneReleases(admin, installId)"))
    check("not set up yet: 503 with words, not a crash", route.includes('reason === "missing"') && route.includes("status: 503"))
    check("a bad id is a 404, not a database error", route.includes("isReleaseId(releaseId)"))
  }

  console.log("\n5. The editor")
  {
    const ui = read("components/website-builder/website-settings/backups.tsx")
    check("in Backups & Versions, beside the restore points", ui.includes('tt("Published versions")') && ui.includes('tt("Restore points")'))
    check("Restore this version, not on the one already live", ui.includes('tt("Restore this version")') && ui.includes("{!r.live && ("))
    check("asked first, saying the draft is replaced and it goes live", ui.includes("setConfirmingRelease(r)") && ui.includes('tt("Your current draft will be replaced. A backup of it is saved first.")') && ui.includes('tt("This version goes live right away.")'))
    check("the same sheet as a backup restore", (ui.match(/<ConfirmRestore/g) ?? []).length === 2)
    check("reloads the editor after, as a backup restore does", /restoreRelease[\s\S]*ctx\.onRestored\?\.\(\)/.test(ui))
    check("hidden until the database has it", ui.includes("{releases && (") && ui.includes("json.available ?"))
    const sentences = [...ui.matchAll(/tt\("([^"]+)"/g)].map((m) => m[1])
    const fresh = ["Published versions", "The newest 20 are kept.", "No published versions yet.", "Live now", "Restored from an earlier version", "Published", "Restore this version", "Restore this version?", "Your website goes back to the version published on", "Your current draft will be replaced. A backup of it is saved first.", "This version goes live right away.", "Could not restore this version", "Could not load published versions"]
    check("every new sentence is in tt()", fresh.every((s) => sentences.includes(s)), fresh.filter((s) => !sentences.includes(s)))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const cat = read(`lib/i18n/catalog/${lang}.ts`)
      const missing = fresh.filter((s) => !cat.includes(`${JSON.stringify(s)}:`))
      check(`  every one in ${lang}`, missing.length === 0, missing)
    }
    check("no em dash or AI word in the new copy", !fresh.some((s) => /[—]|seamless|effortless|unlock|elevate|powerful|transform/i.test(s)))
    check("in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/release-rollback.test.ts"'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main().catch((e) => { console.error(e); process.exit(1) })
