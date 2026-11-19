"use client"

/**
 * The block sheet's contract on its own (round AN), so a part that only asks
 * for the sheet (components/forms/action-frame, drawn on creator pages and
 * websites too) does not bring the sheet itself, and with it the shared
 * bottom sheet, into a visitor page's first script
 * (tests/pubperf-r48.test.ts). The sheet is ./block-sheet, which re-exports
 * all of this unchanged.
 */
import { createContext, useContext, type ReactNode } from "react"

export interface BlockSheetRequest {
  /** The block that opened it, for analytics and to restore focus on close. */
  blockId: string
  /** The line at the top of the sheet: "Calendly", the video's title. */
  title: string
  /** What the sheet shows. Rendered lazily: only while the sheet is open. */
  body: ReactNode
  /** The block's own button in the bar at the foot ("Book a call"), when it has one. */
  cta?: { label: string; href?: string | null; icon?: ReactNode; onClick?: () => void } | null
  /** The address Share copies or hands to the system share sheet. Left out, Share is not drawn. */
  shareUrl?: string | null
  /** Let the body use the sheet's full height (an embed) instead of its natural height (a form). */
  fill?: boolean
  /**
   * Round AS: no bar at the foot; the body draws its own main button (the tip sheet's Continue, full width) and a
   * round Close sits at the top right instead. Swipe, the dimmed page, Escape and Back close it as ever.
   */
  footless?: boolean
  /** Told once when the sheet starts to close, however it was closed. */
  onClose?: () => void
  /**
   * Told once the sheet has gone AND its history entry with it (round AN):
   * the moment to leave the page (a WhatsApp chat after a form), so the
   * Back the sheet takes off its own entry never lands after the new page
   * has been asked for.
   */
  onGone?: () => void
}

export interface BlockSheetApi {
  open: (request: BlockSheetRequest) => void
  close: () => void
  /**
   * Round AS: start a sheet's content hidden, before the tap lands (a mouse
   * resting on the button, a finger coming down on it), so an embed in it is
   * already loading when the sheet rises (lib/onepage/embed-warm). Never for
   * content that plays on its own. Does nothing where no sheet is drawn.
   */
  prewarm: (request: BlockSheetRequest) => void
  /** False where no provider is drawn (a block rendered on its own): callers then go to the address directly. */
  available: boolean
}

const NONE: BlockSheetApi = { open: () => {}, close: () => {}, prewarm: () => {}, available: false }

export const BlockSheetContext = createContext<BlockSheetApi>(NONE)

/**
 * True inside the sheet's body: a post drawn there shows whole
 * (components/onepage/compact-post), and a frame there loads at once rather
 * than lazily (round AS), since the sheet is on screen the moment it exists.
 */
export const InBlockSheetContext = createContext(false)

/**
 * THE PAGE'S "ON HOVER" (round 24), for the buttons a OnePage draws in the sheet's own colours rather than the page's
 * button (the sheet's main button, a form's Send): they play the same choice (`.op-btn` with `.op-sheet-btn`,
 * app/globals.css). Null where no OnePage is drawn around them (a website's form, the creator page), which keep their
 * own look.
 */
/**
 * True when a key went to a control whose own popup is open (a dropdown's list, components/forms/form-select): the
 * sheet or card round it leaves Escape to that control, which closes its list and keeps the sheet up.
 */
export function popupOpenAt(target: EventTarget | null): boolean {
  const el = target as Element | null
  return !!el?.closest?.('[aria-haspopup="listbox"][aria-expanded="true"]')
}

export const PageHoverContext = createContext<string | null>(null)

export function usePageHover(): string | null {
  return useContext(PageHoverContext)
}

export function useInBlockSheet(): boolean {
  return useContext(InBlockSheetContext)
}

export function useBlockSheet(): BlockSheetApi {
  return useContext(BlockSheetContext)
}

/**
 * BACK INSIDE THE SHEET (round AR). Something in the sheet with steps (a
 * form, a booking) takes Back while it has a step to go back to: the
 * browser's Back, Android's back gesture and the sheet's own history entry
 * then move it a step back instead of closing the sheet. `take` returns the
 * function that gives Back up again. The handler answers true when it used
 * the press. Null where no sheet is drawn around it.
 */
export interface SheetBackApi {
  take: (handler: () => boolean) => () => void
}

export const SheetBackContext = createContext<SheetBackApi | null>(null)

export function useSheetBack(): SheetBackApi | null {
  return useContext(SheetBackContext)
}
