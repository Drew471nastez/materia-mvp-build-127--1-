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
 * MOVING. The grip drags a row anywhere in the menu, with a mouse or a
 * finger, and on a phone a finger held still on a row picks it up too
 * (use-link-tree-drag.ts). A violet line shows where it will land: up and
 * down picks the gap, right and left picks the level, so a link dropped
 * indented under another becomes its sub-link and a sub-link dragged left
 * comes back out. On a focused grip, Up and Down move it, Right and Left
 * nest it. The row's "…" says the same moves in words, for anyone who never
 * finds the gesture.
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
  placeNavBlock,
  unnestNavBlock,
  type LinkItem,
  type NavBlock,
} from "@/lib/website-builder/nav-links"
import { cn } from "@/lib/utils"
import { isMenuButton } from "@/lib/website-builder/header-settings"
import { INPUT } from "./styles"
import { useLinkTreeDrag } from "./use-link-tree-drag"
import { ChoiceControl } from "./choice-control"
import { tt } from "@/lib/i18n/text"

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
  /**
   * A link dropped anywhere: at `index` of `parentId`'s links (`null`, the
   * top level), counted without the link itself. Without it a drag moves a
   * link within its own level only.
   */
  onPlace?: (id: string, parentId: string | null, index: number) => void
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
  drag: ReturnType<typeof useLinkTreeDrag>
}

/** How far a sub-link sits in: one step, the grip's half and a little. */
export const LINK_STEP = 20

/** The grip's column. The guide under a parent hangs from its middle. */
const GRIP_COL = "w-7 max-sm:w-11"

/** One row's bar: 36px, 44px under a thumb. */
const BAR = "flex h-9 max-sm:h-11 items-center"

const LABEL_TEXT = "text-[13px] max-sm:text-[15px]"

const HAIRLINE = "border-t border-border dark:border-white/[0.07]"

/*
  ONE ROW DRAWN AGAIN FOR A KEY TYPED IN IT, NOT THE MENU (round 12). Every
  key in a link's name drew every row of the menu again, each with its
  action menu and its reveal: on a menu of 266 links that was most of a
  key's time (scripts/check-wb-perf-r12.mjs, "add menu link"). A row is
  drawn again when its own link changes, its neighbours' names it shows
  change, or the list's state does (which row is open, a drag, the menu's
  shape, the targets), all said by `rev`. What a row calls is the list's
  latest (`ctx` reads through to it), so a row not drawn again never acts
  on an older menu.
*/
type RowProps = {
  item: LinkItem
  index: number
  depth: number
  parent: LinkItem | null
  above: LinkItem | null
  first: boolean
  ctx: Ctx
  rev: string
  /** This row or one of its sub-links is the open one. */
  openHere: boolean
}
const sameRow = (a: RowProps, b: RowProps) =>
  a.item === b.item && a.index === b.index && a.depth === b.depth && a.first === b.first && a.rev === b.rev && a.ctx === b.ctx && a.openHere === b.openHere &&
  a.parent?.id === b.parent?.id && a.parent?.label === b.parent?.label &&
  a.above?.id === b.above?.id && a.above?.label === b.above?.label && a.above?.children?.length === b.above?.children?.length

const LinkRow = React.memo(function LinkRow({
  item,
  index,
  depth,
  parent,
  above,
  first,
  ctx,
  rev,
}: RowProps) {
  const expanded = ctx.open === item.id
  const kids = item.children ?? []
  const name = item.label.trim()
  const grip = ctx.drag.gripProps(item.id, parent?.id ?? null, index)
  const hold = ctx.drag.rowPressProps(item.id)
  const panelId = `link-panel-${item.id}`
  /* A top-level link with sub-links may open them instead of going anywhere (header-settings.ts, isMenuButton). */
  const opensKids = depth === 0 && kids.length > 0
  const menuButton = opensKids && isMenuButton(item.url, kids.length)
  const lastUrl = React.useRef(item.url)

  const roomUnder = depth === 0 && !!ctx.nested && kids.length < (ctx.maxSubLinks ?? Infinity)
  const nestable = depth === 0 && ctx.canNest(index) && !!above
  const outable = depth === 1 && ctx.canOut() && !!parent

  const actions: ActionMenuItem[] = [
    { label: expanded ? tt("Close") : tt("Edit"), onClick: () => ctx.setOpen(expanded ? null : item.id) },
    ...(roomUnder ? [{ label: tt("Add sub-link"), onClick: () => ctx.add(item.id) }] : []),
    ...(nestable ? [{ label: tt("Move under {value}", { value: above!.label.trim() || tt("the link above") }), onClick: () => ctx.onNest?.(item.id, 1) }] : []),
    ...(outable ? [{ label: tt("Move out of {value}", { value: parent!.label.trim() || tt("its parent") }), onClick: () => ctx.onNest?.(item.id, -1) }] : []),
    {
      label: kids.length > 0 ? tt("Delete with {length, plural, one {# sub-link} other {# sub-links}}", { length: kids.length }) : tt("Delete"),
      variant: "destructive",
      separatorBefore: true,
      onClick: () => {
        ctx.setOpen(null)
        ctx.onRemove(item.id)
      },
    },
  ]

  return (
    <div
      data-link-row={item.id}
      data-link-depth={depth}
      data-link-held={ctx.drag.dragging === item.id ? "" : undefined}
      /*
        A top-level row off screen is not styled or laid out (round 12): a
        link added to a menu of 266 restyled every row of it, some 5,000
        elements (scripts/check-wb-perf-r12.mjs, "add menu link"). Its size
        until it is first drawn is its bar and its sub-links' bars.
      */
      className={cn("transition-opacity duration-150", depth === 0 && "[content-visibility:auto]")}
      style={depth === 0 ? { containIntrinsicSize: `auto ${36 * (1 + kids.length)}px` } : undefined}
    >
      <div className={cn("relative", !first && HAIRLINE)}>
        <div className={BAR} data-link-bar="" {...hold}>
          <button
            type="button"
            aria-label={tt("Move {value}", { value: name || "link" })}
            title={tt("Drag to move. Arrow keys work too.")}
            className={cn(
              GRIP_COL,
              "flex h-full shrink-0 cursor-grab items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900/15 active:cursor-grabbing",
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
              {name || tt("Untitled")}
            </span>
            {/* Where it goes, unless that is only its own name again ("Shop" to the Shop page). */}
            <span data-link-dest="" className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground max-sm:text-[13px]">
              {(() => {
                if (menuButton) return tt("Opens its sub-links")
                const where = describeLink(item.url, ctx.targets)
                return where.toLowerCase() === name.toLowerCase() ? "" : where
              })()}
            </span>
          </button>
          <ResponsiveActionMenu
            title={name || tt("Link")}
            items={actions}
            trigger={
              <button
                type="button"
                aria-label={tt("Actions for {value}", { value: name || "link" })}
                data-link-actions=""
                className="mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 max-sm:h-11 max-sm:w-11 dark:hover:bg-white/[0.06]"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            }
          />
        </div>

        <Reveal open={expanded} id={panelId} data-link-reveal="">
          <div className="space-y-3 pb-3 pl-7 pr-2 max-sm:pl-11" data-link-panel="">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{tt("Label")}</span>
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
            {/*
              A LINK WITH SUB-LINKS GOES TO ITS LINK, OR OPENS THEM. In the
              header the second is a button that opens its sub-links as a
              dropdown, and in the menu drawer on a phone. It is stored as the
              address `#`, which is how a menu says "nowhere of its own", so the
              rule is one place (isMenuButton) and a menu edited anywhere else
              keeps it.
            */}
            {opensKids && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{tt("When pressed")}</span>
                {/* Two choices: buttons when their words fit, the dropdown when they do not (choice-control.tsx). */}
                <ChoiceControl
                  echo={false}
                  label={tt("When pressed")}
                  data-link-opens=""
                  value={menuButton ? "menu" : "link"}
                  onChange={(v) => {
                    if (v === "menu") {
                      if (!menuButton) lastUrl.current = item.url
                      ctx.onUrl(item.id, "#")
                    } else {
                      ctx.onUrl(item.id, lastUrl.current && lastUrl.current !== "#" ? lastUrl.current : "/")
                    }
                  }}
                  options={[{ label: tt("Goes to its link"), value: "link" }, { label: tt("Opens its sub-links"), value: "menu" }]}
                />
              </div>
            )}
            {!menuButton && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{tt("Link")}</span>
                <LinkPicker value={item.url} targets={ctx.targets} onChange={(href) => ctx.onUrl(item.id, href)} />
              </div>
            )}
          </div>
        </Reveal>
      </div>

      {depth === 0 && kids.length > 0 && (
        <div className={cn("relative", HAIRLINE)} style={{ paddingLeft: LINK_STEP }} data-link-children={item.id}>
          {/* The guide: a hairline from the parent's grip down its sub-links. */}
          <span aria-hidden className="pointer-events-none absolute bottom-2 top-0 left-[13.5px] z-[1] w-px bg-border max-sm:left-[21.5px] dark:bg-white/[0.09]" />
          <LinkLevel items={kids} parent={item} depth={1} ctx={ctx} rev={rev} open={ctx.open} />
        </div>
      )}
    </div>
  )
}, sameRow)

function AddRow({ label, onClick, ...rest }: { label: string; onClick: () => void } & Record<`data-${string}`, string>) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn(
        BAR,
        HAIRLINE,
        "w-full text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline dark:hover:text-white",
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

function LinkLevel({ items, parent, depth, ctx, rev, open }: { items: LinkItem[]; parent: LinkItem | null; depth: number; ctx: Ctx; rev: string; open: string | null }) {
  const parentId = parent?.id ?? null
  return (
    <div data-link-level={parentId ?? "top"}>
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
          rev={rev}
          openHere={open !== null && (open === item.id || (item.children ?? []).some((c) => c.id === open))}
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
  const onNest = props.onNest
    ? (id: string, dir: 1 | -1) => {
        /* Closed first: a menu names its links by place, so after a move the open id would be some other link. */
        setOpen(null)
        props.onNest?.(id, dir)
      }
    : undefined
  const canNest = (i: number) => {
    if (!props.nested || !props.onNest || i <= 0) return false
    const me = props.items[i]
    const above = props.items[i - 1]
    return !!me && !!above && (me.children ?? []).length === 0 && (above.children ?? []).length < subRoom
  }
  const canOut = () => !!props.nested && !!props.onNest && room

  const parentOfId = (id: string): string | null => props.items.find((l) => (l.children ?? []).some((c) => c.id === id))?.id ?? null
  const drag = useLinkTreeDrag({
    items: props.items,
    /* Across levels only where the list can say so in one save. */
    nested: !!props.nested && !!props.onPlace,
    step: LINK_STEP,
    maxLinks: props.maxLinks,
    maxSubLinks: props.maxSubLinks,
    onPlace: (id, parentId, index) => {
      setOpen(null)
      if (props.onPlace) return props.onPlace(id, parentId, index)
      /* Without it, a move within the level the link is already on. */
      const from = (parentId === null ? props.items : props.items.find((l) => l.id === parentId)?.children ?? []).findIndex((l) => l.id === id)
      if (from >= 0 && parentOfId(id) === parentId) props.onMove(parentId, from, index)
    },
    onMove: (parentId, from, to) => {
      setOpen(null)
      props.onMove(parentId, from, to)
    },
    onNest,
    canNest,
    canOut,
    onStart: () => setOpen(null),
  })

  const ctx: Ctx = { ...props, open, setOpen, add, targets, onNest, canNest, canOut, drag }
  /* The rows' context, read through to this render's (see LinkRow), and what they show of it as one string. */
  const ctxNow = React.useRef(ctx)
  ctxNow.current = ctx
  const [rowCtx] = React.useState(() => new Proxy({} as Ctx, { get: (_, k) => ctxNow.current[k as keyof Ctx] }))
  const targetsRev = React.useRef<{ of: LinkTarget[]; n: number }>({ of: targets, n: 0 })
  if (targetsRev.current.of !== targets) targetsRev.current = { of: targets, n: targetsRev.current.n + 1 }
  /* Which row is open is each row's own (openHere); a link added or removed changes only whether there is room for another (canOut), and each row's place is its own props. */
  const rev = [drag.dragging ?? "", room ? 1 : 0, targetsRev.current.n, props.nested ? 1 : 0, props.maxLinks ?? "", props.maxSubLinks ?? "", props.maxLabel ?? "", props.onNest ? 1 : 0, props.onPlace ? 1 : 0].join("|")

  return (
    <div className={cn("relative", props.disabled && "pointer-events-none opacity-50")} data-link-list="" ref={drag.listRef}>
      {drag.line}
      {props.items.length > 0 && <LinkLevel items={props.items} parent={null} depth={0} ctx={rowCtx} rev={rev} open={open} />}
      {room && (
        <div className={cn(props.items.length === 0 && "[&>button]:border-t-0")}>
          <AddRow label={tt("Add link")} onClick={() => add(null)} data-link-add="top" />
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
      /* Dragged anywhere: the new parent and the new order in one write, one step of Undo. */
      onPlace={(id, parentId, index) => {
        const next = placeNavBlock(blocks, id, parentId, index)
        if (next !== blocks) onReorderBlocks(next)
      }}
    />
  )
}
