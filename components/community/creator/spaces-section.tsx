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
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, GripVertical, LayoutGrid, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
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

  const saveOrder = async (next: SpaceView[]) => {
    const res = await send(base, "PUT", { ids: next.map((x) => x.id) })
    if (!res.ok) {
      toast(errorText(res.data.error, tt("The order was not saved.")))
      await reload()
    }
  }
  const move = async (index: number, by: -1 | 1) => {
    const next = [...spaces]
    const [s] = next.splice(index, 1)
    next.splice(index + by, 0, s)
    setSpaces(next)
    await saveOrder(next)
  }

  /*
    ROUND 27: DRAG A SPACE INTO PLACE on a computer (the arrows stay, for the keyboard and a phone). The row moves in the
    list as it is dragged over the others, and the order is saved once, when it is let go.
  */
  const [dragging, setDragging] = React.useState<string | null>(null)
  const dragStart = React.useRef<string>("")
  const dragOver = (overId: string) => {
    if (!dragging || overId === dragging) return
    setSpaces((list) => {
      const from = list.findIndex((x) => x.id === dragging)
      const to = list.findIndex((x) => x.id === overId)
      if (from < 0 || to < 0) return list
      const next = [...list]
      const [s] = next.splice(from, 1)
      next.splice(to, 0, s)
      return next
    })
  }
  const dragEnd = () => {
    const was = dragStart.current
    setDragging(null)
    const now = spaces.map((x) => x.id).join()
    if (was && was !== now) void saveOrder(spaces)
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
    setError(null)
    setDraft({ id: s.id, name: s.name, description: s.description ?? "", icon: chosenEmoji(s.icon) ?? "", kind: s.kind, postRole: s.postRole, commentsEnabled: s.commentsEnabled, viewAccess: s.viewAccess })
  }

  const dragFrom = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = "move"
    dragStart.current = spaces.map((x) => x.id).join()
    setDragging(id)
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
        <button type="button" aria-label={tt("Move {name} up", { name: s.name })} disabled={i === 0} onClick={() => void move(i, -1)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:cursor-default disabled:opacity-30">
          <ArrowUp aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" aria-label={tt("Move {name} down", { name: s.name })} disabled={i === spaces.length - 1} onClick={() => void move(i, 1)} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:cursor-default disabled:opacity-30">
          <ArrowDown aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <RowMenu items={menu(s, i)} label={tt("Actions for {name}", { name: s.name })} />
    </RowControls>
  )

  const menu = (s: SpaceView, i: number): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [{ label: tt("Edit"), onClick: () => edit(s) }]
    if (i > 0) items.push({ label: tt("Move up"), onClick: () => void move(i, -1) })
    if (i < spaces.length - 1) items.push({ label: tt("Move down"), onClick: () => void move(i, 1) })
    items.push(s.archived ? { label: tt("Restore"), onClick: () => void setArchived(s, false), separatorBefore: true } : { label: tt("Archive"), onClick: () => void setArchived(s, true), separatorBefore: true })
    if (s.posts === 0) items.push({ label: tt("Delete"), variant: "destructive", onClick: () => setDeleting(s) })
    return items
  }

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
            <table className={TABLE} data-spaces-table="">
              <thead>
                <tr>
                  <th className={TH}>{tt("Space")}</th>
                  <th className={cn(TH, "w-[132px]")}>{tt("Kind")}</th>
                  <th className={cn(TH, "w-[150px]")}>{tt("Who posts")}</th>
                  <th className={cn(TH, "w-[19%]")}>{tt("Who can see it")}</th>
                  <th className={cn(TH, "w-[96px] text-right")}>{tt("Posts")}</th>
                  <th className={cn(TH, "w-[124px]")} aria-label={tt("Actions")} />
                </tr>
              </thead>
              <tbody>
                {spaces.map((s, i) => (
                  <tr
                    key={s.id}
                    draggable
                    onDragStart={(e) => dragFrom(e, s.id)}
                    onDragOver={(e) => {
                      e.preventDefault()
                      dragOver(s.id)
                    }}
                    onDragEnd={dragEnd}
                    onClick={rowPress(() => edit(s))}
                    className={cn(TR, "group/space", dragging === s.id && "bg-[#f6f7f8] opacity-70")}
                    data-space-row=""
                  >
                    <td className={cn(TD, "h-[60px]")}>
                      <div className="flex min-w-0 items-center gap-3">
                        <GripVertical aria-hidden className="-ml-3 h-4 w-4 shrink-0 cursor-grab text-[#c4c6cc] opacity-0 transition-opacity duration-150 group-hover/space:opacity-100" />
                        {glyph(s)}
                        <RowOpen label={tt("Edit {name}", { name: s.name })} className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={cn("truncate text-[14px] font-medium", s.archived ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>{s.name}</span>
                            {s.archived ? <StatusBadge tone="neutral">{tt("Archived")}</StatusBadge> : null}
                          </span>
                          {s.description ? <span className="block truncate text-[12.5px] text-[#6b7280]">{s.description}</span> : null}
                        </RowOpen>
                      </div>
                    </td>
                    <td className={cn(TD, "truncate")}>{SPACE_KIND_LABEL[s.kind]}</td>
                    <td className={cn(TD, "truncate", MUTED)}>{s.kind === "chat" ? tt("Every member") : POST_ROLE_LABEL[s.postRole]}</td>
                    <td className={cn(TD, "truncate", MUTED)} title={describeRule(s.viewAccess, options)}>{describeRule(s.viewAccess, options)}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{count(s.posts)}</td>
                    <td className={TD}>{controls(s, i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className={PHONE_LIST}>
              {spaces.map((s, i) => (
                <li key={s.id} onClick={rowPress(() => edit(s))} className={cn("flex min-h-[64px] items-center gap-3 px-4 py-2.5", ROW_PRESS)} data-space-row="">
                  {glyph(s)}
                  <RowOpen label={tt("Edit {name}", { name: s.name })} className="flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("truncate text-[14.5px] font-medium", s.archived ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>{s.name}</span>
                      {s.archived ? <StatusBadge tone="neutral">{tt("Archived")}</StatusBadge> : null}
                    </span>
                    <span className="block truncate text-[12.5px] text-[#6b7280]">
                      {[SPACE_KIND_LABEL[s.kind], s.kind === "chat" ? null : POST_ROLE_LABEL[s.postRole], describeRule(s.viewAccess, options), postsWords(s)].filter(Boolean).join(" · ")}
                    </span>
                  </RowOpen>
                  {controls(s, i)}
                </li>
              ))}
            </ul>
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
