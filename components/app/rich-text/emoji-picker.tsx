"use client"

/**
 * ===========================================================================
 *  EMOJI, FOR THE DESCRIPTION
 * ===========================================================================
 * The toolbar's smile opens it: a popover under the button on a computer
 * (over it when there is more room there, never taller than the room it has:
 * components/ui/popover-fit.ts), the shared sheet on a phone
 * (components/ui/bottom-sheet). A search on top
 * (by the words in lib/rich-text/emoji.ts), what was picked lately, then the
 * groups, with a row of tabs that jumps to each. A pick goes in where the
 * caret was. On a computer the popover stays open, so a few can go in one
 * after another; on a phone the sheet goes down after one, back to the text.
 *
 * The emoji are the system's own characters, drawn by the device's font,
 * so they look the way they will on the page.
 *
 * LIGHT, SO THE SHEET MOVES LIKE THE BUILDER'S. A colour emoji is one of the
 * dearest things a phone draws, and the whole set is about five hundred of
 * them. So:
 *   - the phone's sheet is built once while the page is idle and kept
 *     (BottomSheet keepMounted, as the website builder's sheets are): the
 *     tap that opens it only slides it up;
 *   - a group's buttons are made only when the list scrolls near it (or a
 *     tab jumps to it), in order, so nothing above what is shown ever
 *     changes height; the first two are there from the start, and the rest
 *     are made one by one while the page is idle after it opens;
 *   - each group is `content-visibility: auto`, so the ones off screen are
 *     neither laid out nor drawn;
 *   - the grids are memoised and one listener on the list takes every pick,
 *     so the tab that follows the scroll, the search and the sheet's drag
 *     never render a grid again;
 *   - hover and a pressed shrink are for a mouse only, so a swipe through
 *     the grid lights nothing up.
 *
 * ROUND 29 (the owner: "while scrolling, some categories show no emoji at
 * all until I press their tab"). The next group was made only when ONE
 * marker after the last group came within 480px of the list's foot, and
 * every group not made yet still kept its full height as a blank block, so
 * the marker stayed far below until the very end of the list: whole groups
 * scrolled past empty. Now each group not made yet is watched itself (one
 * observer on the list, a screen of margin above and below), and the one
 * that comes near is made with every group above it; the rest fill in while
 * the page is idle. A group waiting is an empty grid of the same cells, so
 * making it changes no height at all, and nothing moves under the finger.
 */

import * as React from "react"
import { Search, Smile, X } from "lucide-react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { FIT_POPOVER, fitBox } from "@/components/ui/popover-fit"
import { EMOJI_GROUPS, readRecentEmoji, rememberEmoji, searchEmoji } from "@/lib/rich-text/emoji"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

function usePhone(query = "(max-width: 639px)") {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia(query)
    const read = () => setPhone(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [query])
  return phone
}

/** Groups there from the start, before any scroll. */
const EAGER_GROUPS = 2
/** How far beyond the list's edges a group not made yet is made: about a screen of the list. */
const BUILD_MARGIN = "100% 0px 100% 0px"

const GROUP_ITEMS = EMOJI_GROUPS.map((g) => g.items.map(([e]) => e))

/** One grid of emoji. Picks are taken by the list's one listener (data-emoji). */
const EmojiGrid = React.memo(function EmojiGrid({ list, phone }: { list: string[]; phone: boolean }) {
  const cell = cn(
    /* `hover:` is a mouse's only in this app (app/globals.css), and a plain colour class follows the dark look. */
    "flex aspect-square w-full cursor-pointer select-none items-center justify-center rounded-lg leading-none outline-none transition-[background-color,scale] duration-100 focus-visible:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
    "hover:bg-[#f1f2f4] pointer-fine:active:scale-90",
    phone ? "text-[26px]" : "text-[22px]",
  )
  return (
    <div className={cn("grid gap-0.5", phone ? "grid-cols-8" : "grid-cols-9")} data-emoji-grid="">
      {list.map((e, i) => (
        <button key={`${e}-${i}`} type="button" aria-label={e} data-emoji={e} className={cell}>
          {e}
        </button>
      ))}
    </div>
  )
})

/** A group not made yet: the same grid of the same cells, empty, so making it changes no height. */
const EmptyGrid = React.memo(function EmptyGrid({ count, phone }: { count: number; phone: boolean }) {
  return (
    <div aria-hidden className={cn("grid gap-0.5", phone ? "grid-cols-8" : "grid-cols-9")} data-emoji-waiting="">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="aspect-square w-full" />
      ))}
    </div>
  )
})

const GroupSection = React.memo(function GroupSection({ index, phone, built }: { index: number; phone: boolean; built: boolean }) {
  const group = EMOJI_GROUPS[index]
  const list = GROUP_ITEMS[index]
  const rows = Math.ceil(list.length / (phone ? 8 : 9))
  return (
    <section
      data-emoji-group={group.id}
      data-emoji-index={index}
      data-emoji-built={built ? "true" : "false"}
      className="pb-1"
      /* Off screen, a group is neither laid out nor drawn; its height is
         kept at a guess of its rows until it is first measured. */
      style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${rows * (phone ? 42 : 36) + 30}px` }}
    >
      <p className="px-1.5 pb-1 pt-2 text-[12px] font-medium text-[#6b7280]">{group.name}</p>
      {built ? <EmojiGrid list={list} phone={phone} /> : <EmptyGrid count={list.length} phone={phone} />}
    </section>
  )
})

const GroupTabs = React.memo(function GroupTabs({ phone, active, onJump }: { phone: boolean; active: string | null; onJump: (id: string) => void }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-between border-t border-[#eef0f2]", phone ? "px-3 pb-2 pt-1.5" : "px-1.5 py-1")}>
      {EMOJI_GROUPS.map((group) => (
        <button
          key={group.id}
          type="button"
          aria-label={group.name}
          title={group.name}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onJump(group.id)}
          className={cn(
            "flex flex-1 items-center justify-center rounded-md leading-none transition-[background-color,filter,opacity] duration-150 [-webkit-tap-highlight-color:transparent]",
            phone ? "h-10 text-[20px]" : "h-8 text-[17px]",
            active === group.id ? "bg-[#f1f2f4] opacity-100" : "opacity-55 grayscale hover:opacity-90 hover:grayscale-0",
          )}
        >
          {group.icon}
        </button>
      ))}
    </div>
  )
})

/** The search, the recent ones and the groups; exported (round 31) for the community's space icon picker. */
export function EmojiPanel({ phone, active = true, onPick }: { phone: boolean; active?: boolean; onPick: (emoji: string) => void }) {
  const [query, setQuery] = React.useState("")
  const [recent, setRecent] = React.useState<string[]>([])
  const listRef = React.useRef<HTMLDivElement>(null)
  const [activeGroup, setActiveGroup] = React.useState(EMOJI_GROUPS[0].id)
  /* How many groups have their buttons, counted from the top. */
  const [built, setBuilt] = React.useState(EAGER_GROUPS)
  React.useEffect(() => setRecent(readRecentEmoji()), [])

  /* A kept sheet starts the next open clean: no search left over. Done
     while it is out of sight, so nothing changes on screen. */
  React.useEffect(() => {
    if (!active) setQuery("")
  }, [active])

  const found = query.trim() ? searchEmoji(query) : null

  /* A group not made yet that comes within a screen of the list is made, with every group above it (ROUND 29). */
  React.useEffect(() => {
    const list = listRef.current
    if (!list || built >= EMOJI_GROUPS.length || found) return
    if (typeof IntersectionObserver === "undefined") {
      setBuilt(EMOJI_GROUPS.length)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        let want = 0
        for (const e of entries) if (e.isIntersecting) want = Math.max(want, Number((e.target as HTMLElement).dataset.emojiIndex) + 1)
        if (want) setBuilt((n) => Math.max(n, Math.min(EMOJI_GROUPS.length, want)))
      },
      { root: list, rootMargin: BUILD_MARGIN },
    )
    for (const section of list.querySelectorAll<HTMLElement>('[data-emoji-group][data-emoji-built="false"]')) io.observe(section)
    return () => io.disconnect()
  }, [built, found])

  /* And the rest one by one while the page is idle, once the panel is in use, so a fast fling finds them made. */
  React.useEffect(() => {
    if (!active || built >= EMOJI_GROUPS.length || found) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const next = () => setBuilt((n) => Math.min(EMOJI_GROUPS.length, n + 1))
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(next, { timeout: 600 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(next, 120)
    return () => window.clearTimeout(t)
  }, [active, built, found])

  const onPickRef = React.useRef(onPick)
  React.useEffect(() => {
    onPickRef.current = onPick
  })
  const onListClick = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-emoji]")
    const emoji = b?.dataset.emoji
    if (!emoji) return
    setRecent(rememberEmoji(emoji))
    onPickRef.current(emoji)
  }, [])

  /* The tab under the groups follows the scroll: once a frame at most, and
     a render only when the group changes. */
  const scrollFrame = React.useRef(0)
  const onScroll = () => {
    if (scrollFrame.current || found) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0
      const list = listRef.current
      if (!list) return
      const top = list.scrollTop + 8
      let current = EMOJI_GROUPS[0].id
      for (const section of list.querySelectorAll<HTMLElement>("[data-emoji-group]")) {
        if (section.offsetTop <= top) current = section.dataset.emojiGroup ?? current
      }
      setActiveGroup((prev) => (prev === current ? prev : current))
    })
  }
  React.useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [])

  const jump = React.useCallback((id: string) => {
    const index = EMOJI_GROUPS.findIndex((g) => g.id === id)
    setQuery("")
    /* Everything above it is made first, so where it is does not move under the scroll. */
    setBuilt((n) => Math.max(n, index + 1))
    setActiveGroup(id)
    requestAnimationFrame(() => {
      const list = listRef.current
      const section = list?.querySelector<HTMLElement>(`[data-emoji-group="${id}"]`)
      if (list && section) list.scrollTo({ top: section.offsetTop - 4, behavior: "smooth" })
    })
  }, [])

  return (
    <div data-emoji-panel="" className="flex h-full min-h-0 flex-col">
      <div className={cn("shrink-0", phone ? "px-4 pb-2" : "p-2 pb-1.5")}>
        <label className={cn("flex cursor-text items-center gap-2 rounded-lg bg-[#f1f2f4] px-3", phone ? "h-11" : "h-9")}>
          <Search aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tt("Search emoji")}
            aria-label={tt("Search emoji")}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!phone}
            className={cn("min-w-0 flex-1 bg-transparent text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden", phone ? "text-[16px]" : "text-[14px]")}
          />
          {query ? (
            <button type="button" aria-label={tt("Clear search")} onClick={() => setQuery("")} className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full text-[#6b7280] hover:text-[#1a1a2e]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        onClick={onListClick}
        /* A pick leaves the caret where it was in the text. */
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-emoji]")) e.preventDefault()
        }}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain [touch-action:pan-y]", phone ? "px-3" : "px-1.5")}
      >
        {found ? (
          found.length ? (
            <div className="pb-2"><EmojiGrid list={found} phone={phone} /></div>
          ) : (
            <p className="px-2 py-6 text-center text-[13px] text-[#6b7280]">{tt("No emoji for “{value}”", { value: query.trim() })}</p>
          )
        ) : (
          <>
            {recent.length ? (
              <section className="pb-1">
                <p className="px-1.5 pb-1 pt-1 text-[12px] font-medium text-[#6b7280]">{tt("Recently used")}</p>
                <EmojiGrid list={recent} phone={phone} />
              </section>
            ) : null}
            {EMOJI_GROUPS.map((group, i) => (
              <GroupSection key={group.id} index={i} phone={phone} built={i < built} />
            ))}
          </>
        )}
      </div>

      <GroupTabs phone={phone} active={found ? null : activeGroup} onJump={jump} />
    </div>
  )
}

/**
 * The toolbar's Emoji control and what it opens. `onBeforeOpen` keeps the
 * caret; `onInsert` puts an emoji where it was.
 */
export function EmojiControl({
  className,
  onBeforeOpen,
  onInsert,
  size = { w: 344, h: 360 },
}: {
  className: string
  onBeforeOpen: () => void
  onInsert: (emoji: string) => void
  /** The popover's width and its tallest; it is never taller than the room it has (components/ui/popover-fit.ts). */
  size?: { w: number; h: number }
}) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)
  const close = React.useCallback(() => setOpen(false), [])
  const onInsertRef = React.useRef(onInsert)
  React.useEffect(() => {
    onInsertRef.current = onInsert
  })
  /* The same function every render, so the kept sheet's panel is not rendered again for nothing. */
  const pickAndClose = React.useCallback((e: string) => {
    setOpen(false)
    onInsertRef.current(e)
  }, [])
  const pick = React.useCallback((e: string) => onInsertRef.current(e), [])

  const trigger = (
    <button
      type="button"
      aria-label={tt("Emoji")}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-emoji-trigger=""
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!open) onBeforeOpen()
        setOpen(!open)
      }}
      className={cn(className, open && "bg-[#e6e8eb] text-[#1a1a2e]")}
    >
      <Smile aria-hidden className="h-[18px] w-[18px] sm:h-4 sm:w-4" strokeWidth={2} />
    </button>
  )

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet
          isOpen={open}
          onClose={close}
          label={tt("Emoji")}
          height="min(62dvh, 520px)"
          maxHeight="min(62dvh, 520px)"
          fill
          aboveKeyboard
          keepMounted
        >
          <EmojiPanel phone active={open} onPick={pickAndClose} />
        </BottomSheet>
      </>
    )
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>{trigger}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          {...FIT_POPOVER}
          style={fitBox(size.w, size.h)}
          data-emoji-popover=""
          /* Picking puts the caret back in the text; that is not a reason to close. */
          onFocusOutside={(e) => e.preventDefault()}
          className="z-[2147483640] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white text-[#1a1a2e] shadow-[0_16px_40px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
        >
          <EmojiPanel phone={false} onPick={pick} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
