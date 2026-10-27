/**
 * ===========================================================================
 *  THEME SETTINGS AS FILES, THE WAY A SHOPIFY THEME HAS THEM
 * ===========================================================================
 * The owner: AI coding agents, Storelib AI and agents connected through
 * GitHub, "can modify theme settings directly through theme schema/config
 * files, just like Shopify Liquid", and the sidebar follows at once with the
 * right values.
 *
 * What was there: Theme settings were hard coded in
 * lib/website-builder/theme-settings-schema.ts. config/settings_schema.json
 * was a copy for reading (a push of it was refused), and the code editor's
 * config/settings_data.json showed the defaults, not the values.
 *
 * What this holds, through the code each door runs:
 *
 *   the schema file      Shopify's format over Storelib's groups: reorder,
 *                        add, regroup, change a default or a range; unknown
 *                        types and broken files refused with their line
 *   the values file      the install's draft settings, both ways: the file
 *                        reads what the sidebar stored, a write is what the
 *                        sidebar then shows, null back to its default
 *   defaults             a new setting's default is under the values nobody
 *                        set, and the canvas has it before any save
 *   a section's schema   changed under an open editor: values kept by id,
 *                        new ones at their defaults, removed ones kept but
 *                        not drawn, a value outside a new range drawn at
 *                        its end and stored as it was
 *   every door           the code editor's save and read, an agent over
 *                        MCP, Storelib AI's run, a GitHub push, a package
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/theme-config-files-v.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import {
  THEME_DATA_FILE,
  THEME_SCHEMA_FILE,
  builtInSettingsSchema,
  builtInSettingsSchemaText,
  packageThemeConfig,
  readSettingsData,
  readThemeSettingsSchema,
  schemaDefaults,
  settingsDataText,
  shownValue,
  themeSettingsGroupsFor,
  withThemeDefaults,
} from "@/lib/storelib-theme/theme-config"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { settingsDataFor } from "@/lib/website-builder/theme-config-store"
import { agentMayWrite } from "@/lib/agent-access/protected"
import { listFiles, readFile, writeSection } from "@/lib/agent-access/operations"
import { roleOf, readsBack, themeFiles, type ThemeSnapshot } from "@/lib/github-sync/layout"
import { buildPackage, readPackage } from "@/lib/storelib-theme"
import { THEME_FORMAT, THEME_FORMAT_VERSION } from "@/lib/storelib-theme/types"
import { packageFilesFromPages } from "@/lib/website-builder/theme-pages"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { schemaFor } from "@/lib/website-builder/storelib-schemas"
import { resolveSettings } from "@/lib/storelib-theme/resolve"
import { getDefaultFileContent } from "@/lib/website-builder/theme-file-tree"
import { describeThemeSettings, themeFieldsFor } from "@/lib/website-builder/agent/operations"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const INSTALL = "11111111-1111-4111-8111-111111111111"

type Group = { name?: string; id?: string; settings: Record<string, unknown>[] }
const builtIn = () => JSON.parse(builtInSettingsSchemaText()) as Group[]
const groupsOf = (text: string) => {
  const r = readThemeSettingsSchema(text)
  return r.ok === true ? (r as { groups: typeof THEME_SETTINGS_GROUPS }).groups : null
}
const errorsOf = (text: string) => {
  const r = readThemeSettingsSchema(text)
  return r.ok === false ? (r as { errors: { message: string; line?: number }[] }).errors : []
}

async function main() {
  console.log("\nThe schema file, laid over Storelib's groups")
  {
    const text = builtInSettingsSchemaText()
    const shape = builtIn()
    check("Storelib's own groups are written in Shopify's shape: { name, settings: [{ type, id, label }] }", shape.length === THEME_SETTINGS_GROUPS.length && shape.every((g) => typeof g.name === "string" && Array.isArray(g.settings)) && Object.keys(shape[0].settings[0]).slice(0, 3).join() === "type,id,label")
    check("  and read back they are Storelib's groups exactly", same(groupsOf(text), THEME_SETTINGS_GROUPS))
    check("the code editor's config/settings_schema.json is that file", getDefaultFileContent(THEME_SCHEMA_FILE) === text)
    check("no file, or an empty one: Storelib's groups, the same object", themeSettingsGroupsFor(null) === THEME_SETTINGS_GROUPS && themeSettingsGroupsFor("  ") === THEME_SETTINGS_GROUPS)

    const file = builtIn()
    const layout = file.find((g) => g.id === "layout")!
    /* Reordered, two Storelib settings changed, and a group of the theme's own first. */
    layout.settings = [
      { type: "range", id: "content_padding_x", label: "Side padding", min: 8, max: 120, step: 4, unit: "px", default: 32 },
      { type: "range", id: "page_width", label: "Page width", min: 900, max: 2000, step: 20, unit: "px", default: 1400 },
    ]
    const promo: Group = {
      name: "Promo strip",
      settings: [
        { type: "header", content: "Strip" },
        { type: "checkbox", id: "promo_show", label: "Show the strip", default: true },
        { type: "text", id: "promo_text", label: "Words", default: "Free shipping over $50" },
        { type: "range", id: "promo_size", label: "Text size", min: 12, max: 24, step: 1, unit: "px", default: 14 },
        { type: "image_picker", id: "promo_image", label: "Picture" },
        { type: "select", id: "promo_align", label: "Words sit", default: "center", options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }] },
      ],
    }
    const withoutCookies = file.filter((g) => g.id !== "cookies")
    const merged = groupsOf(JSON.stringify([promo, ...withoutCookies], null, 2))
    check("the file is read", !!merged, errorsOf(JSON.stringify([promo, ...withoutCookies])))
    if (merged) {
      check("a group of the theme's own is where the file put it, first", merged[0].label === "Promo strip" && merged[0].id === "promo_strip")
      check("  with its settings in order, a header without an id given one", same(merged[0].fields.map((f) => f.type), ["header", "checkbox", "text", "range", "image_picker", "select"]) && merged[0].fields[0].label === "Strip" && /^promo_strip_header_/.test(merged[0].fields[0].id))
      const lay = merged.find((g) => g.id === "layout")!
      check("Layout's settings in the file's order, then Storelib's it left out, in theirs", lay.fields[0].id === "content_padding_x" && lay.fields[1].id === "page_width" && lay.fields.length === THEME_SETTINGS_GROUPS.find((g) => g.id === "layout")!.fields.length, lay.fields.map((f) => f.id))
      check("  a Storelib setting's label, default and range changed by the file", lay.fields[1].label === "Page width" && lay.fields[1].default === 1400 && lay.fields[1].max === 2000)
      check("a group of Storelib's the file left out is still there, after the file's", merged[merged.length - 1].id === "cookies" && merged.length === THEME_SETTINGS_GROUPS.length + 1)
    }

    const storelibShape = JSON.stringify([{ id: "mine", label: "Mine", fields: [{ id: "mine_on", label: "On", type: "toggle", default: false }] }])
    check("Storelib's own shape { id, label, fields } is read too", groupsOf(storelibShape)?.[0].fields[0].id === "mine_on")
    check("Shopify's theme_info entry holds no settings and is passed over", groupsOf(JSON.stringify([{ name: "theme_info", theme_name: "Mine" }, ...builtIn()]))?.length === THEME_SETTINGS_GROUPS.length)

    console.log("\nRefused, each with its line")
    const unknown = JSON.stringify([{ name: "Mine", settings: [{ type: "slider", id: "x", label: "X" }] }], null, 2)
    const u = errorsOf(unknown)
    check("an unknown type, with the types there are", /"slider" is not a setting type/.test(u[0]?.message ?? "") && u[0]?.line === unknown.split("\n").findIndex((l) => /"id": "x"/.test(l)) + 1, u)
    check("JSON that does not parse, with the line it stops on", (errorsOf('[\n  { "name": "A",\n    "settings": [ }\n]')[0]?.line ?? 0) >= 3)
    check("not a list of groups", /list of setting groups/.test(errorsOf('{ "page_width": 1 }')[0]?.message ?? ""))
    const retyped = builtIn()
    retyped.find((g) => g.id === "layout")!.settings[0] = { type: "text", id: "page_width", label: "Width" }
    check("a Storelib setting given another type", /Keep its type "range"/.test(errorsOf(JSON.stringify(retyped))[0]?.message ?? ""))
    const moved = builtIn()
    moved.find((g) => g.id === "buttons")!.settings.push({ type: "range", id: "page_width", label: "Width", min: 900, max: 1800 })
    check("a Storelib setting moved to another group", errorsOf(JSON.stringify(moved)).some((e) => /List it in the Layout group/.test(e.message)))
    check("an id used twice", errorsOf(JSON.stringify([{ name: "A", settings: [{ type: "text", id: "a1", label: "A" }, { type: "text", id: "a1", label: "B" }] }])).some((e) => /twice/.test(e.message)))
    check("a range whose default is outside it", errorsOf(JSON.stringify([{ name: "A", settings: [{ type: "range", id: "r", label: "R", min: 0, max: 10, default: 20 }] }])).some((e) => /outside 0 to 10/.test(e.message)))
    check("a select whose default is not an option", errorsOf(JSON.stringify([{ name: "A", settings: [{ type: "select", id: "s", label: "S", default: "z", options: [{ value: "a", label: "A" }] }] }])).some((e) => /not one of its options/.test(e.message)))
    check("a setting with no label", errorsOf(JSON.stringify([{ name: "A", settings: [{ type: "text", id: "t" }] }])).some((e) => /needs a "label"/.test(e.message)))
    check("Typography takes fonts only", errorsOf(JSON.stringify([{ name: "Typography", settings: [{ type: "range", id: "big", label: "Big", min: 0, max: 2 }] }])).some((e) => /fonts only/.test(e.message)))
    check("a new option on a Storelib select (its stylesheet would not know it)", errorsOf(JSON.stringify([{ name: "Layout", settings: [{ type: "select", id: "card_shadow", label: "Shadow", options: [{ value: "huge", label: "Huge" }] }] }])).some((e) => /takes only its own values/.test(e.message)))
    check("  while relabelling its own options is fine", !!groupsOf(JSON.stringify([{ name: "Layout", settings: [{ type: "select", id: "card_shadow", label: "Shadow", options: [{ value: "none", label: "Flat" }, { value: "sm", label: "Soft" }, { value: "md", label: "Medium" }, { value: "lg", label: "Deep" }] }] }])))
    check("a broken file is never drawn: the sidebar keeps Storelib's groups", themeSettingsGroupsFor(unknown) === THEME_SETTINGS_GROUPS)
    check("refusals in plain words: no em dash, none of the banned words", !u.concat(errorsOf(JSON.stringify(moved))).some((e) => /—|\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(e.message)))
  }

  console.log("\nThe code editor saves the schema file, and Theme settings follow")
  {
    const tables = {
      store_theme_custom_files: [] as Record<string, unknown>[],
      store_theme_file_versions: [] as Record<string, unknown>[],
      store_theme_settings: [{ install_id: INSTALL, settings: { brand_name: "Astrid", page_width: 1200 }, draft_settings: null }] as Record<string, unknown>[],
    }
    const db = fakeDb(tables as never)
    const file = [
      { name: "Promo strip", settings: [{ type: "checkbox", id: "promo_show", label: "Show the strip", default: true }, { type: "text", id: "promo_text", label: "Words", default: "Free shipping" }] },
      { name: "Layout", settings: [{ type: "range", id: "page_width", label: "Page width", min: 900, max: 2000, step: 20, unit: "px", default: 1400 }, { type: "range", id: "section_gap", label: "Section gap", min: 0, max: 80, step: 4, unit: "px", default: 16 }] },
    ]
    const saved = await saveThemeFile(db as never, INSTALL, THEME_SCHEMA_FILE, JSON.stringify(file, null, 2))
    check("it is saved, as a draft", saved.ok === true && (tables.store_theme_custom_files[0] as { draft_content?: string }).draft_content?.includes("Promo strip") === true, saved)
    const draft = () => (tables.store_theme_settings[0].draft_settings ?? {}) as Record<string, unknown>
    check("the defaults it adds are written under the values nobody set", draft().promo_show === true && draft().promo_text === "Free shipping" && draft().section_gap === 16)
    check("  never over a value somebody chose: page_width stays 1200, not the new default 1400", draft().page_width === 1200 && draft().brand_name === "Astrid")
    check("  and it is kept in History", tables.store_theme_file_versions.some((v) => v.path === THEME_SCHEMA_FILE))

    const bad = await saveThemeFile(db as never, INSTALL, THEME_SCHEMA_FILE, JSON.stringify([{ name: "Promo strip", settings: [{ type: "slidr", id: "x", label: "X" }] }], null, 2))
    check("a file that does not read is refused, 422, with every error and its line, and nothing kept", bad.ok === false && (bad as { status: number }).status === 422 && !!(bad as { errors?: { line?: number }[] }).errors?.[0]?.line && (tables.store_theme_custom_files[0] as { draft_content?: string }).draft_content?.includes("checkbox") === true)

    console.log("\nThe values file is the values: both ways")
    const shown = await settingsDataFor(db as never, INSTALL)
    check("config/settings_data.json reads what the sidebar stores, as { current }", !!shown && JSON.parse(shown.text).current.page_width === 1200 && JSON.parse(shown.text).current.promo_show === true)
    /* The sidebar saves (the editor's PUT writes draft_settings). */
    tables.store_theme_settings[0].draft_settings = { ...draft(), promo_text: "Typed in the sidebar" }
    check("  a value set in the sidebar is in the file at once", JSON.parse((await settingsDataFor(db as never, INSTALL))!.text).current.promo_text === "Typed in the sidebar")
    const write = await saveThemeFile(db as never, INSTALL, THEME_DATA_FILE, JSON.stringify({ current: { page_width: 1600, promo_show: false, section_gap: null } }, null, 2))
    check("a value written in the file is what the sidebar stores", write.ok === true && draft().page_width === 1600 && draft().promo_show === false)
    check("  what the file left out stays as it was", draft().promo_text === "Typed in the sidebar" && draft().brand_name === "Astrid")
    check("  null puts a setting back to its default", !("section_gap" in draft()))
    check("  no stored copy of the file: one source of truth", !tables.store_theme_custom_files.some((r) => r.path === THEME_DATA_FILE))
    check("  the values before and after are in History", tables.store_theme_file_versions.filter((v) => v.path === THEME_DATA_FILE).length === 2)
    check("  and the live half is untouched until Publish", same(tables.store_theme_settings[0].settings, { brand_name: "Astrid", page_width: 1200 }))
    const wrong = await saveThemeFile(db as never, INSTALL, THEME_DATA_FILE, '{\n  "current": {\n    "page_width": "wide"\n  }\n}')
    check("a value its setting cannot take is refused with its line", wrong.ok === false && (wrong as { errors?: { line?: number; message: string }[] }).errors?.[0]?.line === 3 && /takes a number/.test((wrong as { errors?: { message: string }[] }).errors?.[0]?.message ?? ""))
    check("  outside a range too", readSettingsData('{"current":{"page_width":5000}}').ok === false)
    check("Shopify's presets: current names one", same((readSettingsData('{"current":"Bold","presets":{"Bold":{"button_style":"outline"}}}') as { values?: unknown }).values, { button_style: "outline" }))
    const compat = readSettingsData('{"current":{"compat":{"kind":"shopify"},"brand_name":"X"}}')
    check("what kind of theme this is is not a value to change", compat.ok === true && !("compat" in (compat as { values: Record<string, unknown> }).values))
    check("settings_data.json is laid out the way Shopify's is", settingsDataText({ a: 1 }) === '{\n  "current": {\n    "a": 1\n  }\n}\n')
  }

  console.log("\nThe canvas and the sidebar have the file's defaults before any save")
  {
    const groups = groupsOf(JSON.stringify([{ name: "Promo strip", settings: [{ type: "toggle", id: "promo_show", label: "Show", default: true }] }, { name: "Layout", settings: [{ type: "range", id: "page_width", label: "W", min: 900, max: 1800, default: 1280 }] }]))!
    const values: Record<string, unknown> = { brand_name: "Astrid" }
    const drawn = withThemeDefaults(values, groups)
    check("a setting the theme added draws at its default", drawn.promo_show === true)
    check("  Storelib's own default unchanged by the file is not written in", !("page_width" in drawn))
    check("  no defaults to add: the same object, so the canvas does not redraw", withThemeDefaults(values, THEME_SETTINGS_GROUPS) === values && Object.keys(schemaDefaults(THEME_SETTINGS_GROUPS, values)).length === 0)
    check("Storelib AI's update_theme takes the theme's own ids, and lists them", themeFieldsFor(groups).some((f) => f.id === "promo_show") && /promo_show/.test(describeThemeSettings(groups)) && !themeFieldsFor().some((f) => f.id === "promo_show"))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the editor draws Theme settings from the theme's file, read with its sources", /const themeGroups = useMemo\(\(\) => themeSettingsGroupsFor\(themeSchemaText\), \[themeSchemaText\]\)/.test(editor) && /const schema = typeof d\.settings_schema === "string" \? d\.settings_schema : null/.test(editor) && /setThemeSchemaText\(\(prev\) => \(prev === schema \? prev : schema\)\)/.test(editor))
    check("  both panels, Colors' page colours too", /const generalGroups = themeGroups\.filter/.test(editor) && /const panelGroups = themeGroups\.filter/.test(editor) && /advanced=\{themeGroups\.find\(g => g\.id === "colors"\)/.test(editor))
    /* Changed on purpose (round 34): one writer of the draft (sendDraft), sending the settings of the save's own snapshot. */
    check("  the canvas draws the values with the file's defaults under them, and the save sends them", /const activeThemeSettings: ThemeSettingsValues = useMemo\(\(\) => withThemeDefaults\(settingsDraft/.test(editor) && (editor.match(/draft_settings: withThemeDefaults\(snap\.settings as Record<string, unknown>, themeGroups\)/g) ?? []).length === 1 && /settings: settingsDraft, rev: editRev\.current/.test(editor))
    check("  a values file saved in the code editor is read again in place", /if \(data\.path === THEME_DATA_FILE\) setSettingsFileVersion\(\(n\) => n \+ 1\)/.test(editor) && /if \(settingsFileVersion > 0\) void loadData\(\{ quiet: true \}\)/.test(editor))
    const route = read("app/api/website-builder/themes/[installId]/files/route.ts")
    check("the sources answer carries the schema file, draft first", /settings_schema: settingsSchema/.test(route) && /eq\("path", THEME_SCHEMA_FILE\)/.test(route))
    check("the code editor's read of the values file is the values now", /if \(path === THEME_DATA_FILE\) \{\s*const data = await settingsDataFor\(supabase, installId\)/.test(route))
  }

  console.log("\nA section's schema changes under an open editor")
  {
    const source = DEFAULT_THEME_SOURCES["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "my_promo"').replace(/"name": "Simple CTA"/, '"name": "My promo"')
    const start = source.indexOf("<schema>") + "<schema>".length
    const schema = JSON.parse(source.slice(start, source.indexOf("</schema>"))) as { settings: Record<string, unknown>[] }
    const withSchema = (s: unknown) => source.slice(0, start) + "\n" + JSON.stringify(s, null, 2) + "\n" + source.slice(source.indexOf("</schema>"))
    const stored = { heading: "Keep me", padding_top: 120, old_only: "still here" }
    const before = schemaFor("my_promo", { "sections/my_promo.storelib": withSchema(schema) }, SECTION_SCHEMAS)!.fields
    const ids = (f: { id: string }[]) => f.map((x) => x.id)
    /* Reversed, a new range in front, the heading kept, the subheading taken away, the top padding's range narrowed. */
    const changed = {
      ...schema,
      settings: [
        { type: "range", id: "promo_gap", label: "Gap", min: 0, max: 40, step: 4, unit: "px", default: 8 },
        { type: "header", id: "hdr_new", label: "New group" },
        ...schema.settings.filter((s) => s.id !== "subheading").reverse().map((s) => (s.id === "padding_top" ? { ...s, max: 80 } : s)),
      ],
    }
    const after = schemaFor("my_promo", { "sections/my_promo.storelib": withSchema(changed) }, SECTION_SCHEMAS)!.fields
    check("the panel takes the file's new order", ids(after)[0] === "promo_gap" && ids(after)[1] === "hdr_new" && ids(after).indexOf("heading") > ids(after).indexOf("padding_top") === ids(before).indexOf("heading") < ids(before).indexOf("padding_top"), ids(after))
    check("a removed setting is not drawn", ids(before).includes("subheading") && !ids(after).includes("subheading"))
    const gap = after.find((f) => f.id === "promo_gap")!
    check("a new one shows its default", shownValue(gap, (stored as Record<string, unknown>).promo_gap) === 8)
    const pad = after.find((f) => f.id === "padding_top")!
    check("a value outside the new range is shown at its end", shownValue(pad, stored.padding_top) === 80)
    const resolved = resolveSettings(after as never, stored)
    check("  and the canvas draws it there too, while what is stored is untouched", resolved.padding_top === 80 && stored.padding_top === 120)
    check("values are kept by id: the heading, and one no setting reads any more", resolved.heading === "Keep me" && resolved.old_only === "still here")
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the sliders show a value inside their range", /const num = clampTo\(typeof value === "number" \? value : defaultValue, min, max\)/.test(editor) && /const num = clampTo\(typeof raw === "number" \? raw : Number\(field\.default \?\? 0\), field\.min \?\? 0, field\.max \?\? 100\)/.test(editor))
  }

  console.log("\nEvery door: an agent over MCP")
  {
    check("an agent may write the two theme settings files", agentMayWrite(THEME_SCHEMA_FILE).ok && agentMayWrite(THEME_DATA_FILE).ok)
    check("  and still not the rest of config, templates or layout", !agentMayWrite("config/other.json").ok && !agentMayWrite("templates/home.json").ok && !agentMayWrite("layout/theme.storelib").ok)
    const tables = {
      store_theme_custom_files: [] as Record<string, unknown>[],
      store_theme_file_versions: [] as Record<string, unknown>[],
      store_theme_settings: [{ install_id: INSTALL, settings: { brand_name: "Astrid" }, draft_settings: null }] as Record<string, unknown>[],
      theme_agent_activity: [] as Record<string, unknown>[],
    }
    const db = fakeDb(tables as never)
    const list = await listFiles(db as never, INSTALL)
    const entries = list.ok === true ? (list as { value: { files: { path: string; writable: boolean }[] } }).value.files : []
    check("storelib_list_files lists both, writable", entries.some((f) => f.path === THEME_SCHEMA_FILE && f.writable) && entries.some((f) => f.path === THEME_DATA_FILE && f.writable))
    const schemaRead = await readFile(db as never, INSTALL, THEME_SCHEMA_FILE)
    check("storelib_read_file of the schema gives Storelib's groups before the theme has its own", schemaRead.ok === true && (schemaRead as { value: { source: string } }).value.source === builtInSettingsSchemaText())
    const who = { installId: INSTALL, tokenId: "t1", name: "Claude Code", creatorId: "c1" } as never
    const shopify = JSON.stringify([{ name: "Promo strip", settings: [{ type: "checkbox", id: "promo_show", label: "Show", default: true }] }, ...builtInSettingsSchema()], null, 2)
    const wrote = await writeSection(db as never, who, THEME_SCHEMA_FILE, shopify)
    check("storelib_write_section takes a schema file, checked by its own reader", wrote.ok === true, wrote)
    check("  and the builder hears of it as a file", tables.theme_agent_activity.some((a) => a.path === THEME_SCHEMA_FILE))
    const values = await writeSection(db as never, who, THEME_DATA_FILE, JSON.stringify({ current: { promo_show: false } }))
    check("a values file writes the values, and the builder reads the settings again", values.ok === true && (tables.store_theme_settings[0].draft_settings as Record<string, unknown>).promo_show === false && tables.theme_agent_activity.some((a) => a.path === "settings" && a.action === "page"))
    const back = await readFile(db as never, INSTALL, THEME_DATA_FILE)
    check("  and reading it back gives what was written", back.ok === true && JSON.parse((back as { value: { source: string } }).value.source).current.promo_show === false)
    const refused = await writeSection(db as never, who, THEME_SCHEMA_FILE, '[{"name":"X","settings":[{"type":"nope","id":"n","label":"N"}]}]')
    check("a schema that does not read is refused with its errors", refused.ok === false && /nope\\?" is not a setting type/.test(JSON.stringify(refused)), refused)
    const mcp = read("lib/agent-access/mcp.ts")
    check("the tools say where theme settings live", /config\/settings_schema\.json says what they are/.test(mcp) && /config\/settings_data\.json \(their values/.test(mcp))
  }

  console.log("\nEvery door: Storelib AI")
  {
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    check("a Storelib theme's run reads its own schema file, or Storelib's to start from", /const ownThemeSchema = importedTheme \? null : await readThemeSchemaText\(supabase, installId\)/.test(route) && /let themeSchemaNow: string = ownThemeSchema \?\? builtInSettingsSchemaText\(\)/.test(route))
    check("  and an edit is checked by the same reader and staged with the run", /const read = readThemeSettingsSchema\(source\)/.test(route) && /journal\.stage\(THEME_SCHEMA_FILE, source\)/.test(route))
    const loop = read("lib/website-builder/agent/loop.ts")
    check("update_theme is checked against the theme's own settings as the run has them", /checkSettings\(\[\.\.\.themeFieldsFor\(themeGroups\)/.test(loop) && /execute\(call\.name, call\.argumentsJson, state, newId, locked, schemas, [^)]*?, themeGroupsNow\(\)\)/.test(loop))
  }

  console.log("\nEvery door: GitHub, and a theme package")
  {
    check("config/settings_schema.json is a theme file a push is read back from", roleOf(THEME_SCHEMA_FILE, { compat: false }) === "theme-file" && readsBack("theme-file"))
    check("config/settings_data.json is the values, like config/settings.json", roleOf(THEME_DATA_FILE, { compat: false }) === "settings")
    const snap: ThemeSnapshot = { name: "Astrid", compat: false, settings: { brand_name: "Astrid" }, pages: [], files: {}, defaults: {}, settingsSchema: builtInSettingsSchema() }
    const guides = () => ({ readme: "r", agents: "a", claude: "c" })
    const none = themeFiles(snap, guides).files.find((f) => f.path === THEME_SCHEMA_FILE)
    check("a repository gets Storelib's groups to start from", none?.text === builtInSettingsSchemaText() && none?.role === "theme-file")
    const own = '[{"name":"Mine","settings":[]}]\n'
    const mine = themeFiles({ ...snap, files: { [THEME_SCHEMA_FILE]: own } }, guides).files.find((f) => f.path === THEME_SCHEMA_FILE)
    check("  and the theme's own file once it has one, as it is", mine?.text === own)

    const schemaText = JSON.stringify([{ name: "Promo strip", settings: [{ type: "checkbox", id: "promo_show", label: "Show", default: true }, { type: "text", id: "promo_text", label: "Words", default: "Hello" }] }], null, 2) + "\n"
    const pages = packageFilesFromPages([{ page_key: "home", sections: [{ id: "hero-1", type: "hero", settings: {} }] }])
    const files = { ...pages, "config/settings.json": JSON.stringify({ brand_name: "Astrid", promo_text: "Exported words" }, null, 2) + "\n", [THEME_SCHEMA_FILE]: schemaText }
    const bytes = await buildPackage({ theme: { format: THEME_FORMAT, format_version: THEME_FORMAT_VERSION, name: "Astrid", version: "1.0.0", engine: { min: 1 } }, files, assets: {} } as never)
    const pkg = await readPackage(bytes, { knownTypes: Object.keys(SECTION_SCHEMAS) })
    check("a package with its own schema file reads", pkg.ok === true, pkg.ok === false ? (pkg as { errors: unknown[] }).errors.slice(0, 3) : undefined)
    if (pkg.ok === true) {
      const back = (pkg as { value: { files: Record<string, string> } }).value.files
      check("  the schema file travels as it is", back[THEME_SCHEMA_FILE] === schemaText)
      const config = packageThemeConfig(back)
      const cfg = config as { ok: boolean; settings: Record<string, unknown>; schema: string | null }
      check("  and an import has the values, with the file's defaults under the ones never set", cfg.ok === true && cfg.settings.promo_text === "Exported words" && cfg.settings.promo_show === true && cfg.schema === schemaText)
    }
    const data = packageThemeConfig({ "config/settings.json": '{"brand_name":"A","page_width":1200}', [THEME_DATA_FILE]: '{"current":{"page_width":1500}}' })
    check("a package's settings_data.json is laid over its settings.json", data.ok === true && (data as { settings: Record<string, unknown> }).settings.page_width === 1500 && (data as { settings: Record<string, unknown> }).settings.brand_name === "A")
    check("a package whose schema does not read is refused, with its line", packageThemeConfig({ [THEME_SCHEMA_FILE]: '[\n {"name":"X","settings":[{"type":"nope","id":"n","label":"N"}]}\n]' }).ok === false)
    check("a package without the files reads as before", same((packageThemeConfig({ "config/settings.json": '{"brand_name":"A"}' }) as { settings: unknown }).settings, { brand_name: "A" }))
    const exportRoute = read("app/api/website-builder/themes/[installId]/export/route.ts")
    const importRoute = read("app/api/website-builder/themes/import/route.ts")
    check("the export carries the theme's own schema file", /const ownSchema = saved\.get\(THEME_SCHEMA_FILE\)\s*if \(ownSchema\) files\[THEME_SCHEMA_FILE\] = ownSchema/.test(exportRoute))
    check("the import reads both files and keeps the schema as the theme's own", /const config = packageThemeConfig\(pkg\.files\)/.test(importRoute) && /rows\.push\(\{ install_id: created\.id, path: THEME_SCHEMA_FILE, content: ownSchema \}\)/.test(importRoute))
  }

  console.log("\nAgents are told")
  {
    const docs = read("content/developers/themes.md")
    check("the theme docs say what each file does", /### config\/settings_schema\.json/.test(docs) && /### config\/settings_data\.json/.test(docs) && /theme\.settings\.<id>/.test(docs))
    check("  in plain words: no em dash, none of the banned words", !/—|\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(docs.slice(docs.indexOf("### config/settings_schema.json"), docs.indexOf("## Versions"))))
    check("the generated docs carry it", /config\/settings_data\.json/.test(read("lib/developers/content.generated.ts")) && /Promo strip/.test(read("lib/developers/content.generated.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
