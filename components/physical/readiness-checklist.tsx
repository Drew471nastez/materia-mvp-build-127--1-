"use client"

/**
 * SETTINGS > SHIPPING (AND LOCATIONS): EVERYTHING READINESS SAYS, IN ONE LIST.
 * The full answer of lib/physical/readiness.ts for this store, blocking first
 * with an amber ring, then what is worth doing with a grey one, each with
 * the link to where it is fixed. It is read again, fresh, whenever the
 * settings under it change (`version`), so a rate added here ticks its line
 * off at once. Nothing until the store has a physical product: the first
 * question and Home's setup card cover the start.
 */
import { Check } from "lucide-react"
import { blockingItems, recommendedItems, type PhysicalReadiness } from "@/lib/physical/readiness"
import { CARD, CARD_PAD, CARD_TITLE, MUTED } from "./ui"
import { ReadinessLink, useReadiness } from "./readiness-client"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export function ReadinessChecklist({ version }: { version: string }) {
  const r = useReadiness(version, { freshOnOpen: true })
  if (!r || r.physical === 0) return null
  return <ChecklistView r={r} />
}

/** The list itself, for one answer. */
export function ChecklistView({ r }: { r: PhysicalReadiness }) {
  const blocking = blockingItems(r)
  const recommended = recommendedItems(r)
  const selling = r.live > 0
  const title = blocking.length ? (selling ? tt("Buyers can't check out yet") : tt("Before buyers can check out")) : selling ? tt("Ready to take orders") : tt("Ready when you publish")
  const line = blocking.length
    ? tt("{value} a sale or a shipment.{value2}", { value: blocking.length === 1 ? tt("One thing stops") : tt("{length} things stop", { length: blocking.length }), value2: recommended.length ? tt(" {length} more {length, plural, one {is} other {are}} worth doing.", { length: recommended.length }) : "" })
    : recommended.length
      ? tt("Nothing blocks a sale. {value} worth doing.", { value: recommended.length === 1 ? tt("One thing is") : tt("{length} things are", { length: recommended.length }) })
      : tt("Nothing stops a buyer checking out or an order shipping.")
  return (
    <section data-physical-checklist="" data-blocking={blocking.length || undefined} className={cn(CARD, CARD_PAD)}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full", blocking.length ? "border-[1.5px] border-[#f79009] bg-[#fffaeb]" : "bg-[#1a1a2e] text-white")}>
          {blocking.length ? null : <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
        <div className="min-w-0">
          <h2 className={CARD_TITLE}>{title}</h2>
          <p className={cn(MUTED, "mt-0.5")}>{line}</p>
        </div>
      </div>
      {blocking.length + recommended.length > 0 ? (
        <ul className="-mx-2 mt-3 sm:-mx-3">
          {[...blocking, ...recommended].map((i) => (
            <li key={i.id} data-readiness-item={i.id} data-level={i.level} className="flex items-center gap-3 rounded-xl px-2 py-2.5 sm:px-3">
              <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", i.level === "blocking" ? "bg-[#f79009]" : "bg-[#d1d5db]")} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium leading-5 text-[#1a1a2e]">{i.title}</span>
                <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{i.why}</span>
              </span>
              <ReadinessLink href={i.href} className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                {i.fix}
              </ReadinessLink>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
