/**
 * ===========================================================================
 *  /api/ai-keys: THE CREATOR'S OWN AI
 * ===========================================================================
 *   GET               what is connected: each source's last four characters,
 *                     when it was last used, the last refusal. Never a key.
 *   POST              { source: "openai", key } checks the key
 *                     with its provider (lib/ai-keys/verify), then keeps it
 *                     sealed (lib/ai-keys/crypto).
 *   DELETE ?source=   forgets one. Storelib AI answers again from the next
 *                     message.
 */
import { NextResponse, type NextRequest } from "next/server"
import { currentCreatorId } from "@/lib/creators/current"
import { isKeySource, listKeys, removeKey, saveKey } from "@/lib/ai-keys/store"
import { checkKey } from "@/lib/ai-keys/verify"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isConfigured } from "@/lib/sites/agent/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NOT_SET_UP = "Connecting your own AI is not switched on yet. It needs one database update (supabase/sql/run-now/37_own_ai_keys.sql)."

export async function GET() {
  const creatorId = await currentCreatorId()
  if (!creatorId) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })
  const own = await listKeys(creatorId).catch(() => null)
  if (!own) return NextResponse.json({ error: "Could not read your connections." }, { status: 500 })
  return NextResponse.json(
    { keys: own.keys, setUp: !own.tableMissing, storelib: isConfigured("openai") },
    { headers: { "cache-control": "no-store" } },
  )
}

export async function POST(request: NextRequest) {
  const creatorId = await currentCreatorId()
  if (!creatorId) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { source?: unknown; key?: unknown } | null
  const source = body?.source
  const key = typeof body?.key === "string" ? body.key.trim() : ""
  /* A Claude key is not taken while Storelib AI runs on OpenAI only (lib/sites/agent/provider.ts); one kept from before stays until it is removed. */
  if (source !== "openai") return NextResponse.json({ error: "Add an OpenAI key." }, { status: 400 })
  if (!key || key.length > 400) return NextResponse.json({ error: "Paste your key." }, { status: 400 })

  const limited = await rateLimit({ bucket: "ai-key", subjects: [creatorId], windows: LIMITS.aiKey, message: "That is a lot of keys in a short time. Try again in a few minutes." })
  if (limited) return limited

  const check = await checkKey(source, key)
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: 422 })

  const saved = await saveKey(creatorId, source, key)
  if (!saved.ok) {
    return NextResponse.json({ error: saved.tableMissing ? NOT_SET_UP : "Could not save your key. Try again." }, { status: saved.tableMissing ? 503 : 500 })
  }
  const own = await listKeys(creatorId)
  return NextResponse.json({ keys: own.keys, setUp: true, unchecked: !!("unchecked" in check && check.unchecked) })
}

export async function DELETE(request: NextRequest) {
  const creatorId = await currentCreatorId()
  if (!creatorId) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })
  const source = request.nextUrl.searchParams.get("source")
  if (!isKeySource(source)) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 })
  try {
    await removeKey(creatorId, source)
  } catch {
    return NextResponse.json({ error: "Could not remove it. Try again." }, { status: 500 })
  }
  const own = await listKeys(creatorId)
  return NextResponse.json({ keys: own.keys, setUp: !own.tableMissing })
}
