"use client"

/**
 * ===========================================================================
 *  REPORTING A POST OR A COMMENT (round 12)
 * ===========================================================================
 * "Report post" and "Report comment" open this: the app's own sheet on a
 * phone (components/ui/bottom-sheet.tsx, sliding up on its curves, pulled
 * down to close), a small dialog in the middle on a computer that fades and
 * settles in and out. The reasons are a calm list of rows, one chosen at a
 * time with a check; a note is optional. Send report is ink once a reason
 * is chosen and shows a spinner while it is sent; the sheet or dialog goes
 * and a toast thanks the member. The report lands in the community's
 * moderation queue (community_reports, through /api/community/<id>/reports,
 * which checks the member, the target and the rate).
 */
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useEffect, useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { REPORT_REASONS, type ReportReason } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import type { ReportTargetRef } from "./dialogs"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, ICON_BTN } from "./ui"

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or scam",
  abuse: "Abusive or hateful",
  harassment: "Harassment or bullying",
  off_topic: "Off topic",
  illegal: "Illegal",
  other: "Something else",
}

export const REPORT_THANKS = "Thanks. The moderators will take a look."
export const REPORT_AGAIN = "You already reported this. The moderators have it."

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

export function ReportSheet({ communityId, target, onClose }: { communityId: string; target: ReportTargetRef | null; onClose: () => void }) {
  const phone = usePhone()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  /* What it reports stays while it closes, so the words do not change as it goes. */
  const [shown, setShown] = useState<ReportTargetRef | null>(target)
  useEffect(() => {
    if (!target) return
    setShown(target)
    setReason(null)
    setNote("")
  }, [target])

  const open = !!target
  const close = () => {
    if (!busy) onClose()
  }
  const send = async () => {
    if (!target || !reason || busy) return
    setBusy(true)
    const r = await api<{ ok: boolean; already: boolean }>(`${apiBase(communityId)}/reports`, { body: { targetType: target.type, targetId: target.id, reason, note: note.trim() || undefined } })
    setBusy(false)
    if (r.ok === false) return toast(r.error)
    onClose()
    toast(r.data.already ? REPORT_AGAIN : REPORT_THANKS)
  }

  const what = shown?.what ?? "post"
  const body = (
    <div data-report-form="" data-report-target={shown?.type ?? ""}>
      <p className="text-[14px] leading-relaxed text-[#6b7280]">Only the community&apos;s moderators see reports. Choose what is wrong with this {what}.</p>
      <div role="radiogroup" aria-label="Reason" className="mt-3 overflow-hidden rounded-xl border border-[#e6e8eb] bg-white shadow-[0_1px_1px_rgba(16,24,40,0.04)]">
        {REPORT_REASONS.map((r, i) => {
          const on = reason === r
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setReason(r)}
              className={`flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-[15px] outline-none transition-colors duration-150 focus-visible:bg-[#f6f7f8] active:bg-[#f1f2f4] active:duration-0 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] sm:min-h-11 sm:text-[14.5px] ${i ? "border-t border-[#f0f1f3]" : ""} ${on ? "bg-[#f8f9fa] font-medium text-[#1a1a2e]" : "text-[#374151] hover:bg-[#fafafb]"}`}
              data-report-reason={r}
            >
              <span className="min-w-0 flex-1">{REPORT_REASON_LABELS[r]}</span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 motion-reduce:transition-none ${on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#cfd2d8] bg-white"}`} aria-hidden>
                {on ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
            </button>
          )
        })}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Anything the moderators should know (optional)"
        aria-label="Note for the moderators"
        className="mt-3 block w-full resize-none rounded-[10px] border border-[#e3e5e9] bg-white px-3.5 py-2.5 text-[16px] text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.05)] sm:text-[14px]"
        data-report-note=""
      />
    </div>
  )
  const sendButton = (wide: boolean) => (
    <button type="button" className={`${BTN_PRIMARY} ${wide ? "h-11 w-full text-[15px]" : ""}`} onClick={() => void send()} disabled={!reason || busy} data-report-send="">
      {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
      {busy ? "Sending" : "Send report"}
    </button>
  )

  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={close} title={`Report ${what}`} aboveKeyboard dismissible={!busy} zIndex={140}>
        <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-1" data-report-sheet="">
          {body}
          <div className="mt-4">{sendButton(true)}</div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[140] bg-[#0f1115]/35 duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          /* The dialog itself takes the focus (no ring drawn on the close button as it opens); Tab goes on from there. */
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
          }}
          className="fixed left-1/2 top-1/2 z-[141] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e6e8eb] bg-white p-5 shadow-[0_24px_60px_-16px_rgba(17,24,39,0.3),0_2px_6px_rgba(17,24,39,0.05)] outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] motion-reduce:animate-none"
          data-report-dialog=""
        >
          <div className="flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="pt-1.5 text-[17px] font-semibold text-[#1a1a2e]">Report {what}</DialogPrimitive.Title>
            <DialogPrimitive.Close className={`${ICON_BTN} -mr-2 -mt-1`} aria-label="Close" disabled={busy}>
              <X className="h-[18px] w-[18px]" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-1">{body}</div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={BTN_GHOST} onClick={close} disabled={busy}>
              Cancel
            </button>
            {sendButton(false)}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
