/**
 * Round 25: an imported theme's files are read once per version.
 *
 * A push changed a theme file while the editor was open. The canvas read the
 * files again, but the block library, mounted for the editor's whole life,
 * kept the files it had and drew its covers from the code as it was before.
 * Now the version lives with the files (components/website-builder/compat/
 * compat-files.ts): a change is said there once, and every reader, the
 * library included, gets the new files from one read.
 */
import { compatFilesChanged, loadCompatFiles, patchCompatFiles } from "@/components/website-builder/compat/compat-files"
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`, detail ?? "")
  }
}

async function main() {
  let reads = 0
  let code = "old"
  globalThis.fetch = (async () => {
    reads++
    return new Response(JSON.stringify({ files: { "shopify/sections/hero.liquid": code } }), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch

  const a = await loadCompatFiles("inst-1")
  const b = await loadCompatFiles("inst-1")
  check("two readers of the same files share one read", reads === 1 && a === b && a["shopify/sections/hero.liquid"] === "old", reads)

  code = "new"
  const patched = patchCompatFiles("inst-1", { "shopify/sections/hero.liquid": "new" })
  const [c, d] = await Promise.all([loadCompatFiles("inst-1"), loadCompatFiles("inst-1")])
  check("a push's changed file is the next read, shared, and the rest of the theme is not downloaded again", patched && reads === 1 && c === d && c["shopify/sections/hero.liquid"] === "new", reads)

  compatFilesChanged("inst-1")
  const again = await loadCompatFiles("inst-1")
  check("a full reread still asks the server once and is shared", reads === 2 && again["shopify/sections/hero.liquid"] === "new")

  await loadCompatFiles("inst-2")
  check("another install's files are their own", reads === 3)

  const preview = readCode("components/website-builder/compat/compat-section-preview.tsx")
  /* Changed on purpose (push lag): the version is read as it moves (filesVersionNow) and taken at once while the library is open, once the editor is left alone while it is closed (CLOSED_ADOPT_MS). */
  check("the block library reads again when the version moves", /const filesVersionNow = useCompatFilesVersion\(installId\)/.test(preview) && /const \{ sources, settings, filesVersion \} = taken/.test(preview) && /\}, \[installId, filesVersion\]\)/.test(preview))
  const page = readCode("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor patches the files a push changed, and reads the whole theme again only when that patch cannot land", /patchCompatFiles\(installId, shopify\)/.test(page) && /compatFilesChanged\(installId\)/.test(page) && /setCompatFilesVersion\(\(n\) => n \+ 1\)/.test(page))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
