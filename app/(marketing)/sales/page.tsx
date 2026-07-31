import type { Metadata } from "next"
import { OrderHistory } from "@/components/orders/order-history"

export const metadata: Metadata = {
  title: "Vânzările mele | Storelib",
  robots: { index: false, follow: false },
}

export default function SalesPage() {
  return <OrderHistory side="sales" />
}
