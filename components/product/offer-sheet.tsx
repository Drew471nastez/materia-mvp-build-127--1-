"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * "Fă o ofertă" — a bottom sheet with one job: a number.
 *
 * The quick chips are percentages off asking rather than fixed amounts, because
 * a fair discount scales with the price — 10 lei off means nothing on a coat
 * and everything on a t-shirt. Whatever is chosen or typed, submitting sends a
 * real offer message and lands the buyer in the conversation it started, where
 * the negotiation actually lives.
 */
export function OfferSheet({
  open,
  onClose,
  listingId,
  priceCents,
}: {
  open: boolean
  onClose: () => void
  listingId: string
  priceCents: number
}) {
  const { formatPrice } = useLocale()
  const router = useRouter()
  const [cents, setCents] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Every opening starts fresh at 10% under asking — the polite opening move.
  useEffect(() => {
    if (!open) return
    setCents(Math.max(100, Math.round((priceCents * 0.9) / 100) * 100))
    setError(null)
    const t = window.setTimeout(() => inputRef.current?.focus(), 260)
    return () => window.clearTimeout(t)
  }, [open, priceCents])

  const submit = useCallback(async () => {
    if (sending || cents <= 0) return
    setSending(true)
    setError(null)
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listingId, offerCents: cents }),
      })
      if (r.status === 401) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      const data = await r.json()
      if (!r.ok) {
        setError(data?.error === "Offer exceeds the asking price" ? "Oferta depășește prețul cerut." : "Nu am putut trimite oferta. Încearcă din nou.")
        return
      }
      void triggerHaptic("light")
      router.push(`/messages/${data.conversationId}`)
    } catch {
      setError("Nu am putut trimite oferta. Încearcă din nou.")
    } finally {
      setSending(false)
    }
  }, [cents, listingId, router, sending])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className={cn("fixed inset-0 z-[95]", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      {/* Scrim */}
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/45 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fă o ofertă"
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-5 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-3 shadow-[0_-8px_40px_rgba(0,0,0,0.16)] md:inset-x-auto md:left-1/2 md:bottom-auto md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:pb-6"
        style={{
          transform: open ? "translateY(0)" : "translateY(104%)",
          transition: "transform 380ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200 md:hidden" />
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-neutral-900">Fă o ofertă</h2>
          <button
            type="button"
            aria-label="Închide"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-neutral-100"
          >
            <X className="h-5 w-5 text-neutral-600" />
          </button>
        </div>
        <p className="mt-0.5 text-[13.5px] text-neutral-500">
          Preț cerut: <span className="font-semibold text-neutral-800">{formatPrice(priceCents)}</span>
        </p>

        {/* The number */}
        <div className="mt-4 flex items-center rounded-2xl border border-neutral-200 bg-neutral-50 px-4 focus-within:border-[#7c3aed]/60">
          <input
            ref={inputRef}
            inputMode="decimal"
            value={cents > 0 ? String(Math.round(cents / 100)) : ""}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10)
              setCents(Number.isFinite(n) ? n * 100 : 0)
            }}
            placeholder="0"
            className="h-14 w-full bg-transparent text-[26px] font-bold text-neutral-900 outline-none placeholder:text-neutral-300"
          />
          <span className="text-[16px] font-semibold text-neutral-500">RON</span>
        </div>

        {/* Opening moves */}
        <div className="mt-3 flex gap-2">
          {[10, 15, 20].map((pct) => {
            const value = Math.max(100, Math.round((priceCents * (100 - pct)) / 100 / 100) * 100)
            const active = cents === value
            return (
              <button
                key={pct}
                type="button"
                onClick={() => setCents(value)}
                className={cn(
                  "h-10 flex-1 rounded-full border text-[13.5px] font-semibold transition-colors",
                  active ? "border-[#7c3aed] bg-[#7c3aed]/10 text-[#7c3aed]" : "border-neutral-200 text-neutral-700",
                )}
              >
                −{pct}% · {Math.round(value / 100)}
              </button>
            )
          })}
        </div>

        {error && <p className="mt-3 text-[13.5px] font-medium text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={sending || cents <= 0 || cents > priceCents}
          className="mt-4 h-12 w-full rounded-full bg-[#7c3aed] text-[15.5px] font-semibold text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6)] transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {sending ? "Se trimite…" : cents > priceCents ? "Peste prețul cerut" : `Trimite oferta · ${formatPrice(cents)}`}
        </button>
      </div>
    </div>,
    document.body,
  )
}
