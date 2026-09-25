/**
 * ===========================================================================
 *  PAUSE, RESUME AND CANCEL, RUN FOR REAL
 * ===========================================================================
 * lib/storage/chunked-upload.ts driven against a fake network: every request
 * it makes is held until this file answers it, so a pause can land in the
 * middle of a part and a cancel in the middle of completing.
 *
 * Two bugs this pins shut:
 *
 *   1. A paused request used to RESOLVE, so pausing went straight on to
 *      /complete with half a file, and resume started again from 0%. Now a
 *      stopped request is not counted, /complete waits for every byte, and a
 *      resumed TUS upload asks storage how far it got and continues from
 *      there.
 *   2. A cancel pressed while the file was completing still handed it to
 *      onComplete. Now it is reported as cancelled and /cancel removes it.
 *
 * Run with:  npm run test:push
 */
import { DirectUploader, RESUMABLE_PART_BYTES, type UploadError, type UploadResult, type UploadStatus } from "../lib/storage/chunked-upload"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

/* ------------------------------------------------------------------ */
/*  A network that answers only when told to                           */
/* ------------------------------------------------------------------ */

type Listener = (e: any) => void

class FakeXHR {
  static sent: FakeXHR[] = []
  method = ""
  url = ""
  headers: Record<string, string> = {}
  body: unknown = null
  status = 0
  responseText = ""
  aborted = false
  answered = false
  private respHeaders: Record<string, string> = {}
  private listeners: Record<string, Listener[]> = {}
  private uploadListeners: Record<string, Listener[]> = {}
  upload = {
    addEventListener: (type: string, fn: Listener) => {
      ;(this.uploadListeners[type] ??= []).push(fn)
    },
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  addEventListener(type: string, fn: Listener) {
    ;(this.listeners[type] ??= []).push(fn)
  }
  send(body: unknown) {
    this.body = body
    FakeXHR.sent.push(this)
  }
  abort() {
    if (this.answered) return
    this.aborted = true
    this.answered = true
    for (const fn of this.listeners.abort ?? []) fn({})
  }
  getResponseHeader(k: string) {
    return this.respHeaders[k] ?? null
  }
  progress(loaded: number, total: number) {
    for (const fn of this.uploadListeners.progress ?? []) fn({ lengthComputable: true, loaded, total })
  }
  respond(status: number, headers: Record<string, string> = {}, text = "") {
    if (this.answered) return
    this.answered = true
    this.status = status
    this.respHeaders = headers
    this.responseText = text
    for (const fn of this.listeners.load ?? []) fn({})
  }
}
;(globalThis as any).XMLHttpRequest = FakeXHR

const ASSET = "0b7c9a3e-2f41-4c55-9d1e-6a7b8c9d0e1f"
const PATH = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f/digital-products/1700000000000-abc.bin"
const TUS_URL = "https://proj.supabase.co/storage/v1/upload/resumable/upload-1"

interface Call {
  url: string
  method: string
  body: any
  headers: Record<string, string>
}

let calls: Call[] = []
let tusCreateStatus = 201
let serverOffset = 0
let holdComplete: { release: () => void } | null = null
let completeGate: Promise<void> | null = null

function reset() {
  calls = []
  FakeXHR.sent = []
  tusCreateStatus = 201
  serverOffset = 0
  holdComplete = null
  completeGate = null
}

;(globalThis as any).fetch = async (input: string, init: RequestInit = {}) => {
  const url = String(input)
  const method = (init.method ?? "GET").toUpperCase()
  const headers = (init.headers ?? {}) as Record<string, string>
  const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body
  calls.push({ url, method, body, headers })

  if (url === "/api/v2/upload/prepare") {
    return new Response(
      JSON.stringify({ signedUrl: `https://proj.supabase.co/storage/v1/object/upload/sign/digital-products/${PATH}?token=t`, token: "t", path: PATH, bucket: "digital-products", assetId: ASSET }),
      { status: 200 },
    )
  }
  if (url === "/api/v2/upload/complete") {
    if (completeGate) await completeGate
    return new Response(JSON.stringify({ success: true }), { status: 200 })
  }
  if (url === "/api/v2/upload/cancel") return new Response(JSON.stringify({ success: true }), { status: 200 })
  if (url === "https://proj.supabase.co/storage/v1/upload/resumable" && method === "POST") {
    return tusCreateStatus === 201
      ? new Response(null, { status: 201, headers: { Location: TUS_URL } })
      : new Response(null, { status: tusCreateStatus })
  }
  if (url === TUS_URL && method === "HEAD") return new Response(null, { status: 200, headers: { "Upload-Offset": String(serverOffset) } })
  if (url === TUS_URL && method === "DELETE") return new Response(null, { status: 204 })
  return new Response(null, { status: 404 })
}

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"

async function until(cond: () => boolean, what: string, ms = 3000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 2))
  }
}
const settle = () => new Promise((r) => setTimeout(r, 30))

function uploader(size: number) {
  const events = { completed: [] as UploadResult[], errors: [] as UploadError[], statuses: [] as UploadStatus[], sent: [] as number[] }
  const file = new File([new Uint8Array(size)], "pack.bin", { type: "application/octet-stream" })
  const up = new DirectUploader({
    file,
    productId: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a",
    folder: "digital",
    getAccessToken: async () => "user-token",
    onComplete: (r) => events.completed.push(r),
    onError: (e) => events.errors.push(e),
    onStatusChange: (s) => events.statuses.push(s),
    onProgress: (_p, sent) => events.sent.push(sent),
  })
  return { up, events }
}

const puts = () => FakeXHR.sent.filter((x) => x.method === "PUT")
const patches = () => FakeXHR.sent.filter((x) => x.method === "PATCH")
const completes = () => calls.filter((c) => c.url === "/api/v2/upload/complete")
const cancels = () => calls.filter((c) => c.url === "/api/v2/upload/cancel")

async function main() {
  /* ---------------------------------------------------------------- */
  console.log("\nA small file: pause in the middle of the PUT\n")
  reset()
  {
    const { up, events } = uploader(1024 * 1024)
    const run = up.start()
    await until(() => puts().length === 1, "the first PUT")
    puts()[0].progress(400_000, 1024 * 1024)
    up.pause()
    await settle()
    check("the stopped PUT was aborted", puts()[0].aborted)
    check("nothing is completed while paused", completes().length === 0, `${completes().length} complete calls`)
    check("the status is paused", up.getStatus() === "paused", up.getStatus())
    check("and nothing was reported done", events.completed.length === 0)

    const resumed = up.resume()
    check("resume continues the same run", resumed === run)
    await until(() => puts().length === 2, "the PUT again")
    check("the status is uploading again", up.getStatus() === "uploading", up.getStatus())
    puts()[1].respond(200)
    const result = await run
    check("completed exactly once, after the bytes were acknowledged", completes().length === 1)
    check("with the record from prepare", result.assetId === ASSET && completes()[0].body.assetId === ASSET)
    check("one prepare for the whole run", calls.filter((c) => c.url === "/api/v2/upload/prepare").length === 1)
    check("onComplete once", events.completed.length === 1)
    check("status complete", up.getStatus() === "complete")
  }

  /* ---------------------------------------------------------------- */
  console.log("\nA large file by TUS: pause mid part, resume from what storage has\n")
  reset()
  {
    const size = 2 * RESUMABLE_PART_BYTES + 1024 * 1024 // three parts: 6 MB, 6 MB, 1 MB
    const { up, events } = uploader(size)
    const run = up.start()

    await until(() => patches().length === 1, "part 1")
    const p1 = patches()[0]
    check("the TUS upload was made with the person's token and the reserved path", (() => {
      const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/upload/resumable"))
      if (!create) return false
      const meta = create.headers["Upload-Metadata"] ?? ""
      return create.headers.Authorization === "Bearer user-token" && meta.includes(`objectName ${btoa(PATH)}`) && create.headers["Upload-Length"] === String(size)
    })())
    check("part 1 starts at 0", p1.headers["Upload-Offset"] === "0")
    check("parts are 6 MB", (p1.body as Blob).size === RESUMABLE_PART_BYTES)
    serverOffset = RESUMABLE_PART_BYTES
    p1.respond(204, { "Upload-Offset": String(RESUMABLE_PART_BYTES) })

    await until(() => patches().length === 2, "part 2")
    const p2 = patches()[1]
    check("part 2 starts where part 1 was acknowledged", p2.headers["Upload-Offset"] === String(RESUMABLE_PART_BYTES))
    p2.progress(3 * 1024 * 1024, RESUMABLE_PART_BYTES)
    /* The connection drops a megabyte into part 2; storage kept that megabyte. */
    serverOffset = RESUMABLE_PART_BYTES + 1024 * 1024
    up.pause()
    await settle()
    check("the part in flight was stopped", p2.aborted)
    check("nothing is completed while paused", completes().length === 0)
    check("the status is paused", up.getStatus() === "paused")
    check("no third part is sent while paused", patches().length === 2)

    const sentBeforeResume = events.sent.length
    up.resume()
    await until(() => patches().length === 3, "the part after resume")
    const heads = calls.filter((c) => c.method === "HEAD" && c.url === TUS_URL)
    check("after resume it asks storage how far it got", heads.length === 1)
    const p3 = patches()[2]
    check("and continues from storage's offset, not from 0", p3.headers["Upload-Offset"] === String(serverOffset), p3.headers["Upload-Offset"])
    check("only the first part was ever sent from 0", patches().filter((p) => p.headers["Upload-Offset"] === "0").length === 1)
    serverOffset = serverOffset + (p3.body as Blob).size
    p3.respond(204, { "Upload-Offset": String(serverOffset) })

    await until(() => patches().length === 4 || completes().length > 0, "the last part")
    const p4 = patches()[3]
    if (p4) {
      check("the last part ends at the file size", p4.headers["Upload-Offset"] === String(serverOffset) && serverOffset + (p4.body as Blob).size === size)
      serverOffset = size
      p4.respond(204, { "Upload-Offset": String(size) })
    }
    const result = await run
    check("completed exactly once, after the last part", completes().length === 1)
    check("progress never went back to zero after resume", events.sent.slice(sentBeforeResume).every((s) => s >= RESUMABLE_PART_BYTES))
    check("onComplete once", events.completed.length === 1 && result.path === PATH)
    check("no single PUT was needed", puts().length === 0)
  }

  /* ---------------------------------------------------------------- */
  console.log("\nNo TUS here: the whole file by signed URL\n")
  reset()
  {
    tusCreateStatus = 403
    const { up } = uploader(RESUMABLE_PART_BYTES + 10)
    const run = up.start()
    await until(() => puts().length === 1, "the fallback PUT")
    check("a refused TUS upload falls back to one PUT", patches().length === 0)
    puts()[0].respond(200)
    await run
    check("and completes once", completes().length === 1)
  }

  /* ---------------------------------------------------------------- */
  console.log("\nCancel while the file is being completed\n")
  reset()
  {
    let release!: () => void
    completeGate = new Promise<void>((r) => (release = r))
    const { up, events } = uploader(200_000)
    const run = up.start().catch((e: UploadError) => e)
    await until(() => puts().length === 1, "the PUT")
    puts()[0].respond(200)
    await until(() => completes().length === 1, "complete to be asked")
    check("the status is completing", up.getStatus() === "completing")
    up.abort()
    release()
    const outcome = (await run) as UploadError
    await settle()
    check("the run ends as cancelled", outcome.code === "ABORTED", JSON.stringify(outcome))
    check("the file is never handed to onComplete", events.completed.length === 0)
    check("onError says cancelled", events.errors.length === 1 && events.errors[0].code === "ABORTED")
    check("the server is told to remove it", cancels().length === 1 && cancels()[0].body.assetId === ASSET)
    check("the status is aborted", up.getStatus() === "aborted")
  }

  /* ---------------------------------------------------------------- */
  console.log("\nCancel in the middle of a TUS part\n")
  reset()
  {
    const { up, events } = uploader(2 * RESUMABLE_PART_BYTES)
    const run = up.start().catch((e: UploadError) => e)
    await until(() => patches().length === 1, "part 1")
    up.abort()
    const outcome = (await run) as UploadError
    await settle()
    check("the part was stopped", patches()[0].aborted)
    check("cancelled, not failed", outcome.code === "ABORTED" && events.errors[0]?.code === "ABORTED")
    check("never completed", completes().length === 0 && events.completed.length === 0)
    check("the record and the bytes are removed", cancels().length === 1)
    check("and the TUS upload is ended", calls.some((c) => c.method === "DELETE" && c.url === TUS_URL))
  }

  /* ---------------------------------------------------------------- */
  console.log("\nCancel while paused\n")
  reset()
  {
    const { up, events } = uploader(500_000)
    const run = up.start().catch((e: UploadError) => e)
    await until(() => puts().length === 1, "the PUT")
    up.pause()
    await settle()
    up.abort()
    const outcome = (await run) as UploadError
    await settle()
    check("a paused upload can be cancelled", outcome.code === "ABORTED" && up.getStatus() === "aborted")
    check("and is never completed", completes().length === 0 && events.completed.length === 0)
    check("resume after cancel does nothing", await up.resume().then(() => false, (e: UploadError) => e.code === "ABORTED"))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) {
    console.log("Failing:", failures.join(", "))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
