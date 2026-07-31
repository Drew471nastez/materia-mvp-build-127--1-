import type { Metadata } from "next"
import { OrderHistory } from "@/components/orders/order-history"

export const metadata: Metadata = {
  title: "Achizițiile mele | Storelib",
  robots: { index: false, follow: false },
}

export default function PurchasesPage() {
  return <OrderHistory side="purchases" />
}
