"use client"

/**
 * ===========================================================================
 *  EMOJI, FOR THE DESCRIPTION
 * ===========================================================================
 * The toolbar's smile opens it: a popover under the button on a computer,
 * the shared sheet on a phone (components/ui/bottom-sheet). A search on top
 * (by the words in lib/rich-text/emoji.ts), what was picked lately, then the
 * groups, with a row of tabs that jumps to each. A pick goes in where the
 * caret was. On a computer the popover stays open, so a few can go in one
 * after another; on a phone the sheet goes down after one, back to the text.
 *
 * The emoji are the system's own characters, drawn by the device's font,
 * so they look the way they will on the page.
 */

import * as React from "react"
import { Search, Smile, X } from "lucide-react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { EMOJI_GROUPS, readRecentEmoji, rememberEmoji, searchEmoji } from "@/lib/rich-text/emoji"
import { cn } from "@/lib/utils"

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

function EmojiPanel({ phone, onPick }: { phone: boolean; onPick: (emoji: string) => void }) {
  const [query, setQuery] = React.useState("")
  const [recent, setRecent] = React.useState<string[]>([])
  const listRef = React.useRef<HTMLDivElement>(null)
  const [activeGroup, setActiveGroup] = React.useState(EMOJI_GROUPS[0].id)
  React.useEffect(() => setRecent(readRecentEmoji()), [])

  const found = query.trim() ? searchEmoji(query) : null
  const cols = phone ? "grid-cols-8" : "grid-cols-9"
  const cell = cn(
    "flex aspect-square w-full cursor-pointer select-none items-center justify-center rounded-lg leading-none outline-none transition-[background-color,scale] duration-100 hover:bg-[#f1f2f4] focus-visible:bg-[#f1f2f4] active:scale-90 [-webkit-tap-highlight-color:transparent]",
    phone ? "text-[26px]" : "text-[22px]",
  )

  const pick = (emoji: string) => {
    setRecent(rememberEmoji(emoji))
    onPick(emoji)
  }

  const grid = (list: string[]) => (
    <div className={cn("grid gap-0.5", cols)}>
      {list.map((e, i) => (
        <button key={`${e}-${i}`} type="button" aria-label={e} onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)} className={cell}>
          {e}
        </button>
      ))}
    </div>
  )

  /* The tab under the groups follows the scroll. */
  const onScroll = () => {
    const list = listRef.current
    if (!list || found) return
    const top = list.scrollTop + 8
    let current = EMOJI_GROUPS[0].id
    for (const section of list.querySelectorAll<HTMLElement>("[data-emoji-group]")) {
      if (section.offsetTop <= top) current = section.dataset.emojiGroup ?? current
    }
    setActiveGroup(current)
  }

  const jump = (id: string) => {
    setQuery("")
    requestAnimationFrame(() => {
      const list = listRef.current
      const section = list?.querySelector<HTMLElement>(`[data-emoji-group="${id}"]`)
      if (list && section) list.scrollTo({ top: section.offsetTop - 4, behavior: "smooth" })
      setActiveGroup(id)
    })
  }

  return (
    <div data-emoji-panel="" className={cn("flex min-h-0 flex-col", phone ? "h-full" : "h-[360px]")}>
      <div className={cn("shrink-0", phone ? "px-4 pb-2" : "p-2 pb-1.5")}>
        <label className={cn("flex cursor-text items-center gap-2 rounded-lg bg-[#f1f2f4] px-3", phone ? "h-11" : "h-9")}>
          <Search aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji"
            aria-label="Search emoji"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={!phone}
            className={cn("min-w-0 flex-1 bg-transparent text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden", phone ? "text-[16px]" : "text-[14px]")}
          />
          {query ? (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full text-[#6b7280] hover:text-[#1a1a2e]">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
      </div>

      <div ref={listRef} onScroll={onScroll} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", phone ? "px-3" : "px-1.5")}>
        {found ? (
          found.length ? (
            <div className="pb-2">{grid(found)}</div>
          ) : (
            <p className="px-2 py-6 text-center text-[13px] text-[#6b7280]">No emoji for “{query.trim()}”</p>
          )
        ) : (
          <>
            {recent.length ? (
              <section className="pb-1">
                <p className="px-1.5 pb-1 pt-1 text-[12px] font-medium text-[#6b7280]">Recently used</p>
                {grid(recent)}
              </section>
            ) : null}
            {EMOJI_GROUPS.map((group) => (
              <section key={group.id} data-emoji-group={group.id} className="pb-1">
                <p className="px-1.5 pb-1 pt-2 text-[12px] font-medium text-[#6b7280]">{group.name}</p>
                {grid(group.items.map(([e]) => e))}
              </section>
            ))}
          </>
        )}
      </div>

      <div className={cn("flex shrink-0 items-center justify-between border-t border-[#eef0f2]", phone ? "px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5" : "px-1.5 py-1")}>
        {EMOJI_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            aria-label={group.name}
            title={group.name}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => jump(group.id)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md leading-none transition-[background-color,filter,opacity] duration-150",
              phone ? "h-10 text-[20px]" : "h-8 text-[17px]",
              activeGroup === group.id && !found ? "bg-[#f1f2f4] opacity-100" : "opacity-55 grayscale hover:opacity-90 hover:grayscale-0",
            )}
          >
            {group.icon}
          </button>
        ))}
      </div>
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
}: {
  className: string
  onBeforeOpen: () => void
  onInsert: (emoji: string) => void
}) {
  const phone = usePhone()
  const [open, setOpen] = React.useState(false)

  const trigger = (
    <button
      type="button"
      aria-label="Emoji"
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
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} label="Emoji" height="min(62dvh, 520px)" maxHeight="min(62dvh, 520px)">
          <EmojiPanel
            phone
            onPick={(e) => {
              setOpen(false)
              onInsert(e)
            }}
          />
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
          collisionPadding={12}
          data-emoji-popover=""
          /* Picking puts the caret back in the text; that is not a reason to close. */
          onFocusOutside={(e) => e.preventDefault()}
          className="z-[2147483640] w-[344px] overflow-hidden rounded-xl border border-[#e3e4e8] bg-white text-[#1a1a2e] shadow-[0_16px_40px_-12px_rgba(17,24,39,0.28),0_2px_6px_rgba(17,24,39,0.06)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150"
        >
          <EmojiPanel phone={false} onPick={onInsert} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
