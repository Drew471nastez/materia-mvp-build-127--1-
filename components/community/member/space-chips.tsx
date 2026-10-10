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
 * deeper one and the faintest light along its top edge. Nothing scales, so
 * nothing bumps, and every chip is touch-action: manipulation, so iOS never
 * holds a quick second tap back to see whether it is a double tap to zoom.
 * Round 15 replaced the press and how a tap is taken (chip-hit.ts says why,
 * with the measurements; below, THE LAYERS); round 16 the fill's motion.
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
import { CLICK_AFTER_MS, isTap, PRESS_FROM, PRESS_IN_MS, PRESS_OUT_MS, type Press } from "./chip-hit"
import { placeHref } from "@/lib/communities/client/places"
import { spaceGlyph } from "./space-glyph"
import type { SpaceView } from "./view-types"

/*
  ROUND 15: ONE TAP, NO FLASH, NO BUMP (chip-hit.ts says what was wrong and the numbers).

  A pill is white on its hairline and stays exactly its size and place whether chosen or not: the ink and the press are
  layers inside it, the words are two copies on top of each other (dark and white) that cross over on opacity, so choosing
  one changes no box at all. Its hit area (the ::after, which draws nothing) reaches HIT_X into each gap and HIT_Y above
  and below, into the row's padding (the row is py-1.5 inside a -my-1 track, the same height as before). A pseudo
  element's taps belong to its pill, so this costs no node and no layout.

  ROUND 16: NOTHING SLIDES ACROSS THE ROW. Round 15's ink glided from the old pill to the new one over 320ms (chip-ink.tsx,
  gone); the owner found it exaggerated. Every pill now carries its own ink, always there and only shown on the chosen one:
  choosing another fades the new one in and the old one out, in place, over PILL_FADE_MS on one soft curve, and the words
  cross over with them. Opacity only, on the compositor.

  THE LAYERS, in the row's own stacking context (isolate): a pill's white and hairline; its press (z-0); its ink (z-1); the
  words (z-2).
*/
const CHIP =
  "group/chip relative inline-flex h-10 shrink-0 touch-manipulation select-none items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e1e4e8] bg-white px-3.5 text-[14px] font-medium outline-none transition-[background-color,box-shadow] duration-[140ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] after:absolute after:-inset-x-[4.5px] after:-inset-y-[6px] after:content-[''] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 motion-reduce:transition-none sm:h-9 sm:text-[13.5px] [-webkit-tap-highlight-color:transparent]"
/* The chosen pill: no shadow of its own (its ink carries one). The shadow changes on the fade's own time. */
const CHIP_ON = "shadow-none"
const CHIP_OFF = "shadow-[0_1px_2px_rgba(16,24,40,0.07),0_1px_1px_rgba(16,24,40,0.03)] [@media(hover:hover)]:hover:bg-[#f5f6f7]"
/* Every pill's own ink, over the hairline (-inset-px), shown only on the chosen one: it fades in and out where it is (PILL_FADE_MS in chip-hit.ts). */
const FILL =
  "pointer-events-none absolute -inset-px z-[1] rounded-full bg-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.2),0_2px_5px_-2px_rgba(16,24,40,0.22),inset_0_1px_0_rgba(255,255,255,0.09)] transition-opacity duration-[140ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none"
/* The press: a light tint inside the hairline, eased in and out by pressChip() and releaseChip() below (opacity only). */
const PRESS = "pointer-events-none absolute inset-0 z-0 rounded-full bg-[#f1f2f4] opacity-0"
/*
  THE WORDS TURN WHEN THE INK IS ABOUT HALF THERE (WORD_TURN_MS in chip-hit.ts). Two copies of one word, dark and white, one
  shown. Crossing them over on the ink's own curve (round 16's first try, filmed at 4x CPU) left a frame where the words were
  the same grey as the half drawn ink and the pill read empty; any crossover has that frame wherever the two meet. So the
  words turn in one step (steps(1, end) over WORD_TURN_MS) as the ink reaches half way, where either colour stands clear of
  it, and the ink alone does the easing. A real transition, not a delay, so the compositor runs it with the ink and a busy
  page cannot hold it back.
*/
const WORD = "z-[2] col-start-1 row-start-1 truncate transition-opacity duration-[34ms] ease-[steps(1,end)] motion-reduce:transition-none"
const DARK_ON = "opacity-0"
const DARK_OFF = "opacity-100"
const WHITE_ON = "opacity-100"
const WHITE_OFF = "opacity-0"

/** A pill's ink: always there, seen only while the pill is the chosen one. */
function Fill({ on }: { on: boolean }) {
  return <span aria-hidden data-chip-fill={on ? "on" : "off"} className={`${FILL} ${on ? "opacity-100" : "opacity-0"}`} />
}

/** A pill's words, dark and white, one shown. */
function Label({ text, on, className = "" }: { text: string; on: boolean; className?: string }) {
  return (
    <span className={`relative grid ${className}`}>
      <span className={`${WORD} text-[#4b5563] [@media(hover:hover)]:group-hover/chip:text-[#1a1a2e] ${on ? DARK_ON : DARK_OFF}`}>{text}</span>
      <span aria-hidden className={`${WORD} text-white ${on ? WHITE_ON : WHITE_OFF}`}>
        {text}
      </span>
    </span>
  )
}

/* ── The press, on the compositor ── */

function pressLayer(chip: Element): HTMLElement | null {
  return chip.querySelector<HTMLElement>(":scope > [data-chip-press]")
}
/** Something on the first frame (PRESS_FROM of the grey), then an ease to the whole of it. */
export function pressChip(chip: Element) {
  const layer = pressLayer(chip)
  if (!layer || typeof layer.animate !== "function") return
  for (const a of layer.getAnimations()) a.cancel()
  layer.animate([{ opacity: PRESS_FROM }, { opacity: 1 }], { duration: PRESS_IN_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" })
}
/** Let go, slower than it came, from wherever it had got to. */
export function releaseChip(chip: Element) {
  const layer = pressLayer(chip)
  if (!layer || typeof layer.animate !== "function") return
  const from = Number(getComputedStyle(layer).opacity) || 0
  for (const a of layer.getAnimations()) a.cancel()
  if (from <= 0) return
  layer.animate([{ opacity: from }, { opacity: 0 }], { duration: PRESS_OUT_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" })
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

/*
  THE TAP IN FLIGHT, kept on the module rather than in state: where the finger landed, and when a release last acted, so the
  click the browser may send after it is not a second switch.
*/
let down: (Press & { id: number }) | null = null
let tookAt = 0

/*
  A PILL'S ADDRESS IS THE CANONICAL ONE (placeHref), the same on the server and in the browser. It used to be drawn by
  feedListHref, which asks the browser whether it is a phone: the server drew /space/<x>, a phone's first render wanted
  ?space=<x>, and React kept the server's (it does not mend an attribute on hydration). The shell's navigator decides the
  address a tap puts up; this one is for a new tab, a reload or a page with no script.
*/

export function SpaceChips({ slug, spaces, active, savedOn = false, onPick, onIntent, sort }: SpaceChipsProps) {
  if (typeof window !== "undefined") drawn.set(slug, spaces)
  const base = `/community/${slug}`
  const allOn = active === null && !savedOn
  /* The props a chip that can switch in place carries; a page link otherwise. */
  const switching = (pick: ChipPick) =>
    onPick
      ? {
          prefetch: false,
          /*
            THE CLICK IS THE SECOND CHANCE. A keyboard and a mouse send one; a finger's tap was already taken on its release
            (below), and Safari sends none at all when anything cancelled a move, so the click after a release is left be.
          */
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (!inPlace(e)) return
            e.preventDefault()
            if (performance.now() - tookAt < CLICK_AFTER_MS) return
            onPick(pick)
          },
          onPointerEnter: onIntent ? (e: React.PointerEvent) => e.pointerType === "mouse" && onIntent(pick) : undefined,
          /* The press shows on the first frame, and the list is asked for at the same moment. */
          onPointerDown: (e: React.PointerEvent<HTMLAnchorElement>) => {
            if (e.button !== 0) return
            pressChip(e.currentTarget)
            down = e.pointerType === "mouse" || !inPlace(e) ? null : { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
            onIntent?.(pick)
          },
          /* A finger's tap is taken here: still where it landed, it was a tap, whatever the row or the page did with the move. */
          onPointerUp: (e: React.PointerEvent<HTMLAnchorElement>) => {
            releaseChip(e.currentTarget)
            const started = down?.id === e.pointerId ? down : null
            down = null
            if (!started || !isTap(started, { x: e.clientX, y: e.clientY, t: performance.now() })) return
            tookAt = performance.now()
            onPick(pick)
          },
          /* The browser kept the touch for a scroll of its own: no tap. */
          onPointerCancel: (e: React.PointerEvent<HTMLAnchorElement>) => {
            releaseChip(e.currentTarget)
            down = null
          },
          onPointerLeave: (e: React.PointerEvent<HTMLAnchorElement>) => {
            if (e.pointerType === "mouse") releaseChip(e.currentTarget)
          },
          onFocus: onIntent ? () => onIntent(pick) : undefined,
        }
      : {}
  return (
    <nav aria-label="Spaces" data-space-chips="" className="-mx-4 mb-3 flex items-center gap-2 pr-4 sm:mx-0 sm:pr-0">
      <div
        className="-my-1 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain overscroll-y-none scrollbar-hide touch-pan-x [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]"
        data-space-chips-track=""
        /*
          When it last moved, for followChosenChip: written on the element, so this stays a component with no hooks. Only where the
          row switches in place (the feed, in the browser); a server page drawing the row hands it no function.
        */
        {...(onPick ? { onScroll: (e: React.UIEvent<HTMLDivElement>) => void (e.currentTarget.dataset.scrolledAt = String(performance.now())) } : {})}
      >
        {/* 6px above and below: the pills' hit areas reach into it, and a pill's one pixel shadow is not cut by the scrolling track. */}
        <div className="relative isolate flex w-max items-center gap-2 py-1.5 pl-4 pr-6 sm:pl-0">
          <Link href={base} aria-current={allOn ? "page" : undefined} data-space-chip="all" className={`${CHIP} ${allOn ? CHIP_ON : CHIP_OFF}`} {...switching({ kind: "all" })}>
            <span aria-hidden data-chip-press="" className={PRESS} />
            <Fill on={allOn} />
            <Label text="All" on={allOn} />
          </Link>
          {spaces.map((s) => {
            const on = active === s.slug
            const glyph = spaceGlyph(s.icon, s.kind)
            return (
              <Link
                key={s.id}
                href={placeHref(slug, { kind: "space", slug: s.slug })}
                aria-current={on ? "page" : undefined}
                data-space-chip={s.slug}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                {...(s.kind === "chat" ? {} : switching({ kind: "space", slug: s.slug }))}
              >
                <span aria-hidden data-chip-press="" className={PRESS} />
                <Fill on={on} />
                {/* The icon the admin set, or the kind's, as their own list shows it (space-glyph.ts, round 12). */}
                <span aria-hidden className="relative z-[2] text-[14px] leading-none" data-space-glyph="">{glyph}</span>
                <Label text={s.name} on={on} className="max-w-[180px]" />
                {/* Kept, unseen, on the chosen chip: taking it away made the chip narrower and moved every chip after it. */}
                {s.unread > 0 ? <span aria-label={on ? undefined : `${s.unread} unread`} aria-hidden={on || undefined} className={`relative z-[2] h-1.5 w-1.5 rounded-full bg-[#1a1a2e] ${on ? "opacity-0" : ""}`} /> : null}
              </Link>
            )
          })}
        </div>
      </div>
      {sort}
    </nav>
  )
}
