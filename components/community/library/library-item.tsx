"use client"

/**
 * ===========================================================================
 *  ONE LIBRARY ITEM, INSIDE THE COMMUNITY (round 39)
 * ===========================================================================
 * /community/<slug>/library/<itemId>. The cover, the name, the description
 * as it was written in the rich text field, and what is inside: each file
 * with its size and each link with its site. For a member who opens it every
 * file has Download and every link Open, each through a route that asks who
 * is asking again and hands out a five minute address (app/api/community/
 * [communityId]/library/[itemId]/files). For anybody else the list is there
 * to read and nothing in it can be opened, and the one step that opens it is
 * offered: Buy for its price (a sheet, right here), See your points for a
 * level, See membership options for a plan.
 *
 * A member who bought it is told it is in their Storelib library too, where
 * the receipt is.
 */
import Link from "next/link"
import { ArrowLeft, Lock } from "lucide-react"
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/community/member/ui"
import { EDIT_GROUP, EditHint } from "@/components/community/member/edit-hint"
import { cleanStoredHtml } from "@/lib/rich-text/html"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { BuyItem } from "./library-checkout"
import { ItemCover } from "./library-shelf"
import { contentsLine, lockSentence, type LibraryItemData } from "./model"

const ROW_BTN = "inline-flex h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e3e5e9] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none transition-colors hover:bg-[#f6f7f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 active:opacity-80 sm:h-9"

export function LibraryItem({ data }: { data: LibraryItemData }) {
  const { item } = data
  const reason = item.lock?.reason
  const paid = !item.open && reason === "paid" && !!item.priceLabel
  const level = !item.open && reason === "level" && !!data.levelsHref
  const plan = !item.open && reason === "tier"
  return (
    <div data-library-item={item.id} data-state={item.open ? "open" : (reason ?? "locked")} className={cn("mx-auto w-full max-w-[640px]", data.manageHref ? EDIT_GROUP : undefined)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={data.libraryHref}
          className="inline-flex h-10 items-center gap-1.5 rounded-[10px] pr-2 text-[14px] font-medium text-[#4b5563] transition-[color,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-x-0.5 hover:text-[#1a1a2e] motion-reduce:transition-none motion-reduce:hover:translate-x-0"
        >
          <ArrowLeft className="h-4 w-4" />
          {tt("Library")}
        </Link>
        {data.manageHref ? <EditHint href={data.manageHref} label={tt("Edit item")} phone /> : null}
      </div>
      <article className="overflow-hidden rounded-2xl border border-[#e4e7ec]/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]">
        {item.coverUrl ? <ItemCover item={item} sizes="(min-width: 640px) 640px, 100vw" className="aspect-[16/9] w-full" /> : null}
        <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] tabular-nums text-[#6b7280]">
            {item.draft ? <span className="rounded bg-[#eef0f3] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#4b5563]">{tt("Draft")}</span> : null}
            {item.sectionName ? <span>{item.sectionName}</span> : null}
            {item.sectionName ? <span aria-hidden>·</span> : null}
            <span>{contentsLine(item)}</span>
            {item.priceLabel ? <span aria-hidden>·</span> : null}
            {item.priceLabel ? <span className="font-semibold text-[#1a1a2e]">{item.priceLabel}</span> : null}
          </p>
          <h1 className="mt-1 text-[21px] font-bold leading-snug tracking-[-0.01em] text-[#1a1a2e] sm:text-[24px]">{item.title}</h1>
          {item.descriptionHtml ? (
            <div data-library-description="" className="storelib-prose mt-2 break-words text-[15px] leading-6 text-[#374151] [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg" dangerouslySetInnerHTML={{ __html: cleanStoredHtml(item.descriptionHtml) }} />
          ) : item.summary ? (
            <p className="mt-2 whitespace-pre-line text-[15px] leading-6 text-[#374151]">{item.summary}</p>
          ) : null}

          {!item.open ? (
            <div className="mt-4" data-library-locked="">
              <p className="flex items-start gap-2 text-[14px] leading-6 text-[#4b5563]">
                <Lock className="mt-[5px] h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{lockSentence(item)}</span>
              </p>
              <div className="mt-4 flex flex-col gap-2 min-[420px]:flex-row">
                {paid ? (
                  <BuyItem communityId={data.communityId} communityName={data.communityName} itemId={item.id} title={item.title} priceLabel={item.priceLabel as string} canBuy={data.canBuy} className={`${BTN_PRIMARY} h-11 min-[420px]:flex-1 sm:h-10`} />
                ) : null}
                {plan ? (
                  <Link href={data.aboutHref} className={`${BTN_PRIMARY} h-11 min-[420px]:flex-1 sm:h-10`}>
                    {tt("See membership options")}
                  </Link>
                ) : null}
                {level ? (
                  <Link href={data.levelsHref as string} className={`${BTN_PRIMARY} h-11 min-[420px]:flex-1 sm:h-10`} data-open-action="level">
                    {tt("See your points")}
                  </Link>
                ) : null}
                <Link href={data.libraryHref} className={`${BTN_SECONDARY} h-11 min-[420px]:flex-1 sm:h-10`}>
                  {tt("Back to the library")}
                </Link>
              </div>
              {paid && !data.canBuy ? <p className="mt-2 text-[13px] text-[#6b7280]">{tt("Payments are not set up here yet, so this cannot be bought right now.")}</p> : null}
            </div>
          ) : item.libraryProductHref ? (
            <p className="mt-3 text-[13.5px] text-[#4b5563]" data-library-owned="">
              {tt("Yours. It is in your Storelib library too, with the receipt.")}{" "}
              <a href={item.libraryProductHref} className="inline-flex min-h-10 items-center font-medium text-[#1a1a2e] underline decoration-[#d1d5db] underline-offset-2 hover:decoration-[#1a1a2e] sm:min-h-0">
                {tt("Open your library")}
              </a>
            </p>
          ) : null}
        </div>

        {item.fileList.length ? (
          <section aria-labelledby="library-files" className="border-t border-[#eef0f2] px-4 pb-3 pt-4 sm:px-6 sm:pb-4" data-library-files="">
            <h2 id="library-files" className="text-[13px] font-semibold text-[#6b7280]">
              {tt("{n, plural, one {# file} other {# files}}", { n: item.fileList.length })}
            </h2>
            <ul className="mt-1 divide-y divide-[#f0f1f3]">
              {item.fileList.map((f) => (
                <li key={f.id} className="flex min-h-[56px] items-center gap-3 py-2" data-library-file={f.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">{f.name}</span>
                    {f.sizeLabel ? <span className="block text-[12.5px] tabular-nums text-[#6b7280]">{f.sizeLabel}</span> : null}
                  </span>
                  {f.href ? (
                    <a href={f.href} className={ROW_BTN} data-library-download={f.id} rel="nofollow">
                      {tt("Download")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {item.linkList.length ? (
          <section aria-labelledby="library-links" className="border-t border-[#eef0f2] px-4 pb-3 pt-4 sm:px-6 sm:pb-4" data-library-links="">
            <h2 id="library-links" className="text-[13px] font-semibold text-[#6b7280]">
              {tt("{n, plural, one {# link} other {# links}}", { n: item.linkList.length })}
            </h2>
            <ul className="mt-1 divide-y divide-[#f0f1f3]">
              {item.linkList.map((l, i) => (
                <li key={i} className="flex min-h-[56px] items-center gap-3 py-2" data-library-link={i}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">{l.label}</span>
                    {l.host ? <span className="block truncate text-[12.5px] text-[#6b7280]">{l.host}</span> : null}
                  </span>
                  {l.href ? (
                    <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className={ROW_BTN} data-library-open-link={i}>
                      {tt("Open")}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  )
}
