/**
 * ===========================================================================
 *  THE MALWARE SCANNER: THE SERVICE, THE CLIENT, AND WHAT A VERDICT DOES
 * ===========================================================================
 * Storelib on Vercel -> services/file-scanner (a small Node API) -> ClamAV.
 *
 *   SETUP       both CLAMAV_SERVICE_URL and CLAMAV_SERVICE_SECRET, or scanning
 *               is off. The secret alone (production today) is off, never an
 *               error, and never throws.
 *   ANSWERS     the scanner's JSON read strictly: only a real "clean" with a
 *               hash is clean; a proxy's error page is never "no virus".
 *   CLIENT      run against a stand-in scanner over HTTP: clean, EICAR,
 *               retries on 503, no retry on a wrong secret, a timeout, the
 *               size limit checked before sending, a stored object streamed.
 *   POLICY      lib/storage/scan-gate.ts with a stand-in database: clean is
 *               kept, infected is deleted and quarantined, no verdict stays
 *               pending and is never served to a buyer, and with scanning
 *               off everything is as it was.
 *   WIRING      every way a file enters storage calls the scan; the editor
 *               shows Scanning, Clean and Blocked; the cron is scheduled; the
 *               admin page is server checked and imports nothing server only.
 *   SERVICE     services/file-scanner's own suite (node --test, against a
 *               fake clamd speaking INSTREAM) runs from here too.
 *
 * Run with:  npm run test:push
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"

import { stripComments } from "./_source"
import {
  attemptTimeoutMs,
  eicarTestBytes,
  interpretScanResponse,
  isScannerConfigured,
  readScannerSetup,
} from "../lib/security/file-scanner-core"

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
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const SECRET = "t".repeat(64)
const EICAR = new TextDecoder().decode(eicarTestBytes())

/* ─── A stand-in scanner and storage, over real HTTP ────────────────────── */

const S = {
  mode: "normal" as "normal" | "down" | "flaky" | "slow",
  scans: 0,
  lastLength: null as string | null,
  lastBytes: 0,
  objects: new Map<string, Uint8Array>(),
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/"
  if (req.method === "GET" && url.startsWith("/obj/")) {
    const key = decodeURIComponent(url.slice(5))
    const body = S.objects.get(key)
    if (!body) {
      res.writeHead(404).end()
      return
    }
    const range = /bytes=0-(\d+)/.exec(String(req.headers.range || ""))
    if (range) {
      const part = body.subarray(0, Number(range[1]) + 1)
      res.writeHead(206, { "Content-Length": part.length }).end(Buffer.from(part))
      return
    }
    res.writeHead(200, { "Content-Length": body.length }).end(Buffer.from(body))
    return
  }
  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", engine: { version: "1.4.6", signatures: 28129, updatedAt: "2026-09-20T06:26:26.000Z", ageHours: 3 } }))
    return
  }
  if (req.method === "POST" && url === "/scan") {
    S.scans++
    S.lastLength = (req.headers["content-length"] as string) ?? null
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const data = Buffer.concat(chunks)
    S.lastBytes = data.length
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== `Bearer ${SECRET}`) return json(401, { status: "error", error: "unauthorized" })
    if (S.mode === "down") return json(503, { status: "error", error: "clamd_unavailable", message: "Cannot reach clamd" })
    if (S.mode === "flaky") {
      S.mode = "normal"
      return json(503, { status: "error", error: "busy" })
    }
    if (S.mode === "slow") await new Promise((r) => setTimeout(r, 2500))
    const engine = { version: "1.4.6", signatures: 28129, updatedAt: "2026-09-20T06:26:26.000Z" }
    const sha256 = createHash("sha256").update(data).digest("hex")
    if (data.includes(Buffer.from(EICAR))) return json(200, { status: "infected", threat: "Eicar-Test-Signature", sha256, bytes: data.length, durationMs: 3, engine })
    return json(200, { status: "clean", sha256, bytes: data.length, durationMs: 3, engine })
  }
  res.writeHead(404).end()
})

/* ─── A stand-in Supabase admin client that records what it was asked ──── */

type Call = { table: string; op: string; values?: any; filters: string[] }
function fakeAdmin(base: string, rows: Record<string, any> = {}) {
  const calls: Call[] = []
  const removed: string[] = []
  const builder = (table: string) => {
    const call: Call = { table, op: "select", filters: [] }
    calls.push(call)
    const b: any = {}
    for (const m of ["eq", "in", "or", "lt", "gte", "order", "limit", "not", "neq"]) {
      b[m] = (...args: unknown[]) => {
        call.filters.push(`${m}:${args.map((a) => JSON.stringify(a)).join(",")}`)
        return b
      }
    }
    b.select = (cols?: string) => {
      if (call.op === "select") call.values = cols
      return b
    }
    b.insert = (v: unknown) => ((call.op = "insert"), (call.values = v), b)
    b.update = (v: unknown) => ((call.op = "update"), (call.values = v), b)
    b.delete = () => ((call.op = "delete"), b)
    b.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
    b.single = async () => ({ data: rows[table] ?? null, error: null })
    b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve({ data: call.op === "select" ? (rows[table] ? [rows[table]] : []) : null, error: null, count: 0 }).then(ok, bad)
    return b
  }
  const admin: any = {
    from: builder,
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `${base}/obj/${encodeURIComponent(path)}` }, error: null }),
        remove: async (paths: string[]) => {
          removed.push(...paths.map((p) => `${bucket}/${p}`))
          return { data: null, error: null }
        },
        download: async () => ({ data: null, error: { message: "not here" } }),
        list: async () => ({ data: [], error: null }),
      }),
    },
  }
  return { admin, calls, removed }
}

async function main() {
  console.log("\nSetup: both variables, or off\n")
  {
    const off = readScannerSetup({})
    check("nothing set is off, both named missing", !off.configured && off.missing.length === 2)
    const secretOnly = readScannerSetup({ CLAMAV_SERVICE_SECRET: SECRET })
    check("the secret alone (production today) is off, and only the URL is missing", !secretOnly.configured && secretOnly.missing.join() === "CLAMAV_SERVICE_URL")
    const urlOnly = readScannerSetup({ CLAMAV_SERVICE_URL: "https://scanner.example.com" })
    check("the URL alone is off, the secret missing", !urlOnly.configured && urlOnly.missing.join() === "CLAMAV_SERVICE_SECRET")
    const plain = readScannerSetup({ CLAMAV_SERVICE_URL: "http://scanner.example.com", CLAMAV_SERVICE_SECRET: SECRET })
    check("plain http to a real host is refused (the secret would cross the internet in clear)", !plain.configured && (plain as { invalidUrl?: boolean }).invalidUrl === true)
    const junk = readScannerSetup({ CLAMAV_SERVICE_URL: "not a url", CLAMAV_SERVICE_SECRET: SECRET })
    check("a value that is not a URL is off, and does not throw", !junk.configured)
    const good = readScannerSetup({ CLAMAV_SERVICE_URL: "https://scanner.example.com/", CLAMAV_SERVICE_SECRET: ` ${SECRET} ` })
    check("https with a trailing slash is used without it, the secret trimmed", good.configured && good.config?.url === "https://scanner.example.com" && good.config?.secret === SECRET)
    check("http to localhost is allowed, for Docker on your own machine", isScannerConfigured({ CLAMAV_SERVICE_URL: "http://localhost:8080", CLAMAV_SERVICE_SECRET: SECRET }))
    check("one attempt's time grows with the file and stops at the ceiling", attemptTimeoutMs(0, 240_000) === 20_000 && attemptTimeoutMs(100 * 1024 * 1024, 240_000) === 30_000 && attemptTimeoutMs(1e12, 240_000) === 240_000)
    check("the EICAR test bytes are the 68 byte standard string", eicarTestBytes().length === 68 && EICAR.startsWith("X5O!P%@AP"))
  }

  console.log("\nThe scanner's answers, read strictly\n")
  {
    const engine = { version: "1.4.6", signatures: 28129, updatedAt: "2026-09-20T06:26:26.000Z" }
    const clean = interpretScanResponse(200, { status: "clean", sha256: "a".repeat(64), bytes: 5, engine }, 10)
    check("200 clean with a hash is clean, with the engine", clean.status === "clean" && clean.engine?.signatures === 28129 && clean.bytes === 5)
    const infected = interpretScanResponse(200, { status: "infected", threat: "Win.Test.EICAR_HDB-1", sha256: "b".repeat(64) }, 10)
    check("200 infected carries the threat's name", infected.status === "infected" && infected.threat === "Win.Test.EICAR_HDB-1")
    check("clean without a hash is not trusted", interpretScanResponse(200, { status: "clean" }, 1).status === "error")
    check("an HTML error page is not clean", interpretScanResponse(200, null, 1).status === "error")
    check("413 is not scanned, too large", (() => { const r = interpretScanResponse(413, { status: "error", error: "too_large" }, 1); return r.status === "not_scanned" && r.reason === "too_large" })())
    check("504 is a timeout", interpretScanResponse(504, { error: "timeout" }, 1).reason === "timeout")
    check("401 is rejected", interpretScanResponse(401, { error: "unauthorized" }, 1).reason === "rejected")
    check("503 and 429 are unavailable", interpretScanResponse(503, {}, 1).reason === "unavailable" && interpretScanResponse(429, {}, 1).reason === "unavailable")
    check("a ClamAV failure is engine_error", interpretScanResponse(502, { error: "engine_error" }, 1).reason === "engine_error")
  }

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const scanner = await import("../lib/security/file-scanner")

  console.log("\nWith scanning off, nothing is sent and it is said once\n")
  {
    delete process.env.CLAMAV_SERVICE_URL
    process.env.CLAMAV_SERVICE_SECRET = SECRET
    const infos: string[] = []
    const info = console.info
    console.info = (...a: unknown[]) => void infos.push(a.join(" "))
    const results = [await scanner.scanBytes(new TextEncoder().encode("a")), await scanner.scanBytes(new TextEncoder().encode("b")), await scanner.scanBytes(eicarTestBytes())]
    console.info = info
    check("every call answers not_scanned / not_configured", results.every((r) => r.status === "not_scanned" && r.reason === "not_configured"))
    check("no request reached any scanner", S.scans === 0)
    check("one log line, however often it is asked", infos.filter((l) => /scanning is off/.test(l)).length === 1, infos)
    const health = await scanner.scannerHealth()
    check("health says not configured and names the missing URL", !health.configured && health.missing.join() === "CLAMAV_SERVICE_URL")
  }

  process.env.CLAMAV_SERVICE_URL = base
  process.env.CLAMAV_SERVICE_SECRET = SECRET
  const quiet = { info: console.info, warn: console.warn }
  console.info = () => {}
  console.warn = () => {}

  console.log("\nThe client against a stand-in scanner\n")
  {
    const text = new TextEncoder().encode("A clean product file.")
    const clean = await scanner.scanBytes(text)
    check("a clean file is clean, hashed by the scanner, one attempt", clean.status === "clean" && clean.sha256 === createHash("sha256").update(text).digest("hex") && clean.attempts === 1, clean)
    check("the size is sent as Content-Length", S.lastLength === String(text.length))
    const eicar = await scanner.scanBytes(eicarTestBytes())
    check("EICAR is infected with its name", eicar.status === "infected" && eicar.threat === "Eicar-Test-Signature", eicar)

    S.mode = "flaky"
    const retried = await scanner.scanBytes(text)
    check("a busy scanner (503) is asked again, and the second answer counts", retried.status === "clean" && retried.attempts === 2, retried)

    S.mode = "down"
    const before = S.scans
    const t0 = Date.now()
    const down = await scanner.scanBytes(text, { retries: 2 })
    check("a scanner that stays down is an error, unavailable, after three tries", down.status === "error" && down.reason === "unavailable" && S.scans - before === 3 && down.attempts === 3, down)
    check("with a short back off, not a long wait", Date.now() - t0 < 5000)
    S.mode = "normal"

    process.env.CLAMAV_SERVICE_SECRET = "w".repeat(64)
    const b2 = S.scans
    const wrong = await scanner.scanBytes(text)
    check("a wrong secret is rejected and not retried", wrong.status === "error" && wrong.reason === "rejected" && S.scans - b2 === 1, wrong)
    process.env.CLAMAV_SERVICE_SECRET = SECRET

    S.mode = "slow"
    const slow = await scanner.scanBytes(text, { timeoutMs: 400, retries: 0 })
    check("no answer in time is a timeout", slow.status === "error" && slow.reason === "timeout", slow)
    S.mode = "normal"
    await new Promise((r) => setTimeout(r, 2300))

    process.env.CLAMAV_SERVICE_MAX_BYTES = "10"
    const b3 = S.scans
    const big = await scanner.scanBytes(text)
    check("a file over the limit is not sent at all", big.status === "not_scanned" && big.reason === "too_large" && S.scans === b3, big)
    delete process.env.CLAMAV_SERVICE_MAX_BYTES

    const stored = new Uint8Array(3 * 1024 * 1024).fill(65)
    S.objects.set("c1/digital-products/big.bin", stored)
    const fromStorage = await scanner.scanStoredObject(fakeAdmin(base).admin, "digital-products", "c1/digital-products/big.bin")
    check("a stored file streams from its signed URL to the scanner, every byte", fromStorage.status === "clean" && S.lastBytes === stored.length && S.lastLength === String(stored.length), fromStorage)
    const missing = await scanner.scanStoredObject(fakeAdmin(base).admin, "digital-products", "c1/nope.bin", { retries: 0 })
    check("a file not in storage is a source error, not clean", missing.status === "error" && missing.reason === "source_error", missing)

    const health = await scanner.scannerHealth()
    check("health reads the scanner's /health", health.configured && health.reachable === true && (health.health as any)?.engine?.signatures === 28129, health)
  }

  console.log("\nWhat a verdict does to a paid file (lib/storage/scan-gate.ts)\n")
  {
    const gate = await import("../lib/storage/scan-gate")
    const pdf = (extra = "") => {
      const head = new TextEncoder().encode("%PDF-1.4\n" + "x".repeat(9000) + extra)
      return head
    }
    const asset = (path: string, size: number, status = "pending_scan") => ({
      id: "11111111-1111-4111-8111-111111111111",
      file_path: path,
      file_name: "guide.pdf",
      mime_type: "application/pdf",
      file_size: size,
      storage_bucket: "digital-products",
      scan_status: status,
    })

    S.objects.set("c1/digital-products/clean.pdf", pdf())
    const a = fakeAdmin(base)
    const cleanStatus = await gate.scanAsset(a.admin, asset("c1/digital-products/clean.pdf", pdf().length))
    const cleanWrite = a.calls.find((c) => c.table === "digital_assets" && c.op === "update")
    check("clean: the row says clean, by ClamAV, with its hash", cleanStatus === "clean" && cleanWrite?.values?.scan_status === "clean" && cleanWrite?.values?.scan_result?.engine === "clamav" && /^[a-f0-9]{64}$/.test(cleanWrite?.values?.scan_result?.sha256), cleanWrite)
    check("clean: the scan is logged, nothing removed", a.calls.some((c) => c.table === "file_scans" && c.op === "insert" && c.values?.status === "clean") && a.removed.length === 0)

    /* The test string past the first 8 KB, so the header check cannot see it and ClamAV must. */
    S.objects.set("c1/digital-products/bad.pdf", pdf(EICAR))
    const b = fakeAdmin(base, { digital_assets: { id: "11111111-1111-4111-8111-111111111111", file_path: "c1/digital-products/bad.pdf", storage_bucket: "digital-products", uploaded_by: "u1", product_id: "p1", file_name: "guide.pdf" } })
    const badStatus = await gate.scanAsset(b.admin, asset("c1/digital-products/bad.pdf", pdf(EICAR).length))
    check("infected: the file is deleted from storage", badStatus === "infected" && b.removed.includes("digital-products/c1/digital-products/bad.pdf"), { badStatus, removed: b.removed })
    check(
      "infected: the row is infected and quarantined, with the threat's name",
      b.calls.some((c) => c.op === "update" && c.values?.upload_status === "quarantined" && c.values?.scan_status === "infected" && c.values?.scan_result?.threatName === "Eicar-Test-Signature"),
    )

    S.mode = "down"
    const c = fakeAdmin(base, { digital_assets: { scan_result: { attempts: 2 } } })
    const pendingStatus = await gate.scanAsset(c.admin, asset("c1/digital-products/clean.pdf", pdf().length), { deadlineMs: 4000 })
    const pendingWrite = c.calls.find((x) => x.op === "update" && x.table === "digital_assets")
    check("no verdict: the file stays pending, the attempt counted", pendingStatus === "pending_scan" && pendingWrite?.values?.scan_status === "pending_scan" && pendingWrite?.values?.scan_result?.attempts === 3, pendingWrite)
    check("no verdict: only a row still unscanned is touched", (pendingWrite?.filters ?? []).some((f) => /scan_status\.is\.null,scan_status\.in\.\(pending_scan,scanning,scan_error\)/.test(f)))
    check("no verdict: nothing is removed", c.removed.length === 0)

    const d = fakeAdmin(base)
    const b4 = S.scans
    const big = await gate.gateDownload(d.admin, asset("c1/digital-products/clean.pdf", 60 * 1024 * 1024), { isCreator: false })
    check("a buyer never gets a large file still waiting: 409, still being checked", !big.ok && (big as any).status === 409 && S.scans === b4)
    const own = await gate.gateDownload(d.admin, asset("c1/digital-products/clean.pdf", 60 * 1024 * 1024), { isCreator: true })
    check("the creator can always fetch their own file", own.ok)
    const small = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", pdf().length), { isCreator: false })
    check("a small waiting file with the scanner down is still refused", !small.ok && (small as any).status === 409)
    S.mode = "normal"
    const smallNow = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", pdf().length), { isCreator: false })
    check("with the scanner back, a small waiting file is scanned on the spot and served", smallNow.ok)
    const flagged = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/bad.pdf", 10, "quarantined"), { isCreator: false })
    check("a quarantined file is never served", !flagged.ok && (flagged as any).status === 403)
    const legacy = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", 60 * 1024 * 1024, null as unknown as string), { isCreator: false })
    check("a large file from before the scanner (no scan status) keeps selling while it waits for the sweep", legacy.ok, legacy)
    S.objects.set("c1/digital-products/legacy-bad.pdf", new TextEncoder().encode(EICAR))
    const legacyBad = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/legacy-bad.pdf", 60 * 1024 * 1024, null as unknown as string), { isCreator: false })
    check("but one the header check refuses is never served", !legacyBad.ok && (legacyBad as any).status === 403, legacyBad)

    delete process.env.CLAMAV_SERVICE_URL
    const e = fakeAdmin(base)
    const before = S.scans
    const offStatus = await gate.scanAsset(e.admin, asset("c1/digital-products/clean.pdf", pdf().length))
    const offWrite = e.calls.find((x) => x.op === "update")
    check("scanning off: exactly as before, the header check is the scan", offStatus === "clean" && offWrite?.values?.scan_result?.engine === "heuristic" && S.scans === before)
    check("scanning off: nothing is written to the scan log", !e.calls.some((x) => x.table === "file_scans"))
    const offGate = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", 60 * 1024 * 1024), { isCreator: false })
    check("scanning off: a waiting file is served after its header check, as before", offGate.ok)
    process.env.CLAMAV_SERVICE_URL = base
  }
  console.info = quiet.info
  console.warn = quiet.warn
  server.close()

  console.log("\nEvery way in calls the scan\n")
  {
    const complete = code("app/api/v2/upload/complete/route.ts")
    check("complete: a product file answers at once and the editor asks for the verdict", /isScannerConfigured\(\)\s*\?\s*"pending_scan"/.test(complete))
    check("complete: a link page file is scanned before it answers, and removed if infected", /scanStoredObject\(admin, PUBLIC_BUCKET, path/.test(complete) && /if \(infected\) await admin\.storage\.from\(PUBLIC_BUCKET\)\.remove\(\[path\]\)/.test(complete))
    const serverUpload = code("app/api/v2/upload/server-upload/route.ts")
    check("server upload: the bytes are scanned before they are stored", serverUpload.indexOf("scanBytes(buffer") > 0 && serverUpload.indexOf("scanBytes(buffer") < serverUpload.indexOf(".upload(filePath!"))
    check("server upload: a picture is screened before it is stored", serverUpload.indexOf("screenPublicBytes(admin, picture.bytes") < serverUpload.indexOf("admin.storage.from(PUBLIC_BUCKET).upload(filePath"))
    check("signed URL pictures are screened when they are checked", /screenPublicBytes\(admin, checked\.bytes/.test(code("lib/storage/upload-guard.ts")))
    check("link page uploads through the server are screened", /screenPublicBytes\(adminSupabase, body/.test(code("app/api/onepage/upload-file/route.ts")))
    check("email pictures are screened", /screenPublicBytes\(adminSupabase, picture\.bytes/.test(code("app/api/email/upload-image/route.ts")))
    check("theme packages are screened before they are unpacked", code("app/api/website-builder/themes/import/route.ts").indexOf("screenPublicBytes(admin, buf") < code("app/api/website-builder/themes/import/route.ts").indexOf("JSZip.loadAsync(buf)"))
    check("pictures uploaded straight from a browser are scanned by the hourly sweep, and removed if infected", /screenPublicBytes\(admin, bytes/.test(code("lib/storage/metadata-sweep.ts")) && /summary\.removed\+\+/.test(code("lib/storage/metadata-sweep.ts")))
    const vercel = JSON.parse(read("vercel.json"))
    check("the retry cron is scheduled every ten minutes", vercel.crons.some((c: { path: string; schedule: string }) => c.path === "/api/cron/scan-files" && c.schedule === "*/10 * * * *"))
    check("and is protected by CRON_SECRET", /requireBearerSecret\(request, "CRON_SECRET"\)/.test(code("app/api/cron/scan-files/route.ts")))
    check("the client file is server only; the core it shares with the browser is not", /^import "server-only"/.test(read("lib/security/file-scanner.ts")) && !/server-only|next\/headers/.test(read("lib/security/file-scanner-core.ts")))
    check("antivirus.ts asks the core, never the server only client", /from "@\/lib\/security\/file-scanner-core"/.test(read("lib/storage/antivirus.ts")) && !/from "@\/lib\/security\/file-scanner"/.test(read("lib/storage/antivirus.ts")))
  }

  console.log("\nThe product editor: Scanning, Clean, Blocked\n")
  {
    const rows = code("app/app/products/new/file-uploads.tsx")
    check("a finished upload waiting for its verdict is followed on its row", /result\.scanStatus === "pending_scan"/.test(rows) && /followScan\(done\.file_path, result\.assetId\)/.test(rows) && /fetch\("\/api\/v2\/upload\/scan"/.test(rows))
    check("the row says Scanning, Clean, or Virus check pending", /"Scanning"/.test(rows) && /"Clean"/.test(rows) && /"Virus check pending"/.test(rows))
    check("a blocked file says so in red with the threat's name", /Blocked by the virus scan\{scan\.threat \? `: \$\{scan\.threat\}` : ""\}/.test(rows) && /text-\[#b42318\]/.test(rows))
    check("scan state is kept apart from the form's files, so a verdict is never an unsaved change", /useState<Record<string, FileScan>>/.test(rows))
    check("with scanning off the row says nothing new", /if \(body\.scanning === false\) return null/.test(rows))
    check("the editor loads each saved file's scan status", /scan_status, scan_result"\)\.eq\("product_id", id\)/.test(code("app/app/products/load-editor.ts")))
  }

  console.log("\nThe admin page\n")
  {
    const page = code("app/admin/scanner/page.tsx")
    check("it checks the admin session on the server and is never indexed", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>/.test(page) && /index: false/.test(read("app/admin/scanner/page.tsx")))
    const client = read("app/admin/scanner/scanner-admin.tsx")
    check("its client component imports nothing server only", /^"use client"/.test(client) && !/lib\/security\/file-scanner"|admin-blog-auth|next\/headers|server-only/.test(client))
    check("it says when the scanner URL is not set, with the steps", /is not set, so scanning is off/.test(client) && /Redeploy Storelib/.test(client) && /Scan EICAR/.test(client))
    const route = code("app/api/admin/scanner/route.ts")
    check("its route scans EICAR, an upload, a stored object, and retries waiting files", /mode === "eicar"/.test(route) && /mode === "upload"/.test(route) && /mode === "object"/.test(route) && /mode === "sweep"/.test(route))
  }

  console.log("\nThe service itself (services/file-scanner)\n")
  {
    const dir = "services/file-scanner"
    const compose = read(`${dir}/docker-compose.yml`)
    const clamavBlock = compose.slice(compose.indexOf("  clamav:"), compose.indexOf("  api:"))
    check("clamd's port is never published", !/^\s*ports:/m.test(clamavBlock) && !/3310:/.test(compose))
    check("both services restart unless stopped, with health checks", (compose.match(/restart: unless-stopped/g) ?? []).length === 2 && (compose.match(/healthcheck:/g) ?? []).length === 2)
    check("signatures are updated by freshclam and kept on a volume", /FRESHCLAM_CHECKS/.test(compose) && /clamav-db:\/var\/lib\/clamav/.test(compose))
    check("the API runs as a non-root user", /USER node/.test(read(`${dir}/Dockerfile`)))
    check("the README covers running, deploying, Vercel and EICAR", /CLAMAV_SERVICE_URL/.test(read(`${dir}/README.md`)) && /EICAR/.test(read(`${dir}/README.md`)) && /Vercel/.test(read(`${dir}/README.md`)))
    let suite = ""
    let ok = false
    try {
      suite = execFileSync(process.execPath, ["--test"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 240_000 })
      ok = true
    } catch (e) {
      suite = String((e as { stdout?: string }).stdout ?? e)
    }
    const pass = /# pass (\d+)/.exec(suite)?.[1]
    const fail = /# fail (\d+)/.exec(suite)?.[1]
    check(`its own suite passes against a fake clamd (${pass ?? "?"} passed)`, ok && fail === "0" && Number(pass) >= 30, suite.split("\n").filter((l) => /^not ok|# fail/.test(l)).join("\n"))
    check("the service keeps no temp file and no dependency", !existsSync(`${dir}/node_modules`) && !/"dependencies"/.test(read(`${dir}/package.json`)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
