"use client"

/**
 * A space's icon where a space is drawn on its own (the chat's head): the
 * emoji its admin set, or its kind's, the same rule as the chips and the
 * dashboard (space-glyph.ts, round 12). It used to draw a line icon for the
 * word names, which is not what the admin sees for that space.
 */
import { spaceGlyph } from "./space-glyph"

export function SpaceIcon({ icon, kind, className = "" }: { icon: string | null; kind?: string; className?: string }) {
  return (
    <span aria-hidden className={`inline-flex w-[18px] justify-center text-[15px] leading-none ${className}`} data-space-glyph="">
      {spaceGlyph(icon, kind)}
    </span>
  )
}
