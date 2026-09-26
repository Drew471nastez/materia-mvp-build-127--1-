/**
 * ===========================================================================
 *  WHICH DEVICES A NOTIFICATION GOES TO, WHEN ONE LOGIN HAS MORE THAN ONE
 *  BUSINESS
 * ===========================================================================
 * A phone registers its push token for the account that is open on it
 * (app/api/push/register), and a token belongs to one account at a time
 * (push_tokens is unique on token). Each business of a login is an account
 * of its own (lib/businesses), so switching to the second business on the
 * phone moved the token there: the first business's sales stopped reaching
 * the phone the moment the person looked at the other one, and came back
 * only when they switched again. The same for a browser's subscription.
 *
 * Every business of a login is the same person. So a notification for one
 * of them goes to every device registered to any of them, and on a device
 * that is on another of the login's businesses its title says which business
 * it is about: "Loudlib: New sale", so a sale is never read as the one the
 * phone has open. Nobody outside the login is ever added: the accounts come
 * from the login's group, read on the server (lib/businesses/server
 * businessGroup).
 *
 * Free of any server dependency so tests/push-recipients.test.ts holds it.
 */

export interface TokenRow {
  id: string
  token: string
  platform: string
  user_id: string
}

/** One row per device: a token registered twice (it should not be) is sent to once, as the account the notification is for when it is one of them. */
export function devicesFor(rows: TokenRow[], userId: string): TokenRow[] {
  const byToken = new Map<string, TokenRow>()
  for (const row of rows) {
    const had = byToken.get(row.token)
    if (!had || (had.user_id !== userId && row.user_id === userId)) byToken.set(row.token, row)
  }
  return [...byToken.values()]
}

/** The title on one device: as it is on the business's own devices, with the business's name in front on a device that is on another business of the login. */
export function titleOn(device: Pick<TokenRow, "user_id">, userId: string, title: string, businessName: string | null): string {
  if (device.user_id === userId) return title
  const name = (businessName ?? "").trim()
  return name ? `${name}: ${title}` : title
}
