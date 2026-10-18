import { CouponsClient } from "./coupons-client"
import { loadCouponArea } from "./load-coupons"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Coupons"),
  }
}

export default async function CouponsPage() {
  const load = await loadCouponArea(null)
  /* No session yet: the app shell's gate draws its own frame and spinner
     over this while it restores the session (app/app/cold-start.tsx). */
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/coupons")
  return <CouponsClient creatorId={load.creatorId} initialCoupons={load.coupons} products={load.products} />
}
