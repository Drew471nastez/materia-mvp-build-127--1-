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
  buildThemePreset,
  isThemeId,
} from "@/lib/website-builder/theme-registry"
import { looksLikeImage, previousSnapshotPath, SNAPSHOT_BUCKET } from "@/lib/website-builder/snapshot"
import { ThemeCover, ThemePhoneCover, coverSpecFromDefinition, coverSpecFromSettings } from "@/components/website-builder/theme-cover"
import { editorHref } from "@/app/app/website-builder/website-builder-client"
import { CUSTOM_SECTION_CATEGORY, STORELIB_SCHEMAS, STORELIB_SECTION_TYPES, addableSections, customAddableSections, customSectionSchemas, schemaFromStorelib } from "@/lib/website-builder/storelib-schemas"
import { ADDABLE_SECTIONS, RETIRED_SECTIONS, SECTION_CATEGORIES, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"

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
const RENDER_SITE = "app/(marketing)/w/[username]/render-site.tsx"
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
check("the limit is three websites, as asked", THEME_INSTALL_LIMIT === 3)
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
  const loading = read("app/app/website-builder/loading.tsx")
  check("the route is a server component", !/^\s*"use client"/m.test(page) && /export default async function/.test(page))
  check("the server reads installs itself and seeds a first-time creator in the same request", /store_theme_installs/.test(page) && /initialize_creator_themes/.test(page))
  check("the server does not fetch pages or sections just to draw a list", !/store_theme_pages|sections/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")))
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
  check("the route's loading state waits half a second before it shows at all", /animationDelay: "500ms"/.test(loading) && !/animate-pulse/.test(loading))
  check("the route's loading state is deferred so a fast load never flashes it", /skeleton-deferred/.test(loading))
  check("mutations refresh the server's view rather than patching a client copy", /router\.refresh\(\)/.test(client) && /useTransition/.test(client))
  check("the page uses the shared action menu, dialogs and buttons", /ResponsiveActionMenu/.test(client) && /AlertDialog/.test(client) && /from "@\/components\/ui\/button"/.test(client))
  check("the primary action is Storelib dark, not a purple button", /Edit website/.test(client) && !/bg-\[#8b5cf6\]/.test(client))
  /**
   * The rule is that the live site opens in a new tab from a REAL anchor —
   * never `window.open`, which a pop-up blocker eats and a middle-click
   * cannot use. It used to be satisfied by an icon-only square and a row of
   * the menu beside it; it is one labelled button now, so the shape it is
   * checked in changed while the rule did not.
   */
  check("the live link is a real anchor that opens a new tab", /href=\{siteUrl\}\s*\n\s*target="_blank"\s*\n\s*rel="noopener noreferrer"/.test(client) && !/window\.open\(siteUrl/.test(client))
  check("covers show the theme on a desktop and a phone", /ThemeCoverPair/.test(client) && /phone/.test(client))
  check("publishing over a live website asks first and says what happens to the old one", /Publish “\{publishing\?\.name\}”\?/.test(client) && /It replaces “\{live\.name\}”/.test(client))
  check("every install action is still here: rename, duplicate, code, settings, export, publish, unpublish, delete, import, add", [
    // The file is a .storelib-theme package now, so the two labels name the
    // thing rather than the container; the actions are the same ones.
    "Rename", "Duplicate", "Edit code", "Project settings", "Export theme", "Take offline", "Remove", "Import theme", "themes/add", "action: \"publish\"", "action: \"unpublish\"", "themes/import",
  ].every((s) => client.includes(s)))
  check("the library is capped at the limit and says so", /THEME_INSTALL_LIMIT/.test(client) && /Your library is full/.test(client))
  check("the marketplace route the old page linked to now exists", existsSync(join(process.cwd(), "app/app/website-builder/themes/page.tsx")))
  const market = stripComments(read("app/app/website-builder/themes/themes-client.tsx"))
  check("the marketplace filters by industry, searches, previews and adds", /THEME_INDUSTRIES\.map/.test(market) && /Search themes/.test(market) && /ThemeDetailDialog/.test(market) && /themes\/add/.test(market))
  check("the marketplace draws covers too — no storefront is mounted there either", !/SectionRenderer|ThemePage/.test(market) && /ThemeCoverPair/.test(market) && /ThemePhoneCover/.test(market))
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

  check("the link picker lists the site's own pages, products and collections", /kind: "page"/.test(linkPicker) && /kind: "product"/.test(linkPicker) && /kind: "collection"/.test(linkPicker))
  check("and still takes any address at all", /Or any address/.test(linkPicker) && /mailto:/.test(linkPicker))
  check(
    "the targets come from the same lists the page browser shows, so the two cannot disagree",
    /const linkTargets = useMemo<LinkTarget\[\]>/.test(editorSrc) &&
      /\.\.\.customPages\.map/.test(editorSrc) &&
      /\.\.\.products\.map/.test(editorSrc) &&
      /\.\.\.collections\.map/.test(editorSrc) &&
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
  check("enforces the shared limit", /THEME_INSTALL_LIMIT/.test(add))
  check("inserts the catalogue row itself when the database has not heard of a registry theme", /themeCatalogRow/.test(add) && /upsert/.test(add))
  check("a half-built install is rolled back rather than left as an empty website", /\.delete\(\)\.eq\("id", newInstall\.id\)/.test(add))
}

// ── 6. The snapshot ─────────────────────────────────────────────────────
section("The snapshot")
{
  const route = stripComments(read("app/api/website-builder/themes/[installId]/snapshot/route.ts"))
  check("the install must belong to the caller's creator, on read and on write", (route.match(/\.eq\("creator_id", creator\.id\)/g) ?? []).length >= 2)
  check("the install id is validated as a UUID before it becomes part of a path", /isThemeId\(installId\)/.test(route))
  check("the storage path is built from the user id and the install id only", /`\$\{user\.id\}\/theme-snapshots\/\$\{installId\}\/\$\{stamp\}\.\$\{ext\}`/.test(route))
  check("the bytes are checked against the declared type", /looksLikeImage\(bytes, contentType\)/.test(route))
  check("the size is capped", /MAX_BYTES/.test(route) && /413/.test(route))
  check("a missing column is 'not stored', not a failure", /stored: false/.test(route))
  check("the bucket is the existing public builder bucket", SNAPSHOT_BUCKET === "store-builder-images")

  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38])
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52])
  check("magic bytes: a WebP is a WebP", looksLikeImage(webp, "image/webp"))
  check("magic bytes: a PNG claiming to be WebP is refused", !looksLikeImage(png, "image/webp"))
  check("magic bytes: a PNG is a PNG", looksLikeImage(png, "image/png"))
  check("magic bytes: text is not an image", !looksLikeImage(new TextEncoder().encode("<svg onload=alert(1)>"), "image/webp"))

  const uid = "11111111-1111-4111-8111-111111111111"
  const iid = "22222222-2222-4222-8222-222222222222"
  const mine = `https://x.supabase.co/storage/v1/object/public/${SNAPSHOT_BUCKET}/${uid}/theme-snapshots/${iid}/abc123.webp`
  check("the previous snapshot is only removed from the caller's own folder for that install", previousSnapshotPath({ snapshot_url: mine }, uid, iid) === `${uid}/theme-snapshots/${iid}/abc123.webp`)
  check("someone else's path is left alone", previousSnapshotPath({ snapshot_url: mine }, "someone-else", iid) === null)
  check("another install's path is left alone", previousSnapshotPath({ snapshot_url: mine }, uid, "33333333-3333-4333-8333-333333333333") === null)
  check("a traversal in the url is left alone", previousSnapshotPath({ snapshot_url: mine.replace("abc123.webp", "../../other.webp") }, uid, iid) === null)
  check("no snapshot, nothing to remove", previousSnapshotPath({ snapshot_url: null }, uid, iid) === null)

  const capture = stripComments(read("lib/website-builder/snapshot-capture.ts"))
  check("capture is debounced and idle-time, never inline with the save", /SNAPSHOT_DEBOUNCE_MS/.test(capture) && /requestIdleCallback/.test(capture))
  check("capture crops to the top of the page before rasterising", /SNAPSHOT_ASPECT/.test(capture) && /height,/.test(capture))
  check("capture caps the width and encodes WebP", /SNAPSHOT_WIDTH/.test(capture) && /"image\/webp"/.test(capture))
  check("capture never throws into the editor", /Silent by design/.test(read("lib/website-builder/snapshot-capture.ts")))

  const editor = stripComments(read("app/website-builder/editor/[installId]/page.tsx"))
  check("the editor's canvas ref is attached to the page wrapper", /<div ref=\{canvasRef\}/.test(editor))
  check("a snapshot is requested after a successful draft save and after a publish", (editor.match(/snapshotAfterSave\(\)/g) ?? []).length >= 2)
  check("only the home page, at desktop width, in preview mode", /currentPage !== "home" \|\| device !== "desktop" \|\| previewMode !== "preview" \|\| isMobileView/.test(editor))
  check("a pending snapshot is cancelled when the editor unmounts", /cancelScheduledSnapshot\(\)/.test(editor))
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
    const site = read("app/(marketing)/w/[username]/render-site.tsx")
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
      /storefront=\{\{ inEditor: true \}\}/.test(read("app/website-builder/editor/[installId]/page.tsx")),
  )

  check(
    "the section is told whose site it is on",
    // The built website is served from the subdomain, which is
    // app/(marketing)/w/[username]. storelib.com/<name> is the creator's
    // profile page and renders no theme sections.
    /storefront\?: Storefront/.test(themePage) &&
      /storefront=\{\{ creatorId: site\.creatorId, installId: site\.installId \}\}/.test(read(RENDER_SITE)) &&
      /storefront=\{\{ creatorId, installId: row\.id \}\}/.test(read(RENDER_SITE)),
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
