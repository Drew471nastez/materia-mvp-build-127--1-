"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FileText, Plus } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

type Draft = {
  id: string
  title: string | null
  slug: string
  price_cents: number | null
  thumbnail_url: string | null
  created_at: string
}

export function DraftsList() {
  const { formatPrice } = useLocale()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)

  useEffect(() => {
    fetch("/api/listings/drafts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((d) => setDrafts(Array.isArray(d?.drafts) ? d.drafts : []))
      .catch(() => setDrafts([]))
  }, [])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-32 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-neutral-900">Nepublicate</h1>
        <Link
          href="/products/new"
          className="flex h-10 items-center gap-1.5 rounded-full bg-[#7c3aed] px-4 text-[14px] font-semibold text-white"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          Articol nou
        </Link>
      </div>

      {drafts === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex animate-pulse gap-3 rounded-2xl border border-neutral-200/70 p-3">
              <div className="h-20 w-16 shrink-0 rounded-xl bg-neutral-100" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-1/2 rounded bg-neutral-100" />
                <div className="h-3 w-1/4 rounded bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
            <FileText className="h-7 w-7" />
          </span>
          <h2 className="text-[17px] font-semibold text-neutral-900">Niciun anunț nepublicat</h2>
          <p className="mt-1.5 max-w-xs text-[14.5px] text-neutral-500">
            Anunțurile începute, dar nepublicate încă, te așteaptă aici.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-neutral-200/70 p-3">
              <span className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                {d.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-neutral-900">
                  {d.title || "Fără titlu"}
                </span>
                <span className="block text-[13.5px] text-neutral-500">
                  {d.price_cents ? formatPrice(d.price_cents) : "Fără preț"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
