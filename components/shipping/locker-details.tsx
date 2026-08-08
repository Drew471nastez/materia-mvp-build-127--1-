"use client"

import { Building2, Clock, MapPin, Navigation } from "lucide-react"

import type { LockerOption } from "@/components/shipping/locker-picker"
import { formatDistance } from "@/lib/geo"
import { isAlwaysOpen, type LockerHours } from "@/lib/shipping/locker"

/**
 * What is actually known about one locker.
 *
 * ---------------------------------------------------------------------------
 * Everything here comes from the provider, or is not shown
 * ---------------------------------------------------------------------------
 * No ratings, no review counts, no "usually busy at" — none of that exists in
 * the data and inventing it would be lying to someone deciding where to collect
 * a parcel. Opening hours ARE returned by eAWB (`schedule`), which the locker
 * route was discarding until now; availability is NOT returned at any useful
 * granularity, so it is simply absent rather than guessed at.
 *
 * Each field renders only when present, so a sparse locker degrades to a name
 * and an address instead of a column of dashes.
 */

const DAYS = ["", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"]

/**
 * Consecutive days with identical hours are collapsed into a range.
 *
 * Seven rows all reading 00:00–23:59 is not information; "Luni – Duminică,
 * non-stop" is. Most easyboxes are exactly that, which is why this is worth
 * doing rather than listing the array.
 */
function summariseHours(hours: LockerHours[]): string[] {
  if (hours.length === 0) return []
  if (isAlwaysOpen(hours)) return ["Non-stop, în fiecare zi"]

  const out: string[] = []
  let runStart = 0
  for (let i = 1; i <= hours.length; i++) {
    const prev = hours[i - 1]
    const cur = hours[i]
    const sameHours = cur && cur.opens === prev.opens && cur.closes === prev.closes
    // A run also has to be consecutive days — Monday and Wednesday sharing
    // hours is two entries, not "Luni – Miercuri".
    const consecutive = cur && cur.day === prev.day + 1
    if (sameHours && consecutive) continue

    const from = hours[runStart]
    const label =
      runStart === i - 1 ? DAYS[from.day] : `${DAYS[from.day]} – ${DAYS[prev.day]}`
    out.push(`${label}: ${from.opens}–${from.closes}`)
    runStart = i
  }
  return out
}

export function LockerDetails({
  locker,
  hours,
  onSelect,
  selected,
}: {
  locker: LockerOption
  /** From the normalised payload. Absent on older cached responses. */
  hours?: LockerHours[]
  onSelect: () => void
  selected: boolean
}) {
  const schedule = summariseHours(hours ?? [])
  const directions =
    typeof locker.lat === "number" && typeof locker.lng === "number"
      ? `https://www.google.com/maps/search/?api=1&query=${locker.lat},${locker.lng}`
      : null

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <h3 className="text-[16px] font-bold leading-tight text-neutral-900">{locker.name}</h3>

      <div className="mt-2.5 space-y-1.5">
        <p className="flex items-start gap-2 text-[13.5px] leading-snug text-neutral-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span>
            {locker.address}
            {locker.locality ? `, ${locker.locality}` : ""}
            {locker.county && locker.county !== locker.locality ? `, ${locker.county}` : ""}
          </span>
        </p>

        {locker.carrier && (
          <p className="flex items-center gap-2 text-[13.5px] text-neutral-600">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            {locker.carrier}
          </p>
        )}

        {typeof locker.distanceKm === "number" && (
          <p className="flex items-center gap-2 text-[13.5px] text-neutral-600">
            <Navigation className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
            {formatDistance(locker.distanceKm)} de tine
          </p>
        )}

        {/* Only when the carrier published them. */}
        {schedule.length > 0 && (
          <div className="flex items-start gap-2 text-[13.5px] text-neutral-600">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
            <span>
              {schedule.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`inline-flex h-11 flex-1 items-center justify-center rounded-full px-5 text-[14.5px] font-semibold transition-transform active:scale-[0.98] ${
            selected ? "bg-emerald-600 text-white" : "bg-[#7c3aed] text-white"
          }`}
        >
          {selected ? "Selectat" : "Alege acest easybox"}
        </button>
        {directions && (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-full border border-neutral-300 px-4 text-[14px] font-semibold text-neutral-700"
          >
            Direcții
          </a>
        )}
      </div>
    </div>
  )
}
