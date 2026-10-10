"use client"

/**
 * "ADD TO YOUR ORDER": the store's checkout offers this cart qualifies for
 * (lib/offers), under the order's lines in the checkout. One press puts it
 * in the order and the checkout prices it again on the server, discount and
 * all. A product with options gets its choice right here.
 */
import * as React from "react"
import { Package, Plus } from "lucide-react"

export interface Suggestion {
  offerId: string
  title: string
  label: string | null
  offerPriceCents: number
  product: { id: string; title: string; slug: string; imageUrl: string | null; type: string; priceCents: number; variants: { id: string; name: string; priceCents: number }[] }
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

export function CheckoutSuggestions({ suggestions, onAdd, busy = false }: { suggestions: Suggestion[]; onAdd: (s: Suggestion, variant: { id: string; name: string; priceCents: number } | null) => void; busy?: boolean }) {
  const [picks, setPicks] = React.useState<Record<string, string>>({})
  if (suggestions.length === 0) return null
  return (
    <section aria-label="Add to your order" className="space-y-2.5 border-t border-[#e5e7eb] pt-4" data-checkout-suggestions="">
      {suggestions.map((s) => {
        const p = s.product
        const v = p.variants.find((x) => x.id === picks[s.offerId]) ?? p.variants[0] ?? null
        return (
          <div key={s.offerId} className="rounded-xl border border-[#e5e7eb] bg-white p-3" data-suggestion={s.offerId}>
            <p className="mb-2 flex items-center justify-between gap-2 text-[12.5px] font-medium text-[#6b7280]">
              <span className="truncate">{s.title}</span>
              {s.label ? <span className="shrink-0 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11.5px] text-[#166534]">{s.label}</span> : null}
            </p>
            <div className="flex items-center gap-3">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-[#e5e7eb] object-cover" />
              ) : (
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] text-[#9ca3af]">
                  <Package className="h-4 w-4" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{p.title}</p>
                {p.variants.length > 1 ? (
                  <select value={v?.id ?? ""} onChange={(e) => setPicks((x) => ({ ...x, [s.offerId]: e.target.value }))} className="mt-1 h-8 max-w-full rounded-md border border-[#d9dce1] bg-white px-2 text-[13px] text-[#1a1a2e]" aria-label={`${p.title} option`}>
                    {p.variants.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[13px] tabular-nums">
                    <span className="font-medium text-[#1a1a2e]">{money(s.offerPriceCents)}</span>
                    {s.offerPriceCents < p.priceCents ? <span className="ml-1.5 text-[#9ca3af] line-through">{money(p.priceCents)}</span> : null}
                  </p>
                )}
              </div>
              <button type="button" disabled={busy || (p.type === "physical" && !v)} onClick={() => onAdd(s, v)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-[10px] border border-[#1a1a2e] px-3 text-[13.5px] font-semibold text-[#1a1a2e] transition-colors hover:bg-[#1a1a2e] hover:text-white disabled:opacity-50" data-suggestion-add="">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
