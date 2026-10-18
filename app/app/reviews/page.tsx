import type { Metadata } from "next"
import { currentCreatorId } from "@/lib/creators/current"
import { getServerTt } from "@/lib/i18n/server"
import { ReviewsClient } from "./reviews-client"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Reviews"),
  }
}

/**
 * /app/reviews: Storelib Reviews, managed where Products › Reviews points
 * (round 27, the owner: Reviews is Storelib's own, so it is a page of the
 * app, not the Integrations page). The same page Integrations opens for it
 * (components/app/settings/integration-detail.tsx with its tabs, Overview,
 * Reviews, Requests, Widgets, Analytics and Settings, from
 * components/reviews/manage), drawn here on its own: no list behind it, no
 * Back to integrations.
 *
 * Every link that names it keeps working: ?view= opens a tab, ?review=<id>
 * opens Reviews on that review and ?status=pending its Pending tab
 * (components/reviews/manage/reviews-manage.tsx reads them).
 */
export default async function ReviewsPage() {
  const creatorId = await currentCreatorId()
  if (!creatorId) return noStorePage("/app/reviews")
  return <ReviewsClient />
}
