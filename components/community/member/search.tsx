"use client"

/**
 * ===========================================================================
 *  "SEARCH DISCUSSIONS, MEMBERS, OR CONTENT..."
 * ===========================================================================
 * The community's own search, in its bar. On a computer and a tablet it is a
 * field in the middle of the bar with a dropdown under it; on a phone it is
 * an icon that opens the same search over the whole screen. What it finds
 * comes from GET /api/community/<id>/search (lib/communities/server/
 * search.ts): posts, members and spaces this member may see, in three short
 * groups, the words that matched in bold.
 *
 * KEYBOARD. It is a combobox: the arrows move through every result across
 * the groups, Enter opens the chosen one, Escape closes the list (a second
 * Escape leaves the field), and "/" anywhere on the page that is not a field
 * puts the cursor in it. Screen readers hear the list as a listbox with the
 * chosen option announced.
 *
 * QUIET ON THE NETWORK. It asks once the typing pauses (180ms), never for
 * fewer than two letters, drops an answer that arrives after a newer ask,
 * and keeps what it found in this page, so going back over the same words
 * asks nothing.
 */
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import { Hash, MessageSquareText, MessagesSquare, Search, X } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { relativeTime } from "@/lib/communities/format"
import { registerCommunitySearch } from "@/lib/nav/community-search-bridge"
import { api, apiBase } from "./api"
import { PLAIN_ICON_BTN } from "./ui"
import type { SearchResults } from "./view-types"
import { roleTag } from "./view-types"

/** Mirrors the server: shorter than this is not searched. */
export const SEARCH_MIN_CHARS = 2
export const SEARCH_DEBOUNCE_MS = 180
export const SEARCH_PLACEHOLDER = "Search discussions, members, or content..."
/** The placeholder where the field is too narrow for the whole line (a tablet), so it is never cut mid word. */
export const SEARCH_PLACEHOLDER_SHORT = "Search this community"
const SHORT_BELOW_PX = 380

type Status = "idle" | "loading" | "done" | "error" | "busy"

export interface SearchOption {
  key: string
  group: "posts" | "members" | "spaces"
  href: string
}

/** The results in the order they are drawn and stepped through: posts, members, spaces. */
export function searchOptions(r: SearchResults | null, slug: string): SearchOption[] {
  if (!r) return []
  const base = `/community/${slug}`
  return [
    ...r.posts.map((p) => ({ key: `post:${p.id}`, group: "posts" as const, href: `${base}/post/${p.id}` })),
    ...r.members.map((m) => ({ key: `member:${m.id}`, group: "members" as const, href: m.href })),
    ...r.spaces.map((s) => ({ key: `space:${s.id}`, group: "spaces" as const, href: `${base}/space/${s.slug}` })),
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

/** The text with every match of q in bold, case kept. */
function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const parts: React.ReactNode[] = []
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  let at = 0
  let i = lower.indexOf(needle)
  while (i >= 0 && parts.length < 40) {
    if (i > at) parts.push(text.slice(at, i))
    parts.push(
      <mark key={i} className="bg-transparent font-semibold text-[#1a1a2e]">
        {text.slice(i, i + needle.length)}
      </mark>,
    )
    at = i + needle.length
    i = lower.indexOf(needle, at)
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

/** The search itself: the words, the ask, the answer, the chosen option. Shared by the field and the phone screen. */
function useCommunitySearch(communityId: string) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const cache = useRef(new Map<string, SearchResults>())
  const latest = useRef("")

  useEffect(() => {
    const term = q.trim().replace(/\s+/g, " ")
    latest.current = term
    if (term.length < SEARCH_MIN_CHARS) {
      setResults(null)
      setStatus("idle")
      return
    }
    const known = cache.current.get(term.toLowerCase())
    if (known) {
      setResults(known)
      setStatus("done")
      return
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
      cache.current.set(term.toLowerCase(), r.data.results)
      setResults(r.data.results)
      setStatus("done")
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [q, communityId])

  return { q, setQ, results, status, term: q.trim().replace(/\s+/g, " ") }
}

const GROUP_TITLE = { posts: "Posts", members: "Members", spaces: "Spaces" } as const

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
}) {
  const options = searchOptions(results, slug)
  const row = `flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 text-left outline-none ${touch ? "min-h-[56px] py-2" : "min-h-[52px] py-1.5"}`
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

  if (term.length < SEARCH_MIN_CHARS) return touch ? message("Find posts, members and spaces in this community.") : null
  if (status === "busy") return message("Search is busy. Try again in a moment.")
  if (status === "error") return message("Search did not load. Try again.")
  if (!results) return message("Searching...")
  if (!options.length) return status === "loading" ? message("Searching...") : message(`Nothing here matches "${term}".`)

  return (
    <div role="listbox" id={listId} aria-label="Search results" className={`transition-opacity duration-150 ${status === "loading" ? "opacity-60" : ""}`} data-search-results="">
      {results.posts.length ? (
        <div role="group" aria-label={GROUP_TITLE.posts} data-search-group="posts">
          <p className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-[#8a8f98]">{GROUP_TITLE.posts}</p>
          {results.posts.map((p) => {
            const main = p.title || p.snippet || "Post"
            const meta = [p.author?.name, p.space ? `in ${p.space.name}` : null, relativeTime(p.createdAt)].filter(Boolean).join(" · ")
            return (
              <div key={p.id} {...optionProps(`post:${p.id}`)}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280]">
                  <MessageSquareText className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[#262633]">
                    <Marked text={main} q={term} />
                  </span>
                  {p.title && p.snippet ? (
                    <span className="block truncate text-[12.5px] text-[#6b7280]">
                      <Marked text={p.snippet} q={term} />
                    </span>
                  ) : null}
                  <span className="block truncate text-[12px] text-[#9ca3af]" suppressHydrationWarning>
                    {meta}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
      {results.members.length ? (
        <div role="group" aria-label={GROUP_TITLE.members} data-search-group="members">
          <p className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-[#8a8f98]">{GROUP_TITLE.members}</p>
          {results.members.map((m) => {
            const tag = roleTag(m.role)
            return (
              <div key={m.id} {...optionProps(`member:${m.id}`)}>
                <AppAvatar src={m.avatarUrl} name={m.name} alt="" size={32} markWhileLoading />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[#262633]">
                    <Marked text={m.name} q={term} />
                    {tag ? <span className="ml-1.5 rounded-md bg-[#f1f2f4] px-1.5 text-[11px] font-medium text-[#4b5563]">{tag}</span> : null}
                  </span>
                  {m.username ? (
                    <span className="block truncate text-[12.5px] text-[#6b7280]">
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
          <p className="px-2.5 pb-1 pt-2 text-[12px] font-medium text-[#8a8f98]">{GROUP_TITLE.spaces}</p>
          {results.spaces.map((s) => (
            <div key={s.id} {...optionProps(`space:${s.id}`)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280]">
                {s.kind === "chat" ? <MessagesSquare className="h-4 w-4" strokeWidth={1.9} aria-hidden /> : <Hash className="h-4 w-4" strokeWidth={1.9} aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-[#262633]">
                  <Marked text={s.name} q={term} />
                </span>
                {s.description ? <span className="block truncate text-[12.5px] text-[#6b7280]">{s.description}</span> : null}
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
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => setNarrow(el.getBoundingClientRect().width < SHORT_BELOW_PX)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      s.setQ("")
      input.current?.blur()
      router.push(href)
    },
    [router, s],
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
          onFocus={() => setOpen(true)}
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
          <ResultList listId={listId} slug={slug} results={s.results} status={s.status} term={s.term} active={active} onHover={setActive} onPick={go} />
        </div>
      ) : null}
    </div>
  )
}

/* ── On a phone: an icon, and the search over the whole screen ─────────── */

export function CommunitySearchButton({ communityId, slug, className = "" }: { communityId: string; slug: string; className?: string }) {
  const router = useRouter()
  const listId = useId()
  const s = useCommunitySearch(communityId)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const options = useMemo(() => searchOptions(s.results, slug), [s.results, slug])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => setActive(-1), [s.results])

  const close = useCallback((focusBack = true) => {
    setOpen(false)
    if (focusBack) button.current?.focus({ preventScroll: true })
  }, [])
  const go = useCallback(
    (href: string) => {
      close(false)
      s.setQ("")
      router.push(href)
    },
    [close, router, s],
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
    [slug],
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
      {mounted && open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Search this community"
              className="fixed inset-0 z-[80] flex flex-col bg-white pt-[env(safe-area-inset-top)] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-sheet motion-reduce:animate-none"
              data-community-search-screen=""
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  close()
                }
              }}
            >
              <div className="flex items-center gap-2 border-b border-[#eceef1] px-3 py-2">
                <label className="relative flex h-11 min-w-0 flex-1 items-center rounded-xl bg-[#f3f4f6]">
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-1">
                <ResultList listId={listId} slug={slug} results={s.results} status={s.status} term={s.term} active={active} onHover={setActive} onPick={go} touch />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
