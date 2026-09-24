/**
 * ===========================================================================
 *  THE WEBSITE PAGE, THE THEME REGISTRY AND THE SNAPSHOT
 * ===========================================================================
 * /app/website-builder was rebuilt around three rules, and this suite is
 * those rules written down so they survive the next redesign:
 *
 *   1. THE PAGE IS SERVED, NOT FETCHED. The server component reads the
 *      installs and renders the client component with them. There is no
 *      mount-time fetch, no in-component skeleton, and no live storefront
 *      mounted anywhere on the page — the cover is an image (the editor's
 *      snapshot) or a drawing (the SVG theme cover), never a render.
 *
 *   2. THE REGISTRY IS THE CATALOGUE. Every theme has a real UUID (three of
 *      the old cards had ids like `ebook-author-theme-001`, so Add was a 404
 *      on half the library), and every preset is written against the section
 *      schemas the renderer reads — a field id that is not in the schema is a
 *      setting the editor cannot show and the renderer silently drops.
 *
 *   3. THE SNAPSHOT IS SCOPED AND OPTIONAL. The route checks the caller owns
 *      the install, checks the bytes are the image they claim to be, builds
 *      the storage path from the user id and the validated install id only,
 *      and a missing column degrades to "not stored", never to a failed save.
 *
 * Run with:  npm run test:push
 */
import { isPackagedCover } from "@/lib/website-builder/cover-take"
import { bodyGapToListIndex } from "@/lib/website-builder/section-order"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  THEME_INDUSTRIES,
  THEME_INSTALL_LIMIT,
  THEME_REGISTRY,
  BROWSABLE_THEMES,
  buildThemePreset,
  isThemeId,
} from "@/lib/website-builder/theme-registry"
import {
  looksLikeImage,
  previousSnapshotPath,
  SNAPSHOT_BUCKET,
  snapshotFolder,
  snapshotsNewestFirst,
  snapshotTakenAt,
  SNAPSHOTS_KEPT,
  SNAPSHOT_VERSION,
  snapshotName,
  staleSnapshots,
  isCurrentSnapshotUrl,
  mobilePartner,
} from "@/lib/website-builder/snapshot"
import { coverIsStale } from "@/app/app/website-builder/website-builder-client"
import { mintCoverPass, readCoverPass } from "@/lib/website-builder/cover-pass"
import { ThemeCover, ThemePhoneCover, coverSpecFromDefinition, coverSpecFromSettings } from "@/components/website-builder/theme-cover"
import { editorHref } from "@/app/app/website-builder/website-builder-client"
import { CUSTOM_SECTION_CATEGORY, STORELIB_SCHEMAS, STORELIB_SECTION_TYPES, addableSections, customAddableSections, customSectionSchemas, schemaFromStorelib } from "@/lib/website-builder/storelib-schemas"
import { ADDABLE_SECTIONS, RETIRED_SECTIONS, SECTION_CATEGORIES, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { LIBRARY_FULL_CODE, isLibraryFullError, keptWithinLimit } from "@/lib/website-builder/library-limit"
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE, importPathFor, importSizeProblem, isOwnImportPath, looksLikeZip } from "@/lib/website-builder/theme-import"
import { STALL_MS, sendWithProgress } from "@/app/app/website-builder/incoming"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/**
 * The built website's own renderer. `/w/[username]/page.tsx` is the front
 * page and `/w/[username]/[page]/page.tsx` is every other page of the site;
 * both hand the work to this one file, so this is where the site's rendering
 * is asserted.
 */
const RENDER_SITE = "app/(site)/w/[username]/render-site.tsx"
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

// ── Section schemas, as the editor reads them ───────────────────────────
type Field = { id: string; type: string; options?: { value?: string }[] | string[] }
type Schema = { type: string; fields?: Field[]; blocks?: { type: string; fields?: Field[] }[] }
const SCHEMA_DIR = join(process.cwd(), "themes/default/sections")
const schemas = new Map<string, Schema>()
for (const f of readdirSync(SCHEMA_DIR)) {
  if (!f.endsWith(".json")) continue
  const s = JSON.parse(readFileSync(join(SCHEMA_DIR, f), "utf8")) as Schema
  schemas.set(s.type ?? f.replace(/\.json$/, ""), s)
}
// Sections that live in a .storelib file, through the adapter the sidebar reads.
for (const type of STORELIB_SECTION_TYPES) schemas.set(type, STORELIB_SCHEMAS[type] as Schema)
const settable = (fields: Field[] | undefined) => (fields ?? []).filter((x) => x.type !== "header")
const optionValues = (x: Field): string[] | null => {
  if (x.type !== "select" && x.type !== "radio") return null
  return (x.options ?? []).map((o) => (typeof o === "string" ? o : (o.value ?? ""))).filter(Boolean)
}
/**
 * The icons a theme is allowed to name.
 *
 * Read from icon-map.tsx, which is where the map lives now — it was ten
 * entries inline in _shared.tsx, and this parser went on finding an empty set
 * for a moment after they moved, which turned every preset's icon into a
 * failure. A parser that silently returns nothing is a guard that passes when
 * the map is deleted, so it now refuses to run on an empty result.
 */
const iconNames = (() => {
  const src = read("components/website-builder/sections/icon-map.tsx")
  const m = src.match(/const ICON_MAP[^{]*\{([\s\S]*?)\n\}/)
  const names = new Set(
    (m?.[1] ?? "").split("\n").map((l) => l.trim().match(/^"?([\w-]+)"?:/)?.[1]).filter(Boolean) as string[],
  )
  if (names.size === 0) throw new Error("ICON_MAP parsed as empty — the map moved again, or its shape changed")
  return names
})()

// ── 1. The registry ─────────────────────────────────────────────────────
section("The registry")

check("there are themes to browse", THEME_REGISTRY.length >= 8, `${THEME_REGISTRY.length}`)
check(
  "every theme id is a real UUID — the add route and the database both require it",
  THEME_REGISTRY.every((t) => isThemeId(t.id)),
  THEME_REGISTRY.filter((t) => !isThemeId(t.id)).map((t) => `${t.slug}: ${t.id}`).join(", "),
)
check("ids are unique", new Set(THEME_REGISTRY.map((t) => t.id)).size === THEME_REGISTRY.length)
check("slugs are unique", new Set(THEME_REGISTRY.map((t) => t.slug)).size === THEME_REGISTRY.length)
check(
  "the three original themes keep their original ids",
  ["a1b2c3d4-e5f6-7890-abcd-ef1234567890", "b2c3d4e5-f6a7-8901-bcde-f12345678901", "c3d4e5f6-a7b8-9012-cdef-123456789012"].every((id) =>
    THEME_REGISTRY.some((t) => t.id === id),
  ),
)
check(
  "every industry a theme names is one the marketplace can filter by",
  THEME_REGISTRY.every((t) => THEME_INDUSTRIES.some((i) => i.key === t.industry)),
)
check(
  "every industry has at least one theme, so no filter chip is a dead end",
  THEME_INDUSTRIES.every((i) => THEME_REGISTRY.some((t) => t.industry === i.key)),
  THEME_INDUSTRIES.filter((i) => !THEME_REGISTRY.some((t) => t.industry === i.key)).map((i) => i.key).join(", "),
)
check("the limit is five websites, as asked", THEME_INSTALL_LIMIT === 5)
check(
  "the old non-UUID theme ids are gone from the app",
  !/ebook-author-theme-001|course-creator-theme-001|designer-portfolio-theme-001/.test(
    [read("app/app/website-builder/website-builder-client.tsx"), read("app/app/website-builder/themes/themes-client.tsx"), read("app/api/website-builder/themes/add/route.ts")].join("\n"),
  ),
)

// ── 2. The presets, against the schemas ─────────────────────────────────
section("The presets")

for (const def of THEME_REGISTRY) {
  const preset = buildThemePreset(def)
  const problems: string[] = []
  for (const [pageKey, sections] of Object.entries(preset.pages)) {
    if (sections[0]?.type !== "header") problems.push(`${pageKey}: does not start with a header`)
    if (sections[sections.length - 1]?.type !== "footer") problems.push(`${pageKey}: does not end with a footer`)
    if (sections.length < 4) problems.push(`${pageKey}: only ${sections.length} sections`)
    const ids = new Set<string>()
    for (const s of sections) {
      if (ids.has(s.id)) problems.push(`${pageKey}/${s.id}: duplicate section id`)
      ids.add(s.id)
      const schema = schemas.get(s.type)
      if (!schema) {
        problems.push(`${pageKey}/${s.id}: no schema for type "${s.type}"`)
        continue
      }
      const fields = settable(schema.fields)
      const known = new Map(fields.map((x) => [x.id, x]))
      for (const [k, v] of Object.entries(s.settings)) {
        const f = known.get(k)
        if (!f) {
          problems.push(`${pageKey}/${s.id}.${k}: not a ${s.type} field`)
          continue
        }
        const opts = optionValues(f)
        if (opts && !opts.includes(String(v))) problems.push(`${pageKey}/${s.id}.${k}: "${v}" is not one of ${opts.join("|")}`)
        if (f.type === "icon" && !iconNames.has(String(v))) problems.push(`${pageKey}/${s.id}.${k}: icon "${v}" is not in ICON_MAP`)
      }
      for (const b of s.blocks ?? []) {
        const bs = schema.blocks?.find((x) => x.type === b.type)
        if (!bs) {
          problems.push(`${pageKey}/${s.id}/${b.id}: ${s.type} has no "${b.type}" block`)
          continue
        }
        const bknown = new Map(settable(bs.fields).map((x) => [x.id, x]))
        for (const [k, v] of Object.entries(b.settings)) {
          const f = bknown.get(k)
          if (!f) {
            problems.push(`${pageKey}/${s.id}/${b.id}.${k}: not a ${b.type} field`)
            continue
          }
          const opts = optionValues(f)
          if (opts && !opts.includes(String(v))) problems.push(`${pageKey}/${s.id}/${b.id}.${k}: "${v}" is not one of ${opts.join("|")}`)
          if (f.type === "icon" && !iconNames.has(String(v))) problems.push(`${pageKey}/${s.id}/${b.id}.${k}: icon "${v}" is not in ICON_MAP`)
        }
      }
    }
  }
  const declared = def.homeSections.join(",")
  const built = preset.pages.home.map((s) => s.type).join(",")
  if (declared !== built) problems.push(`homeSections says [${declared}] but the preset builds [${built}]`)
  if (!preset.settings.brand_name || !preset.settings.primary_color || !preset.settings.font_heading) problems.push("settings missing brand/colour/font")
  check(`${def.name}: every setting is a field its section actually has`, problems.length === 0, problems.slice(0, 8).join("\n        "))
}

check(
  "a preset is deterministic — the same theme builds the same install twice",
  JSON.stringify(buildThemePreset(THEME_REGISTRY[0])) === JSON.stringify(buildThemePreset(THEME_REGISTRY[0])),
)

// ── 3. The cover is a drawing ───────────────────────────────────────────
section("The cover")

{
  const bad: string[] = []
  for (const def of THEME_REGISTRY) {
    let html = ""
    try {
      html = renderToStaticMarkup(createElement(ThemeCover, { spec: coverSpecFromDefinition(def) }))
    } catch (e) {
      bad.push(`${def.slug}: threw ${(e as Error).message}`)
      continue
    }
    if (!html.startsWith("<svg")) bad.push(`${def.slug}: not an <svg>`)
    if (/<img|<iframe|<script|url\(/.test(html)) bad.push(`${def.slug}: loads something`)
    if (!html.includes(def.sample.brand)) bad.push(`${def.slug}: does not carry the brand`)
    if (!html.includes(def.palette.primary)) bad.push(`${def.slug}: does not use the primary colour`)
    if (html.length > 12000) bad.push(`${def.slug}: ${html.length} bytes is too heavy for a thumbnail`)
  }
  check("every registry theme renders to one self-contained SVG under 12 KB", bad.length === 0, bad.join("\n        "))
  const coverSrc = read("components/website-builder/theme-cover.tsx")
  check("no cover uses a transform — the app's .group rule strips them on touch devices", !/transform=/.test(coverSrc))
  const phone = renderToStaticMarkup(createElement(ThemePhoneCover, { spec: coverSpecFromDefinition(THEME_REGISTRY[0]) }))
  check("the phone cover is a second drawing of the same theme", phone.startsWith("<svg") && phone.includes('viewBox="0 0 390 780"') && phone.includes(THEME_REGISTRY[0].sample.brand))
}
{
  const spec = coverSpecFromSettings({ brand_name: "Acme", primary_color: "#ff0000", background_color: "#111111" }, null, "Fallback")
  const html = renderToStaticMarkup(createElement(ThemeCover, { spec }))
  check("an install without a snapshot is drawn from its own settings", html.includes("Acme") && html.includes("#ff0000") && html.includes("#111111"))
  const dark = coverSpecFromSettings({ background_color: "#000000" }, null, "x")
  check("a dark page gets readable hero text", dark.heroText === "#ffffff")
}

// ── 4. The page ─────────────────────────────────────────────────────────
section("The page")

{
  const page = read("app/app/website-builder/page.tsx")
  const client = stripComments(read("app/app/website-builder/website-builder-client.tsx"))
  check("the route is a server component", !/^\s*"use client"/m.test(page) && /export default async function/.test(page))
  check("the server reads installs itself and seeds a first-time creator in the same request", /store_theme_installs/.test(page) && /initialize_creator_themes/.test(page))
  /*
    PAGES' TIMESTAMPS, NEVER THEIR SECTIONS. The list needs to know when each
    site was last edited, to tell a cover that is older than the site from
    one that is not, and that is the one thing it reads from the pages. The
    sections — the whole content of every page — are what this was written
    to keep out, and they still are.
  */
  check("the server does not fetch pages' sections just to draw a list",
    !/sections/.test(page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")) &&
      /pages:store_theme_pages\(updated_at\)/.test(page))
  check("the client is a client component", /^\s*"use client"/m.test(client))
  check("the client never fetches on mount — the server already handed it the data", !/fetch\("\/api\/website-builder\/themes"\)/.test(client) && !/initialize/.test(client))
  check(
    "no live storefront is mounted on the page: no SectionRenderer, no ThemePage, no CSS zoom",
    !/SectionRenderer|ThemePage|zoom:/.test(client) && !/RENDER_WIDTH/.test(client),
  )
  check("the cover is the snapshot when there is one, and the drawn cover otherwise", /snapshot_url/.test(client) && /ThemeCover/.test(client) && /coverSpecFromSettings/.test(client))
  check("the snapshot is a plain <img>, not an optimiser round-trip", /<img/.test(client) && !/from "next\/image"/.test(client))
  check("the live cover loads eagerly with high priority; library thumbnails lazily", /fetchPriority=\{eager \? "high"/.test(client) && /loading=\{eager \? "eager" : "lazy"\}/.test(client))
  check("there is no skeleton inside the component", !/animate-pulse|skeleton/.test(client))
  /*
    NO SKELETON, NOT A DEFERRED ONE. The route's skeleton.tsx was left behind
    when the route skeletons were removed: nothing imported it, and a test
    here read it as if it still drew the slow load. The owner asked for no
    skeleton on a phone when switching pages; a slow server render is the
    app stage's spinner, the same on every page.
  */
  check("no route skeleton is left for the page, rendered or not",
    !existsSync(join(process.cwd(), "app/app/website-builder/skeleton.tsx")) && !existsSync(join(process.cwd(), "app/app/website-builder/loading.tsx")) &&
      !/skeleton|loading\.tsx/i.test(stripComments(page)))
  check("mutations refresh the server's view rather than patching a client copy", /router\.refresh\(\)/.test(client) && /useTransition/.test(client))
  check("the page uses the shared action menu, dialogs and buttons", /ResponsiveActionMenu/.test(client) && /AlertDialog/.test(client) && /from "@\/components\/ui\/button"/.test(client))
  check("the primary action is Storelib dark, not a purple button", /Edit website/.test(client) && !/bg-\[#8b5cf6\]/.test(client))
  {
    /*
      THE TITLE ROW. A bar of six labelled settings doors sat above the cover
      and read as a second navigation; then three controls beside the title
      (View website, Public, Settings) wrapped under it on a phone. The owner
      asked for Settings alone, on the title's own line. Nothing it replaced
      is lost: View website and Take offline are in the live website's More
      menu, and an offline website's row says Publish again.
    */
    const live = client.slice(client.indexOf('<section aria-labelledby="live-heading"'), client.indexOf("{/* ── Library"))
    const header = client.slice(client.indexOf("data-title-row") - 80, client.indexOf('<section aria-labelledby="live-heading"'))
    check("the bar of settings doors is gone", !existsSync(join(process.cwd(), "app/app/website-builder/settings-strip.tsx")) && !/SettingsStrip/.test(client))
    check("the three header controls are gone, and their file with them",
      !existsSync(join(process.cwd(), "app/app/website-builder/site-controls.tsx")) && !/SiteControls/.test(client) && !/"Unpublished"/.test(client))
    check("the title row holds the heading and one control, Settings, on one line at every width",
      /<div className="flex items-center justify-between gap-3" data-title-row="">/.test(header) &&
        (header.match(/data-control=/g) ?? []).length === 1 && /data-control="settings"/.test(header) &&
        /<h1 className="min-w-0 truncate/.test(header) && !/sm:flex-row/.test(header))
    check("  Settings opens Website Settings in the editor, for the live site or the one that was",
      /const settingsFor = live \?\? offline \?\? installs\[0\] \?\? null/.test(client) && /onClick=\{\(\) => go\(editorHref\(username, settingsFor\.id, "settings"\)\)\}/.test(header))
    check("  44px on a phone, 36px from a tablet up, overhanging the title line rather than growing it",
      /const SETTINGS_BUTTON =\s*"-my-1 inline-flex h-11 [^"]*sm:my-0 sm:h-9"/.test(read("app/app/website-builder/website-builder-client.tsx")) && /border border-\[#e5e7eb\]/.test(header + client))
    check("View website is the first row of the live site's More menu, a real anchor to a new tab",
      /if \(i\.status === "published" && siteUrl\) items\.push\(\{ label: "View website", icon: <SquareArrowOutUpRight \/>, href: siteUrl, target: "_blank" \}\)/.test(client))
    check("Take offline stays in the live site's More menu, through the page's own question",
      /items\.push\(\{ label: "Take offline", icon: <EyeOff \/>, onClick: \(\) => setUnpublishing\(i\)/.test(client))
    check("an offline website's row says Publish again, through the page's own question",
      /label: i\.status === "unpublished" \? "Publish again" : "Publish", icon: <Rocket \/>, onClick: \(\) => setPublishing\(i\)/.test(client))
    /*
      NOTHING LIVE IS SAID, NOT HIDDEN. The header's Public control was the
      one place that said the site was down; with it gone, the offline
      website's row called it a Draft and the card said only "Nothing is
      live". It is found by status alone ("unpublished" only ever means a
      site that was live), since published_at is missing on a database
      without that column, which made the site vanish from every label.
    */
    check("  the website taken offline is found by its status, newest first, not only when published_at exists",
      /\.filter\(\(i\) => i\.status === "unpublished"\)/.test(client) && !/i\.status === "unpublished" && !!i\.published_at/.test(client))
    check("  its row says Offline, on the attention tint, and the card says the website is offline with Publish again",
      /<DraftBadge offline=\{i\.id === offline\?\.id\} \/>/.test(client) && /bg-\[#ffef9d\] text-\[#4f4700\]/.test(client) &&
        /"Your website is offline"/.test(client) && /onClick=\{\(\) => setPublishing\(offline\)\}/.test(live) &&
        /\{i\.id === offline\?\.id \? "Offline" : "Draft"\} · Edited/.test(client))
    check("the live site's More menu no longer carries Website settings", !/WEBSITE_SETTINGS/.test(client) && !/section: n === 0 \? "Website settings"/.test(client))
    check("the card's buttons are Edit website and a square More", /<div className="mt-auto flex gap-2 pt-5">/.test(live) && /"w-11 shrink-0 px-0"/.test(live) && !/View site/.test(live))
    check("  no numbers are counted for it any more", !/websitePerformanceFor/.test(read("app/app/website-builder/page.tsx")))
    const frame = /const COVER_FRAME =\s*"([^"]+)"/.exec(client)?.[1] ?? ""
    check("the cover is clipped to 12px corners on all four sides",
      /\brounded-\[12px\]/.test(frame) && /\boverflow-hidden\b/.test(frame) && /className=\{COVER_FRAME\}/.test(live))
    check("  with a hairline drawn over the picture and a soft two layer shadow",
      /after:shadow-\[inset_0_0_0_1px_rgba\(15,23,42,0\.08\)\]/.test(frame) && /shadow-\[0_1px_2px_rgba\(15,23,42,0\.06\),0_10px_28px_-14px_rgba\(15,23,42,0\.22\)\]/.test(frame))
    check("  set into the card, not cut flush with its edge", /<div className="min-w-0 p-4 pb-3 lg:pb-4 lg:pr-2">/.test(live))
    check("the old tab rule is gone from the stylesheet", !/\.wb-tab\b/.test(read("app/globals.css")))
  }
  /**
   * The rule is that the live site opens in a new tab from a REAL anchor —
   * never `window.open`, which a pop-up blocker eats and a middle-click
   * cannot use. It used to be satisfied by an icon-only square and a row of
   * the menu beside it; it is one labelled button now, so the shape it is
   * checked in changed while the rule did not.
   */
  check("the live link is a real anchor that opens a new tab",
    /href: siteUrl, target: "_blank"/.test(client) &&
      /rel=\{item\.target === "_blank" \? "noopener noreferrer" : undefined\}/.test(read("components/ui/responsive-action-menu.tsx")) &&
      !/window\.open\(siteUrl/.test(client))
  check("covers show the theme on a desktop and a phone", /ThemeCoverPair/.test(client) && /phone/.test(client))
  check("publishing over a live website asks first and says what happens to the old one", /Publish “\{publishing\?\.name\}”\?/.test(client) && /It replaces “\{live\.name\}”/.test(client))
  check("every install action is still here: rename, duplicate, code, settings, export, publish, unpublish, delete, import, add", [
    // The file is a .storelib-theme package now, so the two labels name the
    // thing rather than the container; the actions are the same ones.
    "Rename", "Duplicate", "Edit code", "Website settings", "Export theme", "Take offline", "Remove", "Import theme", "themes/add", "action: \"publish\"", "action: \"unpublish\"", "themes/import",
    // The import itself lives beside the page now (incoming.tsx importThemeFile), which the page calls.
  ].every((s) => (client + read("app/app/website-builder/incoming.tsx")).includes(s)) && /importThemeFile\(file, \{ progress, sent \}\)/.test(client))
  {
    /*
      THE FULL LIBRARY. Import was disabled when the library was full, so a
      click did nothing and its message could never show. Then it was a
      centred modal on a phone with a boxed list and bordered red buttons.
      Now: the shared bottom sheet on a phone, a compact modal from 640px,
      the Polaris shape in both, and every number from the limit.
    */
    const fullDialog = stripComments(read("app/app/website-builder/library-full-dialog.tsx"))
    check("the library is capped at the limit and says so", /THEME_INSTALL_LIMIT/.test(client) && /"Your library is full"/.test(fullDialog) && /<LibraryFullDialog/.test(client))
    check("  a bottom sheet on a phone, the app's shared one, wrapped rather than edited",
      /import \{ BottomSheet \} from "@\/components\/ui\/bottom-sheet"/.test(fullDialog) && /const PHONE = "\(max-width: 639px\)"/.test(fullDialog) &&
        /if \(phone\) \{\s*return \(\s*<BottomSheet/.test(fullDialog) && /data-surface="sheet"/.test(fullDialog))
    check("  a compact modal from 640px up", /<AlertDialogContent[\s\S]*?data-surface="modal"[\s\S]*?sm:max-w-\[440px\]/.test(fullDialog))
    check("  one sentence, computed from the limit, never a number written out",
      /DRAFT_LIMIT/.test(fullDialog) && !/\b[0-9] drafts\b|two drafts|three websites/.test(fullDialog))
    check("  a status badge on each website, and Remove as a plain red word on each draft",
      /function StatusBadge/.test(fullDialog) && /bg-\[#cdfee1\] text-\[#0c5132\]/.test(fullDialog) &&
        /!e\.live && onRemove/.test(fullDialog) && /text-\[#c4290c\]/.test(fullDialog) && !/Trash2/.test(fullDialog) && !/border border-\[#e5e7eb\] bg-white px-2\.5 text-\[12\.5px\] font-medium text-\[#b42318\]/.test(fullDialog))
    check("  a single Close, and no card inside the card",
      (fullDialog.match(/>\s*Close\s*</g) ?? []).length === 2 && !/rounded-xl border border-\[#e5e7eb\] bg-\[#fafbfb\]/.test(fullDialog))
    check("  Import is never dead: full, it opens the sheet before any file is picked", /onClick=\{\(\) => \(slotsLeft === 0 \? setFull\("import"\) : fileInput\.current\?\.click\(\)\)\}/.test(client) && !/disabled=\{busy === "import" \|\| slotsLeft === 0\}/.test(client))
    check("  and Add theme, Duplicate and every Add do the same", /setFull\("add"\)/.test(client) && /setFull\("duplicate"\)/.test(client) && /setFull\("add"\)/.test(read("app/app/website-builder/themes/themes-client.tsx")))
    check("  it lists what takes the room, with Remove on each draft, through the usual question", /Remove/.test(fullDialog) && /if \(target\) setDeleting\(target\)/.test(client))
    check("  a refusal from the server opens it too, rather than a toast, and the placeholder goes",
      /if \(data\.code === LIBRARY_FULL_CODE\) \{\s*if \(!mounted\.current\) return\s*setIncoming\(null\)\s*retryRef\.current = null\s*setFull\(kind\)/.test(client))
    check("  Browse themes opens the same sheet on the server's refusal, not a toast",
      /if \(d\.code === LIBRARY_FULL_CODE\) \{\s*setFull\("add"\)/.test(read("app/app/website-builder/themes/themes-client.tsx")))
    check("  each website in it says Live, Offline or Draft", /live \? "Live" : offline \? "Offline" : "Draft"/.test(fullDialog) && /offline: i\.id === offline\?\.id/.test(client))
  }
  {
    /*
      A WEBSITE ON ITS WAY IN. Import was a spinner in the button and a row
      that appeared somewhere nobody was looking. Now its row is drawn at
      once where it will land, the upload reports real progress, the real
      row replaces it in the same frame, and the page scrolls to it.
    */
    const incoming = stripComments(read("app/app/website-builder/incoming.tsx"))
    const css = read("app/globals.css")
    check("the upload goes by XMLHttpRequest and reports its progress", /new XMLHttpRequest\(\)/.test(incoming) && /xhr\.upload\.onprogress/.test(incoming) && /xhr\.upload\.onload/.test(incoming))
    check("  the button says Uploading with a percentage, then Importing", /`Uploading \$\{Math\.round\(incoming\.progress \* 100\)\}%`/.test(client) && /: "Importing"\) : "Import theme"/.test(client))
    check("  the placeholder row is drawn after the library's rows, where the server puts a new website",
      client.indexOf("<IncomingRow") > client.indexOf("{library.map((i) => {") && /showingIncoming && incoming && \(/.test(client))
    check("  every route puts a new website after the others", ["app/api/website-builder/themes/add/route.ts", "app/api/website-builder/themes/[installId]/duplicate/route.ts", "app/api/website-builder/themes/import/route.ts"].every((p) => /nextSortOrder\(admin, creator\.id\)/.test(read(p))) &&
      /\.order\("sort_order", \{ ascending: false \}\)/.test(read("lib/website-builder/library-limit.ts")))
    check("  the real row replaces it in the same render, by id", /const landed = !!incoming\?\.installId && installs\.some\(\(i\) => i\.id === incoming\.installId\)/.test(client) && /const showingIncoming = !!incoming && !landed/.test(client))
    check("  then it is scrolled to the middle of the element that scrolls, not the window",
      /scrollToRow\(row, "center"\)/.test(client) && /export function scrollerOf/.test(incoming) && /scroller\.scrollTo\(\{ top: target, behavior: smooth \? "smooth" : "auto" \}\)/.test(incoming) && !/scrollIntoView/.test(incoming))
    check("  and ringed once for 1.2s, on opacity only, and still under reduced motion",
      /export const ARRIVAL_MS = 1200/.test(incoming) && /\.wb-arrived \{[^}]*opacity: 0;[^}]*animation: wb-arrived/.test(css) &&
        /@keyframes wb-arrived \{[^}]*opacity[^}]*\}/.test(css) && /\.wb-arrived \{ animation: none; opacity: 1; \}/.test(css))
    check("  the ring is a layer over the card at the row's place, never a pseudo element on the table row",
      /data-arrival-ring=""/.test(client) && !/\.wb-arrived::after/.test(css) && !/"wb-arrived"\)/.test(client))
    check("  the placeholder has the real row's four cells, so a phone's table keeps its columns",
      !/colSpan/.test(incoming) && /<td className="hidden px-3 sm:table-cell" \/>/.test(incoming) && /<td className="hidden px-3 md:table-cell" \/>/.test(incoming) && /<td className="w-\[52px\] pr-3 sm:w-auto sm:px-4">/.test(incoming))
    check("  the placeholder breathes on opacity and sweeps on transform, and stops under reduced motion",
      /@keyframes wb-incoming-pulse \{\s*0%, 100% \{ opacity: 0\.35; \}/.test(css) && /@keyframes wb-incoming-sweep \{\s*from \{ transform:/.test(css) &&
        /\.wb-incoming-pulse,\s*\.wb-incoming-sweep \{ animation: none; \}/.test(css))
    check("  a failure stays on the row with Try again, and a toast", /Try again/.test(incoming) && /phase: "error", error: message/.test(client) && /toast\(\{ title: message, variant: "destructive" \}\)/.test(client))
    check("  Duplicate and Add theme take the same path", /make\(\s*"duplicate"/.test(client) && /make\(\s*"add"/.test(client) && /make\(\s*"import"/.test(client))
  }
  check("the marketplace route the old page linked to now exists", existsSync(join(process.cwd(), "app/app/website-builder/themes/page.tsx")))
  const market = stripComments(read("app/app/website-builder/themes/themes-client.tsx"))
  check("Browse themes offers one theme, shown whole, and adds it", /BROWSABLE_THEMES\.map/.test(market) && /ThemeShowcase/.test(market) && /themes\/add/.test(market) && BROWSABLE_THEMES.length === 1)
  check("  the others stay defined for the websites made from them, and cannot be added", THEME_REGISTRY.length > BROWSABLE_THEMES.length && /BROWSABLE_THEME_IDS\.includes\(def\.id\)/.test(read("app/api/website-builder/themes/add/route.ts")))
  check("  nothing on either page rises under the pointer", !/hover:-translate-y/.test(market) && !/hover:-translate-y/.test(client) && !/active:scale-95/.test(market))
  check("the marketplace draws covers too, no storefront is mounted there either", !/SectionRenderer|ThemePage/.test(market) && /ThemeCover\b/.test(market) && /ThemePhoneCover/.test(market))
  check("the marketplace has a real back button and no paragraph of explanation", /ChevronLeft/.test(market) && !/Every theme is free/.test(market))
}

// ── The canvas insert gaps ──────────────────────────────────────────────
section("Adding a section where you are pointing")
{
  const S = (id: string, type: string) => ({ id, type, name: id, settings: {}, blocks: [] }) as never
  const page = [S("h", "header"), S("a", "hero"), S("b", "features"), S("c", "faq"), S("f", "footer")]

  // Gap 0 is above the first BODY section, which is index 1 in the list.
  check("the gap above the first body section lands under the header, not above it", bodyGapToListIndex(page, 0) === 1)
  check("a gap between two body sections lands between them", bodyGapToListIndex(page, 1) === 2 && bodyGapToListIndex(page, 2) === 3)
  // Gap 3 is below the last body section: index 4, which is where the footer
  // is — splicing there puts the new section BEFORE the footer, correctly.
  check("the gap below the last body section lands above the footer", bodyGapToListIndex(page, 3) === 4)
  check("a gap past the end still lands above the footer rather than after it", bodyGapToListIndex(page, 99) === 4)

  const noChrome = [S("a", "hero"), S("b", "faq")]
  check("without a header the first gap is the top of the list", bodyGapToListIndex(noChrome, 0) === 0)
  check("and without a footer the last gap is the end of it", bodyGapToListIndex(noChrome, 2) === 2)

  // A page that is nothing but chrome has no body gap to speak of, and the
  // editor falls back to appending rather than splicing at a made-up index.
  check("a page with only chrome reports no gap", bodyGapToListIndex([S("h", "header"), S("f", "footer")], 0) === null)
  check("an empty page reports no gap", bodyGapToListIndex([], 0) === null)
}

// ── Icons, and where a link goes ────────────────────────────────────────
section("Choosing an icon, and choosing where a link goes")
{
  const lib = read("lib/website-builder/icon-library.ts")
  const map = read("components/website-builder/sections/icon-map.tsx")
  const shared = read("components/website-builder/sections/_shared.tsx")
  const picker = stripComments(read("components/website-builder/icon-picker.tsx"))
  const linkPicker = stripComments(read("components/website-builder/link-picker.tsx"))
  const editorSrc = stripComments(read("app/website-builder/editor/[installId]/page.tsx"))

  /**
   * THE SET OFFERED AND THE SET DRAWN ARE THE SAME SET.
   *
   * This is the rule that matters. The old map had ten icons in it while the
   * themes already named others — `stats.json` defaults to "users" and
   * `process_steps.json` to "user-plus", neither of which was a key — so every
   * statistic and every process step on every site drew a lightning bolt. An
   * icon a creator can pick and then cannot get is the same bug wearing a
   * nicer coat.
   */
  const inLibrary = new Set([...lib.matchAll(/names: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1])))
  const inMap = new Set([...map.matchAll(/^  "([a-z0-9-]+)":/gm)].map((m) => m[1]))
  const offered = [...inLibrary].filter((n) => !inMap.has(n))
  const drawn = [...inMap].filter((n) => !inLibrary.has(n))
  check(
    "the set a creator can pick from and the set a page can draw are the same set",
    inMap.size >= 150 && offered.length === 0 && drawn.length === 0,
    offered.length ? `offered but not drawable: ${offered.join(", ")}` : `drawable but not offered: ${drawn.join(", ")}`,
  )
  check(
    "and the two theme defaults that used to fall back to a lightning bolt now resolve",
    inMap.has("users") && inMap.has("user-plus"),
  )
  // Everything the old ten-icon map could draw, it still can. Dropping one
  // silently would swap a live site's icon for a lightning bolt, which is how
  // this went wrong in the first place: "star" was left out of the first
  // draft of the library and a theme was already using it.
  check(
    "no icon the old map had was lost on the way",
    ["zap", "shield", "star", "check-circle", "download", "heart", "globe", "lock", "refresh-cw", "rocket"].every((n) => inMap.has(n)),
  )
  check("the renderer reads that map rather than a hand-written ten", /import \{ ICON_MAP \} from "\.\/icon-map"/.test(shared) && !/const ICON_MAP: Record<string, React\.ComponentType/.test(shared))
  check(
    "the icons are imported by name, not through lucide's thousand dynamic imports",
    /from "lucide-react"/.test(map) && !/dynamicIconImports/.test(map),
  )

  /**
   * FieldEditor resolves a field's type through the control registry first
   * (`kind`), so the JSON schemas' `icon` and `link` and the .storelib
   * schemas' `icon_picker` and `url` reach the same branch. The branch is
   * checked by its resolved name, and the resolution itself is checked, or a
   * branch on the raw type would quietly leave one spelling with a text box.
   */
  check("field types are resolved through the control registry, once", /const kind = resolveControlType\(field\.type\) \?\? field\.type/.test(editorSrc) && !/if \(field\.type === "(icon|link|image|video|font)"\)/.test(editorSrc))
  check("an icon field gets a picker instead of falling through to a text box", /if \(kind === "icon_picker"\) \{\s*return <IconPicker/.test(editorSrc))
  check("and a link field gets one instead of a bare input", /if \(kind === "url"\) \{\s*return <LinkFieldEditor/.test(editorSrc) && !/kind === "text" \|\| kind === "url"/.test(editorSrc))

  check("the link picker lists the site's own pages and products", /kind: "page"/.test(linkPicker) && /kind: "product"/.test(linkPicker))
  /**
   * AND NOT COLLECTIONS. There is no collection in this product: the group
   * was fed by `/api/collections`, which is not a route, so the fetch 404'd,
   * the list was always empty and the heading could never be filled. The
   * header's nav link offered "Collection" as a link type for the same
   * nothing, pointing at /collections/<id>, which is not a route either.
   */
  check("and not collections, which do not exist", !/kind: "collection"/.test(linkPicker) && !/Collections/.test(linkPicker))
  check("the nav link cannot be pointed at one", !/collections\//.test(read("components/website-builder/sections/renderers/HeaderSection.tsx").replace(/\/\/.*$/gm, "")))
  check("and Shop in the picker is the address the shop is at", /\{ href: "\/products", label: "Shop", kind: "page" \}/.test(editorSrc) && !/href: "\/shop"/.test(editorSrc))
  /**
   * THE FIELD IS THE ADDRESS. The list used to end in an "Or any address"
   * box, a second place to type a link under the first. Now the field takes
   * any address itself, checked and tidied on Enter or blur, and the list is
   * the site's pages and products and nothing else.
   */
  check(
    "and still takes any address at all, typed into the field itself",
    /role="combobox"/.test(linkPicker) && /normalizeLinkAddress\(text\)/.test(linkPicker) && /mailto/.test(read("lib/website-builder/link-address.ts")),
  )
  check("with no custom address row in the list", !/Or any address/.test(linkPicker) && !/custom/i.test(linkPicker.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("and the nav and call to action links use the same field", !/function NavLinkPicker/.test(editorSrc) && (editorSrc.match(/<LinkFieldEditor/g) ?? []).length >= 3)
  check(
    "the targets come from the same lists the page browser shows, so the two cannot disagree",
    /const linkTargets = useMemo<LinkTarget\[\]>/.test(editorSrc) &&
      /\.\.\.customPages\.map/.test(editorSrc) &&
      /\.\.\.products\.map/.test(editorSrc) &&
      (editorSrc.match(/<LinkTargetsProvider targets=\{linkTargets\}>/g) ?? []).length === 2,
  )

  // Opening in the flow rather than floating: the sidebar is a scroller
  // inside a canvas inside a phone sheet, and a positioned popover there has
  // to be re-measured on every scroll and can still land under the fold.
  check("the pickers open in the flow, and close on Escape or a click away", /export function FieldPopover/.test(stripComments(read("components/website-builder/field-popover.tsx"))) && /e\.key !== "Escape"/.test(read("components/website-builder/field-popover.tsx")))
  check("and both are measured by the phone sheet rather than collapsing it", /data-sheet-scroll/.test(picker) && /data-sheet-scroll/.test(linkPicker))
}

check("the editor deep link carries the creator slug and the pane", editorHref("mara", "abc", "code") === "/store/mara/themes/abc/editor?previewPath=%2F&view=code")
check("without a slug the legacy editor path is used", editorHref("", "abc") === "/website-builder/editor/abc?previewPath=%2F")

// ── 5. The add route ────────────────────────────────────────────────────
section("The add route")
{
  const add = stripComments(read("app/api/website-builder/themes/add/route.ts"))
  check("installs from the registry, not a hand-copied settings map", /buildThemePreset/.test(add) && !/settingsMap/.test(add))
  check("rejects anything that is not a theme id before touching the database", /isThemeId\(themeId\)/.test(add))
  check("enforces the shared limit", /librarySlotsLeft\(supabase, creator\.id\)/.test(add) && /if \(slotsLeft === 0\)/.test(add))
  /* Duplicate and Import wrote a new website without asking, so a library
     the page called full could still grow. Every route that creates one
     asks the same helper, before it writes anything. */
  for (const [label, path] of [
    ["duplicate", "app/api/website-builder/themes/[installId]/duplicate/route.ts"],
    ["import", "app/api/website-builder/themes/import/route.ts"],
  ] as const) {
    const src = stripComments(read(path))
    const asks = src.indexOf("librarySlotsLeft(supabase, creator.id)")
    const writes = src.indexOf(".insert(")
    check(`${label} asks the limit before it writes`, asks > 0 && writes > asks)
  }
  {
    const lim = read("lib/website-builder/library-limit.ts")
    check("an unreadable count is treated as full, not as room", /if \(error\) return 0/.test(lim))
    check("the message names one live and the drafts, from the limit", /one live and \$\{DRAFT_LIMIT\}/.test(lim) && !/two drafts/.test(lim))
    check("  and a refusal carries a code the page can act on", /code: LIBRARY_FULL_CODE/.test(stripComments(add)))
  }
  check("inserts the catalogue row itself when the database has not heard of a registry theme", /themeCatalogRow/.test(add) && /upsert/.test(add))
  check("a half-built install is rolled back rather than left as an empty website", /\.delete\(\)\.eq\("id", newInstall\.id\)/.test(add))
}

// ── 6. The cover ────────────────────────────────────────────────────────
/*
  THE COVER IS TAKEN BY A BROWSER ON THE SERVER.

  It used to be photographed in the editor with html-to-image, and that was
  wrong three ways in turn: blank below the header (the theme's entrance
  animation replayed inside the picture), phone-shaped from a phone, and
  then a hidden copy of the page to work round the second. The card went on
  showing the theme's sample copy — "Presets that hit different" for a site
  called THE CHAIR — through all of it.

  Now a real Chromium opens the saved home page, the way a visitor's browser
  does, and photographs it at a laptop's width and a phone's. The checks
  below hold who may ask for that, what the browser is allowed to open, what
  gets kept, and when it is asked for. scripts/check-cover-shot.mts holds the
  pictures themselves.
*/
section("The cover")
{
  const route = stripComments(read("app/api/website-builder/themes/[installId]/cover/route.ts"))
  /* The photographing moved to one helper every route that makes a website calls. */
  const take = stripComments(read("lib/website-builder/cover-take.ts"))
  check("the install must belong to the caller's creator", /\.eq\("creator_id", \(creator as \{ id: string \}\)\.id\)/.test(route))
  check("the install id is validated as a UUID before it becomes part of a path", /isThemeId\(installId\)/.test(route))
  check("the storage path is built from the user id and the install id only",
    snapshotFolder("u1", "i1") === "u1/theme-snapshots/i1" &&
      /const folder = snapshotFolder\(owner\.userId, owner\.installId\)/.test(take) && /userId: user\.id/.test(route) &&
      snapshotName("abc", "webp") === `abc.v${SNAPSHOT_VERSION}.webp` &&
      snapshotName("abc", "webp", true) === `abc.v${SNAPSHOT_VERSION}.m.webp`)
  /*
    THE BROWSER GOES WHERE THIS SERVER SAYS. The render page's origin is this
    deployment's own when it is one of ours and the main domain otherwise —
    never the Host header on trust, because that is the caller's to write and
    this is where a browser holding a pass is about to go.
  */
  check("the browser is sent to this server's own render page, not to a host the request names",
    /function renderOrigin\(requestUrl: string\)/.test(take) && /return `https:\/\/\$\{main\}`/.test(take) &&
      /\/cover-render\/\$\{encodeURIComponent\(pass\)\}/.test(take) && /renderOrigin\(req\.url\)/.test(route))
  check("a cover taken moments ago is handed back rather than taken again",
    /const MIN_GAP_MS = \d+/.test(take) && /Date\.now\(\) - newestAt < MIN_GAP_MS/.test(take))
  check("a cover that cannot be taken is said out loud and keeps the last one",
    /console\.error\("\[cover\]/.test(route) && /status: 502/.test(route))
  check("the folder is kept to the newest few covers, after the response",
    SNAPSHOTS_KEPT >= 2 && /await prune\(folder\)/.test(take) && /staleSnapshots\(/.test(take))
  /*
    A WEBSITE IS PHOTOGRAPHED WHEN IT IS MADE, not after its first save: a
    theme just added, imported or copied used to sit under a drawing of the
    theme's sample shop until somebody opened it and saved.
  */
  for (const [label, file] of [
    ["added", "app/api/website-builder/themes/add/route.ts"],
    ["imported", "app/api/website-builder/themes/import/route.ts"],
    ["copied", "app/api/website-builder/themes/[installId]/duplicate/route.ts"],
  ] as const) {
    const src = stripComments(read(file))
    check(`a website ${label} is photographed as soon as it exists, after the answer`, /after\(\(\) => coverAfterCreate\(/.test(src) && /export const maxDuration = \d+/.test(src))
  }
  check("  a copy starts from its source's picture", /await copyCover\(user\.id, installId, owner\)/.test(stripComments(read("app/api/website-builder/themes/[installId]/duplicate/route.ts"))))
  check("  a copy is the whole website: drafts, live values and section files",
    /draft_settings: srcSettings\?\.draft_settings/.test(read("app/api/website-builder/themes/[installId]/duplicate/route.ts")) &&
      /draft_sections: p\.draft_sections/.test(read("app/api/website-builder/themes/[installId]/duplicate/route.ts")) &&
      /store_theme_custom_files"\)\.insert/.test(read("app/api/website-builder/themes/[installId]/duplicate/route.ts")))
  check("  an export carries the cover, and an import shows it at once without adding it to the media library",
    /cover: cover\.ref/.test(read("app/api/website-builder/themes/[installId]/export/route.ts")) &&
      /if \(coverHashes\.has\(hash\)\) continue/.test(read("app/api/website-builder/themes/import/route.ts")) &&
      /await storeCover\(owner/.test(read("app/api/website-builder/themes/import/route.ts")))
  check("  a picture from a package is a WebP by its bytes and no bigger than a cover", isPackagedCover(new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80,0,0,0,0]), 1024) && !isPackagedCover(new TextEncoder().encode("<svg onload=alert(1)>......"), 1024))
  check("  an error page is never kept as a cover", /if \(status >= 400\) throw/.test(read("lib/website-builder/cover-shot.ts")))
  check("  an import is a draft, not a site taken offline", !/status: "unpublished"/.test(read("app/api/website-builder/themes/import/route.ts")))
  check("the route has the time a cold browser needs", /export const maxDuration = \d+/.test(route) && /runtime = "nodejs"/.test(route))

  /*
    THE PASS. The browser has no session, and the creator's own preview link
    is theirs to make and share, so it is not borrowed. The pass is for one
    install, for two minutes, signed with a server-only secret.
  */
  const pass = read("lib/website-builder/cover-pass.ts")
  check("the pass is server-only and signed", /^import "server-only"/m.test(pass) && /createHmac\("sha256"/.test(pass))
  check("it names one install, inside the signed part", /const body = `\$\{installId\}\.\$\{/.test(pass))
  check("it expires in minutes", /const TTL_MS = 2 \* 60 \* 1000/.test(pass) && /< now\) return null/.test(pass))
  check("and is compared in constant time", /timingSafeEqual\(a, b\)/.test(pass))
  check("it never uses the service key itself, only a key derived from it",
    /createHmac\("sha256", base\)\.update\("storelib:cover-render:v1"\)/.test(pass))

  /* And by running it, because a signature scheme read as source is a
     signature scheme nobody has tried to break. */
  {
    const had = process.env.SUPABASE_SERVICE_ROLE_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key-for-the-suite"
    const A = "11111111-1111-4111-8111-111111111111"
    const B = "22222222-2222-4222-8222-222222222222"
    const now = Date.UTC(2026, 8, 23)
    const good = mintCoverPass(A, now)
    const [id, exp, sig] = good.split(".")
    check("  a pass this server made opens its own install", readCoverPass(good, now + 1000) === A)
    check("  not once its two minutes are up", readCoverPass(good, now + 3 * 60 * 1000) === null)
    check("  not with another install's id put in its place", readCoverPass(`${B}.${exp}.${sig}`, now) === null)
    check("  not with its time pushed back", readCoverPass(`${id}.${(now + 60 * 60 * 1000).toString(36)}.${sig}`, now) === null)
    check("  not with its signature altered", readCoverPass(`${id}.${exp}.${sig.slice(0, -2)}AA`, now) === null)
    check("  and not for anything that is not a pass at all",
      readCoverPass("", now) === null && readCoverPass("../../etc", now) === null && readCoverPass("a.b.c.d", now) === null)
    if (had === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  }

  const render = stripComments(read("app/(site)/cover-render/[pass]/page.tsx"))
  check("the render page refuses anything that is not a live pass", /const installId = readCoverPass\(/.test(render) && /if \(!installId\) notFound\(\)/.test(render))
  check("and is dynamic and never indexed", /dynamic = "force-dynamic"/.test(render) && /index: false/.test(render))
  check("and its path is reserved on every domain and as a username",
    /"\/cover-render"/.test(read("proxy.ts")) && /"cover-render"/.test(read("lib/routes/reserved-segments.ts")))
  const site = read("app/(site)/w/[username]/render-site.tsx")
  check("it draws the SAVED page — drafts — through the same renderer as the site",
    /export async function coverPage\(installId: string\)/.test(site) &&
      /pageSections<SectionInstance\[\]>\(pageData as never, true\)/.test(site) &&
      /themeSettingsOf\(settingsRow as never, true\)/.test(site))
  check("inside the wrapper that stops sections animating in, or the screenshot catches them fading",
    /<div data-snapshot-stage="">/.test(site) &&
      /\[data-snapshot-stage\] \[data-section\] \{\s*animation: none !important;/.test(read("app/globals.css")))
  check("and a screenshot can never send a form: no creator is handed to the page",
    /storefront=\{\{ installId \}\}/.test(site))

  const shot = read("lib/website-builder/cover-shot.ts")
  check("the screenshots are a laptop's screen and a phone's",
    /DESKTOP = \{ width: 1440, height: 900 \}/.test(shot) && /PHONE = \{ width: 390, height: 844 \}/.test(shot))
  check("and are taken once the network has gone quiet, the fonts are in and the pictures decoded",
    /waitUntil: "networkidle0"/.test(shot) && /document\.fonts\?\.ready/.test(shot) && /img\.decode\(\)/.test(shot))
  check("on Vercel with the serverless Chromium, anywhere else with the one CHROMIUM_PATH names",
    /@sparticuz\/chromium/.test(shot) && /process\.env\.CHROMIUM_PATH/.test(shot))
  const config = read("next.config.mjs")
  check("and the build ships the browser with the one route that launches it",
    /'@sparticuz\/chromium', 'puppeteer-core'\]/.test(config) &&
      /*
        A glob, so `[installId]` would be a character class and never match
        the route. It did exactly that the first time: the binary was left
        out of the function, and the route would have failed on its first
        call in production. `*` is one segment.
      */
      /'\/api\/website-builder\/themes\/\*\/cover': \[/.test(config) &&
      !/'\/api\/website-builder\/themes\/\[installId\]\/cover'/.test(config) &&
      /@sparticuz\+chromium@\*\/node_modules\/@sparticuz\/chromium\/bin\/\*\*/.test(config))

  /* The names, and which pictures are ever shown. */
  check("the newest cover is chosen by the time in its name",
    JSON.stringify(snapshotsNewestFirst(["mfa0.v3.webp", "mfb0.v3.webp", "mf90.v3.png"])) === JSON.stringify(["mfb0.v3.webp", "mfa0.v3.webp", "mf90.v3.png"]))
  check("a phone picture is never taken for the cover itself, only paired with one",
    JSON.stringify(snapshotsNewestFirst(["mfb0.v3.m.webp", "mfa0.v3.webp"])) === JSON.stringify(["mfa0.v3.webp"]) &&
      mobilePartner("mfa0.v3.webp", ["mfa0.v3.webp", "mfa0.v3.m.webp", "mfb0.v3.m.webp"]) === "mfa0.v3.m.webp" &&
      mobilePartner("mfa0.v3.webp", ["mfa0.v3.webp", "mfb0.v3.m.webp"]) === null)
  check("a file this code did not write is never taken for a cover",
    snapshotsNewestFirst(["../evil.v3.webp", "cover.gif", "notes.txt", "x.v3.webp.exe"]).length === 0)
  check("a picture from before versioning is never shown, however new it is",
    JSON.stringify(snapshotsNewestFirst(["zzzz.webp", "mfa0.v3.webp"])) === JSON.stringify(["mfa0.v3.webp"]))
  check("a recorded cover from before versioning counts as no cover",
    !isCurrentSnapshotUrl("https://x.supabase.co/storage/v1/object/public/store-builder-images/u/theme-snapshots/i/mfa0.webp") &&
      isCurrentSnapshotUrl("https://x.supabase.co/storage/v1/object/public/store-builder-images/u/theme-snapshots/i/mfa0.v3.webp") &&
      !isCurrentSnapshotUrl(null))
  check("pruning keeps the newest covers with their phone pictures and takes everything else",
    JSON.stringify(staleSnapshots(["a1.webp", "b1.v3.webp", "b1.v3.m.webp", "b2.v3.webp", "b2.v3.m.webp", "b3.v3.webp", "b3.v3.m.webp", "notes.txt"]).sort()) ===
      JSON.stringify(["a1.webp", "b1.v3.m.webp", "b1.v3.webp"].sort()))
  check("and the name says when it was taken",
    snapshotTakenAt(`${Date.UTC(2026, 8, 23).toString(36)}.v3.webp`) === "2026-09-23T00:00:00.000Z" && snapshotTakenAt("nope") === null)

  /* When it is asked for. */
  const refresh = read("lib/website-builder/cover-refresh.ts")
  check("the editor asks once the saving has stopped, not once a save",
    /export const QUIET_MS = \d+/.test(refresh) && /clearTimeout\(timer\)/.test(refresh))
  check("and a save still waiting asks on the way out rather than never",
    /export function flushCoverRefresh/.test(refresh) && /keepalive: true/.test(refresh))
  const editor = stripComments(read("app/website-builder/editor/[installId]/page.tsx"))
  check("a save schedules it, whichever page or device the editor is on",
    /const snapshotAfterSave = \(\) => \{\s*scheduleCoverRefresh\(installId\)\s*\}/.test(editor) &&
      (editor.match(/snapshotAfterSave\(\)/g) ?? []).length >= 2)
  check("and leaving the editor flushes it", /useEffect\(\(\) => \(\) => flushCoverRefresh\(\), \[\]\)/.test(editor))
  check("nothing of the in-browser capture is left in the editor",
    !/html-to-image|captureNode|snapshotStage|stageSnapshot|data-snapshot-stage/.test(editor))
  const client = read("app/app/website-builder/website-builder-client.tsx")
  check("the website page retakes a cover that is older than the site",
    /export function coverIsStale/.test(client) && /await requestCover\(i\.id\)/.test(client))
  /*
    THE COVER WAS STALE AFTER EDITING ON A PHONE. The app keeps a page it
    has shown for five minutes, so Back from the editor handed the Website
    page its list from before the edit, whose cover looked current. The tab
    remembers its own saves and the covers that arrived, the page checks its
    copy against them, and one cover request per site is shared.
  */
  check("the tab remembers when it saved each site, and the newest cover each one got",
    /saves\.set\(installId, Date\.now\(\)\)/.test(refresh) && /export function savedAt/.test(refresh) && /export function latestCover/.test(refresh) && /covers\.set\(installId, cover\)/.test(refresh))
  check("  one cover request per site at a time: the editor's and the page's share one browser launch",
    /const running = inflight\.get\(installId\)\s*\n\s*if \(running\) return running/.test(refresh) && /inflight\.delete\(installId\)/.test(refresh))
  check("  a copy of the page older than this tab's save asks the server again, once per save",
    /savedAt\(i\.id\) > Date\.parse\(i\.saved_at\) \+ 2000/.test(client) && /REFRESHED\.add/.test(client) && /router\.refresh\(\)/.test(client))
  check("  a cover that arrived while the page was away is drawn without being taken again",
    /\[fresh\[i\.id\], latestCover\(i\.id\)\]/.test(client) && /Math\.max\(Date\.parse\(i\.saved_at\), savedAt\(i\.id\)\)/.test(client))
  check("  missing is stale", coverIsStale({ snapshot_url: null, snapshot_updated_at: null, saved_at: "2026-09-23T00:00:00Z" }))
  check("  older than the last save is stale", coverIsStale({ snapshot_url: "x", snapshot_updated_at: "2026-09-23T00:00:00Z", saved_at: "2026-09-23T00:01:00Z" }))
  check("  taken after it is not", !coverIsStale({ snapshot_url: "x", snapshot_updated_at: "2026-09-23T00:01:00Z", saved_at: "2026-09-23T00:00:00Z" }))
  /*
    NOT THE INSTALL ROW'S OWN TIME. Recording a cover writes to that row, so
    counting it as an edit would make every new cover look older than the
    site and ask for another, forever.
  */
  const page = read("app/app/website-builder/page.tsx")
  check("'last edited' is the pages and the settings, never the row a cover is recorded on",
    /const editedAt = newest\(settings\?\.updated_at, \.\.\.\(row\.pages \?\? \[\]\)\.map\(\(p\) => p\.updated_at\), row\.created_at\)/.test(page) &&
      !/saved_at: newest\(row\.updated_at/.test(page))
  check("the card draws the phone picture in front of the desktop one",
    /install\.snapshot_mobile_url/.test(client) && /aspect-\[390\/780\]/.test(client))
  check("the page finds the phone picture in the folder", /mobilePartner\(newest, names\)/.test(page))
  check("the editor opens on the pane the website page asked for", /get\("view"\)/.test(editor) && /v === "code" \|\| v === "settings"/.test(editor))
}

// ── 7. The SQL ──────────────────────────────────────────────────────────
section("The SQL")
{
  const run = read("supabase/sql/RUN_THEME_MARKETPLACE.sql")
  const mig = read("supabase/migrations/20260918_theme_marketplace.sql")
  check("the hand-run SQL seeds every registry theme", THEME_REGISTRY.every((t) => run.includes(`'${t.id}'`)))
  check("the migration seeds the same rows", THEME_REGISTRY.every((t) => mig.includes(`'${t.id}'`)))
  check("seeding never overwrites an existing row", /on conflict \(id\) do nothing/.test(run) && /on conflict \(id\) do nothing/.test(mig))
  check("the snapshot columns are added idempotently", /add column if not exists snapshot_url/.test(run) && /add column if not exists snapshot_updated_at/.test(run))
}

// ===========================================================================
section("Add Section is derived from the files, one card per preset")
// ===========================================================================
{
  /**
   * A .storelib section is offered when its schema has a preset and only
   * then: the preset is what lands on the page. The manifest keeps its say
   * over the JSON-described sections until they move, and its order.
   */
  const fake = (presets: number) => ({ type: "x", name: "X", fields: [], presets: Array.from({ length: presets }, (_, i) => ({ name: `P${i}`, settings: {} })) })
  const derived = addableSections(["hero", "faq", "nopreset", "cta"], { hero: fake(3), nopreset: fake(0), extra: fake(1) })
  check("a .storelib section with presets stays where the manifest put it", derived.indexOf("hero") === 0 && derived.indexOf("faq") === 1)
  check("a .storelib section without presets is not offered, whatever the manifest says", !derived.includes("nopreset"))
  /**
   * The manifest is the library. A .storelib the theme ships and does not
   * list has been retired from Add Section — it still renders, and every
   * page using it keeps working, but it is not offered again. A section a
   * creator wrote is not the theme's and comes in under "Created by you".
   */
  check("a .storelib the theme ships but does not list is retired, not auto-added", !derived.includes("extra"))
  check("JSON-described sections are untouched", derived.includes("faq") && derived.includes("cta"))
  /**
   * The library is ten categories of three, every one of them a .storelib
   * file with at least one preset. The hero the engine was first proved on
   * is retired — three heroes replaced it — which is what retirement is
   * supposed to look like: gone from the list, still on the pages using it.
   */
  check("the library is thirty sections across ten categories", ADDABLE_SECTIONS.length === 30 && new Set(ADDABLE_SECTIONS.map((t) => STORELIB_SCHEMAS[t]?.category)).size === 10, `${ADDABLE_SECTIONS.length} sections`)
  check("every one of them is a .storelib file with a preset", ADDABLE_SECTIONS.every((t) => STORELIB_SCHEMAS[t] && (STORELIB_SCHEMAS[t].presets?.length ?? 0) > 0))
  check("the sections it retired still render, so no page using one goes blank", RETIRED_SECTIONS.length > 0 && RETIRED_SECTIONS.every((t) => !!SECTION_SCHEMAS[t]) && !RETIRED_SECTIONS.some((t) => ADDABLE_SECTIONS.includes(t)))
  check("a creator's own section is filed under its own heading", CUSTOM_SECTION_CATEGORY === "yours" && SECTION_CATEGORIES.yours === "Created by you")

  const editorSrc = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  // The entries are built once, in a memo, rather than per render of the list.
  check("the modal draws one card per preset, named after the preset", /const allEntries = useMemo<LibraryEntry\[\]>/.test(editorSrc) && /title: name,/.test(editorSrc))
  /**
   * A component declared inside another component is a new type on every
   * render of its parent, so every card unmounts and remounts — the width
   * state resets, the ResizeObserver re-attaches, and the previews redraw.
   * That was the flicker on picking a category, and it would have been one
   * flicker per keystroke once there was a search box.
   */
  check("the cards are declared once, at the top level, and memoised", /^const SectionLibraryCard = memo\(function SectionLibraryCard\(/m.test(editorSrc) && !/^\s+const SectionCard = \(/m.test(editorSrc))
  check("the library can be searched across name, category and description", /placeholder="Search sections"/.test(editorSrc) && /haystack: `\$\{name\} \$\{schema\.name\} \$\{label\}/.test(editorSrc) && /words\.every\(w => e\.haystack\.includes\(w\)\)/.test(editorSrc))
  check("and a creator's own sections have their own heading, pinned last", /const mine = counts\.has\(CUSTOM_SECTION_CATEGORY\)/.test(editorSrc) && /ownTypes=\{ownSectionTypes\}/.test(editorSrc))
  check("and the chosen preset is the one that lands on the page", /const addSection = \(type: string, presetIndex = 0\)/.test(editorSrc) && /schema\.presets\?\.\[presetIndex\]/.test(editorSrc))
}

/**
 * ===========================================================================
 *  EVERY PUBLIC ROUTE RENDERS A .storelib SECTION, OR THE VISITOR SEES A GAP
 * ===========================================================================
 * A .storelib section becomes markup only when the server renders it. A route
 * that draws a creator's sections without doing that does not fail loudly:
 * StorelibSection returns null off the editor, so the section is simply not
 * there. Measured before this was fixed: the product page produced 0
 * characters of HTML for a hero that produced 3651 on the storefront.
 *
 * So the test is over the routes themselves. Every page that hands sections
 * to ThemePage must call the one function that does this, and must say which
 * template it is — "index" from the product page is a wrong answer, not a
 * harmless default, because allowed_templates is written against it.
 */
{
  console.log("\n  A published page draws the sections a creator wrote")
  // The apex route is the creator page now and draws no sections; the
  // website is `<name>.storelib.com`, served by /w.
  const PUBLIC_ROUTES = [
    ["components/website-builder/theme/render-product.tsx", "product"],
  ] as const
  for (const [route, template] of PUBLIC_ROUTES) {
    const src = read(route)
    check(`${route} renders them on the server`, /await prerenderStorelibSections\(/.test(src))
    // The call may carry the creator's products after the template name.
    check(`${route} renders them as "${template}"`, new RegExp(`"${template.replace(".", "\\.")}"(,\\s*products)?\\s*\\)`).test(src) && new RegExp(`page=\\{\\{ template: "${template}" \\}\\}`).test(src))
  }

  /**
   * The website serves more than one page, so its template is the page it is
   * drawing rather than a constant: "index" for the front page and
   * `page.<key>` for the rest, which is what `allowed_templates` is written
   * against. Both the render and the provider must be handed the same one,
   * or a section is compiled for one template and told it is on another.
   */
  {
    const site = read("app/(site)/w/[username]/render-site.tsx")
    check("the website renders its sections on the server", /await prerenderStorelibSections\(/.test(site))
    check(
      "and names the template after the page it is drawing",
      /const template = templateForPage\(pageKey\)/.test(site),
    )
    check(
      "handing the same name to the render and to the provider",
      /prerenderStorelibSections\([^)]*\btemplate, products\)/.test(site) &&
        /page=\{\{ template \}\}/.test(site),
    )
  }
  // Named here so a fourth route cannot quietly join the list without one.
  // Every .tsx under the public routes, not only `page.tsx`: a route may
  // hand its work to a component beside it, and that component draws the
  // page just the same.
  const walk = (dir: string): string[] => {
    const full = join(process.cwd(), dir)
    if (!existsSync(full)) return []
    return readdirSync(full, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : [],
    )
  }
  /**
   * Either function counts, because they are the same act: `renderWithSources`
   * draws the sections from sources already in hand, and
   * `prerenderStorelibSections` is that with a read for the sources first. A
   * route that has the creator's files from the cache uses the first; a route
   * that does not uses the second. A route that uses neither is the bug.
   */
  const drawsOnServer = (src: string) => /prerenderStorelibSections|renderWithSources/.test(src)
  const routesDrawingSections = [...new Set(["app/(marketing)", "app/products"].flatMap(walk))]
    .filter((f) => /<ThemePage/.test(read(f)))
  check(
    "and no other public route hands sections to ThemePage without it",
    routesDrawingSections.every((f) => drawsOnServer(read(f))),
    routesDrawingSections.filter((f) => !drawsOnServer(read(f))).join(", "),
  )
}


/**
 * ===========================================================================
 *  A SECTION YOU WROTE IS FILED WHERE YOU WILL LOOK FOR IT
 * ===========================================================================
 */
{
  console.log("\n  Created by you")
  const mine = customSectionSchemas({
    // The usual starting point: a copy of one of the theme's own sections,
    // which carries the theme's category with it.
    "sections/drewwww.storelib":
      '<template><div>hi</div></template>\n<schema>{"type":"hero_centered","name":"Drewwww","category":"hero","presets":[{"name":"Drewwww"}],"settings":[]}</schema>',
    // Editing one of the theme's files is not writing a section of your own.
    "sections/hero_centered.storelib": DEFAULT_THEME_SOURCES["sections/hero_centered.storelib"] ?? "",
  })
  check("a section you wrote is filed under your own heading, whatever its file says", mine["drewwww"]?.category === CUSTOM_SECTION_CATEGORY)
  check("and editing one of the theme's sections does not make it yours", !("hero_centered" in mine))
  check("and it is offered in the library, because its file gives it a preset", customAddableSections(mine).includes("drewwww"))
  // The fixture is a copy of the theme's hero, "type" line and all.
  check("and the file it was saved as is the section it is, not the one it was copied from", mine["drewwww"]?.type === "drewwww")
  check("a schema error names the key that is wrong, not just the line", (() => {
    const r = schemaFromStorelib('<template><div>hi</div></template>\n<schema>{"name":"No type","presets":[],"settings":[]}</schema>', "sections/x.storelib")
    return r.ok === false && r.errors.some((e) => /type: /.test(e))
  })())
}

// ===========================================================================
section("Undo cannot reach a page you are not on")
// ===========================================================================

{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")

  /**
   * An undo snapshot is the whole page: `sections` plus the theme settings.
   * Switching page replaces `sections` wholesale, and the stack was never
   * cleared — so the next Undo wrote the PREVIOUS page's sections onto the
   * page now open, marked it dirty, and autosave persisted that a second and
   * a half later. Silent, and it destroys a page nobody was looking at.
   */
  check(
    "there is one place that clears the history",
    /const clearHistory = useCallback\(\(\) => \{\s*\n\s*setUndoStack\(\[\]\)\s*\n\s*setRedoStack\(\[\]\)/.test(editor),
  )
  check(
    "a page change clears it",
    /switchingPage\.current = true\s*\n\s*\/\/ The history describes the page being left[\s\S]{0,80}clearHistory\(\)/.test(editor),
  )
  check(
    "so does opening a product page, which is another page",
    /const handleSelectProductPage[\s\S]{0,400}clearHistory\(\)/.test(editor),
  )
  check(
    "and loading a page's sections directly",
    /const loadSections = useCallback[\s\S]{0,220}setUndoStack\(\[\]\)/.test(editor),
  )

  /**
   * The AI was the one kind of change a person did not make by hand, and the
   * one kind they could not take back: Undo pointed at whatever they had done
   * before it, so pressing it threw away their own work instead of the
   * model's.
   */
  check(
    "an AI edit records an undo step like every other edit",
    /const applyAiOp = useCallback[\s\S]{0,1400}pushUndoRef\.current\(\)/.test(editor),
  )
  check(
    "and it is the debounced one, so one instruction is one step",
    /pushUndoRef\.current = debouncedPushUndo/.test(editor),
  )
}

// ===========================================================================
section("A form that says it worked, did")
// ===========================================================================

{
  const newsletter = read("components/website-builder/sections/renderers/NewsletterSection.tsx")
  const route = read("app/api/website-builder/subscribe/route.ts")
  const themePage = read("components/website-builder/theme/ThemePage.tsx")

  /**
   * The submit handler called `preventDefault()` and set the success
   * message. That was the whole of it: a visitor read "you're in, check your
   * inbox" and no address was recorded anywhere, on any site built with this
   * section. A button that plainly does nothing is better than one that lies.
   */
  check(
    "the newsletter form posts somewhere",
    /fetch\("\/api\/website-builder\/subscribe"/.test(newsletter) &&
      !/onSubmit=\{e => \{ e\.preventDefault\(\); setSubmitted\(true\) \}\}/.test(newsletter),
  )
  check(
    "its fields are named, or the form has nothing to send",
    /name="email"/.test(newsletter) && /name="name"/.test(newsletter),
  )
  check(
    "a failure is shown rather than reported as a success",
    /setFailed\(/.test(newsletter) && /role="alert"/.test(newsletter),
  )
  check(
    "and the builder's canvas still sends nothing",
    /if \(isEditing \|\| inEditor \|\| !creatorId\)/.test(newsletter) &&
      /* The canvas now names its install so the header's search field can
         ask on its behalf. It still says `inEditor` and still hands over no
         creator, which are the two things this guard reads. */
      /const storefront = useMemo\(\(\) => \(\{ inEditor: true, installId \}\), \[installId\]\)/.test(read("app/website-builder/editor/[installId]/page.tsx")),
  )

  check(
    "the section is told whose site it is on",
    // The built website is served from the subdomain, which is
    // app/(site)/w/[username]. storelib.com/<name> is the creator's
    // profile page and renders no theme sections.
    /storefront\?: Storefront/.test(themePage) &&
      /storefront=\{\{ creatorId: site\.creatorId, installId: site\.installId \}\}/.test(read(RENDER_SITE)) &&
      /storefront=\{\{ creatorId, installId \}\}/.test(read(RENDER_SITE)),
  )

  check(
    "the endpoint writes to the same table as every other capture",
    /\.from\("subscribers"\)/.test(route) && /source: "website_builder_newsletter"/.test(route),
  )
  check(
    "and fires the creator's own welcome automation",
    /triggerEmailFlows\(/.test(route) && /triggerType: "new_subscriber"/.test(route),
  )
  check(
    "an unknown creator writes nothing",
    /\.from\("creators"\)[\s\S]{0,160}if \(!creator\) return/.test(route),
  )
  check(
    "subscribing twice is not an error and not a second row",
    /if \(existing\) return NextResponse\.json\(\{ ok: true \}\)/.test(route) && /error\.code === "23505"/.test(route),
  )
  check(
    "and the answer does not tell a stranger who is already on the list",
    // The reply for an address already subscribed is byte for byte the reply
    // for a new one, or the endpoint becomes a way to ask.
    (route.match(/return NextResponse\.json\(\{ ok: true \}\)/g) ?? []).length >= 2,
  )
}

/**
 * ===========================================================================
 *  A PANEL THAT HANGS FROM THE CHROME IS NOT INSIDE THE CHROME
 * ===========================================================================
 * The Publish panel was drawn underneath the code editor. The top bar is
 * `relative z-50`, which makes it a stacking context, so the panel's own
 * z-50 was only ever compared with the bar's other children; out over the
 * canvas the whole bar is one layer at 50, and the code pane is at 80.
 *
 * scripts/check-editor-layers.mjs measures the result in a browser, with a
 * control built the old way that must come back broken. This holds the
 * structure that makes the measurement true.
 */
{
  console.log("\n  A panel that hangs from the chrome leaves the chrome")
  const anchored = read("components/website-builder/anchored-panel.tsx")
  const publish = read("components/website-builder/publish-panel.tsx")
  const switcher = read("components/website-builder/page-switcher.tsx")
  const pane = read("components/website-builder/preview-mode-switch.tsx")

  check("it is rendered into the document body", /createPortal\(/.test(anchored) && /document\.body,/.test(anchored))
  check("and positioned against the button rather than nested in it", /position: "fixed"/.test(anchored) && /getBoundingClientRect\(\)/.test(anchored))

  const panelZ = Number(/export const CHROME_POPOVER_Z = (\d+)/.exec(anchored)?.[1])
  const paneZ = Number(/"absolute inset-0 z-\[(\d+)\] flex flex-col rounded-t-\[20px\]"/.exec(pane)?.[1])
  const fullZ = Number(/"fixed inset-0 z-\[(\d+)\] flex flex-col"/.exec(pane)?.[1])
  check("both z-indexes are readable, or the comparison below is a guess", Boolean(panelZ && paneZ && fullZ), `panel ${panelZ}, pane ${paneZ}, full screen ${fullZ}`)
  check("the panel outranks the code editor", panelZ > paneZ && panelZ > fullZ, `panel ${panelZ} vs pane ${paneZ} / ${fullZ}`)

  check("the publish panel uses it", /<AnchoredPanel/.test(publish) && !/absolute right-0 top-\[calc\(100%\+10px\)\] z-50/.test(publish))
  check("and so does the page switcher, which had the same fault", /<AnchoredPanel/.test(switcher))
  check(
    "a click inside a portalled menu does not read as a click outside it",
    /menuRef\.current\?\.contains\(t\)/.test(switcher) && /panelRef\.current\?\.contains\(t\)/.test(publish),
  )
  check(
    "and the panel can never be taller than what is below the button",
    /maxHeight: Math\.max\(160, window\.innerHeight - top - EDGE\)/.test(anchored),
  )
}

/**
 * ===========================================================================
 *  WHAT IS NOT SET UP YET IS SAID WHERE IT COSTS SOMETHING
 * ===========================================================================
 * Three migrations are run by hand, once. Every route that needs one falls
 * back when it is missing, which is right, and every fallback was silent,
 * which is how all three stayed unrun without anybody noticing. The one that
 * actually loses something is backups: publish is supposed to save a copy of
 * the site first, and without the table it saves nothing and says nothing.
 */
{
  console.log("\n  A missing migration is said out loud")
  const state = read("lib/website-builder/setup-state.ts")
  const route = read("app/api/website-builder/setup/route.ts")
  const panel = read("components/website-builder/publish-panel.tsx")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const code = read("app/website-builder/code/[installId]/page.tsx")
  const backupsApi = read("app/api/website-builder/themes/[installId]/backups/route.ts")

  check("each of the three is probed", /store_theme_backups/.test(state) && /published_at/.test(state) && /store_theme_file_versions/.test(state))
  check("by asking the database rather than by a flag somebody sets", /\.limit\(1\)/.test(state) && /return !error/.test(state))
  check("and the answer is held, not asked per editor load", /unstable_cache/.test(state) && /revalidate: 300/.test(state))
  check("the endpoint is for whoever is signed in, and nobody else", /if \(!user\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/.test(route))
  check("it carries no data out of those tables", !/select\("\*"\)/.test(route) && !/from\(/.test(route))

  check("publish says a publish will not be backed up", /backupsReady === false/.test(panel) && /will not be backed up/.test(panel))
  check("and names the file to run", /RUN_THEME_BACKUPS\.sql/.test(panel))
  check("the editor asks once and carries on if the answer never comes", /\/api\/website-builder\/setup/.test(editor) && /the editor works the same either way/.test(editor))
  check("the backups list says it too, rather than looking empty", /Backups are not set up yet/.test(backupsApi))
  check(
    "and a code file that goes live immediately says so at the moment it does",
    /"Saved and live"/.test(code),
  )
}

/**
 * ===========================================================================
 *  A STICKY HEADER THAT COULD NEVER STICK
 * ===========================================================================
 * `position: sticky` travels inside its parent and no further. Every section
 * was wrapped in a bare `<div>` by the error boundary — put there only to
 * carry the `key` that remounts a section after "Try again" — and around the
 * header that div was exactly the header's own height. So the sticky header
 * had nowhere to travel and scrolled away with the page, on every published
 * site, in every configuration that asked for sticky.
 *
 * scripts/check-sticky-header.mjs measures it in a browser; this holds the
 * shape that makes the measurement true.
 */
{
  console.log("\n  Nothing wraps a section in a box it did not ask for")
  const boundary = read("components/website-builder/sections/SectionErrorBoundary.tsx")
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")

  check("the boundary carries its key on a fragment, not a div", /return <Fragment key=\{this\.state\.attempt\}>/.test(boundary))
  check("and still remounts the section when it is retried", /attempt: s\.attempt \+ 1/.test(boundary))
  check("the header is still the thing that is sticky", /"sticky top-0 z-\[60\] isolate"/.test(header))
}

/**
 * ===========================================================================
 *  BOTH HALVES OF THE ASSISTANT, AFTER THE FIRST MESSAGE
 * ===========================================================================
 * Storelib AI does two things: change this page, and write a new kind of
 * section. The row that chooses between them was rendered only in the empty
 * state — and the conversation is kept across reloads, so one change meant
 * the row never came back and the section writer could not be reached again
 * in that install at all. The writer's own result and its errors were
 * stranded in the same place: a section written after any exchange was
 * reported to nobody.
 */
{
  console.log("\n  Storelib AI does not lose half of itself after one message")
  const chat = read("components/website-builder/theme-chat.tsx")
  const empty = chat.slice(chat.indexOf("exchanges.length === 0 ? ("), chat.indexOf('<div className="min-w-0 shrink-0 border-t border-border p-2.5 [overflow-wrap:anywhere]">'))
  const composer = chat.slice(chat.indexOf('<div className="min-w-0 shrink-0 border-t border-border p-2.5 [overflow-wrap:anywhere]">'))

  check("the mode row is with the box you type into", /\["change", "Change this page"\]/.test(composer))
  check("and not only in the empty state", !/\["change", "Change this page"\]/.test(empty))
  check("what the writer produced is reported there too", /\{written && \(/.test(composer) && !/\{written && \(/.test(empty))
  check("so are its errors", /\{writeError && /.test(composer) && !/\{writeError && /.test(empty))
  check("and so is the fact that it is working", /\{writing && writeLabel && <AiStatus/.test(composer) && !/\{writing && /.test(empty))
  check("and so is an answer, when it answered instead of writing", /\{writeReply && !writing && \(/.test(composer))
  /* "Line 331: <schema> is never closed" is the compiler talking to a
     developer. The chat says what a creator can do, and offers to do it. */
  check("the compiler's words never reach the chat", !/d\.errors\[0\]\.message/.test(chat) && /plainWriteError\(/.test(chat))
  check("a failed section can be asked for again in one press", /lastWrite\.current/.test(composer) && /Try again/.test(composer))
  check("it asks the writer for its stages as they happen", /Accept: "application\/x-ndjson"/.test(chat))

  check("the empty state keeps the part that is only useful when empty", /SUGGESTIONS : CODE_SUGGESTIONS|mode === "change" \? SUGGESTIONS/.test(empty))
}

/**
 * ===========================================================================
 *  THE SECTION GAP HAD NOTHING TO MATCH
 * ===========================================================================
 * The rule was `[data-section]:not([data-chrome])+[data-section]`, and
 * `[data-section]` is the wrapper INSIDE each section's container — so two
 * sections' wrappers are cousins, never siblings. Measured on a real page
 * with querySelectorAll: four sections, ZERO adjacent pairs. The theme's
 * Section gap setting did nothing at all.
 *
 * Measured again after the change, with the gap set to 40: the second body
 * section's computed margin-top is 40px and the first one's is 0.
 */
{
  console.log("\n  The section gap lands between sections")
  const renderer = read("components/website-builder/sections/SectionRenderer.tsx")
  const css = read("lib/website-builder/theme-css.ts")

  check("the marker is on the element that has siblings", /data-section-box=""/.test(renderer))
  check("and the header and footer are marked as chrome there", /const chrome = props\.section\.type === "header" \|\| props\.section\.type === "footer"/.test(renderer))
  check("the rule uses that marker", /\[data-section-box\]:not\(\[data-chrome\]\) ~ \[data-section-box\]:not\(\[data-chrome\]\)/.test(css))
  check(
    "and a following sibling rather than an adjacent one, because the editor puts a strip between sections",
    !/\[data-section-box\]:not\(\[data-chrome\]\)\+/.test(css),
  )
  check("nothing is added above the first section or below the last", /never above the first or below the last/.test(css))
}

// ── A library of five, under concurrency, and an import that can fail ────
section("Two at once still make five, and an import that says what went wrong")
{
  /*
    THE COUNT-THEN-INSERT RACE. Every route counted, then inserted. Two at
    the same moment both counted 4 and the library held 6. The database now
    refuses the sixth under a per creator lock, and until that SQL has run,
    each route counts again after its insert and backs its own row out.
  */
  const sql = read("supabase/sql/RUN_THEME_LIBRARY_LIMIT.sql")
  const limitInSql = Number(/if kept >= (\d+) then/.exec(sql)?.[1])
  check("the database's limit is THEME_INSTALL_LIMIT, written once in SQL and pinned to the constant", limitInSql === THEME_INSTALL_LIMIT, String(limitInSql))
  check("  a before insert trigger, one creator's inserts serialised by an advisory lock, then counted",
    /before insert on public\.store_theme_installs/.test(sql) && /pg_advisory_xact_lock\(hashtextextended\('store_theme_installs:' \|\| new\.creator_id::text, 0\)\)/.test(sql) &&
      sql.indexOf("pg_advisory_xact_lock") < sql.indexOf("select count(*) into kept"))
  check("  its refusal is the code the page opens the sheet for", /raise exception 'library_full'/.test(sql) && LIBRARY_FULL_CODE === "library_full")
  check("  the migration is the same file", read("supabase/migrations/20260928_theme_library_limit.sql") === sql)
  check("isLibraryFullError reads the database's refusal and nothing else",
    isLibraryFullError({ message: "library_full" }) && !isLibraryFullError({ message: "duplicate key" }) && !isLibraryFullError(null) && !isLibraryFullError({}))

  /* A fake admin client: a count, and a record of what was deleted. */
  const fake = (count: number | null, error: unknown = null) => {
    const deleted: unknown[][] = []
    const client = {
      from: () => ({
        select: () => ({ eq: async () => ({ count, error }) }),
        delete: () => ({ eq: (_k: string, id: unknown) => ({ eq: async (_k2: string, creator: unknown) => { deleted.push([id, creator]); return { error: null } } }) }),
      }),
    }
    return { client: client as never, deleted }
  }
  const over = fake(THEME_INSTALL_LIMIT + 1)
  const atLimit = fake(THEME_INSTALL_LIMIT)
  const unread = fake(null, { message: "timeout" })
  const [overKept, atKept, unreadKept] = await Promise.all([
    keptWithinLimit(over.client, "creator-1", "new-1"),
    keptWithinLimit(atLimit.client, "creator-1", "new-2"),
    keptWithinLimit(unread.client, "creator-1", "new-3"),
  ])
  check("  the recount backs out the insert that took the library past the limit, scoped to its creator",
    overKept === false && JSON.stringify(over.deleted) === JSON.stringify([["new-1", "creator-1"]]))
  check("  and keeps the one that filled it exactly, and keeps a website when the count cannot be read",
    atKept === true && atLimit.deleted.length === 0 && unreadKept === true && unread.deleted.length === 0)

  const routes = {
    add: read("app/api/website-builder/themes/add/route.ts"),
    duplicate: read("app/api/website-builder/themes/[installId]/duplicate/route.ts"),
    import: read("app/api/website-builder/themes/import/route.ts"),
  }
  for (const [name, src] of Object.entries(routes)) {
    const insertAt = src.indexOf('.from("store_theme_installs")\n    .insert(') >= 0 ? src.indexOf('.from("store_theme_installs")\n    .insert(') : src.indexOf('.from("store_theme_installs")\n      .insert(')
    check(`  ${name}: the refusal and the recount both answer as a full library`,
      /isLibraryFullError\((installErr|error)\)/.test(src) && /keptWithinLimit\(admin, (creator\.id|creatorId), (newInstall\.id as string|data\.id as string)\)/.test(src) &&
        (src.match(/code: LIBRARY_FULL_CODE/g) ?? []).length >= 3 && insertAt >= 0)
  }
  const nextSort = read("lib/website-builder/library-limit.ts").slice(read("lib/website-builder/library-limit.ts").indexOf("export async function nextSortOrder"))
  check("nextSortOrder is the creator's own highest place plus one", /\.eq\("creator_id", creatorId\)/.test(nextSort) && /top \+ 1/.test(nextSort))
  check("a copy or an import that cannot write its pages removes itself rather than leaving an empty website",
    /if \(settingsErr\) return undo\(\)/.test(routes.duplicate) && /if \(pagesErr\) return undo\(\)/.test(routes.duplicate) && /if \(filesErr\) return undo\(\)/.test(routes.duplicate) &&
      /async function fillInstall/.test(routes.import) && /await admin\.from\("store_theme_installs"\)\.delete\(\)\.eq\("id", installId\)/.test(routes.import))
  check("an import from the older manifest no longer writes a null theme into a NOT NULL column",
    !/theme_id: manifest\.install\?\.theme_id \?\? null/.test(routes.import) && /catalogThemeId\(admin, manifest\.install\?\.theme_id\)/.test(routes.import) && !/function extToMime/.test(routes.import))
  check("a duplicate's name is text of at most 80 characters", /typeof body\?\.name === "string" \? body\.name\.trim\(\)\.slice\(0, 80\)/.test(routes.duplicate))
  check("the add route's already-in-library check sees a theme that has been duplicated",
    /\.eq\("theme_id", themeId\)\s*\.limit\(1\)/.test(routes.add) && /existing && existing\.length > 0/.test(routes.add))
  const install = read("app/api/website-builder/themes/[installId]/route.ts")
  check("rename takes text only, trimmed, at most 80, and bad JSON is a 400",
    /await req\.json\(\)\.catch\(\(\) => null\)/.test(install) && /typeof body\?\.name === "string"/.test(install) && /name\.length > 80/.test(install))
  check("publish reads a bad body as an invalid action, not a crash", /const body = await req\.json\(\)\.catch\(\(\) => null\)/.test(read("app/api/website-builder/themes/[installId]/publish/route.ts")))
  check("every route the page calls asks who is signed in and whether the website is theirs",
    [routes.duplicate, install, read("app/api/website-builder/themes/[installId]/publish/route.ts")].every((src) => /auth\.getUser\(\)/.test(src) && /\.eq\("creator_id", creator\.id\)/.test(src)) &&
      [routes.add, routes.import, read("app/api/website-builder/themes/import/upload/route.ts")].every((src) => /auth\.getUser\(\)/.test(src) && /Unauthorized/.test(src)))

  /*
    THE PACKAGE GOES TO STORAGE, NOT THROUGH A FUNCTION. A function refuses
    a body over 4.5 MB before our code runs, so a form upload failed for
    every package with real photographs in it while the route said 50 MB.
  */
  const uid = "0f8fad5b-d9cb-469f-a165-70867728950e"
  const other = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  const mine = importPathFor(uid, "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")
  check("an import may read only a path this person was handed",
    isOwnImportPath(mine, uid) && !isOwnImportPath(mine, other) && !isOwnImportPath(`${uid}/theme-imports/../x.zip`, uid) &&
      !isOwnImportPath(`${uid}/theme-imports/`, uid) && !isOwnImportPath(`${uid}/other/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.zip`, uid) &&
      !isOwnImportPath(42, uid) && !isOwnImportPath(mine, ".*"))
  check("  a size is checked before a byte is sent: nothing, too much, or fine",
    importSizeProblem(0) !== null && importSizeProblem("12") !== null && importSizeProblem(IMPORT_MAX_BYTES + 1) === IMPORT_TOO_LARGE && importSizeProblem(IMPORT_MAX_BYTES) === null)
  check("  and a zip is known by its first four bytes",
    looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])) && !looksLikeZip(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) && !looksLikeZip(new Uint8Array([0x50, 0x4b])))
  const upload = read("app/api/website-builder/themes/import/upload/route.ts")
  check("  the upload route names the path itself, under the signed in user, after the size and the library are checked",
    /importPathFor\(user\.id, randomUUID\(\)\)/.test(upload) && /createSignedUploadUrl\(path\)/.test(upload) &&
      upload.indexOf("importSizeProblem(") < upload.indexOf("createSignedUploadUrl") && upload.indexOf("librarySlotsLeft(") < upload.indexOf("createSignedUploadUrl"))
  const imp = routes.import
  check("  the import route checks the path is theirs, the size from storage, then the first bytes, before unzipping",
    /!isOwnImportPath\(stored, user\.id\)/.test(imp) && imp.indexOf("bucket.list(") < imp.indexOf("bucket.download(") &&
      imp.indexOf("looksLikeZip(buf)") < imp.indexOf("JSZip.loadAsync(buf)") && /recorded > IMPORT_MAX_BYTES/.test(imp))
  check("  and removes the stored file whatever the answer, a full library included",
    /\} finally \{\s*await discard\(\)\s*\}/.test(imp) && /if \(\(await librarySlotsLeft\(supabase, creator\.id\)\) === 0\) \{\s*await discard\(\)/.test(imp))
  check("  a form from an older page is size checked by its declared length before it is read, and a bad form is a 400",
    /req\.headers\.get\("content-length"\)/.test(imp) && imp.indexOf('req.headers.get("content-length")') < imp.indexOf("req.formData()") && /try \{\s*form = await req\.formData\(\)\s*\} catch/.test(imp))

  const incoming = stripComments(read("app/app/website-builder/incoming.tsx"))
  check("the page: a place, the file straight to storage with its progress, then the import",
    /fetchAnswer\("\/api\/website-builder\/themes\/import\/upload"/.test(incoming) && /sendWithProgress\("PUT", url, file, on/.test(incoming) &&
      /fetchAnswer\("\/api\/website-builder\/themes\/import", \{ path \}, ANSWER_MS\)/.test(incoming) &&
      incoming.indexOf("importSizeProblem(file.size)") < incoming.indexOf('fetchAnswer("/api/website-builder/themes/import/upload"'))
  check("  every server request gives up in time rather than leaving the row spinning", /new AbortController\(\)/.test(incoming) && /setTimeout\(\(\) => ctl\.abort\(\), ms\)/.test(incoming))
  const wb = stripComments(read("app/app/website-builder/website-builder-client.tsx"))
  check("  one request at a time, held by a ref, so two taps in a frame make one website", /if \(inFlight\.current\) return\s*inFlight\.current = true/.test(wb) && /\} finally \{\s*inFlight\.current = false/.test(wb))
  check("  a page that was left does not refresh or open anything when the answer comes", /toast\(\{ title: done\(data\) \}\)\s*if \(!mounted\.current\) return/.test(wb))
  check("  the upload bar holds still under reduced motion", /transition-transform duration-200 ease-out motion-reduce:transition-none/.test(incoming))

  /* The upload itself, against a fake XMLHttpRequest, with timers that fire at once. */
  type Fake = { upload: Record<string, (e?: unknown) => void>; onload?: () => void; onerror?: () => void; onabort?: () => void; status: number; responseText: string; aborted: boolean }
  const g = globalThis as unknown as { XMLHttpRequest: unknown; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  const realXhr = g.XMLHttpRequest
  const realSet = g.setTimeout
  const realClear = g.clearTimeout
  const run = async (script: (x: Fake) => void, fastTimers: boolean) => {
    let made: Fake | null = null
    g.XMLHttpRequest = class {
      upload: Record<string, (e?: unknown) => void> = {}
      status = 0
      responseText = ""
      aborted = false
      onload?: () => void
      onerror?: () => void
      onabort?: () => void
      open() {}
      setRequestHeader() {}
      abort() { this.aborted = true; this.onabort?.() }
      send() { made = this as unknown as Fake; script(made) }
    }
    const armed: number[] = []
    if (fastTimers) {
      g.setTimeout = ((fn: () => void, ms: number) => { armed.push(ms); return realSet(fn, 0) }) as typeof setTimeout
    }
    const steps: string[] = []
    try {
      const answer = await sendWithProgress("PUT", "/x", "body" as never, { progress: (f) => steps.push(`p${f}`), sent: () => steps.push("sent") })
      return { answer, steps, armed, xhr: made as Fake | null }
    } finally {
      g.XMLHttpRequest = realXhr
      g.setTimeout = realSet
      g.clearTimeout = realClear
    }
  }
  const stalled = await run(() => { /* nothing ever moves */ }, true)
  check("an upload that stops moving is aborted and says so, after STALL_MS",
    stalled.answer.ok === false && stalled.answer.failure === "timeout" && !!stalled.xhr?.aborted && stalled.armed[0] === STALL_MS)
  const dropped = await run((x) => realSet(() => x.onerror?.(), 0), false)
  check("  a dropped connection answers once, as a network failure", dropped.answer.ok === false && dropped.answer.failure === "network")
  const fine = await run((x) => {
    x.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
    x.upload.onload?.()
    x.status = 200
    x.responseText = JSON.stringify({ ok: true })
    realSet(() => x.onload?.(), 0)
  }, false)
  check("  and one that lands reports its progress, then that it was sent, then the answer",
    fine.answer.ok === true && fine.steps.join(",") === "p0.5,p1,sent" && fine.answer.failure === undefined)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
