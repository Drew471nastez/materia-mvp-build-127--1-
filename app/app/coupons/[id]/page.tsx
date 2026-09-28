import { redirect } from "next/navigation"
import { CouponEditor } from "../coupon-editor"
import type { CouponRecord } from "../coupon-form"
import { loadCouponArea } from "../load-coupons"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Edit coupon",
}

interface CouponEditPageProps {
  params: Promise<{ id: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A code's own page, read on the server with the code in it. It used to
 * redirect to /app/coupons/new?edit=<id>, a second round trip for nothing.
 */
export default async function CouponEditPage({ params }: CouponEditPageProps) {
  const { id } = await params
  if (!UUID.test(id)) redirect("/app/coupons")
  const load = await loadCouponArea(id)
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") redirect("/sell")
  const coupon = load.coupons[0] as CouponRecord | undefined
  if (!coupon) redirect("/app/coupons")
  return <CouponEditor key={id} products={load.products} initialCoupon={coupon} />
}
