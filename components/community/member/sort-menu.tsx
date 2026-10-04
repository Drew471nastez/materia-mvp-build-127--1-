"use client"

/**
 * ===========================================================================
 *  THE FEED'S SORT: AN ICON AT THE END OF THE CHIPS ROW, AND A SMALL MENU
 * ===========================================================================
 * Round 7 (images/49.png): no Latest / Popular pills under the composer. A
 * round sliders button at the right end of the chips row, left of Saved,
 * opens four choices: Default (pinned first, then the posts with the newest
 * activity), New (newest posts), Top (most liked) and Unread (posts with
 * activity since the member was last active here). The choice in force is
 * marked in the menu (a soft fill, its icon in ink and a check), not as a
 * pill on the page; the button carries a small dot while it is anything but
 * Default, so a filtered feed never passes for the whole one.
 *
 * A menu in the full sense: arrows move between the rows, Enter or a click
 * chooses, Escape or a click anywhere else closes it and gives the focus
 * back to the button. It opens below the button, its right edge on the
 * button's, by opacity, `scale` and `translate` from `starting:` values
 * (still under reduced motion).
 */
import { useEffect, useId, useRef, useState } from "react"
import { Check } from "lucide-react"
import { EyeIcon } from "@solar-icons/react/linear/eye"
import { HistoryIcon } from "@solar-icons/react/linear/history"
import { SortFromBottomToTopIcon } from "@solar-icons/react/linear/sort-from-bottom-to-top"
import { StarsIcon } from "@solar-icons/react/linear/stars"
import { Tuning2Icon } from "@solar-icons/react/linear/tuning-2"
import { cn } from "@/lib/utils"
import { SORTS, type FeedSortValue } from "./feed-cache"
import { DEPTH, DEPTH_PRESS } from "./ui"

type SolarIcon = React.ComponentType<{ size?: number; className?: string }>

export const SORT_LABEL: Record<FeedSortValue, string> = { default: "Default", new: "New", top: "Top", unread: "Unread" }
const SORT_HINT: Record<FeedSortValue, string> = {
  default: "Pinned, then latest activity",
  new: "Newest posts first",
  top: "Most liked first",
  unread: "New since your last visit",
}
const SORT_ICON: Record<FeedSortValue, SolarIcon> = { default: HistoryIcon, new: StarsIcon, top: SortFromBottomToTopIcon, unread: EyeIcon }

const PANEL =
  "absolute right-0 top-full z-30 mt-2 w-[264px] max-w-[calc(100vw-32px)] origin-top-right rounded-xl bg-white p-1 text-left outline-none shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_4px_-1px_rgba(15,23,42,0.06),0_16px_36px_-10px_rgba(15,23,42,0.2)] transition-[opacity,scale,translate] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] starting:opacity-0 starting:scale-[0.97] starting:-translate-y-1 motion-reduce:transition-none"

export function SortMenu({ value, onChange }: { value: FeedSortValue; onChange: (next: FeedSortValue) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      buttonRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", onKey)
    /* The chosen row takes the focus, so arrows start from it. */
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return
    const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    if (!rows.length) return
    e.preventDefault()
    const i = rows.indexOf(document.activeElement as HTMLElement)
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : e.key === "ArrowDown" ? (i + 1) % rows.length : i <= 0 ? rows.length - 1 : i - 1
    rows[next]?.focus()
  }

  const choose = (s: FeedSortValue) => {
    setOpen(false)
    buttonRef.current?.focus({ preventScroll: true })
    if (s !== value) onChange(s)
  }

  return (
    <div ref={wrapRef} className="relative shrink-0" data-feed-sort="">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Sort posts: ${SORT_LABEL[value]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        data-feed-sort-button={value}
        className={cn(
          "relative inline-flex h-10 w-10 cursor-pointer select-none items-center justify-center rounded-full text-[#4b5563] outline-none transition-[background-color,color,box-shadow] duration-150 hover:bg-[#f6f7f8] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-9 sm:w-9 [-webkit-tap-highlight-color:transparent]",
          DEPTH,
          DEPTH_PRESS,
          open && "bg-[#f1f2f4] text-[#1a1a2e] shadow-none",
        )}
      >
        <Tuning2Icon size={18} />
        {value !== "default" ? <span aria-hidden className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full bg-[#1a1a2e] ring-2 ring-white sm:right-[6px] sm:top-[6px]" data-feed-sort-dot="" /> : null}
      </button>
      {open ? (
        <div ref={menuRef} id={id} role="menu" aria-label="Sort posts" tabIndex={-1} onKeyDown={onMenuKey} className={PANEL} data-feed-sort-menu="">
          {SORTS.map((s) => {
            const Icon = SORT_ICON[s]
            const on = s === value
            return (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => choose(s)}
                data-feed-sort-item={s}
                className={cn(
                  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors duration-100 focus-visible:bg-[#f1f2f4]",
                  on ? "bg-[#f3f4f6]" : "hover:bg-[#f6f7f8]",
                )}
              >
                <span className={cn("inline-flex shrink-0", on ? "text-[#1a1a2e]" : "text-[#8a909b]")}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[14px] leading-5", on ? "font-semibold text-[#1a1a2e]" : "font-medium text-[#3f4652]")}>{SORT_LABEL[s]}</span>
                  <span className="block truncate text-[12px] leading-4 text-[#8a8f98]">{SORT_HINT[s]}</span>
                </span>
                {on ? <Check aria-hidden className="h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.2} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
