import { tt } from "@/lib/i18n/text"
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
  /** A page behind a platform switch: offered only while that switch is on. */
  flag?: "communities"
}

/** Which platform switches are on, for the pages behind one. */
export interface PageFlags {
  communities?: boolean
}

export const APP_PAGES: readonly AppPage[] = [
  { get label() { return tt("Dashboard") }, href: "/app", group: "Pages", get words() { return tt("home overview") } },
  { get label() { return tt("Products") }, href: "/app/products", group: "Pages", get words() { return tt("digital downloads") } },
  { get label() { return tt("New product") }, href: "/app/products/new", group: "Pages", get words() { return tt("add create digital course sell") } },
  { get label() { return tt("New course") }, href: "/app/products/new?type=course", group: "Pages", get words() { return tt("video lessons create add") } },
  /* No Memberships page here: memberships are communities now. Somebody who types it finds Community, while the switch is on. */
  { get label() { return tt("Community") }, href: "/app/community", group: "Pages", get words() { return tt("communities members spaces feed classroom events invite moderation membership memberships subscription") }, flag: "communities" },
  { get label() { return tt("New community") }, href: "/app/community/new", group: "Pages", get words() { return tt("paid community create add membership monthly yearly") }, flag: "communities" },
  { get label() { return tt("Coupons") }, href: "/app/coupons", group: "Pages", get words() { return tt("discount codes") } },
  { get label() { return tt("Reviews") }, href: "/app/reviews", group: "Pages", get words() { return tt("ratings stars reply report buyers") } },
  { get label() { return tt("Orders") }, href: "/app/orders", group: "Pages", get words() { return tt("sales refunds customers buyers") } },
  { get label() { return tt("Analytics") }, href: "/app/analytics", group: "Pages", get words() { return tt("traffic visitors views") } },
  { get label() { return tt("Creator Page") }, href: "/creator-page", group: "Pages", get words() { return tt("profile bio storefront") } },
  { get label() { return tt("Website") }, href: "/app/website-builder", group: "Pages", get words() { return tt("site builder theme") } },
  { label: "OnePage", href: "/app/onepage", group: "Pages", get words() { return tt("link in bio") } },
  { get label() { return tt("Emails") }, href: "/app/emails", group: "Pages", get words() { return tt("subscribers contacts campaigns newsletter automations") } },
  { get label() { return tt("Payouts") }, href: "/app/payouts", group: "Pages", get words() { return tt("revenue transactions balance money") } },
  { get label() { return tt("Explore") }, href: "/explore", group: "Pages", words: "discover" },
  { get label() { return tt("Library") }, href: "/account/library", group: "Pages", words: "purchases" },
  { get label() { return tt("Help") }, href: "/help", group: "Pages", get words() { return tt("support questions") } },
  { get label() { return tt("Settings") }, href: "/app/settings", group: "Settings", get words() { return tt("profile account") } },
  { get label() { return tt("Payments") }, href: "/app/settings/payments", group: "Settings", get words() { return tt("stripe paypal connect") } },
  { get label() { return tt("Billing") }, href: "/app/settings/billing", group: "Settings", get words() { return tt("plan subscription invoices payment methods") } },
  { get label() { return tt("Upgrade to Pro") }, href: "/app/settings/billing/upgrade", group: "Settings", get words() { return tt("plan pricing") } },
]

/** What an empty search offers: the places people go most. */
export const GO_TO: readonly string[] = ["/app", "/app/orders", "/app/products", "/app/analytics", "/app/emails", "/app/settings"]

/** Pages whose name, or another name for them, contains the query. Names first. */
export function matchPages(query: string, limit = 5, flags: PageFlags = {}): AppPage[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const pages = APP_PAGES.filter((p) => !p.flag || flags[p.flag] === true)
  const byName = pages.filter((p) => p.label.toLowerCase().includes(q))
  const byWord = pages.filter((p) => !byName.includes(p) && (p.words || "").toLowerCase().includes(q))
  return [...byName, ...byWord].slice(0, limit)
}
