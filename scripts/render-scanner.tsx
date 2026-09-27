/**
 * The malware scanner's two faces, with fixture answers, for
 * scripts/check-scanner.mjs:
 *
 *   ?view=admin&state=off   /admin/scanner before CLAMAV_SERVICE_URL is set
 *   ?view=admin&state=on    with the scanner answering, after Scan EICAR
 *   ?view=admin&state=down  set up, but the scanner does not answer
 *   ?view=editor            the product editor's file list with a file in
 *                           each scan state: Scanning, Clean, Blocked,
 *                           Virus check pending, and one with nothing to say
 *
 * `fetch` is replaced: /api/admin/scanner and /api/v2/upload/scan answer as
 * the real routes do, nothing leaves the page.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { ScannerAdmin } from "@/app/admin/scanner/scanner-admin"
import { DigitalFiles, useFileUploads } from "@/app/app/products/new/file-uploads"
import type { UploadedFile } from "@/app/app/products/new/editor-form"

const q = new URLSearchParams(location.search)
const view = q.get("view") || "admin"
const state = q.get("state") || "on"
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0)
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()

const engine = { version: "1.4.6", signatures: 28129, updatedAt: "2026-09-27T06:26:26.000Z" }
const recent = [
  { id: "1", created_at: iso(1), source: "admin_test", bucket: null, path: "eicar-test.txt", status: "infected", threat: "Eicar-Test-Signature", reason: null, bytes: 68, duration_ms: 14, action: "none" },
  { id: "2", created_at: iso(12), source: "product_file", bucket: "digital-products", path: "c1/digital-products/Complete Lightroom Mobile and Desktop preset collection volume two.zip", status: "clean", threat: null, reason: null, bytes: 412_000_000, duration_ms: 18_400, action: "kept" },
  { id: "3", created_at: iso(40), source: "public_image", bucket: "lead-form-files-v2", path: "c1/product-images/cover.webp", status: "clean", threat: null, reason: null, bytes: 184_000, duration_ms: 41, action: "kept" },
  { id: "4", created_at: iso(95), source: "product_file", bucket: "digital-products", path: "c2/digital-products/invoice.pdf", status: "infected", threat: "Pdf.Exploit.CVE_2018_4993-6448587-0", reason: null, bytes: 88_000, duration_ms: 230, action: "removed" },
  { id: "5", created_at: iso(300), source: "product_file", bucket: "digital-products", path: "c3/digital-products/course.mp4", status: "error", threat: null, reason: "unavailable", bytes: null, duration_ms: 12_000, action: "pending" },
]

const overview = {
  setup: {
    configured: state !== "off",
    missing: state === "off" ? ["CLAMAV_SERVICE_URL"] : [],
    invalidUrl: false,
    secretSet: true,
    maxBytes: 1024 * 1024 * 1024,
    uploadTestMaxBytes: 4 * 1024 * 1024,
  },
  health:
    state === "off"
      ? { configured: false, missing: ["CLAMAV_SERVICE_URL"] }
      : state === "down"
        ? { configured: true, missing: [], host: "scanner.storelib.com", reachable: false, latencyMs: 6000, error: "No answer in time" }
        : {
            configured: true,
            missing: [],
            host: "scanner.storelib.com",
            reachable: true,
            httpStatus: 200,
            latencyMs: 84,
            health: {
              status: "ok",
              clamd: { reachable: true, latencyMs: 1 },
              engine: { ...engine, ageHours: 5.6 },
              limits: { maxFileBytes: 1024 * 1024 * 1024, scanTimeoutMs: 120000 },
              scans: { running: 1, waiting: 0 },
              uptimeSec: 86400,
            },
          },
  files: { waiting: state === "down" ? 3 : 0, blocked: 2, headerOnly: 148 },
  recent: state === "off" ? [] : recent,
  recentUnavailable: null,
}

const eicar = {
  result: {
    status: "infected",
    threat: "Eicar-Test-Signature",
    sha256: "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f",
    bytes: 68,
    durationMs: 16,
    engine,
    requestId: "0417d856-e743-436c-b7b5-fdbf06659f5c",
    attempts: 1,
  },
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
const scanAnswers: Record<string, unknown> = {
  "a-clean": { success: true, status: "clean", scanning: true },
  "a-wait": { success: true, status: "pending_scan", scanning: true },
}

window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.startsWith("/api/admin/scanner")) {
    if (init?.method === "POST") {
      await new Promise((r) => setTimeout(r, 60))
      return json(eicar)
    }
    return json(overview)
  }
  if (url.startsWith("/api/v2/upload/scan")) {
    const id = JSON.parse(String(init?.body ?? "{}")).assetId as string
    /* The one still scanning never answers while the probe looks. */
    if (id === "a-scanning") return new Promise<Response>(() => {})
    return json(scanAnswers[id] ?? { success: true, status: "clean", scanning: true })
  }
  return json({ error: "not in this probe" }, 404)
}) as typeof fetch

function Editor() {
  const [files, setFiles] = React.useState<UploadedFile[]>([
    { id: "a-scanning", file_name: "Brush set for Procreate.brushset", file_path: "c1/digital-products/a.brushset", file_size: 48_200_000, scan_status: "pending_scan" },
    { id: "a-clean", file_name: "Guide.pdf", file_path: "c1/digital-products/b.pdf", file_size: 2_400_000, scan_status: "pending_scan" },
    {
      id: "a-blocked",
      file_name: "Complete Lightroom Mobile and Desktop preset collection, volume two.zip",
      file_path: "c1/digital-products/c.zip",
      file_size: 412_000_000,
      scan_status: "quarantined",
      scan_threat: "Win.Trojan.Agent-1234567",
    },
    { id: "a-wait", file_name: "Course video.mp4", file_path: "c1/digital-products/d.mp4", file_size: 900_000_000, scan_status: "pending_scan" },
    { id: "a-done", file_name: "Fonts.zip", file_path: "c1/digital-products/e.zip", file_size: 12_000_000, scan_status: "clean" },
  ])
  const uploads = useFileUploads(setFiles)
  return (
    <div className="min-h-screen bg-[#f8f9fa] px-4 py-6" data-editor-probe="">
      <div className="mx-auto max-w-[640px] rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
        <h2 className="text-[16px] font-semibold text-[#1a1a2e]">Files</h2>
        <DigitalFiles files={files} uploads={uploads} max={20} onPick={() => {}} onRename={() => {}} onDelete={() => {}} />
      </div>
    </div>
  )
}

function App() {
  React.useEffect(() => {
    if (view === "admin" && state === "on") {
      const t = setTimeout(() => (document.querySelector("[data-scan-eicar]") as HTMLButtonElement | null)?.click(), 150)
      return () => clearTimeout(t)
    }
  }, [])
  return view === "editor" ? <Editor /> : <ScannerAdmin />
}

createRoot(document.getElementById("root")!).render(<App />)
