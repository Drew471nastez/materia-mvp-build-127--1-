"use client"

/**
 * One ink fill that glides to the chosen space chip (components/ui/pill-glider.tsx).
 * Each chip used to fill itself: the old one emptied and the new one filled in
 * the same frame, which read as a flash and a bump ("the click of the pill
 * shape of the spaces is glitchy and flashy and bumpy"). The chosen chip
 * drops its own fill once the row has `data-glide` (space-chips.tsx CHIP_ON).
 */
import { PillGlider } from "@/components/ui/pill-glider"

export function ChipGlider({ active }: { active: string }) {
  return (
    <PillGlider
      active={active}
      className="bg-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.2),0_2px_5px_-2px_rgba(16,24,40,0.22),inset_0_1px_0_rgba(255,255,255,0.09)]"
    />
  )
}
