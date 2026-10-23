/**
 * ===========================================================================
 *  THE WHOLE THEME REACHES GITHUB, AND A BRANCH IS PROTECTED ONLY WHEN IT IS
 * ===========================================================================
 * Drew471nastez/materia: an empty, unprotected repository (GitHub's own
 * GET /branches/main said protected: false). storelib[bot] made one commit
 * holding config/settings.json and nothing else, and Storelib said main was
 * protected. The first commit of an empty repository goes through the
 * contents API with one file; the rest of the theme follows in a second
 * commit, and that second one did not land: the send ran out of its minute
 * fetching pictures one at a time, or GitHub turned it down, and a refusal
 * while moving the branch was called "protected" without asking GitHub.
 *
 * Against the in-memory GitHub (tests/_fake-github.ts):
 *   an empty repository   README.md first, then every file, read back
 *   protection            asked of GitHub: protected: false is never
 *                         reported as protected, a ruleset is, by name
 *   push protection       a file with a key is set apart and named; every
 *                         other file lands
 *   time                  a send out of time commits what is ready, says
 *                         what is left, and the next send finishes it
 *   two way               unrelated files in the repository stay, no extra
 *                         branch is made, and a push still comes back
 */
import { generateKeyPairSync } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

import { fakeDb } from "./_fake-db"
import { fakeGitHub } from "./_fake-github"
import { setGitHubTransport, timing, commitChanges, type GitHubConfig } from "@/lib/github-sync/github"
import { SyncError, applyPush, exportSiteReport, type GitHubLink } from "@/lib/github-sync/sync"
import { explainFailure } from "@/lib/github-sync/errors"
import { editorReport } from "@/lib/github-sync/editor-status"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { ASSET_MAP_PATH } from "@/lib/storelib-theme/compat/install"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? `: ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`) }
}

const INSTALL = "11111111-1111-4111-8111-111111111111"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const REPO = "drew471nastez/materia"
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const cfg: GitHubConfig = { appId: "1", privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(), slug: "storelib", clientId: "c", clientSecret: "s", webhookSecret: "w" }
timing.sleep = async () => {}

const PICTURES = Array.from({ length: 12 }, (_, i) => `slide-${String(i).padStart(2, "0")}.jpg`)
const jpeg = (i: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, i, i, i])

async function materia() {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<!doctype html><html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>")
  zip.file("sections/slideshow.liquid", '<div class="slideshow">{{ section.settings.heading }}</div>\n{% schema %}\n{"name":"Slideshow","settings":[{"type":"text","id":"heading","label":"Heading","default":"Hi"}],"presets":[{"name":"Slideshow"}]}\n{% endschema %}')
  zip.file("sections/header.liquid", '<header>{{ shop.name }}</header>\n{% schema %}\n{"name":"Header","settings":[]}\n{% endschema %}')
  zip.file("sections/header-group.json", JSON.stringify({ type: "header", name: "Header group", sections: { header: { type: "header", settings: {} } }, order: ["header"] }))
  zip.file("templates/index.json", JSON.stringify({ sections: { s1: { type: "slideshow", settings: { heading: "Welcome" } } }, order: ["s1"] }))
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Materia", theme_version: "1.0.0" }]))
  zip.file("config/settings_data.json", JSON.stringify({ current: {} }))
  zip.file("locales/en.default.json", JSON.stringify({ general: { hi: "Hi" } }))
  zip.file("assets/base.css", "body{margin:0}")
  zip.file("assets/maps.js", "const maps = 'plain';")
  zip.file("assets/font.woff2", new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 2, 3, 255]))
  const converted = await convertShopifyTheme(zip)
  if (converted.ok === false) throw new Error(converted.error)
  const t = converted.theme
  const map = Object.fromEntries(PICTURES.map((n) => [n, `https://storage.example/${n}`]))
  const files: Record<string, string> = { ...t.files, [ASSET_MAP_PATH]: JSON.stringify(map) }
  const tables = {
    store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "Materia Themes" }],
    store_theme_settings: [{ install_id: INSTALL, settings: t.settings, draft_settings: null }],
    store_theme_pages: t.pages.map((p, i) => ({ id: `p${i}`, install_id: INSTALL, page_key: p.page_key, sections: p.sections, draft_sections: null })),
    store_theme_custom_files: Object.entries(files).map(([path, content]) => ({ install_id: INSTALL, path, content, draft_content: null })),
    theme_github_links: [{ install_id: INSTALL, creator_id: CREATOR, installation_id: 1, account_login: "drew471nastez", repo_id: 9, repo_full_name: REPO, branch: "main", root_path: "", last_synced_sha: null, last_synced_at: null, last_error: null, push_on_save: true, pull_on_push: true, sync_state: {} }],
    theme_github_events: [] as { summary: string; ok: boolean }[],
    theme_agent_activity: [],
    store_theme_file_versions: [],
    store_theme_backups: [],
  }
  return tables
}

const link = (db: ReturnType<typeof fakeDb>) => db.tables.theme_github_links[0] as GitHubLink
const fetched: string[] = []
const fetchMedia = async (url: string) => {
  fetched.push(url)
  const i = PICTURES.findIndex((n) => url.endsWith(n))
  return i >= 0 ? jpeg(i) : null
}

async function main() {
  console.log("\nAn empty repository: README.md first, then the whole theme, read back")
  {
    const tables = await materia()
    const db = fakeDb(tables as never)
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", null)
    const r = await exportSiteReport(db, cfg, link(db), "Materia Themes", { fetchMedia })
    const repo = gh.repos.get(REPO)!
    const paths = Object.keys(gh.filesAt(REPO, "main"))
    const first = gh.calls.find((c) => c.method === "PUT" && /\/contents\//.test(c.path))
    check("the empty repository's first file is README.md, not the settings", !!first && /\/contents\/README\.md$/.test(first.path), first?.path)
    for (const p of ["config/settings.json", "templates/home.json", "sections/slideshow.storelib", "layout/theme.storelib", "shopify/assets/base.css", "shopify/assets/font.woff2", `shopify/assets/${PICTURES[11]}`, "AGENTS.md", "CLAUDE.md", "README.md", "storelib.json"]) {
      check(`  has ${p}`, paths.includes(p))
    }
    check("every file of the theme is on GitHub: sent equals total", r.total > 20 && r.sent === r.total && r.pending === 0 && r.failed.length === 0, JSON.stringify({ total: r.total, sent: r.sent, pending: r.pending }))
    check("two commits, both storelib's own, on main only", repo.refs.size === 1 && repo.refs.has("main") && r.sha === repo.refs.get("main") && repo.commits.get(r.sha!)!.parents.length === 1)
    check("the commit was read back after the branch moved", gh.calls.filter((c) => c.method === "GET" && c.path.includes(`/git/trees/${r.sha}`)).length >= 1)
    const l = link(db)
    check("status: synced, no error, every file's blob kept", l.last_error === null && l.sync_state?.last?.ok === true && Object.keys(l.sync_state?.files ?? {}).length === r.total, l.last_error ?? "")
    check("  the card says synced", editorReport(l as never)?.ok === true)
    check("pictures were fetched a few at a time", fetched.length === PICTURES.length)

    fetched.length = 0
    const again = await exportSiteReport(db, cfg, link(db), "Materia Themes", { fetchMedia })
    check("a second send of an unchanged site is no commit, and pictures are not fetched again", again.sha === null && again.pending === 0 && fetched.length === 0, `${again.sha} ${fetched.length}`)
  }

  console.log("\nProtected only when GitHub says so")
  {
    const tables = await materia()
    const db = fakeDb(tables as never)
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", { "README.md": "x" })
    /* A refusal while moving the branch, on a branch GitHub reports with protected: false. */
    gh.fail({ method: "PATCH", path: /git\/refs\/heads\/main/, status: 403, body: { message: "Resource not accessible by integration" }, headers: { "x-accepted-github-permissions": "contents=write" }, times: 1 })
    let error = ""
    try {
      await exportSiteReport(db, cfg, link(db), "Materia Themes", { fetchMedia: null })
    } catch (e) {
      error = e instanceof SyncError ? e.message : String(e)
    }
    check("a 403 moving an unprotected branch is not called protected", !/protected/i.test(error) && link(db).sync_state?.last?.problem === "no-access", `${error} ${link(db).sync_state?.last?.problem}`)
    check("  GitHub was asked: GET /branches/main and its rules", gh.calls.some((c) => c.method === "GET" && /\/branches\/main$/.test(c.path)) && gh.calls.some((c) => /\/rules\/branches\/main$/.test(c.path)))
    check("  and the fix names the permission", /Contents permission must be Read and write/.test(error), error)

    const unprotected = explainFailure({ status: 422, message: "Repository rule violations found", step: "write-ref", protection: { protected: false, rules: [] } }, { repo: REPO, branch: "main" })
    check("a rule violation on a branch with no rules is not called protected", unprotected.problem !== "branch-protected" && /not protected/.test(unprotected.message), unprotected.message)
    const ruled = explainFailure({ status: 422, message: "Repository rule violations found", step: "write-ref", protection: { protected: false, rules: ["pull_request"] } }, { repo: REPO, branch: "main" })
    check("a ruleset that applies is named", ruled.problem === "branch-protected" && /pull request/.test(ruled.message), ruled.message)
    const bare = explainFailure({ status: 403, message: "Forbidden", step: "write-ref" }, { repo: REPO, branch: "main" })
    check("a bare 403 with nothing asked is no-access, never protected", bare.problem === "no-access", bare.problem)
    const real = explainFailure({ status: 422, message: "Protected branch update failed for refs/heads/main.", step: "write-ref" }, { repo: REPO, branch: "main" })
    check("GitHub's own 'protected branch' still is", real.problem === "branch-protected")

    const gh2 = fakeGitHub()
    setGitHubTransport(gh2.transport)
    gh2.newRepo(REPO, "main", { "README.md": "x" })
    gh2.repos.get(REPO)!.rules.set("main", ["pull_request", "deletion"])
    gh2.fail({ method: "PATCH", path: /git\/refs\/heads\/main/, status: 422, body: { message: "Repository rule violations found\n\nChanges must be made through a pull request." }, times: 1 })
    const db2 = fakeDb((await materia()) as never)
    let error2 = ""
    await exportSiteReport(db2, cfg, link(db2), "Materia Themes", { fetchMedia: null }).catch((e) => { error2 = e.message })
    check("a real ruleset is reported with the rule, and the bypass as the fix", link(db2).sync_state?.last?.problem === "branch-protected" && /pull request/.test(error2) && /bypass/.test(error2), error2)
  }

  console.log("\nPush protection: the file with a key is set apart, the rest lands")
  {
    const tables = await materia()
    const secretRow = tables.store_theme_custom_files.find((r) => r.path === "shopify/assets/maps.js")!
    secretRow.content = "const key = 'sk_live_FAKEFAKEFAKE';"
    const db = fakeDb(tables as never)
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", { "README.md": "x", "notes/todo.md": "the creator's own file" })
    gh.repos.get(REPO)!.secrets = /sk_live_/
    const r = await exportSiteReport(db, cfg, link(db), "Materia Themes", { fetchMedia: null })
    const paths = Object.keys(gh.filesAt(REPO, "main"))
    check("the file with the key is named, and only it", r.failed.length === 1 && r.failed[0].path === "shopify/assets/maps.js", JSON.stringify(r.failed.map((f) => f.path)))
    check("  every other theme file is on GitHub", ["config/settings.json", "templates/home.json", "sections/slideshow.storelib", "shopify/assets/base.css", "AGENTS.md"].every((p) => paths.includes(p)) && !paths.includes("shopify/assets/maps.js"))
    check("  said as secret scanning, never as a protected branch", link(db).sync_state?.last?.problem === "secret-blocked" && !/protected/.test(link(db).last_error ?? ""), link(db).last_error ?? "")
    check("  the card lists the file with what to do", editorReport(link(db) as never)?.files.some((f) => f.path === "shopify/assets/maps.js" && f.url === null) === true)
    check("the creator's own file in the repository stays", paths.includes("notes/todo.md"))
    check("no branch was made", gh.repos.get(REPO)!.refs.size === 1)
    const messages = [...gh.repos.get(REPO)!.commits.values()].filter((c) => c.message.startsWith("Storelib")).map((c) => c.message)
    check("every commit carries Storelib's marker, so none is read back", messages.length > 0 && messages.every((m) => /\[storelib-sync\]/.test(m)))
  }

  console.log("\nOut of time: what is ready is committed, the rest follows")
  {
    const tables = await materia()
    const db = fakeDb(tables as never)
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", { "README.md": "x" })
    const r = await exportSiteReport(db, cfg, link(db), "Materia Themes", { fetchMedia, deadline: Date.now() - 1 })
    check("text lands, blobs wait", !!r.sha && !!gh.filesAt(REPO, "main")["templates/home.json"] && r.pending > 0, JSON.stringify({ sha: r.sha, pending: r.pending }))
    check("  said as files still to send, not as a failure of GitHub", link(db).sync_state?.last?.problem === "partial" && /still to send/.test(link(db).last_error ?? ""), link(db).last_error ?? "")
    check("  the card offers to send again", editorReport(link(db) as never)?.problem?.actions.includes("push") === true)
    const next = await exportSiteReport(db, cfg, link(db), "Materia Themes", { fetchMedia })
    check("the next send finishes it", next.pending === 0 && next.sent === next.total && !!gh.filesAt(REPO, "main")[`shopify/assets/${PICTURES[0]}`] && !!gh.filesAt(REPO, "main")["shopify/assets/font.woff2"], JSON.stringify({ pending: next.pending, sent: next.sent, total: next.total }))
    check("  and the status is synced again", link(db).last_error === null && link(db).sync_state?.last?.ok === true)
  }

  console.log("\nA new repository's first commit, not readable for a moment")
  {
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", null)
    gh.fail({ method: "GET", path: /\/git\/commits\/[0-9a-f]+$/, status: 409, body: { message: "Git Repository is empty." }, times: 1 })
    const r = await commitChanges("t", REPO, "main", [{ path: "README.md", content: "# hi" }, { path: "a.txt", content: "a" }, { path: "b.txt", content: "b" }], "Storelib: test\n\n[storelib-sync]")
    const files = gh.filesAt(REPO, "main")
    check("waited out, and every file is in", !!r.sha && !!files["a.txt"] && !!files["b.txt"] && !!files["README.md"] && r.missing.length === 0)
  }

  console.log("\nTwo way: a push to main after the send still comes back")
  {
    const tables = await materia()
    const db = fakeDb(tables as never)
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", null)
    await exportSiteReport(db, cfg, link(db), "Materia Themes", { fetchMedia })
    const before = gh.repos.get(REPO)!.refs.get("main")!
    const settings = JSON.parse(gh.text(REPO, "main", "config/settings.json")!)
    settings.shopify = { ...(settings.shopify ?? {}), agent_color: "#ff0000" }
    const after = gh.commitFiles(REPO, "main", { "config/settings.json": JSON.stringify(settings, null, 2) }, "Agent: a colour")
    const outcomes = await applyPush(db, cfg, {
      ref: "refs/heads/main", before, after,
      repository: { id: 9, full_name: REPO }, installation: { id: 1 }, sender: { login: "codex" }, pusher: { name: "codex" },
      commits: [{ message: "Agent: a colour", added: [], modified: ["config/settings.json"], removed: [] }],
    } as never)
    check("the agent's settings change is taken into the builder", outcomes[0]?.saved.includes("config/settings.json") === true, JSON.stringify(outcomes[0]))
  }

  console.log("\nSource")
  {
    const errors = readFileSync(join(process.cwd(), "lib/github-sync/errors.ts"), "utf8")
    check("a write-ref 403 alone no longer means protected", !/e\.step === "write-ref" && e\.status === 403\)\)/.test(errors))
    const gh = readFileSync(join(process.cwd(), "lib/github-sync/github.ts"), "utf8")
    check("protection is asked of GitHub's branches and rules endpoints", /\/branches\/\$\{enc\(branch\)\}/.test(gh) && /\/rules\/branches\//.test(gh))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
