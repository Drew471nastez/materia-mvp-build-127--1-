/**
 * ===========================================================================
 *  A PUSH OR AN AGENT'S WRITE IS SOMETHING TO PUBLISH, AND WHAT DIDN'T SYNC IS SAID
 * ===========================================================================
 * Andrew's report: changes pushed from GitHub (Claude Code, Codex) landed in
 * the site, but Publish said "Published" with nothing to press unless
 * something was changed in the editor first, and a file that did not come in
 * was only on the commit on GitHub. Against the in-memory GitHub and
 * database (tests/_fake-github.ts, tests/_fake-db.ts):
 *
 *   drafts       a push writes drafts only, and the server says there is
 *                something to publish whatever page or file it touched
 *   publish      after the drafts are promoted nothing is pending, and the
 *                editor to GitHub direction still works
 *   errors       each file that did not come in, in plain words with the
 *                button that fixes it; a whole push that could not be read
 *                (no access, too many files, branch deleted) kept on the link
 *   branches     a push to another branch is not read, and said
 *   loops        a duplicate delivery and a replay change nothing
 *   deletes      a deleted or renamed file is noted, never silently dropped
 *   agents       an agent's write is a draft the same way
 *   the editor   it reads the server's answer, waits on a conflict, and
 *                publishes the draft without writing a stale copy over it
 */
import { generateKeyPairSync } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import { fakeGitHub } from "./_fake-github"
import { setGitHubTransport, timing, type GitHubConfig } from "@/lib/github-sync/github"
import { applyPush, exportSite, pullNow, type GitHubLink } from "@/lib/github-sync/sync"
import { seenDelivery } from "@/lib/github-sync/deliveries"
import { editorReport, readPending, plainWords, fileOnGitHub, friendlyName } from "@/lib/github-sync/editor-status"
import { promoteFileDrafts } from "@/lib/website-builder/theme-file-drafts"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const INSTALL = "11111111-1111-4111-8111-111111111111"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const REPO = "drew/site"
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const cfg: GitHubConfig = {
  appId: "1",
  privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
  slug: "storelib",
  clientId: "c",
  clientSecret: "s",
  webhookSecret: "w",
}
timing.sleep = async () => {}
const DEFAULT = DEFAULT_THEME_SOURCES as Record<string, string>

function tables(over: Partial<GitHubLink> = {}) {
  return {
    store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "Astrid", status: "published" }],
    /* A live site with nothing waiting: every draft column empty. */
    store_theme_settings: [{ install_id: INSTALL, settings: { brand_name: "Astrid" }, draft_settings: null }],
    store_theme_pages: [
      {
        id: "p-home",
        install_id: INSTALL,
        page_key: "home",
        sections: [
          { id: "header", type: "header", name: "Header", settings: {} },
          { id: "hero-1", type: "hero", name: "Hero", settings: { heading: "Hello" } },
          { id: "footer", type: "footer", name: "Footer", settings: {} },
        ],
        draft_sections: null,
      },
    ],
    store_theme_custom_files: [
      { install_id: INSTALL, path: "sections/my_promo.storelib", content: DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "my_promo"').replace(/"name": "Simple CTA"/, '"name": "My promo"'), draft_content: null, updated_at: "2026-10-01T00:00:00Z" },
    ],
    theme_github_links: [
      {
        install_id: INSTALL,
        creator_id: CREATOR,
        installation_id: 1,
        account_login: "drew",
        repo_id: 99,
        repo_full_name: REPO,
        branch: "main",
        root_path: "",
        last_synced_sha: null,
        last_synced_at: null,
        last_error: null,
        push_on_save: true,
        pull_on_push: true,
        sync_state: {},
        ...over,
      },
    ],
    theme_github_events: [],
    theme_agent_activity: [],
    store_theme_file_versions: [],
    store_theme_backups: [],
    github_webhook_deliveries: [],
  }
}

type Db = ReturnType<typeof fakeDb>
const link = (db: Db) => db.tables.theme_github_links[0] as GitHubLink

async function linked() {
  const gh = fakeGitHub()
  setGitHubTransport(gh.transport)
  gh.newRepo(REPO, "main", { "README.md": "# hi\n" })
  const db = fakeDb(tables())
  await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
  return { gh, db }
}

function payloadFor(gh: ReturnType<typeof fakeGitHub>, before: string, after: string, files: Record<string, unknown>, extra: Record<string, unknown> = {}, branch = "main") {
  return {
    ref: `refs/heads/${branch}`,
    before,
    after,
    repository: { id: 99, full_name: REPO },
    installation: { id: 1 },
    sender: { login: "drew" },
    pusher: { name: "drew" },
    head_commit: { timestamp: new Date().toISOString() },
    commits: [{ message: "Agent change", added: [], modified: Object.keys(files).filter((p) => files[p] !== null), removed: Object.keys(files).filter((p) => files[p] === null) }],
    ...extra,
  }
}

async function push(gh: ReturnType<typeof fakeGitHub>, db: Db, files: Record<string, string | null>, branch = "main") {
  const before = gh.repos.get(REPO)!.refs.get(branch) ?? gh.repos.get(REPO)!.refs.get("main")!
  const after = gh.commitFiles(REPO, branch, files, "Agent change")
  const payload = payloadFor(gh, before, after, files, {}, branch)
  const outcomes = await applyPush(db, cfg, payload)
  return { outcomes, after, payload }
}

const BANNED = /Liquid|Shopify|—|ghs_|stack|at Object\./

async function main() {
  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nA push is a draft, and the server says there is something to publish")
  {
    const { gh, db } = await linked()
    check("a live site with no drafts has nothing pending", (await readPending(db, INSTALL)).any === false)
    const promo2 = DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "promo_two"').replace(/"name": "Simple CTA"/, '"name": "Promo two"')
    /* Only a section file: the page that is open has no draft, which is the case Publish missed. */
    const { outcomes } = await push(gh, db, { "sections/promo_two.storelib": promo2 })
    check("the file is taken", outcomes[0]?.saved.includes("sections/promo_two.storelib"), JSON.stringify(outcomes[0]))
    const row = db.tables.store_theme_custom_files.find((r) => r.path === "sections/promo_two.storelib")!
    check("into the draft half only: nothing went live", row.draft_content === promo2 && row.content === "")
    const home = db.tables.store_theme_pages[0]
    check("the open page has no draft (has_draft alone would say nothing to publish)", home.draft_sections === null)
    const pending = await readPending(db, INSTALL)
    check("but the server says there is something to publish, and why", pending.any && pending.files === 1 && pending.pages.length === 0 && !pending.settings, JSON.stringify(pending))
    const report = editorReport(link(db))!
    check("the report says one file came in from GitHub, by a name a person reads", report.direction === "from_github" && report.taken === 1 && report.takenNames.join() === "promo two" && report.ok)
    check("  with the commit to look at on GitHub", /^https:\/\/github\.com\/drew\/site\/commit\/[0-9a-f]{40}$/.test(report.commitUrl ?? ""))
    check("an open builder is told: a line in the activity log", db.tables.theme_agent_activity.some((a) => a.path === "sections/promo_two.storelib" && a.action === "created"))
    const syncAt = link(db) as GitHubLink & { updated_at?: string }
    check("and the link changed, which the builder's follow reads as sync_at", typeof syncAt.updated_at === "string")

    /* A page and the settings in the same push. */
    const tpl = JSON.parse(gh.text(REPO, "main", "templates/home.json")!)
    tpl.sections["hero-1"].settings.heading = "From Claude"
    const settings = { ...JSON.parse(gh.text(REPO, "main", "config/settings.json")!), brand_name: "Drew Co" }
    await push(gh, db, { "templates/home.json": `${JSON.stringify(tpl, null, 2)}\n`, "config/settings.json": `${JSON.stringify(settings, null, 2)}\n` })
    const p2 = await readPending(db, INSTALL)
    check("a page and the settings are pending too", p2.pages.includes("home") && p2.settings && p2.files === 1, JSON.stringify(p2))
    check("the live page and live settings are untouched until Publish",
      db.tables.store_theme_pages[0].sections.find((s: any) => s.id === "hero-1").settings.heading === "Hello" && db.tables.store_theme_settings[0].settings.brand_name === "Astrid")
    const r2 = editorReport(link(db))!
    check("the report names them as a person would", r2.takenNames.includes("Home page") && r2.takenNames.includes("Theme settings"), r2.takenNames.join())

    /* ── Publish: exactly the drafts go live, then nothing is pending ── */
    console.log("\nPublish takes exactly those changes, and GitHub still hears from the builder after")
    const st = db.tables.store_theme_settings[0]
    st.settings = st.draft_settings
    st.draft_settings = null
    const pg = db.tables.store_theme_pages[0]
    pg.sections = pg.draft_sections
    pg.draft_sections = null
    await promoteFileDrafts(db, INSTALL)
    check("after publishing, the pushed file, page and settings are live", db.tables.store_theme_custom_files.find((r) => r.path === "sections/promo_two.storelib")!.content === promo2 && pg.sections.find((s: any) => s.id === "hero-1").settings.heading === "From Claude" && st.settings.brand_name === "Drew Co")
    check("and nothing is pending", (await readPending(db, INSTALL)).any === false)
    const head = gh.repos.get(REPO)!.refs.get("main")
    const afterPublish = await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null, reason: "Published in the builder" })
    check("the whole-theme send after Publish has nothing new for GitHub: no commit, no loop", afterPublish === null && gh.repos.get(REPO)!.refs.get("main") === head)
    await saveThemeFile(db, INSTALL, "sections/promo_two.storelib", promo2.replace("<style scoped>", "<style scoped>\n/* edited in the builder */"))
    const sent = await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
    check("a builder edit after Publish still goes to GitHub", !!sent && /edited in the builder/.test(gh.text(REPO, "main", "sections/promo_two.storelib") ?? ""))
    const back = await applyPush(db, cfg, payloadFor(gh, head!, sent!, { "sections/promo_two.storelib": "x" }, { sender: { login: "storelib[bot]" } }))
    check("  and its own commit is not read back as a push", back.length === 0)
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nFiles that didn't sync: plain words, a line, a way to fix")
  {
    const { gh, db } = await linked()
    const heroBad = DEFAULT["sections/hero.storelib"].replace("<template>", "<template>\n<div>{{ </div>")
    const { outcomes } = await push(gh, db, {
      "sections/broken.storelib": "<template>\n<div>{{ </div>\n</template>",
      "config/settings.json": "{ not json",
      "sections/hero.storelib": heroBad,
      "sections/ok_one.storelib": DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "ok_one"').replace(/"name": "Simple CTA"/, '"name": "OK one"'),
    })
    const o = outcomes[0]
    check("the good file still came in", o.saved.includes("sections/ok_one.storelib"), JSON.stringify(o.saved))
    check("each bad one has a kind the builder can say in words", o.failed.length >= 2 && o.failed.every((f) => typeof f.kind === "string"), JSON.stringify(o.failed.map((f) => [f.path, f.kind])))
    const r = editorReport(link(db))!
    const broken = r.files.find((f) => f.path === "sections/broken.storelib")
    check("a file with a mistake says so, with an Open in GitHub link to it", !!broken && /mistake/.test(broken.title) && broken.url === `https://github.com/${REPO}/blob/main/sections/broken.storelib` && broken.actions.includes("open"))
    const settingsRow = r.files.find((f) => f.path === "config/settings.json")
    check("bad settings JSON says where", !!settingsRow && /mistake/.test(settingsRow.title))
    const hero = r.files.find((f) => f.path === "sections/hero.storelib")
    check("a built-in edited badly offers Storelib's version back", !hero || hero.actions.includes("reset"), JSON.stringify(hero))
    check("nothing in the builder's words names a template language or a platform, or has an em dash, a token or a trace",
      r.files.every((f) => !BANNED.test(`${f.title} ${f.fix} ${f.detail ?? ""}`)) && r.notes.every((n) => !BANNED.test(n)), JSON.stringify(r.files.map((f) => f.detail)))
    check("the site's version can replace them on GitHub, since nothing from it is still unread", r.canSendSite && !r.problem)
    check("the commit comment still has the developer's own lines", /sections\/broken\.storelib/.test(gh.repos.get(REPO)!.comments.at(-1)?.body ?? ""))
    check("it survives a reload: it is the link's, not the page's", (link(db).sync_state?.last?.failed.length ?? 0) === o.failed.length)

    /* Retry is Pull, which takes the fixed file and clears the list. */
    gh.commitFiles(REPO, "main", { "sections/broken.storelib": DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "broken"').replace(/"name": "Simple CTA"/, '"name": "Fixed"'), "config/settings.json": JSON.stringify({ brand_name: "Fixed" }), "sections/hero.storelib": DEFAULT["sections/hero.storelib"] }, "fix")
    const pulled = await pullNow(db, cfg, link(db), "Astrid")
    check("Try again (Pull) takes the fixed files", pulled.failed.length === 0, JSON.stringify(pulled.failed))
    check("  and the builder's list is clear", editorReport(link(db))!.files.length === 0 && editorReport(link(db))!.ok)
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nA push that could not be read at all is kept, with its fix")
  {
    const { gh, db } = await linked()
    const appliedSha = link(db).last_synced_sha
    const files0 = JSON.stringify(link(db).sync_state?.files)
    gh.installations.delete(1)
    await push(gh, db, { "sections/x.storelib": "x" })
    let r = editorReport(link(db))!
    check("the app removed from GitHub: Reconnect", r.problem?.kind === "installation-gone" && r.problem.actions[0] === "reconnect", JSON.stringify(r.problem))
    check("  and what was applied before is left as it was", link(db).last_synced_sha === appliedSha && JSON.stringify(link(db).sync_state?.files) === files0)
    gh.installations.add(1)

    const many: Record<string, string> = {}
    for (let i = 0; i < 401; i++) many[`snippets/s${i}.storelib`] = `<div>${i}</div>`
    const big = await push(gh, db, many)
    r = editorReport(link(db))!
    check("too many files in one push: Bring them in (Pull)", big.outcomes[0]?.skipped !== undefined && r.problem?.kind === "too-many" && r.problem.actions.includes("pull") && /401 files/.test(r.problem.title), JSON.stringify(r.problem))
    check("  nothing was half taken", !db.tables.store_theme_custom_files.some((f) => f.path === "snippets/s0.storelib"))

    const head = gh.repos.get(REPO)!.refs.get("main")!
    await applyPush(db, cfg, { ...payloadFor(gh, head, "0".repeat(40), {}), deleted: true })
    r = editorReport(link(db))!
    check("the linked branch deleted on GitHub: Send to GitHub or pick another", r.problem?.kind === "branch-deleted" && r.problem.actions.join() === "push,repo", JSON.stringify(r.problem))
    check("every whole problem reads without jargon", !BANNED.test(`${r.problem?.title} ${r.problem?.body}`))

    await saveThemeFile(db, INSTALL, "sections/my_promo.storelib", DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "my_promo"').replace(/"name": "Simple CTA"/, '"name": "My promo, edited"'))
    gh.fail({ method: "PATCH", path: /git\/refs\/heads\/main/, status: 422, body: { message: "Protected branch update failed" }, times: 5 })
    await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null }).catch(() => null)
    r = editorReport(link(db))!
    check("a send the branch's rules refused: Pick repository", r.direction === "to_github" && r.problem?.kind === "branch-protected" && r.problem.actions.includes("repo"), JSON.stringify(r.problem))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nAnother branch, duplicates, deletes and renames")
  {
    const { gh, db } = await linked()
    const draftsBefore = JSON.stringify(db.tables.store_theme_custom_files)
    await push(gh, db, { "sections/feature.storelib": "x" }, "feature")
    check("a push to another branch changes nothing in the site", JSON.stringify(db.tables.store_theme_custom_files) === draftsBefore)
    const r = editorReport(link(db))!
    check("  and is said, with the branch the site follows", r.ignored?.branch === "feature" && r.branch === "main")
    check("  once in the activity list", db.tables.theme_github_events.filter((e) => /A push to feature was not read/.test(e.summary)).length === 1)
    await push(gh, db, { "sections/feature2.storelib": "x" }, "feature")
    check("  not again for the next push to it", db.tables.theme_github_events.filter((e) => /A push to feature was not read/.test(e.summary)).length === 1)

    const delivery = "abcdef12-3456-7890-abcd-ef1234567890"
    check("a webhook delivery is read once", (await seenDelivery(db, delivery)) === false && (await seenDelivery(db, delivery)) === true)
    const promo3 = DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "promo_three"').replace(/"name": "Simple CTA"/, '"name": "Promo three"')
    const first = await push(gh, db, { "sections/promo_three.storelib": promo3 })
    const activity = db.tables.theme_agent_activity.length
    const replay = await applyPush(db, cfg, first.payload)
    check("the same push delivered again changes nothing", replay.length === 0 && db.tables.theme_agent_activity.length === activity)

    /* A rename is a removal and an addition: the new name comes in, the old one is kept and said. */
    const renamed = await push(gh, db, { "sections/my_promo.storelib": null, "sections/my_promo_new.storelib": DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "my_promo_new"').replace(/"name": "Simple CTA"/, '"name": "My promo new"') })
    const o = renamed.outcomes[0]
    check("a renamed file arrives under its new name", o.saved.includes("sections/my_promo_new.storelib"), JSON.stringify(o))
    check("the old one is kept (a page may use it) and the builder says how to remove it",
      db.tables.store_theme_custom_files.some((f) => f.path === "sections/my_promo.storelib") && editorReport(link(db))!.notes.some((n) => /my_promo\.storelib was deleted on GitHub/.test(n)))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nAn agent's write over its key is a draft the same way")
  {
    const db = fakeDb(tables())
    const saved = await saveThemeFile(db, INSTALL, "sections/agent_made.storelib", DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "agent_made"').replace(/"name": "Simple CTA"/, '"name": "Agent made"'))
    check("saved into the draft", saved.ok === true && db.tables.store_theme_custom_files.find((f) => f.path === "sections/agent_made.storelib")?.content === "")
    check("and pending for Publish", (await readPending(db, INSTALL)).files === 1)
    check("the agent's file route saves through the same draft save", /writeSection/.test(read("app/api/agent/v1/files/route.ts")) && /await saveThemeFile\(db, who\.installId, path, source/.test(read("lib/agent-access/operations.ts")))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nWords and links")
  {
    check("tokens, traces and platform names are taken out",
      plainWords("ghs_abcdefghijklmnop failed in Liquid — Shopify theme\n    at Object.<anonymous> (x.ts:1)") === "[hidden] failed in template, theme")
    check("only a plain path becomes a link", fileOnGitHub(REPO, "main", "theme/", "sections/a b.storelib") === "https://github.com/drew/site/blob/main/theme/sections/a%20b.storelib" && fileOnGitHub(REPO, "main", "", "../x") === null && fileOnGitHub("bad repo", "main", "", "x") === null)
    check("friendly names", friendlyName("templates/index.json") === "Home page" && friendlyName("sections/footer-group.json") === "Footer" && friendlyName("shopify/snippets/price-tag.liquid") === "price tag")
    const old = editorReport({ repo_full_name: REPO, branch: "main", root_path: "", last_error: "x", sync_state: { last: { at: "2026-10-01T00:00:00Z", direction: "from_github", commit: null, ok: false, saved: [], notes: [], failed: [{ path: "sections/a.storelib", error: 'sections/a.storelib: this is an imported Shopify theme, so its files start with <template compat="shopify">.' }] } } })!
    check("a problem saved before kinds existed is still told apart and said plainly", old.files[0].title === "Not in this theme's format" && !BANNED.test(JSON.stringify(old.files)))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe editor")
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("reads the server's answer and turns Publish on with it", /useSyncStatus\(installId\)/.test(editor) && /if \(syncStatus\.pending\?\.any\) setUnpublished\(true\)/.test(editor))
    check("every agent or GitHub write marks the site unpublished, whatever page it touched", /if \(events\.length( > 0)?\) setUnpublished\(true\)/.test(editor))
    check("a code editor save does too", /storelib:file-saved[\s\S]{0,200}setUnpublished\(true\)/.test(editor))
    check("asks for the report when the link changes", /onSyncChanged: \(\) => void refreshSync\(\)/.test(editor) && /sync_at/.test(read("app/api/website-builder/themes/[installId]/agent-activity/route.ts")))
    check("an imported theme's own files changed underneath are read again for the canvas", /forgetCompatFiles\(installId\)/.test(read("components/website-builder/compat/compat-canvas.tsx")) && /filesVersion=\{compatFilesVersion\}/.test(editor) && /\[installId, attempt, filesVersion\]/.test(read("components/website-builder/compat/compat-canvas.tsx")))
    check("both changed: autosave waits and the creator picks", /\|\| syncConflict\) return/.test(editor) && /setSyncConflict\(\{ what:/.test(editor) && /Keep mine/.test(read("components/website-builder/github-sync-notice.tsx")) && /Use GitHub's/.test(read("components/website-builder/github-sync-notice.tsx")))
    check("no save goes over GitHub's version unasked: a page switch waits, Save on the way out is a pick",
      /if \(syncConflictRef\.current\) \{\s*if \(!options\.keepMine\)/.test(editor) && /saveDraft\(\{ quiet: true, keepMine: true \}\)/.test(editor) && /const handlePageChange = async[\s\S]{0,1600}if \(syncConflictRef\.current\) \{\s*showNotification/.test(editor))
    check("Publish waits for that choice", /if \(syncConflictRef\.current\) \{\s*showNotification\("Pick which version to keep first"/.test(editor))
    /* Changed on purpose (round 34): the write goes through the draft's queue; with nothing unsaved it only waits for a write on its way, and sends nothing. */
    check("Publish writes the editor's copy only when it has unsaved work, so a push it has not read yet is not overwritten", /if \(isDirtyRef\.current\) \{\s*const written = await deadline\(draftQueue\.save\(snap\)[\s\S]{0,600}\} else \{\s*await within\(draftQueue\.idle\(\), PUBLISH_SAVE_MS, undefined\)\s*\}/.test(editor)) /* Changed on purpose (r51): both waits have an end (PUBLISH_SAVE_MS). */
    check("the buttons go through the GitHub route, which is rate limited per site and checks the owner",
      /\/github`, \{/.test(editor) && /bucket: "github-sync"/.test(read("app/api/website-builder/themes/[installId]/github/route.ts")) && /const own = await ownInstall\(installId\)/.test(read("app/api/website-builder/themes/[installId]/github/route.ts")))
    const status = read("app/api/website-builder/themes/[installId]/sync-status/route.ts")
    check("the status route is the owner's only, rate limited, and never reads a token", /const own = await ownInstall\(installId\)/.test(status) && /rateLimit\(/.test(status) && !/installationToken|private_key|webhookSecret/.test(status))
    const notice = read("components/website-builder/github-sync-notice.tsx")
    const copy = notice.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    check("the notice is a bottom sheet on a phone", /<BottomSheet/.test(notice) && /phone &&/.test(notice))
    check("its words have no em dash and no platform or template language name", !/—|Liquid|Shopify/.test(copy))
    const statusLib = read("lib/github-sync/editor-status.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    const quoted = (statusLib.match(/"[^"\n]*"|`[^`\n]*`/g) ?? []).filter((q) => !/replace|test|RegExp|shopify">|\\b/.test(q))
    check("nor the report's", !quoted.some((q) => /—|Liquid|Shopify/.test(q)), quoted.filter((q) => /—|Liquid|Shopify/.test(q)).join(" | "))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
