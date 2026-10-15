/**
 * ===========================================================================
 *  A SCHEMA CHANGED IN THE REPOSITORY OR BY STORELIB AI REACHES THE SIDEBAR
 * ===========================================================================
 * The owner: "I tell Codex or Claude Code to change the section settings of
 * the sidebar, or the theme settings, and it doesn't do that." And a push
 * loaded the whole editor again instead of changing it in place.
 *
 * What was wrong, each reproduced here through the code path it runs on:
 *
 *   imported theme, section schema   a push that changed it was refused
 *                                    (compatSchemaChange), and a save from
 *                                    anywhere else kept the builder's panel
 *                                    as the import made it
 *   imported theme, theme settings   shopify/config/settings_panel.json was
 *                                    made once, at import: a changed
 *                                    settings_schema.json drew on the page
 *                                    and never reached Theme settings
 *   Storelib theme, theme settings   config/settings_schema.json is Storelib's
 *                                    own; a change to it was a quiet note
 *                                    under a green commit, read as "done"
 *   Storelib AI                      an imported theme's file failed
 *                                    Storelib's compiler on its first tag, and
 *                                    the assistant had no word on where a
 *                                    sidebar setting comes from
 *   the open editor                  a push loaded the whole editor again;
 *                                    the imported theme's Theme settings
 *                                    never read their file again
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/schema-edits-sidebar.test.ts
 */
import { generateKeyPairSync } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

import { fakeDb } from "./_fake-db"
import { fakeGitHub } from "./_fake-github"
import { setGitHubTransport, timing, type GitHubConfig } from "@/lib/github-sync/github"
import { applyPush, exportSite, readOnlySchemaRefusal, type GitHubLink } from "@/lib/github-sync/sync"
import { agentsGuide } from "@/lib/github-sync/core"
import { editorReport } from "@/lib/github-sync/editor-status"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { schemaFor, schemaFromStorelib } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { shopifySchemaOf, splitCompatFile } from "@/lib/storelib-theme/compat/theme"
import { SETTINGS_PANEL_FILE, SETTINGS_SCHEMA_FILE, buildSettingsPanel, compatSchemaWords, syncCompatFile } from "@/lib/storelib-theme/compat/schema-sync"
import { checkSectionSource } from "@/lib/website-builder/agent/compile-feedback"
import { describeSchemaRules } from "@/lib/website-builder/agent/loop"
import { toolStepLabel } from "@/lib/website-builder/agent/step-labels"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const DEFAULT = DEFAULT_THEME_SOURCES as Record<string, string>

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

function linkRow(): GitHubLink & Record<string, unknown> {
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
  }
}
const link = (db: ReturnType<typeof fakeDb>) => db.tables.theme_github_links.find((l) => l.install_id === INSTALL) as GitHubLink

async function pushAs(gh: ReturnType<typeof fakeGitHub>, db: ReturnType<typeof fakeDb>, files: Record<string, string>) {
  const before = gh.repos.get(REPO)!.refs.get("main")!
  const after = gh.commitFiles(REPO, "main", files, "Agent change")
  const outcomes = await applyPush(db, cfg, {
    ref: "refs/heads/main",
    before,
    after,
    repository: { id: 99, full_name: REPO },
    installation: { id: 1 },
    sender: { login: "drew" },
    pusher: { name: "drew" },
    commits: [{ message: "Agent change", added: [], modified: Object.keys(files), removed: [] }],
  })
  return { o: outcomes[0], after }
}

/* The schema JSON inside a compatible file, whole: the builder's part and the theme's own under "shopify". */
const schemaOf = (source: string) => splitCompatFile(source).schema as Record<string, unknown>
const theirsOf = (source: string) => shopifySchemaOf(splitCompatFile(source).schema)
const withTheirs = (source: string, theirs: Record<string, unknown>) =>
  source.replace(/<schema>[\s\S]*<\/schema>/, () => `<schema>\n${JSON.stringify({ ...schemaOf(source), shopify: theirs }, null, 2)}\n</schema>`)

async function importedSite() {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<!doctype html><html><head>{{ content_for_header }}</head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>")
  zip.file(
    "sections/slideshow.liquid",
    '<div class="slideshow">{{ section.settings.heading }}{% for block in section.blocks %}<p>{{ block.settings.caption }}</p>{% endfor %}</div>\n{% schema %}\n' +
      JSON.stringify({
        name: "Slideshow",
        settings: [
          { type: "text", id: "heading", label: "t:settings.heading", default: "Hi" },
          { type: "checkbox", id: "autoplay", label: "Autoplay", default: true },
        ],
        blocks: [{ type: "slide", name: "Slide", settings: [{ type: "text", id: "caption", label: "Caption" }] }],
        presets: [{ name: "Slideshow", blocks: [{ type: "slide" }] }],
      }) +
      "\n{% endschema %}",
  )
  zip.file("sections/header.liquid", '<header>{{ shop.name }}</header>\n{% schema %}\n{"name":"Header","settings":[]}\n{% endschema %}')
  zip.file("sections/header-group.json", JSON.stringify({ type: "header", name: "Header group", sections: { header: { type: "header", settings: {} } }, order: ["header"] }))
  zip.file("templates/index.json", JSON.stringify({ sections: { s1: { type: "slideshow", settings: { heading: "Welcome", autoplay: false } } }, order: ["s1"] }))
  zip.file(
    "config/settings_schema.json",
    JSON.stringify([
      { name: "theme_info", theme_name: "Mini", theme_version: "1.0.0" },
      { name: "t:groups.colors", settings: [{ type: "color", id: "accent", label: "Accent", default: "#111111" }] },
    ]),
  )
  zip.file("config/settings_data.json", JSON.stringify({ current: { accent: "#ff0000" } }))
  zip.file("locales/en.default.schema.json", JSON.stringify({ settings: { heading: "Heading" }, groups: { colors: "Colours", layout: "Layout" } }))
  zip.file("locales/en.default.json", JSON.stringify({ general: { hi: "Hi" } }))
  const converted = await convertShopifyTheme(zip)
  if (converted.ok === false) throw new Error(converted.error)
  const t = converted.theme
  const tables = {
    store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "Mini" }],
    store_theme_settings: [{ install_id: INSTALL, settings: t.settings, draft_settings: null }],
    store_theme_pages: t.pages.map((p, i) => ({ id: `p${i}`, install_id: INSTALL, page_key: p.page_key, sections: p.sections, draft_sections: null })),
    store_theme_custom_files: Object.entries(t.files).map(([path, content]) => ({ install_id: INSTALL, path, content, draft_content: null })),
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
  await exportSite(db, cfg, link(db), "Mini", { fetchMedia: null })
  const row = (p: string) => tables.store_theme_custom_files.find((r) => r.path === p) as { path: string; content: string; draft_content: string | null } | undefined
  const text = (p: string) => {
    const r = row(p)
    return r ? (r.draft_content ?? r.content) : undefined
  }
  return { gh, db, tables, row, text }
}

async function main() {
  console.log("\nAn imported theme: a section's schema changed on GitHub reaches its panel")
  {
    const { gh, db, tables, text } = await importedSite()
    const before = text("sections/slideshow.storelib")!
    const sidebarBefore = schemaFromStorelib(before, "sections/slideshow.storelib")
    check("the import's panel is what the sidebar draws (heading in the theme's words, autoplay)", sidebarBefore.ok === true && sidebarBefore.schema.fields.map((f) => f.id).join() === "heading,autoplay" && sidebarBefore.schema.fields[0].label === "Heading", sidebarBefore)

    /* The agent edits the theme's own schema, as AGENTS.md says: a new setting, one removed, a new block, a new preset, and one the builder has no control for. */
    const theirs = JSON.parse(JSON.stringify(theirsOf(before))) as Record<string, any>
    theirs.settings = [
      theirs.settings[0],
      { type: "text", id: "subheading", label: "Subheading", default: "From Codex" },
      { type: "range", id: "speed", label: "Speed", min: 1, max: 10, step: 1, default: 5 },
      { type: "metaobject", id: "story", label: "Story" },
    ]
    theirs.blocks.push({ type: "quote", name: "Quote", settings: [{ type: "textarea", id: "words", label: "Words" }] })
    theirs.presets.push({ name: "Slideshow with a quote", blocks: [{ type: "quote" }] })
    const pushed = withTheirs(before, theirs)
    const { o, after } = await pushAs(gh, db, { "sections/slideshow.storelib": pushed })
    check("the push is taken, not refused", o.saved.includes("sections/slideshow.storelib") && o.failed.length === 0, o.failed)
    const kept = text("sections/slideshow.storelib")!
    const sidebar = schemaFromStorelib(kept, "sections/slideshow.storelib")
    const ids = sidebar.ok === true ? sidebar.schema.fields.map((f) => f.id) : []
    check("the sidebar config has the new settings, with their defaults", ids.includes("subheading") && ids.includes("speed") && sidebar.ok === true && sidebar.schema.fields.find((f) => f.id === "speed")?.default === 5, ids)
    check("  and not the removed one", !ids.includes("autoplay"), ids)
    check("  a setting the builder has no control for is left out of the panel, and the commit names it", !ids.includes("story") && o.notes.some((n) => n.path === "sections/slideshow.storelib" && /story/.test(n.note) && /metaobject/.test(n.note)), o.notes)
    check("the new block and preset are in the panel", sidebar.ok === true && !!sidebar.schema.blocks?.some((b) => b.type === "quote") && !!sidebar.schema.presets?.some((p) => p.name === "Slideshow with a quote"))
    check("ONE READING: every control in the panel is a setting the page is drawn with", ids.every((id) => (theirsOf(kept).settings as { id: string }[]).some((s) => s.id === id)))
    check("  and the theme's own schema is kept exactly as pushed", JSON.stringify(theirsOf(kept)) === JSON.stringify(theirs))
    check("the value the creator set on the page is kept (heading), and nothing new is written into the page", JSON.stringify(tables.store_theme_pages.find((p) => p.page_key === "home")!.draft_sections) === "null")
    check("an open builder hears about the file", tables.theme_agent_activity.some((a: any) => a.path === "sections/slideshow.storelib" && a.action === "updated"))
    check("the commit is green", gh.repos.get(REPO)!.statuses.find((s) => s.sha === after)?.state === "success")

    const broken = pushed.replace(/<schema>[\s\S]*<\/schema>/, "<schema>\n{\n  \"name\": \"Slideshow\",\n  \"settings\": [,]\n}\n</schema>")
    const bad = await pushAs(gh, db, { "sections/slideshow.storelib": broken })
    check("a schema that is not JSON is refused with its file and line, and the last good one stays", bad.o.failed.some((f) => f.path === "sections/slideshow.storelib" && /not valid JSON/.test(f.error) && typeof f.line === "number") && text("sections/slideshow.storelib") === kept, bad.o.failed)
  }

  console.log("\nAn imported theme: its settings_schema.json changed on GitHub reaches Theme settings")
  {
    const { gh, db, text } = await importedSite()
    const panelBefore = JSON.parse(text(SETTINGS_PANEL_FILE)!) as { name: string; settings: { id: string }[] }[]
    check("the import made the panel from the schema, in the theme's words", panelBefore.length === 1 && panelBefore[0].name === "Colours" && panelBefore[0].settings[0].id === "accent", panelBefore)
    const schema = JSON.parse(text(SETTINGS_SCHEMA_FILE)!) as Record<string, any>[]
    schema[1].settings.push({ type: "checkbox", id: "rounded", label: "Rounded corners", default: false })
    schema.push({ name: "t:groups.layout", settings: [{ type: "range", id: "page_width", label: "Page width", min: 800, max: 1600, step: 10, default: 1200 }] })
    const { o } = await pushAs(gh, db, { [SETTINGS_SCHEMA_FILE]: JSON.stringify(schema, null, 2) })
    check("the push is taken", o.saved.includes(SETTINGS_SCHEMA_FILE) && o.failed.length === 0, o.failed)
    const panel = JSON.parse(text(SETTINGS_PANEL_FILE)!) as { name: string; settings: { id: string; default?: unknown }[] }[]
    check("Theme settings now have the new group and the new setting", panel.map((g) => g.name).join() === "Colours,Layout" && panel[0].settings.some((s) => s.id === "rounded") && panel[1].settings[0].id === "page_width", panel)
    check("  made exactly as the import makes it", JSON.stringify(panel) === JSON.stringify(JSON.parse((buildSettingsPanel(JSON.stringify(schema), { accent: "#ff0000" }, compatSchemaWords({ "shopify/locales/en.default.schema.json": text("shopify/locales/en.default.schema.json")! })) as { panel: string }).panel)))
    const notList = await pushAs(gh, db, { [SETTINGS_SCHEMA_FILE]: JSON.stringify({ name: "Colors" }) })
    check("a settings_schema.json that is not a list of groups is refused and said so", notList.o.failed.some((f) => f.path === SETTINGS_SCHEMA_FILE && /list of setting groups/.test(f.error)), notList.o.failed)
    check("  and Theme settings keep the last good panel", (JSON.parse(text(SETTINGS_PANEL_FILE)!) as unknown[]).length === 2)
    const panelPush = await pushAs(gh, db, { [SETTINGS_PANEL_FILE]: "[]" })
    check("the panel's own file is not taken from GitHub, and the note says which file to change", panelPush.o.notes.some((n) => n.path === SETTINGS_PANEL_FILE && n.note.includes(SETTINGS_SCHEMA_FILE)) && (JSON.parse(text(SETTINGS_PANEL_FILE)!) as unknown[]).length === 2)
  }

  console.log("\nThe same save from the code editor and Storelib AI (saveThemeFile)")
  {
    const { db, text } = await importedSite()
    const before = text("sections/slideshow.storelib")!
    const theirs = JSON.parse(JSON.stringify(theirsOf(before))) as Record<string, any>
    theirs.settings.push({ type: "text", id: "kicker", label: "Kicker" })
    const saved = await saveThemeFile(db as never, INSTALL, "sections/slideshow.storelib", withTheirs(before, theirs))
    check("a save that changed the theme's schema answers with the file as kept, its panel made again", saved.ok === true && typeof saved.source === "string" && /"id": "kicker"/.test(saved.source.split('"shopify": {')[0]))
    check("  and the code editor shows the file as kept", /typeof saved\?\.stored === "string"/.test(read("app/website-builder/code/[installId]/page.tsx")) && /stored: result\.source/.test(read("app/api/website-builder/themes/[installId]/files/route.ts")))
    const markup = await saveThemeFile(db as never, INSTALL, "sections/slideshow.storelib", text("sections/slideshow.storelib")!.replace('class="slideshow"', 'class="slideshow x"'))
    check("a save of the markup alone keeps the file exactly as sent", markup.ok === true && markup.source === undefined)
    const refused = await saveThemeFile(db as never, INSTALL, SETTINGS_SCHEMA_FILE, "{ nope")
    check("a settings_schema.json that is not JSON is refused with its line", refused.ok === false && refused.status === 422 && !!refused.errors?.length)
    const words = await saveThemeFile(db as never, INSTALL, "shopify/locales/en.default.schema.json", JSON.stringify({ settings: { heading: "Heading" }, groups: { colors: "Palette" } }))
    check("new words for the labels make Theme settings again too", words.ok === true && (JSON.parse(text(SETTINGS_PANEL_FILE)!) as { name: string }[])[0].name === "Palette")
  }

  console.log("\nA Storelib theme: a section's schema from GitHub reaches the sidebar; settings_schema.json is said to be read only")
  {
    const tables = {
      store_theme_installs: [{ id: INSTALL, creator_id: CREATOR, name: "Astrid" }],
      store_theme_settings: [{ install_id: INSTALL, settings: { brand_name: "Astrid" }, draft_settings: null }],
      store_theme_pages: [{ id: "p-home", install_id: INSTALL, page_key: "home", sections: [{ id: "promo-1", type: "my_promo", settings: { heading: "Keep me" } }], draft_sections: null }],
      store_theme_custom_files: [
        { install_id: INSTALL, path: "sections/my_promo.storelib", content: DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "my_promo"').replace(/"name": "Simple CTA"/, '"name": "My promo"'), draft_content: null },
      ],
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
    await exportSite(db, cfg, link(db), "Astrid", { fetchMedia: null })
    const promo = gh.text(REPO, "main", "sections/my_promo.storelib")!
    const schemaStart = promo.indexOf("<schema>") + "<schema>".length
    const schema = JSON.parse(promo.slice(schemaStart, promo.indexOf("</schema>"))) as Record<string, any>
    const withSchemaText = (s: unknown) => promo.slice(0, schemaStart) + "\n" + JSON.stringify(s, null, 2) + "\n" + promo.slice(promo.indexOf("</schema>"))
    const sidebarFields = () => {
      const sources = Object.fromEntries(tables.store_theme_custom_files.map((r: any) => [r.path, r.draft_content ?? r.content]))
      return schemaFor("my_promo", sources, SECTION_SCHEMAS)?.fields ?? []
    }
    const added = { ...schema, settings: [...schema.settings, { type: "range", id: "promo_gap", label: "Gap", min: 0, max: 40, step: 4, default: 8, unit: "px" }] }
    const { o } = await pushAs(gh, db, { "sections/my_promo.storelib": withSchemaText(added) })
    check("the push is taken", o.saved.includes("sections/my_promo.storelib"), o.failed)
    check("the sidebar config for the section has the new setting, with its default", sidebarFields().find((f) => f.id === "promo_gap")?.default === 8, sidebarFields().map((f) => f.id))
    const relabelled = { ...schema, settings: schema.settings.map((s: Record<string, unknown>) => (s.id === "heading" ? { ...s, label: "Big words" } : s)) }
    const second = await pushAs(gh, db, { "sections/my_promo.storelib": withSchemaText(relabelled) })
    check("a later push that removes it and relabels another: the panel follows", second.o.saved.includes("sections/my_promo.storelib") && !sidebarFields().some((f) => f.id === "promo_gap") && sidebarFields().find((f) => f.id === "heading")?.label === "Big words", second.o.failed)
    check("  and the page's own value is still there", (tables.store_theme_pages[0].sections[0].settings as Record<string, unknown>).heading === "Keep me")

    const settingsSchema = JSON.parse(gh.text(REPO, "main", "config/settings_schema.json")!) as unknown[]
    const red = await pushAs(gh, db, { "config/settings_schema.json": JSON.stringify([...settingsSchema, { id: "mine", label: "Mine", fields: [] }], null, 2) })
    check("a change to config/settings_schema.json is refused, not a quiet note under a green commit", red.o.failed.some((f) => f.path === "config/settings_schema.json" && f.kind === "theme-settings" && /config\/settings\.json/.test(f.error) && /<schema>/.test(f.error)) && gh.repos.get(REPO)!.statuses.find((s) => s.sha === red.after)?.state === "failure", red.o)
    const slideshow = gh.text(REPO, "main", "sections/slideshow.json")
    if (slideshow) {
      const ref = await pushAs(gh, db, { "sections/slideshow.json": slideshow.replace(/"name": "[^"]*"/, '"name": "Mine"') })
      check("a change to a built-in's reference schema says to write sections/<type>.storelib", ref.o.failed.some((f) => f.path === "sections/slideshow.json" && /sections\/slideshow\.storelib/.test(f.error)), ref.o.failed)
    }
    check("only those two kinds of file are refused as read only", readOnlySchemaRefusal("README.md") === null && readOnlySchemaRefusal("config/settings.json") === null)
    /* The report is of the last sync; the settings schema's was the push before the built-in's. */
    const report = editorReport({ ...link(db), sync_state: { ...link(db).sync_state, last: { ...link(db).sync_state!.last!, failed: red.o.failed } } })
    const row = report?.files.find((f) => f.path === "config/settings_schema.json")
    check("the builder says it in words, with what to change instead", !!row && /doesn't take changes/.test(row.title) && /config\/settings\.json/.test(row.fix) && !!row.detail, report?.files)
  }

  console.log("\nStorelib AI can change an imported theme's schema, and knows where a sidebar setting comes from")
  {
    const { text } = await importedSite()
    const source = text("sections/slideshow.storelib")!
    check("an imported theme's file is read by the theme engine, not refused by Storelib's compiler", checkSectionSource({ path: "sections/slideshow.storelib", type: "slideshow", source, strict: true }).ok === true)
    const broken = checkSectionSource({ path: "sections/slideshow.storelib", type: "slideshow", source: source.replace("{% endfor %}", ""), strict: true })
    check("  and broken markup is refused with what to fix", broken.ok === false && /did not read/.test(broken.feedback))
    const noSchema = checkSectionSource({ path: "sections/slideshow.storelib", type: "slideshow", source: source.replace(/<schema>[\s\S]*<\/schema>/, ""), strict: true })
    check("  and a file that lost its <schema> is refused", noSchema.ok === false && /<schema>/.test(noSchema.feedback))
    const ctx = { tr: compatSchemaWords({ "shopify/locales/en.default.schema.json": text("shopify/locales/en.default.schema.json")! }), blockTypes: [] }
    const theirs = JSON.parse(JSON.stringify(theirsOf(source))) as Record<string, any>
    theirs.settings.push({ type: "text", id: "kicker", label: "Kicker" })
    const synced = syncCompatFile("sections/slideshow.storelib", withTheirs(source, theirs), source, ctx)
    const back = synced.ok === true ? schemaFromStorelib(synced.source, "sections/slideshow.storelib") : null
    check("what the run keeps is what the sidebar will draw", back?.ok === true && back.schema.fields.some((f) => f.id === "kicker"))
    const imported = describeSchemaRules({ imported: true, settingsSchema: true })
    const native = describeSchemaRules({ imported: false, settingsSchema: false })
    check("the assistant is told to change the \"shopify\" part, never the panel, and keep ids", /"shopify" object/.test(imported) && /never edit it by hand/.test(imported) && /Keep every existing setting id/.test(imported) && /edit_theme_settings_schema/.test(imported))
    check("  and in a Storelib theme that the panel is the <schema>, and theme settings are Storelib's", /panel is its <schema>/.test(native) && /update_theme/.test(native) && !/edit_theme_settings_schema/.test(native))
    check("  in plain words: no em dash, none of the banned words", ![imported, native].some((t) => /—|\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(t)))
    const loop = read("lib/website-builder/agent/loop.ts")
    check("the theme settings tools are offered only with an imported theme's settings schema, and never while one section is locked", /settingsSchema: !!input\.code\?\.readSettingsSchema && !locked/.test(loop) && /name: "read_theme_settings_schema"/.test(loop) && /name: "edit_theme_settings_schema"/.test(loop))
    check("  and an edit goes through the same exact find and replace as a section's code", /applySourceEdits\(current, edits\)/.test(loop) && /code\.writeSettingsSchema\(applied\.source\)/.test(loop))
    check("  and what the route kept goes back into the run", /const keptSource = kept\.source \?\? prepared\.source/.test(loop) && /sourcesNow\[path\] = keptSource/.test(loop))
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("the route writes an imported theme's file through the same reading the save uses, and stages the settings schema with the run",
      /if \(importedTheme\) return isCompatSource\(agentSources\[path\]\) \? "own" : "product"/.test(route) && /syncCompatFile\(path, source, agentSources\[path\] \?\? null/.test(route) && /journal\.stage\(SETTINGS_SCHEMA_FILE, source\)/.test(route))
    check("the steps read as words", toolStepLabel("edit_theme_settings_schema", "{}", { section: () => null, type: (t) => t }) === "Changing the theme settings")
  }

  console.log("\nThe open editor takes a push in place")
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("a page or the settings a push rewrote is read again quietly: no loading state, the open section stays", /const loadData = useCallback\(async \(opts: \{ quiet\?: boolean \} = \{\}\) => \{\s*const quiet = opts\.quiet === true\s*if \(!quiet\) setLoading\(true\)/.test(editor) && /await loadData\(\{ quiet: true \}\)/.test(editor))
    check("  an edit made while it was on its way is not written over: the choice is shown", /if \(quiet && \(isDirtyRef\.current \|\| savingRef\.current\)\) \{\s*setSyncConflict/.test(editor))
    check("  a failed quiet read leaves the editor as it was", /if \(!quiet\) setLoadFailed\(true\)/.test(editor))
    check("an imported theme's Theme settings read their file again after a push, Storelib AI or the code editor", /setCompatPanelVersion\(\(n\) => n \+ 1\)/.test(editor) && /panelVersion=\{compatPanelVersion\}/.test(editor))
    const panel = read("components/website-builder/compat/compat-theme-settings.tsx")
    check("  only that one file, its draft, and the groups change in place", /files\?path=\$\{encodeURIComponent\(PANEL_FILE\)\}/.test(panel) && /\[installId, panelVersion\]/.test(panel) && /fresh\.current = true/.test(panel))
    check("the open editor follows with the activity log it already had, quicker on focus, no tight polling", /window\.addEventListener\("focus", wake\)/.test(read("components/website-builder/site-connections.tsx")))
  }

  console.log("\nAGENTS.md says where sidebar settings live")
  {
    const imported = agentsGuide({ siteName: "Mini", branch: "main", root: "", kind: "shopify" })
    const native = agentsGuide({ siteName: "Astrid", branch: "main", root: "", kind: "storelib" })
    check("an imported theme: change the \"shopify\" object; the panel is made from it", /`"shopify"` object inside its `<schema>`/.test(imported) && /shopify\/config\/settings_schema\.json/.test(imported) && !/Shopify|Liquid/.test(imported))
    check("a Storelib theme: the panel is the <schema>; settings_schema.json is Storelib's", /section's panel in the builder\s+follows/.test(native) && /config\/settings_schema\.json` are\s+Storelib's own/.test(native))
    check("  with no em dash", !/—/.test(imported + native))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
