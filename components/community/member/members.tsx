"use client"

/**
 * THE MEMBER DIRECTORY. Search by name or username, narrow to the community's
 * team (owner, admins, moderators), and page through everybody newest first
 * (the server's keyset cursor). A row is a face, a name, a role, a level and
 * the short bio they wrote here; it opens their page across Storelib (their
 * storefront, or their profile), and Message beside it opens a conversation
 * here when the community has chat on.
 *
 * Round 11, CALM WHILE IT LOADS: the search field is squared like
 * Storelib's fields with the community's light depth, and while a search is
 * on its way the community's spinner turns inside it, the list staying as it
 * was (no dimming); the answer eases in by opacity. Who to show is a
 * segmented control rather than a row of pills. Nobody found is the
 * community's empty card, not a line in a box.
 */
import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import { ChatRoundDotsIcon } from "@solar-icons/react/linear/chat-round-dots"
import { MemberAvatar, warmMemberFaces } from "./member-avatar"
import { memberCountLabel } from "@/lib/communities/format"
import { COUNTRIES } from "@/lib/checkout/countries"
import type { MemberView, Role } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { PageTitle } from "./headers"
import { openMessages } from "./messages"
import { toast } from "./toast"
import { dmButtonReason, type DmStartView } from "@/lib/communities/chat-rules"
import { memberHref } from "./person-href"
import { PlaceEmpty } from "./place-empty"
import { Spinner } from "./place-spinner"
import { BTN_SECONDARY, CARD, ICON_BTN } from "./ui"
import { RoleBadge } from "./role-badge"
import { useCommunityPullListener } from "./community-pull-refresh"
import { COMMUNITY_MEMBERS_REFRESH_SCOPE } from "@/lib/communities/refresh-scope"

type Filter = "all" | "admin" | "moderator"

type MembersAnswer = { members: MemberView[]; nextCursor: string | null }
/*
  ROUND 27, THE OWNER: "switching between Everyone, Admins and Moderators takes too much and loads too much". Every
  first page asked for is kept for the visit (a minute fresh), the three role lists are read ahead once the list is on
  screen, and a press on a role shows what is kept on the same frame, with no wait, no spinner and no fade. Only typing
  in the search waits for the typing to stop.
*/
const kept = new Map<string, { answer: MembersAnswer; at: number }>()
const FRESH_MS = 60_000
function keptAnswer(key: string): MembersAnswer | null {
  const k = kept.get(key)
  return k && Date.now() - k.at < FRESH_MS ? k.answer : null
}

export function MembersDirectory({ communityId, slug, memberCount, initial, meId = null, canMessage = false, dmStart = null, countryFilter = false }: { communityId: string; slug: string; memberCount: number; initial: { members: MemberView[]; nextCursor: string | null }; meId?: string | null; canMessage?: boolean; /** Round 38: the viewer's own standing for messages, so a Message they may not send is greyed with its reason. */ dmStart?: DmStartView | null; /** Profiles can say where people are from (part 98): offer the country filter. */ countryFilter?: boolean }) {
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  /* A two letter code, or "" for everywhere (round 12). */
  const [country, setCountry] = useState("")
  const [members, setMembers] = useState(initial.members)
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    warmMemberFaces(members, 44, 32)
  }, [members])
  /* Each answer to a search or a filter is a new list: it eases in (opacity, on the compositor); a page added at the end does not. */
  const [answer, setAnswer] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const shownAnswer = useRef(answer)
  useLayoutEffect(() => {
    if (shownAnswer.current === answer) return
    shownAnswer.current = answer
    const el = listRef.current
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
  }, [answer])

  const url = useCallback(
    (c: string | null) => {
      const p = new URLSearchParams()
      if (q.trim()) p.set("q", q.trim())
      if (filter !== "all") p.set("role", filter)
      if (country) p.set("country", country)
      if (c) p.set("cursor", c)
      return `${apiBase(communityId)}/members?${p}`
    },
    [communityId, q, filter, country],
  )

  /* The first page as the server drew it is the kept answer for Everyone; the two role lists are read ahead once the page is idle. */
  useEffect(() => {
    const base = `${apiBase(communityId)}/members?`
    if (!kept.has(base)) kept.set(base, { answer: initial, at: Date.now() })
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      for (const role of ["admin", "moderator"] as const) {
        const key = `${base}${new URLSearchParams({ role })}`
        if (keptAnswer(key)) continue
        void api<MembersAnswer>(key, { signal: ctrl.signal }).then((r) => {
          if (r.ok) kept.set(key, { answer: r.data, at: Date.now() })
        })
      }
    }, 600)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId])

  const typedQ = useRef(q)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const key = url(null)
    const typing = typedQ.current !== q
    typedQ.current = q
    const have = keptAnswer(key)
    if (have) {
      /* In hand: on this frame, as it was. */
      setMembers(have.members)
      setCursor(have.nextCursor)
      if (typing) setAnswer((n) => n + 1)
      return
    }
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      setLoading(true)
      const r = await api<MembersAnswer>(key, { signal: ctrl.signal })
      setLoading(false)
      if (r.ok) {
        kept.set(key, { answer: r.data, at: Date.now() })
        setMembers(r.data.members)
        setCursor(r.data.nextCursor)
        setAnswer((n) => n + 1)
      }
    }, typing ? 220 : 0)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const reload = useCallback(async () => {
    setLoading(true)
    const r = await api<{ members: MemberView[]; nextCursor: string | null }>(url(null))
    setLoading(false)
    if (r.ok) {
      kept.set(url(null), { answer: r.data, at: Date.now() })
      setMembers(r.data.members)
      setCursor(r.data.nextCursor)
      setAnswer((n) => n + 1)
    }
  }, [url])
  useCommunityPullListener(COMMUNITY_MEMBERS_REFRESH_SCOPE, reload)

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Everyone" },
    { key: "admin", label: "Admins" },
    { key: "moderator", label: "Moderators" },
  ]

  return (
    /* Round 39: the whole page column, as the leaderboard and the feed have it (no right column beside it any more). */
    <div data-members="">
      <PageTitle title="Members" detail={memberCountLabel(memberCount)} />
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            className="h-11 w-full rounded-xl border border-[#e1e4e8] bg-white pl-10 pr-10 text-[16px] text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.06)] sm:h-10 sm:text-[14px]"
            data-member-search=""
          />
          {loading && !cursor ? (
            <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2" data-member-search-busy="">
              <Spinner size={16} />
            </span>
          ) : null}
        </label>
        {countryFilter ? <CountrySelect value={country} onChange={setCountry} /> : null}
        <div className="flex items-center gap-0.5 self-start rounded-[11px] border border-[#e6e8eb] bg-[#f1f2f4] p-0.5 sm:self-auto" role="group" aria-label="Who to show">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              data-member-filter={f.key}
              className={`h-10 touch-manipulation whitespace-nowrap rounded-[9px] sm:h-9 px-3.5 text-[13.5px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none ${filter === f.key ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_0_0_0.5px_rgba(16,24,40,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e] active:text-[#1a1a2e]"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {members.length === 0 ? (
        <div className="mt-4">
          <PlaceEmpty
            compact
            data-member-empty=""
            place="members"
            title={q ? "Nobody by that name" : country ? "Nobody from there yet" : filter === "all" ? "No members yet" : filter === "admin" ? "No admins besides the owner" : "No moderators yet"}
            line={q ? "Try a first name or a username." : country ? "Only people who added their country to their profile show up here." : "People show up here as they join."}
          />
        </div>
      ) : (
        <ul ref={listRef} className={`${CARD} mt-4 divide-y divide-[#f0f1f3] overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]`} data-member-list="">
          {members.map((m) => (
            <li key={m.userId}>
              <MemberRow m={m} slug={slug} canMessage={canMessage && m.userId !== meId} dmStart={dmStart} />
            </li>
          ))}
        </ul>
      )}
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

export function MemberRow({ m, slug, canMessage = false, dmStart = null }: { m: Pick<MemberView, "userId" | "name" | "username" | "avatarUrl" | "role" | "level" | "levelName" | "bio" | "hasStorefront" | "location">; slug: string; canMessage?: boolean; dmStart?: DmStartView | null }) {
  /* Round 38: the admins' rule for starting a conversation (a level, days here, the team only), read for this row's role. Their own choice is told on the press. */
  const why = canMessage ? dmButtonReason(dmStart, m.role ?? "member") : null
  return (
    <div className="flex items-center pr-2 transition-colors [@media(hover:hover)]:hover:bg-[#f8f9fa] sm:pr-3">
    <Link href={memberHref(slug, { id: m.userId, username: m.username, hasStorefront: m.hasStorefront })} data-person-link="" data-person-id={m.userId} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 sm:pl-5">
      <MemberAvatar src={m.avatarUrl} name={m.name} alt="" size={44} warm={false} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-[#1a1a2e]">{m.name}</span>
          <RoleBadge role={m.role as Role} />
        </span>
        <span className="block truncate text-[13px] text-[#6b7280]">{m.bio || (m.username ? `@${m.username}` : `Level ${m.level}${m.levelName ? ` · ${m.levelName}` : ""}`)}</span>
        {/* Where they are from, in quiet text (round 12): the country's full name, no flag. */}
        {m.location ? (
          <span className="mt-px block truncate text-[12.5px] text-[#9ca3af]" data-member-location="">
            {m.location}
          </span>
        ) : null}
      </span>
      <span className="hidden shrink-0 text-[12.5px] text-[#8a8f98] sm:block">Level {m.level}</span>
    </Link>
    {canMessage ? (
      <button
        type="button"
        onClick={() => (why ? toast(why) : openMessages({ userId: m.userId }))}
        aria-label={why ? `Message ${m.name}: ${why}` : `Message ${m.name}`}
        aria-disabled={why ? true : undefined}
        title={why ?? undefined}
        className={`${ICON_BTN} ${why ? "opacity-40" : ""}`}
        data-member-message={why ? "off" : "on"}
      >
        <ChatRoundDotsIcon size={20} />
      </button>
    ) : null}
    </div>
  )
}

/**
 * THE COUNTRY FILTER (round 12, ask 15): the phone's own picker (a native
 * select, the wheel on iOS), in Storelib's field: squared, a hairline and the
 * light depth of the search beside it. Every country by its full name; the
 * names are the browser's own (Intl), so the list is filled once the page is
 * in the browser and the server draws "All countries" alone.
 */
function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [list, setList] = useState<{ code: string; name: string }[]>([])
  useEffect(() => setList(COUNTRIES), [])
  return (
    <label className="relative block sm:w-[200px]" data-member-country="">
      <span className="sr-only">Country</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 w-full appearance-none rounded-xl border border-[#e1e4e8] bg-white pl-3.5 pr-9 text-[16px] shadow-[0_1px_2px_rgba(16,24,40,0.05)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.06)] sm:h-10 sm:text-[14px] ${value ? "text-[#1a1a2e]" : "text-[#6b7280]"}`}
      >
        <option value="">All countries</option>
        {list.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" strokeWidth={2} />
    </label>
  )
}
