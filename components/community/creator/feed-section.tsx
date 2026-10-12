"use client"

/**
 * ===========================================================================
 *  FEED, FOR THE PEOPLE WHO RUN IT
 * ===========================================================================
 * A compact composer (a space, an optional title, the text) that posts as a
 * member's post is posted (POST /api/app/community/<id>/posts): in the
 * Announcements space it is an announcement members hear about. Under it
 * the feed newest first, removed posts included so they can be put back,
 * and on each post what this role may do: pin, lock, feature, remove,
 * restore (POST /api/app/community/<id>/moderation).
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Lock, MessageCircle, Pin, Star, Heart } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge } from "@/app/app/orders/order-parts"
import { relativeTime } from "@/lib/communities/format"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, FeedRowView } from "./view-types"
import { Confirm, Empty, FilterTabs, ListCard, Notice, RowMenu, buttonPrimary, buttonSecondary, card, errorText, field, selectField, send, useToast } from "./parts"
import { tt } from "@/lib/i18n/text"

export interface ComposerSpace {
  id: string
  name: string
  announcements: boolean
}

export function FeedSection({ head, initial, spaces, compose }: { head: CommunityHead; initial: { rows: FeedRowView[]; next: string | null }; spaces: ComposerSpace[]; compose: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const base = `/api/app/community/${head.id}`
  const [rows, setRows] = React.useState(initial.rows)
  const [next, setNext] = React.useState(initial.next)
  const [show, setShow] = React.useState<"all" | "removed">("all")
  const [more, setMore] = React.useState(false)
  const [removing, setRemoving] = React.useState<FeedRowView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const welcome = compose === "welcome"
  const defaultSpace = (welcome ? spaces.find((s) => s.announcements) : null) ?? spaces.find((s) => !s.announcements) ?? spaces[0]
  const [spaceId, setSpaceId] = React.useState(defaultSpace?.id ?? "")
  const [title, setTitle] = React.useState(welcome ? tt("Welcome to {name}", { name: head.name }) : "")
  const [body, setBody] = React.useState("")
  const [error, setError] = React.useState<{ text: string; field?: string } | null>(null)
  const [posting, setPosting] = React.useState(false)
  const bodyRef = React.useRef<HTMLTextAreaElement>(null)
  /* One quiet line until it is used, so the posts are what the section shows first. */
  const [open, setOpen] = React.useState(welcome)

  React.useEffect(() => {
    if (welcome) bodyRef.current?.focus({ preventScroll: false })
  }, [welcome])

  React.useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 88), 320)}px`
  }, [body, open])

  const reload = async (which: "all" | "removed") => {
    const res = await send<{ rows: FeedRowView[]; next: string | null }>(`${base}/posts?show=${which}`, "GET")
    if (res.ok) {
      setRows(res.data.rows ?? [])
      setNext(res.data.next ?? null)
    }
  }

  const post = async () => {
    if (!body.trim() && !title.trim()) return setError({ text: tt("Write something first."), field: "body" })
    setPosting(true)
    setError(null)
    const res = await send<{ id?: string }>(`${base}/posts`, "POST", { spaceId, title, body })
    setPosting(false)
    if (!res.ok) return setError({ text: errorText(res.data.error, tt("The post could not be published. Try again.")), field: res.data.field })
    setTitle("")
    setBody("")
    setOpen(false)
    toast(spaces.find((s) => s.id === spaceId)?.announcements ? tt("Announcement posted") : tt("Posted"))
    await reload(show)
    router.refresh()
  }

  const act = async (r: FeedRowView, action: string, reason?: string) => {
    setBusy(true)
    const res = await send<{ status?: string }>(`${base}/moderation`, "POST", { action, targetType: "post", targetId: r.id, reason })
    setBusy(false)
    if (!res.ok) return toast(errorText(res.data.error))
    setRemoving(null)
    const patch: Partial<FeedRowView> =
      action === "pin" ? { pinned: true } : action === "unpin" ? { pinned: false } : action === "lock" ? { locked: true } : action === "reopen" ? { locked: false } : action === "feature" ? { featured: true } : action === "unfeature" ? { featured: false } : action === "remove" ? { status: "removed", pinned: false } : { status: "published" }
    setRows((x) => (show === "removed" && action === "restore" ? x.filter((y) => y.id !== r.id) : x.map((y) => (y.id === r.id ? { ...y, ...patch } : y))))
    toast(action === "remove" ? tt("Post removed") : action === "restore" ? tt("Post restored") : tt("Saved"))
  }

  const loadMore = async () => {
    if (!next) return
    setMore(true)
    const res = await send<{ rows: FeedRowView[]; next: string | null }>(`${base}/posts?show=${show}&cursor=${encodeURIComponent(next)}`, "GET")
    setMore(false)
    if (res.ok) {
      setRows((x) => [...x, ...(res.data.rows ?? [])])
      setNext(res.data.next ?? null)
    }
  }

  const menu = (r: FeedRowView): ActionMenuItem[] => {
    const c = head.can
    const items: ActionMenuItem[] = [{ label: tt("Open post"), href: `/community/${head.slug}/post/${r.id}`, target: "_blank" }]
    if (r.status === "published") {
      if (c.pin) items.push({ label: r.pinned ? tt("Unpin") : tt("Pin to the top"), onClick: () => void act(r, r.pinned ? "unpin" : "pin"), separatorBefore: true })
      if (c.lock) items.push({ label: r.locked ? tt("Allow comments") : tt("Lock comments"), onClick: () => void act(r, r.locked ? "reopen" : "lock") })
      if (c.feature) items.push({ label: r.featured ? tt("Stop featuring") : tt("Feature"), onClick: () => void act(r, r.featured ? "unfeature" : "feature") })
      if (c.moderate_content) items.push({ label: tt("Remove"), variant: "destructive", onClick: () => setRemoving(r), separatorBefore: true })
    } else if (r.status === "removed" && c.moderate_content) {
      items.push({ label: tt("Restore"), onClick: () => void act(r, "restore"), separatorBefore: true })
    }
    return items
  }

  return (
    <div className="space-y-4" data-feed="">
      {head.can.post && spaces.length > 0 && !head.archived ? (
        <section className={cn(card, "px-4 py-3 sm:px-5")} data-composer="" data-open={open || undefined}>
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className="flex min-h-11 w-full cursor-text items-center rounded-lg text-left text-[14.5px] text-[#9ca3af]" data-composer-open="">
              {tt("Write a post to your members")}
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-auto text-[15px] font-semibold text-[#1a1a2e]">{welcome ? tt("Write a welcome post") : tt("New post")}</p>
                <label htmlFor="post-space" className="sr-only">
                  {tt("Space")}
                </label>
                <select id="post-space" value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={cn(selectField, "w-auto min-w-[160px]")}>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} placeholder={tt("Title (optional)")} aria-label={tt("Title")} className={cn(field, "mt-3 h-11 font-medium sm:h-10")} />
              <textarea
                ref={bodyRef}
                autoFocus={!welcome}
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 10_000))}
                placeholder={welcome ? tt("Who it is for, how to get started, where to say hello") : tt("Share something with your members")}
                aria-label={tt("Post")}
                aria-invalid={error?.field === "body" || undefined}
                className={cn(field, "mt-2 resize-none py-2.5 leading-relaxed")}
              />
              {error ? (
                <p role="alert" className="mt-2 text-[13px] text-[#b91c1c]">
                  {error.text}
                </p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-[12.5px] text-[#6b7280]">{spaces.find((s) => s.id === spaceId)?.announcements ? tt("Members are told about announcements.") : tt("Posted as you, in this space.")}</p>
                <button type="button" onClick={() => { setOpen(false); setError(null) }} className={cn(buttonSecondary, "h-10 shrink-0 sm:h-9")}>
                  {tt("Cancel")}
                </button>
                <button type="button" onClick={() => void post()} disabled={posting} className={cn(buttonPrimary, "h-10 shrink-0 px-4 sm:h-9")} data-post-submit="">
                  {posting ? tt("Posting") : tt("Post")}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      <ListCard
        head={
          <FilterTabs
            label={tt("Which posts")}
            value={show}
            onChange={(v) => {
              setShow(v)
              void reload(v)
            }}
            tabs={[
              { value: "all", label: tt("All posts") },
              { value: "removed", label: tt("Removed") },
            ]}
          />
        }
      >
        {rows.length === 0 ? (
          show === "removed" ? <Empty title={tt("Nothing removed.")} /> : <Empty title={tt("No posts yet. Start the conversation.")} />
        ) : (
          <ul className="divide-y divide-[#f1f2f4]">
            {rows.map((r) => (
              <li key={r.id} className={cn("flex gap-2 py-3.5 pl-4 pr-2 sm:pl-5 sm:pr-3", r.status !== "published" && "bg-[#fcfcfd]")} data-feed-row="">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#6b7280]">
                    <span className="font-medium text-[#1a1a2e]">{r.authorName}</span>
                    {r.spaceName ? <span>{tt("in {spaceName}", { spaceName: r.spaceName })}</span> : null}
                    <span>{relativeTime(r.createdAt)}</span>
                    {r.kind === "announcement" ? <StatusBadge tone="neutral">{tt("Announcement")}</StatusBadge> : null}
                    {r.status === "removed" ? <StatusBadge tone="critical">{tt("Removed")}</StatusBadge> : null}
                    {r.pinned ? <Pin aria-label={tt("Pinned")} className="h-3.5 w-3.5 text-[#1a1a2e]" /> : null}
                    {r.locked ? <Lock aria-label={tt("Comments locked")} className="h-3.5 w-3.5" /> : null}
                    {r.featured ? <Star aria-label={tt("Featured")} className="h-3.5 w-3.5" /> : null}
                  </div>
                  {r.title ? <p className={cn("mt-1 truncate text-[14.5px] font-semibold", r.status === "published" ? "text-[#1a1a2e]" : "text-[#6b7280]")}>{r.title}</p> : null}
                  {r.excerpt ? <p className={cn("mt-0.5 line-clamp-2 text-[13.5px] leading-snug", r.status === "published" ? "text-[#4b5563]" : "text-[#9ca3af]")}>{r.excerpt}</p> : null}
                  <div className="mt-1.5 flex items-center gap-3 text-[12.5px] tabular-nums text-[#6b7280]">
                    <span className="inline-flex items-center gap-1">
                      <Heart aria-hidden className="h-3.5 w-3.5" />
                      {r.reactionCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                      {r.commentCount}
                    </span>
                  </div>
                </div>
                <RowMenu items={menu(r)} label={tt("Post actions")} />
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      {next ? (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={more} className={cn(buttonSecondary, "h-10 px-5")}>
            {more ? tt("Loading") : tt("Show more")}
          </button>
        </div>
      ) : null}
      {spaces.length === 0 && head.can.manage_spaces ? <Notice tone="info">{tt("There is no space to post in. Add one under Spaces.")}</Notice> : null}
      <Confirm open={removing !== null} onClose={() => setRemoving(null)} title={tt("Remove this post?")} detail={tt("Members stop seeing it. You can restore it from Removed.")} action="Remove" danger busy={busy} reason onConfirm={(reason) => removing && void act(removing, "remove", reason || undefined)} />
    </div>
  )
}
