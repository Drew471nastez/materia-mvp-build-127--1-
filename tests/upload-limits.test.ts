/**
 * ===========================================================================
 *  A DIGITAL PRODUCT FILE: 10 GB AT MOST, AND LOOKED AT BEFORE IT IS SOLD
 * ===========================================================================
 * The ceiling is 10 GB per file on every plan (lib/storage/security
 * MAX_DIGITAL_PRODUCT_FILE_SIZE, lib/storage/plans), checked on the size
 * declared before the upload and again on the size storage recorded once it
 * arrived: a signed upload URL cannot limit what is sent through it.
 *
 * The first bytes are read back from storage and scanned when an upload
 * completes (a renamed executable, a script behind a document's name, and
 * the EICAR antivirus test file), by the central check (lib/security/uploads),
 * and is final at once: nothing waits for an engine (lib/storage/scan-gate) before a buyer can
 * download it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { MAX_DIGITAL_PRODUCT_FILE_SIZE, headerHasEicar, preUploadCheck, scanFile } from "../lib/storage/security"
import { PLAN_LIMITS } from "../lib/storage/plans"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const GB = 1024 * 1024 * 1024

function main() {
  console.log("\n10 GB a file")
  check("the ceiling is 10 GB", MAX_DIGITAL_PRODUCT_FILE_SIZE === 10 * GB)
  check("no plan allows more", Object.values(PLAN_LIMITS).every((p) => p.maxFileSizeBytes <= 10 * GB), Object.fromEntries(Object.entries(PLAN_LIMITS).map(([k, v]) => [k, v.maxFileSizeBytes / GB])))
  check("a file over it is refused before the upload", preUploadCheck("pack.zip", 10 * GB + 1, "application/zip").sizeOk === false && preUploadCheck("pack.zip", 10 * GB, "application/zip").sizeOk === true)
  const complete = read("app/api/v2/upload/complete/route.ts")
  check("and again on the size that actually arrived, which is removed if it is over",
    /if \(realSize > MAX_UPLOAD_BYTES\.product_file\) \{\s*return discard\(userMessage\("too_large", "product_file"\), 413\)/.test(complete)
      && complete.indexOf("realSize > MAX_UPLOAD_BYTES.product_file") < complete.indexOf("checkUploadAllowed(admin, creator.id, extra)"))
  check("the editor says 10 GB and checks it with the central rule", /Up to 10 GB each/.test(read("app/app/products/new/file-uploads.tsx")) && /precheckUpload\(\{ fileName: file\.name, size: file\.size, declaredMime: file\.type, context: "product_file" \}\)/.test(read("app/app/products/new/product-editor.tsx")))

  console.log("\nLooked at before it is sold")
  const eicar = new TextEncoder().encode("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\r\n")
  check("the EICAR test file is refused, whatever it is called", headerHasEicar(eicar) && scanFile("notes.txt", "text/plain", eicar).safe === false && scanFile("notes.txt", "text/plain", eicar).threatType === "malware_signature")
  check("an ordinary text file is not", scanFile("notes.txt", "text/plain", new TextEncoder().encode("Chapter one\nIt was a bright cold day.")).safe === true)
  const mz = new Uint8Array(64); mz[0] = 0x4d; mz[1] = 0x5a
  check("a program renamed to a PDF is refused by its first bytes", scanFile("guide.pdf", "application/pdf", mz).safe === false)
  check("an executable's name is refused outright", scanFile("setup.exe", "application/octet-stream", null).safe === false && scanFile("invoice.pdf.exe", "application/octet-stream", null).safe === false)
  check("the upload is checked from storage before it counts as complete, and is final at once (no pending state)",
    complete.indexOf("inspectStoredObject(") > 0 && complete.indexOf("inspectStoredObject(") < complete.indexOf('upload_status: "completed"') && /scan_status: "clean",\s*scan_result: kept \? before : builtinResult\(verdict\)/.test(complete) && !/"pending_scan"/.test(complete))
  const gate = read("lib/storage/scan-gate.ts")
  check("downloads never wait for an engine, and an engine is switched on by one explicit setting", /gateDownload/.test(gate) && !/status: 409/.test(gate) && /SECURITY_MALWARE_PROVIDER/.test(read("lib/security/uploads/provider-config.ts")) && !/process\.env\.(CLAMAV_REST_URL|CLOUDMERSIVE_API_KEY|VIRUSTOTAL_API_KEY)/.test(read("lib/storage/antivirus.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
