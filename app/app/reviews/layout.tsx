import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { ReviewsShell } from "@/components/app/reviews/reviews-shell"
import { reviewsArea } from "./load-reviews"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Reviews") }
}

/**
 * Reviews, one area (components/app/reviews/reviews-nav.tsx lists its tabs):
 * the frame and the tabs here, each tab's page under them. The one number
 * the tabs show, how many reviews wait for the store, is read here, once
 * per visit to the area and again whenever a page refreshes after a change.
 */
export default async function ReviewsLayout({ children }: { children: React.ReactNode }) {
  const area = await reviewsArea()
  return <ReviewsShell pending={area?.pending ?? 0}>{children}</ReviewsShell>
}
