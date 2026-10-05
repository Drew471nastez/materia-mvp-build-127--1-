"use client"

/**
 * ===========================================================================
 *  WRITING TO THE OWNER (round 13, ask 42)
 * ===========================================================================
 * Mounted by the member's Membership page (worker F2). A subject and a
 * message, sent through Storelib to the owner's inbox
 * (/api/community/<id>/contact): the owner replies by email, to the
 * member's own address. The owner's address is never on this page, unless
 * they chose to show one (Settings, part 101), and then it is a plain
 * mailto with a Copy button (a mailto with no mail app does nothing).
 * Sending is rate limited on the server; the form says so in plain words
 * when it is.
 */
import { useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { api, apiBase } from "@/components/community/member/api"
import { BTN_GHOST, BTN_PRIMARY, CARD, FIELD } from "@/components/community/member/ui"
import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN, CONTACT_SUBJECT_MAX, cleanContactMessage } from "@/lib/communities/membership-policy"

export function ContactOwner({
  communityId,
  ownerName,
  publicEmail = null,
  enabled = true,
}: {
  communityId: string
  ownerName?: string | null
  /** The address the owner chose to show, or null. */
  publicEmail?: string | null
  /** False before part 101, or for the owner themselves: only the address (if any) is shown. */
  enabled?: boolean
}) {
  const who = (ownerName || "").trim() || "the owner"
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!enabled && !publicEmail) return null

  const send = async () => {
    if (busy) return
    const checked = cleanContactMessage({ subject, message })
    if (!checked.ok) return setError(checked.error)
    setBusy(true)
    setError(null)
    const r = await api<{ sent: boolean }>(`${apiBase(communityId)}/contact`, { body: { subject: checked.subject, message: checked.message } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setSent(true)
    setSubject("")
    setMessage("")
  }

  const copy = async () => {
    if (!publicEmail) return
    try {
      await navigator.clipboard.writeText(publicEmail)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* the address is on screen to select by hand */
    }
  }

  const left = CONTACT_MESSAGE_MAX - message.length

  return (
    <section className={`${CARD} p-4 sm:p-5`} aria-labelledby="contact-owner-title" data-contact-owner="">
      <h2 id="contact-owner-title" className="text-[15px] font-semibold text-[#1a1a2e]">
        Contact {who}
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-[#6b7280]">Questions about your membership, a payment or the community. {who === "the owner" ? "They reply" : `${who.split(" ")[0]} replies`} to your email.</p>

      {publicEmail ? (
        <div className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[#eceef1] bg-[#f8f9fa] pl-3.5 pr-1" data-contact-public="">
          <a href={`mailto:${publicEmail}`} className="min-w-0 truncate text-[14px] font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2 hover:decoration-[#1a1a2e]">
            {publicEmail}
          </a>
          <button type="button" className={`${BTN_GHOST} h-10 shrink-0`} onClick={() => void copy()} aria-label="Copy the address">
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}

      {enabled ? (
        sent ? (
          <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-[#eceef1] bg-[#f8f9fa] px-3.5 py-3" data-contact-sent="">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] text-white" aria-hidden>
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[#1a1a2e]">Sent</p>
              <p className="text-[13.5px] text-[#6b7280]">The reply comes to your email.</p>
              <button type="button" className="mt-1 text-[13.5px] font-medium text-[#1a1a2e] underline decoration-[#c9ccd2] underline-offset-2" onClick={() => setSent(false)}>
                Write another
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
            data-contact-form=""
          >
            <label htmlFor="contact-subject" className="block text-[13px] font-medium text-[#4b5563]">
              Subject
            </label>
            <input
              id="contact-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value.slice(0, CONTACT_SUBJECT_MAX))}
              maxLength={CONTACT_SUBJECT_MAX}
              autoComplete="off"
              placeholder="What it is about"
              className={`${FIELD} mt-1.5 h-11 shadow-[0_1px_1px_rgba(16,24,40,0.04)]`}
            />
            <label htmlFor="contact-message" className="mt-3 block text-[13px] font-medium text-[#4b5563]">
              Message
            </label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, CONTACT_MESSAGE_MAX))}
              maxLength={CONTACT_MESSAGE_MAX}
              rows={5}
              placeholder={`Write to ${who}`}
              className={`${FIELD} mt-1.5 block resize-y shadow-[0_1px_1px_rgba(16,24,40,0.04)]`}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className={`text-[12.5px] tabular-nums ${left < 100 ? "text-[#b42318]" : "text-[#9ca3af]"}`} aria-live="polite">
                {message.trim().length > 0 && message.trim().length < CONTACT_MESSAGE_MIN ? "A little more, please" : left < 300 ? `${left} left` : ""}
              </p>
              <button type="submit" className={BTN_PRIMARY} disabled={busy || !subject.trim() || message.trim().length < CONTACT_MESSAGE_MIN} data-contact-send="">
                {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {busy ? "Sending" : "Send"}
              </button>
            </div>
            {error ? (
              <p role="alert" className="mt-2 text-[13.5px] text-[#b42318]">
                {error}
              </p>
            ) : null}
          </form>
        )
      ) : null}
    </section>
  )
}

/** The owner's refund policy on the Membership page: one line, opening to the text. Nothing when there is none. */
export function MembershipRefundPolicy({ text }: { text: string | null | undefined }) {
  if (!text) return null
  return (
    <details className={`${CARD} group/policy`} data-membership-refund-policy="">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14.5px] font-medium text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:px-5 [&::-webkit-details-marker]:hidden">
        Refund policy
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[#6b7280] transition-[rotate] duration-150 group-open/policy:rotate-180 motion-reduce:transition-none">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p className="whitespace-pre-line break-words border-t border-[#eceef1] px-4 py-3 text-[14px] leading-relaxed text-[#4b5563] sm:px-5">{text}</p>
    </details>
  )
}
