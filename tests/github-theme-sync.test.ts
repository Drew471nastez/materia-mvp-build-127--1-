/**
 * ===========================================================================
 *  THE WHOLE THEME IN A REPOSITORY, BOTH WAYS, AGAINST A FAKE GITHUB
 * ===========================================================================
 * Andrew's report: the GitHub card said "Last sync failed", only section
 * files ever reached the repository, and an agent that edited
 * sections/slideshow.storelib in an imported theme was told it was one of
 * Storelib's built-in sections. This runs lib/github-sync end to end against
 * an in-memory GitHub (tests/_fake-github.ts) and an in-memory database
 * (tests/_fake-db.ts), no network:
 *
 *   export        every part of the theme lands, native and imported, and a
 *                 second export of an unchanged site is no commit at all
 *   round trip    an agent's push of pages, settings, a new section and an
 *                 edited built-in comes back into the site as a draft; one
 *                 bad file is reported with its line, the rest still taken
 *   overrides     a built-in edited in the repository is this site's copy
 *                 only, drawn first, and reset deletes it
 *   errors        protected branch, no access, rate limits, 502s, a branch
 *                 that moved, a missing installation, an empty repository:
 *                 each retried or explained with a fix
 *   loops         Storelib's own commits and redeliveries change nothing
 *   signatures    a webhook is GitHub's or it is refused
 *   keys          an agent key expires, can be read only, and is revoked
 */
import { createHmac, generateKeyPairSync } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

import { fakeDb } from "./_fake-db"
import { fakeGitHub } from "./_fake-github"
import { setGitHubTransport, timing, type GitHubConfig } from "@/lib/github-sync/github"
import { SyncError, applyPush, exportSite, pullNow, commitComment, olderThanApplied, type GitHubLink } from "@/lib/github-sync/sync"
import { seenDelivery, validDeliveryId, DELIVERY_TTL_MS } from "@/lib/github-sync/deliveries"
import { COMMIT_MARKER, verifySignature, agentsGuide } from "@/lib/github-sync/core"
import { mergePages, overridesOf, roleOf, readsBack, gitBlobSha, MAX_REPO_FILE_BYTES } from "@/lib/github-sync/layout"
import { explainFailure } from "@/lib/github-sync/errors"
import { repoMayWrite, agentMayWrite } from "@/lib/agent-access/protected"
import { sectionSource } from "@/lib/website-builder/storelib-runtime"
import { keyExpired, scopesCanWrite, expiryFor, READ_ONLY_REFUSAL } from "@/lib/agent-access/token-format"
import { keyLine } from "@/components/website-builder/agent-connections-panel"
import { editedLabel } from "@/components/website-builder/github-sync-panel"
import { isEditedBuiltIn } from "@/components/website-builder/editor/edited-built-in-note"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { ASSET_MAP_PATH } from "@/lib/storelib-theme/compat/install"
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
const OTHER = "22222222-2222-4222-8222-222222222222"
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

function linkRow(over: Partial<GitHubLink> = {}): GitHubLink & Record<string, unknown> {
  return {
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
  }
}

function nativeTables() {
  return {
    store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "Astrid" }, { id: OTHER, creator_id: CREATOR, name: "Other" }],
    store_theme_settings: [
      { install_id: INSTALL, settings: { brand_name: "Old" }, draft_settings: { brand_name: "Astrid", color_primary: "#111111" } },
      { install_id: OTHER, settings: {}, draft_settings: null },
    ],
    store_theme_pages: [
      {
        id: "p-home",
        install_id: INSTALL,
        page_key: "home",
        sections: [],
        draft_sections: [
          { id: "header", type: "header", name: "Header", settings: {} },
          { id: "hero-1", type: "hero", name: "Hero", settings: { heading: "Hello" } },
          { id: "footer", type: "footer", name: "Footer", settings: {} },
        ],
      },
      {
        id: "p-about",
        install_id: INSTALL,
        page_key: "about",
        sections: [
          { id: "header", type: "header", name: "Header", settings: {} },
          { id: "about-1", type: "rich_text", name: "Rich text", settings: {} },
          { id: "footer", type: "footer", name: "Footer", settings: {} },
        ],
        draft_sections: null,
      },
    ],
    store_theme_custom_files: [
      { install_id: INSTALL, path: "sections/my_promo.storelib", content: DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "my_promo"').replace(/"name": "Simple CTA"/, '"name": "My promo"'), draft_content: null, updated_at: "2026-10-01T00:00:00Z" },
    ],
    theme_github_links: [linkRow()],
    theme_github_events: [],
    theme_agent_activity: [],
    store_theme_file_versions: [],
    store_theme_backups: [],
  }
}

const link = (db: ReturnType<typeof fakeDb>, id = INSTALL) => db.tables.theme_github_links.find((l) => l.install_id === id) as GitHubLink

async function pushAs(gh: ReturnType<typeof fakeGitHub>, db: ReturnType<typeof fakeDb>, files: Record<string, string | Buffer | null>, who = "drew", message = "Agent change") {
  const before = gh.repos.get(REPO)!.refs.get("main")!
  const after = gh.commitFiles(REPO, "main", files, message)
  const payload = {
    ref: "refs/heads/main",
    before,
    after,
    repository: { id: 99, full_name: REPO },
    installation: { id: 1 },
    sender: { login: who },
    pusher: { name: who },
    commits: [{ message, added: [], modified: Object.keys(files).filter((p) => files[p] !== null), removed: Object.keys(files).filter((p) => files[p] === null) }],
  }
  const outcomes = await applyPush(db, cfg, payload)
  return { outcomes, after, payload }
}

async function main() {
  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nExport: the whole theme, for a Storelib theme")
  {
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", { "README.md": "# old readme\n", "notes/mine.md": "the owner's own notes" })
    const db = fakeDb(nativeTables())
    const sha = await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
    const files = gh.filesAt(REPO, "main")
    const paths = Object.keys(files)
    check("one commit was made, and it is the branch's head", !!sha && gh.repos.get(REPO)!.refs.get("main") === sha)
    check("it carries the marker, so it is never read back", gh.repos.get(REPO)!.commits.get(sha!)!.message.includes(COMMIT_MARKER))
    for (const p of ["README.md", "AGENTS.md", "CLAUDE.md", "storelib.json", "config/settings.json", "config/settings_schema.json", "templates/home.json", "templates/about.json", "sections/header-group.json", "sections/footer-group.json", "sections/my_promo.storelib", "sections/slideshow.json"]) {
      check(`  has ${p}`, paths.includes(p))
    }
    const shipped = Object.keys(DEFAULT)
    check(`  and every one of the ${shipped.length} built-in section and block files`, shipped.every((p) => paths.includes(p)), shipped.filter((p) => !paths.includes(p)).join(", "))
    check("the settings are the builder's draft, not the published ones", JSON.parse(gh.text(REPO, "main", "config/settings.json")!).brand_name === "Astrid")
    const home = JSON.parse(gh.text(REPO, "main", "templates/home.json")!)
    check("a page's template holds its own sections, and the header lives once in the group file",
      home.order.join() === "hero-1" && home.sections["hero-1"].settings.heading === "Hello" && /"header"/.test(gh.text(REPO, "main", "sections/header-group.json")!))
    check("a page with no draft is exported as published", JSON.parse(gh.text(REPO, "main", "templates/about.json")!).order.join() === "about-1")
    check("the owner's own files are left exactly as they were", gh.text(REPO, "main", "notes/mine.md") === "the owner's own notes")
    const readme = gh.text(REPO, "main", "README.md")!
    check("README says what each folder is and what Storelib reads back", /What is where/.test(readme) && /templates\/<page>\.json/.test(readme) && /Read back by Storelib/.test(readme) && /storelib\.com\/developers\/schema/.test(readme))
    check("  and how to change a built-in section", /Edited in GitHub/.test(readme) && /Reset to Storelib's version/.test(readme))
    check("  with no em dash", !/\u2014/.test(readme + gh.text(REPO, "main", "AGENTS.md")))
    const agents = gh.text(REPO, "main", "AGENTS.md")!
    check("AGENTS.md says a built-in can be edited in place here", /can be edited in place here/.test(agents) && /reset it to Storelib's version/.test(agents))
    const manifest = JSON.parse(gh.text(REPO, "main", "storelib.json")!)
    check("storelib.json names the format and what is read back", manifest.format === "storelib-repo/1" && manifest.kind === "storelib" && manifest.reads_back.includes("templates/*.json"))
    const after = link(db)
    check("the link records the commit and no error", after.last_synced_sha === sha && after.last_error === null)
    check("and what GitHub and Storelib now agree on, file by file", Object.keys(after.sync_state?.files ?? {}).length === paths.length - 1 && after.sync_state!.files!["templates/home.json"] === gitBlobSha(files["templates/home.json"]))

    const calls = gh.calls.length
    const again = await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
    check("a second export of an unchanged site makes no commit", again === null && gh.repos.get(REPO)!.refs.get("main") === sha)
    check("  and sends no file: no tree, no blob, no commit is written", !gh.calls.slice(calls).some((c) => c.method !== "GET" && /\/git\//.test(c.path)))
    check("  and the activity list says GitHub already had it", /already had the whole theme/.test(db.tables.theme_github_events.at(-1)!.summary))

    /* ── Pull of what Storelib just sent changes nothing ── */
    const pulled = await pullNow(db, cfg, link(db), "Astrid")
    check("Pull right after a Push takes nothing: every file is the one Storelib sent", pulled.saved === 0 && pulled.failed.length === 0 && pulled.unchanged > 50, JSON.stringify({ s: pulled.saved, f: pulled.failed.slice(0, 2), u: pulled.unchanged }))
    check("  and does not even download them", !gh.calls.slice(calls).some((c) => /\/git\/blobs\/[0-9a-f]+$/.test(c.path)))

    /* ─────────────────────────────────────────────────────────────────── */
    console.log("\nRound trip: an agent's push comes back into the site")
    const home2 = JSON.parse(gh.text(REPO, "main", "templates/home.json")!)
    home2.sections["hero-1"].settings.heading = "From Codex"
    const about2 = JSON.parse(gh.text(REPO, "main", "templates/about.json")!)
    about2.sections["x-1"] = { type: "nope", settings: {} }
    about2.order.push("x-1")
    const settings2 = { ...JSON.parse(gh.text(REPO, "main", "config/settings.json")!), brand_name: "Drew Co" }
    const heroEdited = DEFAULT["sections/hero.storelib"].replace("<style scoped>", "<style scoped>\n/* taller, from Codex */")
    const promo = DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "promo_strip"').replace(/"name": "Simple CTA"/, '"name": "Promo strip"')
    const { outcomes, after: head, payload: firstPush } = await pushAs(gh, db, {
      "templates/home.json": JSON.stringify(home2, null, 2),
      "templates/about.json": JSON.stringify(about2, null, 2),
      "config/settings.json": JSON.stringify(settings2, null, 2),
      "sections/hero.storelib": heroEdited,
      "sections/promo_strip.storelib": promo,
      "sections/broken.storelib": "<template>\n<div>{{ </div>\n</template>",
      "AGENTS.md": "changed by the agent",
      "src/app.ts": "not the theme",
    })
    const o = outcomes[0]
    check("the push is read for the linked site", outcomes.length === 1 && o.site === INSTALL)
    check("the page, the settings, a new section and an edited built-in are taken",
      ["templates/home.json", "config/settings.json", "sections/promo_strip.storelib", "sections/hero.storelib"].every((p) => o.saved.includes(p)), JSON.stringify(o.saved) + JSON.stringify(o.failed))
    check("a file that does not compile is not, with the file and what is wrong", o.failed.some((f) => f.path === "sections/broken.storelib" && /sections\/broken\.storelib/.test(f.error)))
    check("a page naming a section the theme does not have is not, and says which", o.failed.some((f) => f.path === "templates/about.json" && /sections\/nope\.storelib/.test(f.error)))
    check("files outside the theme are left alone, and a guide Storelib writes is noted, not taken",
      !o.saved.includes("src/app.ts") && !o.failed.some((f) => f.path === "src/app.ts") && o.notes.some((n) => n.path === "AGENTS.md"))
    const homeRow = db.tables.store_theme_pages.find((p) => p.install_id === INSTALL && p.page_key === "home")!
    check("the home page's draft has the agent's heading, and keeps its header and footer",
      homeRow.draft_sections.find((s: any) => s.id === "hero-1").settings.heading === "From Codex" && homeRow.draft_sections[0].type === "header" && homeRow.draft_sections.at(-1).type === "footer")
    check("nothing went live: the published page is as it was", Array.isArray(homeRow.sections) && homeRow.sections.length === 0)
    const aboutRow = db.tables.store_theme_pages.find((p) => p.install_id === INSTALL && p.page_key === "about")!
    check("the refused page is untouched", aboutRow.draft_sections === null)
    const st = db.tables.store_theme_settings.find((s) => s.install_id === INSTALL)!
    check("the settings draft is the repository's, and the live settings are not touched", st.draft_settings.brand_name === "Drew Co" && st.settings.brand_name === "Old")
    const row = (p: string) => db.tables.store_theme_custom_files.find((r) => r.install_id === INSTALL && r.path === p)
    check("the new section is saved as a draft", row("sections/promo_strip.storelib")?.draft_content === promo)
    check("a backup of the site was taken before pages and settings were written", db.tables.store_theme_backups.length >= 1 && /Before GitHub/.test(db.tables.store_theme_backups[0].label))
    check("an open builder hears about each change", ["templates/home.json", "config/settings.json", "sections/promo_strip.storelib", "sections/hero.storelib"].every((p) => db.tables.theme_agent_activity.some((a) => a.path === p && a.agent_name === "GitHub · drew")))
    const repo = gh.repos.get(REPO)!
    const status = repo.statuses.find((s) => s.sha === head)
    check("the commit gets a red Storelib status naming the first problem, within 140 characters", status?.state === "failure" && status.context === "Storelib" && status.description.length <= 140 && /not taken/.test(status.description))
    const comment = repo.comments.find((c) => c.sha === head)?.body ?? ""
    check("and a comment listing every file that was not taken, and how many were", /sections\/broken\.storelib/.test(comment) && /templates\/about\.json/.test(comment) && /4 files taken/.test(comment), comment.slice(0, 300))
    const l = link(db)
    check("the builder's card has the reason and the list, file by file", /2 files were not taken/.test(l.last_error ?? "") && l.sync_state?.last?.failed.length === 2 && l.sync_state.last.saved.length === 4)
    check("the summary in the activity list says what came and what did not", /4 taken, 2 not/.test(db.tables.theme_github_events.at(-1)!.summary))

    /* ─────────────────────────────────────────────────────────────────── */
    console.log("\nA built-in edited in the repository is this site's own copy")
    check("the edited hero is kept as this site's file, at the built-in's path", row("sections/hero.storelib")?.draft_content === heroEdited)
    check("the global built-in is unchanged", DEFAULT["sections/hero.storelib"] !== heroEdited && sectionSource("hero") === DEFAULT["sections/hero.storelib"])
    check("another site is unchanged", !db.tables.store_theme_custom_files.some((r) => r.install_id === OTHER))
    const overrides = Object.fromEntries(db.tables.store_theme_custom_files.filter((r) => r.install_id === INSTALL).map((r) => [r.path, r.draft_content ?? r.content]))
    check("the renderer draws this site's copy, for this site (preview and live read the same overrides)", sectionSource("hero", overrides) === heroEdited)
    const list = overridesOf({ files: overrides, defaults: DEFAULT, compat: false, referenceSchemas: { slideshow: {} } })
    check("it is listed as an edited built-in, and a section of the site's own is not", list.some((x) => x.path === "sections/hero.storelib") && !list.some((x) => x.path === "sections/my_promo.storelib"))
    check("the builder marks it Edited in GitHub", editedLabel({ path: "sections/hero.storelib", from: "github" }).badge === "Edited in GitHub")
    const builtIns = { defaults: DEFAULT, drawnByStorelib: (t: string) => t === "slideshow" }
    check("the section's panel knows it is an edited built-in, and not a section of the site's own or an untouched one",
      isEditedBuiltIn("hero", overrides, builtIns) && !isEditedBuiltIn("my_promo", overrides, builtIns) && !isEditedBuiltIn("faq_accordion", overrides, builtIns) && isEditedBuiltIn("slideshow", { "sections/slideshow.storelib": "x" }, builtIns))
    check("  and shows the note with Reset in the panel, for a Storelib theme only",
      /!compatInstall && isEditedBuiltIn\(section\.type, storelibSources/.test(read("app/website-builder/editor/[installId]/page.tsx")) && /Reset to Storelib&apos;s version/.test(read("components/website-builder/editor/edited-built-in-note.tsx")))
    check("a push note says it is now this site's copy", o.notes.some((n) => n.path === "sections/hero.storelib" && /own copy/.test(n.note)))
    check("a section Storelib draws itself can be replaced the same way", repoMayWrite("sections/slideshow.storelib", { compat: false }).ok && (repoMayWrite("sections/slideshow.storelib", { compat: false }) as { override: boolean }).override === true)
    check("  while an agent over MCP is still refused a built-in", agentMayWrite("sections/hero.storelib").ok === false)
    const route = read("app/api/website-builder/themes/[installId]/github/route.ts")
    check("Reset to Storelib's version deletes only an edited built-in, and gives GitHub Storelib's text back",
      /body\.action === "reset-override"/.test(route) && /if \(!edited\.some\(\(o\) => o\.path === path\)\)/.test(route) && /\.delete\(\)\.eq\("install_id", own\.installId\)\.eq\("path", path\)/.test(route) && /kind: "save", path, content: shipped/.test(route))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("an open builder reads the page again when a push changed it, unless it has unsaved edits",
      /if \(!isDirty && events\.some\(\(ev\) => ev\.path === `templates\/\$\{currentPageRef\.current\}\.json`\)\)/.test(editor) && /ev\.path === "config\/settings\.json"/.test(editor))

    /* ─────────────────────────────────────────────────────────────────── */
    console.log("\nNever in a circle")
    const n = db.tables.theme_github_events.length
    const again2 = await applyPush(db, cfg, { ref: "refs/heads/main", before: "a".repeat(40), after: head, repository: { id: 99, full_name: REPO }, installation: { id: 1 }, commits: [{ message: "x", modified: ["templates/home.json"] }] })
    check("a webhook delivered twice is read once", again2.length === 0 && db.tables.theme_github_events.length === n)
    const sent = await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
    const before = repo.statuses.length
    const own = await applyPush(db, cfg, { ref: "refs/heads/main", before: head, after: sent!, repository: { id: 99, full_name: REPO }, installation: { id: 1 }, sender: { login: "storelib[bot]" }, commits: [{ message: `Storelib: x\n\n${COMMIT_MARKER}`, modified: ["templates/home.json"] }] })
    check("Storelib's own commit is not read back", own.length === 0 && repo.statuses.length === before)
    const own2 = await applyPush(db, cfg, { ref: "refs/heads/main", before: head, after: sent!, repository: { id: 99, full_name: REPO }, installation: { id: 1 }, sender: { login: "someone" }, commits: [{ message: "merge", modified: [] }] })
    check("nor a push whose head is the commit Storelib last wrote", own2.length === 0)
    const exported = gh.text(REPO, "main", "sections/promo_strip.storelib")
    check("the export after the push carries the site's files back, the new section included", exported === promo)
    const echo = await pushAs(gh, db, { "sections/promo_strip.storelib": promo, "notes/x.md": "x" })
    check("a person's push that carries Storelib's own bytes changes nothing", echo.outcomes.every((x) => x.saved.length === 0 && x.failed.length === 0))

    /* A validly signed old push, replayed (a new delivery id, so the dedupe does not catch it): its head is behind. */
    const heroLater = heroEdited.replace("taller, from Codex", "later still")
    const later = await pushAs(gh, db, { "sections/hero.storelib": heroLater })
    check("a later push to the hero is taken", later.outcomes[0]?.saved.includes("sections/hero.storelib") && row("sections/hero.storelib")?.draft_content === heroLater)
    const statuses = repo.statuses.length
    const replay = await applyPush(db, cfg, firstPush)
    check("the old push replayed is not applied: its head is behind the last applied commit", replay.length === 0 && row("sections/hero.storelib")?.draft_content === heroLater && homeRow.draft_sections.find((s: any) => s.id === "hero-1").settings.heading === "From Codex")
    check("  and leaves no status, comment or activity behind", repo.statuses.length === statuses)
    const token = "ghs_fake_installation_token"
    const gone = { ...link(db), last_synced_sha: "f".repeat(40), sync_state: { last: { head_at: "2026-10-10T12:00:00Z" } } } as GitHubLink
    check("when GitHub cannot place the last commit, an older head commit time is enough to refuse",
      (await olderThanApplied(token, REPO, gone, head, "2026-10-09T12:00:00Z")) && !(await olderThanApplied(token, REPO, gone, head, "2026-10-11T12:00:00Z")))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nAn imported Shopify theme: its own files, and its slideshow is its own")
  {
    const zip = new JSZip()
    zip.file("layout/theme.liquid", "<!doctype html><html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>")
    zip.file("sections/slideshow.liquid", '<div class="slideshow">{{ section.settings.heading }}</div>\n{% schema %}\n{"name":"Slideshow","settings":[{"type":"text","id":"heading","label":"Heading","default":"Hi"}],"presets":[{"name":"Slideshow"}]}\n{% endschema %}')
    zip.file("sections/header.liquid", '<header>{{ shop.name }}</header>\n{% schema %}\n{"name":"Header","settings":[]}\n{% endschema %}')
    zip.file("sections/header-group.json", JSON.stringify({ type: "header", name: "Header group", sections: { header: { type: "header", settings: {} } }, order: ["header"] }))
    zip.file("templates/index.json", JSON.stringify({ sections: { s1: { type: "slideshow", settings: { heading: "Welcome" } } }, order: ["s1"] }))
    zip.file("templates/customers/account.liquid", "<h1>Account</h1>")
    zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Mini", theme_version: "1.0.0" }]))
    zip.file("config/settings_data.json", JSON.stringify({ current: {} }))
    zip.file("locales/en.default.json", JSON.stringify({ general: { hi: "Hi" } }))
    zip.file("assets/base.css", "body{margin:0}")
    zip.file("assets/font.woff2", new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 2, 3, 255]))
    zip.file("assets/hero.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]))
    const converted = await convertShopifyTheme(zip)
    if (converted.ok === false) throw new Error(converted.error)
    const t = converted.theme
    const files: Record<string, string> = { ...t.files, [ASSET_MAP_PATH]: JSON.stringify({ "hero.jpg": "https://storage.example/hero.jpg" }) }
    const tables = {
      store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "PAYHIPS" }],
      store_theme_settings: [{ install_id: INSTALL, settings: t.settings, draft_settings: null }],
      store_theme_pages: t.pages.map((p, i) => ({ id: `p${i}`, install_id: INSTALL, page_key: p.page_key, sections: p.sections, draft_sections: null })),
      store_theme_custom_files: Object.entries(files).map(([path, content]) => ({ install_id: INSTALL, path, content, draft_content: null })),
      theme_github_links: [linkRow()],
      theme_github_events: [],
      theme_agent_activity: [],
      store_theme_file_versions: [],
      store_theme_backups: [],
    }
    const db = fakeDb(tables as never)
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", { "README.md": "x" })
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 9, 9])
    await exportSite(db, cfg, link(db), "PAYHIPS", { fetchMedia: async (url) => (url === "https://storage.example/hero.jpg" ? jpeg : null) })
    const paths = Object.keys(gh.filesAt(REPO, "main"))
    for (const p of ["sections/slideshow.storelib", "sections/theme-header.storelib", "layout/theme.storelib", "shopify/templates/customers/account.liquid", "shopify/locales/en.default.json", "shopify/assets/base.css", "shopify/assets/font.woff2", "shopify/assets/hero.jpg", "shopify/config/settings_schema.json", "templates/home.json", "config/settings.json", "AGENTS.md", "README.md"]) {
      check(`  has ${p}`, paths.includes(p), paths.filter((x) => x.startsWith(p.split("/")[0])).slice(0, 8).join(", "))
    }
    check("no Storelib built-in is written into an imported theme", !paths.includes("sections/hero.storelib") && !paths.some((p) => /^sections\/[a-z_]+\.json$/.test(p) && !/-group\.json$/.test(p)))
    check("the font goes to GitHub as its bytes, not as base64 text", Buffer.compare(gh.filesAt(REPO, "main")["shopify/assets/font.woff2"], Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1, 2, 3, 255])) === 0)
    check("  sent as a blob, base64 on the wire", gh.calls.some((c) => c.method === "POST" && /\/git\/blobs$/.test(c.path) && c.body.encoding === "base64"))
    check("the picture is fetched from storage and committed", Buffer.compare(gh.filesAt(REPO, "main")["shopify/assets/hero.jpg"], Buffer.from(jpeg)) === 0)
    check("the settings keep the compat marker", JSON.parse(gh.text(REPO, "main", "config/settings.json")!).compat.kind === "shopify")
    const agents = gh.text(REPO, "main", "AGENTS.md")!
    check("AGENTS.md says every section is the theme's own and keeps the compat line", /imported from a Shopify theme/.test(agents) && /Every section here is the theme's own/.test(agents) && /<template compat="shopify">/.test(agents))
    check("the manifest calls it a shopify theme", JSON.parse(gh.text(REPO, "main", "storelib.json")!).kind === "shopify")

    const slideshow = gh.text(REPO, "main", "sections/slideshow.storelib")!
    const edited = slideshow.replace('class="slideshow"', 'class="slideshow slideshow--agent"')
    const { outcomes, after } = await pushAs(gh, db, {
      "sections/slideshow.storelib": edited,
      "sections/plain.storelib": DEFAULT["sections/cta_simple.storelib"],
      "shopify/templates/customers/account.liquid": "<h1>{% if customer %}Account</h1>",
      "shopify/assets/base.css": "body{margin:0;color:red}",
      "shopify/assets/hero.jpg": Buffer.from([1, 2, 3]),
    })
    const o = outcomes[0]
    check("sections/slideshow.storelib, the theme's own, is taken: no built-in refusal", o.saved.includes("sections/slideshow.storelib") && !o.failed.some((f) => /built-in/.test(f.error)), JSON.stringify(o.failed))
    check("  and saved as this theme's draft", tables.store_theme_custom_files.find((r) => r.path === "sections/slideshow.storelib")!.draft_content === edited)
    check("the theme's CSS is taken", o.saved.includes("shopify/assets/base.css"))
    check("a Storelib-format section in an imported theme is refused with what to do", o.failed.some((f) => f.path === "sections/plain.storelib" && /<template compat="shopify">/.test(f.error)))
    check("Liquid that does not parse is refused with its file", o.failed.some((f) => f.path === "shopify/templates/customers/account.liquid"))
    check("a changed picture is noted, with where to upload it", o.notes.some((n) => n.path === "shopify/assets/hero.jpg" && /Files/.test(n.note)))
    check("the commit is red, the good files are in anyway", gh.repos.get(REPO)!.statuses.find((s) => s.sha === after)?.state === "failure" && o.saved.length === 2)
    check("repoMayWrite never calls an imported theme's section a built-in", (repoMayWrite("sections/slideshow.storelib", { compat: true }) as { override: boolean }).override === false)
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nWhy a sync failed, each with a fix, and the ones that are retried")
  const fresh = async (setup: (gh: ReturnType<typeof fakeGitHub>) => void, over: Partial<GitHubLink> = {}) => {
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", { "README.md": "x" })
    setup(gh)
    const tables = nativeTables()
    tables.theme_github_links = [linkRow(over)]
    const db = fakeDb(tables)
    let error: string | null = null
    let sha: string | null = null
    try {
      sha = await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
    } catch (e) {
      error = e instanceof SyncError ? e.message : `not a SyncError: ${(e as Error).message}`
    }
    return { gh, db, error, sha }
  }
  {
    const r = await fresh((gh) => gh.repos.get(REPO)!.protected.add("main"))
    check("a protected branch: said, with a branch of its own as the fix", /protected/.test(r.error ?? "") && /such as storelib/.test(r.error ?? ""), r.error ?? "")
    check("  on the card and in the activity list, and kept with its kind", /protected/.test(link(r.db).last_error ?? "") && link(r.db).sync_state?.last?.problem === "branch-protected" && /Not sent/.test(r.db.tables.theme_github_events.at(-1)!.summary))
  }
  {
    const r = await fresh((gh) => gh.fail({ method: "POST", path: /\/git\/trees$/, status: 403, body: { message: "Resource not accessible by integration" } }))
    check("no write access: said, with where on GitHub to give it", /does not have write access/.test(r.error ?? "") && /Configure/.test(r.error ?? ""), r.error ?? "")
  }
  {
    const reset = Math.floor(Date.now() / 1000) + 3600
    const r = await fresh((gh) => gh.fail({ path: /\/git\/ref\/heads\//, status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }, body: { message: "API rate limit exceeded" } }))
    check("the hourly limit: said, with when it comes back", /limiting/.test(r.error ?? "") && /until \d\d:\d\d UTC/.test(r.error ?? ""), r.error ?? "")
  }
  {
    const r = await fresh((gh) => gh.fail({ method: "POST", path: /\/git\/trees$/, status: 502, times: 2 }))
    check("a 502 is tried again, and the export goes through", r.error === null && !!r.sha && r.gh.calls.filter((c) => c.method === "POST" && /\/git\/trees$/.test(c.path)).length >= 3)
  }
  {
    const r = await fresh((gh) => gh.fail({ method: "POST", path: /\/git\/commits$/, status: 403, headers: { "retry-after": "1" }, body: { message: "You have exceeded a secondary rate limit" }, times: 1 }))
    check("a secondary limit waits as GitHub asks, and goes through", r.error === null && !!r.sha)
  }
  {
    let done = false
    const r = await fresh((gh) =>
      gh.hooks.push((method, path) => {
        if (!done && method === "PATCH" && /\/git\/refs\/heads\/main$/.test(path)) {
          done = true
          gh.commitFiles(REPO, "main", { "notes/person.md": "pushed meanwhile" }, "A person's push")
        }
      }),
    )
    const files = r.gh.filesAt(REPO, "main")
    check("a push in between: the commit is made again on top of it", r.error === null && !!r.sha && !!files["templates/home.json"])
    check("  and the other push's file is kept: merged by file", files["notes/person.md"]?.toString() === "pushed meanwhile")
  }
  {
    const r = await fresh(() => {}, { installation_id: 7 })
    check("an installation that is gone: said, with reconnect as the fix", /no longer installed/.test(r.error ?? "") && /connect it again/.test(r.error ?? ""), r.error ?? "")
  }
  {
    const r = await fresh(() => {}, { branch: "storelib" })
    check("a branch that is not there yet is made from the default branch", r.error === null && !!r.gh.repos.get(REPO)!.refs.get("storelib") && !r.gh.filesAt(REPO, "main")["templates/home.json"] && !!r.gh.filesAt(REPO, "storelib")["templates/home.json"])
  }
  {
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", null)
    const db = fakeDb(nativeTables())
    const sha = await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null }).catch((e) => `error: ${e.message}`)
    check("an empty repository gets its first commit, then the theme", typeof sha === "string" && !sha.startsWith("error") && !!gh.filesAt(REPO, "main")["templates/home.json"], String(sha))
  }
  {
    const r = await fresh((gh) => {
      void gh
    })
    void r
    const tables = nativeTables()
    tables.store_theme_custom_files.push({ install_id: INSTALL, path: "assets/huge.css", content: "a".repeat(MAX_REPO_FILE_BYTES + 10), draft_content: null, updated_at: "" })
    const gh = fakeGitHub()
    setGitHubTransport(gh.transport)
    gh.newRepo(REPO, "main", { "README.md": "x" })
    const db = fakeDb(tables)
    await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
    const manifest = JSON.parse(gh.text(REPO, "main", "storelib.json")!)
    check("a file over 20 MB stays in Storelib, and the repository says so", !gh.filesAt(REPO, "main")["assets/huge.css"] && manifest.left_out.includes("assets/huge.css") && /huge\.css/.test(gh.text(REPO, "main", "README.md")!))
  }
  {
    const x = explainFailure({ status: 500, message: "boom" })
    check("GitHub's own words are never the message", !/boom/.test(x.message + x.fix))
    check("every kind has a message and a fix, with no em dash", ["app-key", "no-access", "repo-missing", "branch-protected", "moved-on", "rate-limited", "github-down", "unreachable"].every((k) => {
      const cases: Record<string, Parameters<typeof explainFailure>[0]> = {
        "app-key": { status: 401, message: "Bad credentials", step: "token" },
        "no-access": { status: 403, message: "Resource not accessible by integration" },
        "repo-missing": { status: 404, message: "Not Found" },
        "branch-protected": { status: 422, message: "Protected branch update failed" },
        "moved-on": { status: 422, message: "Update is not a fast forward", step: "write-ref" },
        "rate-limited": { status: 429, message: "rate limit" },
        "github-down": { status: 503, message: "x" },
        unreachable: { status: 0, message: "x" },
      }
      const e = explainFailure(cases[k], { repo: REPO, branch: "main" })
      return e.problem === k && e.message.length > 10 && e.fix.length > 10 && !/\u2014/.test(e.message + e.fix)
    }))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nPages merged file by file")
  {
    const current = [
      { page_key: "home", sections: [{ id: "h", type: "header", settings: {} }, { id: "a", type: "hero", settings: {} }, { id: "f", type: "footer", settings: { x: 1 } }] },
      { page_key: "about", sections: [{ id: "h", type: "header", settings: {} }, { id: "b", type: "rich_text", settings: {} }, { id: "f", type: "footer", settings: { x: 1 } }] },
      { page_key: "landing", sections: [{ id: "c", type: "hero", settings: {} }] },
    ]
    const footer = JSON.stringify({ type: "footer", name: "Footer group", sections: { f: { type: "footer", settings: { x: 2 } } }, order: ["f"] })
    const r = mergePages(current, { "sections/footer-group.json": footer }, { knownTypes: () => true, maxSections: 60, newPageKey: () => true })
    const by = Object.fromEntries(r.pages.map((p) => [p.page_key, p.sections]))
    check("a footer changed once is the footer on every page that had one", by.home.at(-1)!.settings!.x === 2 && by.about.at(-1)!.settings!.x === 2)
    check("  and a page without a footer does not get one", by.landing.length === 1)
    check("  and each page keeps its own sections", by.about[1].id === "b" && by.home[1].id === "a")
    const r2 = mergePages(current, { "templates/new-page.json": JSON.stringify({ sections: { z: { type: "hero", settings: {} } }, order: ["z"] }) }, { knownTypes: () => true, maxSections: 60, newPageKey: (k) => /^[a-z0-9-]+$/.test(k) })
    check("a new template is a new page, with the home page's header and footer", r2.pages.length === 1 && r2.pages[0].page_key === "new-page" && r2.pages[0].sections.map((s) => s.id).join() === "h,z,f")
    const r3 = mergePages(current, { "templates/home.json": '{ "sections": { "a": { "type": "hero" } }, "order": ["a", ] }' }, { knownTypes: () => true, maxSections: 60, newPageKey: () => true })
    check("broken JSON is refused with the file and the line", r3.pages.length === 0 && /templates\/home\.json line 1: not valid JSON/.test(r3.errors[0]?.reason ?? ""), r3.errors[0]?.reason)
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nWhat each path is")
  check("sections, templates, settings and an imported theme's files are read back", ["sections/hero.storelib", "templates/home.json", "config/settings.json", "sections/header-group.json", "blocks/button.storelib"].every((p) => readsBack(roleOf(p, { compat: false }))) && readsBack(roleOf("shopify/assets/base.css", { compat: true })))
  check("guides, reference schemas, pictures and anything outside the theme are not", !readsBack(roleOf("AGENTS.md", { compat: false })) && !readsBack(roleOf("sections/slideshow.json", { compat: false })) && !readsBack(roleOf("shopify/assets/x.png", { compat: true })) && !readsBack(roleOf("src/index.ts", { compat: false })) && !readsBack(roleOf("../x", { compat: false })))
  check("a shopify/ folder in a Storelib theme's repository is the owner's own", roleOf("shopify/x.json", { compat: false }) === "outside")
  check("the git blob sha is git's own", gitBlobSha("hello\n") === "ce013625030ba8dba906f756967f9e9ca394464a")

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nEach webhook delivery once")
  {
    const db = fakeDb({ github_webhook_deliveries: [] }, { unique: { github_webhook_deliveries: [["delivery_id"]] } })
    const id = "72d3162e-cc78-11e3-81ab-4c9367dc0958"
    const t0 = Date.parse("2026-10-11T00:00:00Z")
    check("a delivery id is a GUID, nothing else reaches the database", validDeliveryId(id) && !validDeliveryId(null) && !validDeliveryId("x") && !validDeliveryId("a'; drop table x;--"))
    check("the first delivery is new", (await seenDelivery(db, id, t0)) === false)
    check("the same delivery again is ignored", (await seenDelivery(db, id, t0 + 60_000)) === true)
    check("an id older than a day is forgotten, and kept again", (await seenDelivery(db, id, t0 + DELIVERY_TTL_MS + 1)) === false && db.tables.github_webhook_deliveries.length === 1)
    await seenDelivery(db, "11111111-2222-3333-4444-555555555555", t0 + 3 * DELIVERY_TTL_MS)
    check("ids older than a day are cleared", db.tables.github_webhook_deliveries.length === 1 && db.tables.github_webhook_deliveries[0].delivery_id === "11111111-2222-3333-4444-555555555555")
    const missing = fakeDb({}, { failWith: { github_webhook_deliveries: { message: 'relation "github_webhook_deliveries" does not exist' } } })
    check("before part 131 it lets the push through, to the older-head check", (await seenDelivery(missing, id, t0)) === false)
    const hook = read("app/api/github/webhook/route.ts")
    check("the webhook asks after the signature and before any work",
      hook.indexOf("verifySignature(") < hook.indexOf("seenDelivery(db, delivery)") && hook.indexOf("seenDelivery(db, delivery)") < hook.indexOf('event === "push"') && /req\.headers\.get\("x-github-delivery"\)/.test(hook))
    const sql = read("supabase/sql/run-now/131_github_whole_theme_and_agent_keys.sql")
    check("the table is server only and safe to run again", /CREATE TABLE IF NOT EXISTS public\.github_webhook_deliveries/.test(sql) && /REVOKE ALL ON public\.github_webhook_deliveries FROM anon, authenticated/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe webhook is GitHub's or it is refused")
  {
    const body = JSON.stringify({ ref: "refs/heads/main", after: "abc" })
    const sig = `sha256=${createHmac("sha256", "w").update(body).digest("hex")}`
    check("the right signature over the exact bytes passes", verifySignature(body, sig, "w"))
    check("a body changed by one byte fails", !verifySignature(body.replace("abc", "abd"), sig, "w"))
    check("a signature made with another secret fails", !verifySignature(body, `sha256=${createHmac("sha256", "x").update(body).digest("hex")}`, "w"))
    check("no secret configured refuses everything", !verifySignature(body, sig, undefined))
    const hook = read("app/api/github/webhook/route.ts")
    check("the route refuses before parsing, and answers 401", hook.indexOf("verifySignature(") < hook.indexOf("JSON.parse(raw)") && /Bad signature" \}, \{ status: 401 \}/.test(hook))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nAgent keys: expiry, read only, revoke")
  {
    const now = Date.parse("2026-10-11T00:00:00Z")
    check("a key with no day never expires; one past its day has", !keyExpired(null, now) && keyExpired("2026-10-10T00:00:00Z", now) && !keyExpired("2026-10-12T00:00:00Z", now))
    check("a new key works 180 days unless told, never with 0, and at most two years", expiryFor(undefined, now) === new Date(now + 180 * 86400000).toISOString() && expiryFor(0, now) === null && expiryFor(9999, now) === new Date(now + 730 * 86400000).toISOString())
    check("a key from before scopes can write; a read key cannot", scopesCanWrite(null) && scopesCanWrite(["read", "write"]) && !scopesCanWrite(["read"]))
    check("the key list says how long it works and if it only reads", keyLine({ last_used_at: null, expires_at: "2027-04-09T00:00:00Z", expired: false, access: "read" }, now) === "Not used yet · Works until 9 Apr 2027 · Read only" && /Expired/.test(keyLine({ last_used_at: null, expires_at: "2026-01-01T00:00:00Z", expired: true }, now)))
    const tokens = read("lib/agent-access/tokens.ts")
    check("an expired key is refused with the day and where to make a new one", /if \(keyExpired\(row\.expires_at\)\)/.test(tokens) && /expired on \$\{/.test(tokens) && tokens.indexOf("keyExpired(row.expires_at)") < tokens.indexOf("bucket: \"agent\","))
    check("a revoked key is refused before anything else", /row\.revoked_at/.test(tokens))
    check("before part 131 a key is read as it always was", /expires_at\|scopes/.test(tokens))
    const bind = read("lib/agent-access/bind.ts")
    check("a read only key reads, and every write over MCP answers why not", /const readOnly = who\.canWrite === false/.test(bind) && (bind.match(/readOnly \? refuse\(\)/g) ?? []).length >= 6 && /if \(readOnly\) return refuse\(\)/.test(bind))
    check("  and over HTTP", /if \(who\.canWrite === false\) return NextResponse\.json\(\{ error: READ_ONLY_REFUSAL \}, \{ status: 403 \}\)/.test(read("app/api/agent/v1/files/route.ts")))
    check("the refusal says where to make a key that can write", /Website settings, Connections/.test(READ_ONLY_REFUSAL))
    const conn = read("app/api/website-builder/themes/[installId]/agent-connections/route.ts")
    check("making a key sets its day and its access; disconnecting stamps revoked_at", /expires_at, scopes/.test(conn) && /access === "read" \? \["read"\] : \["read", "write"\]/.test(conn) && /update\(\{ revoked_at: new Date\(\)\.toISOString\(\) \}\)/.test(conn))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe database part and the builder")
  {
    const sql = read("supabase/sql/run-now/131_github_whole_theme_and_agent_keys.sql")
    check("part 131 adds sync_state, expires_at and scopes, and is safe to run again", /ADD COLUMN IF NOT EXISTS sync_state jsonb/.test(sql) && /ADD COLUMN IF NOT EXISTS expires_at timestamptz/.test(sql) && /ADD COLUMN IF NOT EXISTS scopes text\[\]/.test(sql) && /to_regclass\('public\.theme_github_links'\) IS NULL/.test(sql))
    check("  stores no token", !/token_hash|access_token|ghs_/.test(sql.replace(/theme_agent_tokens/g, "")))
    check("  and the check after reads it", /as p131_github_whole_theme/.test(read("supabase/sql/run-now/99_check_after.sql")) && /131_github_whole_theme_and_agent_keys\.sql/.test(read("supabase/sql/run-now/README.md")))
    const panel = read("components/website-builder/github-sync-panel.tsx")
    check("the GitHub card lists each file that was not taken, with its fix", /link\.last\.failed\.map/.test(panel) && /Fix these in the repository and push again/.test(panel))
    check("  the built-ins this site has its own copy of, with Reset to Storelib's version", /status\.overrides!\.map/.test(panel) && /Reset to Storelib&apos;s version/.test(panel) && /action: "reset-override"/.test(panel))
    check("  and how to use it with an AI", /Use it with an AI/.test(panel) && /claude\.ai\/code/.test(panel) && /chatgpt\.com\/codex/.test(panel))
    check("Publish sends the whole theme to a linked repository", /after\(\(\) => sendWholeTheme\(installId\)\)/.test(read("app/api/website-builder/themes/[installId]/publish/route.ts")))
    check("comment text is plain and has the editor link", /Open the builder: https:/.test(commitComment({ saved: [], failed: [{ path: "a", error: "a: x" }], notes: [] }, "https://storelib.com/x")))
    check("AGENTS.md for a folder says so", /The folder `site\/`/.test(agentsGuide({ siteName: "A", branch: "main", root: "site/" })))
  }

  setGitHubTransport(null)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
