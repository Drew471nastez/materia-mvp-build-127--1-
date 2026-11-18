/**
 * ===========================================================================
 *  PROFILES, ROUND 10: ONE PAGE PER PERSON, NO EMPTY CREATOR PAGE, A FACE
 *  FOR EVERYBODY, A PHOTO PLACED IN ITS CIRCLE
 * ===========================================================================
 *   ONE PAGE        a creator's /@handle (and /member/<handle>) is a 308 to
 *                   their creator page with the query kept, from the
 *                   route's layout (outside its skeleton), by the same rule
 *                   as the creator page's own door, so nothing loops; the
 *                   proxy hands the layout the address; a profile has
 *                   Storelib's header; title, description and a drawn share
 *                   picture; nothing bought on somebody else's profile
 *   EMPTY PAGES     the /calvin case (62.webp): a Home holding only a
 *                   section that draws nothing is no Home at all, and every
 *                   other way to the same blank band
 *   AVATARS         a person without a photo is the default face, never
 *                   initials; a community's mark keeps its letters; the
 *                   provider's photo is kept on every sign in until they
 *                   have one, never over one they set or removed (a stubbed
 *                   auth user against a stand in database); run-now part 97
 *                   gives existing accounts the same answer
 *   SETTINGS        a chosen photo goes straight up (round 11: no crop
 *                   sheet), the middle square the circle shows; the upload
 *                   reports real progress; the cover is taller (round 10
 *                   about +15%, round 11 about +6% more)
 *
 * Browser measurements: scripts/check-profile-round10.mjs.
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readCode } from "./_source"
import { PROFILE_PATH_HEADER, creatorPageTarget, isProfilePath } from "../lib/profile/profile-redirect"
import { profileMetadata, profileShareImageUrl, profileShareVersion } from "../lib/profile/profile-seo"
import { keepProviderPhoto, providerPhotoOf, providerPhotoWanted, type ProviderPhotoDb } from "../lib/profile/provider-photo"
import { AVATAR_CHOSEN } from "../lib/account/avatar"
import { drawableSections, drawsSomething } from "../components/storefront/no-products"
import { AppAvatar, AvatarMark, avatarKindFromClass } from "../components/app/app-avatar"
import { PHOTO_SIDE, centreSquare } from "../lib/profile/photo-square"
import { PROFILE_COVER_HEIGHTS, profileBandAspect } from "../lib/profile/cover"

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n          ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  /* ── 15. One page per person ─────────────────────────────────────────── */
  console.log("\nA creator's /@handle is their creator page")
  check("the query goes along, the framework's own key does not", creatorPageTarget("calvin", "/@calvin?from=explore&_rsc=abc&ref=x") === "/calvin?from=explore&ref=x")
  check("no query, no question mark", creatorPageTarget("calvin", "/@calvin") === "/calvin" && creatorPageTarget("calvin", null) === "/calvin")
  check("the name as stored, case and all", creatorPageTarget("Calvin", "/member/calvin?a=1") === "/Calvin?a=1")
  check("a name that cannot be an address is never a redirect", creatorPageTarget("../evil", "/@x") === null && creatorPageTarget("//evil.com", null) === null && creatorPageTarget("", null) === null)
  check("the target is always a path on this site", !/^\/\//.test(creatorPageTarget("a", "/@a?next=//evil.com") ?? "") && creatorPageTarget("a", "/@a?next=//evil.com")!.startsWith("/a?"))
  check("both spellings are a profile, nothing else is", isProfilePath("/@maya") && isProfilePath("/member/maya") && !isProfilePath("/maya") && !isProfilePath("/members") && !isProfilePath("/explore"))

  const layout = readCode("app/(storelib)/(marketing)/member/[username]/layout.tsx")
  const gate = readCode("lib/profile/storefront-gate.ts")
  check("the layout answers the redirect (outside the route's skeleton), a permanent one", /permanentRedirect\(target\)/.test(layout) && /export default async function MemberProfileLayout/.test(layout))
  check("  by the creator page door's own rule and loaders, so the two cannot disagree",
    /loadProfileByUsername\(handle\)/.test(layout) && /loadCreatorForUser\(profile\.id\)/.test(layout) && /hasActiveStorefront\(creator\)/.test(layout)
      && /loadProfileByUsername/.test(gate) && /loadCreatorForUser/.test(gate) && /if \(!hasActiveStorefront\(creator\)\)/.test(gate))
  check("  never for one of the platform's own words", /!isReservedRootSegment\(handle\) && !isReservedWord\(handle\)/.test(layout))
  check("  with the query from the proxy's header", /\(await headers\(\)\)\.get\(PROFILE_PATH_HEADER\)/.test(layout))
  check("  and a failed lookup renders the profile rather than an error", /catch \{\s*target = null\s*\}/.test(layout))
  const proxy = readCode("proxy.ts")
  check("the proxy writes the asked for address for /@ and /member/ only, replacing what a visitor sent", /if \(isProfilePath\(pathname\)\) request\.headers\.set\(PROFILE_PATH_HEADER, `\$\{pathname\}\$\{search\}`\)/.test(proxy))
  check("the header's name is the one the layout reads", PROFILE_PATH_HEADER === "x-storelib-profile-path")
  const marketing = readCode("app/(storelib)/(marketing)/layout.tsx")
  check("nothing above the layout waits in a Suspense boundary, so the redirect is a real 308 and not a streamed 200",
    /* Changed on purpose (landing round 14): the slot goes through DocumentReady, a component that never waits on the server and is not a Suspense boundary. */ /<main className="flex-1">\s*<DocumentReady>\{children\}<\/DocumentReady>\s*<\/main>/.test(marketing) && !/Suspense/.test(readCode("components/marketing/document-ready.tsx").replace(/\/\*[\s\S]*?\*\//g, "")) && (marketing.match(/<Suspense/g) ?? []).length === 1 && /<Suspense fallback=\{null\}>\s*<ConditionalFooter \/>/.test(marketing) && !/<Suspense/.test(readCode("app/(storelib)/layout.tsx")))

  const header = readCode("components/marketing/conditional-header.tsx")
  /* Round 12: a person's page is the creator page's template with its own top bar, so Storelib's header is not drawn over /@ or /member (it is one of the screens with their own chrome, decided first, on every domain). */
  check("a profile has no Storelib header, from the first paint, on any domain", /p\.startsWith\("\/community\/"\) \|\| isProfilePath\(p\)/.test(header) && !/isProfilePath\(pathname\) && onPlatformDomain/.test(header))
  check("  decided before every host rule (isOwnScreen first)", header.indexOf("if (isOwnScreen(pathname))") > 0 && header.indexOf("if (isOwnScreen(pathname))") < header.indexOf("if (isOnCustomDomain)"))
  check("  and never switched on for a profile anywhere", !/if \(isProfilePath\(pathname\)\) \{\s*setShowPlatformHeader\(true\)/.test(header))

  console.log("\nA profile in search and in a shared link")
  const facts = { name: "Maya Ortiz", username: "maya", bio: "Ceramics, glaze notes and a weekly studio.", avatarUrl: null, coverUrl: null, followers: 12, indexable: true }
  const meta = profileMetadata(facts)
  const og = meta.openGraph as { images: Array<{ url: string; width: number; height: number }>; url: string }
  check("the title is the person and their handle", meta.title === "Maya Ortiz (@maya)")
  check("the description is their bio", meta.description === facts.bio)
  check("without a bio, a plain sentence naming them", profileMetadata({ ...facts, bio: null }).description === "Maya Ortiz is on Storelib. See the communities they are in and what they share.")
  check("the canonical is /@handle", (meta.alternates as { canonical: string }).canonical === "/@maya" && og.url === "https://storelib.com/@maya")
  check("the share picture is drawn for them, 1200 by 630, its address changing with what it shows",
    og.images[0].url === profileShareImageUrl("maya", profileShareVersion(["Maya Ortiz", "maya", facts.bio, null, null, 12])) && og.images[0].width === 1200 && og.images[0].height === 630
      && profileMetadata({ ...facts, bio: "New words" }).openGraph !== undefined && (profileMetadata({ ...facts, bio: "New words" }).openGraph as typeof og).images[0].url !== og.images[0].url)
  check("  under /member/, where the route is (the rewrite takes one segment)", og.images[0].url.startsWith("https://storelib.com/member/maya/share.png?v="))
  check("indexed and followed", JSON.stringify(meta.robots).includes('"index":true'))
  check("a handle the sign up guard calls spam is left out", JSON.stringify(profileMetadata({ ...facts, indexable: false }).robots).includes('"index":false'))
  const route = readCode("app/(storelib)/(marketing)/member/[username]/page.tsx")
  check("the page asks profileMetadata, with the spam verdict", /return profileMetadata\(\{/.test(route) && /* Changed on purpose (round 44): the handle score and an operator's verdict, by deservesIndexing. */
    /indexable: await inSearch\(profile\.userId, profile\.username\)/.test(route) && /deservesIndexing\(\{ handle: username, spamState: await spamStateOf\(userId\) \}\)/.test(route))
  const share = readCode("app/(storelib)/(marketing)/member/[username]/share.png/route.tsx")
  check("the share picture: next/og, an unknown handle a 404, the communities count only when they show it",
    /new ImageResponse\(/.test(share) && /if \(!profile\) return notFound\(\)/.test(share) && /profile\.privacy\.showCommunities/.test(share))
  check("  its fonts traced for the route", /'\/member\/\*\/share\.png': \['\.\/lib\/checkout\/fonts\/\*\*'\]/.test(raw("next.config.mjs")))

  console.log("\nNothing bought on somebody else's profile")
  check("a review (which names what they bought) is in their own activity only", /reviews: self,/.test(readCode("lib/profile/activity-page.ts")) && /input\.reviews === false \? Promise\.resolve\(\{ items: \[\], horizon: null \}\) : reviewSource/.test(readCode("lib/profile/activity.ts")))
  const page = readCode("components/profile/member-profile-page.tsx")
  check("the communities a person is in are a list of places, not Explore's cover cards", /<ProfileCommunityList owned=\{communities\.owned\} member=\{memberCards\} \/>/.test(page))
  check("  each the shared card's compact row (one community card on Storelib), the whole row one link", /<ExploreCommunityCard card=\{c\} layout="row"/.test(readCode("components/profile/profile-community-list.tsx")))

  /* ── 16. Empty creator pages ─────────────────────────────────────────── */
  console.log("\nA creator page whose Home would draw nothing has no Home (62.webp)")
  const page0 = { productCount: 0, communityBlocks: {} }
  /* What /calvin's Home held: an old "header" section with no visible flag. */
  const calvin = [{ id: "header-1", type: "header", settings: { title: "Calvin", subtitle: "Clavin writes.", colors: {} } }]
  check("the /calvin Home: nothing to draw, so no Home tab and no blank band", drawableSections(calvin, page0).length === 0)
  check("a section switched off draws nothing", !drawsSomething({ type: "text-block", settings: { visible: false, headline: "Hi", body: "Words" } }, page0))
  check("a text block with no words (or only markup) draws nothing", !drawsSomething({ type: "text-block", settings: { visible: true, headline: "", body: "<p> </p>&nbsp;" } }, page0))
  check("a text block with words is kept", drawsSomething({ type: "text-block", settings: { visible: true, headline: "", body: "<p>Studio notes</p>" } }, page0))
  check("an image and text with nothing in it draws nothing; with a picture it is kept",
    !drawsSomething({ type: "image-text", settings: { visible: true, headline: " ", body: "", imageUrl: "" } }, page0) && drawsSomething({ type: "image-text", settings: { visible: true, headline: "", body: "", imageUrl: "https://x/y.jpg" } }, page0))
  check("benefits with no benefit written draw nothing", !drawsSomething({ type: "benefits", settings: { visible: true, headline: "Why", benefits: [{ title: "", description: "" }] } }, page0) && drawsSomething({ type: "benefits", settings: { visible: true, benefits: [{ title: "Fast", description: "" }] } }, page0))
  check("an announcement with no text draws nothing", !drawsSomething({ type: "announcement-bar", settings: { visible: true, text: "  " } }, page0))
  check("a community section whose community is gone draws nothing; a live one is kept",
    !drawsSomething({ type: "community", settings: { visible: true, communityId: "ABC" } }, page0) && drawsSomething({ type: "community", settings: { visible: true, communityId: "ABC" } }, { productCount: 0, communityBlocks: { abc: {} } }))
  check("product rails only with products", !drawsSomething({ type: "featured-products", settings: { visible: true } }, page0) && drawsSomething({ type: "featured-products", settings: { visible: true } }, { productCount: 2 }))
  check("reviews, custom code, an old subscribe bar: no drawing on a creator page", ["reviews", "custom-html", "subscribe-bar", "faq"].every((type) => !drawsSomething({ type, settings: { visible: true } }, { productCount: 3 })))
  check("order is kept", drawableSections([{ id: "a", type: "text-block", settings: { visible: true, body: "a" } }, { id: "h", type: "header", settings: {} }, { id: "b", type: "announcement-bar", settings: { visible: true, text: "b" } }], page0).map((s) => s.id).join() === "a,b")
  const creatorPage = readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")
  check("the creator page counts what Home draws, not how many sections it has", /const regularSections = drawableSections\(\s*themedSections\.filter\(\(s\) => s\.type !== "about"\)\.sort\(\(a, b\) => a\.order - b\.order\),\s*\{ productCount: productsData\.length, communityBlocks \},\s*\)/.test(creatorPage))
  check("  and Home is a tab only when something is left in it", /tabsWithoutProducts\(\{ home: regularSections\.length > 0 \? home : null/.test(creatorPage))

  /* ── 17. Avatars ─────────────────────────────────────────────────────── */
  console.log("\nA person without a photo is the default face, never initials")
  const nophoto = renderToStaticMarkup(createElement(AppAvatar, { src: null, name: "Maya Ortiz", size: 40 }))
  check("no letters in a person's circle", !/>MO</.test(nophoto) && /data-avatar-default=""/.test(nophoto), nophoto)
  check("  the face fills the circle, whatever size its classes give it", /absolute inset-0 h-full w-full/.test(nophoto))
  check("  the same for somebody with no name at all", /data-avatar-default/.test(renderToStaticMarkup(createElement(AppAvatar, { src: null, name: "", size: 24 }))))
  check("  and for the mark other components draw in their own fallback", /data-avatar-default/.test(renderToStaticMarkup(createElement(AvatarMark, { name: "Maya Ortiz", size: 32 }))))
  check("a community's square mark keeps its letters", />CS</.test(renderToStaticMarkup(createElement(AppAvatar, { src: null, name: "Clay Studio", size: 44, className: "rounded-[10px]" }))))
  check("  told by its shape when nobody says", avatarKindFromClass("shrink-0 rounded-[10px]") === "mark" && avatarKindFromClass("mx-auto rounded-2xl") === "mark" && avatarKindFromClass("h-8 w-8 rounded-full") === "person" && avatarKindFromClass("ring-2 ring-white") === "person" && avatarKindFromClass(undefined) === "person")
  check("  or by kind", />CS</.test(renderToStaticMarkup(createElement(AppAvatar, { src: null, name: "Clay Studio", size: 44, kind: "mark" }))))
  /* Changed on purpose: 6a258481 (faster avatars) draws a person's default face under their photo from the first frame, so the circle is never blank; never letters, and a mark still waits blank unless asked. */
  check("a photo on its way is not drawn over by a face or letters (unless asked)", (() => {
    const person = renderToStaticMarkup(createElement(AppAvatar, { src: "https://x.test/a.jpg", name: "Maya Ortiz", size: 40 }))
    const mark = renderToStaticMarkup(createElement(AppAvatar, { src: "https://x.test/a.jpg", name: "Clay Studio", size: 44, kind: "mark" }))
    return !/>MO</.test(person) && /data-avatar-default=""/.test(person) && /<img\b/.test(person) && !/data-avatar-default|>CS</.test(mark) && />CS</.test(renderToStaticMarkup(createElement(AppAvatar, { src: "https://x.test/a.jpg", name: "Clay Studio", size: 44, kind: "mark", markWhileLoading: true })))
  })())

  console.log("\nThe provider's photo, kept on every sign in until they have one (a stubbed auth user)")
  const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocK-maya=s96-c"
  check("Google's avatar_url, else picture, https only", providerPhotoOf({ avatar_url: GOOGLE }) === GOOGLE && providerPhotoOf({ picture: GOOGLE }) === GOOGLE && providerPhotoOf({ avatar_url: "http://x/a.jpg" }) === null && providerPhotoOf({}) === null && providerPhotoOf(null) === null)
  check("Apple sends none: nothing to keep", providerPhotoOf({ full_name: "Ana", email: "a@privaterelay.appleid.com" }) === null)
  check("wanted when they have no photo and never chose", providerPhotoWanted({ profileAvatar: null, providerAvatar: GOOGLE, chosen: false }) && providerPhotoWanted({ profileAvatar: "", providerAvatar: GOOGLE, chosen: false }) && providerPhotoWanted({ profileAvatar: "/placeholder.svg?x", providerAvatar: GOOGLE, chosen: false }))
  check("never over a photo they have, never after they removed one", !providerPhotoWanted({ profileAvatar: "https://x/avatars/u/a.jpg", providerAvatar: GOOGLE, chosen: false }) && !providerPhotoWanted({ profileAvatar: null, providerAvatar: GOOGLE, chosen: true }))

  type Row = { avatar_url: string | null }
  const db = (rows: Map<string, Row>, opts: { before?: (id: string) => void; failRead?: boolean } = {}) => {
    const writes: string[] = []
    const client: ProviderPhotoDb = {
      from: () => ({
        select: () => ({
          eq: (_c: string, id: string) => ({ maybeSingle: async () => (opts.failRead ? { data: null, error: { message: "down" } } : { data: rows.has(id) ? { ...rows.get(id)! } : null, error: null }) }),
        }),
        update: (values: { avatar_url: string }) => ({
          eq: (_c: string, id: string) => {
            const apply = (match: (v: string | null) => boolean) => ({
              select: async () => {
                opts.before?.(id)
                const row = rows.get(id)
                if (!row || !match(row.avatar_url)) return { data: [], error: null }
                row.avatar_url = values.avatar_url
                writes.push(`${id}=${values.avatar_url}`)
                return { data: [{ id }], error: null }
              },
            })
            return { is: (_c2: string, _v: null) => apply((v) => v === null), eq: (_c2: string, v: string) => apply((cur) => cur === v) }
          },
        }),
      }),
    }
    return { client, writes }
  }
  const user = (id: string, meta: Record<string, unknown>) => ({ id, user_metadata: meta });

  {
    const rows = new Map<string, Row>([["u1", { avatar_url: null }]])
    const { client, writes } = db(rows)
    const first = await keepProviderPhoto(client, user("u1", { avatar_url: GOOGLE }))
    check("a sign in with Google and no photo: the picture is theirs", first === "saved" && rows.get("u1")!.avatar_url === GOOGLE && writes.length === 1)
    const again = await keepProviderPhoto(client, user("u1", { avatar_url: "https://lh3.googleusercontent.com/a/new" }))
    check("  the next sign in leaves it (they have one now)", again === "has_photo" && rows.get("u1")!.avatar_url === GOOGLE && writes.length === 1)
  };{
    const rows = new Map<string, Row>([["u2", { avatar_url: "" }]])
    const { client } = db(rows)
    check("an old account whose first sign in missed it gets it on this one", (await keepProviderPhoto(client, user("u2", { picture: GOOGLE }))) === "saved" && rows.get("u2")!.avatar_url === GOOGLE)
  };{
    const MINE = "https://proj.supabase.co/storage/v1/object/public/avatars/u3/avatar-1.jpg"
    const rows = new Map<string, Row>([["u3", { avatar_url: MINE }]])
    const { client, writes } = db(rows)
    check("a photo they set is never overwritten", (await keepProviderPhoto(client, user("u3", { avatar_url: GOOGLE }))) === "has_photo" && rows.get("u3")!.avatar_url === MINE && writes.length === 0)
  };{
    const rows = new Map<string, Row>([["u4", { avatar_url: null }]])
    const { client, writes } = db(rows)
    check("one they removed stays removed", (await keepProviderPhoto(client, user("u4", { avatar_url: GOOGLE, [AVATAR_CHOSEN]: true }))) === "chosen" && rows.get("u4")!.avatar_url === null && writes.length === 0)
  };{
    const MINE = "https://proj.supabase.co/storage/v1/object/public/avatars/u5/avatar-2.jpg"
    const rows = new Map<string, Row>([["u5", { avatar_url: null }]])
    /* Settings saves a photo between the sign in's read and its write. */
    const { client } = db(rows, { before: (id) => { if (rows.get(id)!.avatar_url === null) rows.get(id)!.avatar_url = MINE } })
    check("a photo saved in the same moment wins (compare and set)", (await keepProviderPhoto(client, user("u5", { avatar_url: GOOGLE }))) === "lost_race" && rows.get("u5")!.avatar_url === MINE)
  };{
    const { client } = db(new Map(), { failRead: true })
    check("a database that does not answer never fails the sign in", (await keepProviderPhoto(client, user("u6", { avatar_url: GOOGLE }))) === "failed")
    check("no profile yet: nothing written", (await keepProviderPhoto(db(new Map()).client, user("u7", { avatar_url: GOOGLE }))) === "no_profile")
  }
  const callback = readCode("app/(storelib)/auth/callback/route.ts")
  check("the web sign in asks the same rule when it makes the profile and when it finds one",
    (callback.match(/providerPhotoWanted\(\{/g) ?? []).length === 2 && /const providerPhoto = providerPhotoOf\(data\.user\.user_metadata\)/.test(callback) && /AVATAR_CHOSEN\] === true/.test(callback) && !/accountAgeMs/.test(callback))
  const sync = readCode("app/(storelib)/auth/sync-session/route.ts")
  check("the app's sign in (sync-session) keeps it too, after the answer so nobody waits",
    /if \(signedIn\) after\(\(\) => keepProviderPhoto\(createAdminClient\(\) as unknown as ProviderPhotoDb, signedIn\)/.test(sync) && sync.indexOf("after(") > sync.indexOf("supabase.auth.setSession(") && sync.indexOf("after(") < sync.lastIndexOf("const res = NextResponse.redirect(`${origin}${next}`, status)")) // Changed on purpose (round 42 reliability): the signed in answer is a no-store redirect with the POST's 303

  console.log("\nRun-now part 97: existing accounts, once")
  const part = raw("supabase/sql/run-now/97_profile_provider_photos.sql")
  const lines = part.trimEnd().split("\n")
  check("three lines: what it does, one DO block on one line, then notify pgrst", lines.length === 3 && lines[0].startsWith("/*") && lines[0].endsWith("*/") && /^DO \$\$ BEGIN .* END \$\$;$/.test(lines[1]) && lines[2] === "notify pgrst, 'reload schema';")
  check("  only empty photos, never a chosen or removed one, https pictures only",
    /p\.avatar_url IS NULL OR btrim\(p\.avatar_url\) = ''/.test(lines[1]) && /storelib_avatar_chosen', ''\) <> 'true'/.test(lines[1]) && /'\^https:\/\/\[\^\[:space:\]\]\+\$'/.test(lines[1]))
  check("  skips itself where auth.users cannot be read", /EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE/.test(lines[1]))
  check("  its migration copy is the same text", raw("supabase/migrations/20261113_profile_provider_photos.sql") === part)
  check("  a README row and a check column", /\| `97_profile_provider_photos\.sql` \|/.test(raw("supabase/sql/run-now/README.md")) && / as p97_profile_provider_photos[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
  check("  folded into the files the owner runs", raw("supabase/sql/all-in-two/1_of_2_everything.sql").includes(lines[1]) && raw("supabase/sql/run-four/3_of_4_latest.sql").includes(lines[1]))

  /* ── 18. Settings ────────────────────────────────────────────────────── */
  console.log("\nThe photo goes straight up (round 11: the cropper is gone)")
  check("a wide picture: the middle square, the part the circle shows", JSON.stringify(centreSquare(1200, 800)) === JSON.stringify({ sx: 200, sy: 0, side: 800 }))
  check("  a tall one: the middle square too", JSON.stringify(centreSquare(800, 1200)) === JSON.stringify({ sx: 0, sy: 200, side: 800 }))
  check("  sent at no more than 512px", PHOTO_SIDE === 512)
  const photo = readCode("components/account/account-photo.tsx")
  check("chosen: in the circle on that frame, the ring at its start, then cut and sent; no sheet in between",
    /showPreview\(URL\.createObjectURL\(file\)\)\s*setBusy\("upload"\)\s*setProgress\(0\)\s*let blob: Blob\s*try \{\s*blob = await squareJpeg\(file\)/.test(photo) && !/PhotoCropSheet|setPlacing|photo-crop/.test(photo))
  check("  with the real progress from the request, drawn as a ring that fills", /uploadWithProgress\("avatars", path, blob, \{[^}]*onProgress/.test(photo) && /strokeDashoffset=\{RING \* \(1 - /.test(photo) && !/animate-spin/.test(photo))
  check("  the crop sheet is gone from the repository", (() => { try { readCode("components/account/photo-crop.tsx"); return false } catch { return true } })())

  console.log("\nThe cover in /account and in Settings, taller")
  check("157 / 233 / 264 (128 / 192 / 256 plus fifteen percent, then about six percent more)", PROFILE_COVER_HEIGHTS.phone === 157 && PROFILE_COVER_HEIGHTS.sm === 233 && PROFILE_COVER_HEIGHTS.lg === 264)
  /* Round 12: /@handle draws the creator header, so only /account's band holds these heights; the profile's skeleton is the creator page's (its colour and its top bar). */
  check("the band draws those heights", /relative h-\[157px\] sm:h-\[233px\] lg:h-\[264px\]/.test(readCode("components/profile/profile-hero.tsx")))
  check("Settings' frame takes the new shape on its own", profileBandAspect(390) === Math.round((390 / 157) * 1000) / 1000 && profileBandAspect(1440) === Math.round((1440 / 264) * 1000) / 1000)

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
