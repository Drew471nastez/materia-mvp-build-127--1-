/**
 * ===========================================================================
 *  ROUND 51: A DELETED COMMUNITY SHOWS NOWHERE
 * ===========================================================================
 * The owner: "A community can be archived, but I want to be able to delete a
 * community completely, so it no longer shows anywhere, not only archived."
 *
 * Held against the in-memory database:
 *
 *   BELL      deleted with nobody paying, or when a scheduled deletion
 *             completes: its community_notifications rows go, and the
 *             user_notifications that open it (its address, below it, with
 *             a query, an old address); another community's, one whose slug
 *             only starts the same, and the rest stay
 *   ENGINES   every address it had, its About page, and its public posts
 *             only (an open space or none, never a members only one), and
 *             none of a private community's posts
 *   SEARCH    /app search leaves a deleted community out, and a community's
 *             plans (the Products page never lists them)
 *   ROUTE     a deletion sends its own addresses once; a scheduled one is
 *             announced by the route as before
 *   DIALOG    names what goes before the name is typed
 *   ARCHIVE   archiving and unarchiving work as before
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { fakeDb } from "./_fake-db"
import { deleteCommunity, setArchived } from "@/lib/communities/server/creator"
import { deletionPlan, runDueDeletions, ticketedEventsAhead, type DeletionDeps } from "@/lib/communities/server/community-deletion"
import { addressesOf, linkFilter } from "@/lib/communities/server/community-gone"
import { goneAddresses } from "@/lib/communities/server/community-gone-announce"
import { communityLink, listInbox } from "@/lib/notifications/user-inbox"
import type { CommunityRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(untt(raw(p), p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

const C = "c0000000-0000-4000-8000-000000000051"
const OTHER = "c0000000-0000-4000-8000-000000000052"
const OWNER = "a0000000-0000-4000-8000-0000000000aa"
const BO = "a0000000-0000-4000-8000-000000000001"
const CREATOR = "e0000000-0000-4000-8000-000000000001"
const DAY = 86_400_000
const NOW = Date.UTC(2027, 1, 10, 12, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

function community(over: Record<string, unknown> = {}): Record<string, Any> {
  return {
    id: C,
    slug: "makers",
    name: "Makers",
    creator_id: CREATOR,
    owner_user_id: OWNER,
    access: "free",
    visibility: "public",
    status: "published",
    platform_hidden: false,
    member_count: 2,
    archived_at: null,
    deleted_at: null,
    suspended_at: null,
    ...over,
  }
}

function bell(): Record<string, Any[]> {
  return {
    community_notifications: [
      { id: "n1", community_id: C, user_id: BO, kind: "comment", url: "/community/makers/post/a-1", read_at: null },
      { id: "n2", community_id: C, user_id: OWNER, kind: "join", url: "/community/makers/members", read_at: null },
      { id: "n3", community_id: OTHER, user_id: BO, kind: "comment", url: "/community/makers-club/post/b-2", read_at: null },
    ],
    user_notifications: [
      { id: "u1", user_id: BO, kind: "followed_new_community", source: "following", url: "/community/makers" },
      { id: "u2", user_id: BO, kind: "direct_message", source: "communities", url: "/community/makers/messages/x" },
      { id: "u3", user_id: BO, kind: "direct_message", source: "communities", url: "/community/makers?dm=1" },
      { id: "u4", user_id: BO, kind: "followed_new_community", source: "following", url: "/community/old-makers" },
      { id: "u5", user_id: BO, kind: "followed_new_community", source: "following", url: "/community/makers-club" },
      { id: "u6", user_id: BO, kind: "order", source: "purchases", url: "/account/library" },
    ],
    community_slug_history: [{ slug: "old-makers", community_id: C }],
  }
}

const row = (db: Any) => db.tables.communities[0] as CommunityRow & Record<string, Any>
const ids = (rows: Any[]) => rows.map((r) => r.id).sort()

function deps(db: Any, at: { now: number }): DeletionDeps {
  return {
    update: async (id, params) => {
      const m = db.tables.memberships.find((x: Any) => x.stripe_subscription_id === id)
      if (m) Object.assign(m, params.cancel_at_period_end ? { cancel_at_period_end: true, status: "canceled" } : { cancel_at_period_end: false, status: "active" })
    },
    sync: async (id) => ({ ...db.tables.memberships.find((x: Any) => x.stripe_subscription_id === id) }),
    endNow: async () => undefined,
    createRefund: async () => ({ id: "re_1", status: "succeeded", currency: "usd", metadata: {} }),
    findRefund: async () => null,
    afterRefund: async () => undefined,
    sendMail: async () => ({ success: true }),
    baseUrl: () => "https://storelib.com",
    now: () => at.now,
  }
}

async function main() {
  console.log("\nthe bell, nobody pays")
  {
    const db = <Any>fakeDb({ communities: [community()], community_members: [], community_audit_log: [], community_tiers: [], community_deletions: [], community_deletion_members: [], ...bell() })
    check("its addresses are its own and its old ones", JSON.stringify((await addressesOf(db, { id: C, slug: "makers" })).sort()) === JSON.stringify(["makers", "old-makers"]))
    const done = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "Makers" })
    check("deleted at once", done.ok && done.deleted === true && !!row(db).deleted_at && row(db).status === "archived", done)
    check("its rows are gone from every bell, another community's stay", JSON.stringify(ids(db.tables.community_notifications)) === JSON.stringify(["n3"]), ids(db.tables.community_notifications))
    check("the links into it go (its address, below it, a query, an old address); a lookalike slug and the rest stay", JSON.stringify(ids(db.tables.user_notifications)) === JSON.stringify(["u5", "u6"]), ids(db.tables.user_notifications))
  }

  console.log("\nthe bell, a scheduled deletion when its date comes")
  {
    const PRODUCT = "d0000000-0000-4000-8000-000000000051"
    const at = { now: NOW }
    const db = <Any>fakeDb(
      {
        communities: [community({ access: "paid" })],
        community_tiers: [{ id: "t1", community_id: C, name: "Members", kind: "paid", billing: "recurring", product_id: PRODUCT, archived_at: null }],
        products: [{ id: PRODUCT, type: "membership", title: "Makers", creator_id: CREATOR, community_id: C, status: "published" }],
        memberships: [{ id: "m1", product_id: PRODUCT, creator_id: CREATOR, buyer_id: BO, buyer_email: "bo@example.com", buyer_name: "Bo", stripe_subscription_id: "sub_bo", status: "active", current_period_end: iso(NOW + 5 * DAY), cancel_at_period_end: false, past_due_since: null, amount_cents: 3000, currency: "usd" }],
        membership_invoices: [],
        orders: [],
        community_members: [],
        community_audit_log: [],
        community_deletions: [],
        community_deletion_members: [],
        ...bell(),
      },
      { unique: { community_deletions: [["community_id"]] } },
    )
    const d = deps(db, at)
    const scheduled = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "Makers", mode: "period_end" }, d)
    check("scheduled, archived, members can still read it", scheduled.ok && scheduled.deleted === false && row(db).status === "archived" && !row(db).deleted_at, scheduled)
    check("while it waits, the bell is untouched", db.tables.community_notifications.length === 3 && db.tables.user_notifications.length === 6)
    at.now = NOW + 6 * DAY
    db.tables.memberships[0].status = "expired"
    const run = await runDueDeletions(db, 10_000, d)
    check("when the date comes it is deleted", run.completed === 1 && !!row(db).deleted_at, run)
    check("and only then its rows leave every bell", JSON.stringify(ids(db.tables.community_notifications)) === JSON.stringify(["n3"]) && JSON.stringify(ids(db.tables.user_notifications)) === JSON.stringify(["u5", "u6"]))
  }

  console.log("\npaid tickets hold it back")
  {
    const E1 = "e1000000-0000-4000-8000-000000000001"
    const E2 = "e1000000-0000-4000-8000-000000000002"
    const E3 = "e1000000-0000-4000-8000-000000000003"
    const E4 = "e1000000-0000-4000-8000-000000000004"
    const later = iso(Date.now() + 10 * DAY)
    const db = <Any>fakeDb({
      communities: [community()],
      community_members: [],
      community_audit_log: [],
      community_tiers: [],
      community_deletions: [],
      community_deletion_members: [],
      community_events: [
        { id: E1, community_id: C, title: "Wheel day", starts_at: later, ends_at: null, status: "scheduled" },
        { id: E2, community_id: C, title: "Called off", starts_at: later, ends_at: null, status: "cancelled" },
        { id: E3, community_id: C, title: "Last week", starts_at: iso(Date.now() - 7 * DAY), ends_at: iso(Date.now() - 7 * DAY + 3_600_000), status: "scheduled" },
        { id: E4, community_id: C, title: "Invites only", starts_at: later, ends_at: null, status: "scheduled" },
      ],
      community_event_tickets: [
        { id: "t1", event_id: E1, status: "paid", source: "purchase", amount_cents: 2500 },
        { id: "t2", event_id: E1, status: "paid", source: "purchase", amount_cents: 2500 },
        { id: "t3", event_id: E1, status: "refunded", source: "purchase", amount_cents: 2500 },
        { id: "t4", event_id: E2, status: "paid", source: "purchase", amount_cents: 2500 },
        { id: "t5", event_id: E3, status: "paid", source: "purchase", amount_cents: 2500 },
        { id: "t6", event_id: E4, status: "paid", source: "invite", amount_cents: 0 },
      ],
    })
    const ahead = await ticketedEventsAhead(db, C)
    check("only an event still to come, not cancelled, with tickets people paid for", JSON.stringify(ahead) === JSON.stringify([{ id: E1, title: "Wheel day", sold: 2 }]), ahead)
    const plan = await deletionPlan(db, { id: C })
    check("the dialog's plan names it", plan.ticketedEvents?.length === 1 && plan.ticketedEvents[0].title === "Wheel day")
    const refused = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "Makers" })
    check("deleting is refused and nothing changes", !refused.ok && refused.status === 409 && /Wheel day/.test(refused.error) && !row(db).deleted_at && row(db).status === "published", refused)
    db.tables.community_events[0].status = "cancelled"
    const done = await deleteCommunity(db, { community: row(db), actorId: OWNER, confirm: "Makers" })
    check("once that event is cancelled, it deletes", done.ok && !!row(db).deleted_at, done)
    const dialog = raw("components/community/creator/delete-community.tsx")
    check("the dialog says so before the name is typed and waits", /data-delete-tickets/.test(dialog) && /ticketed\.length > 0\} onClick=\{\(\) => void remove\(\)\}/.test(dialog))
  }

  console.log("\nthe engines")
  {
    const tables = {
      community_spaces: [
        { id: "s-open", community_id: C, view_access: {}, archived_at: null },
        { id: "s-paid", community_id: C, view_access: { tierIds: ["t1"] }, archived_at: null },
      ],
      community_feed_posts: [
        { id: "11111111-0000-4000-8000-000000000001", community_id: C, space_id: "s-open", title: "Hello", body_text: "", status: "published", deleted_at: null, created_at: iso(NOW) },
        { id: "11111111-0000-4000-8000-000000000002", community_id: C, space_id: null, title: "Rules", body_text: "", status: "published", deleted_at: null, created_at: iso(NOW) },
        { id: "11111111-0000-4000-8000-000000000003", community_id: C, space_id: "s-paid", title: "Secret", body_text: "", status: "published", deleted_at: null, created_at: iso(NOW) },
        { id: "11111111-0000-4000-8000-000000000004", community_id: C, space_id: null, title: "Gone", body_text: "", status: "published", deleted_at: iso(NOW), created_at: iso(NOW) },
      ],
    }
    const db = <Any>fakeDb(tables)
    const all = await goneAddresses(db, { id: C, slugs: ["makers", "old-makers"], wasPublic: true })
    check("every address it had and its About page", ["https://storelib.com/community/makers", "https://storelib.com/community/old-makers", "https://storelib.com/community/makers/about", "https://storelib.com/community/old-makers/about"].every((u) => all.includes(u)), all)
    const posts = all.filter((u) => u.includes("/post/"))
    check("its public posts, in an open space or none, at their address", posts.length === 2 && posts.every((u) => u.startsWith("https://storelib.com/community/makers/post/")) && !posts.some((u) => /secret|gone/i.test(u)), posts)
    const priv = await goneAddresses(db, { id: C, slugs: ["makers"], wasPublic: false })
    check("a private community's posts are never handed out", priv.length === 2 && !priv.some((u) => u.includes("/post/")), priv)
    check("the filter is quoted for PostgREST", linkFilter(["makers"]) === 'url.eq."/community/makers",url.like."/community/makers/%",url.like."/community/makers?%"')
  }

  console.log("\nsearch, the route, the copies")
  {
    const search = code("lib/search/app-search.ts")
    check("/app search leaves a deleted community out", /\.eq\("owner_user_id", ownerUserId\)\s*\.is\("deleted_at", null\)/.test(search))
    check("and a community's plans, as the Products page does", /!p\.community_id && p\.title\.toLowerCase\(\)\.includes\(needle\)/.test(search) && /"id, title, status, price_cents, type, community_id"/.test(search))
    const route = code("app/api/app/community/[id]/delete/route.ts")
    check("the route announces a scheduled deletion; a deletion announces itself", /if \(!done\.deleted\) after\(\(\) => announceAddresses\(communityAddresses\(slug\)\)\)/.test(route))
    const gone = code("lib/communities/server/community-gone.ts")
    check("both ways of deleting clear the bell and tell the engines", /await communityGone\(db, c, c\.status\)/.test(code("lib/communities/server/creator.ts")) && /await communityGone\(db, community, deletion\.prior_status\)/.test(code("lib/communities/server/community-deletion.ts")))
    check("engines and copies after the answer, loaded only then", /after\(run\)/.test(gone) && /import\("\.\/community-gone-announce"\)/.test(gone) && !/from "@\/lib\/seo/.test(gone) && !/from "@\/lib\/edge/.test(gone))
    const announce = code("lib/communities/server/community-gone-announce.ts")
    check("its stored copies are asked again, so a 404 deletes them", /capturePages\(`community-\$\{slug\}`/.test(announce) && /storeConfig\(\)/.test(announce))
  }

  console.log("\nthe bell after a slug change")
  {
    check("a row written under the old address opens the community at its new one", communityLink("/community/old-makers/post/a-1?c=2", "makers") === "/community/makers/post/a-1?c=2" && communityLink("/community/old-makers", "makers") === "/community/makers")
    check("a row under its current address is unchanged", communityLink("/community/makers/events", "makers") === "/community/makers/events")
    check("never outside its community: another path has no link", communityLink("/somewhere-else", "makers") === null && communityLink(null, "makers") === null && communityLink("/community", "makers") === null)
    const db = <Any>fakeDb({
      community_notifications: [{ id: "11111111-0000-4000-8000-0000000000b1", user_id: BO, community_id: C, kind: "comment", actor_id: null, title: "x", body: null, url: "/community/old-makers/post/a-1", read_at: null, created_at: iso(NOW) }],
      user_notifications: [],
      communities: [community()],
      profiles: [],
    })
    const page = await listInbox(db, { userId: BO, filter: "all", communitiesOn: true })
    check("the bell gives the renamed community's row its link (it had none)", page.items[0]?.url === "/community/makers/post/a-1", page.items[0])
    const gone = <Any>fakeDb({ community_notifications: [{ id: "11111111-0000-4000-8000-0000000000b2", user_id: BO, community_id: C, kind: "comment", actor_id: null, title: "x", body: null, url: "/community/makers", read_at: null, created_at: iso(NOW) }], user_notifications: [], communities: [community({ deleted_at: iso(NOW) })], profiles: [] })
    const left = await listInbox(gone, { userId: BO, filter: "all", communitiesOn: true })
    check("a row left from a community deleted before round 51 has no link to a 404", left.items[0]?.url === null && left.items[0]?.community === null)
  }

  console.log("\nthe dialog")
  {
    const dialog = raw("components/community/creator/delete-community.tsx")
    check("names what goes before the name is typed", dialog.indexOf("data-delete-what") > 0 && dialog.indexOf("data-delete-what") < dialog.indexOf("Type {name} to delete it.") && /Its page, posts, spaces, events, library, courses, chat and notifications go for everyone\./.test(dialog) && /Orders and payments are kept\./.test(dialog))
    check("no em dash in it", !/—/.test(dialog))
  }

  console.log("\narchiving, as before")
  {
    const db = <Any>fakeDb({ communities: [community()], community_tiers: [], community_audit_log: [], community_deletions: [], ...bell() })
    const a = await setArchived(db, { community: row(db), actorId: OWNER, archived: true })
    check("archived: status archived, nothing deleted, the bell untouched", a.ok && row(db).status === "archived" && !!row(db).archived_at && !row(db).deleted_at && db.tables.community_notifications.length === 3)
    const b = await setArchived(db, { community: row(db), actorId: OWNER, archived: false })
    check("unarchived: back as a draft", b.ok && row(db).status === "draft" && row(db).archived_at === null)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
