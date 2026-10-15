"use client"

/**
 * The member area's two small questions: "are you sure" (delete, remove, ban)
 * and "what is wrong with it" (report). Radix's dialog for focus and Escape,
 * drawn as a white card in the middle on a computer and resting on the bottom
 * edge on a phone, where a thumb is.
 */
import { SCRIM } from "@/components/ui/scrim"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useEffect, useState } from "react"
import { REPORT_REASONS, type ReportReason, type ReportTarget } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "./ui"

export function Modal({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title: string; label?: string; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={`fixed inset-0 z-[80] ${SCRIM} data-[state=open]:animate-in data-[state=open]:fade-in-0`} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          aria-label={label}
          className="fixed inset-x-0 bottom-0 z-[81] mx-auto w-full max-w-[440px] rounded-t-[18px] border border-[#e5e7eb]/70 bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_0_0_1px_rgba(16,24,40,0.04),0_-12px_40px_-10px_rgba(17,24,39,0.28),0_24px_48px_-20px_rgba(17,24,39,0.18)] outline-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:pb-5 sm:shadow-[0_0_0_1px_rgba(16,24,40,0.05),0_24px_64px_-20px_rgba(17,24,39,0.35),0_2px_8px_rgba(17,24,39,0.06)]"
        >
          <DialogPrimitive.Title className="text-[17px] font-semibold text-[#1a1a2e]">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export interface ConfirmState {
  title: string
  detail?: string
  action: string
  /** Asks for a reason (a ban, a removal). */
  reason?: boolean
  danger?: boolean
  run: (reason: string) => Promise<boolean>
}

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState("")
  useEffect(() => {
    if (state) setReason("")
  }, [state])
  return (
    <Modal open={!!state} onClose={() => (!busy ? onClose() : undefined)} title={state?.title ?? ""}>
      {state?.detail ? <p className="mt-1.5 text-[14px] leading-relaxed text-[#6b7280]">{state.detail}</p> : null}
      {state?.reason ? <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="Reason (the member does not see this)" className={`${FIELD} mt-4 resize-none`} /> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={BTN_GHOST} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          data-confirm=""
          className={`${BTN_PRIMARY} ${state?.danger ? "bg-[#c4290c] hover:bg-[#a82309]" : ""}`}
          disabled={busy}
          onClick={async () => {
            if (!state) return
            setBusy(true)
            const ok = await state.run(reason.trim())
            setBusy(false)
            if (ok) onClose()
          }}
        >
          {busy ? "Working..." : state?.action}
        </button>
      </div>
    </Modal>
  )
}

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  abuse: "Abusive or hateful",
  harassment: "Harassment",
  off_topic: "Off topic",
  illegal: "Illegal",
  other: "Something else",
}

export interface ReportTargetRef {
  type: ReportTarget
  id: string
  /** "post", "comment", "message" or the member's name. */
  what: string
}

export function ReportDialog({ communityId, target, onClose }: { communityId: string; target: ReportTargetRef | null; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (target) {
      setReason(null)
      setNote("")
    }
  }, [target])
  const send = async () => {
    if (!target || !reason) return
    setBusy(true)
    const r = await api<{ ok: boolean; already: boolean }>(`${apiBase(communityId)}/reports`, { body: { targetType: target.type, targetId: target.id, reason, note: note.trim() || undefined } })
    setBusy(false)
    if (!r.ok) return toast(r.error)
    toast(r.data.already ? "You already reported this. The moderators have it." : "Report sent to the moderators.")
    onClose()
  }
  return (
    <Modal open={!!target} onClose={() => (!busy ? onClose() : undefined)} title={target ? `Report ${target.what}` : "Report"}>
      <p className="mt-1.5 text-[14px] text-[#6b7280]">Only the community&apos;s moderators see reports.</p>
      <div role="radiogroup" aria-label="Reason" className="mt-4 grid grid-cols-2 gap-2">
        {REPORT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={`min-h-10 rounded-xl border px-3 py-2 text-left text-[14px] font-medium transition-colors ${
              reason === r ? "border-[#1a1a2e] bg-[#f6f7f8] text-[#1a1a2e]" : "border-[#e3e4e8] text-[#4b5563] hover:border-[#c9ccd3]"
            }`}
          >
            {REASON_LABELS[r]}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Anything the moderators should know (optional)" className={`${FIELD} mt-3 resize-none`} />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={BTN_GHOST} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={send} disabled={busy || !reason}>
          {busy ? "Sending..." : "Send report"}
        </button>
      </div>
    </Modal>
  )
}
