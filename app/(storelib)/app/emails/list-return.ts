/**
 * ===========================================================================
 *  BETWEEN THE EMAILS LIST AND A DRAFT
 * ===========================================================================
 * The Products and Coupons lists have the same round trip
 * (app/app/products/list-return.ts, app/app/coupons/list-return.ts); this is
 * the Emails list's, for the composer.
 *
 * A draft opens in the composer, a page of its own (/app/emails/edit/<id>),
 * and its back arrow used to push the list as a new page: the stage's
 * landing over the whole list and the scroll at the top, "a bump" on the way
 * back from every draft. When the list is the page right behind the
 * composer, on the tab the email now belongs to, with nothing opened over
 * it, going back in history returns to it as it was: the same tab, the same
 * scroll, no landing (lib/ui/app-navigation holdLanding, which the list asks
 * for on a return). Otherwise, a draft that was scheduled (it belongs on
 * Scheduled now) or a composer opened from a link, the list is pushed at
 * the right tab, as before.
 *
 * The list notes its address (its query) each time it changes; the note is
 * the last address the list showed, which is the one behind the composer
 * when the list opened it. Module state, in memory, for this tab only.
 */
import { showOfStatus } from "./emails-route"

let listAddress: string | null = null

/** The list's query, noted by the list whenever it changes. */
export function noteListAddress(query: string) {
  listAddress = query
}

/**
 * Would going back land on the list showing an email that is now `tab`
 * (the composer's word: "drafts", "scheduled", "published"), with no email
 * open over it? Round 51: the list is Campaigns, filtered by &show=; All
 * holds every email, so it shows this one too. `behindIsList` is whether the
 * page behind is the Emails list at all (lib/navigation/in-app-history
 * canReturnTo), which only the history can say.
 */
export function listBehindShows(tab: string, behindIsList: boolean, query: string | null = listAddress): boolean {
  if (!behindIsList || query === null) return false
  const p = new URLSearchParams(query)
  if (p.has("email") || p.has("contact") || p.has("message")) return false
  /* No ?tab= is the page's own default, Campaigns (./emails-route.ts). */
  if ((p.get("tab") ?? "campaigns") !== "campaigns") return false
  const show = p.get("show") ?? "all"
  return show === "all" || show === showOfStatus(tab)
}
