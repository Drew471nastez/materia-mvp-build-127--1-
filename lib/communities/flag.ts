import "server-only"

/**
 * THE COMMUNITIES SWITCH (platform_flags key "communities", set at
 * /admin/communities). Off means every community page is a 404, every
 * community API answers 404 communities_off first thing, and the cron skips.
 * Nothing is deleted, and the payment hooks keep members in step with billing
 * while it is off, so access is right the moment it comes back on.
 */
import { NextResponse } from "next/server"
import { readFlag } from "@/lib/platform/flags"

export async function communitiesEnabled(): Promise<boolean> {
  return readFlag("communities")
}

/** The first line of every community route: null when on, a 404 when off. */
export async function requireCommunitiesOn(): Promise<NextResponse | null> {
  if (await communitiesEnabled()) return null
  return NextResponse.json({ error: "communities_off" }, { status: 404, headers: { "Cache-Control": "no-store" } })
}
