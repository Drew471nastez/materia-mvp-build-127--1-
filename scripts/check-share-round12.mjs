/**
 * ===========================================================================
 *  ROUND 12: THE PICTURES A SHARED PROFILE, CREATOR PAGE AND POST SHOW,
 *  DRAWN BY THE REAL ROUTES AND LOOKED AT
 * ===========================================================================
 * The real routes (app/(storelib)/(marketing)/member/[username]/share.png and
 * app/(storelib)/(marketing)/community/[slug]/(member)/post/[postId]/share.png), the
 * real picture cutting (lib/communities/server/share-image, sharp) and the
 * real art, drawn by next/og exactly as the server draws them. Only the
 * database and the network are answered here.
 *
 *   PERSON      a person without a store: cover, photo, name, @handle,
 *               "Lisbon, Portugal", bio, followers, communities
 *   PERSON BARE no photo, no cover, no location: the default face, still drawn
 *   CREATOR     a creator: their page's header cover and bio, products count
 *   POST        a post in a free public community's open space: its title,
 *               words, first picture, author and the community's logo
 *   POST PLAIN  no picture, no title: the start of its words leads
 *   PRIVATE     the same post in a private community, a tier only space, a
 *               paid community: the generic card, and none of the post's
 *               words anywhere in what the route read into it
 *   NOT FOUND   no such post, a post of another community, a deleted post,
 *               communities off: 404
 *
 *   node scripts/check-share-round12.mjs
 * Pictures go to SHOTS_DIR (printed at the end): look at them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import sharp from "sharp"

const root = process.cwd()
const shots = process.env.SHOTS_DIR || mkdtempSync(join(tmpdir(), "storelib-share-r12-"))
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)
const PICTURES = {
  "https://x.supabase.co/cover.webp": await sharp(svg(1600, 600, `<rect width="1600" height="600" fill="#cfdbd5"/><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/>`)).webp().toBuffer(),
  "https://x.supabase.co/face.jpg": await sharp(svg(300, 300, `<rect width="300" height="300" fill="#9fb3a8"/><circle cx="150" cy="122" r="56" fill="#eef2ee"/><rect x="66" y="200" width="168" height="130" rx="70" fill="#eef2ee"/>`)).jpeg().toBuffer(),
  "https://x.supabase.co/logo.png": await sharp(svg(400, 400, `<rect width="400" height="400" rx="88" fill="#1a1a2e"/><path d="M118 270 L200 126 L282 270 Z" fill="#f4efe6"/>`)).png().toBuffer(),
  "https://x.supabase.co/bowl.webp": await sharp(svg(1200, 900, `<rect width="1200" height="900" fill="#e8dccb"/><ellipse cx="600" cy="560" rx="360" ry="190" fill="#a27b55"/><ellipse cx="600" cy="470" rx="360" ry="120" fill="#c69c71"/><ellipse cx="600" cy="470" rx="300" ry="86" fill="#7d5a3a"/>`)).webp().toBuffer(),
}

const dir = join(root, ".share-r12-probe")
mkdirSync(dir, { recursive: true })
try {
  writeFileSync(
    join(dir, "stubs.js"),
    `
const S = globalThis.__r12 ||= { on: true, profiles: {}, creators: {}, configs: {}, communities: {}, posts: {}, spaces: {}, people: {} }
export const communitiesEnabled = async () => S.on
export async function loadMemberProfile(handle) { return S.profiles[handle] ?? null }
export async function profileCommunities() { return { owned: [{}], member: [{}, {}] } }
export async function loadCreatorForUser(userId) { return S.creators[userId] ?? null }
export async function getPublishedConfig(creatorId) { return S.configs[creatorId] ?? null }
export async function fetchImageBytes(url) { const b = (globalThis.__pictures || {})[url]; return b ? new Uint8Array(b) : null }
export async function cardsFor() { return [] }
export function sharePreviewable(c) { return c.status !== "draft" && c.status !== "suspended" && !c.suspended_at && !c.deleted_at }
export async function loadCommunity(_db, key) { return S.communities[key.slug] ?? null }
/* The service role's reads: profiles (location, an author), the feed post, its space. */
function table(name) {
  const eq = {}
  const b = {
    select() { return b }, is() { return b },
    eq(col, v) { eq[col] = v; return b },
    maybeSingle: async () => {
      if (name === "profiles") {
        const p = S.people[eq.id]
        return p ? { data: p, error: null } : { data: null, error: null }
      }
      if (name === "community_feed_posts") {
        const p = S.posts[eq.id]
        return { data: p && p.community_id === eq.community_id ? p : null, error: null }
      }
      if (name === "community_spaces") return { data: S.spaces[eq.id] ?? null, error: null }
      return { data: null, error: null }
    },
  }
  return b
}
export const admin = () => ({ from: table })
export const createAdminClient = () => ({ from: table })
`,
  )
  writeFileSync(
    join(dir, "entry.ts"),
    `export { GET as PROFILE } from "../app/(storelib)/(marketing)/member/[username]/share.png/route"\nexport { GET as POST } from "../app/(storelib)/(marketing)/community/[slug]/(member)/post/[postId]/share.png/route"\nexport { postFacts } from "../app/(storelib)/(marketing)/community/[slug]/(member)/post/[postId]/post-facts"\n`,
  )
  const stubs = join(dir, "stubs.js")
  await build({
    entryPoints: [join(dir, "entry.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    outfile: join(dir, "routes.mjs"),
    absWorkingDir: root,
    logLevel: "error",
    external: ["next/og", "react", "react/jsx-runtime", "sharp"],
    plugins: [
      {
        name: "stubs",
        setup(b) {
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: stubs }))
          b.onResolve(
            { filter: /^@\/lib\/(communities\/(flag|server\/context|server\/db|server\/public)|profile\/(member-profile-data|profile-communities)|commerce\/creator-page-data|store-builder\/get-published-config|onepage\/share-image|supabase\/admin)$/ },
            () => ({ path: stubs }),
          )
          b.onResolve({ filter: /^\.\/public$|^\.\/db$/ }, (a) => (a.importer.includes("lib/communities/server") ? { path: stubs } : undefined))
          b.onResolve({ filter: /^next\/og$/ }, () => ({ path: "next/og.js", external: true }))
        },
      },
    ],
    alias: { "@": "." },
  })
  globalThis.__pictures = PICTURES
  const { PROFILE, POST, postFacts } = await import(pathToFileURL(join(dir, "routes.mjs")).href)
  const S = globalThis.__r12

  const person = (over) => ({
    userId: "u-maya", name: "Maya Ortiz", username: "maya", avatarUrl: "https://x.supabase.co/face.jpg", coverUrl: "https://x.supabase.co/cover.webp",
    bio: "Learning to throw pots. Night runs on Tuesdays.", hasStorefront: false, creatorId: null, followers: 128, following: 41, productCount: 0,
    privacy: { showActivity: true, showCommunities: true }, ...over,
  })
  S.profiles.maya = person({})
  S.profiles.theo = person({ userId: "u-theo", name: "Theo Grant", username: "theo", avatarUrl: null, coverUrl: null, bio: null, followers: 0 })
  S.profiles.calvin = person({ userId: "u-calvin", name: "Calvin Reyes", username: "calvin", hasStorefront: true, creatorId: "c-calvin", coverUrl: null, avatarUrl: null, productCount: 12, followers: 2400, bio: "Profile bio" })
  S.creators["u-calvin"] = { cover_url: "https://x.supabase.co/old.webp", bio: "Store bio" }
  S.configs["c-calvin"] = { headerSettings: { coverImageUrl: "https://x.supabase.co/cover.webp", bio: "Hand tools, slow furniture and the odd disaster. New plans every month.", avatarUrl: "https://x.supabase.co/face.jpg", showBio: true } }
  S.people["u-maya"] = { location_city: "Lisbon", location_country: "PT", display_name: "Maya Ortiz", username: "maya", avatar_url: "https://x.supabase.co/face.jpg" }
  S.people["u-calvin"] = { location_city: null, location_country: "US" }

  const save = async (res, name) => {
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(join(shots, `${name}.png`), buf)
    const meta = await sharp(buf).metadata()
    return { bytes: buf.length, width: meta.width, height: meta.height, format: meta.format }
  }
  const drawn = async (res, name) => {
    const info = res.status === 200 ? await save(res, name) : null
    expect(res.status === 200 && info?.format === "png" && info.width === 1200 && info.height === 630 && info.bytes > 10_000, `${name}: a 1200 by 630 PNG`, { status: res.status, ...info })
    expect(res.headers.get("cache-control") === "public, max-age=300, s-maxage=600, stale-while-revalidate=86400" && res.headers.get("x-robots-tag") === "noindex", `${name}: kept briefly, never indexed itself`)
  }

  console.log("\nProfiles and creator pages")
  const profile = (h) => PROFILE(new Request(`https://storelib.com/member/${h}/share.png`), { params: Promise.resolve({ username: h }) })
  await drawn(await profile("maya"), "share-person")
  await drawn(await profile("theo"), "share-person-bare")
  await drawn(await profile("calvin"), "share-creator")
  expect((await profile("nobody")).status === 404, "an unknown handle: 404")
  expect((await profile("..%2Fetc")).status === 404, "a handle that cannot be one: 404")

  console.log("\nPosts")
  const community = (over) => ({ id: "cm1", slug: "clay-studio", name: "Clay Studio", logo_url: "https://x.supabase.co/logo.png", visibility: "public", access: "free", status: "published", platform_hidden: false, suspended_at: null, deleted_at: null, member_count: 1240, ...over })
  S.communities["clay-studio"] = community({})
  S.communities["inner-circle"] = community({ id: "cm2", slug: "inner-circle", name: "Inner Circle", visibility: "private" })
  S.communities["paid-club"] = community({ id: "cm3", slug: "paid-club", name: "Paid Club", access: "paid", logo_url: null })
  S.communities["other"] = community({ id: "cm9", slug: "other", name: "Other" })
  S.spaces.s1 = { name: "Wins", view_access: {}, archived_at: null }
  S.spaces.s2 = { name: "Pro", view_access: { tierIds: ["t1"] }, archived_at: null }
  const SECRET = "The glaze recipe is 40 percent feldspar and nobody outside should read it."
  const post = (id, over) => ({ id, community_id: "cm1", space_id: "s1", author_id: "u-maya", title: "First bowl that did not collapse", body_text: "Three weeks of practice and it finally held its shape. Centering was the whole trick: slow wheel, wet hands, elbows locked.", media: [{ type: "image", url: "https://x.supabase.co/bowl.webp" }], status: "published", deleted_at: null, created_at: "2026-10-03T09:00:00Z", edited_at: null, comment_count: 14, ...over })
  const P = {
    public: "11111111-1111-4111-8111-111111111111",
    plain: "22222222-2222-4222-8222-222222222222",
    private: "33333333-3333-4333-8333-333333333333",
    tier: "44444444-4444-4444-8444-444444444444",
    paid: "55555555-5555-4555-8555-555555555555",
    deleted: "66666666-6666-4666-8666-666666666666",
  }
  S.posts[P.public] = post(P.public, {})
  S.posts[P.plain] = post(P.plain, { title: null, media: [], comment_count: 0, body_text: "Does anybody else find trimming harder than throwing? My feet keep coming out lopsided and I am not sure if it is the clay or me." })
  S.posts[P.private] = post(P.private, { community_id: "cm2", space_id: null, title: "Members only plans", body_text: SECRET })
  S.posts[P.tier] = post(P.tier, { space_id: "s2", title: "Pro glaze notes", body_text: SECRET })
  S.posts[P.paid] = post(P.paid, { community_id: "cm3", space_id: null, title: "Paid notes", body_text: SECRET })
  S.posts[P.deleted] = post(P.deleted, { status: "deleted", deleted_at: "2026-10-04T00:00:00Z" })
  const ask = (slug, id) => POST(new Request(`https://storelib.com/community/${slug}/post/${id}/share.png`), { params: Promise.resolve({ slug, postId: id }) })
  await drawn(await ask("clay-studio", P.public), "share-post")
  await drawn(await ask("clay-studio", P.plain), "share-post-plain")
  await drawn(await ask("inner-circle", P.private), "share-post-private")
  await drawn(await ask("clay-studio", P.tier), "share-post-tier-space")
  await drawn(await ask("paid-club", P.paid), "share-post-paid")

  /* The generic card is the same picture whatever the post says: nothing of it was drawn. */
  const sameAs = async (a, b) => Buffer.compare(Buffer.from(await (await ask(...a)).arrayBuffer()), Buffer.from(await (await ask(...b)).arrayBuffer())) === 0
  S.posts["77777777-7777-4777-8777-777777777777"] = post("77777777-7777-4777-8777-777777777777", { space_id: "s2", title: "Something else entirely", body_text: "Other words", media: [] })
  expect(await sameAs(["clay-studio", P.tier], ["clay-studio", "77777777-7777-4777-8777-777777777777"]), "two restricted posts with different words draw the same generic picture (nothing of the post in it)")

  console.log("\nNot drawn")
  expect((await ask("clay-studio", "99999999-9999-4999-8999-999999999999")).status === 404, "no such post: 404")
  expect((await ask("other", P.public)).status === 404, "a post of another community, asked under this one: 404")
  expect((await ask("clay-studio", P.deleted)).status === 404, "a deleted post: 404")
  expect((await ask("clay-studio", "not-a-uuid")).status === 404, "not an id: 404")
  S.on = false
  expect((await ask("clay-studio", P.public)).status === 404, "communities switched off: 404")
  S.on = true

  const facts = await postFacts("clay-studio", P.public)
  expect(facts?.author?.name === "Maya Ortiz" && facts.space?.name === "Wins" && facts.post.commentCount === 14, "the facts: author, space, real comment count", facts && { author: facts.author, space: facts.space?.name })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nPictures: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
