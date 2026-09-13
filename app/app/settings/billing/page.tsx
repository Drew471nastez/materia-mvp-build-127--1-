import { redirect } from "next/navigation"

/**
 * Billing is a TAB now, not a page.
 *
 * It used to be this route: a full navigation with a route-level skeleton,
 * arriving with its own copy of the settings tab bar underneath the real
 * one. This stays so that a bookmark, an email link, or a Stripe return URL
 * still lands somewhere sensible — it just lands on the tab.
 */
export default function BillingPage() {
  redirect("/app/settings?tab=billing")
}
