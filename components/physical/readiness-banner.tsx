"use client"

/**
 * ===========================================================================
 *  "BUYERS CAN'T CHECK OUT YET", WHERE A CREATOR WILL SEE IT
 * ===========================================================================
 * The banner on Home and Products, and the note in the product editor, all
 * drawn from the one answer (lib/physical/readiness.ts):
 *
 *   BLOCKING      amber, the editor's payout notice's colours, each gap with
 *                 its Fix link. Never dismissed: it goes when it is fixed.
 *   RECOMMENDED   a quiet white line under it, or on its own when nothing
 *                 blocks, with an X that puts it away until the list changes.
 *
 * Only while something physical is on sale (Home, Products) or about to be
 * (the editor). Payments has its own notices on Home (the banner's payouts
 * announcement) and in the editor (the payout notice above this), so there
 * it is left out here: one cause, one banner.
 */
import * as React from "react"
import { X } from "lucide-react"
import { blockingItems, recommendedItems, type ReadinessItem } from "@/lib/physical/readiness"
import { ReadinessLink, useReadiness, useReadinessFor } from "./readiness-client"

const CHECKLIST = "/app/settings?tab=shipping"

function dismissKey(items: ReadinessItem[]): string {
  return `storelib:physical-readiness-hidden:${items.map((i) => i.id).sort().join(",")}`
}
function isHidden(items: ReadinessItem[]): boolean {
  try {
    return window.localStorage.getItem(dismissKey(items)) === "1"
  } catch {
    return false
  }
}
function hide(items: ReadinessItem[]) {
  try {
    window.localStorage.setItem(dismissKey(items), "1")
  } catch {
    /* Private window: it is put away for this visit only. */
  }
}

function BlockingCard({ items, title, line, className }: { items: ReadinessItem[]; title: string; line: string; className?: string }) {
  const one = items.length === 1 ? items[0] : null
  return (
    <section role="status" data-physical-readiness="blocking" className={`rounded-2xl border border-[#fedf89] bg-[#fffcf5] ${className ?? ""}`}>
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-[#f79009]" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-5 text-[#7a2e0e]">{title}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#93370d]">{one ? `${one.title}. ${one.why}` : line}</p>
        </div>
        {one ? (
          <ReadinessLink href={one.href} className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-[#93370d] underline-offset-2 hover:underline">
            {one.fix}
          </ReadinessLink>
        ) : null}
      </div>
      {one ? null : (
        <ul className="border-t border-[#fef0c7] px-2 py-1.5 sm:px-3">
          {items.map((i) => (
            <li key={i.id} data-readiness-item={i.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium leading-5 text-[#7a2e0e]">{i.title}</span>
                <span className="block text-[12.5px] leading-[18px] text-[#93370d]/85">{i.why}</span>
              </span>
              <ReadinessLink href={i.href} className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-[#93370d] underline-offset-2 hover:underline">
                {i.fix}
              </ReadinessLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecommendedLine({ items, onHide, className }: { items: ReadinessItem[]; onHide?: () => void; className?: string }) {
  const first = items[0]
  return (
    <section data-physical-readiness="recommended" className={`flex items-center gap-3 rounded-2xl border border-[#e5e7eb]/60 bg-white py-2.5 pl-4 pr-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:pl-5 ${className ?? ""}`}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#d1d5db]" />
      <p className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[#6b7280]">
        <span className="font-medium text-[#1a1a2e]">Worth doing for shipping:</span> {first.title.charAt(0).toLowerCase() + first.title.slice(1)}
        {items.length > 1 ? `, and ${items.length - 1} more` : ""}
      </p>
      <ReadinessLink href={items.length > 1 ? CHECKLIST : first.href} className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
        {items.length > 1 ? "See all" : first.fix}
      </ReadinessLink>
      {onHide ? (
        <button type="button" aria-label="Hide" onClick={onHide} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </section>
  )
}

/** What a banner says, given what is open. Exported for the tests. */
export function bannerWords(items: ReadinessItem[], draft = false): { title: string; line: string } {
  return {
    title: draft ? "Buyers won't be able to check out yet" : "Buyers can't check out on your store yet",
    line: `${items.length} things to fix before your physical products can sell.`,
  }
}

/**
 * Home and Products. Nothing until something physical is on sale; then the
 * blocking card when anything blocks, else the quiet line for what is worth
 * doing, which can be put away.
 */
export function ReadinessBanner({ surface, className }: { surface: "home" | "products"; className?: string }) {
  const r = useReadiness()
  const [hidden, setHidden] = React.useState(false)
  const recommended = recommendedItems(r)
  React.useEffect(() => {
    if (recommended.length) setHidden(isHidden(recommended))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommended.map((i) => i.id).join(",")])
  if (!r || r.live === 0) return null
  const blocking = blockingItems(r, { skipPayments: surface === "home" })
  if (blocking.length) {
    const words = bannerWords(blocking)
    return <BlockingCard items={blocking} title={words.title} line={words.line} className={className} />
  }
  if (!recommended.length || hidden) return null
  return (
    <RecommendedLine
      items={recommended}
      className={className}
      onHide={() => {
        hide(recommended)
        setHidden(true)
      }}
    />
  )
}

/**
 * The product editor: before it is published (saving publishes) and after,
 * what stops a buyer checking out with it. Blocking only, and never a reason
 * not to publish: the checkout already tells a buyer plainly when it can't
 * ship to them, and a store is often set up product first, shipping second.
 */
export function ReadinessNote({ productId, published, version }: { productId: string | null; published: boolean; version?: string | number | null }) {
  const r = useReadinessFor(productId ?? "new", version)
  const blocking = blockingItems(r, { skipPayments: true })
  if (!r || blocking.length === 0) return null
  const words = bannerWords(blocking, !published)
  return <BlockingCard items={blocking} title={words.title} line={words.line} className="mb-3 lg:mb-4" />
}
