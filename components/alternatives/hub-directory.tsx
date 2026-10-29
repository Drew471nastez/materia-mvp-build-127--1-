"use client"

import Link from "next/link"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { CategoryId } from "@/lib/alternatives/types"
import { trackAlternatives } from "@/lib/alternatives/track"

export interface HubItem {
  slug: string
  name: string
  href: string
  summary: string
  pricingShort: string
  categories: CategoryId[]
  categoryLabels: string[]
  search: string
}

/**
 * ===========================================================================
 *  THE LIST ON /alternatives, WITH ITS SEARCH AND CATEGORIES
 * ===========================================================================
 * The server renders every comparison, so the list is complete without
 * JavaScript and for a crawler. The search and the category buttons only
 * hide rows; a hidden row keeps its place in the document, and the controls
 * have their final size from the first paint, so nothing moves when the
 * script arrives.
 */
export function HubDirectory({ items, categories, storelibLine }: { items: HubItem[]; categories: { id: CategoryId; label: string }[]; storelibLine: string }) {
  const id = useId()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<CategoryId | "all">("all")

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () => new Set(items.filter((i) => (category === "all" || i.categories.includes(category)) && (!q || q.split(/\s+/).every((w) => i.search.includes(w)))).map((i) => i.slug)),
    [items, category, q],
  )

  /* A search is told once it has settled, by its length only: what somebody typed is theirs. */
  const searched = useRef(false)
  useEffect(() => {
    if (!q || searched.current) return
    const t = window.setTimeout(() => {
      searched.current = true
      trackAlternatives("Comparison search", { length: q.length, results: shown.size })
    }, 1200)
    return () => window.clearTimeout(t)
  }, [q, shown.size])

  const pick = (next: CategoryId | "all") => {
    setCategory(next)
    trackAlternatives("Comparison filter", { category: next })
  }

  const chip = (on: boolean) =>
    `h-9 rounded-[10px] border px-3.5 text-[14px] font-medium transition-colors ${
      on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d4d7dc] bg-white text-[#374151] hover:border-[#9ca3af]"
    }`

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={category === "all"} onClick={() => pick("all")} className={chip(category === "all")}>
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => pick(c.id)} className={chip(category === c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="lg:w-[300px]">
          <label htmlFor={`${id}-q`} className="sr-only">
            Search comparisons
          </label>
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 60))}
            placeholder="Search by platform or feature"
            autoComplete="off"
            className="h-10 w-full rounded-[10px] border border-[#d4d7dc] bg-white px-3.5 text-[15px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:ring-1 focus:ring-[#1a1a2e]"
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {shown.size === items.length ? `${items.length} comparisons` : `${shown.size} of ${items.length} comparisons shown`}
      </p>

      <ul className="mt-6 divide-y divide-[#eef0f2] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {items.map((i) => (
          <li key={i.slug} hidden={!shown.has(i.slug)} className="group relative">
            <div className="grid gap-3 px-4 py-5 sm:px-6 md:grid-cols-[200px_1fr_260px] md:items-start md:gap-6">
              <div>
                <h2 className="text-[19px] font-bold text-[#1a1a2e]">
                  <Link href={i.href} className="after:absolute after:inset-0 focus-visible:outline-none group-focus-within:underline">
                    Storelib vs {i.name}
                  </Link>
                </h2>
                <p className="mt-1 text-[13px] text-[#6b7280]">{i.categoryLabels.join(", ")}</p>
              </div>
              <p className="text-[15px] leading-[1.55] text-[#374151]">{i.summary}</p>
              <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-[13.5px] leading-[1.45]">
                <dt className="text-[#6b7280]">{i.name}</dt>
                <dd className="text-[#1a1a2e]">{i.pricingShort}</dd>
                <dt className="text-[#6b7280]">Storelib</dt>
                <dd className="text-[#1a1a2e]">{storelibLine}</dd>
              </dl>
            </div>
          </li>
        ))}
      </ul>

      {shown.size === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#d4d7dc] px-6 py-8 text-center">
          <p className="text-[15px] text-[#374151]">No comparison matches that yet.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setCategory("all")
            }}
            className="mt-3 text-[14px] font-semibold text-[#1a1a2e] underline underline-offset-2"
          >
            Show all comparisons
          </button>
        </div>
      ) : null}
    </div>
  )
}
