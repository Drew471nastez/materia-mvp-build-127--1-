"use client"

/**
 * ===========================================================================
 *  SAVE CHANGES, IN A BAR OF ITS OWN AT THE FOOT OF THE SCREEN
 * ===========================================================================
 * The owner, round 11: "Save changes is a sticky bar like the community Join
 * bar: its own white surface, above the phone tab bar where there is one, at
 * the bottom where there is not, never covering fields (the page pads for
 * it), smooth appear when there are unsaved changes."
 *
 * So it is the join bar's surface (components/community/public/
 * join-controls.tsx JoinBarPhone): one opaque white sheet from a hairline to
 * the very foot of the screen, a soft shadow along its top edge, and the
 * phone tab bar's height read from the page (--buyer-tabs-room, app/
 * globals.css) so its white runs on under the tab bar and no strip of page
 * ever shows between the two. Wider up there is no tab bar and it ends above
 * the home indicator. Its row is the settings column's own width, so Save
 * lines up with the right edge of the cards above it.
 *
 *   APPEARS        when there is something to save: it rises from below the
 *                  screen (behind the tab bar on a phone) over 300ms on the
 *                  tab bar's own curve, translate only, and goes back down
 *                  the same way once it is saved or discarded. While it is
 *                  away it is inert: no tab stop, no screen reader.
 *   THE TAB BAR    slides away while a field has the focus (the keyboard is
 *                  up). The bar follows it down by the tab bar's row height,
 *                  on the same curve, so the two move as one and the bar
 *                  ends at the foot of the screen; it comes back up with it.
 *   NEVER COVERING the page is given the room the bar takes above the tab
 *                  bar (the tab bar keeps its own), as padding at the end of
 *                  the document, so the last field and the footer scroll
 *                  clear of it; and when the bar rises over the field being
 *                  typed in, the page scrolls that field into the clear.
 *
 * Drawn into <body>, not where it is written: an ancestor fading in (the
 * section swap, the account's entrance) would otherwise make a stacking
 * context of its own and the footer, later on the page, would paint over it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2 } from "lucide-react"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"
import { cn } from "@/lib/utils"

/** The phone tab bar's own curve (components/nav/buyer-tab-bar.tsx), so the two move together. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
export const SAVE_BAR_MS = 300

/* The settings' own buttons (components/account/account-settings.tsx INK and QUIET). */
const INK =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] " +
  "disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:rounded-lg sm:text-[13px] [-webkit-tap-highlight-color:transparent]"
const QUIET =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-xl px-3 text-[14px] font-medium text-[#4b5563] transition-colors " +
  "hover:bg-[#f3f4f6] hover:text-[#1a1a2e] active:bg-[#eceef1] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:rounded-lg sm:text-[13px] [-webkit-tap-highlight-color:transparent]"

/** Whether the phone's tab bar is on screen right now (it says so on <html>, components/nav/buyer-tab-bar.tsx). */
function tabsShown(): boolean {
  return document.documentElement.getAttribute("data-buyer-tabs") === "shown"
}

function usePhoneTabs(): { phone: boolean; tabs: boolean } {
  const [state, setState] = useState({ phone: false, tabs: false })
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setState({ phone: mq.matches, tabs: mq.matches && tabsShown() })
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-buyer-tabs"] })
    mq.addEventListener("change", sync)
    return () => {
      mo.disconnect()
      mq.removeEventListener("change", sync)
    }
  }, [])
  return state
}

function px(name: string): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(v) ? v : 0
}

export function SaveBar({
  shown,
  busy,
  disabled,
  error,
  onSave,
  onDiscard,
}: {
  /** There is something to save (or a save is on its way). */
  shown: boolean
  busy: boolean
  /** Save cannot go yet (an empty name, a username still being checked). */
  disabled: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { phone, tabs: tabsUp } = usePhoneTabs()
  /*
    INSIDE THE SETTINGS LAYER (settings-subpage.tsx: Edit profile and the
    Settings pill on a phone, a tablet and in the app). This bar is drawn into
    <body> at z-40 and the layer is a full screen sheet at z 420, so there it
    was drawn UNDER the layer: changes were made and nothing on screen could
    save them. Found from where the bar is written (a marker that is not
    portalled), it goes above the layer, ends at the screen's foot (the tab
    bar is under the layer too), pads the layer rather than the page, and
    scrolls the layer, which is what scrolls there.
  */
  const marker = useRef<HTMLSpanElement>(null)
  const [layer, setLayer] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (mounted) setLayer(marker.current?.closest<HTMLElement>("[data-settings-subpage]") ?? null)
  }, [mounted])
  const tabs = layer ? true : tabsUp

  /*
    THE ROOM IT TAKES, AT THE END OF THE DOCUMENT, while it is up (the join
    bar's measure): what the bar covers above the tab bar's own room. Once it
    has gone back down the room is given back, unless the page is scrolled
    into that room, where giving it back would pull what is on screen down;
    then it is kept until this section closes.
  */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !mounted) return
    if (layer) {
      /* The layer is what scrolls: its own foot makes the room, so the last field clears the bar. */
      const sync = () => void (layer.style.paddingBottom = shown ? `calc(env(safe-area-inset-bottom) + ${el.offsetHeight}px)` : "env(safe-area-inset-bottom)")
      sync()
      if (!shown) return
      const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync)
      ro?.observe(el)
      return () => ro?.disconnect()
    }
    const body = document.body
    if (!shown) {
      const room = parseFloat(body.style.paddingBottom) || 0
      if (!room) return
      const inRoom = window.scrollY + window.innerHeight > document.documentElement.scrollHeight - room - 1
      if (!inRoom) body.style.paddingBottom = ""
      return
    }
    const sync = () => {
      const spacer = document.querySelector<HTMLElement>("[data-buyer-tabs-room]")
      const under = spacer && spacer.offsetHeight > 0 ? spacer.offsetHeight : 0
      body.style.paddingBottom = `${Math.max(0, el.offsetHeight - under)}px`
    }
    sync()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync)
    ro?.observe(el)
    window.addEventListener("resize", sync)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", sync)
    }
  }, [shown, mounted, layer])
  useEffect(() => () => void (document.body.style.paddingBottom = ""), [])

  /*
    RISING OVER THE FIELD BEING TYPED IN: the page moves that field into the
    clear above where the bar will stop. Not while a phone keyboard is up
    (the visual viewport is much shorter than the window), when the bar is
    behind the keyboard anyway.
  */
  useEffect(() => {
    const el = ref.current
    if (!shown || !el) return
    const field = document.activeElement as HTMLElement | null
    if (!field || field === document.body || !field.closest("[data-account-settings]")) return
    const vv = window.visualViewport
    if (vv && vv.height < window.innerHeight - 120) return
    const lowered = !layer && phone && !tabsShown() ? px("--buyer-tabs-bar") : 0
    const top = window.innerHeight - el.offsetHeight + lowered
    const over = field.getBoundingClientRect().bottom + 12 - top
    if (over > 0) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ;(layer ?? window).scrollBy({ top: over, behavior: reduce ? "auto" : "smooth" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  if (!mounted) return <span ref={marker} hidden />

  /* Up: at rest, or lowered by the tab bar's row while the tab bar is away on a phone. Down: past the foot of the screen, its shadow too. */
  const translate = !shown ? "0 calc(100% + 16px)" : phone && !tabs ? "0 var(--buyer-tabs-bar)" : "0 0"

  return (
    <>
    <span ref={marker} hidden />
    {createPortal(
    <div
      ref={ref}
      data-account-save-bar={shown ? "shown" : "hidden"}
      data-account-save-bar-layer={layer ? "" : undefined}
      aria-hidden={!shown || undefined}
      inert={!shown}
      className={cn(
        "fixed inset-x-0 bottom-0 border-t border-[#e5e7eb] bg-white pt-3 shadow-[0_-4px_16px_-8px_rgba(16,24,40,0.12)]",
        /* Above the settings layer (z 420) when it is in one; above the page's own content otherwise. */
        layer ? "z-[430]" : "z-40",
        /* Down to the screen's foot: the tab bar's room under the row on a phone, the home indicator's wider up (and always in the layer, which covers the tab bar). */
        layer ? "pb-[calc(12px+env(safe-area-inset-bottom,0px))]" : "pb-[calc(12px+var(--buyer-tabs-room))] md:pb-[calc(12px+env(safe-area-inset-bottom,0px))]",
        "motion-reduce:transition-none!",
      )}
      style={{
        translate,
        transition: `translate ${SAVE_BAR_MS}ms ${EASE}, visibility 0s linear ${shown ? 0 : SAVE_BAR_MS}ms`,
        visibility: shown ? "visible" : "hidden",
      }}
    >
      <div className="mx-auto flex w-full max-w-[960px] items-center gap-2" style={{ paddingLeft: ACCOUNT_GUTTER_LEFT, paddingRight: ACCOUNT_GUTTER_RIGHT }} data-account-save-row="">
        <p className="min-w-0 flex-1 text-[13px] leading-[1.4] text-[#6b7280]" aria-live="polite" data-account-save-note="">
          {error ? (
            <span role="alert" className="line-clamp-2 text-[#b42318]">
              {error}
            </span>
          ) : (
            <span className="block truncate">Unsaved changes</span>
          )}
        </p>
        <button type="button" onClick={onDiscard} disabled={busy} className={QUIET} data-account-discard="">
          Discard
        </button>
        <button type="button" onClick={onSave} disabled={busy || disabled} className={INK} data-account-save="">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Save changes
        </button>
      </div>
    </div>,
    document.body,
    )}
    </>
  )
}
