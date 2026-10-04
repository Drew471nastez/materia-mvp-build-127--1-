"use client"

/**
 * THE MEMBER DIRECTORY. Search by name or username, narrow to the community's
 * team (owner, admins, moderators), and page through everybody newest first
 * (the server's keyset cursor). A row is a face, a name, a role, a level and
 * the short bio they wrote here; it opens their page across Storelib (their
 * storefront, or their profile), and Message beside it opens a conversation
 * here when the community has chat on.
 */
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { Search } from "lucide-react"
import { ChatRoundDotsIcon } from "@solar-icons/react/linear/chat-round-dots"
import { AppAvatar } from "@/components/app/app-avatar"
import { memberCountLabel } from "@/lib/communities/format"
import type { MemberView, Role } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { PageTitle } from "./headers"
import { openMessages } from "./messages"
import { memberHref } from "./person-href"
import { BTN_SECONDARY, CARD, ICON_BTN, PILL, PILL_OFF, PILL_ON } from "./ui"
import { roleTag } from "./view-types"

type Filter = "all" | "admin" | "moderator"

export function MembersDirectory({ communityId, slug, memberCount, initial, meId = null, canMessage = false }: { communityId: string; slug: string; memberCount: number; initial: { members: MemberView[]; nextCursor: string | null }; meId?: string | null; canMessage?: boolean }) {
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [members, setMembers] = useState(initial.members)
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const first = useRef(true)

  const url = useCallback(
    (c: string | null) => {
      const p = new URLSearchParams()
      if (q.trim()) p.set("q", q.trim())
      if (filter !== "all") p.set("role", filter)
      if (c) p.set("cursor", c)
      return `${apiBase(communityId)}/members?${p}`
    },
    [communityId, q, filter],
  )

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      setLoading(true)
      const r = await api<{ members: MemberView[]; nextCursor: string | null }>(url(null), { signal: ctrl.signal })
      setLoading(false)
      if (r.ok) {
        setMembers(r.data.members)
        setCursor(r.data.nextCursor)
      }
    }, 220)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [url])

  const more = async () => {
    if (!cursor || loading) return
    setLoading(true)
    const r = await api<{ members: MemberView[]; nextCursor: string | null }>(url(cursor))
    setLoading(false)
    if (!r.ok) return
    setMembers((m) => [...m, ...r.data.members.filter((x) => !m.some((y) => y.userId === x.userId))])
    setCursor(r.data.nextCursor)
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Everyone" },
    { key: "admin", label: "Admins" },
    { key: "moderator", label: "Moderators" },
  ]

  return (
    <div className="max-w-[760px] pb-16 pt-4 lg:pt-6" data-members="">
      <PageTitle title="Members" detail={memberCountLabel(memberCount)} />
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            className="h-11 w-full rounded-full border border-[#e3e4e8] bg-white pl-10 pr-4 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] focus:border-[#c9ccd3] sm:h-10 sm:text-[14px]"
          />
        </label>
        <div className="flex gap-2">
          {filters.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={`${PILL} ${filter === f.key ? PILL_ON : PILL_OFF}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ul className={`${CARD} mt-4 divide-y divide-[#f0f1f3] overflow-hidden transition-opacity ${loading && !cursor ? "opacity-60" : ""}`} data-member-list="">
        {members.map((m) => (
          <li key={m.userId}>
            <MemberRow m={m} slug={slug} canMessage={canMessage && m.userId !== meId} />
          </li>
        ))}
        {members.length === 0 ? <li className="px-5 py-10 text-center text-[14px] text-[#6b7280]">{q ? "Nobody by that name here." : "No members yet."}</li> : null}
      </ul>
      {cursor ? (
        <div className="mt-4 flex justify-center">
          <button type="button" className={BTN_SECONDARY} onClick={more} disabled={loading}>
            {loading ? "Loading..." : "Show more members"}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function MemberRow({ m, slug, canMessage = false }: { m: Pick<MemberView, "userId" | "name" | "username" | "avatarUrl" | "role" | "level" | "levelName" | "bio" | "hasStorefront">; slug: string; canMessage?: boolean }) {
  const tag = roleTag(m.role as Role)
  return (
    <div className="flex items-center pr-2 transition-colors hover:bg-[#f8f9fa] sm:pr-3">
    <Link href={memberHref(slug, { id: m.userId, username: m.username, hasStorefront: m.hasStorefront })} data-person-link="" data-person-id={m.userId} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 sm:pl-5">
      <AppAvatar src={m.avatarUrl} name={m.name} alt="" size={44} markWhileLoading />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-[#1a1a2e]">{m.name}</span>
          {tag ? <span className="shrink-0 rounded-md bg-[#f1f2f4] px-1.5 text-[11.5px] font-medium leading-[18px] text-[#4b5563]">{tag}</span> : null}
        </span>
        <span className="block truncate text-[13px] text-[#6b7280]">{m.bio || (m.username ? `@${m.username}` : `Level ${m.level}${m.levelName ? ` · ${m.levelName}` : ""}`)}</span>
      </span>
      <span className="hidden shrink-0 text-[12.5px] text-[#8a8f98] sm:block">Level {m.level}</span>
    </Link>
    {canMessage ? (
      <button type="button" onClick={() => openMessages({ userId: m.userId })} aria-label={`Message ${m.name}`} className={ICON_BTN} data-member-message="">
        <ChatRoundDotsIcon size={20} />
      </button>
    ) : null}
    </div>
  )
}
