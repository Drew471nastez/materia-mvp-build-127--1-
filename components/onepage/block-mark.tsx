"use client"

/**
 * ===========================================================================
 *  A BLOCK'S SERVICE MARK, IN THE LOOK ITS CREATOR PICKED (round 3)
 * ===========================================================================
 * The choice is Layout › Icon style (components/onepage/block-settings
 * BlockIconLookPicker), saved as style.presentation.icon_look, and the rule
 * for each look is lib/onepage/social-look blockMarkLook: the social row's
 * Solid, Outline and Glass, worked out the same way.
 *
 * A block that draws marks in several places (the app blocks draw theirs in
 * every layout, a sheet and a cover) does not pass the choice down by hand:
 * the block's root provides it (BlockIconLookScope) and every mark under it
 * reads it (useBlockIconLook).
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { blockMarkLook, type BlockIconLook } from "@/lib/onepage/social-look"
import type { MarkTone } from "./brand-icons"

const LookContext = React.createContext<BlockIconLook>("original")

export function BlockIconLookScope({ look, children }: { look: BlockIconLook; children: React.ReactNode }) {
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>
}

export function useBlockIconLook(): BlockIconLook {
  return React.useContext(LookContext)
}

/**
 * The mark on the tile of a chosen look. `draw` is handed the tone (one
 * colour, or the service's own for Glass) and draws the mark in
 * currentColor, which is the colour of the words where the tile sits.
 */
export function BlockMarkTile({
  look,
  size,
  inner,
  className,
  style,
  draw,
}: {
  look: Exclude<BlockIconLook, "original">
  /** The tile's side in px; left out, the caller's classes size it. */
  size?: number
  /** The mark's side in px; left out, 55% of the tile. */
  inner?: number
  className?: string
  style?: React.CSSProperties
  draw: (tone: MarkTone, size: number | string) => React.ReactNode
}) {
  const { tile, tone } = blockMarkLook(look, size)
  return (
    <span data-icon-look={look} className={cn("grid shrink-0 place-items-center", className)} style={{ ...tile, ...style }}>
      {draw(tone, inner ?? (size ? Math.round(size * 0.55) : "55%"))}
    </span>
  )
}
