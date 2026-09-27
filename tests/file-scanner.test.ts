/**
 * ===========================================================================
 *  THE OPTIONAL MALWARE ENGINE, AND WHAT A FILE'S STATUS DOES
 * ===========================================================================
 * Storelib's built-in checks (lib/security/uploads) decide every upload. The
 * ClamAV scanner (services/file-scanner) is an OPTIONAL provider behind the
 * MalwareProvider interface, switched on only by SECURITY_MALWARE_PROVIDER=
 * clamav plus its URL and secret. Production has the secret and neither of
 * the others, and must make no call and hold nothing waiting.
 *
 *   SETUP       the flag and both variables, or off. Never throws.
 *   ANSWERS     the scanner's JSON read strictly.
 *   CLIENT      against a stand-in scanner over HTTP, with the flag on.
 *   POLICY      lib/storage/scan-gate.ts and lib/security/uploads/pipeline.ts
 *               with a stand-in database: files from before the checks
 *               (status null or pending) are served and checked once, a
 *               refused file never is, no buyer is ever told "still being
 *               checked", the hash is written after an upload, and an engine
 *               that is on removes an infected file in the background.
 *   WIRING      every way a file enters storage calls the central check; the
 *               editor never says Scanning, Clean or Blocked by the virus
 *               scan; no scan cron; /admin/security replaces /admin/scanner.
 *   SERVICE     services/file-scanner's own suite still runs from here.
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
    const span = /bytes=(\d+)-(\d+)/.exec(String(req.headers.range || ""))
    if (span) {
      const part = body.subarray(Number(span[1]), Number(span[2]) + 1)
      res.writeHead(206, { "Content-Length": part.length }).end(Buffer.from(part))
      return
    }
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
    for (const m of ["eq", "in", "or", "lt", "gte", "order", "limit", "not", "neq", "is"]) {
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
  console.log("\nSetup: the flag and both variables, or off\n")
  {
    const FLAG = { SECURITY_MALWARE_PROVIDER: "clamav" }
    const off = readScannerSetup({})
    check("nothing set is off, the flag and both variables named missing", !off.configured && off.missing.length === 3)
    const production = readScannerSetup({ CLAMAV_SERVICE_SECRET: SECRET })
    check("production (the secret alone) is off", !production.configured && (production.missing as string[]).includes("SECURITY_MALWARE_PROVIDER") && (production.missing as string[]).includes("CLAMAV_SERVICE_URL"))
    check("URL and secret without the flag are still off: nothing is called", !isScannerConfigured({ CLAMAV_SERVICE_URL: "https://scanner.example.com", CLAMAV_SERVICE_SECRET: SECRET }))
    const urlOnly = readScannerSetup({ ...FLAG, CLAMAV_SERVICE_URL: "https://scanner.example.com" })
    check("the flag and the URL alone are off, the secret missing", !urlOnly.configured && urlOnly.missing.join() === "CLAMAV_SERVICE_SECRET")
    const plain = readScannerSetup({ ...FLAG, CLAMAV_SERVICE_URL: "http://scanner.example.com", CLAMAV_SERVICE_SECRET: SECRET })
    check("plain http to a real host is refused (the secret would cross the internet in clear)", !plain.configured && (plain as { invalidUrl?: boolean }).invalidUrl === true)
    const junk = readScannerSetup({ ...FLAG, CLAMAV_SERVICE_URL: "not a url", CLAMAV_SERVICE_SECRET: SECRET })
    check("a value that is not a URL is off, and does not throw", !junk.configured)
    const good = readScannerSetup({ ...FLAG, CLAMAV_SERVICE_URL: "https://scanner.example.com/", CLAMAV_SERVICE_SECRET: ` ${SECRET} ` })
    check("with the flag, https with a trailing slash is used without it, the secret trimmed", good.configured && good.config?.url === "https://scanner.example.com" && good.config?.secret === SECRET)
    check("http to localhost is allowed, for Docker on your own machine", isScannerConfigured({ ...FLAG, CLAMAV_SERVICE_URL: "http://localhost:8080", CLAMAV_SERVICE_SECRET: SECRET }))
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

  console.log("\nWith the engine off (production), nothing is sent\n")
  {
    delete process.env.CLAMAV_SERVICE_URL
    delete process.env.SECURITY_MALWARE_PROVIDER
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
    check("health says not configured and names the flag and the URL", !health.configured && health.missing.includes("SECURITY_MALWARE_PROVIDER") && health.missing.includes("CLAMAV_SERVICE_URL"))
    const providers = await import("../lib/security/uploads/providers")
    check("no provider is active", providers.activeProviders().length === 0 && providers.providerStatus().external === null && !providers.providerStatus().misconfigured)
    process.env.CLAMAV_SERVICE_URL = base
    check("even with the URL set as well, no provider is active without the flag", providers.activeProviders().length === 0)
    process.env.SECURITY_MALWARE_PROVIDER = "clamav"
    check("the flag switches ClamAV on", providers.activeProviders().map((p) => p.name).join() === "clamav")
    delete process.env.CLAMAV_SERVICE_URL
    check("the flag without the URL is asked for but off, and said so", providers.activeProviders().length === 0 && providers.providerStatus().misconfigured)
  }

  process.env.SECURITY_MALWARE_PROVIDER = "clamav"
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

  console.log("\nWhat a file's status does (lib/storage/scan-gate.ts, lib/security/uploads/pipeline.ts)\n")
  {
    const gate = await import("../lib/storage/scan-gate")
    const pipeline = await import("../lib/security/uploads/pipeline")
    const pdf = (extra = "") => new TextEncoder().encode("%PDF-1.4\n" + "x".repeat(9000) + extra)
    const asset = (path: string, size: number, status: string | null = "pending_scan") => ({
      id: "11111111-1111-4111-8111-111111111111",
      file_path: path,
      file_name: "guide.pdf",
      mime_type: "application/pdf",
      file_size: size,
      storage_bucket: "digital-products",
      scan_status: status,
      uploaded_by: "u1",
    })
    S.objects.set("c1/digital-products/clean.pdf", pdf())
    S.objects.set("c1/digital-products/bad.pdf", pdf(EICAR))
    S.objects.set("c1/digital-products/legacy-bad.pdf", new TextEncoder().encode(EICAR))

    for (const status of [null, "", "pending_scan", "scanning"]) {
      const a = fakeAdmin(base)
      const before = S.scans
      const served = await gate.gateDownload(a.admin, asset("c1/digital-products/clean.pdf", 60 * 1024 * 1024, status), { isCreator: false })
      const write = a.calls.find((c) => c.table === "digital_assets" && c.op === "update")
      check(`a file with status ${JSON.stringify(status)} is served to a buyer at once, and given its verdict`, served.ok && write?.values?.scan_status === "clean" && write?.values?.scan_result?.engine === "builtin" && S.scans === before, { served, write })
    }
    S.mode = "down"
    const down = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", 1000), { isCreator: false })
    check("with an engine on and down, a waiting file is still served: never 409, never \"still being checked\"", down.ok, down)
    S.mode = "normal"
    const missing = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/not-there.pdf", 1000, null), { isCreator: false })
    check("a file whose start cannot be read is served, not held", missing.ok)
    const lb = fakeAdmin(base)
    const legacyBad = await gate.gateDownload(lb.admin, asset("c1/digital-products/legacy-bad.pdf", 60 * 1024 * 1024, null), { isCreator: false })
    check("an older file its first bytes refuse (as the old header check did) is not served", !legacyBad.ok && (legacyBad as { status: number }).status === 403, legacyBad)
    check("and is marked blocked, but kept in storage for the admin", lb.calls.some((c) => c.op === "update" && c.values?.scan_status === "blocked") && lb.removed.length === 0, lb.removed)
    for (const status of ["blocked", "infected", "quarantined"]) {
      const g = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", 10, status), { isCreator: false })
      check(`a ${status} file is never served, with a plain sentence`, !g.ok && (g as { error: string }).error === "This file isn't available. Contact the seller for help.")
    }
    check("the creator can always fetch their own file", (await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", 10, "blocked"), { isCreator: true })).ok)
    const clean = await gate.gateDownload(fakeAdmin(base).admin, asset("c1/digital-products/clean.pdf", 10, "clean"), { isCreator: false })
    check("a clean file is served without a read", clean.ok)

    const zipWithExe = (await import("../lib/security/uploads/samples")).SAMPLES.find((x) => x.id === "zip_with_program")!.bytes()
    S.objects.set("c1/digital-products/old.zip", zipWithExe)
    const oz = fakeAdmin(base)
    const oldZip = await pipeline.resolveAsset(oz.admin, { ...asset("c1/digital-products/old.zip", zipWithExe.length, null), file_name: "pack.zip", mime_type: "application/zip" })
    check("an older ZIP the newer checks would refuse (setup.exe inside) keeps selling, and is logged for the admin", oldZip === "clean" && oz.calls.some((c) => c.table === "file_security_events" && c.values?.event === "backfill" && c.values?.code === "zip_blocked_entry"), oz.calls.filter((c) => c.op !== "select"))

    delete process.env.SECURITY_MALWARE_PROVIDER
    const h = fakeAdmin(base, { digital_assets: { scan_result: { engine: "builtin" } } })
    const b0 = S.scans
    await pipeline.afterProductUpload(h.admin, asset("c1/digital-products/clean.pdf", pdf().length, "clean"))
    const hashWrite = h.calls.find((c) => c.op === "update" && c.values?.checksum)
    check("after an upload the SHA-256 is streamed from storage into checksum and scan_result", hashWrite?.values?.checksum === createHash("sha256").update(pdf()).digest("hex") && hashWrite?.values?.scan_result?.sha256 === hashWrite?.values?.checksum, hashWrite)
    check("with no engine switched on, the scanner is never called", S.scans === b0)
    process.env.SECURITY_MALWARE_PROVIDER = "clamav"
    const inf = fakeAdmin(base, { digital_assets: { scan_result: { engine: "builtin" } } })
    await pipeline.afterProductUpload(inf.admin, asset("c1/digital-products/bad.pdf", pdf(EICAR).length, "clean"))
    check("with ClamAV switched on, an infected file is found in the background, removed and blocked", inf.removed.includes("digital-products/c1/digital-products/bad.pdf") && inf.calls.some((c) => c.op === "update" && c.values?.scan_status === "blocked"), inf.removed)
    check("and the engine's verdict is in the security log", inf.calls.some((c) => c.table === "file_security_events" && c.values?.event === "provider_scan" && c.values?.outcome === "removed"))
  }
  console.info = quiet.info
  console.warn = quiet.warn
  server.close()

  console.log("\nEvery way in calls the central check\n")
  {
    const complete = code("app/api/v2/upload/complete/route.ts")
    check("complete: a product file is checked from storage and is final at once", /inspectStoredObject\(/.test(complete) && /context: "product_file"/.test(complete) && !/"pending_scan"/.test(complete))
    check("complete: a link page file is checked as one, removed if refused", /context: "link_page_file"/.test(complete) && /remove\(\[path\]\)/.test(complete))
    check("complete: the hash and any engine run after the answer", /runAfterResponse\(async \(\) => \{[\s\S]*afterProductUpload\(admin, asset/.test(complete))
    const serverUpload = code("app/api/v2/upload/server-upload/route.ts")
    check("server upload: the bytes are checked and hashed before they are stored", serverUpload.indexOf("inspectUpload({") > 0 && serverUpload.indexOf("inspectUpload({") < serverUpload.indexOf(".upload(filePath!") && /sha256Of\(bytes\)/.test(serverUpload))
    check("pictures go through preparePublicImage, which asks the central check", /inspectHead\(\{ fileName: "picture"/.test(code("lib/storage/public-image.ts")))
    check("link page uploads through the server use the central check", /context: "link_page_file"/.test(code("app/api/onepage/upload-file/route.ts")))
    check("the link page signed URL route prechecks with the central rule", /validateFile\(fileName, contentType, fileSize, null, isDigital \? "link_page_file" : "public_image"\)/.test(code("app/api/onepage/signed-upload-url/route.ts")))
    check("videos use the central check", /context: "video"/.test(code("app/api/storage/upload-video/route.ts")))
    const themes = code("app/api/website-builder/themes/import/route.ts")
    check("theme packages are checked (ZIP contents included) before they are unpacked", themes.indexOf('context: "theme_package"') > 0 && themes.indexOf('context: "theme_package"') < themes.indexOf("JSZip.loadAsync(buf)") && /packageFileAllowed\(/.test(themes))
    check("pictures uploaded straight from a browser are checked by the hourly sweep", /inspectHead\(/.test(code("lib/storage/metadata-sweep.ts")) && /summary\.removed\+\+/.test(code("lib/storage/metadata-sweep.ts")))
    check("the old names (scanFile, validateFile) answer with the central check", /from "@\/lib\/security\/uploads"/.test(read("lib/storage/security.ts")) && /precheckUpload\(/.test(code("lib/storage/validation.ts")))
    const vercel = JSON.parse(read("vercel.json"))
    check("no ten minute scan cron: the backfill rides the daily storage job", !vercel.crons.some((c: { path: string }) => c.path === "/api/cron/scan-files") && !existsSync("app/api/cron/scan-files/route.ts") && /sweepAssets\(/.test(code("lib/storage/cleanup.ts")))
    check("the client file is server only; the core it shares is not", /^import "server-only"/.test(read("lib/security/file-scanner.ts")) && !/server-only|next\/headers/.test(read("lib/security/file-scanner-core.ts")))
    check("the storage barrel no longer calls a cloud engine by itself", !/CLOUDMERSIVE_API_KEY|VIRUSTOTAL_API_KEY|CLAMAV_REST_URL/.test(code("lib/storage/antivirus.ts")))
  }

  console.log("\nThe product editor says nothing about checks\n")
  {
    const rows = code("app/app/products/new/file-uploads.tsx")
    check("no Scanning, Clean, Virus check pending or Blocked by the virus scan", !/"Scanning"|"Clean"|Virus check pending|Blocked by the virus scan|virus|ClamAV/i.test(rows))
    check("nothing asks /api/v2/upload/scan after an upload", !/\/api\/v2\/upload\/scan/.test(rows))
    check("\"Checking file…\" only once the check takes longer than a blink", /CHECKING_DELAY_MS = 300/.test(rows) && /setTimeout\(\(\) => setChecking\(true\), CHECKING_DELAY_MS\)/.test(rows) && /"Checking file…"/.test(rows))
    check("a refused upload has only a way to remove it, no Retry", /status === "error" && upload\.refused \?/.test(rows))
    check("the editor loads no threat names", !/scan_result/.test(code("app/app/products/load-editor.ts")))
  }

  console.log("\nThe admin page\n")
  {
    const page = code("app/admin/security/page.tsx")
    check("it checks the admin session on the server and is never indexed", /if \(!\(await isAdminAuthenticated\(\)\)\) return <AdminLogin \/>/.test(page) && /index: false/.test(read("app/admin/security/page.tsx")))
    check("/admin/scanner goes to /admin/security", /permanentRedirect\("\/admin\/security"\)/.test(code("app/admin/scanner/page.tsx")))
    const client = read("app/admin/security/security-admin.tsx")
    check("its client component imports nothing server only", /^"use client"/.test(client) && !/lib\/security\/file-scanner"|admin-blog-auth|next\/headers|server-only|uploads\/(audit|stored|pipeline|providers)/.test(client))
    check("no engine reads as normal: grey, not a warning", /return <Status value=\{null\} label="Not enabled, built-in checks only" \/>/.test(client))
    const route = code("app/api/admin/security/route.ts")
    check("its route runs the central check on a sample, an upload and a stored file", /mode === "sample"/.test(route) && /mode === "upload"/.test(route) && /mode === "object"/.test(route) && /requireAdmin\(\)/.test(route))
    check("the console links to it as File security", /\{ href: "\/admin\/security", label: "File security" \}/.test(read("app/admin/_console/shell.tsx")))
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
    check("the README says it is optional and how to switch it on", /CLAMAV_SERVICE_URL/.test(read(`${dir}/README.md`)) && /SECURITY_MALWARE_PROVIDER=clamav/.test(read(`${dir}/README.md`)) && /optional/i.test(read(`${dir}/README.md`)) && /EICAR/.test(read(`${dir}/README.md`)))
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
