import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { readSetupState } from "@/lib/website-builder/setup-state"

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
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({ setup: await readSetupState() })
}
