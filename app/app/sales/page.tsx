import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function SalesRedirectPage() {
  redirect("/app/orders")
}
