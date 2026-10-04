/**
 * THE SPACES, AS CHIPS AT THE TOP OF THE COMMUNITY FEED: All, then each
 * space the member may see, in the creator's order. A chip is a link (the
 * feed of that space, or its chat), so it works without JavaScript and the
 * back button does what it should. The chosen one is filled in ink; a chat
 * space with unread messages carries a dot. At the right end of the row the
 * sort button (round 7, sort-menu.tsx, the feed's only) and Saved, always
 * in view.
 *
 * IN PLACE ON THE FEED (round 7). Given `onPick`, a plain click on All, a
 * feed space or Saved does not load a page: the feed (feed.tsx) swaps its
 * list where it stands, from its cache when it has the space, and moves the
 * address itself. `onIntent` is told when a pointer rests on a chip or a
 * finger lands on one, so the list can be asked for before the click. A
 * chat space is always a page of its own, and every chip is still a real
 * link for a new tab or a reload.
 *
 * "EXTREMELY LITTLE" DEPTH: a chip is white on a hairline with a one pixel
 * soft shadow, the chosen one ink with a slightly deeper one (ui.ts DEPTH).
 *
 * ONE ROW at every width: the chips scroll sideways when they do not fit
 * (a thumb, a trackpad, or Tab, which scrolls the focused chip into view),
 * and their last 24px fade out, over padding when everything fits, so the
 * fade only ever shows when there is more. No hooks, so the server pages
 * draw it.
 */
import Link from "next/link"
import { BookmarkIcon } from "@solar-icons/react/linear/bookmark"
import { DEPTH, DEPTH_INK, DEPTH_PRESS } from "./ui"
import type { SpaceView } from "./view-types"

const CHIP =
  "relative inline-flex h-10 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-medium outline-none transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-9 sm:text-[13.5px] [-webkit-tap-highlight-color:transparent]"
const CHIP_ON = `${DEPTH_INK} text-white`
const CHIP_OFF = `${DEPTH} ${DEPTH_PRESS} text-[#4b5563] hover:border-[#d5d8de] hover:text-[#1a1a2e]`

/** What a chip opens, for a feed that switches in place: All, one feed space, or Saved. */
export type ChipPick = { kind: "all" } | { kind: "space"; slug: string } | { kind: "saved" }

/** An emoji the creator chose for a space goes in front of its name; the line icon names do not. */
function emojiOf(icon: string | null): string | null {
  const v = (icon || "").trim()
  return v && !/^[a-z0-9-]+$/i.test(v) ? Array.from(v).slice(0, 2).join("") : null
}

/** A click that should stay in place: the main button, no key held (those open a new tab or window). */
function inPlace(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

export interface SpaceChipsProps {
  slug: string
  spaces: SpaceView[]
  active: string | null
  savedOn?: boolean
  /** The feed switches in place: a plain click on All, a feed space or Saved comes here instead of loading a page. */
  onPick?: (pick: ChipPick) => void
  /** A pointer resting on a chip, a finger landing on one or the keyboard reaching it: read ahead. */
  onIntent?: (pick: ChipPick) => void
  /** The sort button, drawn left of Saved (the feed only). */
  sort?: React.ReactNode
}

export function SpaceChips({ slug, spaces, active, savedOn = false, onPick, onIntent, sort }: SpaceChipsProps) {
  const base = `/community/${slug}`
  const allOn = active === null && !savedOn
  /* The props a chip that can switch in place carries; a page link otherwise. */
  const switching = (pick: ChipPick) =>
    onPick
      ? {
          prefetch: false,
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (!inPlace(e)) return
            e.preventDefault()
            onPick(pick)
          },
          onPointerEnter: onIntent ? (e: React.PointerEvent) => e.pointerType === "mouse" && onIntent(pick) : undefined,
          onPointerDown: onIntent ? () => onIntent(pick) : undefined,
          onFocus: onIntent ? () => onIntent(pick) : undefined,
        }
      : {}
  return (
    <nav aria-label="Spaces" data-space-chips="" className="-mx-4 mb-3 flex items-center gap-2 pr-4 sm:mx-0 sm:pr-0">
      <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain scrollbar-hide [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]" data-space-chips-track="">
        {/* 2px above and below, so a chip's one pixel shadow is not cut by the scrolling track. */}
        <div className="flex w-max items-center gap-2 py-0.5 pl-4 pr-6 sm:pl-0">
          <Link href={base} aria-current={allOn ? "page" : undefined} data-space-chip="all" className={`${CHIP} ${allOn ? CHIP_ON : CHIP_OFF}`} {...switching({ kind: "all" })}>
            All
          </Link>
          {spaces.map((s) => {
            const on = active === s.slug
            const emoji = emojiOf(s.icon)
            return (
              <Link
                key={s.id}
                href={`${base}/space/${s.slug}`}
                aria-current={on ? "page" : undefined}
                data-space-chip={s.slug}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                {...(s.kind === "chat" ? {} : switching({ kind: "space", slug: s.slug }))}
              >
                {emoji ? <span aria-hidden className="text-[14px] leading-none">{emoji}</span> : null}
                <span className="max-w-[180px] truncate">{s.name}</span>
                {s.unread > 0 && !on ? <span aria-label={`${s.unread} unread`} className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e]" /> : null}
              </Link>
            )
          })}
        </div>
      </div>
      {sort}
      {/*
        Under 400px (round 8, a 375 or 390 phone) Saved is its bookmark alone in a 40px circle, its word kept for a screen reader: the
        sort button and the word took half the row, and the spaces scrolled in what was left.
      */}
      <Link href={`${base}/saved`} aria-current={savedOn ? "page" : undefined} data-space-chip="saved" className={`${CHIP} ${savedOn ? CHIP_ON : CHIP_OFF} max-[399px]:w-10 max-[399px]:justify-center max-[399px]:px-0`} {...switching({ kind: "saved" })}>
        <BookmarkIcon size={16} className="shrink-0" />
        <span className="max-[399px]:sr-only">Saved</span>
      </Link>
    </nav>
  )
}
