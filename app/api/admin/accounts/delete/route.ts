import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { deleteAccount, deletionBlockers } from "@/lib/account/delete-account"
import { adminFailure } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { plainReason } from "@/lib/admin/plain-reason"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { maskEmail } from "@/lib/privacy/mask-email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET  /api/admin/accounts/delete?id=…  → what deleting this account would do
 *  POST /api/admin/accounts/delete        → delete or retire it
 * ===========================================================================
 *
 * For the People view in /admin. Uses the shared deleteAccount path (Mailgun is
 * unrelated here; account emails are not sent on deletion).
 *
 * A creator who has sold is retired, not wiped: buyers keep access and
 * financial records stay. Everyone else is removed completely, including
 * auth.users.
 */

interface Preview {
  userId: string
  handle: string | null
  name: string | null
  email: string | null
  role: string | null
  creatorId: string | null
  creatorOrders: number
  buyerOrders: number
  /** What deleteAccount will do. */
  expectedMode: "removed" | "retired"
  blockers: string[]
  isAdmin: boolean
}

async function describeUser(userId: string): Promise<Preview | null> {
  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, username, display_name, email, role, is_creator")
    .eq("id", userId)
    .maybeSingle()
  if (profileError) throw new Error(plainReason(profileError, "profile"))
  if (!profile) return null

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userId)
  if (authError || !authUser?.user) return null

  let creatorId: string | null = null
  let creatorOrders = 0
  if (profile.is_creator) {
    const { data: creator, error: creatorError } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
    if (creatorError && !/42P01|42703|PGRST/.test(creatorError.code ?? "")) {
      throw new Error(plainReason(creatorError, "creator"))
    }
    creatorId = (creator?.id as string | undefined) ?? null
    if (creatorId) {
      const { data: products, error: productsError } = await admin.from("products").select("id").eq("creator_id", creatorId).limit(10000)
      if (productsError) throw new Error(plainReason(productsError, "products"))
      const productIds = ((products ?? []) as Array<{ id: string }>).map((p) => p.id)
      for (let i = 0; i < productIds.length; i += 150) {
        const { count, error: ordersError } = await admin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("product_id", productIds.slice(i, i + 150))
        if (ordersError) throw new Error(plainReason(ordersError, "orders"))
        creatorOrders += count ?? 0
      }
    }
  }

  const { count: buyerOrders, error: buyerOrdersError } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", userId)
  if (buyerOrdersError && !/42P01|42703|PGRST/.test(buyerOrdersError.code ?? "")) {
    throw new Error(plainReason(buyerOrdersError, "orders"))
  }

  let expectedMode: "removed" | "retired" = "removed"
  if (creatorId) {
    const counts = await Promise.all([
      creatorOrders > 0 ? 1 : 0,
      countTable(admin, "ledger_events", "creator_id", creatorId),
      countTable(admin, "payouts", "creator_id", creatorId),
      countTable(admin, "invoices", "creator_id", creatorId),
      creatorId && creatorOrders === 0 ? countEntitlements(admin, creatorId) : 0,
    ])
    if (counts.some((n) => n > 0)) expectedMode = "retired"
  }

  const blockers = await deletionBlockers(admin, userId)

  const email = profile.email ?? authUser.user.email ?? null

  return {
    userId,
    handle: profile.username,
    name: profile.display_name,
    email: email ? maskEmail(email) : null,
    role: profile.role,
    creatorId,
    creatorOrders,
    buyerOrders: buyerOrders ?? 0,
    expectedMode,
    blockers,
    isAdmin: profile.role === "admin",
  }
}

async function countTable(admin: ReturnType<typeof createAdminClient>, table: string, column: string, value: string): Promise<number> {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value)
  if (error) {
    if (/42P01|42703|PGRST/.test(error.code ?? "")) return 0
    throw new Error(error.message)
  }
  return count ?? 0
}

async function countEntitlements(admin: ReturnType<typeof createAdminClient>, creatorId: string): Promise<number> {
  const { data: products, error } = await admin.from("products").select("id").eq("creator_id", creatorId)
  if (error) return 0
  const ids = ((products ?? []) as Array<{ id: string }>).map((p) => p.id)
  if (!ids.length) return 0
  const { count, error: e2 } = await admin.from("entitlements").select("id", { count: "exact", head: true }).in("product_id", ids)
  if (e2) return 0
  return count ?? 0
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 })
  }
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim() ?? ""
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "id is not a user id." }, { status: 400 })
    }
    const preview = await describeUser(id)
    if (!preview) {
      return NextResponse.json({ error: "No account has that id." }, { status: 404 })
    }
    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } })
  } catch (thrown) {
    return adminFailure("account delete preview", thrown)
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 })
  }
  try {
    let body: { userId?: string; confirm?: string; reason?: string; force?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Send JSON." }, { status: 400 })
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    if (!UUID_RE.test(userId)) {
      return NextResponse.json({ error: "userId is not a user id." }, { status: 400 })
    }
    if (body.confirm !== userId) {
      return NextResponse.json(
        { error: "Send confirm set to this account's user id to go ahead." },
        { status: 400 },
      )
    }

    const preview = await describeUser(userId)
    if (!preview) {
      return NextResponse.json({ error: "No account has that id." }, { status: 404 })
    }
    if (preview.isAdmin) {
      return NextResponse.json({ error: "A Storelib admin account cannot be deleted from here." }, { status: 403 })
    }

    if (!body.force && preview.creatorOrders > 0) {
      return NextResponse.json(
        {
          error:
            `This creator has ${preview.creatorOrders} order${preview.creatorOrders === 1 ? "" : "s"}. ` +
            `The account will be retired, not wiped: buyers keep access and records stay. ` +
            `Send force: true if you are certain.`,
          creatorOrders: preview.creatorOrders,
          expectedMode: preview.expectedMode,
        },
        { status: 409 },
      )
    }

    const admin = createAdminClient()
    const outcome = await deleteAccount(admin, userId, "admin")
    if (!outcome.ok) {
      return NextResponse.json(
        { ok: false, error: `The account could not be fully deleted: ${outcome.failures.slice(0, 3).join("; ")}`, mode: outcome.mode, failures: outcome.failures },
        { status: 500 },
      )
    }

    const label = preview.handle ? `@${preview.handle}` : preview.name ?? preview.userId.slice(0, 8)
    const recorded = await recordAdminAction(admin, {
      action: "delete_account",
      targetType: "account",
      targetId: userId,
      targetLabel: label,
      reason: body.reason?.trim() || null,
      detail: { mode: outcome.mode, creator_id: preview.creatorId, creator_orders: preview.creatorOrders },
    })

    return NextResponse.json({
      ok: true,
      mode: outcome.mode,
      label,
      notes: recorded ? [] : ["Done, but it was not written to the audit log."],
      failures: outcome.failures,
    })
  } catch (thrown) {
    return adminFailure("account delete", thrown)
  }
}
