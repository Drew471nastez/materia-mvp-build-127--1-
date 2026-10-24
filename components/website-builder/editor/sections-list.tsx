"use client"

/**
 * ===========================================================================
 *  THE PAGE'S SECTIONS, IN THREE GROUPS
 * ===========================================================================
 * The sidebar's list of a page's sections, laid out the way a shop's theme
 * editor is: the Header group, the Page group (the page's own sections),
 * and the Footer group, each under its name.
 *
 * "PAGE", NOT "TEMPLATE". The middle group was called Template, after the
 * theme editors it is modelled on, and the owner asked for a better word:
 * to a creator these are the sections of the page they are on. Only the
 * words changed; the group is still `data-section-group="template"`, which
 * the tests and the browser checks read.
 *
 *   Header      Shopify's header group: the site's header and what sits with
 *               it on every page, an announcement bar above it or a marquee
 *               under it. The header row wears the dark badge; the others
 *               move up and down inside the group from their menu. Its "Add
 *               section" offers what may go here (lib/storelib-theme/
 *               section-groups.ts), headers included: adding a header where
 *               one is drawn replaces it after asking, and the old one is
 *               hidden, not deleted. The header can be deleted too.
 *   Page        the page's sections, reordered by their grip, with a thin
 *               insert line between every two and "Add section" at the end.
 *   Footer      the footer group, the same way.
 *
 * A ROW IS ONE LINE, 32px. The name, and under the pointer the three things
 * done to a section most: hide, delete, and a menu with the rest (duplicate,
 * move up, move down). On a touch screen there is no pointer to hover with,
 * so those stay out of the way and the section's own panel carries Hide,
 * Duplicate and Delete instead; a hidden section always shows its eye,
 * because that row needs a way back.
 *
 * ONE MENU FOR THE LIST. The row's "...", a right click on the row (opened
 * at the pointer), a row held down on a touch screen, and Shift+F10 or the
 * context menu key on a focused row all open the same menu: Duplicate, Move
 * up, Move down, Hide or Show, Edit code, Delete, with Copy and Paste below
 * beside Duplicate when the editor gives them. A right click on the insert
 * line between two rows opens two rows of its own: Add section, Paste here. A dropdown on a computer,
 * the shared action sheet on a phone (components/ui/responsive-action-
 * menu.tsx, ActionMenuAt). One for the whole list rather than one per row.
 *
 * Controls that wait for the pointer are `hidden`, not merely transparent.
 * A button at opacity 0 still takes a tap, and an invisible bin at the end
 * of a row is how somebody deletes a section by touching its name. Hidden,
 * they also take no room, so a long name is cut only while the pointer is
 * on its row. The row itself takes focus, so a keyboard reaches them too.
 */

import * as React from "react"
import { ArrowDown, ArrowUp, ClipboardPaste, Code2, Copy, CopyPlus, Eye, EyeOff, GripVertical, Megaphone, MoreHorizontal, PanelBottom, PanelTop, Plus, RectangleHorizontal, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { useReorder } from "./controls/use-reorder"
import { ROW_PAD, TREE_NAME, TREE_ROW, TreeAddRow, TreeInsertLine, TreeSpacer, TreeTwisty, foldAway } from "./tree-parts"
import type { SectionInstance } from "@/lib/website-builder/types"
import { GROUP_LABELS, isKind, splitGroups, type KindOfType, type SectionGroup } from "@/lib/storelib-theme/section-groups"
import { ActionMenuAt, type ActionMenuItem, type ActionMenuPlace } from "@/components/ui/responsive-action-menu"
import { hapticTap } from "@/lib/native-bridge"
import { tt } from "@/lib/i18n/text"

/**
 * How the page's sections are reordered: the row dragged, and the row whose
 * place it takes. The same drag as blocks and menu links
 * (controls/use-reorder.ts), so all three feel the same under a finger.
 */
export interface SectionsDnd {
  onReorder: (fromId: string, toId: string) => void
}

export interface SectionsListProps {
  sections: SectionInstance[]
  /** What a section is called, from its schema: see sectionDisplayName. */
  nameOf: (section: SectionInstance) => string
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleHide: (id: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, step: -1 | 1) => void
  /**
   * Add a section to a group: at this place among its sections, or where
   * that group puts one (`null`: the end of the page, above the header or
   * above the footer).
   */
  onAdd: (at: number | null, group?: SectionGroup) => void
  /** Which section types are a header or a footer, so a header written as a section file wears the header's badge. */
  kindOfType?: KindOfType
  /** Whether the theme has a section that floats over the page; the Overlay group shows when it does, or when it holds one. */
  overlayAddable?: boolean
  dnd: SectionsDnd
  /**
   * A SECTION'S BLOCKS, UNDER IT IN THE TREE. The rows for this section's
   * blocks (components/website-builder/editor/block-tree-rows.tsx), or null
   * for a section that has none, which then has no chevron.
   */
  blocksOf?: (section: SectionInstance) => React.ReactNode | null
  /** Which sections are open in the tree. */
  expanded?: ReadonlySet<string>
  onToggleExpand?: (id: string) => void
  /**
   * The menu's Edit code row for a section: open its file, edit a copy of a
   * built-in, or say why there is no code (lib/website-builder/
   * section-code-target.ts). Absent, the menu has no such row.
   */
  codeItem?: (section: SectionInstance) => { label: string; hint?: string; run?: () => void } | null
  /** Copy a section to the builder's clipboard (right click, or the row's menu). */
  onCopy?: (id: string) => void
  /**
   * What the clipboard holds, when it is a section: its name and whether it
   * can go on this page. Absent or null, nothing to paste and no Paste rows.
   */
  paste?: { name: string; ok: boolean; reason?: string } | null
  /** Paste the copied section at this place among the page's sections (0 is the top). */
  onPaste?: (at: number) => void
}

/** The builder is a phone below 768px: the menu is the action sheet there. */
const PHONE_QUERY = "(max-width: 767px)"
const isPhone = () => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches
/** How long a finger rests on a row before its menu opens. */
export const LONG_PRESS_MS = 480
const LONG_PRESS_SLOP = 8

/* ── The parts ───────────────────────────────────────────────────────────── */

/* A heading over its rows, on their left edge, quiet enough that a group called Header is not read as a row called Header. */
const GROUP_LABEL = "pb-1 pl-1 pr-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6b7280]"

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className={GROUP_LABEL}>{children}</p>
}

/** "Add section": the tree's own Add line (tree-parts.tsx), so it sits on the grid every row sits on. */
export function AddSectionButton({ onClick, label = tt("Add section") }: { onClick: () => void; label?: string }) {
  return <TreeAddRow data-add-section="" label={label} onClick={onClick} />
}

/**
 * The strip between two rows that adds a section there. Eight pixels, with
 * no negative margin, so it never overlaps the rows either side of it and
 * two hover targets never fight over one pixel. Its plus does not take the
 * pointer; the strip is the only target. A right click on it opens a small
 * menu at the pointer: add a section here, or paste the copied one here.
 *
 * Dark grey with a little depth, not violet (the owner, round AH): a hairline
 * with a soft shadow and a raised disc, the way Storelib's own controls sit.
 */
/* Memoised on its place, with the list's handlers (RowHandlers): 44 of them on a long page drew again on every render of the editor. */
const InsertSectionDivider = React.memo(function InsertSectionDivider({ at, h }: { at: number; h: RowHandlers }) {
  return <TreeInsertLine data-insert-section="" label={tt("Add a section here")} onClick={() => h.insertAt(at)} onMenu={(x, y) => h.insertMenu(at, x, y)} />
})

/** A small square action on a row. 24px under a pointer. */
function RowAction({
  label,
  onClick,
  selected,
  shown,
  children,
}: {
  label: string
  onClick: () => void
  selected: boolean
  /** Always visible, rather than only under the pointer. */
  shown?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        "h-6 w-6 shrink-0 items-center justify-center rounded-md transition-[background-color,scale] duration-150 active:scale-90",
        shown ? "flex" : "hidden group-hover/row:flex group-focus-within/row:flex",
        "text-[#4b5563] hover:bg-black/[0.06] hover:text-[#1a1a2e]",
      )}
    >
      {children}
    </button>
  )
}

export interface SectionRowProps {
  section: SectionInstance
  displayName: string
  isSelected: boolean
  onSelect: () => void
  onToggleHide: () => void
  onRemove?: () => void
  /** The header or the footer: an icon in place of the grip, and Delete only from its menu. */
  chrome?: "header" | "footer"
  dragHandleProps?: Record<string, unknown>
  /** A row that is not dragged (one in the Header or Footer group): no grip, and the menu moves it. */
  fixed?: boolean
  /** The section has blocks: a chevron shows and hides them in the tree. */
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  /** Open the list's menu for this row, at this place. */
  onMenu?: (place: ActionMenuPlace) => void
  /** This row's menu is the one open. */
  menuOpen?: boolean
}

export function SectionRow({
  section,
  displayName,
  isSelected,
  onSelect,
  onToggleHide,
  onRemove,
  chrome,
  dragHandleProps,
  fixed,
  expandable,
  expanded,
  onToggleExpand,
  onMenu,
  menuOpen = false,
}: SectionRowProps) {
  const hidden = !!section.hidden
  /**
   * HELD DOWN ON A TOUCH SCREEN. A finger that rests on the row for a
   * moment, and does not move, opens the menu; a finger that moves is a
   * scroll and opens nothing. The grip and the row's buttons keep their own
   * press. The tap that ends a long press does not also open the section.
   */
  const press = React.useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null)
  const lastHeld = React.useRef(0)
  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    if (press.current && !press.current.fired) press.current = null
  }
  const openAt = (x: number, y: number, row: HTMLElement) =>
    onMenu?.({ box: { left: x, top: y, width: 1, height: 1 }, phone: isPhone(), align: "start", focus: row })

  return (
    <div
      data-section-row={section.id}
      role="button"
      tabIndex={0}
      aria-label={displayName}
      aria-current={isSelected || undefined}
      style={{ paddingLeft: ROW_PAD }}
      className={cn(
        TREE_ROW,
        /* The builder is a light surface by decision: explicit colours, not tokens a dark root would flip. */
        isSelected ? "bg-[#ebecef] text-[#111827]" : menuOpen ? "bg-[#f3f4f6] text-[#1a1a2e]" : "text-[#1a1a2e] hover:bg-[#f3f4f6]",
        /* No callout or text selection under a held finger on iOS. */
        "[-webkit-touch-callout:none]",
      )}
      data-section-menu-open={menuOpen ? "" : undefined}
      onClick={onSelect}
      onClickCapture={(e) => {
        /* The finger that held the row down lifts: that is not a tap on it. */
        if (press.current?.fired) {
          e.preventDefault()
          e.stopPropagation()
          press.current = null
        }
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          onMenu?.({ box: { left: r.left, top: r.top, width: r.width, height: r.height }, phone: isPhone(), align: "end", focus: e.currentTarget })
          return
        }
        if (e.key !== "Enter" && e.key !== " ") return
        e.preventDefault()
        onSelect()
      }}
      onPointerDown={(e) => {
        /* A new press: whatever the last hold left behind is over. */
        if (press.current?.fired) press.current = null
        if (e.pointerType === "mouse" || !onMenu) return
        if ((e.target as HTMLElement).closest("button, [data-sheet-no-drag]")) return
        endPress()
        const row = e.currentTarget
        const x = e.clientX
        const y = e.clientY
        const timer = window.setTimeout(() => {
          if (!press.current) return
          press.current.fired = true
          lastHeld.current = Date.now()
          hapticTap("medium")
          /*
            The click the lift sends lands where the finger was, which is now
            the sheet's scrim: it would close the menu it just opened. That
            one click is swallowed, wherever it lands.
          */
          /* A browser that sends no click after a hold: the next press is a press of its own. */
          const done = () => {
            document.removeEventListener("click", swallow, true)
            document.removeEventListener("pointerdown", done, true)
          }
          const swallow = (ev: MouseEvent) => {
            ev.preventDefault()
            ev.stopPropagation()
            done()
          }
          document.addEventListener("click", swallow, true)
          document.addEventListener("pointerdown", done, true)
          window.setTimeout(done, 1500)
          openAt(x, y, row)
        }, LONG_PRESS_MS)
        press.current = { x, y, timer, fired: false }
      }}
      onPointerMove={(e) => {
        const p = press.current
        if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) endPress()
      }}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => {
        e.preventDefault()
        /* A phone's own long press arrives as a context menu too: the one opened by the hold is the menu. */
        if (Date.now() - lastHeld.current < 900) return
        endPress()
        openAt(e.clientX, e.clientY, e.currentTarget)
      }}
    >
      {/* The section's blocks, shown and hidden under it, as Shopify's tree does. */}
      {expandable ? (
        <TreeTwisty
          expanded={!!expanded}
          onToggle={() => onToggleExpand?.()}
          label={expanded ? tt("Hide the blocks in {displayName}", { displayName }) : tt("Show the blocks in {displayName}", { displayName })}
          data-section-expand={section.id}
        />
      ) : (
        <TreeSpacer />
      )}

      {chrome ? (
        /* The dark grey badge the owner chose for the header and the footer, at the row's new size. */
        <span aria-hidden className="flex h-6 w-5 shrink-0 items-center justify-center max-sm:h-8">
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-[5px]", "bg-[#4d5058] text-white")}>
            {chrome === "header" ? <PanelTop className="h-3 w-3" strokeWidth={2} /> : <PanelBottom className="h-3 w-3" strokeWidth={2} />}
          </span>
        </span>
      ) : fixed ? (
        /* Not dragged: a quiet icon of what it is where the grip would be, so the names line up and the row is not a gap. */
        <span aria-hidden className="flex h-6 w-5 shrink-0 items-center justify-center text-[#6b7280] max-sm:h-8">
          {/announce|promo|marquee|ticker/i.test(section.type) ? <Megaphone className="h-3.5 w-3.5" strokeWidth={1.75} /> : <RectangleHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </span>
      ) : (
        /* The grip, always drawn: the list should look reorderable at rest. */
        <span
          {...(dragHandleProps ?? {})}
          role="button"
          tabIndex={0}
          aria-label={tt("Drag {displayName} to reorder", { displayName })}
          className={cn(
            "relative flex h-6 w-5 shrink-0 touch-none cursor-grab items-center justify-center rounded transition-colors active:cursor-grabbing max-sm:h-8",
            /*
             * A thumb's grab area without a thumb's column: the box grows, the
             * grid does not. To the right only: grown to the left too, it sat
             * over the chevron beside it and took most of its taps.
             */
            "after:absolute after:left-0 after:-right-1.5 after:-inset-y-1 after:content-[''] max-sm:after:-right-2 max-sm:after:-inset-y-1.5",
            "hover:bg-black/[0.06]",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className={cn("h-3.5 w-3.5", isSelected ? "opacity-70" : "opacity-40 group-hover/row:opacity-70")} strokeWidth={1.75} />
        </span>
      )}

      <span className={cn(TREE_NAME, hidden && "opacity-50")}>{displayName}</span>

      <span className="flex shrink-0 items-center gap-0.5">
        {/* The eye: always shown on a hidden row, which needs a way back; under the pointer otherwise. */}
        <RowAction label={hidden ? tt("Show {displayName}", { displayName }) : tt("Hide {displayName}", { displayName })} onClick={onToggleHide} selected={isSelected} shown={hidden || isSelected}>
          {hidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
        </RowAction>

        {!chrome && onRemove && (
          <RowAction label={tt("Delete {displayName}", { displayName })} onClick={onRemove} selected={isSelected} shown={isSelected}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </RowAction>
        )}

        {/* The list's one menu (ActionMenuAt, below), opened under this button. */}
        <button
          type="button"
          data-section-more={section.id}
          aria-label={tt("More for {displayName}", { displayName })}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation()
            const r = e.currentTarget.getBoundingClientRect()
            onMenu?.({ box: { left: r.left, top: r.top, width: r.width, height: r.height }, phone: isPhone(), align: "end", focus: e.currentTarget })
          }}
          className={cn(
            "h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors duration-150",
            isSelected || menuOpen ? "flex" : "hidden group-hover/row:flex group-focus-within/row:flex",
            menuOpen ? "bg-black/[0.06] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-black/[0.06] hover:text-[#1a1a2e]",
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </span>
    </div>
  )
}

/**
 * ===========================================================================
 *  A ROW DRAWS AGAIN WHEN ITS SECTION DOES, NOT WHEN THE LIST DOES (round 34)
 * ===========================================================================
 * Every render of the editor drew every row of the list: on a page of 44
 * sections, hiding one drew 88 rows and their icons, and a drag across
 * twelve rows drew 704 (scripts/check-editor-sections.mjs), since the list
 * hears each slot the lifted row passes. A row now draws when what it shows
 * changes: its section, its name, its place, whether it is selected, open
 * or has its menu open.
 *
 * Its handlers are the list's, taking the section's id and reading the
 * list's latest props when they run (`RowHandlers`), so a row that did not
 * draw again never calls an old one. The grip's handlers read the list's
 * length when pressed (use-reorder countRef) and take the row's place,
 * which is compared.
 */
interface RowHandlers {
  select: (id: string) => void
  toggleHide: (id: string) => void
  remove: (id: string) => void
  toggleExpand: (id: string) => void
  menu: (id: string, place: ActionMenuPlace) => void
  /** Add a section at this place among the page's, and the insert line's own menu there. */
  insertAt: (at: number) => void
  insertMenu: (at: number, x: number, y: number) => void
}

interface ListRowProps {
  h: RowHandlers
  section: SectionInstance
  displayName: string
  isSelected: boolean
  menuOpen: boolean
  expandable: boolean
  expanded: boolean
  chrome?: "header" | "footer"
  fixed?: boolean
  index: number
  grip?: (index: number) => Record<string, unknown>
}

const ListRow = React.memo(
  function ListRow({ h, section, displayName, isSelected, menuOpen, expandable, expanded, chrome, fixed, index, grip }: ListRowProps) {
    const id = section.id
    return (
      <SectionRow
        section={section}
        displayName={displayName}
        isSelected={isSelected}
        onSelect={() => h.select(id)}
        onToggleHide={() => h.toggleHide(id)}
        onRemove={() => h.remove(id)}
        chrome={chrome}
        fixed={fixed}
        dragHandleProps={grip ? grip(index) : undefined}
        expandable={expandable}
        expanded={expanded}
        onToggleExpand={() => h.toggleExpand(id)}
        onMenu={(place) => h.menu(id, place)}
        menuOpen={menuOpen}
      />
    )
  },
  (a, b) =>
    a.section === b.section &&
    a.displayName === b.displayName &&
    a.isSelected === b.isSelected &&
    a.menuOpen === b.menuOpen &&
    a.expandable === b.expandable &&
    a.expanded === b.expanded &&
    a.chrome === b.chrome &&
    a.fixed === b.fixed &&
    a.index === b.index &&
    !!a.grip === !!b.grip &&
    a.h === b.h,
)

/* ── The menu ────────────────────────────────────────────────────────────── */

const NO_ITEMS: ActionMenuItem[] = []

/**
 * A row's menu, for the section it is opened on: where the section is in its
 * group decides Move up and Move down, and what it is decides Duplicate (a
 * site's one header or footer is not duplicated). Edit code is the editor's
 * to say (codeItem). Delete last, in red. Tested in
 * tests/section-actions-v.test.ts.
 */
export function sectionRowMenu(
  section: SectionInstance,
  sections: SectionInstance[],
  ctx: Pick<SectionsListProps, "kindOfType" | "codeItem" | "onDuplicate" | "onMove" | "onToggleHide" | "onRemove" | "onCopy" | "paste"> & { onPasteAfter?: () => void },
): ActionMenuItem[] {
  const groups = splitGroups(sections)
  const role = (["header", "footer", "overlay"] as const).find((r) => groups[r].some((s) => s.id === section.id))
  const list = role ? groups[role] : groups.template
  const i = list.findIndex((s) => s.id === section.id)
  const chrome = role === "header" || role === "footer" ? isKind(section, role, ctx.kindOfType) : false
  const icon = (Icon: typeof Copy) => <Icon strokeWidth={1.75} />
  const items: ActionMenuItem[] = []
  if (!chrome) items.push({ id: "duplicate", label: tt("Duplicate"), icon: icon(CopyPlus), onClick: () => ctx.onDuplicate(section.id) })
  /* Copy, and Paste under it when a section is copied: a section can be carried to another page or theme. */
  if (!chrome && ctx.onCopy) items.push({ id: "copy", label: tt("Copy"), icon: icon(Copy), onClick: () => ctx.onCopy?.(section.id) })
  if (ctx.paste && ctx.onPasteAfter && !role)
    items.push({ id: "paste", label: tt("Paste below"), hint: ctx.paste.ok ? ctx.paste.name : ctx.paste.reason, disabled: !ctx.paste.ok, icon: icon(ClipboardPaste), onClick: ctx.onPasteAfter })
  if (i > 0) items.push({ id: "move-up", label: tt("Move up"), icon: icon(ArrowUp), onClick: () => ctx.onMove(section.id, -1) })
  if (i >= 0 && i < list.length - 1) items.push({ id: "move-down", label: tt("Move down"), icon: icon(ArrowDown), onClick: () => ctx.onMove(section.id, 1) })
  items.push({ id: "toggle-hidden", label: section.hidden ? tt("Show") : tt("Hide"), icon: section.hidden ? icon(Eye) : icon(EyeOff), onClick: () => ctx.onToggleHide(section.id) })
  const code = ctx.codeItem?.(section)
  if (code) items.push({ id: "edit-code", label: code.label, hint: code.hint, disabled: !code.run, icon: icon(Code2), onClick: code.run })
  items.push({ id: "delete", label: tt("Delete"), icon: icon(Trash2), variant: "destructive", separatorBefore: true, onClick: () => ctx.onRemove(section.id) })
  return items
}

/* ── The list ────────────────────────────────────────────────────────────── */

export function SectionsList({
  sections,
  nameOf,
  selectedId,
  onSelect,
  onToggleHide,
  onDuplicate,
  onRemove,
  onMove,
  onAdd,
  kindOfType,
  overlayAddable,
  dnd,
  blocksOf,
  expanded,
  onToggleExpand,
  codeItem,
  onCopy,
  paste,
  onPaste,
}: SectionsListProps) {
  const groups = splitGroups(sections)
  /** Delete, after the row has folded away (tree-parts foldAway), from its bin and from its menu alike. */
  const listRoot = React.useRef<HTMLDivElement | null>(null)
  const removeSmooth = (id: string) => {
    const row = listRoot.current?.querySelector<HTMLElement>(`[data-section-row-wrap="${CSS.escape(id)}"]`) ?? null
    foldAway(row, () => onRemove(id))
  }
  /** The one menu, and the row it is for. */
  const [menu, setMenu] = React.useState<{ id: string; place: ActionMenuPlace } | null>(null)
  /** The insert line's own menu (a right click on it), and where among the page's sections it adds. */
  const [insertMenu, setInsertMenu] = React.useState<{ at: number; place: ActionMenuPlace } | null>(null)
  const closeInsert = React.useCallback(() => setInsertMenu(null), [])
  const closeMenu = React.useCallback(() => setMenu(null), [])
  /* The rows' handlers, made once and reading the latest props when they run (ListRow). */
  const latest = React.useRef({ onSelect, onToggleHide, onToggleExpand, removeSmooth, onAdd })
  latest.current = { onSelect, onToggleHide, onToggleExpand, removeSmooth, onAdd }
  const handlers = React.useMemo<RowHandlers>(
    () => ({
      select: (id) => latest.current.onSelect(id),
      toggleHide: (id) => latest.current.onToggleHide(id),
      remove: (id) => latest.current.removeSmooth(id),
      toggleExpand: (id) => latest.current.onToggleExpand?.(id),
      menu: (id, place) => setMenu({ id, place }),
      insertAt: (at) => latest.current.onAdd(at, "template"),
      insertMenu: (at, x, y) => setInsertMenu({ at, place: { box: { left: x, top: y, width: 1, height: 1 }, phone: isPhone(), align: "start" } }),
    }),
    [],
  )
  /** A section's block rows when it is open, and whether it has any to open. */
  const tree = (s: SectionInstance) => {
    const node = blocksOf?.(s) ?? null
    const open = !!node && !!expanded?.has(s.id)
    return {
      expandable: node !== null,
      expanded: open,
      under: open ? <div data-section-blocks={s.id}>{node}</div> : null,
    }
  }
  const body = groups.template
  const bodyRef = React.useRef(body)
  bodyRef.current = body
  /**
   * THE PAGE'S SECTIONS MOVE BY THEIR GRIP, with the drag the blocks and the
   * menu links use: the lifted row follows the finger exactly, the rows it
   * passes slide aside, and the order is saved once, on release. A section
   * that is open carries its blocks with it. dnd-kit drew a copy of the row
   * in the air and waited 220ms before a finger counted; the grip owns its
   * finger now, so a press on it is a drag straight away and a swipe
   * anywhere else still scrolls.
   */
  const { listRef, drag, gripProps, rowStyle } = useReorder<HTMLDivElement>({
    count: body.length,
    onMove: (from, to) => {
      const list = bodyRef.current
      if (list[from] && list[to]) dnd.onReorder(list[from].id, list[to].id)
    },
    nameOf: (i) => (bodyRef.current[i] ? nameOf(bodyRef.current[i]) : ""),
  })

  /**
   * A row of the Header or Footer group. The header (or footer) itself wears
   * the badge and keeps Delete in its menu; anything else in the group moves
   * up and down inside it from the menu, since a drag across groups is not
   * a thing either group allows.
   */
  const groupRows = (role: "header" | "footer" | "overlay") => {
    const list = groups[role]
    return list.map((s) => {
      const chrome = role !== "overlay" && isKind(s, role, kindOfType) ? role : undefined
      const t = tree(s)
      return (
        <div key={s.id} data-section-row-wrap={s.id}>
          <ListRow
            h={handlers}
            section={s}
            displayName={nameOf(s)}
            isSelected={selectedId === s.id}
            chrome={chrome}
            fixed
            index={0}
            expandable={t.expandable}
            expanded={t.expanded}
            menuOpen={menu?.id === s.id}
          />
          {t.under}
        </div>
      )
    })
  }

  /**
   * THE MENU'S ROWS, for the section it was opened on, worked out when it
   * opens: where the section is in its group decides Move up and Move down,
   * and what kind of section it is decides Duplicate.
   */
  const open = menu ? sections.find((s) => s.id === menu.id) ?? null : null
  const openAt = open ? body.findIndex((s) => s.id === open.id) : -1
  const items = open
    ? sectionRowMenu(open, sections, {
        kindOfType,
        codeItem,
        onDuplicate,
        onMove,
        onToggleHide,
        onRemove: removeSmooth,
        onCopy,
        paste,
        onPasteAfter: onPaste && openAt >= 0 ? () => onPaste(openAt + 1) : undefined,
      })
    : NO_ITEMS
  /* Two rows, no more: add a section here, or paste the copied one here. */
  const insertItems: ActionMenuItem[] = insertMenu
    ? [
        { id: "add-here", label: tt("Add section"), icon: <Plus strokeWidth={1.75} />, onClick: () => onAdd(insertMenu.at, "template") },
        ...(onPaste
          ? [{ id: "paste-here", label: tt("Paste here"), hint: paste ? (paste.ok ? paste.name : paste.reason) : tt("Copy a section first"), disabled: !paste?.ok, icon: <ClipboardPaste strokeWidth={1.75} />, onClick: () => onPaste(insertMenu.at) }]
          : []),
      ]
    : NO_ITEMS

  return (
    <div ref={listRoot} data-sections-list="" className="space-y-0.5">
      <ActionMenuAt at={menu?.place ?? null} items={items} title={open ? nameOf(open) : undefined} onClose={closeMenu} />
      <ActionMenuAt at={insertMenu?.place ?? null} items={insertItems} onClose={closeInsert} />
      <div data-section-group="header">
        <GroupLabel>{GROUP_LABELS.header}</GroupLabel>
        {groupRows("header")}
        {/* What may go in the Header group: an announcement bar above the header, or a header. */}
        <AddSectionButton onClick={() => onAdd(null, "header")} />
      </div>

      <div className="mx-1 my-2 h-px bg-[#eceef1]" aria-hidden />

      <div data-section-group="template">
        <GroupLabel>{GROUP_LABELS.template}</GroupLabel>
        {body.length === 0 ? (
          <p className="px-1 py-1.5 pl-[50px] text-[12px] text-[#6b7280]">{tt("No sections on this page yet.")}</p>
        ) : (
          <>
            {/* Add section right under the Page heading too, so a long page never sends you to its end to add one; it adds at the top. */}
            <TreeAddRow data-add-section-top="" label={tt("Add section")} onClick={() => onAdd(0, "template")} />
            <div ref={listRef} data-section-drag-list="">
              {body.map((s, i) => {
                const t = tree(s)
                const lifted = drag?.from === i
                return (
                  /*
                    One row of the drag. An open section folds its blocks away
                    while it is carried (the owner: "it grabs the whole
                    container with the blocks frozen in it"), so only the row
                    moves, as on Shopify, and they are back when it is dropped.
                  */
                  <div
                    key={s.id}
                    data-section-row-wrap={s.id}
                    data-reorder-row=""
                    data-section-lifted={lifted ? "" : undefined}
                    style={rowStyle(i)}
                    className={cn("rounded-md", lifted && "wb-drag-lift bg-white")}
                  >
                    <ListRow
                      h={handlers}
                      section={s}
                      displayName={nameOf(s)}
                      isSelected={selectedId === s.id}
                      index={i}
                      grip={gripProps}
                      expandable={t.expandable}
                      expanded={t.expanded}
                      menuOpen={menu?.id === s.id}
                    />
                    {lifted ? null : t.under}
                    <InsertSectionDivider at={i + 1} h={handlers} />
                  </div>
                )
              })}
            </div>
          </>
        )}
        <AddSectionButton onClick={() => onAdd(null, "template")} />
      </div>

      <div className="mx-1 my-2 h-px bg-[#eceef1]" aria-hidden />

      <div data-section-group="footer">
        <GroupLabel>{GROUP_LABELS.footer}</GroupLabel>
        {groupRows("footer")}
        {/* What may go in the Footer group: a newsletter above the footer, or a footer. */}
        <AddSectionButton onClick={() => onAdd(null, "footer")} />
      </div>

      {/*
        THE OVERLAY GROUP: what floats over every page rather than sitting in
        it, as Shopify's overlay and aside groups do. A popup, a bar fixed to
        the bottom of a phone, back to top. Shown when the theme has such a
        section, or the page holds one.
      */}
      {(overlayAddable || groups.overlay.length > 0) && (
        <>
          <div className="mx-1 my-2 h-px bg-[#eceef1]" aria-hidden />
          <div data-section-group="overlay">
            <GroupLabel>{GROUP_LABELS.overlay}</GroupLabel>
            {groupRows("overlay")}
            {overlayAddable && <AddSectionButton onClick={() => onAdd(null, "overlay")} />}
          </div>
        </>
      )}
    </div>
  )
}
