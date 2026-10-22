"use client"

/**
 * ===========================================================================
 *  THE LIBRARY, AS ITS ADMIN BUILDS IT (round 39)
 * ===========================================================================
 * /app/community/<slug>/library. One card holds the items in the order
 * members see them, the card every other section of the community admin
 * draws (creator/parts.tsx ListCard): from 768px a table (the item, whether
 * it is published, its section, who opens it, its views, downloads and
 * sales), on a phone one row each. A row opens the item's editor
 * (./library-editor.tsx). Rows are dragged into order the way Spaces' are
 * (the product editor's hold-to-drag: a mouse after 4px, a finger after a
 * 300ms hold, the grip with the keys), and the order is saved once per move.
 *
 * Add asks what it is: files and links uploaded straight into the Library
 * (a name first, then its editor), or one of the creator's own digital
 * products (picked from a list). Sections makes, renames, orders and removes
 * the shelf's sections.
 *
 * While the Library is off, the section says so first, with the switch for
 * whoever may change settings: items can be made beforehand.
 */
import * as React from "react"
import Image from "next/image"
import { DndContext, DragOverlay, closestCenter, useDndContext, type DragEndEvent, type UniqueIdentifier } from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { useConfirm } from "@/app/app/products/new/confirm-sheet"
import { AUTO_SCROLL, HANDLE_TOUCH, liftTick, useHoldToDragSensors } from "@/app/app/products/new/hold-to-drag"
import { sortableMove, verticalOnly } from "@/lib/ui/sortable-move"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { usePhone } from "@/components/community/learn/builder-parts"
import { Empty, ListCard, ListNote, RowMenu, buttonPrimary, buttonSecondary, send } from "@/components/community/creator/parts"
import { ROW_PRESS, RowControls, RowOpen, rowPress } from "@/components/community/creator/rows"
import { MUTED, PHONE_LIST, TABLE, TD, TH, TR, count } from "@/components/community/creator/ui-kit"
import { LIBRARY_ITEMS_MAX, SECTION_NAME_MAX } from "@/lib/communities/library"
import { tt } from "@/lib/i18n/text"
import { accessLine, type AdminLibraryData, type AdminLibraryItem } from "./model"
import { LibraryEditor } from "./library-editor"

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const BTN = "h-10 rounded-[10px] px-3.5 text-[14px] sm:h-9 sm:rounded-lg sm:px-3 sm:text-[13.5px]"
const FIELD =
  "h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[16px] text-[#1a1a2e] outline-none transition-shadow placeholder:text-[#9ca3af] focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/15 sm:h-10 sm:text-sm"
const LIFTED = "rounded-xl bg-white shadow-[0_16px_34px_-12px_rgba(17,24,39,0.32),0_2px_6px_rgba(17,24,39,0.08)] ring-1 ring-black/[0.06]"
/** After a drag, the press that ended it is not a press on the row. */
const AFTER_DRAG_QUIET_MS = 350

function settle(): { duration: number; easing: string } | null {
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  return still ? null : { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }
}

export function LibraryAdmin({ communityId, initial = null, initialOpenId = null, canSwitch = false }: { communityId: string; initial?: AdminLibraryData | null; initialOpenId?: string | null; /** May turn the Library on or off (manage_settings). */ canSwitch?: boolean }) {
  const [data, setData] = React.useState<AdminLibraryData | null>(initial)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(initialOpenId)
  const [adding, setAdding] = React.useState(false)
  const [sectioning, setSectioning] = React.useState(false)
  const [switching, setSwitching] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  const [ask, confirmSheet] = useConfirm()
  const base = `/api/app/community/${communityId}/library`

  const reload = React.useCallback(async () => {
    const res = await send<AdminLibraryData>(base, "GET")
    if (res.ok) {
      setData(res.data)
      setLoadError(null)
      return res.data as AdminLibraryData
    }
    setLoadError(res.data.error || tt("The library did not load. Try again."))
    return null
  }, [base])

  React.useEffect(() => {
    if (!initial) void reload()
  }, [initial, reload])

  React.useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 3200)
    return () => window.clearTimeout(t)
  }, [note])

  if (!data) {
    return (
      <div className={cn(CARD, "px-5 py-10 text-center")} data-library-admin="loading">
        <p className="text-[14px] text-[#6b7280]">{loadError ?? tt("Loading the library")}</p>
        {loadError ? (
          <button type="button" className={cn(secondaryDepth, BTN, "mt-3")} onClick={() => void reload()}>
            {tt("Try again")}
          </button>
        ) : null}
      </div>
    )
  }

  const open = openId ? data.items.find((i) => i.id === openId) : null
  if (open) {
    return (
      <>
        <LibraryEditor
          key={open.id}
          item={open}
          data={data}
          onBack={() => setOpenId(null)}
          onSaved={() => void reload()}
          onDeleted={async () => {
            setOpenId(null)
            await reload()
            setNote(tt("Taken out of the library"))
          }}
        />
        {confirmSheet}
      </>
    )
  }

  const flip = async (enabled: boolean) => {
    setSwitching(true)
    const res = await send(base, "PATCH", { enabled })
    setSwitching(false)
    if (!res.ok) return setNote(res.data.error || tt("That did not save. Try again."))
    setData((d) => (d ? { ...d, enabled } : d))
    setNote(enabled ? tt("The Library is on. Members see it beside Learn.") : tt("The Library is off. Nothing in it is deleted."))
  }

  const remove = async (item: AdminLibraryItem) => {
    const yes = await ask({
      title: tt("Take {title} out of the library?", { title: item.title }),
      body: item.kind === "product" ? tt("Members stop seeing it here. The product and its buyers are not touched.") : item.madeProduct ? tt("Members stop seeing it here. Everybody who bought it keeps it in their Storelib library.") : tt("Its files and links go with it. This cannot be undone."),
      confirm: tt("Take out"),
      cancel: tt("Keep it"),
      tone: "critical",
    })
    if (!yes) return
    const res = await send(`${base}/${item.id}`, "DELETE")
    setNote(res.ok ? tt("Taken out of the library") : res.data.error || tt("That did not go. Try again."))
    void reload()
  }

  return (
    <div className="space-y-4" data-library-admin="list">
      {!data.ready ? <Banner>{tt("The Library needs the latest database update (part 278). Run it, then come back here.")}</Banner> : null}
      {data.ready && !data.enabled ? (
        <div className={cn(CARD, "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5")} data-library-off="">
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold text-[#1a1a2e]">{tt("The Library is off")}</p>
            <p className="mt-0.5 text-[13.5px] leading-5 text-[#6b7280]">{canSwitch ? tt("Members do not see it yet. Add what goes in it, then turn it on.") : tt("Members do not see it yet. Whoever runs the settings can turn it on.")}</p>
          </div>
          {canSwitch ? (
            <button type="button" className={cn(buttonPrimary, "shrink-0")} onClick={() => void flip(true)} disabled={switching} data-library-turn-on="">
              {tt("Turn on")}
            </button>
          ) : null}
        </div>
      ) : null}

      <ItemList
        data={data}
        onOpen={(id) => setOpenId(id)}
        onRemove={(i) => void remove(i)}
        onAdd={() => setAdding(true)}
        onSections={() => setSectioning(true)}
        onOrder={async (ids, was) => {
          const res = await send(base, "PUT", { ids })
          if (!res.ok) {
            setData((d) => (d ? { ...d, items: was } : d))
            setNote(res.data.error || tt("The order was not saved."))
          }
        }}
        setItems={(items) => setData((d) => (d ? { ...d, items } : d))}
      />

      {data.enabled && canSwitch ? (
        <button type="button" className="inline-flex min-h-10 items-center text-[13px] font-medium text-[#6b7280] underline decoration-[#d1d5db] underline-offset-2 hover:text-[#1a1a2e] sm:min-h-0"
          onClick={() => void flip(false)} disabled={switching} data-library-turn-off="">
          {tt("Turn the Library off")}
        </button>
      ) : null}

      <p className="min-h-[20px] text-[13px] text-[#4b5563]" role="status" aria-live="polite">
        {note}
      </p>

      <AddSheet
        open={adding}
        data={data}
        onClose={() => setAdding(false)}
        onAdd={async (body) => {
          const res = await send<{ id: string }>(base, "POST", body)
          if (!res.ok) return res.data.error || tt("That could not be added. Try again.")
          setAdding(false)
          const next = await reload()
          if (next?.items.some((i) => i.id === res.data.id)) setOpenId(res.data.id)
          return null
        }}
      />
      <SectionsSheet open={sectioning} data={data} base={base} onClose={() => setSectioning(false)} onChanged={() => void reload()} />
      {confirmSheet}
    </div>
  )
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-[#f1e3bd] bg-[#fdf8ea] px-3.5 py-2.5 text-[13.5px] leading-5 text-[#6b4e00]">{children}</p>
}

/* The state, quietly: a dot and the word. */
function StatusDot({ status }: { status: "draft" | "published" }) {
  return (
    <span className={cn("font-medium", status === "published" ? "text-[#1d6b45]" : "text-[#8a5a00]")} data-status={status}>
      <span aria-hidden className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[2px]", status === "published" ? "bg-[#22a06b]" : "bg-[#e0a100]")} />
      {status === "published" ? tt("Published") : tt("Draft")}
    </span>
  )
}

function Thumb({ item, w }: { item: AdminLibraryItem; w: string }) {
  const cover = item.coverUrl || item.product?.coverUrl || null
  return (
    <span className={cn("relative aspect-[4/3] shrink-0 overflow-hidden rounded-lg border border-black/[0.04] bg-[#f1f2f4]", w)}>
      {cover ? (
        <Image src={cover} alt="" fill sizes="72px" className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[#b0b4bb]">
          <PlaceIcon place="library" size={18} />
        </span>
      )}
    </span>
  )
}

function kindLine(i: AdminLibraryItem): string {
  if (i.kind === "product") return tt("A product you sell")
  const files = i.files.length ? tt("{n, plural, one {# file} other {# files}}", { n: i.files.length }) : ""
  const links = i.links.length ? tt("{n, plural, one {# link} other {# links}}", { n: i.links.length }) : ""
  return [files, links].filter(Boolean).join(" · ") || tt("Nothing added yet")
}

function statsLine(i: AdminLibraryItem): string {
  const parts = [tt("{n, plural, one {# view} other {# views}}", { n: i.stats.views }), tt("{n, plural, one {# download} other {# downloads}}", { n: i.stats.downloads })]
  if (i.mode === "paid" || i.stats.sales) parts.push(tt("{n, plural, one {# sale} other {# sales}}", { n: i.stats.sales }))
  return parts.join(" · ")
}

type Listeners = Record<string, ((e: React.SyntheticEvent) => void) | undefined>

function splitListeners(listeners: Listeners | undefined) {
  const { onKeyDown, ...pointer } = listeners ?? {}
  const row: Listeners = {}
  for (const [name, fn] of Object.entries(pointer)) {
    row[name] = (e: React.SyntheticEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-row-control]")) return
      fn?.(e)
    }
  }
  return { row, key: { onKeyDown } }
}

function Grip({ name, sortable, className }: { name: string; sortable: ReturnType<typeof useSortable>; className?: string }) {
  const { key } = splitListeners(sortable.listeners as Listeners | undefined)
  return (
    <button
      type="button"
      ref={sortable.setActivatorNodeRef}
      {...sortable.attributes}
      {...key}
      aria-label={tt("Move {name}", { name })}
      onClick={(e) => e.stopPropagation()}
      className={cn("grid shrink-0 place-items-center rounded-md text-[#c4c6cc] outline-none hover:text-[#6b7280] focus-visible:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20", HANDLE_TOUCH, className)}
      data-library-grip=""
    >
      <GripVertical aria-hidden className="h-4 w-4" />
    </button>
  )
}

function LiftedCopy({ items, children }: { items: AdminLibraryItem[]; children: (item: AdminLibraryItem) => React.ReactNode }) {
  const { active } = useDndContext()
  const item = active ? items.find((i) => i.id === active.id) : null
  return item ? <>{children(item)}</> : null
}

function ItemList({
  data,
  onOpen,
  onRemove,
  onAdd,
  onSections,
  onOrder,
  setItems,
}: {
  data: AdminLibraryData
  onOpen: (id: string) => void
  onRemove: (item: AdminLibraryItem) => void
  onAdd: () => void
  onSections: () => void
  onOrder: (ids: string[], was: AdminLibraryItem[]) => Promise<void>
  setItems: (items: AdminLibraryItem[]) => void
}) {
  const items = data.items
  const sensors = useHoldToDragSensors()
  const quietUntil = React.useRef(0)
  const ids = items.map((i) => i.id)
  const sectionName = (id: string | null) => (id ? (data.sections.find((s) => s.id === id)?.name ?? "") : "")
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return
    const was = items
    const next = arrayMove(items, from, to)
    setItems(next)
    void onOrder(next.map((i) => i.id), was)
  }
  const nameOf = (id: UniqueIdentifier) => items.find((i) => i.id === id)?.title ?? ""
  const place = (id: UniqueIdentifier | undefined) => (id == null ? 0 : ids.indexOf(String(id)) + 1)
  const dnd = {
    sensors,
    collisionDetection: closestCenter,
    modifiers: [verticalOnly],
    autoScroll: AUTO_SCROLL,
    accessibility: {
      announcements: {
        onDragStart: ({ active }: { active: { id: UniqueIdentifier } }) => tt("Picked up {name}.", { name: nameOf(active.id) }),
        onDragOver: ({ active, over }: { active: { id: UniqueIdentifier }; over: { id: UniqueIdentifier } | null }) => (over ? tt("{name} is now at position {n} of {count}.", { name: nameOf(active.id), n: place(over.id), count: ids.length }) : undefined),
        onDragEnd: ({ active, over }: { active: { id: UniqueIdentifier }; over: { id: UniqueIdentifier } | null }) => (over ? tt("{name} dropped at position {n} of {count}.", { name: nameOf(active.id), n: place(over.id), count: ids.length }) : tt("Dropped where it was.")),
        onDragCancel: ({ active }: { active: { id: UniqueIdentifier } }) => tt("Cancelled. {name} is back where it was.", { name: nameOf(active.id) }),
      },
      screenReaderInstructions: { draggable: tt("To move an item, press Enter on its handle, then the arrow keys. Press Enter again to drop it, or Escape to put it back.") },
    },
    onDragStart: (e: { activatorEvent: Event }) => liftTick(e.activatorEvent),
    onDragEnd: ({ active, over }: DragEndEvent) => {
      quietUntil.current = Date.now() + AFTER_DRAG_QUIET_MS
      if (!over || active.id === over.id) return
      moveTo(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    },
    onDragCancel: () => {
      quietUntil.current = Date.now() + AFTER_DRAG_QUIET_MS
    },
  }
  const open = (id: string) => {
    if (Date.now() < quietUntil.current) return
    onOpen(id)
  }
  const menuOf = (i: AdminLibraryItem, at: number): ActionMenuItem[] => [
    { label: tt("Edit"), onClick: () => onOpen(i.id) },
    { label: tt("View as a member"), href: `/community/${data.slug}/library/${i.id}`, target: "_blank" },
    ...(at > 0 ? [{ label: tt("Move up"), icon: <ArrowUp className="h-4 w-4" />, onClick: () => moveTo(at, at - 1), separatorBefore: true }] : []),
    ...(at < items.length - 1 ? [{ label: tt("Move down"), icon: <ArrowDown className="h-4 w-4" />, onClick: () => moveTo(at, at + 1), separatorBefore: at === 0 }] : []),
    { label: tt("Take out"), icon: <Trash2 className="h-4 w-4" />, variant: "destructive" as const, onClick: () => onRemove(i), separatorBefore: true },
  ]

  return (
    <ListCard
      data-library-list=""
      head={
        <ListNote>
          {tt("{n, plural, one {# item} other {# items}}", { n: items.length })}
          <span className="max-sm:hidden">{tt(", in the order members see them")}</span>
        </ListNote>
      }
      actions={
        <>
          <button type="button" className={buttonSecondary} onClick={onSections} disabled={!data.ready} data-library-sections="">
            {tt("Sections")}
          </button>
          <button type="button" className={buttonPrimary} onClick={onAdd} disabled={!data.ready || items.length >= LIBRARY_ITEMS_MAX} data-library-add="">
            <Plus className="h-4 w-4" aria-hidden />
            {tt("Add")}
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <div data-library-admin-empty="">
          <Empty title={tt("Fill the library")} detail={tt("Templates, guides, recordings, downloads: free for members, for some of them, or for sale. Members find it beside Learn.")}>
            <button type="button" className={cn(buttonPrimary, "h-10 px-4")} onClick={onAdd} disabled={!data.ready}>
              {tt("Add the first item")}
            </button>
          </Empty>
        </div>
      ) : (
        <>
          <DndContext {...dnd}>
            <table className={TABLE} data-library-table="">
              <thead>
                <tr>
                  <th className={TH}>{tt("Item")}</th>
                  <th className={cn(TH, "w-[112px]")}>{tt("Status")}</th>
                  <th className={cn(TH, "w-[19%]")}>{tt("Who can open it")}</th>
                  <th className={cn(TH, "w-[84px] text-right")}>{tt("Views")}</th>
                  <th className={cn(TH, "w-[104px] text-right")}>{tt("Downloads")}</th>
                  <th className={cn(TH, "w-[96px] text-right")}>{tt("Sales")}</th>
                  <th className={cn(TH, "w-[60px]")} aria-label={tt("Actions")} />
                </tr>
              </thead>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <tbody>
                  {items.map((i, at) => (
                    <TableRow key={i.id} item={i} onOpen={() => open(i.id)}>
                      {(cell, style, grip) => (
                        <>
                          <td className={cn(TD, cell, "h-[68px]")} style={style}>
                            <div className="flex min-w-0 items-center gap-3">
                              {grip}
                              <Thumb item={i} w="w-[60px]" />
                              <RowOpen label={tt("Edit {title}", { title: i.title })} className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{i.title}</span>
                                <span className="block truncate text-[12.5px] text-[#6b7280]">{[sectionName(i.sectionId), kindLine(i)].filter(Boolean).join(" · ")}</span>
                              </RowOpen>
                            </div>
                          </td>
                          <td className={cn(TD, cell)} style={style}>
                            <StatusDot status={i.status} />
                          </td>
                          <td className={cn(TD, cell, "truncate tabular-nums", MUTED)} style={style} title={accessLine(i, data.tiers)}>
                            {accessLine(i, data.tiers)}
                          </td>
                          <td className={cn(TD, cell, "text-right tabular-nums")} style={style} data-library-views="">
                            {count(i.stats.views)}
                          </td>
                          <td className={cn(TD, cell, "text-right tabular-nums")} style={style} data-library-downloads="">
                            {count(i.stats.downloads)}
                          </td>
                          <td className={cn(TD, cell, "text-right tabular-nums")} style={style} data-library-sales="">
                            {i.mode === "paid" || i.stats.sales ? (
                              <>
                                <span className="block">{count(i.stats.sales)}</span>
                                {i.stats.revenueLabel ? <span className={cn("block text-[12px]", MUTED)}>{i.stats.revenueLabel}</span> : null}
                              </>
                            ) : null}
                          </td>
                          <td className={cn(TD, cell)} style={style}>
                            <RowControls className="justify-end">
                              <RowMenu items={menuOf(i, at)} label={tt("More for {title}", { title: i.title })} />
                            </RowControls>
                          </td>
                        </>
                      )}
                    </TableRow>
                  ))}
                </tbody>
              </SortableContext>
            </table>
            <DragOverlay dropAnimation={settle()}>
              <LiftedCopy items={items}>
                {(i) => (
                  <div className={cn(LIFTED, "flex h-[68px] items-center gap-3 px-4 scale-[1.02]")}>
                    <GripVertical aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    <Thumb item={i} w="w-[60px]" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#1a1a2e]">{i.title}</span>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-[#6b7280]">{accessLine(i, data.tiers)}</span>
                  </div>
                )}
              </LiftedCopy>
            </DragOverlay>
          </DndContext>
          <DndContext {...dnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul className={PHONE_LIST} data-library-phone-list="">
                {items.map((i, at) => (
                  <PhoneRow key={i.id} item={i} onOpen={() => open(i.id)}>
                    <Thumb item={i} w="w-[64px]" />
                    <RowOpen label={tt("Edit {title}", { title: i.title })} className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#1a1a2e]">{i.title}</span>
                      <span className="mt-1 block truncate text-[13px] leading-[18px] tabular-nums text-[#6b7280]">
                        <StatusDot status={i.status} />
                        <span aria-hidden> · </span>
                        {accessLine(i, data.tiers)}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] leading-[18px] tabular-nums text-[#6b7280]" data-library-stats-line="">
                        {statsLine(i)}
                      </span>
                    </RowOpen>
                    <RowControls>
                      <RowMenu items={menuOf(i, at)} label={tt("More for {title}", { title: i.title })} />
                    </RowControls>
                  </PhoneRow>
                ))}
              </ul>
            </SortableContext>
            <DragOverlay dropAnimation={settle()}>
              <LiftedCopy items={items}>
                {(i) => (
                  <div className={cn(LIFTED, "flex min-h-[72px] items-center gap-3 py-2.5 pl-2 pr-4")}>
                    <GripVertical aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    <Thumb item={i} w="w-[64px]" />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#1a1a2e]">{i.title}</span>
                  </div>
                )}
              </LiftedCopy>
            </DragOverlay>
          </DndContext>
        </>
      )}
    </ListCard>
  )
}

function TableRow({ item, onOpen, children }: { item: AdminLibraryItem; onOpen: () => void; children: (cell: string, style: React.CSSProperties, grip: React.ReactNode) => React.ReactNode }) {
  const sortable = useSortable({ id: item.id })
  const { row } = splitListeners(sortable.listeners as Listeners | undefined)
  const style: React.CSSProperties = { ...sortableMove(sortable), position: "relative" }
  const slot = sortable.isDragging ? "bg-[#f6f7f8] text-transparent [&>*]:invisible" : ""
  const grip = <Grip name={item.title} sortable={sortable} className="-ml-4 -mr-1.5 h-9 w-5 opacity-0 transition-opacity duration-150 group-hover/libraryrow:opacity-100 focus-visible:opacity-100" />
  return (
    <tr ref={sortable.setNodeRef} {...row} onClick={rowPress(onOpen)} className={cn(TR, "group/libraryrow select-none [-webkit-touch-callout:none]")} data-library-row={item.id} data-lifted={sortable.isDragging ? "" : undefined}>
      {children(slot, style, grip)}
    </tr>
  )
}

function PhoneRow({ item, onOpen, children }: { item: AdminLibraryItem; onOpen: () => void; children: React.ReactNode }) {
  const sortable = useSortable({ id: item.id })
  const { row } = splitListeners(sortable.listeners as Listeners | undefined)
  return (
    <li
      ref={sortable.setNodeRef}
      {...row}
      onClick={rowPress(onOpen)}
      style={sortableMove(sortable)}
      className={cn("relative flex min-h-[76px] items-center gap-3 bg-white py-3 pl-1.5 pr-2", ROW_PRESS, HANDLE_TOUCH, "cursor-pointer", sortable.isDragging && "bg-[#f6f7f8] [&>*]:invisible")}
      data-library-row={item.id}
      data-lifted={sortable.isDragging ? "" : undefined}
    >
      <Grip name={item.title} sortable={sortable} className="-mr-1.5 h-10 w-6" />
      {children}
    </li>
  )
}

/* ── Add ────────────────────────────────────────────────────────────────── */

function AddSheet({ open, data, onClose, onAdd }: { open: boolean; data: AdminLibraryData; onClose: () => void; onAdd: (body: Record<string, unknown>) => Promise<string | null> }) {
  const phone = usePhone()
  const [step, setStep] = React.useState<"pick" | "resource" | "product">("pick")
  const [title, setTitle] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (open) {
      setStep("pick")
      setTitle("")
      setError(null)
      setBusy(null)
    }
  }, [open])
  const attached = new Set(data.items.map((i) => i.productId).filter(Boolean))
  const products = data.products.filter((p) => !attached.has(p.id))
  const make = async (body: Record<string, unknown>, key: string) => {
    setBusy(key)
    setError(await onAdd(body))
    setBusy(null)
  }
  const choice = "flex min-h-[64px] w-full items-start gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-left outline-none transition-colors hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("Add to the library")} className="max-w-[480px] gap-0 rounded-2xl p-0">
      <div className="flex h-full min-h-0 flex-col" data-library-add-sheet={step}>
        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6 sm:pt-6">
          <SheetDialogTitle className="text-[18px] font-semibold leading-6 text-[#1a1a2e]">{step === "product" ? tt("Pick a product") : step === "resource" ? tt("Files and links") : tt("Add to the library")}</SheetDialogTitle>
          <p className="mt-1 text-[14px] text-[#6b7280]">
            {step === "product" ? tt("One of your digital products. Its files stay the product's own, and owning it opens it here.") : step === "resource" ? tt("Name it first. Files, links and who opens it come next.") : tt("It starts as a draft. Publish it when it is ready.")}
          </p>
          {error ? (
            <p className="mt-2 text-[13px] text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {step === "pick" ? (
          <div className="space-y-2 px-5 pb-5 sm:px-6 sm:pb-6">
            <button type="button" className={choice} onClick={() => setStep("resource")} data-library-add-kind="resource">
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-[#1a1a2e]">{tt("Upload files or add links")}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-[#6b7280]">{tt("A PDF, a template, a recording, a shared folder. Kept in Storelib, given only to members who open it.")}</span>
              </span>
            </button>
            <button type="button" className={choice} onClick={() => setStep("product")} disabled={!data.products.length} data-library-add-kind="product">
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-[#1a1a2e]">{tt("One of your products")}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-[#6b7280]">{data.products.length ? tt("A digital product from your store, free for members or sold here.") : tt("You have no digital products yet.")}</span>
              </span>
            </button>
          </div>
        ) : step === "resource" ? (
          <form
            className="px-5 pb-5 sm:px-6 sm:pb-6"
            onSubmit={(e) => {
              e.preventDefault()
              if (!title.trim()) return setError(tt("Give it a name."))
              void make({ kind: "resource", title }, "resource")
            }}
          >
            <label htmlFor="library-new-name" className="block text-[13px] font-medium text-[#4b5563]">
              {tt("Name")}
            </label>
            <input id="library-new-name" className={cn(FIELD, "mt-1.5")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={tt("Pricing worksheet")} autoFocus={!phone} />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={cn(secondaryDepth, BTN, "max-sm:flex-1")} onClick={() => setStep("pick")}>
                {tt("Back")}
              </button>
              <button type="submit" className={cn(primaryDepth, BTN, "max-sm:flex-1")} disabled={!!busy} aria-busy={!!busy || undefined} data-library-make="">
                {tt("Make it")}
              </button>
            </div>
          </form>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 sm:px-3 sm:pb-4" data-library-products="">
            {products.length ? (
              products.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={!!busy} onClick={() => void make({ kind: "product", productId: p.id }, p.id)} className="flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#f6f7f8] disabled:opacity-60" data-library-product-choice={p.id}>
                    <span className="relative aspect-[4/3] w-14 shrink-0 overflow-hidden rounded-md bg-[#f1f2f4]">{p.coverUrl ? <Image src={p.coverUrl} alt="" fill sizes="56px" className="object-cover" /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">{p.title}</span>
                      <span className="block truncate text-[12.5px] tabular-nums text-[#6b7280]">{[p.priceLabel ?? tt("Free"), tt("{n, plural, one {# file} other {# files}}", { n: p.files }), p.status === "published" ? null : tt("Not published")].filter(Boolean).join(" · ")}</span>
                    </span>
                    {busy === p.id ? <span className="text-[13px] text-[#6b7280]">{tt("Adding")}</span> : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-[14px] text-[#6b7280]">{tt("Every one of your digital products is in the library already.")}</li>
            )}
          </ul>
        )}
      </div>
    </SheetDialog>
  )
}

/* ── Sections ───────────────────────────────────────────────────────────── */

function SectionsSheet({ open, data, base, onClose, onChanged }: { open: boolean; data: AdminLibraryData; base: string; onClose: () => void; onChanged: () => void }) {
  const phone = usePhone()
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [names, setNames] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    if (open) {
      setName("")
      setError(null)
      setNames(Object.fromEntries(data.sections.map((s) => [s.id, s.name])))
    }
  }, [open, data.sections])
  const run = async (fn: () => Promise<{ ok: boolean; data: { error?: string } }>) => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.ok) return setError(res.data.error || tt("That did not save. Try again."))
    setError(null)
    onChanged()
  }
  const move = (at: number, by: -1 | 1) => {
    const ids = data.sections.map((s) => s.id)
    const to = at + by
    if (to < 0 || to >= ids.length) return
    ;[ids[at], ids[to]] = [ids[to], ids[at]]
    void run(() => send(`${base}/sections`, "PUT", { ids }))
  }
  return (
    <SheetDialog open={open} onClose={onClose} phone={phone} label={tt("Sections")} className="max-w-[480px] gap-0 rounded-2xl p-0">
      <div className="flex h-full min-h-0 flex-col" data-library-sections-sheet="">
        <div className="shrink-0 px-5 pb-3 pt-1 sm:px-6 sm:pt-6">
          <SheetDialogTitle className="text-[18px] font-semibold leading-6 text-[#1a1a2e]">{tt("Sections")}</SheetDialogTitle>
          <p className="mt-1 text-[14px] text-[#6b7280]">{tt("They group the shelf for members, like Templates or Recordings. Taking one out keeps its items.")}</p>
          {error ? (
            <p className="mt-2 text-[13px] text-[#b42318]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
          {data.sections.length ? (
            <ul className="mb-4 divide-y divide-[#f0f1f3]">
              {data.sections.map((s, at) => (
                <li key={s.id} className="flex items-center gap-1.5 py-2" data-library-section={s.id}>
                  <input
                    aria-label={tt("Section name")}
                    className={cn(FIELD, "flex-1")}
                    value={names[s.id] ?? s.name}
                    maxLength={SECTION_NAME_MAX}
                    onChange={(e) => setNames((n) => ({ ...n, [s.id]: e.target.value }))}
                    onBlur={() => {
                      const next = (names[s.id] ?? s.name).trim()
                      if (next && next !== s.name) void run(() => send(`${base}/sections/${s.id}`, "PATCH", { name: next }))
                    }}
                  />
                  <span className="shrink-0 px-1 text-[12.5px] tabular-nums text-[#6b7280]">{s.count}</span>
                  <button type="button" aria-label={tt("Move {name} up", { name: s.name })} disabled={at === 0 || busy} onClick={() => move(at, -1)} className="grid h-10 w-9 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" aria-label={tt("Move {name} down", { name: s.name })} disabled={at === data.sections.length - 1 || busy} onClick={() => move(at, 1)} className="grid h-10 w-9 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:opacity-30">
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" aria-label={tt("Take out {name}", { name: s.name })} disabled={busy} onClick={() => void run(() => send(`${base}/sections/${s.id}`, "DELETE"))} className="grid h-10 w-9 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#b42318]">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return setError(tt("Give the section a name."))
              void run(async () => {
                const res = await send(`${base}/sections`, "POST", { name })
                if (res.ok) setName("")
                return res
              })
            }}
          >
            <input aria-label={tt("New section")} className={cn(FIELD, "flex-1")} value={name} maxLength={SECTION_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder={tt("Templates")} data-library-section-name="" />
            <button type="submit" className={cn(primaryDepth, BTN, "shrink-0")} disabled={busy} data-library-section-add="">
              {tt("Add")}
            </button>
          </form>
        </div>
      </div>
    </SheetDialog>
  )
}
