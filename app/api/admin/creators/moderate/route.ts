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

/**
 * The creators a request is about: either named outright, or everyone signed
 * up inside a window.
 *
 * A window is how a wave gets cleared — "everything from the 4th of June" is
 * one decision rather than four hundred clicks — and it is also the shape most
 * likely to catch somebody real by accident. So it resolves to a LIST first,
 * and the list is what the operator reads and confirms. There is no path where
 * a date range is acted on without its members being counted.
 */
export interface Selection {
  ids?: string[]
  /** ISO date or timestamp. Inclusive. */
  from?: string
  /** ISO date or timestamp. Exclusive, so a whole day is from D to D+1. */
  to?: string
}

async function resolve(selection: Selection): Promise<string[]> {
  if (selection.ids && selection.ids.length > 0) return selection.ids
  if (!selection.from && !selection.to) return []

  const admin = createAdminClient()
  let query = admin.from("creators").select("id").order("created_at", { ascending: true }).limit(1000)

  if (selection.from) query = query.gte("created_at", selection.from)
  if (selection.to) query = query.lt("created_at", selection.to)

  const { data } = await query
  return ((data as Array<{ id: string }> | null) ?? []).map((row) => row.id)
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

  const params = new URL(request.url).searchParams
  const ids = await resolve({
    ids: (params.get("ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  })

  if (ids.length === 0) return NextResponse.json({ targets: [], count: 0, withOrders: 0 })
  if (ids.length > 500) {
    return NextResponse.json(
      { error: `That range holds ${ids.length} creators. Narrow it — five hundred is the most this will act on at once.` },
      { status: 400 },
    )
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

  let body: {
    action?: string
    creatorIds?: string[]
    from?: string
    to?: string
    confirm?: number
    reason?: string
    force?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }

  const action = body.action

  if (action !== "ban" && action !== "unban" && action !== "delete") {
    return NextResponse.json({ error: 'action is "ban", "unban" or "delete".' }, { status: 400 })
  }

  /**
   * RESOLVED AGAIN, HERE, from the same window the dry run used.
   *
   * Not taken from the client's list. A range that has gained a member since
   * the preview then produces a different count from the one being confirmed,
   * and the echo below refuses it — which is the whole point of the echo. If
   * the ids were trusted, a stale page could act on a set nobody reviewed.
   */
  const ids = await resolve({
    ids: (body.creatorIds ?? []).filter((id) => typeof id === "string" && id.length > 0),
    from: body.from,
    to: body.to,
  })

  if (ids.length === 0) return NextResponse.json({ error: "No creators were selected." }, { status: 400 })
  if (ids.length > 500) {
    return NextResponse.json(
      { error: `That range holds ${ids.length} creators. Narrow it — five hundred is the most this will act on at once.` },
      { status: 400 },
    )
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

/**
 * postgrest-js does not throw. `await admin.from(...).update(...)` resolves to
 * `{ error }` and, if nothing reads it, a refused write is indistinguishable
 * from a successful one.
 *
 * That is not hypothetical here. `products.status` is
 * `CHECK (status IN ('draft', 'published', 'unpublished'))` only AFTER the
 * migration that widens it; before that, writing "unpublished" is a 23514 and
 * the ban would have reported success while every product stayed published and
 * purchasable. Exactly the thing a ban is for.
 *
 * So every write in the ban path goes through this, and a refusal becomes a
 * throw that the loop records in `failed` against the creator it belongs to.
 */
async function must<T extends { error: { message: string } | null }>(
  write: PromiseLike<T>,
  what: string,
): Promise<void> {
  const { error } = await write
  if (error) throw new Error(`Could not ${what}: ${error.message}`)
}

  const done: string[] = []
  const failed: Array<{ creatorId: string; error: string }> = []

  for (const target of targets) {
    try {
      if (action === "ban") {
        await must(
          admin
            .from("creators")
            .update({
              banned_at: new Date().toISOString(),
              banned_reason: body.reason ?? null,
              store_published: false,
            })
            .eq("id", target.creatorId),
          "close the storefront",
        )

        /**
         * The products go dark in the same breath. A ban that leaves the
         * storefront closed but the products reachable from search and from
         * every link already posted is not a ban.
         */
        await must(
          admin
            .from("products")
            .update({ status: "unpublished" })
            .eq("creator_id", target.creatorId)
            .eq("status", "published"),
          "unpublish the products",
        )
      } else if (action === "unban") {
        await must(
          admin
            .from("creators")
            .update({ banned_at: null, banned_reason: null })
            .eq("id", target.creatorId),
          "lift the ban",
        )
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
