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
  flag?: "communities" | "physical"
  /** Where it is, for a place inside a page (a tab, a section, a subpage): drawn under its name and searched like it. */
  under?: string
}

/** Which platform switches are on, for the pages behind one. */
export interface PageFlags {
  communities?: boolean
  physical?: boolean
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
  /* Round 51: the store's people (leads, subscribers, buyers, members) and the forms that collect them. */
  { get label() { return tt("Contacts") }, href: "/app/contacts", group: "Pages", get words() { return tt("people leads subscribers customers members audience list import export") } },
  { get label() { return tt("Emails") }, href: "/app/emails", group: "Pages", get words() { return tt("subscribers contacts campaigns newsletter automations") } },
  { get label() { return tt("Payouts") }, href: "/app/payouts", group: "Pages", get words() { return tt("revenue transactions balance money") } },
  { get label() { return tt("Explore") }, href: "/explore", group: "Pages", words: "discover" },
  { get label() { return tt("Library") }, href: "/account/library", group: "Pages", words: "purchases" },
  { get label() { return tt("Help") }, href: "/app/help", group: "Pages", get words() { return tt("support questions") } },
  { get label() { return tt("Settings") }, href: "/app/settings", group: "Settings", get words() { return tt("profile account") } },
  { get label() { return tt("Payments") }, href: "/app/settings/payments", group: "Settings", get words() { return tt("stripe paypal connect") } },
  { get label() { return tt("Billing") }, href: "/app/settings/billing", group: "Settings", get words() { return tt("plan subscription invoices payment methods") } },
  { get label() { return tt("Upgrade to Pro") }, href: "/app/settings/billing/upgrade", group: "Settings", get words() { return tt("plan pricing") } },

  /*
    EVERY PLACE INSIDE A PAGE (round 42). The tabs, sections and subpages
    that have an address of their own, so "size chart", "sent", "taxes" or
    "seo" opens the place itself and not only the page it is in. `under` is
    the page it belongs to, drawn under the name. A place behind a switch
    (physical commerce, communities) is offered only while it is on, as its
    page is.
  */
  /* Products and what hangs off them. */
  { get label() { return tt("Collections") }, href: "/app/products/collections", group: "Pages", get under() { return tt("Products") }, get words() { return tt("groups categories catalog") } },
  { get label() { return tt("New collection") }, href: "/app/products/collections/new", group: "Pages", get under() { return tt("Products") }, get words() { return tt("create add group") } },
  { get label() { return tt("Size charts") }, href: "/app/products/size-charts", group: "Pages", get under() { return tt("Products") }, get words() { return tt("sizes measurements fit guide") }, flag: "physical" },
  { get label() { return tt("New size chart") }, href: "/app/products/size-charts/new", group: "Pages", get under() { return tt("Products") }, get words() { return tt("create add sizes measurements") }, flag: "physical" },
  { get label() { return tt("Inventory") }, href: "/app/inventory", group: "Pages", get under() { return tt("Products") }, get words() { return tt("stock quantity locations") }, flag: "physical" },
  { get label() { return tt("Files") }, href: "/app/files", group: "Pages", get under() { return tt("Products") }, get words() { return tt("uploads media downloads library") } },
  { get label() { return tt("Review widgets") }, href: "/app/reviews/widgets", group: "Pages", get under() { return tt("Reviews") }, get words() { return tt("stars carousel badge website") } },
  /* Selling more. */
  { get label() { return tt("Upsells and bundles") }, href: "/app/offers", group: "Pages", get words() { return tt("offers upsell bundle cross sell quantity breaks discount checkout") } },
  { get label() { return tt("New offer") }, href: "/app/offers/new", group: "Pages", get under() { return tt("Upsells and bundles") }, get words() { return tt("create add upsell bundle quantity break") } },
  { get label() { return tt("New coupon") }, href: "/app/coupons/new", group: "Pages", get under() { return tt("Coupons") }, get words() { return tt("create add discount code") } },
  /* Orders and the people in them. */
  { get label() { return tt("Customers") }, href: "/app/customers", group: "Pages", get words() { return tt("buyers people clients") } },
  /* Emails, tab by tab (app/app/emails/emails-home.tsx TABS). */
  { get label() { return tt("Subscribers") }, href: "/app/emails?tab=subscribers", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("contacts list audience") } },
  { get label() { return tt("Messages") }, href: "/app/emails?tab=messages", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("inbox replies contact form") } },
  { get label() { return tt("Leads") }, href: "/app/emails?tab=leads", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("forms quiz answers responses whatsapp") } },
  { get label() { return tt("Forms") }, href: "/app/contacts/forms", group: "Pages", get under() { return tt("Contacts") }, get words() { return tt("form quiz questions booking contact") } },
  { get label() { return tt("Automations") }, href: "/app/emails?tab=flows", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("flows welcome abandoned cart sequence") } },
  { get label() { return tt("Customer emails") }, href: "/app/emails?tab=customer", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("receipt order confirmation shipping notification") } },
  { get label() { return tt("Sent emails") }, href: "/app/emails?tab=published", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("campaigns newsletters opens clicks") } },
  { get label() { return tt("Scheduled emails") }, href: "/app/emails?tab=scheduled", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("later queued campaigns") } },
  { get label() { return tt("Email drafts") }, href: "/app/emails?tab=drafts", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("unsent campaigns") } },
  { get label() { return tt("New email") }, href: "/app/emails/new", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("write compose campaign newsletter") } },
  { get label() { return tt("New automation") }, href: "/app/emails/flow/new", group: "Pages", get under() { return tt("Emails") }, get words() { return tt("create flow welcome sequence") } },
  /* Analytics, report by report: ?report= opens it beside the page (app/app/analytics/analytics-reports.tsx ReportDetailHost). */
  { get label() { return tt("Total revenue") }, href: "/app/analytics?report=metric%3Arevenue", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("sales money earnings report") } },
  { get label() { return tt("Total orders") }, href: "/app/analytics?report=metric%3Aorders", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("sales count report") } },
  { get label() { return tt("Conversion rate") }, href: "/app/analytics?report=metric%3Aconversion", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("funnel checkout report") } },
  { get label() { return tt("Visitors") }, href: "/app/analytics?report=metric%3Aviews", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("traffic people report") } },
  { get label() { return tt("Traffic sources") }, href: "/app/analytics?report=traffic", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("social campaign utm report") } },
  { get label() { return tt("Referrers") }, href: "/app/analytics?report=referrers", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("websites links report") } },
  { get label() { return tt("Top pages") }, href: "/app/analytics?report=pages", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("page views report") } },
  { get label() { return tt("Top products") }, href: "/app/analytics?report=products", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("best sellers report") } },
  { get label() { return tt("Funnel") }, href: "/app/analytics?report=funnel", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("checkout steps carts report") } },
  { get label() { return tt("Countries") }, href: "/app/analytics?report=countries", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("locations geography report") } },
  { get label() { return tt("Devices") }, href: "/app/analytics?report=devices", group: "Pages", get under() { return tt("Analytics") }, get words() { return tt("mobile desktop browsers report") } },
  /* The website and OnePage. */
  { get label() { return tt("Themes") }, href: "/app/website-builder/themes", group: "Pages", get under() { return tt("Website") }, get words() { return tt("templates design") } },
  { get label() { return tt("Navigation") }, href: "/app/website-builder/navigation", group: "Pages", get under() { return tt("Website") }, get words() { return tt("menu header footer links") } },
  { get label() { return tt("OnePage links") }, href: "/app/onepage#links", group: "Pages", under: "OnePage", get words() { return tt("buttons blocks") } },
  { get label() { return tt("OnePage design") }, href: "/app/onepage#design", group: "Pages", under: "OnePage", get words() { return tt("colours fonts background theme") } },
  { get label() { return tt("OnePage products") }, href: "/app/onepage#products", group: "Pages", under: "OnePage", get words() { return tt("shop items") } },
  {
    label: "OnePage SEO", // i18n-ignore: the product's name and SEO, the same in every language
    href: "/app/onepage#settings-seo", group: "Pages", under: "OnePage", get words() { return tt("google title description") },
  },
  { get label() { return tt("OnePage integrations") }, href: "/app/onepage#settings-integrations", group: "Pages", under: "OnePage", get words() { return tt("mailchimp zapier pixel analytics") } },
  { get label() { return tt("Verified badge") }, href: "/app/onepage#settings-verified", group: "Pages", under: "OnePage", get words() { return tt("check tick") } },
  /* Integrations and the rest. */
  { get label() { return tt("Integrations") }, href: "/app/integrations", group: "Pages", get words() { return tt("apps connect pixels google analytics klaviyo printful") } },
  { get label() { return tt("Installed integrations") }, href: "/app/integrations?category=installed", group: "Pages", get under() { return tt("Integrations") }, get words() { return tt("connected apps") } },
  { get label() { return tt("Contact support") }, href: "/app/support", group: "Pages", get under() { return tt("Help") }, get words() { return tt("email ticket problem") } },
  { get label() { return tt("Common questions") }, href: "/app/help/questions", group: "Pages", get under() { return tt("Help") }, get words() { return tt("faq answers") } },
  { get label() { return tt("What's new") }, href: "/app/changelog", group: "Pages", get words() { return tt("changelog updates releases") } },
  /* Settings, section by section (components/app/settings-form-new.tsx TABS; ?tab= opens one). */
  { get label() { return tt("Profile") }, href: "/app/settings?tab=general", group: "Settings", get words() { return tt("name photo username addresses") } },
  { get label() { return tt("Security") }, href: "/app/settings?tab=security", group: "Settings", get words() { return tt("password sign in devices two factor") } },
  { get label() { return tt("Privacy") }, href: "/app/settings?tab=privacy", group: "Settings", get words() { return tt("visibility data") } },
  { get label() { return tt("Notifications") }, href: "/app/settings?tab=notifications", group: "Settings", get words() { return tt("alerts emails push") } },
  { get label() { return tt("Team") }, href: "/app/settings?tab=team", group: "Settings", get words() { return tt("staff invite people permissions roles") } },
  { get label() { return tt("Store details") }, href: "/app/settings?tab=store", group: "Settings", get words() { return tt("name contact phone country address") } },
  { get label() { return tt("Checkout") }, href: "/app/settings?tab=checkout", group: "Settings", get words() { return tt("accounts guest news box fields") } },
  { get label() { return tt("Sales channels") }, href: "/app/settings?tab=channels", group: "Settings", get words() { return tt("online store explore listing") } },
  { get label() { return tt("Customer emails") }, href: "/app/settings?tab=emails", group: "Settings", get words() { return tt("receipts notifications templates") } },
  { get label() { return tt("Taxes") }, href: "/app/settings?tab=taxes", group: "Settings", get words() { return tt("vat gst sales tax rates") } },
  { get label() { return tt("Languages & Currency") }, href: "/app/settings?tab=markets", group: "Settings", get words() { return tt("markets translations translate currencies countries") } },
  { get label() { return tt("Domains") }, href: "/app/settings?tab=domains", group: "Settings", get words() { return tt("web address url dns custom domain") } },
  { get label() { return tt("AI Memory") }, href: "/app/settings?tab=ai_memory", group: "Settings", get words() { return tt("storelib ai remember notes") } },
  { get label() { return tt("Activity") }, href: "/app/settings?tab=activity", group: "Settings", get words() { return tt("history log changes audit") } },
  { get label() { return tt("Shipping and delivery") }, href: "/app/settings?tab=shipping", group: "Settings", get words() { return tt("rates zones packages delivery") }, flag: "physical" },
  { get label() { return tt("Locations") }, href: "/app/settings?tab=locations", group: "Settings", get words() { return tt("warehouse stock pickup") }, flag: "physical" },
  { get label() { return tt("Returns and refunds") }, href: "/app/settings?tab=returns", group: "Settings", get words() { return tt("return window reasons") }, flag: "physical" },
]

/** What an empty search offers: the places people go most. */
export const GO_TO: readonly string[] = ["/app", "/app/orders", "/app/products", "/app/analytics", "/app/emails", "/app/settings"]

/** Lower case and without accents, so "categorie" finds "Catégories". */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Pages whose name, or another name for them, contains the query. Names first:
 * one that starts with it, then one that has it anywhere; then a page every word
 * of the query starts a word of (its name, where it is, its other names), so
 * "email sent" finds Sent emails and "size" finds Size charts.
 */
export function matchPages(query: string, limit = 5, flags: PageFlags = {}): AppPage[] {
  const q = fold(query.trim())
  if (!q) return []
  const pages = APP_PAGES.filter((p) => !p.flag || flags[p.flag] === true)
  const terms = q.split(/[^a-z0-9&']+/).filter(Boolean)
  const scored: { page: AppPage; score: number; at: number }[] = []
  pages.forEach((page, at) => {
    const label = fold(page.label)
    const more = fold(`${page.under ?? ""} ${page.words ?? ""}`)
    let score = 0
    if (label === q) score = 400
    else if (label.startsWith(q)) score = 300
    else if (label.includes(q)) score = 200
    else if (more.includes(q)) score = 100
    else if (terms.length) {
      const said = `${label} ${more}`.split(/[^a-z0-9&']+/).filter(Boolean)
      if (terms.every((t) => said.some((w) => w.startsWith(t)))) score = 50 + terms.filter((t) => label.split(/\s+/).some((w) => w.startsWith(t))).length
    }
    if (score > 0) scored.push({ page, score, at })
  })
  return scored
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, limit)
    .map((s) => s.page)
}
