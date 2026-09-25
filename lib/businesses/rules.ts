/**
 * The rules of two businesses on one login, free of any server or browser
 * dependency so tests/business-accounts.test.ts can hold them to account.
 * The database enforces the same shape (supabase/migrations/
 * 20261001_business_accounts.sql): one second business per login, no chains.
 */

export interface BusinessLink {
  ownerId: string
  memberId: string
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether `from` may switch to `to`: only across the one link they share, never to itself, never to anything but an id. */
export function maySwitch(link: BusinessLink | null, from: string, to: string): boolean {
  if (!link || from === to || !UUID_PATTERN.test(to)) return false
  return (link.ownerId === from && link.memberId === to) || (link.memberId === from && link.ownerId === to)
}
