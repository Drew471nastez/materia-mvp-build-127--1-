/**
 * THE SPACES, AS CHIPS AT THE TOP OF THE COMMUNITY FEED: All, then each
 * space the member may see, in the creator's order. A chip is a link (the
 * feed of that space, or its chat), so it works without JavaScript and the
 * back button does what it should. The chosen one is filled in ink; a chat
 * space with unread messages carries a dot. At the right end of the row the
 * sort button (round 7, sort-menu.tsx, the feed's only), always in view.
 * Round 9: no Saved chip beside it; Saved posts is a row in that menu and
 * in the bar's "..." menu.
 *
 * IN PLACE ON THE FEED (round 7). Given `onPick`, a plain click on All or a
 * feed space does not load a page: the feed (feed.tsx) swaps its list where
 * it stands, from its cache when it has the space, and moves the address
 * itself. `onIntent` is told when a pointer rests on a chip or a
 * finger lands on one, so the list can be asked for before the click. A
 * chat space is always a page of its own, and every chip is still a real
 * link for a new tab or a reload.
 *
 * "EXTREMELY LITTLE" DEPTH, A TOUCH MORE (round 11): a chip is white on a
 * hairline with a soft two pixel shadow under it, the chosen one ink with a
 * deeper one and the faintest light along its top edge. A press sinks it
 * (a grey ground and the shadow drawn inside) on the frame the finger lands,
 * and lets go over 180ms; nothing scales, so nothing bumps. Every chip is
 * touch-action: manipulation, so iOS never holds a quick second tap back to
 * see whether it is a double tap to zoom (one of the taps the owner found
 * lost), and the colours ease between chosen and not (no hover:border class
 * here: app/globals.css drops transitions from those on touch screens).
 *
 * ONE ROW at every width: the chips scroll sideways when they do not fit
 * (a thumb, a trackpad, or Tab, which scrolls the focused chip into view),
 * and their last 24px fade out, over padding when everything fits, so the
 * fade only ever shows when there is more. No hooks, so the server pages
 * draw it.
 *
 * EVERY CHIP CARRIES ITS SPACE'S ICON (round 12): the emoji the admin set,
 * or its kind's when the space still has the word name every community
 * starts with (space-glyph.ts), so a chip shows what the dashboard shows.
 */
import Link from "next/link"
import { feedListHref } from "@/lib/community/feed-space-address"
import { spaceGlyph } from "./space-glyph"
import { press, PRESS_PROPS } from "./ui"
import type { SpaceView } from "./view-types"

/*
  THE FILL EASES IN WHERE IT IS (round 16, the owner: "the pill fill is too direct, make it fill smooth and clean, like the
  Settings tabs"). The ink of the chosen chip is its own layer (FILL), the size of the chip's outer edge, faded by opacity over
  the same 150ms and curve as Settings' tabs (settings-form-new.tsx TAB_FADE_MS, TAB_EASE). Opacity is the compositor's: it
  keeps easing while the list under the chips is drawn (feed.tsx THE CHIP FIRST), where a background colour change waits for
  the main thread and lands in one late frame. The words turn white over the same time, so the chip changes as one piece. The
  chip itself stays white on its hairline; a pointer resting on another chip tints it a soft grey, and a press sinks it.
*/
const EASE = "ease-[cubic-bezier(0.33,1,0.68,1)]"
const CHIP =
  `relative isolate inline-flex h-10 shrink-0 touch-manipulation select-none items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e1e4e8] bg-white px-3.5 text-[14px] font-medium outline-none transition-[color,background-color,box-shadow] duration-150 ${EASE} focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none sm:h-9 sm:text-[13.5px] [-webkit-tap-highlight-color:transparent] active:duration-[70ms] data-[pressed]:duration-[70ms]`
/* The chosen chip: white words over the fill, no shadow of its own (the fill carries it). */
const CHIP_ON = "text-white shadow-none"
/* Pressed, a chip sinks on the first frame (no easing in), so the finger sees it took (round 10), and eases back when it lifts. */
const CHIP_OFF =
  "text-[#4b5563] shadow-[0_1px_2px_rgba(16,24,40,0.07),0_1px_1px_rgba(16,24,40,0.03)] [@media(hover:hover)]:hover:bg-[#f3f4f6] [@media(hover:hover)]:hover:text-[#1a1a2e] active:bg-[#eceef1] active:shadow-[inset_0_1px_2px_rgba(16,24,40,0.1)] data-[pressed]:bg-[#eceef1] data-[pressed]:text-[#1a1a2e] data-[pressed]:shadow-[inset_0_1px_2px_rgba(16,24,40,0.1)]"
/* The ink, over the hairline (-inset-px) and under the words (-z-10 in the chip's own stacking context). */
const FILL = `pointer-events-none absolute -inset-px -z-10 rounded-full bg-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.2),0_2px_5px_-2px_rgba(16,24,40,0.22),inset_0_1px_0_rgba(255,255,255,0.09)] transition-opacity duration-150 ${EASE} motion-reduce:transition-none`

/** The chosen chip's ink, faded in and out where it is. */
function Fill({ on }: { on: boolean }) {
  return <span aria-hidden data-chip-fill="" className={`${FILL} ${on ? "opacity-100" : "opacity-0"}`} />
}

/** What a chip (or the sort menu's Saved posts) opens, for a feed that switches in place: All, one feed space, or Saved. */
export type ChipPick = { kind: "all" } | { kind: "space"; slug: string } | { kind: "saved" }

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
  /** The sort button, at the row's right end (the feed only). */
  sort?: React.ReactNode
}

/*
  THE CHIPS LAST DRAWN IN THIS TAB, per community, so a space that is a page
  of its own (a chat space, or a link from elsewhere) keeps the same row on
  screen while its page is on its way (space-chips-held.tsx, its
  loading.tsx): the row does not vanish and come back (round 9). Kept in the
  browser only; a server draws chips for many people, so it keeps nothing.
*/
const drawn = new Map<string, SpaceView[]>()

/**
 * THE CHOSEN CHIP INTO VIEW, by gliding its row only (never the page), and
 * only while the row is still: a row a finger has just thrown is left to
 * finish its glide (round 10: no fight with a fling). Already in view, it
 * does nothing.
 */
export function followChosenChip(root: HTMLElement | null) {
  const track = root?.querySelector<HTMLElement>("[data-space-chips-track]")
  const on = track?.querySelector<HTMLElement>("[aria-current=page]")
  if (!track || !on) return
  const now = performance.now()
  const last = Number(track.dataset.scrolledAt || 0)
  if (now - last < 140) {
    window.setTimeout(followChosenChip, 140, root)
    return
  }
  const left = on.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft
  let to: number | null = null
  if (left < track.scrollLeft) to = Math.max(0, left - 16)
  else if (left + on.offsetWidth > track.scrollLeft + track.clientWidth - 24) to = left + on.offsetWidth - track.clientWidth + 40
  if (to === null) return
  if (typeof track.scrollTo === "function" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) track.scrollTo({ left: to, behavior: "smooth" })
  else track.scrollLeft = to
}

/** The spaces of a community as its chips were last drawn here, if they were. */
export function rememberedSpaces(slug: string): SpaceView[] | null {
  return drawn.get(slug) ?? null
}

export function SpaceChips({ slug, spaces, active, savedOn = false, onPick, onIntent, sort }: SpaceChipsProps) {
  if (typeof window !== "undefined") drawn.set(slug, spaces)
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
          /* Pressed on the first frame (ui.ts PRESS_PROPS), and the list asked for at the same moment. */
          ...PRESS_PROPS,
          onPointerDown: (e: React.PointerEvent<HTMLAnchorElement>) => {
            press(e)
            onIntent?.(pick)
          },
          onFocus: onIntent ? () => onIntent(pick) : undefined,
        }
      : {}
  return (
    <nav aria-label="Spaces" data-space-chips="" className="-mx-4 mb-3 flex items-center gap-2 pr-4 sm:mx-0 sm:pr-0">
      <div
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain overscroll-y-none scrollbar-hide touch-pan-x [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]"
        data-space-chips-track=""
        /*
          When it last moved, for followChosenChip: written on the element, so this stays a component with no hooks. Only where the
          row switches in place (the feed, in the browser); a server page drawing the row hands it no function.
        */
        {...(onPick ? { onScroll: (e: React.UIEvent<HTMLDivElement>) => void (e.currentTarget.dataset.scrolledAt = String(performance.now())) } : {})}
      >
        {/* 2px above and below, so a chip's one pixel shadow is not cut by the scrolling track. */}
        <div className="flex w-max items-center gap-2 py-0.5 pl-4 pr-6 sm:pl-0">
          <Link href={base} aria-current={allOn ? "page" : undefined} data-space-chip="all" className={`${CHIP} ${allOn ? CHIP_ON : CHIP_OFF}`} {...switching({ kind: "all" })}>
            <Fill on={allOn} />
            All
          </Link>
          {spaces.map((s) => {
            const on = active === s.slug
            const glyph = spaceGlyph(s.icon, s.kind)
            return (
              <Link
                key={s.id}
                href={feedListHref(base, { kind: "space", slug: s.slug })}
                aria-current={on ? "page" : undefined}
                data-space-chip={s.slug}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                {...(s.kind === "chat" ? {} : switching({ kind: "space", slug: s.slug }))}
              >
                <Fill on={on} />
                {/* The icon the admin set, or the kind's, as their own list shows it (space-glyph.ts, round 12). */}
                <span aria-hidden className="text-[14px] leading-none" data-space-glyph="">{glyph}</span>
                <span className="max-w-[180px] truncate">{s.name}</span>
                {s.unread > 0 && !on ? <span aria-label={`${s.unread} unread`} className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e]" /> : null}
              </Link>
            )
          })}
        </div>
      </div>
      {sort}
    </nav>
  )
}
