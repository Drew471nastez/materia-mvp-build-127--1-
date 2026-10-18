import { redirect } from "next/navigation"
import { CouponEditor } from "../coupon-editor"
import { loadCouponArea } from "../load-coupons"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { noStorePage } from "@/lib/team/server"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("New coupon"),
  }
}

interface PageProps {
  searchParams: Promise<{ edit?: string }>
}

/**
 * A new code, drawn on the server with the products it can be limited to,
 * so the editor is whole on its first frame. The old `?edit=<id>` address
 * goes to the code's own page.
 */
export default async function NewCouponPage({ searchParams }: PageProps) {
  const { edit } = await searchParams
  if (edit) redirect(`/app/coupons/${encodeURIComponent(edit)}`)
  const load = await loadCouponArea(null)
  if (load.state === "signed-out") return null
  if (load.state === "no-creator") return noStorePage("/app/coupons/new")
  return <CouponEditor products={load.products} initialCoupon={null} />
}
