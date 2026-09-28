import "server-only"

import { randomBytes } from "node:crypto"

/**
 * ===========================================================================
 *  DELETING AN ACCOUNT WITHOUT TAKING ANYBODY ELSE'S THINGS WITH IT
 * ===========================================================================
 * What deleting used to do: every row under the account, one table after
 * another, each failure ignored, then the sign in account itself. For a
 * creator that deleted every buyer's library entry for their products, the
 * products and files those buyers paid for, the orders, refunds, payouts and
 * the whole balance history. For a buyer it deleted their orders, which are
 * also the seller's sales records. And a step that failed was never known.
 *
 * What it does now, as the big platforms do it:
 *
 *   SETTLE FIRST. A creator with money still on its way, waiting, or owed
 *   (a balance below zero from a refund or a dispute), or a dispute still
 *   open, is told what is left to settle and nothing is deleted
 *   (deletionBlockers). An admin can go ahead regardless; the records are
 *   kept either way.
 *
 *   NOTHING ANYBODY PAID FOR GOES. An account that ever sold, paid out or was
 *   billed is RETIRED, not wiped: the store closes (products archived, the
 *   storefront, website, OnePage, domains and marketing lists gone), the
 *   person's own details are erased (name, photo, handle, email, address),
 *   and the sign in account is closed for good under an address nobody owns,
 *   which frees their real address for a new account. Buyers keep the
 *   products, files and courses they bought; the orders, refunds, payouts,
 *   invoices and balance history stay, because they are also the seller's,
 *   the buyers' and Storelib's financial records.
 *
 *   An account with none of that (a buyer, a creator who never sold) is
 *   REMOVED completely, as before, except that a buyer's orders stay as the
 *   seller's records, with the account detached from them.
 *
 *   EVERY STEP IS COUNTED. A step that fails is named, logged, and written to
 *   public.account_deletions (run-now part 65) with the others, so a
 *   half-done deletion is visible and can be run again: every step can.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type DeletionMode = "removed" | "retired"

export interface DeletionResult {
  ok: boolean
  mode: DeletionMode
  failures: string[]
}

/** A table or column this database does not have: nothing to delete there. */
function absent(error: { code?: string } | null | undefined): boolean {
  const c = String(error?.code ?? "")
  return c === "42P01" || c === "42703" || c === "PGRST205" || c === "PGRST204"
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

async function creatorOf(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function countOf(admin: Admin, table: string, column: string, value: string | string[]): Promise<number> {
  let q = admin.from(table).select("id", { count: "exact", head: true })
  q = Array.isArray(value) ? q.in(column, value) : q.eq(column, value)
  const { count, error } = await q
  if (error) {
    if (absent(error)) return 0
    throw new Error(`${table} could not be counted: ${error.message}`)
  }
  return count ?? 0
}

/**
 * What stands between this account and being deleted, in words for the
 * person. Empty when nothing does. A read that fails is a blocker too: not
 * knowing is not the same as nothing being owed.
 */
export async function deletionBlockers(admin: Admin, userId: string): Promise<string[]> {
  const creatorId = await creatorOf(admin, userId)
  if (!creatorId) return []
  const out: string[] = []
  try {
    const { data: ledger, error } = await admin
      .from("seller_ledger")
      .select("pending_amount, available_amount, in_transit_amount, negative_balance")
      .eq("creator_id", creatorId)
      .maybeSingle()
    if (error && !absent(error)) throw new Error(error.message)
    const pending = Number(ledger?.pending_amount ?? 0)
    const available = Number(ledger?.available_amount ?? 0)
    const inTransit = Number(ledger?.in_transit_amount ?? 0)
    const negative = Number(ledger?.negative_balance ?? 0)
    if (available > 0) out.push(`You have ${usd(available)} ready to cash out. Cash it out on Payouts first.`)
    if (pending > 0) out.push(`${usd(pending)} from recent sales is still on hold. It moves to your balance in a few days; cash it out then.`)
    if (inTransit > 0) out.push(`A payout of ${usd(inTransit)} is on its way to your bank. Wait until it arrives.`)
    if (negative > 0) out.push(`Your balance is ${usd(negative)} below zero after a refund or a dispute. It has to be covered first.`)

    const { data: products, error: pErr } = await admin.from("products").select("id").eq("creator_id", creatorId)
    if (pErr && !absent(pErr)) throw new Error(pErr.message)
    const ids = ((products ?? []) as Array<{ id: string }>).map((p) => p.id)
    if (ids.length > 0) {
      const { count, error: dErr } = await admin.from("orders").select("id", { count: "exact", head: true }).in("product_id", ids).eq("status", "disputed")
      if (dErr && !absent(dErr)) throw new Error(dErr.message)
      if ((count ?? 0) > 0) out.push(`${count === 1 ? "A payment is" : `${count} payments are`} still disputed. Wait until the dispute is closed.`)
    }
  } catch (e) {
    console.error("[delete-account] could not check the balance:", e instanceof Error ? e.message : e)
    out.push("We could not check your balance just now, so nothing was deleted. Try again in a minute.")
  }
  return out
}

/** Whether anything under this account is somebody's record: a sale, a library entry, a payout, a bill. */
async function hasFinancialRecords(admin: Admin, creatorId: string): Promise<boolean> {
  const { data: products, error } = await admin.from("products").select("id").eq("creator_id", creatorId)
  if (error && !absent(error)) throw new Error(`products could not be read: ${error.message}`)
  const ids = ((products ?? []) as Array<{ id: string }>).map((p) => p.id)
  const counts = await Promise.all([
    ids.length ? countOf(admin, "orders", "product_id", ids) : 0,
    ids.length ? countOf(admin, "entitlements", "product_id", ids) : 0,
    countOf(admin, "ledger_events", "creator_id", creatorId),
    countOf(admin, "payouts", "creator_id", creatorId),
    countOf(admin, "invoices", "creator_id", creatorId),
  ])
  return counts.some((n) => n > 0)
}

/**
 * Deletes (or retires) one account, as above. `by` names who asked, for the
 * log. The caller has already checked who is asking, and for a person
 * deleting their own account, deletionBlockers.
 */
export async function deleteAccount(admin: Admin, userId: string, by: "self" | "admin" | "spam_purge" | "business_owner"): Promise<DeletionResult> {
  const failures: string[] = []
  const step = async (name: string, run: () => PromiseLike<{ error?: { code?: string; message?: string } | null } | null | undefined>) => {
    try {
      const res = await run()
      const error = res && typeof res === "object" ? res.error : null
      if (error && !absent(error)) failures.push(`${name}: ${error.message ?? "failed"}`)
    } catch (e) {
      failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const creatorId = await creatorOf(admin, userId)
  let mode: DeletionMode = "removed"
  try {
    if (creatorId && (await hasFinancialRecords(admin, creatorId))) mode = "retired"
  } catch (e) {
    /* Not knowing is treated as having records: retiring keeps everything a wipe would lose. */
    failures.push(`records check: ${e instanceof Error ? e.message : String(e)}`)
    mode = "retired"
  }
  const started = new Date().toISOString()

  const { data: productRows } = creatorId
    ? await admin.from("products").select("id").eq("creator_id", creatorId)
    : { data: [] }
  const productIds = ((productRows ?? []) as Array<{ id: string }>).map((p) => p.id)
  const byProducts = (table: string) => step(`${table} of the store's products`, () => (productIds.length ? admin.from(table).delete().in("product_id", productIds) : Promise.resolve(null)))
  const byCreator = (table: string, column = "creator_id") => step(table, () => (creatorId ? admin.from(table).delete().eq(column, creatorId) : Promise.resolve(null)))
  const byUser = (table: string, column = "user_id") => step(table, () => admin.from(table).delete().eq(column, userId))

  /* ── The person's own things, whatever the mode ─────────────────────── */
  const personalBuckets = ["avatars", "covers", "onepage-assets", "store-builder-images", "lead-form-files-v2", "email-images"]
  const storeBuckets = ["product-images", "product-videos", "digital-products"]
  const folders = [userId, creatorId].filter((id): id is string => !!id)
  for (const bucket of mode === "removed" ? [...personalBuckets, ...storeBuckets] : personalBuckets) {
    for (const folder of folders) {
      await step(`storage ${bucket}`, async () => {
        await deleteStorageFolder(admin, bucket, folder)
        return null
      })
    }
  }

  /* What they bought leaves with them; the orders stay as the sellers' records, no longer tied to the account. */
  await byUser("entitlements", "buyer_id")
  await step("orders detached from the buyer", () => admin.from("orders").update({ buyer_id: null }).eq("buyer_id", userId))
  await byUser("course_progress", "buyer_id")
  await byUser("wishlist_items")
  await byUser("community_comments", "author_id")
  await byUser("community_posts", "author_id")
  await byUser("library_items")
  await byUser("push_tokens")
  await byUser("security_events")
  await byUser("verification_codes")
  const { data: onepages } = await admin.from("onepages").select("id").eq("owner_id", userId)
  const onepageIds = ((onepages ?? []) as Array<{ id: string }>).map((p) => p.id)
  if (onepageIds.length) await step("onepage_views", () => admin.from("onepage_views").delete().in("onepage_id", onepageIds))
  await byUser("onepages", "owner_id")

  if (creatorId) {
    /* ── The store's shop window and marketing, whatever the mode ─────── */
    for (const t of ["analytics_events", "analytics_daily_rollups", "product_analytics_daily", "product_views", "product_bundles", "subscriber_digital_products"]) await byProducts(t)
    for (const t of ["subscribers", "flow_execution_log", "scheduled_flow_emails", "email_events", "campaign_recipients", "email_campaigns", "email_segments", "email_flows", "email_usage", "seller_notifications", "customers", "payment_connection_events", "email_templates", "community_posts", "payment_methods", "domain_redirects", "custom_domains", "store_builder_configs", "theme_publish_history", "store_theme_installs"]) await byCreator(t)

    if (mode === "removed") {
      /* ── Nothing anybody paid for: the rest goes too ──────────────────── */
      await byUser("refunds", "buyer_id")
      await byCreator("refunds")
      await byCreator("entitlements")
      await byCreator("reviews")
      await byCreator("onepage_billing", "seller_id")
      await byCreator("invoices")
      await byCreator("subscriptions")
      await byCreator("ledger_events")
      await byCreator("seller_ledger")
      await byCreator("coupons")
      for (const t of ["product_variants", "product_videos", "product_slug_history", "courses"]) await byProducts(t)
      await byCreator("digital_assets")
      await byCreator("products")
      await byCreator("payouts")
      await step("creators", () => admin.from("creators").delete().eq("id", creatorId))
    } else {
      /* ── Retired: the store closes, the records stay ──────────────────── */
      await step("products archived", () => admin.from("products").update({ status: "archived", archived: true }).eq("creator_id", creatorId))
      await step("products archived (older database)", () => admin.from("products").update({ status: "archived" }).eq("creator_id", creatorId).neq("status", "archived"))
      await step("coupons ended", () => admin.from("coupons").update({ active: false }).eq("creator_id", creatorId))
      await step("store closed", () => admin.from("creators").update({ store_published: false }).eq("id", creatorId))
      await step("store renamed", () =>
        admin
          .from("creators")
          .update({ slug: `closed-${creatorId.slice(0, 8)}`, username: null, display_name: "Closed store", avatar_url: null, bio: null, headline: null })
          .eq("id", creatorId),
      )
      await step("store marked deleted", () => admin.from("creators").update({ deleted_at: new Date().toISOString() }).eq("id", creatorId))
      for (const col of ["cover_url", "instagram_url", "tiktok_url", "twitter_url", "youtube_url", "website_url", "support_email"]) {
        await step(`store ${col} cleared`, () => admin.from("creators").update({ [col]: null }).eq("id", creatorId))
      }
    }
  }

  /* ── The account itself ─────────────────────────────────────────────── */
  const closedAddress = `deleted-${userId}@deleted.storelib.invalid`
  if (mode === "removed") {
    await byUser("digital_assets")
    await step("profiles", () => admin.from("profiles").delete().eq("id", userId))
  } else {
    await step("profile erased", () => admin.from("profiles").update({ email: closedAddress, username: null, display_name: "Former account", avatar_url: null, bio: null }).eq("id", userId))
    for (const col of ["first_name", "last_name", "address_line1", "address_line2", "city", "state", "postal_code", "country", "phone", "cover_url", "timezone"]) {
      await step(`profile ${col} cleared`, () => admin.from("profiles").update({ [col]: null }).eq("id", userId))
    }
  }
  for (const t of ["account_delete_codes", "email_change_codes", "password_reset_requests", "auth_recovery_requests"]) await byUser(t)

  let ok = true
  if (mode === "removed") {
    let { error } = await admin.auth.admin.deleteUser(userId)
    if (error) {
      await new Promise((r) => setTimeout(r, 500))
      ;({ error } = await admin.auth.admin.deleteUser(userId))
    }
    if (error) {
      ok = false
      failures.push(`sign in account: ${error.message}`)
    }
  } else {
    /* Closed, not deleted: deleting it would take the store's records with it
       (they hang off it). Its address becomes one nobody owns, so the real one
       is free for a new account, and it can never sign in again. */
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email: closedAddress,
      email_confirm: true,
      password: randomBytes(32).toString("hex"),
      ban_duration: "876000h",
      user_metadata: { deleted: true },
    })
    if (error) {
      ok = false
      failures.push(`sign in account closed: ${error.message}`)
    }
  }

  await step("deletion log", () =>
    admin.from("account_deletions").insert({
      user_id: userId,
      creator_id: creatorId,
      mode,
      requested_by: by,
      started_at: started,
      finished_at: new Date().toISOString(),
      failures,
    }),
  )
  if (failures.length > 0) {
    const { reportError } = await import("@/lib/observability/report")
    await reportError({ source: "account", where: `account ${mode} (${by})`, error: new Error(`${failures.length} step(s) failed: ${failures.join("; ").slice(0, 1500)}`), context: { userId } })
  }
  return { ok, mode, failures }
}

async function deleteStorageFolder(admin: Admin, bucket: string, prefix: string, depth = 0): Promise<void> {
  /* The folder and the folders inside it (list() is one level), bounded in depth and pages. */
  if (depth > 4) return
  for (let round = 0; round < 20; round++) {
    const { data: entries, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error) {
      if (/not found/i.test(error.message ?? "")) return
      throw new Error(error.message)
    }
    if (!entries || entries.length === 0) return
    const files: string[] = []
    for (const e of entries as { name: string; id: string | null }[]) {
      if (e.id === null) await deleteStorageFolder(admin, bucket, `${prefix}/${e.name}`, depth + 1)
      else files.push(`${prefix}/${e.name}`)
    }
    if (files.length > 0) {
      const { error: removeError } = await admin.storage.from(bucket).remove(files)
      if (removeError) throw new Error(removeError.message)
    }
    if (files.length === 0 || entries.length < 1000) return
  }
}
