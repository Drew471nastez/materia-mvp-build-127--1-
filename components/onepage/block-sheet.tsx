"use client"

/**
 * A BLOCK OPENED IN A SHEET ON THE PAGE (round AL).
 *
 * A visitor taps a block (a Calendly booking, a video, a form, a post) and
 * either goes straight to its address or sees it in a sheet that rises over
 * the page: a title at the top, the block's own content, and a bar at the
 * foot with the block's button, Share and Close. The creator picks which, per
 * block, with `open_mode` on the block's data.
 *
 * This file is the shared contract. Blocks call useBlockSheet().open(...);
 * BlockSheetProvider (drawn once around the public page and the editor's
 * preview) owns the sheet itself, its motion, focus, scroll lock and history.
 */

import { createContext, useContext, type ReactNode } from "react"

export type OpenMode = "sheet" | "direct"

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

/** A block's chosen behaviour on tap. Blocks that embed something default to the sheet; plain links go direct. */
export function openModeOf(data: unknown, fallback: OpenMode = "direct"): OpenMode {
  const mode = (data as { open_mode?: unknown } | null | undefined)?.open_mode
  return mode === "sheet" || mode === "direct" ? mode : fallback
}

/** Placeholder provider until the sheet itself lands: blocks fall back to opening the address directly. */
export function BlockSheetProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
