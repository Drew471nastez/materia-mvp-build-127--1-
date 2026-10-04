import { NextResponse } from "next/server"
import { isResponse, requireCreator, noStore } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"

/**
 * POST /api/app/memberships
 *
 * It used to make a new membership as a draft. Memberships are communities
 * now: a creator who wants members to pay every month makes a paid
 * community (/app/community/new), whose recurring tier is still a
 * membership product made by lib/memberships/creator.ts from the community
 * code, never through here. So this answers 410 and makes nothing.
 *
 * The memberships a creator already sells are untouched: their screen, their
 * settings and posts (./[productId]/**), their billing and their members.
 */
export async function POST() {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  return NextResponse.json({ error: "New memberships are made as paid communities now.", code: "memberships_are_communities" }, { status: 410, headers: noStore })
}
