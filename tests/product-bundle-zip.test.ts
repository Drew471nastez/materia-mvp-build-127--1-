/**
 * ===========================================================================
 *  A PRODUCT OF SIX FILES OR MORE DOWNLOADS AS ONE ZIP (lib/bundles.ts)
 * ===========================================================================
 * "[bundles] archiver package not available — run: pnpm add archiver" from
 * /api/v2/upload/bundle: the ZIP was built with a package that was never a
 * dependency, so no bundle was ever made. It is built with jszip now, which
 * is one. Driven here through ensureProductBundle itself, with a stand-in
 * database, storage and fetch, and the ZIP it uploads opened again and read.
 */
import JSZip from "jszip"
import { ensureProductBundle, zipEntryName, BUNDLE_THRESHOLD } from "@/lib/bundles"
import { fakeDb } from "./_fake-db"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}

const PRODUCT = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"

function world(files: Array<{ id: string; name: string; body: string; ok?: boolean }>) {
  const db = fakeDb({
    digital_assets: files.map((f, i) => ({ id: f.id, product_id: PRODUCT, file_path: `${CREATOR}/${f.id}`, file_name: f.name, file_size: f.body.length, storage_bucket: null, upload_status: "completed", scan_status: i === 0 ? "clean" : null, created_at: new Date(2026, 8, 1, 0, i).toISOString() })),
    product_bundles: [],
  })
  const uploads: Array<{ path: string; body: Buffer; type: string }> = []
  const admin = {
    ...db,
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://files.test/${path}` }, error: null }),
        upload: async (path: string, body: Buffer, o: { contentType: string }) => (uploads.push({ path, body, type: o.contentType }), { data: { path }, error: null }),
      }),
    },
  }
  const fetched: string[] = []
  globalThis.fetch = (async (url: string) => {
    fetched.push(url)
    const f = files.find((x) => url.endsWith(`/${x.id}`))
    if (!f || f.ok === false) return new Response("gone", { status: 404 })
    return new Response(f.body, { status: 200 })
  }) as typeof fetch
  return { db, admin: admin as never, uploads, fetched }
}

async function main() {
  console.log("\nSix files make one ZIP with all six in it")
  {
    const files = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, name: `lesson-${i + 1}.pdf`, body: `pdf number ${i + 1} `.repeat(50) }))
    const w = world(files)
    const result = await ensureProductBundle(w.admin, PRODUCT, "Photo course: part 1", CREATOR)
    check("a bundle comes back, freshly made", !!result && result.fromCache === false, result)
    check("named after the product", result?.zipFileName === "Photo_course_part_1.zip", result?.zipFileName)
    check("uploaded once, as a ZIP, at the product's own path", w.uploads.length === 1 && w.uploads[0].type === "application/zip" && w.uploads[0].path === `${CREATOR}/bundles/${PRODUCT}.zip`, w.uploads.map((u) => u.path))
    const zip = await JSZip.loadAsync(w.uploads[0]?.body ?? Buffer.alloc(0))
    const names = Object.keys(zip.files).sort()
    check("it opens, and holds every file by its own name", names.join() === files.map((f) => f.name).sort().join(), names)
    const third = await zip.file("lesson-3.pdf")?.async("string")
    check("with the file's own bytes", third === files[2].body)
    check("smaller than the files, so it was compressed", w.uploads[0].body.length < files.reduce((n, f) => n + f.body.length, 0), w.uploads[0].body.length)
    const row = w.db.tables.product_bundles[0]
    check("and the bundle is recorded for the next buyer", w.db.tables.product_bundles.length === 1 && row.file_count === 6 && row.zip_size === w.uploads[0].body.length && row.variant_id === null, row)

    const again = await ensureProductBundle(w.admin, PRODUCT, "Photo course: part 1", CREATOR)
    check("the next download reuses it without zipping again", again?.fromCache === true && w.uploads.length === 1)
  }

  console.log("\nTwo files with one name are two entries")
  {
    const files = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, name: `part-${i}.mp4`, body: `video ${i}` })),
      { id: "b8", name: "notes.pdf", body: "first notes" },
      { id: "b9", name: "Notes.pdf", body: "second notes" },
      { id: "b7", name: "../../evil.sh", body: "echo" },
    ]
    const w = world(files)
    await ensureProductBundle(w.admin, PRODUCT, "Course", CREATOR)
    const zip = await JSZip.loadAsync(w.uploads[0].body)
    const names = Object.keys(zip.files)
    check("the second is renamed, not lost", names.includes("notes.pdf") && names.includes("Notes (2).pdf") && (await zip.file("Notes (2).pdf")?.async("string")) === "second notes", names)
    check("a name cannot reach outside the folder it unpacks into", !names.some((n) => n.includes("/") || n.startsWith(".")), names)
    check("zipEntryName numbers a third one too", (() => { const t = new Set<string>(); return [zipEntryName("a.txt", t), zipEntryName("a.txt", t), zipEntryName("A.txt", t)].join() === "a.txt,a (2).txt,A (3).txt" })())
  }

  console.log("\nWhat is not bundled")
  {
    const w = world(Array.from({ length: BUNDLE_THRESHOLD - 1 }, (_, i) => ({ id: `c${i}`, name: `f${i}.pdf`, body: "x" })))
    check("five files are downloaded as they are", (await ensureProductBundle(w.admin, PRODUCT, "Small", CREATOR)) === null && w.uploads.length === 0)
    const gone = world(Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, name: `f${i}.pdf`, body: "x", ok: false })))
    check("files that cannot be read make no empty ZIP", (await ensureProductBundle(gone.admin, PRODUCT, "Gone", CREATOR)) === null && gone.uploads.length === 0)
  }

  console.log("\nNothing asks for a package this project does not have")
  {
    const src = readFileSync(join(process.cwd(), "lib/bundles.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"))
    check("no archiver", !/import\(["']archiver["']\)|from ["']archiver["']/.test(src))
    check("jszip, which is a dependency", /import JSZip from "jszip"/.test(src) && !!pkg.dependencies.jszip)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
}
main()
