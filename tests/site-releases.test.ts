/**
 * RELEASES, AND AN IMPORTED THEME'S PAGE HELD FOR A STRANGER
 *
 * 1. A Publish is kept as a release (SQL part 180,
 *    lib/website-builder/site-releases.ts and site-releases-server.ts): the
 *    manifest and its hashes, the blobs written once, the pointer set only
 *    when nothing moved the live rows meanwhile, the newest twenty kept.
 * 2. Without a release (an old install, part 180 not run) everything reads
 *    as no release, and the live website is drawn from its rows as before.
 * 3. Which requests for an imported theme's page the CDN may hold
 *    (lib/storelib-theme/compat/anonymous-cache.ts): a stranger's page only.
 * 4. The SQL part as text.
 *
 * Run: NODE_OPTIONS="--conditions=react-server" npx tsx tests/site-releases.test.ts
 */
import { readFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { blobGroups, buildManifest, filesOf, pageRowsOf, readManifest, RELEASES_KEPT, settingsRowOf, sha256Hex } from "../lib/website-builder/site-releases"
import { livePointer, pruneReleases, readBlobs, readLivePointer, readReleaseManifest, recordRelease, releasesKnownMissing, releasesMissing, resetReleasesMissing } from "../lib/website-builder/site-releases-server"
import { sourcesFromFiles } from "../lib/website-builder/storefront-render"
import { PUBLIC_PAGE_CACHE, SHAREABLE_HEADER, markedThemeAddress, publicAnswer, readStrangerMarker, strangerAddress, strangerCookies, strangerMarker, strangerPage, type StrangerRequest } from "../lib/storelib-theme/compat/anonymous-cache"
import { CART_COOKIE, answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { sessionCookieName, HINT_COOKIE } from "../lib/site-accounts/session"
import { passCookieName } from "../lib/site-password/pass"
import { COUNTRY_COOKIE } from "../lib/markets/visitor-country"
import { GUEST_COOKIE } from "../lib/site-accounts/wishlist-list"
import { CHECKOUT_COUNTRY_COOKIE } from "../lib/checkout/checkout-country"
import { HOLD_COOKIE } from "../lib/checkout/coupon-holds"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 300)}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

// ── A small database, shaped as supabase-js answers ─────────────────────────

type Row = Record<string, unknown>
type Err = { code: string; message: string } | null
class FakeDb {
  tables = new Map<string, Row[]>()
  missing = new Set<string>()
  failing = new Set<string>()
  calls: string[] = []
  clock = 0
  /** Runs after each read of a table: a write landing while a release is made. */
  onRead: ((table: string) => void) | null = null
  rows(t: string) {
    if (!this.tables.has(t)) this.tables.set(t, [])
    return this.tables.get(t)!
  }
  from(table: string) {
    return new Query(this, table)
  }
}
class Query {
  op: "select" | "insert" | "upsert" | "update" | "delete" = "select"
  cols = "*"
  filters: ((r: Row) => boolean)[] = []
  payload: Row | Row[] | null = null
  conflict: string[] = []
  ignore = false
  returning = false
  one: "single" | "maybe" | null = null
  ordered: { col: string; asc: boolean } | null = null
  from = 0
  to = Infinity
  constructor(private db: FakeDb, private table: string) {}
  select(cols = "*") { if (this.op === "select") this.cols = cols; else this.returning = true; return this }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this }
  order(col: string, o?: { ascending?: boolean }) { this.ordered = { col, asc: o?.ascending !== false }; return this }
  limit(n: number) { this.to = this.from + n - 1; return this }
  range(a: number, b: number) { this.from = a; this.to = b; return this }
  maybeSingle() { this.one = "maybe"; return this }
  single() { this.one = "single"; return this }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this }
  upsert(p: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) { this.op = "upsert"; this.payload = p; this.conflict = (o?.onConflict ?? "id").split(","); this.ignore = !!o?.ignoreDuplicates; return this }
  update(p: Row) { this.op = "update"; this.payload = p; return this }
  delete() { this.op = "delete"; return this }
  then<T>(ok: (v: { data: unknown; error: Err }) => T, no?: (e: unknown) => T) {
    try { return Promise.resolve(this.run()).then(ok, no) } catch (e) { return no ? Promise.resolve(no(e)) : Promise.reject(e) }
  }
  private run(): { data: unknown; error: Err } {
    const db = this.db
    db.calls.push(`${this.op}:${this.table}`)
    if (db.missing.has(this.table) || (this.cols.includes("site_live_releases") && db.missing.has("site_live_releases"))) {
      return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${this.table}' in the schema cache` } }
    }
    if (db.failing.has(this.table)) return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }
    const all = db.rows(this.table)
    const match = all.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === "select") {
      let out = [...match]
      if (this.ordered) { const { col, asc } = this.ordered; out.sort((a, b) => (a[col]! < b[col]! ? -1 : a[col]! > b[col]! ? 1 : 0) * (asc ? 1 : -1)) }
      out = out.slice(this.from, this.to === Infinity ? undefined : this.to + 1)
      if (this.table === "store_theme_installs" && this.cols.includes("site_live_releases")) {
        out = out.map((r) => ({ id: r.id, site_live_releases: db.rows("site_live_releases").find((p) => p.install_id === r.id) ?? null }))
      }
      const result = this.one ? { data: out[0] ?? null, error: null } : { data: out, error: null }
      db.onRead?.(this.table)
      return result
    }
    const list = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : []
    if (this.op === "insert" || this.op === "upsert") {
      const made: Row[] = []
      for (const p of list) {
        const existing = this.op === "upsert" ? all.find((r) => this.conflict.every((c) => r[c] === p[c])) : undefined
        if (existing) { if (!this.ignore) Object.assign(existing, p); continue }
        const row: Row = { id: randomUUID(), created_at: new Date(1_700_000_000_000 + ++db.clock * 1000).toISOString(), rev: this.table === "site_live_releases" ? 0 : undefined, release_id: this.table === "site_live_releases" ? null : undefined, ...p }
        all.push(row)
        made.push(row)
      }
      return { data: this.returning ? (this.one ? made[0] ?? null : made) : null, error: null }
    }
    if (this.op === "update") {
      for (const r of match) Object.assign(r, this.payload)
      return { data: this.returning ? match : null, error: null }
    }
    db.tables.set(this.table, all.filter((r) => !match.includes(r)))
    return { data: null, error: null }
  }
}

/** What the trigger does in SQL part 180: a live change outside Publish lets go of the pointer and counts rev up. */
const forget = (db: FakeDb, installId: string) => {
  for (const p of db.rows("site_live_releases")) if (p.install_id === installId) { p.release_id = null; p.rev = Number(p.rev) + 1 }
}

const CREATOR = "c0000000-0000-4000-8000-000000000001"
const INSTALL = "10000000-0000-4000-8000-000000000001"
function seeded(): FakeDb {
  const db = new FakeDb()
  db.rows("store_theme_installs").push({ id: INSTALL, creator_id: CREATOR, status: "published", sort_order: 0 })
  db.rows("store_theme_settings").push({ install_id: INSTALL, settings: { colors: { accent: "#8b5cf6" }, compat: { kind: "shopify" } }, draft_settings: { colors: { accent: "#000" } } })
  db.rows("store_theme_pages").push(
    { install_id: INSTALL, page_key: "home", sections: [{ id: "a", type: "hero" }], draft_sections: [{ id: "draft" }] },
    { install_id: INSTALL, page_key: "about", sections: [{ id: "b", type: "text" }], draft_sections: null },
  )
  db.rows("store_theme_custom_files").push(
    { install_id: INSTALL, path: "layout/theme.liquid", content: "<html>{{ content_for_layout }}</html>", draft_content: "<html>DRAFT</html>" },
    { install_id: INSTALL, path: "sections/hero.storelib", content: "<section>hero</section>", draft_content: null },
    { install_id: INSTALL, path: "assets/base.css", content: "body{color:red}", draft_content: null },
    { install_id: INSTALL, path: "assets/copy.css", content: "body{color:red}", draft_content: null },
    { install_id: INSTALL, path: "sections/new.storelib", content: "", draft_content: "<section>not yet</section>" },
  )
  return db
}

async function main() {
  console.log("\nThe manifest and its hashes")
  {
    const files = { "b.liquid": "B", "a.liquid": "A", "empty.liquid": "", "dup.liquid": "A", "ü.liquid": "ü" }
    const { manifest, blobs, totalBytes } = buildManifest({ settings: { x: 1 }, pages: [{ page_key: "z", sections: [1] }, { page_key: "home", sections: [] }], files })
    check("sha256 is hex sha256 of the UTF-8 text", sha256Hex("ü") === createHash("sha256").update(Buffer.from("ü", "utf8")).digest("hex"))
    check("files sorted by path, an empty live file left out (nothing published there)", manifest.files.map((f) => f.path).join() === "a.liquid,b.liquid,dup.liquid,ü.liquid")
    check("each file names the sha256 of its text", manifest.files.every((f) => f.sha256 === sha256Hex(files[f.path as keyof typeof files])))
    check("the same text at two paths is one blob", blobs.size === 3 && manifest.files[0].sha256 === manifest.files[2].sha256)
    check("sizes are UTF-8 bytes", manifest.files.find((f) => f.path === "ü.liquid")!.size === 2 && totalBytes === 1 + 1 + 1 + 2)
    check("pages sorted by key, settings as they were", manifest.pages.map((p) => p.page_key).join() === "home,z" && (manifest.settings as { x: number }).x === 1)
    const again = buildManifest({ settings: { x: 1 }, pages: [{ page_key: "home", sections: [] }, { page_key: "z", sections: [1] }], files: { ...files } })
    check("the same site makes the same manifest", JSON.stringify(again.manifest) === JSON.stringify(manifest))
    check("a stored manifest reads back", readManifest(JSON.parse(JSON.stringify(manifest))) !== null)
    check("  and one that is not a manifest does not", readManifest(null) === null && readManifest({ v: 2, files: [], pages: [] }) === null && readManifest({ v: 1, files: [{ path: "a", sha256: "nothex" }], pages: [] }) === null)
    check("its files come back from its blobs", JSON.stringify(filesOf(manifest, blobs)) === JSON.stringify({ "a.liquid": "A", "b.liquid": "B", "dup.liquid": "A", "ü.liquid": "ü" }))
    const short = new Map(blobs)
    short.delete(manifest.files[1].sha256)
    check("  and none at all when a blob is missing (the rows are drawn instead)", filesOf(manifest, short) === null)
    check("the readers' rows: live settings, no draft", JSON.stringify(settingsRowOf(manifest)) === JSON.stringify({ settings: { x: 1 }, draft_settings: null }))
    check("  live sections, no draft", pageRowsOf(manifest).every((p) => p.draft_sections === null) && pageRowsOf(manifest)[1].sections !== null)
    const sources = sourcesFromFiles({ "sections/a.storelib": "<section>a</section>", "sections/blank.storelib": "  ", "layout/theme.liquid": "x", "templates/x.json": "{}" })
    check("a builder website's section files from a release: .storelib with text only", Object.keys(sources).join() === "sections/a.storelib")
  }

  console.log("\nGroups of blobs, named by what they hold")
  {
    const many: Record<string, string> = {}
    for (let i = 0; i < 400; i++) many[`assets/f${i}.css`] = `.c${i}{}`.padEnd(5000, " ")
    const one = buildManifest({ settings: {}, pages: [], files: many })
    const groups = blobGroups(one.manifest.files, 200_000)
    const all = groups.flatMap((g) => g.shas)
    check("several groups for a theme over the target", groups.length >= 8, groups.length)
    check("every blob in exactly one group", all.length === one.blobs.size && new Set(all).size === all.length)
    check("a group's key is the sha256 of its members", groups.every((g) => /^[0-9a-f]{64}$/.test(g.key)))
    const changed = buildManifest({ settings: {}, pages: [], files: { ...many, "assets/f7.css": ".changed{}".padEnd(5000, " ") } })
    const after = blobGroups(changed.manifest.files, 200_000)
    const before = new Set(groups.map((g) => g.key))
    const moved = after.filter((g) => !before.has(g.key)).length
    check("one file changed reads its new group again (two at most: where its old and new text fall), not the theme", groups.length === after.length && moved >= 1 && moved <= 2, moved)
    check("a small theme is one group", blobGroups(buildManifest({ settings: {}, pages: [], files: { a: "a", b: "b" } }).manifest.files).length === 1)
    check("groups stop at 256", blobGroups(one.manifest.files, 1).length <= 256)
  }

  console.log("\nA publish written as a release")
  {
    const db = seeded()
    const first = await recordRelease(db, { installId: INSTALL, creatorId: CREATOR })
    check("written, and the website pointed at it", first.ok === true && first.live === true, first)
    const rel = db.rows("site_releases")[0]
    const manifest = readManifest(rel?.manifest)
    check("one release row, of this install and creator", db.rows("site_releases").length === 1 && rel.install_id === INSTALL && rel.creator_id === CREATOR)
    check("its manifest holds the live half, never a draft", !!manifest && JSON.stringify(manifest).includes("#8b5cf6") && !JSON.stringify(manifest).includes("DRAFT") && !JSON.stringify(manifest).includes("not yet") && !JSON.stringify(manifest).includes('"draft"'))
    check("  every live file with text, not the one only drafted", manifest?.files.map((f) => f.path).join() === "assets/base.css,assets/copy.css,layout/theme.liquid,sections/hero.storelib")
    check("the same text in two files is written once", db.rows("theme_file_blobs").length === 3 && first.ok && first.newBlobs === 3)
    check("file count and bytes recorded", rel.file_count === 4 && Number(rel.total_bytes) > 0)
    check("the pointer names it", db.rows("site_live_releases")[0]?.release_id === rel.id)
    const pointer = await readLivePointer(db, CREATOR)
    check("the live pointer reads back as install and release", pointer?.installId === INSTALL && pointer?.releaseId === rel.id, pointer)
    const back = await readReleaseManifest(db, String(rel.id))
    check("the manifest reads back", back?.files.length === 4)
    const blobs = await readBlobs(db, back!.files.map((f) => f.sha256))
    check("its files read back whole from the blobs", JSON.stringify(filesOf(back!, blobs)) === JSON.stringify({ "assets/base.css": "body{color:red}", "assets/copy.css": "body{color:red}", "layout/theme.liquid": "<html>{{ content_for_layout }}</html>", "sections/hero.storelib": "<section>hero</section>" }))

    db.rows("store_theme_custom_files").find((f) => f.path === "sections/hero.storelib")!.content = "<section>hero 2</section>"
    forget(db, INSTALL)
    check("a live change outside Publish lets go of the pointer (the trigger)", (await readLivePointer(db, CREATOR)) === null)
    const second = await recordRelease(db, { installId: INSTALL, creatorId: CREATOR })
    check("the next publish sends only the text that is new", second.ok && second.newBlobs === 1 && db.rows("theme_file_blobs").length === 4, second)
    check("  and points the website at the new release", second.ok && (await readLivePointer(db, CREATOR))?.releaseId === second.releaseId)

    const racing = seeded()
    racing.onRead = (t) => { if (t === "store_theme_pages") forget(racing, INSTALL) }
    const raced = await recordRelease(racing, { installId: INSTALL, creatorId: CREATOR })
    check("a live edit while the release is made: kept, but the website is not pointed at it", raced.ok === true && raced.live === false && racing.rows("site_live_releases")[0]?.release_id === null, raced)

    const corrupt = seeded()
    await recordRelease(corrupt, { installId: INSTALL, creatorId: CREATOR })
    const b = corrupt.rows("theme_file_blobs")[0]
    b.content = `${b.content} tampered`
    let threw = false
    try { await readBlobs(corrupt, [String(b.sha256)]) } catch { threw = true }
    check("a blob that is not what its sha256 says is not served (the read throws, nothing is held)", threw)

    const failing = seeded()
    failing.failing.add("theme_file_blobs")
    const noWrite = await recordRelease(failing, { installId: INSTALL, creatorId: CREATOR })
    check("a failed write is reported, never thrown, and points nothing", noWrite.ok === false && noWrite.reason === "failed" && failing.rows("site_live_releases")[0]?.release_id == null)
  }

  console.log("\nThe newest twenty kept")
  {
    const db = seeded()
    for (let i = 0; i < RELEASES_KEPT + 5; i++) await recordRelease(db, { installId: INSTALL, creatorId: CREATOR })
    const live = db.rows("site_live_releases")[0].release_id
    const removed = await pruneReleases(db, INSTALL)
    const left = db.rows("site_releases")
    check("twenty-five made, five deleted, twenty left", removed === 5 && left.length === RELEASES_KEPT, { removed, left: left.length })
    check("the live one is among them", left.some((r) => r.id === live))
    const oldest = [...left].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
    check("the oldest deleted, not the newest", Number(new Date(String(oldest.created_at))) > 1_700_000_000_000 + 5 * 1000)
    db.rows("site_live_releases")[0].release_id = oldest.id
    for (let i = 0; i < 3; i++) await recordRelease(db, { installId: INSTALL, creatorId: CREATOR })
    db.rows("site_live_releases")[0].release_id = oldest.id
    await pruneReleases(db, INSTALL)
    check("an old release the website is still drawn from is never deleted", db.rows("site_releases").some((r) => r.id === oldest.id))
    check("blobs are left for a job that can take a lock", db.rows("theme_file_blobs").length > 0)
  }

  console.log("\nNo release: the rows, exactly as before")
  {
    resetReleasesMissing()
    const none = seeded()
    check("an install published before releases has no pointer", (await readLivePointer(none, CREATOR)) === null)
    none.rows("site_live_releases").push({ install_id: INSTALL, creator_id: CREATOR, release_id: null, rev: 3 })
    check("  nor one whose pointer was let go", (await readLivePointer(none, CREATOR)) === null)
    none.rows("store_theme_installs")[0].status = "unpublished"
    none.rows("site_live_releases")[0].release_id = "r"
    check("  nor a website taken down", (await readLivePointer(none, CREATOR)) === null)

    const before = new FakeDb()
    before.rows("store_theme_installs").push({ id: INSTALL, creator_id: CREATOR, status: "published", sort_order: 0 })
    for (const t of ["site_releases", "site_live_releases", "theme_file_blobs"]) before.missing.add(t)
    check("part 180 not run is told apart from a failed read", releasesMissing({ code: "PGRST205", message: "" }) && releasesMissing({ code: "42P01", message: "" }) && releasesMissing({ code: "PGRST200", message: "Could not find a relationship" }) && !releasesMissing({ code: "57014", message: "timeout" }))
    const recorded = await recordRelease(before, { installId: INSTALL, creatorId: CREATOR })
    check("before part 180, Publish's release is skipped quietly", recorded.ok === false && recorded.reason === "missing")
    check("  and this server stops asking for a while", releasesKnownMissing())
    const asked = before.calls.length
    check("  the pointer reads as none without asking the database", (await readLivePointer(before, CREATOR)) === null && before.calls.length === asked)
    check("  the cached pointer too, before any cache is asked", (await livePointer(CREATOR, ["published-site:x"])) === null)
    resetReleasesMissing()
    check("the pointer read before part 180 reads as none and is remembered", (await readLivePointer(before, CREATOR)) === null && releasesKnownMissing())
    resetReleasesMissing()
    const down = seeded()
    down.failing.add("store_theme_installs")
    let threw = false
    try { await readLivePointer(down, CREATOR) } catch { threw = true }
    check("a pointer read that failed throws, so it is never held as 'no release'", threw && !releasesKnownMissing())

    const compat = read("lib/website-builder/compat-site.ts")
    check("compat-site: a preview never reads a release", /const release = draft \? null : await liveRelease\(creator\.creatorId, row\.id, siteTags\)/.test(compat))
    check("  the files fall back to the rows when the release cannot be read", compat.includes("(release ? await releaseFiles(release.manifest) : null) ?? liveFiles(admin, row.id, rowsKey)") && compat.includes("rowsHeld.set(heldKey, rows)"))
    check("  without a release, the rows' keys and reads of before", compat.includes("const heldKey = release ? `${row.id}:release:${release.id}` : rowsKey") && compat.includes("const rowsKey = `${row.id}:${version}`") && compat.includes('heldUnless(["compat-pages", row.id, version], siteTags, SITE_HOLD_S, readPages, (v) => v === null)'))
    check("  the theme held on this server is keyed by what it was drawn from", compat.includes("const slot = `${drawnFrom}|${key}`"))
    const published = read("lib/website-builder/published-site.ts")
    check("published-site: keyed by the release when there is one, by the creator alone when not", published.includes('releaseId ? ["published-site", match.creatorId, "release", releaseId] : ["published-site", match.creatorId]'))
    /* Changed on purpose (round 36): the manifest is asked with the install read, and used only for the install published now. */
    check("  only a release of the install published now", published.includes("const manifestPromise = pointer ? releaseManifest(pointer.releaseId) : Promise.resolve(null)") && published.includes("pointer && pointer.installId === row.id ? await manifestPromise : null"))
    /* Changed on purpose (round 36): without a release the rows' files are asked at once (rowsSources); a release that cannot be read still falls back to them. */
    check("  the rows when any of it cannot be read", published.includes("const release = manifest && releaseSources ? manifest : null") && published.includes("const rowsSources = pointer && pointer.installId === row.id ? null : sectionSources(admin as never, row.id)") && published.includes("releaseSources ?? rowsSources ?? sectionSources(admin as never, row.id)"))
    const server = read("lib/website-builder/site-releases-server.ts")
    check("the pointer is the one read under the site's tag, for a minute", /\["site-live-release", creatorId\], \{ tags, revalidate: POINTER_HOLD_S \}/.test(server) && /POINTER_HOLD_S = 60\b/.test(server))
    check("  a manifest and a group of blobs are held for good, by id and by sha256", /\["site-release", releaseId\], \{ revalidate: false \}/.test(server) && /\["theme-blobs", g\.key\], \{ revalidate: false \}/.test(server))
    const route = read("app/api/website-builder/themes/[installId]/publish/route.ts")
    const at = route.indexOf("await recordRelease(admin, { installId, creatorId })")
    check("Publish writes the release after the answer, after the live site is purged", at > route.indexOf("await revalidatePublishedSite(creator.id)") && route.lastIndexOf("after(async () => {", at) > route.indexOf("await revalidatePublishedSite(creator.id)"))
    check("  a release that was not written never fails the Publish", !route.slice(at - 200, at + 400).includes("return NextResponse") && route.slice(at, at + 400).includes("await pruneReleases(admin, installId)"))
    check("  Undo, restore, history and backups are as they were", route.includes('action: "published",') && route.includes('await takeBackup(admin, installId, { label: "Published", source: "publish" })'))
  }

  console.log("\nWhich imported theme pages the CDN may hold")
  {
    const host = "shop.example.com"
    const base: StrangerRequest = { method: "GET", path: "/", query: new URLSearchParams(), cookie: null, accept: "text/html,application/xhtml+xml", contentType: null, requestedWith: null, protectedSite: false, offersLanguage: false }
    const with_ = (o: Partial<StrangerRequest>) => strangerPage({ ...base, ...o })
    check("a stranger's GET of the front page", with_({}))
    check("  HEAD too", with_({ method: "HEAD" }))
    check("  a product, a collection's second page, a policy", with_({ path: "/products/hat" }) && with_({ path: "/collections/all", query: new URLSearchParams("page=2&sort_by=price-ascending") }) && with_({ path: "/policies/refund-policy" }))
    check("  with only analytics cookies", with_({ cookie: "_ga=GA1.1.1; _ga_ABC123=GS1; _gid=x; _fbp=fb.1; sl_lang=fr" }))
    const cookies: [string, string][] = [
      ["the theme's cart", `${CART_COOKIE}=abc`],
      ["a website customer's session", `${sessionCookieName(host)}=s`],
      ["the signed in hint", `${HINT_COOKIE}=1`],
      ["a Storelib session", "sb-abcdefgh-auth-token=base64-x"],
      ["a password pass", `${passCookieName(host)}=p`],
      ["a chosen country", `${COUNTRY_COOKIE}=FR`],
      ["the guest wishlist", `${GUEST_COOKIE}=[]`],
      ["a checkout country", `${CHECKOUT_COUNTRY_COOKIE}=RO`],
      ["a discount code hold", `${HOLD_COOKIE}=h`],
      ["a cookie nobody listed", "whatever=1"],
    ]
    for (const [what, cookie] of cookies) check(`private with ${what} (${cookie.split("=")[0]})`, !with_({ cookie: `_ga=1; ${cookie}` }) && !strangerCookies(cookie))
    for (const path of ["/cart", "/cart/", "/cart.js", "/cart/add.js", "/cart/change", "/checkout", "/account", "/account/login", "/account/orders/1", "/password", "/search", "/search/suggest", "/localization", "/wishlist", "/preview/tok/", "/products/hat.json", "/products.json", "/sitemap.xml", "/~anon~x"])
      check(`private: ${path}`, !with_({ path }) && !strangerAddress(path, new URLSearchParams()))
    check("private: a section rendering request", !with_({ query: new URLSearchParams("section_id=header") }) && !with_({ query: new URLSearchParams("sections=a,b") }))
    check("private: the empty-the-cart link", !with_({ query: new URLSearchParams("sl_cart=clear") }))
    check("private: a POST, and a script's JSON request", !with_({ method: "POST" }) && !with_({ accept: "application/json" }) && !with_({ requestedWith: "XMLHttpRequest" }) && !with_({ contentType: "application/json" }))
    check("private: a website behind a password, pass or none", !with_({ protectedSite: true }))
    check("private: a page the proxy offers a language on (it sets a cookie)", !with_({ offersLanguage: true }))

    const marker = strangerMarker({ host, country: "RO", locale: "fr", market: "eu" })
    check("the marker names the host, country, language and market", marker === "~anon~shop.example.com~RO~fr~eu")
    check("  and reads back exactly", JSON.stringify(readStrangerMarker(marker!)) === JSON.stringify({ host, country: "RO", locale: "fr", market: "eu" }))
    check("  none of them is the same as another's", strangerMarker({ host, country: null, locale: null, market: null }) === "~anon~shop.example.com~_~_~_" && strangerMarker({ host, country: "US", locale: null, market: null }) !== strangerMarker({ host, country: "GB", locale: null, market: null }))
    check("  a part that cannot be written safely makes no marker (private)", strangerMarker({ host: "a~b", country: null, locale: null, market: null }) === null && strangerMarker({ host, country: "ro", locale: null, market: null }) === null && strangerMarker({ host, country: null, locale: "x~y", market: null }) === null)
    check("  a segment that is not one reads as none", readStrangerMarker("about") === null && readStrangerMarker("~anon~shop.example.com~RO~fr") === null && readStrangerMarker("~anon~SHOP.example.com~RO~fr~eu") === null)
    check("a marked address typed at the API is refused by the proxy", markedThemeAddress(`/api/site-theme/site/andrew/${marker}/about`) && !markedThemeAddress("/api/site-theme/site/andrew/about") && !markedThemeAddress("/about"))

    const page = { method: "GET", status: 200, type: "text/html; charset=utf-8", cacheControl: "private, no-cache", setsCookie: false, changesCart: false }
    check("held: a 200 page of HTML that set no cookie", publicAnswer(page))
    check("not held: one that sets a cookie or changes the cart", !publicAnswer({ ...page, setsCookie: true }) && !publicAnswer({ ...page, changesCart: true }))
    check("not held: the cart, checkout, account and password pages (no-store)", !publicAnswer({ ...page, cacheControl: "private, no-store" }))
    check("not held: a 404, a redirect, JSON, a POST", !publicAnswer({ ...page, status: 404 }) && !publicAnswer({ ...page, status: 303 }) && !publicAnswer({ ...page, type: "application/json" }) && !publicAnswer({ ...page, method: "POST" }))
    check("held by the hold alone, never by a CDN a Publish cannot reach: the browser told what any page of the theme says, the hold told apart by a header never sent on", /* Changed on purpose (tests/publish-shows-new-release.test.ts: a CDN copy showed the previous theme after a Publish). */ PUBLIC_PAGE_CACHE === "private, no-cache" && SHAREABLE_HEADER === "x-storelib-shareable")

    /* A stranger's page, drawn twice, is the same page; a visitor's cart is drawn into it, which is why a cart cookie keeps a page private. */
    const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
    const theme = new CompatTheme({
      "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body>{% if customer %}<a href="/account">{{ customer.email }}</a>{% else %}<a href="/account/login">Sign in</a>{% endif %}<main>{{ content_for_layout }}</main></body></html>`),
      "sections/cart-count.storelib": section("cart-count", `<span class="count">{{ cart.item_count }}</span>`),
    }, {}, { assetUrl: (n) => `/a/${n}` })
    const card = { id: "00000000-0000-4000-8000-000000000001", settings: { title: "Hat", price: "$10.00", url: "/products/hat", slug: "hat", available: true } }
    const site: SiteData = { creatorId: "c0ffee00-0000-4000-8000-000000000000", theme, pages: { home: [{ id: "cc", type: "cart-count" }] }, products: [card as never], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host }
    const ask = (cart: { k: string; p: string; v: null; q: number }[], account?: unknown) => answer(site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart, account: account as never })
    const a = await ask([])
    const b = await ask([])
    check("a stranger's front page drawn twice is the same page", a.body === b.body)
    check("  and it is the kind the CDN may hold", publicAnswer({ method: "GET", status: a.status, type: a.type, cacheControl: a.headers?.["Cache-Control"] ?? null, setsCookie: (a.cookies ?? []).length > 0, changesCart: a.cart !== undefined }), a.headers)
    check("  with nothing of a visitor's in it: an empty cart, signed out, no token", /<span class="count">0<\/span>/.test(String(a.body)) && String(a.body).includes("Sign in") && !/csrf|authenticity_token|sl_theme_cart|__Host-/i.test(String(a.body)))
    const carted = await ask([{ k: "l1", p: card.id, v: null, q: 3 }])
    check("a visitor's cart is drawn into the page (so a cart cookie keeps it private)", /<span class="count">3<\/span>/.test(String(carted.body)) && carted.body !== a.body)
    const signedIn = await ask([], { customer: { email: "ana@example.com", firstName: "Ana", orders: [] } })
    check("  and a signed in customer (so a session cookie does too)", String(signedIn.body).includes("ana@example.com"))
    const cart = await answer(site, { method: "GET", path: "/cart", query: new URLSearchParams(), body: null, cart: [] })
    check("the cart page is never held, even empty", !publicAnswer({ method: "GET", status: cart.status, type: cart.type, cacheControl: cart.headers?.["Cache-Control"] ?? null, setsCookie: false, changesCart: cart.cart !== undefined }), cart.headers)
    const clear = await answer(site, { method: "GET", path: "/", query: new URLSearchParams("sl_cart=clear"), body: null, cart: [] })
    check("nor the empty-the-cart link, which sets the cart", !publicAnswer({ method: "GET", status: clear.status, type: clear.type, cacheControl: clear.headers?.["Cache-Control"] ?? null, setsCookie: false, changesCart: clear.cart !== undefined }))

    const handler = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("the handler reads no cookie for a marked request", handler.includes("const cookie = stranger ? undefined :") && handler.includes("token || stranger || !page ? undefined : await siteAccountOf("))
    check("  draws the country from the marker, never a cookie", handler.includes("siteVisitorCountry({ chosen: null, told: stranger.country, seen: null })"))
    check("  refuses a marker for another host, or one whose language, market or country the proxy did not name", handler.includes("if (stranger.host !== host || told(SITE_LOCALE_HEADER) !== stranger.locale || told(SITE_MARKET_HEADER) !== stranger.market || told(SITE_COUNTRY_HEADER) !== stranger.country) {"))
    check("  and sends the public header only for a plain page", /if \(stranger && !ajax && publicAnswer\(/.test(handler))
    const proxy = read("proxy.ts")
    check("the proxy marks a stranger's page, and refuses a marked address typed at the API", proxy.includes("strangerMarker({ host: siteHostOf(request.headers), country, locale, market })") && proxy.includes("if (markedThemeAddress(pathname)) return new NextResponse"))
    check("  a website with a password is never marked", proxy.includes("protectedSite = gate.protected") && proxy.includes("    protectedSite,\n"))
    check("  the front page says its own header, over next.config's landing page rule", proxy.includes('if (asked === "/" && page === "/") r.headers.set("Cache-Control", marker ? PUBLIC_PAGE_CACHE : "private, no-cache")'))
  }

  console.log("\nThe SQL part")
  {
    const RN = "supabase/sql/run-now"
    const sql = read(`${RN}/180_site_releases.sql`)
    const lines = sql.trimEnd().split("\n")
    check("one statement per line, a closed note first, the API reloaded last", lines[0].startsWith("/* ") && lines[0].endsWith("*/") && lines.at(-1) === "notify pgrst, 'reload schema';" && lines.slice(1).every((l) => l.trim().endsWith(";")))
    check("the three tables, made only if missing", ["theme_file_blobs", "site_releases", "site_live_releases"].every((t) => sql.includes(`CREATE TABLE IF NOT EXISTS public.${t} (`)))
    check("a blob is keyed by its sha256, checked as one", sql.includes("sha256 text PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$')"))
    check("a release: id, creator, install, when, manifest", /site_releases \(id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\), creator_id uuid NOT NULL, install_id uuid NOT NULL REFERENCES public\.store_theme_installs\(id\) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now\(\), manifest jsonb NOT NULL/.test(sql))
    check("the pointer: one per install, let go if its release is deleted", sql.includes("install_id uuid PRIMARY KEY REFERENCES public.store_theme_installs(id) ON DELETE CASCADE") && sql.includes("release_id uuid REFERENCES public.site_releases(id) ON DELETE SET NULL") && sql.includes("rev bigint NOT NULL DEFAULT 0"))
    check("server only: row level security on and nothing for the public key or a signed in user", ["theme_file_blobs", "site_releases", "site_live_releases"].every((t) => sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && sql.includes(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`)) && !/CREATE POLICY|GRANT /i.test(sql))
    check("a notice, not an error, where the theme tables are not there", (sql.match(/RAISE NOTICE 'part 180:/g) ?? []).length >= 5 && !/RAISE EXCEPTION/.test(sql))
    check("the trigger runs as its owner, so a creator's own save through the API can clear the pointer", /FUNCTION public\.site_live_release_forget\(\) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp/.test(sql) && sql.includes("REVOKE ALL ON FUNCTION public.site_live_release_forget() FROM PUBLIC, anon, authenticated;"))
    check("  on the live columns only: a draft save never fires it", sql.includes("UPDATE OF content, path, install_id ON public.store_theme_custom_files") && sql.includes("UPDATE OF settings, install_id ON public.store_theme_settings") && sql.includes("UPDATE OF sections, page_key, install_id ON public.store_theme_pages") && !/UPDATE OF [^O]*draft/.test(sql))
    check("  a change to nothing, or an empty draft-only file, leaves the pointer", sql.includes("NEW.content IS NOT DISTINCT FROM OLD.content") && sql.includes("NEW.settings IS NOT DISTINCT FROM OLD.settings") && sql.includes("coalesce(NEW.content, '') = ''"))
    check("  once per website per transaction, however many files a publish moves", sql.includes("set_config('storelib.release_forgot'"))
    check("safe to run twice: every trigger dropped before it is made, every object made if missing", (sql.match(/DROP TRIGGER IF EXISTS site_live_release_forget ON/g) ?? []).length === 3 && !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && !/CREATE INDEX (?!IF NOT EXISTS)/.test(sql))
    check("changes no existing row", !/^\s*(UPDATE|DELETE|INSERT)\b/im.test(sql.split("\n").filter((l) => !l.includes("$f$")).join("\n")))
    const migrations = (await import("node:fs")).readdirSync("supabase/migrations").map((f) => read(`supabase/migrations/${f}`))
    check("a byte for byte copy in migrations", migrations.includes(sql))
    check("its README row and its column in the check after", read(`${RN}/README.md`).includes("| `180_site_releases.sql` |") && /as p180_site_releases[,;]/.test(read(`${RN}/99_check_after.sql`)))
    check("in the files the owner runs", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 180_site_releases.sql"))
    check("Undo, restore, history and backups untouched", !/theme_publish_history|store_theme_backups/.test(sql))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main().catch((e) => { console.error(e); process.exit(1) })
