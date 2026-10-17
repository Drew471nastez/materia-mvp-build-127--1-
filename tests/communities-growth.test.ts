/**
 * ===========================================================================
 *  COMMUNITIES ROUND 8: GROWTH
 * ===========================================================================
 *   INVITE             every member can share a community: Invite on the
 *                      card and at the end of the tabs opens one sheet (copy
 *                      link, the phone's share sheet, Email); what the link
 *                      does is said from the community's access; the owner
 *                      and admins also make the creator side's invites from
 *                      it, through a member route gated by can("invite").
 *   SHARED LINKS       /community/<slug>, its About and an invite link carry
 *                      Open Graph and Twitter tags with a picture drawn per
 *                      request (share.png, next/og, kept briefly); an invite
 *                      link says "You're invited" and never carries or reads
 *                      the invite; a draft or suspended community shows
 *                      nothing.
 *   OLD ADDRESSES      run-now part 94 keeps every old slug
 *                      (community_slug_history, written by a trigger),
 *                      loadCommunity follows one, and the community's layout
 *                      answers a 308 to the new address with the rest of the
 *                      path and the query; Settings refuses another
 *                      community's old address.
 *   ROLE BADGE         Owner, Admin, Moderator as small words with a glyph,
 *                      no pill, in the members list, search and the person
 *                      card (post cards, chat and messages are swapped by
 *                      their owner).
 *   NO STRAY MEMBERS   a library row of a plain member is "by <creator>"
 *                      alone.
 *   PHONE FRAME        the bar's name gets two lines on a phone.
 *
 * Run with:  npm run test:push
 */
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"

import { fakeDb } from "./_fake-db"
import { COMMUNITY_PATH_HEADER, movedCommunityPath } from "@/lib/communities/slug-move"
import { loadCommunity } from "@/lib/communities/server/context"
import { communityIdForOldSlug, slugHeldByAnother } from "@/lib/communities/server/slug-history"
import { communityMetadata, inviteMetadata, shareImageUrl, shareImageVersion, SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, type SeoFacts } from "@/components/community/public/seo"
import { clip, shareButtonLabel, shareLayout } from "@/components/community/public/share-card"
import { seoFacts, sharePreviewable } from "@/lib/communities/server/public"
import { standingOf } from "@/components/community/public/library-list"
import { communityShareUrl, shareLinkLine, splitShareUrl, staffInviteLine } from "@/components/community/member/invite-sheet"
import { SQL_PARTS } from "@/lib/admin/sql-parts.generated"
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
/* Code without its comments, so a check reads what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const A = "00000000-0000-4000-8000-0000000000a1"
const B = "00000000-0000-4000-8000-0000000000b2"
const community = (over: Record<string, unknown>) => ({ id: A, slug: "clay-studio", name: "Clay Studio", tagline: null, status: "published", deleted_at: null, suspended_at: null, ...over })

async function main() {
  /* ── Old addresses: the redirect's path ──────────────────────────────── */
  console.log("\nAn old address goes on to the new one")
  check("the rest of the path and the query are kept", movedCommunityPath("clay-club", "clay-studio", "/community/clay-club/post/123?c=9&x=1") === "/community/clay-studio/post/123?c=9&x=1")
  check("the community's home", movedCommunityPath("clay-club", "clay-studio", "/community/clay-club") === "/community/clay-studio" && movedCommunityPath("clay-club", "clay-studio", "/community/clay-club/") === "/community/clay-studio")
  check("About, the invite landing (with its invite), a space", movedCommunityPath("old", "new", "/community/old/about") === "/community/new/about" && movedCommunityPath("old", "new", "/community/old/join?invite=abc_DEF-123") === "/community/new/join?invite=abc_DEF-123" && movedCommunityPath("old", "new", "/community/old/space/general?sort=top") === "/community/new/space/general?sort=top")
  check("a differently cased address, the same way", movedCommunityPath("Clay-Studio", "clay-studio", "/community/Clay-Studio/members") === "/community/clay-studio/members")
  check("the framework's own _rsc key is dropped, the page's keys stay", movedCommunityPath("old", "new", "/community/old/saved?_rsc=1x2y&tab=a") === "/community/new/saved?tab=a")
  check("no header, or one naming another page: home, never elsewhere", movedCommunityPath("old", "new", null) === "/community/new" && movedCommunityPath("old", "new", "/community/someone-else/post/1") === "/community/new" && movedCommunityPath("old", "new", "https://evil.example/community/old") === "/community/new" && movedCommunityPath("old", "new", "/community/old//evil.example") === "/community/new")
  check("always a path on this site", ["/community/old/x", "/community/old?next=//evil", null, "//evil"].every((h) => movedCommunityPath("old", "new", h).startsWith("/community/new")))

  /* ── loadCommunity follows the history ───────────────────────────────── */
  console.log("\nloadCommunity({ slug }) falls back to the history (part 94)")
  const tables = () => ({ communities: [community({}), community({ id: B, slug: "night-runners", name: "Night Runners" })], community_slug_history: [{ slug: "clay-club", community_id: A }, { slug: "night-runners-old", community_id: B }, { slug: "gone", community_id: "00000000-0000-4000-8000-0000000000ff" }] })
  const db = fakeDb(tables())
  const moved = await loadCommunity(db, { slug: "clay-club" })
  check("an old address answers the community under its current one", moved?.id === A && moved?.slug === "clay-studio")
  check("the current address wins over the history", (await loadCommunity(fakeDb({ ...tables(), community_slug_history: [{ slug: "clay-studio", community_id: B }] }), { slug: "clay-studio" }))?.id === A)
  check("an address nobody has had: null", (await loadCommunity(db, { slug: "never-was" })) === null)
  check("history pointing at a deleted community: null", (await loadCommunity(db, { slug: "gone" })) === null)
  const before94 = fakeDb({ communities: [community({})] }, { failWith: { community_slug_history: { code: "42P01", message: 'relation "public.community_slug_history" does not exist' } } })
  check("before part 94 has run an old address is not found, quietly", (await loadCommunity(before94, { slug: "clay-club" })) === null && (await communityIdForOldSlug(before94, "clay-club")) === null)
  check("by id it never reads the history", (await loadCommunity(db, { id: A }))?.slug === "clay-studio")
  const hist = fakeDb(tables())
  await loadCommunity(hist, { slug: "Clay-Club" })
  check("the history is asked lower case, once", hist.log.filter((l) => l.table === "community_slug_history").length === 1 && JSON.stringify(hist.log.find((l) => l.table === "community_slug_history")?.filters) === JSON.stringify([["eq", "slug", "clay-club"]]))
  check("another community's old address is held; this community's own is not", (await slugHeldByAnother(db, "night-runners-old", A)) && !(await slugHeldByAnother(db, "clay-club", A)) && !(await slugHeldByAnother(db, "free-one", A)))

  /* ── Settings ────────────────────────────────────────────────────────── */
  console.log("\nCreator settings: changing the address")
  /* updateSettings is read as source: lib/communities/server/creator.ts does not compile under this runner's loose settings (its own suite reads it the same way). */
  const creatorSrc = code("lib/communities/server/creator.ts")
  const settings = creatorSrc.slice(creatorSrc.indexOf("export async function updateSettings"), creatorSrc.indexOf("async function ensureFreeDefault"))
  check("another community's old address is refused as taken, before anything is written", /if \(await slugHeldByAnother\(db, slug, c\.id\)\) return no\(409, "That address is taken\.", "slug"\)/.test(settings) && settings.indexOf("slugHeldByAnother(") < settings.indexOf("patch.slug = slug") && settings.indexOf("patch.slug = slug") < settings.indexOf('db.from("communities").update(patch)'))
  check("  after the check that the address is free now", settings.indexOf('db.from("communities").select("id").eq("slug", slug)') < settings.indexOf("slugHeldByAnother("))
  const createSrc = code("lib/communities/server/create.ts")
  check("a new community never takes another community's old address", /if \(await communityIdForOldSlug\(db, slug\)\) \{\s*if \(tries\.explicit\) return \{ ok: false, error: "slug_taken" \}\s*continue/.test(createSrc) && createSrc.indexOf("communityIdForOldSlug(db, slug)") < createSrc.indexOf('.from("communities")\n      .insert('))
  check("the history is the database's to write (part 94's trigger), so no path that renames a community forgets it", !/community_slug_history/.test(creatorSrc))
  const settingsUi = read("components/community/creator/settings-section.tsx")
  /* Changed on purpose (round 32): the address is its own panel (Address and domain) with its own save, so the old address is the one last saved there (`saved`), not the Page form's start. */
  check("the editor no longer says old links stop working; it says they open the new address", !/stop working/.test(settingsUi) && /Links to \/community\/\{saved\} will open the new address\./.test(settingsUi))

  /* ── The layout, the proxy ───────────────────────────────────────────── */
  console.log("\nThe 308, above every page")
  const layout = code("app/(marketing)/community/[slug]/layout.tsx")
  check("the community's layout answers a permanent redirect when the address is not the community's own", /if \(page\.community && page\.community\.slug !== slug && barVisible\(page\)\) \{\s*permanentRedirect\(movedCommunityPath\(slug, page\.community\.slug, \(await headers\(\)\)\.get\(COMMUNITY_PATH_HEADER\)\)\)/.test(layout))
  check("  before it draws anything (the bar, the member frame)", layout.indexOf("permanentRedirect(") < layout.indexOf("<CommunityShell") && layout.indexOf("permanentRedirect(") < layout.indexOf("<CommunityPublicShell"))
  check("  so the member area, About, the invite landing and a post all sit under it", ["about/page.tsx", "join/page.tsx", "(member)/layout.tsx", "(member)/post/[postId]/page.tsx"].every((f) => existsSync(`app/(marketing)/community/[slug]/${f}`)))
  const proxy = code("proxy.ts")
  /* Changed on purpose (round 26): /app/community/ requests too, so the owner's screens can send an old id on to the slug. */
  check("the proxy writes the asked for path and query for /community/ requests, before anything else", /if \(pathname\.startsWith\("\/community\/"\) \|\| pathname\.startsWith\("\/app\/community\/"\)\) request\.headers\.set\(COMMUNITY_PATH_HEADER, `\$\{pathname\}\$\{search\}`\)/.test(proxy) && proxy.indexOf("COMMUNITY_PATH_HEADER, `") < proxy.indexOf("mcpHostRoute(bareHost"))
  check("  and passes the request (with it) on", /NextResponse\.next\(\{ request \}\)/.test(proxy) && COMMUNITY_PATH_HEADER === "x-storelib-community-path")

  /* ── Part 94 ─────────────────────────────────────────────────────────── */
  console.log("\nRun-now part 94")
  const RN = "supabase/sql/run-now"
  const partFile = readdirSync(RN).find((f) => f.startsWith("94_"))
  check("part 94 is community_slug_history (93 is someone else's)", partFile === "94_community_slug_history.sql", partFile)
  const part = read(`${RN}/94_community_slug_history.sql`)
  const lines = part.split("\n").filter(Boolean)
  check("a closed summary first, every line one statement, the API reloaded last", lines[0].startsWith("/* ") && lines[0].endsWith("*/") && lines.at(-1) === "notify pgrst, 'reload schema';" && !lines.slice(1).some((l) => l.trimStart().startsWith("--")))
  check("the table ARCH8 names: slug the key, the community, when it changed", /CREATE TABLE IF NOT EXISTS public\.community_slug_history \(slug text NOT NULL, community_id uuid NOT NULL REFERENCES public\.communities\(id\) ON DELETE CASCADE, changed_at timestamptz NOT NULL DEFAULT now\(\), CONSTRAINT community_slug_history_pkey PRIMARY KEY \(slug\)\);/.test(part))
  check("server only: row level security on, nothing for visitors or signed in users, the service role reads and writes", /ALTER TABLE public\.community_slug_history ENABLE ROW LEVEL SECURITY;/.test(part) && /REVOKE ALL ON public\.community_slug_history FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.community_slug_history TO service_role;/.test(part))
  check("written by a trigger when the slug changes: the old one recorded, the new one dropped", /AFTER UPDATE OF slug ON public\.communities FOR EACH ROW WHEN \(OLD\.slug IS DISTINCT FROM NEW\.slug\)/.test(part) && /INSERT INTO public\.community_slug_history \(slug, community_id, changed_at\) VALUES \(OLD\.slug, NEW\.id, now\(\)\) ON CONFLICT \(slug\) DO UPDATE/.test(part) && /DELETE FROM public\.community_slug_history WHERE slug = NEW\.slug;/.test(part) && /SECURITY DEFINER SET search_path = public/.test(part) && /REVOKE ALL ON FUNCTION public\.community_slug_history_record\(\) FROM PUBLIC, anon, authenticated;/.test(part))
  check("safe to run again (IF NOT EXISTS, OR REPLACE, DROP ... IF EXISTS)", /CREATE INDEX IF NOT EXISTS community_slug_history_community_idx/.test(part) && /CREATE OR REPLACE FUNCTION/.test(part) && /DROP TRIGGER IF EXISTS communities_slug_history ON public\.communities;/.test(part) && !/CREATE TABLE public|CREATE FUNCTION|CREATE INDEX community/.test(part))
  const migrations = readdirSync("supabase/migrations").map((f) => read(`supabase/migrations/${f}`))
  check("a byte for byte copy in migrations", migrations.includes(part))
  check("its README row", read(`${RN}/README.md`).includes("| `94_community_slug_history.sql` |"))
  check("its column in the check after", /as p94_community_slug_history[,;]/.test(read(`${RN}/99_check_after.sql`)))
  const sha = createHash("sha256").update(readFileSync(`${RN}/94_community_slug_history.sql`)).digest("hex")
  check("listed for the admin with the SHA-256 of its text", SQL_PARTS.some((p) => p.part === "94" && p.file === "94_community_slug_history.sql" && p.sha256 === sha))
  check("folded into the built files after 89, recording itself, so the harness runs it twice with the rest", ["all-in-two/1_of_2_everything.sql", "run-four/3_of_4_latest.sql", "all-in-three/2_of_3_latest.sql"].every((f) => { const t = read(`supabase/sql/${f}`); return t.indexOf("-- part 94_community_slug_history.sql") > t.indexOf("-- part 89_") && t.includes(`VALUES ('94', '94_community_slug_history.sql', '${sha}')`) }))
  check("the build script folds 93 to 98 in, and keeps 90, 91 and 92 on their own", /return 20<=N\(p\)<=89 or 93<=N\(p\)<=98 or N\(p\)>=100/.test(read("scripts/build-run-four.py")) && /\{'00','90','91','92','99'\}/.test(read("scripts/build-run-four.py")))

  /* ── Shared links ────────────────────────────────────────────────────── */
  console.log("\nShared links preview richly")
  const facts: SeoFacts = { slug: "clay-studio", name: "Clay Studio", tagline: "Wheel throwing at home.", description: null, seoTitle: null, seoDescription: null, coverUrl: "https://x/c.jpg", logoUrl: null, indexable: true, creatorName: "Mara", shareVersion: "abc" }
  const meta = communityMetadata(facts)
  const og = meta.openGraph as { images?: { url: string; width?: number; height?: number }[]; url?: string }
  const tw = meta.twitter as { card?: string; images?: string[] }
  /* Round 10: the cover is the picture whenever there is one (cover.jpg, cut to 1200 by 630); the drawn card only without a cover. */
  check("with a cover the page names the cover, cut to 1200 by 630, for Open Graph and X", og.images?.[0]?.url === "https://storelib.com/community/clay-studio/cover.jpg?v=abc" && og.images?.[0]?.width === SHARE_IMAGE_WIDTH && og.images?.[0]?.height === SHARE_IMAGE_HEIGHT && tw.card === "summary_large_image" && tw.images?.[0] === og.images?.[0]?.url)
  const bare = communityMetadata({ ...facts, coverUrl: null })
  const bog = bare.openGraph as { images?: { url: string; width?: number; height?: number }[] }
  check("without a cover the page names the drawn picture, 1200 by 630", bog.images?.[0]?.url === "https://storelib.com/community/clay-studio/share.png?v=abc" && bog.images?.[0]?.width === SHARE_IMAGE_WIDTH && bog.images?.[0]?.height === SHARE_IMAGE_HEIGHT)
  /* Round 12: absolute, since the community's layout puts its name after every page's own word. */
  check("title and description from the community", JSON.stringify(meta.title) === JSON.stringify({ absolute: "Clay Studio" }) && meta.description === "Wheel throwing at home.")
  const legacy = communityMetadata({ ...facts, shareVersion: undefined })
  check("without a drawn picture the cover is still the preview", ((legacy.openGraph as { images?: { url: string }[] }).images?.[0]?.url) === "https://x/c.jpg")
  const invite = inviteMetadata({ ...facts, coverUrl: null })
  const iog = invite.openGraph as { images?: { url: string }[]; url?: string }
  check("an invite link: Join <name>, \"You're invited\", the invite's picture, never indexed", JSON.stringify(invite.title) === JSON.stringify({ absolute: "Join Clay Studio" }) && invite.openGraph?.title === "Join Clay Studio" && /^You're invited to Clay Studio on Storelib\./.test(String(invite.description)) && iog.images?.[0]?.url === "https://storelib.com/community/clay-studio/share.png?v=abc&invite=1" && JSON.stringify(invite.robots) === JSON.stringify({ index: false, follow: false }))
  check("an invite link to a community with a cover shows the cover", ((inviteMetadata(facts).openGraph as { images?: { url: string }[] }).images?.[0]?.url) === "https://storelib.com/community/clay-studio/cover.jpg?v=abc")
  check("  its preview address is the community's own, so the invite is not repeated into anything that keeps previews", iog.url === "https://storelib.com/community/clay-studio" && !/invite=/.test(JSON.stringify(invite).replaceAll("share.png?v=abc&invite=1", "")))
  check("the picture's address changes when what it is drawn from does", shareImageVersion(["a", 1]) !== shareImageVersion(["a", 2]) && shareImageVersion(["a", 1]) === shareImageVersion(["a", 1]) && shareImageUrl("x", null) === "https://storelib.com/community/x/share.png")
  const row = { ...community({ tagline: "Line", logo_url: null, cover_url: null, member_count: 12, access: "free", updated_at: "2026-10-01" }), seo_title: null, seo_description: null, description: null, visibility: "public", platform_hidden: false }
  check("seoFacts hands the page a fingerprint", typeof seoFacts(row as never).shareVersion === "string" && seoFacts(row as never).shareVersion !== seoFacts({ ...row, member_count: 5000 } as never).shareVersion)
  check("a draft, a suspended or a deleted community previews as nothing", sharePreviewable(row as never) && !sharePreviewable({ ...row, status: "draft" } as never) && !sharePreviewable({ ...row, status: "suspended" } as never) && !sharePreviewable({ ...row, suspended_at: "x" } as never) && !sharePreviewable({ ...row, deleted_at: "x" } as never))
  for (const f of ["page.tsx", "about/page.tsx"]) {
    check(`${f}: its metadata says nothing for a community nobody may see`, /if \(!community \|\| !sharePreviewable\(community\)\) return \{ robots: \{ index: false, follow: false \} \}/.test(code(`app/(marketing)/community/[slug]/${f}`)))
  }
  const join = code("app/(marketing)/community/[slug]/join/page.tsx")
  check("the invite landing's metadata: the invite's preview when there is one, never reading it", /export async function generateMetadata/.test(join) && /const facts = \{ \.\.\.seoFacts\(community\), summary: await communitySummary\(community\.id\) \}/.test(join) && /typeof invite === "string" && invite \? inviteMetadata\(facts\)/.test(join) && !/redeem|token_hash|hashInviteToken/.test(join.slice(join.indexOf("generateMetadata"), join.indexOf("export default"))))
  const route = code("app/(marketing)/community/[slug]/share.png/route.tsx")
  check("share.png: next/og on node, drawn per request", /import \{ ImageResponse \} from "next\/og"/.test(route) && /export const runtime = "nodejs"/.test(route) && /export const dynamic = "force-dynamic"/.test(route))
  check("  the switch first, then 404 for nobody here, a draft or a suspended community", route.indexOf("communitiesEnabled()") < route.indexOf("loadCommunity(") && /if \(!community \|\| !sharePreviewable\(community\)\) return notFound\(\)/.test(route))
  check("  kept briefly at the edge and in a browser", /const BRIEF = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"/.test(route) && /"cache-control": BRIEF/.test(route))
  check("  the invite's words only from invite=1; no token read", /searchParams\.get\("invite"\) === "1"/.test(route) && !/token|redeem/.test(route))
  check("  drawn again without pictures if one cannot be drawn", /\?\?\s*\(await png\(<CommunityShareArt model=\{model\} coverSrc=\{null\} logoSrc=\{null\} avatarSrc=\{null\} \/>\)\)/.test(route))
  check("  its font traced into the build", /'\/community\/\*\/share\.png': \['\.\/lib\/checkout\/fonts\/\*\*'\]/.test(read("next.config.mjs")))
  const img = code("lib/communities/server/share-image.ts")
  check("pictures fetched the careful way and cut by sharp to the size drawn", /fetchImageBytes\(url/.test(img) && /resize\(width, height, \{ fit: "cover"/.test(img) && /^import "server-only"/m.test(read("lib/communities/server/share-image.ts")))
  check("only the public face: the card's facts, never a post, member or space", !/community_feed_posts|community_members|community_spaces|community_invites/.test(img + route))
  const art = code("components/community/public/share-card.tsx")
  check("the art is pure (no server code) and every box says display: flex", !/server-only|next\/headers|lib\/communities\/server|lib\/supabase/.test(art) && !/className=/.test(art))
  check("long words clipped on a word with an ellipsis", clip("The Weekend Woodworkers Collective of Northern Europe", 34) === "The Weekend Woodworkers…" && clip("Short", 10) === "Short")
  check("a long name takes a smaller size and leaves the line one", shareLayout("Clay Studio").nameSize === 64 && shareLayout("x".repeat(50)).taglineMax < shareLayout("Clay Studio").taglineMax)
  check("the button reads as the page's: Join free, Join, Accept invite, Invite only", shareButtonLabel({ invite: false, priceLine: "Free", inviteOnly: false }) === "Join free" && shareButtonLabel({ invite: false, priceLine: "$9/month", inviteOnly: false }) === "Join" && shareButtonLabel({ invite: true, priceLine: "Free", inviteOnly: true }) === "Accept invite" && shareButtonLabel({ invite: false, priceLine: null, inviteOnly: true }) === "Invite only")

  /* ── Invite ──────────────────────────────────────────────────────────── */
  console.log("\nInvite people")
  check("the link is the community's canonical address", communityShareUrl("clay-studio") === "https://storelib.com/community/clay-studio")
  check("what the link does, from the access: free, approval, paid, product, invite only", shareLinkLine({ access: "free" }) === "Anyone with the link can join for free." && /ask to join/.test(shareLinkLine({ access: "free", approvalRequired: true })) && /pay/.test(shareLinkLine({ access: "paid" })) && /how to get in/.test(shareLinkLine({ access: "product" })) && /invite only/.test(shareLinkLine({ access: "invite_only" })))
  check("what a staff invite does: no payment, or no request", /without paying/.test(staffInviteLine({ access: "paid" })) && /without a request/.test(staffInviteLine({ access: "invite_only" })))
  check("the address drawn so the community's name stays in view", JSON.stringify(splitShareUrl("https://storelib.com/community/clay-studio")) === JSON.stringify({ lead: "storelib.com/community/", tail: "clay-studio" }) && JSON.stringify(splitShareUrl("https://storelib.com/community/clay-studio/join?invite=abc")) === JSON.stringify({ lead: "storelib.com/community/clay-studio/", tail: "join?invite=abc" }))
  const sheet = code("components/community/member/invite-sheet.tsx")
  check("the sheet: Copy, the phone's share sheet only where there is one, Email", /navigator\.clipboard\.writeText/.test(sheet) && /typeof navigator\.share === "function"/.test(sheet) && /\{canShare \? \(/.test(sheet) && /mailto:\?subject=/.test(sheet))
  check("  Storelib's dialog on a computer and its bottom sheet on a phone", /<SheetDialog open=\{open\} onClose=\{onClose\} phone=\{phone\}/.test(sheet))
  check("  the staff half only for staff, posting to the member invites route", /\{staff \? <StaffInvites/.test(sheet) && /`\$\{apiBase\(community\.id\)\}\/invites`/.test(sheet))
  check("  a client module with nothing from the server", /^"use client"/.test(read("components/community/member/invite-sheet.tsx")) && !/server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)/.test(sheet))
  const frame = code("components/community/member/shell-frame.tsx")
  /* Round 9, ask 19: Invite moved into the bar's "..." menu ("Invite people"); the tabs and the card no longer carry it. */
  check("the frame: Invite people in the bar's \"...\" menu, one sheet, staff by can(\"invite\")", /onInvite: community\.archived \? null : openInvite/.test(frame) && !/InviteTab|data-community-invite/.test(frame) && /<InviteSheet open=\{inviting\}/.test(frame) && /const canInvite = !!viewer\.can\.invite && !community\.archived/.test(frame) && /label: "Invite people"/.test(code("components/community/member/account-menu.tsx")))
  /* Changed on purpose (round 26): the creator side's address is the community's slug. */
  check("  Manage invites only for the owner or a creator account", /canInvite && \(viewer\.isOwner \|\| viewer\.isCreatorAccount\) \? `\/app\/community\/\$\{community\.slug\}\/members` : null/.test(frame))
  check("the card: no Invite any more, Settings for staff", !/onInvite/.test(code("components/community/member/wall.tsx")) && /className=\{CARD_ACTION\} data-wall-settings=""/.test(code("components/community/member/wall.tsx")))
  const inviteRoute = code("app/api/community/[communityId]/invites/route.ts")
  check("POST /api/community/<id>/invites: the switch first, a member who may invite, rate limited, the existing invites code", inviteRoute.indexOf("requireCommunitiesOn()") < inviteRoute.indexOf("requireMember(") && /requireMember\(db, communityId, await sessionUserId\(\), "invite"\)/.test(inviteRoute) && /rateLimit\(\{\s*bucket: rateBucket\("invite"\)/.test(inviteRoute) && /createInvite\(db, \{ community: gate\.community, createdBy: userId/.test(inviteRoute) && /checkInvite\(await readJson\(request\)\)/.test(inviteRoute))
  check("  never trusts a client's community, user or role", !/body\.(communityId|userId|role|createdBy)/.test(inviteRoute))
  /* Round 14: the visibility travels with it, because privacy and price are two facts now (lib/communities/access-model.ts). */
  check("the shell community carries its access and visibility, for the sheet's words", /access: c\.access,\s*visibility: c\.visibility,\s*approvalRequired: c\.approval_required,/.test(code("components/community/member/data.ts")))

  /* ── RoleBadge, the stray Members ────────────────────────────────────── */
  console.log("\nRole badge and the stray Members")
  const badge = code("components/community/member/role-badge.tsx")
  check("RoleBadge: words and a glyph, no fill, no border, no pill; members get nothing", /export function RoleBadge/.test(badge) && !/rounded-full|rounded-md|bg-\[#|border-\[#/.test(badge) && /if \(!label \|\| !role \|\| role === "member"\) return null/.test(badge))
  for (const f of ["members.tsx", "search.tsx", "person-card.tsx"]) {
    const t = code(`components/community/member/${f}`)
    check(`${f} draws RoleBadge, not the grey tag`, /<RoleBadge role=\{/.test(t) && !/rounded-md bg-\[#f1f2f4\] px-1\.5 text-\[11/.test(t))
  }
  check("a plain member's library row says nothing beside the creator, whatever the tier is called", standingOf({ status: "active", role: "member", tierName: "Members" }) === null && standingOf({ status: "active", role: "member", tierName: "Gold" }) === null)
  check("  a role and a request still say so", standingOf({ status: "active", role: "owner", tierName: "Members" })?.label === "Owner" && standingOf({ status: "active", role: "moderator", tierName: null })?.label === "Moderator" && standingOf({ status: "pending", role: "member", tierName: null })?.label === "Request sent")

  /* ── The phone bar ───────────────────────────────────────────────────── */
  console.log("\nThe phone frame")
  const bar = code("components/community/member/top-bar.tsx")
  check("the name gets two lines on a phone and one from 768px", /className="line-clamp-2 break-words text-\[14px\][^"]*min-\[400px\]:text-\[15px\] md:line-clamp-1/.test(bar) && !/className="block truncate text-\[15px\] font-semibold/.test(bar))

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nCopy rules")
  const mine = ["lib/communities/slug-move.ts", "lib/communities/server/slug-history.ts", "lib/communities/server/share-image.ts", "components/community/public/share-card.tsx", "components/community/member/invite-sheet.tsx", "components/community/member/invite-glyph.tsx", "components/community/member/role-badge.tsx", "app/(marketing)/community/[slug]/share.png/route.tsx", "app/api/community/[communityId]/invites/route.ts", "supabase/sql/run-now/94_community_slug_history.sql"]
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
  check("no em dash and none of the banned words in anything new", mine.every((f) => !banned.test(read(f))), mine.filter((f) => banned.test(read(f))))

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
