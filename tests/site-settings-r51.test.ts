/**
 * ===========================================================================
 *  ROUND 51: WEBSITE SETTINGS, THE NEWSLETTER IN THE CANVAS, THE BLOG
 * ===========================================================================
 * What the owner asked for, held in code. The browser half is in
 * scripts/check-newsletter-canvas-r51.mjs (Materia's newsletter pressed in
 * the real canvas frame) and scripts/check-site-settings-r51.mjs (every
 * screen below, at 390 and 1280).
 *
 *   1. NEWSLETTER   an address on the builder's origin is the canvas page's
 *                   own (origin "null"), so a theme that checks its form
 *                   posts to its own site sends it; a preview link sends
 *   2. LAB TEST     the newest result wins over an answer read after it
 *   3. BACKUPS      Preview: what a restore would change, page by page
 *   4. BLOG         the owner is the default author, live from their profile;
 *                   Written by shows with the photo whenever there is one
 *   5. SCREENS      apps' marks, own database Coming soon, GitHub in one line,
 *                   Team's access only while inviting, domains followed
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { MemoryDb } from "./_journey/postgrest"
import { newestLab } from "@/lib/website-builder/perf-view"
import { previewBackup } from "@/lib/website-builder/backup-preview"
import { createPost, publishPost, saveAuthor } from "@/lib/site-blog/admin"
import { OWNER_AUTHOR_ID, readLivePost, readPublishedCards, siteBlogReadDeps } from "@/lib/site-blog/public-read"
import { CANVAS_REQUESTS } from "@/lib/storelib-theme/compat/canvas-bridge"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n          ${JSON.stringify(detail)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const A = "11111111-1111-4111-8111-111111111111"
const USER = "33333333-3333-4333-8333-333333333333"

function memoryClient(db: MemoryDb): SupabaseClient {
  return createClient("https://journey.supabase.co", "service-role", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: ((input: RequestInfo | URL, init?: RequestInit) => db.handle(new Request(input instanceof Request ? input : String(input), init))) as typeof fetch },
  })
}

async function main() {
  console.log("\n1. The newsletter in the builder's canvas")
  {
    check("the canvas's URL reads an address on the builder's origin as the page's own (\"null\")", /get origin\(\) \{ var o = super\.origin; return pageOrigin === "null" && homeOrigin && o === homeOrigin \? "null" : o; \}/.test(CANVAS_REQUESTS))
    check("  only inside a page with no origin of its own, and only for the builder's origin", /var pageOrigin = location\.origin;/.test(CANVAS_REQUESTS) && /homeOrigin = new NativeURL\(baseUrl\)\.origin/.test(CANVAS_REQUESTS))
    check("  the bridge's own routing reads the real origin", /url = new NativeURL\(raw, baseUrl\)/.test(CANVAS_REQUESTS) && /home = new NativeURL\(baseUrl\)/.test(CANVAS_REQUESTS))
    /* The script still parses as the page runs it. */
    let parses = true
    try { new Function(CANVAS_REQUESTS) } catch { parses = false }
    check("  and the canvas script still parses", parses)
    const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("a preview link's forms send, through the same routes", /submit: async \(kind, payload\) =>/.test(route) && !/submit: token\s*\?/.test(route))
    check("  and the form still has to come from the website's own page", /if \(formPost && !sameOriginForm\(req, hostOf\(req\)\)\) return NextResponse\.json\(\{ error: "Not allowed" \}/.test(route))
    check("  the canvas still sends nothing (designMode)", /site\.designMode === true \? \{ ok: true, status: 200 \}/.test(read("lib/storelib-theme/compat/site.ts")))
  }

  console.log("\n2. Lab test: the newest result stays")
  {
    const old = { ranAt: "2026-10-17T11:30:00Z", n: "old" }
    const fresh = { ranAt: "2026-11-04T14:00:00Z", n: "new" }
    check("a stale answer read after a test does not replace it", newestLab(fresh, old)?.n === "new" && newestLab(old, fresh)?.n === "new")
    check("  one side missing: the other", newestLab(null, fresh)?.n === "new" && newestLab(fresh, null)?.n === "new" && newestLab(null, null) === null)
    const ui = read("components/website-builder/website-settings/performance.tsx")
    check("the tab keeps what it ran and shows the newest per device", /newestLab\(answer\.available \? answer\.lab\.mobile : null, ranLab\.mobile\)/.test(ui) && /setRanLab\(\(was\) => \(\{ \.\.\.was, \[l\.strategy\]: l \}\)\)/.test(ui))
    check("  and the lab card is there even before visitor speed is set up", /\{answer && \(\s*<LabCard/.test(ui))
  }

  console.log("\n3. Backups: Preview")
  {
    const backup = { settings: { a: 1, b: 2 }, pages: [{ page_key: "home", sections: [{ type: "hero" }] }, { page_key: "about", sections: [{ type: "text" }] }, { page_key: "gone", sections: [{ type: "faq" }, { type: "cta" }] }], files: [{ path: "sections/x.storelib", content: "x" }] }
    const current = { settings: { a: 1, b: 3, c: 4 }, pages: [{ page_key: "home", sections: [{ type: "hero2" }] }, { page_key: "about", sections: [{ type: "text" }] }, { page_key: "new", sections: [] }], files: [{ path: "sections/x.storelib", content: "y" }, { path: "sections/y.storelib", content: "z" }] }
    const p = previewBackup(backup, current)
    check("page by page: put back, no change, comes back, kept as it is", p.pages.map((x) => `${x.key}:${x.change}`).join() === "home:changed,about:same,gone:comes back,new:stays", p.pages)
    check("  with each page's section count", p.pages.find((x) => x.key === "gone")?.sections === 2)
    check("  the settings that differ, and the code files of the backup that differ (a file added since stays)", p.settingsChanged === 2 && p.filesChanged === 1, p)
    check("  the same draft: nothing changes", previewBackup(current, current).same === true && p.same === false)
    check("  a backup from before code was kept changes no code", previewBackup({ settings: {}, pages: [] }, current).filesChanged === 0)
    const route = read("app/api/website-builder/themes/[installId]/backups/[backupId]/route.ts")
    check("the preview route: the owner or team, this install's backup only, nothing written", /websiteInstallCaller\(installId\)/.test(route) && /\.eq\("id", backupId\)\s*\.eq\("install_id", installId\)/.test(route) && !/\.(insert|update|delete|upsert)\(/.test(route))
    check("  under the same read limit as the list", /bucket: "site-backups-read"/.test(route))
    const ui = read("components/website-builder/website-settings/backups.tsx")
    check("Back up now holds the editor's draft first and says what it did", /ctx\.onHoldDraft\(true\)/.test(ui) && /Nothing changed since the last backup\./.test(ui) && /skipped: json\.skipped === true/.test(ui))
    check("  a restore still asks first, through settleRestore", /<ConfirmRestore/.test(ui) && /settleRestore\(/.test(ui))
  }

  console.log("\n4. Blog: the author, live")
  {
    const mem = new MemoryDb()
    mem.rows("creators").push({ id: A, user_id: USER, display_name: "Astrid Studio" })
    mem.rows("profiles").push({ id: USER, display_name: "Astrid", avatar_url: "https://cdn.example/astrid.jpg" })
    const db = memoryClient(mem)
    siteBlogReadDeps.db = () => db as never
    siteBlogReadDeps.cached = (fn) => fn()
    const mine = await createPost(db as never, A, USER, { meta: { title: "Linen care" }, blocks: [{ type: "p", html: "Wash cold." }] })
    await publishPost(db as never, A, USER, mine.id, { version: mine.version, mode: "publish" })
    const live = await readLivePost(A, mine.slug)
    check("a post with no author is written by the owner, name and photo from their profile", live?.author?.id === OWNER_AUTHOR_ID && live.author.name === "Astrid" && live.author.avatarUrl === "https://cdn.example/astrid.jpg", live?.author)
    const mara = await saveAuthor(db as never, A, { name: "Mara Ionescu", avatarUrl: "https://cdn.example/mara.jpg" } as never)
    const theirs = await createPost(db as never, A, USER, { meta: { title: "Spring drop", authorId: mara.id }, blocks: [{ type: "p", html: "New." }] })
    await publishPost(db as never, A, USER, theirs.id, { version: theirs.version, mode: "publish" })
    const cards = await readPublishedCards(A)
    const card = cards.find((c) => c.id === theirs.id)
    check("  an author written in Blog keeps their own name and photo (the override)", card?.author?.name === "Mara Ionescu" && card.author.avatarUrl === "https://cdn.example/mara.jpg", card?.author)
    mem.rows("profiles").splice(0)
    const noProfile = (await readPublishedCards(A)).find((c) => c.id === mine.id)
    check("  without a profile, the store's name; never a failed blog", noProfile?.author?.name === "Astrid Studio", noProfile?.author)
    const article = DEFAULT_THEME_SOURCES["sections/main_article.storelib"]
    check("the article shows Written by with the photo whenever it has an author, bio or not", /\{% if settings\.show_author_bio and article\.author %\}\s*<aside class="a__bio/.test(article) && /\{% if article\.author\.bio %\}<p class="a__bio-about">/.test(article))
    check("  and the generated sources match the .storelib file", article === read("themes/default/sections/main_article.storelib"))
    const panel = read("components/website-builder/website-settings/blog/post-panel.tsx")
    check("post settings: the owner is the first author, a category is made in place", /<option value="">\{ownerName \|\| tt\("No author"\)\}<\/option>/.test(panel) && /createCategory\(installId, \{ name \}\)/.test(panel) && /set\(\{ categoryId: made\.id \}\)/.test(panel))
    const blog = read("components/website-builder/website-settings/blog.tsx")
    const editor = read("components/website-builder/website-settings/blog/post-editor.tsx")
    check("New post opens the writer from the post it just made, no second read", /setOpened\(\{ post, overview \}\)/.test(blog) && /opened && opened\.post\.id === postId \? \{ kind: "ready"/.test(editor))
    check("  and the writer's code is fetched while the list is read", /requestIdleCallback/.test(blog) && /loadWriter\(\)\.catch/.test(blog))
    const list = read("components/website-builder/website-settings/blog/post-list.tsx")
    check("the list: category, tag, author and order folded under Filters; none of it with no posts", /<Reveal open=\{moreShown\} data-blog-more="">/.test(list) && /const showFilters = !noPostsAtAll/.test(list))
  }

  console.log("\n5. The other screens")
  {
    const apps = read("components/website-builder/website-settings/apps.tsx")
    check("Apps: each mark is the dashboard's (Storelib's tile, a logo, its initial if it fails)", /<Mark item=\{\{ id: i\.id, name: i\.name, logo: i\.logo \?\? null \}\} size=\{28\} \/>/.test(apps) && !/<img/.test(apps))
    const db = read("components/website-builder/website-settings/own-database.tsx")
    check("Your own database: Coming soon, nothing to press, nothing asked or written", /Coming soon/.test(db) && !/<button|<input|onClick|fetch\(|onSettingChange|startConnect/.test(db))
    const gh = read("components/website-builder/github-sync-panel.tsx")
    check("GitHub: one line before a repository; branch and folder folded", /\{tt\(SETUP_LINE\)\}/.test(gh) && /<details className="group\/more" data-github-more="">/.test(gh) && !/<Steps>/.test(gh))
    const team = read("components/app/settings/team-panel.tsx")
    check("Team: What they can do only while inviting", /const choosing = !full && !!cleanEmail && !emailProblem/.test(team) && /<Reveal open=\{choosing\}/.test(team))
    check("  and the invite still needs at least one", /access\.length === 0/.test(team))
    const domains = read("components/website-builder/website-settings/domains.tsx")
    check("Domains: a certificate being issued is checked again every 12 seconds while in front", /window\.setInterval\(tick, 12000\)/.test(domains) && /document\.visibilityState !== "visible"/.test(domains) && /checkRef\.current\(d, true\)/.test(domains))
    check("  in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/site-settings-r51.test.ts"'))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
