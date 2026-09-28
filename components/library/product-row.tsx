"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowDownToLine, ChevronDown, ExternalLink, FileText, Loader2, Mail, MoreHorizontal, Package, Receipt, Star, Store } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { downloadFile, downloadKey } from "@/lib/downloads/download-file"
import { percentOf, useDownloadJob } from "@/lib/downloads/download-store"
import type { LibraryCreator, LibraryItem } from "@/lib/library/library-view"
import { contactOf, productPageOf, storeOf } from "./creator-links"
import { LibraryFileRow } from "./file-row"
import { RateStars } from "./rate-stars"
import { ICON_BUTTON, PRIMARY, SECONDARY, SMALL, shortDate } from "./library-ui"

/**
 * ===========================================================================
 *  ONE PURCHASE IN THE LIBRARY
 * ===========================================================================
 * The picture, the name, who made it and when it was bought, the review
 * line, and the one thing most people came to do: Download. A product with
 * several files opens its list in place; one with none opens the product.
 * Everything else a buyer might want once (the receipt, their review,
 * writing to the seller, the seller's shop) is under More, which is a menu
 * on a computer and a sheet on a phone (components/ui/responsive-action-menu).
 *
 * A refunded or unpaid purchase keeps its row, says so, and offers the
 * receipt instead of a Download that could only say no.
 */

const STATE_LINE: Record<Exclude<LibraryItem["state"], "open">, { text: string; tone: string }> = {
  pending: { text: "Waiting for payment", tone: "text-[#b45309]" },
  refunded: { text: "Refunded", tone: "text-[#b42318]" },
  failed: { text: "Payment failed", tone: "text-[#b42318]" },
  held: { text: "On hold while the payment is reviewed", tone: "text-[#b45309]" },
}

function Thumb({ item, className }: { item: LibraryItem; className: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04] ${className}`}>
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
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
      <button type="button" onClick={go} disabled={busy} aria-busy={busy || undefined} data-row-download="" className={`${PRIMARY} ${SMALL} tabular-nums ${className}`}>
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
}: {
  item: LibraryItem
  /** The seller as the library knows them, for Contact. */
  creator: LibraryCreator | undefined
  highlight?: boolean
}) {
  const [open, setOpen] = useState(false)
  const href = `/library/products/${item.productId}`
  const status = item.state === "open" ? null : STATE_LINE[item.state]
  const many = item.state === "open" && item.files.length > 1

  const menu = useMemo<ActionMenuItem[]>(() => {
    const rows: ActionMenuItem[] = [{ label: "Open", icon: <Package className="h-4 w-4" />, href }]
    if (item.receiptToken) rows.push({ label: "Receipt", icon: <Receipt className="h-4 w-4" />, href: `/receipt/${encodeURIComponent(item.receiptToken)}` })
    if (item.review) rows.push({ label: "Edit your review", icon: <Star className="h-4 w-4" />, href: `${href}#review` })
    else if (item.canReview) rows.push({ label: "Write a review", icon: <Star className="h-4 w-4" />, href: `${href}#review` })
    const contact = creator ? contactOf(creator, item.title) : null
    const store = storeOf(item.creator)
    const page = productPageOf(item)
    if (contact) rows.push({ label: contact.label, icon: <Mail className="h-4 w-4" />, href: contact.href, separatorBefore: true })
    if (store) rows.push({ label: `${item.creator.name}'s store`, icon: <Store className="h-4 w-4" />, href: store, separatorBefore: !contact })
    if (page) rows.push({ label: "Product page", icon: <ExternalLink className="h-4 w-4" />, href: page })
    return rows
  }, [creator, href, item])

  /* Download for one file, the list for several, the product for none. */
  const primary =
    item.state !== "open" ? (
      item.receiptToken ? (
        <Link href={`/receipt/${encodeURIComponent(item.receiptToken)}`} className={`${SECONDARY} ${SMALL} flex-1 sm:flex-none sm:min-w-[120px]`}>
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
        data-row-files=""
        className={`${SECONDARY} ${SMALL} flex-1 sm:flex-none sm:min-w-[120px]`}
      >
        <FileText className="h-3.5 w-3.5" aria-hidden />
        {item.files.length} files
        <ChevronDown className={`h-3.5 w-3.5 transition-[rotate] duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
    ) : (
      <Link href={href} className={`${SECONDARY} ${SMALL} flex-1 sm:flex-none sm:min-w-[120px]`}>
        Open
      </Link>
    )

  const more = (
    <ResponsiveActionMenu
      title={item.title}
      items={menu}
      trigger={
        <button type="button" aria-label={`More for ${item.title}`} data-row-more="" className={`${ICON_BUTTON} border border-[#e4e7ec] bg-white`}>
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
          <Thumb item={item} className="h-16 w-16 sm:h-[72px] sm:w-[72px]" />
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
          {status ? (
            <p className={`mt-1 text-[13px] font-medium ${status.tone}`}>{status.text}</p>
          ) : (
            <div className="mt-1">
              <RateStars item={item} />
            </div>
          )}
        </div>
        <div data-row-actions="" className="col-span-2 mt-3 flex flex-wrap items-center gap-2 sm:col-span-1 sm:mt-0 sm:max-w-[280px] sm:justify-end">
          {primary}
          {more}
        </div>
      </div>
      {many && open ? (
        <ul data-row-file-list="" className="mt-3 border-t border-[#eef0f3] sm:ml-[88px]">
          {item.files.map((f) => (
            <LibraryFileRow key={f.id} file={f} receiptToken={item.receiptToken} tone="secondary" />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
