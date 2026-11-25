import { NextResponse } from "next/server"
import { readSetupState } from "@/lib/website-builder/setup-state"
import { authUnavailableResponse, readUserForRoute } from "@/lib/auth/route-user"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

/**
 * GET /api/website-builder/setup
 *
 * Which of the builder's migrations have been run. Asked by the editor so it
 * can say what it cannot do yet, where that matters, instead of quietly doing
 * less.
 *
 * SIGNED IN ONLY. The answer describes the shape of the database, which is
 * nobody's business but the people who run it. It carries no data from any of
 * those tables and nothing about any particular creator.
 *
 * ADMINS ONLY GET THE ANSWER (round 61). A missing table is the owner's to
 * fix in the SQL editor, never a creator's: a creator publishing a blog post
 * was told to run a SQL file. Publishing works the same either way (the
 * backup is taken after the answer and skipped quietly when the table is not
 * there), so a creator gets `setup: null` and the editor says nothing.
 */
export async function GET() {
  const { data: { user }, unavailable } = await readUserForRoute()
  if (unavailable) return authUnavailableResponse()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = await isAdminAuthenticated().catch(() => false)
  if (!admin) return NextResponse.json({ setup: null, admin: false })
  return NextResponse.json({ setup: await readSetupState(), admin: true })
}
