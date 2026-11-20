import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { telegramConfig } from "@/lib/community-roles/config"
import { webhookSecretOk } from "@/lib/community-roles/telegram-api"
import { realDeps } from "@/lib/community-roles/engine"
import { handleTelegramUpdate } from "@/lib/community-roles/setup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/community-roles/telegram/webhook: the Storelib bot's updates.
 * Refused (401) unless X-Telegram-Bot-Api-Secret-Token is TELEGRAM_WEBHOOK_SECRET,
 * compared in constant time; 404 with no bot set up. Handled: /link <code>
 * in a group or channel, members joining with a Storelib invite or leaving,
 * and the bot's own rights changing. Answered 200 once handled, or when the
 * update is not one of ours, so Telegram does not send it again; 500 only
 * when the database failed, so it does.
 */
export async function POST(request: Request) {
  const config = telegramConfig()
  if (!config) return NextResponse.json({ error: "Not found." }, { status: 404 })
  if (!webhookSecretOk(config, request.headers.get("x-telegram-bot-api-secret-token"))) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  const text = await request.text().catch(() => "")
  if (text.length > 256_000) return NextResponse.json({ ok: true })
  let update: unknown
  try {
    update = JSON.parse(text)
  } catch {
    return NextResponse.json({ ok: true })
  }
  try {
    const outcome = await handleTelegramUpdate(realDeps(createAdminClient()), update)
    return NextResponse.json({ ok: true, outcome })
  } catch (e) {
    console.error("[telegram/webhook] update not handled:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Not handled." }, { status: 500 })
  }
}
