"use client"

import { useEffect, useState } from "react"
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
 *
 * ROUND 31, THE OWNER: its arrival, the preparing state, the done state and
 * the close with X should all be smooth and clean, like the app's sheets.
 * Everything that moves here moves on the sheet's curves
 * (components/ui/bottom-sheet.tsx SHEET_EASE and SHEET_CLOSE_EASE), and
 * nothing is ever simply swapped:
 *
 *   ARRIVING   the card rises 16px and fades in over SHEET_OPEN_MS; its
 *              slot opens from no height on the same curve, so a card
 *              already there is lifted, never pushed up in one frame
 *   PREPARING  a short segment travels the track (translate, on the
 *              compositor) until a size is known; then the bar fills by
 *              scale. The line under the name changes words only when the
 *              phase does, and fades in when it does
 *   DONE       the bar's row folds away instead of vanishing (the card
 *              shrinks smoothly by its height), the type mark crossfades to
 *              a tick, and Open or Save to Files fades in
 *   LEAVING    X, the timer, or anything else that ends a job: the card
 *              sinks 10px and fades, and its slot folds to no height, so the
 *              cards above it settle down instead of jumping. It is taken
 *              out of the document only when that has finished
 *              (LEAVE_MS), and it takes no presses while it goes
 *
 * Reduced motion: no travel, no folding, the states simply change.
 */

const CARD =
  "pointer-events-auto rounded-2xl border border-[#e4e7ec] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-10px_rgba(16,24,40,0.28)]"
const PRIMARY =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#0f0f1c] bg-[#1a1a2e] px-3.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[background-color,translate] duration-150 active:translate-y-px active:bg-[#12121f]"
const QUIET =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-[10px] px-3 text-[13px] font-semibold text-[#4b5563] transition-colors duration-100 active:bg-[#f3f4f6]"

/** How long a finished card stays before it goes by itself. */
const LINGER_MS = { saved: 8000, handoff: 9000, failed: 12000 } as const

/** The sheet's own numbers (components/ui/bottom-sheet.tsx), copied so the tray does not load the sheet to read four constants. */
const OPEN_MS = 360
const LEAVE_MS = 340
const EASE = "cubic-bezier(0.32,0.72,0,1)"
const CLOSE_EASE = "cubic-bezier(0.4,0,0.2,1)"

/*
  The tray's motion, in one sheet of its own (the tray is mounted outside the app's React tree, and none of this is a
  colour). Every animated property is opacity, translate or scale, except the slots' and the bar row's height, which is
  grid-template-rows between 0fr and 1fr: one box, a few dozen pixels, for the length of the move.
*/
const MOTION = `
@keyframes sl-tray-card-in{from{opacity:0;translate:0 16px}}
@keyframes sl-tray-slot-in{from{grid-template-rows:0fr}}
@keyframes sl-tray-fade-in{from{opacity:0}}
@keyframes sl-tray-pop-in{from{opacity:0;scale:.92}}
@keyframes sl-tray-seek{from{translate:-100% 0}to{translate:300% 0}}
[data-tray-slot]{display:grid;align-content:end;grid-template-columns:minmax(0,1fr);grid-template-rows:1fr;transition:grid-template-rows ${LEAVE_MS}ms ${CLOSE_EASE};animation:sl-tray-slot-in ${OPEN_MS}ms ${EASE} backwards}
[data-tray-slot]>div{min-height:0;align-self:end}
[data-tray-slot] [data-tray-card]{animation:sl-tray-card-in ${OPEN_MS}ms ${EASE} backwards;transition:opacity 200ms ${CLOSE_EASE},translate ${LEAVE_MS}ms ${CLOSE_EASE}}
[data-tray-slot][data-leaving]{grid-template-rows:0fr;pointer-events:none}
[data-tray-slot][data-leaving] [data-tray-card]{opacity:0;translate:0 10px;pointer-events:none}
[data-tray-fade]{animation:sl-tray-fade-in 180ms ease-out backwards}
[data-tray-pop]{animation:sl-tray-pop-in 220ms ${EASE} backwards}
[data-tray-mark]{transition:opacity 200ms ease-out,scale 260ms ${EASE}}
[data-tray-mark][data-off]{opacity:0;scale:.6}
[data-tray-track-row]{display:grid;grid-template-rows:1fr;transition:grid-template-rows 280ms ${CLOSE_EASE},opacity 200ms ease-out}
[data-tray-track-row][data-off]{grid-template-rows:0fr;opacity:0}
[data-tray-track-row]>div{min-height:0;overflow:hidden}
[data-tray-seek]{animation:sl-tray-seek 1.3s ${CLOSE_EASE} infinite}
@media (prefers-reduced-motion: reduce){
  [data-tray-slot],[data-tray-slot] [data-tray-card],[data-tray-fade],[data-tray-pop],[data-tray-mark],[data-tray-track-row]{animation:none;transition:none}
  [data-tray-seek]{animation:none;translate:100% 0}
}`

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

function TrayCard({ job, leaving }: { job: DownloadJob; leaving: boolean }) {
  const pct = percentOf(job)
  const moving = job.phase === "preparing" || job.phase === "downloading"
  const kind = fileKindOf(job.fileName)
  /* The bar keeps the last number it had while its row folds away, so it never empties on the way out. */
  const [lastPct, setLastPct] = useState<number | null>(pct)
  if (pct !== null && pct !== lastPct) setLastPct(pct)
  const shownPct = moving ? pct : job.phase === "saved" || job.phase === "ready" ? 100 : lastPct

  /* A finished card goes by itself; a moving one never does. */
  useEffect(() => {
    if (leaving) return
    if (job.phase !== "saved" && job.phase !== "handoff" && job.phase !== "failed") return
    const t = window.setTimeout(() => removeJob(job.key), LINGER_MS[job.phase])
    return () => window.clearTimeout(t)
  }, [job.phase, job.key, leaving])

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
      <button type="button" data-tray-save="" data-tray-pop="" onClick={saveToFiles} className={PRIMARY}>
        <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
        Save to Files
      </button>
    ) : job.phase === "saved" && job.route === "app" && job.nativeId ? (
      <button type="button" data-tray-open="" data-tray-pop="" onClick={openSaved} className={PRIMARY}>
        {job.platform === "android" ? "Open" : "Save again"}
      </button>
    ) : null

  const saved = job.phase === "saved"
  /* The words change with the phase, not with every byte: a new phase fades its line in, a byte count only counts. */
  const lineKey = job.phase === "downloading" ? "downloading" : `${job.phase}:${job.message ?? ""}`

  return (
    <div
      data-tray-card=""
      data-download-job={leaving ? undefined : job.phase}
      data-download-leaving={leaving ? "" : undefined}
      className={CARD}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e9ecf0] bg-[#f7f8fa] text-[9.5px] font-bold tracking-[0.04em] text-[#6b7280]"
        >
          <span data-tray-mark="" data-off={saved ? "" : undefined} className="absolute inset-0 flex items-center justify-center">
            {kind && kind.length <= 4 ? kind : <ArrowDownToLine className="h-4 w-4" />}
          </span>
          <span data-tray-mark="" data-tray-tick="" data-off={saved ? undefined : ""} className="absolute inset-0 flex items-center justify-center">
            <Check className="h-4 w-4 text-[#067647]" strokeWidth={2.5} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-5 text-[#1a1a2e]">{job.fileName}</p>
          <p
            key={lineKey}
            data-tray-status=""
            data-tray-fade=""
            className={`text-[12.5px] leading-4 tabular-nums ${job.phase === "failed" ? "text-[#b42318]" : "text-[#6b7280]"} ${job.phase === "handoff" ? "whitespace-normal" : "truncate"}`}
          >
            {statusLine(job)}
          </p>
        </div>
        {action}
        <button
          type="button"
          onClick={close}
          disabled={leaving}
          aria-label={moving ? `Stop downloading ${job.fileName}` : "Close"}
          data-tray-close=""
          className={`${QUIET} w-9 px-0`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {/* The bar's row: there while bytes move, folded away (not taken out) when they stop. */}
      <div data-tray-track-row="" data-off={moving ? undefined : ""} aria-hidden>
        <div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--sl-course-track,#eef0f3)]">
            {shownPct === null ? (
              /* No size yet: a short segment travels the track, on the compositor (and only while something moves). */
              !moving ? null :
              <div key="seek" data-tray-seek="" className="h-full w-1/3 rounded-full bg-[var(--sl-course-ink,#1a1a2e)] opacity-45" />
            ) : (
              /* scale, not width: the bar moves on the compositor, not through layout.
                 Keyed apart from the travelling segment: React reused that element for
                 the bar, which then eased down from full width to 0% before it grew
                 (measured in scripts/check-buyer-library.mjs). */
              <div
                key="bar"
                data-tray-bar=""
                className="h-full w-full origin-left rounded-full bg-[var(--sl-course-ink,#1a1a2e)] transition-[scale] duration-200 ease-out motion-reduce:transition-none"
                style={{ scale: `${shownPct / 100} 1` }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface Shown {
  job: DownloadJob
  leaving: boolean
}

export function DownloadTray() {
  const jobs = useDownloadJobs()
  /*
    A JOB THAT ENDS IS DRAWN UNTIL IT HAS GONE. The store forgets a job the moment it is closed; the tray keeps the job
    as it last was, marked leaving, for LEAVE_MS, so the card can sink and its slot fold. Worked out while rendering
    (React's "state from the previous render"), not in an effect, so there is never a frame without the card.
  */
  const [prev, setPrev] = useState(jobs)
  const [gone, setGone] = useState<ReadonlyArray<DownloadJob>>([])
  if (prev !== jobs) {
    const live = new Set(jobs.map((j) => j.key))
    const left = prev.filter((j) => !live.has(j.key))
    setPrev(jobs)
    setGone((g) => [...g.filter((j) => !live.has(j.key) && !left.some((l) => l.key === j.key)), ...left])
  }

  const goneKeys = gone.map((j) => j.key).join("\n")
  useEffect(() => {
    if (!goneKeys) return
    const keys = goneKeys.split("\n")
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const t = window.setTimeout(() => setGone((g) => g.filter((j) => !keys.includes(j.key))), reduce ? 0 : LEAVE_MS + 40)
    return () => window.clearTimeout(t)
  }, [goneKeys])

  const live = jobs.slice(-3)
  const shown: Shown[] = [...live.map((job) => ({ job, leaving: false })), ...gone.map((job) => ({ job, leaving: true }))].sort(
    (a, b) => a.job.startedAt - b.job.startedAt,
  )
  if (shown.length === 0) return null
  return (
    <>
      <style>{MOTION}</style>
      {/*
        THE SLOT'S ROW SITS ON THE SLOT'S FOOT (round 31, measured). While a slot moves between 0fr and 1fr, Chromium
        sizes the slot to 0.3 of the card but then lays the 0.3fr row out as 0.3 of the slot again: a row of 0.09 of the
        card at the slot's top. A card hung from that row overshot by 14px on its way in. align-content: end puts the
        row at the slot's foot and align-self: end puts the card's foot on it, so the card's foot is the slot's foot on
        every frame (MOTION above). A block, so each slot is as wide as the tray, or 380px at the right from 640px.
      */}
      <div
        data-download-tray=""
        className="pointer-events-none fixed inset-x-0 z-[2147483000] px-4 print:hidden sm:px-6"
        /* 12px clear of the tab bar when it is shown (its height already holds the
           home indicator), else 12px clear of the home indicator itself. */
        style={{ bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 12px), calc(var(--buyer-tabs-h, 0px) + 12px))" }}
      >
        {shown.map(({ job, leaving }) => (
          /*
            The slot is what grows and folds; the card inside sits on the slot's foot and spills upward while the slot
            is shorter than it, so a card never moves for its own slot, only the cards above it do. The 8px between two
            cards is inside the slot, so it folds with it.
          */
          <div key={job.key} data-tray-slot="" data-leaving={leaving ? "" : undefined} className="w-full sm:ml-auto sm:w-[380px]">
            <div>
              <div className="shrink-0 pt-2">
                <TrayCard job={job} leaving={leaving} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
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
