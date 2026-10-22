"use client"

/**
 * ===========================================================================
 *  A CHAT SPACE
 * ===========================================================================
 * A community's chat channel, drawn by the one chat screen every chat uses
 * (chat-surface.tsx, round 37): bubbles grouped by sender, a quiet line
 * between days, the newest at the bottom, the box at the bottom sending on
 * Enter (Shift+Enter is a new line) with pictures and files, replies, likes,
 * and the channel's rules shown once before a member's first message.
 *
 * LIVE, BUT NEVER TRUSTED. The page listens to Supabase realtime for this
 * space's rows of community_messages (postgres_changes filtered by space_id;
 * part 81's policy lets only members who may read the space receive them).
 * A new row is a signal: the page asks the server for the messages after
 * the last one it has, with their authors, so names and pictures always come
 * from the server. An edit carries its new words; a removal carries a blank
 * body, and the message leaves the list. Writing always goes through the
 * server route, never the stream.
 *
 * ON A PHONE (round 37) the channel is the screen under the community's bar,
 * down to the foot of what can be seen (--vv-h, components/viewport-vars),
 * so the box sits on the keyboard when it is up; with the keyboard up the
 * chat takes the whole visible screen, as Telegram does, and gives it back
 * when the keyboard goes. Measured by scripts/check-community-chat-r37.mjs.
 */
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { MemberAvatar } from "./member-avatar"
import { createClient } from "@/lib/supabase/client"
import { realtimeAuth } from "./realtime"
import type { ViewerView } from "@/lib/communities/types"
import { apiBase } from "./api"
import { ReportDialog, type ReportTargetRef } from "./dialogs"
import { SpaceIcon } from "./space-icon"
import { memberHref } from "./person-href"
import { RoleBadge } from "./role-badge"
import { ChatSurface, MuteButton, type StreamHandlers } from "./chat-surface"
import { SpaceChips } from "./space-chips"
import type { ChatIntroView, ChatLine, ChatMessageView, SpaceView } from "./view-types"

/** Messages from one person within this long of each other are drawn as one group. */
export const GROUP_MS = 5 * 60_000

export function groupsStart(list: Pick<ChatMessageView, "author" | "createdAt">[], i: number): boolean {
  if (i === 0) return true
  const a = list[i - 1]
  const b = list[i]
  if ((a.author?.id ?? null) !== (b.author?.id ?? null)) return true
  if (dayOf(a.createdAt) !== dayOf(b.createdAt)) return true
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) > GROUP_MS
}

function dayOf(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export interface ChatViewProps {
  communityId: string
  slug: string
  space: SpaceView
  viewer: ViewerView
  initial: { messages: ChatMessageView[]; hasMore: boolean }
  readOnly?: boolean
  intro?: ChatIntroView | null
  /**
   * Round 38, the Chat tab with several channels: on a phone the channel covers the page under the bar, chips and all,
   * so the channels ride under its name instead (from 640px they stay above the chat, place-views.tsx).
   */
  channels?: SpaceView[] | null
}

export function ChatView({ communityId, slug, space, viewer, initial, readOnly = false, intro = null, channels = null }: ChatViewProps) {
  const [report, setReport] = useState<ReportTargetRef | null>(null)
  const base = apiBase(communityId)

  /* A phone: the page under the chat holds still. */
  useEffect(() => {
    if (!window.matchMedia("(max-width: 639px)").matches) return
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      html.style.overflow = prev
    }
  }, [])

  /* The stream. */
  const subscribe = useCallback(
    (h: StreamHandlers) => {
      let supabase: ReturnType<typeof createClient> | null = null
      let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
      let net: number | undefined
      let gone = false
      let joined = false
      const catchUp = () => h.changed()
      /* The net under the stream (round 7): not joined, or dropped, the page asks every 5 seconds while it is seen. */
      const tick = () => {
        net = window.setTimeout(() => {
          if (gone) return
          if (!joined && document.visibilityState === "visible") void catchUp()
          tick()
        }, 5000)
      }
      tick()
      void (async () => {
        try {
          supabase = createClient()
          /* Signed in before the join (./realtime realtimeAuth): the stream is a members' read. */
          await realtimeAuth(supabase)
          if (gone) return
          channel = supabase
            .channel(`community-chat:${space.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "community_messages", filter: `space_id=eq.${space.id}` }, (payload: { eventType: string; new?: Record<string, unknown> }) => {
              if (payload.eventType === "INSERT") catchUp()
              else if (payload.eventType === "UPDATE" && payload.new) h.updated(payload.new)
            })
            .subscribe((status: string) => {
              joined = status === "SUBSCRIBED"
              /* Joined again after a drop: whatever was said meanwhile. */
              if (joined) catchUp()
            })
        } catch {
          /* No realtime: the net above carries it. */
        }
      })()
      return () => {
        gone = true
        window.clearTimeout(net)
        if (supabase && channel) supabase.removeChannel(channel)
      }
    },
    [space.id],
  )

  const me = viewer.userId ? { id: viewer.userId, name: intro?.myName ?? "Someone" } : null
  /* Round 38: a channel the team alone posts in, or one that asks for a level, says so in its own words. */
  const closed = readOnly ? (intro?.restriction?.kind === "banned" ? "You can't send messages in this community's chat." : intro?.postNote || "You can read this chat, but not send messages here.") : null
  const pinned = intro?.pinned ?? null

  const avatar = (m: ChatLine) =>
    m.author ? (
      <Link href={memberHref(slug, m.author)} data-person-link="" data-person-id={m.author.id}>
        <MemberAvatar src={m.author.avatarUrl} name={m.author.name} alt="" size={32} lazy />
      </Link>
    ) : (
      <span className="block h-8 w-8 rounded-full bg-[#eceef1]" />
    )
  const name = (m: ChatLine) =>
    m.author ? (
      <span className="inline-flex max-w-full items-center gap-1">
        <Link href={memberHref(slug, m.author)} className="truncate hover:underline" data-person-link="" data-person-id={m.author.id}>
          {m.author.name}
        </Link>
        <RoleBadge role={m.author.role} size="xs" />
      </span>
    ) : (
      <span className="text-[#6b7280]">Former member</span>
    )

  return (
    <div
      className="flex h-[calc(100dvh-var(--community-top,0px)-88px)] min-h-[420px] flex-col pb-3 max-sm:fixed max-sm:inset-x-0 max-sm:z-[35] max-sm:min-h-0 max-sm:bg-white max-sm:pb-0 max-sm:[--chat-top:var(--community-top,99px)] max-sm:top-[calc(var(--vv-top,0px)+var(--chat-top))] max-sm:h-[calc(var(--vv-h,100dvh)-var(--chat-top))] max-sm:[html[data-keyboard=open]_&]:z-[45] max-sm:[html[data-keyboard=open]_&]:[--chat-top:0px] lg:h-[calc(100dvh-var(--community-top,0px)-104px)] lg:pb-6"
      data-chat=""
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white sm:rounded-2xl sm:border sm:border-[#e5e7eb]/80">
        <ChatSurface
          communityId={communityId}
          kind="space"
          chatId={space.id}
          me={me}
          url={`${base}/spaces/${space.id}/messages`}
          messageUrl={(id) => `${base}/messages/${id}`}
          readUrl={`${base}/spaces/${space.id}/read`}
          initial={initial}
          subscribe={subscribe}
          showAuthors
          reactions
          closed={closed}
          intro={intro}
          placeholder={`Message ${space.name}`}
          renderAvatar={avatar}
          renderName={name}
          onReport={viewer.can.report ? (m) => setReport({ type: "message", id: m.id, what: "message" }) : undefined}
          header={
            <>
            <header className="flex shrink-0 items-center gap-2.5 border-b border-[#eceef1] px-4 py-2.5 max-sm:[html[data-keyboard=open]_&]:pt-[calc(env(safe-area-inset-top)+10px)]">
              <span className="text-[#6b7280]">
                <SpaceIcon icon={space.icon} kind={space.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[16px] font-semibold text-[#1a1a2e]">{space.name}</h1>
                {space.description ? <p className="truncate text-[12.5px] text-[#6b7280]">{space.description}</p> : null}
              </div>
              {me ? <MuteButton communityId={communityId} kind="space" chatId={space.id} /> : null}
            </header>
            {channels && channels.length > 1 ? (
              <div className="shrink-0 border-b border-[#eceef1] px-4 pt-2 sm:hidden max-sm:[html[data-keyboard=open]_&]:hidden [&_[data-space-chips]]:mb-1.5" data-chat-channels-phone="">
                <SpaceChips slug={slug} spaces={channels} active={space.slug} noAll />
              </div>
            ) : null}
            {pinned ? (
              /* Round 38: the message the team pinned, one line under the channel's name, as Telegram shows it. */
              <div className="flex shrink-0 items-center gap-2.5 border-b border-[#eceef1] bg-[#fafafb] px-4 py-2" data-chat-pinned={pinned.id}>
                <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full bg-[#1a1a2e]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-4 text-[#1a1a2e]">Pinned</p>
                  <p className="truncate text-[13px] leading-5 text-[#4b5563]">
                    <span className="font-medium text-[#1a1a2e]">{pinned.authorName}:</span> {pinned.text}
                  </p>
                </div>
              </div>
            ) : null}
            </>
          }
          empty={
            <>
              <p className="text-[15px] font-semibold text-[#1a1a2e]">No messages yet.</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">{readOnly ? "Nothing has been said here." : "Say hello to get it going."}</p>
            </>
          }
        />
      </div>
      <ReportDialog communityId={communityId} target={report} onClose={() => setReport(null)} />
    </div>
  )
}
