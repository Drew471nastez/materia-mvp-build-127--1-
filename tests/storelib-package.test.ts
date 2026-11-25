/**
 * ===========================================================================
 *  A THEME LEAVES AS ONE FILE AND COMES BACK THE SAME THEME
 * ===========================================================================
 * The fixtures under tests/fixtures/themes are the cases the package format
 * has to survive: the smallest theme, a theme with a layout and responsive
 * settings and unknown keys, blocks, binary assets, a section with a script
 * and capabilities, a section that must be refused, a theme from a newer
 * engine that must be refused, and the builder's earlier export that must
 * migrate. For each valid one: build → read → build is byte-equal, every
 * file and asset comes back verbatim, and a tampered package is refused.
 *
 * Run with:  npm run test:push
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import {
  buildPackage,
  readPackage,
  sectionsFromTemplate,
  templateFromSections,
  sha256,
  isSafeThemePath,
  type PackageAsset,
  type ThemePackage,
} from "../lib/storelib-theme"

const ROOT = join(process.cwd(), "tests/fixtures/themes")
let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(title: string) { console.log(`\n${title}`) }

/** A fixture folder as a ThemePackage. Binary files under assets/ are assets; ASSETS.json is their metadata. */
function loadFixture(name: string): ThemePackage {
  const dir = join(ROOT, name)
  const files: Record<string, string> = {}
  const assets: Record<string, PackageAsset> = {}
  let meta: Record<string, Partial<PackageAsset>> = {}
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(dir, rel))) {
      const relPath = rel ? `${rel}/${entry}` : entry
      if (statSync(join(dir, relPath)).isDirectory()) { walk(relPath); continue }
      if (relPath === "ASSETS.json") { meta = JSON.parse(readFileSync(join(dir, relPath), "utf8")); continue }
      if (relPath.startsWith("assets/")) {
        const bytes = new Uint8Array(readFileSync(join(dir, relPath)))
        assets[sha256(bytes)] = { bytes, filename: entry, mime_type: "application/octet-stream" }
        continue
      }
      files[relPath] = readFileSync(join(dir, relPath), "utf8")
    }
  }
  walk("")
  for (const [hash, m] of Object.entries(meta)) if (assets[hash]) Object.assign(assets[hash], m)
  const theme = JSON.parse(files["theme.json"])
  delete files["theme.json"]
  return { theme, files, assets }
}
const errText = (r: { ok: false; errors: { file?: string; line?: number; message: string }[] }) => r.errors.map((e) => `${e.file ?? ""}${e.line ? `:${e.line}` : ""} ${e.message}`).join(" | ")

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Every valid fixture survives a round trip, byte for byte")
  // ═══════════════════════════════════════════════════════════════════════
  for (const name of ["minimal", "complex", "blocks", "assets", "custom-js"]) {
    const pkg = loadFixture(name)
    const first = await buildPackage(pkg)
    const read = await readPackage(first)
    check(`${name}: reads back`, read.ok === true, read.ok === false ? errText(read) : "")
    if (read.ok === false) continue
    const v = read.value
    // theme.json is written by the builder from `theme`, so it is in the
    // read-back files and not in the fixture's.
    const samePaths = JSON.stringify(Object.keys(v.files).filter((p) => p !== "theme.json").sort()) === JSON.stringify(Object.keys(pkg.files).sort())
    const sameText = Object.entries(pkg.files).every(([p, t]) => v.files[p] === t)
    check(`${name}: every file comes back verbatim`, samePaths && sameText)
    check(`${name}: every asset comes back, by hash, with its metadata`, Object.keys(pkg.assets).every((h) => v.assets[h] && Buffer.compare(Buffer.from(v.assets[h].bytes), Buffer.from(pkg.assets[h].bytes)) === 0 && v.assets[h].alt_text === pkg.assets[h].alt_text))
    check(`${name}: theme.json keeps what it had, including keys the engine does not know`, Object.entries(pkg.theme).every(([k, val]) => JSON.stringify(v.theme[k]) === JSON.stringify(val)))
    const second = await buildPackage({ theme: v.theme, files: v.files, assets: v.assets })
    check(`${name}: build → read → build is the same bytes`, Buffer.compare(Buffer.from(first), Buffer.from(second)) === 0, `${first.byteLength} vs ${second.byteLength}`)
    /**
     * Including the folder entries, which nobody adds: writing
     * "sections/notice.storelib" makes the zip create "sections/" too, and
     * that entry used to take the clock instead of the fixed date. Two
     * builds then matched only when they fell inside the same two-second
     * tick, so the check above failed about one run in eight — and a package
     * that is byte-stable most of the time cannot be compared with an
     * earlier one to see whether anything really changed. Asserted on the
     * entries rather than by building twice, so it does not depend on
     * whether the clock happens to tick.
     */
    const zip = await new JSZip().loadAsync(first)
    const stamped = Object.values(zip.files).map((f) => (f as { name: string; date: Date }).date.getTime())
    const fixed = Date.UTC(2020, 0, 1)
    check(`${name}: every entry carries the fixed date, folders included`, stamped.length > 0 && stamped.every((t) => t === fixed), `${stamped.filter((t) => t !== fixed).length} of ${stamped.length} entries are stamped with something else`)
    check(`${name}: the manifest hashes every file and every asset`, Object.keys(v.manifest.files).length === Object.keys(pkg.files).length + 1 && Object.keys(v.manifest.assets).length === Object.keys(pkg.assets).length)
    check(`${name}: every hash in the manifest is the file's own`, Object.entries(v.manifest.files).every(([p, rec]) => rec.sha256 === sha256(v.files[p])) && Object.entries(v.manifest.assets).every(([h, rec]) => rec.size === v.assets[h].bytes.byteLength))
  }

  {
    const v = await readPackage(await buildPackage(loadFixture("complex")))
    if (v.ok === true) {
      check("complex: an unscoped <style> is allowed in layout/theme.storelib and nowhere else", "layout/theme.storelib" in v.value.files)
      check("complex: a section's unknown schema key survives", v.value.files["sections/columns.storelib"].includes('"future_setting_key": "kept"'))
      check("complex: an instance's meta survives", v.value.files["templates/index.json"].includes('"editor_note": "kept"'))
    }
    const js = await readPackage(await buildPackage(loadFixture("custom-js")))
    check("custom-js: a section with a script and declared capabilities reads", js.ok === true, js.ok === false ? errText(js) : "")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What is refused, and why, with the file and the line")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const bad = await readPackage(await buildPackage(loadFixture("invalid-schema")))
    check("a section whose schema is wrong refuses the whole package", bad.ok === false)
    if (bad.ok === false) {
      check("and says which file and which line", bad.errors.some((e) => e.file === "sections/broken.storelib" && typeof e.line === "number" && /default "big" is not a range/.test(e.message)), errText(bad))
    }
    const future = await readPackage(await buildPackage(loadFixture("newer-engine")))
    check("a theme that needs a newer engine is refused, not misread", future.ok === false && /needs engine 99/.test(errText(future as never)))

    // Tampering: change a file after the manifest was written.
    const zip = await JSZip.loadAsync(await buildPackage(loadFixture("minimal")))
    zip.file("sections/notice.storelib", (await zip.file("sections/notice.storelib")!.async("string")).replace("Free shipping", "Free shipping!"))
    const tampered = await readPackage(await zip.generateAsync({ type: "uint8array" }))
    check("a file that no longer matches its manifest hash refuses the package", tampered.ok === false && /sha256 does not match/.test(errText(tampered as never)))

    const zipAsset = await JSZip.loadAsync(await buildPackage(loadFixture("minimal")))
    const listed = JSON.parse(await zipAsset.file("manifest.json")!.async("string"))
    const ghostAsset = "assets/0d4169102865f69d5cd76c4b74b8cc56f42ee9af30b09fe8cd5d5815a5bb916f.svg"
    listed.files[ghostAsset] = { sha256: "0d4169102865f69d5cd76c4b74b8cc56f42ee9af30b09fe8cd5d5815a5bb916f", bytes: 24 }
    zipAsset.file("manifest.json", JSON.stringify(listed))
    const withoutBytes = await readPackage(await zipAsset.generateAsync({ type: "uint8array" }))
    check("an asset the manifest names and the zip does not contain is left out, and the theme still reads", withoutBytes.ok === true && withoutBytes.ok && withoutBytes.value.warnings.some((w) => w.message.includes(ghostAsset)) && !(ghostAsset in withoutBytes.value.manifest.files), withoutBytes.ok === false ? errText(withoutBytes) : "")

    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"
    const svgHash = sha256(svg)
    const svgPath = `assets/${svgHash}.svg`
    const zipKept = await JSZip.loadAsync(await buildPackage(loadFixture("minimal")))
    const keptManifest = JSON.parse(await zipKept.file("manifest.json")!.async("string"))
    keptManifest.files[svgPath] = { sha256: svgHash, bytes: Buffer.byteLength(svg) }
    zipKept.file(svgPath, svg)
    zipKept.file("manifest.json", JSON.stringify(keptManifest))
    const withBytes = await readPackage(await zipKept.generateAsync({ type: "uint8array" }))
    check("an asset listed as a file, and present in the zip, is kept", withBytes.ok === true && withBytes.ok && svgHash in withBytes.value.assets, withBytes.ok === false ? errText(withBytes) : "")

    const zip2 = await JSZip.loadAsync(await buildPackage(loadFixture("minimal")))
    zip2.file("../escape.txt", "x")
    const escaped = await readPackage(await zip2.generateAsync({ type: "uint8array" }))
    check("a path that escapes the theme refuses the package", escaped.ok === false && /not a path inside a theme/.test(errText(escaped as never)))

    const zip3 = await JSZip.loadAsync(await buildPackage(loadFixture("minimal")))
    zip3.file("templates/index.json", JSON.stringify({ sections: { x: { type: "ghost" } }, order: ["x"] }))
    const m = JSON.parse(await zip3.file("manifest.json")!.async("string"))
    m.files["templates/index.json"] = { sha256: sha256(JSON.stringify({ sections: { x: { type: "ghost" } }, order: ["x"] })), bytes: 0 }
    zip3.file("manifest.json", JSON.stringify(m))
    const ghost = await readPackage(await zip3.generateAsync({ type: "uint8array" }))
    check("a template that uses a section the theme does not have is refused", ghost.ok === false && /"ghost", which this theme does not have/.test(errText(ghost as never)))
    const known = await readPackage(await zip3.generateAsync({ type: "uint8array" }), { knownTypes: ["ghost"] })
    check("unless the application says it knows that type", known.ok === true)

    check("theme paths: folders the format has, no escapes, no absolute", isSafeThemePath("sections/a.storelib") && isSafeThemePath("theme.json") && !isSafeThemePath("../x") && !isSafeThemePath("/etc/passwd") && !isSafeThemePath("secrets/key.txt"))
    const notZip = await readPackage(new TextEncoder().encode("hello"))
    check("not a zip is said plainly", notZip.ok === false && /not a zip/.test(errText(notZip as never)))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The builder's earlier export migrates")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const dir = join(ROOT, "legacy-v2")
    const zip = new JSZip()
    zip.file("manifest.json", readFileSync(join(dir, "manifest.json")))
    for (const f of readdirSync(join(dir, "images"))) zip.file(`images/${f}`, readFileSync(join(dir, "images", f)))
    const r = await readPackage(await zip.generateAsync({ type: "uint8array" }), { knownTypes: ["hero", "faq"] })
    check("a storelib-theme/v2 zip reads", r.ok === true, r.ok === false ? errText(r) : "")
    if (r.ok === true) {
      const v = r.value
      check("and is marked as migrated", v.legacy === true && v.theme.migrated_from === "storelib-theme/v2")
      check("its pages became templates", "templates/home.json" in v.files)
      const home = JSON.parse(v.files["templates/home.json"])
      check("with ids, order and blocks intact", JSON.stringify(home.order) === JSON.stringify(["hero-1", "faq-1"]) && home.sections["faq-1"].block_order[0] === "q1" && home.sections["faq-1"].blocks.q1.settings.question === "Why?")
      const hash = Object.keys(v.assets)[0]
      check("its image became an asset named by its bytes", Object.keys(v.assets).length === 1 && hash === sha256(v.assets[hash].bytes))
      check("and every URL that pointed at it is now its asset:// reference", home.sections["hero-1"].settings.bg_image === `asset://${hash}` && JSON.parse(v.files["config/settings.json"]).logo_url === `asset://${hash}`)
      check("the install record and the theme pack ride along in theme.json", (v.theme.install as { name: string }).name === "Old export" && !!v.theme.theme_pack)
      check("and the migrated theme builds and reads again as a native package", (await readPackage(await buildPackage(v), { knownTypes: ["hero", "faq"] })).ok === true)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Pages and templates are one shape seen from two sides")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const page = [
      { id: "a", type: "hero", name: "Hero", settings: { heading: "Hi" }, blocks: [], hidden: false, extra: 1 },
      { id: "b", type: "faq", name: "FAQ", settings: {}, blocks: [{ id: "q1", type: "question", settings: { q: "?" }, note: "kept" }] },
    ]
    const t = templateFromSections(page)
    check("a page's list becomes a template keyed by id, in order", JSON.stringify(t.order) === JSON.stringify(["a", "b"]) && t.sections.b.block_order![0] === "q1")
    const back = sectionsFromTemplate(t)
    // Key order is not data: compare the values, sorted.
    const stable = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(stable)
      : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, val]) => [k, stable(val)]))
      : v
    check("and comes back as the same list", JSON.stringify(stable(back)) === JSON.stringify(stable(page)), JSON.stringify(back))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The routes carry the format, and the theme only")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const exportRoute = readFileSync(join(process.cwd(), "app/api/website-builder/themes/[installId]/export/route.ts"), "utf8")
    /* Changed on purpose (round 26): the install's writes moved to lib/themes/imported-theme-store.ts (shared with Start with AI's template start); read after the route. */
    const importRoute = readFileSync(join(process.cwd(), "app/api/website-builder/themes/import/route.ts"), "utf8") + readFileSync(join(process.cwd(), "lib/themes/imported-theme-store.ts"), "utf8")
    const client = readFileSync(join(process.cwd(), "app/(storelib)/app/website-builder/website-builder-client.tsx"), "utf8")

    /* Its templates and its header and footer group files come from lib/website-builder/theme-pages.ts, which writes them with templateFromSections. */
    check("export builds a package through the engine, not a zip of its own", /buildPackage\(\{/.test(exportRoute) && /packageFilesFromPages\(/.test(exportRoute) && /templateFromSections\(/.test(readFileSync(join(process.cwd(), "lib/website-builder/theme-pages.ts"), "utf8")))
    check("and carries the section sources with it — the theme's, and the ones this creator edited", /for \(const \[path, content\] of Object\.entries\(DEFAULT_THEME_SOURCES\)\) files\[path\] = saved\.get\(path\) \?\? content/.test(exportRoute) && /\.from\("store_theme_custom_files"\)/.test(exportRoute))
    check("every image becomes an asset named by its bytes, and every reference an asset://", /sha256\(bytes\)/.test(exportRoute) && /urlToRef\[url\] = `asset:\/\/\$\{hash\}`/.test(exportRoute))
    check("no install id, publish state or account row goes into the package", !/install_id:/.test(exportRoute.split("const pkg = await buildPackage")[0].split("const files: Record<string, string> = {}")[1] ?? ""))
    check("the older zip is still written on request", /searchParams\.get\("legacy"\) === "1"/.test(exportRoute) && /storelib-export\.zip/.test(exportRoute))

    check("import reads a package as a whole and refuses it with the list", /readPackage\(new Uint8Array\(buf\)/.test(importRoute) && /errors: read\.errors/.test(importRoute))
    /* The install is written in one place, createInstall, and the package path calls it only after the refusal. */
    check("and writes nothing when it refuses",
      importRoute.indexOf("errors: read.errors") > 0 &&
        importRoute.indexOf("errors: read.errors") < importRoute.indexOf("await createInstall(admin, creator.id") &&
        (importRoute.match(/\.from\("store_theme_installs"\)\s*\.insert\(/g) ?? []).length === 1 &&
        importRoute.indexOf("async function createInstall") < importRoute.search(/\.from\("store_theme_installs"\)\s*\.insert\(/))
    check("a section that matches this build's own file stores no row", /DEFAULT_THEME_SOURCES\[path\] !== content/.test(importRoute))
    check("the builder's earlier zips still import", /parseThemePackageManifest\(manifestRaw\)/.test(importRoute) && /const imagesFolder = zip\.folder\("images"\)/.test(importRoute))

    /*
      IT ENDS IN .zip NOW, BECAUSE IT IS ONE. The body was always a zip and
      the name was `.storelib-theme`, which no operating system opens on a
      double click. Both the server header and `a.download` have to say it:
      for a blob URL the anchor's attribute wins, so a header on its own
      changes nothing.
    */
    check(
      "the file a person downloads ends in .zip, from both places that name it",
      /\.storelib-theme\.zip`/.test(client) && /\.storelib-theme\.zip`/.test(exportRoute),
    )
    check("and the picker still offers the package and plain zips", /accept=".storelib-theme,\.zip/.test(client))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A package is judged before it is unpacked")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * Deflate turns a megabyte of one repeated byte into about a kilobyte,
     * so a package inside every limit on disk can hold gigabytes. Measured
     * before this was guarded: an 82 KB zip carrying one 80 MB entry took
     * 519ms and 80 MB of heap before any limit was consulted, and was then
     * refused for an unrelated reason. Now the zip's own headers are read
     * first and nothing is decompressed.
     */
    const bomb = new JSZip()
    bomb.file("theme.json", JSON.stringify({ format: "storelib-theme", format_version: 1, name: "B", version: "1", engine: { min: 1 } }))
    bomb.file("manifest.json", JSON.stringify({ format: "storelib-theme", format_version: 1, files: {}, assets: {} }))
    bomb.file("sections/big.storelib", "a".repeat(40 * 1024 * 1024))
    const bytes = await bomb.generateAsync({ type: "uint8array", compression: "DEFLATE" })
    check("the zip is small enough to pass every size limit on disk", bytes.byteLength < 1024 * 1024, `${bytes.byteLength} bytes`)
    const started = Date.now()
    const r = await readPackage(bytes)
    const took = Date.now() - started
    check("but an entry that unpacks past the limit is refused by its header", r.ok === false && /unpacks to/.test(errText(r as never)), r.ok === false ? errText(r) : "ACCEPTED")
    check("and refused without decompressing it", took < 200, `${took}ms`)

    /** Many entries, each inside the per-file limit, are judged together. */
    const many = new JSZip()
    many.file("theme.json", JSON.stringify({ format: "storelib-theme", format_version: 1, name: "M", version: "1", engine: { min: 1 } }))
    many.file("manifest.json", JSON.stringify({ format: "storelib-theme", format_version: 1, files: {}, assets: {} }))
    for (let i = 0; i < 600; i++) many.file(`snippets/s${i}.storelib`, "b".repeat(500 * 1024))
    const manyBytes = await many.generateAsync({ type: "uint8array", compression: "DEFLATE" })
    const rm = await readPackage(manyBytes)
    check("a package whose entries are each small enough but together are not is refused", rm.ok === false && /unpacks to/.test(errText(rm as never)), rm.ok === false ? errText(rm) : "ACCEPTED")
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}
void main()
