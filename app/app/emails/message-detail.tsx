"use client"

/**
 * ===========================================================================
 *  ONE MESSAGE FROM A WEBSITE'S CONTACT FORM
 * ===========================================================================
 * Opened from a row of Messages as its own page over the list, the way a
 * contact or an email opens (./emails-client.tsx moves it in and out with
 * Orders' own motion). What they wrote, in full, first; who they are and
 * where they wrote from beside it; Reply, which opens the creator's own mail
 * app addressed to them on the same subject (the email the creator got has
 * Reply going to them as well); and the rest in More actions.
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
  onDelete,
  onOpenContact,
}: {
  message: MessageRow | null
  /** The list is read and this message is not in it: deleted, or not this creator's. */
  gone?: boolean
  onBack: () => void
  onCopy: (email: string) => void
  onToggleRead: (message: MessageRow) => void
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
            <a href={replyHref(message)} className={cn(buttonPrimary, "shrink-0 px-3")} data-message-reply="">
              {tt("Reply")}
            </a>
            <ResponsiveActionMenu
              title={who}
              menuWidth="w-56"
              items={[
                { label: message.read_at ? tt("Mark as new") : tt("Mark as read"), onClick: () => onToggleRead(message) },
                { label: tt("Copy email"), onClick: () => onCopy(message.email) },
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
          <section className={cn(card, "min-w-0 px-4 pb-4 pt-3.5")}>
            <h2 className="text-[14px] font-semibold text-[#1a1a2e]">{tt("Message")}</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-[#374151]" data-message-text="">
              {message.message}
            </p>
          </section>
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
