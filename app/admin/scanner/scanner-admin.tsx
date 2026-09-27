"use client"

import * as React from "react"

import type { FileScanResult, ScanReason } from "@/lib/security/file-scanner-core"

import { Banner, Button, DataList, Facts, Panel, Placeholder, Status, type Column } from "../_console/ui"

/**
 * ===========================================================================
 *  THE MALWARE SCANNER, FOR THE OWNER TO TEST
 * ===========================================================================
 * One page, top to bottom in the order the owner needs it:
 *
 *   1. Is it on. With CLAMAV_SERVICE_URL missing, the steps to switch it on,
 *      in the order they are done. With it set, the scanner's own health:
 *      ClamAV's version, the signature database and how old it is.
 *   2. Try it. The EICAR test string (should come back Infected), a file
 *      from this computer, or a file already in a storage bucket. The
 *      scanner's answer is shown as a verdict and as the JSON it sent.
 *   3. Product files waiting for a verdict, blocked, or only header checked,
 *      and a button to retry the waiting ones now.
 *   4. The latest scans from the log.
 *
 * Everything goes through /api/admin/scanner, which checks the admin
 * session on the server. Nothing here is stored.
 */

type Setup = {
  configured: boolean
  missing: string[]
  invalidUrl: boolean
  secretSet: boolean
  maxBytes: number
  uploadTestMaxBytes: number
}

type Health = {
  configured: boolean
  host?: string
  reachable?: boolean
  httpStatus?: number
  latencyMs?: number
  error?: string
  health?: {
    status?: string
    engine?: { version?: string; signatures?: number | null; updatedAt?: string | null; ageHours?: number | null } | null
    limits?: { maxFileBytes?: number; scanTimeoutMs?: number }
    scans?: { running?: number; waiting?: number }
    uptimeSec?: number
  } | null
}

type LogRow = {
  id: string
  created_at: string
  source: string
  bucket: string | null
  path: string | null
  status: string
  threat: string | null
  reason: string | null
  bytes: number | null
  duration_ms: number | null
  action: string | null
}

type Overview = {
  setup: Setup
  health: Health
  files: { waiting: number | null; blocked: number | null; headerOnly: number | null }
  recent: LogRow[]
  recentUnavailable: string | null
}

type Outcome =
  | { kind: "scan"; label: string; result: FileScanResult }
  | { kind: "sweep"; summary: Record<string, unknown> }
  | { kind: "failed"; label: string; error: string }

const REASONS: Record<ScanReason, string> = {
  not_configured: "Scanning is not switched on",
  too_large: "Over the scanner's size limit",
  unavailable: "The scanner could not be reached, or was busy",
  timeout: "No answer in time",
  rejected: "The scanner refused the secret or the request",
  engine_error: "ClamAV failed on this file",
  source_error: "The file could not be read from storage",
}

const SOURCES: Record<string, string> = {
  product_file: "Product file",
  public_image: "Picture",
  link_page_file: "Link page file",
  image_sweep: "Picture, hourly check",
  theme_import: "Theme import",
  download_check: "At download",
  admin_test: "Test here",
}

function bytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ""
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))} ${units[i]}`
}

/** 14 ms, 18.4 s, 3 min. */
function took(ms: number | null | undefined): string {
  if (ms == null) return ""
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${Number((ms / 1000).toFixed(1))} s`
  return `${Math.round(ms / 60_000)} min`
}

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""

function ageWords(hours: number | null | undefined): string {
  if (hours == null) return ""
  if (hours < 1) return "under an hour old"
  if (hours < 48) return `${Math.round(hours)} h old`
  return `${Math.round(hours / 24)} days old`
}

/** The dot and word for a verdict: green clean, red infected, amber no verdict. */
function Verdict({ status, threat }: { status: string; threat?: string | null }) {
  if (status === "clean") return <Status value="ok" label="Clean" />
  if (status === "infected") return <Status value="failed" label={threat ? `Infected: ${threat}` : "Infected"} />
  if (status === "error") return <Status value="pending" label="No verdict" />
  return <Status value={null} label="Not scanned" />
}

export function ScannerAdmin() {
  const [data, setData] = React.useState<Overview | null>(null)
  const [note, setNote] = React.useState<{ tone: "good" | "bad" | "plain"; text: string } | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)
  const [bucket, setBucket] = React.useState("digital-products")
  const [path, setPath] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scanner", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) return setNote({ tone: "bad", text: body?.error || "The scanner page could not be read." })
      setData(body as Overview)
    } catch {
      setNote({ tone: "bad", text: "Could not reach Storelib." })
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const run = async (label: string, mode: string, init: RequestInit = {}) => {
    setBusy(mode)
    setOutcome(null)
    try {
      const res = await fetch(`/api/admin/scanner?mode=${mode}`, { method: "POST", cache: "no-store", ...init })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body) setOutcome({ kind: "failed", label, error: body?.error || `Storelib answered ${res.status}.` })
      else if (body.summary) setOutcome({ kind: "sweep", summary: body.summary })
      else setOutcome({ kind: "scan", label, result: body.result as FileScanResult })
    } catch {
      setOutcome({ kind: "failed", label, error: "Could not reach Storelib." })
    } finally {
      setBusy(null)
      void load()
    }
  }

  const scanFile = (file: File | undefined) => {
    if (!file) return
    const max = data?.setup.uploadTestMaxBytes ?? 4 * 1024 * 1024
    if (file.size > max) {
      setOutcome({ kind: "failed", label: file.name, error: `That file is ${bytes(file.size)}. Up to ${bytes(max)} can be sent from here; scan a larger one from storage below.` })
      return
    }
    void run(file.name, "upload", {
      body: file,
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": file.name.replace(/[^\x20-\x7e]/g, "_") },
    })
  }

  const setup = data?.setup
  const health = data?.health
  const h = health?.health
  const on = setup?.configured === true

  const columns: Column<LogRow>[] = [
    { key: "verdict", label: "Verdict", width: "112px", phone: "primary", render: (r) => <Verdict status={r.status} /> },
    { key: "file", label: "File", width: "minmax(0,1.6fr)", render: (r) => <span title={r.path ?? ""}>{r.path ? r.path.split("/").pop() : r.bucket ?? ""}</span> },
    { key: "source", label: "From", width: "minmax(0,1fr)", render: (r) => SOURCES[r.source] ?? r.source },
    {
      key: "detail",
      label: "Detail",
      width: "minmax(0,2fr)",
      render: (r) => {
        const what = r.threat ?? (r.reason ? REASONS[r.reason as ScanReason] ?? r.reason : "")
        const done = r.action === "removed" ? "removed from storage" : r.action === "refused" ? "not saved" : ""
        const text = [what, done].filter(Boolean).join(", ")
        return <span title={text}>{text}</span>
      },
    },
    { key: "size", label: "Size", width: "72px", align: "right", render: (r) => bytes(r.bytes) },
    { key: "time", label: "Took", width: "64px", align: "right", render: (r) => took(r.duration_ms) },
    { key: "when", label: "When", width: "112px", align: "right", phone: "end", render: (r) => when(r.created_at) },
  ]

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif]" data-admin-scanner="">
      <div className="mx-auto w-full max-w-[960px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
          Console
        </a>
        <div className="mb-5 min-w-0">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Malware scanner</h1>
          <p className="mt-0.5 text-[13px] text-[#9b9ba6]">ClamAV checks every uploaded file before a buyer can download it.</p>
        </div>

        {note ? (
          <div className="mb-4">
            <Banner tone={note.tone} onClose={() => setNote(null)}>
              {note.text}
            </Banner>
          </div>
        ) : null}

        {!data ? (
          <Placeholder rows={4} />
        ) : (
          <div className="space-y-3">
            {!on ? (
              <Panel title="Not switched on yet" meta="uploads are not scanned" id="setup">
                <div className="px-4 py-3 text-[13px] leading-5 text-[#c9c9d1]" data-scanner-setup="">
                  <p>
                    {setup?.invalidUrl ? (
                      <>
                        <code className="text-[#ededf0]">CLAMAV_SERVICE_URL</code> is set but is not an https address, so scanning is off.
                      </>
                    ) : (
                      <>
                        <code className="text-[#ededf0]">CLAMAV_SERVICE_URL</code> is not set, so scanning is off.
                      </>
                    )}{" "}
                    Uploads work as before: every file is still checked by its first bytes, so a renamed program is refused.
                  </p>
                  <p className="mt-2 text-[#9b9ba6]">
                    <code className="text-[#c9c9d1]">CLAMAV_SERVICE_SECRET</code> {setup?.secretSet ? "is set." : "is not set yet."}
                  </p>
                  <ol className="mt-3 list-decimal space-y-1.5 pl-5 marker:text-[#6b6b76]">
                    <li>Deploy the scanner from <code className="text-[#ededf0]">services/file-scanner</code>. Its README covers Railway, Render, Fly.io and a VPS. Start it with the same secret as Vercel.</li>
                    <li>Copy its https address, for example <code className="text-[#ededf0]">https://scanner.yourdomain.com</code>, and open <code className="text-[#ededf0]">/health</code> on it to see it answer.</li>
                    <li>
                      In Vercel, Settings, Environment Variables, add <code className="text-[#ededf0]">CLAMAV_SERVICE_URL</code> with that address for Production. Add it and the secret to Preview too if you want scanning on preview deployments.
                    </li>
                    <li>Redeploy Storelib so the new variable is read.</li>
                    <li>Come back here and press Scan EICAR. It should say Infected: Eicar-Test-Signature.</li>
                  </ol>
                </div>
              </Panel>
            ) : (
              <Panel
                title="Scanner"
                meta={health?.host}
                id="health"
                action={
                  health?.reachable ? (
                    <Status
                      value={h?.status === "ok" ? "ok" : h?.status === "degraded" ? "pending" : "failed"}
                      label={h?.status === "ok" ? "Working" : h?.status === "degraded" ? "Working, signatures are old" : "Not scanning"}
                    />
                  ) : (
                    <Status value="failed" label="Unreachable" />
                  )
                }
              >
                {health?.reachable ? (
                  <Facts
                    items={[
                      { label: "ClamAV", value: h?.engine?.version ?? "Unknown" },
                      {
                        label: "Signatures",
                        value: h?.engine?.signatures
                          ? `${h.engine.signatures}, ${when(h.engine.updatedAt)}${h.engine.ageHours != null ? `, ${ageWords(h.engine.ageHours)}` : ""}`
                          : "Unknown",
                      },
                      { label: "Answered in", value: health.latencyMs != null ? `${health.latencyMs} ms` : "" },
                      { label: "Largest file", value: bytes(h?.limits?.maxFileBytes ?? setup?.maxBytes) },
                      { label: "Scanning now", value: `${h?.scans?.running ?? 0}${h?.scans?.waiting ? `, ${h.scans.waiting} waiting` : ""}` },
                    ]}
                  />
                ) : (
                  <p className="px-4 py-3 text-[13px] text-[#c9c9d1]">
                    {health?.error ?? "No answer"} at {health?.host}. Paid files wait as pending and buyers are told they are still being checked; pictures are saved without the scan.
                  </p>
                )}
              </Panel>
            )}

            <Panel title="Try it" meta="nothing is stored" id="test">
              <div className="divide-y divide-white/[0.06]">
                <div className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">EICAR test file</p>
                    <p className="text-[12px] text-[#9b9ba6]">A harmless string every antivirus reports as a virus. Expect Infected.</p>
                  </div>
                  <Button data-scan-eicar="" disabled={busy !== null} onClick={() => void run("EICAR test file", "eicar")}>
                    {busy === "eicar" ? "Scanning…" : "Scan EICAR"}
                  </Button>
                </div>
                <div className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">A file from this computer</p>
                    <p className="text-[12px] text-[#9b9ba6]">Up to {bytes(setup?.uploadTestMaxBytes ?? 4 * 1024 * 1024)}, streamed to the scanner and not kept.</p>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      scanFile(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                  <Button disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                    {busy === "upload" ? "Scanning…" : "Choose file"}
                  </Button>
                </div>
                <form
                  className="px-4 py-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (path.trim()) void run(path.trim().split("/").pop() || path, "object", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bucket, path }) })
                  }}
                >
                  <p className="text-[13px] font-medium">A file in storage</p>
                  <p className="text-[12px] text-[#9b9ba6]">Bucket and path, as in Supabase. Read with a one minute link; the file and its row are not changed.</p>
                  <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
                    <label className="block sm:w-[190px]">
                      <span className="sr-only">Bucket</span>
                      <input
                        value={bucket}
                        onChange={(e) => setBucket(e.target.value)}
                        spellCheck={false}
                        autoCapitalize="off"
                        className="h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[16px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70 sm:text-[14px]"
                      />
                    </label>
                    <label className="block min-w-0 flex-1">
                      <span className="sr-only">Path</span>
                      <input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="creator-id/digital-products/file.zip"
                        spellCheck={false}
                        autoCapitalize="off"
                        className="h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[16px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70 sm:text-[14px]"
                      />
                    </label>
                    <Button type="submit" disabled={busy !== null || !path.trim()} className="h-9">
                      {busy === "object" ? "Scanning…" : "Scan"}
                    </Button>
                  </div>
                </form>
              </div>
              {outcome ? (
                <div className="border-t border-white/[0.08] px-4 py-3" data-scan-outcome="" aria-live="polite">
                  {outcome.kind === "scan" ? (
                    <>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <Verdict status={outcome.result.status} threat={outcome.result.threat} />
                        <span className="min-w-0 truncate text-[12px] text-[#9b9ba6]">
                          {outcome.label}
                          {outcome.result.bytes != null ? `, ${bytes(outcome.result.bytes)}` : ""}, {took(outcome.result.durationMs)}
                          {outcome.result.reason ? `. ${REASONS[outcome.result.reason] ?? outcome.result.reason}` : ""}
                        </span>
                      </div>
                      <pre className="mt-2 max-h-[260px] overflow-auto rounded-[8px] border border-white/[0.06] bg-[#0b0b0f] p-3 text-[12px] leading-[18px] text-[#c9c9d1] [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {JSON.stringify(outcome.result, null, 2)}
                      </pre>
                    </>
                  ) : outcome.kind === "sweep" ? (
                    <pre className="max-h-[260px] overflow-auto rounded-[8px] border border-white/[0.06] bg-[#0b0b0f] p-3 text-[12px] leading-[18px] text-[#c9c9d1] whitespace-pre-wrap">
                      {JSON.stringify(outcome.summary, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-[13px] text-[#f47067]">
                      {outcome.label}: {outcome.error}
                    </p>
                  )}
                </div>
              ) : null}
            </Panel>

            <Panel
              title="Product files"
              id="files"
              action={
                on ? (
                  <Button variant="quiet" disabled={busy !== null || !data.files.waiting} onClick={() => void run("Waiting files", "sweep")}>
                    {busy === "sweep" ? "Scanning…" : "Retry waiting now"}
                  </Button>
                ) : null
              }
            >
              <Facts
                items={[
                  { label: "Waiting for a verdict", value: data.files.waiting ?? "Could not be read" },
                  { label: "Blocked", value: data.files.blocked ?? "Could not be read" },
                  { label: "Checked by header only", value: data.files.headerOnly ?? "Could not be read" },
                ]}
              />
            </Panel>

            <Panel title="Latest scans" meta={data.recentUnavailable ? undefined : `${data.recent.length} shown`} id="recent">
              {data.recentUnavailable ? (
                <p className="px-4 py-6 text-center text-[13px] text-[#6b6b76]">{data.recentUnavailable}</p>
              ) : (
                <DataList label="Latest scans" columns={columns} rows={data.recent} rowKey={(r) => r.id} empty={on ? "No scans yet." : "Scans appear here once the scanner is switched on."} />
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
