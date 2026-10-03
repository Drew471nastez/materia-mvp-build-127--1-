/**
 * ===========================================================================
 *  A COMMUNITY'S PAGE FOR SOMEBODY DECIDING WHETHER TO JOIN
 * ===========================================================================
 * /community/<slug> for anyone who is not a member, and /about for everyone.
 * One column says what it is, in the order a person weighs it: the cover,
 * the name and whose it is, the line, what it is about, what members get,
 * the ways in, the rules they would agree to, what members say (only when
 * there are published reviews of its tiers), and the questions people ask.
 * At 1024px and up the decision sits beside it in a sticky card; on a phone
 * it is a bar at the bottom (join-controls.tsx).
 *
 * NOTHING HERE IS MADE UP. The member count is the trigger kept count of
 * active members, the prices are the products', the reviews are real rows.
 * No online count, no "trending" badge, no fake urgency.
 *
 * No hooks: the column is drawn on the server; the controls are the one
 * client part.
 */
import Link from "next/link"
import { Check, Star } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import { JoinBarPhone, JoinCard, JoinProvider, JoinSummaryPhone } from "./join-controls"
import type { JoinOption, PublicReviewView, SalesPageData } from "./types"

const H2 = "text-[18px] font-semibold tracking-[-0.005em] text-[#1a1a2e]"
const SECTION = "border-t border-[#eef0f2] px-5 py-7 first:border-t-0 sm:px-8 sm:py-8"
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

function reviewDate(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(t)
}

function Review({ r }: { r: PublicReviewView }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <AppAvatar src={r.avatarUrl} name={r.name} alt="" size={28} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{r.name}</p>
          <div className="flex items-center gap-2">
            <Stars rating={r.rating} size="h-3 w-3" />
            <span className="text-[12px] text-[#9ca3af]">{reviewDate(r.createdAt)}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-[#374151]">{r.content}</p>
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

export function CommunitySalesPage({ data }: { data: SalesPageData }) {
  const { community: c, join, notice } = data
  const rules = c.rules.slice(0, RULES_SHOWN)
  const moreRules = c.rules.length - rules.length
  const showOptions = c.options.length > 1 || c.accessProducts.length > 0
  /* The other paid ways in can be chosen when the button itself would be a payment or a free join: never ahead of an approval. */
  const paidOnOffer = join.kind === "checkout" || join.kind === "join_free"
  const hasBody = Boolean(c.descriptionHtml || c.descriptionText || c.benefits.length || showOptions || rules.length || c.reviews || c.faq.length)

  return (
    <JoinProvider community={c} join={join}>
      <div data-community-sales={c.slug} className="min-h-screen bg-[#f8f9fa]">
        {notice ? (
          <div role="status" className="border-b border-[#f0e2b6] bg-[#fdf7e7] px-4 py-2.5 text-center text-[13.5px] text-[#6b5409]">
            {notice}
          </div>
        ) : null}
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-20 lg:pt-8">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 xl:gap-14">
            <main className="min-w-0">
              {c.coverUrl ? (
                <div className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl bg-[#eceef1]" data-community-cover="">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optimizedImageUrl(c.coverUrl, 1080)} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
                </div>
              ) : null}

              <header className={cn("flex items-start gap-3.5 sm:gap-4", c.coverUrl ? "mt-5 sm:mt-6" : "mt-1")}>
                {c.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImageUrl(c.logoUrl, 128)} alt="" width={64} height={64} className="h-14 w-14 shrink-0 rounded-2xl border border-[#e5e7eb]/80 bg-white object-cover sm:h-16 sm:w-16" />
                ) : (
                  <AppAvatar src={null} name={c.name} alt="" size={64} className="h-14 w-14 shrink-0 rounded-2xl sm:h-16 sm:w-16" sizedByClass />
                )}
                <div className="min-w-0 pt-0.5">
                  <h1 className="text-[24px] font-bold leading-tight tracking-[-0.015em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[30px]">{c.name}</h1>
                  <p className="mt-1 text-[14px] text-[#6b7280]">
                    {c.creator ? (
                      <>
                        by{" "}
                        {c.creator.href ? (
                          <Link href={c.creator.href} className="font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                            {c.creator.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-[#1a1a2e]">{c.creator.name}</span>
                        )}
                      </>
                    ) : null}
                    {c.visibility === "private" ? <span>{c.creator ? " · " : ""}Private community</span> : null}
                  </p>
                </div>
              </header>
              {c.tagline ? <p className="mt-4 text-[16px] leading-relaxed text-[#374151] sm:text-[17px]">{c.tagline}</p> : null}

              <JoinSummaryPhone />

              {hasBody ? (
                <div className="mt-6 overflow-hidden rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mt-8">
                  {c.descriptionHtml || c.descriptionText ? (
                    <section className={SECTION} aria-labelledby="community-about">
                      <h2 id="community-about" className={H2}>
                        About
                      </h2>
                      {c.descriptionHtml ? (
                        <div className="storelib-prose storelib-description mt-3 break-words text-[15px] leading-relaxed text-[#374151]" dangerouslySetInnerHTML={{ __html: c.descriptionHtml }} />
                      ) : (
                        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-[#374151]">{c.descriptionText}</p>
                      )}
                    </section>
                  ) : null}

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
                    <section className={SECTION} aria-labelledby="community-reviews" data-community-reviews="">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <h2 id="community-reviews" className={H2}>
                          What members say
                        </h2>
                        <p className="flex items-center gap-2 text-[14px] text-[#6b7280]">
                          <Stars rating={c.reviews.average} />
                          <span className="tabular-nums">
                            {c.reviews.average.toFixed(1)} · {c.reviews.total} {c.reviews.total === 1 ? "review" : "reviews"}
                          </span>
                        </p>
                      </div>
                      <ul className="mt-4 divide-y divide-[#eef0f2]">
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
                </div>
              ) : null}
            </main>

            <JoinCard />
          </div>
        </div>
        <JoinBarPhone />
      </div>
    </JoinProvider>
  )
}
