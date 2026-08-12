"use client"

import { SurfaceClaim } from "@/components/surface-claim"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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
import { pinnedOffset, usePinnedBar } from "@/lib/marketplace/use-pinned-bar"
import { SellerReviewsList } from "@/components/member/seller-reviews-list"
import { SavedShelf } from "@/components/member/saved-shelf"
import { ProfilePinnedHeader } from "@/components/member/profile-pinned-header"
import { ManageListingSheet } from "@/components/product/manage-listing-sheet"
import { MoreHorizontal } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
import { beginTabLeave } from "@/lib/tab-leave"
import { consumeNavHint } from "@/lib/screen-transition"
import { AvatarPhoto } from "@/components/ui/initial-avatar"
import { ProfileBadges } from "@/components/marketplace/profile-badges"
import { coverImageUrl, defaultCoverFor, resolveCover } from "@/lib/profile/covers"
import { savedShelfHref } from "@/lib/marketplace/saved-items"
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
  /** The blue check, and the Storelib mark that says "Storelib Admin". See
   *  components/marketplace/profile-badges.tsx. */
  verified?: boolean | null
  staff?: boolean | null
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
/**
 * ===========================================================================
 *  THE PAGE TRAVELLING TO THE SHELF
 * ===========================================================================
 *
 * Two journeys, one movement. Switching tabs brings the strip UP to the top of
 * the viewport before the panels swap; landing on /member/<handle>/saved brings
 * it DOWN, because the URL asked for a tab that starts a screenful below the
 * fold. Same curve, same duration, same cancel-on-touch — they are the same
 * gesture for the same reason, and two easings for one gesture is how a screen
 * ends up feeling assembled rather than designed.
 *
 * WRITTEN AS A rAF LOOP RATHER THAN `behavior: "smooth"`, and the reason is the
 * callback. A tab switch must swap its panels when the scroll ENDS, and there is
 * no reliable way to be told that: `scrollend` is not on Safari, and a timer
 * beside a native smooth scroll is a guess at a duration the browser chooses.
 * Driving it here makes the end a fact.
 *
 * `run` is a shared counter, not one per call. A second glide starting while the
 * first is in flight — impatient tapping, a switch during the arrival — must
 * cancel the first rather than fight it for `window.scrollTo`, and a counter
 * both of them increment is what makes the loser notice it has lost.
 *
 * A finger on the screen cancels it and finishes immediately. A page that keeps
 * gliding somewhere while you are trying to scroll it yourself is the one thing
 * worse than the jump this replaces.
 */
const SCROLL_MS = 380

function glideBy(distance: number, run: { current: number }, done?: () => void): void {
  const from = window.scrollY
  const started = performance.now()
  const id = ++run.current

  // Eases out for most of its length, so it is a scroll you can follow to its
  // destination — which is the whole difference between being taken somewhere
  // and being put there.
  const ease = (t: number) => 1 - Math.pow(1 - t, 3)

  const stop = () => {
    if (id !== run.current) return
    run.current++
    window.removeEventListener("touchstart", stop)
    window.removeEventListener("wheel", stop)
    done?.()
  }
  window.addEventListener("touchstart", stop, { passive: true, once: true })
  window.addEventListener("wheel", stop, { passive: true, once: true })

  const step = (now: number) => {
    if (id !== run.current) return
    const t = Math.min(1, (now - started) / SCROLL_MS)
    window.scrollTo(0, from + distance * ease(t))
    if (t < 1) {
      requestAnimationFrame(step)
      return
    }
    stop()
  }
  requestAnimationFrame(step)
}

/**
 * The three panels the shelf can be showing.
 *
 * "saved" exists only on your own profile — see the note on the tab list in
 * MemberProfile for why a wishlist is not somebody else's business, and why a
 * tab for it on a stranger's page would show the reader their own list rather
 * than leaking anybody's.
 */
type ShelfTabId = "listings" | "saved" | "reviews"

function ShelfTab({
  id,
  active,
  onClick,
  count,
  children,
}: {
  id: string
  active: boolean
  onClick: () => void
  count: number | null
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      // Read by the underline, which measures the active tab rather than
      // computing a fraction — see the note beside `bar` in MemberProfile.
      data-tab={id}
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={cn(
        // ── ON A PHONE: equal columns, centred ────────────────────────────
        // The names share the full measure the way the feed's own
        // Pentru tine / Urmărești / Salvate strip does, because at 375px there
        // is no room for anything else and thirds are the convention.
        "relative flex flex-1 items-baseline justify-center gap-1.5 pb-2.5 pt-1 text-[15px]",
        // ── ON A DESKTOP: the size of the word, at the start of the line ───
        // `flex-1` on a 1100px column made each tab five hundred pixels wide
        // with one word floating in the middle of it, and the underline half
        // the page across. That is the single loudest "a phone layout has been
        // stretched" tell on this screen: nothing on a desktop tab strip is
        // full-width, because the strip is a set of labels rather than a row of
        // targets sized for a thumb.
        "md:flex-none md:justify-start md:pb-3 md:text-[16px]",
        "transition-[color,transform] duration-150 active:scale-[0.97] md:active:scale-100",
        active ? "font-semibold text-neutral-900" : "font-medium text-neutral-400 active:text-neutral-600",
        // A pointer gets the hover a pointer expects; a finger gets nothing,
        // because :hover on touch sticks after the tap.
        !active && "[@media(hover:hover)]:hover:text-neutral-600",
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
  initialTab = "listings",
}: {
  member: MemberSummary
  /** Exact total from the server — the grid itself is capped, so it may show fewer. */
  listingsCount: number
  followersCount: number
  followingCount: number
  listings: MemberListing[]
  /**
   * The person reading is the person shown.
   *
   * Always true on /profile, and true on /member/<handle> when the session says
   * that handle is yours — the two routes render this same component and the
   * same person can arrive at either. It decides the Edit button over Follow,
   * the per-listing ⋯ menu, and whether the Salvate tab exists at all.
   */
  isOwner?: boolean
  /** Already counted on the server. Passing it means the stars are in the first
   *  paint instead of appearing a moment after the rest of the header, and the
   *  client makes no request at all. */
  reviews?: ReviewsSummary | null
  /**
   * Which tab the URL asked for — see app/(marketing)/member/[username]/saved.
   *
   * It seeds the state rather than being applied by an effect, so the panel the
   * address names is the one in the FIRST paint. Landing on Anunțuri and being
   * moved to Salvate a frame later is a page correcting itself in front of you,
   * and it is the difference between an address and a redirect.
   */
  initialTab?: "listings" | "saved"
}) {
  const { t, language } = useLocale()

  /**
   * The stars, and the number beside Evaluări in the strip.
   *
   * Read up here rather than beside the header it decorates, because the tab
   * list below needs the count and the tab list has to exist before `goToTab`
   * closes over it. `reviewsFromServer` is what /profile and /member both pass;
   * the hook is the fallback for any caller that does not, and it is handed
   * `null` — which makes it fetch nothing at all — whenever the server answered.
   */
  const fetchedReviews = useSellerReviews(reviewsFromServer === undefined ? member.id : null)
  const reviews = reviewsFromServer === undefined ? fetchedReviews : reviewsFromServer

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
   * THE SHELF'S TABS — Anunțuri, Salvate, Evaluări.
   *
   * Ciorne was one once, and it was the wrong shape for what a draft is. A draft
   * is not a different KIND of thing needing its own room; it is one of your
   * listings, in a state. Behind a tab it made the shelf disagree with itself
   * about how many listings you had, and a draft started yesterday was
   * somewhere you had to remember to go and look. It sits in the grid now with
   * a Ciornă badge, and tapping it reopens the form exactly where you left it.
   *
   * What is left is three questions about the same person: what they are
   * selling, what they have kept, and what people said about them.
   *
   * ---------------------------------------------------------------------------
   * SALVATE IS DRAWN ON YOUR OWN PROFILE AND NOWHERE ELSE
   * ---------------------------------------------------------------------------
   * A wishlist says what somebody wants, what they can afford and what size they
   * are, which is more than most people would publish deliberately and none of
   * it something they were asked about. Every marketplace in this category keeps
   * it private, and the plumbing here agrees: /api/wishlist answers for whoever
   * is holding the cookie and has no form that reads another account's list. So
   * the tab on a stranger's profile would not leak their saved items — it would
   * show YOUR OWN under THEIR name, which is the worse of the two failures
   * because it is confidently wrong.
   *
   * It follows `isOwner`, which is true on /profile and on /member/<your own
   * handle> — see the session check in that page. The Salvate shortcut in the
   * cover was the only way to this list before and it left the profile for
   * /wishlist; it stays, because a whole page for the list is still worth
   * having, but it is no longer the only door.
   */
  const [shelfTab, setShelfTab] = useState<ShelfTabId>(() =>
    // Seeded, not applied afterwards: the panel the address names is in the
    // first paint. `isOwner` is checked here as well as in the tab list because
    // this is state and the list is markup — a "saved" tab id with no tab to
    // match it would leave the strip with no underline at all.
    initialTab === "saved" && isOwner ? "saved" : "listings",
  )
  /**
   * The strip, in order, with the counts that sit beside the words.
   *
   * Built rather than written out three times because the underline, the
   * direction of the slide and the panels all have to agree about which tabs
   * exist and in what order — and on somebody else's profile there are two of
   * them, not three. Three copies of that condition is how a strip ends up with
   * an underline that lands between two tabs.
   */
  const tabs = useMemo(() => {
    const list: { id: ShelfTabId; label: string; count: number | null }[] = [
      { id: "listings", label: language === "ro" ? "Anunțuri" : "Listings", count: listingsCount > 0 ? listingsCount : null },
    ]
    if (isOwner) list.push({ id: "saved", label: language === "ro" ? "Salvate" : "Saved", count: null })
    list.push({ id: "reviews", label: "Evaluări", count: reviews?.count ? reviews.count : null })
    return list
  }, [isOwner, language, listingsCount, reviews?.count])
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
   *     which is exactly "empty space, then it jumps back". The page is brought
   *     to the strip on every switch now, which is what every app in this
   *     category does and the only thing that removes the clamp rather than
   *     hiding it. The ORDER that travel happens in changed later — see "THE
   *     PANEL CHANGES FIRST" below — but the travel itself is why the clamp is
   *     gone.
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
  /** The same rule for Salvate: mounted on first visit, `hidden` after. Its list
   *  comes from a cache the feed's own tab has usually already filled, so the
   *  first open is normally instant too — see lib/marketplace/saved-items.ts.
   *
   *  Already true when the ADDRESS is the saved one: the panel has to exist in
   *  the first paint, not be mounted by an effect after it. */
  const [savedSeen, setSavedSeen] = useState(() => initialTab === "saved" && !!isOwner)
  /**
   * Bumped every time Salvate is opened, so the panel rebuilds from the cache.
   *
   * Un-saving a card does not empty the list under your finger — the heart
   * unfills and the card stays. This is what makes it gone the NEXT time you
   * look, which is the only moment a list can reorder without it happening to
   * something somebody was reading.
   */
  const [savedVisit, setSavedVisit] = useState(0)

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
   *  THE PANEL CHANGES FIRST, AND THEN THE PAGE GLIDES TO IT
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * This used to be the other way round, with a `pending` tab for the STRIP and
   * the real one landing when the scroll finished. The reasoning was sound —
   * swapping panels mid-scroll changes the document height under an animation
   * aimed at the old one — but the order it produced was not, and it cost three
   * things:
   *
   *   THE STRIP LIED FOR THE LENGTH OF THE GLIDE. The underline sat under
   *   Salvate while the grid underneath still showed Anunțuri. That is the
   *   whole of "the switch is not accurate": for ~380ms the page disagreed with
   *   itself about which tab you were on.
   *
   *   TWO TAPS COULD LAND ON THE WRONG TAB. Tap Salvate from far down the page
   *   and a glide starts. Tap Evaluări while it runs and — because the strip is
   *   near the top by then — that one commits IMMEDIATELY. Then the first
   *   glide finishes and calls its own commit, setting the tab back to Salvate.
   *   The last tab you asked for is not the tab you get.
   *
   *   AND `setDir` RAN INSIDE A `setShelfTab` UPDATER. A state updater must be
   *   pure; React may call it more than once for a single update and does
   *   exactly that in StrictMode, so the direction the panel slid from was
   *   decided by a side effect in a function that is allowed to run twice.
   *
   * Committing first fixes all three, and it does NOT reintroduce the height
   * problem it was written to avoid — because the scroll target is measured
   * AFTER the swap has been laid out. The old order measured against a height
   * that was about to change; this one measures the page the tab actually
   * produces, and the document then holds still for the whole glide.
   *
   * The travel itself is `glideBy` at the top of this file — shared with the
   * arrival scroll that lands on /member/<handle>/saved, and the note there
   * covers the rAF loop, the shared run counter and the cancel-on-touch.
   */
  const scrollRun = useRef(0)

  /** The strip and the panels read the SAME value. There is no second one to
   *  drift from it — see the note above. */
  const shownTab = shelfTab

  /**
   * Where each tab sits, so the underline is never derived from a fraction.
   *
   * It used to be `w-1/2` translated by `100%`, which is exact for two tabs of
   * equal width and wrong for everything else — a third tab makes it half a
   * strip too wide, and the desktop layout below sizes tabs to their labels, so
   * "Anunțuri", "Salvate" and "Evaluări" are three different widths on the same
   * line. Neither is expressible as a fraction of anything.
   *
   * So the active tab is MEASURED and the bar is given its left and its width.
   * That is one read per switch on an element that is already in the DOM, and it
   * is correct for any number of tabs at any width in any language — including
   * the one that matters here, where the same three words are longer in English
   * than in Romanian.
   *
   * `null` until the first measurement, and the bar is not rendered until then:
   * an element that has never been laid out has no width to animate FROM, so
   * without this the first paint of every profile would be a two-pixel line
   * growing out of the left edge.
   */
  const stripRef = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return

    /**
     * RECTS, NOT `offsetLeft`.
     *
     * `offsetLeft` and `offsetWidth` are ROUNDED TO INTEGERS. The strip is a
     * flex row with a 36px gap and labels sized by their text, so tab
     * boundaries land on fractional pixels all the time — and a bar placed from
     * rounded numbers sits up to a pixel off the word it is underlining, on
     * every tab, at most widths. `getBoundingClientRect` is fractional, and
     * measuring the tab against the STRIP's own rect rather than the viewport
     * keeps it correct however the page is scrolled.
     */
    const measure = () => {
      const el = strip.querySelector<HTMLElement>(`[data-tab="${shownTab}"]`)
      if (!el) return
      const s = strip.getBoundingClientRect()
      const t = el.getBoundingClientRect()
      const next = { left: t.left - s.left, width: t.width }
      setBar((prev) =>
        prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5 ? prev : next,
      )
    }
    measure()

    /**
     * AND EVERY TAB IS OBSERVED, NOT JUST THE STRIP.
     *
     * The strip is a full-width block: when a label reflows — the interface
     * font landing after first paint, a count arriving beside "Evaluări", a
     * language change — the TABS move but the strip's own box does not, so an
     * observer watching only the strip never fires and the bar is left under
     * where the word used to be. That is the underline being "not accurate",
     * and it is invisible until you look for it because it is a pixel or two.
     */
    const cleanups: (() => void)[] = []
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure)
      ro.observe(strip)
      strip.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => ro.observe(el))
      cleanups.push(() => ro.disconnect())
    }

    // The font is the one reflow that can land long after everything else and
    // moves every label at once. `fonts.ready` is the direct signal for it; the
    // observers above would catch it too, but only if the strip's own box
    // happened to change.
    let alive = true
    void (document as any).fonts?.ready?.then?.(() => {
      if (alive) measure()
    })
    cleanups.push(() => {
      alive = false
    })

    return () => cleanups.forEach((fn) => fn())
  }, [shownTab, tabs])

  const goToTab = useCallback(
    (next: ShelfTabId) => {
      // Re-tapping the tab you are already on.
      if (next === shelfTab) return
      void triggerHaptic("light")

      // The direction the strip is travelling, from the ORDER the tabs are in
      // rather than from their names — with three of them "reviews" is to the
      // right of Salvate and Salvate is to the right of Anunțuri, and a test on
      // one id cannot say that.
      const fromIndex = tabs.findIndex((tb) => tb.id === shelfTab)
      const toIndex = tabs.findIndex((tb) => tb.id === next)

      /**
       * EVERYTHING THAT DECIDES WHAT IS ON SCREEN HAPPENS ON THIS TICK.
       *
       * React batches these, so the next render has the new tab, the new
       * direction and the new mount flags together — the strip and the panel
       * cannot be a frame out of step with each other, which is exactly what
       * they used to be for the length of the scroll.
       *
       * `setDir` is a call in an event handler, not a line inside a state
       * updater. That is the whole of its correctness: an updater must be pure
       * and may be invoked twice, and a side effect in one is a coin flip.
       */
      setDir(toIndex > fromIndex ? "right" : "left")
      // Mounted on the SAME tick as the swap. The panel is `hidden` when it is
      // not the active one, so it costs no layout and adds no height — but the
      // reviews request is a round trip, and starting it here means it is in
      // flight while the page glides rather than beginning on the frame the
      // panel appears.
      if (next === "reviews") setReviewsSeen(true)
      if (next === "saved") {
        setSavedSeen(true)
        // Opening the tab is what rebuilds the list from the cache — see the
        // note on `savedVisit`.
        setSavedVisit((n) => n + 1)
      }
      setShelfTab(next)

      /**
       * AND THE SCROLL IS MEASURED AFTER THE SWAP HAS BEEN LAID OUT.
       *
       * Two frames, not one. The first `rAF` lands after React has committed
       * the new tab; the browser lays out and, if the arriving panel is
       * shorter, clamps the scroll position in the same pass. The second lets
       * that settle. Only then is `getBoundingClientRect()` describing the page
       * the tab actually produced — measuring before the swap is how a glide
       * ends up aimed at a height that no longer exists.
       */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = shelfRef.current
          if (!el) return
          const top = el.getBoundingClientRect().top - pinnedOffset()
          const reduced =
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

          // Already in view, or somebody has asked for less motion: there is
          // nothing to travel, so the swap was the whole interaction.
          if (top >= -1 || reduced) {
            if (top < 0) window.scrollBy({ top, behavior: "auto" })
            return
          }
          // No completion callback any more — nothing is waiting on the scroll,
          // which is why a superseded glide can no longer set the tab back to
          // one you have already moved on from.
          glideBy(top, scrollRun)
        })
      })
    },
    [shelfTab, tabs],
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  LANDING ON /member/<handle>/saved
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * The URL asked for a tab, so the tab is already the one showing — `shelfTab`
   * is seeded from `initialTab` and its panel is mounted before the first paint.
   * What is left is that the strip is a screenful down the page, under the
   * cover, the avatar, the name and the stats: arriving at the top of a profile
   * having asked for its Salvate tab is arriving at the wrong place and being
   * expected to scroll.
   *
   * So the page glides to the strip, once, on arrival. The SAME glide a tab
   * switch uses — same curve, same duration, same cancel-on-touch — because it
   * is the same movement for the same reason, and two easings for one gesture is
   * how a screen ends up feeling assembled.
   *
   * Deferred by two frames rather than run on mount. The grid below the strip is
   * what gives the document its height, and a scroll aimed at a page that is
   * still laying out is a scroll that gets clamped: `rAF` twice puts this after
   * the first paint, when the target has stopped moving.
   *
   * `scrollY < 4` is the guard that keeps a restored position safe. Coming BACK
   * to this page — a back gesture, a bfcache restore — the browser has already
   * put you where you were, and gliding somewhere else on top of that is the
   * page overriding a decision that was already correct.
   */
  const arrived = useRef(false)
  useEffect(() => {
    if (arrived.current || initialTab === "listings") return
    arrived.current = true
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const el = shelfRef.current
        if (!el || window.scrollY > 4) return
        const top = el.getBoundingClientRect().top - pinnedOffset()
        if (top <= 1) return
        if (reduced) {
          window.scrollTo(0, window.scrollY + top)
          return
        }
        glideBy(top, scrollRun)
      })
    })
    return () => {
      cancelAnimationFrame(first)
      if (second) cancelAnimationFrame(second)
    }
  }, [initialTab])

  // A tab strip left mid-flight by an unmount would otherwise keep scrolling a
  // page that is no longer here.
  useEffect(() => () => void scrollRun.current++, [])

  /** The class that plays on whichever panel is arriving. Removed from the
   *  inactive one, which is what lets the animation replay on every switch
   *  rather than only on the mount that first added it. */
  const panelIn = (tab: ShelfTabId) =>
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
  /**
   * THE BAR AT THE TOP, ONCE THE NAME HAS GONE.
   *
   * The observer pair and the dead band between their trigger lines live in
   * lib/marketplace/use-pinned-bar.ts, because the listing page needs exactly
   * the same behaviour and "exactly the same" is not something two copies of an
   * IntersectionObserver stay for long. That file also records why the margins
   * are positive, which is the part that was wrong here and made the bar stop
   * appearing altogether.
   */
  const { sentinel: nameEndRef, pinned, left: leftProfile } = usePinnedBar<HTMLSpanElement>()

  /**
   * NOT GUARDED HERE ANY MORE.
   *
   * This screen used to hide its own bar while a modal was over it, with a
   * hand-written list of the paths the bar belongs to — `/profile` and
   * `/member/…`. It was correct and it did not generalise: the listing page grew
   * the same bar, did not copy the list, and the sell form opened with somebody
   * else's chrome across the top of it.
   *
   * `usePinnedBar` captures the path its page was mounted on and reports
   * `pinned` as false whenever the current path is something else, so every bar
   * built on it is covered without its caller having to remember. See the note
   * there for why this is a URL test rather than a z-index one.
   */
  const pathname = usePathname()
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
        username={member.username}
        verified={member.verified}
        staff={member.staff}
        avatarUrl={member.avatarUrl}
        visible={pinned}
        instant={leftProfile}
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
          between the two the app has always had.

          FULL-BLEED ON A DESKTOP TOO, which it was not: it was a 1100px rounded
          card floating in the middle of a 2560px screen with white either side.
          A cover is the top of the page, not a widget ON the page, and every
          profile banner anybody has ever seen runs edge to edge — the rounded
          version reads as a phone layout that has been centred rather than as a
          desktop one. `profile-cover-bleed` in app/globals.css is what escapes
          the column; everything else on the page stays in it, which is the whole
          arrangement: a band across the window, the content centred under it. */}
      <div
        // `profile-cover-live` is what separates the real cover from the pale
        // one the loading shell draws in the same place: it carries the short
        // dissolve that turns the swap between them into a handover instead of
        // a cut. A class rather than an attribute selector, because whether
        // this element happens to have an inline `style` depends on whether the
        // cover is a preset or an uploaded photograph, and that is not what the
        // rule is about.
        className="profile-cover profile-cover-bleed profile-cover-live relative -mx-4 overflow-hidden"
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
            // ONE HUNDRED PERCENT OF THE WINDOW, because that is now what it
            // covers. It said `(min-width: 1100px) 1100px` while the cover was a
            // capped card, and a `sizes` that under-states the box is the one
            // way to make next/image actively worse than a plain <img>: the
            // browser picks a 1100-wide candidate, stretches it across 2560, and
            // the banner is soft on exactly the screens that can show detail.
            sizes="100vw"
            // NOT DRAGGABLE, NOT LONG-PRESSABLE, NOT RIGHT-CLICKABLE. The same
            // treatment the Storelib mark gets and for the same reason it is
            // written down there: none of this is security — anything on a
            // screen can be screenshotted — it is the difference between "you
            // have to mean it" and "it happens by accident". A drag on a
            // full-width banner is very easy to start by accident while
            // scrolling with a mouse, and it ends with the file in whatever
            // window was underneath.
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
            className="profile-cover-photo select-none object-cover [-webkit-touch-callout:none] [-webkit-user-drag:none]"
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
        {/* ALIGNED WITH THE COLUMN, NOT WITH THE WINDOW.

            Now that the band runs edge to edge, `right-4` would park these
            against the far corner of a 2560px screen — seven hundred pixels
            away from the content they belong to, which is a control that has
            floated off rather than one placed. This layer is the page's own
            measure laid over the cover, so they sit exactly above the right-hand
            edge of the avatar-and-name column below. On a phone the measure is
            the screen and nothing about this changes. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="relative mx-auto h-full w-full max-w-[1100px] px-4 md:px-8">
            <div
              className="pointer-events-auto absolute right-4 top-2.5 flex items-center gap-1.5 md:right-8 md:top-4 md:gap-2"
              style={{ marginTop: "var(--cover-inset, 0px)" }}
            >
              <CoverButton label="Distribuie" onClick={share}>
                <Share2 className="h-[17px] w-[17px]" />
              </CoverButton>
              {/* THREE, not four. The pencil is gone: "Editează profilul" is a
                  full labelled button one row below, and an icon meaning the
                  same thing a centimetre away from it is the same door twice —
                  while being, of the four, the one whose glyph says least. */}
              {isOwner && (
                <>
                  {/* Straight to the tab a few hundred pixels below, which is
                      where it now lives. It used to leave the profile entirely
                      for /wishlist — a different page, different chrome, the
                      same items. The handle is known here for certain: this
                      only renders on your own profile. */}
                  <CoverButton label="Salvate" href={savedShelfHref(member.username)}>
                    <Bookmark className="h-[17px] w-[17px]" />
                  </CoverButton>
                  <CoverButton label="Setări" href="/settings">
                    <Settings className="h-[17px] w-[17px]" />
                  </CoverButton>
                </>
              )}
            </div>
          </div>
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
              {/* 128px at the widest breakpoint, which is what the srcset is
                  built from — not the two-megabyte camera photograph somebody
                  uploaded, which is what a bare <img> was fetching here and on
                  every other screen this face appears on. */}
              <AvatarPhoto url={member.avatarUrl} size={128} className="h-full w-full object-cover">
                <span className="flex h-full w-full items-center justify-center text-[32px] font-semibold text-neutral-400 md:text-[38px] lg:text-[44px]">
                  {name.charAt(0).toUpperCase()}
                </span>
              </AvatarPhoto>
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
                // Scaled with the header it sits in from md up. At 1100px an
                // eight-pixel-tall pill beside a 128px avatar is the phone
                // control that came along for the ride.
                "no-tap-fade relative inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-800 md:h-10 md:px-5 md:text-[14px]",
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
      {/* The badges are INSIDE the h1 and the name truncates around them.
          Beside it, in a sibling, a long name would push them off the edge —
          and a verified mark that disappears on long names is a mark that
          disappears exactly where impersonation is easiest. `min-w-0` on the
          name is what lets the ellipsis happen to the text rather than to the
          row. */}
      <h1 className="mt-3 flex items-center gap-1.5 text-[22px] font-bold leading-[28px] tracking-[-0.015em] text-neutral-900 md:text-[28px] md:leading-[34px] lg:text-[32px] lg:leading-[38px]">
        <span className="min-w-0 truncate">{name}</span>
        <ProfileBadges verified={member.verified} staff={member.staff} size={20} />
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
        <div
          ref={stripRef}
          role="tablist"
          // Equal columns on a phone, a row of labels at the start of the line
          // from md up. See the note in ShelfTab for why full-width tabs are the
          // wrong shape on a desktop.
          className="relative flex items-stretch gap-0 border-b border-neutral-200/80 md:gap-9"
        >
          {tabs.map((tb) => (
            <ShelfTab
              key={tb.id}
              id={tb.id}
              active={shownTab === tb.id}
              onClick={() => goToTab(tb.id)}
              count={tb.count}
            >
              {tb.label}
            </ShelfTab>
          ))}
          {/* ONE BAR THAT TRAVELS, not three borders swapping which is black.
              Placed and sized from the measured tab rather than from a fraction
              of the strip — see `bar` above — and moved by transform, so travel
              is the compositor's problem. Width has to transition too now that
              the tabs are not all the same size; it is the one property here
              that costs layout, on a two-pixel line. */}
          {bar && (
            <span
              aria-hidden
              className="absolute -bottom-px left-0 h-[2px] rounded-full bg-neutral-900 transition-[transform,width] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
              style={{ transform: `translate3d(${bar.left}px, 0, 0)`, width: bar.width }}
            />
          )}
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

        {/* SALVATE — the same three rules as the panel above it: mounted on
            first visit, `hidden` rather than unmounted afterwards, and the
            arrival animation is conditional so it replays on every switch
            instead of only on the mount that first added it.

            `isOwner &&` is belt as well as braces: the tab is not in `tabs` for
            anybody else, so `shelfTab` can never be "saved" on a stranger's
            profile — but this panel draws the READER'S saved items and there
            must be no arrangement of state in which it appears under somebody
            else's name. See the note on the tab list above. */}
        <div className={cn("shelf-panel", shelfTab === "saved" ? "block" : "hidden")}>
          {isOwner && savedSeen && (
            <div key="saved" className={panelIn("saved")}>
              <SavedShelf reloadSignal={savedVisit} />
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
  // A hair larger from md up, where the cover it sits on is 250-280px tall and a
  // 36px control reads as a phone widget parked in the corner of a banner.
  const cls =
    "flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-md ring-1 ring-white/25 transition-transform active:scale-[0.92] md:h-10 md:w-10 md:hover:bg-black/35"
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

