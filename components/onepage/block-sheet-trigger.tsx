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

import * as React from "react"
import { cn } from "@/lib/utils"
import { buttonPadScale, pressableProps } from "@/lib/onepage/block-look"
import type { OnePageTheme } from "@/lib/onepage/types"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { getOrCreateSessionId, getOrCreateVisitorId } from "@/lib/analytics-utils"
import { useBlockSheet, type BlockSheetRequest } from "./block-sheet"
import { noteTracked } from "./block-activity"
import { warmEmbed, type WarmProps } from "@/lib/onepage/embed-warm"

/** A tap counted as the block's click, as a link's is (app/api/onepage/track). Never in the editor's preview. */
export function trackBlockTap(onepageId: string | null | undefined, blockId: string, url: string | null | undefined): void {
  if (!onepageId || isOnePagePreview()) return
  /* Round AN: said, so the page's one listener (./block-activity) does not count the same tap a second time. */
  noteTracked()
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

/**
 * Round AS (lib/onepage/embed-warm): the button's service connected to once it has been on screen a moment and on a
 * pointer or focus, and, when `prewarm`, the sheet's content started hidden on a press or a resting mouse, so the embed
 * is loading before the tap lands. `sheet` is read when it starts, so the latest is used.
 */
export function useSheetWarm(href: string | null, on: boolean, prewarm: boolean, blockId: string, sheet: () => Omit<BlockSheetRequest, "blockId">): Partial<WarmProps> {
  const api = useBlockSheet()
  const latest = React.useRef(sheet)
  React.useEffect(() => {
    latest.current = sheet
  })
  return React.useMemo(() => (on ? warmEmbed(href, prewarm ? () => api.prewarm({ blockId, ...latest.current() }) : null) : {}), [on, href, prewarm, blockId, api])
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
  small = false,
  sheet,
  prewarm = false,
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
  /** Inside a group or a carousel. The button plays the page's hover there too (round 24); kept for callers. */
  still?: boolean
  /** The editor's small phone (0.8 of a real one). */
  small?: boolean
  /** What the sheet shows; built on the tap (or on the press, with `prewarm`). */
  sheet: () => Omit<BlockSheetRequest, "blockId">
  /** Start the sheet's content hidden before the tap lands (round AS). Never for a player that plays on its own. */
  prewarm?: boolean
}) {
  const api = useBlockSheet()
  const press = pressableProps(theme)
  const pad = buttonPadScale(theme)
  const k = small ? 0.8 : 1
  const inSheet = mode === "sheet" && api.available
  const warm = useSheetWarm(href, inSheet, prewarm, blockId, sheet)
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
    ...warm,
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
