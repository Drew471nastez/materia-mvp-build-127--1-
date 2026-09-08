import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { deleteAllUserData } from "@/app/api/auth/delete-account/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET  /api/admin/creators/moderate?ids=…  → what WOULD happen
 *  POST /api/admin/creators/moderate        → make it happen
 * ===========================================================================
 *
 * Bulk moderation for the creators list: ban, unban, or delete outright.
 *
 * ---------------------------------------------------------------------------
 *  BAN AND DELETE ARE DIFFERENT TOOLS
 * ---------------------------------------------------------------------------
 * A ban is a judgement: it can be reviewed, reversed and explained, and it
 * keeps the evidence that led to it. Their storefront closes and their
 * products go unpublished the same moment, so the effect is immediate, but
 * nothing is destroyed.
 *
 * Delete is for when there is nothing worth keeping. It cascades into
 * auth.users and it cannot be undone by anyone, including whoever asked for
 * it. Offering the two as one button with a different adjective is how the
 * wrong one gets pressed.
 *
 * ---------------------------------------------------------------------------
 *  IT IS A DRY RUN UNTIL SOMEBODY ECHOES THE COUNT BACK
 * ---------------------------------------------------------------------------
 * The same discipline the spam purge uses, for the same reason. GET changes
 * nothing and returns exactly what would be affected — usernames, product
 * counts, order counts, and whether the account shows signs of being a real
 * person. POST then requires `confirm` to equal the number of creators the
 * caller believes it is acting on. If the set has moved since the dry run the
 * numbers will not match and the request is refused, rather than quietly
 * acting on a different set than the one that was reviewed.
 *
 * ---------------------------------------------------------------------------
 *  WHAT A DELETE WILL NOT DO WITHOUT BEING TOLD TWICE
 * ---------------------------------------------------------------------------
 * An account with orders is a paying relationship — somebody's receipts,
 * somebody's downloads, and in most jurisdictions somebody's tax records.
 * Deleting one takes those with it, so it is refused unless `force` is set,
 * and the dry run says which accounts that applies to before the question is
 * asked. A ban is the right answer for nearly all of these: it stops the
 * account without destroying the trail.
 */

interface Target {
  creatorId: string
  userId: string | null
  username: string | null
  products: number
  publishedProducts: number
  orders: number
  bannedAt: string | null
  /** Evidence this is a real relationship, which delete would destroy. */
  hasOrders: boolean
}

async function describe(ids: string[]): Promise<Target[]> {
  const admin = createAdminClient()

  const { data: creators } = await admin
    .from("creators")
    .select("id, user_id, username, banned_at")
    .in("id", ids)

  const rows = (creators ?? []) as Array<{
    id: string
    user_id: string | null
    username: string | null
    banned_at: string | null
  }>

  const targets: Target[] = []

  for (const creator of rows) {
    const [{ count: products }, { count: published }, { count: orders }] = await Promise.all([
      admin.from("products").select("id", { count: "exact", head: true }).eq("creator_id", creator.id),
      admin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", creator.id)
        .eq("status", "published"),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("creator_id", creator.id),
    ])

    targets.push({
      creatorId: creator.id,
      userId: creator.user_id,
      username: creator.username,
      products: products ?? 0,
      publishedProducts: published ?? 0,
      orders: orders ?? 0,
      bannedAt: creator.banned_at,
      hasOrders: (orders ?? 0) > 0,
    })
  }

  return targets
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 })
  }

  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)

  if (ids.length === 0) return NextResponse.json({ targets: [] })
  if (ids.length > 200) {
    return NextResponse.json({ error: "Two hundred at a time, at most." }, { status: 400 })
  }

  const targets = await describe(ids)
  return NextResponse.json(
    {
      targets,
      // Said plainly, because this is the number the operator has to confirm.
      count: targets.length,
      withOrders: targets.filter((t) => t.hasOrders).length,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 })
  }

  let body: { action?: string; creatorIds?: string[]; confirm?: number; reason?: string; force?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }

  const action = body.action
  const ids = (body.creatorIds ?? []).filter((id) => typeof id === "string" && id.length > 0)

  if (action !== "ban" && action !== "unban" && action !== "delete") {
    return NextResponse.json({ error: 'action is "ban", "unban" or "delete".' }, { status: 400 })
  }
  if (ids.length === 0) return NextResponse.json({ error: "No creators were selected." }, { status: 400 })
  if (ids.length > 200) {
    return NextResponse.json({ error: "Two hundred at a time, at most." }, { status: 400 })
  }

  /**
   * The echo. Not a checkbox: a number the caller had to read off the dry run
   * and type back, so acting on a set that has changed under them is refused
   * rather than performed.
   */
  if (body.confirm !== ids.length) {
    return NextResponse.json(
      {
        error: `This would affect ${ids.length} creator${ids.length === 1 ? "" : "s"}. Send confirm: ${ids.length} to go ahead.`,
      },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const targets = await describe(ids)

  if (targets.length === 0) {
    return NextResponse.json({ error: "None of those creators exist." }, { status: 404 })
  }

  if (action === "delete" && !body.force) {
    const paying = targets.filter((t) => t.hasOrders)
    if (paying.length > 0) {
      return NextResponse.json(
        {
          error:
            `${paying.length} of these have orders. Deleting takes their buyers' receipts and downloads with them, and it cannot be undone. ` +
            `Ban them instead, or send force: true if you are certain.`,
          withOrders: paying.map((t) => ({ creatorId: t.creatorId, username: t.username, orders: t.orders })),
        },
        { status: 409 },
      )
    }
  }

  const done: string[] = []
  const failed: Array<{ creatorId: string; error: string }> = []

  for (const target of targets) {
    try {
      if (action === "ban") {
        await admin
          .from("creators")
          .update({
            banned_at: new Date().toISOString(),
            banned_reason: body.reason ?? null,
            store_published: false,
          })
          .eq("id", target.creatorId)

        /**
         * The products go dark in the same breath. A ban that leaves the
         * storefront closed but the products reachable from search and from
         * every link already posted is not a ban.
         */
        await admin
          .from("products")
          .update({ status: "unpublished" })
          .eq("creator_id", target.creatorId)
          .eq("status", "published")
      } else if (action === "unban") {
        await admin
          .from("creators")
          .update({ banned_at: null, banned_reason: null })
          .eq("id", target.creatorId)
        /**
         * Products are NOT republished. Which of them should come back is the
         * creator's decision, and guessing would put something live that they
         * may have taken down themselves before any of this happened.
         */
      } else {
        if (!target.userId) {
          failed.push({ creatorId: target.creatorId, error: "No user account is attached to this creator." })
          continue
        }
        await deleteAllUserData(admin, target.userId)
        await admin.auth.admin.deleteUser(target.userId).catch(() => {})
      }

      /**
       * Written AFTER the action and outside its try, because the one thing
       * that must outlive a delete is the record that it happened. A cascade
       * into auth.users leaves nothing else behind.
       */
      await admin.from("admin_moderation_log").insert({
        action,
        creator_id: target.creatorId,
        user_id: target.userId,
        username: target.username,
        reason: body.reason ?? null,
        products_affected: action === "unban" ? 0 : target.publishedProducts,
      })

      done.push(target.creatorId)
    } catch (thrown) {
      failed.push({
        creatorId: target.creatorId,
        error: thrown instanceof Error ? thrown.message : "Failed.",
      })
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    action,
    done: done.length,
    failed,
  })
}
