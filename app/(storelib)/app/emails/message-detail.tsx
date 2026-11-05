"use client"

/**
 * ===========================================================================
 *  ONE MESSAGE FROM A WEBSITE'S CONTACT FORM
 * ===========================================================================
 * Opened from a row of Messages as its own page over the list, the way a
 * contact or an email opens (./emails-client.tsx moves it in and out with
 * Orders' own motion). What they wrote, in full, first; who they are and
 * where they wrote from beside it; the replies sent from here under it, and a
 * box to write the next one, sent in the store's name with its answers going
 * to the creator's inbox (round 28, app/api/email/messages/[id]/reply); and
 * the rest in More actions, the creator's own mail app among them.
 *
 * `message` is null only while a reloaded /app/emails?message=<id> is still
 * reading the list it comes from.
 */

import * as React from "react"
import { ArrowLeft, ChevronDown, MoreHorizontal } from "lucide-react"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"
import { GUTTER, ORDER_WIDTH, OrderBarFrame, StatusBadge, buttonPrimary, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { messageWhere, replyHref, type MessageRow } from "./emails-home"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

/**
 * THE REPLIES, AND THE NEXT ONE. Each reply sent from here, oldest first,
 * under the message, in one card with the box to write another: what was
 * sent and what is being written read as one conversation. Sending keeps
 * the words in the box until the server says it went; a reply that did not
 * go comes back into the box with the reason.
 */
function Thread({ message, onReply }: { message: MessageRow; onReply?: (message: MessageRow, text: string) => Promise<string | null> }) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const replies = message.replies ?? []
  const send = async () => {
    const words = text.trim()
    if (!words || busy || !onReply) return
    setBusy(true)
    setError(null)
    setText("")
    const failed = await onReply(message, words)
    setBusy(false)
    if (failed) {
      setError(failed)
      setText((t) => t || words)
    }
  }
  return (
    <section className={cn(card, "min-w-0 overflow-hidden")} data-message-thread={message.id}>
      {replies.length ? (
        <ul className="divide-y divide-[#f1f2f4] border-b border-[#f1f2f4]" aria-label={tt("Replies")}>
          {replies.map((r) => (
            <li key={r.id} className="px-4 py-3" data-reply={r.pending ? "pending" : "sent"}>
              <p className="text-[12px] text-[#6b7280]">{r.pending ? tt("Sending") : tt("You replied · {when}", { when: when(r.created_at) })}</p>
              <p className={cn("mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-[#1a1a2e]", r.pending && "text-[#6b7280]")}>{r.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="px-4 pb-4 pt-3.5">
        <label htmlFor={`reply-${message.id}`} className="text-[14px] font-semibold text-[#1a1a2e]">
          {replies.length ? tt("Reply again") : tt("Reply to {who}", { who: message.name || message.email })}
        </label>
        <textarea
          id={`reply-${message.id}`}
          data-reply-box={message.id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
          rows={4}
          maxLength={5000}
          placeholder={tt("Write your reply")}
          className="mt-2 block min-h-[104px] w-full resize-y rounded-lg border border-[#d5d7dd] bg-white px-3 py-2.5 text-[16px] leading-[22px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:text-[14px]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className={cn("min-w-0 text-[12.5px] leading-[18px]", error ? "text-[#b42318]" : "text-[#6b7280]")} aria-live="polite">
            {error ?? tt("Sent from your store to {email}. Their answer comes to your inbox.", { email: message.email })}
          </p>
          <button type="button" className={cn(buttonPrimary, "shrink-0 px-3.5")} disabled={!text.trim() || busy || !onReply} onClick={() => void send()} data-reply-send="">
            {busy ? tt("Sending") : tt("Send")}
          </button>
        </div>
      </div>
    </section>
  )
}

function when(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))}, ${d.toLocaleTimeString(appLocale(), zoned({ hour: "numeric", minute: "2-digit" }))}`
}

export function MessagePage({
  message,
  gone = false,
  onBack,
  onCopy,
  onToggleRead,
  onReply,
  onDelete,
  onOpenContact,
}: {
  message: MessageRow | null
  /** The list is read and this message is not in it: deleted, or not this creator's. */
  gone?: boolean
  onBack: () => void
  onCopy: (email: string) => void
  onToggleRead: (message: MessageRow) => void
  /** Send a reply; the reason when it did not go. */
  onReply?: (message: MessageRow, text: string) => Promise<string | null>
  onDelete: (id: string) => void
  /** Their contact page, when they are one of the creator's contacts. */
  onOpenContact?: (message: MessageRow) => void
}) {
  const back = (
    <button type="button" onClick={onBack} aria-label={tt("Back to messages")} className={cn(iconButton, "h-9 w-9")}>
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
  if (!message) {
    return (
      <>
        <OrderBarFrame back={back} title={<h1 className="text-[20px] font-bold leading-7 text-[#1a1a2e]">{tt("Message")}</h1>} subtitle={null} />
        <div className={cn("orders-body mx-auto pt-4 pb-6", ORDER_WIDTH, GUTTER)}>
          {gone ? (
            <section className={cn(card, "px-4 py-10 text-center")} data-message-gone="">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">{tt("This message is not here")}</p>
              <p className="mt-1 text-[13px] text-[#6b7280]">{tt("It was deleted. The email you got about it is still in your inbox.")}</p>
            </section>
          ) : (
            <WaitingArea className="h-[420px]" />
          )}
        </div>
      </>
    )
  }
  const who = message.name || message.email
  const where = messageWhere(message)
  return (
    <>
      <OrderBarFrame
        back={back}
        title={<h1 className="min-w-0 truncate text-[20px] font-bold leading-7 text-[#1a1a2e]">{message.subject || tt("Message from {who}", { who })}</h1>}
        actions={
          <>
            <button
              type="button"
              className={cn(buttonPrimary, "shrink-0 px-3")}
              data-message-reply=""
              onClick={() => {
                const box = document.querySelector<HTMLTextAreaElement>(`[data-reply-box="${message.id}"]`)
                box?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
                box?.focus({ preventScroll: true })
              }}
            >
              {tt("Reply")}
            </button>
            <ResponsiveActionMenu
              title={who}
              menuWidth="w-56"
              items={[
                { label: message.read_at ? tt("Mark as new") : tt("Mark as read"), onClick: () => onToggleRead(message) },
                { label: tt("Copy email"), onClick: () => onCopy(message.email) },
                { label: tt("Reply in your mail app"), onClick: () => { window.location.href = replyHref(message) } },
                ...(onOpenContact && message.subscriber_id ? [{ label: tt("Open contact"), onClick: () => onOpenContact(message) }] : []),
                { label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => onDelete(message.id) },
              ]}
              trigger={
                <button type="button" className={cn(buttonSecondary, "shrink-0 px-2.5 sm:px-3")} aria-label={tt("More actions")}>
                  <span className="hidden sm:inline">{tt("More actions")}</span>
                  <MoreHorizontal className="h-4 w-4 sm:hidden" />
                  <ChevronDown className="hidden h-4 w-4 sm:block" />
                </button>
              }
            />
          </>
        }
        subtitle={
          <>
            {who}
            {message.created_at ? ` · ${when(message.created_at)}` : null}
          </>
        }
      />
      <div className={cn("orders-body mx-auto pt-4 pb-6", ORDER_WIDTH, GUTTER)}>
        <div data-message-body="" className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <section className={cn(card, "min-w-0 px-4 pb-4 pt-3.5")}>
              <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Message")}</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-[#374151]" data-message-text="">
                {message.message}
              </p>
            </section>
            <Thread message={message} onReply={onReply} />
          </div>
          <section className={cn(card, "min-w-0 px-4 pb-4 pt-3.5")}>
            <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("From")}</h2>
            <dl className="mt-3 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-3 text-[13px]">
              {message.name ? (
                <>
                  <dt className="text-[#6b7280]">{tt("Name")}</dt>
                  <dd className="min-w-0 break-words text-[#1a1a2e]">{message.name}</dd>
                </>
              ) : null}
              <dt className="text-[#6b7280]">{tt("Email")}</dt>
              <dd className="min-w-0 break-words text-[#1a1a2e]">{message.email}</dd>
              {where ? (
                <>
                  <dt className="text-[#6b7280]">{tt("Sent from")}</dt>
                  <dd className="min-w-0 break-words text-[#1a1a2e]">{where}</dd>
                </>
              ) : null}
              <dt className="text-[#6b7280]">{tt("News")}</dt>
              <dd>
                <StatusBadge tone={message.consent ? "success" : "neutral"}>{message.consent ? tt("Asked for news") : tt("Did not ask")}</StatusBadge>
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  )
}
