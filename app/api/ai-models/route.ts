import { NextResponse } from "next/server"
import { currentCreatorId } from "@/lib/creators/current"
import { readKeys } from "@/lib/ai-keys/store"
import { ENGINES } from "@/lib/website-builder/ask-engines"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The models Ask Storelib offers: the fixed list in lib/website-builder/ask-engines.ts,
 * and whether Claude can answer for this creator at all (Storelib's key or their own).
 * The chat draws the same list without asking; this is for anything outside it.
 */
export async function GET() {
  const creatorId = await currentCreatorId()
  if (!creatorId) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })
  const keys = await readKeys(creatorId).catch(() => ({} as Awaited<ReturnType<typeof readKeys>>))
  const configured = !!(keys.anthropic || process.env.ANTHROPIC_API_KEY)
  return NextResponse.json({ engines: ENGINES, claudeConfigured: configured }, { headers: { "Cache-Control": "private, no-store" } })
}
