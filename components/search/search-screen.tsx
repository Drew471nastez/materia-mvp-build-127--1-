"use client"

/**
 * ===========================================================================
 *  SEARCH, FULL SCREEN
 * ===========================================================================
 * "Tapping Search in the tab bar opens a full screen search, like image 27:
 * a big Search title, an X to close, a rounded search field under it, and no
 * site header while it is open."
 *
 * ONE SCREEN, TWO WAYS IN. This is the screen; where it is drawn is not its
 * business:
 *
 *   components/search/search-overlay.tsx   over whatever page you are on,
 *                                          when the phone's tab bar's Search
 *                                          is pressed (the keyboard comes up
 *                                          with the press)
 *   app/(marketing)/explore/search         the same screen at an address of
 *                                          its own, for a link or a reload
 *
 * WHAT IT SHOWS, top to bottom:
 *
 *   NOTHING TYPED   what you searched before (this device, lib/nav/quick-
 *                   search), then the categories as the other way in.
 *   TYPING          a row to search all of Explore for the words, then
 *                   products (picture, title, creator, price), creators and
 *                   categories as they come. The last answer stays on screen
 *                   while the next is asked for, so the list never blinks
 *                   empty between two letters.
 *   NOTHING FOUND   says so in one line and offers the categories.
 *
 * THE KEYBOARD. The field is a combobox: up and down walk the rows without
 * leaving the field, Enter opens the row that is lit (or searches Explore
 * when none is), Escape closes. Tab stays inside the screen while it is open.
 */

import Image from "next/image"
import { ChevronRight, Clock3, Search, X } from "lucide-react"
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react"

import { AppAvatar } from "@/components/app/app-avatar"
import { createClient } from "@/lib/supabase/client"
import { CATEGORY_NAV } from "@/lib/marketplace/categories"
import { hasCategoryPage } from "@/lib/explore/category-pages"
import {
  DEBOUNCE_MS,
  addRecent,
  cleanTerm,
  clearRecent,
  matchCategories,
  quickSearch,
  readRecent,
  removeRecent,
  type QuickResults,
} from "@/lib/nav/quick-search"

/** The categories that have a page of their own, in the catalogue's order. */
const BROWSE = CATEGORY_NAV.filter((c) => hasCategoryPage(c.id))

/** Explore's results for some words: the page Enter and "Search for" go to. */
export const exploreResultsHref = (q: string) => `/explore?q=${encodeURIComponent(q.trim())}`

const INK = "#1a1a2e"

export type SearchScreenHandle = {
  /** The field, so the press that opened the screen can give it the focus while it still counts as the press. */
  field: HTMLInputElement | null
  /** Starts again from nothing typed (or from `q`), as a fresh screen would. */
  reset: (q?: string) => void
}

type Row =
  | { kind: "all"; key: string; href: string; label: string }
  | { kind: "recent"; key: string; href: string; label: string }
  | { kind: "product"; key: string; href: string; label: string; thumb: string | null; creator: string | null; price: string }
  | { kind: "creator"; key: string; href: string; label: string; handle: string; avatar: string | null }
  | { kind: "category"; key: string; href: string; label: string; parent: string | null }

export const SearchScreen = forwardRef<SearchScreenHandle, {
  /** The X, Escape, and Android's back. */
  onClose: () => void
  /** A row or Enter: where to go. The host decides how (it may have a history entry of its own to replace). */
  onNavigate: (href: string) => void
  /** Words to start from: the query on Explore's results when Search is opened from them. */
  initialQuery?: string
  /** Given the focus as it is drawn: the page at its own address. The overlay focuses it on the press instead. */
  autoFocus?: boolean
}>(function SearchScreen({ onClose, onNavigate, initialQuery = "", autoFocus = false }, ref) {
  const [draft, setDraft] = useState(initialQuery)
  const [results, setResults] = useState<QuickResults | null>(null)
  /** The words the results on screen answer, and whether an answer for the current ones is still out. */
  const [waiting, setWaiting] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [active, setActive] = useState(-1)
  const field = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const ask = useRef(0)
  const timer = useRef<number | null>(null)
  const ids = useId()
  const optionId = (i: number) => `${ids}-opt-${i}`

  useImperativeHandle(ref, () => ({
    get field() {
      return field.current
    },
    reset: (q = "") => {
      setDraft(q)
      setActive(-1)
      setRecent(readRecent())
      if (!q) {
        setResults(null)
        setWaiting(false)
      }
      list.current?.scrollTo({ top: 0 })
    },
  }))

  useEffect(() => {
    setRecent(readRecent())
    if (autoFocus) field.current?.focus({ preventScroll: true })
  }, [autoFocus])

  /*
    ── AS YOU TYPE ──────────────────────────────────────────────────────────
    Categories are local, so they follow every letter at once. The network
    is asked DEBOUNCE_MS after the last letter, and an answer that comes back
    for words that are no longer in the field is dropped (`ask`), so a slow
    reply to "des" cannot land on top of "design".
  */
  const term = cleanTerm(draft)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const n = ++ask.current
    if (!term) {
      setResults(null)
      setWaiting(false)
      return
    }
    setWaiting(true)
    /* The categories now, on top of the last answer's products. */
    setResults((prev) => ({ query: term, products: prev?.products ?? [], creators: prev?.creators ?? [], categories: matchCategories(term) }))
    timer.current = window.setTimeout(async () => {
      try {
        const answer = await quickSearch(createClient(), term)
        if (n !== ask.current) return
        setResults(answer)
      } catch {
        if (n !== ask.current) return
        setResults({ query: term, products: [], creators: [], categories: matchCategories(term) })
      } finally {
        if (n === ask.current) setWaiting(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [term])

  /* Every row a finger or the arrow keys can reach, in the order drawn. */
  const rows = useMemo<Row[]>(() => {
    if (!term) {
      return [
        ...recent.map((q): Row => ({ kind: "recent", key: `r:${q}`, href: exploreResultsHref(q), label: q })),
        ...BROWSE.map((c): Row => ({ kind: "category", key: `b:${c.id}`, href: c.href, label: c.label, parent: null })),
      ]
    }
    const r = results
    return [
      { kind: "all", key: "all", href: exploreResultsHref(draft), label: draft.trim() },
      ...(r?.products ?? []).map((p): Row => ({ kind: "product", key: `p:${p.id}`, href: p.href, label: p.title, thumb: p.thumb, creator: p.creator, price: p.price })),
      ...(r?.creators ?? []).map((c): Row => ({ kind: "creator", key: `c:${c.id}`, href: c.href, label: c.name, handle: c.handle, avatar: c.avatar })),
      ...(r?.categories ?? []).map((c): Row => ({ kind: "category", key: `k:${c.id}`, href: c.href, label: c.label, parent: c.parent })),
    ]
  }, [term, draft, recent, results])

  useEffect(() => setActive(-1), [term])
  /* The lit row stays in view as the arrows walk past the edge of the list. */
  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const go = useCallback(
    (row: Row) => {
      /* What was typed is what is remembered, whichever row it led to. */
      const typed = row.kind === "recent" ? row.label : draft.trim()
      if (typed && row.kind !== "category") setRecent(addRecent(typed))
      field.current?.blur()
      onNavigate(row.href)
    },
    [draft, onNavigate],
  )

  const submit = () => {
    const q = draft.trim()
    if (active >= 0 && rows[active]) return go(rows[active])
    if (!q) return
    go({ kind: "all", key: "all", href: exploreResultsHref(q), label: q })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (rows.length === 0 ? -1 : (i + 1) % rows.length))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (rows.length === 0 ? -1 : i <= 0 ? rows.length - 1 : i - 1))
    } else if (e.key === "Escape") {
      e.preventDefault()
      if (draft) {
        setDraft("")
      } else {
        onClose()
      }
    }
  }

  const found = results && (results.products.length > 0 || results.creators.length > 0 || results.categories.length > 0)
  const nothing = !!term && !waiting && !found

  /* The index of a row in `rows`, for its id and whether it is lit. */
  let at = 0
  const option = (row: Row, children: React.ReactNode, className = "") => {
    const i = at++
    const lit = i === active
    return (
      <a
        key={row.key}
        id={optionId(i)}
        role="option"
        aria-selected={lit}
        href={row.href}
        data-search-row={row.kind}
        tabIndex={-1}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
          e.preventDefault()
          go(row)
        }}
        onMouseMove={() => active !== i && setActive(i)}
        className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left outline-none transition-colors duration-100 active:bg-[#f1f2f4] ${lit ? "bg-[#f1f2f4]" : ""} ${className}`}
      >
        {children}
      </a>
    )
  }

  const heading = (text: string, extra?: React.ReactNode) => (
    <div className="flex items-center justify-between px-3 pb-1 pt-5">
      <h2 className="text-[13px] font-semibold text-[#6b7280]">{text}</h2>
      {extra}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-search-screen="">
      {/* ── THE TOP: the title, the way out, the field ── */}
      <div className="shrink-0 px-4 sm:px-6" style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}>
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between pt-2">
          <h1 id={`${ids}-title`} className="text-[30px] font-bold leading-[1.15] tracking-[-0.02em]" style={{ color: INK }}>
            Search
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            data-search-close=""
            className="-mr-2 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-[#1a1a2e] outline-none transition-colors active:bg-[#f1f2f4] hover:bg-[#f5f6f7] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25"
          >
            <X className="h-[26px] w-[26px]" strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
        <form
          role="search"
          className="relative mx-auto mt-3 w-full max-w-[720px]"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Search aria-hidden="true" className="pointer-events-none absolute left-[18px] top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-[#1a1a2e]" strokeWidth={2} />
          <input
            ref={field}
            data-search-screen-field=""
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={`${ids}-list`}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-labelledby={`${ids}-title`}
            placeholder="Search products and creators"
            /* Image 27's field: a full pill with a dark outline, 16px type
               so iOS does not zoom to it. The outline darkens a little on
               focus rather than growing a ring round it. */
            className="h-[50px] w-full rounded-full border-[1.5px] border-[#1a1a2e]/85 bg-white pl-[46px] pr-12 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#6b7280] focus:border-[#1a1a2e] focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] [&::-webkit-search-cancel-button]:appearance-none"
          />
          {draft ? (
            <button
              type="button"
              aria-label="Clear"
              data-search-clear=""
              onClick={() => {
                setDraft("")
                field.current?.focus({ preventScroll: true })
              }}
              className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280] transition-colors active:bg-[#f1f2f4] hover:text-[#1a1a2e]"
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          ) : null}
        </form>
      </div>

      {/* ── THE ROWS ── scrolled on their own, so the field stays put above the keyboard. */}
      <div
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 sm:px-4"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))", WebkitOverflowScrolling: "touch" }}
        /* A drag on the list puts the keyboard away, as a phone's own search does. */
        onTouchMove={() => {
          if (document.activeElement === field.current) field.current?.blur()
        }}
      >
        <div id={`${ids}-list`} role="listbox" aria-labelledby={`${ids}-title`} className="mx-auto w-full max-w-[720px] pb-2 pt-1" data-search-state={!term ? "idle" : nothing ? "empty" : waiting && !found ? "waiting" : "results"}>
          {!term ? (
            <>
              {recent.length > 0 ? (
                <section data-search-section="recent">
                  {heading(
                    "Recent",
                    <button
                      type="button"
                      onClick={() => setRecent(clearRecent())}
                      className="-mr-1 rounded-md px-2 py-1 text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e] active:bg-[#f1f2f4]"
                    >
                      Clear
                    </button>,
                  )}
                  {rows.filter((r) => r.kind === "recent").map((row) =>
                    option(
                      row,
                      <>
                        <Clock3 aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-[#9ca3af]" />
                        <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e]">{row.label}</span>
                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label={`Remove ${row.label}`}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setRecent(removeRecent(row.label))
                          }}
                          className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9ca3af] hover:text-[#1a1a2e] active:bg-[#e8e9ec]"
                        >
                          <X aria-hidden="true" className="h-4 w-4" />
                        </span>
                      </>,
                    ),
                  )}
                </section>
              ) : null}
              <section data-search-section="browse">
                {heading("Browse categories")}
                {rows.filter((r) => r.kind === "category").map((row) =>
                  option(
                    row,
                    <>
                      <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e]">{row.label}</span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    </>,
                  ),
                )}
              </section>
            </>
          ) : (
            <>
              {option(
                rows[0],
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1f2f4]">
                    <Search aria-hidden="true" className="h-[18px] w-[18px] text-[#1a1a2e]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e]">
                    See all results for <span className="font-semibold">{"“"}{draft.trim()}{"”"}</span>
                  </span>
                </>,
                "mt-2",
              )}

              {nothing ? (
                <div className="px-3 pb-2 pt-6" data-search-empty="">
                  <p className="text-[15px] font-semibold text-[#1a1a2e]">No results for {"“"}{draft.trim()}{"”"}</p>
                  <p className="mt-1 text-[14px] text-[#6b7280]">Check the spelling, try a shorter word, or open a category.</p>
                </div>
              ) : null}

              {results && results.products.length > 0 ? (
                <section data-search-section="products" className={waiting ? "opacity-70 transition-opacity" : "transition-opacity"}>
                  {heading("Products")}
                  {rows.filter((r) => r.kind === "product").map((row) =>
                    row.kind === "product"
                      ? option(
                          row,
                          <>
                            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb]/70 bg-[#f1f2f4]">
                              {row.thumb ? <Image src={row.thumb} alt="" width={48} height={48} className="h-full w-full object-cover" /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-medium text-[#1a1a2e]">{row.label}</span>
                              {row.creator ? <span className="block truncate text-[13px] text-[#6b7280]">{row.creator}</span> : null}
                            </span>
                            <span className="shrink-0 pl-2 text-[14px] font-semibold tabular-nums text-[#1a1a2e]">{row.price}</span>
                          </>,
                        )
                      : null,
                  )}
                </section>
              ) : waiting && !found ? (
                <div aria-hidden="true" data-search-loading="" className="px-3 pt-5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex h-[60px] items-center gap-3">
                      <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-[#f1f2f4]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-[#f1f2f4]" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-[#f4f5f6]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {results && results.creators.length > 0 ? (
                <section data-search-section="creators">
                  {heading("Creators")}
                  {rows.filter((r) => r.kind === "creator").map((row) =>
                    row.kind === "creator"
                      ? option(
                          row,
                          <>
                            <AppAvatar src={row.avatar} name={row.label} alt="" size={40} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-medium text-[#1a1a2e]">{row.label}</span>
                              <span className="block truncate text-[13px] text-[#6b7280]">@{row.handle}</span>
                            </span>
                          </>,
                        )
                      : null,
                  )}
                </section>
              ) : null}

              {results && results.categories.length > 0 ? (
                <section data-search-section="categories">
                  {heading("Categories")}
                  {rows.filter((r) => r.kind === "category").map((row) =>
                    row.kind === "category"
                      ? option(
                          row,
                          <>
                            <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e]">
                              {row.label}
                              {row.parent ? <span className="text-[#6b7280]"> in {row.parent}</span> : null}
                            </span>
                            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                          </>,
                        )
                      : null,
                  )}
                </section>
              ) : null}

              {nothing ? (
                <section data-search-section="browse">
                  {heading("Browse categories")}
                  {BROWSE.map((c) =>
                    /* Not arrow key rows: the empty state's way on, reached by a finger or Tab. */
                    <a
                      key={c.id}
                      href={c.href}
                      onClick={(e) => {
                        e.preventDefault()
                        onNavigate(c.href)
                      }}
                      className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl px-3 text-[15px] text-[#1a1a2e] outline-none transition-colors active:bg-[#f1f2f4] hover:bg-[#f7f7f8] focus-visible:bg-[#f1f2f4]"
                    >
                      <span className="truncate">{c.label}</span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#9ca3af]" />
                    </a>,
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
})
