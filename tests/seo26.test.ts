/**
 * ===========================================================================
 *  ROUND 26 (W6): COMMUNITY SEO, AND THE MEMBER LINKS INSIDE A COMMUNITY
 * ===========================================================================
 * SEO       which community states are indexed, previewed or silent; the
 *           line under the title (SEO description, short description,
 *           tagline, description); canonical, Open Graph and X cards; the
 *           JSON-LD (no rating without reviews, a Brand not a Person); the
 *           sitemap asks the database the same question and names
 *           canonical addresses only; a community's domain lists its root;
 *           an archived community's public posts and events say noindex;
 *           member pages say noindex; old slugs move with a 308.
 * LINKS     the member links as a member sees them (only safe addresses,
 *           hidden ones gone, four at most), who reads them (a member or
 *           staff, never a visitor), the press counted once per member,
 *           link and day, the counts for the editor, the click route's
 *           gates, and the public data shape never carrying them.
 * SQL       part 221 follows the run-now rules.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { stripComments } from "./_source"
import { untt } from "./i18n-source"
import { fakeDb } from "./_fake-db"
import { canonicalUrl, communityJsonLd, communityMetadata, describeCommunity, inviteMetadata, UNLISTED_LINE, type SeoFacts } from "@/components/community/public/seo"
import { communityIndexable, loadSalesPage, seoFacts, sharePreviewable, sitemapCommunities } from "@/lib/communities/server/public"
import { readCommunityDeleting, readCommunitySummary } from "@/lib/communities/server/community-summary"
import { communitySitemap } from "@/lib/custom-domains/community"
import { indexablePost, postArticleJsonLd, postMetadata, publicPost, type PostFacts } from "@/app/(marketing)/community/[slug]/(member)/post/[postId]/post-seo"
import { eventMetadata, indexableEvent, type EventFacts } from "@/app/(marketing)/community/[slug]/(member)/events/[eventId]/event-seo"
import { MEMBER_LINKS_SHOWN, memberLinkClickPath, memberLinkTarget, memberLinkViews } from "@/lib/communities/member-link-view"
import { clickDay, memberLinkClicks, memberLinksForViewer, recordMemberLinkClick, seesMemberLinks } from "@/lib/communities/server/member-shortcuts"
import { COMMUNITY_COLUMNS, PUBLIC_COMMUNITY_COLUMNS, type CommunityRow } from "@/lib/communities/types"
import type { Viewer } from "@/lib/communities/server/context"
import type { PublicCommunityView } from "@/components/community/public/types"

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

const C = "c0000000-0000-4000-8000-000000000026"
const OWNER = "a0000000-0000-4000-8000-0000000000aa"
const MEMBER = "a0000000-0000-4000-8000-000000000001"
const STRANGER = "a0000000-0000-4000-8000-000000000002"
const MOD = "a0000000-0000-4000-8000-000000000003"
const CREATOR = "e0000000-0000-4000-8000-000000000026"

const LINKS = [
  { id: "lk_shop", label: "  The shop  ", url: "https://shop.example.com/a?x=1", icon: "shopping-bag", hidden: false },
  { id: "lk_course", label: "Start the course", url: "/ana/course-one", icon: "graduation-cap", hidden: false },
  { id: "lk_hidden", label: "Secret drafts", url: "https://hidden.example.com", icon: null, hidden: true },
  { id: "lk_js", label: "Bad", url: "javascript:alert(1)", icon: null, hidden: false },
  { id: "lk_home", label: "Our page on Storelib", url: "https://storelib.com/ana?ref=c", icon: null, hidden: false },
  { id: "lk_five", label: "Fifth visible", url: "https://five.example.com", icon: null, hidden: false },
  { id: "lk_six", label: "Sixth visible", url: "https://six.example.com", icon: null, hidden: false },
]

function row(o: Partial<CommunityRow> & Record<string, unknown> = {}): CommunityRow {
  return {
    id: C,
    creator_id: CREATOR,
    owner_user_id: OWNER,
    slug: "makers",
    name: "Makers",
    tagline: "People who make things",
    description: "<p>We <strong>build</strong> things together.</p>",
    logo_url: "https://x.supabase.co/logo.png",
    cover_url: "https://x.supabase.co/cover.webp",
    cover_video_id: null,
    visibility: "public",
    access: "free",
    status: "published",
    category: null,
    language: "en",
    member_count: 12,
    post_count: 3,
    discovery_enabled: true,
    approval_required: false,
    default_role: "member",
    directory_enabled: true,
    classroom_enabled: true,
    events_enabled: true,
    chat_enabled: false,
    gamification_enabled: true,
    rules: [],
    faq: [],
    benefits: ["Weekly calls"],
    links: [],
    onboarding: {} as never,
    seo_title: null,
    seo_description: null,
    trending_score: 0,
    trending_at: null,
    platform_hidden: false,
    suspended_at: null,
    suspended_reason: null,
    archived_at: null,
    deleted_at: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    member_links: LINKS,
    summary: "A short line about the makers.",
    ...o,
  } as CommunityRow
}

function viewer(o: Partial<Viewer> = {}): Viewer {
  return { userId: MEMBER, member: null, role: "member", active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...o } as Viewer
}

async function main() {
  /* ── Which states are indexed, previewed, or silent ──────────────────── */
  console.log("\nStates")
  {
    const states: [string, Partial<CommunityRow>, boolean, boolean][] = [
      ["published, public, free", {}, true, true],
      ["published, public, paid", { access: "paid" }, true, true],
      ["private", { visibility: "private" }, false, true],
      ["unlisted", { visibility: "unlisted" }, false, true],
      ["public but invite only (private by access)", { access: "invite_only" }, false, true],
      ["archived (also what a community waiting to be deleted is)", { status: "archived", archived_at: "2026-10-10T00:00:00Z" }, false, true],
      ["hidden by Storelib", { platform_hidden: true }, false, true],
      ["draft", { status: "draft" }, false, false],
      ["suspended (status)", { status: "suspended" }, false, false],
      ["suspended (at)", { suspended_at: "2026-10-10T00:00:00Z" }, false, false],
      ["deleted", { deleted_at: "2026-10-10T00:00:00Z" }, false, false],
    ]
    for (const [name, o, indexed, previewed] of states) {
      const r = row(o)
      check(`${name}: ${indexed ? "indexed" : "noindex"}, ${previewed ? "its page answers (its name, its tab icon)" : "a 404, nothing said"}`, communityIndexable(r) === indexed && sharePreviewable(r) === previewed && (seoFacts(r).indexable === indexed), { indexable: communityIndexable(r), previewable: sharePreviewable(r) })
      const meta = communityMetadata(seoFacts(r))
      const robots = meta.robots as { index: boolean; follow: boolean }
      check(`  its metadata says index ${indexed}`, robots.index === indexed && robots.follow === indexed)
      const og = meta.openGraph as Any
      const tw = meta.twitter as Any
      check(
        indexed ? "  its link preview: its own line and picture" : "  its link preview: its name only, a neutral line, no picture (never its words or cover)",
        indexed
          ? meta.description === "A short line about the makers." && !!og.images?.length && tw.card === "summary_large_image"
          : meta.description === UNLISTED_LINE && og.description === UNLISTED_LINE && !og.images && !tw.images && tw.card === "summary" && !JSON.stringify(meta).includes("cover") && !JSON.stringify(meta).includes("People who make things"),
        meta,
      )
    }
  }

  /* ── The words ───────────────────────────────────────────────────────── */
  console.log("\nTitle and description")
  {
    const base: SeoFacts = { ...seoFacts(row()), summary: "A short line about the makers." }
    check("the line under the title: the SEO description first", describeCommunity({ ...base, seoDescription: "Written for search." }) === "Written for search.")
    check("then the short description", describeCommunity(base) === "A short line about the makers.")
    check("then the tagline", describeCommunity({ ...base, summary: null }) === "People who make things")
    check("then the description's text, plain", describeCommunity({ ...base, summary: null, tagline: null }) === "We build things together.")
    check("and a plain sentence when there is nothing", describeCommunity({ ...base, summary: null, tagline: null, description: null }) === "A community on Storelib.")
    const meta = communityMetadata(base)
    check("the title is the community's name (absolute, no template)", JSON.stringify(meta.title) === JSON.stringify({ absolute: "Makers" }))
    check("an SEO title wins", JSON.stringify(communityMetadata({ ...base, seoTitle: "Makers club for potters" }).title) === JSON.stringify({ absolute: "Makers club for potters" }))
    check("About says About, with the same canonical", JSON.stringify(communityMetadata(base, { about: true }).title) === JSON.stringify({ absolute: "About Makers" }) && communityMetadata(base, { about: true }).alternates?.canonical === "https://storelib.com/community/makers")
    check("one canonical: storelib.com/community/<slug>", meta.alternates?.canonical === "https://storelib.com/community/makers" && canonicalUrl("makers") === "https://storelib.com/community/makers")
    check("or the community's own domain root once connected", communityMetadata({ ...base, origin: "https://club.example.com" }).alternates?.canonical === "https://club.example.com/")
    const og = meta.openGraph as Any
    const tw = meta.twitter as Any
    check("Open Graph: the canonical, Storelib, the words", og.url === "https://storelib.com/community/makers" && og.siteName === "Storelib" && og.description === "A short line about the makers." && og.title === "Makers")
    check("the preview picture is the cover at 1200 by 630, the X card large", og.images[0].url.startsWith("https://storelib.com/community/makers/cover.jpg?v=") && og.images[0].width === 1200 && og.images[0].height === 630 && tw.card === "summary_large_image" && tw.images[0] === og.images[0].url)
    const noCover = communityMetadata({ ...base, coverUrl: null }).openGraph as Any
    check("without a cover, the card drawn for it (share.png)", noCover.images[0].url.startsWith("https://storelib.com/community/makers/share.png?v="))
    const invite = inviteMetadata(base)
    check("an invite's preview: the short description, never indexed", /A short line about the makers\./.test(String(invite.description)) && (invite.robots as Any).index === false)
    check("a summary is read softly: trimmed to one line", (await readCommunitySummary(fakeDb({ communities: [{ id: C, summary: "  Two\n lines  " }] }) as never, C)) === "Two lines")
    check("and a database before part 220 has none, without failing", (await readCommunitySummary(fakeDb({ communities: [{ id: C }] }, { failWith: { communities: { code: "42703", message: 'column communities.summary does not exist' } } }) as never, C)) === null)
    check("a bad id is not even asked", (await readCommunitySummary(fakeDb({}) as never, "nope")) === null)
    check("waiting to be deleted is read from the deletion's own row, softly", (await readCommunityDeleting(fakeDb({ community_deletions: [{ community_id: C, state: "scheduled" }] }) as never, C)) === true && (await readCommunityDeleting(fakeDb({ community_deletions: [{ community_id: C, state: "undone" }] }) as never, C)) === false && (await readCommunityDeleting(fakeDb({}, { failWith: { community_deletions: { code: "42P01", message: "missing" } } }) as never, C)) === false)
  }

  /* ── JSON-LD ─────────────────────────────────────────────────────────── */
  console.log("\nStructured data")
  {
    const view = (o: Partial<PublicCommunityView> & { summary?: string | null } = {}) =>
      ({ slug: "makers", name: "Makers", tagline: "People who make things", descriptionText: null, descriptionHtml: "<p>We build.</p>", coverUrl: "https://x.supabase.co/cover.webp", logoUrl: "https://x.supabase.co/logo.png", creator: { name: "Ana Maker", href: "/ana" }, options: [], reviews: null, ...o }) as unknown as PublicCommunityView
    check("nothing for a community that is not indexable", communityJsonLd(view(), false) === null)
    const free = communityJsonLd(view({ summary: "A short line." }), true) as Any
    check("a free community: an Organization founded by its creator, the short description", free["@type"] === "Organization" && free.founder["@type"] === "Person" && free.description === "A short line." && free.url === "https://storelib.com/community/makers")
    const paidOption = { kind: "paid", name: "Pro", priceLine: "$19/month", billing: "recurring", monthlyCents: 1900, yearlyCents: 19000, priceCents: null, currency: "usd" }
    const paid = communityJsonLd(view({ options: [paidOption as never] }), true) as Any
    check("a paid one: a Product with its real Offer, its creator as a Brand (not a Person)", paid["@type"] === "Product" && paid.offers.price === "19.00" && paid.offers.priceCurrency === "USD" && paid.brand["@type"] === "Brand" && paid.brand.name === "Ana Maker")
    check("no rating without published reviews", !("aggregateRating" in paid))
    const rated = communityJsonLd(view({ options: [paidOption as never], reviews: { average: 4.5, total: 2, items: [] } }), true) as Any
    check("a rating only from real published reviews", rated.aggregateRating?.reviewCount === 2 && rated.aggregateRating?.ratingValue === 4.5)
    check("the community's page prints it only for an indexable community", /const jsonLd = communityJsonLd\(load\.data\.community, communityIndexable\(load\.community\)/.test(code("app/(marketing)/community/[slug]/page.tsx")))
  }

  /* ── Posts and events in an archived community ──────────────────────── */
  console.log("\nPosts and events")
  {
    const post = (status: string): PostFacts => ({
      community: { slug: "makers", name: "Makers", logo_url: null, visibility: "public", access: "free", status: status as never, platform_hidden: false, suspended_at: null, deleted_at: null },
      space: null,
      post: { id: "p0000000-0000-4000-8000-000000000001", title: "Kiln day", bodyText: "We fired the kiln.", media: [], status: "published", deletedAt: null, createdAt: "2026-10-01T10:00:00Z", editedAt: null, commentCount: 0 },
      author: { name: "Ana", username: "ana", avatarUrl: null },
    })
    check("a public post in a published community: indexed, with its Article", indexablePost(post("published")) && (postMetadata(post("published")).robots as Any).index === true && postArticleJsonLd(post("published")) !== null)
    check("in an archived one: still readable by its link, but noindex, no Article, and the generic preview (never its words)", publicPost(post("archived")) && !indexablePost(post("archived")) && (postMetadata(post("archived")).robots as Any).index === false && postArticleJsonLd(post("archived")) === null && postMetadata(post("archived")).title === "A post in Makers" && !JSON.stringify(postMetadata(post("archived"))).includes("Kiln day"))
    const event = (status: string): EventFacts => ({
      community: { slug: "makers", name: "Makers", logo_url: null, visibility: "public", access: "free", status: status as never, platform_hidden: false, suspended_at: null, deleted_at: null },
      event: { id: "e1", title: "Open studio", description: null, coverUrl: null, startsAt: "2026-11-01T10:00:00Z", timezone: "UTC", location: null, status: "scheduled", access: null, updatedAt: null },
    })
    check("an event in an archived community says noindex too", indexableEvent(event("published")) && !indexableEvent(event("archived")) && (eventMetadata(event("archived")).robots as Any).index === false)
  }

  /* ── The sitemap ─────────────────────────────────────────────────────── */
  console.log("\nSitemap")
  {
    const r = (slug: string, o: Record<string, unknown> = {}) => ({ id: `c0000000-0000-4000-8000-${String(slug.length).padStart(6, "0")}${slug.slice(0, 6).padEnd(6, "0").replace(/[^0-9a-f]/g, "0")}`, creator_id: CREATOR, slug, updated_at: "2026-10-01T10:00:00Z", cover_url: null, status: "published", visibility: "public", access: "free", platform_hidden: false, deleted_at: null, suspended_at: null, ...o })
    const rows = [
      r("open"),
      r("paid", { access: "paid" }),
      r("private", { visibility: "private" }),
      r("unlisted", { visibility: "unlisted" }),
      r("inviteonly", { access: "invite_only" }),
      r("draft", { status: "draft" }),
      r("archived", { status: "archived" }),
      r("suspended", { suspended_at: "2026-10-01T00:00:00Z" }),
      r("deleted", { deleted_at: "2026-10-01T00:00:00Z" }),
      r("hidden", { platform_hidden: true }),
      r("ondomain"),
      r("strangerdomain"),
      r("deleting"),
    ]
    const ids = new Set(rows.map((x) => x.id))
    check("(fixture ids are distinct)", ids.size === rows.length)
    const onDomain = rows.find((x) => x.slug === "ondomain")!
    const stranger = rows.find((x) => x.slug === "strangerdomain")!
    const db = fakeDb({
      communities: rows,
      /* Waiting to be deleted while still published (whatever W1's flow does with the status): left out. */
      community_deletions: [{ community_id: rows.find((x) => x.slug === "deleting")!.id, state: "scheduled" }, { community_id: rows.find((x) => x.slug === "open")!.id, state: "undone" }],
      custom_domains: [
        { domain: "club.example.com", purpose: "community", target_type: "community", target_id: onDomain.id, creator_id: CREATOR, status: "active" },
        /* Somebody else's domain pointed at a community they do not own is never served, so that community stays at storelib.com. */
        { domain: "other.example.com", purpose: "community", target_type: "community", target_id: stranger.id, creator_id: "e0000000-0000-4000-8000-0000000000ff", status: "active" },
      ],
    })
    const listed = (await sitemapCommunities(0, 100, db as never)).map((x) => x.slug).sort()
    check("only published, public, open, not hidden, suspended or deleted; not invite only; not waiting to be deleted; not on its own domain", JSON.stringify(listed) === JSON.stringify(["open", "paid", "strangerdomain"]), listed)
    const noDomains = fakeDb({ communities: rows }, { failWith: { custom_domains: { code: "42P01", message: "missing" }, community_deletions: { code: "42P01", message: "missing" } } })
    check("before parts 185 and 202 (no domains or deletions table) nothing fails", (await sitemapCommunities(0, 100, noDomains as never)).length === 5)
    const pub = code("lib/communities/server/public.ts")
    check("the count asks the same question", /select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("status", "published"\)\s*\.eq\("visibility", "public"\)\s*\.neq\("access", "invite_only"\)\s*\.eq\("platform_hidden", false\)\s*\.is\("deleted_at", null\)\s*\.is\("suspended_at", null\)/.test(pub))
    const site = communitySitemap("club.example.com")
    check("a community's domain lists its root only (About names the root as canonical)", /<loc>https:\/\/club\.example\.com\/<\/loc>/.test(site) && !/\/about/.test(site))
  }

  /* ── Pages, robots, slugs, freshness ─────────────────────────────────── */
  console.log("\nPages")
  {
    const page = code("app/(marketing)/community/[slug]/page.tsx")
    const about = code("app/(marketing)/community/[slug]/about/page.tsx")
    check("the page and About: the short description in their metadata, read per request", [page, about].every((s) => /summary: await communitySummary\(community\.id\)/.test(s) && /await connection\(\)/.test(s)))
    check("and a community waiting to be deleted is never previewed, whatever its status", [page, about].every((s) => /const deleting = await communityDeleting\(community\.id\)/.test(s) && /\.\.\.\(deleting \? \{ indexable: false \} : \{\}\)/.test(s)))
    const joinPage = code("app/(marketing)/community/[slug]/join/page.tsx")
    check("an invite's preview: never for an archived, deleting or hidden community", /if \(typeof invite === "string" && invite && \(community\.status === "archived" \|\| community\.platform_hidden \|\| deleting\)\) return plainJoin/.test(joinPage))
    check("the post and event pictures follow the same rule as their metadata", /if \(indexablePost\(facts\)\)/.test(code("app/(marketing)/community/[slug]/(member)/post/[postId]/share.png/route.tsx")) && /const open = indexableEvent\(facts\)/.test(code("app/(marketing)/community/[slug]/(member)/events/[eventId]/share.png/route.tsx")))
    check("a draft or a suspended community says nothing (noindex only)", [page, about].every((s) => /if \(!community \|\| !sharePreviewable\(community\)\) return \{ robots: \{ index: false, follow: false \} \}/.test(s)))
    const layout = code("app/(marketing)/community/[slug]/layout.tsx")
    check("every page inside a community: noindex from the layout; its tab icon is the community's", /const robots = \{ index: false, follow: false \}/.test(layout) && /icons: \{ icon: \[\{ url: icon/.test(layout))
    check("an old slug answers with a 308 to the current one, path and query kept", /permanentRedirect\(movedCommunityPath\(slug, page\.community\.slug/.test(layout))
    check("a suspended community draws no bar, name or title for anybody but its owner, signed out included", /if \(!communityOpen\(community\) && !viewer\?\.isOwner\) return false/.test(layout))
    check("nothing here, or a draft or suspended community this viewer may not see: a real 404 from the layout, before anything streams", /if \(page\.state === "off" \|\| page\.state === "missing" \|\| \(page\.community && page\.state !== "closed" && page\.state !== "unknown" && !barVisible\(page\)\)\) notFound\(\)/.test(layout) && layout.indexOf("notFound()") < layout.indexOf("const tracking = storeTracking(page)"))
    const join = code("app/(marketing)/community/[slug]/join/page.tsx")
    check("an invite landing never shows a draft or a suspended community's name or picture", /if \(page\.state === "member"\) redirect\(`\/community\/\$\{c\.slug\}`\)\s*if \(!sharePreviewable\(c\)\) notFound\(\)/.test(join))
    const member = code("app/(marketing)/community/[slug]/(member)/layout.tsx")
    check("the member area's pages say noindex (a public post owns its own)", /return \{ robots: \{ index: false, follow: false \} \}/.test(member))
  }

  /* ── Member links: the shape a member sees ───────────────────────────── */
  console.log("\nMember links, as shown")
  {
    const views = memberLinkViews(LINKS)
    check("hidden and unsafe links are gone, four at most, in order", JSON.stringify(views.map((v) => v.id)) === JSON.stringify(["lk_shop", "lk_course", "lk_home", "lk_five"]) && views.length === MEMBER_LINKS_SHOWN, views)
    check("labels are trimmed", views[0].label === "The shop")
    check("another site opens in a new tab, as it was given", views[0].external && views[0].href === "https://shop.example.com/a?x=1")
    check("a path stays here, so its own page decides who may see it", !views[1].external && views[1].href === "/ana/course-one")
    check("a storelib.com address becomes its path, here", !views[2].external && views[2].href === "/ana?ref=c")
    const bad = ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "//evil.example.com", "/\\evil.example.com", "vbscript:x", "ftp://x.example.com", "https://user:pw@x.example.com", "https://x.example.com/a b", " ", 42, null]
    check("never javascript:, data:, //host, /\\host, other schemes, credentials or spaces", bad.every((u) => memberLinkTarget(u) === null), bad.map((u) => memberLinkTarget(u)))
    check("not a list, or junk items: no links", memberLinkViews(null).length === 0 && memberLinkViews({}).length === 0 && memberLinkViews([null, 1, "x", { id: "bad id!", label: "x", url: "/x" }, { id: "ok", label: "", url: "/x" }]).length === 0)
    check("a duplicate id is drawn once", memberLinkViews([{ id: "a", label: "One", url: "/a" }, { id: "a", label: "Two", url: "/b" }]).length === 1)
    check("a long label is cut to 40 characters", memberLinkViews([{ id: "a", label: "x".repeat(60), url: "/a" }])[0].label.length === 40)
    check("an unknown icon name is kept only when it is a plain name", memberLinkViews([{ id: "a", label: "A", url: "/a", icon: "<svg>" }])[0].icon === null && memberLinkViews([{ id: "a", label: "A", url: "/a", icon: "globe" }])[0].icon === "globe")
    check("the press goes to the community's own route", memberLinkClickPath(C, "lk_shop") === `/api/community/${C}/links/lk_shop/click`)
  }

  /* ── Member links: who reads them ────────────────────────────────────── */
  console.log("\nMember links, who reads them")
  {
    const r = row()
    check("a visitor: no", !seesMemberLinks(r, null))
    check("signed in, not a member: no", !seesMemberLinks(r, viewer({ userId: STRANGER, role: null, active: false, status: null })))
    check("a request waiting: no", !seesMemberLinks(r, viewer({ active: false, status: "pending" as never, role: null })))
    check("banned: no", !seesMemberLinks(r, viewer({ active: false, banned: true, role: null })))
    check("an active member: yes", seesMemberLinks(r, viewer()))
    check("a draft: its staff only", !seesMemberLinks(row({ status: "draft" }), viewer()) && seesMemberLinks(row({ status: "draft" }), viewer({ userId: MOD, role: "moderator" })) && seesMemberLinks(row({ status: "draft" }), viewer({ userId: OWNER, role: "owner", isOwner: true })))
    check("suspended: its owner only", !seesMemberLinks(row({ suspended_at: "x" }), viewer()) && seesMemberLinks(row({ suspended_at: "x" }), viewer({ userId: OWNER, role: "owner", isOwner: true })))
    check("archived (read only): members still see them", seesMemberLinks(row({ status: "archived" }), viewer()))
    const db = fakeDb({ communities: [row()] })
    const before = db.log.length
    const none = await memberLinksForViewer(row(), viewer({ userId: STRANGER, role: null, active: false, status: null }), db as never)
    check("for anybody outside, the column is not even read", none.length === 0 && db.log.length === before)
    const mine = await memberLinksForViewer(row(), viewer(), db as never)
    check("for a member: the visible, safe ones", JSON.stringify(mine.map((l) => l.id)) === JSON.stringify(["lk_shop", "lk_course", "lk_home", "lk_five"]))
    check("before part 220 (no column): no links, nothing fails", (await memberLinksForViewer(row(), viewer(), fakeDb({ communities: [{ id: C }] }) as never)).length === 0)
  }

  /* ── Presses ─────────────────────────────────────────────────────────── */
  console.log("\nPresses")
  {
    const tables = () => ({ communities: [row()], community_member_link_clicks: [] as Any[] })
    const unique = { unique: { community_member_link_clicks: [["community_id", "link_id", "user_id", "day"]] } }
    const db = fakeDb(tables(), unique)
    const now = Date.parse("2026-10-17T12:00:00Z")
    const one = await recordMemberLinkClick(db as never, { community: row(), viewer: viewer(), linkId: "lk_shop", now })
    const two = await recordMemberLinkClick(db as never, { community: row(), viewer: viewer(), linkId: "lk_shop", now: now + 3_600_000 })
    const next = await recordMemberLinkClick(db as never, { community: row(), viewer: viewer(), linkId: "lk_shop", now: now + 86_400_000 })
    check("a press is counted once per member, link and day", one === "counted" && two === "repeat" && next === "counted" && db.tables.community_member_link_clicks.length === 2, [one, two, next])
    check("the day is the UTC date", clickDay(Date.parse("2026-10-17T23:59:59Z")) === "2026-10-17" && db.tables.community_member_link_clicks[0].day === "2026-10-17")
    check("a hidden link, an unsafe one or one not in the list is not counted", (await recordMemberLinkClick(db as never, { community: row(), viewer: viewer(), linkId: "lk_hidden", now })) === "unknown_link" && (await recordMemberLinkClick(db as never, { community: row(), viewer: viewer(), linkId: "lk_js", now })) === "unknown_link" && (await recordMemberLinkClick(db as never, { community: row(), viewer: viewer(), linkId: "nope", now })) === "unknown_link" && db.tables.community_member_link_clicks.length === 2)
    check("the owner trying their own links is not counted", (await recordMemberLinkClick(db as never, { community: row(), viewer: viewer({ userId: OWNER, role: "owner", isOwner: true }), linkId: "lk_shop", now })) === "skipped" && db.tables.community_member_link_clicks.length === 2)
    await recordMemberLinkClick(db as never, { community: row(), viewer: viewer({ userId: MOD, role: "moderator" }), linkId: "lk_course", now })
    const counts = await memberLinkClicks(C, { db: db as never })
    check("memberLinkClicks: every link in the list (hidden ones too), 0 for none", counts.lk_shop === 2 && counts.lk_course === 1 && counts.lk_hidden === 0 && counts.lk_home === 0, counts)
    const since = await memberLinkClicks(C, { db: db as never, linkIds: ["lk_shop"], sinceDays: 0, now: now + 86_400_000 })
    check("and since a day, when asked", since.lk_shop === 1, since)
    const before = fakeDb(tables(), { failWith: { community_member_link_clicks: { code: "42P01", message: "missing" } }, failInsert: { community_member_link_clicks: { code: "42P01", message: "missing" } } })
    check("before part 221: the press is not counted, nothing fails, the counts are 0", (await recordMemberLinkClick(before as never, { community: row(), viewer: viewer(), linkId: "lk_shop", now })) === "unavailable" && (await memberLinkClicks(C, { db: before as never })).lk_shop === 0)

    const route = code("app/api/community/[communityId]/links/[linkId]/click/route.ts")
    check("the route: switch, same origin, a valid id, signed in, rate limited, then the member check", route.indexOf("requireCommunitiesOn()") < route.indexOf("sec-fetch-site") && /site !== "same-origin"/.test(route) && /MEMBER_LINK_ID\.test\(linkId\)/.test(route) && /if \(!userId\) return NextResponse\.json\(\{ error: "Sign in first\." \}, \{ status: 401/.test(route) && route.indexOf("rateLimit(") < route.indexOf("loadCommunity(") && /bucket: "community-link-click"/.test(route) && /if \(!seesMemberLinks\(community, viewer\)\) return NextResponse\.json\(\{ error: "not_found" \}, \{ status: 404/.test(route))
    check("the answer says nothing about the list", !/label|href|url/.test(route.slice(route.indexOf("const outcome"))))
    const ui = code("components/community/member/member-links.tsx")
    check("the press is a beacon (keepalive fetch otherwise), never awaited", /navigator\.sendBeacon\(url/.test(ui) && /keepalive: true/.test(ui) && !/await fetch/.test(ui))
    check("another site: a new tab, noopener noreferrer; a path: a link here", /target="_blank" rel="noopener noreferrer"/.test(ui) && /<Link href=\{l\.href\}/.test(ui))
  }

  /* ── Never in public ─────────────────────────────────────────────────── */
  console.log("\nNever in public")
  {
    check("not in the columns any page reads, nor in a visitor's grant", !/member_links/.test(COMMUNITY_COLUMNS) && !/member_links/.test(PUBLIC_COMMUNITY_COLUMNS))
    /* The fake database answers every column it has, as if a careless select("*") had read it: the page's data still never carries the links. */
    const world = fakeDb({
      communities: [row()],
      community_tiers: [{ id: "t1", community_id: C, name: "Members", kind: "free", billing: null, product_id: null, position: 0, is_default: true, archived_at: null, benefits: [] }],
      community_access_products: [],
      community_members: [{ id: "m-owner", community_id: C, user_id: OWNER, role: "owner", source: "owner", status: "active", tier_id: null, banned_at: null }],
      products: [],
      membership_plans: [],
      creators: [{ id: CREATOR, user_id: OWNER, slug: "ana", display_name: "Ana", avatar_url: null, onboarding_completed: true }],
      profiles: [{ id: OWNER, username: "ana", display_name: "Ana Maker", avatar_url: null }],
      reviews: [],
      community_gallery: [],
      community_presence: [],
    })
    const secrets = ["member_links", "memberLinks", "shop.example.com", "Start the course", "/ana/course-one", "hidden.example.com", "Secret drafts", "lk_shop"]
    for (const who of [null, STRANGER, MEMBER]) {
      const page = await loadSalesPage("makers", who, world as never)
      const json = JSON.stringify(page?.data ?? null)
      check(`the sales page's data (${who === null ? "signed out" : who === STRANGER ? "not a member" : "a member"}) carries no member link`, !!page && secrets.every((s) => !json.includes(s)), secrets.filter((s) => json.includes(s)))
    }
    const facts = seoFacts(row())
    const meta = JSON.stringify([facts, communityMetadata(facts), inviteMetadata(facts)])
    check("nor its metadata, its invite preview", secrets.every((s) => !meta.includes(s)))
    const shared = JSON.stringify(await sitemapCommunities(0, 10, world as never))
    check("nor the sitemap", secrets.every((s) => !shared.includes(s)))
    /* Only the member area's server read and the editor's own paths may name the column. */
    const allowed = [/^lib\/communities\/server\/member-shortcuts\.ts$/, /^lib\/communities\/member-links\.ts$/, /^lib\/communities\/server\/creator[\w-]*\.ts$/, /^lib\/communities\/server\/page-editor[\w-]*\.ts$/, /^components\/community\/creator\//, /^app\/app\//, /^app\/api\/app\//, /^lib\/communities\/(view-types|types)\.ts$/, /^components\/community\/creator\/view-types\.ts$/]
    const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [] }) : [])
    const naming = ["app", "components", "lib"].flatMap(walk).filter((p) => /member_links/.test(code(p)))
    const stray = naming.filter((p) => !allowed.some((re) => re.test(p)))
    check("no public page, public API or shared read names member_links (only the member area's server read and the editor)", stray.length === 0, stray)
    const shell = code("components/community/member/shell.tsx")
    check("the member frame reads them; the visitor's frame never does", /memberLinksForViewer\(community, viewer\)/.test(shell.slice(shell.indexOf("async function CommunityShellAsync"), shell.indexOf("async function CommunityPublicShellAsync"))) && !/memberLinks/i.test(shell.slice(shell.indexOf("async function CommunityPublicShellAsync"))))
    check("the member frame's shell is drawn for an active member only (the layout)", /if \(page\.state === "member" && page\.community && page\.viewer\) \{\s*return \(\s*<CommunityShell/.test(code("app/(marketing)/community/[slug]/layout.tsx")))
    const frame = code("components/community/member/shell-frame.tsx")
    check("drawn under the card in the left column, and under the member's name in the account menu", /<WallCommunityCard[^>]*\/> : null\}[\s{}]*\{memberLinks\.length \? <MemberLinks communityId=\{community\.id\} links=\{memberLinks\} variant="column"/.test(frame) && /links \}/.test(frame.replace(/\s+/g, " ")))
    const menu = code("components/community/member/account-menu.tsx")
    check("the menu below 1024px (the column takes over from there), the phone's sheet always", /<div className="lg:hidden" data-account-member-links="">/.test(menu) && /variant="sheet" onPick=\{\(\) => setSheet\(false\)\}/.test(menu) && /under=\{desktopLinks\}/.test(menu) && /under=\{phoneLinks\}/.test(menu))
  }

  /* ── SQL part 221 ────────────────────────────────────────────────────── */
  console.log("\nSQL part 221")
  {
    const file = "221_community_member_link_clicks.sql"
    const part = raw(`supabase/sql/run-now/${file}`)
    const lines = part.trimEnd().split("\n")
    check("line 1 is the summary, safe to run again", /^\/\* .*\(round 26\), run after part 81\..*Safe to run again\. \*\/$/.test(lines[0]))
    check("one statement per line, notify last", lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("only adds", !/DROP TABLE|DROP COLUMN|DELETE FROM|^UPDATE |TRUNCATE/im.test(part) && !/CREATE TABLE public|CREATE INDEX (?!IF NOT EXISTS)/.test(part))
    const t = "community_member_link_clicks"
    check("server only: row security on, nothing for a browser, the service role writes", part.includes(`CREATE TABLE IF NOT EXISTS public.${t} (`) && part.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`) && part.includes(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`) && part.includes(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO service_role;`) && !/CREATE POLICY|GRANT [A-Z, ]+ TO (anon|authenticated)/i.test(part))
    check("one row per member, link and day; the link id checked", /PRIMARY KEY \(community_id, link_id, user_id, day\)/.test(part) && /CHECK \(link_id ~ '\^\[A-Za-z0-9_-\]\{1,40\}\$'\)/.test(part))
    check("it does not touch part 220's columns", !/member_links|summary/.test(part.split("\n").slice(1).join("\n")))
    check("the migration copy is the part, byte for byte", raw("supabase/migrations/20270130_community_member_link_clicks.sql") === part)
    check("its README row and its check after column", raw("supabase/sql/run-now/README.md").includes(`| \`${file}\` |`) && /as p221_community_member_link_clicks[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
    check("in the built files and the parts record", raw("supabase/sql/run-four/3_of_4_latest.sql").includes(`-- part ${file}`) && raw("lib/admin/sql-parts.generated.ts").includes(`part: "221", file: "${file}"`))
    check("the harness writes a press twice and expects one row", /part 221: a second press the same day made a second row/.test(raw("scripts/sql-harness/app-writes.sql")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
