"use client"

/**
 * ===========================================================================
 *  THE NAVIGATOR: ONE HAMBURGER, EVERYWHERE YOU CAN GO
 * ===========================================================================
 * The three lines beside the Storelib logo (left of it on a phone, right of
 * it on a computer), and the same three lines right of a community's
 * picture and name in its own top bar, open this one panel:
 *
 *   signed in    one recent list with no heading: the courses and digital
 *                products I used and the communities I am in, the last one
 *                touched first, each with its cover or logo and a small
 *                word for what it is (the community I am looking at
 *                marked); a faint short rule; Discover communities,
 *                Explore, then Dashboard for a seller (one solid button) or,
 *                for anybody who does not sell, Start creating as a quiet
 *                grey row under the ways out
 *   signed out   Explore, Discover communities, Log in and Sign up (round 33)
 *
 * With communities switched off nothing about communities is in it. It no
 * longer browses categories: those live on Explore itself.
 *
 * A popover under the button on a computer; on a phone the app's one sheet
 * (components/ui/bottom-sheet.tsx), built while the page is idle and kept,
 * so a tap only slides it up. The popover is the same idea: built once
 * the page is idle and kept, transparent and inert, so the click that
 * opens it changes three properties of one element and builds nothing
 * (measured with the CPU slowed four times, building it on the click held
 * the first frame of the fade back by 150ms). It comes in and goes out by
 * transition on opacity, `scale` and `translate` (the compositor's
 * properties, which is what Tailwind's scale-* and translate-* set), and
 * `inert` follows a frame later on the way in and after the fade on the
 * way out, so a click away never snaps it off. Under reduced motion
 * neither moves. A second click on the button, a click anywhere outside,
 * Escape and a change of page all close it.
 *
 * The list comes from GET /api/me/places (lib/nav/places-shared.ts), asked
 * for once the page is idle and again when the panel opens if what is held
 * is more than a few seconds old, and kept for the tab in sessionStorage, so
 * the panel opens already drawn instead of filling in under the pointer.
 */
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Check } from "lucide-react"
/* Solar's line icons, the family the tab bar and the app's sidebar draw in. */
import { CompassIcon } from "@solar-icons/react/linear/compass"
import { ShopIcon } from "@solar-icons/react/linear/shop"
import { UsersGroupRoundedIcon } from "@solar-icons/react/linear/users-group-rounded"

import { AppAvatar, preloadAvatar } from "@/components/app/app-avatar"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { cn } from "@/lib/utils"
import { ghostTapGuardActive } from "@/lib/navigation/swallow-ghost-taps"
import { prefetchHref } from "@/lib/nav/prefetch-policy"
import { ENDS_COMMUNITY_CONTEXT, endCommunityContext } from "@/lib/nav/community-context"
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
  THE POPOVER'S TWO STATES. In over 200ms on a curve that settles, out over
  150ms on one that leaves; a reopen while it is leaving turns the same
  transition round rather than restarting it. `starting:` covers the one
  case where it is built and opened in the same frame (a click before the
  page went idle).

  A LITTLE MORE DEPTH (round 8): the hairline, a close contact shadow and a
  wide soft one underneath, so the panel reads as lifted off the page
  rather than printed on it, still quiet. It holds its own layer the whole
  time (will-change), so neither the first frame of an open nor of a close
  has to make one.
*/
/** How long the way out takes: after it the closed panel is made inert. */
const CLOSE_MS = 150
const PANEL =
  "absolute left-0 top-full z-[60] mt-2 flex w-[300px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl bg-white text-left text-[#1a1a2e] outline-none " +
  "shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.05),0_6px_12px_-4px_rgba(15,23,42,0.06),0_22px_44px_-14px_rgba(15,23,42,0.24)] " +
  "origin-top-left will-change-[opacity,scale,translate] motion-reduce:transition-none"
/*
  NOTHING INHERITED CHANGES ON THE PRESS. Closed, the panel is transparent
  and inert, no longer `visibility: hidden` and `pointer-events: none`:
  both of those are inherited, so flipping either on the press made the
  browser restyle every element inside the panel before the first frame
  (traced: 33 elements, 22 to 30ms with the CPU slowed four times, which
  was nearly all of the wait). Opacity, `scale` and `translate` are the
  panel's own, so the press restyles one element; `inert` (which also keeps
  a closed panel out of reach of a pointer, the keyboard and a screen
  reader) changes after the first frame on the way in and after the fade
  on the way out (`live` below).
*/
const PANEL_OPEN =
  "transition-[opacity,scale,translate] opacity-100 scale-100 translate-y-0 duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] starting:opacity-0 starting:scale-[0.97] starting:-translate-y-1"
const PANEL_CLOSED = "transition-[opacity,scale,translate] opacity-0 scale-[0.98] -translate-y-0.5 duration-[150ms] ease-[cubic-bezier(0.4,0,0.7,0.2)]"

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
  /*
    THE PRESS ONLY STARTS THE MOTION. Traced with the CPU slowed four
    times, the click that opened the popover spent 26ms in script before
    the first frame: taking `inert` off restyled all 33 elements of the
    panel, and the focus moved into it at once, which made the browser work
    out styles and layout there and then. Both now wait for the first frame
    of the fade to be drawn (`live`), and on the way out `inert` goes back on
    once the fade has ended (see NOTHING INHERITED CHANGES ON THE PRESS).
  */
  const [live, setLive] = useState(false)
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
    if (ghostTapGuardActive()) return
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
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, phone, close])

  /* Live once the first frame of the fade is on screen; inert again once the fade out is over (THE PRESS ONLY STARTS THE MOTION). */
  useEffect(() => {
    if (phone) return
    let timer = 0
    let frame = 0
    if (open) frame = requestAnimationFrame(() => { timer = window.setTimeout(() => setLive(true), 0) })
    else timer = window.setTimeout(() => setLive(false), CLOSE_MS + 20)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [open, phone])
  /* Opened by keyboard or pointer, the panel takes focus once it is live, so arrows and Escape work from the first key. */
  useEffect(() => {
    if (open && live && !phone) panelRef.current?.focus({ preventScroll: true })
  }, [open, live, phone])

  /*
    THE BODY IS NOT DRAWN AGAIN BY AN OPEN OR A CLOSE. The model, the click
    handler and the body are the same objects from one render to the next
    unless the list itself changed, so the press that opens or closes the
    panel re-renders the button and the panel's own classes and nothing
    inside (measured with the CPU slowed four times, scripts/check-header-
    round8.mjs).
  */
  const currentKind = current?.kind
  const currentId = current?.kind === "community" ? current.id : undefined
  const model = useMemo(
    () => navigatorModel(places ?? SIGNED_OUT_PLACES, currentKind === "community" && currentId ? { kind: "community", id: currentId } : currentKind === "storelib" ? { kind: "storelib" } : undefined),
    [places, currentKind, currentId],
  )
  const navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate

  /*
    EVERY PICTURE DECODED BEFORE IT IS NEEDED. Once the list is here, each row's picture is fetched and decoded at the size the
    row draws it, and a community's logo also at the size its own bar draws it (40px, 36px on a phone: the same files), so the
    rows open with their pictures and a community switched to shows its logo on the first frame, never its initials first.
  */
  useEffect(() => {
    if (!places) return
    for (const r of model.recent) {
      if (!r.item.imageUrl) continue
      preloadAvatar(r.item.imageUrl, phone ? 36 : 32)
      if (r.item.kind === "community") preloadAvatar(r.item.imageUrl, 40)
    }
  }, [places, model, phone])

  /*
    THE ROWS ARE READ AHEAD WHILE THE PANEL OPENS. A recent product, course
    or community is what this panel is for, and the finger is on its way to
    one of them: their pages are read whole now (as far as the device and
    the network allow, lib/nav/prefetch-policy.ts), so the press lands on a
    page the router already has instead of waiting for the server.
  */
  const router = useRouter()
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      for (const r of model.recent.slice(0, 4)) prefetchHref(router, r.href, "hover")
    }, 60)
    return () => window.clearTimeout(t)
  }, [open, model, router])
  const go = useCallback(
    (href: string, key?: string) => (e: React.MouseEvent<HTMLElement>) => {
      /* Explore, Discover communities and Dashboard leave the community behind: the tab bar's Home is Storelib's again (lib/nav/community-context.ts). */
      if (key && ENDS_COMMUNITY_CONTEXT.has(key)) endCommunityContext()
      navigateRef.current?.(e, href)
      close()
    },
    [close],
  )

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
          inert={live ? undefined : true}
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

/*
  THE ROW YOU ARE IN (round 12, 68.webp): it read as switched off, a grey
  ground with its name in grey, as if under a veil. Now it is the one row
  lifted off the panel: a white card with Storelib's hairline and a one pixel
  shadow, its name in ink like every other row, the check in ink. Pressed or
  hovered it keeps its white, so it never greys over.
*/
const CURRENT_ROW =
  "bg-white shadow-[0_0_0_1px_rgba(16,24,40,0.08),0_1px_2px_rgba(16,24,40,0.07),0_2px_6px_-2px_rgba(16,24,40,0.06)] hover:bg-white active:bg-[#fafbfc] focus-visible:bg-white"

/** The two ways out, each with its Solar line icon at the size the tab bar draws them. */
const LINK_ICON = { explore: CompassIcon, "discover-communities": UsersGroupRoundedIcon } as const

const NavigatorBody = memo(function NavigatorBody({
  model,
  loading,
  go,
  phone,
}: {
  model: NavigatorModel
  loading: boolean
  go: (href: string, key?: string) => (e: React.MouseEvent<HTMLElement>) => void
  phone: boolean
}) {
  const row = cn(
    "flex w-full items-center gap-3 text-left outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent]",
    phone ? "min-h-[52px] rounded-xl px-3 text-[16px]" : "min-h-[44px] rounded-[10px] px-2.5 text-[14.5px]",
    "hover:bg-[#f4f5f7] focus-visible:bg-[#f1f2f4] active:bg-[#eef0f2]",
  )
  const pad = phone ? "px-3" : "p-1.5"
  const pic = phone ? 36 : 32
  const hasRecent = model.recent.length > 0
  /* A quiet action is a row at the foot; the rest are the buttons they were. */
  const quiet = model.actions.filter((a) => a.quiet)
  const loud = model.actions.filter((a) => !a.quiet)
  return (
    <div className={cn("flex min-h-0 flex-col", phone ? "pb-[max(16px,env(safe-area-inset-bottom))] pt-1" : "max-h-[min(560px,calc(100dvh-120px))]")}>
      {loading ? (
        /* The one wait there can be: a first open in a fresh tab before the list arrived. One row's height, so little moves. */
        <div className={cn(pad, !phone && "pb-0")} data-navigator-loading="">
          <div className={cn("flex items-center gap-3", phone ? "h-[56px] px-3" : "h-[48px] px-2.5")} aria-hidden>
            <span className="shrink-0 rounded-[9px] bg-[#f1f2f4]" style={{ width: pic, height: pic }} />
            <span className="h-3 w-32 rounded bg-[#f1f2f4]" />
          </div>
        </div>
      ) : hasRecent ? (
        /*
          ONE RECENT LIST, NO HEADING. Courses, digital products and
          communities together, the last one touched first (lib/nav/
          places-shared.ts mergeRecent). Each says what it is in a small grey
          word under its name, so a course and a community with similar names
          read apart. It scrolls on its own, so the links and the action at
          the foot stay put.
        */
        <ul className={cn("min-h-0 overflow-y-auto overscroll-contain", pad, phone ? "py-0.5" : "pb-0")} data-navigator-lists="" data-navigator-recent="">
          {model.recent.map((r) => (
            <li key={`${r.item.kind}:${r.item.id}`}>
              <Link
                href={r.href}
                onClick={go(r.href)}
                aria-current={r.current ? "page" : undefined}
                data-navigator-row=""
                data-navigator-kind={r.item.kind}
                data-navigator-community={r.item.kind === "community" ? r.item.slug : undefined}
                data-current={r.current ? "" : undefined}
                className={cn(row, phone ? "min-h-[56px] py-1.5" : "min-h-[48px] py-1", r.current && CURRENT_ROW)}
              >
                <AppAvatar src={r.item.imageUrl} name={r.item.title} alt="" size={pic} className={cn("shrink-0 bg-[#f1f2f4]", r.item.kind === "community" ? "rounded-[9px]" : "rounded-[8px]")} kind="mark" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-[1.3] text-[#1a1a2e]" data-navigator-title="">{r.item.title}</span>
                  <span className={cn("block truncate leading-[1.35]", r.current ? "text-[#6b7280]" : "text-[#9ca3af]", phone ? "text-[13px]" : "text-[12px]")} data-navigator-hint="">{r.hint}</span>
                </span>
                {r.current ? <Check aria-label="You are here" className="h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.25} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {/* A faint, short rule between what is mine and the ways out: inset from both edges, one pixel of the lightest grey. Only under a list. */}
      {loading || hasRecent ? <div aria-hidden data-navigator-divider="" className={cn("h-px shrink-0 bg-[#f0f1f3]", phone ? "mx-6 my-2" : "mx-4 my-1.5")} /> : null}

      <div className={cn("shrink-0", pad, !phone && (loading || hasRecent) && "pt-0")} data-navigator-links="">
        {model.links.map((r) => {
          const Icon = LINK_ICON[r.key]
          return (
            <Link key={r.key} href={r.href} onClick={go(r.href, r.key)} data-navigator-row="" data-navigator-link={r.key} className={cn(row, "font-medium text-[#1a1a2e]")}>
              {/* In a box the width of a recent row's picture, so the words line up with the names above. */}
              <span aria-hidden className="flex shrink-0 items-center justify-center text-[#4b5563]" style={{ width: pic, height: phone ? 24 : 22 }}>
                <Icon size={phone ? 22 : 20} strokeWidth={1.6} />
              </span>
              {r.label}
            </Link>
          )
        })}
      </div>

      {/*
        THE FOOT. A seller's Dashboard is the one solid button in the panel,
        as it was. Somebody who does not sell gets the same words they always
        got, drawn quietly: the row shape above, grey, with a shop in the line
        family, so the panel offers it without asking for it
        (lib/nav/places-shared.ts, `quiet`). Signed out is unchanged: Log in
        and Sign up are what a visitor's panel is for (round 33: it was Start creating).
      */}
      {quiet.length ? (
        <div className={cn("shrink-0", pad, !phone && "pt-0")} data-navigator-quiet="">
          {quiet.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              onClick={go(a.href, a.key)}
              data-navigator-row=""
              data-navigator-action={a.key}
              className={cn(row, "text-[#6b7280] hover:text-[#1a1a2e]")}
            >
              <span aria-hidden className="flex shrink-0 items-center justify-center text-[#9ca3af]" style={{ width: pic, height: phone ? 24 : 22 }}>
                <ShopIcon size={phone ? 21 : 19} strokeWidth={1.5} />
              </span>
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}

      {loud.length ? (
        <div className={cn("flex shrink-0 gap-2", phone ? "px-3 pt-2" : "p-2.5 pt-1")} data-navigator-actions="">
          {loud.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              onClick={go(a.href, a.key)}
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
      ) : null}
    </div>
  )
})
