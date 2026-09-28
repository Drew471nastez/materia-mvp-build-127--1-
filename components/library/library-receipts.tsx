"use client"

import Link from "next/link"
import { useState } from "react"
import { FileText, Loader2 } from "lucide-react"
import { downloadFile } from "@/lib/downloads/download-file"
import { formatMoney } from "@/lib/receipts/rules"
import type { LibraryReceipt } from "@/lib/library/library-view"
import { CARD, VIOLET, shortDate } from "./library-ui"

/**
 * ===========================================================================
 *  RECEIPTS: ONE PER PAYMENT
 * ===========================================================================
 * Every payment the buyer made, newest first: when, from whom, what was in
 * it, what it came to, and whether any of it was refunded. A row opens the
 * receipt itself (/receipt/<token>), which is where the files, the email,
 * the seller's contact and the review card already are; nothing about a
 * receipt is drawn twice. A card payment has its invoice as a PDF, saved
 * through the one download path, so it lands on the phone in the app too.
 */

const STATE: Record<Exclude<LibraryReceipt["state"], "open">, { text: string; tone: string }> = {
  pending: { text: "Waiting for payment", tone: "text-[#b45309]" },
  refunded: { text: "Refunded", tone: "text-[#b42318]" },
  failed: { text: "Payment failed", tone: "text-[#b42318]" },
  held: { text: "On hold", tone: "text-[#b45309]" },
}

function Invoice({ receipt }: { receipt: LibraryReceipt }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setError(null)
    const result = await downloadFile({ url: `/api/checkout/invoice?token=${encodeURIComponent(receipt.token)}`, fileName: `Invoice ${receipt.number}.pdf` })
    setBusy(false)
    if (!result.success) setError(result.error ?? "The invoice could not be made. Try again.")
  }
  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        data-receipt-invoice=""
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 -ml-2 text-[13px] font-medium text-[#4b5563] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
        Invoice (PDF)
      </button>
      {error ? <p className="basis-full text-[13px] text-[#b42318]">{error}</p> : null}
    </>
  )
}

export function LibraryReceipts({ receipts }: { receipts: LibraryReceipt[] }) {
  if (receipts.length === 0) {
    return (
      <div data-receipts-empty="" className={`${CARD} px-5 py-10 text-center`}>
        <p className="text-[16px] font-semibold text-[#1a1a2e]">No receipts yet</p>
        <p className="mx-auto mt-1.5 max-w-[320px] text-[14px] leading-relaxed text-[#6b7280]">Every purchase on this account gets a receipt here, with an invoice for card payments.</p>
        <Link href="/explore" className={`${VIOLET} mt-5`}>
          Discover products
        </Link>
      </div>
    )
  }

  return (
    <ul data-library-receipts="" className={`${CARD} max-w-[760px] divide-y divide-[#eef0f3] overflow-hidden`}>
      {receipts.map((r) => {
        const status = r.state === "open" ? null : STATE[r.state]
        const first = r.lines[0]
        const more = r.lines.length - 1
        return (
          <li key={r.token} data-receipt-row={r.number} className="relative">
            {/* The whole row opens the receipt; the invoice is the one thing beside it. */}
            <Link
              href={`/receipt/${encodeURIComponent(r.token)}`}
              className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3.5 transition-colors hover:bg-[#fcfcfd] focus-visible:bg-[#f8f9fa] focus-visible:outline-none sm:px-5"
            >
              <div className="relative h-11 w-11 overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {first?.thumbnailUrl ? <img src={first.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" /> : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">
                  {first?.title || "Order"}
                  {more > 0 ? <span className="font-normal text-[#6b7280]"> and {more} more</span> : null}
                </p>
                <p className="truncate text-[12.5px] text-[#6b7280]">
                  {shortDate(r.createdAt)}
                  {r.sellerName ? ` · ${r.sellerName}` : ""}
                </p>
                {status ? <p className={`text-[12.5px] font-medium ${status.tone}`}>{status.text}</p> : null}
              </div>
              <p className="text-right text-[14.5px] font-semibold tabular-nums text-[#1a1a2e]">
                {r.totalCents === 0 ? "Free" : `${formatMoney(r.totalCents, r.currency, "en-US")}${r.priceInterval ? `/${r.priceInterval}` : ""}`}
                {r.refundedCents > 0 && r.refundedCents < r.totalCents ? (
                  <span className="block text-[12px] font-normal text-[#b42318]">−{formatMoney(r.refundedCents, r.currency, "en-US")}</span>
                ) : null}
                <span className="block text-[11.5px] font-normal text-[#9ca3af]">#{r.number}</span>
              </p>
            </Link>
            {r.invoice ? (
              <div className="-mt-1.5 flex flex-wrap items-center gap-2 pb-3 pl-[72px] pr-4 sm:pl-[76px]">
                <Invoice receipt={r} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
