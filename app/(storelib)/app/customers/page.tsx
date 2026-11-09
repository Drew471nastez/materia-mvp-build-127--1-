import { redirect } from "next/navigation"
import { inStoreCurrency } from "@/lib/money/report-currency-server"
import { teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { createAdminClient } from "@/lib/supabase/admin"
import { CustomersView, type CustomerLine } from "./customers-view"
import { pageUser } from "@/lib/auth/page-user"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { LOCALE_TAG } from "@/lib/i18n/text"
import { accountTimeZone } from "@/lib/account/time-zone"
import { orderCurrency } from "@/lib/orders/money"
import { formatMinor } from "@/lib/markets/money"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { withOrderCurrency } from "@/lib/store/currency-at-read"
import { customerSpent, type SpentRow } from "@/lib/customers/spent"
import { readCreatorOrders } from "@/lib/analytics/creator-orders"
import { KEYSET_PAGE, keysetFrom, readByKeyset } from "@/lib/analytics/keyset"

/* What this page reads off an order: the list's last order, the counts and what each customer spent. */
const CUSTOMER_ORDER_COLUMNS = "id, created_at, buyer_email, amount_cents, currency, status, refund_amount_cents, provider, product_id, product:products(id, title, type)"
type CustomerOrder = {
  id: string
  created_at: string
  buyer_email: string | null
  amount_cents: number
  currency: string | null
  status: string | null
  refund_amount_cents: number | null
  provider: string | null
  product_id: string | null
  product: { id: string; title: string | null; type: string | null } | null
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CustomerRow = { id: string; created_at: string; email: string; [k: string]: any }

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return {
    title: tt("Customers"),
  }
}

export default async function CustomersPage() {
  const { language } = await getServerTt()
  const locale = LOCALE_TAG[language] ?? "en-US"
  const admin = createAdminClient()

  /* The /app layout's own answer for the user, through the per-request cache (lib/auth/request-scope.ts). */
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null

  /* The store's customers, for its owner or a team member given Customers (lib/team); anyone else is told, and nothing of the store is read. */
  const access = await teamPageStore("customers")
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="customers" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "none") redirect("/onboarding")
  const creator = { id: access.creatorId }

  /*
    EVERY CUSTOMER AND EVERY ORDER (round rel-db). Both were one unpaged read,
    which stops at 1,000 rows without a word: past its thousandth order a
    store showed wrong totals, past its thousandth customer a short list. The
    orders were also asked for by a list of every product id in the address,
    which a large catalog made too long for the server. Now both are read a
    page at a time, the orders by their own creator (readCreatorOrders), all
    side by side, on the service role as before, scoped by this creator.
  */
  const orderRows = readCreatorOrders<CustomerOrder>(admin, creator.id, CUSTOMER_ORDER_COLUMNS).then(
    (r) => r.rows.reverse(),
    (error) => {
      console.error("[customers] orders not read:", (error as Error).message)
      return [] as CustomerOrder[]
    },
  )
  const customerRows = readByKeyset<CustomerRow>((after) =>
    keysetFrom(admin.from("customers").select("*").eq("creator_id", creator.id), "1970-01-01T00:00:00.000Z", after)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(KEYSET_PAGE),
  ).then(
    (r) => r.rows.reverse(),
    (error) => {
      console.error("[customers] customers not read:", (error as Error).message)
      return null
    },
  )
  const [customers, readRows, { currency: storeCurrency }] = await Promise.all([
    customerRows,
    orderRows,
    /* A customer's total is in what the store sells in: a lei store's customers spent lei (lib/store/selling-currency). */
    readStoreCurrency(admin, creator.id),
  ])

  /* An order with no currency recorded is in what the store sold in on its day (lib/store/currency-at), as Orders and Analytics read it. */
  const allOrders = await withOrderCurrency(admin, creator.id, readRows ?? [], storeCurrency)

  /* In what the order was charged in, and a total in the platform's charge currency, every checkout's (lib/orders/money). */
  const formatPrice = (cents: number, currency?: unknown) => {
    /* "25.00 lei" as Orders writes it (lib/markets/money formatMinor), never "RON 25.00". */
    return formatMinor(cents, orderCurrency(currency), locale)
  }

  /* The day in the zone chosen in Settings, as the rest of /app shows it; the server's own clock is UTC. */
  const zone = accountTimeZone(null, user.user_metadata) ?? undefined
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: zone,
    })
  }

  /* By address whatever its case: the customer row is kept in lower case, an order keeps the address as it was typed (a corrected one too), so "Ana@x.com" read as no orders. */
  /* One pass over the orders, newest first within each address (was a filter of every order per customer). */
  const emailKey = (a: unknown) => (typeof a === "string" ? a.trim().toLowerCase() : "")
  const ordersByEmail = new Map<string, CustomerOrder[]>()
  for (const o of allOrders) {
    const k = emailKey(o.buyer_email)
    if (!k) continue
    const list = ordersByEmail.get(k)
    if (list) list.push(o)
    else ordersByEmail.set(k, [o])
  }
  const getCustomerOrders = (email: string) => {
    return ordersByEmail.get(emailKey(email)) ?? []
  }

  /*
    WHAT A CUSTOMER SPENT, IN THE STORE'S CURRENCY. The kept total adds each
    payment as it came, which is only a sum while every order is in the
    store's currency. With orders in another one (a market's, a dollar
    plan's, or from before a currency change), each paid order is converted
    at its own day's ECB rate (lib/money/report-currency) and added up here;
    an order no rate converts is left out rather than counted at a guess.
  */
  const inStore = await inStoreCurrency(admin, creator.id, allOrders as Array<{ created_at: string; currency?: string | null; amount_cents?: number | null; refund_amount_cents?: number | null; buyer_email?: string | null; status?: string | null }>, storeCurrency, { noFetch: true })
  const mixed = inStore.converted > 0 || inStore.unconverted > 0
  /* Less what was refunded (lib/customers/spent): the kept total never had a refund taken off it. */
  const spentOf = customerSpent(inStore.rows as SpentRow[], mixed)

  /* Round 52: drawn as Orders and People are (./customers-view.tsx); each row opens the person in Contacts, so no View contact line under every name. */
  const rows: CustomerLine[] | null = customers
    ? customers.map((customer) => {
        const orders = getCustomerOrders(customer.email)
        const lastOrder = orders[0]
        return {
          id: customer.id,
          name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
          email: customer.email,
          location: customer.city && customer.country ? `${customer.city}, ${customer.country}` : null,
          href: `/app/contacts/open?from=customer&id=${customer.id}`,
          lastOrder: lastOrder ? { title: lastOrder.product?.title ?? null, day: formatDate(lastOrder.created_at) } : null,
          orders: orders.length,
          spent: formatPrice(spentOf(customer), storeCurrency),
          joined: formatDate(customer.created_at),
        }
      })
    : null
  return <CustomersView rows={rows} />
}
