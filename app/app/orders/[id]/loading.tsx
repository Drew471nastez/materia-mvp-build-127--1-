import { OrderSkeleton } from "../order-skeleton"

/**
 * The old address of an order (an email, a notification) redirects to the
 * order over the list. While it does, the order's own outline, its bar in
 * the place the real bar will be (../order-skeleton.tsx).
 */
export default function OrderRedirectLoading() {
  return (
    <div className="orders-stage relative h-full overflow-hidden bg-[#f8f9fa]">
      <div className="orders-pane absolute inset-0 overflow-hidden">
        <OrderSkeleton />
      </div>
    </div>
  )
}
