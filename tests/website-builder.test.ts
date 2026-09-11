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
import { readFileSync, readdirSync, existsSync } from "node:fs"
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
const settable = (fields: Field[] | undefined) => (fields ?? []).filter((x) => x.type !== "header")
const optionValues = (x: Field): string[] | null => {
  if (x.type !== "select" && x.type !== "radio") return null
  return (x.options ?? []).map((o) => (typeof o === "string" ? o : (o.value ?? ""))).filter(Boolean)
}
const iconNames = (() => {
  const src = read("components/website-builder/sections/_shared.tsx")
  const m = src.match(/const ICON_MAP[^{]*\{([\s\S]*?)\n\}/)
  return new Set((m?.[1] ?? "").split("\n").map((l) => l.trim().match(/^"?([\w-]+)"?:/)?.[1]).filter(Boolean) as string[])
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
    "Rename", "Duplicate", "Edit code", "Project settings", "Export .zip", "Take offline", "Remove", "Upload .zip", "themes/add", "action: \"publish\"", "action: \"unpublish\"", "themes/import",
  ].every((s) => client.includes(s)))
  check("the library is capped at the limit and says so", /THEME_INSTALL_LIMIT/.test(client) && /Your library is full/.test(client))
  check("the marketplace route the old page linked to now exists", existsSync(join(process.cwd(), "app/app/website-builder/themes/page.tsx")))
  const market = stripComments(read("app/app/website-builder/themes/themes-client.tsx"))
  check("the marketplace filters by industry, searches, previews and adds", /THEME_INDUSTRIES\.map/.test(market) && /Search themes/.test(market) && /ThemeDetailDialog/.test(market) && /themes\/add/.test(market))
  check("the marketplace draws covers too — no storefront is mounted there either", !/SectionRenderer|ThemePage/.test(market) && /ThemeCoverPair/.test(market) && /ThemePhoneCover/.test(market))
  check("the marketplace has a real back button and no paragraph of explanation", /ChevronLeft/.test(market) && !/Every theme is free/.test(market))
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
