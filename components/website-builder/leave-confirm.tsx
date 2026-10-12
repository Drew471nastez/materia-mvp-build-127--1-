"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { tt } from "@/lib/i18n/text"

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
 * Keep editing (you stay). A code file is saved in the code editor, not from
 * here, so with only a code file at stake there is no Save to offer.
 *
 * ROUND R6 ("smoother, cleaner, Storelib styled, a bottom sheet on phones"):
 * on a computer it is Storelib's white window, which now leaves the way it
 * arrived (a short fade and settle) instead of vanishing; on a phone it is
 * the shared draggable sheet (components/ui/bottom-sheet.tsx) with the three
 * answers as full-width rows a thumb reaches, and a pull down is Keep editing.
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

/** How long the window takes to leave, matched by .wb-leave-*[data-state=closed] in app/globals.css. */
export const LEAVE_EXIT_MS = 160

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])
  return phone
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
  const phone = usePhone()
  /*
    STILL ON SCREEN WHILE IT LEAVES. `shown` follows `open` up at once and
    down LEAVE_EXIT_MS later, so the window plays its exit; what it says is
    the last thing it said, not an empty card.
  */
  const [shown, setShown] = useState(open)
  const [kept, setKept] = useState(reason)
  if (open && !shown) setShown(true)
  if (open && kept !== reason) setKept(reason)
  useEffect(() => {
    if (open) return
    setSaving(false)
    setFailed(false)
    /* Gone when its exit animation ends (onAnimationEnd below); this is only the ceiling, for a tab that does not animate. */
    const t = window.setTimeout(() => setShown(false), LEAVE_EXIT_MS + 240)
    return () => window.clearTimeout(t)
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

  if (!mounted) return null
  const shownReason = open ? reason : kept
  const lines = leaveLines(shownReason)
  const offerSave = !!onSave && canSaveBeforeLeaving(shownReason)
  const title = offerSave ? tt("Save changes before leaving?") : tt("Leave without saving?")

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

  const words = (
    <>
      <ul className="mt-2 space-y-1 text-[14.5px] leading-relaxed text-[#6b7280]">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
        {failed && (
          <li role="alert" className="text-[#b42318]">
            {tt("Could not save. Try again, or discard.")}
          </li>
        )}
      </ul>
    </>
  )
  const saveButton = (wide: boolean) =>
    offerSave ? (
      <button
        type="button"
        onClick={() => void save()}
        autoFocus={!phone}
        data-leave-save=""
        disabled={saving}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] font-semibold text-white transition-colors hover:bg-[#2a2a40] disabled:opacity-70",
          wide ? "h-12 w-full text-[15.5px]" : "h-10 min-w-[84px] px-5 text-[14px]",
        )}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? tt("Saving") : tt("Save")}
      </button>
    ) : null

  /*
    ON A PHONE, THE SHARED SHEET: the answers stacked where a thumb is, Save
    first. A pull down or a tap on the dim is Keep editing; while a save is
    going it cannot be pulled away.
  */
  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={() => { if (!saving) onCancel() }} label={title} hideFrom={null} dismissible={!saving} zIndex={320}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="wb-leave-title" data-leave-dialog="" data-leave-sheet="" className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-2">
          <h2 id="wb-leave-title" className="text-[19px] font-semibold leading-tight text-[#1a1a2e]">
            {title}
          </h2>
          {words}
          <div className="mt-5 flex flex-col gap-2">
            {saveButton(true)}
            <button
              type="button"
              onClick={onLeave}
              disabled={saving}
              data-leave-discard=""
              className="h-12 w-full rounded-xl border border-[#f1d5d1] bg-white text-[15.5px] font-medium text-[#b42318] transition-colors active:bg-[#fef2f2] disabled:opacity-40"
            >
              {tt("Discard changes")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              data-leave-cancel=""
              className="h-12 w-full rounded-xl text-[15.5px] font-medium text-[#374151] transition-colors active:bg-[#f1f2f4] disabled:opacity-40"
            >
              {tt("Keep editing")}
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  if (!shown) return null

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
      data-state={open ? "open" : "closed"}
      onClick={() => {
        if (!saving && open) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="wb-leave-title"
        onClick={(e) => e.stopPropagation()}
        data-leave-dialog=""
        data-state={open ? "open" : "closed"}
        onAnimationEnd={(e) => { if (!open && e.target === e.currentTarget) setShown(false) }}
        className={cn(
          "wb-leave-card w-full max-w-[440px] rounded-2xl bg-white p-6 text-[#1a1a2e]",
          "shadow-[0_32px_80px_-24px_rgba(17,24,39,0.45),0_2px_8px_rgba(17,24,39,0.08)]",
        )}
      >
        <h2 id="wb-leave-title" className="text-[19px] font-semibold leading-tight">
          {title}
        </h2>
        {words}

        {/* Discard on its own at the start, away from Save: the two answers
            that leave sit at opposite ends, and Keep editing is next to Save. */}
        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={onLeave}
            disabled={saving}
            data-leave-discard=""
            className="h-10 rounded-xl px-3.5 text-[14px] font-medium text-[#b42318] transition-colors hover:bg-[#fef2f2] disabled:opacity-40"
          >
            {tt("Discard")}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            autoFocus={!offerSave}
            data-leave-cancel=""
            className="h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f7f7f8] disabled:opacity-40"
          >
            {tt("Keep editing")}
          </button>
          {saveButton(false)}
        </div>
      </div>
    </div>,
    document.body,
  )
}
