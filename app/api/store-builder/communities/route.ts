import { NextResponse, type NextRequest } from "next/server"

import { requireCommunitiesOn } from "@/lib/communities/flag"
import { DEFAULT_BLOCK_TOGGLES, isCommunityId, type CommunityBlockToggles } from "@/lib/communities/blocks"
import { creatorCommunityChoices, loadCommunityBlock } from "@/lib/communities/server/blocks"
import { isResponse, noStore, requireCreator } from "@/lib/email-campaigns/route-auth"

/**
 * GET /api/store-builder/communities
 *
 * For the creator page builder's Community section, the signed in creator's
 * own communities only:
 *
 *   (no id)   { communities: CommunityChoice[] }, the picker's list
 *   ?id=      the same list and { block }, the section's live data, exactly
 *             what a visitor's page would be handed (null when a visitor
 *             would see nothing). The toggles come as ?show=stats,events,...
 *
 * 404 communities_off while the switch is off: the builder then hides the
 * section, as the page does.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SHOW_KEYS: Record<string, keyof CommunityBlockToggles> = {
  stats: "showStats",
  events: "showEvents",
  posts: "showPosts",
  members: "showMembers",
  leaderboard: "showLeaderboard",
  reviews: "showReviews",
  join: "showJoin",
}

export async function GET(request: NextRequest) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const db = ctx.admin
  const communities = await creatorCommunityChoices(db, ctx.creatorId)
  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ communities }, { headers: noStore })
  if (!isCommunityId(id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const show = request.nextUrl.searchParams.get("show")
  const toggles: Partial<CommunityBlockToggles> = { ...DEFAULT_BLOCK_TOGGLES }
  if (show !== null) {
    for (const k of Object.values(SHOW_KEYS)) toggles[k] = false
    for (const word of show.split(",")) if (SHOW_KEYS[word]) toggles[SHOW_KEYS[word]] = true
  }
  /* loadCommunityBlock reads it by this creator's id, so another creator's community answers null. */
  const block = await loadCommunityBlock(db, ctx.creatorId, id, toggles, { enabled: true })
  return NextResponse.json({ communities, block }, { headers: noStore })
}
