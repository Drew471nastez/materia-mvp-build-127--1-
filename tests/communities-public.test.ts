/**
 * ===========================================================================
 *  COMMUNITIES: THE PUBLIC SIDE, JOINING, PAYING, AND BEING FOUND
 * ===========================================================================
 * Held from their inputs, and against an in memory database where the
 * server code runs:
 *
 *   THE BUTTON     every branch of decideJoin: member, banned, closed,
 *                  pending, invite only, product, free, request, paid, signed
 *                  out, approved.
 *   PRICES         a tier is priced from its product (a plan for recurring,
 *                  price_cents for one time), never sold when it cannot be.
 *   JOINING        free in at once and once; approval makes a request and
 *                  never a member; paid never grants, only answers checkout;
 *                  banned, invite only and drafts refuse; leaving; the owner
 *                  cannot; a subscriber is sent to cancel first; onboarding.
 *   INVITES        the token's sha256 is what is looked up; another
 *                  community's invite counts nothing here; complimentary in,
 *                  otherwise approved and sent to pay.
 *   CHECKOUT GATE  nobody pays without being approved when approval is
 *                  required, nobody pays twice, a signed out buyer signs in.
 *   THE PAGE       the sales page data for a visitor and for staff on a
 *                  draft; reviews only when there are real ones.
 *   FINDING        explore's cursor, filter and search word; quick search
 *                  and Explore only ask while the switch is on.
 *   LISTINGS       a product that sells a tier is hidden everywhere products
 *                  are listed, and the lists still work for every other
 *                  product, before part 81 too (the regression half).
 *   SEO            canonical, preview image, noindex for anything not
 *                  public, JSON-LD that says what the page is.
 *   LIBRARY        the Communities tab only while on, after Memberships;
 *                  the account fact only when there is one to state.
 *   ROUTES         the switch first, a signed in user, a rate limit on every
 *                  write, the member gate where a member is needed.
 *   COPY           no em dash and no banned word anywhere in this work.
 *
 * Run with:  npm run test:push
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import { decideJoin, primaryOption, type JoinFacts } from "@/components/community/public/join-state"
import { checkoutPath, communityPath, signInToJoinPath, welcomePath } from "@/components/community/public/paths"
import { canonicalUrl, communityJsonLd, communityMetadata, type SeoFacts } from "@/components/community/public/seo"
import type { JoinOption, PublicCommunityView } from "@/components/community/public/types"
import { excludingCommunityProducts, missingColumnError, sellsCommunity, withoutCommunityProducts } from "@/lib/communities/listing"
import { afterFilter, cleanQuery, decodeCursor, encodeCursor, exploreSort } from "@/lib/communities/server/explore"
import { checkoutGate, finishOnboarding, inviteTokenHash, joinCommunity, leaveCommunity, redeemInvite, JOIN_BUCKET, JOIN_WINDOWS } from "@/lib/communities/server/join"
import { communityIndexable, libraryCommunities, loadSalesPage, optionsFor } from "@/lib/communities/server/public"
import { COMMUNITIES_TAB, LIBRARY_TABS, libraryTabs, showsLibraryTabs } from "@/components/library/library-tab-list"
import { accountOverview } from "@/lib/account/overview"

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
/* Code without its comments, so a check reads what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
/* An answer read whole, whichever way it went (the suites compile without strict narrowing). */
type Any = { ok: boolean; state?: string; status?: number; error?: string; message?: string; url?: string; already?: boolean }
const A = (a: unknown) => a as Any

async function main() {
  /* ── The button ──────────────────────────────────────────────────────── */
  console.log("\nThe one button")
  const free: JoinOption = { tierId: "t-free", name: "Members", description: null, kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "Free", benefits: [], checkout: null }
  const paid: JoinOption = {
    tierId: "t-paid",
    name: "Pro",
    description: null,
    kind: "paid",
    billing: "recurring",
    productId: "p1",
    monthlyCents: 1900,
    yearlyCents: 19000,
    priceCents: null,
    currency: "usd",
    priceLine: "$19/month",
    benefits: [],
    checkout: { month: checkoutPath("p1", "makers", "month"), year: checkoutPath("p1", "makers", "year"), once: null },
  }
  const facts = (over: { community?: Partial<JoinFacts["community"]>; viewer?: Partial<JoinFacts["viewer"]>; options?: JoinOption[]; accessProducts?: JoinFacts["accessProducts"]; canTakePayments?: boolean } = {}): JoinFacts => ({
    community: { slug: "makers", status: "published", access: "free", approvalRequired: false, suspended: false, archived: false, creatorName: "Ana", ...over.community },
    viewer: { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, source: null, membershipId: null, ...over.viewer },
    options: over.options ?? [free],
    accessProducts: over.accessProducts ?? [],
    canTakePayments: over.canTakePayments ?? true,
  })
  {
    const s = decideJoin(facts({ viewer: { active: true, role: "member", status: "active" } }))
    check("an active member opens the community", s.kind === "open" && s.label === "Open community" && s.href === "/community/makers" && s.canLeave)
    const owner = decideJoin(facts({ viewer: { active: true, role: "owner", isOwner: true, status: "active" } }))
    check("the owner opens it and cannot leave it", owner.kind === "open" && !owner.canLeave)
    const payer = decideJoin(facts({ viewer: { active: true, role: "member", status: "active", source: "subscription", membershipId: "ms1" } }))
    check("a member who pays by subscription manages it where it is billed", payer.manageHref === "/library/memberships/ms1")
    check("banned: a sentence, no button", decideJoin(facts({ viewer: { banned: true, status: "banned" } })).kind === "banned")
    check("removed: the same", decideJoin(facts({ viewer: { status: "removed" } })).kind === "banned")
    check("archived takes nobody new", decideJoin(facts({ community: { archived: true } })).kind === "closed")
    check("suspended takes nobody", decideJoin(facts({ community: { suspended: true } })).kind === "closed")
    check("a draft takes nobody", decideJoin(facts({ community: { status: "draft" } })).kind === "closed")
    const pending = decideJoin(facts({ community: { approvalRequired: true }, viewer: { status: "pending" } }))
    check("a request waiting says so and has nothing to press", pending.kind === "pending" && pending.label === "Request sent")
    const invite = decideJoin(facts({ community: { access: "invite_only" } }))
    check("invite only: no button, and who to ask", invite.kind === "invite_only" && /Ana/.test(invite.note ?? ""))
    const product = decideJoin(facts({ community: { access: "product" }, accessProducts: [{ productId: "c1", title: "The Course", href: "/ana/the-course", priceLine: "$99" }] }))
    check("access by product: to that product", product.kind === "product" && product.href === "/ana/the-course" && product.label === "Get The Course")
    check("access by product with nothing on sale: not open yet", decideJoin(facts({ community: { access: "product" } })).kind === "unavailable")
    const joinFree = decideJoin(facts())
    check("free: Join for free", joinFree.kind === "join_free" && joinFree.label === "Join for free" && joinFree.href === null)
    const signedOut = decideJoin(facts({ viewer: { signedIn: false } }))
    check("signed out: the same words, to sign in first and back with ?join=1", signedOut.kind === "join_free" && signedOut.href === signInToJoinPath("makers") && /join%3D1/.test(signedOut.href ?? ""))
    const request = decideJoin(facts({ community: { approvalRequired: true } }))
    check("approval required: Request to join", request.kind === "request" && request.label === "Request to join")
    const paidRequest = decideJoin(facts({ community: { access: "paid", approvalRequired: true }, options: [paid] }))
    check("approval required on a paid tier: a request, never checkout", paidRequest.kind === "request")
    const approved = decideJoin(facts({ community: { access: "paid", approvalRequired: true }, viewer: { status: "pending", approved: true }, options: [paid] }))
    check("approved: now the paid button, and it says why", approved.kind === "checkout" && approved.label === "Join for $19/month" && /approved/.test(approved.note ?? ""))
    const pay = decideJoin(facts({ community: { access: "paid" }, options: [paid] }))
    check("paid: Join for $19/month", pay.kind === "checkout" && pay.label === "Join for $19/month" && pay.option?.tierId === "t-paid")
    check("paid without a way to take payments: not open yet", decideJoin(facts({ community: { access: "paid" }, options: [{ ...paid, checkout: null }] })).kind === "unavailable")
    check("a free tier comes first when the community has one", primaryOption([paid, free], "free", true)?.tierId === "t-free" && primaryOption([paid, free], "paid", true)?.tierId === "t-paid")
  }

  /* ── Addresses ───────────────────────────────────────────────────────── */
  console.log("\nAddresses")
  {
    const u = new URL(checkoutPath("p1", "makers", "year"), "https://storelib.com")
    check("checkout is the existing checkout for the tier's product, on the interval", u.pathname === "/checkout" && u.searchParams.get("productId") === "p1" && u.searchParams.get("interval") === "year")
    check("and comes back to the community with a welcome", u.searchParams.get("return") === welcomePath("makers") && welcomePath("makers") === "/community/makers?welcome=1")
    check("a one time tier asks for no interval", !new URL(checkoutPath("p1", "makers"), "https://storelib.com").searchParams.has("interval"))
    check("the community's address", communityPath("makers") === "/community/makers")
  }

  /* ── Prices ──────────────────────────────────────────────────────────── */
  console.log("\nPrices come from the products")
  {
    const tiers = [
      { id: "t1", community_id: "c", name: "Monthly", description: null, position: 0, kind: "paid", billing: "recurring", product_id: "pm", benefits: ["Calls"], is_default: false, archived_at: null, created_at: "", updated_at: "" },
      { id: "t2", community_id: "c", name: "Lifetime", description: null, position: 1, kind: "paid", billing: "one_time", product_id: "po", benefits: [], is_default: false, archived_at: null, created_at: "", updated_at: "" },
      { id: "t3", community_id: "c", name: "Draft", description: null, position: 2, kind: "paid", billing: "one_time", product_id: "pd", benefits: [], is_default: false, archived_at: null, created_at: "", updated_at: "" },
      { id: "t4", community_id: "c", name: "Members", description: null, position: 3, kind: "free", billing: null, product_id: null, benefits: [], is_default: true, archived_at: null, created_at: "", updated_at: "" },
    ] as never[]
    const products = new Map<string, never>([
      ["pm", { id: "pm", type: "membership", status: "published", price_cents: 900 } as never],
      ["po", { id: "po", type: "community", status: "published", price_cents: 4900 } as never],
      ["pd", { id: "pd", type: "community", status: "draft", price_cents: 4900 } as never],
    ])
    const plans = new Map<string, never>([["pm", { product_id: "pm", monthly_price_cents: 900, yearly_price_cents: 9000, currency: "usd" } as never]])
    const [m, o, d, f] = optionsFor("makers", tiers, products, plans, true)
    check("recurring: the plan's prices, both intervals to checkout", m.priceLine === "$9/month" && !!m.checkout?.month && !!m.checkout?.year && m.benefits[0] === "Calls")
    check("one time: the product's price, one checkout", o.priceLine === "$49" && !!o.checkout?.once && !o.checkout?.month)
    check("an unpublished product is shown, never sold", d.checkout === null)
    check("free is Free and has nothing to buy", f.priceLine === "Free" && f.checkout === null)
    const [m2] = optionsFor("makers", tiers, products, plans, false)
    check("a recurring tier is not sold while the creator cannot take payments", m2.checkout === null && m2.priceLine === "$9/month")
  }

  /* ── Joining, against a database ─────────────────────────────────────── */
  console.log("\nJoining")
  const C = "c0000000-0000-4000-8000-000000000001"
  const OTHER = "c0000000-0000-4000-8000-000000000002"
  const U = "a0000000-0000-4000-8000-000000000001"
  const OWNER = "a0000000-0000-4000-8000-0000000000aa"
  const FREE_TIER = "b0000000-0000-4000-8000-000000000002"
  const PAID_TIER = "b0000000-0000-4000-8000-000000000001"
  const TIER_PRODUCT = "d0000000-0000-4000-8000-000000000001"
  const CREATOR = "e0000000-0000-4000-8000-000000000001"
  const world = (o: { access?: string; approval?: boolean; status?: string; paidOnly?: boolean; visibility?: string } = {}) =>
    fakeDb(
      {
        communities: [
          {
            id: C,
            slug: "makers",
            name: "Makers",
            tagline: "People who make things",
            description: "<p>We <strong>build</strong>.</p><script>x()</script>",
            creator_id: CREATOR,
            owner_user_id: OWNER,
            access: o.access ?? "free",
            visibility: o.visibility ?? "public",
            status: o.status ?? "published",
            approval_required: o.approval ?? false,
            member_count: 12,
            benefits: ["Weekly calls"],
            rules: [{ title: "Be kind", body: "No spam" }],
            faq: [{ q: "Is it free?", a: "Yes" }],
            deleted_at: null,
            suspended_at: null,
            archived_at: null,
            platform_hidden: false,
          },
        ],
        community_tiers: [
          { id: PAID_TIER, community_id: C, name: "Pro", kind: "paid", billing: "recurring", product_id: TIER_PRODUCT, position: 1, is_default: false, archived_at: null, benefits: [] },
          ...(o.paidOnly ? [] : [{ id: FREE_TIER, community_id: C, name: "Members", kind: "free", billing: null, product_id: null, position: 0, is_default: true, archived_at: null, benefits: [] }]),
        ],
        community_access_products: [{ community_id: C, tier_id: PAID_TIER, product_id: TIER_PRODUCT }],
        community_members: [{ id: "m-owner", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", tier_id: null, banned_at: null }],
        community_invites: [],
        products: [{ id: TIER_PRODUCT, title: "Makers Pro", slug: "makers-pro", type: "membership", status: "published", price_cents: 1900, creator_id: CREATOR, community_id: C, reviews_count: 0, reviews_average: 0 }],
        membership_plans: [{ product_id: TIER_PRODUCT, monthly_price_cents: 1900, yearly_price_cents: 19000, currency: "usd" }],
        creators: [{ id: CREATOR, user_id: OWNER, slug: "ana", display_name: "Ana", avatar_url: null, stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true }],
        profiles: [{ id: OWNER, username: "ana", display_name: "Ana Maker", avatar_url: null }],
        entitlements: [],
        memberships: [],
        reviews: [],
        community_audit_log: [],
        community_activity: [],
        community_courses: [],
        community_spaces: [],
      },
      { unique: { community_members: [["community_id", "user_id"]] } },
    )
  const rowsOf = (db: ReturnType<typeof fakeDb>, userId = U) => db.tables.community_members.filter((m) => m.user_id === userId)
  {
    const db = world()
    const a = await joinCommunity(db, C, U)
    const b = await joinCommunity(db, C, U)
    check("a free join is in at once, to the community", a.ok && a.state === "member" && (a as { url: string }).url === "/community/makers")
    check("on the free tier, as a free member", rowsOf(db)[0]?.status === "active" && rowsOf(db)[0]?.source === "free" && rowsOf(db)[0]?.tier_id === FREE_TIER)
    check("joining twice is one row, the same answer", b.ok && b.state === "member" && rowsOf(db).length === 1)
    const left = await leaveCommunity(db, C, U)
    check("leaving keeps the row, cancelled", left.ok && rowsOf(db)[0]?.status === "cancelled" && rowsOf(db).length === 1)
    const back = await joinCommunity(db, C, U)
    check("and joining again brings that row back", back.ok && back.state === "member" && rowsOf(db)[0]?.status === "active" && rowsOf(db).length === 1)
    const owner = await leaveCommunity(db, C, OWNER)
    check("the owner cannot leave", !A(owner).ok && A(owner).error === "owner")
  }
  {
    const db = world({ approval: true })
    const a = await joinCommunity(db, C, U, { note: "  I knit  " })
    check("approval required: a request, not a member", a.ok && a.state === "pending" && rowsOf(db)[0]?.status === "pending" && rowsOf(db)[0]?.request_note === "I knit")
    const b = await joinCommunity(db, C, U)
    check("asking again is the same request", b.ok && b.state === "pending" && rowsOf(db).length === 1)
    const w = await leaveCommunity(db, C, U)
    check("a request can be withdrawn", w.ok && w.state === "withdrawn")
  }
  {
    const db = world({ access: "paid", paidOnly: true })
    const a = await joinCommunity(db, C, U, { interval: "year" })
    check("paid: never a grant, only where to pay", a.ok && a.state === "checkout" && rowsOf(db).length === 0)
    const url = new URL((a as { url: string }).url, "https://storelib.com")
    check("on the interval asked for, the tier's own product", url.searchParams.get("productId") === TIER_PRODUCT && url.searchParams.get("interval") === "year")
  }
  {
    const db = world({ access: "paid", paidOnly: true, approval: true })
    const a = await joinCommunity(db, C, U)
    check("paid with approval: a request first, nothing to pay yet", a.ok && a.state === "pending" && rowsOf(db)[0]?.status === "pending")
    check("the request says it is for a paid tier (a subscription), not a free way in", rowsOf(db)[0]?.source === "subscription" && rowsOf(db)[0]?.tier_id === PAID_TIER)
    const gate = await checkoutGate({ id: TIER_PRODUCT }, U, db)
    check("CHECKOUT REFUSES before the request is approved", gate.refusal?.code === "needs_approval" && gate.refusal.status === 403)
    rowsOf(db)[0].approved_by = OWNER
    const after = await checkoutGate({ id: TIER_PRODUCT }, U, db)
    check("approved: checkout is allowed", after.refusal === null && after.community?.slug === "makers")
    const b = await joinCommunity(db, C, U)
    check("and the button now goes to checkout", b.ok && b.state === "checkout")
    check("a signed out buyer is sent to sign in", (await checkoutGate({ id: TIER_PRODUCT }, null, db)).refusal?.code === "sign_in")
    db.tables.memberships.push({ id: "ms1", buyer_id: U, product_id: TIER_PRODUCT, status: "active", current_period_end: null, past_due_since: null })
    const twice = await checkoutGate({ id: TIER_PRODUCT }, U, db)
    check("once paid, a second checkout is refused: already a member", twice.refusal?.code === "already_member" && twice.refusal.status === 409)
    const sub = await leaveCommunity(db, C, U)
    check("a subscriber is sent to cancel where it is billed, not left paying", !A(sub).ok && A(sub).error === "manage_billing" && A(sub).url === "/library/memberships/ms1")
  }
  {
    const db = world()
    const plain = await checkoutGate({ id: "f0000000-0000-4000-8000-000000000009" }, U, db)
    check("an ordinary product passes the gate untouched", plain.refusal === null && plain.community === null)
    const carried = await checkoutGate({ id: "x", community_id: null }, U, db)
    check("and a row that already says it sells no tier is not read again", carried.refusal === null && !db.log.some((l) => l.table === "products" && l.filters.some((f) => f[2] === "x")))
  }
  {
    const db = world()
    db.tables.community_members.push({ id: "m-b", community_id: C, user_id: U, role: "member", source: "free", status: "banned", banned_at: new Date().toISOString(), tier_id: null })
    const a = await joinCommunity(db, C, U)
    check("banned: refused, and still banned", !A(a).ok && A(a).error === "banned" && rowsOf(db)[0].status === "banned")
    check("and checkout refuses them too", (await checkoutGate({ id: TIER_PRODUCT }, U, db)).refusal?.code === "banned")
  }
  {
    check("invite only refuses a join", await joinCommunity(world({ access: "invite_only" }), C, U).then((a) => !A(a).ok && A(a).error === "invite_only"))
    check("a draft refuses a join", await joinCommunity(world({ status: "draft" }), C, U).then((a) => !A(a).ok && A(a).status === 404))
    check("an unknown community is a 404", await joinCommunity(world(), OTHER, U).then((a) => !A(a).ok && A(a).status === 404))
  }
  {
    const db = world()
    await joinCommunity(db, C, U)
    const first = await finishOnboarding(db, C, U)
    const at = rowsOf(db)[0].onboarded_at
    const second = await finishOnboarding(db, C, U)
    check("onboarding is marked once", first.ok && !!at && second.ok && rowsOf(db)[0].onboarded_at === at)
  }

  /* ── Invites ─────────────────────────────────────────────────────────── */
  console.log("\nInvites")
  {
    const token = "A".repeat(43)
    check("the lookup is the token's sha256, hex", inviteTokenHash(token) === createHash("sha256").update(token).digest("hex"))
    const db = world()
    let rpcCalls = 0
    const respond = (complimentary: boolean, tier: string | null) => {
      ;(db as { rpc: unknown }).rpc = async (name: string, args: { p_token_hash: string }) => {
        rpcCalls++
        if (name !== "community_redeem_invite" || args.p_token_hash !== inviteTokenHash(token)) return { data: { ok: false, reason: "not_found" }, error: null }
        return { data: { ok: true, community_id: C, tier_id: tier, complimentary, invite_id: "inv1", new: true }, error: null }
      }
    }
    respond(true, null)
    check("a token that is not one is refused without a lookup", await redeemInvite(db, C, U, "short").then((r) => !A(r).ok && A(r).error === "not_found") && rpcCalls === 0)
    db.tables.community_invites.push({ id: "inv2", community_id: OTHER, token_hash: inviteTokenHash(token), tier_id: null, complimentary: true, created_by: OWNER })
    const wrong = await redeemInvite(db, C, U, token)
    check("another community's invite counts nothing here", !A(wrong).ok && A(wrong).error === "not_found" && rpcCalls === 0)
    db.tables.community_invites[0].community_id = C
    const ok = await redeemInvite(db, C, U, token)
    check("a complimentary invite lets them in, as an invite, on the default tier", ok.ok && ok.state === "member" && rowsOf(db)[0]?.source === "invite" && rowsOf(db)[0]?.tier_id === FREE_TIER && rowsOf(db)[0]?.invited_by === OWNER)
    const again = await redeemInvite(db, C, U, token)
    check("a member using it again is answered without counting a use", again.ok && again.state === "member" && (again as { already: boolean }).already && rpcCalls === 1)

    const db2 = world({ access: "paid", paidOnly: true })
    db2.tables.community_invites.push({ id: "inv3", community_id: C, token_hash: inviteTokenHash(token), tier_id: PAID_TIER, complimentary: false, created_by: OWNER })
    ;(db2 as { rpc: unknown }).rpc = async () => ({ data: { ok: true, community_id: C, tier_id: PAID_TIER, complimentary: false, invite_id: "inv3", new: true }, error: null })
    const pay = await redeemInvite(db2, C, U, token)
    check("an invite that is not complimentary to a paid tier: approved, and sent to pay", pay.ok && pay.state === "checkout" && rowsOf(db2)[0]?.status === "pending" && !!rowsOf(db2)[0]?.approved_by)
    check("so checkout now lets them pay", (await checkoutGate({ id: TIER_PRODUCT }, U, db2)).refusal === null)
    const db3 = world()
    db3.tables.community_invites.push({ id: "inv4", community_id: C, token_hash: inviteTokenHash(token), tier_id: null, complimentary: true, created_by: OWNER })
    ;(db3 as { rpc: unknown }).rpc = async () => ({ data: { ok: false, reason: "used_up", community_id: C }, error: null })
    const used = await redeemInvite(db3, C, U, token)
    check("used up is a 410 with a sentence", !A(used).ok && A(used).status === 410 && /used up/.test(A(used).message ?? ""))
    const route = code("app/api/community/[communityId]/invite/redeem/route.ts")
    check("the route answers the invite's own reasons as { ok: false, reason }, the shape the invite landing reads", /if \(INVITE_REASONS\.has\(answer\.error\) && answer\.status !== 404\) return NextResponse\.json\(\{ ok: false, reason: answer\.error, message: answer\.message \}/.test(route) && /ok: true, state: "member"/.test(route))
    const landing = existsSync("components/community/member/invite-landing.tsx") ? read("components/community/member/invite-landing.tsx") : ""
    check("and the member area's invite landing posts the token to this route", !landing || (/\/invite\/redeem`, \{ body: \{ token \} \}/.test(landing) && /r\.data\.reason/.test(landing)))
  }

  /* ── The page ────────────────────────────────────────────────────────── */
  console.log("\nThe sales page")
  {
    const db = world({ access: "free" })
    const page = await loadSalesPage("makers", U, db)
    check("a visitor gets the page with the free button", page?.data.join.kind === "join_free" && page?.viewer.active === false)
    check("the creator, linked to their Storelib page", page?.data.community.creator?.name === "Ana Maker" && page?.data.community.creator?.href === "/ana")
    check("the description is cleaned (no script survives)", !!page?.data.community.descriptionHtml && !/script/i.test(page?.data.community.descriptionHtml ?? ""))
    check("benefits, rules and FAQ come through", page?.data.community.benefits[0] === "Weekly calls" && page?.data.community.rules[0]?.title === "Be kind" && page?.data.community.faq[0]?.q === "Is it free?")
    check("the member count is the row's, nothing added", page?.data.community.memberCount === 12)
    check("no reviews, no reviews block", page?.data.community.reviews === null)
    const owner = await loadSalesPage("makers", OWNER, db)
    check("the owner is a member here (their feed), with Open community on /about", owner?.viewer.active === true && owner?.data.join.kind === "open")
    const draft = world({ status: "draft" })
    check("a draft is a 404 to a visitor", (await loadSalesPage("makers", U, draft)) === null)
    const staff = await loadSalesPage("makers", OWNER, draft)
    check("and visible to its owner, with a line saying so", staff !== null && /draft/i.test(staff?.data.notice ?? ""))
    check("an unknown address is a 404", (await loadSalesPage("nobody", U, db)) === null)
    const reviewed = world({ access: "paid", paidOnly: true })
    reviewed.tables.products[0].reviews_count = 2
    reviewed.tables.products[0].reviews_average = 4.5
    reviewed.tables.reviews.push(
      { id: "r1", product_id: TIER_PRODUCT, rating: 5, content: "Worth it", created_at: "2026-09-01T00:00:00Z", status: "published", reviewer_name: "Sam", buyer: null },
      { id: "r2", product_id: TIER_PRODUCT, rating: 4, content: "Good calls", created_at: "2026-09-02T00:00:00Z", status: "published", reviewer_name: null, buyer: null },
    )
    const withReviews = await loadSalesPage("makers", null, reviewed)
    check("real reviews of the tier's product are shown, newest first, with the product's average", withReviews?.data.community.reviews?.total === 2 && withReviews?.data.community.reviews?.average === 4.5 && withReviews?.data.community.reviews?.items[0]?.id === "r2")
    check("a signed out visitor on a paid community: the paid words, to sign in", withReviews?.data.join.kind === "checkout" && /login/.test(withReviews?.data.join.href ?? ""))
  }

  /* ── The library ─────────────────────────────────────────────────────── */
  console.log("\nThe library")
  {
    const db = world()
    await joinCommunity(db, C, U)
    const list = await libraryCommunities(U, db)
    check("their communities, with the tier and the count", list.available && list.rows.length === 1 && list.rows[0].slug === "makers" && list.rows[0].tierName === "Members" && list.rows[0].memberCount === 12)
    const none = await libraryCommunities(U, fakeDb({}, { failWith: { community_members: { code: "42P01", message: "missing" } } }))
    check("before part 81: not set up, not an error", none.available === false && none.rows.length === 0)
    check("the tabs are the list while communities are off", JSON.stringify(libraryTabs(false)) === JSON.stringify([...LIBRARY_TABS]))
    const on = libraryTabs(true).map((t) => t.href)
    check("on: Communities right after Memberships", on.indexOf(COMMUNITIES_TAB.href) === on.indexOf("/library/memberships") + 1 && on.length === LIBRARY_TABS.length + 1)
    check("the row is drawn on /library/communities", showsLibraryTabs("/library/communities") && showsLibraryTabs("/library/communities/") && !showsLibraryTabs("/library/communities/x"))
    const base = { items: [], courses: [], memberships: null, wishlist: 0, seller: "none" as const }
    check("the account fact is there only for somebody in one", accountOverview({ ...base, communities: 2 }).facts.some((f) => f.key === "communities" && f.value === 2 && f.href === "/library/communities") && !accountOverview({ ...base, communities: 0 }).facts.some((f) => f.key === "communities") && !accountOverview(base).facts.some((f) => f.key === "communities"))
    check("the communities loading screen exists and is a library skeleton", existsSync("app/library/communities/loading.tsx") && /LibraryRouteSkeleton path="\/library\/communities"/.test(read("app/library/communities/loading.tsx")) && /COMMUNITIES_TAB\.href\) return <MembershipsSkeleton/.test(read("components/library/library-skeletons.tsx")))
    check("the layout hands the switch to the pills", /communitiesEnabled\(\)/.test(code("app/library/layout.tsx")) && /<LibraryTabs communities=\{communities\} \/>/.test(read("app/library/layout.tsx")))
  }

  /* ── Finding ─────────────────────────────────────────────────────────── */
  console.log("\nExplore and search")
  {
    const id = "c0000000-0000-4000-8000-000000000003"
    const cur = decodeCursor(encodeCursor({ v: 42, id }), "popular")
    check("a cursor goes round", cur?.v === 42 && cur?.id === id)
    check("a cursor for another order is not trusted", decodeCursor(encodeCursor({ v: 42, id }), "new") === null && decodeCursor("garbage", "trending") === null && decodeCursor(encodeCursor({ v: 1, id: "x" }), "trending") === null)
    check("after a row: lower, or equal with a later id", afterFilter("popular", { v: 42, id }) === `member_count.lt.42,and(member_count.eq.42,id.gt.${id})`)
    check("dates are quoted", afterFilter("new", { v: "2026-01-01T00:00:00.000Z", id }).startsWith('created_at.lt."2026-01-01T00:00:00.000Z"'))
    check("a search word cannot break the filter", cleanQuery('a,b(c)*"%') === "a b c" && cleanQuery(42) === "")
    check("trending is the default order", exploreSort("x") === "trending" && exploreSort("new") === "new")
    const explore = code("lib/communities/server/explore.ts")
    check("only what may be found: published, public, listed, not hidden, open", ['.eq("status", "published")', '.eq("visibility", "public")', '.eq("discovery_enabled", true)', '.eq("platform_hidden", false)', '.is("deleted_at", null)', '.is("suspended_at", null)', '.is("archived_at", null)'].every((s) => explore.includes(s)))
    check("one page more than asked tells whether there is a next one", /\.limit\(limit \+ 1\)/.test(explore))
    const page = code("app/(marketing)/explore/communities/page.tsx")
    check("/explore/communities is a 404 while off", /await connection\(\)\s*if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)/.test(page))
    const api = code("app/api/explore/communities/route.ts")
    check("its API answers communities_off first", /export async function GET[\s\S]*?const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(api))
    const client = code("components/explore/explore-page-client.tsx")
    check("the Communities pill is drawn only while on", /index === 0 && communitiesEnabled && !communities \? \(\s*<Link\s+href="\/explore\/communities"/.test(client))
    check("Explore passes the switch and the matching communities", /communitiesEnabled=\{communitiesOn\}/.test(code("app/(marketing)/explore/page.tsx")) && /communitiesOn && searchQuery \? exploreCommunities/.test(code("app/(marketing)/explore/page.tsx")))
    const qs = code("lib/nav/quick-search.ts")
    check("quick search asks for communities only when told the switch is on", /const communitiesAsked = opts\.communities \? quickCommunities\(term\) : null/.test(qs) && /\/api\/explore\/communities\?q=/.test(qs))
    check("the search screen tells it with the switch", /quickSearch\(createClient\(\), term, \{ communities: communitiesOn \}\)/.test(code("components/search/search-screen.tsx")))
  }

  /* ── Listings ────────────────────────────────────────────────────────── */
  console.log("\nA product that sells a tier is not listed; every other product still is")
  {
    check("a tier's product is one", sellsCommunity({ community_id: C }) && !sellsCommunity({ community_id: null }) && !sellsCommunity({}) && !sellsCommunity(null))
    const rows = [{ id: "a" }, { id: "b", community_id: null }, { id: "c", community_id: C }]
    check("the list keeps every ordinary product, in order", JSON.stringify(withoutCommunityProducts(rows).map((r) => r.id)) === '["a","b"]')
    check("the missing column is recognised", missingColumnError({ code: "42703" }) && missingColumnError({ code: "PGRST204" }) && !missingColumnError({ code: "42P01" }) && !missingColumnError(null))
    const asked: boolean[] = []
    const before = await excludingCommunityProducts(async (exclude) => (asked.push(exclude), exclude ? { data: null, error: { code: "42703" } } : { data: [{ id: "a" }], error: null }))
    check("before part 81 the list is asked again without the filter, and has every product", JSON.stringify(asked) === "[true,false]" && (before as { data: unknown[] }).data.length === 1)
    asked.length = 0
    await excludingCommunityProducts(async (exclude) => (asked.push(exclude), { data: [], error: null }))
    check("after it, once, with the filter", JSON.stringify(asked) === "[true]")
    const lists: [string, RegExp][] = [
      ["app/(marketing)/explore/page.tsx", /excludingCommunityProducts\(\(exclude\) => \{[\s\S]*?\.eq\("status", "published"\)\s*if \(exclude\) query = query\.is\("community_id", null\)/],
      ["app/(marketing)/explore/[category]/page.tsx", /excludingCommunityProducts\(\(exclude\) => \{[\s\S]*?\.eq\("status", "published"\)\s*if \(exclude\) q = q\.is\("community_id", null\)/],
      ["lib/nav/quick-search.ts", /const ordinary = \(q: any, exclude: boolean\) => \(exclude \? q\.is\("community_id", null\) : q\)/],
      ["app/creator-page/sections/page.tsx", /if \(exclude\) q = q\.is\("community_id", null\)/],
      ["lib/onepage/live-products.ts", /live\(row\) && !sellsCommunity\(row\)/],
      ["lib/website-builder/shop-products.ts", /rows = withoutCommunityProducts\(\(data \?\? \[\]\) as ProductRow\[\]\)/],
      ["app/(marketing)/u/[username]/page.tsx", /const products = catalogue \? withoutCommunityProducts\(catalogue\) : catalogue/],
      ["lib/seo/sitemaps.ts", /if \(skipCommunity\) q = q\.is\("community_id", null\)/],
    ]
    for (const [file, re] of lists) check(`${file} leaves tier products out`, re.test(code(file)))
    check("the OnePage and shop reads still fall back to their older column lists", /\[COLUMNS_WITH_COMMUNITY, COLUMNS, COLUMNS_WITHOUT_FLAG\]/.test(code("lib/onepage/live-products.ts")) && /\[PRODUCT_COLUMNS_WITH_COMMUNITY, PRODUCT_COLUMNS, PRODUCT_COLUMNS_MINIMAL\]/.test(code("lib/website-builder/shop-products.ts")))
    const product = code("app/(marketing)/p/[slug]/page.tsx")
    check("a tier's product page sends to its community, and only that kind of product", /const communityId = \(product as \{ community_id\?: string \| null \}\)\.community_id\s*if \(communityId\) \{[\s\S]*?if \(target\) redirect\(target\)\s*notFound\(\)\s*\}/.test(product))
    const store = code("app/(marketing)/u/[username]/page.tsx")
    check("the storefront's Communities tab is real cards, and only when there are some", (store.match(/if \(communityCards\.length > 0\) \{\s*tabs\.push\(\{\s*id: "communities",\s*label: "Communities",\s*panel: <StorefrontCommunities cards=\{communityCards\} \/>/g) ?? []).length === 2)
    check("and only while communities are on", /communitiesEnabled\(\)\s*\.then\(\(on\) => \(on \? creatorCommunityCards\(creator\.id\) : \[\]\)\)/.test(store))
    /* Found end to end (QA): the bare grid ran edge to edge at 1440px, wider than the tabs above it. */
    {
      const panel = code("components/community/public/storefront-communities.tsx")
      const products = code("components/storefront/all-products-grid.tsx")
      const column = (panel.match(/const COLUMN = "([^"]+)"/) || [])[1]
      check("the Communities panel sits in the page column the Products tab uses", !!column && products.includes(`className="${column}"`) && /<div className=\{COLUMN\}>\s*<ul data-storefront-communities/.test(panel))
    }
    check("the builder canvas draws the same tab the same way", /if \(communities\.length > 0\) \{[\s\S]*?<StorefrontCommunities cards=\{communities\} phone=\{isMobile\} \/>/.test(code("components/store-builder/preview-canvas.tsx")))
    check("the storefront's Products tab and Home grid still read the product list", /productsData\.length > 0/.test(store) && /<AllProductsGrid/.test(store))
  }

  /* ── Checkout ────────────────────────────────────────────────────────── */
  console.log("\nCheckout")
  {
    for (const f of ["app/api/checkout/stripe-session/route.ts", "app/api/checkout/process/route.ts", "app/api/checkout/quick-free/route.ts"]) {
      const src = code(f)
      check(`${f} asks the gate only for a product that sells a tier, and stops on a refusal`, /if \(\(product as \{ community_id\?: string \| null \}\)\.community_id\) \{\s*const \{ checkoutGate \} = await import\("@\/lib\/communities\/server\/join"\)\s*const gate = await checkoutGate\([\s\S]*?if \(gate\.refusal\) return NextResponse\.json/.test(src))
    }
    const mem = code("app/api/memberships/checkout/route.ts")
    check("the membership checkout asks the gate before any Stripe call", /const gate = await checkoutGate\(\{ id: product\.id \}, user\?\.id \?\? null, admin\)\s*if \(gate\.refusal\)/.test(mem) && mem.indexOf("checkoutGate(") < mem.indexOf("ensurePrice("))
    check("and still answers 409 already_member for a running membership", /code: "already_member" \}, \{ status: 409 \}/.test(mem))
    const page = code("app/checkout/page.tsx")
    check("the checkout page sends anybody the gate refuses where they belong", /const gate = await checkoutGate\([\s\S]*?if \(gate\.refusal\) redirect\(gate\.refusal\.url\)/.test(page))
    check("after paying, back to the community, worked out from the product (not the link)", /communityReturn = \{ success: welcomePath\(gate\.community\.slug\), cancel: communityPath\(gate\.community\.slug\) \}/.test(page) && /returnTo=\{communityReturn\?\.success \?\? returns\.success\}/.test(page) && /returnTo: communityReturn\?\.success \?\? null/.test(page))
    check("an ordinary product's checkout is untouched (gate only for community products)", /if \(\(product as \{ community_id\?: string \| null \}\)\.community_id\) \{/.test(page) && /returns\.success/.test(page))
    const mc = code("app/checkout/membership-checkout.tsx")
    check("the membership checkout lands a paid member in the community", /if \(isLoggedIn && returnTo\) \{\s*window\.setTimeout\(\(\) => router\.replace\(returnTo\), 900\)/.test(mc) && /\/library\/memberships\/\$\{membershipId\}\?welcome=1/.test(mc))
  }

  /* ── SEO ─────────────────────────────────────────────────────────────── */
  console.log("\nSearch engines and previews")
  {
    const f: SeoFacts = { slug: "makers", name: "Makers", tagline: "People who make", description: "<p>About</p>", seoTitle: null, seoDescription: null, coverUrl: "https://x.supabase.co/cover.jpg", logoUrl: null, indexable: true, creatorName: null }
    const m = communityMetadata(f)
    check("canonical is the community's one address", (m.alternates as { canonical: string }).canonical === "https://storelib.com/community/makers" && canonicalUrl("makers") === "https://storelib.com/community/makers")
    check("the preview picture is the cover", JSON.stringify(m.openGraph).includes("cover.jpg") && (m.twitter as { card: string }).card === "summary_large_image")
    check("public and published: indexed", (m.robots as { index: boolean }).index === true)
    check("anything else: noindex", (communityMetadata({ ...f, indexable: false }).robots as { index: boolean }).index === false)
    check("/about names the same canonical", (communityMetadata(f, { about: true }).alternates as { canonical: string }).canonical === "https://storelib.com/community/makers")
    const row = { status: "published", visibility: "public", suspended_at: null, deleted_at: null, platform_hidden: false } as const
    check("indexable means published, public, open, not hidden", communityIndexable(row) && !communityIndexable({ ...row, visibility: "unlisted" }) && !communityIndexable({ ...row, visibility: "private" }) && !communityIndexable({ ...row, status: "draft" }) && !communityIndexable({ ...row, platform_hidden: true }))
    const view = {
      slug: "makers",
      name: "Makers",
      tagline: "People who make",
      descriptionText: null,
      descriptionHtml: null,
      coverUrl: null,
      logoUrl: "https://x/logo.png",
      creator: { name: "Ana", username: "ana", avatarUrl: null, href: "/ana" },
      options: [] as JoinOption[],
      reviews: null,
    } as unknown as PublicCommunityView
    const org = communityJsonLd(view, true)
    check("a free community is an Organization led by its creator", org?.["@type"] === "Organization" && (org?.founder as { name: string }).name === "Ana")
    const paidView = { ...view, options: [{ kind: "paid", billing: "recurring", monthlyCents: 1900, yearlyCents: null, priceCents: null, currency: "usd", priceLine: "$19/month", name: "Pro" }] as JoinOption[], reviews: { average: 4.5, total: 2, items: [] } } as PublicCommunityView
    const prod = communityJsonLd(paidView, true)
    check("a paid one is a Product with its real price and rating", prod?.["@type"] === "Product" && (prod?.offers as { price: string }).price === "19.00" && (prod?.aggregateRating as { reviewCount: number }).reviewCount === 2)
    check("no rating claimed without reviews", !("aggregateRating" in (communityJsonLd({ ...paidView, reviews: null } as PublicCommunityView, true) ?? {})))
    check("nothing claimed for a page that is not indexed", communityJsonLd(view, false) === null)
    check("every page inside a community is noindex", /robots: \{ index: false, follow: false \}/.test(read("app/(marketing)/community/[slug]/layout.tsx")))
    const sm = code("lib/seo/sitemaps.ts")
    check("the sitemap lists public published communities while on", /const communities = \(await communitiesEnabled\(\)\) \? await sitemapCommunityCount\(admin\) : 0/.test(sm) && /communities-\$\{i\}\.xml/.test(sm) && /\(products\|creators\|websites\|onepages\|communities\)/.test(sm))
    const pub = code("lib/communities/server/public.ts")
    check("and only those", /export async function sitemapCommunities[\s\S]*?\.eq\("status", "published"\)\s*\.eq\("visibility", "public"\)\s*\.eq\("platform_hidden", false\)/.test(pub))
  }

  /* ── Pages and routes ────────────────────────────────────────────────── */
  console.log("\nPages and routes")
  {
    const page = code("app/(marketing)/community/[slug]/page.tsx")
    check("/community/<slug> is a 404 while off, read per request", /await connection\(\)\s*if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)/.test(page))
    check("a member gets the member area's feed (CommunityFeedPage, by its fixed path)", /if \(load\.viewer\.active\) return <CommunityFeedPage slug=\{load\.community\.slug\} \/>/.test(page) && /import \{ CommunityFeedPage \} from "@\/components\/community\/member\/feed-page"/.test(page))
    check("everybody else the sales page, with its structured data", /<CommunitySalesPage data=\{load\.data\} \/>/.test(page) && /jsonLdScript\(jsonLd\)/.test(page))
    const about = code("app/(marketing)/community/[slug]/about/page.tsx")
    check("/about is the sales page for everybody, members included", /await connection\(\)\s*if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)/.test(about) && /<CommunitySalesPage data=\{load\.data\} \/>/.test(about) && !/viewer\.active/.test(about))
    check("/library/communities is a 404 while off", /if \(!\(await communitiesEnabled\(\)\)\) notFound\(\)/.test(code("app/library/communities/page.tsx")))
    const routes = ["join", "leave", "onboarding", "invite/redeem"].map((r) => `app/api/community/[communityId]/${r}/route.ts`)
    for (const r of routes) {
      const src = code(r)
      check(`${r}: the switch first`, /export async function POST\([^)]*\)[^{]*\{\s*const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(src))
      check(`${r}: a signed in person, never a user id from the body`, /auth\.getUser\(\)/.test(src) && !/body\.(userId|user_id|role|price)/.test(src))
      check(`${r}: rate limited`, /const limited = await joinRateLimit\(/.test(src) && /if \(limited\) return limited/.test(src))
      check(`${r}: no store`, /Cache-Control": "no-store"/.test(src))
    }
    check("onboarding is for an active member (requireMember)", /const gate = await requireMember\(db, communityId, user\?\.id \?\? null, "view"\)\s*if \(gate instanceof NextResponse\) return gate/.test(code("app/api/community/[communityId]/onboarding/route.ts")))
    check("the join bucket is community-join, with a ten minute and a daily window", JOIN_BUCKET === "community-join" && JOIN_WINDOWS.length === 2)
    const server = ["lib/communities/server/public.ts", "lib/communities/server/join.ts", "lib/communities/server/explore.ts"].map(code).join("\n")
    check("no role string comparisons in the new server code (meetsRole and can decide)", !/role (===|!==) "(owner|admin|moderator|member)"/.test(server))
    check("the public page never reads communities with select(*)", !/from\("communities"\)\.select\("\*"\)/.test(server))
  }

  /* ── Client boundary and copy ────────────────────────────────────────── */
  console.log("\nCopy rules, and no server code in the browser")
  {
    const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)])) : [])
    const mine = [
      ...walk("components/community/public"),
      "lib/communities/server/public.ts",
      "lib/communities/server/join.ts",
      "lib/communities/server/explore.ts",
      "lib/communities/listing.ts",
      ...walk("app/(marketing)/community/[slug]").filter((f) => !f.includes("(member)")),
      "app/(marketing)/explore/communities/page.tsx",
      "app/api/explore/communities/route.ts",
      ...walk("app/api/community/[communityId]/join"),
      ...walk("app/api/community/[communityId]/leave"),
      ...walk("app/api/community/[communityId]/onboarding"),
      ...walk("app/api/community/[communityId]/invite"),
      ...walk("app/library/communities"),
    ]
    const offenders = mine.filter((f) => /—/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
    check("no em dash and no banned word", offenders.length === 0, offenders)
    const clients = walk("components/community/public").filter((f) => /^"use client"/.test(read(f)))
    check("the client parts import nothing from the server", clients.length >= 2 && clients.every((f) => !/server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)/.test(code(f))))
    const drawnAnywhere = ["sales-page.tsx", "community-card.tsx", "library-list.tsx", "storefront-communities.tsx", "types.ts", "paths.ts", "join-state.ts", "seo.ts"].map((f) => `components/community/public/${f}`)
    check("the pieces the browser also draws import no server code", drawnAnywhere.every((f) => !/server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)/.test(code(f))))
    check("every new server module says server-only", ["public", "join", "explore"].every((n) => /^import "server-only"/m.test(read(`lib/communities/server/${n}.ts`))))
    check("no fake online count on the public side", !mine.some((f) => /online/i.test(code(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
