"use client"

/**
 * ===========================================================================
 *  SPACES
 * ===========================================================================
 * The rooms of a community, in the order members see them: a discussion
 * feed, a chat, announcements (admins post), resources. Each has a name,
 * an icon (an emoji), a line about it, who may start a post, whether
 * comments are on, and who can see it. Reorder by dragging a row (round 27) or with the arrows (each move
 * is saved), archive one to hide it with everything in it kept, delete one
 * only while nothing was ever posted in it.
 *
 * Round 31 (the owner): a row opens the space's editor wherever it is
 * pressed (rows.tsx), its menu keeps the rest. The icon is picked from
 * Storelib's emoji picker or typed as the admin's own (space-icon-field.tsx),
 * never a text box with a caret over the emoji. On a phone the form is the
 * New post sheet (form-sheet.tsx): Cancel and Add space in its top row, the
 * fields lifted above the keyboard.
 *
 * Round 32 (the owner, on a computer: "too shrunk"): from 768px the spaces
 * are a table (./ui-kit.tsx), each fact in its own column (kind, who posts,
 * who can see it, how many posts) instead of one long grey line, the drag
 * handle and the arrows in the row, the menu last. Kind and Who posts are
 * the app's own picks, never the browser's select.
 *
 * Round 33 (the owner: "the drag and drop arrangement must be smoother and
 * cleaner, on phones and on a computer"). Round 27's drag was the browser's
 * own HTML drag: nothing on a touch screen at all, on a computer a ghost
 * picture of the row and the list reordered under the pointer on every
 * dragover, with no motion. It is the product editor's now
 * (app/app/products/new/hold-to-drag.ts, dnd-kit), the same as the gallery:
 *
 *   A MOUSE    drags a row after 4px from anywhere on it; a press without
 *              moving still opens the row.
 *   A FINGER   holds a row for 300ms (a short tick on the iPhone), then
 *              drags it; a swipe before then scrolls the page as before.
 *              Near the top or bottom of the screen the page scrolls by itself.
 *   THE KEYS   the grip is a button: Enter lifts the row, the arrows move
 *              it, Enter drops it, Escape puts it back, each step read out.
 *
 * The row under the pointer is lifted: a copy of it on a white card with a
 * soft shadow, a touch larger, follows the pointer one to one on the
 * compositor (DragOverlay). Where it was, a quiet slot of its height. The
 * other rows slide out of the way on dnd-kit's own 200ms move, each cell
 * moved rather than the row (a table row does not move in every browser).
 * Let go, the copy settles into its slot, and the order is saved once; if
 * the save fails, the order goes back to what it was and a line says so.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { DndContext, DragOverlay, closestCenter, type Announcements, type DragEndEvent, type DragStartEvent, type UniqueIdentifier } from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ArrowDown, ArrowUp, GripVertical, LayoutGrid, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { AUTO_SCROLL, HANDLE_TOUCH, liftTick, useHoldToDragSensors } from "@/app/app/products/new/hold-to-drag"
import { sortableMove, verticalOnly } from "@/lib/ui/sortable-move"
import type { AccessRuleJson, PostRole, SpaceKind } from "@/lib/communities/types"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, RuleOptions, SpaceView } from "./view-types"
import { SPACE_KIND_LABEL, checkSpace } from "./logic"
import { AccessEditor, describeRule } from "./access-editor"
import { Confirm, Empty, ListCard, ListNote, Notice, RowMenu, SelectField, Toggle, buttonPrimary, errorText, field, label, send, useToast } from "./parts"
import { MUTED, PHONE_LIST, TABLE, TD, TH, TR, count } from "./ui-kit"
import { chosenEmoji } from "@/components/community/member/space-glyph"
import { FormSheet } from "./form-sheet"
import { IconGlyph, SpaceIconField } from "./space-icon-field"
import { checkSpaceIcon } from "./space-icon"
import { ROW_PRESS, RowControls, RowOpen, rowPress } from "./rows"
import { tt } from "@/lib/i18n/text"

const KIND_ICON: Record<SpaceKind, string> = { feed: "💬", chat: "⚡", announcements: "📣", resources: "📚" }
const POST_ROLE_LABEL: Record<PostRole, string> = { get member() { return tt("Members post") }, get moderator() { return tt("Moderators post") }, get admin() { return tt("Admins post") } }

/** A stored icon is the admin's (an emoji, or up to two letters, shown) or an older word name (the kind's emoji is shown instead). */
export function spaceGlyph(s: { icon: string | null; kind: SpaceKind }): string {
  return chosenEmoji(s.icon) ?? KIND_ICON[s.kind]
}

interface Draft {
  id: string | null
  name: string
  description: string
  icon: string
  kind: SpaceKind
  postRole: PostRole
  commentsEnabled: boolean
  viewAccess: AccessRuleJson
}

const blank: Draft = { id: null, name: "", description: "", icon: "", kind: "feed", postRole: "member", commentsEnabled: true, viewAccess: {} }

/** After a drag, the press that ended it is not a press on the row: this long, nothing opens. */
export const AFTER_DRAG_QUIET_MS = 350

/** The lifted copy's card: white, a hairline, a soft shadow under it. */
const LIFTED = "rounded-xl bg-white shadow-[0_16px_34px_-12px_rgba(17,24,39,0.32),0_2px_6px_rgba(17,24,39,0.08)] ring-1 ring-black/[0.06]"

/** The table's column widths, once: the head, and the lifted copy's own one row table, so its cells line up with the rows under it. */
const COLS = ["", "w-[132px]", "w-[150px]", "w-[19%]", "w-[96px]", "w-[124px]"]

/** The lifted copy settles into its slot; with reduced motion it is simply there. */
function settle(): { duration: number; easing: string } | null {
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  return still ? null : { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }
}

/** The lift: the copy grows to its lifted size over 140ms once it is on the page, so it rises rather than appears. */
function Lift({ children, className }: { children: React.ReactNode; className?: string }) {
  const [up, setUp] = React.useState(false)
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setUp(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className={cn(LIFTED, "cursor-grabbing transition-[scale] duration-[140ms] ease-out motion-reduce:transition-none", up ? "scale-[1.02]" : "scale-100", className)} data-space-lifted="">
      {children}
    </div>
  )
}

export function SpacesSection({ head, initial, options }: { head: CommunityHead; initial: SpaceView[]; options: RuleOptions }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}/spaces`
  const [spaces, setSpaces] = React.useState(initial)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [deleting, setDeleting] = React.useState<SpaceView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reload = async () => {
    const res = await send<{ spaces: SpaceView[] }>(base, "GET")
    if (res.ok) setSpaces(res.data.spaces ?? [])
  }

  const save = async () => {
    if (!draft) return
    const icon = checkSpaceIcon(draft.icon)
    if (!icon.ok) return setError(icon.error)
    const checked = checkSpace({ ...draft, icon: icon.value }, { creating: !draft.id })
    if (!checked.ok) return setError(checked.error)
    setBusy(true)
    setError(null)
    const body = { ...draft, icon: icon.value }
    const res = draft.id ? await send(`${base}/${draft.id}`, "PATCH", body) : await send(base, "POST", body)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error, tt("The space could not be saved.")))
    setDraft(null)
    toast(draft.id ? tt("Space saved") : tt("Space added"))
    await reload()
    router.refresh()
  }

  /* Saved once per move. A refusal puts the order back where it was (`was`), and says so. */
  const saveOrder = async (next: SpaceView[], was: SpaceView[]) => {
    const res = await send(base, "PUT", { ids: next.map((x) => x.id) })
    if (!res.ok) {
      setSpaces((now) => (now.map((x) => x.id).join() === next.map((x) => x.id).join() ? was : now))
      toast(errorText(res.data.error, tt("The order was not saved.")))
    }
  }
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= spaces.length || to >= spaces.length) return
    const was = spaces
    const next = arrayMove(spaces, from, to)
    setSpaces(next)
    void saveOrder(next, was)
  }
  const move = (index: number, by: -1 | 1) => moveTo(index, index + by)

  /* ── Dragging (hold-to-drag.ts, as the product editor and the gallery) ── */
  const sensors = useHoldToDragSensors()
  const [lifted, setLifted] = React.useState<UniqueIdentifier | null>(null)
  const quietUntil = React.useRef(0)
  const ids = spaces.map((s) => s.id)
  const place = (id: UniqueIdentifier | undefined) => (id == null ? 0 : ids.indexOf(String(id)) + 1)
  const nameOf = (id: UniqueIdentifier) => spaces.find((s) => s.id === id)?.name ?? ""
  const announcements: Announcements = {
    onDragStart: ({ active }) => tt("Picked up {name}.", { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? tt("{name} is now at position {n} of {count}.", { name: nameOf(active.id), n: place(over.id), count: ids.length }) : undefined),
    onDragEnd: ({ active, over }) => (over ? tt("{name} dropped at position {n} of {count}.", { name: nameOf(active.id), n: place(over.id), count: ids.length }) : tt("Dropped where it was.")),
    onDragCancel: ({ active }) => tt("Cancelled. {name} is back where it was.", { name: nameOf(active.id) }),
  }
  const onDragStart = (e: DragStartEvent) => {
    setLifted(e.active.id)
    liftTick(e.activatorEvent)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setLifted(null)
    quietUntil.current = Date.now() + AFTER_DRAG_QUIET_MS
    if (!over || active.id === over.id) return
    moveTo(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }
  const onDragCancel = () => {
    setLifted(null)
    quietUntil.current = Date.now() + AFTER_DRAG_QUIET_MS
  }
  const dnd = {
    sensors,
    collisionDetection: closestCenter,
    modifiers: [verticalOnly],
    autoScroll: AUTO_SCROLL,
    accessibility: {
      announcements,
      screenReaderInstructions: { draggable: tt("To move a space, press Enter on its handle, then the arrow keys. Press Enter again to drop it, or Escape to put it back.") },
    },
    onDragStart,
    onDragEnd,
    onDragCancel,
  }

  const setArchived = async (s: SpaceView, archived: boolean) => {
    const res = await send(`${base}/${s.id}`, "PATCH", { ...s, archived })
    if (!res.ok) return toast(errorText(res.data.error))
    toast(archived ? tt("Space archived") : tt("Space restored"))
    await reload()
  }

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    const res = await send(`${base}/${deleting.id}`, "DELETE")
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error))
    setDeleting(null)
    toast(tt("Space deleted"))
    await reload()
  }

  const edit = (s: SpaceView) => {
    /* The release that ended a drag is not a press on the row. */
    if (Date.now() < quietUntil.current) return
    setError(null)
    setDraft({ id: s.id, name: s.name, description: s.description ?? "", icon: chosenEmoji(s.icon) ?? "", kind: s.kind, postRole: s.postRole, commentsEnabled: s.commentsEnabled, viewAccess: s.viewAccess })
  }

  const postsWords = (s: SpaceView) => (s.kind === "chat" ? tt("{n, plural, one {# message} other {# messages}}", { n: s.posts }) : tt("{n, plural, one {# post} other {# posts}}", { n: s.posts }))

  const glyph = (s: SpaceView) => (
    <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#f3f4f6]", s.archived && "opacity-50")} data-space-glyph="">
      <IconGlyph value={spaceGlyph(s)} size="sm" />
    </span>
  )

  /* The arrows (a computer) and the menu: their presses stay theirs. */
  const controls = (s: SpaceView, i: number) => (
    <RowControls className="justify-end gap-0.5">
      <div className="hidden items-center gap-0.5 md:flex">
        <button type="button" aria-label={tt("Move {name} up", { name: s.name })} disabled={i === 0} onClick={() => move(i, -1)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:cursor-default disabled:opacity-30">
          <ArrowUp aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" aria-label={tt("Move {name} down", { name: s.name })} disabled={i === spaces.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:cursor-default disabled:opacity-30">
          <ArrowDown aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <RowMenu items={menu(s, i)} label={tt("Actions for {name}", { name: s.name })} />
    </RowControls>
  )

  const menu = (s: SpaceView, i: number): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [{ label: tt("Edit"), onClick: () => edit(s) }]
    if (i > 0) items.push({ label: tt("Move up"), onClick: () => move(i, -1) })
    if (i < spaces.length - 1) items.push({ label: tt("Move down"), onClick: () => move(i, 1) })
    items.push(s.archived ? { label: tt("Restore"), onClick: () => void setArchived(s, false), separatorBefore: true } : { label: tt("Archive"), onClick: () => void setArchived(s, true), separatorBefore: true })
    if (s.posts === 0) items.push({ label: tt("Delete"), variant: "destructive", onClick: () => setDeleting(s) })
    return items
  }

  /* What a row says, the same in its place and in the lifted copy. */
  const words = (s: SpaceView, size: "table" | "phone") => (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn("truncate font-medium", size === "table" ? "text-[14px]" : "text-[14.5px]", s.archived ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>{s.name}</span>
        {s.archived ? <StatusBadge tone="neutral">{tt("Archived")}</StatusBadge> : null}
      </span>
      {size === "table" ? (
        s.description ? <span className="block truncate text-[12.5px] text-[#6b7280]">{s.description}</span> : null
      ) : (
        <span className="block truncate text-[12.5px] text-[#6b7280]">{[SPACE_KIND_LABEL[s.kind], s.kind === "chat" ? null : POST_ROLE_LABEL[s.postRole], describeRule(s.viewAccess, options), postsWords(s)].filter(Boolean).join(" · ")}</span>
      )}
    </>
  )
  const facts = (s: SpaceView, cell: string, style?: React.CSSProperties) => (
    <>
      <td className={cn(TD, cell, "truncate")} style={style}>{SPACE_KIND_LABEL[s.kind]}</td>
      <td className={cn(TD, cell, "truncate", MUTED)} style={style}>{s.kind === "chat" ? tt("Every member") : POST_ROLE_LABEL[s.postRole]}</td>
      <td className={cn(TD, cell, "truncate", MUTED)} style={style} title={describeRule(s.viewAccess, options)}>{describeRule(s.viewAccess, options)}</td>
      <td className={cn(TD, cell, "text-right tabular-nums")} style={style}>{count(s.posts)}</td>
    </>
  )

  const liftedSpace = lifted == null ? null : (spaces.find((s) => s.id === lifted) ?? null)
  const liftedIndex = liftedSpace ? spaces.indexOf(liftedSpace) : -1

  return (
    <div className="space-y-4" data-spaces="">
      <ListCard
        head={
          <ListNote>
            {tt("{n, plural, one {# space} other {# spaces}}", { n: spaces.length })}
            <span className="max-sm:hidden">{tt(", in the order members see them")}</span>
          </ListNote>
        }
        actions={
          <button type="button" onClick={() => { setError(null); setDraft({ ...blank }) }} className={buttonPrimary} data-space-new="">
            <Plus aria-hidden className="h-4 w-4" />
            {tt("New space")}
          </button>
        }
      >
        {spaces.length === 0 ? (
          <Empty title={tt("No spaces yet.")} detail={tt("Add a space for members to post in.")} icon={LayoutGrid}>
            <button type="button" onClick={() => { setError(null); setDraft({ ...blank }) }} className={buttonPrimary}>
              {tt("New space")}
            </button>
          </Empty>
        ) : (
          <>
            <DndContext {...dnd}>
              <table className={TABLE} data-spaces-table="" data-dragging={lifted != null ? "" : undefined}>
                <thead>
                  <tr>
                    <th className={TH}>{tt("Space")}</th>
                    <th className={cn(TH, COLS[1])}>{tt("Kind")}</th>
                    <th className={cn(TH, COLS[2])}>{tt("Who posts")}</th>
                    <th className={cn(TH, COLS[3])}>{tt("Who can see it")}</th>
                    <th className={cn(TH, COLS[4], "text-right")}>{tt("Posts")}</th>
                    <th className={cn(TH, COLS[5])} aria-label={tt("Actions")} />
                  </tr>
                </thead>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {spaces.map((s, i) => (
                      <TableRow key={s.id} space={s} onOpen={() => edit(s)}>
                        {(cell, style, grip) => (
                          <>
                            <td className={cn(TD, cell, "h-[60px]")} style={style}>
                              <div className="flex min-w-0 items-center gap-3">
                                {grip}
                                {glyph(s)}
                                <RowOpen label={tt("Edit {name}", { name: s.name })} className="min-w-0 flex-1">
                                  {words(s, "table")}
                                </RowOpen>
                              </div>
                            </td>
                            {facts(s, cell, style)}
                            <td className={cn(TD, cell)} style={style}>{controls(s, i)}</td>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </tbody>
                </SortableContext>
              </table>
              <DragOverlay dropAnimation={settle()}>
                {liftedSpace ? (
                  <Lift>
                    {/* One row of the same table, so every cell is where it is under it. */}
                    <table className="w-full table-fixed border-separate border-spacing-0">
                      <colgroup>
                        {COLS.map((c, k) => (
                          <col key={k} className={c} />
                        ))}
                      </colgroup>
                      <tbody>
                        <tr>
                          <td className={cn(TD, "h-[60px] border-t-0")}>
                            <div className="flex min-w-0 items-center gap-3">
                              <span aria-hidden className="-ml-4 -mr-1.5 grid h-9 w-5 shrink-0 place-items-center text-[#9ca3af]">
                                <GripVertical className="h-4 w-4" />
                              </span>
                              {glyph(liftedSpace)}
                              <span className="block min-w-0 flex-1">{words(liftedSpace, "table")}</span>
                            </div>
                          </td>
                          {facts(liftedSpace, "border-t-0")}
                          <td className={cn(TD, "border-t-0")}>
                            <span className="flex justify-end pr-1 text-[12.5px] tabular-nums text-[#9ca3af]">{liftedIndex + 1}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </Lift>
                ) : null}
              </DragOverlay>
            </DndContext>
            <DndContext {...dnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className={PHONE_LIST} data-spaces-list="" data-dragging={lifted != null ? "" : undefined}>
                  {spaces.map((s, i) => (
                    <PhoneRow key={s.id} space={s} onOpen={() => edit(s)}>
                      {glyph(s)}
                      <RowOpen label={tt("Edit {name}", { name: s.name })} className="flex-1">
                        {words(s, "phone")}
                      </RowOpen>
                      {controls(s, i)}
                    </PhoneRow>
                  ))}
                </ul>
              </SortableContext>
              <DragOverlay dropAnimation={settle()}>
                {liftedSpace ? (
                  <Lift className="flex min-h-[64px] items-center gap-3 py-2.5 pl-1.5 pr-4">
                    <span aria-hidden className="-mr-1.5 grid h-10 w-6 shrink-0 place-items-center text-[#9ca3af]">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    {glyph(liftedSpace)}
                    <span className="block min-w-0 flex-1">{words(liftedSpace, "phone")}</span>
                  </Lift>
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </ListCard>

      <FormSheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? tt("Edit space") : tt("New space")}
        name="space"
        focus={draft !== null && !draft.id}
        action={{ label: draft?.id ? tt("Save") : tt("Add space"), busyLabel: tt("Saving"), busy, onClick: () => void save(), data: { "data-space-save": "" } }}
      >
        {draft ? (
          <div className="space-y-4">
            {/* What is wrong first, where it is read without scrolling past the keyboard. */}
            {error ? <Notice>{error}</Notice> : null}
            <div className="grid grid-cols-[56px_1fr] gap-3">
              <div>
                <label htmlFor="sp-icon" className={label}>
                  {tt("Icon")}
                </label>
                <SpaceIconField id="sp-icon" value={draft.icon} kind={draft.kind} onChange={(icon) => setDraft((d) => (d ? { ...d, icon } : d))} />
              </div>
              <div>
                <label htmlFor="sp-name" className={label}>
                  {tt("Name")}
                </label>
                <input id="sp-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 40) })} placeholder={tt("Wins")} enterKeyHint="next" data-autofocus={draft.id ? undefined : ""} className={cn(field, "h-11 sm:h-10")} />
              </div>
            </div>
            <div>
              <label htmlFor="sp-desc" className={label}>
                {tt("About it")}
              </label>
              <input id="sp-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value.slice(0, 200) })} placeholder={tt("Share what went well this week")} enterKeyHint="done" className={cn(field, "h-11 sm:h-10")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sp-kind" className={label}>
                  {tt("Kind")}
                </label>
                <SelectField
                  id="sp-kind"
                  name="space-kind"
                  title={tt("Kind")}
                  value={draft.kind}
                  onChange={(kind) => setDraft((d) => (d ? { ...d, kind, postRole: kind === "announcements" ? "admin" : d.postRole } : d))}
                  options={(["feed", "chat", "announcements", "resources"] as const).map((k) => ({ value: k, label: SPACE_KIND_LABEL[k] }))}
                />
              </div>
              {draft.kind !== "chat" ? (
                <div>
                  <label htmlFor="sp-role" className={label}>
                    {tt("Who posts")}
                  </label>
                  <SelectField
                    id="sp-role"
                    name="space-role"
                    title={tt("Who posts")}
                    value={draft.postRole}
                    onChange={(postRole) => setDraft((d) => (d ? { ...d, postRole } : d))}
                    options={[
                      { value: "member" as PostRole, label: tt("Every member") },
                      { value: "moderator" as PostRole, label: tt("Moderators and up") },
                      { value: "admin" as PostRole, label: tt("Admins only") },
                    ]}
                  />
                </div>
              ) : null}
            </div>
            {draft.kind !== "chat" ? <Toggle checked={draft.commentsEnabled} onChange={(v) => setDraft({ ...draft, commentsEnabled: v })} title={tt("Comments")} hint={tt("Members can comment on posts here.")} /> : null}
            <AccessEditor value={draft.viewAccess} onChange={(v) => setDraft({ ...draft, viewAccess: v })} options={options} idPrefix="sp" />
            {draft.kind === "chat" && !head.can.manage_settings ? null : draft.kind === "chat" ? <p className="text-[12.5px] text-[#6b7280]">{tt("Chat shows only while chat is on in Settings.")}</p> : null}
          </div>
        ) : null}
      </FormSheet>

      <Confirm open={deleting !== null} onClose={() => setDeleting(null)} title={tt("Delete {value}?", { value: deleting?.name ?? tt("this space") })} detail={tt("Nothing was posted in it, so nothing is lost.")} action={tt("Delete")} danger busy={busy} onConfirm={() => void remove()} />
    </div>
  )
}

/*
  ONE ROW, SORTABLE. A mouse press or a finger's hold anywhere on the row starts it (not on its arrows or its menu, which keep
  their presses); the keyboard starts it from the grip, which is a button of its own. The row's place is measured on the
  row; the move is put on each cell, which every browser moves, and the cells of the row being dragged are a quiet slot.
*/
type Listeners = Record<string, ((e: React.SyntheticEvent) => void) | undefined>

/** The pointer half of dnd-kit's listeners for the row, the keyboard half for the grip; a press inside the row's controls starts nothing. */
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
      /* A press on the grip is a drag or nothing: it never opens the row. */
      onClick={(e) => e.stopPropagation()}
      className={cn("grid shrink-0 place-items-center rounded-md text-[#c4c6cc] outline-none hover:text-[#6b7280] focus-visible:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20", HANDLE_TOUCH, className)}
      data-space-grip=""
    >
      <GripVertical aria-hidden className="h-4 w-4" />
    </button>
  )
}

function TableRow({ space, onOpen, children }: { space: SpaceView; onOpen: () => void; children: (cell: string, style: React.CSSProperties, grip: React.ReactNode) => React.ReactNode }) {
  const sortable = useSortable({ id: space.id })
  const { row } = splitListeners(sortable.listeners as Listeners | undefined)
  const style: React.CSSProperties = { ...sortableMove(sortable), position: "relative" }
  const slot = sortable.isDragging ? "bg-[#f6f7f8] text-transparent [&>*]:invisible" : ""
  /* At the start of the first cell, seen under the pointer or with the keyboard's focus. */
  const grip = <Grip name={space.name} sortable={sortable} className="-ml-4 -mr-1.5 h-9 w-5 opacity-0 transition-opacity duration-150 group-hover/space:opacity-100 focus-visible:opacity-100" />
  return (
    <tr ref={sortable.setNodeRef} {...row} onClick={rowPress(onOpen)} className={cn(TR, "group/space select-none [-webkit-touch-callout:none]")} data-space-row="" data-lifted={sortable.isDragging ? "" : undefined}>
      {children(slot, style, grip)}
    </tr>
  )
}

function PhoneRow({ space, onOpen, children }: { space: SpaceView; onOpen: () => void; children: React.ReactNode }) {
  const sortable = useSortable({ id: space.id })
  const { row } = splitListeners(sortable.listeners as Listeners | undefined)
  return (
    <li
      ref={sortable.setNodeRef}
      {...row}
      onClick={rowPress(onOpen)}
      style={sortableMove(sortable)}
      className={cn("relative flex min-h-[64px] items-center gap-3 bg-white py-2.5 pl-1.5 pr-4", ROW_PRESS, HANDLE_TOUCH, "cursor-pointer", sortable.isDragging && "bg-[#f6f7f8] [&>*]:invisible")}
      data-space-row=""
      data-lifted={sortable.isDragging ? "" : undefined}
    >
      <Grip name={space.name} sortable={sortable} className="-mr-1.5 h-10 w-6" />
      {children}
    </li>
  )
}
