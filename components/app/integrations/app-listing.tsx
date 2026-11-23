"use client"

/**
 * ===========================================================================
 *  AN APP'S LISTING (round 58)
 * ===========================================================================
 * What an integration's page is before it is installed, laid out the way an
 * app store lays out an app (the owner's reference, Shopify's Printful page,
 * for the layout only), in Storelib's own cards and type:
 *
 *   THE COLUMN   the mark, the name and what it does; Pricing, Category and
 *                Developer as short labelled facts; the one action (Install,
 *                Connect, Turn on, Tell me when it's ready); its help link.
 *                Sticky beside the rest from 1024px, so Install stays in reach.
 *   THE REST     the gallery (lib/integrations/listing mediaFor), then what it
 *                does, what it does in Storelib, what it needs and your data.
 *
 * On a phone the column comes first and the action is full width under the
 * name, then the gallery as a row that scrolls sideways. The facts are a
 * three across row there, not a list, so Install is in the first screen.
 * No key field is on this page: Install opens the sheet.
 */
import * as React from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Mark } from "@/components/app/settings/integration-mark"
import { AppMediaGallery, TickList } from "@/components/app/integrations/app-media"
import { descriptionOf, factsOf, mediaFor, requirementsOf } from "@/lib/integrations/listing"
import type { Integration } from "@/lib/integrations/catalog"

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const H2 = "text-[17px] font-semibold leading-6 text-[#1a1a2e] sm:text-[18px]"
const H3 = "text-[15px] font-semibold text-[#1a1a2e]"
const BODY = "text-[14px] leading-[22px] text-[#4b5563] sm:text-[14.5px] sm:leading-[23px]"

export interface AppListingProps {
  item: Integration
  /** The page's own title level: h1 where it is a page of its own. */
  Title: "h1" | "h2"
  /** Where it stands, in a word and a dot ("Not connected", "Coming soon"). */
  standing: { label: string; dot: string }
  color: string
  /** The one action, drawn by the page so its bar can follow it (integration-detail's actionsRef). */
  action: React.ReactNode
  /** A line under the action: a notice after a press, or nothing. */
  notice?: React.ReactNode
  /** Paused from /admin, or anything else the page has to say first. */
  banner?: React.ReactNode
}

export function AppListing({ item, Title, standing, color, action, notice, banner }: AppListingProps) {
  const facts = factsOf(item)
  const { lead, inStorelib } = descriptionOf(item)
  const needs = requirementsOf(item)
  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8" data-app-listing={item.id}>
      <aside className={cn(CARD, "app-card-x py-5 sm:px-6 sm:py-6 lg:sticky lg:top-[80px]")} data-app-listing-column="">
        <div className="flex items-center gap-3.5 lg:block">
          <Mark item={item} size={56} />
          <div className="min-w-0 lg:mt-4">
            <Title className="text-[22px] font-bold leading-7 tracking-[-0.015em] text-[#1a1a2e] sm:text-[24px] sm:leading-[30px]">{item.name}</Title>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4b5563]" data-integration-standing-line="">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", standing.dot)} />
              {standing.label}
            </p>
          </div>
        </div>
        <div className="mt-4">{action}</div>
        {notice ? <div className="mt-3">{notice}</div> : null}
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-[#f1f2f4] pt-4 lg:grid-cols-1 lg:gap-4" data-app-facts="">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[12.5px] font-medium text-[#6b7280]">{tt(f.label)}</dt>
              <dd className="mt-0.5 text-[13.5px] font-semibold leading-5 text-[#1a1a2e]">{tt(f.value)}</dd>
              {f.note ? <dd className="mt-0.5 hidden text-[12.5px] leading-[18px] text-[#6b7280] sm:block">{f.note}</dd> : null}
            </div>
          ))}
        </dl>
        {item.docsUrl ? (
          <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="-ml-1.5 mt-4 inline-flex h-11 items-center gap-1.5 rounded-lg px-1.5 text-[13.5px] font-medium text-[#4b5563] outline-none transition-colors hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:h-9" data-app-help="">
            {tt("{name} help", { name: item.name })}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </aside>

      <div className="min-w-0 space-y-4 sm:space-y-5" data-app-listing-main="">
        {banner}
        <AppMediaGallery item={item} media={mediaFor(item)} color={color} />
        <section className={cn(CARD, "app-card-x py-5 sm:px-6 sm:py-6")} aria-labelledby="app-about" data-integration-about="">
          <h2 id="app-about" className={H2}>
            {item.summary}
          </h2>
          <p className={cn(BODY, "mt-2")}>{lead}</p>
          {inStorelib.length ? (
            <>
              <h3 className={cn(H3, "mt-6")}>{tt("In Storelib")}</h3>
              <div className={cn(BODY, "mt-2 space-y-3")}>
                {inStorelib.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </>
          ) : null}
          {needs.length ? (
            <div className="mt-6 border-t border-[#f1f2f4] pt-5" data-app-requirements="">
              <h3 className={H3}>{tt("Requirements")}</h3>
              <div className="mt-3">
                <TickList rows={needs.map((n) => tt(n))} />
              </div>
            </div>
          ) : null}
        </section>
        {item.data.length ? (
          <section className={cn(CARD, "app-card-x py-5 sm:px-6 sm:py-6")} aria-labelledby="app-data" data-integration-data="">
            <h3 id="app-data" className={H3}>
              {tt("Your data")}
            </h3>
            <ul className={cn(BODY, "mt-2 space-y-2")}>
              {item.data.map((d) => (
                <li key={d} className="flex gap-2.5">
                  <span aria-hidden className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
