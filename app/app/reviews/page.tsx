import { redirect } from "next/navigation"
import { ReviewsOverview } from "@/components/app/reviews/overview"
import { loadOverview, storeProducts } from "@/lib/reviews/dashboard-server"
import { reviewsAppFor, reviewsCaller } from "./load-reviews"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Reviews › Overview. The address every link to Reviews has used, so the
 * old ones are sent on: ?review=<id> (the bell, the new review email) and
 * ?status=pending (the digest, "waiting for approval") open the Reviews tab
 * on that review or that list.
 */
export default async function ReviewsOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const one = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v) ?? ""
  }
  if (one("review") || one("status")) {
    const q = new URLSearchParams()
    if (one("status")) q.set("tab", one("status") === "hidden" ? "rejected" : one("status"))
    if (one("review")) q.set("review", one("review"))
    redirect(`/app/reviews/list?${q.toString()}`)
  }
  const c = await reviewsCaller()
  /* No session yet: the app shell's gate draws its own frame over this while it restores the session. */
  if (c.state === "signed-out") return null
  if (c.state === "no-creator") redirect("/sell")
  const [data, products, app] = await Promise.all([loadOverview(c.db, c.creatorId), storeProducts(c.db, c.creatorId), reviewsAppFor(c.creatorId)])
  return <ReviewsOverview data={data} products={products} app={{ enabled: app.settings.enabled, ready: app.ready }} />
}
