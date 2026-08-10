"use client"

import { SurfaceClaim } from "@/components/surface-claim"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { createPortal } from "react-dom"
import Link from "next/link"
import Image from "next/image"
import { Bookmark, Settings, Share2, Star } from "lucide-react"

import { ProductCard } from "@/components/explore/product-card"
import { FollowButton } from "@/components/explore/follow-button"
import { EmptyShelf } from "@/components/member/empty-shelf"
import { ImageViewer } from "@/components/messages/image-viewer"
import { ownerListingHref, ownerStatusBadge } from "@/lib/marketplace/listing-status"
import { SellerReviewsList } from "@/components/member/seller-reviews-list"
import { ProfilePinnedHeader } from "@/components/member/profile-pinned-header"
import { ManageListingSheet } from "@/components/product/manage-listing-sheet"
import { MoreHorizontal } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
import { beginTabLeave } from "@/lib/tab-leave"
import { consumeNavHint } from "@/lib/screen-transition"
import { coverImageUrl, defaultCoverFor, resolveCover } from "@/lib/profile/covers"
import { cn } from "@/lib/utils"

/**
 * The buyer-facing seller profile at /member/[username].
 *
 * One screen, two jobs: say who the seller is (avatar, name, member-since,
 * presence, reviews) and show what they are selling. The listings reuse the
 * exact ProductCard from the feed — same photo ratio, same wishlist heart —
 * because a listing must look identical wherever a buyer meets it.
 *
 * There is deliberately NO "send message" button here: conversations on this
 * marketplace start from a listing, so the honest entry point is tapping an
 * item below, not a context-free chat with the seller.
 *
 * /profile renders this same screen with `isOwner`, so that you and everyone
 * else are looking at one profile rather than two that drift apart. Ownership
 * only swaps the three controls that would be nonsense pointed at yourself —
 * follow, the empty-shop line, and the way out to settings.
 */

export type MemberListing = {
  id: string
  title: string
  slug: string
  price_cents: number
  compare_at_cents: number | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  type: string
  category: string | null
  size: string | null
  size_system: string | null
  brand: string | null
  condition: string | null
  saves_count: number
  created_at: string | null
  /** 'archived' only ever reaches your OWN profile — a visitor's query does not
   *  ask for them. See lib/profile/listings.ts. */
  status?: string | null
}

export type MemberSummary = {
  /** Profile (auth user) id — what follows and reviews key on. */
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  joinedAt: string | null
  /** true/false when last_seen_at was readable on the server; null means the
   *  presence column isn't deployed yet, so no dot renders at all rather than
   *  a grey one falsely claiming everyone is offline. */
  online: boolean | null
  /** The line under the name. Undefined when the column is not in this
   *  database yet, which renders exactly as empty rather than as an error. */
  bio?: string | null
  /** null means "never chose one" — the account gets the preset its id
   *  resolves to. See lib/profile/covers.ts. */
  coverUrl?: string | null
}

/** "Membru din martie 2025" — month precision is all this is worth. */
function joinedLabel(iso: string | null, locale: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString(locale === "ro" ? "ro-RO" : "en-GB", { month: "long", year: "numeric" })
  } catch {
    return null
  }
}

/** Romanian counts need three forms (1 recenzie / 3 recenzii / 20 de recenzii),
 *  which a flat dictionary key can't express — so the plural rule lives here. */
function reviewsLabel(count: number, language: string): string {
  if (language === "ro") {
    if (count === 1) return "1 recenzie"
    return count < 20 ? `${count} recenzii` : `${count} de recenzii`
  }
  return count === 1 ? "1 review" : `${count} reviews`
}

/**
 * How much of the top of the screen the pinned bar is currently covering.
 *
 * Measured rather than stated, because its height is 52px plus whatever the
 * device's status-bar inset happens to be — a number that only CSS knows. Zero
 * when the bar is not up, which is the case where scrolling to y=0 is correct.
 */
function pinnedOffset(): number {
  if (typeof document === "undefined") return 0
  const bar = document.querySelector<HTMLElement>('.profile-pinned[data-shown="true"]')
  return bar ? bar.getBoundingClientRect().height : 0
}

export type ReviewsSummary = { average: number; count: number }

/**
 * Average stars + count for this seller, from GET /api/reviews?sellerId=…
 *
 * That endpoint is landing in a parallel branch, so this reads defensively:
 * any non-OK status, unparseable body or unfamiliar shape simply keeps the
 * strip hidden. A missing reviews row must never cost the profile anything.
 *
 * `sellerId` is null when the caller already handed us the summary — /profile
 * reads it on the server, where the numbers are simply part of the first paint
 * — and a null id skips the request entirely rather than firing one whose
 * answer would be thrown away.
 */
function useSellerReviews(sellerId: string | null): ReviewsSummary | null {
  const [summary, setSummary] = useState<ReviewsSummary | null>(null)

  useEffect(() => {
    if (!sellerId) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/reviews?sellerId=${encodeURIComponent(sellerId)}`, {
          credentials: "include",
        })
        if (!res.ok) return
        const data: any = await res.json().catch(() => null)
        if (!data || typeof data !== "object") return

        const list: any[] = Array.isArray(data.reviews) ? data.reviews : []
        const count =
          typeof data.total === "number" && Number.isFinite(data.total) && data.total >= 0
            ? data.total
            : list.length
        if (count <= 0) return

        // Prefer a server-computed average under any of its likely names, and
        // only fall back to averaging the page of reviews we were handed.
        let average = [data.average, data.averageRating, data.rating, data?.stats?.average].find(
          (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
        )
        if (average === undefined) {
          const ratings = list
            .map((r) => Number(r?.rating))
            .filter((n) => Number.isFinite(n) && n > 0)
          if (ratings.length === 0) return
          average = ratings.reduce((a, b) => a + b, 0) / ratings.length
        }

        if (!cancelled) setSummary({ average: Math.min(5, Math.max(0, average)), count })
      } catch {
        // The strip is decoration — silence is the correct failure mode.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sellerId])

  return summary
}

/** Five stars with a fractional amber fill — the grey row underneath is always
 *  complete, and the coloured row is clipped to the average, so 4.3 reads as
 *  4.3 rather than snapping to a whole star. */
function Stars({ value }: { value: number }) {
  const pct = (Math.min(5, Math.max(0, value)) / 5) * 100
  const row = (
    <span className="flex gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-[14px] w-[14px] shrink-0 fill-current" strokeWidth={0} />
      ))}
    </span>
  )
  return (
    <span className="relative inline-flex text-neutral-200" aria-hidden="true">
      {row}
      <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-400" style={{ width: `${pct}%` }}>
        {row}
      </span>
    </span>
  )
}

/**
 * One cell of the stats card. The height is fixed rather than derived from the
 * two line boxes inside it, because /profile/loading.tsx has to draw the same
 * card a beat earlier and two grey bars do not measure the same as a number
 * over a caption. A stated height is a number both files can hold.
 */
const STAT_CELL = "flex h-[70px] flex-col items-center justify-center gap-0.5 px-2"

function Stat({ value, label, lang }: { value: number; label: string; lang: string }) {
  const compact = value >= 1000
    ? new Intl.NumberFormat(lang === "ro" ? "ro-RO" : "en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : String(value)
  return (
    <span className={STAT_CELL}>
      <span className="text-[17px] font-bold leading-tight text-neutral-900 tabular-nums">{compact}</span>
      <span className="text-[12.5px] leading-tight text-neutral-500">{label}</span>
    </span>
  )
}

/**
 * One tab of the shelf.
 *
 * The underline is NOT on the button. It is a single bar under the strip that
 * TRAVELS, because two borders swapping which one is black is a cut, and the
 * one thing a tab strip has to communicate is that these two are the same
 * control in two positions. It costs one transform.
 */
function ShelfTab({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number | null
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={cn(
        // flex-1 and centred: the names share the full measure, the way the
        // feed's own Pentru tine / Urmărești / Salvate strip does — not a
        // cluster parked at one end of the line.
        "relative flex flex-1 items-baseline justify-center gap-1.5 pb-2.5 pt-1 text-[15px]",
        "transition-[color,transform] duration-150 active:scale-[0.97]",
        active ? "font-semibold text-neutral-900" : "font-medium text-neutral-400 active:text-neutral-600",
      )}
    >
      {children}
      {count !== null && (
        <span className={cn("text-[12px] font-semibold tabular-nums", active ? "text-neutral-500" : "text-neutral-300")}>
          {count}
        </span>
      )}
    </button>
  )
}

export function MemberProfile({
  member,
  listingsCount,
  followersCount,
  followingCount,
  listings,
  isOwner = false,
  reviews: reviewsFromServer,
}: {
  member: MemberSummary
  /** Exact total from the server — the grid itself is capped, so it may show fewer. */
  listingsCount: number
  followersCount: number
  followingCount: number
  listings: MemberListing[]
  /** True only on /profile, where the person reading is the person shown. */
  isOwner?: boolean
  /** Already counted on the server. Passing it means the stars are in the first
   *  paint instead of appearing a moment after the rest of the header, and the
   *  client makes no request at all. */
  reviews?: ReviewsSummary | null
}) {
  const { t, language } = useLocale()

  /**
   * Arriving back here from a listing.
   *
   * The same read the feed does, from the hint the navigation left on <html>,
   * and it is TAKEN rather than read so a tab change or a fresh visit that
   * happens to mount this component next does not inherit somebody else's
   * arrival. A layout effect, so the class is on the element before the browser
   * paints it and the animation starts at its true beginning instead of one
   * frame in — in a passive effect the finished page is shown at rest for a
   * frame and then jumps back to 0.94 to animate, which is a flinch.
   *
   * Dropped on a timer rather than on animationend: the animation is `none` on
   * desktop and under reduced motion, and an animation that never runs never
   * ends, so the `will-change: transform` layer would be held for the rest of
   * the session on precisely the machines that opted out of it.
   */
  /**
   * THE SHELF'S TWO TABS — Anunțuri and Evaluări.
   *
   * Ciorne was a third, and it was the wrong shape for what a draft is. A draft
   * is not a different KIND of thing needing its own room; it is one of your
   * listings, in a state. Behind a tab it made the shelf disagree with itself
   * about how many listings you had, and a draft started yesterday was
   * somewhere you had to remember to go and look. It sits in the grid now with
   * a Ciornă badge, and tapping it reopens the form exactly where you left it.
   *
   * Two tabs left: what you are selling, and what people said about you.
   */
  const [shelfTab, setShelfTab] = useState<"listings" | "reviews">("listings")
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  WHY SWITCHING TABS GLITCHED, AND WHY IT IS INSTANT NOW
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Three separate faults stacked, and the visible one — a second of empty
   * page, then a collapse — was all three at once.
   *
   *  1. THE PAGE WAS TALLER THAN ITS NEW CONTENTS. Forty percent down a grid of
   *     sixty cards is three thousand pixels of scroll. The reviews panel is
   *     three hundred. Switching left the browser scrolled past the end of a
   *     document that had just shrunk, so it painted nothing and then clamped —
   *     which is exactly "empty space, then it jumps back". The strip is
   *     brought to the top of the viewport BEFORE the swap now, which is what
   *     every app in this category does and the only thing that removes the
   *     clamp rather than hiding it.
   *
   *  2. THE OUTGOING PANEL WAS RE-MOUNTED TO ANIMATE IT AWAY. A depth crossfade
   *     needs both layers in the DOM, so leaving the grid meant mounting sixty
   *     ProductCards a second time — sixty next/image elements, decoded again —
   *     on the one frame the animation had to start on. That is the right trade
   *     for the feed, which crossfades two full-screen photographs. It is the
   *     wrong one for a grid. Both panels stay mounted here and the inactive
   *     one is `hidden`, so a switch is a class change and nothing else.
   *
   *  3. AN EMPTY SELLER STILL PAID FOR A ROUND TRIP. See the note on
   *     `knownCount` in seller-reviews-list: the count is already known from
   *     the server render, so zero reviews now draws the empty state on the
   *     first frame instead of three skeletons and a second layout.
   */
  const shelfRef = useRef<HTMLElement>(null)
  /** The reviews panel is mounted on first visit and never unmounted after —
   *  the second switch and every one after it costs nothing at all. */
  const [reviewsSeen, setReviewsSeen] = useState(false)

  /**
   * WHICH WAY THE SWITCH WENT.
   *
   * Both panels rose in place before, which said a change had happened but not
   * which of the two you had landed on — so the strip read as one panel being
   * redrawn rather than as two things side by side. The incoming panel now
   * comes from the side its tab is on, in the same direction the underline is
   * travelling on that frame.
   *
   * `null` until the first switch, on purpose: the listings panel is what the
   * page opens on, and animating it in on arrival is motion announcing
   * something that did not happen.
   */
  const [dir, setDir] = useState<null | "left" | "right">(null)

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  THE PAGE GLIDES UP, AND THE PANEL CHANGES WHEN IT GETS THERE
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * It used to be `behavior: "auto"` — a hard jump — fired on the same tick as
   * the swap. The note that replaced a smooth scroll with that jump was half
   * right: a smooth scroll running AT THE SAME TIME as the panel change really
   * is two things happening at once, and it really does read as a glitch,
   * because the document shrinks by three thousand pixels underneath a scroll
   * animation that was aimed at the old height.
   *
   * The wrong conclusion was that the scroll had to be instant. What it had to
   * be was FIRST. Two thousand pixels of travel erased between one frame and the
   * next is not a transition anybody can follow — you press Evaluări and the
   * screen you were reading is simply gone, which is the blink.
   *
   * So the two are sequenced rather than merged:
   *
   *   1. The underline moves NOW. `pending` is what the tab strip draws, so the
   *      tap is answered on the frame it lands and nothing waits on the scroll.
   *   2. The page glides to the strip over ~380ms, with both panels still
   *      exactly as they were — so the document keeps the height the animation
   *      was aimed at and nothing can clamp.
   *   3. The panel swaps on arrival, with its own slide, onto a page that has
   *      stopped moving.
   *
   * Written as a rAF loop rather than `behavior: "smooth"` because the swap has
   * to happen when the scroll ENDS and there is no reliable way to be told that:
   * `scrollend` is not on Safari, and a timer next to a native smooth scroll is
   * a guess at a duration the browser chooses. Driving it here means the end is
   * a fact rather than an estimate.
   *
   * A finger on the screen cancels it and commits immediately — a page that
   * keeps gliding somewhere while you are trying to scroll it yourself is the
   * one thing worse than the jump this replaces.
   */
  const SCROLL_MS = 380
  const scrollRun = useRef(0)

  /** What the STRIP shows. The panels follow `shelfTab`, which lands later. */
  const [pending, setPending] = useState<null | "listings" | "reviews">(null)
  const shownTab = pending ?? shelfTab

  const goToTab = useCallback(
    (next: "listings" | "reviews") => {
      void triggerHaptic("light")
      // Re-tapping the tab you are on, or the one already on its way in.
      if (next === (pending ?? shelfTab)) return

      const commit = () => {
        setShelfTab((current) => {
          if (current === next) return current
          setDir(next === "reviews" ? "right" : "left")
          return next
        })
        setPending(null)
      }

      setPending(next)
      // Mounted at the TAP, not at the swap. The panel is `hidden` either way so
      // it costs no layout and adds no height — but its reviews request is a
      // round trip, and starting it here means it runs during the 380ms glide
      // instead of on the frame the panel appears. The tab lands populated
      // rather than landing and then filling in.
      if (next === "reviews") setReviewsSeen(true)

      const el = shelfRef.current
      const top = el ? el.getBoundingClientRect().top - pinnedOffset() : 0
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

      // Already in view, or somebody has asked for less motion: there is nothing
      // to travel, so the swap is the whole interaction and waiting for an
      // animation that is not going to run would only be a delay.
      if (top >= -1 || reduced) {
        if (top < 0) window.scrollBy({ top, behavior: "auto" })
        commit()
        return
      }

      const from = window.scrollY
      const distance = top // negative: we are going up
      const started = performance.now()
      const run = ++scrollRun.current

      // The curve the whole app arrives on. A scroll that eases out for most of
      // its length is one you can follow to its destination, which is the entire
      // difference between being taken somewhere and being put there.
      const ease = (t: number) => 1 - Math.pow(1 - t, 3)

      const stop = () => {
        if (run !== scrollRun.current) return
        scrollRun.current++
        window.removeEventListener("touchstart", stop)
        window.removeEventListener("wheel", stop)
        commit()
      }
      window.addEventListener("touchstart", stop, { passive: true, once: true })
      window.addEventListener("wheel", stop, { passive: true, once: true })

      const step = (now: number) => {
        if (run !== scrollRun.current) return
        const t = Math.min(1, (now - started) / SCROLL_MS)
        window.scrollTo(0, from + distance * ease(t))
        if (t < 1) {
          requestAnimationFrame(step)
          return
        }
        stop()
      }
      requestAnimationFrame(step)
    },
    [pending, shelfTab],
  )

  // A tab strip left mid-flight by an unmount would otherwise keep scrolling a
  // page that is no longer here.
  useEffect(() => () => void scrollRun.current++, [])

  /** The class that plays on whichever panel is arriving. Removed from the
   *  inactive one, which is what lets the animation replay on every switch
   *  rather than only on the mount that first added it. */
  const panelIn = (tab: "listings" | "reviews") =>
    shelfTab !== tab || !dir ? undefined : dir === "right" ? "shelf-panel-in-right" : "shelf-panel-in-left"

  /**
   * THE BAR AT THE TOP, ONCE THE NAME HAS GONE.
   *
   * An IntersectionObserver on a zero-height sentinel under the name rather
   * than a scroll listener: this page is a grid of photographs being flicked
   * through, and a handler that runs on every frame of that to compute a
   * boolean which changes twice a session is main-thread work paid for
   * continuously and used almost never. The observer fires exactly on the
   * crossings.
   */
  const nameEndRef = useRef<HTMLSpanElement>(null)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    const el = nameEndRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      ([entry]) => {
        // Above the viewport, not below it. Without the second test the bar
        // also appears when the sentinel has not been reached yet — which on a
        // short profile is most of the time.
        setPinned(!entry.isIntersecting && entry.boundingClientRect.top < 0)
      },
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  AND IT MUST NOT SURVIVE A MODAL OPENING OVER THE PAGE
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * "Vinde un articol" appeared with this profile's bar across the top of it —
   * somebody else's name, a share button and a settings gear, over a form for
   * listing a jumper.
   *
   * /products/new is an INTERCEPTED route (app/(marketing)/@modal/(.)products/
   * new), which is what makes the sell sheet open over whatever you were
   * looking at without losing it. The consequence is that this component is not
   * unmounted while that sheet is open — so its bar, portalled to <body> and
   * fixed to the viewport, went on being drawn over a screen it has nothing to
   * do with.
   *
   * The pathname is the honest test: when the modal is open the URL is the
   * modal's, and this page is underneath rather than in front. Not a z-index
   * fight — a bar belonging to the page BEHIND must not be visible over the one
   * in front no matter which of them stacks higher.
   */
  const pathname = usePathname()
  const onScreen = pathname === "/profile" || !!pathname?.startsWith("/member/")
  /**
   * The listing whose ⋯ sheet is open, when this is your own shelf.
   *
   * `shown` lags it by one close, and both are needed. BottomSheet keeps its
   * children mounted for the length of the exit animation, so feeding the sheet
   * straight from `manageFor` meant it rewrote itself into a generic, titleless
   * listing for the 310ms it spent sliding away. `shown` holds the last real
   * one until the sheet is gone, and keying the sheet on its id also discards
   * an armed delete confirmation with the listing it belonged to — one
   * instance serves the whole grid, and that state must not survive a change
   * of subject.
   */
  const [manageFor, setManageFor] = useState<MemberListing | null>(null)
  const [shown, setShown] = useState<MemberListing | null>(null)
  useEffect(() => {
    if (manageFor) setShown(manageFor)
  }, [manageFor])

  const [returning, setReturning] = useState(false)
  useLayoutEffect(() => {
    if (consumeNavHint() !== "back") return
    setReturning(true)
    // 300ms is `.screen-return`'s duration in app/globals.css, plus a frame or
    // two of margin. Holding it longer only keeps the compositor layer that
    // `will-change` asks for alive after there is nothing left to animate.
    const t = window.setTimeout(() => setReturning(false), 360)
    return () => window.clearTimeout(t)
  }, [])

  const fetchedReviews = useSellerReviews(reviewsFromServer === undefined ? member.id : null)
  const reviews = reviewsFromServer === undefined ? fetchedReviews : reviewsFromServer

  // Straight from the server, with nothing mirrored in local state.
  //
  // These used to be held in a `useState` seeded from the props, so the editor
  // that opened over this screen could show a choice before it had been saved.
  // The editor is a page of its own now (/profile/edit), and what came back was
  // a copy of the truth that had to be kept in step with it by an effect — the
  // exact shape of the bug where a value is correct on the server and stale in
  // memory. There is no second copy to disagree any more.
  const cover = resolveCover(member.coverUrl, member.id)
  /** What the band is when there is no photograph, and what sits behind one
   *  while it loads. `resolveCover` already falls back to this, so reading it
   *  again here cannot disagree with what is drawn. */
  /** The colour under the band, and the photograph over it — if there is one.
   *
   *  `none` is now the default (see lib/profile/covers.ts): no photograph at
   *  all, just the tinted band. `coverPhoto` being null is the normal case, not
   *  an error state, so nothing here may render a placeholder for it. */
  const coverTint =
    cover.kind === "preset" ? cover.preset.tint : cover.kind === "none" ? cover.tint : defaultCoverFor(member.id).tint
  const coverPhoto =
    cover.kind === "image" ? cover.url : cover.kind === "preset" ? coverImageUrl(cover.preset) : null
  const bio = member.bio ?? null

  const name = member.displayName || member.username || "Storelib"
  const joined = joinedLabel(member.joinedAt, language)

  /**
   * Send somebody here.
   *
   * The native share sheet when the device has one, which on a phone is what
   * anybody expects and puts the link straight into whichever app they were
   * going to paste it into anyway. On a desktop there is no sheet, so the URL
   * goes to the clipboard — the same outcome by the only means available.
   * `share` rejects when the person cancels the sheet, which is not an error
   * and must not be reported as one.
   */
  const [shared, setShared] = useState(false)
  /** The profile picture, full size. */
  const [avatarOpen, setAvatarOpen] = useState(false)
  const share = useCallback(async () => {
    void triggerHaptic("light")
    const url = `${window.location.origin}/member/${encodeURIComponent(member.username)}`
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared(true)
      window.setTimeout(() => setShared(false), 1600)
    } catch {
      /* cancelled, or no clipboard permission — neither is worth a message */
    }
  }, [member.username, name])
  // Only the join date. The listing count used to ride along here and it was
  // the half of the line that got cut off at 375px — while the stats row one
  // line below already states it exactly, in a bigger type. Saying it twice
  // was what made the sentence too long to fit in the first place.
  const meta = joined ? `${t("mfeed.member_since")} ${joined}` : null

  return (
    // A column that fills the screen and no more. Bottom padding lives on the
    // grid and the empty state rather than here, because GlobalMobileNav
    // already reserves its own strip below <main>: paying for it twice is what
    // left a profile with nothing on it scrolling through empty space.
    //
    // NO TOP PADDING ON A PHONE. The cover is the first thing in this column
    // and it is meant to run to the top of the screen and up under the clock;
    // a gutter above it would be a white band between the status bar and the
    // colour, which is the exact seam the cover exists to remove. On a desktop
    // the cover is a rounded card rather than a full-bleed strip, so there it
    // gets air above it like any other card.
    //
    // 1100px, not 1400. A profile is a header and a grid of squares, and at
    // 1400 on a wide monitor the header's text runs to a line length nobody can
    // track while the avatar sits marooned at the far left. The narrower measure
    // is what makes this read as a page rather than as a phone layout that has
    // been stretched.
    <div
      className={cn(
        "profile-surface relative isolate mx-auto flex min-h-full w-full max-w-[1100px] flex-col px-4 md:px-8 md:pt-8 lg:pt-10",
        returning && "screen-return",
      )}
    >
      {/* WHITE, and the COVER paints its own strip.
          
          This claim only exists to take down the opaque shield the app draws
          over the status area (html.capacitor::before) so the page can reach
          past it. The colour it declares is what shows where the page does NOT
          paint — and the cover already extends up by the safe-area inset
          precisely so that it covers that strip itself.
          
          It briefly claimed the cover's own top colour instead, and that was
          the glitch on landing. `claimSurface` writes the colour to
          <html>, and `html.capacitor.native-feed-bg body` inherits it — so
          declaring a saturated purple painted the entire body behind the page,
          not a strip. The arriving tab is at 0.88 opacity for its first frames
          (see `.tab-leaving` in app/globals.css), which is exactly enough for
          that purple to come through the white profile as a wash over the whole
          screen; and the loading shell had claimed #3f3f46 a moment earlier, so
          landing on your own profile went white, dark grey, purple, white in
          under half a second. Every one of those steps was legible, and the top
          of the screen — where the cover, the header and the status strip all
          meet — is where they were most legible.
          
          A backdrop must be the colour of the page, not the colour of the thing
          drawn on it. */}
      <SurfaceClaim colour="#ffffff" />

      {/* Everything the cover was carrying, once the cover has gone. */}
      <ProfilePinnedHeader
        name={name}
        avatarUrl={member.avatarUrl}
        visible={pinned && onScreen}
        isOwner={isOwner}
        onShare={() => void share()}
      />
      {/* THE COVER, and everything that sits on it.
          
          A profile without one is a name floating on white, which is the state
          the screen was in: nothing said this was the top of anything, so the
          avatar simply began. The faint purple wash that used to stand in for
          this was doing the same job with a hundredth of the means, and it
          could not be personal — which is most of what a cover is for.
          
          Full-bleed on a phone and it runs UP under the status bar in the app:
          `-mx-4` cancels this column's gutter, and the negative top margin plus
          the matching padding pull it into the inset so the colour starts where
          the SCREEN does. On the web there is a header above it and the inset
          is zero, so it simply starts under that — which is the difference
          between the two the app has always had. */}
      <div
        // `profile-cover-live` is what separates the real cover from the pale
        // one the loading shell draws in the same place: it carries the short
        // dissolve that turns the swap between them into a handover instead of
        // a cut. A class rather than an attribute selector, because whether
        // this element happens to have an inline `style` depends on whether the
        // cover is a preset or an uploaded photograph, and that is not what the
        // rule is about.
        className="profile-cover profile-cover-live relative -mx-4 overflow-hidden md:-mx-8 md:rounded-3xl"
        // THE TINT IS ALWAYS PAINTED, under whatever the cover turns out to be.
        //
        // The box used to be `bg-neutral-100` while a cover image loaded, so an
        // account with a photograph showed a grey hole at the top of the screen
        // and then the picture appeared in it. A placeholder of the wrong
        // colour is worse than none, because it announces that something is
        // missing.
        //
        // Every library entry carries its own image's mean colour, measured
        // from the file (see lib/profile/covers.ts), and an upload falls back
        // to the account's default entry. Either way the band is the right
        // colour from the first frame at no cost, and a photograph that is
        // slow — or never arrives — degrades to a plausible version of itself.
        style={{ backgroundColor: coverTint }}
      >
        {coverPhoto && (
          // next/image, so what is fetched is an AVIF or WebP sized for this
          // viewport rather than the full-resolution original. This is the
          // largest image on the page and the first one requested; on a cover
          // that is the difference between a band that is there and one that
          // arrives.
          <Image
            key={coverPhoto}
            src={coverPhoto}
            alt=""
            fill
            priority
            sizes="(min-width: 1100px) 1100px, 100vw"
            className="profile-cover-photo object-cover"
            onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
          />
        )}

        {/* A floor under the controls AND under the clock.
            
            A white glyph on a photograph is legible over a dark sky and
            invisible over a pale one, and there is no way to know which anybody
            uploads. The system draws the time, the battery and the signal bars
            in white over whatever is behind them and does not adapt either — so
            a cover that runs up under the status bar has to carry its own
            floor. Deeper and taller than a decorative scrim, because it is not
            decoration: it is what makes the top of the phone readable. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 via-black/15 to-transparent"
        />

        {/* The controls, in the cover rather than in a row above it, and pushed
            clear of the clock.
            
            The gear used to sit on its own line over the header, which cost a
            full row of vertical space on a phone to hold one 22px icon. Up here
            they are on a surface that was otherwise doing nothing, and they are
            where every profile in every app has trained people to look.
            
            `--cover-inset` is the safe-area inset on a phone and zero
            everywhere else, so on the web this is simply `top-2.5`. See
            `.profile-cover` in app/globals.css. */}
        <div
          className="absolute right-2.5 top-2.5 flex items-center gap-1.5"
          style={{ marginTop: "var(--cover-inset, 0px)" }}
        >
          <CoverButton label="Distribuie" onClick={share}>
            <Share2 className="h-[17px] w-[17px]" />
          </CoverButton>
          {/* THREE, not four. The pencil is gone: "Editează profilul" is a
              full labelled button one row below, and an icon meaning the same
              thing a centimetre away from it is the same door twice — while
              being, of the four, the one whose glyph says least. */}
          {isOwner && (
            <>
              <CoverButton label="Salvate" href="/wishlist">
                <Bookmark className="h-[17px] w-[17px]" />
              </CoverButton>
              <CoverButton label="Setări" href="/settings">
                <Settings className="h-[17px] w-[17px]" />
              </CoverButton>
            </>
          )}
        </div>
      </div>

      {/* The avatar STRADDLES the boundary, which is what ties the two halves
          together — sitting wholly below it the cover reads as a banner that
          happens to be above a profile rather than as part of one. The negative
          margin is half the avatar, so the cover's height does not have to
          change to make room. */}
      <header className="relative flex items-start gap-4 md:gap-6">
        <div className="relative -mt-11 shrink-0 md:-mt-14">
          {/* The white ring and the short shadow are what let the avatar sit ON
              the cover rather than in it. Both are drawn outside the box, so the
              88px the layout is built around is unchanged. */}
          {/* TAPPING IT OPENS IT.
              
              A profile picture is the one image on a profile you might actually
              want to look at closely — it is how you decide whether the person
              you are about to send money to is who their listings suggest — and
              on a phone it is 88 pixels across. Everybody tries the tap.
              
              A button only when there is a photograph: an initial has nothing
              to enlarge, and a control that opens a bigger letter is a control
              that punishes you for pressing it. */}
          {member.avatarUrl ? (
            <button
              type="button"
              aria-label="Vezi poza de profil"
              onClick={() => {
                void triggerHaptic("light")
                setAvatarOpen(true)
              }}
              // `no-tap-fade` for the same reason the listing photo has it: in
              // the app a button dims to 0.65 on press, and dimming a
              // photograph before enlarging it is a dissolve in front of the
              // real transition.
              className="no-tap-fade block h-[88px] w-[88px] cursor-zoom-in overflow-hidden rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white transition-transform active:scale-[0.96] md:h-28 md:w-28 lg:h-32 lg:w-32"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span className="block h-[88px] w-[88px] overflow-hidden rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white md:h-28 md:w-28 lg:h-32 lg:w-32">
              <span className="flex h-full w-full items-center justify-center text-[32px] font-semibold text-neutral-400 md:text-[38px] lg:text-[44px]">
                {name.charAt(0).toUpperCase()}
              </span>
            </span>
          )}
          {/* Rendered only when the server could actually read last_seen_at —
              the white ring keeps it legible against any avatar. */}
          {member.online !== null && (
            <span
              className={cn(
                "absolute bottom-1 right-1 h-4 w-4 rounded-full ring-[3px] ring-white md:h-[18px] md:w-[18px]",
                member.online ? "bg-emerald-500" : "bg-neutral-300",
              )}
              aria-label={member.online ? t("mfeed.online") : t("mfeed.offline")}
            />
          )}
        </div>

        {/* Beside the avatar and BELOW the cover's edge, so the name is on
            white whatever anybody uploads. Text over a photograph is the one
            part of the reference layout that cannot survive being handed to
            users: it is legible over the picture the designer chose and over
            nothing else. */}
        {/* Pushed to the right edge, which is where the one control on this row
            belongs. Left-aligned it sat in the middle of the header, beside an
            avatar and in front of nothing — a button with a column of empty
            space after it reads as unfinished, and on a wide screen it was
            marooned a long way from anything. Every profile surface puts this
            control in the top-right corner of the header row. */}
        <div className="flex min-w-0 flex-1 justify-end pt-3">
          {isOwner ? (
            <Link
              href="/profile/edit"
              prefetch
              // Leaves the same way a conversation does: the screen behind eases
              // down with the finger and the subpage carries on from there,
              // rather than the profile sitting still until the route commits.
              // See lib/tab-leave.ts.
              onClick={() => {
                void triggerHaptic("light")
                beginTabLeave()
              }}
              className={cn(
                "no-tap-fade relative inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-800",
                "after:absolute after:-inset-x-3 after:-inset-y-2.5 after:content-['']",
                // NO PRESS-SCALE. It shrank to 0.94 and sprang back — a bump
                // big enough to read as the button flinching, on a control that
                // then leaves the screen anyway. The screen transition is
                // already the feedback; a zoom in front of it is a second
                // animation competing with the one that matters.
                "transition-colors duration-200 ease-out active:duration-0 active:bg-neutral-100",
              )}
            >
              Editează profilul
            </Link>
          ) : (
            <FollowButton userId={member.id} variant="quiet" />
          )}
        </div>
      </header>

      {/* Name, handle and the rest on the full measure rather than in the
          column left over beside the avatar. At 375px that column is about a
          hundred pixels once the avatar and the button have taken theirs, which
          is where "Membr…" and every other truncated line came from. */}
      {/* The line height is STATED, not inherited.
          
          /profile/loading.tsx reserves a box for each of these a beat earlier,
          and a line box that depends on whatever the document happens to set
          means the two can disagree — which is a few pixels of vertical shift
          on every arrival, in the part of the page the eye is fixed on. Every
          measurement below has a counterpart in that file. */}
      <h1 className="mt-3 truncate text-[22px] font-bold leading-[28px] tracking-[-0.015em] text-neutral-900 md:text-[28px] md:leading-[34px] lg:text-[32px] lg:leading-[38px]">
        {name}
      </h1>
      <p className="truncate text-[13.5px] leading-[18px] text-neutral-500 md:text-[15px] md:leading-[20px]">
        @{member.username}
      </p>
      {/* Where the identity stops being on the page and starts being in the
          bar. Zero height and nothing drawn — the observer watching it is the
          entire point. */}
      <span ref={nameEndRef} aria-hidden className="block h-0 w-full" />

      {/* Reviews strip — appears only once the seller has at least one
          review, so a new seller isn't introduced by an empty zero. */}
      {reviews && (
        <div className="mt-2 flex items-center gap-1.5">
          <Stars value={reviews.average} />
          <span className="text-[12.5px] font-semibold text-neutral-700 tabular-nums">
            {reviews.average.toLocaleString(language === "ro" ? "ro-RO" : "en-GB", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}
          </span>
          <span className="truncate text-[12.5px] text-neutral-400">({reviewsLabel(reviews.count, language)})</span>
        </div>
      )}

      {/* WHO THIS PERSON IS, in their own words.
          
          The one thing a marketplace profile could not say. A buyer deciding
          whether to send a stranger sixty euros is answering a question no
          number on this page addresses, and two sentences about what somebody
          sells and how fast they post answers more of it than the follower
          count ever will.
          
          `whitespace-pre-line` so paragraph breaks survive; the API already
          collapses runs of three or more, so a bio cannot push the header open
          by holding down return. */}
      {bio && (
        <p className="mt-3 max-w-[620px] whitespace-pre-line text-[14.5px] leading-relaxed text-neutral-700">{bio}</p>
      )}

      {/* The line box is stated rather than inherited: /profile/loading.tsx
          reserves exactly this much room a beat earlier, and a line height that
          depends on whatever the document sets would let the two disagree. */}
      {meta && <p className="mt-3 text-[12.5px] leading-[18px] text-neutral-400">{meta}</p>}

      {/* The social shape of the profile in one glance — the row every
          marketplace profile teaches people to look for. Counts are compact
          ("1,2K") past a thousand, because the exact figure stops mattering
          exactly when it stops fitting.

          It is a card now rather than three numbers over a hairline. Three
          left-aligned pairs with a rule underneath were the most unfinished
          thing on the screen: nothing said they belonged together, and the
          hairline was doing double duty as both their container and the
          section break below. On the white card they read as one object, they
          give the wash above something to end against, and the thirds put each
          number where the eye expects the next one. */}
      {/* Capped on a wide screen. Stretched to 1100px the three cells become
          three numbers marooned in a lot of white, which is the "not adapted for
          desktop" look — a phone card scaled up rather than a desktop one. */}
      <div className="mt-5 grid w-full max-w-md grid-cols-3 divide-x divide-neutral-200/70 rounded-2xl border border-neutral-200/70 bg-white md:mt-7">
        <Stat value={listingsCount} label={language === "ro" ? "Articole" : "Listings"} lang={language} />
        <Stat value={followersCount} label={language === "ro" ? "Urmăritori" : "Followers"} lang={language} />
        <Stat value={followingCount} label={language === "ro" ? "Urmărește" : "Following"} lang={language} />
      </div>

      {/* The shop, announced. Without a heading the grid simply started, and an
          empty profile had nothing at all between the stats row and blank
          space — which is most of why the screen read as failing to load
          rather than as a shop with nothing in it yet. */}
      <section ref={shelfRef} className="mt-6 flex min-h-0 flex-1 flex-col md:mt-8">
        {/* Not simply "Articole": the stats row directly above already carries
            that word, and the same label twice in ten vertical pixels reads as
            a template that was never finished.

            The count sits at the far end of the same baseline. It is the same
            number the stats card states, but here it is doing a different job —
            it closes the heading row, so the grid below starts under a line
            that spans the measure instead of under a phrase that trails off. */}
        {/* The tab strip. Underline marks the current one — the same mark
            every app in this category uses — and the listing count keeps its
            place next to the word it counts. */}
        <div className="relative flex items-stretch border-b border-neutral-200/80">
          <ShelfTab
            active={shownTab === "listings"}
            onClick={() => goToTab("listings")}
            count={listingsCount > 0 ? listingsCount : null}
          >
            {language === "ro" ? "Anunțuri" : "Listings"}
          </ShelfTab>
          <ShelfTab
            active={shownTab === "reviews"}
            onClick={() => goToTab("reviews")}
            count={reviews?.count ? reviews.count : null}
          >
            Evaluări
          </ShelfTab>
          {/* ONE BAR THAT TRAVELS, not two borders swapping which is black.
              Half the strip wide, moved by its own width — so it lands exactly
              under either tab whatever the measure is — and moved by transform,
              so it is the compositor's problem and not the layout's. */}
          <span
            aria-hidden
            className="absolute -bottom-px left-0 h-[2px] w-1/2 rounded-full bg-neutral-900 transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
            style={{ transform: `translate3d(${shownTab === "reviews" ? 100 : 0}%, 0, 0)` }}
          />
        </div>

        {/* BOTH PANELS, ONE HIDDEN. `hidden` is display:none, so the inactive
            panel costs no layout and adds no height — which is what stops the
            page being taller than what is on it. And nothing is re-mounted, so
            the switch is a class change: no images decoded twice, no work at
            all on the frame it happens.

            The active one replays a short rise-and-fade, keyed on the tab, so
            the change is READ as a change without anything having to travel
            across the screen. 180ms, because the panel is already there —
            there is nothing to wait for and a longer curve would only be
            waiting. */}
        <div className={cn("shelf-panel", shelfTab === "reviews" ? "block" : "hidden")}>
          {/* Mounted on first visit and never unmounted after: the second
              switch and every one after it costs nothing at all.

              The animation class is CONDITIONAL rather than fixed. It used to
              be written straight on here, which meant it played once — on the
              mount — and every switch back to this tab after that was a cut,
              while the listings panel (whose class was already conditional)
              animated every time. Two tabs behaving differently is worse than
              neither animating. */}
          {reviewsSeen && (
            <div key="reviews" className={panelIn("reviews")}>
              <SellerReviewsList
                sellerUserId={member.id}
                isOwner={isOwner}
                // Counted on the server for the header's stars. Zero means the
                // empty state is drawn on the first frame — no request, no
                // skeleton, no second layout a second later.
                knownCount={reviews === undefined ? undefined : (reviews?.count ?? 0)}
              />
            </div>
          )}
        </div>

        <div className={cn("shelf-panel", shelfTab === "listings" ? "block" : "hidden")}>
        <div key="listings" className={panelIn("listings")}>
        {listings.length === 0 ? (
          // An empty shop is a normal state for a new member, not an error — so
          // it is drawn in the same language as the inbox's empty screens
          // (circle, one line, one sentence) rather than left as a stray
          // sentence floating in the middle of the page. It takes `flex-1` so
          // it fills exactly what is left below the heading: asking for a fixed
          // height here is what made a page with nothing on it scroll. The svh
          // floor only matters in the layouts where a percentage height cannot
          // resolve, and it stays under one screen on purpose.
          // CENTRED, AND ACTUALLY CENTRED.
          //
          // It was `pt-6 pb-10`, so the block was pushed four pixels of padding
          // shy of a quarter of an inch above where "centred" would put it, and
          // then the whole page ended with ten more below the button — a strip
          // of empty white under the last thing on the screen that nothing
          // stood in for. Symmetrical padding means the space above the hanger
          // and the space below the button are the same, which is the only
          // arrangement that reads as deliberate when there is nothing else on
          // the screen to compare it against.
          //
          // The `min-h-[38svh]` floor is gone too. `flex-1` already takes
          // everything left between the heading and the bottom of the column,
          // and a viewport-relative minimum on top of that is a second, louder
          // opinion about the same height — on a short screen it forced the
          // page taller than the window and gave a profile with nothing on it
          // something to scroll.
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            {/* Moving, and drawn rather than played from a file — see
                components/member/empty-shelf.tsx. An empty state is the one
                screen with nothing on it to hold anybody's attention, which is
                exactly why the single mark on it should be alive. */}
            <EmptyShelf className="mb-5" />
            <p className="text-[17px] font-semibold text-neutral-900">
              {isOwner ? "Niciun articol listat" : "Niciun articol încă"}
            </p>
            <p className="mt-1.5 max-w-[280px] text-[14px] leading-relaxed text-neutral-500">
              {isOwner
                ? "Fă câteva poze, pune un preț și articolul apare aici în câteva minute."
                : "Când acest membru listează ceva, apare aici."}
            </p>
            {/* On your own profile the same emptiness is something you can act
                on, so it carries the one thing you'd want from it. */}
            {isOwner && (
              <Link
                href="/products/new"
                prefetch
                className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
              >
                Listează un articol
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 pb-10 md:mt-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 md:pb-16 lg:grid-cols-4">
            {listings.map((listing, i) => {
              /* A state mark on YOUR shelf and nobody else's. Without it a
                 draft, an archived listing and a live one are the same card,
                 and the only clue that two of them are off the feed is that
                 nobody ever buys them. */
              const badge = isOwner ? ownerStatusBadge(listing.status) : null
              return (
                <ProductCard
                  key={listing.id}
                  product={listing}
                  origin="member"
                  // Every card here belongs to the seller named just above —
                  // repeating their name under each photo would only add noise.
                  showSeller={false}
                  priority={i < 4}
                  // A draft has no listing page — the route 404s for anything
                  // unpublished — so its card reopens the form it was left in.
                  hrefOverride={isOwner ? ownerListingHref(listing) : undefined}
                  statusBadge={
                    badge ? (
                      <span
                        className={cn(
                          "pointer-events-none absolute left-2 top-2 rounded-full px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-white",
                          badge.tone === "warning" && "bg-amber-500",
                          badge.tone === "muted" && "bg-neutral-500/90",
                          // Solid, not 85%. A translucent black over a
                          // photograph is a different black on every card, and
                          // the one that landed on a pale garment read as grey.
                          badge.tone === "neutral" && "bg-neutral-900",
                        )}
                      >
                        {badge.label}
                      </span>
                    ) : undefined
                  }
                  cornerAction={
                    isOwner ? (
                      /* THE HEART IS THE WRONG CONTROL ON YOUR OWN CARD, twice
                         over: saving your own listing does nothing anybody
                         wants, and this corner is the only place on a grid card
                         where a per-item menu can live. "Fix that title" starts
                         HERE, looking at the grid — a trip through the listing
                         page to reach the same actions is a corridor with
                         nothing in it. */
                      <button
                        type="button"
                        aria-label={`Gestionează ${listing.title}`}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          void triggerHaptic("light")
                          setManageFor(listing)
                        }}
                        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-neutral-800 shadow-[0_1px_5px_rgba(0,0,0,0.2)] transition-transform duration-150 active:scale-90"
                      >
                        <MoreHorizontal className="h-[19px] w-[19px]" strokeWidth={2.4} />
                      </button>
                    ) : undefined
                  }
                />
              )
            })}
          </div>
        )}
        </div>
        </div>
      </section>


      {isOwner && shown && (
        <ManageListingSheet
          key={shown.id}
          open={manageFor !== null}
          onClose={() => setManageFor(null)}
          listingId={shown.id}
          status={shown.status ?? "published"}
          title={shown.title}
        />
      )}

      {avatarOpen && member.avatarUrl && (
        <ImageViewer src={member.avatarUrl} alt={name} onClose={() => setAvatarOpen(false)} />
      )}

      {/* One line, on the one action with no other way of confirming itself.
          A share sheet closes over the app and that IS the confirmation; a
          clipboard write looks exactly like nothing happening. */}
      {/* Portalled to the body, like the image viewer and the offer sheet, and
          for the same reason: it is `position: fixed`, and the return animation
          above puts a transform on this element — which would make THIS the box
          the toast is fixed to instead of the screen, and drop it somewhere down
          the page. Everything fixed on a surface that animates has to leave it. */}
      {shared && typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[110] flex justify-center px-6">
            <span className="rounded-full bg-neutral-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg">
              Link copiat
            </span>
          </div>,
          document.body,
        )}
    </div>
  )
}

/**
 * One of the round controls on the cover.
 *
 * A link when it goes somewhere and a button when it does something, rather
 * than one element pretending to be both — the difference is what a screen
 * reader announces and whether a long-press offers "open in new tab".
 *
 * Glass rather than a solid disc: the cover behind it is the personal part of
 * the page and four opaque circles punched into it is four holes. The blur and
 * the hairline are what keep a white glyph legible over a pale photograph
 * without hiding what it is sitting on.
 */
function CoverButton({
  label,
  href,
  onClick,
  children,
}: {
  label: string
  href?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const cls =
    "flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-md ring-1 ring-white/25 transition-transform active:scale-[0.92] md:hover:bg-black/35"
  if (href) {
    return (
      <Link
        href={href}
        prefetch
        aria-label={label}
        className={cls}
        // The screen starts leaving with the finger, the same way the tab bar
        // and a conversation do — otherwise the profile sits perfectly still
        // until the route commits, and the transition begins after the wait
        // rather than covering it. See lib/tab-leave.ts.
        onClick={() => {
          void triggerHaptic("light")
          beginTabLeave()
        }}
      >
        {children}
      </Link>
    )
  }
  return (
    <button type="button" aria-label={label} className={cls} onClick={onClick}>
      {children}
    </button>
  )
}

