"use client"

/**
 * ===========================================================================
 *  THE NAVIGATOR: ONE HAMBURGER, EVERYWHERE YOU CAN GO
 * ===========================================================================
 * The three lines right of the Storelib logo, and the same three lines right
 * of a community's picture and name in its own top bar, open this one panel:
 *
 *   signed in    Recently opened (my own digital products and courses, newest
 *                first, at most five, each with its cover; the section is
 *                not drawn when there are none), my communities, most
 *                recently visited first (the one I am looking at marked),
 *                Discover communities, Explore, then Dashboard for a seller
 *                or Start creating for anybody else
 *   signed out   Explore, Discover communities, Log in and Start creating
 *
 * With communities switched off nothing about communities is in it. It no
 * longer browses categories: those live on Explore itself.
 *
 * A popover under the button on a computer; on a phone the app's one sheet
 * (components/ui/bottom-sheet.tsx), built while the page is idle and kept,
 * so a tap only slides it up. The popover is the same idea: built once
 * the page is idle and kept, invisible and inert, so the click that opens
 * it changes four properties and builds nothing (measured with the CPU
 * slowed four times, building it on the click held the first frame of the
 * fade back by 150ms). It comes in and goes out by transition on opacity,
 * `scale` and `translate` (the compositor's properties, which is what
 * Tailwind's scale-* and translate-* set), with `visibility` flipping at
 * the end of the way out, so a click away never snaps it off. Under
 * reduced motion neither moves. A second click on the button, a click anywhere outside, Escape and
 * a change of page all close it.
 *
 * The list comes from GET /api/me/places (lib/nav/places-shared.ts), asked
 * for once the page is idle and again when the panel opens if what is held
 * is more than a few seconds old, and kept for the tab in sessionStorage, so
 * the panel opens already drawn instead of filling in under the pointer.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { Check } from "lucide-react"

import { AppAvatar } from "@/components/app/app-avatar"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { navigatorModel, parsePlaces, PLACES_URL, SIGNED_OUT_PLACES, type NavigatorCurrent, type NavigatorModel, type PlacesResponse } from "@/lib/nav/places-shared"

export interface PlaceNavigatorProps {
  current?: NavigatorCurrent
  /** The button's own classes: its colour and hover in the bar it sits in. */
  className?: string
  /**
   * The click on a row, for a bar that has to carry navigation itself (the
   * Storelib header sends a seller subdomain to storelib.com, and /app with
   * a full load in the phone app). Called before the panel closes; a caller
   * that handles it calls preventDefault.
   */
  onNavigate?: (e: React.MouseEvent<HTMLElement>, href: string) => void
}

/* ── The list, held for the tab ───────────────────────────────────────── */

const STORE_KEY = "storelib:places"
/** Fresh enough to open on without asking again. */
const FRESH_MS = 15_000

type Held = { at: number; places: PlacesResponse } | null
let held: Held = null
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

function seed() {
  if (held || typeof window === "undefined") return
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY)
    if (!raw) return
    const v = JSON.parse(raw) as { at?: number; places?: unknown }
    if (typeof v.at === "number") held = { at: v.at, places: parsePlaces(v.places) }
  } catch {
    /* no storage: asked for on open */
  }
}

function refresh(force = false): Promise<void> {
  seed()
  if (!force && held && Date.now() - held.at < FRESH_MS) return Promise.resolve()
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch(PLACES_URL, { cache: "no-store", credentials: "same-origin" })
      if (!res.ok) return
      held = { at: Date.now(), places: parsePlaces(await res.json()) }
      try {
        window.sessionStorage.setItem(STORE_KEY, JSON.stringify(held))
      } catch {
        /* the tab still has it in memory */
      }
      emit()
    } catch {
      /* offline: whatever is held stays */
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** For a sign in or out in this tab: the next open asks again. */
export function forgetPlaces() {
  held = null
  try {
    window.sessionStorage.removeItem(STORE_KEY)
  } catch {
    /* nothing held */
  }
  emit()
}

function usePlaces(): PlacesResponse | null {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => {
      seed()
      return held?.places ?? null
    },
    () => null,
  )
}

/* ── Width and motion ─────────────────────────────────────────────────── */

/** Below 768px the panel is a sheet: the width from which the header stops drawing its phone row. */
const PHONE_QUERY = "(max-width: 767px)"

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY)
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
}

/*
  THE POPOVER'S TWO STATES. In over 180ms on a curve that settles, out over
  140ms on one that leaves; a reopen while it is leaving turns the same
  transition round rather than restarting it. `starting:` covers the one
  case where it is built and opened in the same frame (a click before the
  page went idle).
*/
const PANEL =
  "absolute left-0 top-full z-[60] mt-2 flex w-[300px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl bg-white text-left text-[#1a1a2e] outline-none " +
  "shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_4px_-1px_rgba(15,23,42,0.06),0_16px_36px_-10px_rgba(15,23,42,0.2)] " +
  "origin-top-left motion-reduce:transition-none"
/* Visibility is not transitioned on the way in (it would stay hidden for the first frame, too early to take focus), only on the way out, where it waits for the fade. */
const PANEL_OPEN =
  "transition-[opacity,scale,translate] opacity-100 scale-100 translate-y-0 duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] starting:opacity-0 starting:scale-[0.97] starting:-translate-y-1"
const PANEL_CLOSED = "transition-[opacity,scale,translate,visibility] invisible pointer-events-none opacity-0 scale-[0.97] -translate-y-1 duration-[140ms] ease-[cubic-bezier(0.4,0,1,1)]"

/* ── The button ───────────────────────────────────────────────────────── */

/**
 * Three lines, a little bigger than the old ones (25px wide on a phone,
 * 22px on a computer, where the old icon was an 18px glyph). Open, they dim
 * and the middle one draws shorter, by opacity and `scale` only.
 */
function Lines({ open }: { open: boolean }) {
  const line = "block h-[2px] w-full rounded-full bg-current transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
  return (
    <span aria-hidden className="flex w-[25px] flex-col gap-[5px] md:w-[22px]" data-navigator-lines={open ? "open" : "closed"}>
      <span className={cn(line, open ? "opacity-60" : "opacity-100")} />
      <span className={cn(line, "origin-left", open ? "opacity-60 scale-x-[0.64]" : "opacity-100 scale-x-100")} />
      <span className={cn(line, open ? "opacity-60" : "opacity-100")} />
    </span>
  )
}

/* ── The component ────────────────────────────────────────────────────── */

export function PlaceNavigator({ current, className, onNavigate }: PlaceNavigatorProps) {
  const pathname = usePathname()
  const places = usePlaces()
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  /* The popover is built once (idle, a pointer coming near, or the click itself) and kept. */
  const [built, setBuilt] = useState(false)
  if (open && !built) setBuilt(true)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  /* Asked for once the page is idle, so the first open is already drawn. */
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const idle = () => {
      void refresh()
      setBuilt(true)
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(idle, { timeout: 4000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(idle, 1500)
    return () => window.clearTimeout(t)
  }, [])

  const close = useCallback((refocus = false) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])

  const toggle = () => {
    if (open) return close()
    void refresh()
    setOpen(true)
  }

  /* A new page: the panel has done its job. */
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  /* A click outside, or Escape, closes the popover. The button toggles itself, so it is not "outside". */
  useEffect(() => {
    if (!open || phone) return
    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        close(true)
      }
    }
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", onKey)
    /* Opened by keyboard or pointer, the panel takes focus so arrows and Escape work from the first key. */
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, phone, close])

  const model = navigatorModel(places ?? SIGNED_OUT_PLACES, current)
  const go = (href: string) => (e: React.MouseEvent<HTMLElement>) => {
    onNavigate?.(e, href)
    close()
  }

  /* Up and down move between the rows, as in a menu. */
  const onPanelKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return
    const rows = [...(panelRef.current?.querySelectorAll<HTMLElement>("[data-navigator-row]") ?? [])]
    if (!rows.length) return
    e.preventDefault()
    const i = rows.indexOf(document.activeElement as HTMLElement)
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? (i + 1) % rows.length : i <= 0 ? rows.length - 1 : i - 1
    rows[next]?.focus()
  }

  return (
    <div ref={wrapRef} className="relative shrink-0" data-place-navigator="">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onPointerEnter={() => {
          void refresh()
          setBuilt(true)
        }}
        onFocus={() => {
          void refresh()
          setBuilt(true)
        }}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-place-navigator-trigger=""
        className={cn(
          "relative flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center rounded-full outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent]",
          "text-[#1a1a2e] hover:bg-[rgba(16,18,27,0.05)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20",
          open && "bg-[rgba(16,18,27,0.05)]",
          className,
        )}
      >
        <Lines open={open} />
      </button>

      {!phone && built ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Menu"
          tabIndex={-1}
          data-place-navigator-panel="popover"
          data-state={open ? "open" : "closed"}
          inert={open ? undefined : true}
          onKeyDown={onPanelKey}
          className={cn(PANEL, open ? PANEL_OPEN : PANEL_CLOSED)}
        >
          <NavigatorBody model={model} loading={!places} go={go} phone={false} />
        </div>
      ) : null}

      {/* Built while the page is idle and kept on a phone, so a tap only slides it up. */}
      <BottomSheet
        isOpen={phone && open}
        onClose={() => close()}
        label="Menu"
        hideFrom="md"
        keepMounted={phone}
        maxHeight="min(78dvh, 680px)"
        className="rounded-t-[24px]"
      >
        <div data-place-navigator-panel="sheet" id={phone ? panelId : undefined}>
          <NavigatorBody model={model} loading={!places} go={go} phone />
        </div>
      </BottomSheet>
    </div>
  )
}

/* ── What is in it ────────────────────────────────────────────────────── */

function NavigatorBody({
  model,
  loading,
  go,
  phone,
}: {
  model: NavigatorModel
  loading: boolean
  go: (href: string) => (e: React.MouseEvent<HTMLElement>) => void
  phone: boolean
}) {
  const row = cn(
    "flex w-full items-center gap-3 text-left outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent]",
    phone ? "min-h-[52px] rounded-xl px-3 text-[16px]" : "min-h-[44px] rounded-[10px] px-2.5 text-[14.5px]",
    "hover:bg-[#f4f5f7] focus-visible:bg-[#f1f2f4] active:bg-[#eef0f2]",
  )
  const pad = phone ? "px-3" : "p-1.5"
  const heading = cn("font-medium text-[#6b7280]", phone ? "px-3 pb-1 pt-2 text-[13px]" : "px-2.5 pb-1 pt-1.5 text-[12.5px]")
  return (
    <div className={cn("flex min-h-0 flex-col", phone ? "pb-[max(16px,env(safe-area-inset-bottom))] pt-1" : "max-h-[min(560px,calc(100dvh-120px))]")}>
      {loading ? (
        /* The one wait there can be: a first open in a fresh tab before the list arrived. One row's height, so little moves. */
        <div className={pad} data-navigator-loading="">
          <div className={cn("flex items-center gap-3", phone ? "h-[52px] px-3" : "h-[44px] px-2.5")} aria-hidden>
            <span className="h-8 w-8 shrink-0 rounded-[9px] bg-[#f1f2f4]" />
            <span className="h-3 w-32 rounded bg-[#f1f2f4]" />
          </div>
        </div>
      ) : model.products.length || model.communities.length ? (
        /* One scrolling part for both lists, so the links and the action at the foot stay put. */
        <div className={cn("min-h-0 overflow-y-auto overscroll-contain", pad)} data-navigator-lists="">
          {model.products.length ? (
            <div data-navigator-products="">
              <p className={heading}>Recently opened</p>
              <ul>
                {model.products.map((r) =>
                  r.kind === "product" ? (
                    <li key={r.product.id}>
                      <Link href={r.href} onClick={go(r.href)} data-navigator-row="" data-navigator-product={r.product.kind} className={row}>
                        <AppAvatar src={r.product.coverUrl} name={r.product.title} alt="" size={32} className="shrink-0 rounded-[8px]" markWhileLoading />
                        <span className="min-w-0 flex-1 truncate font-medium text-[#1a1a2e]">{r.product.title}</span>
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          ) : null}
          {model.communities.length ? (
            <div className={cn(model.products.length > 0 && "mt-1 border-t border-[#f0f1f3] pt-1")} data-navigator-communities="">
              <p className={heading}>Your communities</p>
              <ul>
                {model.communities.map((r) =>
                  r.kind === "community" ? (
                    <li key={r.community.id}>
                      <Link
                        href={r.href}
                        onClick={go(r.href)}
                        aria-current={r.current ? "page" : undefined}
                        data-navigator-row=""
                        data-navigator-community={r.community.slug}
                        data-current={r.current ? "" : undefined}
                        className={cn(row, r.current && "bg-[#f4f5f7] text-[#6b7280]")}
                      >
                        <AppAvatar src={r.community.logoUrl} name={r.community.name} alt="" size={32} className="shrink-0 rounded-[9px]" markWhileLoading />
                        <span className={cn("min-w-0 flex-1 truncate", r.current ? "font-medium" : "font-medium text-[#1a1a2e]")}>{r.community.name}</span>
                        {r.current ? <Check aria-label="You are here" className="h-4 w-4 shrink-0 text-[#9ca3af]" strokeWidth={2.25} /> : null}
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn("shrink-0", pad, (loading || model.products.length > 0 || model.communities.length > 0) && "border-t border-[#f0f1f3]")} data-navigator-links="">
        {model.links.map((r) =>
          r.kind === "link" ? (
            <Link key={r.key} href={r.href} onClick={go(r.href)} data-navigator-row="" data-navigator-link={r.key} className={cn(row, "font-medium text-[#1a1a2e]")}>
              {r.label}
            </Link>
          ) : null,
        )}
      </div>

      <div className={cn("flex shrink-0 gap-2 border-t border-[#f0f1f3]", phone ? "px-3 pt-3" : "p-2.5")} data-navigator-actions="">
        {model.actions.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            onClick={go(a.href)}
            data-navigator-row=""
            data-navigator-action={a.key}
            className={cn(
              "flex flex-1 items-center justify-center whitespace-nowrap rounded-action font-medium outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]",
              phone ? "h-[46px] text-[16px]" : "h-10 text-[14px]",
              a.primary ? "bg-[#1a1a2e] text-white hover:bg-[#2a2a40] active:bg-[#2a2a40]" : "border border-[#d9dce1] bg-white text-[#1a1a2e] hover:bg-[#f7f7f9] active:bg-[#f1f2f4]",
            )}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
