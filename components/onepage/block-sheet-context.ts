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
  /** False where no provider is drawn (a block rendered on its own): callers then go to the address directly. */
  available: boolean
}

const NONE: BlockSheetApi = { open: () => {}, close: () => {}, available: false }

export const BlockSheetContext = createContext<BlockSheetApi>(NONE)

export function useBlockSheet(): BlockSheetApi {
  return useContext(BlockSheetContext)
}
