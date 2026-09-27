/**
 * The places in Storelib the header search can take somebody, matched in
 * the browser as they type, before the server has answered anything.
 *
 * `words` are the other names people use for a page: somebody looking for
 * refunds or customers means Orders, somebody looking for their plan means
 * Billing. They are matched the same way as the name.
 */
export interface AppPage {
  label: string
  href: string
  group: "Pages" | "Settings"
  words?: string
}

export const APP_PAGES: readonly AppPage[] = [
  { label: "Dashboard", href: "/app", group: "Pages", words: "home overview" },
  { label: "Products", href: "/app/products", group: "Pages", words: "digital downloads" },
  { label: "New product", href: "/app/products/new", group: "Pages", words: "add create" },
  { label: "Coupons", href: "/app/coupons", group: "Pages", words: "discount codes" },
  { label: "Reviews", href: "/app/reviews", group: "Pages", words: "ratings stars reply report buyers" },
  { label: "Orders", href: "/app/orders", group: "Pages", words: "sales refunds customers buyers" },
  { label: "Analytics", href: "/app/analytics", group: "Pages", words: "traffic visitors views" },
  { label: "Creator Page", href: "/creator-page", group: "Pages", words: "profile bio storefront" },
  { label: "Website", href: "/app/website-builder", group: "Pages", words: "site builder theme" },
  { label: "OnePage", href: "/app/onepage", group: "Pages", words: "link in bio" },
  { label: "Emails", href: "/app/emails", group: "Pages", words: "subscribers contacts campaigns newsletter automations" },
  { label: "Payouts", href: "/app/payouts", group: "Pages", words: "revenue transactions balance money" },
  { label: "Explore", href: "/explore", group: "Pages", words: "discover" },
  { label: "Library", href: "/library", group: "Pages", words: "purchases" },
  { label: "Help", href: "/help", group: "Pages", words: "support questions" },
  { label: "Settings", href: "/app/settings", group: "Settings", words: "profile account" },
  { label: "Payments", href: "/app/settings/payments", group: "Settings", words: "stripe paypal connect" },
  { label: "Billing", href: "/app/settings/billing", group: "Settings", words: "plan subscription invoices payment methods" },
  { label: "Upgrade to Pro", href: "/app/settings/billing/upgrade", group: "Settings", words: "plan pricing" },
]

/** What an empty search offers: the places people go most. */
export const GO_TO: readonly string[] = ["/app", "/app/orders", "/app/products", "/app/analytics", "/app/emails", "/app/settings"]

/** Pages whose name, or another name for them, contains the query. Names first. */
export function matchPages(query: string, limit = 5): AppPage[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const byName = APP_PAGES.filter((p) => p.label.toLowerCase().includes(q))
  const byWord = APP_PAGES.filter((p) => !byName.includes(p) && (p.words || "").toLowerCase().includes(q))
  return [...byName, ...byWord].slice(0, limit)
}
