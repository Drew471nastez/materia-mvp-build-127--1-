import { redirect } from "next/navigation"

export default async function StripeManagePage() {
  redirect("/app/settings")
}
