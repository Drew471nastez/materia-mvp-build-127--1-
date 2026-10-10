import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import type { SiteAccount } from "@/lib/storelib-theme/compat/account"
import { siteCustomer } from "./account-data"
import { customerById } from "./customers"
import { cookieFrom, hostOf, pendingCookieName, pendingFrom, sessionCookieName, visitorFrom } from "./session"

/**
 * ===========================================================================
 *  WHO IS VISITING A WEBSITE WITH AN IMPORTED SHOPIFY THEME
 * ===========================================================================
 * The same session every Storelib website signs its customers in with
 * (./session.ts): the website's own __Host- cookie, signed, for this host
 * and this website's creator, and the customer row must still be there.
 * Read for the theme's `customer` (its header says Account rather than Log
 * in) and, on the account pages, with the orders and addresses.
 *
 * No cookie, or one that does not verify, costs nothing: the database is
 * asked only for a session that is already proven to be this website's.
 */
export async function siteAccountOf(request: Request, creatorId: string, opts: { orders: boolean; pending: boolean }): Promise<SiteAccount> {
  const host = hostOf(request)
  const visitor = visitorFrom(cookieFrom(request, sessionCookieName(host)), host, { creatorId })
  if (visitor) {
    try {
      const db = createAdminClient()
      const row = await customerById(db, visitor)
      if (row) {
        if (opts.orders) return { customer: await siteCustomer(db, row, `https://${getMainDomain()}`) }
        const name = (row.name ?? "").trim()
        return { customer: { name, first_name: name.split(/\s+/)[0] ?? "", email: row.email, orders: [], orders_count: 0 } }
      }
    } catch {
      /* The database did not answer: drawn for a guest, never for somebody else. */
    }
  }
  if (!opts.pending) return { customer: null }
  const note = pendingFrom(cookieFrom(request, pendingCookieName(host)), host, { creatorId })
  return { customer: null, pending: note ? { email: note.m } : null }
}
