import { redirect } from "next/navigation"
import { CouponsClient } from "./coupons-client"
import CouponsLoading from "./skeleton"
import { loadCouponArea } from "./load-coupons"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Coupons",
}

export default async function CouponsPage() {
  const load = await loadCouponArea(null)
  /* No session yet: the app shell's gate restores it and asks again. */
  if (load.state === "signed-out") return <CouponsLoading />
  if (load.state === "no-creator") redirect("/signup/success")
  return <CouponsClient creatorId={load.creatorId} initialCoupons={load.coupons} products={load.products} />
}
