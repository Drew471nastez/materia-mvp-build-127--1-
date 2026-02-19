import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import Link from "next/link"
import {
  ArrowLeft,
  Package,
  CreditCard,
  Monitor,
  Smartphone,
  Tablet,
  Calendar,
  Users,
  RotateCcw,
  CheckCircle2,
  Clock,
} from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Order Details | Storelib",
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium bg-violet-100 text-violet-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Completed
        </span>
      )
    case "refunded":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium bg-rose-100 text-rose-700">
          <RotateCcw className="h-3.5 w-3.5" />
          Refunded
        </span>
      )
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium bg-amber-100 text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          Pending
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium bg-gray-100 text-gray-700">
          {status}
        </span>
      )
  }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: creator } = await adminSupabase
    .from("creators")
    .select("id, default_currency")
    .eq("user_id", user.id)
    .single()

  if (!creator) {
    redirect("/onboarding")
  }

  const { data: order, error } = await adminSupabase
    .from("orders")
    .select(`*, product:products!orders_product_id_fkey(id, title, type, thumbnail_url, creator_id)`)
    .eq("id", id)
    .single()

  if (error || !order) {
    redirect("/app/orders")
  }

  if (order.product?.creator_id !== creator.id) {
    redirect("/app/orders")
  }

  const currency = (creator as any).default_currency || "USD"

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100)

  const formatFullDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    })

  const platformFee = order.fee_cents || 0
  const netRevenue = (order.amount_cents || 0) - platformFee

  // Build timeline
  const timeline: { label: string; detail: string; color: string }[] = [
    { label: "Order Placed", detail: formatFullDate(order.created_at), color: "bg-green-500" },
    { label: "Payment Received", detail: formatPrice(order.amount_cents || 0), color: "bg-blue-500" },
  ]
  if (order.status === "refunded" && order.refunded_at) {
    timeline.push({
      label: "Refunded",
      detail: `${formatPrice(order.refund_amount_cents || order.amount_cents)} · ${formatFullDate(order.refunded_at)}${order.refund_reason ? ` · ${order.refund_reason.replace(/_/g, " ")}` : ""}`,
      color: "bg-red-500",
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/app/orders"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-[#1a1a2e]">Order Details</h1>
          <p className="text-[13px] text-[#6b7280] font-mono mt-0.5">#{order.id.slice(0, 8)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Customer Information */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-[14px] font-semibold text-[#1a1a2e] flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-[#8b5cf6]" />
            Customer Information
          </h2>
          <div className="space-y-3 text-[13px]">
            <div>
              <span className="text-[#6b7280]">Name</span>
              <p className="font-medium text-[#1a1a2e] mt-0.5">
                {order.buyer_first_name && order.buyer_last_name
                  ? `${order.buyer_first_name} ${order.buyer_last_name}`
                  : "Not provided"}
              </p>
            </div>
            <div>
              <span className="text-[#6b7280]">Email</span>
              <p className="font-medium text-[#1a1a2e] mt-0.5 break-all">
                {order.buyer_email || order.customer_email || "Not provided"}
              </p>
            </div>
            {order.buyer_country && (
              <div>
                <span className="text-[#6b7280]">Country</span>
                <p className="font-medium text-[#1a1a2e] mt-0.5">{order.buyer_country}</p>
              </div>
            )}
          </div>
        </div>

        {/* Product Information */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-[14px] font-semibold text-[#1a1a2e] flex items-center gap-2 mb-4">
            <Package className="h-4 w-4 text-[#8b5cf6]" />
            Product
          </h2>
          <div className="flex items-center gap-3">
            {order.product?.thumbnail_url ? (
              <img src={order.product.thumbnail_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#f3f4f6] flex items-center justify-center">
                <Package className="h-7 w-7 text-[#9ca3af]" />
              </div>
            )}
            <div>
              <p className="text-[14px] font-medium text-[#1a1a2e]">{order.product?.title || "Unknown"}</p>
              <p className="text-[12px] text-[#6b7280] capitalize mt-0.5">{order.product?.type || "Digital Product"}</p>
            </div>
          </div>
        </div>

        {/* Payment Details */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-[14px] font-semibold text-[#1a1a2e] flex items-center gap-2 mb-4">
            <CreditCard className="h-4 w-4 text-[#8b5cf6]" />
            Payment Details
          </h2>
          <div className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <span className="text-[#6b7280]">Amount</span>
              <span className="font-semibold text-[#1a1a2e] text-[16px]">{formatPrice(order.amount_cents || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6b7280]">Platform Fee</span>
              <span className="font-medium text-[#6b7280]">-{formatPrice(platformFee)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#e5e7eb]">
              <span className="font-medium text-[#1a1a2e]">Net Revenue</span>
              <span className="font-semibold text-[#1a1a2e]">{formatPrice(netRevenue)}</span>
            </div>
            {order.payment_method && (
              <div className="flex justify-between">
                <span className="text-[#6b7280]">Payment Method</span>
                <span className="font-medium text-[#1a1a2e] capitalize">
                  {order.payment_method === "card" && order.card_brand
                    ? `${order.card_brand}${order.card_last4 ? ` •••• ${order.card_last4}` : ""}`
                    : order.payment_method}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-[14px] font-semibold text-[#1a1a2e] flex items-center gap-2 mb-4">
            <Calendar className="h-4 w-4 text-[#8b5cf6]" />
            Activity Timeline
          </h2>
          <div className="space-y-4">
            {timeline.map((event, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${event.color}`} />
                <div>
                  <p className="text-[13px] font-medium text-[#1a1a2e]">{event.label}</p>
                  <p className="text-[12px] text-[#6b7280] mt-0.5">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Device Information */}
        {(order.buyer_device_type || order.buyer_os || order.buyer_browser) && (
          <div className="bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 md:col-span-2">
            <h2 className="text-[14px] font-semibold text-[#1a1a2e] flex items-center gap-2 mb-4">
              {order.buyer_device_type === "Mobile" ? (
                <Smartphone className="h-4 w-4 text-[#8b5cf6]" />
              ) : order.buyer_device_type === "Tablet" ? (
                <Tablet className="h-4 w-4 text-[#8b5cf6]" />
              ) : (
                <Monitor className="h-4 w-4 text-[#8b5cf6]" />
              )}
              Device Information
            </h2>
            <div className="grid grid-cols-3 gap-4 text-[13px]">
              {order.buyer_device_type && (
                <div>
                  <span className="text-[#6b7280]">Device</span>
                  <p className="font-medium text-[#1a1a2e] mt-0.5">{order.buyer_device_type}</p>
                </div>
              )}
              {order.buyer_os && (
                <div>
                  <span className="text-[#6b7280]">OS</span>
                  <p className="font-medium text-[#1a1a2e] mt-0.5">{order.buyer_os}</p>
                </div>
              )}
              {order.buyer_browser && (
                <div>
                  <span className="text-[#6b7280]">Browser</span>
                  <p className="font-medium text-[#1a1a2e] mt-0.5">{order.buyer_browser}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
