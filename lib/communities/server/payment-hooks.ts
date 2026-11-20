import "server-only"

/**
 * ===========================================================================
 *  BILLING TELLS COMMUNITIES, AND CAN NEVER BE BROKEN BY THEM
 * ===========================================================================
 * The two calls the payment code makes after it has done its own work: a
 * membership synced (lib/memberships/sync.ts), a library row written or
 * taken away (lib/checkout/fulfil-payment.ts, /api/checkout/process,
 * /api/checkout/quick-free, lib/stripe/refund-sync.ts). Each loads the
 * community code only when it runs, so the payment files take on no
 * imports, and each catches everything: a community that cannot be updated
 * is logged and fixed on the member's next visit (reconcileAccess), while
 * the payment, the receipt and the library row are already done.
 *
 * They run whether communities are switched on or off, so access is right
 * the moment the switch comes back on.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function communityAccessAfterMembership(db: Db, row: { product_id: string | null; buyer_id: string | null } | null, opts: { fresh?: boolean } = {}): Promise<void> {
  try {
    /* Discord and Telegram first: they return at once and run after the response, and need no community. */
    await communityRoles((m) => m.communityRolesAfterMembership(db, row))
    if (!row?.product_id || !row.buyer_id) return
    const { syncCommunityAccessForMembership } = await import("./membership")
    await syncCommunityAccessForMembership(db, row, opts)
  } catch (e) {
    console.error("[communities] access after a membership sync not updated:", e instanceof Error ? e.message : e)
  }
}

export async function communityAccessAfterEntitlement(
  db: Db,
  e: { userId: string | null | undefined; productId: string | null | undefined; orderId?: string | null; granted: boolean },
): Promise<void> {
  try {
    await communityRoles((m) => m.communityRolesAfterEntitlement(db, { userId: e.userId, productId: e.productId }))
    if (!e.userId || !e.productId) return
    const { syncCommunityAccessForEntitlement } = await import("./membership")
    await syncCommunityAccessForEntitlement(db, { userId: e.userId, productId: e.productId, orderId: e.orderId ?? null, granted: e.granted })
  } catch (err) {
    console.error("[communities] access after a library change not updated:", err instanceof Error ? err.message : err)
  }
}

/**
 * DISCORD ROLES AND TELEGRAM CHATS (lib/community-roles) follow the same two
 * signals. Loaded only when it runs, it returns at once with neither set up,
 * and hands its work to after(), so the payment is answered first. Never throws.
 */
async function communityRoles(fn: (m: typeof import("@/lib/community-roles/hooks")) => Promise<void>): Promise<void> {
  try {
    await fn(await import("@/lib/community-roles/hooks"))
  } catch (e) {
    console.error("[community-roles] access change not queued:", e instanceof Error ? e.message : e)
  }
}
