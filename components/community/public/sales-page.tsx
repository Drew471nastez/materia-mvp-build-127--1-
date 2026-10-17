/**
 * ===========================================================================
 *  A COMMUNITY'S ABOUT PAGE: FOR SOMEBODY DECIDING WHETHER TO JOIN
 * ===========================================================================
 * /community/<slug> for anyone who is not a member, and /about for everyone.
 * One white sheet says what it is, in the order a person weighs it (round
 * 10 gave it more to say and a clearer shape):
 *
 *   THE HEAD      the name, its line, what members rate it
 *   THE MEDIA     the pictures and videos the creator chose
 *   THE FACTS     one quiet list (round 13: it replaced the line under
 *                 the name and the panel of figures): members, posts in the
 *                 last 30 days, courses, what kind of community, since
 *                 when, who runs it. From 1280px it is in the side card,
 *                 under the button; below that, in the sheet after the
 *                 description (facts-list.tsx, about-facts.ts aboutFacts)
 *   ABOUT         what it is about (the full rich description), then
 *                 "What's inside" (round 26: was "What members get")
 *   NO MEMBERSHIP BLOCK (round 26, the owner): the price and the way in are
 *                 the card's and the button's; only a community entered by
 *                 owning one of several products lists them (id ways-to-join,
 *                 where its button points)
 *   WHO RUNS IT   the creator, with their own line and their page; below
 *                 1280px also the admins and the social icons, which the side
 *                 card carries from 1280px (round 26)
 *   PRIVACY, TERMS  Storelib's, small and quiet under the sheet
 *   RULES, REVIEWS, QUESTIONS
 *   YOUR MEMBERSHIP  for a member: manage it, or leave (round 11: Leave is
 *                 a row here with a confirm, not a link under the button)
 *
 * From 1280px the decision also sits beside it in a sticky card in the
 * frame's right column (the name, the price, the button and the facts; the
 * cover is the community card's, in the left column, so the sheet leaves a
 * gallery that is only that cover out from 1024px: one cover on the page,
 * round 13); below that the button is a bar at the bottom with its own
 * white, down to the screen's foot (join-controls.tsx).
 *
 * NOTHING HERE IS MADE UP. The member count is the trigger kept count of
 * active members, posts and courses are counted rows (lib/communities/server/about.ts), the prices are
 * the products', the reviews are real rows, and "Still a paying member" is
 * said only of somebody who is one today. No trending badge, no urgency.
 *
 * No hooks: the sheet is drawn on the server; the gallery and the controls
 * are the client parts.
 */
import type { ReactNode } from "react"
import Link from "next/link"
import { Star } from "lucide-react"
import { PlaceIcon } from "@/components/community/member/place-icons"
import { MemberAvatar } from "@/components/community/member/member-avatar"
import { relativeTime } from "@/lib/communities/format"
import { cn } from "@/lib/utils"
import { CommunityGallery } from "./gallery-view"
import { FULL_ON_HOVER } from "@/components/community/member/nav"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { CheckDot } from "./check-dot"
import { JoinBarPhone, JoinCard, JoinProvider, JoinSummaryPhone, MembershipRow } from "./join-controls"
import { aboutFacts, aboutRow, canShareCommunity, cardSummary, galleryIsCoverOnly } from "./about-facts"
import { CardSummary } from "./card-summary"
import { CommunityShareButton } from "./share-community"
import { htmlToPlainText } from "@/lib/rich-text/html"
import { FactsList } from "./facts-list"
import { AboutRow } from "./about-row"
import { SocialLinks } from "./social-icons"
import type { AboutExtras, PublicCommunityView, PublicReviewView, SalesPageData } from "./types"

const H2 = "text-[18px] font-semibold tracking-[-0.005em] text-[#1a1a2e]"
const PAD = "px-5 sm:px-8"
const SECTION = `border-t border-[#eef0f2] ${PAD} py-7 sm:py-8`
const RULES_SHOWN = 3

function Stars({ rating, size = "h-3.5 w-3.5" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn(size, n <= Math.round(rating) ? "fill-[#1a1a2e] text-[#1a1a2e]" : "text-[#d1d5db]")} />
      ))}
    </span>
  )
}

function ReviewName({ r }: { r: PublicReviewView }) {
  return r.href ? (
    /* 40px to a thumb, without taking that room in the line. */
    <Link href={r.href} className="-my-2.5 inline-block max-w-full truncate py-2.5 font-semibold text-[#1a1a2e] hover:underline" data-person-link="">
      {r.name}
    </Link>
  ) : (
    <span className="truncate font-semibold text-[#1a1a2e]">{r.name}</span>
  )
}

function Review({ r }: { r: PublicReviewView }) {
  return (
    <li className="flex gap-3 sm:gap-4" data-review={r.id}>
      {r.href ? (
        <Link href={r.href} className="shrink-0 self-start rounded-full" tabIndex={-1} aria-hidden>
          <MemberAvatar src={r.avatarUrl} name={r.name} alt="" size={40} />
        </Link>
      ) : (
        <MemberAvatar src={r.avatarUrl} name={r.name} alt="" size={40} className="shrink-0" />
      )}
      <div className="min-w-0 flex-1 rounded-2xl border border-[#eceef1] bg-[#fafbfb] px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[15px]">
          <ReviewName r={r} />
          <Stars rating={r.rating} size="h-3.5 w-3.5" />
        </div>
        {r.content ? <p className="mt-1.5 whitespace-pre-line break-words text-[14.5px] leading-relaxed text-[#374151]">{r.content}</p> : null}
        <p className="mt-1.5 text-[13px] text-[#8a8f98]" data-review-meta="">
          <time dateTime={r.createdAt}>{relativeTime(r.createdAt)}</time>
          {r.payingFor ? <span data-review-paying=""> · Still a paying member after {r.payingFor}</span> : null}
        </p>
      </div>
    </li>
  )
}

/** Learn's first programs (round 13: the Classroom renamed): a picture, the title, how many lessons. Titles only; nothing inside one is shown. */
function ClassroomPreview({ classroom }: { classroom: NonNullable<AboutExtras["classroom"]> }) {
  const more = classroom.total - classroom.courses.length
  return (
    <section className={SECTION} aria-labelledby="community-classroom" data-community-classroom="">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="community-classroom" className={H2}>
          Learn
        </h2>
        <span className="text-[13.5px] tabular-nums text-[#6b7280]">
          {classroom.total} {classroom.total === 1 ? "program" : "programs"}
        </span>
      </div>
      <ul className="mt-3 divide-y divide-[#eef0f2]">
        {classroom.courses.map((course) => (
          <li key={course.productId} className="flex items-center gap-3.5 py-3 first:pt-1 last:pb-0" data-classroom-course={course.productId}>
            <span className="relative flex h-[46px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f1f2f4] text-[#8a8f98]">
              {course.coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={optimizedImageUrl(course.coverUrl, 76)} alt="" width={76} height={46} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <PlaceIcon place="classroom" size={20} />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-[#1a1a2e]">{course.title}</span>
              {course.lessons > 0 ? (
                <span className="block text-[13px] tabular-nums text-[#6b7280]">
                  {course.lessons} {course.lessons === 1 ? "lesson" : "lessons"}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="mt-3 text-[13.5px] text-[#6b7280]">And {more} more for members.</p> : null}
    </section>
  )
}

/**
 * WHO RUNS IT (round 11, ask 24; round 13 for phones): the creator's picture,
 * name and handle in one row with View profile at its right end, centred on
 * the person, at every width; their own line under the row. On a phone the
 * line runs under the picture too (the whole width, not a narrow column
 * beside a 48px gap), and the button sits where the eye ends the row, so
 * nothing hangs alone under the text.
 */
function CreatorBlock({ creator, bio, admins = 0, links = null, linksTo = "lg" }: { creator: NonNullable<PublicCommunityView["creator"]>; bio: string | null; /** Round 26: below 1280px, where there is no side card, the admins and the social icons are said here. */ admins?: number; links?: ReactNode; /** Up to where the icons are drawn here: below 1024px, where no card in the left column carries them; below 1280px in the Page editor, which has no left column. */ linksTo?: "lg" | "xl" }) {
  return (
    <section className={SECTION} aria-labelledby="community-creator" data-community-creator-card="">
      <h2 id="community-creator" className={H2}>
        Who runs it
      </h2>
      <div className="mt-4 grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3.5 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:gap-x-4" data-creator-row="">
        {creator.href ? (
          <Link href={creator.href} className="shrink-0 rounded-full" tabIndex={-1} aria-hidden>
            <MemberAvatar src={creator.avatarUrl} name={creator.name} alt="" size={56} sizedByClass className="h-12 w-12 sm:h-14 sm:w-14" />
          </Link>
        ) : (
          <MemberAvatar src={creator.avatarUrl} name={creator.name} alt="" size={56} sizedByClass className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold leading-snug text-[#1a1a2e]">
            {creator.href ? (
              <Link href={creator.href} className="-my-2.5 inline-block py-2.5 hover:underline" data-person-link="">
                {creator.name}
              </Link>
            ) : (
              creator.name
            )}
          </p>
          {creator.username || admins > 0 ? (
            <p className="truncate text-[13.5px] text-[#6b7280]">
              {creator.username ? `@${creator.username}` : null}
              {admins > 0 ? (
                <span className="xl:hidden" data-creator-admins="">
                  {creator.username ? " · " : null}
                  {admins} {admins === 1 ? "admin" : "admins"}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {creator.href ? (
          <Link
            href={creator.href}
            {...FULL_ON_HOVER}
            className="col-start-3 row-start-1 inline-flex h-10 items-center justify-self-end whitespace-nowrap rounded-[10px] border border-[#e3e5e9] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none transition-[background-color,box-shadow] duration-150 hover:bg-[#f6f7f8] active:bg-[#eef0f2] active:shadow-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:h-9"
            data-creator-page=""
          >
            View profile
          </Link>
        ) : null}
        {bio ? (
          <p className="col-span-3 col-start-1 row-start-2 mt-3 text-[14.5px] leading-relaxed text-[#374151] [overflow-wrap:anywhere] sm:col-span-2 sm:col-start-2 sm:mt-2" data-creator-bio="">
            {bio}
          </p>
        ) : null}
      </div>
      {links ? <div className={cn("mt-4", linksTo === "lg" ? "lg:hidden" : "xl:hidden")}>{links}</div> : null}
    </section>
  )
}

/** What the Page editor's preview shows where a part is empty (round 33): a quiet line saying what goes there, only there. */
function Placeholder({ block, children, className }: { block: string; children: ReactNode; className?: string }) {
  return (
    <p className={cn("rounded-xl border border-dashed border-[#d9dce1] px-4 py-3 text-[14.5px] text-[#8a8f98]", className)} data-page-block={block} data-page-placeholder="">
      {children}
    </p>
  )
}

export function CommunitySalesPage({ data, editing = false }: { data: SalesPageData; /** Round 33: drawn in the Page editor's preview, where an empty part says what goes there. */ editing?: boolean }) {
  const { community: c, join, notice } = data
  const extras = data.extras ?? null
  const rules = c.rules.slice(0, RULES_SHOWN)
  const moreRules = c.rules.length - rules.length
  /* Round 26: entered by owning one of several products, the page lists them where its button points (#ways-to-join). */
  const productList = join.kind === "product" && c.accessProducts.length > 1
  const hasDescription = Boolean(c.descriptionHtml || c.descriptionText)
  /* The side card's list (from 1280px): what the row under the name does not already say (round 33), the admins first (round 26). */
  const facts = aboutFacts(c, c.stats, extras).filter((f) => f.key !== "members" && f.key !== "visibility")
  /* The card's short description: the creator's own, else the tagline, else the start of the description (round 26). */
  const summary = cardSummary({ summary: c.summary, tagline: c.tagline, descriptionPlain: c.descriptionText ?? htmlToPlainText(c.descriptionHtml) })
  const admins = c.adminCount ?? c.stats.admins ?? 0
  /* What's inside: the community's own list, else what its tier includes (the pricing card said that before round 26). */
  const benefits = c.benefits.length ? c.benefits : (join.option?.benefits ?? [])
  /* Share on the card's cover: its public address, while it may be shared by this viewer (about-facts.ts canShareCommunity). */
  const share = canShareCommunity({ status: c.status, archived: join.kind === "closed", visibility: c.visibility, access: c.access }, { staff: join.isOwner || join.role === "owner" || join.role === "admin" || join.role === "moderator" })
  /* The cover alone, as the sheet's media: the left column's card has it from 1024px, so there it is not drawn twice. */
  const coverOnly = galleryIsCoverOnly(c.gallery, c.coverUrl)
  const member = join.kind === "open" && !join.isOwner && (join.canLeave || !!join.manageHref)
  const row = aboutRow(c, c.stats, join.option)
  const links = c.links ?? []
  const cover = c.coverUrl && c.coverPosition ? { url: c.coverUrl, position: c.coverPosition } : null

  /* The social icons as the card draws them, or, in the Page editor's preview, what goes there. */
  const linkIcons = (where: "card" | "sheet") =>
    links.length ? (
      <div data-page-block="links">
        <SocialLinks links={links} size={where === "card" ? "sm" : "md"} />
      </div>
    ) : editing ? (
      <Placeholder block="links" className="py-2">
        Add your website or social pages
      </Placeholder>
    ) : null

  return (
    <JoinProvider community={c} join={join} askWhy={!!data.askWhy} preview={!!data.preview}>
      <div data-community-sales={c.slug} className="bg-[#f8f9fa]">
        {notice ? (
          <div role="status" className="border-b border-[#f0e2b6] bg-[#fdf7e7] px-4 py-2.5 text-center text-[13.5px] text-[#6b5409]">
            {notice}
          </div>
        ) : null}
        {/*
          Edge to edge on a phone, a sheet on the page from 640px. It no longer pads or centres itself (round 12): the frame it is in
          (the member's, shell-frame.tsx, or a visitor's, public-frame.tsx, the same columns) places it in the middle and right columns,
          and from 1280px its own two columns are exactly those: the sheet the middle column's width, the side card the right column's
          300px, 24px apart, so About lines up with every other page of the community.
        */}
        <div className="w-full pb-10 lg:pb-20" data-community-sales-columns="">
          {/*
            Round 33, the owner: the sheet with the gallery 10% wider on a large screen. It was at most 772px (1120 less the
            320px card and the 28px gap); the columns now reach 1197px, so the sheet is 849px wherever the frame has the room.
          */}
          <div className="xl:mx-auto xl:grid xl:max-w-[1197px] xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-7" data-community-sales-grid="">
            <main className="min-w-0">
              <article className="overflow-hidden border-b border-[#e5e7eb]/70 bg-white sm:rounded-2xl sm:border sm:shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-community-sheet="">
                {/* Round 27, the owner: the pictures first, the name and its line under them. */}
                {c.gallery.length ? (
                  <div className={cn(PAD, "pt-4 sm:pt-6", coverOnly && "lg:hidden")} data-gallery-cover-only={coverOnly ? "" : undefined} data-page-block={coverOnly ? "cover" : "gallery"}>
                    {/* Round 26: below 1280px there is no side card, so Share sits on the page's own cover, in its upper right. */}
                    <div className="relative">
                      <CommunityGallery communityId={c.id} name={c.name} items={c.gallery} cover={cover} />
                      {share ? (
                        <div className="absolute right-3 top-3 z-30 xl:hidden" data-share-on="gallery">
                          <CommunityShareButton slug={c.slug} name={c.name} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : editing ? (
                  <div className={cn(PAD, "pt-4 sm:pt-6")}>
                    <Placeholder block="gallery" className="flex aspect-[16/9] items-center justify-center text-center">
                      Add a cover picture or video
                    </Placeholder>
                  </div>
                ) : null}

                <header className={cn(PAD, c.gallery.length ? cn("pt-5 sm:pt-6", coverOnly && "lg:pt-8") : "pt-6 sm:pt-8")}>
                  <div className="flex items-start gap-3">
                    <h1 className="min-w-0 flex-1 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[32px]" data-page-block="name">{c.name}</h1>
                    {/* No pictures to sit on below 1280px: Share at the end of the name. */}
                    {share && !c.gallery.length ? (
                      <div className="mt-0.5 shrink-0 xl:hidden" data-share-on="name">
                        <CommunityShareButton slug={c.slug} name={c.name} />
                      </div>
                    ) : null}
                  </div>
                  {c.tagline ? (
                    <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-[#4b5563] sm:text-[17px]" data-community-tagline="" data-page-block="tagline">
                      {c.tagline}
                    </p>
                  ) : editing ? (
                    <Placeholder block="tagline" className="mt-2 max-w-[60ch]">
                      Add a line under the name
                    </Placeholder>
                  ) : null}
                  {c.reviews ? (
                    <a href="#community-reviews" className="mt-2 inline-flex min-h-10 items-center gap-2 text-[14px] text-[#6b7280] hover:text-[#1a1a2e] sm:min-h-0" data-community-rating="">
                      <Stars rating={c.reviews.average} size="h-4 w-4" />
                      <span className="tabular-nums">
                        {c.reviews.average.toFixed(1)} · {c.reviews.total} {c.reviews.total === 1 ? "review" : "reviews"}
                      </span>
                    </a>
                  ) : null}
                  {/*
                    Round 33: the facts in a row (about-row.tsx), with the faces of the members here most recently. Round 26, the
                    owner: the social icons and the admins are not in it or under it any more; they are the info card's (and,
                    below 1280px, Who runs it's).
                  */}
                  <AboutRow facts={row} faces={extras?.faces ?? []} className="mt-4" />
                </header>

                {/* On a phone, under the media: only what happened (an error, a request waiting), when there is something. */}
                <div className={cn(PAD, "mt-5 empty:hidden xl:hidden")}>
                  <JoinSummaryPhone />
                </div>

                <div className={cn(PAD, "mt-6 pb-7 empty:hidden sm:mt-7 sm:pb-8 [&>*:first-child]:mt-0")}>
                  {hasDescription ? (
                    c.descriptionHtml ? (
                      /* Sanitized on the server by the product description's allow list (lib/rich-text/sanitize.ts), on save and on read. */
                      <div className="storelib-prose storelib-description break-words text-[15.5px] leading-relaxed text-[#262633]" data-community-description="" data-page-block="description" dangerouslySetInnerHTML={{ __html: c.descriptionHtml }} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-[15.5px] leading-relaxed text-[#262633]" data-community-description="" data-page-block="description">
                        {c.descriptionText}
                      </p>
                    )
                  ) : editing ? (
                    <Placeholder block="description">Say what the community is about: who it is for, what happens in it, how often.</Placeholder>
                  ) : null}
                </div>

                {benefits.length > 0 ? (
                  <section className={SECTION} aria-labelledby="community-benefits" data-page-block="benefits">
                    {/* Round 26, the owner: "What members get" read as corporate; these words fit a free community and a paid one. */}
                    <h2 id="community-benefits" className={H2}>
                      What&apos;s inside
                    </h2>
                    <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                      {benefits.map((b, i) => (
                        <li key={i} className="flex gap-3 text-[15px] leading-snug text-[#374151]" data-benefit="">
                          <CheckDot className="mt-px" />
                          <span className="min-w-0 break-words">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : editing ? (
                  <div className={SECTION}>
                    <Placeholder block="benefits">Add what&apos;s inside: a line for each thing people get</Placeholder>
                  </div>
                ) : null}

                {productList ? (
                  <section id="ways-to-join" className={cn(SECTION, "scroll-mt-24")} aria-labelledby="community-products" data-community-products="">
                    <h2 id="community-products" className={H2}>
                      Comes with
                    </h2>
                    <p className="mt-1.5 text-[14px] text-[#6b7280]">Owning any of these gives you access.</p>
                    <ul className="mt-2.5 divide-y divide-[#eef0f2]">
                      {c.accessProducts.map((p) => (
                        <li key={p.productId} className="flex items-center justify-between gap-4 py-3">
                          <Link href={p.href} className="min-w-0 truncate text-[15px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                            {p.title}
                          </Link>
                          <span className="shrink-0 text-[14px] tabular-nums text-[#6b7280]">{p.priceLine}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {null /* Learn, programs and post counts stay off the public page. */}

                {c.creator ? (
                  <CreatorBlock creator={c.creator} bio={extras?.creatorBio ?? null} admins={admins} links={linkIcons("sheet")} linksTo={editing ? "xl" : "lg"} />
                ) : links.length || editing ? (
                  <div className={cn(SECTION, editing ? "xl:hidden" : "lg:hidden")}>{linkIcons("sheet")}</div>
                ) : null}

                {rules.length > 0 ? (
                  <section className={SECTION} aria-labelledby="community-rules">
                    <h2 id="community-rules" className={H2}>
                      Rules
                    </h2>
                    <ol className="mt-3.5 space-y-3">
                      {rules.map((r, i) => (
                        <li key={i} className="flex gap-3">
                          <span aria-hidden className="mt-px w-5 shrink-0 text-[14px] font-semibold tabular-nums text-[#9ca3af]">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            {r.title ? <p className="text-[15px] font-medium text-[#1a1a2e]">{r.title}</p> : null}
                            {r.body ? <p className="mt-0.5 line-clamp-3 text-[14px] leading-snug text-[#6b7280]">{r.body}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                    {moreRules > 0 ? <p className="mt-3 text-[13.5px] text-[#6b7280]">And {moreRules} more for members.</p> : null}
                  </section>
                ) : null}

                {c.reviews ? (
                  <section id="community-reviews" className={cn(SECTION, "scroll-mt-24")} aria-labelledby="community-reviews-title" data-community-reviews="">
                    <h2 id="community-reviews-title" className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">
                      <Star aria-hidden className="h-5 w-5 fill-[#1a1a2e] text-[#1a1a2e]" />
                      <span className="tabular-nums">
                        {c.reviews.average.toFixed(1)} · {c.reviews.total} {c.reviews.total === 1 ? "review" : "reviews"}
                      </span>
                    </h2>
                    <ul className="mt-5 space-y-4">
                      {c.reviews.items.map((r) => (
                        <Review key={r.id} r={r} />
                      ))}
                    </ul>
                  </section>
                ) : null}

                {c.faq.length > 0 ? (
                  <section className={SECTION} aria-labelledby="community-faq" data-page-block="faq">
                    <h2 id="community-faq" className={H2}>
                      Questions
                    </h2>
                    <div className="mt-2 divide-y divide-[#eef0f2]">
                      {c.faq.map((f, i) => (
                        <details key={i} className="group/faq py-1">
                          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 py-2 text-[15px] font-medium text-[#1a1a2e] outline-none focus-visible:underline [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0">{f.q}</span>
                            <span aria-hidden className="shrink-0 text-[18px] leading-none text-[#9ca3af] transition-[rotate] duration-150 group-open/faq:rotate-45">
                              +
                            </span>
                          </summary>
                          <p className="pb-3 pr-8 text-[14.5px] leading-relaxed whitespace-pre-line text-[#4b5563]">{f.a}</p>
                        </details>
                      ))}
                    </div>
                  </section>
                ) : editing ? (
                  <div className={SECTION}>
                    <Placeholder block="faq">Add answers to what people ask before joining</Placeholder>
                  </div>
                ) : null}

                {member ? (
                  <section className={SECTION} aria-labelledby="community-your-membership" data-community-your-membership="">
                    <h2 id="community-your-membership" className={H2}>
                      Your membership
                    </h2>
                    <MembershipRow />
                  </section>
                ) : null}
              </article>
              {/* Round 26, the owner's section 9: Storelib's own legal pages, small and quiet, well away from the card. */}
              <nav aria-label="Legal" className="mt-5 flex justify-center gap-5 px-5 text-[12.5px] text-[#9ca3af] sm:justify-start sm:px-1" data-community-legal="">
                <a href="https://storelib.com/legal/privacy" target="_blank" rel="noopener" className="-my-2 py-2 outline-none hover:text-[#4b5563] hover:underline focus-visible:underline">
                  Privacy
                </a>
                <a href="https://storelib.com/legal/terms" target="_blank" rel="noopener" className="-my-2 py-2 outline-none hover:text-[#4b5563] hover:underline focus-visible:underline">
                  Terms
                </a>
              </nav>
            </main>

            <JoinCard
              facts={facts.length ? <FactsList facts={facts} /> : null}
              summary={summary ? <CardSummary text={summary} block="summary" /> : editing ? <Placeholder block="summary">Add a short description: a sentence or two for the card</Placeholder> : null}
              links={linkIcons("card")}
              share={share}
            />
          </div>
        </div>
        <JoinBarPhone />
      </div>
    </JoinProvider>
  )
}
