"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Crosshair, Loader2, MapPin, Search } from "lucide-react"

import { LocationPrompt } from "@/components/shipping/location-prompt"
import { LockerDetails } from "@/components/shipping/locker-details"
import { LockerMap } from "@/components/shipping/locker-map"
import { LockerMapPicker } from "@/components/shipping/locker-map-picker"
import { useGeolocation } from "@/components/shipping/use-geolocation"
import { formatDistance } from "@/lib/geo"
import type { LockerHours } from "@/lib/shipping/locker"

/**
 * Choose an easybox.
 *
 * Romania has twelve thousand of these, so there is no "list them all" mode —
 * the field starts empty and asks for a town. What comes back is already
 * filtered, ranked and capped server-side; this component's whole job is to
 * type into it slowly enough and render the answer.
 *
 * The id is the only thing that leaves here. The address shown next to each
 * result is for the human choosing — the server looks the address up again
 * from the id when it saves, so nothing rendered here can end up on a parcel
 * just because it was rendered here.
 */

export interface LockerOption {
  id: number
  name: string
  address: string
  carrier: string
  carrierId: number
  locality: string
  localityId: number
  county: string
  allowsDropOff: boolean
  /** Null when the provider has no coordinates for this locker. */
  lat?: number | null
  lng?: number | null
  /** Only present when the buyer shared their location. */
  distanceKm?: number | null
  /** Opening hours as the carrier publishes them. Empty when it publishes none. */
  hours?: LockerHours[]
}

/** Long enough that a normal typist makes one request per word, not per key. */
const DEBOUNCE_MS = 300
/** Below this a query matches thousands of rows and tells the user nothing. */
const MIN_QUERY = 2

export function LockerPicker({
  value,
  onSelect,
  carrierId,
  dropOffOnly = false,
  disabled = false,
}: {
  value: LockerOption | null
  onSelect: (locker: LockerOption) => void
  /** Restrict to one courier's network — the AWB is booked with a single carrier. */
  carrierId?: number
  /** Sender side only: not every locker accepts drop-offs. */
  dropOffOnly?: boolean
  disabled?: boolean
}) {
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<LockerOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const geo = useGeolocation()
  const [view, setView] = useState<"list" | "map">("list")

  const search = useCallback(
    async (q: string, near?: { lat: number; lng: number } | null) => {
      // With a location we can list what is nearest without any typing at all;
      // without one, a query short enough to match thousands of rows tells the
      // buyer nothing, so we wait.
      if (!near && q.trim().length < MIN_QUERY) {
        setItems(null)
        setLoading(false)
        return
      }
      // Responses can overtake each other; only the newest request may write.
      // Without this, a slow query for "clu" lands after "cluj" and replaces
      // the right answer with a stale one.
      const mine = ++seq.current
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set("q", q.trim())
        if (near) {
          params.set("lat", String(near.lat))
          params.set("lng", String(near.lng))
        }
        if (carrierId) params.set("carrier", String(carrierId))
        if (dropOffOnly) params.set("dropOff", "1")
        const res = await fetch(`/api/shipping/lockers?${params}`)
        const data = await res.json()
        if (mine !== seq.current) return
        if (!data.ok) {
          setError("Nu am putut încărca easybox-urile.")
          setItems([])
        } else {
          setItems(data.items ?? [])
        }
      } catch {
        if (mine !== seq.current) return
        setError("Verifică conexiunea și încearcă din nou.")
        setItems([])
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    },
    [carrierId, dropOffOnly],
  )

  const near = geo.state.status === "ready" ? geo.state.coords : null

  useEffect(() => {
    const t = setTimeout(() => void search(query, near), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, near, search])

  return (
    <div className="w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Caută după oraș sau stradă…"
          className="h-12 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-10 text-[15px] text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900 disabled:opacity-50"
          // A locker search is a place name, never a password or an email.
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {loading && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
        )}
      </div>

      {/* Bound to a click, never fired on mount. A location prompt the buyer
          did not ask for is the most-refused dialog on the web, and a refusal
          is permanent for the origin — spending that one chance on a page they
          have not read yet loses the feature for good.

          Hidden entirely when there is nothing to offer: already denied, or no
          geolocation at all (which includes the iOS app until Info.plist
          declares NSLocationWhenInUseUsageDescription). */}
      {/* Explains itself before the system dialog is spent — see
          LocationPrompt. Renders nothing once the question is settled. */}
      <LocationPrompt state={geo.state} onAllow={geo.prime} />

      {geo.state.status === "ready" && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-700">
          <Crosshair className="h-3.5 w-3.5" />
          Sortate după distanța față de tine
        </p>
      )}

      {value && (
        <>
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-emerald-900">{value.name}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-emerald-800/80">
                {value.address}
                {value.locality ? `, ${value.locality}` : ""}
              </span>
            </span>
          </div>
          {/* Everything the provider actually knows about the chosen locker —
              hours included, which it does publish. */}
          <div className="mt-2">
            <LockerDetails
              locker={value}
              hours={value.hours}
              selected
              onSelect={() => onSelect(value)}
            />
          </div>
          {/* Renders nothing when the provider has no coordinates for this
              locker — a map of the wrong place is worse than none. */}
          <LockerMap
            lat={value.lat}
            lng={value.lng}
            name={value.name}
            address={value.address}
            className="mt-2"
          />
        </>
      )}

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

      {/* List or map, over the same results. A toggle rather than both at once:
          on a phone a map plus a list means neither gets enough room. Only
          offered when there is something to draw. */}
      {items !== null && !error && items.length > 0 && (
        <div className="mt-3 flex gap-1 rounded-full bg-neutral-100 p-1">
          {(
            [
              ["list", "Listă"],
              ["map", "Hartă"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`h-8 flex-1 rounded-full text-[13px] font-semibold transition-colors ${
                view === v ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {items !== null && !error && view === "map" && items.length > 0 && (
        <div className="mt-2">
          <LockerMapPicker
            lockers={items}
            value={value}
            onSelect={onSelect}
            origin={geo.state.status === "ready" ? geo.state.coords : null}
          />
        </div>
      )}

      {items !== null && !error && view === "list" && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13.5px] text-neutral-500">
              Niciun easybox găsit pentru „{query.trim()}”.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto overscroll-contain">
              {items.map((l) => {
                const selected = value?.id === l.id
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(l)}
                      className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors active:bg-neutral-100 ${
                        selected ? "bg-neutral-50" : "bg-white"
                      }`}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-neutral-900">{l.name}</span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">
                          {l.address}
                          {l.locality ? `, ${l.locality}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {typeof l.distanceKm === "number" && (
                          <span className="whitespace-nowrap text-[12.5px] font-semibold text-neutral-700">
                            {formatDistance(l.distanceKm)}
                          </span>
                        )}
                        {selected && <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {items === null && !loading && query.trim().length > 0 && query.trim().length < MIN_QUERY && (
        <p className="mt-3 text-[13px] text-neutral-500">Scrie cel puțin {MIN_QUERY} caractere.</p>
      )}
    </div>
  )
}
