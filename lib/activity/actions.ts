/**
 * ===========================================================================
 *  WHAT A ROW IN A STORE'S ACTIVITY LOG SAYS
 * ===========================================================================
 * store_activity_log (SQL part 113) keeps each change as an action key, what
 * it was about and a few details. This turns a row into the line Settings ›
 * Activity shows ("Changed the price of Honey") and the group it's filtered
 * under. Shared by the server and the page, so nothing here touches the
 * database.
 */
export type ActivityGroup = "products" | "orders" | "settings" | "files"

export interface ActivityEntry {
  id: number
  createdAt: string
  actor: "person" | "system" | "buyer"
  action: string
  subjectType: string | null
  subjectId: string | null
  subjectLabel: string | null
  meta: Record<string, unknown>
}

export const GROUP_LABELS: Record<ActivityGroup, string> = { products: "Products", orders: "Orders", settings: "Settings", files: "Files" }

const STATUS_WORDS: Record<string, string> = { published: "Published", active: "Published", draft: "Moved to drafts", archived: "Archived", hidden: "Hid" }

const SETTINGS: Record<string, string> = {
  "settings.store": "Updated store details",
  "settings.checkout": "Changed checkout settings",
  "settings.taxes": "Changed tax settings",
  "settings.markets": "Changed markets and languages",
  "settings.currency": "Changed the store's currency",
  "website.translations": "Changed website translations",
  "settings.customer_emails": "Changed a customer email",
  "settings.shipping": "Changed shipping settings",
  "settings.channels": "Changed sales channels",
  "settings.reasons": "Changed return and refund reasons",
}

const ORDER: Record<string, string> = {
  "order.processing": "Marked order {s} as processing",
  "order.address_changed": "Changed the shipping address of order {s}",
  "order.fulfilled": "Fulfilled items in order {s}",
  "order.shipment": "Updated the shipment for order {s}",
  "order.cancelled": "Cancelled order {s}",
  "order.return_opened": "Opened a return for order {s}",
  "order.return_updated": "Updated a return for order {s}",
  "order.refunded": "Refunded order {s}",
  "order.cash_collected": "Marked order {s} as paid in cash",
  "order.cash_refused": "Marked order {s} as refused on delivery",
  "order.note": "Added a note to order {s}",
  "order.cancel_requested": "Asked to cancel order {s}",
  "order.cancel_declined": "Kept order {s} after a cancel request",
}

export function groupOf(action: string): ActivityGroup {
  if (action.startsWith("product.") || action.startsWith("offer.")) return "products"
  if (action.startsWith("order.")) return "orders"
  if (action.startsWith("file.")) return "files"
  return "settings"
}

/** The line a row shows: what was done, to what. */
export function describeActivity(e: Pick<ActivityEntry, "action" | "subjectLabel" | "meta">): string {
  const s = e.subjectLabel?.trim() || ""
  const named = (text: string) => (s ? text.replace("{s}", s) : text.replace(" {s}", ""))
  switch (e.action) {
    case "product.created":
      return named("Added {s}")
    case "product.deleted":
      return named("Deleted {s}")
    case "product.renamed":
      return typeof e.meta.from === "string" && e.meta.from ? `Renamed ${e.meta.from} to ${s || "a new name"}` : named("Renamed {s}")
    case "product.price":
      return named("Changed the price of {s}")
    case "product.status": {
      const to = typeof e.meta.to === "string" ? e.meta.to : ""
      return named(`${STATUS_WORDS[to] ?? "Changed the status of"} {s}`)
    }
    case "tax.region_added":
      return named("Added the tax region {s}")
    case "tax.region_updated":
      return named("Changed the tax region {s}")
    case "tax.region_removed":
      return named("Removed the tax region {s}")
    case "location.added":
      return named("Added the location {s}")
    case "location.updated":
      return named("Changed the location {s}")
    case "location.removed":
      return named("Removed the location {s}")
    case "integration.installed":
      return named("Installed {s}")
    case "integration.removed":
      return named("Removed {s}")
    case "file.deleted":
      return named("Deleted the file {s}")
    /* Taken out of Files, with the object kept for whatever still uses it (lib/files/assets.ts). */
    case "file.removed":
      return named("Removed {s} from Files")
    case "file.restored":
      return named("Put {s} back in Files")
    case "offer.added":
      return named("Added the offer {s}")
    case "offer.updated":
      return named("Changed the offer {s}")
    case "offer.removed":
      return named("Removed the offer {s}")
  }
  if (SETTINGS[e.action]) return SETTINGS[e.action]
  if (ORDER[e.action]) return named(ORDER[e.action])
  return "Made a change"
}

/** Who did it, as the page says it. */
export function actorLabel(actor: ActivityEntry["actor"]): string {
  return actor === "buyer" ? "A buyer" : actor === "system" ? "Storelib" : "You"
}
