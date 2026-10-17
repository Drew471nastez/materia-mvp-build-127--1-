"use client"

/**
 * ===========================================================================
 *  WHO SEES THE PAGE, AND HOW IT IS FOUND (round 26)
 * ===========================================================================
 * The last group of the Page editor:
 *
 *   STATE      Draft, Published or Archived as the admin's badge, a line on
 *              what that means for visitors, and Publish for a draft (the
 *              same request the bar's Publish sends: PATCH { publish },
 *              lib/communities/server/creator.ts setPublished). Who may join
 *              is set once, under Settings › Access and prices; this links
 *              there rather than asking twice.
 *   EXPLORE    shown in Explore or not, for a public community (saved with
 *              the page, not as it is flipped, so Save stays the one save).
 *   SEARCH     the title and the line search engines show, with the result
 *              drawn as it reads: the title cut where a results page cuts it
 *              (about 60 characters), the line at about 160, each falling
 *              back as the page's own metadata does
 *              (components/community/public/seo.ts): the title to the name,
 *              the line to the short description, the tagline, then the
 *              description.
 */
import * as React from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { htmlToPlainText } from "@/lib/rich-text/html"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { CommunityStatusBadge, Toggle, buttonPrimary, communityState, field, label } from "../parts"
import type { CommunityHead } from "../view-types"
import type { PageDraft } from "./draft"

export const SEARCH_TITLE_SOFT = 60
export const SEARCH_LINE_SOFT = 160

/** What a results page would show for the page: the same fallbacks as its metadata. */
export function searchResult(d: PageDraft, fallbackName: string): { title: string; line: string } {
  const title = (d.seoTitle.trim() || d.name.trim() || fallbackName).replace(/\s+/g, " ")
  const desc = htmlToPlainText(d.descriptionHtml).replace(/\s+/g, " ").trim()
  const line = (d.seoDescription.trim() || d.summary.trim() || d.tagline.trim() || desc).replace(/\s+/g, " ")
  return { title, line }
}

const cut = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n - 1).join("").trimEnd()}…` : s)

export function SearchPanel({ head, draft: d, set, publishing, onPublish, origin }: { head: CommunityHead; draft: PageDraft; set: <K extends keyof PageDraft>(k: K, v: PageDraft[K]) => void; publishing: boolean; onPublish: (() => void) | null; origin: string }) {
  const state = communityState(head)
  const listed = head.visibility === "public"
  const result = searchResult(d, head.name)
  const host = origin.replace(/^https?:\/\//, "")
  const crumb = [host, "community", head.slug].join(" › ") // i18n-ignore: the address, as a results page prints it
  const stateLine =
    state === "draft"
      ? tt("Only you and your team can open the page. Publish it when it is ready.")
      : state === "published"
        ? listed
          ? tt("Anyone can open the page and join the way you set.")
          : tt("Published. Only people with the link or an invite can find it.")
        : state === "archived"
          ? tt("Archived: the page is closed to new members.")
          : tt("Storelib paused this community. Contact support to talk about it.")
  return (
    <div className="space-y-6" data-panel="search">
      <div data-page-field="state">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CommunityStatusBadge state={state} />
          <p className="min-w-0 flex-1 text-[13px] leading-5 text-[#6b7280]">{stateLine}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {onPublish ? (
            <button type="button" onClick={onPublish} disabled={publishing} className={cn(buttonPrimary, "h-10 px-4 text-[14px]")} data-page-publish-inline="">
              {publishing ? tt("Publishing") : tt("Publish page")}
            </button>
          ) : null}
          <a href={`/app/community/${head.slug}/settings?tab=access`} className="inline-flex min-h-10 items-center gap-1 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline" data-page-access-link="">
            {tt("Who can join, and prices")}
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>

      <div className="border-t border-[#f1f2f4] pt-4" data-page-field="explore">
        <Toggle
          checked={listed && d.discoveryEnabled}
          onChange={(v) => set("discoveryEnabled", v)}
          title={tt("Show in Explore")}
          hint={listed ? tt("Published public communities can be found in Explore and search.") : tt("Only a community anyone can join is shown. Change that under Access and prices.")}
          disabled={!listed}
        />
      </div>

      <div className="space-y-4 border-t border-[#f1f2f4] pt-4" data-page-field="seo">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="pe-seo-title" className={label}>
              {tt("Search title")}
            </label>
            <Count n={Array.from(d.seoTitle).length} soft={SEARCH_TITLE_SOFT} />
          </div>
          <input id="pe-seo-title" value={d.seoTitle} onChange={(e) => set("seoTitle", e.target.value.slice(0, 200))} placeholder={d.name || head.name} className={cn(field, "h-11 sm:h-10")} autoComplete="off" />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="pe-seo-line" className={label}>
              {tt("Search description")}
            </label>
            <Count n={Array.from(d.seoDescription).length} soft={SEARCH_LINE_SOFT} />
          </div>
          <textarea id="pe-seo-line" value={d.seoDescription} onChange={(e) => set("seoDescription", e.target.value.slice(0, 500))} rows={3} placeholder={result.line || tt("A line about the community")} className={cn(field, "resize-y py-2.5 leading-relaxed")} />
          <p className="mt-1.5 text-[12.5px] leading-snug text-[#6b7280]">{tt("Empty, search engines get your short description or tagline.")}</p>
        </div>
        {/* The result as a results page draws it: not a promise that it is shown, only how it reads. */}
        <figure className="rounded-xl border border-[#e5e7eb] bg-white p-3.5" data-search-preview="">
          <figcaption className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">{tt("In search results")}</figcaption>
          <div className="flex items-center gap-2.5">
            {d.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImageUrl(d.logoUrl, 64)} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover shadow-[0_0_0_1px_rgba(16,24,40,0.08)]" />
            ) : (
              <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f1f2f4] text-[12px] font-semibold text-[#4b5563]">
                {(Array.from(d.name.trim())[0] || "C").toUpperCase()}
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] text-[#1a1a2e]">Storelib</p> {/* i18n-ignore: the site's name, as a results page prints it */}
              <p className="truncate text-[12px] text-[#6b7280]" data-search-preview-url="">
                {crumb}
              </p>
            </div>
          </div>
          <p className="mt-2 break-words text-[17px] leading-snug text-[#1a4fb5]" data-search-preview-title="">
            {cut(result.title, SEARCH_TITLE_SOFT)}
          </p>
          <p className="mt-1 break-words text-[13.5px] leading-[1.45] text-[#4b5563]" data-search-preview-line="">
            {result.line ? cut(result.line, SEARCH_LINE_SOFT) : <span className="text-[#9ca3af]">{tt("A community on Storelib.")}</span>}
          </p>
        </figure>
        <a href={`/community/${head.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          {tt("Open the live page")}
        </a>
      </div>
    </div>
  )
}

/** A counter that turns amber past where a results page cuts the words (they still save, up to the field's limit). */
function Count({ n, soft }: { n: number; soft: number }) {
  return (
    <span className={cn("mb-1.5 shrink-0 text-[12px] tabular-nums", n > soft ? "text-[#b45309]" : "text-[#9ca3af]")} title={n > soft ? tt("Search results usually cut it after about {n} characters.", { n: soft }) : undefined}>
      {n}/{soft}
    </span>
  )
}
