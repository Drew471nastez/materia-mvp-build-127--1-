import { redirect } from "next/navigation"
import { CreateCouponClient } from "./create-coupon-client"
import CouponFormLoading from "./skeleton"
import { loadCouponArea } from "../load-coupons"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "New coupon",
}

interface PageProps {
  searchParams: Promise<{ edit?: string }>
}

/** A new code. The old `?edit=<id>` address goes to the code's own page. */
export default async function NewCouponPage({ searchParams }: PageProps) {
  const { edit } = await searchParams
  if (edit) redirect(`/app/coupons/${encodeURIComponent(edit)}`)
  const load = await loadCouponArea(null)
  if (load.state === "signed-out") return <CouponFormLoading />
  if (load.state === "no-creator") redirect("/signup/success")
  return <CreateCouponClient products={load.products} initialCoupon={null} />
}
