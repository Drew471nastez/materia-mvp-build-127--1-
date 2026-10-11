"use client"

/**
 * ===========================================================================
 *  "SEARCH DISCUSSIONS, MEMBERS, OR CONTENT..."
 * ===========================================================================
 * The community's own search, in its bar. On a computer and a tablet it is a
 * field in the middle of the bar with a dropdown under it; on a phone the tab
 * bar's Search opens the same search over the whole screen. What it finds
 * comes from GET /api/community/<id>/search (lib/communities/server/
 * search.ts): posts, members, spaces, and (round 10) the classroom's courses
 * and lessons and the community's events, each only what this member may
 * see, in short groups, the words that matched in bold.
 *
 * SMARTER (round 10, ask 29). Every word typed counts, in any order, without
 * case or accents; a title or a name counts more than a body, a word's start
 * more than its middle (search-rank.ts, the same rules the server ranks
 * with). Each word is marked in bold where it matched.
 *
 * THE FIRST RESULTS AT ONCE. When the frame is idle it reads what the search
 * knows before anything is typed (GET /search?index=1: the spaces, the
 * latest posts, the members here lately, the open courses' lessons, the
 * coming events), once per visit and again after two minutes. The first key
 * is answered from it in the browser, on the next frame; the server's full
 * answer, asked once the typing pauses (180ms), takes its place when it
 * comes, and every answer is kept for the page, so going back over the same
 * words asks nothing.
 *
 * KEYBOARD. It is a combobox: the arrows move through every result across
 * the groups, Enter opens the chosen one, Escape closes the list (a second
 * Escape leaves the field), and "/" anywhere on the page that is not a field
 * puts the cursor in it. Screen readers hear the list as a listbox with the
 * chosen option announced.
 *
 * OPEN AND CANCEL ARE SMOOTH. The phone's screen rises in and, on Cancel or a
 * result, fades back down before it goes (opacity and a short slide on the
 * compositor), rather than vanishing.
 */
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import { CalendarDays, GraduationCap, PlayCircle, Search, X } from "lucide-react"
import { MemberAvatar } from "./member-avatar"
import { relativeTime } from "@/lib/communities/format"
import { postPath } from "@/lib/communities/post-url"
import { openPostOver } from "@/lib/communities/client/open-post"
import { registerCommunitySearch } from "@/lib/nav/community-search-bridge"
import { useLayer } from "@/lib/ui/layers"
import { api, apiBase } from "./api"
import { PLAIN_ICON_BTN } from "./ui"
import type { SearchIndex, SearchResults } from "./view-types"
import { RoleBadge } from "./role-badge"
import { spaceGlyph } from "./space-glyph"
import { fold, markRanges, rankAll, rankItem, searchWords } from "./search-rank"

/** Mirrors the server: shorter than this is not searched. */
export const SEARCH_MIN_CHARS = 2
export const SEARCH_DEBOUNCE_MS = 180
export const SEARCH_PLACEHOLDER = "Search discussions, members, or content..."
/** The placeholder where the field is too narrow for the whole line (a tablet), so it is never cut mid word. */
export const SEARCH_PLACEHOLDER_SHORT = "Search this community"
const SHORT_BELOW_PX = 380
/** The field's last answer, for the next one drawn (THE WIDTH, below). */
let lastNarrow = false
/** How long the phone's search screen takes to go when closed. */
export const SCREEN_OUT_MS = 180
/** Over an opened post (post-fullscreen.tsx, 130) and the tab bar lifted over it (131); under the composer's leave dialog and the picture viewer. */
export const SEARCH_SCREEN_Z = 136

/*
  THE SCREEN'S MOTION (round 12, ask 1). Its white surface never fades in, so the page is never seen through it; the field row and
  the results rise 8px and settle, a beat apart. Cancel: the whole screen sinks 6px and fades over SCREEN_OUT_MS on a curve that
  leaves, and only then goes. Translate and opacity only, on the compositor.
*/
const SCREEN_KEYFRAMES =
  "@keyframes community-search-rise{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}" +
  "@keyframes community-search-out{from{opacity:1;translate:0 0}to{opacity:0;translate:0 6px}}"

type Status = "idle" | "loading" | "done" | "error" | "busy"

export interface SearchOption {
  key: string
  group: "posts" | "members" | "spaces" | "lessons" | "events"
  href: string
}

/**
 * A POST PICKED FROM THE RESULTS OPENS OVER THE PLACE (round 16), as from the feed: a card on screen or the place host's
 * reader (post-opener.tsx) opens it, and the place under it stays. It used to be the post's own page, asked of the router:
 * a second feed drawn under the post, and the place left behind. Anything else, or a post nobody can open, goes by address.
 */
export function openResultOver(href: string, options: SearchOption[]): boolean {
  const o = options.find((x) => x.group === "posts" && x.href === href)
  return !!o && openPostOver(o.key.slice("post:".length))
}

/** The results in the order they are drawn and stepped through: posts, members, spaces, the classroom, events. */
export function searchOptions(r: SearchResults | null, slug: string): SearchOption[] {
  if (!r) return []
  const base = `/community/${slug}`
  return [
    ...r.posts.map((p) => ({ key: `post:${p.id}`, group: "posts" as const, href: postPath(slug, { id: p.id, title: p.title, bodyText: p.snippet }) })),
    ...r.members.map((m) => ({ key: `member:${m.id}`, group: "members" as const, href: m.href })),
    ...r.spaces.map((s) => ({ key: `space:${s.id}`, group: "spaces" as const, href: `${base}/space/${s.slug}` })),
    ...(r.lessons ?? []).map((l) => ({ key: `lesson:${l.id}`, group: "lessons" as const, href: l.href })),
    ...(r.events ?? []).map((e) => ({ key: `event:${e.id}`, group: "events" as const, href: e.href })),
  ]
}

/** The next option for an arrow key, wrapping at both ends; -1 is "none chosen". */
export function stepOption(current: number, count: number, key: "ArrowDown" | "ArrowUp" | "Home" | "End"): number {
  if (count <= 0) return -1
  if (key === "Home") return 0
  if (key === "End") return count - 1
  if (key === "ArrowDown") return current < 0 || current >= count - 1 ? 0 : current + 1
  return current <= 0 ? count - 1 : current - 1
}

/** The text with every word of the search in bold where it matched, case and accents kept (search-rank.ts markRanges). */
function Marked({ text, q }: { text: string; q: string }) {
  const ranges = useMemo(() => markRanges(text, searchWords(q)), [text, q])
  if (!ranges.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(
      <mark key={start} className="bg-transparent font-semibold text-[#1a1a2e]">
        {text.slice(start, end)}
      </mark>,
    )
    at = end
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

/* ── What the search knows before anything is typed ─────────────────── */

/** An index older than this is read again (quietly, the old one answering meanwhile). */
export const SEARCH_INDEX_FRESH_MS = 120_000
/** After an index that did not come, how long before it is asked for again. */
export const SEARCH_INDEX_RETRY_MS = 30_000
const indexes = new Map<string, { index: SearchIndex | null; at: number; going: Promise<SearchIndex | null> | null }>()

/** The index for this community, read once (and again when stale); a read already on its way is shared. */
export function preloadSearchIndex(communityId: string): Promise<SearchIndex | null> {
  const have = indexes.get(communityId)
  if (have?.going) return have.going
  /* Fresh, or asked for lately and not given (the search then works without it): not asked again for a while. */
  if (have && Date.now() - have.at < (have.index ? SEARCH_INDEX_FRESH_MS : SEARCH_INDEX_RETRY_MS)) return Promise.resolve(have.index)
  const going = api<{ index: SearchIndex }>(`${apiBase(communityId)}/search?index=1`).then((r) => {
    const index = r.ok && r.data.index ? r.data.index : null
    indexes.set(communityId, { index: index ?? have?.index ?? null, at: Date.now(), going: null })
    return index
  })
  indexes.set(communityId, { index: have?.index ?? null, at: have?.at ?? 0, going })
  return going
}

/** The index already here for this community, if any. */
export function searchIndexOf(communityId: string): SearchIndex | null {
  return indexes.get(communityId)?.index ?? null
}

/** For tests and probes: forget every index. */
export function clearSearchIndexes() {
  indexes.clear()
}

/** A short piece of a text around the first word found in it, cut at spaces. */
function snippetFor(text: string, words: string[], max = 120): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  const f = fold(t)
  const at = Math.min(...words.map((w) => f.indexOf(w)).filter((i) => i >= 0), Number.MAX_SAFE_INTEGER)
  if (at === Number.MAX_SAFE_INTEGER || at < max - 30) return `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}...`
  const start = t.lastIndexOf(" ", Math.max(0, at - 40)) + 1
  return `...${t.slice(start, start + max - 6).replace(/\s+\S*$/, "")}...`
}

/** The index's answer to a search, ranked by the same rules as the server's, in the same groups and sizes. */
export function localResults(index: SearchIndex, q: string, now: number = Date.now()): SearchResults {
  const words = searchWords(q)
  if (!words.length) return { q, spaces: [], posts: [], members: [], lessons: [], events: [] }
  return {
    q,
    spaces: rankAll(index.spaces, (s) => rankItem([{ text: s.name, weight: 3 }, { text: s.description, weight: 1 }], words), 4),
    posts: rankAll(index.posts, (p) => rankItem([{ text: p.title, weight: 3 }, { text: p.text, weight: 1 }], words, Date.parse(p.createdAt), now), 6).map(({ text, ...p }) => ({ ...p, snippet: snippetFor(text || p.snippet, words) })),
    members: rankAll(index.members, (m) => rankItem([{ text: m.name, weight: 3 }, { text: m.username, weight: 2 }], words), 5),
    lessons: rankAll(index.lessons, (l) => rankItem([{ text: l.title, weight: l.kind === "course" ? 4 : 3 }, { text: l.course, weight: 1 }], words), 4),
    events: rankAll(index.events, (e) => rankItem([{ text: e.title, weight: 3 }], words, Date.parse(e.startsAt), now), 3),
  }
}

/** The search itself: the words, the answers, which answer is on screen. Shared by the field and the phone screen. */
function useCommunitySearch(communityId: string) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  /* The words the results on screen answer: different from what is typed now, they are dimmed until the new ones come. */
  const [shownFor, setShownFor] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const cache = useRef(new Map<string, SearchResults>())
  const latest = useRef("")

  useEffect(() => {
    const term = q.trim().replace(/\s+/g, " ")
    latest.current = term
    if (term.length < SEARCH_MIN_CHARS) {
      setResults(null)
      setShownFor("")
      setStatus("idle")
      return
    }
    const key = term.toLowerCase()
    const known = cache.current.get(key)
    if (known) {
      setResults(known)
      setShownFor(term)
      setStatus("done")
      return
    }
    /* At once, from the preloaded index, on this very render: the server's answer replaces it when it comes. */
    const index = searchIndexOf(communityId)
    if (index) {
      setResults(localResults(index, term))
      setShownFor(term)
    }
    setStatus("loading")
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const r = await api<{ results: SearchResults }>(`${apiBase(communityId)}/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
      if (ctrl.signal.aborted || latest.current !== term) return
      if (!r.ok) {
        setStatus((r as { status?: number }).status === 429 ? "busy" : "error")
        return
      }
      cache.current.set(key, r.data.results)
      setResults(r.data.results)
      setShownFor(term)
      setStatus("done")
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [q, communityId])

  const term = q.trim().replace(/\s+/g, " ")
  return { q, setQ, results, status, term, stale: !!results && shownFor !== term }
}

const GROUP_TITLE = { posts: "Posts", members: "Members", spaces: "Spaces", lessons: "Learn", events: "Events" } as const

/*
  RESULTS THAT LOOK LIKE THIS COMMUNITY (round 15, the owner: "the results ... don't look that AI. The posts icon should feel
  more great and clean"). Every row used to lead with the same grey square and a stock icon, so posts, lessons and events read
  as one list of identical things. Now each kind has its own row:
    a post     a small drawing of a post card (its title bar and two lines) on Storelib's white tile with a hairline, and
               the author's face on its corner; its title, one line of the words around the match, and where it is: the
               space's own icon and name, who wrote it, when
    a person   their face, name and role, @handle
    a space    the space's own icon on the same tile, its name, its line
  Lessons and events keep their glyphs, on the same tile. The group names sit on a hairline, so the groups read as
  sections of one sheet rather than a stack of lists.
*/
const TILE = "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(16,24,40,0.05)]"

/** A post, drawn: a small card with its title bar and two lines of words. Ink and greys, no stock icon. */
function PostGlyph({ face, name }: { face: string | null; name: string }) {
  return (
    <span className={TILE} data-search-post-glyph="">
      <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden className="block -translate-x-[2px] -translate-y-[2px]">
        <rect x="2.5" y="3" width="15" height="14" rx="3" fill="#f8f9fa" stroke="#d6d9de" strokeWidth="1" />
        <rect x="5" y="6" width="9" height="2" rx="1" fill="#1a1a2e" />
        <rect x="5" y="10" width="10" height="1.5" rx="0.75" fill="#b9bec6" />
        <rect x="5" y="13" width="6.5" height="1.5" rx="0.75" fill="#b9bec6" />
      </svg>
      {/* Who wrote it, on the card's corner. */}
      <span className="absolute -bottom-1 -right-1 rounded-full ring-2 ring-white">
        <MemberAvatar src={face} name={name || "Member"} alt="" size={16} warm={false} />
      </span>
    </span>
  )
}
const EVENT_DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })

/** The grouped list, for the dropdown and the phone screen alike. */
function ResultList({
  listId,
  slug,
  results,
  status,
  term,
  active,
  onHover,
  onPick,
  touch = false,
  stale = false,
}: {
  listId: string
  slug: string
  results: SearchResults | null
  status: Status
  term: string
  active: number
  onHover: (i: number) => void
  onPick: (href: string) => void
  touch?: boolean
  /** The results answer earlier words: dimmed until the new ones come. */
  stale?: boolean
}) {
  const options = searchOptions(results, slug)
  const row = `flex w-full cursor-pointer select-none items-center gap-3 rounded-xl px-2.5 text-left outline-none transition-colors duration-150 [-webkit-tap-highlight-color:transparent] active:bg-[#f3f4f6] ${touch ? "min-h-[60px] py-2" : "min-h-[54px] py-1.5"}`
  const optionProps = (key: string) => {
    const i = options.findIndex((o) => o.key === key)
    const o = options[i]
    return {
      id: `${listId}-${i}`,
      role: "option" as const,
      "aria-selected": i === active,
      "data-search-option": o.group,
      "data-active": i === active ? "true" : undefined,
      onPointerMove: () => i !== active && onHover(i),
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onClick: () => onPick(o.href),
      className: `${row} ${i === active ? "bg-[#f3f4f6]" : ""}`,
    }
  }
  const message = (text: string) => (
    <p className="px-3 py-3 text-[13.5px] text-[#6b7280]" data-search-message="">
      {text}
    </p>
  )

  if (term.length < SEARCH_MIN_CHARS) return touch ? message("Find posts, members, lessons and events in this community.") : null
  if (!results || !options.length) {
    if (status === "busy") return message("Search is busy. Try again in a moment.")
    if (status === "error") return message("Search did not load. Try again.")
    if (!results || status === "loading") return message("Searching...")
    return message(`Nothing here matches "${term}".`)
  }

  /* The first group's name sits at the top; every later one on a hairline, so the groups read as sections of one sheet. */
  const firstGroup = results.posts.length ? "posts" : results.members.length ? "members" : results.spaces.length ? "spaces" : results.lessons?.length ? "lessons" : "events"
  const groupHead = (title: string) => {
    const first = GROUP_TITLE[firstGroup] === title
    return (
      <p className={`mx-2.5 pb-1 text-[12px] font-semibold text-[#8a8f98] ${first ? "pt-2" : "mt-1.5 border-t border-[#f0f1f3] pt-3"}`} data-search-group-head="">
        {title}
      </p>
    )
  }
  const tile = (icon: React.ReactNode) => <span className={TILE}>{icon}</span>
  return (
    <div role="listbox" id={listId} aria-label="Search results" className={`transition-opacity duration-150 ${stale ? "opacity-60" : ""}`} data-search-results="" data-search-source={status === "done" ? "server" : "index"}>
      {results.posts.length ? (
        <div role="group" aria-label={GROUP_TITLE.posts} data-search-group="posts">
          {groupHead(GROUP_TITLE.posts)}
          {results.posts.map((p) => {
            const main = p.title || p.snippet || "Post"
            return (
              <div key={p.id} {...optionProps(`post:${p.id}`)}>
                <PostGlyph face={p.author?.avatarUrl ?? null} name={p.author?.name ?? ""} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">
                    <Marked text={main} q={term} />
                  </span>
                  {p.title && p.snippet ? (
                    <span className="block truncate text-[13px] text-[#6b7280]">
                      <Marked text={p.snippet} q={term} />
                    </span>
                  ) : null}
                  {/* Where it is and whose: the space's own icon and name, the author, when. */}
                  <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-[#8a8f98]" suppressHydrationWarning data-search-post-meta="">
                    {p.space ? (
                      <>
                        <span aria-hidden className="text-[12px] leading-none">{spaceGlyph(p.space.icon ?? null, p.space.kind ?? "feed")}</span>
                        <span className="shrink-0 font-medium text-[#6b7280]">{p.space.name}</span>
                        <span aria-hidden>·</span>
                      </>
                    ) : null}
                    {p.author?.name ? (
                      <>
                        <span className="min-w-0 truncate">{p.author.name}</span>
                        <span aria-hidden>·</span>
                      </>
                    ) : null}
                    <span className="shrink-0">{relativeTime(p.createdAt)}</span>
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
      {results.members.length ? (
        <div role="group" aria-label={GROUP_TITLE.members} data-search-group="members">
          {groupHead(GROUP_TITLE.members)}
          {results.members.map((m) => {
            return (
              <div key={m.id} {...optionProps(`member:${m.id}`)}>
                <MemberAvatar src={m.avatarUrl} name={m.name} alt="" size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-[14.5px] font-medium text-[#1a1a2e]">
                    <span className="truncate">
                      <Marked text={m.name} q={term} />
                    </span>
                    <RoleBadge role={m.role} size="xs" />
                  </span>
                  {m.username ? (
                    <span className="block truncate text-[13px] text-[#6b7280]">
                      @<Marked text={m.username} q={term} />
                    </span>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
      {results.spaces.length ? (
        <div role="group" aria-label={GROUP_TITLE.spaces} data-search-group="spaces">
          {groupHead(GROUP_TITLE.spaces)}
          {results.spaces.map((s) => (
            <div key={s.id} {...optionProps(`space:${s.id}`)}>
              {/* The space's own icon, as its pill and the dashboard show it (space-glyph.ts, round 12), on the same tile as a post. */}
              <span className={`${TILE} text-[17px] leading-none`} data-space-glyph="">
                {spaceGlyph(s.icon, s.kind)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">
                  <Marked text={s.name} q={term} />
                </span>
                {s.description ? <span className="block truncate text-[13px] text-[#6b7280]">{s.description}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {results.lessons?.length ? (
        <div role="group" aria-label={GROUP_TITLE.lessons} data-search-group="lessons">
          {groupHead(GROUP_TITLE.lessons)}
          {results.lessons.map((l) => (
            <div key={l.id} {...optionProps(`lesson:${l.id}`)}>
              {tile(l.kind === "course" ? <GraduationCap className="h-4 w-4" strokeWidth={1.9} aria-hidden /> : <PlayCircle className="h-4 w-4" strokeWidth={1.9} aria-hidden />)}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">
                  <Marked text={l.title} q={term} />
                </span>
                <span className="block truncate text-[13px] text-[#6b7280]">{l.kind === "course" ? "Program" : l.course ? `Lesson in ${l.course}` : "Lesson"}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {results.events?.length ? (
        <div role="group" aria-label={GROUP_TITLE.events} data-search-group="events">
          {groupHead(GROUP_TITLE.events)}
          {results.events.map((e) => (
            <div key={e.id} {...optionProps(`event:${e.id}`)}>
              {tile(<CalendarDays className="h-4 w-4" strokeWidth={1.9} aria-hidden />)}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-[#1a1a2e]">
                  <Marked text={e.title} q={term} />
                </span>
                <span className="block truncate text-[13px] text-[#6b7280]" suppressHydrationWarning>
                  {Number.isFinite(Date.parse(e.startsAt)) ? EVENT_DATE.format(Date.parse(e.startsAt)) : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Keys shared by the field and the phone screen. Returns true when the key was used. */
function useKeys(count: number, active: number, setActive: (i: number) => void, pick: () => void) {
  return useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        setActive(stepOption(active, count, e.key))
        return true
      }
      if ((e.key === "Home" || e.key === "End") && count && active >= 0) {
        e.preventDefault()
        setActive(stepOption(active, count, e.key))
        return true
      }
      if (e.key === "Enter" && active >= 0 && active < count) {
        e.preventDefault()
        pick()
        return true
      }
      return false
    },
    [active, count, setActive, pick],
  )
}

/* ── On a computer and a tablet: the field and its dropdown ───────────── */

export function CommunitySearchField({ communityId, slug, className = "" }: { communityId: string; slug: string; className?: string }) {
  const router = useRouter()
  const listId = useId()
  const s = useCommunitySearch(communityId)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const options = useMemo(() => searchOptions(s.results, slug), [s.results, slug])

  /* A new answer starts with nothing chosen. */
  useEffect(() => setActive(-1), [s.results])

  /* The short placeholder while the field is narrow. */
  /*
    ROUND 21: the width comes from the ResizeObserver's own report, after the browser's layout, never read in the layout
    effect: that read laid out the whole community the moment it came back (Home in the tab bar), a forced restyle of every
    node on the page. The last answer is kept for the next mount, so a field drawn again starts with the right words.
  */
  const [narrow, setNarrow] = useState(lastNarrow)
  useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1]
      const width = e?.borderBoxSize?.[0]?.inlineSize ?? e?.contentRect.width ?? 0
      if (!width) return
      lastNarrow = width < SHORT_BELOW_PX
      setNarrow(lastNarrow)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      s.setQ("")
      input.current?.blur()
      if (openResultOver(href, options)) return
      router.push(href)
    },
    [router, s, options],
  )
  const onKey = useKeys(options.length, active, setActive, () => go(options[active].href))

  /* "/" from anywhere that is not a field. */
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (!input.current || input.current.offsetParent === null) return
      e.preventDefault()
      input.current.focus()
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [])

  /* A press anywhere outside closes the list. */
  useEffect(() => {
    if (!open) return
    const on = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", on)
    return () => document.removeEventListener("pointerdown", on)
  }, [open])

  const showList = open && s.term.length >= SEARCH_MIN_CHARS
  return (
    <div ref={wrap} className={`relative min-w-0 ${className}`} data-community-search="field">
      <label className="group/search relative flex h-10 items-center rounded-xl border border-transparent bg-[#f3f4f6] transition-[background-color,border-color,box-shadow] duration-150 focus-within:border-[#d9dce1] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.05)] hover:bg-[#eef0f2] focus-within:hover:bg-white motion-reduce:transition-none">
        <Search className="pointer-events-none absolute left-3 h-[17px] w-[17px] text-[#8a8f98]" strokeWidth={2} aria-hidden />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Search this community"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={60}
          value={s.q}
          placeholder={narrow ? SEARCH_PLACEHOLDER_SHORT : SEARCH_PLACEHOLDER}
          onChange={(e) => {
            s.setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            void preloadSearchIndex(communityId)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              if (showList) setOpen(false)
              else if (s.q) s.setQ("")
              else input.current?.blur()
              return
            }
            if (!showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) setOpen(true)
            onKey(e)
          }}
          className="h-full w-full min-w-0 appearance-none bg-transparent pl-9 pr-9 text-[14px] text-[#1a1a2e] outline-none placeholder:text-[#8a8f98] [&::-webkit-search-cancel-button]:hidden"
          data-community-search-input=""
        />
        {s.q ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              s.setQ("")
              input.current?.focus()
            }}
            className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-lg text-[#8a8f98] hover:text-[#1a1a2e]"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
      </label>
      {showList ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(70vh,540px)] min-w-[340px] overflow-y-auto overscroll-contain rounded-2xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(17,24,39,0.22),0_2px_6px_rgba(17,24,39,0.05)] animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-sheet motion-reduce:animate-none"
          data-community-search-panel=""
        >
          <ResultList listId={listId} slug={slug} results={s.results} status={s.status} term={s.term} active={active} onHover={setActive} onPick={go} stale={s.stale} />
        </div>
      ) : null}
    </div>
  )
}

/* ── On a phone: the search over the whole screen ────────────────────── */

/**
 * The phone's search screen. Round 9 took its icon out of the community's
 * bar (`trigger={false}`): the screen is still drawn here and opened by the
 * phone's tab bar Search (lib/nav/community-search-bridge), so a member on a
 * phone searches the community from the bottom of the screen and the bar
 * keeps only Messages, the bell and the "...".
 */
export function CommunitySearchButton({ communityId, slug, className = "", trigger = true }: { communityId: string; slug: string; className?: string; trigger?: boolean }) {
  const router = useRouter()
  const listId = useId()
  const s = useCommunitySearch(communityId)
  const [open, setOpenState] = useState(false)
  /* Closing: the screen fades and slides back down for SCREEN_OUT_MS before it goes (round 10: Cancel is smooth too). */
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef(0)
  const setOpen = useCallback(
    (v: boolean) => {
      window.clearTimeout(leaveTimer.current)
      setLeaving(false)
      setOpenState(v)
      if (v) void preloadSearchIndex(communityId)
    },
    [communityId],
  )
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])
  const [active, setActive] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const options = useMemo(() => searchOptions(s.results, slug), [s.results, slug])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => setActive(-1), [s.results])
  /*
    ROUND R8: OVER AN OPENED POST TOO. The screen was at z 80, under an opened post (130) and the tab bar lifted over it (131):
    the tab bar's Search inside a post opened the screen behind the post, its field taking the caret where nobody could see it.
    It is a layer that covers the bar now (lib/ui/layers.ts "search"), so the bar goes back under it, and it is drawn over the
    post (SEARCH_SCREEN_Z).
  */
  const screenRef = useRef<HTMLDivElement>(null)
  useLayer("search", mounted && open, screenRef)

  const close = useCallback((focusBack = true) => {
    setLeaving(true)
    input.current?.blur()
    window.clearTimeout(leaveTimer.current)
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    leaveTimer.current = window.setTimeout(() => {
      setLeaving(false)
      setOpenState(false)
      if (focusBack) button.current?.focus({ preventScroll: true })
    }, reduced ? 0 : SCREEN_OUT_MS)
  }, [])
  const go = useCallback(
    (href: string) => {
      close(false)
      s.setQ("")
      if (openResultOver(href, options)) return
      router.push(href)
    },
    [close, router, s, options],
  )
  const onKey = useKeys(options.length, active, setActive, () => go(options[active].href))

  /*
    THE PHONE'S TAB BAR OPENS THIS SAME SCREEN (lib/nav/community-search-bridge):
    its Search, inside this community, is this search, opened the way the
    icon opens it, inside the tap.
  */
  useEffect(
    () =>
      registerCommunitySearch(slug, {
        open: () => {
          flushSync(() => setOpen(true))
          input.current?.focus()
        },
        refocus: () => input.current?.focus(),
      }),
    [slug, setOpen],
  )

  /* The page under it does not scroll while the search covers it. */
  useLayoutEffect(() => {
    if (!open) return
    const html = document.documentElement
    const was = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      html.style.overflow = was
    }
  }, [open])

  return (
    <>
      {trigger ? (
        <button
          ref={button}
          type="button"
          aria-label="Search this community"
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`${PLAIN_ICON_BTN} ${className}`}
          data-community-search="button"
          onClick={() => {
            /* Drawn now, inside the tap, so the keyboard comes up on iOS. */
            flushSync(() => setOpen(true))
            input.current?.focus()
          }}
        >
          <Search className="h-[21px] w-[21px]" strokeWidth={1.9} aria-hidden />
        </button>
      ) : null}
      {mounted && open
        ? createPortal(
            <div
              ref={screenRef}
              role="dialog"
              aria-modal="true"
              aria-label="Search this community"
              /*
                ONE OPAQUE WHITE SCREEN (round 12): the surface is white from its first frame to its last, so nothing of the page shows
                through while it comes or goes; what is on it (the field and the results) rises in and settles, and on Cancel sinks and
                fades while the surface goes with it at the end (SCREEN_OUT_MS).
              */
              className={`fixed inset-0 flex flex-col bg-white pt-[calc(env(safe-area-inset-top)+10px)] motion-reduce:animate-none ${leaving ? "pointer-events-none animate-[community-search-out_180ms_cubic-bezier(0.4,0,1,1)_forwards]" : ""}`}
              style={{ zIndex: SEARCH_SCREEN_Z }}
              data-layer-kind="search"
              data-leaving={leaving ? "" : undefined}
              data-community-search-screen=""
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  close()
                }
              }}
            >
              <style>{SCREEN_KEYFRAMES}</style>
              <div className={`flex items-center gap-2 border-b border-[#eceef1] px-3 pb-2.5 pt-1.5 ${leaving ? "" : "motion-safe:animate-[community-search-rise_260ms_cubic-bezier(0.22,1,0.36,1)_both]"}`} data-community-search-head="">
                {/* A little depth (round 12): a white field on a hairline with a soft one pixel shadow, Storelib's fields. */}
                <label className="relative flex h-11 min-w-0 flex-1 items-center rounded-xl border border-[#e3e5e9] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_2px_8px_-4px_rgba(16,24,40,0.08)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd2] focus-within:shadow-[0_0_0_3px_rgba(26,26,46,0.06),0_1px_2px_rgba(16,24,40,0.06)]" data-community-search-field="">
                  <Search className="pointer-events-none absolute left-3 h-[18px] w-[18px] text-[#8a8f98]" strokeWidth={2} aria-hidden />
                  <input
                    ref={input}
                    type="search"
                    role="combobox"
                    aria-label="Search this community"
                    aria-expanded={s.term.length >= SEARCH_MIN_CHARS}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    maxLength={60}
                    value={s.q}
                    placeholder={SEARCH_PLACEHOLDER_SHORT}
                    onChange={(e) => s.setQ(e.target.value)}
                    onKeyDown={onKey}
                    className="h-full w-full min-w-0 appearance-none bg-transparent pl-10 pr-3 text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#8a8f98] [&::-webkit-search-cancel-button]:hidden"
                    data-community-search-input=""
                  />
                </label>
                <button type="button" onClick={() => close()} className="inline-flex h-11 shrink-0 items-center px-2 text-[15px] font-medium text-[#1a1a2e] active:opacity-60" data-community-search-close="">
                  Cancel
                </button>
              </div>
              <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-1 ${leaving ? "" : "motion-safe:animate-[community-search-rise_300ms_cubic-bezier(0.22,1,0.36,1)_40ms_both]"}`}>
                <ResultList listId={listId} slug={slug} results={s.results} status={s.status} term={s.term} active={active} onHover={setActive} onPick={go} touch stale={s.stale} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
