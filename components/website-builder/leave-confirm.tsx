"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  BEFORE YOU GO, WHEN THERE IS SOMETHING TO LOSE
 * ===========================================================================
 *
 * `window.confirm` was doing this job, and the browser's own dialog is the
 * one piece of a product nobody can design: it arrives in the OS's font at
 * the top of the screen, says "storelib.com says", and cannot say WHAT is
 * unsaved. Chrome's `beforeunload` dialog is worse still, because its wording
 * is fixed by the browser and reads as a warning about the site rather than
 * about the work.
 *
 * ONLY WHEN THERE IS SOMETHING TO LOSE. A confirmation that appears every
 * time is a confirmation people learn to dismiss without reading, which is
 * exactly when it stops protecting anything. It is shown when the draft is
 * ahead of what is saved, when a code file has unsaved edits, or while a
 * save or a publish is still in flight — and never otherwise.
 *
 * THREE ANSWERS, the way Shopify's editor asks: Save (the draft is written,
 * then you go), Discard (you go, and what was not saved stays unsaved), and
 * Cancel (you stay). A code file is saved in the code editor, not from here,
 * so with only a code file at stake there is no Save to offer.
 */
export interface LeaveReason {
  /** The editor's own draft has changes the server has not taken yet. */
  draft?: boolean
  /** A file open in the code editor has been edited and not saved. */
  code?: boolean
  /** A save or a publish is in flight right now. */
  busy?: boolean
}

export function hasSomethingToLose(reason: LeaveReason): boolean {
  return Boolean(reason.draft || reason.code || reason.busy)
}

/** What is actually at stake, said plainly, in the order it matters. */
export function leaveLines(reason: LeaveReason): string[] {
  const lines: string[] = []
  if (reason.busy) lines.push("A save is still going. Leaving now could lose it.")
  if (reason.code) lines.push("A code file has changes you have not saved. Save it in the code editor to keep them.")
  if (reason.draft) lines.push("Your latest edits have not been saved yet.")
  return lines
}

/** Whether Save can keep what is at stake: the draft, or a save already going. */
export function canSaveBeforeLeaving(reason: LeaveReason): boolean {
  return Boolean(reason.draft || reason.busy)
}

export function LeaveConfirm({
  open,
  reason,
  onCancel,
  onLeave,
  onSave,
}: {
  open: boolean
  reason: LeaveReason
  onCancel: () => void
  /** Leave without saving: Discard. */
  onLeave: () => void
  /** Save the draft, then leave. Resolves false when the save failed, and the dialog stays. */
  onSave?: () => Promise<boolean>
}) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!open) {
      setSaving(false)
      setFailed(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onCancel, saving])

  /** `document` exists only after the first client render. */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!open || !mounted) return null
  const lines = leaveLines(reason)
  const offerSave = !!onSave && canSaveBeforeLeaving(reason)

  const save = async () => {
    if (!onSave || saving) return
    setSaving(true)
    setFailed(false)
    const ok = await onSave().catch(() => false)
    if (!ok) {
      setSaving(false)
      setFailed(true)
    }
  }

  /**
   * INTO THE BODY, NOT INTO THE BUILDER.
   *
   * Two reasons, and both of them have bitten this editor before. A z-index
   * is only compared inside one stacking context, and the sheets render into
   * the body — from inside the editor's tree this could not be put above
   * them whatever number it carried. And `backdrop-filter` samples the
   * nearest backdrop root, which any ancestor with an opacity, a filter or a
   * transform creates: from in there the glass was one bad ancestor away
   * from having nothing to frost at any moment.
   */
  return createPortal(
    <div
      className="wb-leave-scrim fixed inset-0 z-[320] flex items-center justify-center p-4"
      onClick={() => {
        if (!saving) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="wb-leave-title"
        onClick={(e) => e.stopPropagation()}
        data-leave-dialog=""
        className={cn(
          "wb-leave-card w-full max-w-[430px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 text-white",
          "shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)]",
        )}
      >
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
            {reason.busy || saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            )}
          </span>
          <div className="min-w-0">
            <h2 id="wb-leave-title" className="text-[19px] font-semibold leading-tight">
              {offerSave ? "Save changes before leaving?" : "Leave without saving?"}
            </h2>
            <ul className="mt-2.5 space-y-1.5 text-[14.5px] leading-relaxed text-white/70">
              {lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
              {failed && (
                <li role="alert" className="text-red-300">
                  Could not save. Try again, or discard.
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Discard on its own at the start, away from Save: the two answers
            that leave sit at opposite ends, and Cancel is next to Save. */}
        <div className="mt-6 flex items-center gap-2.5 max-[380px]:flex-wrap">
          <button
            type="button"
            onClick={onLeave}
            disabled={saving}
            data-leave-discard=""
            className="h-10 rounded-xl px-4 text-[14px] font-medium text-white/70 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
          >
            Discard
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            autoFocus={!offerSave}
            data-leave-cancel=""
            className="h-10 rounded-xl px-4 text-[14px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
          {offerSave && (
            <button
              type="button"
              onClick={() => void save()}
              autoFocus
              data-leave-save=""
              className="inline-flex h-10 min-w-[84px] items-center justify-center gap-2 rounded-xl bg-white px-5 text-[14px] font-semibold text-[#141414] transition-colors hover:bg-white/90 disabled:opacity-70"
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
