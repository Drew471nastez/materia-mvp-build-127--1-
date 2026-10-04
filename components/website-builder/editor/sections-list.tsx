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
 * Controls that wait for the pointer are `hidden`, not merely transparent.
 * A button at opacity 0 still takes a tap, and an invisible bin at the end
 * of a row is how somebody deletes a section by touching its name. Hidden,
 * they also take no room, so a long name is cut only while the pointer is
 * on its row. The row itself takes focus, so a keyboard reaches them too.
 */

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
  type SensorDescriptor,
  type SensorOptions,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, ChevronRight, Copy, Eye, EyeOff, GripVertical, MoreHorizontal, PanelBottom, PanelTop, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SectionInstance } from "@/lib/website-builder/types"
import { GROUP_LABELS, isKind, splitGroups, type KindOfType, type SectionGroup } from "@/lib/storelib-theme/section-groups"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface SectionsDnd {
  sensors: SensorDescriptor<SensorOptions>[]
  modifiers: Modifier[]
  draggingId: string | null
  onDragStart: (e: DragStartEvent) => void
  onDragOver: (e: DragOverEvent) => void
  onDragCancel: () => void
  onDragEnd: (e: DragEndEvent) => void
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
}

/* ── The parts ───────────────────────────────────────────────────────────── */

const GROUP_LABEL = "px-2 pb-1 pt-2 text-[12px] font-semibold text-[#1a1a2e]"

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className={GROUP_LABEL}>{children}</p>
}

/**
 * "Add section", as a line of violet text with its plus, like the theme editors
 * it is modelled on. The disc is Storelib's violet, #8b5cf6; the words are its
 * darker step, #7c3aed, which reads at 13px on white (5.7:1, where #8b5cf6
 * is 4.2:1).
 */
export function AddSectionButton({ onClick, label = "Add section" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      data-add-section=""
      onClick={onClick}
      className="flex h-8 max-sm:h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium text-[#7c3aed] transition-colors hover:bg-[#f5f3ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15 [-webkit-tap-highlight-color:transparent]"
    >
      <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] text-white">
        <Plus className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      {label}
    </button>
  )
}

/**
 * The strip between two rows that adds a section there. Eight pixels, with
 * no negative margin, so it never overlaps the rows either side of it and
 * two hover targets never fight over one pixel. Its plus does not take the
 * pointer; the strip is the only target.
 */
function InsertSectionDivider({ onClick }: { onClick: () => void }) {
  return (
    <div
      data-insert-section=""
      role="button"
      tabIndex={-1}
      aria-label="Add a section here"
      className="group/ins relative flex h-2 cursor-pointer select-none items-center justify-center"
      onClick={onClick}
    >
      <div className="pointer-events-none absolute inset-x-2 h-px bg-transparent transition-colors duration-150 group-hover/ins:bg-[#8b5cf6]/60" />
      <div className="pointer-events-none relative z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#8b5cf6] text-white opacity-0 transition-opacity duration-150 group-hover/ins:opacity-100">
        <Plus className="h-2 w-2" strokeWidth={3} />
      </div>
    </div>
  )
}

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
        selected ? "hover:bg-white/20" : "text-[#4b5563] hover:bg-black/[0.06] hover:text-[#1a1a2e]",
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
  onDuplicate?: () => void
  onRemove?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  /** The header or the footer: an icon in place of the grip, and Delete only from its menu. */
  chrome?: "header" | "footer"
  dragHandleProps?: Record<string, unknown>
  /** A row that is not dragged (one in the Header or Footer group): no grip, and the menu moves it. */
  fixed?: boolean
  /** The section has blocks: a chevron shows and hides them in the tree. */
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
}

export function SectionRow({
  section,
  displayName,
  isSelected,
  onSelect,
  onToggleHide,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
  chrome,
  dragHandleProps,
  fixed,
  expandable,
  expanded,
  onToggleExpand,
}: SectionRowProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const hidden = !!section.hidden
  const ItemClass = "cursor-pointer gap-2 text-[13px] hover:bg-neutral-100 focus:bg-neutral-100 data-[highlighted]:bg-neutral-100"

  return (
    <div
      data-section-row={section.id}
      role="button"
      tabIndex={0}
      aria-label={displayName}
      aria-current={isSelected || undefined}
      className={cn(
        "group/row flex h-8 max-sm:h-11 cursor-pointer items-center gap-1 rounded-md pl-1 pr-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/15",
        /* The builder is a light surface by decision: explicit colours, not tokens a dark root would flip. */
        isSelected ? "bg-[#1a1a2e] text-white" : "text-[#1a1a2e] hover:bg-[#f3f4f6]",
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return
        e.preventDefault()
        onSelect()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(true)
      }}
    >
      {chrome ? (
        /* The dark grey badge the owner chose for the header and the footer, at the row's new size. */
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center">
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-[5px]", isSelected ? "bg-white/15 text-white" : "bg-[#4d5058] text-white")}>
            {chrome === "header" ? <PanelTop className="h-3 w-3" strokeWidth={2} /> : <PanelBottom className="h-3 w-3" strokeWidth={2} />}
          </span>
        </span>
      ) : fixed ? (
        /* Not dragged: the room the grip takes, so the names line up with the rows that have one. */
        <span aria-hidden className="h-6 w-6 shrink-0" />
      ) : (
        /* The grip, always drawn: the list should look reorderable at rest. */
        <span
          {...(dragHandleProps ?? {})}
          aria-label={`Drag ${displayName} to reorder`}
          className={cn(
            "flex h-6 w-6 shrink-0 touch-none items-center justify-center rounded-md cursor-grab active:cursor-grabbing transition-colors",
            isSelected ? "hover:bg-white/20" : "hover:bg-black/[0.06]",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className={cn("h-3.5 w-3.5", isSelected ? "opacity-70" : "opacity-40 group-hover/row:opacity-70")} strokeWidth={1.75} />
        </span>
      )}

      {/* The section's blocks, shown and hidden under it, as Shopify's tree does. */}
      {expandable ? (
        <button
          type="button"
          aria-label={expanded ? `Hide the blocks in ${displayName}` : `Show the blocks in ${displayName}`}
          aria-expanded={!!expanded}
          data-section-expand={section.id}
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand?.()
          }}
          className={cn("-mx-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors", isSelected ? "hover:bg-white/20" : "text-[#6b7280] hover:bg-black/[0.06] hover:text-[#1a1a2e]")}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded && "rotate-90")} strokeWidth={2} />
        </button>
      ) : (
        <span aria-hidden className="-mx-0.5 h-5 w-5 shrink-0" />
      )}

      <span className={cn("min-w-0 flex-1 truncate text-[13px] max-sm:text-[15px] font-medium", hidden && "opacity-50")}>{displayName}</span>

      {/* The eye: always shown on a hidden row, which needs a way back; under the pointer otherwise. */}
      <RowAction label={hidden ? `Show ${displayName}` : `Hide ${displayName}`} onClick={onToggleHide} selected={isSelected} shown={hidden || isSelected}>
        {hidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
      </RowAction>

      {!chrome && onRemove && (
        <RowAction label={`Delete ${displayName}`} onClick={onRemove} selected={isSelected} shown={isSelected}>
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </RowAction>
      )}

      {/* `modal={false}`: a modal dropdown locks touch scrolling on the whole document, canvas included,
          and on iOS the lock was seen to outlive the menu (scripts/check-editor-scroll.mjs). */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More for ${displayName}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors duration-150",
              isSelected || menuOpen ? "flex" : "hidden group-hover/row:flex group-focus-within/row:flex",
              isSelected ? "hover:bg-white/20" : "text-[#4b5563] hover:bg-black/[0.06] hover:text-[#1a1a2e]",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="w-44" onClick={(e) => e.stopPropagation()}>
          {onDuplicate && (
            <DropdownMenuItem className={ItemClass} onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              Duplicate
            </DropdownMenuItem>
          )}
          {onMoveUp && (
            <DropdownMenuItem className={ItemClass} onClick={onMoveUp}>
              <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              Move up
            </DropdownMenuItem>
          )}
          {onMoveDown && (
            <DropdownMenuItem className={ItemClass} onClick={onMoveDown}>
              <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
              Move down
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className={ItemClass} onClick={onToggleHide}>
            {hidden ? <Eye className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />}
            {hidden ? "Show" : "Hide"}
          </DropdownMenuItem>
          {onRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ItemClass} onClick={onRemove}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SortableSectionRow({ under, ...props }: SectionRowProps & { under?: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.section.id })
  /* The overlay draws the row in the air; what stays here is the gap it left. */
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    willChange: transform ? "transform" : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <SectionRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
      {/* Its blocks travel with it: they are part of the row being moved. */}
      {under}
    </div>
  )
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
  dnd,
  blocksOf,
  expanded,
  onToggleExpand,
}: SectionsListProps) {
  const groups = splitGroups(sections)
  /** A section's block rows when it is open, and whether it has any to open. */
  const tree = (s: SectionInstance) => {
    const node = blocksOf?.(s) ?? null
    const open = !!node && !!expanded?.has(s.id)
    return {
      expandable: node !== null,
      expanded: open,
      onToggleExpand: () => onToggleExpand?.(s.id),
      under: open ? <div data-section-blocks={s.id}>{node}</div> : null,
    }
  }
  const body = groups.template
  const dragging = dnd.draggingId ? sections.find((s) => s.id === dnd.draggingId) : undefined

  /**
   * A row of the Header or Footer group. The header (or footer) itself wears
   * the badge and keeps Delete in its menu; anything else in the group moves
   * up and down inside it from the menu, since a drag across groups is not
   * a thing either group allows.
   */
  const groupRows = (role: "header" | "footer") => {
    const list = groups[role]
    return list.map((s, i) => {
      const chrome = isKind(s, role, kindOfType) ? role : undefined
      const t = tree(s)
      return (
        <div key={s.id}>
          <SectionRow
            section={s}
            displayName={nameOf(s)}
            isSelected={selectedId === s.id}
            onSelect={() => onSelect(s.id)}
            onToggleHide={() => onToggleHide(s.id)}
            onDuplicate={chrome ? undefined : () => onDuplicate(s.id)}
            onRemove={() => onRemove(s.id)}
            onMoveUp={i > 0 ? () => onMove(s.id, -1) : undefined}
            onMoveDown={i < list.length - 1 ? () => onMove(s.id, 1) : undefined}
            chrome={chrome}
            fixed
            expandable={t.expandable}
            expanded={t.expanded}
            onToggleExpand={t.onToggleExpand}
          />
          {t.under}
        </div>
      )
    })
  }

  return (
    <div data-sections-list="" className="space-y-0.5">
      <div data-section-group="header">
        <GroupLabel>{GROUP_LABELS.header}</GroupLabel>
        {groupRows("header")}
        {/* What may go in the Header group: an announcement bar above the header, or a header. */}
        <AddSectionButton onClick={() => onAdd(null, "header")} />
      </div>

      <div className="mx-2 my-2 h-px bg-[#e5e7eb]" aria-hidden />

      <div data-section-group="template">
        <GroupLabel>{GROUP_LABELS.template}</GroupLabel>
        <DndContext
          sensors={dnd.sensors}
          collisionDetection={closestCenter}
          modifiers={dnd.modifiers}
          /* Re-measured through the drag: the rows move under the finger, and a snapshot taken at the start drifts. */
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={dnd.onDragStart}
          onDragOver={dnd.onDragOver}
          onDragCancel={dnd.onDragCancel}
          onDragEnd={dnd.onDragEnd}
        >
          <SortableContext items={body.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {body.length === 0 ? (
              <p className="px-2 py-1.5 text-[12px] text-[#6b7280]">No sections on this page yet.</p>
            ) : (
              <div>
                <InsertSectionDivider onClick={() => onAdd(0, "template")} />
                {body.map((s, i) => {
                  const t = tree(s)
                  return (
                  <div key={s.id}>
                    <SortableSectionRow
                      section={s}
                      displayName={nameOf(s)}
                      isSelected={selectedId === s.id}
                      onSelect={() => onSelect(s.id)}
                      onToggleHide={() => onToggleHide(s.id)}
                      onDuplicate={() => onDuplicate(s.id)}
                      onRemove={() => onRemove(s.id)}
                      onMoveUp={i > 0 ? () => onMove(s.id, -1) : undefined}
                      onMoveDown={i < body.length - 1 ? () => onMove(s.id, 1) : undefined}
                      expandable={t.expandable}
                      expanded={t.expanded}
                      onToggleExpand={t.onToggleExpand}
                      under={t.under}
                    />
                    <InsertSectionDivider onClick={() => onAdd(i + 1, "template")} />
                  </div>
                  )
                })}
              </div>
            )}
          </SortableContext>
          {/* The row in the air is its own layer, so the finger has something that tracks it exactly. */}
          <DragOverlay>
            {dragging ? (
              <div className="wb-drag-lift rounded-md bg-white">
                <SectionRow section={dragging} displayName={nameOf(dragging)} isSelected={false} onSelect={() => {}} onToggleHide={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <AddSectionButton onClick={() => onAdd(null, "template")} />
      </div>

      <div className="mx-2 my-2 h-px bg-[#e5e7eb]" aria-hidden />

      <div data-section-group="footer">
        <GroupLabel>{GROUP_LABELS.footer}</GroupLabel>
        {groupRows("footer")}
        {/* What may go in the Footer group: a newsletter above the footer, or a footer. */}
        <AddSectionButton onClick={() => onAdd(null, "footer")} />
      </div>
    </div>
  )
}
