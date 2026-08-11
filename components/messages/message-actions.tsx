"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { Check, CheckCheck, Copy, Flag, Trash2 } from "lucide-react"
import { BottomSheet, SHEET_ROW } from "@/components/ui/bottom-sheet"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * Press and hold a message.
 *
 * On a phone, holding a bubble means "I want to do something with this one" —
 * and what the browser does by default is put a native selection handle and a
 * grey Copy/Look Up callout over it, which is the operating system answering a
 * question the app should be answering. So the callout is suppressed on the
 * bubbles (see `.msg-bubble` in globals.css) and this comes up instead: the
 * actions that make sense for a message, in the app's own voice, including
 * Copy — which is what most of those long presses were reaching for anyway.
 *
 * "Detalii" is here because a conversation about money needs it. When it was
 * sent, and whether it has been seen, are questions people ask when a deal goes
 * quiet, and the one-line receipt under the last message cannot answer them for
 * anything further up.
 *
 * Delete is yours only. There is no version of this that lets you reach into
 * someone else's words.
 */

export type ActionableMessage = {
  id: string
  body: string | null
  /** "voice" behaves as a photograph does here: there is nothing to copy, and
   *  everything else — unsend, report, the timestamp — applies unchanged. */
  kind: "text" | "offer" | "image" | "legacy"
  created_at: string
  read_at: string | null
  mine: boolean
  pending?: boolean
}

function fullStamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Where "Raportare" goes, and why it is a page rather than another sheet.
 *
 * Reporting a whole conversation is a two-tap decision and belongs in the
 * details sheet, where it already is. Reporting ONE MESSAGE is not: the thing
 * being reported has to travel with the report — which message, in which
 * thread, sent by whom — or moderation receives "this person is abusive" about
 * a hundred rows and has to guess which one was meant.
 *
 * That is four identifiers, and four identifiers is a URL. It survives a
 * refresh, it can be opened from an email, and the sheet does not have to hold
 * a form on top of a conversation while somebody types out what happened.
 */
function reportHref(conversationId: string, offenderId: string, messageId: string): string {
  const q = new URLSearchParams({
    ref_id: conversationId,
    ref_type: "msg_thread",
    offender_id: offenderId,
    reported_message_id: messageId,
  })
  return `/user/reports/new?${q.toString()}`
}

export function MessageActions({
  message,
  conversationId,
  offenderId,
  onClose,
  onDelete,
}: {
  message: ActionableMessage | null
  /** The thread this message is in — half of what a report has to carry. */
  conversationId: string
  /** The other party. Null while the thread is still loading, in which case
   *  reporting is simply not offered rather than offered with a hole in it. */
  offenderId?: string | null
  onClose: () => void
  onDelete: (id: string) => Promise<void>
}) {
  const [details, setDetails] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const close = useCallback(() => {
    setDetails(false)
    setConfirming(false)
    onClose()
  }, [onClose])

  const copy = useCallback(async () => {
    if (!message?.body) return
    void triggerHaptic("light")
    try {
      await navigator.clipboard.writeText(message.body)
    } catch {
      // Clipboard is permission-gated and can simply refuse. Failing quietly is
      // right: there is nothing the reader can do about it, and an error toast
      // for a copy that did not happen is worse than the copy not happening.
    }
    close()
  }, [close, message])

  const remove = useCallback(async () => {
    if (!message || busy) return
    setBusy(true)
    void triggerHaptic("light")
    try {
      await onDelete(message.id)
      close()
    } finally {
      setBusy(false)
    }
  }, [busy, close, message, onDelete])

  const open = message !== null
  // A pending message is not on the server yet, so there is nothing to delete
  // and nothing to say about when it was seen.
  const canDelete = !!message?.mine && !message.pending

  return (
    <BottomSheet open={open} onClose={close} label="Acțiuni mesaj">
      {message?.body && (
        <button type="button" onClick={() => void copy()} className={SHEET_ROW}>
          <Copy className="h-[19px] w-[19px] text-neutral-500" />
          <span className="flex-1 text-neutral-900">Copiază textul</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => setDetails((d) => !d)}
        className={cn(SHEET_ROW, details && "bg-neutral-50")}
      >
        <Check className="h-[19px] w-[19px] text-neutral-500" />
        <span className="flex-1 text-neutral-900">Detalii</span>
      </button>

      {details && message && (
        <div className="mx-1 mb-1 rounded-xl bg-neutral-50 px-3 py-3 text-[13.5px] leading-relaxed text-neutral-600">
          <p>
            <span className="text-neutral-400">Trimis:</span> {fullStamp(message.created_at)}
          </p>
          {message.mine && (
            <p className="mt-1 flex items-center gap-1.5">
              <span className="text-neutral-400">Stare:</span>
              {message.pending ? (
                "se trimite…"
              ) : message.read_at ? (
                <span className="flex items-center gap-1 font-medium text-[#7c3aed]">
                  <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Văzut · {fullStamp(message.read_at)}
                </span>
              ) : (
                "trimis, încă nevăzut"
              )}
            </p>
          )}
        </div>
      )}

      {/* Not on your own words. "Report" beside something you wrote yourself is
          a control with no meaning, and on the sheet it sits directly above
          "Șterge mesajul" — two rows apart, both destructive-looking, one of
          them nonsense. A pending message has no server row yet, so there is
          nothing for a moderator to be pointed at. */}
      {message && !message.mine && !message.pending && offenderId && (
        <Link
          href={reportHref(conversationId, offenderId, message.id)}
          onClick={close}
          className={SHEET_ROW}
        >
          <Flag className="h-[19px] w-[19px] text-neutral-500" />
          <span className="flex-1 text-neutral-900">Raportare</span>
        </Link>
      )}

      {canDelete &&
        (confirming ? (
          <div className="mx-1 rounded-xl bg-neutral-50 px-3 py-3">
            <p className="text-[13.5px] leading-snug text-neutral-600">
              Mesajul dispare pentru amândoi. Nu se poate anula.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-full border border-neutral-200 py-2.5 text-[14.5px] font-semibold text-neutral-700 transition-transform active:scale-[0.97]"
              >
                Renunță
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-[14.5px] font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                Șterge
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={SHEET_ROW}>
            <Trash2 className="h-[19px] w-[19px] text-red-500" />
            <span className="flex-1 text-red-600">Șterge mesajul</span>
          </button>
        ))}
    </BottomSheet>
  )
}
