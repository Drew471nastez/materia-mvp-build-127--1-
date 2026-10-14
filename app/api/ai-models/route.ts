import { NextResponse } from "next/server"
import { currentCreatorId } from "@/lib/creators/current"
import { readKeys } from "@/lib/ai-keys/store"
import { claudeModels } from "@/lib/sites/agent/claude-models"
import { enginesWithClaudeModels } from "@/lib/website-builder/ask-engines"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const creatorId = await currentCreatorId()
  if (!creatorId) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })
  const keys = await readKeys(creatorId).catch(() => ({} as Awaited<ReturnType<typeof readKeys>>))
  const key = keys.anthropic || process.env.ANTHROPIC_API_KEY
  let models: Awaited<ReturnType<typeof claudeModels>> = []
  let unavailable = false
  if (key) {
    try { models = await claudeModels(key) } catch { unavailable = true }
  }
  return NextResponse.json({ engines: enginesWithClaudeModels(models), claudeConfigured: !!key, unavailable }, { headers: { "Cache-Control": "private, no-store" } })
}
