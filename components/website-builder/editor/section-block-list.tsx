"use client"

/**
 * ===========================================================================
 *  A SECTION'S BLOCKS, ONE ROW EACH, DRAGGED BY THE GRIP
 * ===========================================================================
 * The list under a section's settings: an FAQ's questions, a gallery's
 * pictures, a testimonial section's quotes. Every section with blocks draws
 * its list with this.
 *
 * A row is the grip, the block's name, then Duplicate, Delete and the
 * chevron. Tapping the name or the chevron opens the block's fields under it.
 * The row used to carry an up arrow and a down arrow as well, and a red bin.
 * The arrows are gone: the grip does the same job in one move, with a mouse
 * or a finger, through the same hook as the header's link list
 * (controls/use-reorder.ts). Arrow Up and Arrow Down on a focused grip still
 * move a block one place for the keyboard.
 *
 * Nothing is saved while a row is held. The lifted row follows the pointer
 * and the rest slide aside as paint; the new order is handed to `onReorder`
 * once, on release, which is the same save path (and the same undo step) the
 * arrows used.
 *
 * Delete is grey, a white key with a hairline and a soft foot like the
 * sidebar's other small buttons, and it stays grey under the pointer. Undo
 * brings a deleted block back, so the row does not need to shout.
 *
 * Picking a block up closes any open row first, so what moves is a row and
 * not a form. The grip is its own button, so a drag can never open or close
 * the row it started on.
 *
 * BLOCKS INSIDE BLOCKS. A theme block that holds blocks (a Group) draws its
 * own list inside its open row, with this same component, so a tree is a
 * list of lists and each level drags on its own. `rowKey` names a row by its
 * path (lib/website-builder/block-tree.ts), because a block's id is only
 * unique among its siblings. `fixed` rows are the static blocks a template
 * places itself: they open and edit like the rest, and have no grip, no
 * Duplicate and no Delete, since the template decides where they are.
 */
import * as React from "react"
import { ChevronDown, Copy, Eye, EyeOff, GripVertical, Lock, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { useReorder } from "./controls/use-reorder"
import { tt } from "@/lib/i18n/text"

export interface ListBlock {
  id: string
  type: string
  settings: Record<string, unknown>
  hidden?: boolean
  static?: boolean
}

/** A small key beside a row: white, a hairline, a soft foot. Grey at rest and under the pointer. */
export const ROW_ACTION =
  "inline-flex h-7 w-7 max-sm:h-9 max-sm:w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200/90 bg-white text-neutral-500 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-700 hover:shadow-[0_1px_3px_rgba(0,0,0,0.09)] active:bg-neutral-100 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15"

export function SectionBlockList<B extends ListBlock>({
  blocks,
  selectedId,
  onSelect,
  onReorder,
  onDuplicate,
  onRemove,
  title,
  fields,
  rowKey = (block: B) => block.id,
  fixed = [],
  onToggleHidden,
}: {
  blocks: B[]
  /** The block selected on the canvas or in the list: its row is open and ringed. */
  selectedId: string | null
  onSelect: (id: string) => void
  /** The whole list in its new order, once per drag or key press. */
  onReorder: (next: B[]) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  /** What the row is called, and an optional quieter word after it. */
  title: (block: B) => { name: string; detail?: string }
  /** The block's fields, drawn only while its row is open. */
  fields: (block: B) => React.ReactNode
  /** What a row is called in `selectedId`, `onSelect` and `data-block-row`: its path. */
  rowKey?: (block: B) => string
  /** Static blocks, above the rest: opened and edited, never moved or deleted. */
  fixed?: B[]
  /** Show or hide a block on the page without deleting it. */
  onToggleHidden?: (id: string) => void
}) {
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set(selectedId ? [selectedId] : []))

  /* A block selected from outside (the canvas, Add, Duplicate) opens its row, and the row of every block it sits inside. */
  const keys = [...fixed, ...blocks].map(rowKey).join("\n")
  React.useEffect(() => {
    if (!selectedId) return
    const row = keys.split("\n").find((k) => k && (selectedId === k || selectedId.startsWith(`${k}/`)))
    if (!row) return
    setOpen((prev) => (prev.has(row) ? prev : new Set(prev).add(row)))
  }, [selectedId, keys])

  const blocksRef = React.useRef(blocks)
  blocksRef.current = blocks

  const { listRef, gripProps, rowStyle } = useReorder<HTMLDivElement>({
    count: blocks.length,
    onMove: (from, to) => {
      const next = [...blocksRef.current]
      const [moved] = next.splice(from, 1)
      if (!moved) return
      next.splice(to, 0, moved)
      onReorder(next)
    },
    onStart: () => setOpen((prev) => (prev.size ? new Set() : prev)),
    nameOf: (i) => (blocksRef.current[i] ? title(blocksRef.current[i]).name : ""),
  })

  const toggle = (key: string) => {
    const id = key
    if (open.has(id)) {
      setOpen((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } else {
      setOpen((prev) => new Set(prev).add(id))
      onSelect(id)
    }
  }

  const row = (block: B, i: number, still: boolean) => {
    const { name, detail } = title(block)
    const key = rowKey(block)
    const expanded = open.has(key)
    const selected = selectedId === key
    const style = still ? undefined : rowStyle(i)
    const lifted = !!style?.zIndex
    return (
      <div key={key} data-reorder-row={still ? undefined : ""} data-block-row={key} data-block-static={still ? "" : undefined} style={style}>
        <div
          className={cn(
            "rounded-lg border bg-background transition-[border-color,box-shadow] duration-150",
            selected ? "border-foreground/40 ring-1 ring-foreground/15" : expanded ? "border-neutral-300" : "border-border",
            lifted && "border-neutral-300 shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
          )}
        >
          <div className="flex h-10 max-sm:h-12 items-center gap-1 pr-1 max-sm:pr-1.5">
            {still ? (
              <span className="flex h-full w-8 max-sm:w-10 shrink-0 items-center justify-center text-neutral-300" aria-hidden="true" title={tt("Placed by the section")}>
                <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
            ) : (
              <button
                type="button"
                aria-label={tt("Drag to reorder {name}", { name })}
                className="flex h-full w-8 max-sm:w-10 shrink-0 cursor-grab items-center justify-center rounded-l-lg text-neutral-400 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 active:cursor-grabbing"
                data-block-grip=""
                {...gripProps(i)}
              >
                <GripVertical className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              data-block-toggle=""
              className={cn("flex h-full min-w-0 flex-1 items-center gap-1.5 text-left", block.hidden && "opacity-50")}
              onClick={() => toggle(key)}
            >
              <span className="min-w-0 truncate text-sm font-medium">{name}</span>
              {detail && <span className="min-w-0 shrink truncate text-sm text-muted-foreground">{detail}</span>}
            </button>
            {onToggleHidden && (
              <button
                type="button"
                aria-label={block.hidden ? tt("Show {name}", { name }) : tt("Hide {name}", { name })}
                aria-pressed={!!block.hidden}
                data-block-hide=""
                className={cn(ROW_ACTION, block.hidden && "text-neutral-800")}
                onClick={() => onToggleHidden(key)}
              >
                {block.hidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
              </button>
            )}
            {!still && (
              <>
                <button type="button" aria-label={tt("Duplicate {name}", { name })} data-block-duplicate="" className={ROW_ACTION} onClick={() => onDuplicate(key)}>
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button type="button" aria-label={tt("Delete {name}", { name })} data-block-remove="" className={ROW_ACTION} onClick={() => onRemove(key)}>
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </>
            )}
            <button
              type="button"
              aria-label={expanded ? tt("Close {name}", { name }) : tt("Open {name}", { name })}
              aria-expanded={expanded}
              tabIndex={-1}
              className="flex h-full w-7 max-sm:w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => toggle(key)}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")} />
            </button>
          </div>
          {expanded && (
            <div className="space-y-3 border-t border-border p-3" data-block-panel="">
              {fields(block)}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2" data-block-list="">
      {fixed.length > 0 && <div className="space-y-2" data-block-fixed="">{fixed.map((b, i) => row(b, i, true))}</div>}
      <div ref={listRef} className="space-y-2">
        {blocks.map((b, i) => row(b, i, false))}
      </div>
    </div>
  )
}
