import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { REVIEW_TABS } from "@/lib/reviews/manage"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Reviews"),
  }
}

/** Where Storelib Reviews is managed now: its integration page, on the view a link asked for. */
const REVIEWS_HOME = "/app/integrations?integration=storelib-reviews"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /app/reviews, kept for every link that names it (the sidebar, the bell's
 * new review and waiting for approval, the review emails, search): reviews
 * are managed in one place, Storelib Reviews' integration page
 * (components/reviews/manage), so this sends there, to its Reviews view.
 * ?review=<id> opens that review, ?status=pending its Pending tab; nothing
 * else is carried.
 */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""
  const review = one(q.review)
  const status = one(q.status)
  const to = new URLSearchParams()
  to.set("view", "reviews")
  if (UUID.test(review)) to.set("review", review)
  if ((REVIEW_TABS as readonly string[]).includes(status) && status !== "all") to.set("status", status)
  redirect(`${REVIEWS_HOME}&${to.toString()}`)
}
