"use client"

/**
 * ===========================================================================
 *  "ARE YOU SURE?" OVER A POST (round 13)
 * ===========================================================================
 * Delete a post, delete a comment, remove one, ban somebody: the question is
 * asked in Storelib's own sheet on a phone (components/ui/bottom-sheet.tsx,
 * the one the report uses) and a small dialog in the middle on a computer
 * that fades and settles in and out, like the report (report-sheet.tsx).
 *
 * ALWAYS ON TOP OF THE POST. A post opened over the feed sits at z 130
 * (post-overlay.tsx); the member area's older Modal sat at z 80, so a
 * "Delete this comment?" asked from an opened post opened UNDER it, and the
 * press seemed to do nothing. This one stands at z 150, above the post, the
 * report (140) and the composer's screen (125).
 *
 * The action button shows a spinner while it runs and the sheet stays (it
 * cannot be pulled away) until the answer comes; a refusal keeps it open.
 */
import { SCRIM } from "@/components/ui/scrim"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import type { ConfirmState } from "./dialogs"
import { BTN_GHOST, BTN_PRIMARY } from "./ui"

export type { ConfirmState } from "./dialogs"

/** Above the opened post (130), the report (140) and the composer (125). */
export const CONFIRM_Z = 150

const DANGER = "bg-[#c4290c] hover:bg-[#a82309] focus-visible:ring-[#c4290c]/30"

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

export function ConfirmSheet({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const phone = usePhone()
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState("")
  /* What it asks stays while it closes, so the words do not change as it goes. */
  const [shown, setShown] = useState<ConfirmState | null>(state)
  useEffect(() => {
    if (!state) return
    setShown(state)
    setReason("")
  }, [state])
  const open = !!state
  const close = () => {
    if (!busy) onClose()
  }
  const run = async () => {
    if (!state || busy) return
    setBusy(true)
    let ok = false
    try {
      ok = await state.run(reason.trim())
    } finally {
      setBusy(false)
    }
    if (ok) onClose()
  }

  const detail = shown?.detail ? <p className="text-[14px] leading-relaxed text-[#6b7280]">{shown.detail}</p> : null
  const why = shown?.reason ? (
    <textarea
      value={reason}
      onChange={(e) => setReason(e.target.value)}
      rows={3}
      maxLength={500}
      placeholder="Reason (the member does not see this)"
      aria-label="Reason"
      className="mt-3 block w-full resize-none rounded-[10px] border border-[#e3e5e9] bg-white px-3.5 py-2.5 text-[16px] text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.05)] sm:text-[14px]"
      data-confirm-reason=""
    />
  ) : null
  const action = (wide: boolean) => (
    <button type="button" className={`${BTN_PRIMARY} ${shown?.danger ? DANGER : ""} ${wide ? "h-11 w-full text-[15px]" : "min-w-[92px]"}`} onClick={() => void run()} disabled={busy} data-confirm="">
      {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : shown?.action}
    </button>
  )

  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={close} title={shown?.title ?? ""} dismissible={!busy} zIndex={CONFIRM_Z} aboveKeyboard>
        <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-0.5" data-confirm-sheet="">
          {detail}
          {why}
          <div className="mt-4 grid gap-2">
            {action(true)}
            <button type="button" className={`${BTN_GHOST} h-11 w-full text-[15px]`} onClick={close} disabled={busy} data-confirm-cancel="">
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={{ zIndex: CONFIRM_Z }}
          className={`fixed inset-0 ${SCRIM} duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none`}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          role="alertdialog"
          style={{ zIndex: CONFIRM_Z + 1 }}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
          }}
          className="fixed left-1/2 top-1/2 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e6e8eb] bg-white p-5 shadow-[0_24px_60px_-16px_rgba(17,24,39,0.3),0_2px_6px_rgba(17,24,39,0.05)] outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] motion-reduce:animate-none"
          data-confirm-dialog=""
        >
          <DialogPrimitive.Title className="text-[17px] font-semibold leading-snug text-[#1a1a2e]">{shown?.title}</DialogPrimitive.Title>
          {detail ? <div className="mt-1.5">{detail}</div> : null}
          {why}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={BTN_GHOST} onClick={close} disabled={busy} data-confirm-cancel="">
              Cancel
            </button>
            {action(false)}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
