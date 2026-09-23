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
  check("only section files are taken", !pushed.changed.includes("README.md") && !pushed.changed.includes("templates/home.json"))
  check("a name the site would refuse is ignored, not tried", !pushed.changed.some((p) => /Bad/.test(p)))
  check("a file changed and then removed in one push is removed", pushed.removed.includes("sections/hero.storelib") && !pushed.changed.includes("sections/hero.storelib"))
  check("and the rest are changed, once each", pushed.changed.sort().join() === "sections/faq.storelib,sections/pricing.storelib")

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
  check("the site's section files, and only those", plan.filter((f) => f.path.startsWith("sections/")).length === 2 && !plan.some((f) => f.path.startsWith("templates/")))
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
  check("through the one save every editor uses: compiled first, a draft, versioned", /saveThemeFile\(db, link\.install_id, path, source\)/.test(sync))
  check("a file already saved with the same text is skipped, so a redelivered webhook changes nothing",
    /current\.value\.source === source/.test(sync) && /out\.unchanged\.push\(path\)/.test(sync))
  check("an open builder hears about it through the same activity log agents write",
    /from\("theme_agent_activity"\)\.insert\(/.test(sync) && /token_id: null/.test(sync))
  check(`at most ${MAX_FILES_PER_PUSH} files from one push`, /changed\.length > MAX_FILES_PER_PUSH/.test(sync))
  check("the commit gets a Storelib status either way", /setStatus\(token, repo, after/.test(sync) && /context: "Storelib"/.test(gh))
  check("a deleted branch is not a push to sync", /payload\.deleted/.test(sync))
  check("nothing is ever deleted from a site by a push", !/\.delete\(\)/.test(sync))

  console.log("\nThe table")

  const sql = read("supabase/sql/RUN_GITHUB_SYNC.sql")
  check("the migration and the file to run are the same", sql === read("supabase/migrations/20260923_github_sync.sql"))
  check("it stores no token", !/token/i.test(sql.replace(/--.*$/gm, "")))
  check("row level security is on, and creators can only read", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE INSERT, UPDATE, DELETE ON theme_github_links FROM anon, authenticated/.test(sql) && /FOR SELECT/.test(sql))
  check("it says to run the agent connections file first", /RUN_AGENT_CONNECTIONS\.sql/.test(sql))

  console.log("\nIn the builder")

  const panel = read("components/website-builder/github-sync-panel.tsx")
  {
    const advanced = read("components/website-builder/website-settings/advanced.tsx")
    check("Website settings › Advanced has the GitHub card, for every tool",
      /<GitHubSyncPanel installId=\{ctx\.installId\}/.test(advanced) && (advanced.match(/<GitHubSyncPanel /g) ?? []).length === 2)
    check("and ChatGPT is sent to GitHub, the route that works for it",
      /tool === "chatgpt" \?/.test(advanced) && /Codex works on a GitHub repository/.test(advanced))
  }
  check("it says how it works in three steps", /Connect a repository/.test(panel) && /Ask your agent for a change/.test(panel) && /It appears here/.test(panel))
  check("and says so plainly when GitHub is not set up on the server", /GitHub is not switched on for this Storelib yet/.test(panel))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the top bar has a button that opens Connections, named for the tools",
    /aria-label="Connect Claude Code, Codex or ChatGPT"/.test(editor) && /onClick=\{openConnections\}/.test(editor))
  check("and coming back from GitHub opens Connections, then clears the address",
    /settingsSectionFrom\(url\.searchParams\.get\("settings"\)\)/.test(editor) && /history\.replaceState/.test(editor) &&
      /if \(value === "connections" \|\| value === "agents"\) return "advanced"/.test(read("components/website-builder/website-settings/types.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
