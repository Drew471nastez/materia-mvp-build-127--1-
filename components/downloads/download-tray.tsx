"use client"

import { useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ArrowDownToLine, Check, X } from "lucide-react"
import { fileKindOf, formatFileSize } from "@/lib/receipts/rules"
import { androidDownloads, iosDownloads, shareHeldFile } from "@/lib/downloads/native"
import { openInSystemBrowser } from "@/lib/platform/save-file"
import { patchJob, percentOf, removeJob, useDownloadJobs, type DownloadJob } from "@/lib/downloads/download-store"

/**
 * ===========================================================================
 *  THE TRAY: WHERE A DOWNLOAD IN THE APP SHOWS ITSELF
 * ===========================================================================
 * Only the phone app gets it (lib/downloads/download-file.ts mounts it the
 * first time the app downloads anything). A browser has its own download
 * manager and its own bar, and a second one would only compete with it.
 *
 * One small card per file at the bottom of the screen, above the home
 * indicator and above the phone's buyer tab bar when the page has one
 * (components/nav/buyer-tab-bar.tsx publishes --buyer-tabs-h): the file's type and name, a
 * bar while bytes arrive, and then the one thing left to do. On an iPhone
 * that is Save to Files, which has to be a fresh tap because iOS only opens
 * a share sheet from one. On Android it is Open, for a file already in
 * Downloads.
 *
 * It mounts itself into its own root, so a receipt, a product page or a
 * OnePage need not know it exists.
 */

const CARD =
  "pointer-events-auto rounded-2xl border border-[#e4e7ec] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-10px_rgba(16,24,40,0.28)]"
const PRIMARY =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-3.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[background-color,translate] duration-150 active:translate-y-px active:bg-[#12121f]"
const QUIET =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] px-3 text-[13px] font-semibold text-[#4b5563] transition-colors duration-100 active:bg-[#f3f4f6]"

/** How long a finished card stays before it goes by itself. */
const LINGER_MS = { saved: 8000, handoff: 9000, failed: 12000 } as const

function statusLine(job: DownloadJob): string {
  switch (job.phase) {
    case "preparing":
      return "Getting your file"
    case "downloading": {
      const loaded = formatFileSize(job.loaded) || "0 KB"
      const total = formatFileSize(job.total)
      return total ? `${loaded} of ${total}` : loaded
    }
    case "ready":
      /* The button beside it says what to do; the line says what it is. */
      return formatFileSize(job.total) || "Ready"
    default:
      return job.message || ""
  }
}

function TrayCard({ job }: { job: DownloadJob }) {
  const pct = percentOf(job)
  const moving = job.phase === "preparing" || job.phase === "downloading"
  const kind = fileKindOf(job.fileName)

  /* A finished card goes by itself; a moving one never does. */
  useEffect(() => {
    if (job.phase !== "saved" && job.phase !== "handoff" && job.phase !== "failed") return
    const t = window.setTimeout(() => removeJob(job.key), LINGER_MS[job.phase])
    return () => window.clearTimeout(t)
  }, [job.phase, job.key])

  const close = () => {
    if (moving) job.cancel?.()
    removeJob(job.key)
  }

  const saveToFiles = async () => {
    if (!job.file) return
    const outcome = await shareHeldFile(job.file)
    if (outcome === "shared") patchJob(job.key, { phase: "saved", file: undefined, message: "Saved" })
    else if (outcome === "failed") {
      /* The share sheet would not open: Safari saves it instead, while the address still lives. */
      if (job.url) {
        await openInSystemBrowser(job.url)
        patchJob(job.key, { phase: "handoff", file: undefined, message: "Opened in Safari. Tap Download there, and it lands in Files, in Downloads." })
      } else {
        patchJob(job.key, { phase: "failed", file: undefined, message: "This phone would not open the share sheet. Try again." })
      }
    }
    /* Cancelled: the card stays, so Save to Files can be pressed again. */
  }

  const openSaved = () => {
    if (!job.nativeId) return
    if (job.platform === "android") {
      try {
        androidDownloads()?.openDownload?.(job.nativeId)
      } catch {
        /* the notification still opens it */
      }
    } else {
      try {
        iosDownloads()?.postMessage({ action: "share", id: job.nativeId })
      } catch {
        /* nothing to show it again with */
      }
    }
  }

  const action =
    job.phase === "ready" && job.file ? (
      <button type="button" data-tray-save="" onClick={saveToFiles} className={PRIMARY}>
        <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
        Save to Files
      </button>
    ) : job.phase === "saved" && job.route === "app" && job.nativeId ? (
      <button type="button" data-tray-open="" onClick={openSaved} className={PRIMARY}>
        {job.platform === "android" ? "Open" : "Save again"}
      </button>
    ) : null

  return (
    <div data-download-job={job.phase} className={CARD} role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e9ecf0] bg-[#f7f8fa] text-[9.5px] font-bold tracking-[0.04em] text-[#6b7280]"
        >
          {job.phase === "saved" ? <Check className="h-4 w-4 text-[#067647]" strokeWidth={2.5} /> : kind && kind.length <= 4 ? kind : <ArrowDownToLine className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-5 text-[#1a1a2e]">{job.fileName}</p>
          <p
            data-tray-status=""
            className={`text-[12.5px] leading-4 tabular-nums ${job.phase === "failed" ? "text-[#b42318]" : "text-[#6b7280]"} ${job.phase === "handoff" ? "whitespace-normal" : "truncate"}`}
          >
            {statusLine(job)}
          </p>
        </div>
        {action}
        <button type="button" onClick={close} aria-label={moving ? `Stop downloading ${job.fileName}` : "Close"} className={`${QUIET} w-9 px-0`}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {moving ? (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#eef0f3]" aria-hidden>
          {pct === null ? (
            <div key="waiting" className="h-full w-1/3 animate-pulse rounded-full bg-[#1a1a2e]/40" />
          ) : (
            /* scale, not width: the bar moves on the compositor, not through layout.
               Keyed apart from the waiting stripe: React reused that element for
               the bar, which then eased down from full width to 0% before it grew
               (measured in scripts/check-buyer-library.mjs). */
            <div
              key="bar"
              data-tray-bar=""
              className="h-full w-full origin-left rounded-full bg-[#1a1a2e] transition-[scale] duration-200 ease-out motion-reduce:transition-none"
              style={{ scale: `${pct / 100} 1` }}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}

export function DownloadTray() {
  const jobs = useDownloadJobs()
  if (jobs.length === 0) return null
  return (
    <div
      data-download-tray=""
      className="pointer-events-none fixed inset-x-0 z-[2147483000] flex flex-col items-stretch gap-2 px-4 print:hidden sm:items-end sm:px-6"
      /* 12px clear of the tab bar when it is shown (its height already holds the
         home indicator), else 12px clear of the home indicator itself. */
      style={{ bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 12px), calc(var(--buyer-tabs-h, 0px) + 12px))" }}
    >
      {jobs.slice(-3).map((job) => (
        <div key={job.key} className="w-full sm:w-[380px]">
          <TrayCard job={job} />
        </div>
      ))}
    </div>
  )
}

let root: Root | null = null

/** Puts the tray on the page once. Safe to call on every download. */
export function mountDownloadTray(): void {
  if (root || typeof document === "undefined") return
  const host = document.createElement("div")
  host.setAttribute("data-download-tray-root", "")
  document.body.appendChild(host)
  root = createRoot(host)
  root.render(<DownloadTray />)
}
