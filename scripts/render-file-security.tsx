/**
 * The file checks' two faces, with fixtures, for scripts/check-file-security.mjs:
 *
 *   ?view=editor           the product editor's file list with a row in each
 *                          state a creator can see: uploading, checking (a
 *                          check still going after 300 ms), ready, not
 *                          accepted (an upload, and a saved file)
 *   ?view=timing&ms=150    one upload that finishes its check after `ms`: the
 *                          probe samples the row every frame to see whether
 *                          "Checking file…" ever showed
 *   ?view=admin            /admin/security in the normal state: built-in
 *                          checks on, no malware engine, a week of log; the
 *                          probe then runs the EICAR sample
 *   ?view=admin&engine=on  the same with ClamAV switched on
 *
 * `fetch` is replaced: nothing leaves the page.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { SecurityAdmin, type SecurityOverview } from "@/app/admin/security/security-admin"
import { DigitalFiles, type FileUpload, type FileUploads } from "@/app/app/products/new/file-uploads"
import type { UploadedFile } from "@/app/app/products/new/editor-form"

const q = new URLSearchParams(location.search)
const view = q.get("view") || "editor"
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0)
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()
const MB = 1024 * 1024

function fakeUploads(list: FileUpload[]): FileUploads {
  return {
    uploads: list,
    start: () => {},
    cancel: () => {},
    retry: () => {},
    rowKeyOf: (f: UploadedFile) => f.id ?? f.file_path,
    seqOf: (f: UploadedFile) => (f.id === "saved-1" ? 1 : f.id === "saved-2" ? 5 : 9),
    inFlight: list.filter((u) => u.status !== "complete" && u.status !== "aborted"),
  } as unknown as FileUploads
}

const fakeFile = (name: string, size: number) => ({ name, size, type: "application/octet-stream" }) as unknown as File

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fa] px-4 py-6" data-editor-probe="">
      <div className="mx-auto max-w-[640px] rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
        <h2 className="text-[16px] font-semibold text-[#1a1a2e]">Files</h2>
        {children}
      </div>
    </div>
  )
}

function Editor() {
  const files: UploadedFile[] = [
    { id: "saved-1", file_name: "Lightroom presets, volume two.zip", file_path: "c1/digital-products/a.zip", file_size: 412 * MB, scan_status: "clean" },
    { id: "saved-2", file_name: "Old installer.zip", file_path: "c1/digital-products/b.zip", file_size: 3 * MB, scan_status: "blocked" },
  ]
  const uploads: FileUpload[] = [
    { key: "u-2", seq: 2, file: fakeFile("Course video, lesson 04.mp4", 1200 * MB), status: "uploading", progress: 41, sent: 492 * MB, total: 1200 * MB, secondsLeft: 38 },
    { key: "u-3", seq: 3, file: fakeFile("Drum kit.wav", 48 * MB), status: "completing", progress: 100, sent: 48 * MB, total: 48 * MB, secondsLeft: null },
    { key: "u-4", seq: 4, file: fakeFile("Setup.exe", 2 * MB), status: "error", progress: 0, sent: 0, total: 2 * MB, secondsLeft: null, error: "This file type isn't supported.", refused: true },
    { key: "u-6", seq: 6, file: fakeFile("Brushes.zip", 9 * MB), status: "error", progress: 0, sent: 0, total: 9 * MB, secondsLeft: null, error: "We couldn't accept this file. Try another file.", refused: true },
    { key: "u-7", seq: 7, file: fakeFile("Mockups.psd", 220 * MB), status: "error", progress: 30, sent: 66 * MB, total: 220 * MB, secondsLeft: null, error: "Connection lost" },
  ]
  return (
    <Card>
      <DigitalFiles files={files} uploads={fakeUploads(uploads)} max={20} onPick={() => {}} onRename={() => {}} onDelete={() => {}} />
    </Card>
  )
}

/** One upload: uploading, then its check for `ms`, then the file. */
function Timing() {
  const ms = Number(q.get("ms") || "150")
  const [phase, setPhase] = React.useState<"uploading" | "completing" | "done">("uploading")
  React.useEffect(() => {
    const a = setTimeout(() => {
      setPhase("completing")
      ;(window as unknown as { __completingAt: number }).__completingAt = performance.now()
    }, 200)
    const b = setTimeout(() => setPhase("done"), 200 + ms)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [ms])
  const file = fakeFile("Guide.pdf", 2 * MB)
  const upload: FileUpload = { key: "t-1", seq: 1, file, status: phase === "uploading" ? "uploading" : phase === "completing" ? "completing" : "complete", progress: phase === "uploading" ? 80 : 100, sent: phase === "uploading" ? 1.6 * MB : 2 * MB, total: 2 * MB, secondsLeft: 1 }
  const files: UploadedFile[] = phase === "done" ? [{ id: "t-1", file_name: "Guide.pdf", file_path: "c1/digital-products/t.pdf", file_size: 2 * MB }] : []
  const uploads = { ...fakeUploads(phase === "done" ? [] : [upload]), rowKeyOf: () => "t-1", seqOf: () => 1 } as FileUploads
  return (
    <Card>
      <DigitalFiles files={files} uploads={uploads} max={20} onPick={() => {}} onRename={() => {}} onDelete={() => {}} />
    </Card>
  )
}

const engineOn = q.get("engine") === "on"
const overview: SecurityOverview = {
  checks: {
    builtin: [
      "File signature against name and declared type",
      "Programs and launchers refused, disguised ones too",
      "Scripts and web pages behind a document's name",
      "EICAR test file",
      "ZIP contents: bombs, ../ paths, launchers inside",
      "Name cleaned for storage and download",
      "Size limit per kind of upload",
    ],
    provider: { builtin: true, external: engineOn ? "clamav" : null, requested: engineOn ? "clamav" : null, misconfigured: false, unknown: null },
    limits: { product_file: "10 GB", link_page_file: "1 GB", public_image: "25 MB", video: "1.9 GB", theme_package: "50 MB" },
    archive: { entries: 200000, unpacked: "100 GB", ratio: 1100 },
    signedUrlSeconds: 300,
  },
  counts: {
    day: { refused: 3, noted: 7, denied: 2, limited: 1, removed: 0 },
    week: { refused: 19, noted: 41, denied: 9, limited: 4, removed: 1 },
    byCode: [
      { code: "blocked_extension", day: 2, week: 11 },
      { code: "executable_signature", day: 1, week: 4 },
      { code: "zip_blocked_entry", day: 0, week: 2 },
      { code: "zip_traversal", day: 0, week: 1 },
      { code: "malware_test_signature", day: 0, week: 2 },
    ],
  },
  files: { blocked: 3, unchecked: 1284, checked: 2210 },
  downloads: { day: 412, week: 2963 },
  samples: [
    { id: "eicar", label: "The EICAR test file", fileName: "eicar.txt", expect: "refused" },
    { id: "program_named_pdf", label: "A Windows program renamed .pdf", fileName: "invoice.pdf", expect: "refused" },
    { id: "zip_bomb", label: "A zip bomb (claims 50 GB from 1 MB)", fileName: "bomb.zip", expect: "refused" },
    { id: "zip_with_code", label: "A ZIP of source code (.js, .py, .sh)", fileName: "template.zip", expect: "accepted" },
  ],
  log: [
    { id: "1", created_at: iso(3), event: "upload", outcome: "refused", context: "product_file", code: "executable_signature", file_name: "invoice.pdf", path: "c1/digital-products/1-a.pdf", bytes: 88_000, detected_type: "application/x-msdownload", provider: null, detail: { found: "a program (application/x-msdownload) named .pdf" }, ip_hash: null },
    { id: "2", created_at: iso(20), event: "upload", outcome: "noted", context: "product_file", code: "zip_encrypted", file_name: "Private sample pack with a very long name, volume three (final).zip", path: "c2/digital-products/2-b.zip", bytes: 1_900_000_000, detected_type: "application/zip", provider: null, detail: { notes: [{ code: "zip_encrypted" }] }, ip_hash: null },
    { id: "3", created_at: iso(62), event: "download", outcome: "denied", context: null, code: "refunded", file_name: null, path: null, bytes: null, detected_type: null, provider: null, detail: null, ip_hash: "9f1c2e7a4b3d5c6e" },
    { id: "4", created_at: iso(140), event: "rate_limit", outcome: "limited", context: null, code: "upload", file_name: null, path: null, bytes: null, detected_type: null, provider: null, detail: null, ip_hash: null },
    { id: "5", created_at: iso(300), event: "upload", outcome: "refused", context: "product_file", code: "zip_traversal", file_name: "pack.zip", path: null, bytes: 4_000, detected_type: "application/zip", provider: null, detail: { found: 'entry "../../outside.txt" leaves the folder it unpacks into' }, ip_hash: null },
  ],
  logUnavailable: null,
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.startsWith("/api/admin/security")) {
    if (init?.method === "POST") {
      await new Promise((r) => setTimeout(r, 40))
      return json({
        label: "eicar.txt",
        result: {
          verdict: { ok: false, code: "malware_test_signature", userMessage: "We couldn't accept this file. Try another file.", detail: "the EICAR antivirus test file", detectedType: null, safeName: "eicar.txt", notes: [] },
          engines: engineOn ? [{ provider: "clamav", status: "infected", threat: "Eicar-Test-Signature", durationMs: 14 }] : [],
          durationMs: 3,
        },
      })
    }
    return json(overview)
  }
  return json({ error: "not in this probe" }, 404)
}) as typeof fetch

function Admin() {
  React.useEffect(() => {
    const t = setTimeout(() => (document.querySelector("[data-run-sample]") as HTMLButtonElement | null)?.click(), 150)
    return () => clearTimeout(t)
  }, [])
  return <SecurityAdmin initial={overview} />
}

createRoot(document.getElementById("root")!).render(view === "admin" ? <Admin /> : view === "timing" ? <Timing /> : <Editor />)
