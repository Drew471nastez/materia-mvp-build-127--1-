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
  exportPlan,
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
import { changesFor, describeChange, gitBlobSha, shopifyGuide, tracked, trackedFor, fileName } from "@/lib/github-sync/core"
import { compatFromLiquid, liquidParts } from "@/lib/github-sync/apply"
import { exportShopifyTheme } from "@/lib/storelib-theme/compat/export"
import { wrapCompatTemplate } from "@/lib/storelib-theme/compat/theme"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

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
  ], "")
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

  const plan = exportPlan(
    [{ path: "sections/faq.storelib", source: "<template/>" }, { path: "templates/home.json", source: "{}" }, { path: "sections/hero.storelib", source: "h" }],
    { siteName: "Astrid", branch: "main", root: "" },
  )
  /* Changed on purpose (round Z): pages, settings and blocks go too, as "Export theme" lays them out. */
  check("the site's whole theme, and nothing that is not a theme file", plan.filter((f) => f.path.startsWith("sections/")).length === 2 && plan.some((f) => f.path === "templates/home.json") &&
    exportPlan([{ path: "README.md", source: "x" }, { path: "config/settings.json", source: "{}" }, { path: "blocks/_card.storelib", source: "b" }], { siteName: "A", branch: "main", root: "" }).map((f) => f.path).join() === "blocks/_card.storelib,config/settings.json,AGENTS.md,CLAUDE.md")
  check("with an AGENTS.md and a CLAUDE.md", plan.some((f) => f.path === "AGENTS.md") && plan.some((f) => f.path === "CLAUDE.md"))
  check("CLAUDE.md pulls in AGENTS.md, so there is one text to keep right", /@AGENTS\.md/.test(CLAUDE_MD))
  const guide = agentsGuide({ siteName: "Astrid", branch: "main", root: "" })
  check("the guide says which branch, and that nothing is live until Publish", /`main`/.test(guide) && /Publish/.test(guide))
  check("and where the full reference is", /storelib\.com\/developers/.test(guide) && /llms-full\.txt/.test(guide))
  check("that a removed file does not remove a section", /Deleting a section file here does not remove/.test(guide))
  check("and has no em dash", !/\u2014/.test(guide))
  check("in a folder, everything is written into it", exportPlan([{ path: "sections/a.storelib", source: "" }], { siteName: "A", branch: "main", root: "site/" }).every((f) => f.path.startsWith("site/")))
  check("a status line fits GitHub's 140 characters", statusLine("x".repeat(500)).length === 140 && statusLine("  a   b ") === "a b")

  console.log("\nSaving what a push brought")

  const sync = read("lib/github-sync/sync.ts")
  const apply = read("lib/github-sync/apply.ts")
  const snapshot = read("lib/github-sync/snapshot.ts")
  /* Changed on purpose (round Z): the save loop moved to lib/github-sync/apply.ts, and the site is read as one snapshot (snapshot.ts). */
  check("a section or block goes through the one save every editor uses: compiled first, a draft, versioned", /saveThemeFile\(db, installId, path, source\)/.test(apply))
  check("a page through the same cleaning and limits the page save runs", /sanitizeSections\(page\.sections/.test(apply) && /LIMITS\.sectionsPerTemplate/.test(apply) && /blockTreeProblem/.test(apply) && /draft_sections: sections/.test(apply))
  check("the settings through the same cleaning the settings save runs, as a draft", /sanitizeThemeSettings\(value/.test(apply) && /update\(\{ draft_settings: clean \}\)/.test(apply))
  check("a file the site already has is skipped, so a redelivered webhook changes nothing",
    /snap\.files\[path\] === source/.test(apply) && /out\.unchanged\.push\(path\)/.test(apply))
  check("what the site has now is read once for the whole push, as one snapshot", /snap = await siteSnapshot\(db, link\.install_id\)/.test(sync) && /Promise\.all\(\[/.test(snapshot))
  check("sending to GitHub writes the snapshot, drafts first, as the builder shows it", /siteSnapshot\(db, link\.install_id\)/.test(sync) && /draft_settings \?\? settingsRow\?\.settings/.test(snapshot) && /installFiles\(db as never, installId, true\)/.test(snapshot))
  check("Pull fetches only what differs, by Git's own file ids", /gitBlobSha\(snap\.files\[p\]\) !== tree\.blobs\.get/.test(sync))
  check("a database's own words never go into a commit status", /publicError\(saved\.status, saved\.error\)/.test(apply))
  check("an open builder hears about it through the same activity log agents write, a page as a page",
    /from\("theme_agent_activity"\)\.insert\(/.test(apply) && /token_id: null/.test(apply) && /path: `pages\/\$\{page\.page_key\}`/.test(apply) && /replaced: true/.test(apply))
  check("and reads a replaced page or the settings again, keeping an edit not saved yet", /if \(replacedHere\)/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /Your unsaved edit is kept/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  check(`at most ${MAX_FILES_PER_PUSH} files from one push`, /changed\.length > MAX_FILES_PER_PUSH/.test(sync))
  check("the commit gets a Storelib status either way", /setStatus\(token, repo, after/.test(sync) && /context: "Storelib"/.test(gh))
  check("a deleted branch is not a push to sync", /payload\.deleted/.test(sync))
  check("nothing is ever deleted from a site by a push", !/\.delete\(\)/.test(sync) && !/\.delete\(\)/.test(apply))

  console.log("\nThe whole theme, both ways")
  check("a theme file is tracked, and a repository's own files are not",
    ["sections/faq.storelib", "blocks/_card.storelib", "templates/about.json", "sections/header-group.json", "config/settings.json", "layout/theme.liquid", "assets/base.css", "locales/en.default.json"].every(tracked) &&
      !["README.md", "package.json", ".github/workflows/x.yml", "sections/Bad Name.storelib", "../x.json"].some(tracked))
  check("a Storelib site reads Storelib files back, an imported one its own folders",
    trackedFor("storelib", "templates/home.json") && !trackedFor("storelib", "layout/theme.liquid") && trackedFor("shopify", "layout/theme.liquid") && !trackedFor("shopify", "sections/faq.storelib"))
  check("Git's id for a file's bytes, computed here the way Git computes it", gitBlobSha("hello\n") === "ce013625030ba8dba906f756967f9e9ca394464a" && gitBlobSha("") === "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")
  check("a file reads by its name in a summary", fileName("templates/about.json") === "about" && fileName("sections/faq.storelib") === "faq" && fileName("snippets/price.liquid") === "price")
  {
    const g = shopifyGuide({ siteName: "Maya", branch: "main", root: "" })
    check("an imported theme's repository says what it holds and what comes back", /layout\//.test(g) && /\{% schema %\}/.test(g) && /`main`/.test(g) && /Publish/.test(g) && !/\u2014/.test(g))
    check("and its AGENTS.md is that guide", exportPlan([], { siteName: "Maya", branch: "main", root: "", kind: "shopify" }).find((f) => f.path === "AGENTS.md")?.content === g)
  }
  {
    /* An imported section, exported to the repository and brought back unchanged, is the same stored file, byte for byte. */
    const markup = "<div class=\"x\">{{ section.settings.title }}</div>\n<template><p>t</p>\n</template>"
    const theirs = { name: "Hero", settings: [{ type: "text", id: "title", label: "Title" }] }
    const stored = `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ name: "Hero", settings: [{ type: "text", id: "title", label: "Title" }], shopify: theirs }, null, 2)}\n</schema>\n`
    const exported = exportShopifyTheme({ "sections/hero.storelib": stored }, { shopify: { renamed: {} } }, {}).files["sections/hero.liquid"] as string
    const back = compatFromLiquid("sections/hero.liquid", stored, exported)
    check("an imported section goes to GitHub and comes back the same file", back.ok === true && back.content === stored)
    const edited = compatFromLiquid("sections/hero.liquid", stored, exported.replace("class=\"x\"", "class=\"y\""))
    check("a markup change comes back with the settings kept", edited.ok === true && edited.content.includes("class=\"y\"") && edited.content.endsWith(stored.slice(stored.indexOf("</template>\n\n<schema>") + "</template>\n".length)))
    const schemaChanged = compatFromLiquid("sections/hero.liquid", stored, exported.replace("\"Title\"", "\"Headline\""))
    check("a settings change is refused and said so", schemaChanged.ok === false && /settings/.test(schemaChanged.error))
    check("a {% schema %} that is not JSON is said so", liquidParts("<p>x</p>{% schema %}{nope{% endschema %}").bad === true)
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
        return /from\("theme_github_links"\)\.select\("repo_full_name"\)/.test(route) && !/installationToken|installationRepos|github-sync\/github/.test(route)
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
  check("a section or block file travels as itself, anything else as the whole theme", changesFor("", { kind: "save", path: "templates/home.json", content: "{}" }).length === 0 &&
    changesFor("", { kind: "save", path: "blocks/_card.storelib", content: "b" }).length === 1 && /mirrorWholeTheme\(installId, describeChange\(change\)\)/.test(read("lib/github-sync/mirror.ts")))
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
  check("a site with incoming changes switched off is left alone", /\(l\) => l\.pull_on_push !== false &&/.test(sync2))
  check("and so is a link made through another installation than the one that sent the push",
    /Number\(l\.installation_id\) === from/.test(sync2) && /const from = Number\(payload\.installation\?\.id\)/.test(sync2))
  /* Changed on purpose (round Z): a push and Pull share applyRepoFiles (lib/github-sync/apply.ts). */
  check("Pull from GitHub reads the whole branch through the same apply a push uses", /export async function pullNow/.test(sync2) && /listTree\(token/.test(sync2) && (sync2.match(/applyRepoFiles\(db, link\.install_id, snap, incoming/g) ?? []).length === 2)
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
  check("  including in what a failed commit writes to the activity list", /const why = e instanceof GitHubError \? e\.message : "GitHub did not answer"/.test(mirror))
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
