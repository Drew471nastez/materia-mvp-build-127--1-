/**
 * ===========================================================================
 *  A STORELIB SITE LINKED TO A GITHUB REPOSITORY
 * ===========================================================================
 * Storelib writes a site's section files into a repository; Claude Code,
 * Codex or a person edits them and pushes; each push to the linked branch is
 * compiled and saved to the site as a draft, and an open builder shows it.
 *
 * What this pins:
 *   the webhook     signed by GitHub or refused, compared in constant time
 *   the connect     a signed, expiring state; the installation proved to be
 *                   the person's own before anything is stored
 *   the push        which files it changed, where they live, what is ignored
 *   the save        through the one save every editor uses, as a draft
 *   the loop        Storelib's own commits are not synced back
 *   the table       no token stored; creators read, only the server writes
 */
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { githubStatus } from "@/components/website-builder/github-sync-panel"

import {
  COMMIT_MARKER,
  MAX_FILES_PER_PUSH,
  STATE_TTL_MS,
  CLAUDE_MD,
  agentsGuide,
  branchOf,
  changedFiles,
  changedFromCompare,
  isOwnPush,
  normalizeRoot,
  pushedBy,
  repoPathFor,
  signState,
  statusLine,
  themePathFor,
  validBranch,
  validRepoName,
  verifySignature,
  verifyState,
} from "@/lib/github-sync/core"
import { changesFor, describeChange } from "@/lib/github-sync/core"
import { themeFiles, gitBlobSha, roleOf, readsBack } from "@/lib/github-sync/layout"
import { syncCompatFile } from "@/lib/storelib-theme/compat/schema-sync"
import { travels } from "@/lib/github-sync/mirror"
import { wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

function main() {
  console.log("\nThe webhook is GitHub's or it is refused")

  const secret = "whsec_test"
  const body = JSON.stringify({ ref: "refs/heads/main" })
  const good = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  check("GitHub's signature over the exact bytes passes", verifySignature(body, good, secret))
  check("one changed byte fails", !verifySignature(body + " ", good, secret))
  check("another secret fails", !verifySignature(body, good, "other"))
  check("no header fails", !verifySignature(body, null, secret))
  check("the old sha1 header is not accepted", !verifySignature(body, good.replace("sha256=", "sha1="), secret))
  check("and with no secret set, nothing passes", !verifySignature(body, good, undefined) && !verifySignature(body, good, ""))
  check("a signature of the wrong length is refused, not thrown on", !verifySignature(body, "sha256=abc", secret))

  const hook = read("app/api/github/webhook/route.ts")
  check("the route checks the signature before it parses the body",
    hook.indexOf("verifySignature(") > 0 && hook.indexOf("verifySignature(") < hook.indexOf("JSON.parse(raw)"))
  check("reading the raw text, since parsed JSON would not be the bytes GitHub signed", /await req\.text\(\)/.test(hook))
  check("it answers before the work, which runs after the response", /after\(async \(\) =>/.test(hook) && /status: 202/.test(hook))
  check("and logs counts, never file text or tokens", !/console\.\w+\([^)]*source/.test(hook) && !/console\.\w+\([^)]*token/i.test(hook))
  check("an uninstalled app unlinks every site it served", /event === "installation" && body\.action === "deleted"/.test(hook))
  check("a repository taken away unlinks the sites on it", /installation_repositories/.test(hook) && /repositories_removed/.test(hook))

  console.log("\nConnecting: the state and the proof")

  const now = 1_800_000_000_000
  const state = signState({ installId: "11111111-1111-1111-1111-111111111111", creatorId: "c1" }, "k", now)
  const back = verifyState(state, "k", now + 1000)
  check("a state signed here reads back", back?.installId === "11111111-1111-1111-1111-111111111111" && back?.creatorId === "c1")
  check("it expires", verifyState(state, "k", now + STATE_TTL_MS + 1) === null)
  check("another key does not read it", verifyState(state, "k2", now) === null)
  const [payload, sig] = state.split(".")
  const forged = Buffer.from(JSON.stringify({ installId: "someone-elses", creatorId: "c1", exp: now + 60_000, nonce: "x" })).toString("base64url")
  check("a payload swapped under the same signature fails", verifyState(`${forged}.${sig}`, "k", now) === null)
  check("and junk fails without throwing", verifyState("a.b.c", "k", now) === null && verifyState("", "k", now) === null && verifyState(null, "k", now) === null)
  check("a state carries no secret: only ids the creator already owns", !/secret|token/i.test(Buffer.from(payload, "base64url").toString()))

  const setup = read("app/api/github/setup/route.ts")
  check("the setup page checks the signed-in creator is the one who started", /own\.creatorId !== state\.creatorId/.test(setup))
  check("and proves the GitHub user can reach the installation before storing it",
    setup.indexOf("userCanReachInstallation(") > 0 && setup.indexOf("userCanReachInstallation(") < setup.indexOf(".upsert("))
  const gh = read("lib/github-sync/github.ts")
  check("by trading the one-time code and listing that user's installations",
    /login\/oauth\/access_token/.test(gh) && /\/user\/installations/.test(gh))
  check("the app key signs its own JWT, RS256, with nothing but node:crypto",
    /createSign\("RSA-SHA256"\)/.test(gh) && /alg: "RS256"/.test(gh) && !/from "jsonwebtoken"/.test(gh))
  check("and a PEM pasted on one line still works", /replace\(\/\\\\n\/g, "\\n"\)/.test(gh))
  check("no token is kept in memory between requests", !/let\s+\w*[Tt]oken\w*\s*[:=][^;]*\n/.test(gh.replace(/async function[\s\S]*?\n}\n/g, "")))

  const site = read("app/api/website-builder/themes/[installId]/github/route.ts")
  check("a repository is linked only if the installation can reach it",
    /installationRepos\(token\)\)\.find\(/.test(site))
  check("reusing a GitHub account is limited to one this creator already linked",
    /\.eq\("creator_id", own\.creatorId\)\s*\n\s*\.eq\("installation_id", installationId\)/.test(site))
  check("every GitHub route starts from the creator's own site",
    [site, setup, read("app/api/github/connect/route.ts")].every((s) => /ownInstall\(/.test(s)))

  console.log("\nWhat a push changed")

  check("a branch is read from its ref, and a tag is not a branch",
    branchOf("refs/heads/main") === "main" && branchOf("refs/heads/feat/x") === "feat/x" && branchOf("refs/tags/v1") === null)
  const pushed = changedFiles([
    { added: ["sections/faq.storelib", "README.md"], modified: ["sections/hero.storelib"] },
    { removed: ["sections/hero.storelib"], added: ["sections/pricing.storelib"] },
    { modified: ["sections/faq.storelib", "templates/home.json", "sections/Bad Name.storelib"] },
  ], "", (p) => readsBack(roleOf(p, { compat: false })))
  /* Changed on purpose (round Z): the whole theme travels, so a page file is taken too; anything else in the repository is still the owner's. */
  check("theme files are taken, and only those", !pushed.changed.includes("README.md") && pushed.changed.includes("templates/home.json"))
  check("a name the site would refuse is ignored, not tried", !pushed.changed.some((p) => /Bad/.test(p)))
  check("a file changed and then removed in one push is removed", pushed.removed.includes("sections/hero.storelib") && !pushed.changed.includes("sections/hero.storelib"))
  check("and the rest are changed, once each", pushed.changed.sort().join() === "sections/faq.storelib,sections/pricing.storelib,templates/home.json")

  const inFolder = changedFiles([{ added: ["site/sections/faq.storelib", "sections/faq.storelib", "other/sections/x.storelib"] }], "site/")
  check("in a folder, only that folder's sections count", inFolder.changed.join() === "sections/faq.storelib")
  const compared = changedFromCompare([
    { filename: "sections/a.storelib", status: "modified" },
    { filename: "sections/b.storelib", status: "removed" },
    { filename: "sections/c.storelib", status: "renamed", previous_filename: "sections/old.storelib" },
    { filename: "package.json", status: "modified" },
  ], "")
  check("the compare API's list reads the same way, a rename being a removal and an addition",
    compared.changed.join() === "sections/a.storelib,sections/c.storelib" && compared.removed.join() === "sections/b.storelib,sections/old.storelib")

  check("a folder is a plain relative path or the top of the repository",
    normalizeRoot("site") === "site/" && normalizeRoot("/site/") === "site/" && normalizeRoot("") === "" && normalizeRoot(undefined) === "")
  check("and nothing that climbs out of it", normalizeRoot("../x") === "" && normalizeRoot("a/../b") === "" && normalizeRoot("a//b") === "" && normalizeRoot("a b") === "")
  check("paths go both ways", repoPathFor("site/", "sections/faq.storelib") === "site/sections/faq.storelib" && themePathFor("site/", "site/sections/faq.storelib") === "sections/faq.storelib")
  check("a branch name is checked", validBranch("main") && validBranch("feature/new-hero") && !validBranch("../main") && !validBranch("/main") && !validBranch("a b") && !validBranch("x.lock"))
  check("so is a repository name", validRepoName("drew/site") && !validRepoName("drew") && !validRepoName("drew/site/extra") && !validRepoName("../x/y"))

  console.log("\nStorelib's own commits are not synced back")

  check("a push by the app's bot is its own", isOwnPush({ sender: { login: "storelib[bot]" } }, "storelib"))
  check("so is one whose every commit carries the marker", isOwnPush({ commits: [{ message: `Storelib: x\n\n${COMMIT_MARKER}` }] }, "storelib"))
  check("but a person's push with one such commit in it is not", !isOwnPush({ commits: [{ message: COMMIT_MARKER }, { message: "Add FAQ" }] }, "storelib"))
  check("and an empty push is not", !isOwnPush({ commits: [] }, "storelib"))
  check("the builder says who pushed", pushedBy({ pusher: { name: "drew" } }) === "GitHub · drew" && pushedBy({}) === "GitHub")
  check("with nothing from the name that could be markup", !/[<>"]/.test(pushedBy({ pusher: { name: "<img src=x>" } })))

  console.log("\nWhat is written into the repository")

  // Changed on purpose: the repository is the whole theme now, not its section files (tests/github-theme-sync.test.ts runs it end to end).
  const guides = () => ({ readme: "r", agents: agentsGuide({ siteName: "Astrid", branch: "main", root: "" }), claude: CLAUDE_MD })
  const plan = themeFiles(
    { name: "Astrid", compat: false, settings: { a: 1 }, pages: [{ page_key: "home", sections: [{ id: "x", type: "hero", settings: {} }] }], files: { "sections/faq.storelib": "<template/>", "templates/home.json": "{}" }, defaults: { "sections/hero.storelib": "h" } },
    guides,
  ).files
  check("the whole theme: sections, settings and pages, the pages from the builder rather than a saved row",
    plan.filter((f) => /^sections\/.*\.storelib$/.test(f.path)).length === 2 && plan.some((f) => f.path === "config/settings.json") && JSON.parse(plan.find((f) => f.path === "templates/home.json")!.text!).order[0] === "x")
  check("and nothing that is not a theme file: a saved row outside the theme's folders stays out",
    (() => {
      const p = themeFiles({ name: "A", compat: false, settings: {}, pages: [], files: { "package.json": "{}", "blocks/_card.storelib": "b" }, defaults: {} }, guides).files.map((f) => f.path)
      return p.includes("blocks/_card.storelib") && !p.includes("package.json")
    })())
  check("with an AGENTS.md and a CLAUDE.md", plan.some((f) => f.path === "AGENTS.md") && plan.some((f) => f.path === "CLAUDE.md"))
  check("CLAUDE.md pulls in AGENTS.md, so there is one text to keep right", /@AGENTS\.md/.test(CLAUDE_MD))
  const guide = agentsGuide({ siteName: "Astrid", branch: "main", root: "" })
  check("the guide says which branch, and that nothing is live until Publish", /`main`/.test(guide) && /Publish/.test(guide))
  check("and where the full reference is", /storelib\.com\/developers/.test(guide) && /llms-full\.txt/.test(guide))
  check("that a removed file does not remove a section", /Deleting a section file here does not remove/.test(guide))
  check("and has no em dash", !/\u2014/.test(guide))
  check("in a folder, everything is written into it", /repoPathFor|`\$\{root\}\$\{f\.path\}`/.test(read("lib/github-sync/sync.ts")) && repoPathFor("site/", "sections/a.storelib") === "site/sections/a.storelib")
  check("a status line fits GitHub's 140 characters", statusLine("x".repeat(500)).length === 140 && statusLine("  a   b ") === "a b")

  console.log("\nSaving what a push brought")

  const sync = read("lib/github-sync/sync.ts")
  check("through the one save every editor uses: compiled first, a draft, versioned", /saveThemeFile\(db, link\.install_id, f\.path, text\)/.test(sync))
  // Changed on purpose: "the same" is now the same bytes, by git blob sha, against what GitHub and Storelib last agreed on.
  check("a file Storelib already has is skipped, so a redelivered webhook changes nothing",
    /agreed\[f\.path\] === f\.sha \|\| currentSha\.get\(f\.path\) === f\.sha/.test(sync) && /out\.unchanged\.push\(f\.path\)/.test(sync))
  check("what the site has now is read once for the whole push, not once per file",
    /snap = await readSnapshot\(db, link\.install_id/.test(sync) && !/await readFile\(/.test(sync))
  check("sending to GitHub reads the whole theme in one snapshot, not a list and a read each",
    /snap = await readSnapshot\(db, link\.install_id, \{ name: siteName/.test(sync) && !/listFiles\(/.test(sync))
  check("a database's own words never go into a commit status", /publicError\(saved\.status, saved\.error\)/.test(sync))
  /* From round Z's apply.ts, kept when the two whole-theme syncs became one (sync.ts): each kind through the door the builder uses. */
  check("a page through the same cleaning and limits the page save runs", /sanitizeSections\(page\.sections/.test(sync) && /LIMITS\.sectionsPerTemplate/.test(sync) && /blockTreeProblem/.test(sync) && /draft_sections: sections/.test(sync))
  check("the settings through the same cleaning the settings save runs, as a draft", /next = sanitizeThemeSettings\(next\)/.test(sync) && /update\(\{ draft_settings: next \}\)/.test(sync))
  check("Pull fetches only what differs, by Git's own file ids", /known\[path\] === entry\.sha/.test(sync) && /currentShas\(snap, link\)/.test(sync))
  check("an open builder hears about it through the same activity log agents write, a page as a page",
    /from\("theme_agent_activity"\)\.insert\(/.test(sync) && /token_id: null/.test(sync) && /path: `pages\/\$\{page\.page_key\}`/.test(sync) && /replaced: true/.test(sync))
  check("and reads a replaced page or the settings again, keeping an edit not saved yet", /if \(replacedHere\)/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /Your unsaved edit is kept/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  check(`at most ${MAX_FILES_PER_PUSH} files from one push`, /changed\.length > MAX_FILES_PER_PUSH/.test(sync))
  check("the commit gets a Storelib status either way", /setStatus\(token, repo, after/.test(sync) && /context: "Storelib"/.test(gh))
  check("a deleted branch is not a push to sync", /payload\.deleted/.test(sync))
  check("nothing is ever deleted from a site by a push", !/\.delete\(\)/.test(sync))

  console.log("\nThe whole theme, both ways")
  /* Changed on purpose: round Z's tracked()/trackedFor() and W3's layout did the same job; one stayed (lib/github-sync/layout.ts, roleOf). */
  const storelib = { compat: false }
  check("a theme file is read back, and a repository's own files are not",
    ["sections/faq.storelib", "blocks/_card.storelib", "templates/about.json", "sections/header-group.json", "config/settings.json", "assets/base.css", "locales/en.default.json"].every((p) => readsBack(roleOf(p, storelib))) &&
      !["README.md", "package.json", ".github/workflows/x.yml", "sections/Bad Name.storelib", "../x.json"].some((p) => readsBack(roleOf(p, storelib))))
  check("an imported theme's own files are read back under shopify/, and a shopify/ folder in a Storelib theme is the owner's",
    readsBack(roleOf("shopify/layout/theme.liquid", { compat: true })) && roleOf("shopify/layout/theme.liquid", storelib) === "outside")
  check("Git's id for a file's bytes, computed here the way Git computes it", gitBlobSha("hello\n") === "ce013625030ba8dba906f756967f9e9ca394464a" && gitBlobSha("") === "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
  {
    const g = agentsGuide({ siteName: "Maya", branch: "main", root: "", kind: "shopify" })
    check("an imported theme's repository says what it holds and what comes back", /shopify\//.test(g) && /<template compat="shopify">/.test(g) && /schema block/.test(g) && /`main`/.test(g) && /Publish/.test(g) && !/\u2014/.test(g))
  }
  {
    /*
      Changed on purpose (the owner: GitHub and AI schema edits reach the sidebar). Round Z refused an imported
      section's schema from GitHub; now it is taken, and the builder's panel is made again from the theme's own
      schema (lib/storelib-theme/compat/schema-sync.ts). A markup change alone still keeps the file as it was sent.
    */
    const markup = "<div class=\"x\">{{ section.settings.title }}</div>"
    const theirs = { name: "Hero", settings: [{ type: "text", id: "title", label: "Title" }] }
    const stored = `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type: "hero", name: "Hero", settings: [{ type: "text", id: "title", label: "Title" }], shopify: theirs }, null, 2)}\n</schema>\n`
    const ctx = { tr: (v: unknown, f: string) => (typeof v === "string" ? v : f), blockTypes: [] as string[] }
    const same = syncCompatFile("sections/hero.storelib", stored, stored, ctx)
    check("an imported section sent back unchanged is taken as it is", same.ok === true && same.source === stored && !same.rebuilt)
    const marked = stored.replace("class=\"x\"", "class=\"y\"")
    const markOnly = syncCompatFile("sections/hero.storelib", marked, stored, ctx)
    check("a markup change is taken with the settings kept", markOnly.ok === true && markOnly.source === marked && !markOnly.rebuilt)
    const reordered = stored.replace(/<schema>[\s\S]*<\/schema>/, `<schema>${JSON.stringify({ shopify: theirs, settings: [{ label: "Title", id: "title", type: "text" }], name: "Hero", type: "hero" })}</schema>`)
    const spacing = syncCompatFile("sections/hero.storelib", reordered, stored, ctx)
    check("  and key order or spacing in the schema is not a change", spacing.ok === true && !spacing.rebuilt)
    const headline = syncCompatFile("sections/hero.storelib", stored.split("\"Title\"").join("\"Headline\""), stored, ctx)
    check("a settings change is taken, its panel made again from the theme's schema", headline.ok === true && headline.rebuilt && /"label": "Headline"/.test(headline.source) && !/"Title"/.test(headline.source))
    const nope = syncCompatFile("sections/hero.storelib", stored.replace(/<schema>[\s\S]*<\/schema>/, "<schema>{nope</schema>"), stored, ctx)
    check("a schema that is not JSON is said so, with its line", nope.ok === false && /not valid JSON/.test(nope.errors[0].message) && typeof nope.errors[0].line === "number")
  }

  console.log("\nThe table")

  const sql = read("supabase/sql/RUN_GITHUB_SYNC.sql")
  check("the migration and the file to run are the same", sql === read("supabase/migrations/20260923_github_sync.sql"))
  check("it stores no token", !/token/i.test(sql.replace(/--.*$/gm, "")))
  check("row level security is on, and creators can only read", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE INSERT, UPDATE, DELETE ON theme_github_links FROM anon, authenticated/.test(sql) && /FOR SELECT/.test(sql))
  check("it says to run the agent connections file first", /RUN_AGENT_CONNECTIONS\.sql/.test(sql))

  console.log("\nIn the builder")

  const panel = read("components/website-builder/github-sync-panel.tsx")
  {
    const advanced = read("components/website-builder/website-settings/connections.tsx")
    const direct = read("components/website-builder/agent-connections-panel.tsx")
    // Changed on purpose: GitHub is first and marked Recommended, as the owner asked.
    check("Website settings › Connections has GitHub as one line of the list, first and recommended",
      /<GitHubSyncPanel\s+installId=\{ctx\.installId\}/.test(advanced) && (advanced.match(/<GitHubSyncPanel/g) ?? []).length === 1 &&
        advanced.indexOf("<GitHubSyncPanel") < advanced.indexOf('tool="claude"') && /\brecommended\b/.test(advanced))
    check("and the tools that work on a repository are sent to it from their own lines",
      /web: "Codex in ChatGPT"/.test(direct) && /web: "Claude Code on the web"/.test(direct) && /onGitHub=\{\(\) => setOpen\("github"\)\}/.test(advanced))
    check("the GitHub button and a return from GitHub open that line",
      /useState<ConnectionId \| null>\(ctx\.connectVia === "github" \|\| ctx\.githubReturned \? "github" : null\)/.test(advanced))
  }
  check("it says how it works in three steps", /Connect a repository/.test(panel) && /Ask your agent for a change/.test(panel) && /It appears here/.test(panel))
  check("and says so plainly when GitHub is not set up on the server", /GitHub is not switched on for this Storelib yet/.test(panel))
  {
    const said = (s: Parameters<typeof githubStatus>[0], failed = false) => {
      const r = githubStatus(s, failed)
      return [r.status, r.detail, r.action].filter(Boolean).join(" | ")
    }
    const link = { account: "maya", repo: "maya/site", branch: "main", folder: "", lastSyncedAt: null, lastSyncedSha: null, lastError: null, pushOnSave: true, pullOnPush: true }
    check("its line says where GitHub stands, with the one thing to press",
      said({ configured: true, ready: true, link: null }) === "Not connected | Connect" &&
        said({ configured: true, ready: true, link: { ...link, repo: null } }) === "Pick a repository | maya | Continue" &&
        said({ configured: true, ready: true, link }) === "Connected | maya/site | Manage" &&
        said({ configured: true, ready: true, link: { ...link, lastError: "GitHub did not answer" } }) === "Last sync failed | maya/site | Manage" &&
        said({ configured: false, ready: false, link: null }) === "Not switched on for this Storelib yet" &&
        githubStatus(null, false).loading === true && said(null, true) === "Could not check GitHub | Open")
  }
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const button = read("components/website-builder/site-connections.tsx")
  const marks = read("components/website-builder/connection-marks.tsx")
  const rules = read("lib/agent-access/connection-mark.ts")
  check("the top bar shows the connection's own mark, GitHub's when nothing is connected, and opens its path",
    /<ConnectionButton\s+mark=\{connection\}/.test(editor) && /<ConnectionMarkIcon kind=\{mark\.kind\}/.test(button) &&
      /return <GitHubMark className=\{className\} \/>/.test(marks) && /kind: "github",\s*online: false/.test(rules) &&
      /const openGitHub = \(\) => \{\s*openConnections\(\)\s*setConnectVia\("github"\)/.test(editor) &&
      /connection\.kind !== "github" \? openConnections\(\) : openGitHub\(\)/.test(editor))
  check("  with a green dot while it is live, and nothing when nothing is connected",
    /\{mark\.online && <span aria-hidden className="wb-live-dot"/.test(button) && /\.wb-live-dot \{[\s\S]{0,200}background: #10b981/.test(read("app/globals.css")))
  check("  asked with small reads that never call GitHub, and asked again when settings close",
    /recheck: projectSettingsOpen/.test(editor) &&
      (() => {
        const route = read("app/api/website-builder/themes/[installId]/agent-activity/route.ts")
        return /from\("theme_github_links"\)\.select\("repo_full_name, updated_at"\)/.test(route) && !/installationToken|installationRepos|github-sync\/github/.test(route)
      })())
  check("  and a phone reaches it from the menu, by the same mark", /isMobileView\s*\?\s*\[\{\s*label: connection\.online \? connection\.label : "GitHub",\s*icon: <ConnectionMarkIcon kind=\{connection\.kind\}/.test(editor))
  check("and coming back from GitHub opens Connections, then clears the address",
    /settingsSectionFrom\(url\.searchParams\.get\("settings"\)\)/.test(editor) && /history\.replaceState/.test(editor) &&
      /if \(value === "advanced" \|\| value === "agents"\) return "connections"/.test(read("components/website-builder/website-settings/types.ts")))

  console.log("\nBoth ways: the builder's saves reach the repository")

  check("a save becomes a file, a delete a removal, a rename both", (() => {
    const save = changesFor("", { kind: "save", path: "sections/faq.storelib", content: "x" })
    const del = changesFor("site/", { kind: "delete", path: "sections/faq.storelib" })
    const ren = changesFor("", { kind: "rename", from: "sections/a.storelib", to: "sections/b.storelib", content: "y" })
    return save.length === 1 && "content" in save[0] && save[0].path === "sections/faq.storelib"
      && del.length === 1 && "delete" in del[0] && del[0].path === "site/sections/faq.storelib"
      && ren.length === 2 && "delete" in ren[0] && ren[0].path === "sections/a.storelib" && "content" in ren[1] && ren[1].path === "sections/b.storelib"
  })())
  /* Changed on purpose: every theme file travels as itself (W3's travels(), an imported theme's own files too); pages and settings go whole on Push and Publish. */
  check("a theme file travels as itself, a page or the settings never on their own", changesFor("", { kind: "save", path: "templates/home.json", content: "{}" }, travels).length === 0 &&
    changesFor("", { kind: "save", path: "blocks/_card.storelib", content: "b" }, travels).length === 1 && changesFor("", { kind: "save", path: "shopify/assets/base.css", content: "b" }, travels).length === 1 && /changesFor\(root, change, travels\)/.test(read("lib/github-sync/mirror.ts")))
  check("and a publish sends the whole theme", /after\(\(\) => mirrorWholeTheme\(installId, "Published in the builder"\)\)/.test(read("app/api/website-builder/themes/[installId]/publish/route.ts")))
  check("the change is described in words", describeChange({ kind: "rename", from: "sections/a.storelib", to: "sections/b.storelib", content: "" }) === "Renamed a to b in the builder")
  const mirror = read("lib/github-sync/mirror.ts")
  check("only when the site is linked and sends changes", /link\.push_on_save === false\) return/.test(mirror))
  check("marked as Storelib's own, so the push does not come back", /COMMIT_MARKER/.test(mirror))
  check("and a commit that fails is written to the activity list, never failing the save", /direction: "to_github", ok: false/.test(mirror) && !/throw /.test(mirror.replace(/catch \(e\)[\s\S]*$/, "")))
  for (const [where, file] of [
    ["the code editor", "app/api/website-builder/themes/[installId]/files/route.ts"],
    ["Ask AI writing a section", "app/api/website-builder/themes/[installId]/sections/code/route.ts"],
    ["an agent over MCP", "lib/agent-access/bind.ts"],
    ["an agent over HTTP", "app/api/agent/v1/files/route.ts"],
  ] as const) {
    check(`${where} commits after answering`, /after\(\(\) => mirrorToGitHub\(/.test(read(file)))
  }
  check("but a save that came FROM GitHub is not sent back to it", !/mirrorToGitHub/.test(read("lib/github-sync/sync.ts")))
  const files = read("app/api/website-builder/themes/[installId]/files/route.ts")
  check("deleting a shipped section in the builder puts the theme's text back on GitHub, not a hole",
    /typeof shipped === "string" \? \{ kind: "save", path, content: shipped \} : \{ kind: "delete", path \}/.test(files))
  check("a rename carries the unpublished draft, not only what was published", /select\("content, draft_content"\)/.test(files) && /draft_content: existing\.draft_content \?\? null/.test(files))

  console.log("\nSwitches, pull and activity")
  const sync2 = read("lib/github-sync/sync.ts")
  check("a site with incoming changes switched off is left alone", /\(l\) => l\.branch === branch && l\.pull_on_push !== false &&/.test(sync2))
  check("and so is a link made through another installation than the one that sent the push",
    /Number\(l\.installation_id\) === from/.test(sync2) && /const from = Number\(payload\.installation\?\.id\)/.test(sync2))
  check("Pull from GitHub reads the whole branch through the same save loop", /export async function pullNow/.test(sync2) && /listTree\(token/.test(sync2) && /applyFiles\(db, link, snap, read\.incoming, "GitHub"/.test(sync2))
  check("each way is written to the activity list", (sync2.match(/recordEvent\(db/g) ?? []).length >= 3)
  const route = read("app/api/website-builder/themes/[installId]/github/route.ts")
  check("the route takes pull, settings and change-repo", /body\.action === "pull"/.test(route) && /body\.action === "settings"/.test(route) && /body\.action === "change-repo"/.test(route))
  check("and still works on a database that ran the first SQL", /push_on_save\|pull_on_push/.test(route))
  const sql2 = read("supabase/sql/RUN_GITHUB_SYNC.sql")
  check("the SQL adds the switches to an existing table and makes the activity table, read-only to creators",
    /ADD COLUMN IF NOT EXISTS push_on_save/.test(sql2) && /CREATE TABLE IF NOT EXISTS theme_github_events/.test(sql2) && /REVOKE INSERT, UPDATE, DELETE ON theme_github_events/.test(sql2))
  const panel2 = read("components/website-builder/github-sync-panel.tsx")
  check("the panel shows both directions as switches, Pull, Push and what happened lately",
    /Builder to GitHub/.test(panel2) && /GitHub to builder/.test(panel2) && /action: "pull"/.test(panel2) && /status\.events\.map/.test(panel2))
  check("its switch cannot draw outside its track", /absolute left-\[3px\] top-\[3px\] h-4 w-4/.test(panel2) && /translate-x-\[18px\]/.test(panel2))
  const direct = read("components/website-builder/agent-connections-panel.tsx")
  check("a direct connection is the steps left for the tool whose line was pressed, with only its command",
    /<SetupSteps tool=\{tool\} agents=\{agents\} \/>/.test(direct) && /role="radiogroup" aria-label=\{label\}/.test(direct) &&
      /setupCommands\(tool, os, token\)/.test(direct) && /n=\{terminal \? 2 : 1\}/.test(direct) && /<Step n=\{3\}/.test(direct))
  check("the GitHub line is the same three steps while nothing is linked, and acting is step one",
    /<Step n=\{1\} title=\{STEPS\[0\]\[0\]\}>/.test(panel2) && /<Step n=\{3\} title=\{STEPS\[2\]\[0\]\} muted>/.test(panel2) && /\{connectButtons\}/.test(panel2) &&
      /Continue to GitHub/.test(panel2))

  console.log("\nGitHub, safely")
  check("an error that is not GitHub's own, or written for the creator, is not shown as it is",
    /if \(e instanceof SyncError\) return e\.message/.test(route) && !/return e instanceof Error \? e\.message/.test(route))
  check("  including in what a failed commit writes to the activity list", /const why = e instanceof GitHubError \? failureLine\(explainFailure\(e/.test(mirror))
  check("Pull, Push and linking are rate limited per site", /bucket: "github-sync"/.test(route) && /subjects: \[`install:\$\{own\.installId\}`\]/.test(route))
  check("the webhook refuses an oversized body before reading it",
    hook.indexOf('req.headers.get("content-length")') > 0 && hook.indexOf('req.headers.get("content-length")') < hook.indexOf("await req.text()"))
  check("a repository taken from one installation unlinks only that installation's sites",
    /\.eq\("installation_id", installation\)\s*\n\s*\.in\("repo_id", gone\)/.test(hook))
  check("installation tokens are minted per use and never written anywhere",
    !/installation_token|access_token/.test(read("supabase/sql/RUN_GITHUB_SYNC.sql")) && !/\.(insert|update|upsert)\(\{[^)]*\btoken\b\s*:/.test(route + sync2 + mirror))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
