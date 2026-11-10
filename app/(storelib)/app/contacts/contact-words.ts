/**
 * Contacts' words, read when they are drawn (tt at call time, never at
 * import), so they follow the dashboard's language.
 */
import { displayEmail } from "@/lib/businesses/email-alias"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import type { Origin, PersonRow, SubscriptionState } from "@/lib/contacts/identity"

export function originLabel(o: Origin): string {
  switch (o) {
    case "website":
      return tt("Website")
    case "profile":
      return tt("Storelib profile")
    case "onepage":
      return "OnePage"
    case "product":
      return tt("Product page")
    case "checkout":
      return tt("Checkout")
    case "form":
      return tt("Form")
    case "community":
      return tt("Community")
    case "import":
      return tt("Import")
    case "manual":
      return tt("Added by you")
    case "api":
      return "API"
    default:
      return tt("Not recorded")
  }
}

export function subscriptionLabel(s: SubscriptionState): string {
  switch (s) {
    case "subscribed":
      return tt("Subscribed")
    case "unsubscribed":
      return tt("Unsubscribed")
    case "blocked":
      return tt("Bounced or complained")
    default:
      return tt("Not subscribed")
  }
}

/** The quiet labels a person carries, in a fixed order. */
export function labelsOf(p: Pick<PersonRow, "lead" | "customer" | "subscriber" | "member" | "student">): string[] {
  const out: string[] = []
  if (p.customer) out.push(tt("Customer"))
  if (p.member) out.push(tt("Member"))
  if (p.student) out.push(tt("Student"))
  if (p.subscriber) out.push(tt("Subscriber"))
  if (p.lead) out.push(tt("Lead"))
  return out
}

export function memberStatusLabel(s: string): string {
  switch (s) {
    case "active":
      return tt("Active")
    case "pending":
      return tt("Waiting for approval")
    case "paused":
      return tt("Paused")
    case "cancelled":
      return tt("Cancelled")
    case "expired":
      return tt("Expired")
    case "banned":
      return tt("Banned")
    case "removed":
      return tt("Removed")
    default:
      return s
  }
}

export function membershipStatusLabel(s: string): string {
  switch (s) {
    case "active":
      return tt("Active")
    case "trialing":
      return tt("On a trial")
    case "past_due":
      return tt("Payment late")
    case "canceled":
      return tt("Cancelled")
    case "expired":
      return tt("Expired")
    case "incomplete":
      return tt("Not finished")
    default:
      return s
  }
}

export function leadStatusLabel(s: string): string {
  switch (s) {
    case "new":
      return tt("New")
    case "contacted":
      return tt("Contacted")
    case "qualified":
      return tt("Qualified")
    case "converted":
      return tt("Converted")
    default:
      return s
  }
}

/** "Mar 4" this year, "Mar 4, 2025" before it. */
export function dayOf(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }))
}

/** The person's name, or their address, or a plain word when there is neither. */
export function whoOf(p: Pick<PersonRow, "name" | "email">): string {
  return p.name || displayEmail(p.email) || tt("No name or email")
}

/** What a failed contacts request says, by its code, in the dashboard's language. */
export function contactsError(code: unknown, fallback: string): string {
  switch (code) {
    case "contacts_missing":
      return tt("Notes, tags and adding people need the Contacts database update (SQL part 378 in Admin › SQL updates). Everything else keeps working.")
    case "invalid_email":
      return tt("Enter a valid email address.")
    case "no_email_column":
      return tt("No column of email addresses was found. Name one column Email.")
    case "no_rows":
      return tt("No valid email addresses were found in the file.")
    case "too_large":
      return tt("That file is too large. Split it into files under 2 MB.")
    case "nothing_chosen":
      return tt("Pick people first.")
    case "no_tag":
      return tt("Type a tag.")
    case "no_identity":
      return tt("This person left no address or account, so nothing can be kept about them.")
    case "not_found":
      return tt("This person is not in your contacts.")
    default:
      return fallback
  }
}

/** A request to the contacts routes: the answer, or a sentence to show. */
export async function contactsRequest<T>(url: string, init: RequestInit & { fallback: string }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(url, { cache: "no-store", ...init }).catch(() => null)
  if (!res) return { ok: false, error: tt("You seem to be offline. Try again.") }
  const data = (await res.json().catch(() => ({}))) as { code?: unknown }
  if (!res.ok) return { ok: false, error: res.status === 403 ? tt("You don't have access to this. Ask the store's owner.") : contactsError(data.code, init.fallback) }
  return { ok: true, data: data as T }
}

/**
 * Wave 9: the steps in the order they happened (a subscriber in May who
 * answered a form in September reads May, then September), First seen
 * always first, the steps not reached yet after the rest in their usual
 * order. A step with no day keeps its place among the reached ones.
 */
export function journeyInTime<S extends { reached: boolean; at: string | null }>(steps: S[]): S[] {
  const [first, ...rest] = steps
  const reached = rest.filter((s) => s.reached)
  const dated = reached.filter((s) => s.at && !Number.isNaN(Date.parse(s.at))).sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!))
  let k = 0
  const ordered = reached.map((s) => (s.at && !Number.isNaN(Date.parse(s.at)) ? dated[k++] : s))
  return [first, ...ordered, ...rest.filter((s) => !s.reached)]
}
