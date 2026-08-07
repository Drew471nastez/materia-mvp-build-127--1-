import { redirect } from "next/navigation"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import ShippingTestClient from "./_client"

/**
 * /admin/shipping-test — the courier integration, in isolation.
 *
 * Gated on the SERVER before anything renders, and the route it drives checks
 * the same session independently rather than trusting that this page did. A
 * client-side check would ship the page and then hide it, which is a login
 * screen made of CSS — and behind this one is an account that can book couriers
 * and spend money.
 *
 * Not `noindex` as a nicety: it is unreachable without the session, and the
 * header is there so a mis-deployed build cannot end up in a search index.
 */
export const dynamic = "force-dynamic"
export const metadata = { robots: { index: false, follow: false } }

export default async function ShippingTestPage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/blog")
  return <ShippingTestClient />
}
