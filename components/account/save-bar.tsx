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
 * On /account/settings the bar is fixed to the viewport and portalled to
 * <body>. In the edit-profile sheet (settings-subpage.tsx) it docks into
 * [data-sheet-save-dock] at the foot of the sheet so it stays tappable and
 * does not need a tall padding band on the scroll area.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { ACCOUNT_GUTTER_LEFT, ACCOUNT_GUTTER_RIGHT } from "@/lib/account/account-tabs"
import { ACCOUNT_SAVE_BAR_Z } from "@/lib/account/settings-sheet"
import { useFirstTap } from "@/lib/navigation/first-tap"
import { cn } from "@/lib/utils"

/** The phone tab bar's own curve (components/nav/buyer-tab-bar.tsx), so the two move together. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
export const SAVE_BAR_MS = 300

/* The settings' own buttons (components/account/account-settings.tsx INK and QUIET). */
const INK =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] " +
  "disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:rounded-lg sm:text-[13px] [-webkit-tap-highlight-color:transparent] touch-manipulation"
const QUIET =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-xl px-3 text-[14px] font-medium text-[#4b5563] transition-colors " +
  "hover:bg-[#f3f4f6] hover:text-[#1a1a2e] active:bg-[#eceef1] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:rounded-lg sm:text-[13px] [-webkit-tap-highlight-color:transparent] touch-manipulation"

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

function saveDock(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-sheet-save-dock]")
}

/** The element that scrolls (settings sheet scroll region, sheet root, or the document). */
function scrollRoot(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("[data-settings-sheet-scroll]") ??
    document.querySelector<HTMLElement>("[data-edit-profile-sheet]") ??
    document.body
  )
}

function settingsSheetOpen(): boolean {
  return !!document.querySelector("[data-edit-profile-sheet]")
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
  const [docked, setDocked] = useState(false)
  useLayoutEffect(() => {
    setMounted(true)
    setDocked(!!saveDock())
  }, [])
  const { phone, tabs } = usePhoneTabs()

  const saveTap = useFirstTap(() => {
    if (busy || disabled) return false
    onSave()
    return true
  })
  const discardTap = useFirstTap(() => {
    if (busy) return false
    onDiscard()
    return true
  })

  useLayoutEffect(() => {
    if (!mounted) return
    const sync = () => setDocked(!!saveDock())
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [mounted])

  /*
    THE ROOM IT TAKES, AT THE END OF THE DOCUMENT, on the full settings page
    only. The edit-profile sheet docks the bar instead (no padding band).
  */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !mounted || docked || settingsSheetOpen()) return
    const target = document.body
    const root = scrollRoot()
    if (!shown) {
      const room = parseFloat(target.style.paddingBottom) || 0
      if (!room) return
      const scrollEl = root === document.body ? document.documentElement : root
      const inRoom =
        root === document.body
          ? window.scrollY + window.innerHeight > scrollEl.scrollHeight - room - 1
          : root.scrollTop + root.clientHeight > root.scrollHeight - room - 1
      if (!inRoom) target.style.paddingBottom = ""
      return
    }
    const sync = () => {
      const spacer = document.querySelector<HTMLElement>("[data-buyer-tabs-room]")
      const under = spacer && spacer.offsetHeight > 0 ? spacer.offsetHeight : 0
      target.style.paddingBottom = `${Math.max(0, el.offsetHeight - under)}px`
    }
    sync()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync)
    ro?.observe(el)
    window.addEventListener("resize", sync)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", sync)
    }
  }, [shown, mounted, docked])
  useEffect(() => () => {
    document.body.style.removeProperty("padding-bottom")
    document.querySelector<HTMLElement>("[data-settings-sheet-body]")?.style.removeProperty("padding-bottom")
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!shown || !el || docked) return
    const field = document.activeElement as HTMLElement | null
    if (!field || field === document.body || !field.closest("[data-account-settings]")) return
    const vv = window.visualViewport
    if (vv && vv.height < window.innerHeight - 120) return
    const lowered = phone && !tabsShown() ? px("--buyer-tabs-bar") : 0
    const top = window.innerHeight - el.offsetHeight + lowered
    const over = field.getBoundingClientRect().bottom + 12 - top
    if (over > 0) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      const root = scrollRoot()
      if (root === document.body) window.scrollBy({ top: over, behavior: reduce ? "auto" : "smooth" })
      else root.scrollBy({ top: over, behavior: reduce ? "auto" : "smooth" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, docked])

  if (!mounted) return null

  const sheet = docked || settingsSheetOpen()
  const translate = docked
    ? "0 0"
    : !shown
      ? "0 calc(100% + 16px)"
      : phone && !tabs
        ? "0 var(--buyer-tabs-bar)"
        : "0 0"

  const portalTarget = saveDock() ?? document.body

  return createPortal(
    <div
      ref={ref}
      data-account-save-bar={shown ? "shown" : "hidden"}
      aria-hidden={!shown || undefined}
      inert={!shown}
      className={cn(
        docked
          ? "w-full overflow-hidden border-t border-[#e5e7eb] bg-white shadow-[0_-4px_16px_-8px_rgba(16,24,40,0.12)]"
          : "fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white pt-3 shadow-[0_-4px_16px_-8px_rgba(16,24,40,0.12)]",
        docked ? (shown ? "max-h-[120px] opacity-100 pt-3" : "max-h-0 border-transparent pt-0 pb-0 opacity-0 shadow-none") : "pt-3",
        docked
          ? "pb-[calc(12px+env(safe-area-inset-bottom,0px))]"
          : "pb-[calc(12px+var(--buyer-tabs-room))] md:pb-[calc(12px+env(safe-area-inset-bottom,0px))]",
        "motion-reduce:transition-none!",
      )}
      style={{
        translate: docked ? undefined : translate,
        zIndex: sheet ? ACCOUNT_SAVE_BAR_Z : 40,
        transition: docked
          ? `max-height ${SAVE_BAR_MS}ms ${EASE}, opacity ${SAVE_BAR_MS}ms ${EASE}, padding ${SAVE_BAR_MS}ms ${EASE}`
          : `translate ${SAVE_BAR_MS}ms ${EASE}, visibility 0s linear ${shown ? 0 : SAVE_BAR_MS}ms`,
        visibility: shown ? "visible" : "hidden",
        pointerEvents: shown ? "auto" : "none",
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
        <button
          type="button"
          onClick={discardTap.onClick}
          onPointerDown={discardTap.onPointerDown}
          onPointerUp={discardTap.onPointerUp}
          onPointerCancel={discardTap.onPointerCancel}
          disabled={busy}
          className={QUIET}
          data-account-discard=""
        >
          Discard
        </button>
        <button
          type="button"
          onClick={saveTap.onClick}
          onPointerDown={saveTap.onPointerDown}
          onPointerUp={saveTap.onPointerUp}
          onPointerCancel={saveTap.onPointerCancel}
          disabled={busy || disabled}
          className={INK}
          data-account-save=""
        >
          {busy ? (
            <span className="inline-flex shrink-0" aria-hidden="true">
              <ActivitySpinner size={16} label="Saving" className="text-white/90" />
            </span>
          ) : null}
          Save changes
        </button>
      </div>
    </div>,
    portalTarget,
  )
}
