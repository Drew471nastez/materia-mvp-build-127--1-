"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft, ExternalLink, FileText, Loader2, Mail, Package, Receipt, Store } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { ReturnLink } from "@/components/navigation/return-link"
import { LibraryReview } from "@/components/reviews/library-review"
import { downloadFile } from "@/lib/downloads/download-file"
import { appPlatform } from "@/lib/downloads/native"
import type { AccessState } from "@/lib/receipts/rules"
import type { LibraryCreator, LibraryFile } from "@/lib/library/library-view"
import { contactOf, productPageOf, storeOf } from "./creator-links"
import { LibraryFileRow } from "./file-row"
import { useStoreLinkProps } from "./use-store-link"
import { CARD, MUTED, SECONDARY, SMALL, shortDate } from "./library-ui"
import { cn } from "@/lib/utils"

export interface LibraryProductData {
  productId: string
  title: string
  thumbnailUrl: string | null
  productSlug: string | null
  archived: boolean
  purchasedAt: string
  state: AccessState
  files: Array<LibraryFile & { addedAt: string | null }>
  receiptToken: string | null
  /** The receipt's short number, as the receipt shows it. */
  receiptNumber: string | null
  invoice: boolean
  /** Their own product (a creator's copy): no review card. */
  isOwn: boolean
  creator: LibraryCreator
  reviewer: { name: string | null; avatarUrl: string | null }
}

const STATE_LINE: Record<Exclude<AccessState, "open">, { text: string; tone: string }> = {
  pending: { text: "The payment has not cleared yet. Files open as soon as it does.", tone: "text-[#b45309]" },
  refunded: { text: "This purchase was refunded, so its files are closed.", tone: "text-[#b42318]" },
  failed: { text: "This payment did not go through.", tone: "text-[#b42318]" },
  held: { text: "On hold while the payment is reviewed.", tone: "text-[#b45309]" },
}

/** Where the files go in the app, said once under them. */
function useAppNote(): string | null {
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => {
    const p = appPlatform()
    if (p === "ios") setNote("Downloads save to this iPhone. When one is ready, tap Save to Files.")
    else if (p === "android") setNote("Downloads save to the Downloads folder on this phone.")
  }, [])
  return note
}

function InvoiceButton({ token, number }: { token: string; number: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await downloadFile({ url: `/api/checkout/invoice?token=${encodeURIComponent(token)}`, fileName: `Invoice ${number}.pdf` })
        setBusy(false)
      }}
      className={cn(SECONDARY, SMALL)}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
      Invoice
    </button>
  )
}

export function LibraryProduct({ data }: { data: LibraryProductData }) {
  const note = useAppNote()
  const status = data.state === "open" ? null : STATE_LINE[data.state]
  const contact = contactOf(data.creator, data.title)
  const store = storeOf(data.creator)
  const storeLink = useStoreLinkProps()
  const page = productPageOf({ productSlug: data.productSlug, archived: data.archived, creator: data.creator })
  const open = data.state === "open"

  return (
    <div data-library-product={data.productId} className="animate-in fade-in-0 duration-300">
      <ReturnLink href="/library" className="-ml-1 mb-3 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-[14px] font-medium text-[#4b5563] hover:text-[#1a1a2e]">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Library
      </ReturnLink>

      {/* What it is, who made it, when it was bought. */}
      <header className="flex items-start gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04] sm:h-24 sm:w-24">
          {data.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[#9ca3af]">
              <Package className="h-6 w-6" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[26px]">{data.title}</h1>
          <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13.5px] text-[#6b7280]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <AppAvatar src={data.creator.avatarUrl} name={data.creator.name} alt="" size={20} markWhileLoading />
              <span className="truncate font-medium text-[#374151]">{data.creator.name}</span>
            </span>
            {data.purchasedAt ? (
              <>
                <span aria-hidden className="text-[#c4c8cf]">·</span>
                <span>Bought {shortDate(data.purchasedAt)}</span>
              </>
            ) : null}
          </p>
          {data.archived ? <p className="mt-1 text-[13px] text-[#6b7280]">No longer on sale. Still yours.</p> : null}
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div className="min-w-0 space-y-5">
          {/* The files. */}
          <section aria-labelledby="files" className={`${CARD} px-4 pb-1 pt-3.5 sm:px-5`}>
            <div className="flex items-baseline justify-between">
              <h2 id="files" className="text-[15px] font-semibold text-[#1a1a2e]">
                Files
              </h2>
              {open && data.files.length > 0 ? <span className="text-[13px] tabular-nums text-[#6b7280]">{data.files.length}</span> : null}
            </div>
            {status ? (
              <p className={`py-3 text-[14px] ${status.tone}`}>{status.text}</p>
            ) : data.files.length > 0 ? (
              <ul className="mt-1">
                {data.files.map((f) => (
                  <LibraryFileRow key={f.id} file={f} receiptToken={data.receiptToken} note={f.addedAt ? "Added after you bought it" : null} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[14px] text-[#6b7280]">No files come with this product. {contact ? "Write to the creator if you expected one." : ""}</p>
            )}
            {note && open && data.files.length > 0 ? <p className="border-t border-[#eef0f3] py-3 text-[12.5px] leading-relaxed text-[#6b7280]">{note}</p> : null}
          </section>

          {/* Their review: stars and words, Edit and Delete. Not for their own product, not for a refund. */}
          {!data.isOwn ? (
            <LibraryReview
              productId={data.productId}
              productTitle={data.title}
              reviewerName={data.reviewer.name}
              reviewerAvatarUrl={data.reviewer.avatarUrl}
              sellerName={data.creator.name}
            />
          ) : null}
        </div>

        <aside className="space-y-4">
          {/* The seller, and how to reach them. */}
          <section aria-label="Creator" data-product-creator="" className={`${CARD} px-4 py-4`}>
            <div className="flex items-center gap-3">
              <AppAvatar src={data.creator.avatarUrl} name={data.creator.name} alt="" size={44} markWhileLoading />
              <div className="min-w-0">
                <p className="text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">Made by</p>
                <p className="truncate text-[15px] font-semibold text-[#1a1a2e]">{data.creator.name}</p>
              </div>
            </div>
            {/*
              TWO BUTTONS OF ONE HEIGHT, ON ONE LINE, AT EVERY WIDTH. The first
              said "Message Negru" and wrapped onto two lines beside "Store" in
              a 300px column (the owner's screenshot). The name is right above
              them, so the buttons say only what they do, never wrap, and cut a
              label short rather than grow.
            */}
            {contact || store ? (
              <div data-creator-actions="" className="mt-3.5 grid grid-cols-2 gap-2">
                {contact ? (
                  <a href={contact.href} data-creator-contact="" aria-label={contact.label} className={cn(SECONDARY, SMALL, `min-w-0 whitespace-nowrap ${store ? "" : "col-span-2"}`)}>
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{contact.short}</span>
                  </a>
                ) : null}
                {store ? (
                  <a href={store} {...storeLink} data-creator-store="" aria-label={`${data.creator.name}'s store`} className={cn(SECONDARY, SMALL, `min-w-0 whitespace-nowrap ${contact ? "" : "col-span-2"}`)}>
                    <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">Store</span>
                  </a>
                ) : null}
              </div>
            ) : null}
            {data.creator.supportEmail ? <p className={`${MUTED} mt-2.5 truncate`}>{data.creator.supportEmail}</p> : null}
          </section>

          {/* The receipt, the invoice, the product's own page. */}
          {data.receiptToken || page ? (
            <section aria-label="Purchase" className={`${CARD} divide-y divide-[#eef0f3]`}>
              {data.receiptToken ? (
                <div className="px-4 py-3.5">
                  <p className="flex items-center gap-2 text-[14px] text-[#1a1a2e]">
                    <Receipt className="h-4 w-4 text-[#6b7280]" aria-hidden />
                    Receipt {data.receiptNumber ? <span className="tabular-nums text-[#6b7280]">#{data.receiptNumber}</span> : null}
                  </p>
                  <div className={`mt-3 grid gap-2 ${data.invoice ? "grid-cols-2" : "grid-cols-1"}`}>
                    <Link href={`/receipt/${encodeURIComponent(data.receiptToken)}`} className={cn(SECONDARY, SMALL)}>
                      View receipt
                    </Link>
                    {data.invoice ? <InvoiceButton token={data.receiptToken} number={data.receiptNumber || "receipt"} /> : null}
                  </div>
                </div>
              ) : null}
              {page ? (
                <Link href={page} className="flex items-center gap-2 px-4 py-3.5 text-[14px] text-[#1a1a2e] hover:bg-[#fcfcfd]">
                  <ExternalLink className="h-4 w-4 text-[#6b7280]" aria-hidden />
                  <span className="flex-1">Product page</span>
                </Link>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
