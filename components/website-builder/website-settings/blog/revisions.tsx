"use client"

/**
 * A post's history: every publish, update, schedule, unpublish, Cmd+S and
 * restore, newest first, each one restorable. A restore goes into the draft
 * (the server keeps one more revision for it), so nothing live changes until
 * Publish or Update, and the version restored over is itself in the list.
 */
import * as React from "react"
import { History, Loader2, X } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { formatDateTime } from "@/lib/i18n/format"
import type { AdminPost } from "@/lib/site-blog/types"
import { listRevisions, restoreRevision, type RevisionRow } from "./api"

const kindLabel = (k: RevisionRow["kind"]) =>
  k === "publish" ? tt("Published") : k === "update" ? tt("Updated") : k === "schedule" ? tt("Scheduled") : k === "unpublish" ? tt("Unpublished") : k === "restore" ? tt("Restored") : tt("Saved")

export function RevisionsDialog({
  installId,
  postId,
  beforeRestore,
  onRestored,
  onClose,
}: {
  installId: string
  postId: string
  /** Saves what is on screen first, so the restore can be undone from this list. */
  beforeRestore: () => Promise<boolean>
  onRestored: (post: AdminPost) => void
  onClose: () => void
}) {
  const [rows, setRows] = React.useState<RevisionRow[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  const closeRef = React.useRef(onClose)
  React.useEffect(() => {
    closeRef.current = onClose
  })

  React.useEffect(() => {
    let live = true
    listRevisions(installId, postId)
      .then((r) => live && setRows(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : tt("Something went wrong. Try again.")))
    return () => {
      live = false
    }
  }, [installId, postId])

  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.querySelector<HTMLElement>("button")?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
        return
      }
      const box = panel.current
      if (e.key !== "Tab" || !box) return
      const stops = [...box.querySelectorAll<HTMLElement>("button:not(:disabled)")]
      if (!stops.length) return
      const at = document.activeElement
      if (!box.contains(at) || (e.shiftKey && at === stops[0])) {
        e.preventDefault()
        stops[e.shiftKey ? stops.length - 1 : 0].focus()
      } else if (!e.shiftKey && at === stops[stops.length - 1]) {
        e.preventDefault()
        stops[0].focus()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  async function restore(id: string) {
    setBusy(id)
    setError(null)
    try {
      await beforeRestore()
      const post = await restoreRevision(installId, postId, id)
      onRestored(post)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Something went wrong. Try again."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-end justify-center bg-black/60 px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))] md:items-center md:p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={tt("History")}
        onClick={(e) => e.stopPropagation()}
        className="wb-settings-in flex max-h-[80vh] w-full max-w-[520px] flex-col rounded-2xl border border-white/10 bg-[#1a1a1a] text-white shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-[18px] font-semibold">{tt("History")}</h2>
            <p className="mt-0.5 text-[13px] text-white/50">{tt("Restoring puts a version in your draft. Nothing live changes until you publish.")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tt("Close")} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto">
          {error && (
            <p role="alert" className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13.5px] text-red-300">
              {error}
            </p>
          )}
          {!rows && !error && (
            <p role="status" className="flex items-center gap-2 px-5 py-6 text-[14px] text-white/55">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tt("Loading")}
            </p>
          )}
          {rows && rows.length === 0 && (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <History aria-hidden className="h-5 w-5 text-white/40" />
              <p className="mt-3 text-[14px] text-white/60">{tt("No versions yet. Publishing, updating and Cmd+S each keep one.")}</p>
            </div>
          )}
          {rows && rows.length > 0 && (
            <ul className="divide-y divide-white/[0.07]" data-blog-revisions="">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-white">
                      {kindLabel(r.kind)} <span className="font-normal text-white/50">· {formatDateTime(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                    </span>
                    <span className="block truncate text-[13px] text-white/50">{r.title || tt("Untitled")}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void restore(r.id)}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/[0.13] bg-white/[0.06] px-3.5 text-[14px] font-medium text-white transition-colors hover:bg-white/[0.1] disabled:opacity-50 md:h-9"
                  >
                    {busy === r.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {tt("Restore")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
