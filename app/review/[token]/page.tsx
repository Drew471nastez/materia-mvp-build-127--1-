import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { canDeliver } from "@/lib/receipts/rules"
import { canEditUntil, publicName, readPhotos, websiteStatus } from "@/lib/reviews/app-settings"
import { looksLikeRequestToken, requestLinkOpen, verifyRequest } from "@/lib/reviews/request-token"
import { requestContext } from "@/lib/reviews/requests-server"
import { photoViewUrl } from "@/lib/reviews/photos-server"
import { mediaUrl } from "@/lib/storage/media-url"
import { ReviewPageForm, type ReviewPageProps } from "./review-form"

export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE REVIEW PAGE (Storelib Reviews)
 * ===========================================================================
 * /review/<token>, from the review request email: one product from one
 * order, with no sign in. Served on the host the buyer bought on, the
 * website's own address for a website order (proxy.ts keeps /review/ a
 * Storelib page on every host), storelib.com otherwise.
 *
 * Opened with ?rate=4 (a star pressed in the email), the form starts on
 * four stars. A review already written from this link is shown, and can be
 * changed for as long as the store allows.
 *
 * Never indexed, and the address is not sent on as a Referer.
 */
export const metadata: Metadata = {
  title: "Write a review",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params
  const query = await searchParams
  if (!looksLikeRequestToken(token)) notFound()
  const id = verifyRequest(token)
  if (!id) notFound()
  const db = createAdminClient()
  const ctx = await requestContext(db, id)
  if (!ctx || !ctx.product) notFound()

  const rateRaw = Number(Array.isArray(query.rate) ? query.rate[0] : query.rate)
  const review = ctx.review
  /* A new review needs the app on and a link under REQUEST_LINK_DAYS old (app/api/reviews/request); one already written can still be read here. */
  const expired = !review && (!ctx.settings.enabled || !requestLinkOpen(ctx.request as { sent_at?: string | null; created_at?: string | null }))
  const closed = !ctx.order || !canDeliver(ctx.order) || ctx.product.status === "deleted" || expired
  const props: ReviewPageProps = {
    token,
    storeName: ctx.storeName,
    product: { title: ctx.product.title ?? "Your purchase", image: mediaUrl(ctx.product.thumbnail_url) ?? null },
    starColor: ctx.settings.display.starColor,
    photosAllowed: ctx.settings.photos,
    videosAllowed: ctx.settings.videos,
    initialRating: Number.isInteger(rateRaw) && rateRaw >= 1 && rateRaw <= 5 ? rateRaw : 0,
    suggestedName: publicName(ctx.order?.buyer_first_name) ?? "",
    closed,
    review: review
      ? {
          rating: Number(review.rating) || 0,
          title: review.title ?? "",
          content: review.content ?? "",
          name: review.reviewer_name ?? "",
          /* A photo not public yet (the store has not approved the review on its website) is shown to its writer by a short signed address. */
          photos: await Promise.all(readPhotos(review.photos).map(async (p) => ({ path: p.path, url: (await photoViewUrl(db, review, p)) ?? p.url, removed: p.status === "removed", ...(p.kind === "video" ? { video: true } : {}) }))),
          status: websiteStatus(review),
          editable: canEditUntil(review.created_at, ctx.settings.editDays),
        }
      : null,
  }
  return <ReviewPageForm {...props} />
}
