import "server-only"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"

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
}

const NO_STORE = { "Cache-Control": "no-store" }

export function physicalJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function physicalCaller(): Promise<PhysicalCaller | NextResponse> {
  if (!(await isPhysicalCommerceEnabled())) return physicalJson({ error: "Not found." }, 404)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return physicalJson({ error: "Sign in to continue." }, 401)
  const db = createAdminClient()
  const { data: creator } = await db.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator?.id) return physicalJson({ error: "Set up your store first." }, 403)
  return { creatorId: creator.id as string, userId: user.id, db }
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
