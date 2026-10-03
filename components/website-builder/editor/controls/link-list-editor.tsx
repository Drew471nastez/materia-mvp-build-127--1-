"use client"

/**
 * ===========================================================================
 *  A MENU'S LINKS, ONE ROW EACH
 * ===========================================================================
 * Every menu (Main menu, Footer, and any made in Menus) is edited with this,
 * in the builder's sidebar and in Website Settings › Navigation.
 *
 * Drawn the way Shopify draws a menu's links: a row is a grip, the link's
 * name, where it goes in small grey type, and a "…" for the row's actions.
 * Rows are separated by a hairline and nothing else: no box round the list,
 * no box round a row, so a menu inside a settings card is one surface and not
 * a card in a card. 36px on a computer, 44px under a thumb, 13px type (15px
 * on a phone).
 *
 * Sub-links sit one modest step in, on a hairline guide that hangs from their
 * parent's grip. Two levels, because that is what the header draws
 * (NAV_MAX_DEPTH in lib/website-builder/nav-links.ts).
 *
 * MOVING. The grip drags a row up or down its own level, with a mouse or a
 * finger (use-reorder.ts). Dragged right and let go, a link goes under the
 * one above it; dragged left, a sub-link comes back out. The same with the
 * keyboard on a focused grip: Up and Down move it, Right and Left nest it.
 * The row's "…" says the same moves in words, for anyone who never finds the
 * gesture.
 *
 * EDITING. A click on the row opens Label and Link under it, in place (the
 * same link picker every link setting uses). Add sub-link and Delete are in
 * the row's "…", so an open row is two fields and nothing else.
 */
import * as React from "react"
import { GripVertical, MoreHorizontal, Plus } from "lucide-react"

import { Reveal } from "@/components/ui/reveal"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { LinkPicker, useLinkTargets, type LinkTarget } from "@/components/website-builder/link-picker"
import {
  NEW_LINK_LABEL,
  describeLink,
  moveNavBlock,
  navBlocksToItems,
  nestNavBlock,
  unnestNavBlock,
  type LinkItem,
  type NavBlock,
} from "@/lib/website-builder/nav-links"
import { cn } from "@/lib/utils"
import { INPUT } from "./styles"
import { useReorder } from "./use-reorder"

/* The sidebar's field, a thumb's height on a phone: these lists are also drawn outside the phone sheet, in Website Settings, where the sheet's own 44px rule does not reach. */
const FIELD = cn(INPUT, "max-sm:h-11")

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
  /** A top-level link under the one above it (1), or a sub-link back out (-1). */
  onNest?: (id: string, dir: 1 | -1) => void
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
  /** May this link go under the one above it? */
  canNest: (index: number) => boolean
  /** May this sub-link come out to the top level? */
  canOut: () => boolean
}

/** How far a sub-link sits in: one step, the grip's half and a little. */
export const LINK_STEP = 20

/** The grip's column. The guide under a parent hangs from its middle. */
const GRIP_COL = "w-7 max-sm:w-11"

/** One row's bar: 36px, 44px under a thumb. */
const BAR = "flex h-9 max-sm:h-11 items-center"

const LABEL_TEXT = "text-[13px] max-sm:text-[15px]"

const HAIRLINE = "border-t border-border dark:border-white/[0.07]"

function LinkRow({
  item,
  index,
  depth,
  parent,
  above,
  first,
  ctx,
  grip,
  style,
}: {
  item: LinkItem
  index: number
  depth: number
  parent: LinkItem | null
  above: LinkItem | null
  first: boolean
  ctx: Ctx
  grip: React.HTMLAttributes<HTMLElement> & { style?: React.CSSProperties }
  style?: React.CSSProperties
}) {
  const expanded = ctx.open === item.id
  const kids = item.children ?? []
  const name = item.label.trim()
  const lifted = !!style?.zIndex
  const panelId = `link-panel-${item.id}`

  const roomUnder = depth === 0 && !!ctx.nested && kids.length < (ctx.maxSubLinks ?? Infinity)
  const nestable = depth === 0 && ctx.canNest(index) && !!above
  const outable = depth === 1 && ctx.canOut() && !!parent

  const actions: ActionMenuItem[] = [
    { label: expanded ? "Close" : "Edit", onClick: () => ctx.setOpen(expanded ? null : item.id) },
    ...(roomUnder ? [{ label: "Add sub-link", onClick: () => ctx.add(item.id) }] : []),
    ...(nestable ? [{ label: `Move under ${above!.label.trim() || "the link above"}`, onClick: () => ctx.onNest?.(item.id, 1) }] : []),
    ...(outable ? [{ label: `Move out of ${parent!.label.trim() || "its parent"}`, onClick: () => ctx.onNest?.(item.id, -1) }] : []),
    {
      label: kids.length > 0 ? `Delete with ${kids.length} sub-link${kids.length === 1 ? "" : "s"}` : "Delete",
      variant: "destructive",
      separatorBefore: true,
      onClick: () => {
        ctx.setOpen(null)
        ctx.onRemove(item.id)
      },
    },
  ]

  return (
    <div data-reorder-row="" data-link-row={item.id} data-link-depth={depth} style={style}>
      <div
        className={cn(
          "relative",
          !first && HAIRLINE,
          /* Only a lifted row is painted: it passes over the others. The rest are the surface showing through. */
          lifted && "z-10 rounded-md border-transparent bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_10px_28px_-6px_rgba(0,0,0,0.22)] dark:bg-[#1c1c1c] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_12px_28px_-6px_rgba(0,0,0,0.7)]",
        )}
      >
        <div className={BAR} data-link-bar="">
          <button
            type="button"
            aria-label={`Move ${name || "link"}`}
            title="Drag to move. Arrow keys work too."
            className={cn(
              GRIP_COL,
              "flex h-full shrink-0 cursor-grab items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]/30 active:cursor-grabbing",
            )}
            data-link-grip=""
            {...grip}
          >
            <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            className="group/link flex h-full min-w-0 flex-1 items-center gap-2 pr-1 text-left focus-visible:outline-none"
            onClick={() => ctx.setOpen(expanded ? null : item.id)}
          >
            <span
              data-link-label=""
              className={cn(
                "min-w-0 max-w-[65%] shrink-0 truncate font-medium group-focus-visible/link:underline",
                LABEL_TEXT,
                name ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {name || "Untitled"}
            </span>
            <span data-link-dest="" className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground max-sm:text-[13px]">
              {describeLink(item.url, ctx.targets)}
            </span>
          </button>
          <ResponsiveActionMenu
            title={name || "Link"}
            items={actions}
            trigger={
              <button
                type="button"
                aria-label={`Actions for ${name || "link"}`}
                data-link-actions=""
                className="mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/30 max-sm:h-11 max-sm:w-11 dark:hover:bg-white/[0.06]"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            }
          />
        </div>

        <Reveal open={expanded} id={panelId} data-link-reveal="">
          <div className="space-y-3 pb-3 pl-7 pr-2 max-sm:pl-11" data-link-panel="">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Label</span>
              <input
                className={FIELD}
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
          </div>
        </Reveal>
      </div>

      {depth === 0 && kids.length > 0 && (
        <div className={cn("relative", HAIRLINE)} style={{ paddingLeft: LINK_STEP }} data-link-children={item.id}>
          {/* The guide: a hairline from the parent's grip down its sub-links. */}
          <span aria-hidden className="pointer-events-none absolute bottom-2 top-0 left-[13.5px] z-[1] w-px bg-border max-sm:left-[21.5px] dark:bg-white/[0.09]" />
          <LinkLevel items={kids} parent={item} depth={1} ctx={ctx} />
        </div>
      )}
    </div>
  )
}

function AddRow({ label, onClick, ...rest }: { label: string; onClick: () => void } & Record<`data-${string}`, string>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn(
        BAR,
        HAIRLINE,
        "w-full text-left text-[#7c3aed] transition-colors hover:text-[#6d28d9] focus-visible:outline-none focus-visible:underline dark:text-[#c4b5fd] dark:hover:text-white",
        LABEL_TEXT,
      )}
    >
      <span className={cn(GRIP_COL, "flex shrink-0 items-center justify-center")}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <span className="truncate pr-2.5 font-medium">{label}</span>
    </button>
  )
}

function LinkLevel({ items, parent, depth, ctx }: { items: LinkItem[]; parent: LinkItem | null; depth: number; ctx: Ctx }) {
  const parentId = parent?.id ?? null
  const nestable = !!ctx.nested && !!ctx.onNest
  const { listRef, gripProps, rowStyle, nesting, drag } = useReorder<HTMLDivElement>({
    count: items.length,
    onMove: (from, to) => ctx.onMove(parentId, from, to),
    onStart: () => ctx.setOpen(null),
    nest: nestable
      ? {
          step: LINK_STEP,
          can: (i, dir) => (dir === 1 ? depth === 0 && ctx.canNest(i) : depth === 1 && ctx.canOut()),
          onNest: (i, dir) => ctx.onNest?.(items[i].id, dir),
        }
      : undefined,
  })
  return (
    <div
      ref={listRef}
      data-link-level={parentId ?? "top"}
      data-link-nesting={drag && nesting ? (nesting === 1 ? "in" : "out") : undefined}
    >
      {items.map((item, i) => (
        <LinkRow
          key={item.id}
          item={item}
          index={i}
          depth={depth}
          parent={parent}
          above={i > 0 ? items[i - 1] : null}
          first={i === 0}
          ctx={ctx}
          grip={gripProps(i)}
          style={rowStyle(i)}
        />
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

  const room = props.items.length < (props.maxLinks ?? Infinity)
  const subRoom = props.maxSubLinks ?? Infinity
  const ctx: Ctx = {
    ...props,
    open,
    setOpen,
    add,
    targets,
    /* Closed first: a menu names its links by place, so after a move the open id would be some other link. */
    onNest: props.onNest
      ? (id, dir) => {
          setOpen(null)
          props.onNest?.(id, dir)
        }
      : undefined,
    canNest: (i) => {
      if (!props.nested || !props.onNest || i <= 0) return false
      const me = props.items[i]
      const above = props.items[i - 1]
      return !!me && !!above && (me.children ?? []).length === 0 && (above.children ?? []).length < subRoom
    },
    canOut: () => !!props.nested && !!props.onNest && room,
  }

  return (
    <div className={cn(props.disabled && "pointer-events-none opacity-50")} data-link-list="">
      {props.items.length > 0 && <LinkLevel items={props.items} parent={null} depth={0} ctx={ctx} />}
      {room && (
        <div className={cn(props.items.length === 0 && "[&>button]:border-t-0")}>
          <AddRow label="Add link" onClick={() => add(null)} data-link-add="top" />
        </div>
      )}
    </div>
  )
}

/**
 * The header's own nav_link blocks as a link list. The header now reads the
 * Main menu (lib/website-builder/main-menu.ts), so the builder no longer
 * draws this; it stays for a header that has not moved over yet and is
 * edited somewhere that still holds blocks.
 */
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
      /* The editor's removeBlock takes a link's sub-links with it (block-tree.ts, removeAt). */
      onRemove={onRemoveBlock}
      onAdd={(parentId) =>
        onAddBlock("nav_link", parentId
          ? { parent_id: parentId, label: NEW_LINK_LABEL, url: "/", link_type: "custom" }
          : { label: NEW_LINK_LABEL, url: "/", link_type: "custom" })
      }
      onMove={(parentId, from, to) => onReorderBlocks(moveNavBlock(blocks, parentId, from, to))}
      /* In or out a level is one write of the whole list: the new parent_id and the new order together, one step of Undo. */
      onNest={(id, dir) => {
        const next = dir === 1 ? nestNavBlock(blocks, id) : unnestNavBlock(blocks, id)
        if (next !== blocks) onReorderBlocks(next)
      }}
    />
  )
}
