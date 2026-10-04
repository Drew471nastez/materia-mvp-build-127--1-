/**
 * THE SPACES, AS CHIPS AT THE TOP OF THE COMMUNITY FEED: All, then each
 * space the member may see, in the creator's order. A chip is a link (the
 * feed of that space, or its chat), so it works without JavaScript and the
 * back button does what it should. The chosen one is filled in ink; a chat
 * space with unread messages carries a dot. Saved sits at the right end of
 * the row (round 5), always in view.
 *
 * ONE ROW at every width: the chips scroll sideways when they do not fit
 * (a thumb, a trackpad, or Tab, which scrolls the focused chip into view),
 * and their last 24px fade out, over padding when everything fits, so the
 * fade only ever shows when there is more. No hooks, so the server pages
 * draw it.
 */
import Link from "next/link"
import { Bookmark } from "lucide-react"
import type { SpaceView } from "./view-types"

const CHIP =
  "relative inline-flex h-10 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[14px] font-medium outline-none transition-[color,background-color,border-color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-9 sm:text-[13.5px] [-webkit-tap-highlight-color:transparent]"
const CHIP_ON = "border-[#1a1a2e] bg-[#1a1a2e] text-white"
const CHIP_OFF = "border-[#e4e7ec] bg-white text-[#4b5563] hover:border-[#d5d8de] hover:text-[#1a1a2e]"

/** An emoji the creator chose for a space goes in front of its name; the line icon names do not. */
function emojiOf(icon: string | null): string | null {
  const v = (icon || "").trim()
  return v && !/^[a-z0-9-]+$/i.test(v) ? Array.from(v).slice(0, 2).join("") : null
}

export function SpaceChips({ slug, spaces, active, savedOn = false }: { slug: string; spaces: SpaceView[]; active: string | null; savedOn?: boolean }) {
  const base = `/community/${slug}`
  const allOn = active === null && !savedOn
  return (
    <nav aria-label="Spaces" data-space-chips="" className="-mx-4 mb-3 flex items-center gap-2 pr-4 sm:mx-0 sm:pr-0">
      <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain scrollbar-hide [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]" data-space-chips-track="">
        <div className="flex w-max items-center gap-2 pb-px pl-4 pr-6 sm:pl-0">
          <Link href={base} aria-current={allOn ? "page" : undefined} data-space-chip="all" className={`${CHIP} ${allOn ? CHIP_ON : CHIP_OFF}`}>
            All
          </Link>
          {spaces.map((s) => {
            const on = active === s.slug
            const emoji = emojiOf(s.icon)
            return (
              <Link key={s.id} href={`${base}/space/${s.slug}`} aria-current={on ? "page" : undefined} data-space-chip={s.slug} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
                {emoji ? <span aria-hidden className="text-[14px] leading-none">{emoji}</span> : null}
                <span className="max-w-[180px] truncate">{s.name}</span>
                {s.unread > 0 && !on ? <span aria-label={`${s.unread} unread`} className="h-1.5 w-1.5 rounded-full bg-[#1a1a2e]" /> : null}
              </Link>
            )
          })}
        </div>
      </div>
      <Link href={`${base}/saved`} aria-current={savedOn ? "page" : undefined} data-space-chip="saved" className={`${CHIP} ${savedOn ? CHIP_ON : CHIP_OFF}`}>
        <Bookmark aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
        Saved
      </Link>
    </nav>
  )
}
