import "server-only"

import { pickStatementName } from "@/lib/payments/statement-name"

export { followsStoreName, pickStatementName } from "@/lib/payments/statement-name"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * THE NAME ON A BUYER'S BANK STATEMENT FOLLOWS THE STORE'S NAME.
 * A name typed in Settings > Payments wins. Otherwise it is the store's name
 * from Store details, so renaming the store renames the statement too.
 * Older settings saved the username in the field without anyone choosing
 * it: a saved value that is just the username or display name counts as
 * "not chosen", and the store name is used. Cut to Stripe's room
 * automatically (lib/payments/platform-descriptor), never refused for length.
 */
export async function sellerStatementName(db: Db, creatorId: string | null | undefined): Promise<string> {
  if (!creatorId) return ""
  const [creatorRes, storeRes] = await Promise.all([
    db.from("creators").select("statement_descriptor, display_name, slug").eq("id", creatorId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
    db.from("store_settings").select("store_name").eq("creator_id", creatorId).maybeSingle().then((r: unknown) => r, () => ({ data: null })),
  ])
  const c = ((creatorRes as { data?: Record<string, unknown> | null })?.data ?? {}) as Record<string, unknown>
  const s = ((storeRes as { data?: Record<string, unknown> | null })?.data ?? {}) as Record<string, unknown>
  return pickStatementName({
    custom: c.statement_descriptor as string | null,
    storeName: s.store_name as string | null,
    displayName: c.display_name as string | null,
    slug: c.slug as string | null,
  })
}
