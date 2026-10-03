import { cookies } from "next/headers"
import { pageUser } from "@/lib/auth/page-user"
import { DEMO_COOKIE, demoTokenValid } from "@/lib/payouts-demo/gate"
import { PayoutsDemo, PayoutsDemoGate } from "@/components/app/payouts-demo/payouts-demo"

export const dynamic = "force-dynamic"
export const revalidate = 0

export const metadata = {
  title: "Payouts demo",
  robots: { index: false, follow: false },
}

/**
 * The Payouts page with made up accounts, for its owner to see every state
 * in production (components/app/payouts-demo). Behind a password checked on
 * the server; the cookie it sets is signed and only opens it for the person
 * who entered it (lib/payouts-demo/gate). Nothing real is read here.
 */
export default async function PayoutsDemoPage() {
  const user = await pageUser()
  if (!user) return null
  const token = (await cookies()).get(DEMO_COOKIE)?.value
  return demoTokenValid(token, user.id) ? <PayoutsDemo /> : <PayoutsDemoGate />
}
