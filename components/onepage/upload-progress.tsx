"use client"

/**
 * ===========================================================================
 *  AN UPLOAD YOU CAN WATCH, STOP, AND READ THE REASON IT FAILED
 * ===========================================================================
 * useMediaUpload runs lib/onepage/media-upload.ts for one control and keeps
 * what a person needs to see: how far it has got (the real bytes), a Stop
 * that stops it, and when it fails, the sentence why. <UploadProgress> draws
 * that as one quiet line under the control: a thin bar, "34% · 102 MB of
 * 300 MB", Stop; or the reason in red. Nothing pops up and nothing moves the
 * layout: the line keeps its height while it changes.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatBytes } from "@/lib/onepage/media-rules"
import { UploadError, uploadMessage, uploadOnePageMedia, type MediaUploadOptions, type MediaUploadResult } from "@/lib/onepage/media-upload"

export type UploadState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "uploading"; loaded: number; total: number; percent: number }
  | { phase: "error"; message: string }

export function useMediaUpload() {
  const [state, setState] = useState<UploadState>({ phase: "idle" })
  const ctrl = useRef<AbortController | null>(null)
  const alive = useRef(true)
  /*
    AN UPLOAD OUTLIVES THE FIELD THAT STARTED IT (the OnePage production audit,
    B3). It was stopped when its field went: switching the block's Settings
    and Layout tabs, closing the card or opening another block stopped a
    video or a picture half way, saved nothing and said nothing, because the
    message went with the field. Now it carries on and is written when it
    ends, by the block's own id into the page as it is then (the callers'
    onChange, lib/onepage/context updateBlockData); only Stop or a new file
    stops it. Nothing is drawn for a field that is gone.
  */
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Uploads one file. Resolves with the result, or null when it failed or was stopped (the state says which). */
  const upload = useCallback(async (file: File | Blob, o: Omit<MediaUploadOptions, "signal" | "onProgress" | "onStage">): Promise<MediaUploadResult | null> => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    setState({ phase: "preparing" })
    try {
      const result = await uploadOnePageMedia(file, {
        ...o,
        signal: c.signal,
        onStage: (stage) => alive.current && ctrl.current === c && stage === "preparing" && setState({ phase: "preparing" }),
        onProgress: (p) => alive.current && ctrl.current === c && setState({ phase: "uploading", ...p }),
      })
      if (alive.current && ctrl.current === c) setState({ phase: "idle" })
      return result
    } catch (err) {
      if (!alive.current || ctrl.current !== c) return null
      if (err instanceof UploadError && err.code === "cancelled") setState({ phase: "idle" })
      else {
        console.warn("[onepage upload]", err)
        setState({ phase: "error", message: uploadMessage(err) })
      }
      return null
    } finally {
      if (ctrl.current === c) ctrl.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = null
    setState({ phase: "idle" })
  }, [])
  const fail = useCallback((message: string) => setState({ phase: "error", message }), [])
  const clear = useCallback(() => setState({ phase: "idle" }), [])
  const busy = state.phase === "preparing" || state.phase === "uploading"
  return { state, busy, upload, cancel, fail, clear }
}

export function UploadProgress({
  state,
  onCancel,
  className,
  tone = "light",
  finishing = false,
}: {
  state: UploadState
  onCancel?: () => void
  className?: string
  tone?: "light" | "dark"
  /** The bytes are up and the address is being written: a full bar that reads Saving, with no Stop. */
  finishing?: boolean
}) {
  if (state.phase === "idle") return null
  if (state.phase === "error") {
    return (
      <p role="alert" data-upload-error="" className={cn("text-[13px] leading-snug", tone === "dark" ? "text-[#fca5a5]" : "text-[#b42318]", className)}>
        {state.message}
      </p>
    )
  }
  const percent = finishing ? 100 : state.phase === "uploading" ? state.percent : 0
  const label =
    finishing
      ? tt("Saving")
      : state.phase === "preparing"
      ? tt("Getting it ready")
      : state.total > 2 * 1024 * 1024
        ? tt("{percent}% · {done} of {total}", { percent, done: formatBytes(state.loaded), total: formatBytes(state.total) })
        : tt("{percent}%", { percent })
  return (
    <div data-upload-progress={percent} className={cn("flex items-center gap-3", className)} aria-live="polite">
      <div className="min-w-0 flex-1">
        <div className={cn("h-1.5 w-full overflow-hidden rounded-full", tone === "dark" ? "bg-white/20" : "bg-[#eceef1]")}>
          <div
            className={cn(
              "h-full w-full origin-left rounded-full transition-[scale] duration-200 ease-out motion-reduce:transition-none",
              tone === "dark" ? "bg-white" : "bg-[#1a1a2e]",
              /* Before the first byte, and while the address is written: a sliver that breathes, so the line never looks stuck. */
              (state.phase === "preparing" || finishing) && "animate-pulse",
            )}
            style={{ scale: `${state.phase === "preparing" && !finishing ? 0.06 : Math.max(0.02, percent / 100)} 1` }}
          />
        </div>
        <p className={cn("mt-1.5 text-[12.5px] tabular-nums", tone === "dark" ? "text-white/80" : "text-[#6b7280]")}>{label}</p>
      </div>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          data-upload-cancel=""
          className={cn("h-9 shrink-0 cursor-pointer rounded-full px-3.5 text-[13px] font-medium", tone === "dark" ? "bg-white/15 text-white" : "bg-[#f1f2f4] text-[#1a1a2e]")}
        >
          {tt("Stop")}
        </button>
      ) : null}
    </div>
  )
}
