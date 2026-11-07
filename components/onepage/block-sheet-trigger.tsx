"use client"

/**
 * AN EMBEDDING BLOCK AS A BUTTON ON THE PAGE (round AL).
 *
 * When a block's Interaction is "In a sheet" or "Go to the link"
 * (lib/onepage/block-sheet blockInteraction), the page shows the block as the
 * page's own button: its fill, corners, border, shadow and hover
 * (lib/onepage/block-look pressableProps), the service's mark on the left,
 * the title in the middle, and a line under it when there is one. A tap
 * either raises the block in the sheet (components/onepage/block-sheet) or
 * goes to the service's page.
 *
 * Without a sheet on the page (a block drawn on its own) "In a sheet" goes to
 * the address too, so a tap always leads somewhere.
 */

import type * as React from "react"
import { cn } from "@/lib/utils"
import { buttonPadScale, pressableProps } from "@/lib/onepage/block-look"
import type { OnePageTheme } from "@/lib/onepage/types"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { getOrCreateSessionId, getOrCreateVisitorId } from "@/lib/analytics-utils"
import { useBlockSheet, type BlockSheetRequest } from "./block-sheet"

/** A tap counted as the block's click, as a link's is (app/api/onepage/track). Never in the editor's preview. */
export function trackBlockTap(onepageId: string | null | undefined, blockId: string, url: string | null | undefined): void {
  if (!onepageId || isOnePagePreview()) return
  try {
    void fetch("/api/onepage/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        onepage_id: onepageId,
        block_id: blockId,
        event_type: "click",
        url: url || "",
        href: window.location.href,
        session_id: getOrCreateSessionId() || undefined,
        visitor_id: getOrCreateVisitorId() || undefined,
      }),
    }).catch(() => {})
  } catch {
    /* A count is never worth an error on the page. */
  }
}

export function BlockSheetButton({
  blockId,
  onepageId,
  theme,
  mode,
  title,
  subtitle,
  icon,
  href,
  still = false,
  small = false,
  sheet,
}: {
  blockId: string
  onepageId?: string | null
  theme: OnePageTheme
  mode: "sheet" | "direct"
  title: string
  subtitle?: string | null
  /** The service's own mark, drawn at 22px. */
  icon?: React.ReactNode
  /** Where "Go to the link" goes, and where "In a sheet" goes when no sheet is drawn. */
  href: string | null
  /** Inside a group or a carousel: the button keeps still, as a link there does. */
  still?: boolean
  /** The editor's small phone (0.8 of a real one). */
  small?: boolean
  /** What the sheet shows; built on the tap, so nothing of the embed loads before it. */
  sheet: () => Omit<BlockSheetRequest, "blockId">
}) {
  const api = useBlockSheet()
  const press = pressableProps(theme, still)
  const pad = buttonPadScale(theme)
  const k = small ? 0.8 : 1
  const inSheet = mode === "sheet" && api.available
  const onClick = (e: React.MouseEvent) => {
    trackBlockTap(onepageId, blockId, href)
    if (inSheet) {
      e.preventDefault()
      api.open({ blockId, ...sheet() })
      return
    }
    if (isOnePagePreview()) {
      e.preventDefault()
      showPreviewNotice("link")
    }
  }
  const inner = (
    <>
      <span aria-hidden className="grid shrink-0 place-items-center" style={{ width: 32 * k, height: 32 * k }}>
        {icon}
      </span>
      <span className="op-label relative flex min-w-0 flex-1 flex-col items-center text-center">
        <span data-block-title="" className="block w-full truncate font-semibold">
          {title}
        </span>
        {subtitle ? <span className="block w-full truncate opacity-70" style={{ fontSize: 13 * k }}>{subtitle}</span> : null}
      </span>
      <span aria-hidden className="shrink-0" style={{ width: 32 * k }} />
    </>
  )
  const common = {
    "data-hover": press["data-hover"],
    "data-shadow": press["data-shadow"],
    "data-block-sheet-trigger": mode,
    className: cn(press.className, "flex w-full items-center gap-2 font-medium [-webkit-tap-highlight-color:transparent]"),
    style: { ...press.style, minHeight: 56 * k, padding: `${10 * pad * k}px ${12 * k}px`, fontSize: 15 * k },
    onClick,
  }
  if (inSheet || !href) {
    return (
      <button type="button" aria-haspopup="dialog" {...common}>
        {inner}
      </button>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...common}>
      {inner}
    </a>
  )
}
