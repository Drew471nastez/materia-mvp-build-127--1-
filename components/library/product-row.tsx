"use client"

import { SoftImg } from "@/components/ui/soft-img"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowDownToLine, ChevronDown, ExternalLink, FileText, Loader2, Mail, MoreHorizontal, Package, Receipt, Star } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { downloadFile, downloadKey } from "@/lib/downloads/download-file"
import { percentOf, useDownloadJob } from "@/lib/downloads/download-store"
import type { LibraryCreator, LibraryItem } from "@/lib/library/library-view"
import { contactOf, productPageOf } from "./creator-links"
import { LibraryFileRow } from "./file-row"
import { useStoreLinkProps } from "./use-store-link"
import { ROW_ACTION, ROW_ICON_ACTION, shortDate } from "./library-ui"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  ONE PURCHASE IN THE LIBRARY
 * ===========================================================================
 * The picture, the name, who made it and when it was bought, and the one
 * thing most people came to do: Download. A product with
 * several files opens its list in place; one with none opens the product.
 * Everything else a buyer might want once (the receipt, their review,
 * writing to the seller, the seller's shop) is under More, which is a menu
 * on a computer and a sheet on a phone (components/ui/responsive-action-menu).
 *
 * NO STARS ON THE ROW. There were five, with "Rate it", and the owner asked
 * for rating to live in one place: the Reviews tab. More's "Write a review"
 * and "Edit your review" go there, to this product, with its composer open
 * (/library/reviews?product=<id>, components/library/library-reviews.tsx).
 *
 * A refunded or unpaid purchase keeps its row, says so, and offers the
 * receipt instead of a Download that could only say no.
 *
 * ROUND 31, THE OWNER: the row's buttons looked "too light, washed grey,
 * especially in dark". Every action on a row (Download, the files switch,
 * Open, Receipt and More) is one calm secondary now, ROW_ACTION in
 * library-ui.ts, with its own dark colours. And "7 files" opens and closes
 * smoothly and exactly: the list is a row of the grid of its own, under the
 * actions on a phone and under the words from 640px, so the switch never
 * moves under the finger that pressed it; its height goes from 0fr to 1fr
 * (FILES_OPEN below), its content fades and settles by four pixels on the
 * compositor, the chevron turns on the same curve, and a closed list is
 * inert, so a keyboard never lands on a Download nobody can see.
 */

/*
  The list's motion: the app's sheet curves (components/ui/bottom-sheet.tsx SHEET_EASE and SHEET_CLOSE_EASE), opening a
  little slower than it closes, as a sheet does. Written out as classes so Tailwind compiles them; the chevron turns with
  the height.
*/
const FILES_OPEN = "duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
const FILES_CLOSE = "duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]"

const STATE_LINE: Record<Exclude<LibraryItem["state"], "open">, { text: string; tone: string }> = {
  pending: { text: "Waiting for payment", tone: "text-[#b45309]" },
  refunded: { text: "Refunded", tone: "text-[#b42318]" },
  failed: { text: "Payment failed", tone: "text-[#b42318]" },
  held: { text: "On hold while the payment is reviewed", tone: "text-[#b45309]" },
}

function Thumb({ item, className, eager = false }: { item: LibraryItem; className: string; eager?: boolean }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04] ${className}`}>
      {item.thumbnailUrl ? (
        <SoftImg src={item.thumbnailUrl} width={72} sizes="(min-width: 640px) 72px, 64px" eager={eager} className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[#9ca3af]">
          <Package className="h-5 w-5" aria-hidden />
        </span>
      )}
    </div>
  )
}

/** The row's own Download, for a product with one file. */
function OneFileButton({ item, className }: { item: LibraryItem; className: string }) {
  const file = item.files[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pct = percentOf(useDownloadJob(busy ? downloadKey({ assetId: file.id }) : null))
  const go = async () => {
    setBusy(true)
    setError(null)
    const result = await downloadFile({ assetId: file.id, receiptToken: item.receiptToken, fileName: file.name })
    setBusy(false)
    if (!result.success) setError(result.error ?? "The file could not be fetched. Try again.")
  }
  return (
    <>
      <button type="button" onClick={go} disabled={busy} aria-busy={busy || undefined} data-row-download="" className={cn(ROW_ACTION, `tabular-nums ${className}`)}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />}
        {busy ? (pct !== null ? `${pct}%` : "Preparing") : "Download"}
      </button>
      {error ? (
        <p role="alert" className="basis-full text-[13px] leading-snug text-[#b42318] sm:text-right">
          {error}
        </p>
      ) : null}
    </>
  )
}

export function ProductRow({
  item,
  creator,
  highlight = false,
  eager = false,
}: {
  item: LibraryItem
  /** The seller as the library knows them, for Contact. */
  creator: LibraryCreator | undefined
  highlight?: boolean
  /** A row on the first screen (round 29): its picture is asked for at once, not when the browser gets to it. */
  eager?: boolean
}) {
  const [open, setOpen] = useState(false)
  const storeLink = useStoreLinkProps()
  const href = `/account/library/products/${item.productId}`
  const status = item.state === "open" ? null : STATE_LINE[item.state]
  const many = item.state === "open" && item.files.length > 1
  const listId = `files-${item.productId}`

  const menu = useMemo<ActionMenuItem[]>(() => {
    const rows: ActionMenuItem[] = [{ label: "Open", icon: <Package className="h-4 w-4" />, href }]
    if (item.receiptToken) rows.push({ label: "Receipt", icon: <Receipt className="h-4 w-4" />, href: `/receipt/${encodeURIComponent(item.receiptToken)}` })
    const reviewHref = `/account/library/reviews?product=${encodeURIComponent(item.productId)}`
    if (item.review) rows.push({ label: "Edit your review", icon: <Star className="h-4 w-4" />, href: reviewHref })
    else if (item.canReview) rows.push({ label: "Write a review", icon: <Star className="h-4 w-4" />, href: reviewHref })
    const contact = creator ? contactOf(creator, item.title) : null
    const page = productPageOf(item)
    if (contact) rows.push({ label: contact.label, icon: <Mail className="h-4 w-4" />, href: contact.href, separatorBefore: true })
    if (page) rows.push({ label: "Product page", icon: <ExternalLink className="h-4 w-4" />, href: page })
    return rows
  }, [creator, href, item, storeLink.target])

  /* Download for one file, the list for several, the product for none. */
  const primary =
    item.state !== "open" ? (
      item.receiptToken ? (
        <Link href={`/receipt/${encodeURIComponent(item.receiptToken)}`} className={cn(ROW_ACTION, "flex-1 sm:flex-none sm:min-w-[120px]")}>
          Receipt
        </Link>
      ) : null
    ) : item.files.length === 1 ? (
      <OneFileButton item={item} className="flex-1 sm:flex-none sm:min-w-[120px]" />
    ) : many ? (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        data-row-files=""
        className={cn(ROW_ACTION, "flex-1 sm:w-[120px] sm:flex-none sm:shrink-0")}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="tabular-nums">{item.files.length} files</span>
        <ChevronDown data-row-files-chevron="" className={cn("h-3.5 w-3.5 shrink-0 transition-[rotate] motion-reduce:transition-none", open ? `rotate-180 ${FILES_OPEN}` : FILES_CLOSE)} aria-hidden />
      </button>
    ) : (
      <Link href={href} className={cn(ROW_ACTION, "flex-1 sm:flex-none sm:min-w-[120px]")}>
        Open
      </Link>
    )

  const more = (
    <ResponsiveActionMenu
      title={item.title}
      items={menu}
      trigger={
        <button type="button" aria-label={`More for ${item.title}`} data-row-more="" className={ROW_ICON_ACTION}>
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      }
    />
  )

  return (
    <li
      id={`p-${item.productId}`}
      data-library-item={item.productId}
      className={`scroll-mt-24 px-4 py-4 sm:px-5 ${highlight ? "bg-[#f7f5ff]" : ""}`}
    >
      {/* One set of actions: under the text on a phone, at the right from 640px. */}
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-3.5 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-x-4">
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">
          <Thumb item={item} eager={eager} className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
        </Link>
        <div className="min-w-0">
          <Link href={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#1a1a2e] [overflow-wrap:anywhere] hover:underline hover:decoration-[#1a1a2e]/30 hover:underline-offset-2">
            {item.title}
          </Link>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]">
            <AppAvatar src={item.creator.avatarUrl} name={item.creator.name} alt="" size={18} markWhileLoading className="shrink-0" />
            <span className="truncate">{item.creator.name}</span>
            <span aria-hidden className="text-[#c4c8cf]">·</span>
            <time dateTime={item.purchasedAt} className="shrink-0 tabular-nums">
              {shortDate(item.purchasedAt)}
            </time>
          </p>
          {status ? <p className={`mt-1 text-[13px] font-medium ${status.tone}`}>{status.text}</p> : null}
        </div>
        <div data-row-actions="" className="col-span-2 mt-3 flex flex-nowrap items-center gap-2 sm:col-span-1 sm:mt-0 sm:max-w-[280px] sm:justify-end sm:self-start">
          {primary}
          {more}
        </div>
        {many ? (
          /*
            THE FILES, A ROW OF THEIR OWN: the whole width under the actions on a phone, under the words and the actions
            from 640px. Only this box changes height; its content is drawn once, at its own size, and only fades.
            The box itself clips, not the row inside it: between 0fr and 1fr Chromium lays the row out at a fraction
            of the box's own height again (0.3 of 0.3), so a clipping row showed less list than the room it had made
            (measured in scripts/check-library-round31.mjs). The box reaches 4px past each side, so a focused
            Download's ring is not cut off.
          */
          <div
            id={listId}
            data-row-file-panel={open ? "open" : "closed"}
            inert={!open}
            className={cn(
              "col-span-2 -mx-1 grid grid-cols-[minmax(0,1fr)] overflow-hidden px-1 transition-[grid-template-rows] motion-reduce:transition-none sm:col-start-2",
              open ? `grid-rows-[1fr] ${FILES_OPEN}` : `grid-rows-[0fr] ${FILES_CLOSE}`,
            )}
          >
            <div className="min-h-0">
              <div
                data-row-file-content=""
                className={cn(
                  "pt-3 transition-[opacity,translate] motion-reduce:transition-none",
                  open ? "translate-y-0 opacity-100 delay-[40ms] duration-[260ms] ease-out" : "-translate-y-1 opacity-0 duration-[140ms] ease-in",
                )}
              >
                <ul data-row-file-list="" aria-label={`Files in ${item.title}`} className="border-t border-[#eef0f3]">
                  {item.files.map((f) => (
                    <LibraryFileRow key={f.id} file={f} receiptToken={item.receiptToken} tone="secondary" />
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  )
}
