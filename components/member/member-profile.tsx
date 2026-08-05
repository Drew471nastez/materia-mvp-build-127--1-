"use client"

import { SurfaceClaim } from "@/components/surface-claim"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Bookmark, Pencil, Settings, Share2, Shirt, Star } from "lucide-react"

import { ProductCard } from "@/components/explore/product-card"
import { FollowButton } from "@/components/explore/follow-button"
import { ProfileEditor } from "@/components/member/profile-editor"
import { useLocale } from "@/components/locale-provider"
import { triggerHaptic } from "@/lib/native-bridge"
import { resolveCover } from "@/lib/profile/covers"
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
  const fetchedReviews = useSellerReviews(reviewsFromServer === undefined ? member.id : null)
  const reviews = reviewsFromServer === undefined ? fetchedReviews : reviewsFromServer

  /**
   * The cover and the bio, held here so an edit shows on the screen behind the
   * editor rather than after it closes. The server is still the truth — the
   * editor calls `router.refresh()` — but a colour you are choosing has to be
   * visible against your own avatar while you choose it, and a round trip is
   * far too long to be the thing that shows it to you.
   */
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState<{ bio: string | null; cover: string | null }>({
    bio: member.bio ?? null,
    cover: member.coverUrl ?? null,
  })
  // The server re-rendered underneath us — a refresh, a navigation back to this
  // page — so what it says wins again. Without this, an edit made in one
  // session would keep overriding a later, truer value for the life of the
  // mount.
  useEffect(() => {
    setLocal({ bio: member.bio ?? null, cover: member.coverUrl ?? null })
  }, [member.bio, member.coverUrl])

  const cover = resolveCover(local.cover, member.id)
  const bio = local.bio

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
    <div className="profile-surface relative isolate mx-auto flex min-h-full w-full max-w-[1100px] flex-col px-4 md:px-8 md:pt-8 lg:pt-10">
      {/* The strip behind the clock is the COVER now, not white.
          
          In the app the page begins under a bar the shell paints over the
          status area, and the cover runs up into it — so the claim has to be
          the cover's own colour or there is a flat white band across the top of
          a photograph. A preset's first colour is a good enough answer for a
          gradient; an uploaded image has no single colour, so its strip is the
          neutral the shell uses everywhere else rather than a guess that could
          be badly wrong. */}
      <SurfaceClaim colour={cover.kind === "preset" ? coverTopColour(cover.preset.css) : "#3f3f46"} />
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
        className="profile-cover relative -mx-4 overflow-hidden md:-mx-8 md:rounded-3xl"
        style={cover.kind === "preset" ? { background: cover.preset.css } : undefined}
      >
        {cover.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* A floor under the buttons. A white glyph on a photograph is legible
            over a dark sky and invisible over a pale one, and there is no way
            to know which anybody uploads — so the corner it lives in is given a
            gradient of its own rather than the whole cover being dimmed. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/25 to-transparent"
        />

        {/* The controls, in the cover rather than in a row above it.
            
            The gear used to sit on its own line over the header, which cost a
            full row of vertical space on a phone to hold one 22px icon. Up here
            they are on a surface that was otherwise doing nothing, they are
            where every profile in every app has trained people to look, and the
            row that held them is gone. */}
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5" style={{ marginTop: "var(--cover-inset, 0px)" }}>
          <CoverButton label="Distribuie" onClick={share}>
            <Share2 className="h-[17px] w-[17px]" />
          </CoverButton>
          {isOwner && (
            <>
              <CoverButton label="Salvate" href="/wishlist">
                <Bookmark className="h-[17px] w-[17px]" />
              </CoverButton>
              <CoverButton label="Editează profilul" onClick={() => setEditing(true)}>
                <Pencil className="h-[17px] w-[17px]" />
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
          <span className="block h-[88px] w-[88px] overflow-hidden rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white md:h-28 md:w-28 lg:h-32 lg:w-32">
            {member.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[32px] font-semibold text-neutral-400 md:text-[38px] lg:text-[44px]">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
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
        <div className="min-w-0 flex-1 pt-3">
          {isOwner ? (
            <button
              type="button"
              onClick={() => {
                void triggerHaptic("light")
                setEditing(true)
              }}
              className={cn(
                "no-tap-fade relative inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-800",
                "after:absolute after:-inset-x-3 after:-inset-y-2.5 after:content-['']",
                "transition-transform active:scale-[0.94]",
              )}
            >
              Editează profilul
            </button>
          ) : (
            <FollowButton userId={member.id} variant="quiet" />
          )}
        </div>
      </header>

      {/* Name, handle and the rest on the full measure rather than in the
          column left over beside the avatar. At 375px that column is about a
          hundred pixels once the avatar and the button have taken theirs, which
          is where "Membr…" and every other truncated line came from. */}
      <h1 className="mt-3 truncate text-[22px] font-bold tracking-[-0.015em] text-neutral-900 md:text-[28px] lg:text-[32px]">
        {name}
      </h1>
      <p className="truncate text-[13.5px] text-neutral-500 md:text-[15px]">@{member.username}</p>

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
      <section className="mt-6 flex min-h-0 flex-1 flex-col md:mt-8">
        {/* Not simply "Articole": the stats row directly above already carries
            that word, and the same label twice in ten vertical pixels reads as
            a template that was never finished.

            The count sits at the far end of the same baseline. It is the same
            number the stats card states, but here it is doing a different job —
            it closes the heading row, so the grid below starts under a line
            that spans the measure instead of under a phrase that trails off. */}
        <div className="flex h-[22px] items-baseline justify-between gap-3">
          <h2 className="truncate text-[15px] font-semibold leading-[22px] tracking-[-0.01em] text-neutral-900">
            {language === "ro"
              ? isOwner
                ? "Articolele mele"
                : "Articolele lui " + name
              : isOwner
                ? "My listings"
                : `${name}'s listings`}
          </h2>
          {listingsCount > 0 && (
            <span className="shrink-0 text-[12.5px] font-medium leading-[22px] text-neutral-400 tabular-nums">
              {listingsCount}
            </span>
          )}
        </div>

        {listings.length === 0 ? (
          // An empty shop is a normal state for a new member, not an error — so
          // it is drawn in the same language as the inbox's empty screens
          // (circle, one line, one sentence) rather than left as a stray
          // sentence floating in the middle of the page. It takes `flex-1` so
          // it fills exactly what is left below the heading: asking for a fixed
          // height here is what made a page with nothing on it scroll. The svh
          // floor only matters in the layouts where a percentage height cannot
          // resolve, and it stays under one screen on purpose.
          <div className="flex min-h-[38svh] flex-1 flex-col items-center justify-center px-6 pb-10 pt-6 text-center">
            <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <Shirt className="h-7 w-7" />
            </span>
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
            {listings.map((listing, i) => (
              <ProductCard
                key={listing.id}
                product={listing}
                origin="member"
                // Every card here belongs to the seller named just above —
                // repeating their name under each photo would only add noise.
                showSeller={false}
                priority={i < 4}
              />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <ProfileEditor
          userId={member.id}
          initialBio={bio}
          initialCover={local.cover}
          onClose={() => setEditing(false)}
          onApplied={setLocal}
        />
      )}

      {/* One line, on the one action with no other way of confirming itself.
          A share sheet closes over the app and that IS the confirmation; a
          clipboard write looks exactly like nothing happening. */}
      {shared && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[110] flex justify-center px-6">
          <span className="rounded-full bg-neutral-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg">
            Link copiat
          </span>
        </div>
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
      <Link href={href} prefetch aria-label={label} className={cls} onClick={() => void triggerHaptic("light")}>
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

/**
 * The colour at the very top of a preset, for the status-bar strip.
 *
 * Every preset ends with a `linear-gradient(<angle>, <from> …)` and its FROM
 * colour is what the top edge is closest to — the radial layers above it are
 * transparent at their own edges, so none of them owns the corner. Reading it
 * out of the string keeps one definition of each preset instead of a second
 * table of colours that has to be kept in step with the first.
 */
function coverTopColour(css: string): string {
  const m = /linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{3,8})/.exec(css)
  return m ? m[1] : "#3f3f46"
}
