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
 *   NOTHING TYPED   the categories, as the other way in. Recent searches
 *                   are not shown here: the screen opens from the tab bar
 *                   onto Browse, not onto a history.
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
 *
 * A CATEGORY OPENS ITS SUBCATEGORIES, here, rather than leaving for its page:
 * the list is pushed in from the right with a back row on top, the way
 * Explore's category sheet does it (components/explore/category-browser.tsx,
 * whose timing, curve, parallax and veil this uses), and its first row is
 * all of the category. Back, Escape, or typing another word comes out again.
 */

import Image from "next/image"
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react"

import { AppAvatar } from "@/components/app/app-avatar"
import { BROWSE_DIM, BROWSE_EASE, BROWSE_PARALLAX, BROWSE_SLIDE_MS } from "@/components/explore/category-browser"
import { createClient } from "@/lib/supabase/client"
import { CATEGORY_NAV } from "@/lib/marketplace/categories"
import { hasCategoryPage } from "@/lib/explore/category-pages"
import {
  DEBOUNCE_MS,
  cleanTerm,
  matchCategories,
  quickSearch,
  type QuickResults,
} from "@/lib/nav/quick-search"

/** The categories that have a page of their own, in the catalogue's order. */
const BROWSE = CATEGORY_NAV.filter((c) => hasCategoryPage(c.id))
/** A category's subcategories, by the category's id: what opening one pushes in. */
const SUBS = new Map(BROWSE.map((c) => [c.id, c]))

/*
  WHAT A ROW WEIGHS. A category is 600 and a subcategory 500, as in every
  other list of them (components/explore/category-browser.tsx).
*/
const GROUP_WEIGHT = "font-semibold"
const ITEM_WEIGHT = "font-medium"

/*
  THE CATEGORIES' DEPTH. "A little more depth on those rows": they sit
  together on one white card with a hairline between them, a ring and a soft
  shadow under it, rather than as bare text on the screen. One card per
  list, never a card per row.
*/
const GROUPED =
  "mx-1 overflow-hidden rounded-2xl bg-white divide-y divide-[#eef0f2] shadow-[0_0_0_1px_rgba(16,18,27,0.07),0_1px_2px_rgba(16,18,27,0.05),0_6px_16px_-8px_rgba(16,18,27,0.14)]"

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
  | { kind: "product"; key: string; href: string; label: string; thumb: string | null; creator: string | null; price: string }
  | { kind: "creator"; key: string; href: string; label: string; handle: string; avatar: string | null }
  | {
      kind: "category"
      key: string
      href: string
      label: string
      parent: string | null
      /** A category whose subcategories open here, pushed in, rather than its page. */
      opens?: string
      /** The row's level: a category (600) or a subcategory (500). */
      level: "group" | "item"
    }

type CategoryRow = Extract<Row, { kind: "category" }>

/** A top level category as a row: it opens its subcategories when it has any. */
const groupRow = (id: string, label: string, href: string, key: string): CategoryRow => ({
  kind: "category",
  key,
  href,
  label,
  parent: null,
  opens: SUBS.get(id)?.subcategories.length ? id : undefined,
  level: "group",
})

/** The level a category opens into: all of it first, then each subcategory. */
function subRowsFor(id: string | null): CategoryRow[] {
  const c = id ? SUBS.get(id) : undefined
  if (!c) return []
  return [
    { kind: "category", key: `s:${c.id}`, href: c.href, label: `All ${c.label}`, parent: null, level: "item" },
    ...c.subcategories.map((s): CategoryRow => ({ kind: "category", key: `s:${c.id}/${s.id}`, href: s.href, label: s.label, parent: null, level: "item" })),
  ]
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/*
  A PRODUCT ROW, and the placeholder in its exact shape. "Bigger and
  cleaner": a 60px picture with a hairline ring, then three lines that each
  say one thing, the title in ink, the creator in grey, the price in ink and
  heavier. The placeholder is the same box, the same three lines and the same
  height, so nothing moves when the answer lands on it.
*/
const THUMB_BOX = "relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-[12px] bg-[#f1f2f4]"
const THUMB = `${THUMB_BOX} shadow-[0_0_0_1px_rgba(16,18,27,0.06),0_1px_2px_rgba(16,18,27,0.06)]`

/* The box of each kind of row, so no two sizes are ever written on one row. */
const ROW = "min-h-[52px] gap-3 rounded-xl px-3"
const CARD_ROW = "min-h-[52px] gap-3 px-4"
const PRODUCT_ROW = "min-h-[76px] gap-3.5 rounded-xl px-3 py-2"

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
  /** An answer has been out long enough to say so: only then are the last results dimmed. */
  const [slow, setSlow] = useState(false)
  const [active, setActive] = useState(-1)
  /*
    THE SUBCATEGORY LEVEL. `sub` is the category open now; `held` keeps its
    rows drawn while it slides back out (and for opening it again), and
    `subOut` says it has finished leaving, so it is not painted. `instant`
    puts a level away with no slide, for a screen that is starting again.
  */
  const [sub, setSub] = useState<string | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  const [subOut, setSubOut] = useState(true)
  const [instant, setInstant] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const subList = useRef<HTMLDivElement>(null)
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
      setInstant(true)
      setSub(null)
      setSubOut(true)
      if (!q) {
        setResults(null)
        setWaiting(false)
      }
      list.current?.scrollTo({ top: 0 })
    },
  }))

  useEffect(() => {
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

  /*
    NO FLICKER BETWEEN TWO WORDS. The last answer stays on screen while the
    next is asked for, at full strength: dimming it on every letter made the
    list blink as you typed. Only an answer that is taking a while (a slow
    network, not a typist) dims it, softly, so it reads as waiting.
  */
  useEffect(() => {
    if (!waiting) {
      setSlow(false)
      return
    }
    const t = window.setTimeout(() => setSlow(true), 650)
    return () => window.clearTimeout(t)
  }, [waiting, term])

  /* Another word is a question about the whole list: out of a category, back to the top level. */
  const lastTerm = useRef(term)
  useEffect(() => {
    if (lastTerm.current === term) return
    lastTerm.current = term
    setSub(null)
    if (reducedMotion()) setSubOut(true)
  }, [term])

  /* The rows of the top level, whatever level is showing: it stays drawn under a pushed one. */
  const rootRows = useMemo<Row[]>(() => {
    if (!term) {
      return BROWSE.map((c): Row => groupRow(c.id, c.label, c.href, `b:${c.id}`))
    }
    const r = results
    return [
      { kind: "all", key: "all", href: exploreResultsHref(draft), label: draft.trim() },
      ...(r?.products ?? []).map((p): Row => ({ kind: "product", key: `p:${p.id}`, href: p.href, label: p.title, thumb: p.thumb, creator: p.creator, price: p.price })),
      ...(r?.creators ?? []).map((c): Row => ({ kind: "creator", key: `c:${c.id}`, href: c.href, label: c.name, handle: c.handle, avatar: c.avatar })),
      ...(r?.categories ?? []).map((c): Row =>
        c.parent ? { kind: "category", key: `k:${c.id}`, href: c.href, label: c.label, parent: c.parent, level: "item" } : groupRow(c.id, c.label, c.href, `k:${c.id}`),
      ),
    ]
  }, [term, draft, results])
  const heldRows = useMemo(() => subRowsFor(held), [held])
  /* Every row a finger or the arrow keys can reach on the level showing, in the order drawn. */
  const rows: Row[] = sub ? heldRows : rootRows
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.key, i])), [rows])

  useEffect(() => setActive(-1), [term, sub])
  /* The lit row stays in view as the arrows walk past the edge of the list. */
  useEffect(() => {
    if (active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  /*
    IN AND OUT OF A CATEGORY, on the tap (never the press: see ONE TAP in
    components/explore/category-browser.tsx, which is why a level that
    appears under a finger on WebKit cost a second tap). The level's rows
    and its move are one commit.
  */
  const drillIn = useCallback((id: string) => {
    if (subList.current) subList.current.scrollTop = 0
    setInstant(false)
    setHeld(id)
    setSubOut(false)
    setSub(id)
  }, [])
  const back = useCallback(() => {
    setInstant(false)
    setSub(null)
    if (reducedMotion()) setSubOut(true)
  }, [])
  /* A level opened or closed by a keyboard keeps the focus on something that is still on screen. */
  const keyboardBack = useRef(false)
  useLayoutEffect(() => {
    if (!keyboardBack.current || sub) return
    keyboardBack.current = false
    field.current?.focus({ preventScroll: true })
  }, [sub])

  const go = useCallback(
    (row: Row) => {
      if (row.kind === "category" && row.opens) {
        drillIn(row.opens)
        return
      }
      field.current?.blur()
      onNavigate(row.href)
    },
    [onNavigate, drillIn],
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
      if (sub) {
        back()
      } else if (draft) {
        setDraft("")
      } else {
        onClose()
      }
    }
  }

  const found = results && (results.products.length > 0 || results.creators.length > 0 || results.categories.length > 0)
  const nothing = !!term && !waiting && !found
  const inSub = sub !== null
  const heldCat = held ? SUBS.get(held) ?? null : null

  /*
    One row, in one of the boxes above: CARD_ROW is a row on the
    categories' card (square, full width, a hairline between it and the
    next), ROW a rounded row on the screen. A row that is not on the level
    showing has no id and is never lit, so the arrows only ever walk what
    can be seen.
  */
  const option = (row: Row, children: React.ReactNode, box = ROW) => {
    const i = indexOf.get(row.key)
    const reachable = i !== undefined
    const lit = reachable && i === active
    return (
      <a
        key={row.key}
        id={reachable ? optionId(i) : undefined}
        role="option"
        aria-selected={lit}
        href={row.href}
        data-search-row={row.kind}
        data-search-opens={row.kind === "category" && row.opens ? row.opens : undefined}
        tabIndex={-1}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
          e.preventDefault()
          go(row)
        }}
        onMouseMove={() => reachable && active !== i && setActive(i)}
        className={`flex w-full items-center ${box} text-left outline-none transition-colors duration-100 active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent] ${lit ? "bg-[#f1f2f4]" : ""}`}
      >
        {children}
      </a>
    )
  }

  /* A category or a subcategory on the card: its name at its level's weight, and a chevron when it opens. */
  const categoryRow = (row: CategoryRow) =>
    option(
      row,
      <>
        <span className={`min-w-0 flex-1 truncate text-[16px] leading-5 text-[#1a1a2e] ${row.level === "group" ? GROUP_WEIGHT : ITEM_WEIGHT}`}>
          {row.label}
          {row.parent ? <span className="font-normal text-[#6b7280]"> in {row.parent}</span> : null}
        </span>
        <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-[#9ca3af]" />
      </>,
      CARD_ROW,
    )

  const heading = (text: string, extra?: React.ReactNode) => (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-5">
      <h2 className="text-[13px] font-semibold text-[#6b7280]">{text}</h2>
      {extra}
    </div>
  )

  /* The push, on the category sheet's own timing and curve. */
  const still = instant || reducedMotion()
  const move = still ? "none" : `transform ${BROWSE_SLIDE_MS}ms ${BROWSE_EASE}`
  const veil = still ? "none" : `opacity ${BROWSE_SLIDE_MS}ms ${BROWSE_EASE}`
  const pane = "absolute inset-0 overflow-y-auto overscroll-contain bg-white px-2 sm:px-4"
  const paneStyle = { paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))", WebkitOverflowScrolling: "touch", touchAction: "pan-y", willChange: "transform" } as const
  /* A drag on the list puts the keyboard away, as a phone's own search does. */
  const putKeyboardAway = () => {
    if (document.activeElement === field.current) field.current?.blur()
  }
  const listState = !term ? "idle" : nothing ? "empty" : waiting && !found ? "waiting" : "results"
  const products = results?.products ?? []

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
          /*
            ROOM UNDER IT FOR ITS OWN SHADOW. The field's soft shadow falls
            about eleven pixels below it, and it had four of padding with
            four more of margin under that before the rows begin: the rows'
            pane is opaque white and painted straight over the rest of it,
            which sliced the bottom edge of the field flat ("the search
            input gets cut"). Twelve here clears the whole shadow before
            anything else is painted.
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
            aria-expanded={rows.length > 0}
            aria-controls={inSub ? `${ids}-sub` : `${ids}-list`}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            aria-labelledby={`${ids}-title`}
            placeholder="Search products and creators"
            /* A rounded rectangle, not a pill: "a normal rounded rectangle,
               about 12px". 16px type, so iOS does not zoom to it.

               AND IT WEARS STORELIB'S FIELD, NOT A BLACK FRAME. It had a
               1.5px near-black outline with a shade pressed in along the
               top: "should not have the black bar around it, should be
               matching more the Storelib UI". Every other field on the way
               here is a hairline over a soft shadow, the search on Explore
               that opens this one included (components/explore/explore-hero),
               so this is that same border and that same shadow. Focus
               darkens the hairline, which is the affordance without the
               frame; its size never changes. */
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

      {/* ── THE ROWS ── two levels, each its own scroller, so the field stays put above the keyboard and a level keeps its place. */}
      <div className="relative mt-1 min-h-0 flex-1 overflow-hidden" style={{ contain: "layout paint" }}>
        <div
          ref={list}
          data-search-level="root"
          inert={inSub || undefined}
          aria-hidden={inSub || undefined}
          className={pane}
          style={{ ...paneStyle, transform: inSub ? `translate3d(${BROWSE_PARALLAX}, 0, 0)` : "translate3d(0, 0, 0)", transition: move }}
          onTouchMove={putKeyboardAway}
        >
          <div id={`${ids}-list`} role="listbox" aria-labelledby={`${ids}-title`} className="mx-auto w-full max-w-[720px] pb-2 pt-1" data-search-state={listState}>
            {!term ? (
              <>
                <section data-search-section="browse">
                  {heading("Browse categories")}
                  <div className={GROUPED} data-search-card="">
                    {rootRows.map((row) => (row.kind === "category" ? categoryRow(row) : null))}
                  </div>
                </section>
              </>
            ) : (
              <>
                {option(
                  rootRows[0],
                  <>
                    {/*
                      THE MARK IS A TILE, NOT A GREY DISC. A light grey circle
                      around a glyph is a generic search suggestion. This row
                      sits above product pictures that are white, 12px, and
                      held by a hairline, so the mark is that same tile at
                      the row's own size, with the field's own magnifier in
                      it and a chevron, the way a category says it opens.
                    */}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white shadow-[0_0_0_1px_rgba(16,18,27,0.07),0_1px_2px_rgba(16,18,27,0.06)]">
                      <Search aria-hidden="true" className="h-[18px] w-[18px] text-[#1a1a2e]" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-[#1a1a2e]">
                      See all results for <span className="font-semibold">{"“"}{draft.trim()}{"”"}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-[#9ca3af]" />
                  </>,
                  `${ROW} mt-2`,
                )}

                {nothing ? (
                  <div className="px-3 pb-2 pt-6" data-search-empty="">
                    <p className="text-[15px] font-semibold text-[#1a1a2e]">No results for {"“"}{draft.trim()}{"”"}</p>
                    <p className="mt-1 text-[14px] text-[#6b7280]">Check the spelling, try a shorter word, or open a category.</p>
                  </div>
                ) : null}

                {products.length > 0 ? (
                  <section
                    data-search-section="products"
                    className="transition-opacity duration-200 ease-out"
                    style={{ opacity: slow ? 0.6 : 1 }}
                  >
                    {heading("Products")}
                    {rootRows.map((row) =>
                      row.kind === "product"
                        ? option(
                            row,
                            <>
                              <span className={THUMB}>
                                {row.thumb ? <Image src={row.thumb} alt="" width={60} height={60} className="h-full w-full object-cover" /> : null}
                              </span>
                              <span className="min-w-0 flex-1 py-0.5">
                                <span data-search-title="" className="block truncate text-[15px] font-medium leading-5 text-[#1a1a2e]">{row.label}</span>
                                {row.creator ? <span data-search-creator="" className="block truncate text-[13px] leading-[18px] text-[#6b7280]">{row.creator}</span> : null}
                                <span data-search-price="" className="mt-0.5 block text-[14px] font-semibold leading-[18px] tabular-nums text-[#1a1a2e]">{row.price}</span>
                              </span>
                            </>,
                            PRODUCT_ROW,
                          )
                        : null,
                    )}
                  </section>
                ) : waiting ? (
                  /* The answer is out and there is nothing from before to show: rows in the result's own shape. */
                  <section aria-hidden="true" data-search-loading="">
                    {heading("Products")}
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={`flex items-center ${PRODUCT_ROW}`}>
                        <div className={`${THUMB_BOX} animate-pulse`} />
                        <div className="flex-1 py-0.5">
                          <div className="flex h-5 items-center"><div className="h-3.5 animate-pulse rounded-full bg-[#eceef1]" style={{ width: `${[64, 52, 70][i]}%` }} /></div>
                          <div className="flex h-[18px] items-center"><div className="h-3 w-[34%] animate-pulse rounded-full bg-[#f1f2f4]" /></div>
                          <div className="mt-0.5 flex h-[18px] items-center"><div className="h-3 w-[18%] animate-pulse rounded-full bg-[#eceef1]" /></div>
                        </div>
                      </div>
                    ))}
                  </section>
                ) : null}

                {results && results.creators.length > 0 ? (
                  <section data-search-section="creators">
                    {heading("Creators")}
                    {rootRows.map((row) =>
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
                    <div className={GROUPED} data-search-card="">
                      {rootRows.map((row) => (row.kind === "category" ? categoryRow(row) : null))}
                    </div>
                  </section>
                ) : null}

                {nothing ? (
                  <section data-search-section="browse">
                    {heading("Browse categories")}
                    <div className={GROUPED} data-search-card="">
                      {BROWSE.map((c) => {
                        const opens = !!SUBS.get(c.id)?.subcategories.length
                        /* Not arrow key rows: the empty state's way on, reached by a finger or Tab. */
                        return (
                          <a
                            key={c.id}
                            href={c.href}
                            data-search-opens={opens ? c.id : undefined}
                            onClick={(e) => {
                              e.preventDefault()
                              if (opens) drillIn(c.id)
                              else onNavigate(c.href)
                            }}
                            className={`flex min-h-[52px] items-center justify-between gap-3 px-4 text-[16px] leading-5 text-[#1a1a2e] outline-none transition-colors active:bg-[#f1f2f4] hover:bg-[#f7f7f8] focus-visible:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent] ${GROUP_WEIGHT}`}
                          >
                            <span className="truncate">{c.label}</span>
                            <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-[#9ca3af]" />
                          </a>
                        )
                      })}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* The veil that dims the top level under a pushed one. */}
        <div
          aria-hidden="true"
          data-search-veil=""
          className="pointer-events-none absolute inset-0 bg-[#0f172a]"
          style={{ opacity: inSub ? BROWSE_DIM : 0, transition: veil, willChange: "opacity" }}
        />

        {/* ── A CATEGORY'S SUBCATEGORIES, pushed in from the right ── */}
        <div
          ref={subList}
          data-search-level="sub"
          inert={!inSub || undefined}
          aria-hidden={!inSub || undefined}
          className={pane}
          style={{
            ...paneStyle,
            transform: inSub ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: move,
            visibility: heldCat && (inSub || !subOut) ? "visible" : "hidden",
          }}
          onTouchMove={putKeyboardAway}
          onTransitionEnd={(e) => {
            /* Out of sight and still: not painted, its rows kept for going in again. */
            if (e.target === e.currentTarget && e.propertyName === "transform" && !inSub) setSubOut(true)
          }}
        >
          {heldCat ? (
            <div className="mx-auto w-full max-w-[720px] pb-2 pt-1">
              <button
                type="button"
                data-search-back=""
                onClick={(e) => {
                  keyboardBack.current = e.detail === 0
                  back()
                }}
                className="mt-1 flex min-h-[48px] w-full items-center gap-1.5 rounded-xl pl-1.5 pr-3 text-left text-[17px] font-semibold text-[#1a1a2e] outline-none transition-colors active:bg-[#f1f2f4] focus-visible:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
              >
                <ChevronLeft aria-hidden="true" className="h-[22px] w-[22px] shrink-0 text-[#6b7280]" strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate">{heldCat.label}</span>
              </button>
              <div id={`${ids}-sub`} role="listbox" aria-label={heldCat.label} className={`${GROUPED} mt-1.5`} data-search-card="">
                {heldRows.map((row) => categoryRow(row))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
})
