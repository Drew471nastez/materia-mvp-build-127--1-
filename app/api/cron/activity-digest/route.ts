import { NextResponse } from "next/server"
import { runActivityDigest } from "@/lib/push/activity-db"

/**
 * CRON: send the batched social-activity notifications.
 *
 *   POST /api/cron/activity-digest      (Vercel cron, every 15 minutes)
 *   GET  /api/cron/activity-digest      (same thing — Vercel cron issues GET)
 *
 * The tick is frequent; the notifications are not. Every gate that decides
 * whether anybody actually hears anything lives in
 * lib/push/activity-notification.ts — a ten-minute settle window, a four-hour
 * floor per person, and quiet hours — and they are all evaluated per recipient
 * against the database. So running this often costs a scan and sends nothing;
 * what it buys is that a follow at 14:02 is a notification at 14:15 rather than
 * at 15:00.
 *
 * Authenticated with CRON_SECRET, the same way the other three crons in this
 * project are. Vercel sends it as `Authorization: Bearer $CRON_SECRET`. When
 * the variable is unset the check is skipped, which matches the existing crons
 * and keeps a preview deployment working — worth knowing rather than assuming.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** The scan plus a few hundred sends. Well inside it, with room for a slow day. */
export const maxDuration = 60

async function handle(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await runActivityDigest(new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (e: any) {
    console.error("[cron/activity-digest] failed:", e?.message ?? e)
    return NextResponse.json({ error: "digest failed" }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
