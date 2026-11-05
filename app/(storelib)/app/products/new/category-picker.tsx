"use client"

/**
 * ===========================================================================
 *  THE CATEGORY FIELD
 * ===========================================================================
 * Shaped like Shopify's product category field, which the owner sent: a
 * field that says "Search categories", in the main column above the
 * description, and a list that opens from it.
 *
 * ON A COMPUTER the list opens right under the field (over it when there is
 * no room below), as wide as the field, anchored to it. Not a window in the
 * middle of the screen: the field stays where it is and stays typed into.
 *   - At the top, the groups, each a row with a chevron.
 *   - A group opens in the same list: "Back to All" first, the group's name
 *     as a header, then its categories. Into a group slides left, back
 *     slides right, on transform and opacity, in a list of a fixed height,
 *     so nothing around it moves.
 *   - Typing searches every category, its group on the right.
 *   - Pinned at the bottom, the suggested category with a "Suggested" tag
 *     (lib/products/category-suggest.ts and the route behind it).
 *   - Up and Down move through the rows, Enter opens or chooses, Right
 *     opens a group and Left goes back while nothing is typed, Escape or a
 *     click outside closes. Focus never leaves the field.
 * Under the field, once it is closed, the chosen category and its group,
 * a "Suggested" tag when it is the suggestion, and an x to clear it.
 *
 * ON A PHONE the field opens the shared sheet (components/ui/bottom-sheet.tsx:
 * the grabber, a pull down or a tap outside close it, and it follows the
 * finger), with the search on top and the same levels sliding the same way.
 *
 * No dialog, no second dropdown inside the first, no violet: the tag is the
 * page's own grey. 36px rows on a computer, 48px on a phone.
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ArrowLeft, Check, ChevronRight, Search, X } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { hapticTap } from "@/lib/native-bridge"
import { categoryGroupsFor, groupOfCategory, type CategoryKind } from "@/lib/products/category-groups"
import { searchCategoriesByWords } from "@/lib/products/category-suggest"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/** The slide between levels: iOS's navigation curve, on transform and opacity only. */
const SLIDE_MS = 280
const SLIDE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

type Level = { group: string | null; query: string }

/** A row that can be moved to and pressed. The group's header is drawn but is not one. */
type Row =
  | { kind: "group"; name: string }
  | { kind: "back" }
  | { kind: "option"; category: string; detail: string | null }
  | { kind: "suggested"; category: string }

const rowKey = (r: Row) => (r.kind === "group" ? `g:${r.name}` : r.kind === "back" ? "back" : `${r.kind}:${r.category}`)

/**
 * Where the list is, what is in it, which row the keys are on, and the slide
 * between levels. Shared by the dropdown and the sheet.
 */
function useCategoryBrowser({ suggested, onPick, kind = "digital" }: { suggested: string | null; onPick: (category: string) => void; kind?: CategoryKind }) {
  const GROUPS = categoryGroupsFor(kind)
  const [level, setLevel] = useState<Level>({ group: null, query: "" })
  const [active, setActive] = useState(-1)
  const stageRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const pending = useRef<{ dir: 1 | -1; ghost: HTMLElement } | null>(null)
  const levelRef = useRef(level)
  levelRef.current = level

  const query = level.query.trim()
  /* Names that match, led by the one the words point to ("tee" is T-Shirts): lib/products/category-suggest.ts. */
  const found = useMemo(() => (query ? searchCategoriesByWords(query, kind) : null), [query, kind])
  const levelKey = query ? "search" : level.group ?? ""

  const rows = useMemo<Row[]>(() => {
    let list: Row[]
    if (found) list = (found.length ? found : [kind === "physical" ? tt("Other Physical Product") : tt("Other")]).map((c) => ({ kind: "option", category: c, detail: groupOfCategory(c) }))
    else if (level.group) {
      const group = GROUPS.find((g) => g.name === level.group)
      list = [{ kind: "back" }, ...(group?.categories ?? []).map((c): Row => ({ kind: "option", category: c, detail: null }))]
    } else list = GROUPS.map((g) => ({ kind: "group", name: g.name }))
    return suggested ? [...list, { kind: "suggested", category: suggested }] : list
  }, [found, level.group, suggested, GROUPS, kind])

  /**
   * THE SLIDE. The level on screen is copied, the copy is laid over the list
   * where it was (scrolled where it was), the new level renders into the
   * list, and the two move: into a group the new one comes in from the right
   * over the old, which drifts left and fades; back, the old one leaves to
   * the right over the new, which comes in from the left. The copy is inert
   * and goes when the slide ends.
   */
  const prepareSlide = (dir: 1 | -1) => {
    const stage = stageRef.current
    const pane = paneRef.current
    pending.current?.ghost.remove()
    pending.current = null
    if (!stage || !pane || reducedMotion() || typeof pane.animate !== "function") return
    const ghost = pane.cloneNode(true) as HTMLElement
    for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>("*")]) {
      el.removeAttribute("id")
      for (const a of [...el.attributes]) if (a.name.startsWith("data-category")) el.removeAttribute(a.name)
    }
    ghost.setAttribute("aria-hidden", "true")
    ghost.setAttribute("inert", "")
    ghost.dataset.categoryGhost = ""
    Object.assign(ghost.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: dir === 1 ? "0" : "2" })
    stage.appendChild(ghost)
    ghost.scrollTop = pane.scrollTop
    pending.current = { dir, ghost }
  }

  /* A new level, or a new search, starts at its top. */
  useLayoutEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0
  }, [levelKey, query])

  useLayoutEffect(() => {
    const pane = paneRef.current
    const slide = pending.current
    pending.current = null
    if (!slide || !pane) return
    const { dir, ghost } = slide
    const timing: KeyframeAnimationOptions = { duration: SLIDE_MS, easing: SLIDE_EASE }
    const moves =
      dir === 1
        ? [
            pane.animate([{ transform: "translate3d(100%, 0, 0)" }, { transform: "translate3d(0, 0, 0)" }], timing),
            ghost.animate([{ transform: "translate3d(0, 0, 0)", opacity: 1 }, { transform: "translate3d(-24%, 0, 0)", opacity: 0 }], timing),
          ]
        : [
            pane.animate([{ transform: "translate3d(-24%, 0, 0)", opacity: 0 }, { transform: "translate3d(0, 0, 0)", opacity: 1 }], timing),
            ghost.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: "translate3d(100%, 0, 0)" }], timing),
          ]
    let gone = false
    const done = () => { if (!gone) { gone = true; ghost.remove() } }
    moves[1].onfinish = done
    moves[1].oncancel = done
    const t = window.setTimeout(done, SLIDE_MS + 300)
    return () => { window.clearTimeout(t); done() }
  }, [levelKey])

  /* With the keys, the highlight lands somewhere useful: the first category going in, the group left coming back. */
  const open = useCallback((group: string, viaKeys = false) => {
    prepareSlide(1)
    setLevel({ group, query: "" })
    setActive(viaKeys ? 1 : -1)
  }, [])
  const back = useCallback((viaKeys = false) => {
    const from = levelRef.current.group
    if (from && !levelRef.current.query.trim()) prepareSlide(-1)
    setLevel({ group: null, query: "" })
    setActive(viaKeys && from ? GROUPS.findIndex((g) => g.name === from) : -1)
  }, [])
  const setQuery = useCallback((q: string) => {
    setLevel((l) => ({ group: q.trim() ? null : l.group, query: q }))
    setActive(q.trim() ? 0 : -1)
  }, [])
  const reset = useCallback(() => { setLevel({ group: null, query: "" }); setActive(-1) }, [])

  const press = (row: Row, viaKeys = false) => {
    if (row.kind === "group") open(row.name, viaKeys)
    else if (row.kind === "back") back(viaKeys)
    else onPick(row.category)
  }

  /* The row the keys are on stays in view. */
  useEffect(() => {
    if (active < 0) return
    stageRef.current?.parentElement?.querySelector<HTMLElement>(`[data-row-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])

  /** The keys, read on the search field so focus never has to move. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    const n = rows.length
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!n) return
      setActive((i) => (e.key === "ArrowDown" ? (i + 1 >= n ? 0 : i + 1) : i <= 0 ? n - 1 : i - 1))
    } else if (e.key === "Enter") {
      const row = rows[active] ?? (found ? rows[0] : undefined)
      if (!row) return
      e.preventDefault()
      press(row, true)
    } else if (e.key === "ArrowRight" && !level.query && rows[active]?.kind === "group") {
      e.preventDefault()
      press(rows[active], true)
    } else if (e.key === "ArrowLeft" && !level.query && level.group) {
      e.preventDefault()
      back(true)
    }
  }

  return { level, rows, found, active, setActive, stageRef, paneRef, open, back, setQuery, reset, press, onKeyDown }
}

type Browser = ReturnType<typeof useCategoryBrowser>

export function SuggestedTag({ className }: { className?: string }) {
  return (
    <span
      data-suggested-tag=""
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[6px] border border-[#e3e5e8] bg-white px-1.5 text-[12px] font-medium leading-none text-[#4b5563]",
        className,
      )}
    >
      {tt("Suggested")}
    </span>
  )
}

/**
 * The list: the level on screen in a box of a fixed height, and under it the
 * suggested category, pinned. `phone` sets the size: 48px rows and 16px text
 * on a phone, 36px and 14px on a computer.
 */
function CategoryList({ browser, value, suggested, phone, listId }: { browser: Browser; value: string | null; suggested: string | null; phone: boolean; listId: string }) {
  const { level, rows, found, active, setActive, stageRef, paneRef, press } = browser
  const row = phone
    ? "flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[16px] leading-5"
    : "mx-1.5 flex min-h-[36px] items-center gap-2 rounded-lg px-2.5 text-left text-[14px] leading-5"
  const common = "cursor-pointer select-none text-[#1a1a2e] outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent]"
  const on = "bg-[#f1f2f4]"
  const current = groupOfCategory(value)

  const draw = (r: Row, i: number) => {
    const props = {
      key: rowKey(r),
      id: `${listId}-${i}`,
      role: "option" as const,
      "aria-selected": i === active,
      "data-row-index": i,
      "data-category-row": "",
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onMouseMove: phone ? undefined : () => { if (active !== i) setActive(i) },
      onClick: () => press(r),
    }
    const hot = i === active
    if (r.kind === "group") {
      return (
        <div {...props} data-category-group={r.name} className={cn(row, common, hot && on, phone && "active:bg-[#f1f2f4]")}>
          <span className="min-w-0 flex-1 truncate">{r.name}</span>
          {current === r.name ? <span className="max-w-[45%] shrink-0 truncate text-[13px] text-[#6b7280]">{value}</span> : null}
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
        </div>
      )
    }
    if (r.kind === "back") {
      return (
        <div {...props} data-category-back="" className={cn(row, common, "text-[#4b5563]", hot && on, phone && "active:bg-[#f1f2f4]")}>
          <ArrowLeft aria-hidden className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{tt("Back to All")}</span>
        </div>
      )
    }
    if (r.kind === "option") {
      const chosen = r.category === value
      return (
        <div {...props} data-category-option={r.category} aria-current={chosen ? "true" : undefined} className={cn(row, common, hot && on, chosen && "font-medium", phone && "active:bg-[#f1f2f4]")}>
          <span className="min-w-0 flex-1 truncate">{r.category}</span>
          {r.detail ? <span className="max-w-[45%] shrink-0 truncate text-[13px] font-normal text-[#9ca3af]">{r.detail}</span> : null}
          <Check aria-hidden className={cn("h-4 w-4 shrink-0 text-[#1a1a2e]", chosen ? "opacity-100" : "opacity-0")} strokeWidth={2.5} />
        </div>
      )
    }
    return null
  }

  const pinnedAt = rows.findIndex((r) => r.kind === "suggested")
  const body = rows.filter((r) => r.kind !== "suggested")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={paneRef}
          id={listId}
          role="listbox"
          aria-label={level.group ?? tt("Categories")}
          data-category-list=""
          className={cn("relative z-[1] h-full overflow-y-auto overscroll-contain bg-white", phone ? "pb-2" : "py-1.5")}
          style={{ touchAction: "pan-y" }}
        >
          {found && found.length === 0 ? (
            <p className={phone ? "px-4 pb-1 pt-3 text-[14px] text-[#6b7280]" : "px-4 pb-1 pt-1.5 text-[13px] text-[#6b7280]"}>{tt("No category matches “{value}”", { value: level.query.trim() })}</p>
          ) : null}
          {level.group && !found ? (
            <>
              {draw(body[0], 0)}
              <div
                data-category-header=""
                aria-hidden
                className={cn(
                  "flex items-center font-semibold text-[#1a1a2e]",
                  phone ? "mx-3 my-1 min-h-[40px] rounded-[10px] bg-[#f6f7f8] px-3 text-[16px]" : "mx-1.5 my-1 min-h-[36px] rounded-lg bg-[#f6f7f8] px-2.5 text-[14px]",
                )}
              >
                <span className="min-w-0 truncate">{level.group}</span>
              </div>
              {body.slice(1).map((r, i) => draw(r, i + 1))}
            </>
          ) : (
            body.map((r, i) => draw(r, i))
          )}
        </div>
      </div>
      {suggested && pinnedAt >= 0 ? (
        <div className={cn("shrink-0 border-t border-[#eef0f2] bg-white", phone ? "py-1" : "py-1.5")}>
          <div
            id={`${listId}-${pinnedAt}`}
            role="option"
            aria-selected={active === pinnedAt}
            data-row-index={pinnedAt}
            data-category-row=""
            data-category-suggested={suggested}
            aria-current={suggested === value ? "true" : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={phone ? undefined : () => { if (active !== pinnedAt) setActive(pinnedAt) }}
            onClick={() => press(rows[pinnedAt])}
            className={cn(row, common, active === pinnedAt && on, phone && "active:bg-[#f1f2f4]")}
          >
            <span className={cn("min-w-0 truncate", phone && "flex-1")}>{suggested}</span>
            {phone ? null : <span className="min-w-0 flex-1 truncate text-[13px] text-[#9ca3af]">{groupOfCategory(suggested)}</span>}
            <SuggestedTag />
            <Check aria-hidden className={cn("h-4 w-4 shrink-0 text-[#1a1a2e]", suggested === value ? "opacity-100" : "opacity-0")} strokeWidth={2.5} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * What is chosen, under the field: the category (and its group, where there
 * is room) on a light grey chip with a little depth, the tag when it is the
 * suggestion, and beside it an x drawn the same way, so the two read as a
 * pair: "a lighter gray with a little depth, like the X button beside it".
 */
const CHIP_DEPTH = "bg-[#f6f7f8] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06),inset_0_-1px_0_rgba(17,24,39,0.05),0_1px_1px_rgba(17,24,39,0.04)]"

function Chosen({ value, suggested, onClear }: { value: string; suggested: string | null; onClear: () => void }) {
  const group = groupOfCategory(value)
  return (
    <div data-category-chosen="" className="flex min-h-9 items-center gap-2 pt-2 text-[14px] leading-5">
      <span data-category-chip="" className={cn("inline-flex h-8 min-w-0 max-w-[calc(100%-44px)] items-center gap-1.5 rounded-lg px-2.5", CHIP_DEPTH)}>
        <span className="min-w-0 shrink truncate font-medium text-[#1a1a2e]">{value}</span>
        {/* The group, where there is room for it: on a phone the category alone reads whole. */}
        {group ? <span className="min-w-0 shrink-[2] truncate text-[#6b7280] max-sm:hidden">{tt("in {group}", { group })}</span> : null}
        {value === suggested ? <SuggestedTag /> : null}
      </span>
      <button
        type="button"
        data-category-clear=""
        aria-label={tt("Clear category {value}", { value })}
        onClick={onClear}
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 after:absolute after:-inset-1.5 after:content-[''] hover:bg-[#eef0f2] hover:text-[#1a1a2e] active:bg-[#e9eaed] focus-visible:ring-[3px] focus-visible:ring-[rgba(17,24,39,0.1)] [-webkit-tap-highlight-color:transparent]",
          CHIP_DEPTH,
        )}
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  )
}

/** The list's height when there is room, and the least it is ever drawn at. */
const LIST_H = 360
const LIST_MIN = 240
const GAP = 6

/**
 * Under the field when at least LIST_MIN fits there, as Shopify does, and
 * over it only when there is more room above. The room is the part of the
 * pane that scrolls the field (the editor's, under its bars), not the whole
 * window, so the list never slides under the app's header. Measured once
 * per open: the list keeps that height while it is open, whatever level.
 */
function placeList(anchor: HTMLElement): { side: "bottom" | "top"; h: number } {
  let pane: HTMLElement | null = anchor.parentElement
  while (pane && pane !== document.body) {
    const oy = getComputedStyle(pane).overflowY
    if ((oy === "auto" || oy === "scroll") && pane.scrollHeight > pane.clientHeight) break
    pane = pane.parentElement
  }
  const box = pane && pane !== document.body ? pane.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
  const top = Math.max(0, box.top)
  const bottom = Math.min(window.innerHeight, box.bottom)
  const r = anchor.getBoundingClientRect()
  const below = bottom - r.bottom - GAP - 12
  const above = r.top - top - GAP - 12
  const side = below >= LIST_MIN || below >= above ? "bottom" : "top"
  return { side, h: Math.max(160, Math.min(LIST_H, side === "bottom" ? below : above)) }
}

const FIELD =
  "h-11 w-full rounded-[10px] border border-[#d9dbe0] bg-white pl-9 pr-9 text-left text-[16px] text-[#1a1a2e] outline-none transition-colors duration-100 placeholder:text-[#9ca3af] hover:border-[#c4c7ce] focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px] [&::-webkit-search-cancel-button]:hidden [-webkit-tap-highlight-color:transparent]"

/*
  MEMO, SO THE EDITOR'S TYPING DOES NOT REACH IT. The picker sits inside a
  form that renders on every key pressed in the title or the description,
  and each of those used to draw the field, the sheet and its 37 group rows
  again for nothing. Its props are the value, the suggestion, the width and
  two callbacks the editor keeps stable, so it now renders only when one of
  those changes, or its own list does.
*/
export const CategoryPicker = React.memo(function CategoryPicker({
  value,
  onChange,
  onClear,
  suggested,
  isPhone,
  kind = "digital",
}: {
  /** Things that ship get their own list (Apparel, Home & Garden...), downloads theirs. */
  kind?: CategoryKind
  value: string | null
  onChange: (category: string) => void
  onClear: () => void
  /** The editor's suggestion from the title, the description and the pictures, pinned at the bottom. */
  suggested: string | null
  /** The editor's own reading of the width (under 640px), so the two agree. */
  isPhone: boolean
}) {
  const [open, setOpen] = useState(false)
  const listId = useId().replace(/:/g, "")
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)

  const pick = (category: string) => {
    if (isPhone) hapticTap("soft")
    onChange(category)
    setOpen(false)
    browser.reset()
  }
  const browser = useCategoryBrowser({ suggested, onPick: pick, kind })
  const [place, setPlace] = useState<{ side: "bottom" | "top"; h: number }>({ side: "bottom", h: LIST_H })
  const show = (next: boolean) => {
    if (next === open) return
    if (next && anchorRef.current) setPlace(placeList(anchorRef.current))
    setOpen(next)
    if (!next) browser.reset()
  }

  if (isPhone) {
    return (
      <div data-category-field="">
        <button type="button" data-category-trigger="" aria-haspopup="dialog" aria-expanded={open} onClick={() => show(true)} className={cn(FIELD, "relative flex items-center focus:border-[#d9dbe0] focus:ring-0 focus-visible:border-[#9ca3af] focus-visible:ring-[3px] focus-visible:ring-[rgba(17,24,39,0.06)]")}>
          <Search aria-hidden className="absolute left-3 h-4 w-4 text-[#6b7280]" />
          <span className="truncate text-[#9ca3af]">{tt("Search categories")}</span>
        </button>
        {value ? <Chosen value={value} suggested={suggested} onClear={onClear} /> : null}
        {/* Built while the editor is idle and kept between opens (BottomSheet keepMounted): its 37 groups and the search are already styled and laid out, so the tap only slides it up. */}
        <BottomSheet
          isOpen={open}
          onClose={() => show(false)}
          label={tt("Category")}
          aboveKeyboard
          keepMounted
          fill
          height="min(78dvh, 680px)"
          maxHeight="min(78dvh, 680px)"
          header={
            <div data-category-sheet="" className="px-4 pb-2 pt-2">
              <p className="pb-3 text-[17px] font-semibold leading-6 text-[#1a1a2e]">{tt("Category")}</p>
              <SheetSearch browser={browser} listId={listId} />
            </div>
          }
        >
          <CategoryList browser={browser} value={value} suggested={suggested} phone listId={listId} />
        </BottomSheet>
      </div>
    )
  }

  return (
    <div data-category-field="">
      <PopoverPrimitive.Root open={open} onOpenChange={show}>
        <PopoverPrimitive.Anchor asChild>
          <div ref={anchorRef} className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              data-category-search=""
              data-category-trigger=""
              aria-label={tt("Search categories")}
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={open && browser.active >= 0 ? `${listId}-${browser.active}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={tt("Search categories")}
              value={browser.level.query}
              onFocus={() => show(true)}
              onMouseDown={() => { if (!open) show(true) }}
              onChange={(e) => { browser.setQuery(e.target.value); show(true) }}
              onKeyDown={(e) => {
                if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
                  e.preventDefault()
                  show(true)
                  return
                }
                browser.onKeyDown(e)
              }}
              className={cn(FIELD, open && "border-[#9ca3af] ring-[3px] ring-[rgba(17,24,39,0.06)]")}
            />
            {browser.level.query ? (
              <button
                type="button"
                aria-label={tt("Clear search")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { browser.setQuery(""); inputRef.current?.focus() }}
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#6b7280] outline-none hover:text-[#1a1a2e]"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            data-category-dropdown=""
            side={place.side}
            align="start"
            sideOffset={GAP}
            avoidCollisions={false}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            /* The field is outside the list but part of it: pressing it must not close the list it opens. */
            onInteractOutside={(e) => { if (anchorRef.current?.contains(e.target as Node)) e.preventDefault() }}
            className="z-[150] flex w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-xl bg-white text-[#1a1a2e] shadow-[0_12px_32px_-12px_rgba(17,17,19,0.22),0_4px_10px_-4px_rgba(17,17,19,0.08),0_0_0_1px_rgba(17,17,19,0.07)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:data-[state=open]:slide-in-from-top-1 data-[side=top]:data-[state=open]:slide-in-from-bottom-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
            style={{ height: place.h }}
          >
            <CategoryList browser={browser} value={value} suggested={suggested} phone={false} listId={listId} />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {value && !open ? <Chosen value={value} suggested={suggested} onClear={() => { onClear(); inputRef.current?.focus({ preventScroll: true }) }} /> : null}
    </div>
  )
})

/** The sheet's search: the same field, 16px so iOS does not zoom, on the sheet's grey. */
function SheetSearch({ browser, listId }: { browser: Browser; listId: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const q = browser.level.query
  return (
    <label className="flex h-11 cursor-text items-center gap-2 rounded-[10px] bg-[#f1f2f4] px-3">
      <Search aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" />
      <input
        ref={ref}
        type="search"
        role="combobox"
        data-category-search=""
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={tt("Search categories")}
        aria-controls={listId}
        aria-expanded
        placeholder={tt("Search categories")}
        value={q}
        onChange={(e) => browser.setQuery(e.target.value)}
        onKeyDown={browser.onKeyDown}
        className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden"
      />
      {q ? (
        <button
          type="button"
          aria-label={tt("Clear search")}
          onClick={() => { browser.setQuery(""); ref.current?.focus() }}
          className="relative -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#6b7280] outline-none after:absolute after:-inset-2 after:content-[''] hover:text-[#1a1a2e]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </label>
  )
}
