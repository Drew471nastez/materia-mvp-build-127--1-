"use client"

/**
 * ===========================================================================
 *  A LIST OF LINKS, ONE ROW EACH
 * ===========================================================================
 * The header's navigation and every menu in Theme settings › Menus are edited
 * with this. It used to show everything at once: the text, the URL, a "Links
 * to" select, a "Handle" nobody knew the meaning of, an open-in-new-tab
 * switch, a "Submenu links" block on every link and a red bin on every row.
 *
 * Now a link is one row: the grip, its text, and where it goes in a few
 * words ("Shop", "instagram.com"). Tapping it opens two fields, Label and
 * Link, where Link is the same picker every link setting uses (pages,
 * products, or any address). Removing and adding a sub-link are quiet text
 * actions inside the opened row. Sub-links sit indented under their parent.
 *
 * Rows are reordered by dragging the grip, with a mouse or a finger
 * (use-reorder.ts), or with the arrow keys on a focused grip.
 */
import * as React from "react"
import { ChevronDown, GripVertical, Plus } from "lucide-react"

import { LinkPicker, useLinkTargets, type LinkTarget } from "@/components/website-builder/link-picker"
import {
  NEW_LINK_LABEL,
  describeLink,
  moveNavBlock,
  navBlocksToItems,
  type LinkItem,
  type NavBlock,
} from "@/lib/website-builder/nav-links"
import { cn } from "@/lib/utils"
import { INPUT, TEXT_BUTTON } from "./styles"
import { useReorder } from "./use-reorder"

export { NEW_LINK_LABEL, describeLink, type LinkItem }

export interface LinkListEditorProps {
  items: LinkItem[]
  onLabel: (id: string, label: string) => void
  onUrl: (id: string, url: string) => void
  onRemove: (id: string) => void
  /** Add a link at the end of the top level (`null`) or under a link. */
  onAdd: (parentId: string | null) => void
  /** Move within one level: the top level (`null`) or one link's sub-links. */
  onMove: (parentId: string | null, from: number, to: number) => void
  /** Whether links can have sub-links. */
  nested?: boolean
  maxLinks?: number
  maxSubLinks?: number
  maxLabel?: number
  disabled?: boolean
}

type Ctx = LinkListEditorProps & {
  open: string | null
  setOpen: (id: string | null) => void
  add: (parentId: string | null) => void
  targets: LinkTarget[]
}

function LinkRow({ item, depth, ctx, grip, style }: {
  item: LinkItem
  depth: number
  ctx: Ctx
  grip: React.HTMLAttributes<HTMLElement> & { style?: React.CSSProperties }
  style?: React.CSSProperties
}) {
  const expanded = ctx.open === item.id
  const kids = item.children ?? []
  const name = item.label.trim()
  const labelRef = React.useRef<HTMLInputElement>(null)
  const lifted = !!style?.zIndex

  return (
    <div data-reorder-row="" data-link-row={item.id} style={style}>
      <div
        className={cn(
          "rounded-lg border border-border bg-background transition-[border-color,box-shadow]",
          expanded && "border-neutral-300",
          lifted && "border-neutral-300 shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
        )}
      >
        <div className="flex h-10 max-sm:h-12 items-center">
          <button
            type="button"
            aria-label={`Drag to reorder ${name || "link"}`}
            className="flex h-full w-8 max-sm:w-10 shrink-0 cursor-grab items-center justify-center rounded-l-lg text-neutral-400 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 active:cursor-grabbing"
            data-link-grip=""
            {...grip}
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            className="flex h-full min-w-0 flex-1 items-center gap-2 pr-3 text-left"
            onClick={() => ctx.setOpen(expanded ? null : item.id)}
          >
            <span className={cn("min-w-0 truncate text-sm font-medium", !name && "text-muted-foreground")}>
              {name || "Untitled"}
            </span>
            <span className="ml-auto min-w-0 max-w-[50%] shrink truncate text-xs text-muted-foreground" data-link-where="">
              {describeLink(item.url, ctx.targets)}
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")}
            />
          </button>
        </div>
        {expanded && (
          <div className="space-y-3 border-t border-border p-3" data-link-panel="">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Label</span>
              <input
                ref={labelRef}
                className={INPUT}
                value={item.label}
                maxLength={ctx.maxLabel}
                autoFocus={typeof window !== "undefined" && item.label === NEW_LINK_LABEL && window.matchMedia?.("(pointer: fine)").matches}
                onFocus={(e) => {
                  if (e.currentTarget.value === NEW_LINK_LABEL) e.currentTarget.select()
                }}
                onChange={(e) => ctx.onLabel(item.id, e.target.value)}
              />
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Link</span>
              <LinkPicker value={item.url} targets={ctx.targets} onChange={(href) => ctx.onUrl(item.id, href)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              {depth === 0 && ctx.nested && kids.length < (ctx.maxSubLinks ?? Infinity) ? (
                <button type="button" className={cn(TEXT_BUTTON, "-ml-1.5")} onClick={() => ctx.add(item.id)}>
                  Add sub-link
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                data-link-remove=""
                className={cn(TEXT_BUTTON, "-mr-1.5 hover:bg-red-50 hover:text-[#b91c1c]")}
                onClick={() => {
                  ctx.setOpen(null)
                  ctx.onRemove(item.id)
                }}
              >
                Remove link
              </button>
            </div>
          </div>
        )}
      </div>
      {depth === 0 && kids.length > 0 && (
        <div className="ml-4 mt-2 border-l border-border pl-3">
          <LinkLevel items={kids} parentId={item.id} depth={1} ctx={ctx} />
        </div>
      )}
    </div>
  )
}

function LinkLevel({ items, parentId, depth, ctx }: { items: LinkItem[]; parentId: string | null; depth: number; ctx: Ctx }) {
  const { listRef, gripProps, rowStyle } = useReorder<HTMLDivElement>({
    count: items.length,
    onMove: (from, to) => ctx.onMove(parentId, from, to),
    onStart: () => ctx.setOpen(null),
  })
  return (
    <div ref={listRef} className="space-y-2" data-link-level={parentId ?? "top"}>
      {items.map((item, i) => (
        <LinkRow key={item.id} item={item} depth={depth} ctx={ctx} grip={gripProps(i)} style={rowStyle(i)} />
      ))}
    </div>
  )
}

export function LinkListEditor(props: LinkListEditorProps) {
  const targets = useLinkTargets()
  const [open, setOpen] = React.useState<string | null>(null)

  /* A link just added opens, so it can be named straight away. */
  const pending = React.useRef<Set<string> | null>(null)
  const allIds = (list: LinkItem[]): string[] => list.flatMap((l) => [l.id, ...allIds(l.children ?? [])])
  const ids = allIds(props.items).join("\n")
  React.useEffect(() => {
    const before = pending.current
    if (!before) return
    const fresh = ids.split("\n").find((id) => id && !before.has(id))
    if (fresh) {
      pending.current = null
      setOpen(fresh)
    }
  }, [ids])

  const add = (parentId: string | null) => {
    pending.current = new Set(allIds(props.items))
    props.onAdd(parentId)
  }

  const ctx: Ctx = { ...props, open, setOpen, add, targets }
  const room = props.items.length < (props.maxLinks ?? Infinity)

  return (
    <div className={cn("space-y-2", props.disabled && "pointer-events-none opacity-50")} data-link-list="">
      {props.items.length > 0 && <LinkLevel items={props.items} parentId={null} depth={0} ctx={ctx} />}
      {room && (
        <button
          type="button"
          className="flex h-10 max-sm:h-12 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-neutral-400 hover:text-foreground"
          onClick={() => add(null)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add link
        </button>
      )}
    </div>
  )
}

export function HeaderNavLinksEditor({
  blocks,
  maxLinks,
  disabled,
  onUpdateBlockSetting,
  onAddBlock,
  onRemoveBlock,
  onReorderBlocks,
}: {
  blocks: NavBlock[]
  maxLinks?: number
  disabled?: boolean
  onUpdateBlockSetting: (blockId: string, key: string, value: unknown) => void
  onAddBlock: (type: string, initialSettings?: Record<string, unknown>) => void
  onRemoveBlock: (blockId: string) => void
  onReorderBlocks: (blocks: NavBlock[]) => void
}) {
  const items = navBlocksToItems(blocks)
  return (
    <LinkListEditor
      items={items}
      nested
      maxLinks={maxLinks}
      disabled={disabled}
      onLabel={(id, label) => onUpdateBlockSetting(id, "label", label)}
      onUrl={(id, url) => {
        /* The picker is the whole answer now: a link saved as "a product,
           handle x" becomes the address picked, so the old pair cannot
           override it out of sight. */
        const s = blocks.find((b) => b.id === id)?.settings ?? {}
        if (typeof s.link_type === "string" && s.link_type && s.link_type !== "custom") onUpdateBlockSetting(id, "link_type", "custom")
        if (typeof s.target_id === "string" && s.target_id) onUpdateBlockSetting(id, "target_id", "")
        onUpdateBlockSetting(id, "url", url)
      }}
      onRemove={onRemoveBlock}
      onAdd={(parentId) =>
        onAddBlock("nav_link", parentId
          ? { parent_id: parentId, label: NEW_LINK_LABEL, url: "/", link_type: "custom" }
          : { label: NEW_LINK_LABEL, url: "/", link_type: "custom" })
      }
      onMove={(parentId, from, to) => onReorderBlocks(moveNavBlock(blocks, parentId, from, to))}
    />
  )
}
