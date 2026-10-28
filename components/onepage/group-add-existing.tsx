"use client"

/**
 * ===========================================================================
 *  ADD TO GROUP: THE BLOCKS ALREADY ON THE PAGE, FIRST
 * ===========================================================================
 * Round 41, the owner: "When I click to add a block in a group, show me the
 * blocks I already have so I can add them there, or the rest of the blocks
 * from the whole picker."
 *
 * The Add to group sheet is the Add block sheet with one more section at the
 * top of All: the page's own blocks that may go in (lib/onepage/group
 * groupCandidates). A press moves that block into the group in one edit
 * (moveIntoGroup), the same edit a card dropped on the group makes, so one
 * Undo puts it back. Under it, the whole catalogue, as Add block shows it.
 *
 * The rows are the picker's own rows (./add-block-picker EntryRow): the grey
 * tile, a name and one line, a calm tint on a press.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { BlockTile, type Glyph } from "@/components/onepage/block-icons"

export type GroupCandidateRow = {
  id: string
  title: string
  subtitle: string
  icon: Glyph
  thumbnail_url?: string | null
}

export function GroupExistingBlocks({ rows, onMove }: { rows: GroupCandidateRow[]; onMove: (id: string) => void }) {
  if (rows.length === 0) return null
  return (
    <section data-picker-section="on-page" data-shown="" className="pb-2">
      <h3 className="px-2 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]" data-picker-heading="on-page">
        {tt("On your page")}
      </h3>
      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <button
              key={row.id}
              type="button"
              data-group-candidate={row.id}
              onClick={() => onMove(row.id)}
              aria-label={tt("Move {title} into this group", { title: row.title })}
              className={cn(
                "flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left outline-none [-webkit-tap-highlight-color:transparent]",
                "cursor-pointer transition-[background-color] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)] active:bg-[#f0f0f2] hover:bg-[#f6f6f7] motion-reduce:transition-none",
              )}
            >
              {row.thumbnail_url ? (
                <BlockTile className="overflow-hidden">
                  <img src={row.thumbnail_url} alt="" decoding="async" className="h-full w-full object-cover" />
                </BlockTile>
              ) : (
                <BlockTile icon={Icon} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium leading-5 text-[#111113]">{row.title}</span>
                <span className="block truncate text-[12.5px] leading-[18px] text-[#6b7280]">{row.subtitle || tt("On your page")}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
