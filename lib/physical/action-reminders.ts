/**
 * ===========================================================================
 *  WHAT A SHOP THAT SHIPS HAS TO DO NOW, AS LINES ON HOME
 * ===========================================================================
 * "3 orders to fulfill", "1 return to review": counts read from the rows
 * that prove them (lib/physical/action-counts-server.ts), each a link to
 * the page where it is done. Nothing is stored and nothing is dismissed: a
 * line is there while its count is above zero and gone the next time Home
 * reads them after the work is done. The emails and the bell for each event
 * are lib/notify's (seller-commerce.ts, the registry); this is the standing
 * list of what is still open.
 *
 * Urgent ("critical") only where waiting costs something: an order that has
 * waited past its days to ship, a delivery that failed, a dispute still open.
 * Everything else is an ordinary line.
 *
 * Pure: the tests read exactly what Home draws.
 */
import { tt } from "@/lib/i18n/text"

/** How long a paid order may wait unshipped before its line turns urgent. */
export const OVERDUE_DAYS = 3

export interface CommerceActionCounts {
  /** Paid, not cancelled, something still to send, ordered at least OVERDUE_DAYS ago. */
  overdue: number
  /** Paid, not cancelled, something still to send, newer than that. Pickup orders are counted below instead. */
  toFulfill: number
  /** Paid pickup orders not yet ready for the buyer. */
  pickupToPrepare: number
  /** Return requests nobody has answered. */
  returnsToReview: number
  /** Parcels the carrier could not deliver. */
  deliveryProblems: number
  /** Chargebacks and inquiries still open. */
  openDisputes: number
  /** Tracked items at or under their low stock line, and above zero. */
  lowStock: number
  /** Tracked items with none left to sell. */
  outOfStock: number
  /** The one order a line opens when its count is one, by the address Orders reads (?order=). */
  only?: { overdue?: string; toFulfill?: string; pickupToPrepare?: string; returnsToReview?: string; deliveryProblems?: string }
}

export const NO_ACTIONS: CommerceActionCounts = { overdue: 0, toFulfill: 0, pickupToPrepare: 0, returnsToReview: 0, deliveryProblems: 0, openDisputes: 0, lowStock: 0, outOfStock: 0 }

export interface ActionReminder {
  id: "overdue" | "to_fulfill" | "pickup" | "returns" | "delivery" | "disputes" | "out_of_stock" | "low_stock"
  count: number
  text: string
  href: string
  tone: "normal" | "critical"
}

const orderHref = (id: string | undefined, fallback: string) => (id ? `/app/orders?order=${encodeURIComponent(id)}` : fallback)

/** The lines Home draws, most pressing first. Empty when nothing is waiting. */
export function actionReminders(c: CommerceActionCounts): ActionReminder[] {
  const only = c.only ?? {}
  const out: ActionReminder[] = []
  const add = (r: ActionReminder) => {
    if (r.count > 0) out.push(r)
  }
  add({
    id: "overdue",
    count: c.overdue,
    text: c.overdue === 1 ? tt("1 order waiting more than {days} days to ship", { days: OVERDUE_DAYS }) : tt("{count} orders waiting more than {days} days to ship", { count: c.overdue, days: OVERDUE_DAYS }),
    href: c.overdue === 1 ? orderHref(only.overdue, "/app/orders?view=unfulfilled&sort=oldest") : "/app/orders?view=unfulfilled&sort=oldest",
    tone: "critical",
  })
  add({
    id: "delivery",
    count: c.deliveryProblems,
    text: c.deliveryProblems === 1 ? tt("1 delivery failed") : tt("{count} deliveries failed", { count: c.deliveryProblems }),
    href: orderHref(c.deliveryProblems === 1 ? only.deliveryProblems : undefined, "/app/orders?fulfillment=fulfilled"),
    tone: "critical",
  })
  add({
    id: "disputes",
    count: c.openDisputes,
    text: c.openDisputes === 1 ? tt("1 dispute is open") : tt("{count} disputes are open", { count: c.openDisputes }),
    href: "/app/payouts#disputes",
    tone: "critical",
  })
  add({
    id: "to_fulfill",
    count: c.toFulfill,
    text: c.toFulfill === 1 ? tt("1 order to fulfill") : tt("{count} orders to fulfill", { count: c.toFulfill }),
    href: c.toFulfill === 1 ? orderHref(only.toFulfill, "/app/orders?view=unfulfilled") : "/app/orders?view=unfulfilled",
    tone: "normal",
  })
  add({
    id: "pickup",
    count: c.pickupToPrepare,
    text: c.pickupToPrepare === 1 ? tt("1 pickup order to prepare") : tt("{count} pickup orders to prepare", { count: c.pickupToPrepare }),
    href: c.pickupToPrepare === 1 ? orderHref(only.pickupToPrepare, "/app/orders?view=unfulfilled") : "/app/orders?view=unfulfilled",
    tone: "normal",
  })
  add({
    id: "returns",
    count: c.returnsToReview,
    text: c.returnsToReview === 1 ? tt("1 return to review") : tt("{count} returns to review", { count: c.returnsToReview }),
    href: c.returnsToReview === 1 ? orderHref(only.returnsToReview, "/app/orders?view=returns") : "/app/orders?view=returns",
    tone: "normal",
  })
  add({
    id: "out_of_stock",
    count: c.outOfStock,
    text: c.outOfStock === 1 ? tt("1 item is out of stock") : tt("{count} items are out of stock", { count: c.outOfStock }),
    href: "/app/inventory",
    tone: "normal",
  })
  add({
    id: "low_stock",
    count: c.lowStock,
    text: c.lowStock === 1 ? tt("1 item is low on stock") : tt("{count} items are low on stock", { count: c.lowStock }),
    href: "/app/inventory",
    tone: "normal",
  })
  return out
}
