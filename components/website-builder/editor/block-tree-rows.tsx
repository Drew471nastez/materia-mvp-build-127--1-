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
import { ChevronRight, Eye, EyeOff, GripVertical, Plus } from "lucide-react"

import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { blockChoices, type BlockChoice } from "./add-block-button"
import type { BlockSchema } from "@/lib/website-builder/types"
import { useReorder } from "./controls/use-reorder"

export interface TreeBlock {
  id: string
  type: string
  settings: Record<string, unknown>
  hidden?: boolean
  static?: boolean
}

/** How far in a row is drawn: the section's own blocks one step, each level inside them one more. */
export const TREE_INDENT = 16
const BASE_INDENT = 32

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
  children,
  hasChildren,
  add,
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
  /** The level inside a block that holds blocks, or null. */
  children?: (block: B) => React.ReactNode
  hasChildren?: (block: B) => boolean
  /** The Add block row for this level, drawn after its rows. */
  add?: React.ReactNode
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
  const { listRef, gripProps, rowStyle } = useReorder<HTMLDivElement>({
    count: blocks.length,
    onMove: (from, to) => {
      const next = [...blocksRef.current]
      const [moved] = next.splice(from, 1)
      if (!moved) return
      next.splice(to, 0, moved)
      onReorder(next)
    },
  })

  const indent = BASE_INDENT + (depth - 1) * TREE_INDENT

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
            "group/block relative flex h-8 max-sm:h-11 cursor-pointer items-center gap-1 rounded-md pr-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neutral-900/15",
            selected ? "bg-[#ebecef] text-[#111827]" : "text-[#374151] hover:bg-[#f3f4f6]",
            lifted && "bg-white shadow-[0_6px_20px_rgba(0,0,0,0.12)]",
          )}
          style={{ paddingLeft: indent - 24 }}
        >
          {/* The grip, under the pointer only; on a phone always, since a finger has no hover. */}
          {still ? (
            <span aria-hidden className="h-6 w-6 shrink-0" />
          ) : (
            <button
              type="button"
              aria-label={`Drag to reorder ${name}`}
              data-block-grip=""
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md transition-opacity active:cursor-grabbing focus-visible:opacity-100 focus-visible:outline-none",
                "opacity-0 group-hover/block:opacity-100 max-sm:opacity-60",
                "hover:bg-black/[0.06]",
              )}
              {...gripProps(i)}
            >
              <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
          {holds ? (
            <button
              type="button"
              aria-label={expanded ? `Close ${name}` : `Open ${name}`}
              aria-expanded={expanded}
              data-tree-toggle=""
              onClick={(e) => {
                e.stopPropagation()
                setOpen((prev) => {
                  const next = new Set(prev)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })
              }}
              className={cn("-ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded", "hover:bg-black/[0.06]")}
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded && "rotate-90")} strokeWidth={2} />
            </button>
          ) : (
            <span aria-hidden className={cn("mx-[7px] h-1.5 w-1.5 shrink-0 rounded-full", selected ? "bg-[#6b7280]" : "bg-[#c4c7cd]")} />
          )}
          {/* Named by what it says, the way Shopify's tree does: five rows of "FAQ item" told nobody which question was which. */}
          <span className={cn("flex min-w-0 flex-1 items-baseline gap-1.5", block.hidden && "opacity-50")} title={detail ? `${name}: ${detail}` : name}>
            <span className="truncate text-[13px] max-sm:text-[15px] font-medium">{detail || name}</span>
          </span>
          {onToggleHidden && (
            <button
              type="button"
              aria-label={block.hidden ? `Show ${name}` : `Hide ${name}`}
              aria-pressed={!!block.hidden}
              data-block-hide=""
              onClick={(e) => {
                e.stopPropagation()
                onToggleHidden(key, block)
              }}
              className={cn(
                "h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                block.hidden ? "flex" : "hidden group-hover/block:flex group-focus-within/block:flex max-sm:flex",
                "text-[#4b5563] hover:bg-black/[0.06] hover:text-[#1a1a2e]",
              )}
            >
              {block.hidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
            </button>
          )}
        </div>
        {expanded && children && <div data-tree-children={key}>{children(block)}</div>}
      </div>
    )
  }

  return (
    <div data-block-tree-level={depth}>
      {fixed.length > 0 && <div data-tree-fixed="">{fixed.map((b, i) => row(b, i, true))}</div>}
      <div ref={listRef}>{blocks.map((b, i) => row(b, i, false))}</div>
      {add}
    </div>
  )
}

/**
 * ADD BLOCK, as a line of the tree: the plus disc and the words, at the
 * level's own indent, the way Add section sits under the sections. One kind
 * of block adds it at once; several open the same menu (a sheet on a phone)
 * the panel's button opened, one entry per preset.
 */
export function TreeAddBlock({
  options,
  depth,
  onAdd,
  disabledReason,
}: {
  options: readonly BlockSchema[]
  depth: number
  onAdd: (choice: BlockChoice) => void
  /** Why nothing more fits here; the line is left out when there is a reason. */
  disabledReason?: string | null
}) {
  const choices = React.useMemo(() => blockChoices(options), [options])
  const items = React.useMemo<ActionMenuItem[]>(() => choices.map((c) => ({ label: c.label, onClick: () => onAdd(c) })), [choices, onAdd])
  if (choices.length === 0 || disabledReason) return null
  /* "Add question", and "Add FAQ item" rather than "Add faq item": an acronym keeps its capitals. */
  const one = choices[0]?.label ?? ""
  const text = choices.length === 1 ? `Add ${/^[A-Z]{2,}\b/.test(one) ? one : one.charAt(0).toLowerCase() + one.slice(1)}` : "Add block"
  const indent = BASE_INDENT + (depth - 1) * TREE_INDENT
  const button = (
    <button
      type="button"
      data-add-block=""
      data-tree-add-block={depth}
      onClick={choices.length === 1 ? () => onAdd(choices[0]) : undefined}
      className="flex h-8 max-sm:h-11 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15"
      style={{ paddingLeft: indent - 2 }}
    >
      <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#d1d5db] text-[#6b7280]">
        <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
      {text}
    </button>
  )
  if (choices.length === 1) return button
  return <ResponsiveActionMenu title="Add block" align="start" menuWidth="w-60" items={items} trigger={button} />
}
