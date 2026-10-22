/**
 * ===========================================================================
 *  SETTINGS STORELIB ADDS, IN THE REPOSITORY, BOTH WAYS
 * ===========================================================================
 * An agent working in a store's repository reported that the builder's own
 * "Hover and focus" panel never reached it: of its nine settings only the
 * ones with a value were in config/settings.json, and nothing said what any
 * of them were. This runs lib/github-sync against the in-memory GitHub and
 * database (tests/_fake-github.ts, tests/_fake-db.ts):
 *
 *   the builder     the theme's placement wins: a storelib_* id its own
 *                   settings_schema.json declares leaves Storelib's group,
 *                   and the group goes when it declares them all
 *   export          config/storelib_settings_schema.json says what each one
 *                   is; config/settings.json holds every value, defaults too;
 *                   settings_panel.json says which group is Storelib's
 *   import          a changed value is taken, a default sent back is left
 *                   unset, a value the control cannot take is said, and an
 *                   edit to the definitions is a note, never a refusal
 *   Storelib theme  the same for Storelib's built-in groups
 *   menus           the store's menus, which the builder shows, both ways
 *   push results    the comment, a git note and the status's Details link,
 *                   each readable with the repository's own access
 *   guides          README, AGENTS.md and storelib.json name the platform
 *                   settings and the live preview events
 */
import { generateKeyPairSync } from "node:crypto"
import JSZip from "jszip"

import { fakeDb } from "./_fake-db"
import { fakeGitHub } from "./_fake-github"
import { setGitHubTransport, timing, type GitHubConfig } from "@/lib/github-sync/github"
import { applyPush, exportSite, platformDefinitionNote, type GitHubLink } from "@/lib/github-sync/sync"
import { PLATFORM_SETTINGS_PATH, readsBack, roleOf } from "@/lib/github-sync/layout"
import { agentsGuide } from "@/lib/github-sync/core"
import {
  placementNotes,
  LIVE_PREVIEW_EVENTS,
  checkPlatformValues,
  compatThemeGroups,
  platformSettingsDoc,
  withPlatformValues,
  withoutPlatformDefaults,
} from "@/lib/storelib-theme/platform-settings"
import { OVERRIDE_GROUP } from "@/lib/storelib-theme/compat/overrides"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` :: ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 600)}` : ""}`)
  }
}

const INSTALL = "11111111-1111-4111-8111-111111111111"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const REPO = "drew/site"
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const cfg: GitHubConfig = { appId: "1", privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(), slug: "storelib", clientId: "c", clientSecret: "s", webhookSecret: "w" }
timing.sleep = async () => {}

const VALUE_IDS = OVERRIDE_GROUP.settings.filter((s) => s.type !== "header").map((s) => s.id)

function linkRow(): GitHubLink & Record<string, unknown> {
  return { install_id: INSTALL, creator_id: CREATOR, installation_id: 1, account_login: "drew", repo_id: 99, repo_full_name: REPO, branch: "main", root_path: "", last_synced_sha: null, last_synced_at: null, last_error: null, push_on_save: true, pull_on_push: true, sync_state: {} }
}
const link = (db: ReturnType<typeof fakeDb>) => db.tables.theme_github_links.find((l) => l.install_id === INSTALL) as GitHubLink

async function pushAs(gh: ReturnType<typeof fakeGitHub>, db: ReturnType<typeof fakeDb>, files: Record<string, string | null>) {
  const before = gh.repos.get(REPO)!.refs.get("main")!
  const after = gh.commitFiles(REPO, "main", files, "Agent change")
  const outcomes = await applyPush(db, cfg, {
    ref: "refs/heads/main",
    before,
    after,
    repository: { id: 99, full_name: REPO },
    installation: { id: 1 },
    sender: { login: "codex" },
    pusher: { name: "codex" },
    commits: [{ message: "Agent change", added: [], modified: Object.keys(files), removed: [] }],
  })
  return { outcomes, after }
}

/** An imported theme whose own settings_schema.json places one of Storelib's ids itself. */
async function importedTheme(themeSchema: unknown[]) {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<html><body>{{ content_for_layout }}</body></html>")
  zip.file("sections/hero.liquid", '<div class="hero">{{ section.settings.heading }}</div>\n{% schema %}\n{"name":"Hero","settings":[{"type":"text","id":"heading","label":"Heading","default":"Hi"}],"presets":[{"name":"Hero"}]}\n{% endschema %}')
  zip.file("templates/index.json", JSON.stringify({ sections: { s1: { type: "hero", settings: { heading: "Welcome" } } }, order: ["s1"] }))
  zip.file("config/settings_schema.json", JSON.stringify(themeSchema))
  zip.file("config/settings_data.json", JSON.stringify({ current: { accent: "#123456" } }))
  const converted = await convertShopifyTheme(zip)
  if (converted.ok === false) throw new Error(converted.error)
  const t = converted.theme
  return {
    store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "Mini" }],
    store_theme_settings: [{ install_id: INSTALL, settings: t.settings, draft_settings: null }],
    store_theme_pages: t.pages.map((p, i) => ({ id: `p${i}`, install_id: INSTALL, page_key: p.page_key, sections: p.sections, draft_sections: null })),
    store_theme_custom_files: Object.entries(t.files).map(([path, content]) => ({ install_id: INSTALL, path, content, draft_content: null })),
    theme_github_links: [linkRow()],
    theme_github_events: [],
    theme_agent_activity: [],
    store_theme_file_versions: [],
    store_theme_backups: [],
    store_menus: [] as Record<string, unknown>[],
  }
}

async function main() {
  console.log("\nThe builder: the theme's placement wins")
  {
    const all = compatThemeGroups([])
    const mine = all.at(-1)!
    check("with no panel of the theme's, Theme settings is Storelib's Hover and focus, whole", all.length === 1 && mine.name === "Hover and focus" && mine.settings.length === OVERRIDE_GROUP.settings.length)
    const own = [{ name: "Colors", settings: [{ type: "color", id: "accent", label: "Accent" }, { type: "color", id: "storelib_link_hover", label: "Link hover" }] }]
    const groups = compatThemeGroups(own as never)
    const left = groups.at(-1)!.settings.map((s) => s.id)
    check("a storelib_* id the theme declares is drawn in the theme's group", groups[0].settings.some((s) => s.id === "storelib_link_hover"))
    check("  and leaves Storelib's group, its heading with it", !left.includes("storelib_link_hover") && !left.includes("storelib_hdr_links") && left.includes("storelib_button_hover_bg") && left.includes("storelib_hdr_inputs"), left)
    const everything = [{ name: "Mine", settings: VALUE_IDS.map((id) => ({ type: "text", id, label: id })) }]
    check("a theme that declares every one has no Storelib group at all", compatThemeGroups(everything as never).length === 1)
    const builder = (await import("node:fs")).readFileSync("components/website-builder/compat/compat-theme-settings.tsx", "utf8")
    check("the builder's panel draws its groups through compatThemeGroups, every time it reads them", (builder.match(/themeGroups\(/g) ?? []).length >= 4 && !/OVERRIDE_GROUP/.test(builder))
  }

  console.log("\nExport of an imported theme: what each setting is, and every value")
  const themeSchema = [
    { name: "theme_info", theme_name: "Mini", theme_version: "1.0.0" },
    { name: "Colors", settings: [{ type: "color", id: "accent", label: "Accent", default: "#000000" }, { type: "color", id: "storelib_link_hover", label: "Link hover", default: "#ff00ff" }] },
  ]
  const tables = await importedTheme(themeSchema)
  const db = fakeDb(tables as never)
  const gh = fakeGitHub()
  setGitHubTransport(gh.transport)
  gh.newRepo(REPO, "main", { "README.md": "x" })
  await exportSite(db, cfg, link(db), "Mini", { fetchMedia: null })
  const text = (p: string) => gh.text(REPO, "main", p) ?? ""
  {
    const doc = JSON.parse(text(PLATFORM_SETTINGS_PATH) || "{}")
    const panel = doc.panels?.[0]
    const byId = new Map<string, any>((panel?.settings ?? []).map((s: any) => [s.id, s]))
    check(`${PLATFORM_SETTINGS_PATH} is in the repository`, !!panel && panel.name === "Hover and focus" && doc.owner === "storelib")
    check("  every setting of the group, headings included, in order", (panel?.settings ?? []).map((s: any) => s.id).join() === OVERRIDE_GROUP.settings.map((s) => s.id).join())
    check("  each with its type, label, default and the group it shows in",
      VALUE_IDS.every((id) => { const s = byId.get(id); return s && typeof s.type === "string" && typeof s.label === "string" && "default" in s && s.group === "Hover and focus" }))
    check("  under the heading it shows under", byId.get("storelib_button_hover_border")?.heading === "Buttons on hover" && byId.get("storelib_input_radius")?.heading === "Fields")
    check("  a select with its options, a range with its bounds", byId.get("storelib_button_hover_effect")?.options?.length === 5 && byId.get("storelib_input_radius")?.min === -1 && byId.get("storelib_input_radius")?.max === 24)
    check("  the one the theme places itself is said to be, and not shown in Storelib's group", byId.get("storelib_link_hover")?.shown === false && byId.get("storelib_link_hover")?.placed_by_theme === true && byId.get("storelib_button_hover_bg")?.shown === true)
    check("  and where the values are", doc.values_in === "config/settings.json" && doc.values_at === "shopify")
    check("it is to read: Storelib writes it, a push does not take it", roleOf(PLATFORM_SETTINGS_PATH, { compat: true }) === "reference" && roleOf(PLATFORM_SETTINGS_PATH, { compat: false }) === "reference" && !readsBack(roleOf(PLATFORM_SETTINGS_PATH, { compat: true })))

    const shop = JSON.parse(text("config/settings.json")).shopify ?? {}
    const mineIds = VALUE_IDS.filter((id) => id !== "storelib_link_hover")
    check("config/settings.json has every one of Storelib's values, the defaults written out", mineIds.every((id) => id in shop), mineIds.filter((id) => !(id in shop)))
    check("  as the builder draws them", shop.storelib_button_hover_effect === "theme" && shop.storelib_input_radius === -1 && shop.storelib_button_hover_bg === "")
    check("  beside the theme's own", shop.accent === "#123456")
    check("  and the database is not touched by writing them out", (db.tables.store_theme_settings[0].settings.shopify ?? {}).storelib_button_hover_effect === undefined)

    const panelFile = JSON.parse(text("shopify/config/settings_panel.json") || "[]") as any[]
    const last = panelFile.at(-1)
    check("settings_panel.json lists Storelib's group last, saying whose it is and where it is described", last?.name === "Hover and focus" && last?.source === "storelib" && last?.defined_in === PLATFORM_SETTINGS_PATH && /under "shopify"/.test(last?.values_in ?? ""))
    check("  without the setting the theme places itself", !last.settings.some((s: any) => s.id === "storelib_link_hover") && panelFile.some((g) => g !== last && g.settings.some((s: any) => s.id === "storelib_link_hover")))

    const manifest = JSON.parse(text("storelib.json"))
    check("storelib.json names the platform settings and where they are", manifest.platform_settings?.defined_in === PLATFORM_SETTINGS_PATH && manifest.platform_settings.values_at === "shopify" && manifest.platform_settings.panels.join() === "Hover and focus" && manifest.reference_only.includes(PLATFORM_SETTINGS_PATH))
    check("  and the live preview events", manifest.live_preview?.events?.map((e: any) => e.event).join() === "storelib:settings-change,storelib:section-load")
    const readme = text("README.md")
    const agents = text("AGENTS.md")
    for (const [name, body] of [["README.md", readme], ["AGENTS.md", agents]] as const) {
      check(`${name} names ${PLATFORM_SETTINGS_PATH}, where the values are, and both canvas events`, body.includes(PLATFORM_SETTINGS_PATH) && /under `"?shopify"?`/.test(body) && body.includes("storelib:settings-change") && body.includes("storelib:section-load"))
      check(`  ${name} says the theme's own declaration wins`, /declare(s)? (one of these ids|its id)/.test(body))
      /* The rulebook at the end of AGENTS.md quotes the banned words to ban them: only the parts this round wrote are read. */
      const ours = body.slice(body.indexOf("Settings Storelib adds"), body.indexOf("Settings Storelib adds") + 2400)
      check(`  ${name} has no em dash, and the new parts none of the banned words`, !/\u2014/.test(body) && ours.length > 200 && !/seamless|effortless|unlock|supercharge|elevate|powerful/i.test(ours))
    }
    const calls = gh.calls.length
    const again = await exportSite(db, cfg, link(db), "Mini", { fetchMedia: null })
    check("an export of the same site again is no commit: the defaults and the description are stable", again === null && !gh.calls.slice(calls).some((c) => c.method === "POST" && /\/git\/commits$/.test(c.path)))
  }

  console.log("\nA push of an imported theme's settings")
  {
    const settings = JSON.parse(text("config/settings.json"))
    settings.shopify.storelib_button_hover_bg = "#ff0000"
    settings.shopify.storelib_input_radius = 6
    const doc = JSON.parse(text(PLATFORM_SETTINGS_PATH))
    doc.panels[0].name = "Renamed by an agent"
    const { outcomes, after } = await pushAs(gh, db, { "config/settings.json": JSON.stringify(settings, null, 2), [PLATFORM_SETTINGS_PATH]: JSON.stringify(doc, null, 2) })
    const o = outcomes[0]
    const stored = (db.tables.store_theme_settings[0].draft_settings?.shopify ?? {}) as Record<string, unknown>
    check("the settings are taken", o.saved.includes("config/settings.json") && o.failed.length === 0, o.failed)
    check("  a value changed in the repository is the builder's now", stored.storelib_button_hover_bg === "#ff0000" && stored.storelib_input_radius === 6)
    check("  a default sent back as it was is left unset, so it stays Storelib's default", !("storelib_button_hover_effect" in stored) && !("storelib_input_focus" in stored), stored)
    check("  the theme's own values and the compat marker are as they were", stored.accent === "#123456" && !!db.tables.store_theme_settings[0].draft_settings.compat)
    const note = o.notes.find((n) => n.path === PLATFORM_SETTINGS_PATH)
    check("an edit to the definitions is a note, not a refusal, saying where to change values and how to place one", !!note && note.note === platformDefinitionNote(true) && /settings\.json under "shopify"/.test(note.note) && /settings_schema\.json/.test(note.note))
    check("  so the commit is green", gh.repos.get(REPO)!.statuses.find((s) => s.sha === after)?.state === "success")

    const bad = JSON.parse(text("config/settings.json"))
    bad.shopify.storelib_button_hover_effect = "wobble"
    bad.shopify.storelib_input_radius = 99
    bad.shopify.storelib_button_hover_text = "red; background:url(x)"
    const second = (await pushAs(gh, db, { "config/settings.json": JSON.stringify(bad, null, 2) })).outcomes[0]
    const now = db.tables.store_theme_settings[0].draft_settings.shopify as Record<string, unknown>
    check("a value its control cannot take is kept as it was, and said with what it takes",
      now.storelib_input_radius === 6 && !("storelib_button_hover_effect" in now) && !("storelib_button_hover_text" in now) &&
      second.notes.some((n) => /storelib_button_hover_effect" is one of theme, none, lift, darken, underline/.test(n.note)) && second.notes.some((n) => /storelib_input_radius" is a number from -1 to 24/.test(n.note)) && second.notes.some((n) => /storelib_button_hover_text" is a colour/.test(n.note)),
      second.notes)
  }

  console.log("\nThe push's result, readable with the repository's own access")
  {
    const repo = gh.repos.get(REPO)!
    const settings = JSON.parse(text("config/settings.json"))
    settings.shopify.storelib_link_hover = "#00ff00"
    const { after } = await pushAs(gh, db, { "config/settings.json": JSON.stringify(settings, null, 2) })
    const comment = repo.comments.find((c) => c.sha === after)
    check("a push that was taken in full gets a comment too, naming each file taken", !!comment && /1 file taken/.test(comment.body) && /- `config\/settings\.json`/.test(comment.body), comment?.body)
    check("  and the same words as a git note on the commit, in refs/notes/storelib", gh.note(REPO, after) === comment?.body)
    const status = repo.statuses.find((s) => s.sha === after)
    check("the status's Details link is the comment on GitHub, not a page that needs a Storelib login", status?.target_url === comment?.html_url && /github\.com/.test(status?.target_url ?? ""))
    const notesHead = repo.refs.get("refs/notes/storelib")!
    const notesBefore = Object.keys(gh.filesAt(REPO, "refs/notes/storelib")).length
    const broken = (await pushAs(gh, db, { "sections/broken.storelib": "<template>\n<div>{{ </div>\n</template>" })).after
    check("a push with a refused file is noted the same way, the notes ref moved forward, older notes kept",
      /broken\.storelib/.test(gh.note(REPO, broken) ?? "") && Object.keys(gh.filesAt(REPO, "refs/notes/storelib")).length === notesBefore + 1 && repo.commits.get(repo.refs.get("refs/notes/storelib")!)!.parents[0] === notesHead)
    check("  and the status is red with its Details on the comment", repo.statuses.find((s) => s.sha === broken)?.state === "failure" && repo.statuses.find((s) => s.sha === broken)?.target_url === repo.comments.find((c) => c.sha === broken)?.html_url)
    const before = repo.comments.length
    const guide = agentsGuide({ siteName: "Mini", branch: "main", root: "", kind: "shopify" })
    check("AGENTS.md says how to read the note, the comment and the status", /git fetch origin refs\/notes\/storelib:refs\/notes\/storelib/.test(guide) && /git notes --ref=storelib show/.test(guide) && /commits\/<sha>\/comments/.test(guide) && /commits\/<sha>\/status/.test(guide))
    check("  no comment was posted for nothing", repo.comments.length === before)
  }

  console.log("\nA Storelib theme: Storelib's built-in groups the same way")
  {
    const nativeDb = fakeDb({
      store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "Astrid" }],
      store_theme_settings: [{ install_id: INSTALL, settings: {}, draft_settings: { brand_name: "Astrid", menus: { main: { title: "Main", links: [{ title: "Theme copy", url: "/old" }] } } } }],
      store_theme_pages: [{ id: "p1", install_id: INSTALL, page_key: "home", sections: [], draft_sections: [{ id: "header", type: "header", name: "Header", settings: {} }, { id: "footer", type: "footer", name: "Footer", settings: {} }] }],
      store_theme_custom_files: [
        {
          install_id: INSTALL,
          path: "config/settings_schema.json",
          content: JSON.stringify([{ name: "Layout", id: "layout", settings: [{ type: "range", id: "page_width", label: "Max page width", min: 900, max: 1800, step: 20, unit: "px", default: 1400 }] }]),
          draft_content: null,
        },
      ],
      store_menus: [{ creator_id: CREATOR, menus: { main: { title: "Main", links: [{ title: "Shop", url: "/shop" }] } } }],
      theme_github_links: [linkRow()],
      theme_github_events: [],
      theme_agent_activity: [],
      store_theme_file_versions: [],
      store_theme_backups: [],
    } as never)
    const g = fakeGitHub()
    setGitHubTransport(g.transport)
    g.newRepo(REPO, "main", { "README.md": "x" })
    await exportSite(nativeDb, cfg, link(nativeDb), "Astrid", { fetchMedia: null })
    const t = (p: string) => g.text(REPO, "main", p) ?? ""
    const doc = JSON.parse(t(PLATFORM_SETTINGS_PATH) || "{}")
    check(`${PLATFORM_SETTINGS_PATH} lists every one of Storelib's groups, by id and name`, (doc.panels ?? []).map((p: any) => p.id).join() === THEME_SETTINGS_GROUPS.map((g) => g.id).join() && doc.values_at === "")
    check("  says which of them the theme's own file lists", doc.panels.find((p: any) => p.id === "layout").settings.find((s: any) => s.id === "page_width").listed_by_theme === true && doc.panels.find((p: any) => p.id === "layout").settings.find((s: any) => s.id === "border_radius").listed_by_theme === false)
    check("  and the built-in colour schemes' colours, since settings.json keeps only what differs", Object.keys(doc.color_schemes?.built_in ?? {}).join() === "white,light,dark,black,highlight" && typeof doc.color_schemes.built_in.dark.background === "string")
    const settings = JSON.parse(t("config/settings.json"))
    check("config/settings.json has every value, the theme's default where it moved one, Storelib's elsewhere", settings.page_width === 1400 && settings.border_radius === 8 && settings.button_style === "filled" && settings.brand_name === "Astrid")
    check("the menus are the store's, as the builder's Navigation shows them, not the theme's old copy", settings.menus?.main?.links?.[0]?.title === "Shop")
    check("the README's table names the file", /config\/storelib_settings_schema\.json/.test(t("README.md")) && /Storelib's own Theme settings/.test(t("README.md")))

    settings.brand_name = "Drew Co"
    settings.button_shape = "pill"
    settings.menus = { main: { title: "Main", links: [{ title: "Shop", url: "/shop" }, { title: "About", url: "/about" }] } }
    const before = g.repos.get(REPO)!.refs.get("main")!
    const after = g.commitFiles(REPO, "main", { "config/settings.json": JSON.stringify(settings, null, 2) }, "agent")
    const out = (await applyPush(nativeDb, cfg, { ref: "refs/heads/main", before, after, repository: { id: 99, full_name: REPO }, installation: { id: 1 }, sender: { login: "codex" }, pusher: { name: "codex" }, commits: [{ message: "agent", modified: ["config/settings.json"] }] }))[0]
    const draft = nativeDb.tables.store_theme_settings[0].draft_settings as Record<string, unknown>
    check("a push takes the values changed", out.saved.includes("config/settings.json") && draft.brand_name === "Drew Co" && draft.button_shape === "pill", out.failed)
    check("  and leaves every default it sent back unset", !("button_style" in draft) && !("border_radius" in draft) && !("cookie_bg" in draft))
    /* The fake's upsert keeps the row that is there unless told otherwise; what was sent is what PostgREST merges. */
    const sent = nativeDb.log.filter((l) => l.table === "store_menus" && l.op === "insert").at(-1)?.payload as { creator_id?: string; menus?: Record<string, { links: { title: string }[] }> } | undefined
    check("a change to the menus is written to the store's menus, which every theme shows", sent?.creator_id === CREATOR && sent?.menus?.main.links.map((l) => l.title).join() === "Shop,About", sent)
  }

  console.log("\nThe pure parts")
  {
    const s = withPlatformValues({ shopify: { storelib_button_hover_bg: "#111111" } }, "shopify")
    check("a chosen value is never replaced by its default", (s.shopify as any).storelib_button_hover_bg === "#111111" && (s.shopify as any).storelib_button_hover_effect === "theme")
    check("withoutPlatformDefaults keeps a value that was set before, even at its default", (withoutPlatformDefaults({ shopify: { storelib_button_hover_effect: "theme" } }, { shopify: { storelib_button_hover_effect: "theme" } }, "shopify").shopify as any).storelib_button_hover_effect === "theme")
    check("checkPlatformValues takes a value its control takes", checkPlatformValues({ shopify: { storelib_button_hover_effect: "lift" } }, {}, "shopify").notes.length === 0)
    check("platformSettingsDoc is the same for the same theme", JSON.stringify(platformSettingsDoc("shopify")) === JSON.stringify(platformSettingsDoc("shopify")))
    check("LIVE_PREVIEW_EVENTS names the two canvas events", LIVE_PREVIEW_EVENTS.map((e) => e.event).join() === "storelib:settings-change,storelib:section-load")
  }

  {
    console.log("\nA push that places Storelib's settings is told where each now shows")
    const schema = (groups: Record<string, string[]>) => JSON.stringify(Object.entries(groups).map(([name, ids]) => ({ name, settings: ids.map((id) => ({ id, type: "color", label: id })) })))
    const none = schema({ Buttons: ["button_radius"] })
    const three = schema({ Buttons: ["storelib_button_hover_bg", "storelib_button_hover_text", "storelib_button_hover_effect"] })
    const all = schema({ Buttons: ["storelib_button_hover_bg", "storelib_button_hover_text", "storelib_button_hover_border", "storelib_button_hover_effect"], Links: ["storelib_link_hover"], "Form fields": ["storelib_input_border", "storelib_input_focus", "storelib_input_radius"] })
    const placed = placementNotes(none, three)
    check("each id the theme now declares: shown in its group, out of Hover and focus", placed.length === 3 && placed.every((n) => /now shows in Theme settings › Buttons/.test(n) && /no longer in Hover and focus/.test(n)), placed)
    check("  the panel stays while it still has settings of its own", !placed.some((n) => /is no longer shown/.test(n)))
    const moved = placementNotes(three, all)
    check("placing the rest says each group, and that the panel is gone", moved.some((n) => /storelib_link_hover.*Links/.test(n)) && moved.some((n) => /storelib_input_radius.*Form fields/.test(n)) && moved.some((n) => /Hover and focus is no longer shown/.test(n)), moved)
    check("  ids already placed are not said again", !moved.some((n) => /storelib_button_hover_bg/.test(n)))
    const back = placementNotes(three, none)
    check("an id the theme stops declaring is said to be back in Hover and focus", back.length === 3 && back.every((n) => /shows in Hover and focus again/.test(n)), back)
    check("an unchanged schema says nothing", placementNotes(three, three).length === 0)
    check("a schema that does not read says nothing", placementNotes(three, "{not json").length === 3 && placementNotes("{", "{").length === 0)
    const src = (await import("node:fs")).readFileSync("lib/github-sync/sync.ts", "utf8")
    check("the push writes these notes on the commit for shopify/config/settings_schema.json", /f\.path === SETTINGS_SCHEMA_FILE\) for \(const note of placementNotes\(snap\.files\[f\.path\]/.test(src))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
