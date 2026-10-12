"use client"

/**
 * MESSAGES FROM THE BUYER, ON THE ORDER. What a buyer wrote with Contact
 * the shop (lib/support/cases.ts) shows on the order it is about, with the
 * reply box, so the seller answers where they are already looking. The same
 * thread is in Support › From buyers; a reply from either is emailed to the
 * buyer with a link back to the conversation. Nothing is drawn for an order
 * nobody wrote about.
 */
import * as React from "react"
import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, Pill } from "@/components/physical/ui"
import { CASE_REASON_LABELS, STATUS_FOR_STORE, type CaseStatus, type CaseSummary } from "@/lib/support/cases"
import { BuyerCaseThread } from "@/app/app/support/buyer-cases"
import { card } from "@/app/app/orders/order-parts"

const TONE: Record<CaseStatus, "blue" | "amber" | "gray" | "red"> = { store: "amber", buyer: "blue", storelib: "red", resolved: "gray" }

export function OrderMessagesCard({ checkoutId, orderId, className }: { checkoutId?: string | null; orderId?: string | null; className?: string }) {
  const [cases, setCases] = React.useState<CaseSummary[] | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const query = checkoutId ? `checkout=${encodeURIComponent(checkoutId)}` : orderId ? `order=${encodeURIComponent(orderId)}` : null

  const load = React.useCallback(() => {
    if (!query) return
    void api<{ cases: CaseSummary[] }>(`/api/store/cases?${query}`).then((r) => {
      if ("error" in r) return setCases([])
      setCases(r.data.cases)
      /* The newest case that isn't sorted opens by itself: that is the one waiting. */
      setOpenId((cur) => cur ?? r.data.cases.find((c) => c.status !== "resolved")?.id ?? null)
    })
  }, [query])
  React.useEffect(load, [load])
  const changed = React.useCallback(() => undefined, [])

  if (!query || !cases || cases.length === 0) return null
  return (
    <section className={cn(card, "overflow-hidden", className)} aria-label="Messages from the buyer" data-order-messages="">
      <div className="flex items-center gap-2 border-b border-[#f1f2f4] px-4 py-3 sm:px-5">
        <MessageSquare className="h-4 w-4 text-[#6b7280]" aria-hidden />
        <h2 className="text-[15px] font-semibold text-[#1a1a2e]">Messages from the buyer</h2>
      </div>
      {cases.length > 1 || !openId ? (
        <ul className="divide-y divide-[#f1f2f4]">
          {cases.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpenId(openId === c.id ? null : c.id)} className={cn("flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#fafafa] sm:px-5", openId === c.id && "bg-[#fafafa]")} data-order-case={c.id}>
                <span className={cn("min-w-0 truncate text-[13.5px] text-[#1a1a2e]", c.unread ? "font-semibold" : "font-medium")}>{CASE_REASON_LABELS[c.reason]}</span>
                <Pill tone={TONE[c.status]} className="shrink-0">
                  {c.unread ? "New message" : STATUS_FOR_STORE[c.status]}
                </Pill>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {openId ? <BuyerCaseThread key={openId} id={openId} embedded onChanged={changed} /> : null}
    </section>
  )
}
