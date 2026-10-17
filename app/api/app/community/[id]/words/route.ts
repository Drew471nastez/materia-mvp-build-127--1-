import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { audit } from "@/lib/communities/server/audit"
import { manageLimit } from "@/lib/communities/server/creator"
import { can } from "@/lib/communities/permissions"
import { reasonOf } from "@/lib/communities/server/db"
import { WORDS_ACTIONS, cleanWordList, withWordSettings, wordSettingsOf, type WordsAction } from "@/lib/communities/word-filter"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * THE COMMUNITY'S BLOCKED WORDS (round 13, lib/communities/word-filter.ts).
 *
 * GET /api/app/community/<id>/words  -> { words: string[], action: "block" | "hold", canEdit }
 *     The owner, admins and moderators read it (a moderator needs to know
 *     why something was refused).
 * PUT /api/app/community/<id>/words  { words: string[] | string, action?: "block" | "hold" }
 *     -> { words, action }. Settings permission (owner and admins). The
 *     whole list each time, cleaned (lower case, repeats dropped); the first
 *     entry that cannot be kept is answered 400 with why.
 *
 * Kept in communities.onboarding.safety beside slow mode, so it needs no
 * column; the welcome steps' save keeps it (safety.ts keptSafety).
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view")
  if (gate instanceof NextResponse) return gate
  const s = wordSettingsOf(gate.community.onboarding)
  return NextResponse.json({ words: s.words, action: s.action, canEdit: can(gate.role, "manage_settings", gate.viewer.perms) }, { headers: noStore })
}

export async function PUT(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const list = cleanWordList(body.words)
  if (!list.ok) return NextResponse.json({ error: list.error, field: "words" }, { status: 400, headers: noStore })
  const before = wordSettingsOf(gate.community.onboarding)
  let action: WordsAction = before.action
  if (body.action !== undefined) {
    if (!(WORDS_ACTIONS as readonly unknown[]).includes(body.action)) return NextResponse.json({ error: "Pick what happens to a post with one of the words.", field: "action" }, { status: 400, headers: noStore })
    action = body.action as WordsAction
  }
  const db = gate.ctx.admin
  /* Read again just before writing, so a save of the welcome steps or slow mode a moment ago is kept. */
  const { data: fresh } = await db.from("communities").select("onboarding").eq("id", gate.community.id).maybeSingle()
  const onboarding = withWordSettings((fresh as { onboarding?: unknown } | null)?.onboarding ?? gate.community.onboarding, { words: list.value, action })
  const { error } = await db.from("communities").update({ onboarding }).eq("id", gate.community.id)
  if (error) {
    console.error(`[communities] word list not saved: ${reasonOf(error)}`)
    return NextResponse.json({ error: "That did not save. Try again." }, { status: 500, headers: noStore })
  }
  const added = list.value.filter((w) => !before.words.includes(w))
  const removed = before.words.filter((w) => !list.value.includes(w))
  if (added.length || removed.length || action !== before.action) {
    await audit(db, {
      communityId: gate.community.id,
      actorId: gate.ctx.userId,
      actorKind: "member",
      action: "community.words_updated",
      targetType: "community",
      targetId: gate.community.id,
      targetLabel: gate.community.name,
      reason: `Blocked words: ${list.value.length}${action === "hold" ? ", held for review" : ", refused"}`,
      detail: { added: added.slice(0, 50), removed: removed.slice(0, 50), action },
    })
  }
  return NextResponse.json({ words: list.value, action }, { headers: noStore })
}
