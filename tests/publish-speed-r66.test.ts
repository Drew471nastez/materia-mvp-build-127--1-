/**
 * ===========================================================================
 *  PUBLISH: LIGHT, IN ORDER, AND THE EDITOR'S CANVAS ASKED BEFORE IT IS READ (round 66)
 * ===========================================================================
 * The owner: "make sure publishing is very fast and clean and smooth, live
 * websites don't take too much to load, the editor loads very well, 'Still
 * opening your website' doesn't happen, stability."
 *
 * Measured through the real route handlers, supabase-js and every helper
 * under them, over the stand-in Supabase of tests/_r65-rest-world.ts (one
 * shared database link: what one large read takes, the small ones beside it
 * wait for), on the real Materia clothing template stored by the
 * marketplace's own storeImportedTheme (989 files, 28.95 MB):
 *
 *   AFTER THE ANSWER   one read of every file per publish (was four), the
 *                      release first, then the warm and the backup, and the
 *                      backup keeps by sha256 every file whose text Storelib
 *                      already holds (was a 31.7 MB row).
 *   RESTORE            a light backup is put back byte for byte; a full
 *                      backup from before this round still is.
 *   THE CANVAS         files?sources=1 and files?compat=1 answer a 304 from
 *                      the rows' paths and times, before any text is read,
 *                      and a change of any kind is a full answer.
 *   THE ANSWER         what the press waits for is the live switch; the
 *                      rest runs after it.
 *
 * Each scenario prints R66 <name>: <numbers>.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { world, net, seedStore, resetCounts, installFetch, holdRequest, table, CREATOR_ID, USER_ID } from "./_r65-rest-world"
import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { convertTemplateFiles } from "@/lib/themes/template-install"
import { storeImportedTheme } from "@/lib/themes/imported-theme-store"
import { createAdminClient } from "@/lib/supabase/admin"
import { forgetSigningKeys } from "@/lib/auth/verify-token"
import { GET as filesGet } from "@/app/api/website-builder/themes/[installId]/files/route"
import { POST as publishPost } from "@/app/api/website-builder/themes/[installId]/publish/route"
import { fullSnapshot, readSnapshot, fingerprintOf, takeBackup, type BackupSnapshot } from "@/lib/website-builder/backups"
import { restoreBackup } from "@/lib/website-builder/restore-backup"
import { forgetHeldBlobs } from "@/lib/website-builder/theme-file-refs"
import { namedTags } from "@/lib/website-builder/files-revision"
import * as nextCache from "../scripts/speed18/shims/next-cache"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)?.slice(0, 400)}` : ""}`) }
}
const report = (name: string, line: string) => out(`  R66 ${name}: ${line}`)
console.warn = () => {}
console.error = () => {}
console.info = () => {}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const MB = (n: number) => `${(n / 1e6).toFixed(2)} MB`

let INSTALL = ""
const afterTasks: (() => unknown)[] = []
;(globalThis as Record<string, unknown>).__PUSH_TEST_AFTER__ = (task: () => unknown) => void afterTasks.push(task)

async function app(path: string, init?: RequestInit): Promise<Response> {
  holdRequest()
  const req = new Request(`https://storelib.com${path}`, init)
  const id = path.split("/")[4]?.split("?")[0] ?? ""
  const params = { params: Promise.resolve({ installId: id }) }
  const p = path.split("?")[0]
  if (p === `/api/website-builder/themes/${id}/files`) return (await filesGet(req, params)) as Response
  if (p === `/api/website-builder/themes/${id}/publish`) return (await publishPost(req, params)) as Response
  return new Response("{}", { status: 404 })
}
installFetch(app)

const files = () => table("store_theme_custom_files").filter((f) => f.install_id === INSTALL)
const bump = () => new Date(Date.now() + Math.floor(Math.random() * 1000)).toISOString()

/** A publish as the editor sends it: the answer, then the work after it run as Next runs it (every `after` at once). */
async function publish(): Promise<{ answerMs: number; answerDb: number; afterMs: number; afterDb: number; log: NonNullable<typeof world.log>; backupBytes: number }> {
  resetCounts()
  holdRequest()
  afterTasks.length = 0
  const t0 = performance.now()
  const r = await fetch(`/api/website-builder/themes/${INSTALL}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) })
  await r.text()
  const answerMs = Math.round(performance.now() - t0)
  check("it publishes", r.status === 200, r.status)
  const answerDb = world.bytes
  resetCounts()
  world.log = []
  const t1 = performance.now()
  await Promise.all(afterTasks.splice(0).map((task) => Promise.resolve().then(task).catch(() => {})))
  const afterMs = Math.round(performance.now() - t1)
  const log = world.log
  world.log = null
  const backup = table("store_theme_backups").filter((b) => b.install_id === INSTALL).at(-1)
  return { answerMs, answerDb, afterMs, afterDb: world.bytes, log: log.map((l) => ({ ...l, at: l.at - t1, end: l.end - t1 })), backupBytes: backup ? JSON.stringify(backup).length : 0 }
}

async function main() {
  forgetSigningKeys()
  seedStore()
  world.rpc.clear()

  out("\n1. A Materia template added through the marketplace's own store step")
  const converted = await convertTemplateFiles(composeTemplateFiles("materia/clothing"), "Clothing")
  holdRequest()
  net.rttMs = 0
  net.mbps = 1e6
  const stored = await storeImportedTheme(createAdminClient(), { userId: USER_ID, creatorId: CREATOR_ID }, converted!.theme, converted!.report, { name: "Clothing" })
  check("the template is stored", stored.ok === true, stored)
  if (!stored.ok) return
  INSTALL = stored.installId
  report("template", `${files().length} files, ${MB(files().reduce((a, f) => a + String(f.content).length, 0))} of text`)

  net.rttMs = 25
  net.mbps = 25
  net.shared = true
  /* Next's data cache, kept as Next 16 keeps it (scripts/speed18/shims/next-cache.ts): a release's files are held by what they hold, as on Vercel. */
  ;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache

  out("\n2. The first publish after adding it (25 ms a round trip, one 25 MB/s database link)")
  const first = await publish()
  const fullReads = first.log.filter((l) => l.table === "store_theme_custom_files" && l.method === "GET" && l.bytes > 5_000_000)
  const byTable = new Map<string, number>()
  for (const l of first.log) byTable.set(l.table, (byTable.get(l.table) ?? 0) + l.bytes)
  report("first publish", `answer ${first.answerMs} ms, database ${MB(first.answerDb)} | after the answer: database ${MB(first.afterDb)} in ${first.afterMs} ms, ${fullReads.length} read(s) of every file, backup row ${MB(first.backupBytes)}`)
  report("first publish, by table", [...byTable].filter(([, b]) => b > 100_000).map(([k, b]) => `${k} ${MB(b)}`).join(", "))
  check("every file is read once after the answer (was four reads, 108.8 MB)", fullReads.length === 1, fullReads.map((l) => l.select))
  check("the backup row is light: under 1 MB (was 31.7 MB)", first.backupBytes > 0 && first.backupBytes < 1_000_000, MB(first.backupBytes))
  check("the work after the answer moves under 80 MB (was 174 MB)", first.afterDb < 80_000_000, MB(first.afterDb))
  const released = first.log.find((l) => l.table === "site_live_releases" && l.method === "PATCH")
  const backupWrite = first.log.find((l) => l.table === "store_theme_backups" && l.method === "POST")
  check("the release is pointed at before the backup is written", !!released && !!backupWrite && backupWrite.at >= released.end, { released: released?.end, backup: backupWrite?.at })

  out("\n3. A second publish, nothing new to keep")
  const home = table("store_theme_pages").find((p) => p.install_id === INSTALL && p.page_key === "home")!
  home.draft_sections = [...(home.sections as unknown[])].reverse()
  const second = await publish()
  const reads2 = second.log.filter((l) => l.table === "store_theme_custom_files" && l.method === "GET" && l.bytes > 5_000_000)
  report("second publish", `answer ${second.answerMs} ms, database ${MB(second.answerDb)} | after the answer: database ${MB(second.afterDb)} in ${second.afterMs} ms, ${reads2.length} read(s) of every file, backup row ${MB(second.backupBytes)}`)
  check("again one read of every file", reads2.length === 1, reads2.length)
  check("and no blob written again", !second.log.some((l) => l.table === "theme_file_blobs" && l.method === "POST"))
  check("the second backup is light too", second.backupBytes < 1_000_000, MB(second.backupBytes))

  out("\n4. Restore: a light backup comes back byte for byte, an old full one still does")
  const admin = createAdminClient()
  {
    const light = table("store_theme_backups").filter((b) => b.install_id === INSTALL).at(-1)!
    const snap = light.snapshot as BackupSnapshot
    check("the light backup names its unchanged files by sha256", Array.isArray(snap.file_refs) && snap.file_refs.length > 900, snap.file_refs?.length)
    const whole = await fullSnapshot(snap)
    const now = await readSnapshot(admin as never, INSTALL)
    check("resolved, it is the state it was taken from (same fingerprint)", fingerprintOf(whole) === light.fingerprint && fingerprintOf(now) === light.fingerprint)
    const before = new Map(files().map((f) => [String(f.path), String(f.draft_content ?? f.content)]))
    /* Change a third of the files, then put the light backup back. */
    let n = 0
    for (const f of files()) if (n++ % 3 === 0) { f.draft_content = `${f.content}\n/* edited */`; f.updated_at = bump() }
    forgetHeldBlobs()
    const r = await restoreBackup(admin as never, admin as never, INSTALL, String(light.id))
    check("the light backup restores", r.ok === true, r)
    const after = new Map(files().map((f) => [String(f.path), String(f.draft_content ?? f.content)]))
    const diff = [...before].filter(([p, c]) => after.get(p) !== c).map(([p]) => p)
    check("every file byte for byte as it was", diff.length === 0 && after.size === before.size, diff.slice(0, 5))

    /* An old backup: every file inline, as written before this round. */
    const old = await readSnapshot(admin as never, INSTALL)
    const oldRow = { id: "00000000-0000-4000-8000-00000000b001", install_id: INSTALL, label: "Old", source: "manual", snapshot: JSON.parse(JSON.stringify(old)), fingerprint: fingerprintOf(old), created_at: new Date(Date.now() - 86_400_000).toISOString() }
    table("store_theme_backups").push(oldRow)
    for (const f of files().slice(0, 50)) { f.draft_content = "changed"; f.updated_at = bump() }
    const r2 = await restoreBackup(admin as never, admin as never, INSTALL, oldRow.id)
    check("an old full backup still restores", r2.ok === true, r2)
    const after2 = new Map(files().map((f) => [String(f.path), String(f.draft_content ?? f.content)]))
    check("  byte for byte", [...before].every(([p, c]) => after2.get(p) === c))
    const missing: Record<string, unknown> = { ...(table("store_theme_backups").filter((b) => b.install_id === INSTALL).at(-1)!), id: "00000000-0000-4000-8000-00000000b002" }
    missing.snapshot = { ...(missing.snapshot as BackupSnapshot), file_refs: [{ path: "x.liquid", sha256: "0".repeat(64) }] }
    table("store_theme_backups").push(missing)
    forgetHeldBlobs()
    const r3 = await restoreBackup(admin as never, admin as never, INSTALL, String(missing.id))
    check("a backup whose text cannot be found is refused, nothing changed", r3.ok === false)
  }

  out("\n5. A backup taken by hand is light too, and the same state twice is one row")
  {
    const count = table("store_theme_backups").length
    const a = await takeBackup(admin as never, INSTALL, { label: "By hand", source: "manual" })
    const b = await takeBackup(admin as never, INSTALL, { label: "By hand", source: "manual" })
    const row = table("store_theme_backups").find((x) => x.id === a.backup?.id)
    check("written once, skipped the second time", !a.skipped && b.skipped && table("store_theme_backups").length === count + 1, { a: a.skipped, b: b.skipped })
    check("  and light", !!row && JSON.stringify(row).length < 1_000_000, row ? MB(JSON.stringify(row).length) : null)
  }

  out("\n6. The editor's canvas reads, asked again with the copy the browser holds")
  net.shared = false
  {
    const base = `/api/website-builder/themes/${INSTALL}/files`
    const ask = async (q: string, tag?: string | null) => {
      resetCounts()
      const t = performance.now()
      const r = await fetch(`${base}?${q}`, tag ? { headers: { "if-none-match": tag } } : undefined)
      const body = await r.text()
      return { status: r.status, tag: r.headers.get("etag"), bytes: body.length, body, db: world.bytes, ms: Math.round(performance.now() - t) }
    }
    for (const q of ["sources=1", "compat=1"]) {
      const a = await ask(q)
      const b = await ask(q, a.tag)
      report(`open ${q}`, `first ${a.status} ${a.ms} ms, database ${MB(a.db)}, sent ${MB(a.bytes)} | again ${b.status} ${b.ms} ms, database ${MB(b.db)}`)
      check(`${q}: tagged with the rows' revision`, a.status === 200 && namedTags(a.tag).length === 1, a.tag)
      check(`${q}: asked again unchanged, a 304 that reads under 200 KB from the database (was the whole read)`, b.status === 304 && b.db < 200_000, { status: b.status, db: b.db })
    }
    /* Every kind of change is a full answer. */
    const src = files().find((f) => String(f.path).endsWith(".storelib"))!
    const shop = files().find((f) => String(f.path).startsWith("shopify/templates/"))!
    const sources0 = await ask("sources=1")
    const compat0 = await ask("compat=1")
    src.draft_content = `${src.content}\n<!-- saved -->`
    src.updated_at = bump()
    const s1 = await ask("sources=1", sources0.tag)
    check("a saved section file: the new text is sent", s1.status === 200 && s1.body.includes("<!-- saved -->"))
    const c1 = await ask("compat=1", compat0.tag)
    check("  a change outside the Shopify files leaves that answer a 304", c1.status === 304)
    shop.draft_content = `${shop.content} `
    shop.updated_at = bump()
    const c2 = await ask("compat=1", compat0.tag)
    check("a saved Shopify file: sent", c2.status === 200 && c2.tag !== compat0.tag)
    const sent = Object.keys(JSON.parse(c2.body).files as Record<string, string>)
    const gone = files().find((f) => f !== shop && sent.includes(String(f.path)))!
    world.tables.set("store_theme_custom_files", table("store_theme_custom_files").filter((f) => f !== gone))
    const c3 = await ask("compat=1", c2.tag)
    check("a deleted file: sent, without it", c3.status === 200 && !(JSON.parse(c3.body).files as Record<string, string>)[String(gone.path)], { status: c3.status, path: gone.path })
    table("store_theme_custom_files").push({ ...gone, updated_at: bump() })
    const c4 = await ask("compat=1", c3.tag)
    check("a file added: sent, with it", c4.status === 200 && !!(JSON.parse(c4.body).files as Record<string, string>)[String(gone.path)], { status: c4.status })
    /* A row moved and its text the same (a publish putting a draft in place): read, and still a 304. */
    shop.content = String(shop.draft_content)
    shop.draft_content = null
    shop.updated_at = bump()
    const c5 = await ask("compat=1", c4.tag)
    check("a row whose time moved but whose answer is the same: read, still a 304", c5.status === 304 && c5.db > 1_000_000, { status: c5.status, db: c5.db })
    const prior = process.env.VERCEL_DEPLOYMENT_ID
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_next"
    const c6 = await ask("compat=1", c5.tag)
    if (prior === undefined) delete process.env.VERCEL_DEPLOYMENT_ID
    else process.env.VERCEL_DEPLOYMENT_ID = prior
    check("a new deployment reads the files again (its code shapes the answer)", c6.db > 1_000_000, c6.db)
  }

  out("\n7. Where it is decided")
  {
    const route = read("app/api/website-builder/themes/[installId]/publish/route.ts")
    check("the answer is sent once the live site is switched and the caches cleared; the release, warm and backup run after it", route.indexOf("return NextResponse.json({ ok: true, status: \"published\" })") > route.indexOf("await revalidatePublishedSite(creator.id)\n") && !/await (warmAfterPublish|takeBackup|recordRelease)\(/.test(route.slice(0, route.indexOf("const follow = publishFollowUp"))))
    check("one follow-up per publish shares the read", /const follow = publishFollowUp\(admin, installId\)/.test(route) && /recordRelease\(admin, \{ installId, creatorId \}, follow\.liveRows\)/.test(route))
    check("the warm waits for the release, for at most WARM_WAITS_FOR_RELEASE_MS", /await follow\.waitForRelease\(WARM_WAITS_FOR_RELEASE_MS\)/.test(route))
    const backups = read("lib/website-builder/backups.ts")
    check("a backup's fingerprint is of the whole state, so light and full backups of one state are one", /const fingerprint = fingerprintOf\(snapshot\)/.test(backups) && /lightSnapshot\(snapshot, given\.knownBlobs\)/.test(backups))
    const restore = read("lib/website-builder/restore-backup.ts")
    check("restore resolves a light backup before anything reads it", restore.indexOf("fullSnapshot(") > 0 && restore.indexOf("fullSnapshot(") < restore.indexOf("addedSince("))
  }
}

main()
  .catch((e) => {
    failed++
    failures.push(`threw: ${e instanceof Error ? e.stack : String(e)}`)
  })
  .finally(() => {
    out(`\n${passed} passed, ${failed} failed`)
    if (failed) {
      for (const f of failures) out(`  - ${f}`)
      process.exit(1)
    }
    process.exit(0)
  })
