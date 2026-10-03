"use client"

/**
 * ===========================================================================
 *  SPACES
 * ===========================================================================
 * The rooms of a community, in the order members see them: a discussion
 * feed, a chat, announcements (admins post), resources. Each has a name,
 * an icon (an emoji), a line about it, who may start a post, whether
 * comments are on, and who can see it. Reorder with the arrows (each move
 * is saved), archive one to hide it with everything in it kept, delete one
 * only while nothing was ever posted in it.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import type { AccessRuleJson, PostRole, SpaceKind } from "@/lib/communities/types"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, RuleOptions, SpaceView } from "./view-types"
import { SPACE_KIND_LABEL, checkSpace } from "./logic"
import { AccessEditor, describeRule } from "./access-editor"
import { Confirm, Dialog, Empty, ListCard, ListNote, Notice, RowMenu, Toggle, buttonPrimary, buttonSecondary, errorText, field, label, selectField, send, useToast } from "./parts"

const KIND_ICON: Record<SpaceKind, string> = { feed: "💬", chat: "⚡", announcements: "📣", resources: "📚" }
const POST_ROLE_LABEL: Record<PostRole, string> = { member: "Members post", moderator: "Moderators post", admin: "Admins post" }

/** A stored icon is an emoji (shown) or an older word name (the kind's emoji is shown instead). */
export function spaceGlyph(s: { icon: string | null; kind: SpaceKind }): string {
  return s.icon && !/^[a-z-]+$/i.test(s.icon) ? s.icon : KIND_ICON[s.kind]
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
    const checked = checkSpace(draft, { creating: !draft.id })
    if (!checked.ok) return setError(checked.error)
    setBusy(true)
    setError(null)
    const res = draft.id ? await send(`${base}/${draft.id}`, "PATCH", draft) : await send(base, "POST", draft)
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error, "The space could not be saved."))
    setDraft(null)
    toast(draft.id ? "Space saved" : "Space added")
    await reload()
    router.refresh()
  }

  const move = async (index: number, by: -1 | 1) => {
    const next = [...spaces]
    const [s] = next.splice(index, 1)
    next.splice(index + by, 0, s)
    setSpaces(next)
    const res = await send(base, "PUT", { ids: next.map((x) => x.id) })
    if (!res.ok) {
      toast(errorText(res.data.error, "The order was not saved."))
      await reload()
    }
  }

  const setArchived = async (s: SpaceView, archived: boolean) => {
    const res = await send(`${base}/${s.id}`, "PATCH", { ...s, archived })
    if (!res.ok) return toast(errorText(res.data.error))
    toast(archived ? "Space archived" : "Space restored")
    await reload()
  }

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    const res = await send(`${base}/${deleting.id}`, "DELETE")
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error))
    setDeleting(null)
    toast("Space deleted")
    await reload()
  }

  const menu = (s: SpaceView, i: number): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [{ label: "Edit", onClick: () => setDraft({ id: s.id, name: s.name, description: s.description ?? "", icon: s.icon && !/^[a-z-]+$/i.test(s.icon) ? s.icon : "", kind: s.kind, postRole: s.postRole, commentsEnabled: s.commentsEnabled, viewAccess: s.viewAccess }) }]
    if (i > 0) items.push({ label: "Move up", onClick: () => void move(i, -1) })
    if (i < spaces.length - 1) items.push({ label: "Move down", onClick: () => void move(i, 1) })
    items.push(s.archived ? { label: "Restore", onClick: () => void setArchived(s, false), separatorBefore: true } : { label: "Archive", onClick: () => void setArchived(s, true), separatorBefore: true })
    if (s.posts === 0) items.push({ label: "Delete", variant: "destructive", onClick: () => setDeleting(s) })
    return items
  }

  return (
    <div className="space-y-4" data-spaces="">
      <ListCard
        head={
          <ListNote>
            {spaces.length} {spaces.length === 1 ? "space" : "spaces"}
            <span className="max-sm:hidden">, in the order members see them</span>
          </ListNote>
        }
        actions={
          <button type="button" onClick={() => { setError(null); setDraft({ ...blank }) }} className={buttonPrimary} data-space-new="">
            <Plus aria-hidden className="h-4 w-4" />
            New space
          </button>
        }
      >
        {spaces.length === 0 ? (
          <Empty title="No spaces yet." detail="Add a space for members to post in." />
        ) : (
          <ul className="divide-y divide-[#f1f2f4]">
            {spaces.map((s, i) => (
              <li key={s.id} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 sm:px-5" data-space-row="">
                <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#f3f4f6] text-[17px]", s.archived && "opacity-50")}>
                  {spaceGlyph(s)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2">
                    <span className={cn("truncate text-[14.5px] font-medium", s.archived ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>{s.name}</span>
                    {s.archived ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}
                  </p>
                  <p className="truncate text-[12.5px] text-[#6b7280]">
                    {[SPACE_KIND_LABEL[s.kind], s.kind === "chat" ? null : POST_ROLE_LABEL[s.postRole], describeRule(s.viewAccess, options), `${s.posts.toLocaleString("en-US")} ${s.kind === "chat" ? "messages" : s.posts === 1 ? "post" : "posts"}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="hidden items-center gap-0.5 sm:flex">
                  <button type="button" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => void move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:opacity-30">
                    <ArrowUp aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={`Move ${s.name} down`} disabled={i === spaces.length - 1} onClick={() => void move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f1f2f4] disabled:opacity-30">
                    <ArrowDown aria-hidden className="h-4 w-4" />
                  </button>
                </div>
                <RowMenu items={menu(s, i)} label={`Actions for ${s.name}`} />
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit space" : "New space"}
        footer={
          <>
            <button type="button" onClick={() => setDraft(null)} className={cn(buttonSecondary, "h-10 px-4 sm:h-9")}>
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={busy} className={cn(buttonPrimary, "h-10 px-4 sm:h-9")} data-space-save="">
              {busy ? "Saving" : draft?.id ? "Save" : "Add space"}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[64px_1fr] gap-3">
              <div>
                <label htmlFor="sp-icon" className={label}>
                  Icon
                </label>
                <input id="sp-icon" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: [...e.target.value].slice(-2).join("") })} placeholder={KIND_ICON[draft.kind]} className={cn(field, "h-11 text-center text-[18px] sm:h-10")} />
              </div>
              <div>
                <label htmlFor="sp-name" className={label}>
                  Name
                </label>
                <input id="sp-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 40) })} placeholder="Wins" className={cn(field, "h-11 sm:h-10")} />
              </div>
            </div>
            <div>
              <label htmlFor="sp-desc" className={label}>
                About it
              </label>
              <input id="sp-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value.slice(0, 200) })} placeholder="Share what went well this week" className={cn(field, "h-11 sm:h-10")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sp-kind" className={label}>
                  Kind
                </label>
                <select id="sp-kind" value={draft.kind} onChange={(e) => { const kind = e.target.value as SpaceKind; setDraft({ ...draft, kind, postRole: kind === "announcements" ? "admin" : draft.postRole }) }} className={selectField}>
                  {(["feed", "chat", "announcements", "resources"] as const).map((k) => (
                    <option key={k} value={k}>
                      {SPACE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              {draft.kind !== "chat" ? (
                <div>
                  <label htmlFor="sp-role" className={label}>
                    Who posts
                  </label>
                  <select id="sp-role" value={draft.postRole} onChange={(e) => setDraft({ ...draft, postRole: e.target.value as PostRole })} className={selectField}>
                    <option value="member">Every member</option>
                    <option value="moderator">Moderators and up</option>
                    <option value="admin">Admins only</option>
                  </select>
                </div>
              ) : null}
            </div>
            {draft.kind !== "chat" ? <Toggle checked={draft.commentsEnabled} onChange={(v) => setDraft({ ...draft, commentsEnabled: v })} title="Comments" hint="Members can comment on posts here." /> : null}
            <AccessEditor value={draft.viewAccess} onChange={(v) => setDraft({ ...draft, viewAccess: v })} options={options} idPrefix="sp" />
            {draft.kind === "chat" && !head.can.manage_settings ? null : draft.kind === "chat" ? <p className="text-[12.5px] text-[#6b7280]">Chat shows only while chat is on in Settings.</p> : null}
            {error ? <Notice>{error}</Notice> : null}
          </div>
        ) : null}
      </Dialog>

      <Confirm open={deleting !== null} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name ?? "this space"}?`} detail="Nothing was posted in it, so nothing is lost." action="Delete" danger busy={busy} onConfirm={() => void remove()} />
    </div>
  )
}
