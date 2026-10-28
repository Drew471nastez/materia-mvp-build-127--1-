import "server-only"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { creatorFor } from "@/lib/team/server"
import type { TeamArea } from "@/lib/team/roles"

/**
 * ===========================================================================
 *  WHO MAY TOUCH A SHOP'S PHYSICAL COMMERCE
 * ===========================================================================
 * Every merchant route under /api/physical starts here. Two checks, in this
 * order, and nothing else is read until both pass:
 *
 *   the switch   /admin's physical commerce flag. Off: 404, as if the
 *                route did not exist, so turning it off hides everything
 *                without deleting a row.
 *   the owner    the signed in person's own creator row, found by their
 *                verified auth id. The admin client is used after that,
 *                and every query it makes is filtered by this creator id.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

export interface PhysicalCaller {
  creatorId: string
  userId: string
  db: Db
  /** Round 41: false for a team member working in the store. */
  isOwner?: boolean
  /** The account the store belongs to: the signed in owner, or the store's owner for a team member. What is kept by account (a Files folder, a handle) is read with this, never userId. */
  ownerUserId?: string | null
}

const NO_STORE = { "Cache-Control": "no-store" }

export function physicalJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/**
 * `area` is the part of the store the route belongs to (lib/team/roles). A
 * team member working in this store reaches the route only when their role
 * has it; with no area named it is the owner's ("store"), so a route nobody
 * has opened to the team stays the owner's alone. The owner, in their own
 * account, is the owner here as everywhere.
 */
export async function physicalCaller(area: TeamArea = "store"): Promise<PhysicalCaller | NextResponse> {
  if (!(await isPhysicalCommerceEnabled())) return physicalJson({ error: "Not found." }, 404)
  return shopCaller(area)
}

/**
 * The owner check alone, for what every shop has whatever it sells:
 * collections group downloads, courses and memberships as well as goods, so
 * they are not behind the physical commerce switch.
 */
export async function shopCaller(area: TeamArea = "store"): Promise<PhysicalCaller | NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return physicalJson({ error: "Sign in to continue." }, 401)
  const db = createAdminClient()
  /* Whose store: their own, or the one they work in when their role has this area (lib/team/server creatorFor). */
  const found = await creatorFor(db, user.id, area)
  if (found.kind === "denied") return physicalJson({ error: "Your role on this store's team does not include this. Ask the store's owner." }, 403)
  if (found.kind === "none") return physicalJson({ error: "Set up your store first." }, 403)
  return { creatorId: found.creator.id, userId: user.id, db, isOwner: !found.acting, ownerUserId: found.acting ? found.acting.ownerUserId : user.id }
}

/** The JSON body of a request, or null when it is not an object. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

/** A database error as the merchant should read it: never a table name or a constraint. */
export function dbFailure(error: { code?: string; message?: string } | null | undefined, fallback = "That could not be saved. Try again in a moment."): string {
  if (!error) return fallback
  if (error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205") {
    return "Physical commerce needs its database update. Run SQL part 78 in Supabase, then try again."
  }
  if (error.code === "23505") return "That already exists."
  if (error.code === "23514") return "One of the values is out of range."
  if (error.code === "P0001" && error.message) {
    if (error.message.startsWith("insufficient")) return "There is not enough stock for that."
    if (error.message.startsWith("out_of_stock")) return "Some items just sold out."
  }
  return fallback
}
