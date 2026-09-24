import "server-only"

import { NextResponse } from "next/server"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

/**
 * ===========================================================================
 *  THE ONE CHECK EVERY ADMIN ROUTE MAKES FIRST
 * ===========================================================================
 * The admin cookie is a signed, dated token (lib/admin-session.ts). Every
 * route under app/api/admin asks for it before it reads or writes anything,
 * and tests/admin-routes.test.ts reads each route file to make sure the call
 * is there, in every handler, above the first service-role client.
 *
 * Two routes are opened with a bearer secret instead (ADMIN_SECRET), because
 * they are called by a script, not by a person with a browser: delete-user
 * and setup-test-user. The login route itself is the one that issues the
 * cookie, so it cannot ask for it.
 *
 *     const denied = await requireAdmin()
 *     if (denied) return denied
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminAuthenticated()) return null
  return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } })
}

/**
 * A failure answered in plain words, with the details kept in the server
 * log. A database or Stripe message never goes to the browser as it came.
 */
export function adminFailure(where: string, error: unknown, said = "That did not work. Nothing was changed.", status = 500) {
  const text = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error)
  console.error(`[admin] ${where}: ${text.replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, "$1***@$2").slice(0, 300)}`)
  return NextResponse.json({ error: said }, { status, headers: { "Cache-Control": "no-store" } })
}
