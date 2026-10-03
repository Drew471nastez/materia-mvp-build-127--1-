/**
 * ===========================================================================
 *  A COMMUNITY'S ABOUT PAGE: FOR SOMEBODY DECIDING WHETHER TO JOIN
 * ===========================================================================
 * /community/<slug> for anyone who is not a member, and /about for everyone.
 * One white sheet says what it is, in the order a person weighs it: the
 * name and what members rate it, the pictures and videos the creator chose
 * (a large one and a strip to choose another), one line of facts (private
 * or public, how many members, the price, whose it is), what it is about,
 * what members get, the ways in, the rules they would agree to, what
 * members say, and the questions people ask. From 1024px the decision sits
 * beside it in a sticky card (the cover, the name, its address, the line,
 * Members / Online / Admins and the button); on a phone the card's content
 * flows under the media and the button is a bar at the bottom.
 *
 * NOTHING HERE IS MADE UP. The member count is the trigger kept count of
 * active members, Online is a real heartbeat (or not shown), the prices are
 * the products', the reviews are real rows, and "Still a paying member" is
 * said only of somebody who is one today. No trending badge, no urgency.
 *
 * No hooks: the sheet is drawn on the server; the gallery and the controls
 * are the client parts.
 */
import Link from "next/link"
import { Check, EyeOff, Globe, Lock, Star, Tag, UsersRound } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { memberCountLabel, relativeTime } from "@/lib/communities/format"
import { cn } from "@/lib/utils"
import { CommunityGallery } from "./gallery-view"
import { JoinBarPhone, JoinCard, JoinProvider, JoinSummaryPhone } from "./join-controls"
import type { JoinOption, PublicCommunityView, PublicReviewView, SalesPageData } from "./types"

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
          <AppAvatar src={r.avatarUrl} name={r.name} alt="" size={40} />
        </Link>
      ) : (
        <AppAvatar src={r.avatarUrl} name={r.name} alt="" size={40} className="shrink-0" />
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

/**
 * Where a paid way in other than the main button is bought: its own checkout
 * (the first interval it offers; the checkout lets them switch), through sign
 * in for a visitor. Only when the button itself would take them to pay: not
 * before an approval, not for a member.
 */
function optionHref(o: JoinOption, join: SalesPageData["join"], paidOnOffer: boolean): string | null {
  if (!paidOnOffer || o.kind !== "paid" || !o.checkout) return null
  const target = o.checkout.month ?? o.checkout.year ?? o.checkout.once
  if (!target) return null
  return join.signedIn ? target : `/login?next=${encodeURIComponent(target)}`
}

function OptionRow({ o, href }: { o: JoinOption; href: string | null }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0" data-join-option={o.tierId ?? ""}>
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-[#1a1a2e]">{o.name}</p>
        {o.description ? <p className="mt-0.5 text-[13.5px] leading-snug text-[#6b7280]">{o.description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{o.priceLine || "Not on sale yet"}</p>
        {href ? (
          <Link
            href={href}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] outline-none transition-[border-color,background-color] duration-150 hover:border-[#d0d4da] hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 sm:h-9"
          >
            Choose
          </Link>
        ) : null}
      </div>
    </li>
  )
}

const VISIBILITY = {
  public: { label: "Public", Icon: Globe },
  private: { label: "Private", Icon: Lock },
  unlisted: { label: "Unlisted", Icon: EyeOff },
} as const

/** The one line of facts under the media: private or public, members, the price, whose it is. */
function InfoRow({ c, price }: { c: PublicCommunityView; price: string | null }) {
  const vis = VISIBILITY[c.visibility] ?? VISIBILITY.public
  const item = "inline-flex min-w-0 max-w-full items-center gap-2 text-[14.5px] text-[#374151]"
  const icon = "h-[18px] w-[18px] shrink-0 text-[#6b7280]"
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-3" data-community-info="">
      <li className={item} data-info="visibility">
        <vis.Icon className={icon} strokeWidth={1.75} aria-hidden />
        {vis.label}
      </li>
      {/* On a phone the figures right above already say it. */}
      <li className={cn(item, "max-lg:hidden")} data-info="members">
        <UsersRound className={icon} strokeWidth={1.75} aria-hidden />
        {memberCountLabel(c.memberCount)}
      </li>
      {price ? (
        <li className={item} data-info="price">
          <Tag className={icon} strokeWidth={1.75} aria-hidden />
          <span className="tabular-nums">{price}</span>
        </li>
      ) : null}
      {c.creator ? (
        <li className={item} data-info="creator">
          <AppAvatar src={c.creator.avatarUrl} name={c.creator.name} alt="" size={22} className="shrink-0" />
          <span className="min-w-0 truncate">
            By{" "}
            {c.creator.href ? (
              <Link href={c.creator.href} className="-my-2.5 inline-block py-2.5 font-medium text-[#1a1a2e] underline-offset-2 hover:underline" data-person-link="">
                {c.creator.name}
              </Link>
            ) : (
              <span className="font-medium text-[#1a1a2e]">{c.creator.name}</span>
            )}
          </span>
        </li>
      ) : null}
    </ul>
  )
}

/** What the community costs, as the facts line says it: the main button's way in, else invite only or free. */
function headlinePrice(data: SalesPageData): string | null {
  const { community: c, join } = data
  if (c.access === "invite_only") return "Invite only"
  const o = join.option ?? c.options.find((x) => x.kind === "paid" && x.priceLine) ?? c.options.find((x) => x.kind === "free") ?? null
  return o?.priceLine || null
}

export function CommunitySalesPage({ data }: { data: SalesPageData }) {
  const { community: c, join, notice } = data
  const rules = c.rules.slice(0, RULES_SHOWN)
  const moreRules = c.rules.length - rules.length
  const showOptions = c.options.length > 1 || c.accessProducts.length > 0
  /* The other paid ways in can be chosen when the button itself would be a payment or a free join: never ahead of an approval. */
  const paidOnOffer = join.kind === "checkout" || join.kind === "join_free"
  const hasDescription = Boolean(c.descriptionHtml || c.descriptionText)

  return (
    <JoinProvider community={c} join={join}>
      <div data-community-sales={c.slug} className="bg-[#f8f9fa]">
        {notice ? (
          <div role="status" className="border-b border-[#f0e2b6] bg-[#fdf7e7] px-4 py-2.5 text-center text-[13.5px] text-[#6b5409]">
            {notice}
          </div>
        ) : null}
        {/* Edge to edge on a phone, a sheet on the page from 640px. */}
        <div className="mx-auto w-full max-w-[1080px] pb-10 sm:px-6 sm:pt-6 lg:px-8 lg:pb-20 lg:pt-8">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 xl:gap-10">
            <main className="min-w-0">
              <article className="overflow-hidden border-b border-[#e5e7eb]/70 bg-white sm:rounded-2xl sm:border sm:shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-community-sheet="">
                <header className={cn(PAD, "pt-6 sm:pt-8")}>
                  <h1 className="text-[24px] font-bold leading-tight tracking-[-0.015em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[30px]">{c.name}</h1>
                  {c.reviews ? (
                    <a href="#community-reviews" className="mt-2 inline-flex min-h-10 items-center gap-2 text-[14px] text-[#6b7280] hover:text-[#1a1a2e] sm:min-h-0" data-community-rating="">
                      <Stars rating={c.reviews.average} size="h-4 w-4" />
                      <span className="tabular-nums">
                        {c.reviews.average.toFixed(1)} · {c.reviews.total} {c.reviews.total === 1 ? "review" : "reviews"}
                      </span>
                    </a>
                  ) : null}
                </header>

                {c.gallery.length ? (
                  <div className={cn(PAD, c.reviews ? "mt-4 sm:mt-5" : "mt-5 sm:mt-6")}>
                    <CommunityGallery communityId={c.id} name={c.name} items={c.gallery} />
                  </div>
                ) : null}

                {/* The card's content, on a phone, right under the media. */}
                <div className={cn(PAD, "mt-6 lg:hidden")}>
                  <JoinSummaryPhone />
                </div>

                <div className={cn(PAD, "mt-6 pb-7 sm:mt-7 sm:pb-8")}>
                  <InfoRow c={c} price={headlinePrice(data)} />
                  {hasDescription ? (
                    c.descriptionHtml ? (
                      <div className="storelib-prose storelib-description mt-6 break-words text-[15.5px] leading-relaxed text-[#262633]" data-community-description="" dangerouslySetInnerHTML={{ __html: c.descriptionHtml }} />
                    ) : (
                      <p className="mt-6 whitespace-pre-wrap break-words text-[15.5px] leading-relaxed text-[#262633]" data-community-description="">
                        {c.descriptionText}
                      </p>
                    )
                  ) : null}
                </div>

                {c.benefits.length > 0 ? (
                  <section className={SECTION} aria-labelledby="community-benefits">
                    <h2 id="community-benefits" className={H2}>
                      What members get
                    </h2>
                    <ul className="mt-3.5 space-y-2.5">
                      {c.benefits.map((b, i) => (
                        <li key={i} className="flex gap-3 text-[15px] leading-snug text-[#374151]">
                          <Check aria-hidden className="mt-[3px] h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.25} />
                          <span className="min-w-0 break-words">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {showOptions ? (
                  <section id="ways-to-join" className={cn(SECTION, "scroll-mt-24")} aria-labelledby="community-options">
                    <h2 id="community-options" className={H2}>
                      Ways to join
                    </h2>
                    {c.options.length > 1 ? (
                      <ul className="mt-3.5 divide-y divide-[#eef0f2]">
                        {c.options.map((o) => (
                          <OptionRow key={o.tierId ?? o.name} o={o} href={optionHref(o, join, paidOnOffer)} />
                        ))}
                      </ul>
                    ) : null}
                    {c.accessProducts.length > 0 ? (
                      <>
                        <p className="mt-3 text-[14px] text-[#6b7280]">Owning any of these gives you access:</p>
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
                      </>
                    ) : null}
                  </section>
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
                  <section className={SECTION} aria-labelledby="community-faq">
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
                ) : null}
              </article>
            </main>

            <JoinCard />
          </div>
        </div>
        <JoinBarPhone />
      </div>
    </JoinProvider>
  )
}
