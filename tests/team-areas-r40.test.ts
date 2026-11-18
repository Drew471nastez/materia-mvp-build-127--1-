/**
 * Round 40, second pass: the areas a team member could be given but not
 * use ("Not open to the team yet"), opened where it could be done properly.
 *
 *   OnePage     open. The editor's server routes ask lib/team/onepage, which
 *               gives the owner their own client and id exactly as before and
 *               a member with OnePage the service role filtered by the store
 *               owner's account. The page reads the owner's OnePage for them.
 *   Community   open. A member with Community is an admin of each of the
 *               store's communities (the owner's own Roles apply), acting as
 *               the store, with every audit line naming them.
 *   Uploads     a picture a member uploads for those editors goes in the
 *               store's folder; product files stay the owner's.
 *   Still closed, and why (pinned below so opening one is a decision):
 *               website, creator page, products, store settings.
 *   The SQL     part 319: team_store_ids / team_can, and one select policy
 *               on products for the OnePage product picker. Run twice against
 *               a scratch Postgres 16 with Supabase's roles, before and after
 *               part 320 (see the report); the text is pinned here.
 *
 *   npx tsx --conditions=react-server tests/team-areas-r40.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextResponse } from "next/server"
import { fakeDb } from "./_fake-db"
import { OPEN_TO_TEAM, TEAM_PERMISSIONS, homeFor, memberSees, normalizePermissions, permits, presetPermissions, type TeamPermission } from "@/lib/team/permissions"
import { NO_ACCESS, type ActingStore } from "@/lib/team/server"
import { onePageActorFor } from "@/lib/team/onepage"
import { UPLOAD_AREAS, uploadStoreOf } from "@/lib/team/uploads"
import { TEAM_AUDIT_KEY, TEAM_COMMUNITY_ROLE, stampAudit, teamAuditDb, teamCommunityIdentity } from "@/lib/communities/server/team"
import { teamCommunityGate } from "@/lib/communities/server/context"
import { teamStaffContext } from "@/lib/communities/server/team-page"
import { can } from "@/lib/communities/permissions"
import type { CommunityRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const same = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join()

const OWNER = "11111111-1111-4111-8111-111111111111"
const ANA = "22222222-2222-4222-8222-222222222222"
const STORE = "44444444-4444-4444-8444-444444444444"
const OTHER_STORE = "66666666-6666-4666-8666-666666666666"
const COMMUNITY = "99999999-9999-4999-8999-999999999999"
const OTHER_COMMUNITY = "88888888-8888-4888-8888-888888888888"

const acting = (permissions: TeamPermission[], ownerUserId: string | null = OWNER): ActingStore => ({ creatorId: STORE, name: "Shop", ownerUserId, role: "staff", permissions, memberId: "55555555-5555-4555-8555-555555555555" })

async function main() {
  console.log("\nWhat is open")
  {
    check("OnePage and Community are open to the team now", OPEN_TO_TEAM.has("onepage") && OPEN_TO_TEAM.has("community"))
    /* Changed on purpose (round 41 team): Products and Store settings opened (tests/team-areas-r41.test.ts); the website and the creator page stay closed. */
    /* Changed on purpose (round 42 team): the website, the creator page, payouts and billing are open (tests/team-areas-r42.test.ts). */
    const opened: TeamPermission[] = ["website", "creator_pages", "products", "settings"]
    check("the website, the creator page, products and store settings are open", opened.every((p) => OPEN_TO_TEAM.has(p)))
    check("  and payouts and billing", !OPEN_TO_TEAM.has("payouts_billing" as never))
    /* Changed on purpose (round 42 team): the website, the creator page, payouts and billing are open (tests/team-areas-r42.test.ts). */
    check("an invite can now give OnePage and Community, and they are kept", same(normalizePermissions(["onepage", "community", "website"]), ["website", "onepage", "community"]))
    /* Changed on purpose (round 41 team): Products is open, so Content editor gives it too. */
    /* Changed on purpose (round 42 team): the website, the creator page, payouts and billing are open (tests/team-areas-r42.test.ts). */
    check("Content editor gives what of it is open: OnePage and Community", same(presetPermissions("content"), ["website", "onepage", "creator_pages", "products", "community"]))
    check("Full access includes them, never money or the team", presetPermissions("full").includes("onepage") && presetPermissions("full").includes("community") && !presetPermissions("full").includes("payouts_billing" as never) && !presetPermissions("full").includes("team"))
    check("the sidebar shows OnePage and Community to a member who has them", memberSees(["onepage"], "/app/onepage") && memberSees(["community"], "/app/community") && memberSees(["community"], "/app/community/my-club/feed") && !memberSees(["onepage"], "/app/community"))
    check("a member with only Community lands on it", homeFor(["community"]) === "/app/community" && homeFor(["onepage"]) === "/app/onepage")
    const picker = read("components/app/settings/team-permissions.tsx")
    check("the picker's \"Not open to the team yet\" follows the same set, so it is gone for these two", /!open\.includes\(p\) \? tt\("Not open to the team yet"\)/.test(picker))
    /* Changed on purpose (round 42 team): the website, the creator page, payouts and billing are open (tests/team-areas-r42.test.ts). */
    check("every permission is still a key the SQL constraint knows", TEAM_PERMISSIONS.every((k) => read("supabase/sql/run-now/333_team_money_areas.sql").includes(`'${k}'`)))
  }

  console.log("\nOnePage: whose page a route edits (lib/team/onepage)")
  {
    const session = { id: "session" }
    const admin = { id: "admin" }
    const own = onePageActorFor(OWNER, session, null, () => admin)
    check("the owner: their own client and their own id, as before", !("refuse" in own) && own.db === session && own.pageOwnerId === OWNER && own.isOwner === true && own.acting === null, own)
    const member = onePageActorFor(ANA, session, acting(["onepage"]), () => admin)
    check("a member with OnePage: the service role, scoped to the store owner's account", !("refuse" in member) && member.db === admin && member.pageOwnerId === OWNER && member.userId === ANA && member.isOwner === false, member)
    const without = onePageActorFor(ANA, session, acting(["orders"]), () => admin)
    check("a member without it: 403, never their own page in its place", "refuse" in without && without.refuse === 403 && without.error === NO_ACCESS)
    const orphan = onePageActorFor(ANA, session, acting(["onepage"], null), () => admin)
    check("a store with no owner account: 404", "refuse" in orphan && orphan.refuse === 404)

    const routes = ["app/api/onepage/route.ts", "app/api/onepage/publish/route.ts", "app/api/onepage/address/route.ts", "app/api/onepage/free-products/route.ts", "app/api/onepage/leads/route.ts", "app/api/onepage/stats/route.ts", "app/api/onepage/upload-file/route.ts", "app/api/onepage/signed-upload-url/route.ts"]
    for (const r of routes) {
      const src = read(r)
      check(`${r} asks onePageActor after reading the session`, /const actor = await onePageActor\(supabase, user\.id\)/.test(src) && /if \(actor instanceof NextResponse\) return actor/.test(src))
    }
    const main = read("app/api/onepage/route.ts")
    const publish = read("app/api/onepage/publish/route.ts")
    check("the save and the publish never look the page up by the signed in id any more", !/\.eq\("owner_id", user\.id\)/.test(main) && !/\.eq\("owner_id", user\.id\)/.test(publish))
    check("  every write is filtered by the page owner", /db\.from\("onepages"\)\.update\(row\)\.eq\("id", id\)\.eq\("owner_id", ownerId\)/.test(main) && (publish.match(/\.eq\("owner_id", ownerId\)/g) ?? []).length >= 3)
    check("  Pro settings are checked against the owner's plan, and the photo is the owner's", /paidPlan\(ownerId\)/.test(main) && /db\.from\("profiles"\)\.select\("avatar_url"\)\.eq\("id", ownerId\)/.test(main) && /db\.from\("profiles"\)\.select\("avatar_url"\)\.eq\("id", ownerId\)/.test(publish))
    check("signups (people's emails) need Customers as well as OnePage", /permits\(actor\.acting\.permissions, "customers"\)/.test(read("app/api/onepage/leads/route.ts")))

    const page = read("app/(storelib)/app/onepage/page.tsx")
    check("the editor page asks teamPageStore(\"onepage\") and draws the access card when refused", page.includes('teamPageStore("onepage")') && /<TeamAreaClosed area="onepage" store=\{access\.acting\.name\} permissions=\{access\.acting\.permissions\} \/>/.test(page))
    check("  a member gets the owner's page, read by the owner's account with the service role", /if \(access\.kind === "store" && !access\.isOwner && access\.acting\)/.test(page) && /admin\.from\("onepages"\)\.select\("\*"\)\.eq\("owner_id", ownerUserId\)/.test(page) && /\.eq\("id", creatorId\)\.eq\("user_id", ownerUserId\)/.test(page))
    check("  and the editor is told whose store (team prop)", /<OnePageEditor initialOnePage=\{\{ \.\.\.onepage, draft_blocks: openLocked\(onepage\.draft_blocks\), archived_blocks: openLocked\(onepage\.archived_blocks\), avatar_url: profileAvatar\(ownerRow\?\.avatar_url\), edit_version: onePageEditVersion\(onepage\) \} as OnePage\} team=\{team\} \/>/.test(page)) // Changed on purpose (round AU): the editor gets the page's edit version for the conflict check; (OnePage production audit, SEC2) its paid blocks' locked parts opened (lib/onepage/locked-seal)
    check("the owner's own path is the one it was: their session client, their id", /supabase\.from\("onepages"\)\.select\("\*"\)\.eq\("owner_id", user\.id\)/.test(page) && /return <OnePageEditor initialOnePage=\{\{ \.\.\.onepage, draft_blocks: openLocked\(onepage\.draft_blocks\), archived_blocks: openLocked\(onepage\.archived_blocks\), avatar_url: profileAvatar\(profileRead\.data\?\.avatar_url\), edit_version: onePageEditVersion\(onepage\) \} as OnePage\} \/>/.test(page)) // Changed on purpose (round AU; OnePage production audit, SEC2)

    const editor = read("components/onepage/onepage-editor.tsx")
    /* Changed on purpose (OnePage production audit, ED-1): the owner's plan counts as read. */
    check("the editor takes the owner's plan and domain from the page, not the member's account", /if \(team\) \{\s*setConnectedDomain\(team\.domain\)\s*setUserPlan\(team\.plan\)\s*setPlanConfirmed\(true\)\s*return/.test(editor))
    check("  and never opens the first visit's wizard for a member (it writes the signed in account)", /if \(team\) \{\s*setShowOnboarding\(false\)\s*setOnboardingChecked\(true\)/.test(editor))
    check("the product pickers list the store's products for a member", /teamStoreForProducts\(\)/.test(read("components/onepage/tabs/product-block-editor.tsx")) && /teamStoreForProducts\(\)/.test((read("components/onepage/creator-blocks.tsx") + "\n" + read("components/onepage/creator-blocks-editor.tsx"))))
    const links = read("components/onepage/tabs/links-tab.tsx")
    const design = read("components/onepage/tabs/design-tab.tsx")
    check("the profile photo is the owner's account photo: a member is told, and never saves it", (links.match(/photoIsOwners\(team\.store\)/g) ?? []).length >= 2 && (design.match(/photoIsOwners\(team\.store\)/g) ?? []).length >= 2 && /if \(team\) throw new SaveError\(photoIsOwners\(team\.store\)\)/.test(design)) // Changed on purpose (round 42 settings): a SaveError (lib/onepage/photo-save), whose words the crop sheet shows
  }

  console.log("\nUploads go in the store's folder")
  {
    check("the owner: their own folder", uploadStoreOf(null).kind === "own")
    /* Changed on purpose (round 41 team): Products and Store settings upload pictures into the store's folder too. */
    check("a member with OnePage or Community: the store's", uploadStoreOf(acting(["onepage"])).kind === "store" && uploadStoreOf(acting(["community"])).kind === "store" && same(UPLOAD_AREAS, ["onepage", "community", "products", "settings"]))
    check("a member without either: refused, never their own folder in its place", uploadStoreOf(acting(["orders"])).kind === "refused")
    const prepare = read("app/api/v2/upload/prepare/route.ts")
    const complete = read("app/api/v2/upload/complete/route.ts")
    check("prepare and complete ask uploadStore", /await uploadStore\(admin, user\.id\)/.test(prepare) && /await uploadStore\(admin, user\.id\)/.test(complete))
    /* Changed on purpose (round 41 team): a product's file is uploaded by the owner or a member with Products (lib/team/uploads mayUploadProductFile). */
    check("  and product files stay the owner's", /if \(isDigital && !mayUploadProductFile\(store\)\)/.test(prepare) && /assetId && !mayUploadProductFile\(store\)/.test(complete))
    const uploads = read("lib/team/uploads.ts")
    check("  the owner's lookup is the one it was", /q\.eq\("user_id", userId\)\.single\(\)/.test(uploads))
  }

  console.log("\nCommunity: an admin of the store's communities, acting as the store")
  {
    const community = (over: Partial<CommunityRow> = {}) => ({ id: COMMUNITY, slug: "club", name: "Club", creator_id: STORE, owner_user_id: OWNER, status: "published", deleted_at: null, suspended_at: null, archived_at: null, role_permissions: null, ...over }) as unknown as CommunityRow
    check("a community of the store is the store owner's identity", teamCommunityIdentity(community(), { creatorId: STORE, ownerUserId: OWNER }) === OWNER)
    check("  one without an owner account falls back to the store's owner", teamCommunityIdentity(community({ owner_user_id: null }), { creatorId: STORE, ownerUserId: OWNER }) === OWNER)
    check("another creator's community is nobody's here", teamCommunityIdentity(community({ creator_id: OTHER_STORE }), { creatorId: STORE, ownerUserId: OWNER }) === null)
    check("the role is admin: never delete, hand over or price", TEAM_COMMUNITY_ROLE === "admin" && !can("admin", "delete") && !can("admin", "transfer_ownership") && !can("admin", "manage_pricing") && can("admin", "post") && can("admin", "manage_settings"))

    const stamped = stampAudit({ action: "post.created", detail: { a: 1 } }, ANA) as { detail: Record<string, unknown> }
    check("an audit line names the team member who acted", stamped.detail[TEAM_AUDIT_KEY] === ANA && stamped.detail.a === 1)
    const db = fakeDb({ community_audit_log: [], community_feed_posts: [] })
    const wrapped = teamAuditDb(db, ANA)
    await wrapped.from("community_audit_log").insert({ action: "x", actor_id: OWNER, detail: {} })
    await wrapped.from("community_feed_posts").insert({ author_id: OWNER, detail: { keep: true } })
    const log = (db as unknown as { log: { table: string; op: string; payload?: Record<string, unknown> }[] }).log
    const auditRow = log.find((l) => l.table === "community_audit_log")?.payload as { detail?: Record<string, unknown>; actor_id?: string } | undefined
    const postRow = log.find((l) => l.table === "community_feed_posts")?.payload as { detail?: Record<string, unknown> } | undefined
    check("  through the wrapped client, on the audit log only", auditRow?.detail?.[TEAM_AUDIT_KEY] === ANA && auditRow?.actor_id === OWNER && !postRow?.detail?.[TEAM_AUDIT_KEY], { auditRow, postRow })

    const ctx = { userId: ANA, userEmail: "ana@example.com", creatorId: STORE, user: null, admin: null, isOwner: false, ownerUserId: OWNER }
    const world = (perms: unknown = null) => fakeDb({ communities: [{ ...community(), role_permissions: perms }], community_audit_log: [] })
    const posting = await teamCommunityGate(ctx, world(), community(), "post")
    check("the route gate: a member posts as the store, as an admin", !(posting instanceof NextResponse) && posting.role === "admin" && posting.ctx.userId === OWNER && posting.viewer.isOwner === false && posting.viewer.userId === OWNER, posting instanceof NextResponse ? posting.status : posting.role)
    const deleting = await teamCommunityGate(ctx, world(), community(), "delete")
    check("  never deletes the community", deleting instanceof NextResponse && deleting.status === 403)
    const pricing = await teamCommunityGate(ctx, world(), community(), "manage_pricing")
    check("  never changes its prices", pricing instanceof NextResponse && pricing.status === 403)
    const narrowed = await teamCommunityGate(ctx, world({ admin: { analytics: false } }), community({ role_permissions: { admin: { analytics: false } } } as never), "view_analytics")
    check("  and the owner's own Roles apply: admins without analytics, the member too", narrowed instanceof NextResponse && narrowed.status === 403)
    const elsewhere = await teamCommunityGate(ctx, world(), community({ id: OTHER_COMMUNITY, creator_id: OTHER_STORE }), "view")
    check("  another creator's community: 404", elsewhere instanceof NextResponse && elsewhere.status === 404)

    const pageDb = fakeDb({ communities: [community() as unknown as Record<string, unknown>], community_audit_log: [] })
    const pageCtx = await teamStaffContext(pageDb, { slug: "club" }, ANA, { creatorId: STORE, ownerUserId: OWNER }, { id: STORE, display_name: "Shop" })
    check("the page gate: the store's community, as an admin, the store as \"me\"", !!pageCtx && pageCtx.role === "admin" && pageCtx.userId === OWNER && pageCtx.creatorId === STORE && pageCtx.viewer.isOwner === false, pageCtx && { role: pageCtx.role, userId: pageCtx.userId })
    const otherDb = fakeDb({ communities: [{ ...(community() as unknown as Record<string, unknown>), creator_id: OTHER_STORE }] })
    check("  another creator's community: nothing", (await teamStaffContext(otherDb, { slug: "club" }, ANA, { creatorId: STORE, ownerUserId: OWNER }, { id: STORE })) === null)

    const context = read("lib/communities/server/context.ts")
    check("requireCreatorCommunity sends a member through the team gate before anything of the owner's", /if \(ctx\.isOwner === false\) return teamCommunityGate\(ctx, db, community, action\)/.test(context) && context.indexOf("teamCommunityGate(ctx, db, community, action)") < context.indexOf("const viewer = await viewerContext(db, community, ctx.userId)"))
    check("  the owner's path is the one it was", /const ownsIt = community\.creator_id === ctx\.creatorId \|\| community\.owner_user_id === ctx\.userId/.test(context) && /viewer: ownsIt \? \{ \.\.\.viewer, role: "owner", active: true \} : viewer, role \}/.test(context))
    check("requireCreator tells the community gate who is the owner", /isOwner: gate\.isOwner, ownerUserId: gate\.ownerUserId/.test(read("lib/email-campaigns/route-auth.ts")))
    const creator = read("lib/communities/server/creator.ts")
    check("the page gate asks the team first, and the owner's path is unchanged", /* Changed on purpose (rel2-auth): a failed read throws to the page boundary, never their own account. */ /const team = await teamStoreForRequest\(user\.id\)\n/.test(creator) && /if \(team\) return permits\(team\.acting\.permissions, "community"\) \? teamStaffContext\(/.test(creator) && /return staffContext\(admin\(\), key, user\.id, creatorForRequest\(user\.id\)\)/.test(creator))
    const list = read("app/api/app/community/route.ts")
    check("a member lists the store's communities, and cannot make a new one", /loadCreatorCommunities\(ctx\.admin, ctx\.creatorId, ctx\.userId, \{ team: ctx\.isOwner === false \}\)/.test(list) && /if \(ctx\.isOwner === false\) return NextResponse\.json\(\{ error: "Only the store's owner can make a new community\." \}, \{ status: 403/.test(list))
    check("the list page and the new page ask teamPageStore(\"community\")", read("app/(storelib)/app/community/page.tsx").includes('teamPageStore("community")') && read("app/(storelib)/app/community/new/page.tsx").includes('teamPageStore("community")') && /redirect\("\/app\/community"\)/.test(read("app/(storelib)/app/community/new/page.tsx")))
    check("  the list hides New community for them", /canCreate=\{false\}/.test(read("app/(storelib)/app/community/page.tsx")) && /rows\.length > 0 && canCreate \?/.test(read("components/community/creator/community-list.tsx")))
    check("permits is what decides, as everywhere", permits(["community"], "community") && !permits(["onepage"], "community"))
  }

  console.log("\nThe SQL (part 319)")
  {
    const sql = read("supabase/sql/run-now/319_team_store_areas.sql")
    check("the run-now part and the migration are the same text", sql === read("supabase/migrations/20271028_team_store_areas.sql"))
    check("skips itself, said, before part 135", /IF to_regclass\('public\.store_team_members'\) IS NULL THEN RAISE NOTICE 'part 319/.test(sql))
    check("reads permissions through to_jsonb, so it runs before part 320 too", /coalesce\(to_jsonb\(m\) -> 'permissions', '\[\]'::jsonb\) \? p_area/.test(sql) && !/m\.permissions/.test(sql))
    check("only for the signed in account, only active members", /m\.user_id = \(select auth\.uid\(\)\) and m\.status = 'active'/.test(sql) && /\(select auth\.uid\(\)\) is not null/.test(sql))
    check("security definer with a fixed search path", (sql.match(/security definer set search_path = public/g) ?? []).length === 2)
    check("never anon: execute revoked from PUBLIC and anon", /REVOKE ALL ON FUNCTION public\.team_store_ids\(text\) FROM PUBLIC, anon/.test(sql) && /REVOKE ALL ON FUNCTION public\.team_can\(uuid, text\) FROM PUBLIC, anon/.test(sql))
    check("one policy, select only, for signed in people, on the store's products for OnePage", /CREATE POLICY "storelib team reads store products" ON public\.products FOR SELECT TO authenticated USING \(creator_id IN \(SELECT public\.team_store_ids\('onepage'\)\)\)/.test(sql) && (sql.match(/CREATE POLICY/g) ?? []).length === 1 && !/FOR (INSERT|UPDATE|DELETE|ALL)/.test(sql))
    check("  added once", /IF NOT EXISTS \(SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'storelib team reads store products'\)/.test(sql))
    check("the check after knows it", /as p319_team_store_areas/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("the README lists it", /\| `319_team_store_areas\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
