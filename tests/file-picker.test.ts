/**
 * ===========================================================================
 *  A FILE SETTING: UPLOADED OR LINKED, AND WHAT IT TAKES
 * ===========================================================================
 * A `file_picker` was a text box that said "Paste a file URL", so a creator
 * with a PDF on their computer had nowhere to put it. It is a picker now
 * (components/website-builder/editor/controls/file-picker-control.tsx): an
 * upload through /api/website-builder/files, or a pasted link. A schema's
 * `accept` (lib/storelib-theme/file-kinds.ts) narrows what it takes.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { acceptEntryProblem, acceptLabel, acceptedExtensions, fileBadge, fileFits, inputAccept } from "@/lib/storelib-theme/file-kinds"
import { validateSectionSchema } from "@/lib/storelib-theme/schema/validate"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

console.log("\nWhat `accept` means")
check("a kind expands to its extensions", acceptedExtensions(["pdf"]).join() === "pdf" && acceptedExtensions(["archive"]).includes("zip"))
check("extensions are taken with or without the dot", acceptedExtensions([".zip", "WAV"]).join() === "zip,wav")
check("kinds and extensions mix, without repeats", acceptedExtensions(["document", ".pdf"]).filter((e) => e === "pdf").length === 1)
check("no accept is any file", acceptedExtensions(undefined).length === 0 && inputAccept(undefined) === "")
check("the input's accept attribute", inputAccept(["pdf", ".zip"]) === ".pdf,.zip")
check("said in words", acceptLabel(["pdf"]) === "PDF" && acceptLabel(["pdf", "archive"]) === "PDF or ZIP or archive" && acceptLabel([]) === "any file")
check("a web page, a script or an SVG is never one", acceptEntryProblem(".html") !== null && acceptEntryProblem("svg") !== null && acceptEntryProblem(".js") !== null)
check("nonsense is not one", acceptEntryProblem("a pdf please") !== null && acceptEntryProblem(3) !== null)
check("a file fits by its extension", fileFits("Sample.PDF", ["pdf"]) && !fileFits("sample.docx", ["pdf"]) && fileFits("anything.zip", undefined))
check("and never a page, whatever accept is empty", !fileFits("page.html", undefined) && !fileFits("x.svg", []))
check("the tile reads the extension", fileBadge("https://cdn.test/a/press-kit.pdf") === "PDF" && fileBadge("no-extension") === "FILE")

console.log("\nThe schema checks `accept` where it is declared")
const base = { type: "x", name: "X" }
const withAccept = (accept: unknown) => validateSectionSchema({ ...base, settings: [{ type: "file_picker", id: "sample", label: "Sample", accept }] })
check("a kind validates", withAccept(["pdf"]).ok === true)
check("kinds and extensions validate", withAccept(["document", ".zip"]).ok === true)
check("an empty list is refused", withAccept([]).ok === false)
check("an .html extension is refused, with the reason", (() => { const r = withAccept([".html"]); return r.ok === false && r.errors.some((e) => /browser would run it/.test(e.message)) })())
check("no accept is fine", validateSectionSchema({ ...base, settings: [{ type: "file_picker", id: "f", label: "File" }] }).ok === true)

console.log("\nThe picker and the upload")
const control = read("components/website-builder/editor/controls/file-picker-control.tsx")
const index = read("components/website-builder/editor/controls/index.tsx")
const route = read("app/api/website-builder/files/route.ts")
const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
check("the registered controls draw it", /case "file_picker":\s*\n?\s*return <FilePickerControl[^>]*accept=\{field\.accept\}/.test(index) && /"file_picker",/.test(index))
check("the old address-only box is gone", !/Paste a file URL/.test(editor))
check("it uploads through the website file route, with a progress bar", /fetch\("\/api\/website-builder\/files"/.test(control) && /xhr\.upload\.addEventListener\("progress"/.test(control))
check("and the server checks the bytes after", /confirmUpload\(ticket\.bucket, ticket\.path\)/.test(control))
check("it refuses a file that does not fit before uploading", /if \(!fileFits\(file\.name, accept\)\)/.test(control))
check("and still takes a pasted link", /data-file-address=""/.test(control) && /Or paste a file link/.test(control))
check("the route checks sign in, a seller, the rate limit, accept and the public file rules", /websiteCaller\(\)/.test(route) && /from\("creators"\)/.test(route) /* Changed on purpose (round 42 team): signed in and the store through lib/team/website */ && /uploadRateLimit\(/.test(route) && /fileFits\(fileName, body\?\.accept\)/.test(route) && /validateFile\(fileName, contentType, fileSize, null, "link_page_file"\)/.test(route))
check("the file goes in the creator's own folder, under its own name", /`\$\{creator\.id\}\/site-files\/\$\{folder\}\/\$\{safeStem\(fileName\)\}\.\$\{storageExtension\(fileName\)\}`/.test(route))
check("the controls reference documents accept", /- Reads these extra keys: `accept`/.test(read("docs/theme/05-controls-reference.md")) && /### Files: `file_picker` and `accept`/.test(read("content/developers/schema.md")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
