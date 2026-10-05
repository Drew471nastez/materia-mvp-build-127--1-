/**
 * ===========================================================================
 *  COMMUNITIES: A PRIVATE COMMUNITY THAT COSTS, AND BRINGING PEOPLE BACK
 * ===========================================================================
 * Round 14, items 6 and 7, held from their inputs and against an in memory
 * database where the server code runs:
 *
 *   TWO FACTS      privacy and price are read and written apart
 *                  (lib/communities/access-model.ts): a community stored as
 *                  invite_only still reads as private and free, and
 *                  private + paid is a combination that can now exist.
 *   THE OLD GATE   join.ts no longer refuses everything on a private
 *                  community: no invite is a refusal, an invite is the
 *                  ordinary free or paid way in.
 *   THE INVITE     an invite to a tier that is sold is HELD, not spent: its
 *                  use is counted when the payment lands, and a refund takes
 *                  the access away again.
 *   EVERY READER   every place that compared `access` with "invite_only"
 *                  now reads the privacy and says the price beside it.
 *   THE UNDO       unmute, unsuspend, unban and the new reinstate: each one
 *                  needs the permission that took the action away, none of
 *                  them reverses somebody ranked above the actor, and a paid
 *                  tier nobody pays for comes back as free.
 *   THE WAY BACK   somebody who was banned and let back in passes the gate
 *                  that refused them, with every piece of it cleared.
 *   COPY           no em dash and no banned word anywhere in this work.
 *
 * Run with:  pnpm run test:push
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import {
  accessColumnsFor,
  accessSummary,
  accessWords,
  invitedIn,
  joinCosts,
  needsInvite,
  pricingOf,
  privacyOf,
  COMMUNITY_PRICING,
  COMMUNITY_PRIVACY,
  type CommunityPricing,
  type CommunityPrivacy,
} from "@/lib/communities/access-model"
import { decideJoin, type JoinFacts } from "@/components/community/public/join-state"
import { checkoutPath } from "@/components/community/public/paths"
import type { JoinOption } from "@/components/community/public/types"
import { shareLinkLine, staffInviteLine } from "@/components/community/member/invite-sheet"
import { accessChoiceOf, checkAccessChoice, memberChoices, memberConfirmText, memberDoneText, takenAwayLine } from "@/components/community/creator/logic"
import { checkoutGate, joinCommunity, redeemInvite } from "@/lib/communities/server/join"
import { inviteStanding } from "@/lib/communities/server/invites"
import { reconcileAccess } from "@/lib/communities/server/membership"
import { actOnMember, mayUndo, memberActionNeeds, MEMBER_ACTIONS, UNDO_ACTIONS } from "@/lib/communities/server/moderation"
import { viewerContext } from "@/lib/communities/server/context"
import type { MemberRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
/** An answer read whole, whichever way it went (the suites compile without strict narrowing). */
type Any = { ok: boolean; state?: string; status?: number; error?: string; message?: string; url?: string; already?: boolean; member?: MemberRow | null }
const A = (a: unknown) => a as Any

const C = "a0000000-0000-4000-8000-000000000001"
const U = "b0000000-0000-4000-8000-000000000001"
const OWNER = "c0000000-0000-4000-8000-000000000001"
const ADMIN = "c0000000-0000-4000-8000-000000000002"
const MOD = "c0000000-0000-4000-8000-000000000003"
const CREATOR = "e0000000-0000-4000-8000-000000000001"
const PAID_TIER = "d0000000-0000-4000-8000-000000000001"
const FREE_TIER = "d0000000-0000-4000-8000-000000000002"
const TIER_PRODUCT = "f0000000-0000-4000-8000-000000000001"
const TOKEN = "T".repeat(43)
const HASH = createHash("sha256").update(TOKEN, "utf8").digest("hex")

interface WorldOptions {
  access?: string
  visibility?: string
  paidOnly?: boolean
  approval?: boolean
  invite?: Record<string, unknown> | null
  members?: Record<string, unknown>[]
}

/** The community every case below runs against, with the tiers and people it needs. */
function world(o: WorldOptions = {}) {
  const db = fakeDb(
    {
      communities: [
        {
          id: C,
          slug: "makers",
          name: "Makers",
          tagline: "People who make things",
          description: "<p>We build.</p>",
          creator_id: CREATOR,
          owner_user_id: OWNER,
          access: o.access ?? "invite_only",
          visibility: o.visibility ?? "private",
          status: "published",
          approval_required: o.approval ?? false,
          member_count: 12,
          benefits: [],
          rules: [],
          faq: [],
          onboarding: {},
          deleted_at: null,
          suspended_at: null,
          archived_at: null,
          platform_hidden: false,
        },
      ],
      community_tiers: [
        { id: PAID_TIER, community_id: C, name: "Pro", kind: "paid", billing: "recurring", product_id: TIER_PRODUCT, position: 1, is_default: o.paidOnly === true, archived_at: null, benefits: [] },
        ...(o.paidOnly ? [] : [{ id: FREE_TIER, community_id: C, name: "Members", kind: "free", billing: null, product_id: null, position: 0, is_default: true, archived_at: null, benefits: [] }]),
      ],
      community_access_products: [{ community_id: C, tier_id: PAID_TIER, product_id: TIER_PRODUCT }],
      community_members: [
        { id: "m-owner", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", tier_id: null, banned_at: null, points: 0, level: 1 },
        { id: "m-admin", community_id: C, user_id: ADMIN, role: "admin", source: "free", status: "active", tier_id: FREE_TIER, banned_at: null, points: 0, level: 1 },
        { id: "m-mod", community_id: C, user_id: MOD, role: "moderator", source: "free", status: "active", tier_id: FREE_TIER, banned_at: null, points: 0, level: 1 },
        ...(o.members ?? []),
      ],
      community_invites: o.invite === null ? [] : [{ id: "inv1", community_id: C, token_hash: HASH, tier_id: PAID_TIER, complimentary: false, created_by: OWNER, email: null, max_uses: 1, uses: 0, expires_at: null, revoked_at: null, ...(o.invite ?? {}) }],
      community_invite_uses: [],
      products: [{ id: TIER_PRODUCT, title: "Makers Pro", slug: "makers-pro", type: "membership", status: "published", price_cents: 1900, creator_id: CREATOR, community_id: C, reviews_count: 0, reviews_average: 0 }],
      membership_plans: [{ product_id: TIER_PRODUCT, monthly_price_cents: 1900, yearly_price_cents: 19000, currency: "usd" }],
      creators: [{ id: CREATOR, user_id: OWNER, slug: "ana", display_name: "Ana", avatar_url: null, stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true, onboarding_completed: true }],
      profiles: [
        { id: OWNER, username: "ana", display_name: "Ana Maker", avatar_url: null, email: "ana@example.com" },
        { id: ADMIN, username: "bo", display_name: "Bo Admin", avatar_url: null, email: "bo@example.com" },
        { id: MOD, username: "cy", display_name: "Cy Mod", avatar_url: null, email: "cy@example.com" },
        { id: U, username: "dee", display_name: "Dee Maker", avatar_url: null, email: "dee@example.com" },
      ],
      entitlements: [],
      memberships: [],
      reviews: [],
      community_audit_log: [],
      community_activity: [],
      community_courses: [],
      community_spaces: [],
      community_notifications: [],
    },
    { unique: { community_members: [["community_id", "user_id"]] } },
  )
  /* The one place a use is counted: recorded here so a test can say whether the invite was spent. */
  const spends: { hash: string; user: string }[] = []
  ;(db as { rpc: unknown }).rpc = async (name: string, args: { p_token_hash: string; p_user: string }) => {
    if (name !== "community_redeem_invite") return { data: null, error: null }
    const invite = db.tables.community_invites.find((i) => i.token_hash === args.p_token_hash)
    if (!invite) return { data: { ok: false, reason: "not_found" }, error: null }
    spends.push({ hash: args.p_token_hash, user: args.p_user })
    const already = db.tables.community_invite_uses.some((u) => u.invite_id === invite.id && u.user_id === args.p_user)
    if (!already) {
      db.tables.community_invite_uses.push({ invite_id: invite.id, user_id: args.p_user })
      invite.uses = (invite.uses ?? 0) + 1
    }
    return { data: { ok: true, community_id: invite.community_id, tier_id: invite.tier_id, complimentary: invite.complimentary, invite_id: invite.id, new: !already }, error: null }
  }
  return { db, spends }
}

const rowOf = (db: ReturnType<typeof fakeDb>, userId = U) => db.tables.community_members.find((m) => m.user_id === userId) as Record<string, unknown> | undefined
const inviteOf = (db: ReturnType<typeof fakeDb>) => db.tables.community_invites[0] as Record<string, unknown>

async function main() {
  /* ── Privacy and price are two facts ─────────────────────────────────── */
  console.log("\nPrivacy and price, apart at last")
  {
    check("every combination of the two reads back as itself", COMMUNITY_PRIVACY.every((p) => COMMUNITY_PRICING.every((q) => {
      const cols = accessColumnsFor(p as CommunityPrivacy, q as CommunityPricing)
      return privacyOf(cols) === p && pricingOf(cols) === q
    })))
    check("a community stored as invite_only is private and free, as it always was", privacyOf({ access: "invite_only", visibility: "private" }) === "private" && pricingOf({ access: "invite_only", visibility: "private" }) === "free")
    check("private and paid is a real combination now", JSON.stringify(accessColumnsFor("private", "paid")) === JSON.stringify({ access: "paid", visibility: "private" }))
    check("and it reads as both facts", privacyOf({ access: "paid", visibility: "private" }) === "private" && joinCosts({ access: "paid", visibility: "private" }))
    check("public free and public paid are untouched", JSON.stringify(accessColumnsFor("public", "free")) === JSON.stringify({ access: "free", visibility: "public" }) && JSON.stringify(accessColumnsFor("public", "paid")) === JSON.stringify({ access: "paid", visibility: "public" }))
    check("an invite is needed by a private community, whatever it costs", needsInvite({ access: "invite_only", visibility: "private" }) && needsInvite({ access: "paid", visibility: "private" }))
    check("and never by a public or unlisted one", !needsInvite({ access: "free", visibility: "public" }) && !needsInvite({ access: "paid", visibility: "public" }) && !needsInvite({ access: "free", visibility: "unlisted" }))
    check("the editor reads the pair off a stored row", JSON.stringify(accessChoiceOf({ access: "paid", visibility: "private" })) === JSON.stringify({ privacy: "private", pricing: "paid" }))
    const asked = checkAccessChoice({ pricing: "paid" }, { privacy: "private", pricing: "free" })
    check("changing one leaves the other as it was", asked.ok && asked.value.privacy === "private" && asked.value.pricing === "paid")
    check("a word that is not one is refused", !checkAccessChoice({ privacy: "secret" }, { privacy: "public", pricing: "free" }).ok)
  }
  {
    check("the line under the card says both facts", accessSummary("private", "paid", "$19/month") === "Only people with your link can join, and it costs $19/month.")
    check("private and free says that instead", accessSummary("private", "free", null) === "Only people with your link can join, and it is free.")
    check("public says who can find it", /Anyone can find it/.test(accessSummary("public", "paid", "$19/month")))
    check("a card says the two facts together", accessWords("private", "$19/month") === "Invite only · $19/month")
    check("a private free community keeps the two words it had", accessWords("private", "Free") === "Invite only" && accessWords("private", null) === "Invite only")
    check("a public card is only its price", accessWords("public", "$19/month") === "$19/month" && accessWords("unlisted", null) === null)
  }

  /* ── Every place that read invite_only ───────────────────────────────── */
  console.log("\nEvery reader of the old one switch")
  {
    const free: JoinOption = { tierId: FREE_TIER, name: "Members", description: null, kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }
    const paid: JoinOption = {
      tierId: PAID_TIER,
      name: "Pro",
      description: null,
      kind: "paid",
      billing: "recurring",
      productId: TIER_PRODUCT,
      monthlyCents: 1900,
      yearlyCents: 19000,
      priceCents: null,
      currency: "usd",
      priceLine: "$19/month",
      benefits: [],
      checkout: { month: checkoutPath(TIER_PRODUCT, "makers", "month"), year: null, once: null },
    }
    const facts = (over: { community?: Partial<JoinFacts["community"]>; viewer?: Partial<JoinFacts["viewer"]>; options?: JoinOption[] } = {}): JoinFacts => ({
      community: { slug: "makers", status: "published", access: "invite_only", visibility: "private", approvalRequired: false, suspended: false, archived: false, creatorName: "Ana", ...over.community },
      viewer: { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, invited: false, source: null, membershipId: null, ...over.viewer },
      options: over.options ?? [free],
      accessProducts: [],
      canTakePayments: true,
    })
    const privateFree = decideJoin(facts())
    check("the button on a private free community is what it always was", privateFree.kind === "invite_only" && privateFree.label === "Invite only" && /Ask Ana/.test(privateFree.note ?? ""))
    const privatePaid = decideJoin(facts({ community: { access: "paid" }, options: [paid] }))
    check("a private paid community says the price beside Invite only", privatePaid.kind === "invite_only" && privatePaid.label === "Invite only · $19/month")
    check("and the note says what it costs", /\$19\/month/.test(privatePaid.note ?? "") && /invite link/.test(privatePaid.note ?? ""))
    const invited = decideJoin(facts({ community: { access: "paid" }, options: [paid], viewer: { invited: true } }))
    check("somebody holding an invite gets the ordinary way to pay", invited.kind === "checkout" && invited.label === "Join for $19/month")
    const approvedOne = decideJoin(facts({ options: [free], viewer: { approved: true } }))
    check("an approved request opens the free way in too", approvedOne.kind === "join_free")
    check("a public paid community is untouched", decideJoin(facts({ community: { access: "paid", visibility: "public" }, options: [paid] })).kind === "checkout")
  }
  {
    check("a shared link into a private free community says what it always said", shareLinkLine({ access: "invite_only", visibility: "private" }) === "This community is invite only. People need an invite from an admin.")
    check("into a private paid one it says they pay", /pay to join/.test(shareLinkLine({ access: "paid", visibility: "private" })))
    check("a public paid link is unchanged", shareLinkLine({ access: "paid" }) === "People with the link see the price and pay to join.")
    check("a staff invite into a public paid community still gives it away", staffInviteLine({ access: "paid" }) === "An invite lets someone in without paying.")
    check("into a private paid one it says they see the price", /see the price and pay/.test(staffInviteLine({ access: "paid", visibility: "private" })))
    check("into a private free one it is still the way past a request", /without a request/.test(staffInviteLine({ access: "invite_only", visibility: "private" })))
  }
  {
    /* The sweep: nothing decides privacy by comparing the column with a word any more. */
    const files = [
      "lib/communities/server/join.ts",
      "lib/communities/server/public.ts",
      "lib/communities/server/blocks.ts",
      "lib/communities/server/creator.ts",
      "lib/communities/server/creator-policies.ts",
      "lib/communities/server/share-image.ts",
      "components/community/public/join-state.ts",
      "components/community/member/invite-sheet.tsx",
    ]
    const left = files.filter((f) => /access\s*===\s*"invite_only"|access\s*!==\s*"invite_only"/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "")))
    check("no reader compares access with invite_only any anymore", left.length === 0, left)
    check("the one place that word still means something is the model", /invite_only/.test(read("lib/communities/access-model.ts")))
  }

  /* ── The gate in front of a private community ───────────────────────── */
  console.log("\nJoining a private community")
  {
    const { db } = world()
    const a = await joinCommunity(db, C, U)
    check("no invite, no way in (a private free community, exactly as before)", !A(a).ok && A(a).error === "invite_only" && A(a).status === 403)
    check("and no row was written for them", !rowOf(db))
  }
  {
    const { db } = world({ access: "paid", visibility: "private", paidOnly: true })
    const a = await joinCommunity(db, C, U)
    check("a private paid community refuses a join with no invite too", !A(a).ok && A(a).error === "invite_only")
  }
  {
    const { db } = world({ access: "paid", visibility: "private", paidOnly: true, members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "invite", status: "pending", tier_id: PAID_TIER, invite_id: "inv1", approved_by: OWNER, banned_at: null, points: 0, level: 1 }] })
    const a = await joinCommunity(db, C, U)
    check("holding an invite, the press goes to checkout, not a refusal", A(a).ok && A(a).state === "checkout")
    const url = new URL(String(A(a).url), "https://storelib.com")
    check("to the tier's own product", url.searchParams.get("productId") === TIER_PRODUCT)
    check("and checkout lets them pay", (await checkoutGate({ id: TIER_PRODUCT }, U, db)).refusal === null)
  }
  {
    const { db } = world({ access: "free", visibility: "public" })
    const a = await joinCommunity(db, C, U)
    check("a public free community is joined on the spot, untouched", A(a).ok && A(a).state === "member" && rowOf(db)?.status === "active")
  }
  {
    check("a row with an invite on it counts as a way through", invitedIn({ invite_id: "inv1" }) && invitedIn({ approved_by: OWNER }) && !invitedIn({ invite_id: null, approved_by: null }) && !invitedIn(null))
  }

  /* ── The invite is held, not spent ──────────────────────────────────── */
  console.log("\nAn invite into a community that charges")
  {
    const { db, spends } = world({ access: "paid", visibility: "private", paidOnly: true })
    const held = await redeemInvite(db, C, U, TOKEN)
    check("accepting it answers with where to pay", A(held).ok && A(held).state === "checkout" && /productId/.test(String(A(held).url)))
    check("the row is a request, on the paid tier, approved by whoever invited them", rowOf(db)?.status === "pending" && rowOf(db)?.tier_id === PAID_TIER && rowOf(db)?.approved_by === OWNER && rowOf(db)?.invite_id === "inv1")
    check("THE INVITE IS NOT SPENT: no use counted, nothing recorded", spends.length === 0 && inviteOf(db).uses === 0 && db.tables.community_invite_uses.length === 0)
    const twice = await redeemInvite(db, C, U, TOKEN)
    check("following the link again is the same answer, still unspent", A(twice).ok && A(twice).state === "checkout" && inviteOf(db).uses === 0)

    /* The payment lands: the library row the checkout writes. */
    db.tables.entitlements.push({ buyer_id: U, product_id: TIER_PRODUCT })
    const paid = await reconcileAccess(db, C, U, { automatic: false })
    check("the payment makes them a member", paid?.status === "active" && paid?.tier_id === PAID_TIER)
    check("AND ONLY NOW IS THE INVITE SPENT", inviteOf(db).uses === 1 && db.tables.community_invite_uses.length === 1 && spends.length === 1)
    check("counted for them, by the token's own hash", spends[0]?.user === U && spends[0]?.hash === HASH)
    const again = await reconcileAccess(db, C, U, { automatic: true })
    check("a later visit counts nothing more", again?.status === "active" && inviteOf(db).uses === 1)

    /* And the refund. */
    db.tables.entitlements.length = 0
    const after = await reconcileAccess(db, C, U, { automatic: true })
    check("A REFUND DOES NOT LEAVE THEM INSIDE", after?.status === "expired")
    const viewer = await viewerContext(db, db.tables.communities[0] as never, U)
    check("and the community is shut to them again", !viewer.active)
  }
  {
    const { db, spends } = world({ invite: { complimentary: true, tier_id: null } })
    const got = await redeemInvite(db, C, U, TOKEN)
    check("a complimentary invite still lets somebody straight in", A(got).ok && A(got).state === "member" && rowOf(db)?.status === "active" && rowOf(db)?.source === "invite")
    check("and spends its use there and then, once", spends.length >= 1 && inviteOf(db).uses === 1)
  }
  {
    const used = inviteStanding({ uses: 1, max_uses: 1 }, { email: null })
    check("an invite at its limit is used up", used === "used_up")
    check("and one person already holding it counts against it", inviteStanding({ uses: 0, max_uses: 1 }, { email: null, reserved: 1 }) === "used_up")
    check("room for one more is ok", inviteStanding({ uses: 0, max_uses: 2 }, { email: null, reserved: 1 }) === "ok")
    check("no limit is never used up", inviteStanding({ uses: 99, max_uses: null }, { email: null }) === "ok")
    check("revoked, and expired, say so", inviteStanding({ revoked_at: "2026-01-01T00:00:00Z" }, { email: null }) === "revoked" && inviteStanding({ expires_at: "2026-01-01T00:00:00Z" }, { email: null, now: Date.parse("2026-02-01T00:00:00Z") }) === "expired")
    check("an invite to one address refuses another", inviteStanding({ email: "Dee@example.com" }, { email: "someone@example.com" }) === "email_mismatch" && inviteStanding({ email: "Dee@example.com" }, { email: "dee@example.com" }) === "ok")
    check("and refuses an account with no address at all", inviteStanding({ email: "dee@example.com" }, { email: null }) === "email_mismatch")
  }
  {
    const { db, spends } = world({ access: "paid", visibility: "private", paidOnly: true, invite: { revoked_at: "2026-01-01T00:00:00Z" } })
    const no_ = await redeemInvite(db, C, U, TOKEN)
    check("a revoked invite into a paid community is refused before any row is written", !A(no_).ok && A(no_).error === "revoked" && !rowOf(db) && spends.length === 0)
  }
  {
    const { db } = world({ access: "paid", visibility: "private", paidOnly: true, invite: { uses: 1, max_uses: 1 } })
    check("one that is used up is refused the same way", await redeemInvite(db, C, U, TOKEN).then((r) => !A(r).ok && A(r).error === "used_up"))
  }

  /* ── Bringing people back ───────────────────────────────────────────── */
  console.log("\nBringing somebody back")
  const removedMember = (over: Record<string, unknown> = {}) => ({ id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "removed", tier_id: FREE_TIER, removed_at: "2026-09-01T10:00:00Z", banned_at: null, points: 240, level: 3, ...over })
  const ownerActor = { userId: OWNER, role: "owner" as const, perms: null }
  const modActor = { userId: MOD, role: "moderator" as const, perms: null }
  const adminActor = { userId: ADMIN, role: "admin" as const, perms: null }

  {
    check("reinstate is one of the member actions a route accepts", (MEMBER_ACTIONS as readonly string[]).includes("reinstate"))
    check("and it needs the permission that removed them", memberActionNeeds("reinstate") === "remove_member")
    check("each undo needs the permission of the action it undoes", (Object.keys(UNDO_ACTIONS) as (keyof typeof UNDO_ACTIONS)[]).every((u) => memberActionNeeds(u) === memberActionNeeds(UNDO_ACTIONS[u])))
  }
  {
    const { db } = world({ members: [removedMember()] })
    const before = await joinCommunity(db, C, U)
    check("a removed person is refused by the gate before anything is undone", !A(before).ok && A(before).error === "removed")
    const done = await actOnMember(db, { community: db.tables.communities[0] as never, actor: ownerActor, action: "reinstate", userId: U, reason: "we talked" })
    check("the owner lets them back in", done.ok && A(done).member?.status === "active")
    check("their points and level are theirs still", rowOf(db)?.points === 240 && rowOf(db)?.level === 3)
    check("and nothing of the removal is left on the row", !rowOf(db)?.removed_at && !rowOf(db)?.banned_at)
    check("the audit log says who did it and why", db.tables.community_audit_log.some((r) => r.action === "member.reinstated" && r.actor_id === OWNER && r.reason === "we talked"))
    const after = await viewerContext(db, db.tables.communities[0] as never, U)
    check("THEY PASS THE GATE THAT REFUSED THEM", after.active && !after.banned && after.role === "member")
    const bell = db.tables.community_notifications.find((n) => n.user_id === U)
    check("and they are told, quietly", Boolean(bell) && /can post in Makers again/.test(String(bell?.title)))
  }
  {
    const { db } = world({ members: [removedMember({ status: "active", removed_at: null })] })
    const done = await actOnMember(db, { community: db.tables.communities[0] as never, actor: ownerActor, action: "reinstate", userId: U })
    check("somebody who was not removed cannot be reinstated", !done.ok && A(done).status === 409)
  }
  {
    const { db } = world({ members: [removedMember()] })
    /* The owner turned the members group off for moderators (lib/communities/permissions.ts PERMISSION_GROUPS). */
    const done = await actOnMember(db, { community: db.tables.communities[0] as never, actor: { userId: MOD, role: "moderator", perms: { moderator: { members: false } } as never }, action: "reinstate", userId: U })
    check("a moderator the owner did not give Remove to cannot undo one", !done.ok && A(done).status === 403 && rowOf(db)?.status === "removed")
  }
  {
    /* Banned by an admin, which a moderator may never reverse. */
    const { db } = world({ members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "banned", tier_id: FREE_TIER, banned_at: "2026-09-01T10:00:00Z", ban_reason: "spam", banned_by: ADMIN, points: 10, level: 1 }] })
    const c0 = db.tables.communities[0] as never
    const refused = await actOnMember(db, { community: c0, actor: modActor, action: "unban", userId: U })
    check("A MODERATOR NEVER UNDOES AN ADMIN", !refused.ok && A(refused).status === 403 && A(refused).error === "outranked")
    check("and the row is untouched", rowOf(db)?.status === "banned")
    const allowed = await actOnMember(db, { community: c0, actor: adminActor, action: "unban", userId: U })
    check("an admin may", allowed.ok && rowOf(db)?.status === "active")
    check("the ban's three columns are cleared with it", !rowOf(db)?.banned_at && !rowOf(db)?.ban_reason && !rowOf(db)?.banned_by)
  }
  {
    const { db } = world({ members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "banned", tier_id: FREE_TIER, banned_at: "2026-09-01T10:00:00Z", banned_by: MOD, muted_until: "2099-01-01T00:00:00Z", points: 0, level: 1 }] })
    const c0 = db.tables.communities[0] as never
    const ok = await actOnMember(db, { community: c0, actor: modActor, action: "unban", userId: U })
    check("a moderator undoes another moderator's ban", ok.ok && rowOf(db)?.status === "active")
    check("A MUTE LEFT RUNNING IS CLEARED TOO, so they really can post", !rowOf(db)?.muted_until)
  }
  {
    const { db } = world({ members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "banned", tier_id: FREE_TIER, banned_at: "2026-09-01T10:00:00Z", banned_by: null, points: 0, level: 1 }] })
    const target = rowOf(db) as unknown as MemberRow
    check("nobody on record as having done it: anyone with the permission may undo", await mayUndo(db, C, modActor, target, "unban"))
  }
  {
    /* Suspended by the owner, with the audit log as the only record of who. */
    const { db } = world({ members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "paused", tier_id: FREE_TIER, banned_at: null, points: 0, level: 1 }] })
    db.tables.community_audit_log.push({ id: 1, community_id: C, actor_id: OWNER, actor_kind: "member", action: "member.paused", target_type: "member", target_id: U, reason: "a week off", created_at: "2026-09-01T10:00:00Z" })
    const c0 = db.tables.communities[0] as never
    const refused = await actOnMember(db, { community: c0, actor: modActor, action: "unsuspend", userId: U })
    check("the audit log is enough to know a moderator may not undo the owner", !refused.ok && A(refused).error === "outranked")
    const ok = await actOnMember(db, { community: c0, actor: ownerActor, action: "unsuspend", userId: U })
    check("the owner brings them back", ok.ok && rowOf(db)?.status === "active")
  }
  {
    const { db } = world({ members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "free", status: "active", tier_id: FREE_TIER, muted_until: "2099-01-01T00:00:00Z", banned_at: null, points: 0, level: 1 }] })
    const ok = await actOnMember(db, { community: db.tables.communities[0] as never, actor: ownerActor, action: "unmute", userId: U })
    check("unmute still works, and tells them", ok.ok && !rowOf(db)?.muted_until && db.tables.community_notifications.some((n) => n.user_id === U))
  }
  {
    /* A paid member who was banned, whose subscription has since ended. */
    const { db } = world({ access: "paid", visibility: "private", paidOnly: true, members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "subscription", status: "banned", tier_id: PAID_TIER, banned_at: "2026-09-01T10:00:00Z", banned_by: OWNER, source_membership_id: "ms1", points: 50, level: 2 }] })
    const ok = await actOnMember(db, { community: db.tables.communities[0] as never, actor: ownerActor, action: "unban", userId: U })
    check("letting them back in never hands them a paid tier nobody pays for", ok.ok && rowOf(db)?.status === "active" && rowOf(db)?.source === "free")
    check("and the audit entry records the fall to free", db.tables.community_audit_log.some((r) => r.action === "member.unbanned" && (r.detail as { toFree?: boolean })?.toFree === true))
  }
  {
    /* The same, with the subscription still live. */
    const { db } = world({ access: "paid", visibility: "private", paidOnly: true, members: [{ id: "m-u", community_id: C, user_id: U, role: "member", source: "subscription", status: "banned", tier_id: PAID_TIER, banned_at: "2026-09-01T10:00:00Z", banned_by: OWNER, source_membership_id: "ms1", points: 50, level: 2 }] })
    db.tables.memberships.push({ id: "ms1", buyer_id: U, product_id: TIER_PRODUCT, status: "active", current_period_end: null, past_due_since: null })
    const ok = await actOnMember(db, { community: db.tables.communities[0] as never, actor: ownerActor, action: "unban", userId: U })
    check("somebody who is still paying keeps the tier they pay for", ok.ok && rowOf(db)?.status === "active" && rowOf(db)?.tier_id === PAID_TIER && rowOf(db)?.source === "subscription")
  }

  /* ── What the screens offer and say ─────────────────────────────────── */
  console.log("\nThe row, and what it offers")
  {
    const actor = { userId: OWNER, role: "owner" as const, can: { remove_member: true, ban: true, suspend: true, mute: true, manage_members: true }, gamification: false, badges: 0 }
    const removed = memberChoices(actor, { userId: U, role: "member", status: "removed", source: "free", mutedUntil: null })
    check("a removed row offers the way back", removed.some((c) => c.action === "reinstate" && c.label === "Let them back in" && c.confirm))
    check("a banned row offers Unban, and asks first", memberChoices(actor, { userId: U, role: "member", status: "banned", source: "free", mutedUntil: null }).some((c) => c.action === "unban" && c.confirm))
    check("a suspended row offers Bring back", memberChoices(actor, { userId: U, role: "member", status: "paused", source: "free", mutedUntil: null }).some((c) => c.action === "unsuspend"))
    check("a muted row offers Unmute", memberChoices(actor, { userId: U, role: "member", status: "active", source: "free", mutedUntil: "2099-01-01T00:00:00Z" }).some((c) => c.action === "unmute"))
    const mod = { ...actor, userId: MOD, role: "moderator" as const }
    const outranked = memberChoices(mod, { userId: U, role: "member", status: "banned", source: "free", mutedUntil: null, acted: { kind: "banned", byUserId: ADMIN, byName: "Bo Admin", byRole: "admin", at: null, reason: null, until: null } })
    check("a moderator is not offered the undo of an admin's ban", !outranked.some((c) => c.action === "unban"))
    const peer = memberChoices(mod, { userId: U, role: "member", status: "banned", source: "free", mutedUntil: null, acted: { kind: "banned", byUserId: "x", byName: "Another", byRole: "moderator", at: null, reason: null, until: null } })
    check("another moderator's is offered", peer.some((c) => c.action === "unban"))
    const noPermission = memberChoices({ ...mod, can: { ban: false, remove_member: false } }, { userId: U, role: "member", status: "banned", source: "free", mutedUntil: null })
    check("and nothing is offered without the permission", noPermission.length === 0)
  }
  {
    const line = takenAwayLine({ status: "banned", acted: { kind: "banned", byUserId: ADMIN, byName: "Bo Admin", byRole: "admin", at: "2026-09-01T10:00:00Z", reason: "spam", until: null } }, Date.parse("2026-09-02T10:00:00Z"))
    check("the row says what happened, who did it, when and why", /^Banned by Bo Admin · 1d · spam$/.test(line), line)
    check("with no record of who, it still says what happened", takenAwayLine({ status: "removed", acted: null }) === "Removed")
    check("a mute says when it ends", /ends /.test(takenAwayLine({ status: "active", mutedUntil: "2026-09-03T10:00:00Z", acted: { kind: "muted", byUserId: null, byName: null, byRole: null, at: null, reason: null, until: "2026-09-03T10:00:00Z" } })))
  }
  {
    const paid = memberConfirmText({ key: "reinstate", label: "", action: "reinstate" }, "Dee", { source: "subscription", paying: false })
    check("the confirm says what they get back", /points, level and posts/.test(paid.detail) && paid.verb === "Let them in")
    check("and warns that a paid tier comes back as free", /come back on the free tier/.test(paid.detail))
    const stillPaying = memberConfirmText({ key: "unban", label: "", action: "unban" }, "Dee", { source: "subscription", paying: true })
    check("somebody who is still paying is not warned", !/free tier/.test(stillPaying.detail))
    check("a free member is not warned either", !/free tier/.test(memberConfirmText({ key: "unban", label: "", action: "unban" }, "Dee", { source: "free" }).detail))
    check("the toast names the person", memberDoneText({ key: "reinstate", label: "", action: "reinstate" }, "Dee") === "Dee is back in")
  }
  {
    const section = read("components/community/creator/members-section.tsx")
    check("the Members views hold one place for everybody who is not active", /restricted: "Not active"/.test(section))
    check("with the undo on the row itself", /data-undo=/.test(section))
    const moderation = read("components/community/creator/moderation-section.tsx")
    check("Moderation's restricted list holds removed members too", /key: "removed".*reinstate/.test(moderation))
  }

  /* ── Copy ───────────────────────────────────────────────────────────── */
  console.log("\nCopy")
  {
    const mine = [
      "lib/communities/access-model.ts",
      "lib/communities/server/invite-spend.ts",
      "lib/communities/server/join.ts",
      "lib/communities/server/invites.ts",
      "lib/communities/server/moderation.ts",
      "lib/communities/server/membership.ts",
      "components/community/creator/logic.ts",
      "components/community/creator/members-section.tsx",
      "components/community/creator/settings-section.tsx",
      "components/community/public/join-state.ts",
      "tests/communities-access-restore.test.ts",
    ]
    /* Written in pieces so this suite is not itself the thing it finds. */
    const words = ["unl" + "ock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge", "trans" + "form"]
    const banned = new RegExp(`\\b(${words.join("|")})\\w*\\b`, "i")
    const dash = String.fromCharCode(0x2014)
    const withDash = mine.filter((f) => read(f).includes(dash))
    const withWord = mine.filter((f) => banned.test(read(f)))
    check("no em dash anywhere in this work", withDash.length === 0, withDash)
    check("none of the words we never use", withWord.length === 0, withWord)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exitCode = 1
  }
}

void main()
