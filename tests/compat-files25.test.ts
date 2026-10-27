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
import { compatFilesChanged, loadCompatFiles } from "@/components/website-builder/compat/compat-files"
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
  compatFilesChanged("inst-1")
  const [c, d] = await Promise.all([loadCompatFiles("inst-1"), loadCompatFiles("inst-1")])
  check("after a push, the next reader gets the new code, and the one after it shares that read", reads === 2 && c === d && c["shopify/sections/hero.liquid"] === "new", reads)

  await loadCompatFiles("inst-2")
  check("another install's files are their own", reads === 3)

  const preview = readCode("components/website-builder/compat/compat-section-preview.tsx")
  check("the block library reads again when the version moves", /const filesVersion = useCompatFilesVersion\(installId\)/.test(preview) && /\}, \[installId, filesVersion\]\)/.test(preview))
  const page = readCode("app/website-builder/editor/[installId]/page.tsx")
  check("the editor says so when a push or an agent writes a theme file", /compatFilesChanged\(installId\)\s*\n\s*setCompatFilesVersion/.test(page))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
