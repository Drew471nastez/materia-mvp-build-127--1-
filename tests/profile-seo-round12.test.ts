/**
 * ===========================================================================
 *  PROFILES AND SEO, ROUND 12
 * ===========================================================================
 *   ONE PROFILE   a person without a store gets the creator page's template
 *                 (its top bar, header, tabs, About and footer, in the
 *                 default scheme), without products and without Storelib's
 *                 header; a creator's /@handle is still a 308 to their page;
 *                 the round 10 shell is gone
 *   SHARING       a profile and a creator page carry title, description,
 *                 canonical, robots and one drawn picture (/member/<handle>/
 *                 share.png); a person's page says who it is about in
 *                 structured data
 *   POSTS         a post in a free, public community's open space is its own
 *                 result: title, words, canonical, indexable, Article, its
 *                 own picture; any other post says only which community it
 *                 is in, noindex, and nothing of the post
 *   LOCATION      city and country in Profile settings (a country by name,
 *                 kept as its code), saved only once part 98 has run, shown
 *                 quietly under the name
 *
 * Browser and picture measurements: scripts/check-profile-round12.mjs and
 * scripts/check-share-round12.mjs.
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { readCode } from "./_source"
import { CITY_MAX, cleanCity, cleanCountry, locationLine, missingLocationColumns, readProfileLocation } from "../lib/profile/location"
import { personJsonLd, profileMetadata, profileShareImageUrl, profileShareVersion } from "../lib/profile/profile-seo"
import { firstPicture, postArticleJsonLd, postHeadline, postMetadata, publicPost, type PostFacts } from "../app/(marketing)/community/[slug]/(member)/post/[postId]/post-seo"

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
const exists = (p: string) => {
  try {
    raw(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  /* ── 30. One profile system ──────────────────────────────────────────── */
  console.log("\nA person without a store: the creator page without products")
  const page = readCode("components/profile/member-profile-page.tsx")
  const creatorPage = readCode("app/(marketing)/u/[username]/page.tsx")
  check("the creator header, the underline tabs and the creator footer", /<ShopHeaderRenderer\b/.test(page) && /<StorefrontTabs tabs=\{tabs\} surface=\{storefrontTabsSurface\(chrome\)\} \/>/.test(page) && /<SellerFooter surface=\{storefrontFooterSurface\(chrome\)\} \/>/.test(page))
  check("  its own top bar, always, with the way back only when they came from somewhere", /<ProfileTopBar always initiallyShown=\{extras\.backShown\}/.test(page) && /if \(!shown && !always\) return null/.test(readCode("components/profile/profile-top-bar.tsx")) && /\{shown \? <BackChevron fallback=\{fallback\} \/> : null\}/.test(readCode("components/profile/profile-top-bar.tsx")))
  check("  the default scheme, the creator page's ground", /const chrome = PERSON_CHROME/.test(page) && /style=\{storefrontRootStyle\(chrome\)\}/.test(page) && /data-storefront-root=""/.test(page) && /PERSON_CHROME: StorefrontChrome = resolveStorefrontChrome\(undefined\)/.test(readCode("components/storefront/storefront-template.tsx")))
  check("  one template: the creator page hands its scheme to the same helpers", /style=\{storefrontRootStyle\(chrome\)\}/.test(creatorPage) && /surface=\{storefrontHeaderSurface\(chrome\)\}/.test(creatorPage) && /surface=\{storefrontTabsSurface\(chrome\)\}/.test(creatorPage) && /<SellerFooter surface=\{storefrontFooterSurface\(chrome\)\} \/>/.test(creatorPage))
  check("  no products, nothing sold: no product grid, no store link, no reviews", !/ProductGrid|products=\{profile\.products\}|getStoreInternalPath|ReviewsPanel/.test(page) && /products=\{\[\]\}/.test(page) && /productCount=\{0\}/.test(page))
  check("  Activity and Communities, About, followers and Follow", /label: "Activity"/.test(page) && /label: "Communities"/.test(page) && /<PersonAbout\b/.test(page) && /<ProfileSocial\b[\s\S]*?tone="storefront"/.test(page))
  check("  About without the shop's words", !/Returns|payment/i.test(readCode("components/profile/person-about.tsx")) && /About \{name\}/.test(readCode("components/profile/person-about.tsx")))
  check("  your own page: Edit profile on the cover, to Settings' Profile", /ownerActions=\{isSelf \? <PersonOwnerActions \/> : null\}/.test(page) && /PERSON_EDIT_HREF = "\/account\/settings\?section=profile"/.test(readCode("components/profile/person-owner-actions.tsx")))
  check("  no round 10 pieces: the hero, the owner pills and the shell are not on it", !/ProfileHero|ProfileOwnerPills|MemberProfileShell/.test(page) && !exists("components/profile/member-profile-shell.tsx") && !/MemberProfileShell|explore-ground/.test(readCode("app/(marketing)/member/[username]/page.tsx")))

  const header = readCode("components/marketing/conditional-header.tsx")
  check("no Storelib header (wishlist, library) over /@ and /member, on any domain", /p\.startsWith\("\/community\/"\) \|\| isProfilePath\(p\)/.test(header) && !/setShowPlatformHeader\(true\)\s*return\s*\}\s*\/\*\*\s*\* `isSellerPage`/.test(header) && !/isProfilePath\(pathname\) && onPlatformDomain/.test(header))
  const layout = readCode("app/(marketing)/member/[username]/layout.tsx")
  check("a creator's /@handle is still a 308 to their creator page", /permanentRedirect\(target\)/.test(layout) && /hasActiveStorefront\(creator\)/.test(layout))

  /* ── 31. Sharing a profile or a creator page ─────────────────────────── */
  console.log("\nA profile and a creator page in search and in a shared link")
  const facts = { name: "Maya Ortiz", username: "maya", bio: "Ceramics, glaze notes and a weekly studio.", avatarUrl: null, coverUrl: null, followers: 12, indexable: true }
  const meta = profileMetadata({ ...facts, location: "Lisbon, Portugal" })
  const og = meta.openGraph as { images: Array<{ url: string }>; url: string }
  check("title, description, canonical, indexed", meta.title === "Maya Ortiz (@maya)" && meta.description === facts.bio && (meta.alternates as { canonical: string }).canonical === "/@maya" && JSON.stringify(meta.robots).includes('"index":true'))
  check("the picture's address changes when where they are from does", og.images[0].url !== (profileMetadata({ ...facts, location: "Porto, Portugal" }).openGraph as typeof og).images[0].url && og.images[0].url.startsWith("https://storelib.com/member/maya/share.png?v="))
  check("  and not at all for somebody who never said (older links keep their picture)", (profileMetadata(facts).openGraph as typeof og).images[0].url === profileShareImageUrl("maya", profileShareVersion(["Maya Ortiz", "maya", facts.bio, null, null, 12])))
  const ld = personJsonLd(facts) as { "@type": string; mainEntity: { "@type": string; name: string; url: string } }
  check("a person's page says who it is about: ProfilePage, a Person", ld["@type"] === "ProfilePage" && ld.mainEntity["@type"] === "Person" && ld.mainEntity.name === "Maya Ortiz" && ld.mainEntity.url === "https://storelib.com/@maya")
  const route = readCode("app/(marketing)/member/[username]/page.tsx")
  check("  printed only when the page is in search", /\{indexable \? <script type="application\/ld\+json" dangerouslySetInnerHTML=\{\{ __html: jsonLdScript\(personJsonLd\(profile\)\) \}\} \/> : null\}/.test(route) && /const indexable = !scoreSignup\(\{ handle: profile\.username \}\)\.blocked/.test(route))
  check("a creator page's shared link: their chosen Social image, else the same drawn card", /chosenImage \|\|\s*profileShareImageUrl\(\s*handle,/.test(creatorPage) && /card: "summary_large_image"/.test(creatorPage) && !/profile\.avatar_url \|\|\s*avatarFromHeader \|\|\s*undefined/.test(creatorPage))
  const share = readCode("app/(marketing)/member/[username]/share.png/route.tsx")
  check("  the card draws a creator from their page's header: its cover, bio and photo, and how many products", /header\?\.coverImageUrl \|\| row\?\.cover_url/.test(share) && /products: creatorFace \? profile\.productCount : null/.test(share) && /keptPhoto\(header\?\.avatarUrl\)/.test(share))
  check("  and where they are from, for everybody", /location: locationLine\(place\)/.test(share) && /model\.location \?/.test(readCode("components/profile/profile-share-card.tsx")))
  check("  no \"0 followers\" on a new account's card", /model\.followers > 0 \?/.test(readCode("components/profile/profile-share-card.tsx")))

  /* ── 32. Community posts ─────────────────────────────────────────────── */
  console.log("\nA community post in search and in a shared link")
  const SECRET = "The glaze recipe is forty percent feldspar."
  const base: PostFacts = {
    community: { slug: "clay-studio", name: "Clay Studio", logo_url: "https://x.supabase.co/logo.png", visibility: "public", access: "free", status: "published", platform_hidden: false, suspended_at: null, deleted_at: null },
    space: { name: "Wins", view_access: {}, archived_at: null },
    post: { id: "11111111-1111-4111-8111-111111111111", title: "First bowl that did not collapse", bodyText: `Three weeks of practice and it finally held. ${SECRET}`, media: [{ type: "image", url: "https://x.supabase.co/bowl.webp" }], status: "published", deletedAt: null, createdAt: "2026-10-03T09:00:00Z", editedAt: null, commentCount: 14 },
    author: { name: "Maya Ortiz", username: "maya", avatarUrl: null },
  }
  const with_ = (c: Partial<PostFacts["community"]> = {}, s: PostFacts["space"] | undefined = undefined, p: Partial<PostFacts["post"]> = {}): PostFacts => ({ ...base, community: { ...base.community, ...c }, space: s === undefined ? base.space : s, post: { ...base.post, ...p } })
  check("public: a free, public community's open space, the post published", publicPost(base) && publicPost(with_({}, null)) && publicPost(with_({ status: "archived" })))
  check("public: a paid, public community's open space, the post published", publicPost(with_({ access: "paid" })))
  check("not public: private, unlisted, paid-but-private, invite only, hidden, suspended, a draft", [with_({ visibility: "private" }), with_({ visibility: "unlisted" }), with_({ access: "paid", visibility: "private" }), with_({ access: "invite_only" }), with_({ platform_hidden: true }), with_({ suspended_at: "2026-01-01" }), with_({ status: "draft" })].every((f) => !publicPost(f)))
  check("not public: a tier, product, level or role space, an archived space", [{ tierIds: ["t"] }, { productIds: ["p"] }, { minLevel: 3 }, { roles: ["admin" as never] }].every((rule) => !publicPost(with_({}, { name: "Pro", view_access: rule, archived_at: null }))) && !publicPost(with_({}, { name: "Old", view_access: {}, archived_at: "2026-01-01" })))
  check("not public: a removed or deleted post", !publicPost(with_({}, undefined, { status: "removed" })) && !publicPost(with_({}, undefined, { deletedAt: "2026-01-01" })))

  const pm = postMetadata(base)
  const pog = pm.openGraph as { type: string; url: string; images: Array<{ url: string; width: number; height: number }>; publishedTime: string; authors: string[]; section: string }
  const pmTitle = typeof pm.title === "string" ? pm.title : (pm.title as { absolute?: string } | null | undefined)?.absolute
  check("its own title (the post's, then the community), a description from its words", pmTitle === "First bowl that did not collapse · Clay Studio" && typeof pm.description === "string" && pm.description.startsWith("Three weeks of practice"))
  check("canonical /community/<slug>/post/<slug>-<shortId>, indexed with a large picture", (pm.alternates as { canonical: string }).canonical === "https://storelib.com/community/clay-studio/post/first-bowl-that-did-not-collapse-11111111" && JSON.stringify(pm.robots).includes('"index":true') && JSON.stringify(pm.robots).includes('"max-image-preview":"large"'))
  check("an article, with its date, author and space", pog.type === "article" && pog.publishedTime === "2026-10-03T09:00:00Z" && pog.authors[0] === "https://storelib.com/@maya" && pog.section === "Wins")
  check("its own picture, 1200 by 630, the address changing with an edit", pog.images[0].url.startsWith("https://storelib.com/community/clay-studio/post/11111111/share.png?v=") && pog.images[0].width === 1200 && pog.images[0].height === 630 && (postMetadata(with_({}, undefined, { title: "Edited" })).openGraph as typeof pog).images[0].url !== pog.images[0].url && (pm.twitter as { card: string }).card === "summary_large_image")
  check("without a title, the start of its words leads", postHeadline(with_({}, undefined, { title: null, bodyText: "Does anybody else find trimming harder than throwing?" })) === "Does anybody else find trimming harder than throwing?")
  check("the first picture: a photo, else a GIF still, a video poster, an embed or link picture; https only", firstPicture([{ type: "file", assetId: "a", name: "x" }, { type: "gif", url: "https://g/x.gif", still: "https://g/still.jpg" }]) === "https://g/still.jpg" && firstPicture([{ type: "image", url: "http://x/y.jpg" }]) === null && firstPicture([]) === null)

  const article = postArticleJsonLd(base) as Record<string, unknown> & { author: { name: string; url: string }; publisher: { name: string; logo: { url: string } }; image: string[] }
  check("Article structured data: headline, dates, author, the community as publisher, the real comment count", article["@type"] === "Article" && article.headline === "First bowl that did not collapse" && article.datePublished === "2026-10-03T09:00:00Z" && article.author.url === "https://storelib.com/@maya" && article.publisher.name === "Clay Studio" && article.publisher.logo.url === "https://x.supabase.co/logo.png" && article.commentCount === 14 && article.image[0] === "https://x.supabase.co/bowl.webp")

  /* Changed on purpose: 5b333801 (OG for paid public posts) lets a paid, public community's open post have its own preview, as the publicPost checks above say; the third generic case is the community that is still closed, an invite only one. */
  for (const [label, f] of [["a private community", with_({ visibility: "private" })], ["a tier space", with_({}, { name: "Pro", view_access: { tierIds: ["t"] }, archived_at: null })], ["an invite only community", with_({ access: "invite_only" })]] as const) {
    const m = postMetadata(f)
    const said = JSON.stringify(m)
    check(`${label}: noindex, a generic preview, nothing of the post`, JSON.stringify(m.robots).includes('"index":false') && m.title === "A post in Clay Studio" && !said.includes("feldspar") && !said.includes("First bowl") && !said.includes("Maya") && !said.includes("bowl.webp") && postArticleJsonLd(f) === null)
  }
  check("  the generic picture's address does not change with the post's words", (postMetadata(with_({ visibility: "private" }, undefined, { title: "A" })).openGraph as typeof pog).images[0].url === (postMetadata(with_({ visibility: "private" }, undefined, { title: "B", bodyText: "other" })).openGraph as typeof pog).images[0].url)

  const postPage = readCode("app/(marketing)/community/[slug]/(member)/post/[postId]/page.tsx")
  check("the post page asks the rows, never the viewer, for its metadata", /export async function generateMetadata/.test(postPage) && /const facts = await postFacts\(slug, postId\)/.test(postPage) && /return postMetadata\(facts\)/.test(postPage) && /if \(!facts\) return \{ robots: \{ index: false, follow: false \} \}/.test(postPage))
  check("  and prints the Article only for a public post", /const article = facts \? postArticleJsonLd\(facts\) : null/.test(postPage) && /\{article \? <script type="application\/ld\+json"/.test(postPage))
  const facts_ = readCode("app/(marketing)/community/[slug]/(member)/post/[postId]/post-facts.ts")
  check("  the facts: server only, cached per request, the post must belong to the community in the address", /^import "server-only"/.test(raw("app/(marketing)/community/[slug]/(member)/post/[postId]/post-facts.ts")) && /export const postFacts = cache\(/.test(facts_) && /parsePostParam/.test(facts_) && /\.eq\("community_id", community\.id\)/.test(facts_) && /if \(!\(await communitiesEnabled\(\)\)\) return null/.test(facts_))
  const postShare = readCode("app/(marketing)/community/[slug]/(member)/post/[postId]/share.png/route.tsx")
  check("the post's picture: the rule decides, the generic card reads nothing of the post", /if \(publicPost\(facts\)\)/.test(postShare) && /<GenericPostShareArt \{\.\.\.generic\} logoSrc=\{logoSrc\} \/>/.test(postShare) && /const generic = \{ communityName: facts\.community\.name, memberCount: facts\.communityRow\.member_count \?\? 0 \}/.test(postShare))
  check("  a 404 for no post, a deleted one, a draft or suspended community", /if \(!facts \|\| !sharePreviewable\(facts\.communityRow\)\) return notFound\(\)/.test(postShare) && /if \(facts\.post\.status === "deleted" \|\| facts\.post\.deletedAt\) return notFound\(\)/.test(postShare))
  check("  its fonts traced for the route", /'\/community\/\*\/post\/\*\/share\.png': \['\.\/lib\/checkout\/fonts\/\*\*'\]/.test(raw("next.config.mjs")))

  /* ── 33. Location ────────────────────────────────────────────────────── */
  console.log("\nWhere a person is from")
  check("a city as typed: spaces collapsed, at most 80 characters, empty is none", cleanCity("  Lisbon \n ") === "Lisbon" && cleanCity("") === null && cleanCity("   ") === null && cleanCity("x".repeat(120))!.length === CITY_MAX && cleanCity(42) === null)
  check("a country only as a real two letter code", cleanCountry("pt") === "PT" && cleanCountry("XX") === null && cleanCountry("Portugal") === null && cleanCountry("") === null)
  check("one quiet line: city and country by name, either alone, or nothing", locationLine({ city: "Lisbon", country: "PT" }) === "Lisbon, Portugal" && locationLine({ city: null, country: "US" }) === "United States" && locationLine({ city: "Lisbon", country: null }) === "Lisbon" && locationLine({ city: null, country: null }) === null && locationLine({ city: "Singapore", country: "SG" }) === "Singapore")
  check("a missing column is part 98 not run", missingLocationColumns({ code: "42703" }) && missingLocationColumns({ code: "PGRST204" }) && !missingLocationColumns({ code: "500" }) && !missingLocationColumns(null))
  const reader = (answer: { data: unknown; error: unknown }) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => answer }) }) }) })
  const before = await readProfileLocation(reader({ data: null, error: { code: "42703", message: "column profiles.location_city does not exist" } }), "u1")
  const after = await readProfileLocation(reader({ data: { location_city: " Lisbon ", location_country: "pt" }, error: null }), "u1")
  check("read: before part 98 not supported (no fields), after it cleaned", before.supported === false && before.city === null && after.supported && after.city === "Lisbon" && after.country === "PT")

  const settings = readCode("components/account/account-settings.tsx")
  const profileSection = settings.slice(settings.indexOf("function ProfileSection("), settings.indexOf("/* ── Account: email, password, leaving"))
  check("Settings: the fields in the Profile card, only once the columns are there", /\{location\.supported \? <LocationFields city=\{city\} country=\{country\} onCity=\{setCity\} onCountry=\{setCountry\} \/> : null\}/.test(profileSection))
  check("  saved with the rest of the card, only when changed: the city cleaned, the country as its code", /if \(placeChanged\) \{\s*patch\.location_city = nextCity\s*patch\.location_country = nextCountry/.test(profileSection) && /const placeChanged = location\.supported &&/.test(profileSection) && /\|\| handleChanged \|\| placeChanged/.test(profileSection))
  check("  the country picked by its name from every country", /\{COUNTRIES\.map\(\(c\) => \(\s*<option key=\{c\.code\} value=\{c\.code\}/.test(readCode("components/profile/location-fields.tsx")))
  /* Changed on purpose: 89c6f3ba moved the settings route's reads into lib/account/load-account-settings.ts, shared with the settings sheet's bundle route. */
  check("  the settings page reads it (unsupported before part 98)", /loadAccountSettingsForUser\(user,/.test(readCode("app/account/settings/page.tsx")) && /location: await locationRead,/.test(readCode("lib/account/load-account-settings.ts")) && /const locationRead = readProfileLocation\(admin, user\.id\)/.test(readCode("lib/account/load-account-settings.ts")))
  check("shown under the name on a person's page and a creator page", /location=\{extras\.location \?\? null\}/.test(page) && /location=\{locationLine\(place\)\}/.test(creatorPage) && /readProfileLocation\(createAdminClient\(\), profile\.id\)/.test(creatorPage) && /data-profile-location=""/.test(readCode("components/profile/profile-social.tsx")))

  console.log("\nThe copy")
  for (const f of [
    "components/profile/member-profile-page.tsx",
    "components/profile/person-about.tsx",
    "components/profile/person-owner-actions.tsx",
    "components/profile/location-fields.tsx",
    "components/storefront/storefront-template.tsx",
    "lib/profile/location.ts",
    "lib/profile/profile-seo.ts",
    "app/(marketing)/community/[slug]/(member)/post/[postId]/post-seo.ts",
    "app/(marketing)/community/[slug]/(member)/post/[postId]/post-facts.ts",
    "app/(marketing)/community/[slug]/(member)/post/[postId]/post-share-card.tsx",
    "app/(marketing)/community/[slug]/(member)/post/[postId]/share.png/route.tsx",
  ]) {
    const text = raw(f)
    check(`${f}: no em dashes, none of the banned words`, !/—/.test(text) && !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(text))
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
