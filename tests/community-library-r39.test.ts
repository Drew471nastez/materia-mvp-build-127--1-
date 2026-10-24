/**
 * ===========================================================================
 *  COMMUNITIES: THE LIBRARY (round 39)
 * ===========================================================================
 * The owner: "a library thing that admins can enable in their community to
 * sell resources, digital products, extra stuff". Held from the rules and
 * against an in memory database:
 *
 *   RULES       libraryGate for the five choices (free, a tier, a level,
 *               bought, picked members), staff, drafts, owning the product;
 *               the editor's input checks; a link's address checked
 *   SHELF       off is a 404; the admin's order; a draft and a private item
 *               off the list are not there; an archived product's item is
 *               not there; locks carry what opens them
 *   FILES       a file or a link is handed only to somebody who opens the
 *               item, by a route that asks again; a link's address is never
 *               in the page of somebody who may not open it; a resource's
 *               file is signed from the uploader's own folder in the
 *               community; a product's goes through the file checks
 *   ADMIN       only the creator's own digital products are attached (not
 *               another creator's, not a community's plan, not a course);
 *               new files must be in the admin's own folder; a cover only
 *               from Storelib's storage; a sold product must be published and
 *               without options; a sold resource gets a product made for the
 *               community with its files, a draft again when it stops being
 *               sold or is taken out; the order is exactly the items
 *   PURCHASE    the session is Stripe Embedded Checkout with the product
 *               checkout's own metadata on the PaymentIntent (so the order,
 *               receipt, payout and the buyer's library come from the same
 *               fulfilment) and none of it on the session; the server's
 *               price; refused when it is already theirs, not sold, or the
 *               seller cannot take payments; the grant makes the order once
 *               and records the purchase once; the item opens from the
 *               entitlement the order made
 *   REFUNDS     a full refund marks the purchase, and the entitlement it
 *               takes away locks the item again
 *   ROUTES      every route checks the switch, who is asking and how often;
 *               the admin's routes ask manage_classroom, the switch
 *               manage_settings; the webhook routes the Library's sessions
 *   PLACES      /library and /library/<id> are places, the tab sits after
 *               Learn and only while the Library is on
 *   SQL         part 278 follows the run-now rules
 *   COPY        no em dash and no banned word
 *
 * Run with:  npx tsx --conditions=react-server tests/community-library-r39.test.ts
 */
import { existsSync, readFileSync } from "node:fs"

import { memDb, type MemDb } from "./_classroom-db"
import { stripComments } from "./_source"
import { checkLibraryInput, cleanLinkUrl, libraryGate, onShelf, type LibraryRule, type LibraryViewer } from "@/lib/communities/library"
import { aboutLibrary, createItem, deleteItem, itemAccess, libraryAdmin, libraryItemPage, libraryShelf, reorderItems, setLibraryEnabled, signItemFile, updateItem } from "@/lib/communities/server/library"
import { grantLibraryFromSession, isLibrarySession, recordFromIntent, revokeRefundedLibrary, startLibraryCheckout, type LibraryCheckoutDeps } from "@/lib/communities/server/library-checkout"
import { isCheckoutMetadata } from "@/lib/checkout/fulfil-payment"
import { placeFromUrl, placeHref, placeKey, placeFromKey, placeTab } from "@/lib/communities/client/places"
import { navEntries } from "@/components/community/member/nav"
import { contentsLine, lockWords } from "@/components/community/library/model"
import { communityFilePath } from "@/lib/communities/post-media"
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow, MemberRow, Role } from "@/lib/communities/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(untt(raw(p), p))

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const id = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`
const A = id(1)
const CREATOR = id(10)
const OWNER = id(11)
const OTHER_CREATOR = id(12)
const ALICE = id(20) /* member, level 1, free tier */
const ERIN = id(24) /* member, level 3, Gold */
const DANA = id(23) /* moderator */
const BUYER = id(25)
const GOLD = id(40)
const FREE_ITEM = id(50)
const GOLD_ITEM = id(51)
const LEVEL_ITEM = id(52)
const PAID_PRODUCT_ITEM = id(53)
const PRIVATE_ITEM = id(54)
const DRAFT_ITEM = id(55)
const PAID_RESOURCE_ITEM = id(56)
const ARCHIVED_ITEM = id(57)
const PRODUCT = id(60)
const PRODUCT_ARCHIVED = id(61)
const PRODUCT_OTHER = id(62)
const PRODUCT_TIER = id(63)
const PRODUCT_COURSE = id(64)
const PRODUCT_OPTIONS = id(65)
const MADE = id(66)
const FILE_A = id(70)
const FILE_B = id(71)
const ASSET = id(80)
const SECTION = id(90)
const NOW = Date.parse("2026-10-22T12:00:00Z")
const iso = (t: number) => new Date(t).toISOString()

function community(over: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: A, creator_id: CREATOR, owner_user_id: OWNER, slug: "makers", name: "Makers", tagline: null, description: null, logo_url: null, cover_url: null, cover_video_id: null,
    visibility: "public", access: "free", status: "published", category: null, language: "en", member_count: 5, post_count: 0, discovery_enabled: true, approval_required: false,
    default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: true, gamification_enabled: true, rules: [], faq: [], benefits: [], links: [],
    onboarding: {}, seo_title: null, seo_description: null, trending_score: 0, trending_at: null, platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null,
    deleted_at: null, created_at: iso(NOW - 90 * 86_400_000), updated_at: iso(NOW), ...over,
  } as CommunityRow
}

function member(userId: string, over: Partial<MemberRow> = {}): MemberRow {
  return {
    id: `m${userId.slice(-8)}`, community_id: A, user_id: userId, status: "active", role: "member", tier_id: null, source: "free", source_membership_id: null, source_product_id: null,
    source_order_id: null, invite_id: null, invited_by: null, request_note: null, requested_at: null, approved_by: null, joined_at: iso(NOW - 864e6), last_active_at: null, expires_at: null,
    points: 0, level: 1, muted_until: null, ban_reason: null, banned_at: null, banned_by: null, removed_at: null, notify_level: "important", email_announcements: true, email_events: true,
    onboarded_at: null, bio: null, created_at: iso(NOW - 864e6), updated_at: iso(NOW), ...over,
  } as MemberRow
}

function viewer(m: MemberRow | null, over: Partial<Viewer> = {}): Viewer {
  const active = m?.status === "active"
  return { userId: m?.user_id ?? null, member: m, role: active ? (m?.role as Role) : null, active, status: m?.status ?? null, tierId: m?.tier_id ?? null, ownedProductIds: [], level: m?.level ?? 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...over } as Viewer
}

const item = (iid: string, over: Record<string, unknown> = {}) => ({
  id: iid, community_id: A, section_id: null, kind: "resource", product_id: null, made_product: false, title: "Item", summary: null, description: null, cover_url: null, files: [], links: [],
  access_mode: "free", tier_ids: [], min_level: null, price_cents: null, currency: null, member_ids: [], status: "published", position: 0, view_count: 0, download_count: 0,
  created_at: iso(NOW), updated_at: iso(NOW), published_at: iso(NOW), ...over,
})
const product = (pid: string, over: Record<string, unknown> = {}) => ({
  id: pid, creator_id: CREATOR, title: "Pricing kit", slug: "pricing-kit", type: "digital", status: "published", archived: false, price_cents: 2900, pay_what_you_want: false, pwyw_min_price_cents: null,
  thumbnail_url: "https://placeholder.supabase.co/storage/v1/object/public/product-images/kit.png", community_id: null, description: "<p>Templates for pricing.</p>", ...over,
})
const fileOf = (fid: string, name: string, uploader = OWNER) => ({ fileId: fid, name, size: 2048, uploaderId: uploader })
const LINK_URL = "https://example.com/secret-folder"

function world(extra: Record<string, any[]> = {}, opts: { enabled?: boolean } = {}) {
  const db = memDb(
    {
      communities: [community()],
      community_members: [member(ALICE), member(ERIN, { level: 3, tier_id: GOLD }), member(DANA, { role: "moderator" }), member(OWNER, { role: "owner" }), member(BUYER)],
      community_tiers: [{ id: GOLD, community_id: A, name: "Gold", archived_at: null, position: 1 }],
      community_levels: [{ community_id: A, level: 3, name: "Regular" }],
      community_library_settings: [{ community_id: A, enabled: opts.enabled !== false }],
      community_library_sections: [{ id: SECTION, community_id: A, name: "Templates", position: 0 }],
      community_library_items: [
        item(FREE_ITEM, { title: "Welcome pack", position: 0, files: [fileOf(FILE_A, "welcome.pdf")], links: [{ url: LINK_URL, label: "Shared folder" }], section_id: SECTION }),
        item(GOLD_ITEM, { title: "Gold templates", position: 1, access_mode: "tier", tier_ids: [GOLD], files: [fileOf(FILE_B, "gold.zip")] }),
        item(LEVEL_ITEM, { title: "Level three notes", position: 2, access_mode: "level", min_level: 3, links: [{ url: LINK_URL, label: "Notes" }] }),
        item(PAID_PRODUCT_ITEM, { title: "Pricing kit", position: 3, kind: "product", product_id: PRODUCT, access_mode: "paid" }),
        item(PRIVATE_ITEM, { title: "For Erin", position: 4, access_mode: "private", member_ids: [ERIN], files: [fileOf(FILE_A, "erin.pdf")] }),
        item(DRAFT_ITEM, { title: "Not yet", position: 5, status: "draft", files: [fileOf(FILE_A, "draft.pdf")] }),
        item(ARCHIVED_ITEM, { title: "Old kit", position: 6, kind: "product", product_id: PRODUCT_ARCHIVED }),
      ],
      products: [
        product(PRODUCT),
        product(PRODUCT_ARCHIVED, { title: "Old kit", slug: "old-kit", status: "archived", archived: true }),
        product(PRODUCT_OTHER, { creator_id: OTHER_CREATOR, slug: "theirs" }),
        product(PRODUCT_TIER, { type: "community", community_id: A, slug: "gold-plan" }),
        product(PRODUCT_COURSE, { type: "course", slug: "a-course" }),
        product(PRODUCT_OPTIONS, { title: "With sizes", slug: "with-sizes" }),
      ],
      product_variants: [{ id: id(99), product_id: PRODUCT_OPTIONS, name: "Large", price_cents: 4000 }],
      digital_assets: [{ id: ASSET, product_id: PRODUCT, file_name: "kit.xlsx", file_path: `${CREATOR}/kit.xlsx`, file_size: 4096, storage_bucket: STORAGE_BUCKET, scan_status: "clean", uploaded_by: OWNER, created_at: iso(NOW) }],
      entitlements: [],
      creators: [{ id: CREATOR, user_id: OWNER, display_name: "Maker", stripe_account_id: "acct_123creator" }],
      store_settings: [{ creator_id: CREATOR, currency: "USD", default_country: "US" }],
      profiles: [{ id: ERIN, display_name: "Erin Park", username: "erin", avatar_url: null }],
      community_library_purchases: [],
      community_audit_log: [],
      ...extra,
    },
    {
      unique: { community_library_purchases: [["payment_intent_id"]], community_library_settings: [["community_id"]] },
      rpc: {
        community_library_touch: (args, d) => {
          const row = (d.tables.community_library_items ?? []).find((r: any) => r.id === args.p_item)
          if (row) row[args.p_kind === "view" ? "view_count" : "download_count"] = (row[args.p_kind === "view" ? "view_count" : "download_count"] ?? 0) + 1
          return { data: null, error: null }
        },
      },
    },
  )
  return db
}

const alice = () => viewer(member(ALICE))
const erin = () => viewer(member(ERIN, { level: 3, tier_id: GOLD }))
const dana = () => viewer(member(DANA, { role: "moderator" }))
const buyer = () => viewer(member(BUYER))
const stranger = () => viewer(null)

function fakeStripe(session?: any) {
  const calls: any[] = []
  const stripe = {
    checkout: {
      sessions: {
        async create(params: any) {
          calls.push(params)
          return { id: `cs_test_${String(calls.length).padStart(10, "0")}`, client_secret: "secret_lib" }
        },
        async retrieve() {
          if (!session) throw new Error("not used")
          return session
        },
      },
    },
  }
  return { stripe, calls }
}
const deps = (stripe: any, over: Partial<LibraryCheckoutDeps> = {}): LibraryCheckoutDeps => ({
  stripe,
  ready: async () => true,
  fee: async (c) => ({ platformFeeCents: Math.round(c * 0.05), feePercent: 5, feeFixedCents: 0, planId: "pro" }),
  storeCurrency: async () => "USD",
  receiptToken: () => "receipt_token_test_000000000000",
  nonce: () => "fingerprint_test_00000000000000",
  ...over,
})

async function main() {
  console.log("\nRULES: who opens an item")
  {
    const v = (over: Partial<LibraryViewer> = {}): LibraryViewer => ({ userId: ALICE, role: "member", active: true, tierId: null, level: 1, owns: false, ...over })
    const r = (over: Partial<LibraryRule> = {}): LibraryRule => ({ status: "published", mode: "free", tierIds: [], minLevel: null, priceCents: null, memberIds: [], ...over })
    check("not a member: never open, and not on the shelf", (libraryGate(r(), v({ active: false, role: null })) as any).reason === "not_member" && !onShelf(libraryGate(r(), v({ active: false, role: null }))))
    check("FREE: every active member", libraryGate(r(), v()).open)
    const t = libraryGate(r({ mode: "tier", tierIds: [GOLD] }), v())
    check("A TIER: locked with the tiers for anybody else, open on it", !t.open && (t as any).reason === "tier" && (t as any).tierIds[0] === GOLD && libraryGate(r({ mode: "tier", tierIds: [GOLD.toUpperCase()] }), v({ tierId: GOLD })).open)
    const l = libraryGate(r({ mode: "level", minLevel: 3 }), v({ level: 2 }))
    check("A LEVEL: below, locked with the level; at it, open", !l.open && (l as any).level === 3 && libraryGate(r({ mode: "level", minLevel: 3 }), v({ level: 3 })).open)
    const p = libraryGate(r({ mode: "paid", priceCents: 1200 }), v())
    check("BUY: locked with the price until it is theirs, then open as a purchase", !p.open && (p as any).reason === "paid" && (p as any).priceCents === 1200 && (libraryGate(r({ mode: "paid", priceCents: 1200 }), v({ owns: true })) as any).via === "purchase")
    check("owning the product opens a tier or level item too", (libraryGate(r({ mode: "level", minLevel: 9 }), v({ owns: true })) as any).via === "purchase")
    const priv = r({ mode: "private", memberIds: [ERIN] })
    check("PRIVATE: open on the list, hidden for anybody off it (owning it or not)", libraryGate(priv, v({ userId: ERIN })).open && !onShelf(libraryGate(priv, v())) && !onShelf(libraryGate(priv, v({ owns: true }))))
    check("staff open everything, drafts and private items too", ["owner", "admin", "moderator"].every((role) => libraryGate({ ...priv, status: "draft" }, v({ role: role as Role })).open))
    check("a draft is not on a member's shelf", !onShelf(libraryGate(r({ status: "draft" }), v())))

    check("a name is needed and kept short", checkLibraryInput({}, { requireTitle: true }).ok === false && checkLibraryInput({ title: "x".repeat(121) }).ok === false && (checkLibraryInput({ title: "  Pack  " }) as any).patch.title === "Pack")
    check("BUY: an uploaded resource needs its own price, a product may use its own", checkLibraryInput({ mode: "paid" }, { kind: "resource" }).ok === false && (checkLibraryInput({ mode: "paid", priceCents: null }, { kind: "product" }) as any).patch.priceCents === null && checkLibraryInput({ mode: "paid", priceCents: 49 }, { kind: "product" }).ok === false)
    check("a tier choice needs a tier; a level is 2 to 20", checkLibraryInput({ mode: "tier", tierIds: [] }).ok === false && checkLibraryInput({ mode: "level", level: 1 }).ok === false && checkLibraryInput({ mode: "level", level: 21 }).ok === false && (checkLibraryInput({ mode: "level", level: 4 }) as any).patch.minLevel === 4)
    check("a change of choice clears what the others kept", JSON.stringify((checkLibraryInput({ mode: "free" }) as any).patch) === JSON.stringify({ mode: "free", tierIds: [], minLevel: null, priceCents: null, memberIds: [] }))
    check("private keeps the list, each once, junk dropped", JSON.stringify((checkLibraryInput({ mode: "private", memberIds: [ERIN, ERIN, "x"] }) as any).patch.memberIds) === JSON.stringify([ERIN]))
    check("a link is a web address: javascript, data, a login inside it or no host are refused", ["javascript:alert(1)", "data:text/html,hi", "https://a:b@example.com", "ftp://example.com", "nothing"].every((u) => cleanLinkUrl(u) === null) && cleanLinkUrl("example.com/guide") === "https://example.com/guide")
    check("the editor's links and files are read, not trusted", checkLibraryInput({ links: [{ url: "javascript:x", label: "x" }] }).ok === false && checkLibraryInput({ files: [{ fileId: "../../etc", name: "x" }] }).ok === false && (checkLibraryInput({ files: [{ fileId: FILE_A.toUpperCase(), name: "a.pdf" }, { fileId: FILE_A, name: "a.pdf" }] }) as any).patch.files.length === 1)
    check("words: what is inside and the lock", contentsLine({ files: 1, links: 0, fileType: "PDF" }) === "PDF" && contentsLine({ files: 2, links: 1, fileType: null }) === "2 files and 1 link" && lockWords({ lock: { reason: "level", level: 3 }, priceLabel: null }) === "Level 3" && lockWords({ lock: { reason: "paid" }, priceLabel: "$12" }) === "$12")
  }

  console.log("\nSHELF")
  {
    check("off: the shelf is not there (the place is a 404)", (await libraryShelf(world({}, { enabled: false }), community(), alice())) === null)
    const shelf = await libraryShelf(world(), community(), alice())
    const ids = shelf?.items.map((i) => i.id) ?? []
    check("a member sees the items in the admin's order", JSON.stringify(ids) === JSON.stringify([FREE_ITEM, GOLD_ITEM, LEVEL_ITEM, PAID_PRODUCT_ITEM]), ids)
    check("NOT THERE: a draft, a private item off their list, an archived product's item", !ids.includes(DRAFT_ITEM) && !ids.includes(PRIVATE_ITEM) && !ids.includes(ARCHIVED_ITEM))
    const by = (iid: string) => shelf?.items.find((i) => i.id === iid)
    check("free is open; the others carry their lock", by(FREE_ITEM)?.open === true && by(GOLD_ITEM)?.lock?.reason === "tier" && by(GOLD_ITEM)?.lock?.tiers?.[0] === "Gold" && by(LEVEL_ITEM)?.lock?.level === 3 && by(PAID_PRODUCT_ITEM)?.lock?.reason === "paid")
    check("the sold product's price is the product's own, formatted", by(PAID_PRODUCT_ITEM)?.priceLabel === "$29")
    check("its cover comes from the item or its product", by(PAID_PRODUCT_ITEM)?.coverUrl?.includes("kit.png") === true)
    check("only the section that has items is offered", shelf?.sections.length === 1 && shelf.sections[0].name === "Templates")
    check("nobody but those who run Learn and the Library gets the admin's link", shelf?.manageHref === null && (await libraryShelf(world(), community(), dana()))?.manageHref === null && (await libraryShelf(world(), community(), viewer(member(OWNER, { role: "owner" }))))?.manageHref === "/app/community/makers/library")
    const erinShelf = await libraryShelf(world(), community(), erin())
    check("the member on the list sees the private item; Gold and level 3 open", !!erinShelf?.items.find((i) => i.id === PRIVATE_ITEM)?.open && !!erinShelf?.items.find((i) => i.id === GOLD_ITEM)?.open && !!erinShelf?.items.find((i) => i.id === LEVEL_ITEM)?.open)
    const staff = await libraryShelf(world(), community(), dana())
    check("staff see the draft, marked", staff?.items.find((i) => i.id === DRAFT_ITEM)?.draft === true)
    check("nothing on the shelf is a file's or a link's address", !JSON.stringify(shelf).includes(LINK_URL) && !JSON.stringify(shelf).includes("community-files"))
  }

  console.log("\nFILES AND LINKS: only for somebody who opens the item")
  {
    const db = world()
    const locked = await libraryItemPage(db, community(), alice(), LEVEL_ITEM)
    check("a locked item's page lists the links by name, with no route and no address", locked?.item.linkList.length === 1 && locked.item.linkList[0].href === null && locked.item.linkList[0].host === "" && !JSON.stringify(locked).includes("example.com"))
    const lockedGold = await libraryItemPage(db, community(), alice(), GOLD_ITEM)
    check("a locked item's files have no download route", lockedGold?.item.fileList.length === 1 && lockedGold.item.fileList[0].href === null)
    const open = await libraryItemPage(db, community(), alice(), FREE_ITEM)
    check("an open item's files and links go through their routes", open?.item.fileList[0].href === `/api/community/${A}/library/${FREE_ITEM}/files/${FILE_A}` && open?.item.linkList[0].href === `/api/community/${A}/library/${FREE_ITEM}/links/0` && !JSON.stringify(open).includes(LINK_URL))
    check("a private item's page is not found for a member off its list, nor a draft's", (await libraryItemPage(db, community(), alice(), PRIVATE_ITEM)) === null && (await libraryItemPage(db, community(), alice(), DRAFT_ITEM)) === null)
    check("a non-member is never given an item", (await itemAccess(db, community(), stranger(), FREE_ITEM)) === null)
    check("an item of another community is not found", (await itemAccess(db, community({ id: id(2) }), alice(), FREE_ITEM)) === null)
    const access = await itemAccess(db, community(), alice(), FREE_ITEM)
    const signed = access ? await signItemFile(db, community(), access.row, FILE_A) : null
    check("A RESOURCE'S FILE is signed from the uploader's own folder in this community, five minutes, saved", !!signed && signed.ok && signed.url.includes(`/sign/${STORAGE_BUCKET}/${communityFilePath(CREATOR, A, OWNER, FILE_A, "pdf")}`) && signed.url.includes("expires=300") && signed.url.includes("download=welcome.pdf"))
    const other = access ? await signItemFile(db, community(), access.row, FILE_B) : null
    check("a file id that is not this item's is not found", !!other && other.ok === false && other.status === 404)
    const owned = world({ entitlements: [{ id: id(300), buyer_id: ALICE, product_id: PRODUCT, variant_id: null }] })
    const kit = await itemAccess(owned, community(), alice(), PAID_PRODUCT_ITEM)
    const kitFile = kit ? await signItemFile(owned, community(), kit.row, ASSET) : null
    check("A PRODUCT'S FILE comes from its own record, after the file checks", kit?.gate.open === true && !!kitFile && kitFile.ok && kitFile.url.includes(`${CREATOR}/kit.xlsx`))
    const route = code("app/api/community/[communityId]/library/[itemId]/files/[fileId]/route.ts")
    check("the download route asks the access again and refuses a locked item", /itemAccess\(/.test(route) && /if \(!access\.gate\.open\) return NextResponse\.json\(\{ error: "This is locked for you\."/.test(route) && /signItemFile\(/.test(route) && /NextResponse\.redirect\(signed\.url, \{ status: 302/.test(route))
    const links = code("app/api/community/[communityId]/library/[itemId]/links/[index]/route.ts")
    check("the link route too, and checks the address again before sending anyone to it", /if \(!access\.gate\.open\)/.test(links) && /cleanLinkUrl\(itemLinkUrl\(access\.row, n\)\)/.test(links) && /"Referrer-Policy": "no-referrer"/.test(links))
  }

  console.log("\nADMIN")
  {
    const db = world()
    const theirs = await createItem(db, { community: community(), actorId: OWNER, kind: "product", productId: PRODUCT_OTHER })
    const plan = await createItem(db, { community: community(), actorId: OWNER, kind: "product", productId: PRODUCT_TIER })
    const course = await createItem(db, { community: community(), actorId: OWNER, kind: "product", productId: PRODUCT_COURSE })
    check("ATTACH: another creator's product, a community's plan and a course are refused", theirs.ok === false && plan.ok === false && course.ok === false)
    check("ATTACH: a product already in the Library is refused", (await createItem(db, { community: community(), actorId: OWNER, kind: "product", productId: PRODUCT })).ok === false)
    const made = await createItem(db, { community: community(), actorId: OWNER, kind: "product", productId: PRODUCT_OPTIONS })
    const row = db.tables.community_library_items.find((r: any) => made.ok && r.id === made.id)
    check("ATTACH: one of the creator's own, a draft at the end, its name, cover and description copied", made.ok && row?.status === "draft" && row?.position === 7 && row?.title === "With sizes" && String(row?.description).includes("Templates for pricing"))
    const sell = made.ok ? await updateItem(db, { community: community(), actorId: OWNER, itemId: made.id, input: { mode: "paid" } }) : null
    check("a product with options is not sold here", !!sell && sell.ok === false && /options/.test((sell as any).error))
    const draftProduct = world({ products: [product(PRODUCT, { status: "draft" })] })
    const sellDraft = await updateItem(draftProduct, { community: community(), actorId: OWNER, itemId: PAID_PRODUCT_ITEM, input: { mode: "paid" } })
    check("a product that is not published is not sold here", sellDraft.ok === false && /Publish the product/.test((sellDraft as any).error))
    const ownPrice = await updateItem(db, { community: community(), actorId: OWNER, itemId: PAID_PRODUCT_ITEM, input: { mode: "paid", priceCents: 1900 } })
    const shelfAfter = await libraryShelf(db, community(), alice())
    check("a product sold at a price set here: that price, the store's own untouched", ownPrice.ok && shelfAfter?.items.find((i) => i.id === PAID_PRODUCT_ITEM)?.priceLabel === "$19" && db.tables.products.find((p: any) => p.id === PRODUCT)?.price_cents === 2900)

    const newOne = await createItem(db, { community: community(), actorId: OWNER, kind: "resource", title: "Workbook" })
    const RID = newOne.ok ? newOne.id : ""
    const missingFile = await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { files: [{ fileId: id(77), name: "ghost.pdf" }] } })
    check("FILES: a file that is not in the admin's own folder is refused", missingFile.ok === false && (missingFile as any).field === "files")
    db.put(STORAGE_BUCKET, communityFilePath(CREATOR, A, ALICE, id(78), "pdf"), new Uint8Array(10))
    const someoneElses = await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { files: [{ fileId: id(78), name: "x.pdf" }] } })
    check("FILES: another member's upload cannot be taken into the Library", someoneElses.ok === false)
    db.put(STORAGE_BUCKET, communityFilePath(CREATOR, A, OWNER, id(79), "pdf"), new Uint8Array(1234))
    const withFile = await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { files: [{ fileId: id(79), name: "workbook.pdf" }] } })
    const stored = db.tables.community_library_items.find((r: any) => r.id === RID)
    check("FILES: the admin's own upload is kept with its real size and its uploader", withFile.ok && stored?.files?.[0]?.size === 1234 && stored?.files?.[0]?.uploaderId === OWNER)
    const badCover = await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { coverUrl: "https://evil.example/x.png" } })
    check("COVER: only a picture in Storelib's storage", badCover.ok === false && (badCover as any).field === "cover")
    const noPrice = await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { mode: "paid" } })
    check("BUY: a resource needs a price", noPrice.ok === false && (noPrice as any).field === "price")
    const sold = await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { mode: "paid", priceCents: 1500, status: "published" } })
    const soldRow = db.tables.community_library_items.find((r: any) => r.id === RID)
    const madeProduct = db.tables.products.find((p: any) => p.id === soldRow?.product_id)
    check("A SOLD RESOURCE becomes a product made for the community: digital, its price, published, listed in no store", sold.ok && soldRow?.made_product === true && madeProduct?.community_id === A && madeProduct?.type === "digital" && madeProduct?.price_cents === 1500 && madeProduct?.status === "published" && madeProduct?.creator_id === CREATOR)
    const assets = db.tables.digital_assets.filter((a: any) => a.product_id === madeProduct?.id)
    check("  its files are the item's own stored files (no copy), for the buyer's library", assets.length === 1 && assets[0].file_path === communityFilePath(CREATOR, A, OWNER, id(79), "pdf") && assets[0].storage_bucket === STORAGE_BUCKET)
    await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { mode: "free" } })
    check("  taken off sale, the product goes back to a draft (its buyers keep it)", db.tables.products.find((p: any) => p.id === madeProduct?.id)?.status === "draft")
    await updateItem(db, { community: community(), actorId: OWNER, itemId: RID, input: { mode: "paid", priceCents: 1500 } })
    check("  sold again, the same product, published again", db.tables.products.filter((p: any) => p.community_id === A && p.type === "digital").length === 1 && db.tables.products.find((p: any) => p.id === madeProduct?.id)?.status === "published")
    await deleteItem(db, { community: community(), actorId: OWNER, itemId: RID })
    check("  taken out of the Library, the product stays as a draft for its buyers", !db.tables.community_library_items.some((r: any) => r.id === RID) && db.tables.products.find((p: any) => p.id === madeProduct?.id)?.status === "draft")
    const unpublishedEmpty = await createItem(db, { community: community(), actorId: OWNER, kind: "resource", title: "Empty" })
    const pubEmpty = unpublishedEmpty.ok ? await updateItem(db, { community: community(), actorId: OWNER, itemId: unpublishedEmpty.id, input: { status: "published" } }) : null
    check("an empty resource is not published", !!pubEmpty && pubEmpty.ok === false && (pubEmpty as any).field === "status")
    const tiers = await updateItem(db, { community: community(), actorId: OWNER, itemId: FREE_ITEM, input: { mode: "tier", tierIds: [id(999)] } })
    check("a tier that is not this community's is refused", tiers.ok === false && (tiers as any).field === "tiers")
    const priv = await updateItem(db, { community: community(), actorId: OWNER, itemId: FREE_ITEM, input: { mode: "private", memberIds: [ERIN, id(998)] } })
    check("private keeps only this community's members", priv.ok && JSON.stringify(db.tables.community_library_items.find((r: any) => r.id === FREE_ITEM)?.member_ids) === JSON.stringify([ERIN]))
    const wrongOrder = await reorderItems(db, { communityId: A, ids: [FREE_ITEM] })
    check("ORDER: exactly every item once, or nothing moves", wrongOrder.ok === false)
    const all = db.tables.community_library_items.filter((r: any) => r.community_id === A).map((r: any) => r.id).reverse()
    const reordered = await reorderItems(db, { communityId: A, ids: all })
    check("ORDER: saved as given", reordered.ok && db.tables.community_library_items.find((r: any) => r.id === all[0])?.position === 0)
    check("the switch is written once per community", (await setLibraryEnabled(db, { communityId: A, actorId: OWNER, enabled: false })).ok && db.tables.community_library_settings.length === 1 && db.tables.community_library_settings[0].enabled === false && (await setLibraryEnabled(db, { communityId: A, actorId: OWNER, enabled: "yes" })).ok === false)
    const adminData = await libraryAdmin(world(), community())
    check("the admin's data: every item, drafts and private ones, the attachable products (own, digital, not a plan)", adminData.items.length === 7 && adminData.products.every((p) => ![PRODUCT_OTHER, PRODUCT_TIER, PRODUCT_COURSE, PRODUCT_ARCHIVED].includes(p.id)) && adminData.products.some((p) => p.id === PRODUCT_OPTIONS && p.hasOptions))
    const admin = ["app/api/app/community/[id]/library/route.ts", "app/api/app/community/[id]/library/[itemId]/route.ts", "app/api/app/community/[id]/library/sections/route.ts", "app/api/app/community/[id]/library/sections/[sectionId]/route.ts"].map(code).join("\n")
    check("ADMIN ROUTES: manage_classroom for the items and sections, manage_settings for the switch", (admin.match(/requireCreatorCommunity\(id, "manage_classroom"\)/g) ?? []).length === 9 && (admin.match(/requireCreatorCommunity\(id, "manage_settings"\)/g) ?? []).length === 1 && (admin.match(/manageLimit\(gate\.ctx\.userId\)/g) ?? []).length === 9)
  }

  console.log("\nPURCHASE: the Storelib checkout, inside the community")
  {
    const db = world()
    const { stripe, calls } = fakeStripe()
    const start = await startLibraryCheckout(db, deps(stripe), { community: community(), viewer: buyer(), itemId: PAID_PRODUCT_ITEM, buyer: { userId: BUYER, email: "buyer@example.com", name: "Bea Byer", country: "US" } })
    const params = calls[0]
    const pim = params?.payment_intent_data?.metadata ?? {}
    check("an Embedded Checkout session that never redirects, for the product's price", start.ok && params.ui_mode === "embedded" && params.redirect_on_completion === "never" && params.line_items[0].price_data.unit_amount === 2900 && params.line_items[0].price_data.currency === "usd")
    check("a destination charge to the creator, the platform's fee kept back", params.payment_intent_data.transfer_data.destination === "acct_123creator" && params.payment_intent_data.application_fee_amount === 145)
    check("THE PAYMENTINTENT IS A PRODUCT CHECKOUT'S: the order, receipt and library come from the same fulfilment", isCheckoutMetadata(pim) && pim.product_id === PRODUCT && pim.creator_id === CREATOR && pim.buyer_id === BUYER && pim.buyer_email === "buyer@example.com" && pim.receipt_token && pim.platform_fee_cents === "145")
    check("  and it names the item, for the record", pim.kind === "community_library" && pim.community_library_item_id === PAID_PRODUCT_ITEM && pim.community_id === A)
    check("THE SESSION NAMES NO PRODUCT, so the webhook's older session path never makes a second order", !params.metadata.product_id && params.metadata.kind === "community_library" && isLibrarySession({ metadata: params.metadata }))
    check("under Stripe's 50 metadata keys", Object.keys(pim).length <= 50 && Object.values(pim).every((v) => String(v).length <= 500))
    const free = await startLibraryCheckout(db, deps(stripe), { community: community(), viewer: buyer(), itemId: FREE_ITEM, buyer: { userId: BUYER, email: null, name: null, country: null } })
    check("a free item is not for sale: it is theirs already", free.ok === false && free.code === "already_yours")
    const gold = await startLibraryCheckout(db, deps(stripe), { community: community(), viewer: buyer(), itemId: GOLD_ITEM, buyer: { userId: BUYER, email: null, name: null, country: null } })
    check("a tier item is not for sale", gold.ok === false && gold.code === "closed")
    const notReady = await startLibraryCheckout(db, deps(stripe, { ready: async () => false }), { community: community(), viewer: buyer(), itemId: PAID_PRODUCT_ITEM, buyer: { userId: BUYER, email: null, name: null, country: null } })
    check("the seller cannot take payments: nothing is started", notReady.ok === false && notReady.code === "seller_unavailable")
    const outsider = await startLibraryCheckout(db, deps(stripe), { community: community(), viewer: stranger(), itemId: PAID_PRODUCT_ITEM, buyer: { userId: BUYER, email: null, name: null, country: null } })
    check("somebody who is not a member cannot buy", outsider.ok === false && outsider.code === "not_member")
    const taxed = await startLibraryCheckout(db, deps(stripe, { tax: async () => ({ totalCents: 3480, taxCents: 580, rateBps: 2000, included: false, country: "DE", label: "VAT 20%" }) }), { community: community(), viewer: buyer(), itemId: PAID_PRODUCT_ITEM, buyer: { userId: BUYER, email: null, name: null, country: "DE" } })
    const taxedPim = calls[calls.length - 1].payment_intent_data.metadata
    check("the store's tax on a download, as the product checkout charges it", taxed.ok && calls[calls.length - 1].line_items[0].price_data.unit_amount === 3480 && taxedPim.tax_cents === "580" && taxedPim.tax_label === "VAT 20%" && taxedPim.base_price_cents === "2900")
    const soldOut = await startLibraryCheckout(db, deps(stripe, { holdSale: async () => false }), { community: community(), viewer: buyer(), itemId: PAID_PRODUCT_ITEM, buyer: { userId: BUYER, email: null, name: null, country: null } })
    check("a product's sales limit holds a copy first, and sold out is refused", soldOut.ok === false && soldOut.code === "sold_out")

    const fulfils: string[] = []
    const fulfil = async (pi: string) => {
      fulfils.push(pi)
      /* What lib/checkout/fulfil-payment.ts does for the buyer: the order once, and the product in their library. */
      if (!db.tables.entitlements.some((e: any) => e.buyer_id === BUYER && e.product_id === PRODUCT)) db.tables.entitlements.push({ id: id(500), buyer_id: BUYER, product_id: PRODUCT, variant_id: null })
      return { ok: true as const, orderId: id(600), created: fulfils.length === 1, amountCents: 2900 }
    }
    const session = { id: "cs_test_0000000001", metadata: params.metadata, payment_status: "paid", payment_intent: "pi_lib_123", amount_total: 2900, currency: "usd" } as any
    const wrong = await grantLibraryFromSession(db, session, fulfil, { userId: ALICE })
    check("the sheet's confirm must come from the buyer the session names", wrong.ok === false && wrong.status === 403 && fulfils.length === 0)
    const unpaid = await grantLibraryFromSession(db, { ...session, payment_status: "unpaid" }, fulfil)
    check("an unpaid session grants nothing", unpaid.ok === false && unpaid.status === 409 && fulfils.length === 0)
    const g1 = await grantLibraryFromSession(db, session, fulfil, { userId: BUYER })
    const g2 = await grantLibraryFromSession(db, session, fulfil)
    check("GRANT: the order through the product fulfilment, by the PaymentIntent", g1.ok && g1.orderId === id(600) && fulfils[0] === "pi_lib_123")
    check("  the webhook and the sheet both asking record the purchase once", g2.ok && db.tables.community_library_purchases.length === 1 && db.tables.community_library_purchases[0].order_id === id(600) && db.tables.community_library_purchases[0].item_id === PAID_PRODUCT_ITEM)
    await recordFromIntent(db, { id: "pi_lib_123", metadata: pim, amount_received: 2900, amount: 2900, currency: "usd" } as any, id(600))
    check("  and the PaymentIntent's own event adds no second row", db.tables.community_library_purchases.length === 1)
    const page = await libraryItemPage(db, community(), buyer(), PAID_PRODUCT_ITEM)
    check("THE ITEM OPENS AT ONCE, from the entitlement the order made, and says it is in their Storelib library", page?.item.open === true && page.item.owned && page.item.fileList[0].href !== null && page.item.libraryProductHref === `/account/library/products/${PRODUCT}`)
    const again = await startLibraryCheckout(db, deps(stripe), { community: community(), viewer: buyer(), itemId: PAID_PRODUCT_ITEM, buyer: { userId: BUYER, email: null, name: null, country: null } })
    check("no second charge: bought already is refused before Stripe is asked", again.ok === false && again.code === "already_yours")

    console.log("\nREFUNDS")
    check("a full refund marks the purchase once", (await revokeRefundedLibrary(db, "pi_lib_123")) === 1 && (await revokeRefundedLibrary(db, "pi_lib_123")) === 0 && !!db.tables.community_library_purchases[0].refunded_at)
    db.tables.entitlements = db.tables.entitlements.filter((e: any) => !(e.buyer_id === BUYER && e.product_id === PRODUCT))
    const after = await libraryItemPage(db, community(), buyer(), PAID_PRODUCT_ITEM)
    check("and with the product out of their library (every refund path removes it), the item locks again", after?.item.open === false && after.item.lock?.reason === "paid" && after.item.fileList[0].href === null)
    const sync = code("lib/stripe/refund-sync.ts")
    check("refund-sync takes the product out of the buyer's library on a full refund", /from\("entitlements"\)\.delete\(\)/.test(sync))
    const adminSales = await libraryAdmin(db, community())
    check("the admin's sales leave the refunded one out", adminSales.items.find((i) => i.id === PAID_PRODUCT_ITEM)?.stats.sales === 0)
  }

  console.log("\nTHE MADE PRODUCT IS SOLD THE SAME WAY")
  {
    const db = world({
      community_library_items: [item(PAID_RESOURCE_ITEM, { title: "Workbook", access_mode: "paid", price_cents: 1500, currency: "USD", product_id: MADE, made_product: true, files: [fileOf(FILE_A, "workbook.pdf")] })],
      products: [product(MADE, { title: "Workbook", slug: "workbook", community_id: A, price_cents: 1500 })],
    })
    const { stripe, calls } = fakeStripe()
    const start = await startLibraryCheckout(db, deps(stripe), { community: community(), viewer: buyer(), itemId: PAID_RESOURCE_ITEM, buyer: { userId: BUYER, email: "b@example.com", name: null, country: null } })
    check("a sold resource is bought as its made product, at the item's price", start.ok && calls[0].payment_intent_data.metadata.product_id === MADE && calls[0].line_items[0].price_data.unit_amount === 1500)
    const elsewhere = world({ community_library_items: [item(PAID_RESOURCE_ITEM, { access_mode: "paid", price_cents: 1500, product_id: PRODUCT, made_product: true, files: [fileOf(FILE_A, "w.pdf")] })] })
    const bad = await startLibraryCheckout(elsewhere, deps(fakeStripe().stripe), { community: community(), viewer: buyer(), itemId: PAID_RESOURCE_ITEM, buyer: { userId: BUYER, email: null, name: null, country: null } })
    check("a resource pointing at a product that is not made for this community is not sold", bad.ok === false && bad.code === "not_for_sale")
  }

  console.log("\nTHE ABOUT PAGE")
  {
    const teaser = await aboutLibrary(world(), community())
    check("a public community shows its first published items that are not private, titles and how they open", !!teaser && teaser.total === 4 && teaser.items[0].line === "Free for members" && teaser.items.some((i) => i.line === "$29") && !teaser.items.some((i) => i.id === PRIVATE_ITEM || i.id === DRAFT_ITEM))
    check("a private community shows nothing; nor one with the Library off", (await aboutLibrary(world(), community({ visibility: "private" }))) === null && (await aboutLibrary(world({}, { enabled: false }), community())) === null)
    check("nothing in it is a file or a link", !JSON.stringify(teaser).includes(LINK_URL) && !JSON.stringify(teaser).includes(".pdf"))
  }

  console.log("\nROUTES AND THE WEBHOOK")
  {
    const member = [
      "app/api/community/[communityId]/library/route.ts",
      "app/api/community/[communityId]/library/[itemId]/route.ts",
      "app/api/community/[communityId]/library/[itemId]/files/[fileId]/route.ts",
      "app/api/community/[communityId]/library/[itemId]/links/[index]/route.ts",
      "app/api/community/[communityId]/library/[itemId]/checkout/route.ts",
      "app/api/community/[communityId]/library/[itemId]/checkout/confirm/route.ts",
    ]
    for (const p of member) {
      const src = code(p)
      check(`${p.replace("app/api/community/[communityId]/", "")}: the switch, requireMember and rateLimit, in that order, inline`, /const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/.test(src) && src.indexOf("requireMember(") > src.indexOf("requireCommunitiesOn(") && src.indexOf("rateLimit(") > src.indexOf("requireMember("))
    }
    const checkout = code("app/api/community/[communityId]/library/[itemId]/checkout/route.ts")
    check("the checkout route reads no price from the body, and is limited as every payment", !/readJson|request\.json/.test(checkout) && /windows: LIMITS\.payment/.test(checkout))
    const hook = code("app/api/stripe/webhook/route.ts")
    const libAt = hook.indexOf('session.metadata?.kind === "community_library"')
    const oldPath = hook.indexOf("// --- PAYMENT MODE: Product purchase checkout ---")
    check("the webhook answers a Library session before the older session path, with the product fulfilment", libAt > 0 && (oldPath < 0 || libAt < hook.indexOf('console.log("[Webhook] Checkout session:"')) && /grantLibraryFromSession\(supabaseAdmin, session, \(pi\) => fulfilPaymentIntent\(supabaseAdmin, pi, \{ baseUrl \}\)\)/.test(hook))
    check("the PaymentIntent's own event records the purchase after its order", /recordFromIntent\(supabaseAdmin, pi, result\.orderId\)/.test(hook))
    check("a full refund marks the Library purchase", /revokeRefundedLibrary\(supabaseAdmin, intentId\)/.test(hook))
    const orphans = code("lib/communities/server/orphans.ts")
    check("the daily sweep keeps a Library file and any product's file at that path", /from\("community_library_items"\)\.select\("id"\)\.eq\("community_id", c\.id\)\.contains\("files"/.test(orphans) && /from\("digital_assets"\)\.select\("id"\)\.eq\("file_path", path\)/.test(orphans))
  }

  console.log("\nPLACES AND THE TAB")
  {
    check("/library and /library/<id> are places, and back again", placeFromUrl("/community/makers/library", "")?.kind === "library" && (placeFromUrl(`/community/makers/library/${FREE_ITEM}`, "") as any)?.id === FREE_ITEM && placeHref("makers", { kind: "resource", id: FREE_ITEM }) === `/community/makers/library/${FREE_ITEM}` && placeHref("makers", { kind: "library" }) === "/community/makers/library")
    check("their keys go both ways; both mark the Library tab", placeFromKey(placeKey({ kind: "resource", id: FREE_ITEM }))?.kind === "resource" && placeFromKey("library")?.kind === "library" && placeTab({ kind: "resource", id: FREE_ITEM }) === "library" && placeTab({ kind: "library" }) === "library")
    const c = { slug: "makers", classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, gamificationEnabled: true }
    const on = navEntries({ ...c, libraryEnabled: true }, false).map((e) => e.key)
    check("the tab sits right after Learn, only while the Library is on", on.indexOf("library") === on.indexOf("classroom") + 1 && !navEntries(c, false).some((e) => e.key === "library"))
    check("the admin's tab is beside Learn, while it is on", /head\.libraryEnabled \? \{ id: "library"/.test(code("components/community/creator/community-shell.tsx")))
    check("the Library's screens are in the dashboard's language checks", /community\\\/\(creator\|learn\|library\)/.test(raw("scripts/i18n/scan.mjs")))
  }

  console.log("\nPart 278")
  {
    const P = "supabase/sql/run-now/278_community_library.sql"
    const sql = raw(P)
    const tables = ["community_library_settings", "community_library_sections", "community_library_items", "community_library_purchases", "community_library_activity"]
    check("its migration is the same bytes", existsSync("supabase/migrations/20270212_community_library.sql") && raw("supabase/migrations/20270212_community_library.sql") === sql)
    check("RLS on every new table; nothing for members or visitors, the server only", tables.every((t) => sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)) && sql.includes(`REVOKE ALL ON ${tables.map((t) => `public.${t}`).join(", ")} FROM PUBLIC, anon, authenticated;`) && !/TO authenticated/.test(sql) && !/CREATE POLICY/.test(sql) && /REVOKE ALL ON FUNCTION public\.community_library_touch\(uuid, uuid, text\) FROM PUBLIC, anon, authenticated;/.test(sql))
    check("one purchase per payment; a view once a member and a day", /CONSTRAINT community_library_purchases_intent_once UNIQUE \(payment_intent_id\)/.test(sql) && /CONSTRAINT community_library_activity_once UNIQUE \(item_id, user_id, kind, day\)/.test(sql))
    check("the five choices and the two kinds are the database's own checks", /CHECK \(access_mode IN \('free', 'tier', 'level', 'paid', 'private'\)\)/.test(sql) && /CHECK \(kind IN \('resource', 'product'\)\)/.test(sql))
    check("safe to run again: every create checks first", sql.split("\n").filter((l) => /^CREATE (TABLE|INDEX|UNIQUE INDEX) /.test(l) && !/IF NOT EXISTS/.test(l)).length === 0 && /CREATE OR REPLACE FUNCTION/.test(sql))
    check("one statement per line, the note first", sql.split("\n")[0].startsWith("/*") && sql.trimEnd().endsWith("notify pgrst, 'reload schema';"))
    check("a README row and a check column", raw("supabase/sql/run-now/README.md").includes("| `278_community_library.sql` |") && /as p278_community_library[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log("\nCOPY")
  {
    const files = ["components/community/library/library-admin.tsx", "components/community/library/library-editor.tsx", "components/community/library/library-shelf.tsx", "components/community/library/library-item.tsx", "components/community/library/library-checkout.tsx", "components/community/library/model.ts", "lib/communities/library.ts", "lib/communities/server/library.ts", "lib/communities/server/library-checkout.ts", "supabase/sql/run-now/278_community_library.sql"]
    const text = files.map(raw).join("\n")
    check("no em dash, no banned word", !/—/.test(text) && !/\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(text), (text.match(/\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/gi) ?? []).slice(0, 5))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
