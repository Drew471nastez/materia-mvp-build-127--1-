"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { SLIDE_PANEL_STYLE, useSlideInPanel } from "@/components/checkout/full-screen-sheet"
import { ArrowLeft, List, Loader2, Map as MapIcon, Search } from "lucide-react"

import { BottomSheet } from "@/components/ui/bottom-sheet"
import { LocationPrompt } from "@/components/shipping/location-prompt"
import { LockerDetails } from "@/components/shipping/locker-details"
import { useWideViewport } from "@/lib/use-wide-viewport"
import { LockerMapPicker } from "@/components/shipping/locker-map-picker"
import type { LockerOption } from "@/components/shipping/locker-picker"
import { useGeolocation } from "@/components/shipping/use-geolocation"
import { formatDistance } from "@/lib/geo"

/**
 * ===========================================================================
 *  CHOOSING A PICKUP POINT, FULL SCREEN
 * ===========================================================================
 *
 * The structure a marketplace locker picker converges on, and for good
 * reasons rather than fashion:
 *
 *   The map gets the whole screen, because a map in a 300 px box shows one
 *   street and choosing between lockers means comparing neighbourhoods.
 *
 *   Search is pinned to the top and never scrolls away, because the first
 *   thing anyone does is type a town.
 *
 *   Tapping a pin raises a sheet with that locker's details rather than
 *   selecting it outright. Tapping a pin is "what is this one?", not "this
 *   one" — and a picker that commits on the first tap makes people afraid to
 *   explore it.
 *
 *   The sheet covers the bottom third, so the pin that raised it is still
 *   visible above. A sheet that covers the map turns a map into a list with
 *   extra steps.
 *
 *   Desktop gets a list beside the map instead of a sheet on top of it,
 *   because there is room for both and hovering a row to highlight its pin is
 *   only possible when both are on screen.
 *
 * Nothing is committed until "Alege acest easybox". Closing the screen any
 * other way leaves the previous choice exactly as it was.
 */

/** Long enough that a typist makes one request per word, not per key. */
const DEBOUNCE_MS = 300
const MIN_QUERY = 2

/** The rectangle currently on screen. */
interface Bounds {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

export function LockerScreen({
  open,
  onClose,
  onSelect,
  initial,
  carrierId,
  dropOffOnly = false,
  title = "Alege easybox-ul",
}: {
  open: boolean
  onClose: () => void
  onSelect: (l: LockerOption) => void
  /** The current choice, so reopening restores rather than resets it. */
  initial?: LockerOption | null
  carrierId?: number
  dropOffOnly?: boolean
  title?: string
}) {
  // Stays mounted while it slides back out, so the map leaves rather than
  // vanishing. Every `if (!open) return` below still keys off `open`, which is
  // correct: work should stop the moment it starts closing, not when it lands.
  const { mounted, ref: panelRef } = useSlideInPanel(open)
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<LockerOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Highlighted, not chosen. Selection happens in the sheet. */
  const [focused, setFocused] = useState<LockerOption | null>(null)
  // Which of the two answers this screen has is on show — see the sheet below.
  const wide = useWideViewport()
  const [view, setView] = useState<"map" | "list">("map")
  const geo = useGeolocation()
  const seq = useRef(0)
  const abort = useRef<AbortController | null>(null)
  /** Whether the server had more than it was willing to send. */
  const [truncated, setTruncated] = useState(false)
  /** The rectangle the map is showing. Null until it first settles. */
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const cache = useRef(new Map<string, { items: LockerOption[]; truncated: boolean }>())

  // Reopening restores the previous choice and centres on it, rather than
  // dropping someone back at a default view having forgotten what they picked.
  useEffect(() => {
    if (open) setFocused(initial ?? null)
  }, [open, initial])

  const near = geo.state.status === "ready" ? geo.state.coords : null

  const search = useCallback(
    async (
      q: string,
      coords: { lat: number; lng: number } | null,
      box: Bounds | null,
    ) => {
      if (!coords && !box && q.trim().length < MIN_QUERY) {
        setItems(null)
        setLoading(false)
        return
      }

      // Panning back over somewhere already fetched should cost nothing. The
      // key includes the query and carrier, so a text search is not served the
      // results of a blank one.
      const cacheKey = `${q.trim()}|${carrierId ?? ""}|${dropOffOnly}|${
        box ? `${box.minLat.toFixed(3)},${box.minLng.toFixed(3)},${box.maxLat.toFixed(3)},${box.maxLng.toFixed(3)}` : ""
      }|${coords ? `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}` : ""}`
      const hit = cache.current.get(cacheKey)
      if (hit) {
        setItems(hit.items)
        setTruncated(hit.truncated)
        setLoading(false)
        return
      }
      // The previous request is CANCELLED rather than merely ignored — an
      // abandoned search over 12,000 lockers is bandwidth on a phone.
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      const mine = ++seq.current

      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set("q", q.trim())
        if (coords) {
          params.set("lat", String(coords.lat))
          params.set("lng", String(coords.lng))
        }
        if (box) {
          params.set("bbox", `${box.minLat},${box.minLng},${box.maxLat},${box.maxLng}`)
        }
        if (carrierId) params.set("carrier", String(carrierId))
        if (dropOffOnly) params.set("dropOff", "1")
        const res = await fetch(`/api/shipping/lockers?${params}`, { signal: controller.signal })
        const data = await res.json()
        if (mine !== seq.current) return
        if (!data.ok) {
          setError("Nu am putut încărca easybox-urile.")
          setItems([])
        } else {
          const next = (data.items ?? []) as LockerOption[]
          setItems(next)
          setTruncated(Boolean(data.truncated))
          cache.current.set(cacheKey, { items: next, truncated: Boolean(data.truncated) })
          // A handful of viewports is plenty; without a bound this grows for as
          // long as somebody keeps panning.
          if (cache.current.size > 40) {
            const oldest = cache.current.keys().next().value
            if (oldest) cache.current.delete(oldest)
          }
        }
      } catch (e) {
        // An aborted request is not a failure; it is the newer one doing its job.
        if ((e as Error)?.name === "AbortError") return
        if (mine !== seq.current) return
        setError("Verifică conexiunea și încearcă din nou.")
        setItems([])
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    },
    [carrierId, dropOffOnly],
  )

  useEffect(() => {
    if (!open) return
    // Typing REPLACES the viewport query: someone searching "Cluj" wants Cluj,
    // not the lockers currently on screen that happen to match the word.
    const box = query.trim().length >= MIN_QUERY ? null : bounds
    const t = setTimeout(() => void search(query, near, box), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [open, query, near, bounds, search])

  // A full-screen map behind a scrolling page is the classic way to end up
  // dragging the map and the page at once. The body is frozen while this is up.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Escape closes the sheet first, then the screen — the same order the back
  // gesture and the Android back button imply.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (focused) setFocused(null)
      else onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, focused, onClose])

  /**
   * Android's back button and the browser's back gesture.
   *
   * A history entry is pushed while the screen is open so that going back
   * closes it instead of leaving checkout entirely — which is what happens
   * otherwise, and reads as the app throwing away a half-finished purchase.
   */
  useEffect(() => {
    if (!open) return
    window.history.pushState({ lockerScreen: true }, "")
    const onPop = () => onClose()
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      // If the screen was closed by anything other than back, remove the entry
      // we added so the next back press does not consume a phantom step.
      if (window.history.state?.lockerScreen) window.history.back()
    }
  }, [open, onClose])

  /**
   * Stable identity, so passing this to the map does not re-run the map's own
   * bounds effect on every render of this screen — which would be an infinite
   * fetch loop rather than a slow one.
   *
   * Ignores movements smaller than a fifth of the current view: a settle that
   * barely moved is the same neighbourhood, and refetching it would turn every
   * nudge into a request.
   */
  const onBoundsChange = useCallback((b: Bounds) => {
    setBounds((prev) => {
      if (!prev) return b
      const spanLat = Math.abs(prev.maxLat - prev.minLat)
      const spanLng = Math.abs(prev.maxLng - prev.minLng)
      const movedEnough =
        Math.abs(b.minLat - prev.minLat) > spanLat / 5 ||
        Math.abs(b.minLng - prev.minLng) > spanLng / 5 ||
        // A zoom changes the span without moving the corner much, and must
        // always refetch — that is exactly when new lockers become relevant.
        Math.abs(Math.abs(b.maxLat - b.minLat) - spanLat) > spanLat / 10
      return movedEnough ? b : prev
    })
  }, [])

  const commit = (l: LockerOption) => {
    onSelect(l)
    setFocused(null)
    onClose()
  }

  if (!mounted || typeof document === "undefined") return null

  const list = items ?? []

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // dvh, not vh: on iOS Safari the address bar makes vh taller than the
      // visible area, so a vh-sized map hides its own controls behind the bar.
      //
      // It arrives on the same slide as the other checkout subpages — the map
      // is the heaviest of the three to build, and appearing instantly after a
      // pause is what made it feel like the app had frozen and then jumped.
      className="fixed inset-0 z-[95] flex flex-col bg-white"
      style={SLIDE_PANEL_STYLE}
    >
      {/* ── Top bar: back, search, and on mobile a list/map toggle ─────────── */}
      <header
        className="shrink-0 border-b border-neutral-200 bg-white px-3 pb-2.5"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Înapoi"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Oraș, stradă sau sector…"
              aria-label="Caută easybox"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              // 16px minimum, or iOS zooms the page when the field is focused.
              className="h-11 w-full rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-9 text-[16px] outline-none focus:border-neutral-900"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setView((v) => (v === "map" ? "list" : "map"))}
            aria-label={view === "map" ? "Vezi lista" : "Vezi harta"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100 md:hidden"
          >
            {view === "map" ? <List className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
          </button>
        </div>
        <LocationPrompt state={geo.state} onAllow={geo.prime} />
        {/* Said out loud. A silently capped list is exactly what made the map
            look like it was losing lockers. */}
        {truncated && (
          <p className="mt-1.5 text-[12px] text-neutral-500">
            Se afișează cele mai apropiate {list.length}. Apropie harta pentru a le vedea pe toate.
          </p>
        )}
      </header>

      {/* ── Body: map full-bleed on mobile, list beside it on desktop ──────── */}
      <div className="relative min-h-0 flex-1 md:flex">
        <aside
          className={`min-h-0 overflow-y-auto overscroll-contain border-neutral-200 md:block md:w-[380px] md:border-r ${
            view === "list" ? "block h-full" : "hidden"
          }`}
        >
          <LockerList
            items={list}
            loading={loading}
            error={error}
            query={query}
            focusedId={focused?.id ?? null}
            onFocus={(l) => {
              setFocused(l)
              // On a phone the list and map are alternatives, so choosing from
              // the list should show it in place rather than switching views.
              if (view === "list" && window.innerWidth < 768) setView("map")
            }}
          />
        </aside>

        <div className={`relative min-h-0 flex-1 ${view === "map" ? "block" : "hidden md:block"}`}>
          {list.length > 0 ? (
            <LockerMapPicker
              lockers={list}
              value={focused}
              onSelect={setFocused}
              origin={near}
              fill
              onBoundsChange={onBoundsChange}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <p className="text-[14px] text-neutral-500">
                {loading
                  ? "Se caută…"
                  : error
                    ? error
                    : query.trim().length >= MIN_QUERY
                      ? `Niciun easybox pentru „${query.trim()}”.`
                      : "Caută un oraș sau folosește locația ta."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── The tapped locker, on mobile ─────────────────────────────────────

          CLOSED on a wide screen, not merely hidden on one. This used to hand
          the sheet `className="md:hidden"`, which hides the CARD and nothing
          else — so on a desktop, clicking a locker opened a full-screen scrim
          over the map with no panel on it, while the real desktop answer (the
          docked card below) appeared underneath the dim. A component told not
          to be here must not be opened here; a display rule cannot express
          that, because the scrim is not the thing it is applied to. */}
      <BottomSheet
        open={Boolean(focused) && view === "map" && !wide}
        onClose={() => setFocused(null)}
        label="Detalii easybox"
      >
        {focused && (
          <div className="px-4 pb-2">
            <LockerDetails
              locker={focused}
              hours={focused.hours}
              selected={initial?.id === focused.id}
              onSelect={() => commit(focused)}
            />
          </div>
        )}
      </BottomSheet>

      {/* ── The same thing on desktop, docked rather than floating ─────────── */}
      {focused && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-[2] hidden w-[360px] md:block">
          <div className="pointer-events-auto shadow-xl">
            <LockerDetails
              locker={focused}
              hours={focused.hours}
              selected={initial?.id === focused.id}
              onSelect={() => commit(focused)}
            />
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

/** The results, as rows. Usable entirely without touching the map. */
function LockerList({
  items,
  loading,
  error,
  query,
  focusedId,
  onFocus,
}: {
  items: LockerOption[]
  loading: boolean
  error: string | null
  query: string
  focusedId: number | null
  onFocus: (l: LockerOption) => void
}) {
  if (loading && items.length === 0) {
    return (
      <ul className="divide-y divide-neutral-100">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="px-4 py-3.5">
            <div className="h-3.5 w-40 animate-pulse rounded bg-neutral-100" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-neutral-100" />
          </li>
        ))}
      </ul>
    )
  }
  if (error) return <p className="px-4 py-6 text-[13.5px] text-red-600">{error}</p>
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-[13.5px] text-neutral-500">
        {query.trim() ? `Niciun easybox pentru „${query.trim()}”.` : "Caută un oraș."}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-neutral-100">
      {items.map((l) => {
        const active = focusedId === l.id
        return (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => onFocus(l)}
              aria-current={active ? "true" : undefined}
              className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors md:hover:bg-neutral-50 ${
                active ? "bg-neutral-50" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-neutral-900">{l.name}</span>
                <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">
                  {l.address}
                  {l.locality ? `, ${l.locality}` : ""}
                </span>
              </span>
              {typeof l.distanceKm === "number" && (
                <span className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-neutral-700">
                  {formatDistance(l.distanceKm)}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
