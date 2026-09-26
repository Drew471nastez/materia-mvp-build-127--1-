/**
 * ===========================================================================
 *  THE IMAGE FIELD'S UPLOAD RULES
 * ===========================================================================
 * What components/website-builder/editor/image-picker.tsx will take, and
 * what it does with a picture before it goes up.
 *
 * The field itself is the one from before the September 25 rework, asked
 * back as it was ("The uploading of an image in the image picker: smooth,
 * clean, how it was before"). What it keeps from the safety rounds is below:
 * only the types the store-builder-images bucket takes (supabase/migrations/
 * 20260929_upload_safety.sql), so a file the bucket would refuse after the
 * upload is refused here before it; a size limit; and the picture's
 * location, camera and owner details taken off in the browser before a byte
 * is sent. The frames of an upload are measured by scripts/check-image-picker.mjs.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { ALLOWED_TYPES, MAX_IMAGE_BYTES, SAFE_EXTENSIONS } from "@/components/website-builder/editor/image-picker"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const said = detail === undefined ? "" : ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})`
    failures.push(label + said)
    console.log(`  FAIL  ${label}${said}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const picker = read("components/website-builder/editor/image-picker.tsx")
  const migration = read("supabase/migrations/20260929_upload_safety.sql")

  console.log("\nWhat it takes")
  const bucketTypes = [...(migration.match(/image_types text\[\] := array\[([^\]]+)\]/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1])
  check("the bucket's picture types were found", bucketTypes.length >= 4, bucketTypes)
  check("exactly the picture types the bucket takes", [...ALLOWED_TYPES].sort().join(",") === [...bucketTypes].sort().join(","), { field: [...ALLOWED_TYPES], bucket: bucketTypes })
  check("so an SVG is refused before it is sent, because the bucket would refuse it after",
    !ALLOWED_TYPES.has("image/svg+xml") && !SAFE_EXTENSIONS.has("svg"))
  check("and the name has to agree with the type", ["jpg", "jpeg", "png", "gif", "webp", "avif"].every((e) => SAFE_EXTENSIONS.has(e)) && SAFE_EXTENSIONS.size === 6)
  check("up to 5 MB, as it always was", MAX_IMAGE_BYTES === 5 * 1024 * 1024 && /if \(file\.size > MAX_IMAGE_BYTES\) \{ toast\.error\("Image must be under 5 MB"\); return \}/.test(picker))
  check("and a refusal names what it does take", /toast\.error\("Use JPG, PNG, GIF, WebP or AVIF"\)/.test(picker) && !/SVG/.test(picker.replace(/\/\*[\s\S]*?\*\//g, "")))

  console.log("\nWhat it sends")
  check("the picture without its location, camera and owner details", /const body = await withoutMetadata\(file\)/.test(picker) && /import \{ withoutMetadata \} from "@\/lib\/images\/compress"/.test(picker))
  check("and that copy is the one uploaded, not the original", /\.upload\(filePath, body, \{/.test(picker) && !/\.upload\(filePath, file,/.test(picker))
  check("into the signed in person's own folder", /const filePath = `\$\{user\.id\}\/\$\{folder\}\/\$\{safeName\}`/.test(picker))
  check("the file on screen is still the one chosen, before anything is sent", /showFile\(file\)\s*\n\s*setUploading\(true\)\s*\n\s*try \{\s*\n[\s\S]{0,200}const body = await withoutMetadata\(file\)/.test(picker))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
