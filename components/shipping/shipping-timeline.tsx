"use client"

import { Check, PackageX, TriangleAlert } from "lucide-react"

import { SHIPPING_STATES, isTerminal, type ShippingState } from "@/lib/shipping/status"

/**
 * Where the parcel is, as five dots and a line.
 *
 * The happy path is linear, so it renders as a track. The unhappy ones —
 * returned, cancelled, a booking that failed — are NOT positions on that track,
 * and drawing them as though they were (a half-filled progress bar for a parcel
 * coming back) misrepresents what happened. They get their own single-line
 * statement instead.
 */

const TRACK: Array<{ state: ShippingState; label: string; hint: string }> = [
  { state: "awaiting_shipment", label: "Comandă confirmată", hint: "Plata a fost primită" },
  { state: "awb_created", label: "AWB generat", hint: "Eticheta e pregătită" },
  { state: "shipped", label: "Predat curierului", hint: "Coletul a plecat" },
  { state: "in_transit", label: "În tranzit", hint: "Pe drum către tine" },
  { state: "delivered", label: "Livrat", hint: "Ridică-l din easybox" },
]

const OFF_TRACK: Partial<Record<ShippingState, { label: string; body: string; tone: "warn" | "bad" }>> = {
  returned: { label: "Returnat", body: "Coletul se întoarce la expeditor.", tone: "bad" },
  cancelled: { label: "Anulat", body: "Expedierea a fost anulată.", tone: "bad" },
  shipping_creation_failed: {
    label: "Eroare la generarea AWB",
    body: "Nu s-a putut crea expedierea. Plata rămâne validă și se poate reîncerca.",
    tone: "warn",
  },
}

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  } catch {
    return null
  }
}

export function ShippingTimeline({
  state,
  shippedAt,
  deliveredAt,
  rawStatus,
}: {
  state: ShippingState | null
  shippedAt?: string | null
  deliveredAt?: string | null
  /** The carrier's own words. Shown verbatim under the track when it says
   *  something our five labels do not — a mapping is a summary, and the summary
   *  should not be the only thing a worried buyer can read. */
  rawStatus?: string | null
}) {
  const off = state ? OFF_TRACK[state] : undefined
  if (off) {
    const bad = off.tone === "bad"
    return (
      <div
        className={`flex items-start gap-3 rounded-xl border p-3.5 ${
          bad ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/70"
        }`}
      >
        {bad ? (
          <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        ) : (
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <span className="min-w-0">
          <span className={`block text-[14px] font-semibold ${bad ? "text-red-900" : "text-amber-900"}`}>
            {off.label}
          </span>
          <span className={`mt-0.5 block text-[13px] leading-snug ${bad ? "text-red-800/80" : "text-amber-800/80"}`}>
            {off.body}
          </span>
          {rawStatus && (
            <span className="mt-1 block text-[12px] text-neutral-500">Status curier: {rawStatus}</span>
          )}
        </span>
      </div>
    )
  }

  // An unknown or absent state is treated as the start of the track rather than
  // as nothing, because an order that has been paid for HAS reached step one.
  const currentIndex = Math.max(
    0,
    TRACK.findIndex((s) => s.state === state),
  )
  const reached = (i: number) => i <= currentIndex
  const whenFor = (s: ShippingState): string | null =>
    s === "shipped" ? formatWhen(shippedAt) : s === "delivered" ? formatWhen(deliveredAt) : null

  return (
    <div>
      <ol className="relative">
        {TRACK.map((step, i) => {
          const done = reached(i)
          const isLast = i === TRACK.length - 1
          const isCurrent = i === currentIndex && !isTerminal(state)
          const when = whenFor(step.state)
          return (
            <li key={step.state} className="relative flex gap-3 pb-5 last:pb-0">
              {/* The connector is drawn by each step except the last, and is
                  filled only when the NEXT step is also reached — so the line
                  never runs ahead of the dot it leads to. */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[9px] top-[18px] h-[calc(100%-14px)] w-[2px] rounded-full ${
                    reached(i + 1) ? "bg-emerald-500" : "bg-neutral-200"
                  }`}
                />
              )}
              <span
                className={`relative z-[1] mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-neutral-200 bg-white text-transparent"
                }`}
              >
                {done && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
                {isCurrent && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-emerald-400/40 motion-safe:animate-ping"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[14px] font-semibold ${done ? "text-neutral-900" : "text-neutral-400"}`}
                >
                  {step.label}
                </span>
                <span className={`mt-0.5 block text-[12.5px] ${done ? "text-neutral-500" : "text-neutral-400"}`}>
                  {when ?? step.hint}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
      {rawStatus && (
        <p className="mt-3 border-t border-neutral-100 pt-3 text-[12.5px] text-neutral-500">
          Status curier: <span className="text-neutral-700">{rawStatus}</span>
        </p>
      )}
    </div>
  )
}

/** Exported so callers can assert the track covers the vocabulary. */
export const TIMELINE_STATES = TRACK.map((t) => t.state)
export const ALL_STATES = SHIPPING_STATES
