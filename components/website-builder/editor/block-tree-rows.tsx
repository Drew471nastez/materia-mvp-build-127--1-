"use client"

/**
 * ===========================================================================
 *  A SECTION'S BLOCKS, IN THE SIDEBAR'S TREE, THE WAY SHOPIFY SHOWS THEM
 * ===========================================================================
 * Blocks used to be a list at the bottom of the section's own settings: a
 * card per block, each with a grip, its name squeezed to a letter by four
 * buttons (eye, copy, bin, chevron), and the block's whole form opening
 * inside the card. "Look how bad the UI is... blocks should not be in the
 * section settings; the section should have blocks under it in the sidebar,
 * like Shopify has."
 *
 * So the blocks are where the page's structure is: in the tree, one quiet
 * line each under the section they belong to, indented a step per level.
 * The name and a word of what it says; the grip and the eye only under the
 * pointer (always on a phone, where there is no pointer to hover with).
 * Tapping a line opens that block's own settings panel, with nothing else in
 * it, and Back returns here. Duplicate and Delete live on that panel, pinned
 * at its foot like a section's, so a row never carries a bin.
 *
 * A block that holds blocks (a Group, a card with a static title inside it)
 * has a chevron, and its children are the same rows one step further in.
 * Static blocks, which the template places, have no grip: they open and
 * edit like the rest and cannot be moved.
 *
 * Reordering is the same pointer and keyboard path the list used
 * (controls/use-reorder.ts), one level at a time, committed once on
 * release. The tree's own geometry, nothing more: what a block IS, what it
 * may hold and how many, is still decided by the page through `ops`.
 */
import * as React from "react"
import { Eye, EyeOff, GripVertical, Trash2 } from "lucide-react"

import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { blockChoices, type BlockChoice } from "./add-block-button"
import { useBlockPicker, type BlockPickerRequest } from "./block-picker"
import type { BlockSchema } from "@/lib/website-builder/types"
import { useReorder } from "./controls/use-reorder"
import { TREE_NAME, TREE_ROW, TREE_STEP, TreeAddRow, TreeInsertLine, TreeSpacer, TreeTwisty, foldAway, rowIndent } from "./tree-parts"
import { tt } from "@/lib/i18n/text"

export interface TreeBlock {
  id: string
  type: string
  settings: Record<string, unknown>
  hidden?: boolean
  static?: boolean
}

/** How far in a row is drawn: one column per level, so a block's mark lands under the name of what holds it. */
export const TREE_INDENT = TREE_STEP

export function BlockTreeLevel<B extends TreeBlock>({
  blocks,
  fixed = [],
  depth,
  rowKey,
  title,
  selectedKey,
  onSelect,
  onReorder,
  onToggleHidden,
  onRemove,
  canNest,
  onNest,
  children,
  hasChildren,
  add,
  insertLine,
}: {
  /** The blocks this level holds that can be moved. */
  blocks: B[]
  /** Static blocks the template places, drawn first, never moved. */
  fixed?: B[]
  /** 1 for a section's own blocks, 2 for the blocks inside those, and so on. */
  depth: number
  rowKey: (block: B) => string
  title: (block: B) => { name: string; detail?: string }
  selectedKey: string | null
  onSelect: (key: string) => void
  onReorder: (next: B[]) => void
  onToggleHidden?: (key: string, block: B) => void
  /**
   * Delete a block from its row, as a section is deleted from its own: the
   * bin under the pointer, and on the selected row on a phone. Grey, like
   * every other row action; undo brings it back. Static blocks have none.
   */
  onRemove?: (key: string, block: B) => void
  /**
   * DRAGGED SIDEWAYS, A BLOCK GOES IN OR OUT. Right, by most of one tree
   * step, puts it inside the block above it; left takes it out of the block
   * it is in, to just after it. Only where the page says the move is allowed
   * (the block above takes that kind of block, the level outside does too).
   */
  canNest?: (index: number, dir: 1 | -1) => boolean
  onNest?: (index: number, dir: 1 | -1) => void
  /** The level inside a block that holds blocks, or null. */
  children?: (block: B) => React.ReactNode
  hasChildren?: (block: B) => boolean
  /** The Add block row for this level, drawn after its rows. */
  add?: React.ReactNode
  /** The line between two movable rows that adds a block there: before row `index` of `blocks`. */
  insertLine?: (index: number) => React.ReactNode
}) {
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set())
  /* A block selected from anywhere (the canvas, Add, Duplicate) opens every row it sits inside. */
  const keys = [...fixed, ...blocks].map(rowKey).join("\n")
  React.useEffect(() => {
    if (!selectedKey) return
    const row = keys.split("\n").find((k) => k && selectedKey.startsWith(`${k}/`))
    if (!row) return
    setOpen((prev) => (prev.has(row) ? prev : new Set(prev).add(row)))
  }, [selectedKey, keys])

  const blocksRef = React.useRef(blocks)
  blocksRef.current = blocks
  const { listRef, gripProps, rowStyle, drag, nesting } = useReorder<HTMLDivElement>({
    count: blocks.length,
    onMove: (from, to) => {
      const next = [...blocksRef.current]
      const [moved] = next.splice(from, 1)
      if (!moved) return
      next.splice(to, 0, moved)
      onReorder(next)
    },
    nest: canNest && onNest ? { step: TREE_STEP, can: canNest, onNest } : undefined,
  })
  /* The block a row would go into, let go now: drawn so the answer shows before the pointer lifts. */
  const into = drag && nesting === 1 ? drag.from - 1 : -1

  const row = (block: B, i: number, still: boolean) => {
    const key = rowKey(block)
    const { name, detail } = title(block)
    const selected = selectedKey === key
    const holds = !!hasChildren?.(block)
    const expanded = holds && open.has(key)
    const style = still ? undefined : rowStyle(i)
    const lifted = !!style?.zIndex
    return (
      <div key={key} data-reorder-row={still ? undefined : ""} data-tree-block={key} style={style}>
        <div
          role="button"
          tabIndex={0}
          aria-label={detail ? `${name}: ${detail}` : name}
          aria-current={selected || undefined}
          data-block-static={still ? "" : undefined}
          onClick={() => onSelect(key)}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return
            e.preventDefault()
            onSelect(key)
          }}
          className={cn(
            TREE_ROW,
            "group/block",
            selected ? "bg-[#ebecef] text-[#111827]" : "text-[#374151] hover:bg-[#f3f4f6]",
            lifted && "bg-white shadow-[0_6px_20px_rgba(0,0,0,0.12)]",
            !still && i === into && "bg-[#f3f4f6] shadow-[inset_0_0_0_1px_#d4d7dd]",
          )}
          style={{ paddingLeft: rowIndent(depth) }}
        >
          {/* The chevron column, empty on a block that holds nothing: the marks below still line up. */}
          {holds ? (
            <TreeTwisty
              expanded={expanded}
              onToggle={() =>
                setOpen((prev) => {
                  const next = new Set(prev)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })
              }
              label={expanded ? tt("Close {name}", { name }) : tt("Open {name}", { name })}
              data-tree-toggle=""
            />
          ) : (
            <TreeSpacer />
          )}
          {/* ONE MARK COLUMN: the dot at rest, the grip under the pointer, in the same twenty pixels a section's grip takes. */}
          {still ? (
            <span aria-hidden className="flex h-6 w-5 shrink-0 items-center justify-center max-sm:h-8">
              <span className={cn("h-1.5 w-1.5 rounded-full", selected ? "bg-[#6b7280]" : "bg-[#c4c7cd]")} />
            </span>
          ) : (
            <span className="relative flex h-6 w-5 shrink-0 items-center justify-center max-sm:h-8">
              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full transition-opacity group-hover/block:opacity-0 max-sm:opacity-0", selected ? "bg-[#6b7280]" : "bg-[#c4c7cd]")} />
              <button
                type="button"
                aria-label={tt("Drag to reorder {name}", { name })}
                data-block-grip=""
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "absolute inset-0 flex cursor-grab touch-none items-center justify-center rounded text-[#6b7280] transition-opacity active:cursor-grabbing focus-visible:opacity-100 focus-visible:outline-none",
                  "opacity-0 group-hover/block:opacity-100 max-sm:opacity-60",
                  "hover:bg-black/[0.06] hover:text-[#1a1a2e]",
                )}
                {...gripProps(i)}
              >
                <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </span>
          )}
          {/* Named by what it says, the way Shopify's tree does: five rows of "FAQ item" told nobody which question was which. */}
          <span className={cn(TREE_NAME, block.hidden && "opacity-50")} title={detail ? `${name}: ${detail}` : name}>
            {detail || name}
          </span>
          {onToggleHidden && (
            <button
              type="button"
              aria-label={block.hidden ? tt("Show {name}", { name }) : tt("Hide {name}", { name })}
              aria-pressed={!!block.hidden}
              data-block-hide=""
              onClick={(e) => {
                e.stopPropagation()
                onToggleHidden(key, block)
              }}
              className={cn(
                "ml-0.5 h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                block.hidden ? "flex" : "hidden group-hover/block:flex group-focus-within/block:flex max-sm:flex",
                "text-[#4b5563] hover:bg-black/[0.06] hover:text-[#1a1a2e]",
              )}
            >
              {block.hidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          )}
          {onRemove && !still && (
            <button
              type="button"
              aria-label={tt("Delete {value}", { value: detail || name })}
              title={tt("Delete")}
              data-block-remove=""
              onClick={(e) => {
                e.stopPropagation()
                /* Folds away first, as a section's row does (tree-parts foldAway). */
                const wrap = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-tree-block]")
                foldAway(wrap, () => onRemove(key, block))
              }}
              className={cn(
                "h-6 w-6 shrink-0 items-center justify-center rounded-md transition-[background-color,scale] duration-150 active:scale-90 max-sm:h-8 max-sm:w-8",
                selected ? "flex" : "hidden group-hover/block:flex group-focus-within/block:flex",
                "text-[#4b5563] hover:bg-black/[0.06] hover:text-[#1a1a2e]",
              )}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
        {expanded && children && <div data-tree-children={key}>{children(block)}</div>}
        {!still && !lifted && insertLine && i < blocks.length - 1 ? insertLine(i + 1) : null}
      </div>
    )
  }

  return (
    <div data-block-tree-level={depth}>
      {fixed.length > 0 && <div data-tree-fixed="">{fixed.map((b, i) => row(b, i, true))}</div>}
      <div ref={listRef} data-tree-nesting={drag && nesting ? (nesting === 1 ? "in" : "out") : undefined}>{blocks.map((b, i) => row(b, i, false))}</div>
      {add}
    </div>
  )
}

/** Where an Add block row adds, for the picker's preview: the section, the level in it, and the rules for room. */
export type BlockAddTarget = Pick<BlockPickerRequest, "section" | "parent" | "index" | "reasonFor">

/**
 * ADD BLOCK, the same line as Add section (tree-parts.tsx), at this level's
 * own indent: the plus in the mark column and the words on the names' edge.
 * One kind of block adds it at once. Several open the block picker
 * (block-picker.tsx): beside the sidebar on a computer, a sheet on a phone,
 * each block shown in this section before it is added. Without a target
 * (outside the editor's tree) the action menu, one entry per preset.
 */
export function TreeAddBlock({
  options,
  depth,
  onAdd,
  disabledReason,
  target,
}: {
  options: readonly BlockSchema[]
  depth: number
  onAdd: (choice: BlockChoice) => void
  /** Why nothing more fits here; the line is left out when there is a reason. */
  disabledReason?: string | null
  target?: BlockAddTarget
}) {
  const choices = React.useMemo(() => blockChoices(options), [options])
  const items = React.useMemo<ActionMenuItem[]>(() => choices.map((c) => ({ label: c.label, onClick: () => onAdd(c) })), [choices, onAdd])
  const openPicker = useBlockPicker()
  if (choices.length === 0 || disabledReason) return null
  /* "Add question", and "Add FAQ item" rather than "Add faq item": an acronym keeps its capitals. */
  const one = choices[0]?.label ?? ""
  const text = choices.length === 1 ? tt("Add {value}", { value: /^[A-Z]{2,}\b/.test(one) ? one : one.charAt(0).toLowerCase() + one.slice(1) }) : tt("Add block")
  const pick = openPicker && target && choices.length > 1
    ? (e: React.MouseEvent<HTMLElement>) => openPicker({ ...target, anchor: e.currentTarget, options, choices, onAdd })
    : undefined
  const button = <TreeAddRow data-add-block="" data-tree-add-block={depth} depth={depth} label={text} aria-haspopup={pick ? "dialog" : undefined} onClick={choices.length === 1 ? () => onAdd(choices[0]) : pick} />
  if (choices.length === 1 || pick) return button
  return <ResponsiveActionMenu title={tt("Add block")} align="start" menuWidth="w-60" items={items} trigger={button} />
}


/**
 * THE LINE BETWEEN TWO BLOCKS THAT ADDS ONE THERE, the same line as between
 * two sections. One kind of block here adds it at once; several open the
 * block picker, and the choice lands at this spot.
 */
export function TreeInsertBlock({ options, depth, onAdd, target }: { options: readonly BlockSchema[]; depth: number; onAdd: (choice: BlockChoice) => void; target?: BlockAddTarget }) {
  const choices = React.useMemo(() => blockChoices(options), [options])
  const items = React.useMemo<ActionMenuItem[]>(() => choices.map((c) => ({ label: c.label, onClick: () => onAdd(c) })), [choices, onAdd])
  const openPicker = useBlockPicker()
  if (choices.length === 0) return null
  const pick = openPicker && target && choices.length > 1
    ? (e: React.MouseEvent<HTMLElement>) => openPicker({ ...target, anchor: e.currentTarget, options, choices, onAdd })
    : undefined
  const line = <TreeInsertLine data-insert-block="" depth={depth} label={tt("Add a block here")} onClick={choices.length === 1 ? () => onAdd(choices[0]) : pick ?? (() => {})} />
  if (choices.length === 1 || pick) return line
  return <ResponsiveActionMenu title={tt("Add block")} align="start" menuWidth="w-60" items={items} trigger={line} />
}
