import { redirect } from "next/navigation"
import { CouponsClient } from "./coupons-client"
import { loadCouponArea } from "./load-coupons"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Coupons",
}

export default async function CouponsPage() {
  const load = await loadCouponArea(null)
  /* No session yet: the app shell's gate draws its own frame and spinner
     over this while it restores the session (app/app/cold-start.tsx). */
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/sell")
  return <CouponsClient creatorId={load.creatorId} initialCoupons={load.coupons} products={load.products} />
}
