"use client"

/**
 * ===========================================================================
 *  THE LIBRARY, AS A MEMBER SEES IT (round 39)
 * ===========================================================================
 * /community/<slug>/library, inside the member shell. The admin's items in
 * the admin's order, each a card: its cover (or the kind of file it is, on
 * a quiet tile), its name, what is inside ("PDF", "3 files", "2 links"), and
 * how it opens for this member. One they have opens; one that is sold
 * carries its price on a button of its own that opens the checkout right
 * here (./library-checkout.tsx); one for a level or a plan says which. A
 * draft shows only to the people who run the Library, marked Draft.
 *
 * Sections, when the admin made some, are the row of pills above (All and
 * each section), with Yours at the end when some items are theirs and some
 * are not: the one switch between what they have and what they could get.
 *
 * Nothing on this page is a file or a link: those are on the item's page,
 * through routes that ask who is asking again.
 */
import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { Lock } from "lucide-react"
import { PlaceEmpty } from "@/components/community/member/place-empty"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { CARD_RAISED, PILL, PILL_OFF, PILL_ON } from "@/components/community/member/ui"
import { EDIT_GROUP, EditHint } from "@/components/community/member/edit-hint"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { BuyItem } from "./library-checkout"
import { contentsLine, lockWords, type LibraryCardView, type LibraryShelfData } from "./model"

type Filter = { kind: "all" } | { kind: "section"; id: string } | { kind: "yours" }

export function LibraryShelf({ shelf }: { shelf: LibraryShelfData }) {
  const [filter, setFilter] = React.useState<Filter>({ kind: "all" })
  const { items, sections } = shelf
  const mixed = items.some((i) => i.open) && items.some((i) => !i.open)
  const shown = items.filter((i) => (filter.kind === "section" ? i.sectionId === filter.id : filter.kind === "yours" ? i.open : true))
  const pills: { key: string; label: string; on: boolean; pick: Filter }[] =
    sections.length || mixed
      ? [
          { key: "all", label: tt("All"), on: filter.kind === "all", pick: { kind: "all" } },
          ...sections.map((s) => ({ key: s.id, label: s.name, on: filter.kind === "section" && filter.id === s.id, pick: { kind: "section", id: s.id } as Filter })),
          ...(mixed ? [{ key: "yours", label: tt("Yours"), on: filter.kind === "yours", pick: { kind: "yours" } as Filter }] : []),
        ]
      : []

  return (
    <section data-library="" aria-labelledby="library-title" className={shelf.manageHref ? EDIT_GROUP : undefined}>
      <header className="mb-3 flex items-baseline justify-between gap-3 sm:mb-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <h1 id="library-title" className="text-[19px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[21px]">
            {tt("Library")}
          </h1>
          {shelf.manageHref && items.length ? <EditHint href={shelf.manageHref} label={tt("Edit library")} phone className="self-center" /> : null}
        </span>
        {items.length ? <p className="text-[12.5px] tabular-nums text-[#6b7280]">{tt("{n, plural, one {# item} other {# items}}", { n: items.length })}</p> : null}
      </header>

      {pills.length ? (
        <div role="tablist" aria-label={tt("Sections")} className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:mb-4 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden" data-library-filters="">
          {pills.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={p.on} onClick={() => setFilter(p.pick)} className={cn(PILL, p.on ? PILL_ON : PILL_OFF)} data-library-filter={p.key}>
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      {items.length === 0 ? (
        <PlaceEmpty
          data-library-empty=""
          place="library"
          title={tt("Nothing in the library yet")}
          line={shelf.manageHref ? tt("Files, links and products you add show up here for your members.") : tt("Files, guides and other extras show up here as soon as they are added.")}
          action={shelf.manageHref ? { href: shelf.manageHref, label: tt("Add to the library") } : null}
        />
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-[#e5e7eb]/80 bg-white px-5 py-8 text-center text-[14px] text-[#6b7280]" data-library-none="">
          {filter.kind === "yours" ? tt("Nothing here is yours yet.") : tt("Nothing in this section yet.")}
        </p>
      ) : (
        <ul className={cn("grid gap-3 sm:gap-4", shown.length === 1 ? "grid-cols-1 min-[520px]:max-w-[300px]" : "grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-3")} data-library-grid="">
          {shown.map((item) => (
            <li key={item.id}>
              <ItemCard item={item} shelf={shelf} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The cover, or a quiet tile with the kind of file it is ("PDF", "ZIP"), or the Library's own mark. */
export function ItemCover({ item, sizes, className }: { item: Pick<LibraryCardView, "coverUrl" | "fileType" | "open" | "lock">; sizes: string; className?: string }) {
  const dim = !item.open && item.lock?.reason !== "paid"
  return (
    <div className={cn("relative overflow-hidden bg-[#f1f2f4]", className)}>
      {item.coverUrl ? (
        <Image src={item.coverUrl} alt="" fill sizes={sizes} className={cn("object-cover transition-[scale] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/card:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/card:scale-100", dim && "saturate-[0.6]")} />
      ) : (
        <span className="flex h-full w-full items-center justify-center" data-library-tile="">
          {item.fileType ? <span className="text-[15px] font-semibold tracking-[0.06em] text-[#9aa0a8] min-[520px]:text-[22px]">{item.fileType}</span> : <PlaceIcon place="library" className="h-5 w-5 text-[#b0b4bb] min-[520px]:h-7 min-[520px]:w-7" />}
        </span>
      )}
    </div>
  )
}

function ItemCard({ item, shelf }: { item: LibraryCardView; shelf: LibraryShelfData }) {
  const lock = lockWords(item)
  const forSale = !item.open && item.lock?.reason === "paid" && !!item.priceLabel
  return (
    <article
      data-library-card={item.id}
      data-state={item.open ? "open" : (item.lock?.reason ?? "locked")}
      className={cn(
        CARD_RAISED,
        "group/card relative flex h-full flex-row gap-3 p-3 transition-[border-color] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#d9dce1] motion-reduce:transition-none min-[520px]:flex-col min-[520px]:gap-0 min-[520px]:p-0",
        "after:pointer-events-none after:absolute after:-inset-px after:rounded-[inherit] after:opacity-0 after:shadow-[0_2px_6px_rgba(16,24,40,0.06),0_12px_28px_-12px_rgba(16,24,40,0.16)] after:transition-opacity after:duration-[400ms] hover:after:opacity-100 motion-reduce:after:transition-none",
      )}
    >
      <ItemCover item={item} sizes="(min-width: 1280px) 400px, (min-width: 520px) 45vw, 104px" className="aspect-[4/3] w-[104px] shrink-0 self-start rounded-lg isolate min-[520px]:aspect-[16/10] min-[520px]:w-full min-[520px]:rounded-b-none min-[520px]:rounded-t-[15px]" />
      {item.draft ? (
        <span className="absolute left-2.5 top-2.5 hidden rounded-md bg-[#1a1a2e]/80 px-1.5 py-0.5 text-[11px] font-semibold text-white min-[520px]:inline-flex" data-draft="">
          {tt("Draft")}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col min-[520px]:px-3.5 min-[520px]:pb-3.5 min-[520px]:pt-3">
        <h2 className="line-clamp-2 text-[14.5px] font-semibold leading-5 text-[#1a1a2e]">
          {/* The card's one link, stretched over it; the Buy button sits above it and keeps its own press. */}
          <Link href={item.href} prefetch className="outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-[#1a1a2e]/20">
            {item.draft ? <span className="mr-1.5 inline-block rounded bg-[#eef0f3] px-1 align-[1px] text-[11px] font-semibold text-[#4b5563] min-[520px]:hidden">{tt("Draft")}</span> : null}
            {item.title}
          </Link>
        </h2>
        <p className="mt-1 truncate text-[13px] text-[#6b7280]">{contentsLine(item)}</p>
        {item.summary ? <p className="mt-1 line-clamp-2 hidden text-[13px] leading-[18px] text-[#6b7280] min-[520px]:block">{item.summary}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 min-[520px]:pt-3.5">
          {item.open ? (
            <span className="text-[13px] font-medium text-[#1a1a2e]" data-library-open="">
              {item.owned && item.priceLabel ? tt("Bought") : tt("Open")}
            </span>
          ) : forSale ? (
            <BuyItem
              communityId={shelf.communityId}
              communityName={shelf.communityName}
              itemId={item.id}
              title={item.title}
              priceLabel={item.priceLabel as string}
              buttonLabel={item.priceLabel as string}
              className="relative z-10 inline-flex h-9 items-center rounded-lg border border-[#1a1a2e] bg-[#1a1a2e] px-3 text-[13px] font-semibold tabular-nums text-white shadow-[0_1px_1.5px_rgba(16,24,40,0.18)] outline-none hover:bg-[#2b2b42] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 active:opacity-80 disabled:opacity-60"
            />
          ) : lock ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-[#4b5563]" data-library-lock="">
              <Lock className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{lock}</span>
            </span>
          ) : null}
          {item.private ? <span className="text-[12px] text-[#6b7280]">{tt("Private")}</span> : null}
        </div>
      </div>
    </article>
  )
}
