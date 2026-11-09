"use client"

/**
 * ===========================================================================
 *  ONE MESSAGE FROM A WEBSITE'S CONTACT FORM
 * ===========================================================================
 * Opened from the website contact form's inbox in Contacts › Forms
 * (./forms/forms-list.tsx draws it in Contacts' pane). Wave 7, the owner:
 * "the page is fucked": the message sat against the sidebar with no gutter,
 * in no page width, under a header unlike any other, with two ways to reply.
 * Now it is laid out as an order or a person is:
 *
 *   the bar        an order's bar (OrderBarFrame, sticky): the one back
 *                  arrow (up to the inbox), who wrote, whether it is new or
 *                  answered, one ⋯; the subject and when, under the name
 *   the thread     one card: what they wrote, each reply sent from here,
 *                  and at its foot the box for the next one, the only way to
 *                  reply on the page (round 28, app/api/email/messages/[id]/
 *                  reply: sent in the store's name, answers to the creator's
 *                  inbox; the words stay in the box until the server says it
 *                  went)
 *   the sender     beside it (under it on a phone): who they are, linked to
 *                  their contact profile (/app/contacts/open?from=message,
 *                  which checks the store owns the message), where they wrote
 *                  from, and whether they asked for news
 *
 * `message` is null only while a reloaded address is still reading the inbox.
 */

import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Copy, MoreHorizontal } from "lucide-react"
import { ResponsiveActionMenu } from "@/components/ui/responsive-action-menu"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"
import { GUTTER, ORDER_WIDTH, OrderBarFrame, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { replyHref, type MessageRow } from "./emails-home"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

function when(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  /* Wave 8: the year only when it is not this one, as the inbox and the lists say it. */
  return `${d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }))}, ${d.toLocaleTimeString(appLocale(), zoned({ hour: "numeric", minute: "2-digit" }))}`
}

/** Where they wrote from: the site, and the page when it was not the home page. */
export function sentFrom(m: Pick<MessageRow, "site" | "page">): string {
  const page = (m.page ?? "").replace(/^\/+|\/+$/g, "")
  const shown = page && page !== "home" ? `/${page}` : ""
  return m.site ? (shown ? `${m.site} · ${shown}` : m.site) : shown
}

/** Two letters for the avatar: the name's initials, or the email's first letter. */
export function initialsOf(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return email.slice(0, 1).toUpperCase()
}

function Avatar({ text, dark = false }: { text: string; dark?: boolean }) {
  return (
    <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold", dark ? "bg-[#1a1a2e] text-white" : "bg-[#eef0f3] text-[#4b5563]")}>
      {text}
    </span>
  )
}

/**
 * THE CONVERSATION. What they wrote, each reply sent from here, oldest
 * first, and the box for the next one at the foot: one card that reads as
 * one conversation, and the only reply on the page.
 */
function Thread({ message, onReply }: { message: MessageRow; onReply?: (message: MessageRow, text: string) => Promise<string | null> }) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const replies = message.replies ?? []
  const who = message.name || (displayEmail(message.email) ?? "")
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
    <section className={cn(card, "min-w-0 overflow-hidden")} aria-label={tt("Conversation")} data-message-thread={message.id}>
      <article className="px-4 pb-5 pt-4 sm:px-5" data-message-original="">
        <header className="flex items-center gap-3">
          <Avatar text={initialsOf(message.name, (displayEmail(message.email) ?? ""))} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{who}</p>
            <p className="truncate text-[12.5px] text-[#6b7280]">{message.name ? (displayEmail(message.email) ?? "") : tt("Website contact form")}</p>
          </div>
          <time className="shrink-0 text-[12.5px] text-[#9ca3af] max-sm:hidden" dateTime={message.created_at}>
            {when(message.created_at)}
          </time>
        </header>
        {message.subject ? <h2 className="mt-4 break-words text-[15px] font-semibold leading-6 text-[#1a1a2e]">{message.subject}</h2> : null}
        <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-[26px] text-[#303036] sm:text-[14px] sm:leading-6", message.subject ? "mt-1.5" : "mt-4")} data-message-text="">
          {message.message}
        </p>
      </article>

      {replies.length ? (
        <ul className="border-t border-[#f1f2f4]" aria-label={tt("Replies")}>
          {replies.map((r) => (
            <li key={r.id} className="border-b border-[#f1f2f4] bg-[#fafbfb] px-4 py-4 last:border-b-0 sm:px-5" data-reply={r.pending ? "pending" : "sent"}>
              <div className="flex items-center gap-3">
                <Avatar text={tt("You").slice(0, 1).toUpperCase()} dark />
                <p className="min-w-0 flex-1 truncate text-[13px] text-[#6b7280]">
                  <span className="font-semibold text-[#1a1a2e]">{tt("You")}</span>
                  {" · "}
                  {r.pending ? tt("Sending") : when(r.created_at)}
                </p>
              </div>
              <p className={cn("mt-2 whitespace-pre-wrap break-words pl-12 text-[15px] leading-[26px] text-[#1a1a2e] sm:text-[14px] sm:leading-6", r.pending && "text-[#6b7280]")}>{r.message}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t border-[#eef0f2] px-4 pb-4 pt-3.5 sm:px-5" data-message-reply="">
        <label htmlFor={`reply-${message.id}`} className="text-[13px] font-semibold text-[#1a1a2e]">
          {replies.length ? tt("Reply again") : tt("Reply to {who}", { who })}
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
          className="mt-2 block min-h-[112px] w-full resize-y rounded-xl border border-[#e3e4e8] bg-white px-3.5 py-3 text-[16px] leading-[22px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:text-[14px]"
        />
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className={cn("min-w-0 flex-1 basis-[220px] text-[12.5px] leading-[18px]", error ? "text-[#b42318]" : "text-[#6b7280]")} aria-live="polite">
            {error ?? tt("Sent from your store to {email}. Their answer comes to your inbox.", { email: (displayEmail(message.email) ?? "") })}
          </p>
          <button type="button" className={cn(buttonAccent, "shrink-0 px-4 max-md:h-11 max-md:w-full max-md:rounded-xl max-md:text-[15px]")} disabled={!text.trim() || busy || !onReply} onClick={() => void send()} data-reply-send="">
            {busy ? tt("Sending") : tt("Send reply")}
          </button>
        </div>
      </div>
    </section>
  )
}

function Sender({ message, contactHref, onCopy }: { message: MessageRow; contactHref?: string | null; onCopy: (email: string) => void }) {
  const where = sentFrom(message)
  const row = "grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-[13px]"
  return (
    <section className={cn(card, "min-w-0 px-4 py-4")} aria-label={tt("From")} data-message-sender="">
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("From")}</h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar text={initialsOf(message.name, (displayEmail(message.email) ?? ""))} />
        <div className="min-w-0 flex-1">
          {contactHref ? (
            <Link href={contactHref} className="block truncate text-[14px] font-semibold text-[#1a1a2e] hover:underline" data-message-contact="">
              {message.name || (displayEmail(message.email) ?? "")}
            </Link>
          ) : (
            <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{message.name || (displayEmail(message.email) ?? "")}</p>
          )}
          <p className="flex min-w-0 items-center gap-1 text-[13px] text-[#6b7280]">
            <span className="truncate">{(displayEmail(message.email) ?? "")}</span>
            <button type="button" className={cn(iconButton, "h-7 w-7 shrink-0 max-md:h-9 max-md:w-9")} aria-label={tt("Copy email")} title={tt("Copy email")} onClick={() => onCopy((displayEmail(message.email) ?? ""))}>
              <Copy className="h-3.5 w-3.5" />
            </button>
          </p>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 border-t border-[#f1f2f4] pt-3">
        {where ? (
          <div className={row}>
            <dt className="text-[#6b7280]">{tt("Sent from")}</dt>
            <dd className="min-w-0 break-words text-[#1a1a2e]">{where}</dd>
          </div>
        ) : null}
        <div className={row}>
          <dt className="text-[#6b7280]">{tt("Received")}</dt>
          <dd className="min-w-0 text-[#1a1a2e]">{when(message.created_at)}</dd>
        </div>
        <div className={row}>
          <dt className="text-[#6b7280]">{tt("Email list")}</dt>
          <dd className="min-w-0 text-[#1a1a2e]">{message.consent ? tt("Asked for news") : tt("Did not ask for news")}</dd>
        </div>
      </dl>
      {contactHref ? (
        <Link href={contactHref} className={cn(buttonSecondary, "mt-4 w-full max-md:h-11 max-md:rounded-xl max-md:text-[15px]")} data-view-contact="">
          {tt("View contact")}
        </Link>
      ) : null}
    </section>
  )
}

export function MessagePage({
  message,
  gone = false,
  onBack,
  onCopy,
  onToggleRead,
  onReply,
  onDelete,
  contactHref,
}: {
  message: MessageRow | null
  /** The list is read and this message is not in it: deleted, or not this creator's. */
  gone?: boolean
  /** Up to the website contact form's inbox. */
  onBack: () => void
  onCopy: (email: string) => void
  onToggleRead: (message: MessageRow) => void
  /** Send a reply; the reason when it did not go. */
  onReply?: (message: MessageRow, text: string) => Promise<string | null>
  onDelete: (id: string) => void
  /** The sender's contact profile (/app/contacts/open?from=message&id=). */
  contactHref?: (message: MessageRow) => string | null
}) {
  const back = (
    <button type="button" onClick={onBack} aria-label={tt("Back to website contact form")} className={cn(iconButton, "h-9 w-9 hover:bg-[#eceef1] active:bg-[#e4e6ea] max-md:h-11 max-md:w-11")} data-contacts-back="">
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
  const title = (text: string) => <h1 className="truncate text-[22px] font-bold leading-8 text-[#1a1a2e] sm:text-[20px] sm:leading-7">{text}</h1>
  if (!message) {
    return (
      <>
        <OrderBarFrame back={back} title={title(tt("Message"))} subtitle={tt("Website contact form")} />
        <div className={cn("mx-auto pb-24 pt-3 md:pb-10", ORDER_WIDTH, GUTTER)}>
          {gone ? (
            <section className={cn(card, "px-4 py-12 text-center")} data-message-gone="">
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
  const who = message.name || (displayEmail(message.email) ?? "")
  const answered = (message.replies ?? []).some((r) => !r.pending)
  const profile = contactHref ? contactHref(message) : null
  return (
    <>
      <OrderBarFrame
        back={back}
        title={
          <>
            {title(who)}
            {!message.read_at ? <StatusBadge tone="attention">{tt("New")}</StatusBadge> : answered ? <StatusBadge tone="success">{tt("Replied")}</StatusBadge> : null}
          </>
        }
        subtitle={[message.site || tt("Website contact form"), when(message.created_at)].filter(Boolean).join(" · ")}
        actions={
          <ResponsiveActionMenu
            title={who}
            align="end"
            menuWidth="w-56"
            items={[
              ...(profile ? [{ label: tt("View contact"), href: profile }] : []),
              { label: message.read_at ? tt("Mark as new") : tt("Mark as read"), onClick: () => onToggleRead(message) },
              { label: tt("Copy email"), onClick: () => onCopy((displayEmail(message.email) ?? "")) },
              { label: tt("Reply in your mail app"), onClick: () => { window.location.href = replyHref(message) } },
              { label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => onDelete(message.id) },
            ]}
            trigger={
              <button type="button" className={cn(buttonSecondary, "w-8 px-0 max-md:h-11 max-md:w-11 max-md:rounded-xl")} aria-label={tt("More actions")} data-message-more="">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
          />
        }
      />
      <div className={cn("mx-auto pb-24 md:pb-10", ORDER_WIDTH, GUTTER)} data-message-page={message.id}>
        <div data-message-body="" className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="min-w-0">
            <Thread message={message} onReply={onReply} />
          </div>
          <Sender message={message} contactHref={profile} onCopy={onCopy} />
        </div>
      </div>
    </>
  )
}
