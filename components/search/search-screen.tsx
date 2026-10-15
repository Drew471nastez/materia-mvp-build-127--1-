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
 * THE HEADER'S SEARCH, AT THE SIZE OF A PHONE (round 9). It used to open on
 * a "Browse categories" list (image 58) and searched products, creators and
 * categories. The owner asked for the search the header has: products AND
 * communities, nothing else. So this screen asks the header's questions
 * (lib/nav/quick-search quickSearch, ranked together by topHits) and draws
 * the header's own rows (components/platform/header-search-results), so the
 * two searches can never drift apart:
 *
 *   NOTHING TYPED   the recent searches on this device, each removable, and
 *                   Clear. None yet: nothing under the field at all.
 *   TYPING          the most relevant products and communities together,
 *                   then "View all results for" the words. The last answer
 *                   stays on screen while the next is asked for, so the list
 *                   never blinks empty between two letters.
 *   NOTHING FOUND   says so in one line, with View all still under it.
 *
 * THE KEYBOARD. The field is a combobox: up and down walk the rows without
 * leaving the field, Enter opens the row that is lit (or Explore's results
 * when none is), Escape clears the words and then closes. Tab stays inside
 * the screen while it is open (the overlay sees to that).
 */

import { Search, X } from "lucide-react"
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react"

import { HeaderSearchResults, optionCount, optionId } from "@/components/platform/header-search-results"
import { createClient } from "@/lib/supabase/client"
import { useCommunitiesEnabled } from "@/lib/platform/use-flags"
import {
  DEBOUNCE_MS,
  addRecent,
  cleanTerm,
  clearRecent,
  quickSearch,
  readRecent,
  removeRecent,
  topHits,
  viewAllHref,
  type QuickHit,
} from "@/lib/nav/quick-search"

/*
  HOW MANY ROWS. The header lists five under its field; a whole screen has
  room for a few more before the keyboard, and a drag puts the keyboard away
  for the rest. View all is always the last row.
*/
export const SCREEN_LIMIT = 8

const INK = "var(--sl-ink-strong, #1a1a2e)"

/** Explore's mode in the address, so View all stays in communities when that is what is being browsed. */
function modeHere(): "products" | "communities" {
  if (typeof window === "undefined") return "products"
  const { pathname, search } = window.location
  return pathname.startsWith("/explore") && new URLSearchParams(search).get("type") === "communities" ? "communities" : "products"
}

export type SearchScreenHandle = {
  /** The field, so the press that opened the screen can give it the focus while it still counts as the press. */
  field: HTMLInputElement | null
  /** Starts again from nothing typed (or from `q`), as a fresh screen would. */
  reset: (q?: string) => void
}

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
  /* Communities in the results only while they are switched on (lib/platform/use-flags). */
  const communitiesOn = useCommunitiesEnabled()
  const [hits, setHits] = useState<QuickHit[]>([])
  /** An answer for the words in the field is still out. */
  const [waiting, setWaiting] = useState(false)
  const [active, setActive] = useState(-1)
  const [recents, setRecents] = useState<string[]>([])
  const field = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const ask = useRef(0)
  const timer = useRef<number | null>(null)
  const ids = useId()
  const prefix = `${ids}-search`

  useImperativeHandle(ref, () => ({
    get field() {
      return field.current
    },
    reset: (q = "") => {
      setDraft(q)
      setActive(-1)
      setRecents(readRecent())
      if (!q) {
        setHits([])
        setWaiting(false)
      }
      list.current?.scrollTo({ top: 0 })
    },
  }))

  /* What was searched before lives in this device's storage, so it is read after the first paint, never on the server. */
  useEffect(() => setRecents(readRecent()), [])

  useEffect(() => {
    if (autoFocus) field.current?.focus({ preventScroll: true })
  }, [autoFocus])

  /*
    ── AS YOU TYPE ──────────────────────────────────────────────────────────
    The network is asked DEBOUNCE_MS after the last letter, and an answer
    that comes back for words that are no longer in the field is dropped
    (`ask`), so a slow reply to "des" cannot land on top of "design".
  */
  const term = cleanTerm(draft)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const n = ++ask.current
    if (!term) {
      setHits([])
      setWaiting(false)
      return
    }
    setWaiting(true)
    timer.current = window.setTimeout(async () => {
      try {
        const answer = await quickSearch(createClient(), term, { communities: communitiesOn, creators: false })
        if (n !== ask.current) return
        setHits(topHits(answer, SCREEN_LIMIT))
      } catch {
        if (n !== ask.current) return
        setHits([])
      } finally {
        if (n === ask.current) setWaiting(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [term, communitiesOn])

  useEffect(() => setActive(-1), [term])

  /* The lit row stays in view as the arrows walk past the edge of the list. */
  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(prefix, active))?.scrollIntoView({ block: "nearest" })
  }, [active, prefix])

  const word = draft.trim()

  /* ── WHERE EACH ROW GOES ── a search that led somewhere is remembered. */
  const pickHit = useCallback(
    (hit: QuickHit) => {
      setRecents(addRecent(draft))
      field.current?.blur()
      onNavigate(hit.href)
    },
    [draft, onNavigate],
  )
  const viewAll = useCallback(() => {
    if (!word) return
    setRecents(addRecent(word))
    field.current?.blur()
    onNavigate(viewAllHref(word, modeHere()))
  }, [word, onNavigate])
  const pickRecent = useCallback((q: string) => {
    setDraft(q)
    setActive(-1)
    field.current?.focus({ preventScroll: true })
  }, [])

  const submit = () => {
    if (!word) {
      if (active >= 0 && recents[active]) pickRecent(recents[active])
      return
    }
    if (active >= 0 && active < hits.length) pickHit(hits[active])
    else viewAll()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = optionCount(draft, hits, recents)
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!count) return
      setActive((i) => (e.key === "ArrowDown" ? (i + 1 >= count ? 0 : i + 1) : i <= 0 ? count - 1 : i - 1))
    } else if (e.key === "Escape") {
      e.preventDefault()
      if (draft) setDraft("")
      else onClose()
    }
  }

  /* A drag on the list puts the keyboard away, as a phone's own search does. */
  const putKeyboardAway = () => {
    if (document.activeElement === field.current) field.current?.blur()
  }
  const listState = !word ? (recents.length ? "recent" : "idle") : hits.length ? "results" : waiting ? "waiting" : "empty"
  const expanded = !!word || recents.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-search-screen="">
      {/* ── THE TOP: the title, the way out, the field ── */}
      {/*
        ABOVE THE ROWS, SO ITS SHADOW IS NEVER CUT (round 11). The field's
        shadow reaches 20px under it (9px down, 27px of blur, 16px pulled in)
        and the room under the form is 12px, so the rows' white pane, painted
        after it, sliced the last 8px off flat: the clipped bottom edge the
        owner saw on /explore/search. Lifted over the pane, the shadow fades
        out whole across the top of the rows, and rows scrolling up pass under
        it, as content does under any bar.
      */}
      <div className="relative z-[1] shrink-0 px-4 sm:px-6" style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }} data-search-top="">
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
          /*
            ROOM UNDER IT. Twelve pixels between the field and the rows; the
            field's shadow reaches further (20px) and is drawn over the rows'
            pane, which this block sits above (see the note on it).
          */
          className="relative mx-auto mt-3 w-full max-w-[720px] pb-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Search aria-hidden="true" className="pointer-events-none absolute left-[15px] top-[25px] h-[19px] w-[19px] -translate-y-1/2 text-[#1a1a2e]" strokeWidth={2} />
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
            aria-expanded={expanded}
            aria-controls={expanded ? `${prefix}-list` : undefined}
            aria-activedescendant={active >= 0 ? optionId(prefix, active) : undefined}
            aria-autocomplete="list"
            aria-labelledby={`${ids}-title`}
            placeholder={communitiesOn ? "Search products and communities" : "Search products"}
            /* A rounded rectangle, not a pill: "a normal rounded rectangle,
               about 12px". 16px type, so iOS does not zoom to it.

               AND IT WEARS STORELIB'S FIELD, NOT A BLACK FRAME: the hairline
               over a soft shadow that every other field on the way here has,
               the search on Explore included (components/explore/
               explore-hero). Focus darkens the hairline; its size never
               changes. */
            className="h-[50px] w-full rounded-[12px] border border-neutral-200/80 bg-white pl-[42px] pr-12 text-[16px] text-[#1a1a2e] shadow-[0_1px_3px_rgba(15,23,42,0.045),0_9px_27px_-16px_rgba(15,23,42,0.315)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#6b7280] focus:border-neutral-300 [&::-webkit-search-cancel-button]:appearance-none"
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
              className="absolute right-1.5 top-[25px] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-[#6b7280] transition-colors active:bg-[#f1f2f4] hover:text-[#1a1a2e]"
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          ) : null}
        </form>
      </div>

      {/* ── THE ROWS ── their own scroller, so the field stays put above the keyboard. */}
      <div
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-2.5 sm:px-4"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))", WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        onTouchMove={putKeyboardAway}
      >
        <div className="mx-auto w-full max-w-[720px]" data-search-state={listState}>
          <HeaderSearchResults
            query={draft}
            hits={hits}
            loading={waiting}
            recents={recents}
            active={active}
            idPrefix={prefix}
            onHover={setActive}
            onPick={pickHit}
            onViewAll={viewAll}
            onRecent={pickRecent}
            onRemoveRecent={(r) => setRecents(removeRecent(r))}
            onClearRecent={() => setRecents(clearRecent())}
            phone
          />
        </div>
      </div>
    </div>
  )
})
