"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileText, Loader2, Plus, Trash2 } from "lucide-react"

import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"

/**
 * ===========================================================================
 *  THE DRAFTS YOU STARTED
 * ===========================================================================
 *
 * Saving a draft worked and this list existed — but every row on it was inert.
 * You could see that a half-written listing was there and do nothing with it:
 * not open it, not finish it, not delete it. A list you can only look at is
 * worse than no list, because it is a promise the interface does not keep.
 *
 * A row is now the whole tap target, and it opens the sell form filled in from
 * that draft. Publishing from there updates the SAME row rather than creating a
 * second one — see app/api/listings/drafts/[id]/route.ts, which is where that
 * has to be enforced.
 *
 * ---------------------------------------------------------------------------
 * DELETING SAYS WHAT IT IS DELETING
 * ---------------------------------------------------------------------------
 * Two taps, and the second one names the listing. A single-tap bin on a row is
 * how somebody loses twenty minutes of writing to a thumb that landed a
 * centimetre off — and a draft has no undo, because there is nowhere for a
 * deleted one to go.
 *
 * The row disappears the moment the server confirms, not before. Removing it
 * optimistically and putting it back on failure is a list that flickers to tell
 * you about a problem you can do nothing about.
 */

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
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  /** Which row is asking "are you sure", and which is being deleted. */
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/listings/drafts", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((d) => {
        if (alive) setDrafts(Array.isArray(d?.drafts) ? d.drafts : [])
      })
      .catch(() => {
        if (alive) setDrafts([])
      })
    return () => {
      alive = false
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/listings/drafts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) return
      void triggerHaptic("light")
      setDrafts((list) => (list ?? []).filter((d) => d.id !== id))
      setConfirming(null)
    } catch {
      /* the row stays; nothing was lost */
    } finally {
      setDeleting(null)
    }
  }, [])

  const open = useCallback(
    (id: string) => {
      void triggerHaptic("light")
      // The sell form reads `?draft=` and fills itself in. Same route, same
      // sheet, same slide — finishing a draft is not a different screen.
      router.push(`/products/new?draft=${encodeURIComponent(id)}`)
    },
    [router],
  )

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
            <li key={d.id} className="rounded-2xl border border-neutral-200/70">
              <div className="flex items-center gap-3 p-3">
                <button
                  type="button"
                  onClick={() => open(d.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left transition-transform duration-200 active:scale-[0.99]"
                >
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
                    <span className="mt-1 block text-[13px] font-medium text-[#7c3aed]">Continuă</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void triggerHaptic("light")
                    setConfirming((c) => (c === d.id ? null : d.id))
                  }}
                  aria-label={`Șterge ${d.title || "anunțul nepublicat"}`}
                  aria-expanded={confirming === d.id}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors active:bg-neutral-100"
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                </button>
              </div>

              {/* Expands in place, and names the thing. A bin that deletes on
                  the first tap is how twenty minutes of writing is lost to a
                  thumb that landed a centimetre off — and a draft has no undo,
                  because there is nowhere for a deleted one to go.

                  `grid-template-rows` is the one way to animate to a height
                  nobody has measured; a fixed pixel value would clip the
                  question when a long title wraps. */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: confirming === d.id ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-t border-neutral-200/70 px-3 py-2.5">
                    <p className="min-w-0 flex-1 truncate text-[13.5px] text-neutral-600">
                      Ștergi „{d.title || "Fără titlu"}”?
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="h-9 rounded-full px-3 text-[13.5px] font-semibold text-neutral-600 active:bg-neutral-100"
                      >
                        Renunță
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(d.id)}
                        disabled={deleting === d.id}
                        className="flex h-9 items-center gap-1.5 rounded-full bg-red-600 px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
                      >
                        {deleting === d.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Șterge
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
