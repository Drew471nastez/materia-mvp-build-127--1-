/**
 * ===========================================================================
 *  ROUND 15 (R): A PERSON'S PROFILE INSIDE A COMMUNITY, AND THE WAY BACK
 * ===========================================================================
 *   THE LOADER        loadMemberProfile(db, community, viewer, ref): its shape
 *                     for somebody else (their posts here, only from spaces
 *                     the viewer may read) and for "me" (my posts in every
 *                     community I am in, each with its community, and my
 *                     recent activity); nobody who is not a member here.
 *   KEYSET PAGING     my posts across communities: one query on the author,
 *                     newest first, a page of PROFILE_POSTS_PAGE and a cursor,
 *                     pages that never overlap and end with no cursor; what I
 *                     may not see now (a space I lost, a community I left or
 *                     that was suspended, chat, deleted) never in it.
 *   MY OWN POSTS      Edit and Delete only where the post routes would allow
 *                     them (ownPostRights).
 *   THE WAY BACK      a full page opened from a community profile carries
 *                     the place to go back to, and only a community address
 *                     of ours is taken; the arrow goes back in history when a
 *                     page of ours is behind and straight to that place when
 *                     not; the top bar stays at the top, under the clock.
 *   FOLLOW            the two states at one fixed size, the follow quick and
 *                     the unfollow calm, opacity only.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { fakeDb } from "./_fake-db"
import { loadMemberProfile, memberProfilePostsPage, myPostsPage, resolveProfileRef } from "@/lib/communities/server/member-profile"
import { PROFILE_POSTS_PAGE, activityVerb, fullPageHref, ownPostRights, postEditHref, profileRefOf } from "@/lib/communities/member-profile-view"
import { communityBackTarget } from "@/lib/profile/back"
import { memberHref } from "@/components/community/member/person-href"
import { FollowButton } from "@/components/profile/follow-button"
import { arrivesFromCommunity } from "@/components/profile/profile-arrival"
import { placeFromUrl } from "@/lib/communities/client/places"
import type { Viewer } from "@/lib/communities/server/context"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ── Fixture ──────────────────────────────────────────────────────────── */

const ME = "11111111-1111-4111-8111-111111111111"
const SAM = "22222222-2222-4222-8222-222222222222"
const STRANGER = "33333333-3333-4333-8333-333333333333"
const C1 = "c1c1c1c1-0000-4000-8000-000000000001"
const C2 = "c2c2c2c2-0000-4000-8000-000000000002"
const C3 = "c3c3c3c3-0000-4000-8000-000000000003"
const C4 = "c4c4c4c4-0000-4000-8000-000000000004"
const C5 = "c5c5c5c5-0000-4000-8000-000000000005"
const S_GENERAL = "a0000000-0000-4000-8000-000000000001"
const S_VIP = "a0000000-0000-4000-8000-000000000002"
const S_CHAT = "a0000000-0000-4000-8000-000000000003"
const S_OLD = "a0000000-0000-4000-8000-000000000004"
const S2_GENERAL = "a0000000-0000-4000-8000-000000000011"
const S2_PAID = "a0000000-0000-4000-8000-000000000012"
const TIER = "b0000000-0000-4000-8000-000000000001"

const pid = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const at = (minutesAgo: number) => new Date(Date.UTC(2026, 9, 10, 12, 0, 0) - minutesAgo * 60_000).toISOString()

function community(id: string, slug: string, extra: Record<string, unknown> = {}) {
  return { id, slug, name: slug.toUpperCase(), logo_url: null, status: "published", archived_at: null, suspended_at: null, deleted_at: null, owner_user_id: null, creator_id: null, events_enabled: true, chat_enabled: true, ...extra }
}
function member(communityId: string, userId: string, extra: Record<string, unknown> = {}) {
  return { community_id: communityId, user_id: userId, status: "active", role: "member", tier_id: null, level: 1, joined_at: at(60 * 24 * 30), muted_until: null, banned_at: null, last_active_at: at(5), ...extra }
}
function post(n: number, communityId: string, author: string, minutesAgo: number, extra: Record<string, unknown> = {}) {
  return {
    id: pid(n),
    community_id: communityId,
    space_id: null,
    author_id: author,
    kind: "post",
    title: `Post ${n}`,
    body: "",
    body_text: `Words of post ${n}`,
    media: [],
    pinned: false,
    featured: false,
    locked: false,
    status: "published",
    removed_by: null,
    removed_reason: null,
    removed_at: null,
    edited_at: null,
    reaction_count: n % 3,
    comment_count: n % 2,
    last_activity_at: at(minutesAgo),
    created_at: at(minutesAgo),
    updated_at: at(minutesAgo),
    deleted_at: null,
    ...extra,
  }
}

function viewerIn(communityId: string, userId: string, extra: Partial<Viewer> = {}): Viewer {
  return {
    userId,
    member: { ...(member(communityId, userId) as Record<string, unknown>), id: "m", source: "free" } as never,
    role: "member",
    active: true,
    status: "active",
    tierId: null,
    ownedProductIds: [],
    level: 1,
    points: 0,
    isOwner: false,
    isCreatorAccount: false,
    banned: false,
    mutedUntil: null,
    ...extra,
  }
}

function world() {
  /* The fake keeps rows in the order written and ignores order(): written newest first, as the index would read them. */
  const posts = [
    post(1, C1, SAM, 1),
    post(2, C1, SAM, 2, { space_id: S_VIP }),
    post(3, C1, SAM, 3, { space_id: S_CHAT }),
    post(4, C1, SAM, 4, { status: "deleted", deleted_at: at(1) }),
    post(5, C1, SAM, 5, { space_id: S_GENERAL }),
    post(6, C2, SAM, 6),
    post(7, C1, SAM, 7, { space_id: S_OLD }),
    /* Mine. */
    post(20, C1, ME, 10, { space_id: S_GENERAL }),
    post(21, C2, ME, 11, { space_id: S2_GENERAL }),
    post(22, C2, ME, 12, { space_id: S2_PAID }),
    post(23, C3, ME, 13),
    post(24, C4, ME, 14),
    post(25, C5, ME, 15),
    post(26, C1, ME, 16, { status: "deleted", deleted_at: at(1) }),
    post(27, C1, ME, 17, { space_id: S_CHAT }),
    post(28, C1, SAM, 18),
  ]
  return {
    profiles: [
      { id: ME, username: "me_person", display_name: "Mia Lopez", avatar_url: null, bio: "", cover_url: null, location_city: null, location_country: null },
      { id: SAM, username: "Sam.K", display_name: "Sam Kerr", avatar_url: "https://x.supabase.co/a.png", bio: "Potter.", cover_url: "https://x.supabase.co/cover.jpg#crop=40,60,1.2", location_city: "Lisbon", location_country: "PT" },
      { id: STRANGER, username: "stranger", display_name: "Nobody Here", avatar_url: null, bio: null, cover_url: null },
    ],
    communities: [community(C1, "clay"), community(C2, "glaze"), community(C3, "left-it"), community(C4, "closed", { suspended_at: at(100) }), community(C5, "kept", { status: "archived", archived_at: at(100) })],
    community_members: [
      member(C1, ME),
      member(C1, SAM, { role: "admin", level: 4 }),
      member(C2, ME, { muted_until: new Date(Date.now() + 3_600_000).toISOString() }),
      member(C2, SAM),
      member(C3, ME, { status: "left" }),
      member(C4, ME),
      member(C5, ME),
    ],
    community_spaces: [
      { id: S_GENERAL, community_id: C1, name: "General", kind: "feed", view_access: {}, archived_at: null, slug: "general", position: 0, created_at: at(999) },
      { id: S_VIP, community_id: C1, name: "VIP", kind: "feed", view_access: { tierIds: [TIER] }, archived_at: null, slug: "vip", position: 1, created_at: at(999) },
      { id: S_CHAT, community_id: C1, name: "Chat", kind: "chat", view_access: {}, archived_at: null, slug: "chat", position: 2, created_at: at(999) },
      { id: S_OLD, community_id: C1, name: "Old", kind: "feed", view_access: {}, archived_at: at(50), slug: "old", position: 3, created_at: at(999) },
      { id: S2_GENERAL, community_id: C2, name: "Lobby", kind: "feed", view_access: {}, archived_at: null, slug: "lobby", position: 0, created_at: at(999) },
      { id: S2_PAID, community_id: C2, name: "Paid", kind: "feed", view_access: { tierIds: [TIER] }, archived_at: null, slug: "paid", position: 1, created_at: at(999) },
    ],
    community_feed_posts: posts,
    community_feed_comments: [
      { id: "e0000000-0000-4000-8000-000000000001", post_id: pid(1), status: "published" },
      { id: "e0000000-0000-4000-8000-000000000002", post_id: pid(2), status: "published" },
    ],
    community_events: [{ id: "f0000000-0000-4000-8000-000000000001", title: "Kiln night", status: "scheduled" }],
    community_activity: [
      { id: 9, community_id: C1, user_id: ME, kind: "comment", target_id: "e0000000-0000-4000-8000-000000000001", created_at: at(1) },
      { id: 8, community_id: C1, user_id: ME, kind: "comment", target_id: "e0000000-0000-4000-8000-000000000002", created_at: at(2) },
      { id: 7, community_id: C2, user_id: ME, kind: "rsvp", target_id: "f0000000-0000-4000-8000-000000000001", created_at: at(3) },
      { id: 6, community_id: C1, user_id: ME, kind: "level_up", target_id: "3", created_at: at(4) },
      { id: 5, community_id: C3, user_id: ME, kind: "joined", target_id: null, created_at: at(5) },
      { id: 4, community_id: C2, user_id: ME, kind: "joined", target_id: null, created_at: at(6) },
      { id: 3, community_id: C1, user_id: SAM, kind: "joined", target_id: null, created_at: at(7) },
    ],
    follows: [{ id: "x1", follower_id: ME, following_id: SAM }],
    creators: [],
    username_history: [{ old_username: "samold", new_username: "sam.k", changed_at: at(1000) }],
  }
}

const C1_ROW = community(C1, "clay") as never

async function main() {
  console.log("\nThe profile reference")
  {
    check("me, a handle (lower case, no @) and an old member id are references; anything else is not", profileRefOf("me") === "me" && profileRefOf("@Sam.K") === "sam.k" && profileRefOf(SAM) === SAM && profileRefOf("../x") === null && profileRefOf("") === null && profileRefOf(42) === null)
    const db = fakeDb(world())
    const sam = await resolveProfileRef(db, { userId: ME }, "sam.k")
    const renamed = await resolveProfileRef(db, { userId: ME }, "samold")
    const me = await resolveProfileRef(db, { userId: ME }, "me")
    check("a handle finds them whatever its case, an old handle follows the rename, me is the viewer", sam?.id === SAM && renamed?.id === SAM && me?.id === ME)
    check("the shell reads ?profile= and the old /members/<id> as the same place", JSON.stringify(placeFromUrl("/community/clay", "?profile=sam.k")) === JSON.stringify({ kind: "profile", ref: "sam.k" }) && placeFromUrl("/community/clay/members/abc", "")?.kind === "profile")
    check("a name inside a community opens that place", memberHref("clay", { id: SAM, username: "Sam.K" }) === "/community/clay?profile=sam.k" && memberHref("clay", { id: SAM, username: null }) === `/community/clay/members/${SAM}`)
  }

  console.log("\nSomebody else's profile, inside the community")
  {
    const db = fakeDb(world())
    const data = await loadMemberProfile(db, C1_ROW, viewerIn(C1, ME), "sam.k", 1234)
    check("their profile, read for this community", !!data && data.self === false && data.scope === "community" && data.activity === null && data.now === 1234)
    check("  the head: name, handle, role here, level, where they are from, bio, cover with its crop", data?.person.name === "Sam Kerr" && data?.person.username === "Sam.K" && data?.person.role === "admin" && data?.person.level === 4 && data?.person.location === "Lisbon, Portugal" && data?.person.bio === "Potter." && data?.person.coverUrl === "https://x.supabase.co/cover.jpg" && data?.person.coverCrop.x === 40 && data?.person.coverCrop.y === 60, data?.person)
    check("  the counts and whether I follow them; their full page by Storelib's rule", data?.person.followers === 1 && data?.viewerFollowing === true && data?.person.pageHref === "/@sam.k" && data?.person.hasStorefront === false)
    const ids = data?.posts.posts.map((p) => p.id) ?? []
    check("  their posts HERE that I may read: the open space and no space; not VIP, chat, archived, deleted or another community", JSON.stringify(ids) === JSON.stringify([pid(1), pid(5), pid(28)]), ids)
    check("  each says its community and space, and none of theirs is mine to edit", data?.posts.posts.every((p) => p.community.slug === "clay" && !p.canEdit && !p.canDelete) === true && data?.posts.posts[1].space === "General")
    const json = JSON.parse(JSON.stringify(data))
    check("  plain data the place route can send as JSON", JSON.stringify(json) === JSON.stringify(data))
    check("somebody who is not a member here is nobody", (await loadMemberProfile(fakeDb(world()), C1_ROW, viewerIn(C1, ME), "stranger")) === null)
    check("nor is anybody, to a viewer who is not an active member", (await loadMemberProfile(fakeDb(world()), C1_ROW, viewerIn(C1, ME, { active: false }), "sam.k")) === null)
    const vip = await loadMemberProfile(fakeDb(world()), C1_ROW, viewerIn(C1, ME, { tierId: TIER }), "sam.k")
    check("a viewer on the VIP tier reads their VIP post too", vip?.posts.posts.some((p) => p.id === pid(2)) === true)
  }

  console.log("\nMy own profile: my posts in every community, and my activity")
  {
    const db = fakeDb(world())
    const data = await loadMemberProfile(db, C1_ROW, viewerIn(C1, ME), "me")
    check("my profile, read across communities, with activity", !!data && data.self && data.scope === "all" && Array.isArray(data.activity) && data.viewerFollowing === false)
    const ids = data?.posts.posts.map((p) => p.id) ?? []
    check("  my posts I may see now, newest first, each with its community: here, the other one, and the archived one", JSON.stringify(ids) === JSON.stringify([pid(20), pid(21), pid(25)]), ids)
    check("  not a space whose tier I lack, a community I left or that is suspended, chat, or deleted", ![pid(22), pid(23), pid(24), pid(26), pid(27)].some((x) => ids.includes(x)))
    const by = new Map((data?.posts.posts ?? []).map((p) => [p.id, p]))
    check("  each row names its community", by.get(pid(21))?.community.slug === "glaze" && by.get(pid(20))?.community.slug === "clay" && by.get(pid(20))?.space === "General")
    check("  edit and delete where I may: here both; muted in glaze only delete; archived kept only delete", by.get(pid(20))?.canEdit === true && by.get(pid(20))?.canDelete === true && by.get(pid(21))?.canEdit === false && by.get(pid(21))?.canDelete === true && by.get(pid(25))?.canEdit === false && by.get(pid(25))?.canDelete === true)
    const acts = data?.activity ?? []
    check("  activity: a comment names the post only when I may read it; the VIP one is left out", acts[0]?.kind === "comment" && acts[0]?.title === "Post 1" && acts[0]?.href === `/community/clay/post/${pid(1)}` && !acts.some((a) => a.title === "Post 2"), acts)
    check("  an event I am going to, a level, joining; nothing from a community I left, nothing of somebody else's", acts.some((a) => a.kind === "rsvp" && a.title === "Kiln night") && acts.some((a) => a.kind === "level_up" && a.level === 3) && acts.some((a) => a.kind === "joined" && a.community.slug === "glaze") && !acts.some((a) => a.community.slug === "left-it") && acts.length === 4, acts.map((a) => a.kind))
    check("  the activity lines read as Storelib writes them", activityVerb("comment") === "Commented on" && activityVerb("level_up", 3) === "Reached level 3 in" && activityVerb("rsvp") === "Going to")
    const reads = db.log.filter((l) => l.table === "community_feed_posts" && l.op === "select")
    const lists = reads.filter((r) => r.filters.some(([k, c]) => k === "eq" && c === "author_id"))
    /* The only other read of posts is the activity's: by the ids its comments name, never a scan. */
    check("  one read of my posts, on the author; every other read of posts is by id", lists.length === 1 && lists[0].filters.some(([k, c, v]) => k === "eq" && c === "author_id" && v === ME) && lists[0].filters.some(([k, c]) => k === "in" && c === "community_id") && reads.filter((r) => !lists.includes(r)).every((r) => r.filters.some(([k, c]) => k === "in" && c === "id")))
  }

  console.log("\nKeyset paging across communities")
  {
    const w = world()
    const many = Array.from({ length: 19 }, (_, i) => post(100 + i, i % 2 ? C2 : C1, ME, 20 + i, { space_id: i % 2 ? S2_GENERAL : null }))
    w.community_feed_posts = [...w.community_feed_posts.filter((p) => p.author_id !== ME), ...many]
    const db = fakeDb(w)
    const p1 = await myPostsPage(db, ME, null)
    const p2 = await myPostsPage(db, ME, p1.next)
    const p3 = await myPostsPage(db, ME, p2.next)
    const all = [...p1.posts, ...p2.posts, ...p3.posts].map((p) => p.id)
    check(`pages of ${PROFILE_POSTS_PAGE}, then the rest, then no cursor`, p1.posts.length === PROFILE_POSTS_PAGE && p2.posts.length === PROFILE_POSTS_PAGE && p3.posts.length === 3 && !!p1.next && !!p2.next && p3.next === null, [p1.posts.length, p2.posts.length, p3.posts.length, p3.next])
    check("  no post twice, none missed, newest first", new Set(all).size === 19 && JSON.stringify(all) === JSON.stringify(many.map((p) => p.id)))
    const reads = db.log.filter((l) => l.table === "community_feed_posts")
    check("  each page is one query of PROFILE_POSTS_PAGE + 1 on the author, the cursor in the filter", reads.length === 3 && reads.every((r) => r.filters.some(([k, c]) => k === "eq" && c === "author_id")) && reads.slice(1).every((r) => r.filters.some(([k, , v]) => k === "or" && /created_at\.lt\./.test(String(v)))))
    check("  a cursor that was tampered with starts from the top, never an error", (await myPostsPage(fakeDb(w), ME, "not-a-cursor")).posts.length === PROFILE_POSTS_PAGE)
    const theirs = await memberProfilePostsPage(fakeDb(world()), C1_ROW, viewerIn(C1, ME), "sam.k", null)
    check("the route's page for somebody else is their posts here", JSON.stringify(theirs?.posts.map((p) => p.id)) === JSON.stringify([pid(1), pid(5), pid(28)]))
    check("and nothing for somebody who is not here", (await memberProfilePostsPage(fakeDb(world()), C1_ROW, viewerIn(C1, ME), "stranger", null)) === null)
    const route = code("app/api/community/[communityId]/member-profile/route.ts")
    check("the route: the switch first, then the member gate, then the one loader", /requireCommunitiesOn\(\)[\s\S]*requireMember\(db, communityId, await sessionUserId\(\), "view"\)[\s\S]*memberProfilePostsPage\(/.test(route))
  }

  console.log("\nEdit and delete, my own posts only")
  {
    const open = { status: "published" }
    const me = { status: "active" }
    check("my post, a member: both", JSON.stringify(ownPostRights({ authorId: ME, viewerId: ME, member: me, community: open })) === JSON.stringify({ canEdit: true, canDelete: true }))
    check("somebody else's: neither", JSON.stringify(ownPostRights({ authorId: SAM, viewerId: ME, member: me, community: open })) === JSON.stringify({ canEdit: false, canDelete: false }))
    check("muted now: delete only; a mute that ended: both", ownPostRights({ authorId: ME, viewerId: ME, member: { ...me, muted_until: new Date(Date.now() + 60_000).toISOString() }, community: open }).canEdit === false && ownPostRights({ authorId: ME, viewerId: ME, member: { ...me, muted_until: new Date(Date.now() - 60_000).toISOString() }, community: open }).canEdit === true)
    check("archived community: delete only", JSON.stringify(ownPostRights({ authorId: ME, viewerId: ME, member: me, community: { status: "archived" } })) === JSON.stringify({ canEdit: false, canDelete: true }))
    check("left, banned, suspended or signed out: neither", [
      ownPostRights({ authorId: ME, viewerId: ME, member: { status: "left" }, community: open }),
      ownPostRights({ authorId: ME, viewerId: ME, member: { status: "active", banned_at: at(1) }, community: open }),
      ownPostRights({ authorId: ME, viewerId: ME, member: me, community: { status: "suspended" } }),
      ownPostRights({ authorId: ME, viewerId: null, member: me, community: open }),
    ].every((r) => !r.canEdit && !r.canDelete))
    check("Edit opens the post with its editor", postEditHref("/community/clay/post/x") === "/community/clay/post/x?edit=1" && postEditHref("/a?b=1") === "/a?b=1&edit=1")
    const view = code("components/community/member/member-profile.tsx")
    check("the list: Edit and Delete only where the row says so, Delete through the post route, the row folds only after a yes", /if \(post\.canEdit\) items\.push/.test(view) && /if \(post\.canDelete\) items\.push/.test(view) && /api\(`\$\{apiBase\(post\.community\.id\)\}\/posts\/\$\{post\.id\}`, \{ method: "DELETE" \}\)[\s\S]{0,200}if \(!r\.ok\)[\s\S]{0,120}return false[\s\S]{0,400}row\.animate/.test(view))
    check("a post of this community opens over it (openPost); another community's opens there", /if \(!sameCommunity[\s\S]{0,120}\) return[\s\S]{0,200}openPost\(post\.id, row\.current\)/.test(view))
  }

  console.log("\nThe way back from a full page")
  {
    const href = fullPageHref("/@sam.k", "clay", "sam.k")
    const back = new URLSearchParams(href.split("?")[1]).get("back")
    check("a full page opened from a community profile carries that place", href.startsWith("/@sam.k?") && new URLSearchParams(href.split("?")[1]).get("from") === "community" && back === "/community/clay?profile=sam.k")
    check("  and the page takes it as its way back", communityBackTarget(back) === "/community/clay?profile=sam.k")
    check("only a community address of ours: no other host, no other page, no tricks", [
      "https://evil.example/community/x",
      "//evil.example/community/x",
      "/explore",
      "/community/x/../../account",
      "/community/x?next=https://evil.example",
      "/community/x\\@evil",
      "javascript:alert(1)",
      "",
      null,
    ].every((v) => communityBackTarget(v) === null) && communityBackTarget("/community/clay") === "/community/clay" && communityBackTarget("/community/clay/members") === "/community/clay/members")
    const bar = code("components/profile/profile-top-bar.tsx")
    check("the arrow: history back when a page of ours is behind, straight to the fallback when not (goBackOr)", /goBackOr\(fallback, \(href\) => router\.push\(href\)\)/.test(bar) && !/backThen\(/.test(bar))
    check("the top bar stays at the top as the page scrolls, padded under the clock in the app", /native-top-surface sticky top-0 z-30/.test(bar))
    for (const f of ["app/(storelib)/(marketing)/u/[username]/page.tsx", "components/profile/member-profile-page.tsx"]) {
      check(`  ${f}: no wrapper that would make the bar stick to anything but the window`, !/className="min-h-screen overflow-x-hidden"\s*\n?\s*(\/\*[^]*?\*\/\s*)?(data-storefront-root|style=\{storefrontRootStyle)/.test(read(f)) && /overflow-x-clip/.test(read(f)))
    }
    const creator = code("app/(storelib)/(marketing)/u/[username]/page.tsx")
    const person = code("app/(storelib)/(marketing)/member/[username]/page.tsx")
    check("both full pages read ?back= through communityBackTarget and hand it to the bar", /communityBackTarget\(back\)/.test(creator) && /fallback=\{backTarget \?\? undefined\}/.test(creator) && /communityBackTarget\(back\)/.test(person) && /backTarget,/.test(person) && /fallback=\{extras\.backTarget \?\? undefined\}/.test(read("components/profile/member-profile-page.tsx")))
    /* Round 25: a creator page opened on its own has its newsletter bar again (the owner: "the top bars of the creator pages are missing"); from a community it is still the slim bar alone, so nothing sits above it under the clock (lib/storefront/subscribe-bar-visibility.ts). */
    check("from a community the subscribe bar stays off the page, so nothing sits above the bar under the clock", /showsSubscribeBar\(\{ creatorPage: true, fromCommunity: cameFromCommunity\(/.test(creator) && /\{newsletterBar && \(/.test(creator) && /\{!embedded && !newsletterBar \? \(/.test(creator))
    check("arriving from a community is a push; from elsewhere it is not", arrivesFromCommunity("/community/clay", "") && arrivesFromCommunity(null, "?from=community&back=x") && !arrivesFromCommunity("/explore", "") && !arrivesFromCommunity(null, ""))
    const arrival = code("components/profile/profile-arrival.tsx")
    check("  the push is translate and opacity only, and the cover is shown once decode() says it is whole", /translate: `\$\{ARRIVAL_SHIFT_PX\}px 0`/.test(arrival) && !new RegExp(["trans", "form"].join("")).test(arrival) && /img\.decode\(\)\.then\(show, show\)/.test(arrival) && /img\.complete && img\.naturalWidth > 0\) return/.test(arrival))
    check("  both full pages draw it", /<ProfileArrival \/>/.test(creator) && /<ProfileArrival \/>/.test(read("components/profile/member-profile-page.tsx")))
  }

  console.log("\nThe cover inside the community never flashes")
  {
    const cover = code("components/profile/decoded-cover.tsx")
    const view = code("components/community/member/member-profile.tsx")
    check("the band's shape is fixed before anything loads (taller since rounds 18 and 25, one shape since J1)", /<MemberCover url=\{person\.coverUrl\}/.test(view) && /aspect-\[2\/1\][^"]*sm:aspect-\[16\/5\]/.test(code("components/community/member/member-cover.tsx")))
    check("the picture goes in only once decoded, and a picture decoded before is there on the first frame with no fade", /img\.decode\(\)\.then\(ok, ok\)/.test(cover) && /DECODED\.has\(src\) \? "now" : null/.test(cover) && /if \(!shown\) return null/.test(cover) && /shown !== "fade"/.test(cover))
  }

  console.log("\nFollow and unfollow")
  {
    const following = renderToStaticMarkup(createElement(FollowButton, { following: true, onClick: () => {}, name: "Sam" }))
    const follow = renderToStaticMarkup(createElement(FollowButton, { following: false, onClick: () => {}, name: "Sam" }))
    const box = (html: string) => (/<button[^>]*class="([^"]*)"/.exec(html) ?? [])[1]
    check("two states, said to a screen reader", /aria-pressed="true"/.test(following) && /aria-label="Following Sam"/.test(following) && /aria-pressed="false"/.test(follow) && /aria-label="Follow Sam"/.test(follow))
    check("one fixed size in both: the same box classes, 40px tall, never a scale", box(following) === box(follow) && /h-10 min-w-\[128px\]/.test(box(follow) ?? "") && !/scale/.test(following + follow))
    const face = (html: string) => (/<span aria-hidden="true" class="([^"]*)" data-follow-fill="follow"/.exec(html) ?? [])[1] ?? ""
    check("following: the dark face leaves on the quick curve", /duration-\[260ms\]/.test(face(following)) && /opacity-0/.test(face(following)))
    check("unfollow: the dark face comes back calmly, slower and eased at both ends", /duration-\[380ms\]/.test(face(follow)) && /ease-\[cubic-bezier\(0\.45,0,0\.25,1\)\]/.test(face(follow)) && /opacity-100/.test(face(follow)))
    check("  and the labels cross on the same calm curve", /data-follow-label="follow"/.test(follow) && /<span class="[^"]*duration-\[380ms\][^"]*visible opacity-100" data-follow-label="follow"/.test(follow))
    check("  the light face stays under until the dark one is whole again", /delay-\[380ms\]/.test(follow))
  }

  console.log("\nHouse rules")
  {
    const mine = [
      "lib/communities/member-profile-view.ts",
      "lib/communities/server/member-profile.ts",
      "app/api/community/[communityId]/member-profile/route.ts",
      "components/community/member/member-profile.tsx",
      "components/community/member/person-href.ts",
      "components/profile/decoded-cover.tsx",
      "components/profile/profile-arrival.tsx",
      "components/profile/profile-top-bar.tsx",
      "components/profile/follow-button.tsx",
      "lib/profile/back.ts",
      "tests/communities-profiles15.test.ts",
    ]
    /* The words are put together here so this file is not one of them. */
    const words = [["un", "lock"], ["ele", "vate"], ["seam", "less"], ["power", "ful"], ["effort", "less"], ["super", "charge"], ["trans", "form"]].map((w) => w.join(""))
    const banned = new RegExp(`${String.fromCharCode(0x2014)}|${words.map((w) => `\\b${w}`).join("|")}`, "i")
    const offenders = mine.filter((f) => banned.test(read(f)))
    check("no em dash and none of the banned words", offenders.length === 0, offenders)
    const client = ["components/community/member/member-profile.tsx", "components/profile/decoded-cover.tsx", "components/profile/profile-arrival.tsx", "lib/communities/member-profile-view.ts", "components/community/member/person-href.ts"]
    check("the browser's parts import no server code", client.every((f) => !/server-only|next\/headers|lib\/communities\/server/.test(code(f))))
    check("the place exports the view the shell draws, with the contract's props", /export function MemberProfilePlace\(\{ community, viewer, profileRef, data \}: MemberProfilePlaceProps\)/.test(read("components/community/member/member-profile.tsx")))
    check("and the loader the contract names", /export async function loadMemberProfile\(db: Db, community: CommunityRow, viewer: Viewer, ref: string/.test(read("lib/communities/server/member-profile.ts")))
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
