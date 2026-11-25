/**
 * ===========================================================================
 *  THEME RELEASES AND UPDATES (admin/themes releases, the library's Update)
 * ===========================================================================
 *   1. versions: one numbering per theme, a new release higher than every
 *      one a website it reaches could have, the input the admin may send
 *   2. a website's version against the releases: up to date, an update, a
 *      website added before versions were kept
 *   3. the merge: the creator's content kept (settings values, pages,
 *      templates and section group JSON, settings_data, their pictures),
 *      the new code in, a file they edited kept and reported, their own
 *      files kept, a retired theme file kept, a new page drawn with their
 *      header and footer; on the real composed theme as well
 *   4. Update on a recording stand-in for the database: a full library is
 *      refused before anything is read or written, and the website it is
 *      pressed on is never written
 *   5. who may: every admin release handler checks the cookie first, the
 *      creator's route checks the caller first, the SQL lets only the server
 *      write and everyone read published notes only
 *
 * Run: scratchpad/rt.sh tests/theme-releases.test.ts, or the push runner.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

import { stripComments } from "./_source"
import {
  BASE_TARGET,
  compareVersions,
  currentLayers,
  installedReleaseOf,
  parseReleaseInput,
  releaseFamily,
  releasesFor,
  updatedCopyName,
  versionProblem,
  versionState,
  withInstalledRelease,
  type ThemeRelease,
} from "../lib/themes/releases-shared"
import { ASSET_MAP_FILE, isContentFile, manifestOf, mergeThemeUpdate, sha256, shippedHashes, type FileRow, type MergeInput } from "../lib/themes/release-merge"
import { runThemeUpdate, UP_TO_DATE } from "../lib/themes/theme-update"
import { composeTemplateFiles, layerOver, readTemplateLayer } from "../lib/themes/template-packages"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { LIBRARY_FULL_CODE } from "../lib/website-builder/library-limit"
import { THEME_INSTALL_LIMIT } from "../lib/website-builder/theme-registry"
import { CODE_THEME_PACKAGE } from "../lib/themes/marketplace-shared"
import * as composeModule from "../lib/themes/releases-compose"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}

let n = 0
function rel(target: string, version: string, over: Partial<ThemeRelease> = {}): ThemeRelease {
  n++
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, target, family: releaseFamily(target), version, notes: `Notes for ${version}`, source: "code", published: true, publishedAt: `2026-11-${String(10 + n).padStart(2, "0")}T00:00:00.000Z`, createdAt: `2026-11-${String(10 + n).padStart(2, "0")}T00:00:00.000Z`, ...over }
}

async function main() {
  console.log("\n1. Versions\n")
  check("versions compare as numbers, 2.10.0 after 2.9.0", compareVersions("2.10.0", "2.9.0") > 0 && compareVersions("1.0.0", "1.0.0") === 0 && compareVersions("1.0.0", "1.0.1") < 0)
  check("the base and Storelib's templates share one numbering; an uploaded theme has its own", releaseFamily(BASE_TARGET) === CODE_THEME_PACKAGE && releaseFamily("clothing") === CODE_THEME_PACKAGE && releaseFamily("someones-theme") === "someones-theme")
  const line = [rel(BASE_TARGET, "2.0.0"), rel("clothing", "2.0.1"), rel("posters", "2.0.3")]
  check("a base release must be higher than every template's", versionProblem(BASE_TARGET, "2.0.2", line) !== null && versionProblem(BASE_TARGET, "2.0.4", line) === null)
  check("a template release must be higher than the base and its own", versionProblem("clothing", "2.0.1", line) !== null && versionProblem("clothing", "2.0.2", line) === null && versionProblem("merch", "1.9.0", line) !== null)
  check("an uploaded theme is numbered on its own", versionProblem("someones-theme", "1.0.0", line) === null)
  check("a version is three numbers", versionProblem("clothing", "v3", line) !== null && versionProblem("clothing", "3.0", line) !== null)
  check("the admin's input: notes required, a zip path only one the upload handed out", (() => {
    const noNotes = parseReleaseInput({ target: "clothing", version: "2.1.0", notes: " ", source: "code" })
    const stranger = parseReleaseInput({ target: "clothing", version: "2.1.0", notes: "x", source: "zip", path: "../../etc/passwd" })
    const otherFolder = parseReleaseInput({ target: "clothing", version: "2.1.0", notes: "x", source: "zip", path: "theme-releases/merch/00000000-0000-4000-8000-000000000001.zip" })
    const fine = parseReleaseInput({ target: "clothing", version: "2.1.0", notes: "Faster pictures", source: "zip", path: "theme-releases/clothing/00000000-0000-4000-8000-000000000001.zip" })
    const codeForUpload = parseReleaseInput({ target: "someones-theme", version: "1.0.0", notes: "x", source: "code" })
    return !noNotes.ok && !stranger.ok && !otherFolder.ok && fine.ok && !codeForUpload.ok
  })())
  check("the copy is named with its version, once", updatedCopyName("My shop", "2.1.0") === "My shop (2.1.0)" && updatedCopyName("My shop (2.0.0)", "2.1.0") === "My shop (2.1.0)" && updatedCopyName("x".repeat(90), "2.1.0").length <= 80)

  console.log("\n2. A website's version\n")
  const releases = [rel(BASE_TARGET, "2.0.0"), rel("clothing", "2.0.1"), rel(BASE_TARGET, "2.1.0"), rel(BASE_TARGET, "2.2.0", { published: false }), rel("merch", "2.1.1")]
  const settingsAt = (v: string | null, slug = "clothing") => {
    const s = { compat: { kind: "shopify", version: 1, theme: "Materia", listing: slug }, shopify: {} }
    return v ? withInstalledRelease(s, v) : s
  }
  check("the version is kept in compat.release and read back", installedReleaseOf(settingsAt("2.0.1")) === "2.0.1" && installedReleaseOf(settingsAt(null)) === null)
  check("a template takes the base's releases and its own, never another template's, never an unpublished one", releasesFor("clothing", releases).map((r) => r.version).join() === "2.1.0,2.0.1,2.0.0")
  check("the newest of each layer", (() => {
    const l = currentLayers("clothing", releases)
    return l.base?.version === "2.1.0" && l.own?.version === "2.0.1"
  })())
  const behind = versionState(settingsAt("2.0.1"), releases)
  check("2.0.1 with 2.1.0 published: an update, with its notes", !!behind && behind.pending.length === 1 && behind.pending[0].version === "2.1.0" && behind.latest?.version === "2.1.0")
  const current = versionState(settingsAt("2.1.0"), releases)
  check("at the newest: up to date, and the notes of the version it has", !!current && current.pending.length === 0 && current.current?.version === "2.1.0")
  const unknown = versionState(settingsAt(null), releases)
  check("added before versions were kept: every release is pending", !!unknown && unknown.installed === null && unknown.pending.length === 3)
  check("a website not from the marketplace, or a theme with no releases, says nothing", versionState({ shopify: {} }, releases) === null && versionState(settingsAt(null, "someones-theme"), releases) === null && versionState(settingsAt(null, "ebooks"), releases)?.pending.length === 2)

  console.log("\n3. The merge\n")
  const v1 = { hero: "hero v1", footer: "footer v1", price: "price v1", old: "old v1", css: "css v1" }
  const shipped = shippedHashes([{ "sections/hero.storelib": sha256(v1.hero), "sections/footer.storelib": sha256(v1.footer), "snippets/price.storelib": sha256(v1.price), "sections/old.storelib": sha256(v1.old), "shopify/assets/base.css": sha256(v1.css) }])
  const files: FileRow[] = [
    { path: "sections/hero.storelib", content: v1.hero },
    { path: "sections/footer.storelib", content: "footer, as I rewrote it" },
    { path: "snippets/price.storelib", content: v1.price, draft_content: "price, my draft" },
    { path: "sections/mine.storelib", content: "a section I wrote" },
    { path: "sections/old.storelib", content: v1.old },
    { path: "shopify/assets/base.css", content: v1.css },
    { path: "shopify/templates/index.json", content: '{"sections":{"mine":{}}}' },
    { path: "shopify/sections/header-group.json", content: '{"sections":{"my-header":{}}}' },
    { path: "shopify/config/settings_data.json", content: '{"current":{"color":"red"}}' },
    { path: ASSET_MAP_FILE, content: JSON.stringify({ "logo.png": "https://media/me/logo.png", "hero.jpg": "https://media/old/hero.jpg" }) },
  ]
  const home = [
    { id: "h1", type: "header", group: "header", settings: { logo: "https://media/me/logo.png" } },
    { id: "m1", type: "hero", settings: { heading: "My words" } },
    { id: "f1", type: "footer", group: "footer", settings: {} },
  ]
  const input: MergeInput = {
    current: {
      files,
      settings: { compat: { kind: "shopify", version: 1, theme: "Materia", theme_version: "2.0.0", listing: "clothing", release: "2.0.1" }, shopify: { color: "red", logo: "https://media/me/logo.png" }, kept_note: 1 },
      draftSettings: { compat: { kind: "shopify", version: 1, listing: "clothing", release: "2.0.1" }, shopify: { color: "green" } },
      pages: [
        { page_key: "home", sections: home, draft_sections: [...home, { id: "m2", type: "rich-text", settings: { text: "Draft words" } }] },
        { page_key: "product", sections: [{ id: "p1", type: "main-product", settings: {} }] },
      ],
    },
    next: {
      files: {
        "sections/hero.storelib": "hero v2",
        "sections/footer.storelib": "footer v2",
        "snippets/price.storelib": "price v2",
        "sections/new.storelib": "a new section",
        "shopify/assets/base.css": "css v2",
        "shopify/templates/index.json": '{"sections":{"theirs":{}}}',
        "shopify/templates/page.faq.json": '{"sections":{"faq":{}}}',
        "shopify/sections/header-group.json": '{"sections":{"their-header":{}}}',
        "shopify/config/settings_data.json": '{"current":{"color":"blue"}}',
        "shopify/config/settings_panel.json": "panel v2",
        [ASSET_MAP_FILE]: JSON.stringify({ "hero.jpg": "https://media/new/hero.jpg" }),
      },
      pages: [
        { page_key: "home", sections: [{ id: "theirs", type: "hero", settings: {} }] },
        { page_key: "faq", sections: [{ id: "nh", type: "header", group: "header", settings: {} }, { id: "faq", type: "faq", settings: {} }, { id: "nf", type: "footer", group: "footer", settings: {} }] },
      ],
      settings: { compat: { kind: "shopify", version: 1, theme: "Materia", theme_version: "2.1.0", renamed: {} }, shopify: { color: "blue", new_setting: true } },
    },
    version: "2.1.0",
    shipped,
    savedPaths: new Set(["shopify/assets/base.css"]),
    assetUrls: { "hero.jpg": "https://media/me/imported/hero2.jpg" },
  }
  const m = mergeThemeUpdate(input)
  const out = new Map(m.files.map((f) => [f.path, f]))
  check("theme code the creator did not touch is the new version's", out.get("sections/hero.storelib")?.content === "hero v2" && m.updated.includes("sections/hero.storelib"))
  check("a file the creator edited is kept as theirs and reported", out.get("sections/footer.storelib")?.content === "footer, as I rewrote it" && m.kept.some((k) => k.path === "sections/footer.storelib" && k.why === "edited"))
  check("an unpublished draft keeps the file, draft and all", out.get("snippets/price.storelib")?.draft_content === "price, my draft" && m.kept.some((k) => k.path === "snippets/price.storelib"))
  check("a file with saves in its history is kept", out.get("shopify/assets/base.css")?.content === v1.css && m.kept.some((k) => k.path === "shopify/assets/base.css"))
  check("a section only the creator has is kept as theirs", out.get("sections/mine.storelib")?.content === "a section I wrote" && m.kept.some((k) => k.path === "sections/mine.storelib" && k.why === "yours"))
  check("a theme file the new version dropped is kept, not reported as theirs", out.has("sections/old.storelib") && m.retired.includes("sections/old.storelib") && !m.kept.some((k) => k.path === "sections/old.storelib"))
  check("the new version's new files come in", out.get("sections/new.storelib")?.content === "a new section" && m.added.includes("sections/new.storelib"))
  check("templates/*.json, section groups and settings_data.json stay the creator's", out.get("shopify/templates/index.json")?.content.includes("mine") === true && out.get("shopify/sections/header-group.json")?.content.includes("my-header") === true && out.get("shopify/config/settings_data.json")?.content.includes("red") === true)
  check("a template the website lacks comes in", out.get("shopify/templates/page.faq.json")?.content.includes("faq") === true)
  check("derived files are the new version's", out.get("shopify/config/settings_panel.json")?.content === "panel v2")
  const assets = JSON.parse(out.get(ASSET_MAP_FILE)?.content ?? "{}")
  check("pictures: the new ones under the creator's account, the creator's own names kept", assets["hero.jpg"] === "https://media/me/imported/hero2.jpg" && assets["logo.png"] === "https://media/me/logo.png")
  check("every file is written once", new Set(m.files.map((f) => f.path)).size === m.files.length)
  const sh = m.settings.shopify as Record<string, unknown>
  check("theme settings: the creator's values win, a new setting gets its default", sh.color === "red" && sh.new_setting === true && sh.logo === "https://media/me/logo.png" && m.settings.kept_note === 1)
  const compat = m.settings.compat as Record<string, unknown>
  check("the copy records its new version and keeps its listing", compat.release === "2.1.0" && compat.listing === "clothing" && compat.theme_version === "2.1.0")
  check("the draft settings are merged the same way, the creator's draft value kept", (m.draftSettings?.shopify as Record<string, unknown>)?.color === "green" && (m.draftSettings?.compat as Record<string, unknown>)?.release === "2.1.0")
  const homeOut = m.pages.find((p) => p.page_key === "home")
  check("pages stay the creator's, live and draft", JSON.stringify(homeOut?.sections) === JSON.stringify(home) && Array.isArray(homeOut?.draft_sections) && (homeOut?.draft_sections as unknown[]).length === 4 && m.pages.some((p) => p.page_key === "product"))
  const faq = m.pages.find((p) => p.page_key === "faq")?.sections as { id: string }[] | undefined
  check("a page the new version adds is drawn with the creator's own header and footer", !!faq && faq.map((s) => s.id).join() === "h1,faq,f1" && m.newPages.includes("faq"))
  check("content files are told apart from code", isContentFile("shopify/templates/product.json") && isContentFile("shopify/sections/footer-group.json") && !isContentFile("sections/footer.storelib"))

  const blind = mergeThemeUpdate({ ...input, shipped: null, savedPaths: new Set() })
  const blindOut = new Map(blind.files.map((f) => [f.path, f]))
  check("version unknown: a draft still keeps the file", blindOut.get("snippets/price.storelib")?.draft_content === "price, my draft")
  check("version unknown: a file with no draft and no history is the theme's", blindOut.get("sections/footer.storelib")?.content === "footer v2")
  check("version unknown: a file with history is kept", mergeThemeUpdate({ ...input, shipped: null, savedPaths: new Set(["sections/footer.storelib"]) }).files.find((f) => f.path === "sections/footer.storelib")?.content === "footer, as I rewrote it")

  /* The real theme, composed and converted as Add converts it. */
  const id = `${CODE_THEME_PACKAGE}/default`
  const layered = layerOver(readTemplateLayer(id, "base"), readTemplateLayer(id, "overlay"))
  const composed = composeTemplateFiles(id)
  check("a base laid under an overlay is the template composeTemplateFiles makes", layered.size === composed.size && [...composed].every(([p, b]) => layered.get(p)?.equals(b)))
  const zip = new JSZip()
  for (const [p, b] of composed) zip.file(p, b)
  const converted = await convertShopifyTheme(await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" })), { fallbackName: "Default" })
  if (converted.ok) {
    const theme = converted.theme
    const codePaths = Object.keys(theme.files).filter((p) => p.startsWith("sections/") && p.endsWith(".storelib")).sort()
    const [edit, change] = codePaths
    const installFiles: FileRow[] = Object.entries(theme.files).map(([path, content]) => ({ path, content: path === edit ? `${content}\n{% comment %}mine{% endcomment %}` : content }))
    const nextFiles = { ...theme.files, [change]: `${theme.files[change]}\n{% comment %}v2{% endcomment %}` }
    const real = mergeThemeUpdate({
      current: { files: installFiles, settings: { ...theme.settings, compat: { ...theme.settings.compat, listing: "storelib-default", release: "1.0.0" }, shopify: { ...theme.settings.shopify, mine: "kept" } }, draftSettings: null, pages: theme.pages },
      next: { files: nextFiles, pages: theme.pages, settings: theme.settings as unknown as MergeInput["next"]["settings"] },
      version: "1.0.1",
      shipped: shippedHashes([manifestOf(theme.files)]),
      savedPaths: new Set(),
    })
    const realOut = new Map(real.files.map((f) => [f.path, f.content]))
    check(`the real theme: ${codePaths.length} sections, the edited one kept and listed`, (realOut.get(edit) ?? "").includes("mine") && real.kept.length === 1 && real.kept[0].path === edit)
    check("the real theme: the changed section is the new version's, nothing else reported", (realOut.get(change) ?? "").includes("v2") && real.updated.join() === change)
    check("the real theme: the creator's setting survives", (real.settings.shopify as Record<string, unknown>).mine === "kept")
  } else {
    check("the composed default template converts", false, (converted as { error: string }).error)
  }

  console.log("\n4. Update, on a recording stand-in for the database\n")
  const SOURCE = "11111111-1111-4111-8111-111111111111"
  const COPY = "22222222-2222-4222-8222-222222222222"
  const CREATOR = "33333333-3333-4333-8333-333333333333"
  type Op = { table: string; op: string; filters: [string, unknown][]; payload?: unknown; columns?: string; head?: boolean }
  function fakeDb(opts: { websites: number }) {
    const ops: Op[] = []
    let websites = opts.websites
    const answer = (q: Op): { data?: unknown; error: unknown; count?: number } => {
      const f = Object.fromEntries(q.filters)
      if (q.table === "store_theme_installs") {
        if (q.op === "insert") {
          websites++
          return { data: { id: COPY }, error: null }
        }
        if (q.op === "delete") return { error: null }
        if (q.head) return { count: websites, error: null }
        if (q.columns === "sort_order") return { data: { sort_order: 4 }, error: null }
        return f.id === SOURCE && f.creator_id === CREATOR ? { data: { id: SOURCE, name: "My shop", theme_id: "t", creator_id: CREATOR }, error: null } : { data: null, error: null }
      }
      if (q.op !== "select") return { error: null }
      if (q.table === "store_theme_settings") return { data: f.install_id === SOURCE ? { settings: input.current.settings, draft_settings: input.current.draftSettings } : null, error: null }
      if (q.table === "store_theme_pages") return { data: input.current.pages, error: null }
      if (q.table === "store_theme_custom_files") return { data: files, error: null }
      if (q.table === "store_theme_file_versions") return { data: [{ path: "shopify/assets/base.css" }], error: null }
      return { data: null, error: null }
    }
    const db = {
      from(table: string) {
        const q: Op = { table, op: "select", filters: [] }
        const run = async () => {
          ops.push({ ...q, filters: [...q.filters] })
          return answer(q)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api: any = {
          select(columns: string, o?: { head?: boolean }) {
            if (q.op === "select") {
              q.columns = columns
              q.head = !!o?.head
            }
            return api
          },
          insert(p: unknown) { q.op = "insert"; q.payload = p; return api },
          update(p: unknown) { q.op = "update"; q.payload = p; return api },
          upsert(p: unknown) { q.op = "upsert"; q.payload = p; return api },
          delete() { q.op = "delete"; return api },
          eq(k: string, v: unknown) { q.filters.push([k, v]); return api },
          order() { return api },
          limit() { return api },
          maybeSingle: run,
          single: run,
          then(ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) { return run().then(ok, bad) },
        }
        return api
      },
    }
    return { db, ops }
  }
  const pub = [rel(BASE_TARGET, "2.0.0"), rel("clothing", "2.0.1"), rel(BASE_TARGET, "2.1.0")]
  let asked = 0
  const nextTheme = async () => {
    asked++
    return { ok: true as const, theme: input.next, version: "2.1.0", shipped }
  }

  const full = fakeDb({ websites: THEME_INSTALL_LIMIT })
  const refused = await runThemeUpdate({ db: full.db, creatorId: CREATOR, installId: SOURCE, releases: pub, nextTheme })
  check(`a library of ${THEME_INSTALL_LIMIT} is full: refused with its code, nothing read from the theme, nothing written`, refused.ok === false && (refused as { code?: string }).code === LIBRARY_FULL_CODE && asked === 0 && full.ops.every((o) => o.op === "select"))

  const room = fakeDb({ websites: 3 })
  const done = await runThemeUpdate({ db: room.db, creatorId: CREATOR, installId: SOURCE, releases: pub, nextTheme })
  check("with room: an updated copy is made", done.ok === true && (done as { installId: string }).installId === COPY && (done as { name: string }).name === "My shop (2.1.0)")
  const writes = room.ops.filter((o) => o.op !== "select")
  const touchesSource = writes.filter((o) => o.filters.some(([, v]) => v === SOURCE) || JSON.stringify(o.payload ?? "").includes(`"install_id":"${SOURCE}"`))
  check("the website Update was pressed on is never written: no update, delete or upsert of it, its settings, pages or files", touchesSource.length === 0 && !writes.some((o) => o.op === "update" || o.op === "upsert"), touchesSource)
  check("the copy is a draft that points back at the website it came from", writes.some((o) => o.table === "store_theme_installs" && o.op === "insert" && JSON.stringify(o.payload).includes(`"status":"draft"`) && JSON.stringify(o.payload).includes(`"parent_install_id":"${SOURCE}"`)))
  check("its settings, pages and files are written under the copy", ["store_theme_settings", "store_theme_pages", "store_theme_custom_files"].every((t) => writes.some((o) => o.table === t && o.op === "insert" && JSON.stringify(o.payload).includes(COPY))))
  check("the creator's edited files are reported", done.ok === true && (done as { kept: { path: string }[] }).kept.some((k) => k.path === "sections/footer.storelib"))

  const upToDate = await runThemeUpdate({ db: fakeDb({ websites: 3 }).db, creatorId: CREATOR, installId: SOURCE, releases: [rel(BASE_TARGET, "2.0.0"), rel("clothing", "2.0.1")], nextTheme })
  check("at the newest version: refused as up to date", upToDate.ok === false && (upToDate as { error: string }).error === UP_TO_DATE)
  const stranger = await runThemeUpdate({ db: fakeDb({ websites: 3 }).db, creatorId: "44444444-4444-4444-8444-444444444444", installId: SOURCE, releases: pub, nextTheme })
  check("another store's website is not found", stranger.ok === false && (stranger as { status: number }).status === 404)

  console.log("\n4b. End to end: a base release from the code, through the server's own composing and converting (lib/themes/releases-compose.ts), to an updated copy\n")
  try {
    const srv = composeModule
    const mf = manifestOf
    const baseNow = readTemplateLayer(`${CODE_THEME_PACKAGE}/default`, "base")
    /* What the creator added at 2.0.0: the code as it is. Then 2.1.0 changes one section of the base. */
    const v200 = await srv.convertFiles(srv.layerOf(baseNow) === "theme" ? layerOver(baseNow, readTemplateLayer(`${CODE_THEME_PACKAGE}/default`, "overlay")) : baseNow)
    const changedPath = [...baseNow.keys()].filter((p) => /^sections\/.+\.liquid$/.test(p)).sort()[1]
    const base210 = new Map(baseNow)
    base210.set(changedPath, Buffer.from(`${baseNow.get(changedPath)!.toString("utf8")}\n{% comment %}2.1.0{% endcomment %}`))
    if (!v200.ok) throw new Error((v200 as { error: string }).error)
    const installed = (v200 as Extract<typeof v200, { ok: true }>).theme
    const rows = [
      { id: "r1", target: BASE_TARGET, family: CODE_THEME_PACKAGE, version: "2.0.0", notes: "First", source: "code", published: true, published_at: null, created_at: "2026-11-01T00:00:00Z", layer: "theme", package_path: "theme-releases/base/a.zip", manifest: mf(installed.files) },
      { id: "r2", target: BASE_TARGET, family: CODE_THEME_PACKAGE, version: "2.1.0", notes: "Second", source: "code", published: true, published_at: null, created_at: "2026-11-02T00:00:00Z", layer: "theme", package_path: "theme-releases/base/b.zip", manifest: {} },
    ]
    const released = await srv.releasedFiles("storelib-default", rows, async (row) => (row.package_path === "theme-releases/base/b.zip" ? base210 : baseNow))
    check("the newest base release is the one composed, at its version", released?.version === "2.1.0" && released.files.get(changedPath)?.toString("utf8").includes("2.1.0") === true)
    const next = await srv.convertFiles(released!.files)
    const nextTheme = next as Extract<typeof next, { ok: true }>
    check("it converts as an import converts it", next.ok === true)
    const storedSection = Object.keys(installed.files).find((p) => p.startsWith("sections/") && p.endsWith(".storelib") && installed.files[p] !== nextTheme.theme.files[p])
    const editedSection = Object.keys(installed.files).filter((p) => p.startsWith("sections/") && p.endsWith(".storelib") && p !== storedSection).sort()[0]
    const installFiles = Object.entries(installed.files).map(([path, content]) => ({ path, content: path === editedSection ? `${content}\n{% comment %}my edit{% endcomment %}` : content }))
    const homePage = installed.pages.find((p) => p.page_key === "home")!
    const myHome = [...homePage.sections.map((x) => ({ ...x })), { id: "my-text", type: "rich-text", settings: { text: "My own words" } }]
    const live = { ...installed.settings, compat: { ...installed.settings.compat, listing: "storelib-default", release: "2.0.0" }, shopify: { ...installed.settings.shopify, my_color: "#123456" } }
    const store = { files: installFiles, pages: installed.pages.map((p) => ({ page_key: p.page_key, sections: p.page_key === "home" ? myHome : p.sections, draft_sections: null })), settings: live }
    const ops: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = []
    let count = 2
    const db = {
      from(table: string) {
        const q = { table, op: "select", payload: undefined as unknown, filters: [] as [string, unknown][], head: false, columns: "" }
        const run = async () => {
          ops.push({ table: q.table, op: q.op, payload: q.payload, filters: [...q.filters] })
          if (q.op === "insert") return table === "store_theme_installs" ? (count++, { data: { id: COPY }, error: null }) : { error: null }
          if (q.op !== "select") return { error: null }
          if (table === "store_theme_installs") return q.head ? { count, error: null } : q.columns === "sort_order" ? { data: { sort_order: 1 }, error: null } : { data: { id: SOURCE, name: "Shop", theme_id: "t", creator_id: CREATOR }, error: null }
          if (table === "store_theme_settings") return { data: { settings: store.settings, draft_settings: null }, error: null }
          if (table === "store_theme_pages") return { data: store.pages, error: null }
          if (table === "store_theme_custom_files") return { data: store.files, error: null }
          return { data: [], error: null }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api: any = { select(c: string, o?: { head?: boolean }) { if (q.op === "select") { q.columns = c; q.head = !!o?.head } return api }, insert(p: unknown) { q.op = "insert"; q.payload = p; return api }, update(p: unknown) { q.op = "update"; q.payload = p; return api }, delete() { q.op = "delete"; return api }, eq(k: string, v: unknown) { q.filters.push([k, v]); return api }, order() { return api }, limit() { return api }, maybeSingle: run, single: run, then(a: (v: unknown) => unknown, b: (e: unknown) => unknown) { return run().then(a, b) } }
        return api
      },
    }
    const relList = rows.map(srv.rowToRelease)
    const outcome = await runThemeUpdate({ db, creatorId: CREATOR, installId: SOURCE, releases: relList, nextTheme: async () => ({ ok: true, theme: { files: nextTheme.theme.files, pages: nextTheme.theme.pages, settings: nextTheme.theme.settings as unknown as MergeInput["next"]["settings"] }, version: released!.version, shipped: srv.shippedFor("storelib-default", rows) }) })
    const wrote = (t: string) => ops.filter((o) => o.table === t && o.op === "insert").flatMap((o) => (Array.isArray(o.payload) ? o.payload : [o.payload])) as Record<string, unknown>[]
    const copyFiles = new Map(wrote("store_theme_custom_files").map((r) => [r.path as string, r.content as string]))
    check("the copy is made at 2.1.0", outcome.ok === true && (outcome as { version: string }).version === "2.1.0")
    check("the section the release changed is the new one", !!storedSection && copyFiles.get(storedSection) === nextTheme.theme.files[storedSection])
    check("the section the creator edited is theirs, and the only one listed", (copyFiles.get(editedSection) ?? "").includes("my edit") && outcome.ok === true && (outcome as { kept: { path: string }[] }).kept.map((k) => k.path).join() === editedSection)
    const copySettings = wrote("store_theme_settings")[0]?.settings as { shopify?: Record<string, unknown>; compat?: Record<string, unknown> } | undefined
    check("their theme settings and the version are on the copy", copySettings?.shopify?.my_color === "#123456" && copySettings?.compat?.release === "2.1.0" && copySettings?.compat?.listing === "storelib-default")
    const copyHome = wrote("store_theme_pages").find((p) => p.page_key === "home")?.sections as { id: string }[] | undefined
    check("their home page, with their own section, is on the copy", !!copyHome && copyHome.some((x) => x.id === "my-text"))
    check("the website they pressed Update on is not written", !ops.some((o) => o.op !== "select" && (o.filters.some(([, v]) => v === SOURCE) || JSON.stringify(o.payload ?? "").includes(`"install_id":"${SOURCE}"`))))
  } catch (e) {
    check("the end to end run", false, e instanceof Error ? e.message : String(e))
  }

  console.log("\n5. Who may\n")
  const adminRoute = code("app/api/admin/themes/releases/route.ts")
  const handlers = [...adminRoute.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)[^{]*\{\s*const denied = await requireAdmin\(\)\s*\n\s*if \(denied\) return denied/g)].map((h) => h[1])
  check("every release handler checks the admin cookie before anything else", handlers.sort().join() === "DELETE,GET,PATCH,POST,PUT", handlers)
  const gate = code("lib/admin/gate.ts")
  check("a request without the admin cookie is answered 401", /if \(await isAdminAuthenticated\(\)\) return null[\s\S]*status: 401/.test(gate))
  const update = code("app/api/website-builder/themes/[installId]/update/route.ts")
  check("Update checks who is asking before it reads anything", update.indexOf("await websiteCaller()") > 0 && update.indexOf("await websiteCaller()") < update.indexOf("createAdminClient()") && update.indexOf("await websiteCaller()") < update.indexOf("readReleaseRows("))
  check("Update works on the caller's own store", /creatorId: site\.creatorId, installId/.test(update))
  check("the update never writes to a website it reads", !/\.update\(|\.upsert\(/.test(code("lib/themes/theme-update.ts")))
  const migration = read("supabase/migrations/20271478_theme_releases.sql")
  check("the RUN file is the migration", migration === read("supabase/sql/RUN_THEME_RELEASES.sql"))
  check("row level security on, and only published releases read", /alter table public\.theme_releases enable row level security/.test(migration) && /for select to anon, authenticated using \(published\)/.test(migration))
  check("nobody but the server writes, and the zip's path and manifest are never granted", /revoke all on public\.theme_releases from anon, authenticated/.test(migration) && (() => {
    const grant = migration.match(/grant select \(([^)]+)\) on public\.theme_releases/)?.[1] ?? ""
    return grant.includes("notes") && !grant.includes("package_path") && !grant.includes("manifest")
  })())
  const all21 = read("supabase/sql/RUN_ROUND_21_ALL.sql")
  check("RUN_ROUND_21_ALL.sql carries the releases table, the seven-website limit and profiles.email_verified", all21.includes(migration.slice(migration.indexOf("create table if not exists public.theme_releases"), migration.indexOf("notify pgrst")).trim()) && /if kept >= 7 then/.test(all21) && /add column email_verified boolean/.test(all21) && /create trigger profiles_keep_email_verified/.test(all21))
  const add = code("app/api/themes/marketplace/add/route.ts")
  check("Add uses the newest release and records its version", /releasedFiles\(listing\.slug/.test(add) && /* Changed on purpose (round 27): the listing note with the press's key (lib/themes/add-attempt.ts), then the version. */ /withInstalledRelease\(keyed, released\.version\)/.test(add))
  const page = code("app/(storelib)/app/website-builder/website-builder-client.tsx")
  check("the library shows the version, Update available and the dialog", /<ThemeVersionFact/.test(page) && /<ThemeVersionDialog/.test(page) && /\/update`/.test(page) && /<UpdateAvailableLine \/>/.test(page))
  check("a full library on Update opens the full library sheet", /data\?\.code === LIBRARY_FULL_CODE\) setVersionOf\(null\)/.test(page) && /setFull\("duplicate"\)/.test(page))
  const words = ["theme-version.tsx", "../../admin/themes/releases-admin.tsx"].map((f) => read(join("app/(storelib)/app/website-builder", f))).join("\n")
  check("the copy has no em dash and none of the banned words", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(words))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
