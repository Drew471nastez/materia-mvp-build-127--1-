/**
 * ===========================================================================
 *  CREATORS AND BUYERS NEVER READ HOW THE FILE CHECKS WORK
 * ===========================================================================
 * The owner: "Do not expose words like ClamAV, scanner provider, backend,
 * signature engine, quarantine, hash, MIME validation, or internal errors to
 * users." and no "Scanning", "Clean", "Virus check pending" or "Blocked by
 * the virus scan" on a file's row.
 *
 * This reads every sentence a creator or buyer can be shown by the upload and
 * download code: the text in the upload components, and every `error:` a
 * route or helper they call answers with. A sentence is a string with a space
 * in it (a code or a status like "clean" is not shown to anyone); JSX text is
 * read whole. The words the admin page uses are allowed there and only there.
 *
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"
import { DOWNLOAD_TRY_AGAIN, DOWNLOAD_UNAVAILABLE, userMessage, UPLOAD_CONTEXTS, type UserFacingCode } from "../lib/security/uploads/policy"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

const BANNED = /\b(clam\s?av|virus(es)?|malware|quarantin\w*|scann(er|ing)|signature engine|mime|sha-?256|checksum|hash(es)?|backend|provider|stack ?trace|infected|threat|eicar|zip bomb|heuristic)\b/i
/** A file's row on its own: these are the old scan states. */
const OLD_ROW_WORDS = /(^|[^\w])(Scanning|Clean|Virus check pending|Blocked by the virus scan)([^\w]|$)/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(p) ? [p] : []
  })
}

/** The sentences in a file: string and template literals with a space, and JSX text. */
function sentences(path: string): string[] {
  const src = stripComments(readFileSync(path, "utf8"))
  const out: string[] = []
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? ""
    if (/\s/.test(s.trim()) && !/^[\w\s./@:-]*\/[\w./-]*$/.test(s) && !/className|^\s*[a-z-]+:[^\s]/.test(s)) out.push(s)
  }
  for (const m of src.matchAll(/>\s*([^<>{}\n][^<>{}]*?)\s*</g)) {
    const t = m[1].trim()
    if (t && /[A-Za-z]/.test(t) && !/[=;()]|=>/.test(t)) out.push(t)
  }
  return out
}

/** Only the words a route or helper sends back as `error`. */
function errorMessages(path: string): string[] {
  const src = stripComments(readFileSync(path, "utf8"))
  return [...src.matchAll(/error:\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`|'((?:[^'\\]|\\.)*)')/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "")
}

const CREATOR_AND_BUYER_UI = [
  "app/app/products/new/file-uploads.tsx",
  "components/app/file-upload.tsx",
  "components/download-button.tsx",
  ...walk("app/receipt"),
  ...walk("app/library").filter((p) => /download|file/i.test(p)),
]

const ROUTES_THEY_CALL = [
  ...walk("app/api/v2/upload"),
  ...walk("app/api/download"),
  ...walk("app/api/v2/download"),
  "app/api/onepage/upload-file/route.ts",
  "app/api/onepage/signed-upload-url/route.ts",
  "app/api/email/upload-image/route.ts",
  "app/api/storage/upload-video/route.ts",
  "app/api/website-builder/themes/import/route.ts",
  "lib/storage/token-download.ts",
  "lib/storage/upload-guard.ts",
  "lib/storage/public-image.ts",
  "lib/storage/scan-gate.ts",
  "lib/storage/antivirus.ts",
]

function main() {
  console.log("\nThe sentences the policy gives\n")
  const codes: UserFacingCode[] = ["unsupported_type", "too_large", "empty", "not_accepted", "not_an_image", "not_a_video"]
  const all = UPLOAD_CONTEXTS.flatMap((c) => codes.map((k) => userMessage(k, c)))
  check("none names a check, an engine or an internal", all.every((m) => !BANNED.test(m)), all.filter((m) => BANNED.test(m)))
  check("the download sentences too", !BANNED.test(DOWNLOAD_TRY_AGAIN) && !BANNED.test(DOWNLOAD_UNAVAILABLE))
  check("they are the owner's words", all.includes("This file type isn't supported.") && all.includes("We couldn't accept this file. Try another file.") && all.some((m) => /^This file is too large\. The limit is \d/.test(m)))

  console.log("\nWhat the upload and download components show\n")
  for (const file of CREATOR_AND_BUYER_UI) {
    const hits = sentences(file).filter((s) => BANNED.test(s) || OLD_ROW_WORDS.test(s))
    check(`${file} says nothing about how files are checked`, hits.length === 0, hits)
  }
  const editor = sentences("app/app/products/new/product-editor.tsx").filter((s) => /file|upload/i.test(s))
  check("the product editor's file sentences too", editor.every((s) => !BANNED.test(s)), editor.filter((s) => BANNED.test(s)))
  const links = sentences("components/onepage/tabs/links-tab.tsx").filter((s) => /file|upload|blocked|security/i.test(s))
  check("the OnePage uploader's too, and no \"security reasons\" wording", links.every((s) => !BANNED.test(s) && !/security reasons|executable code/i.test(s)), links.filter((s) => BANNED.test(s) || /security reasons|executable code/i.test(s)))

  console.log("\nWhat the routes they call answer with\n")
  for (const file of ROUTES_THEY_CALL) {
    const hits = errorMessages(file).filter((m) => BANNED.test(m) || /internal server error|stack|exception/i.test(m))
    check(`${file}: every error is a plain sentence`, hits.length === 0, hits)
  }

  console.log("\nThe admin page is the one place the internals are named\n")
  check("it names them (so the owner can act)", /ClamAV/.test(readFileSync("app/admin/security/security-admin.tsx", "utf8")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main()
