import { redirect } from "next/navigation"

interface CouponEditPageProps {
  params: Promise<{ id: string }>
}

export default async function CouponEditPage({ params }: CouponEditPageProps) {
  const { id } = await params
  redirect(`/app/coupons/new?edit=${id}`)
}
