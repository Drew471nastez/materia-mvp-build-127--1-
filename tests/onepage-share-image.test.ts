/**
 * ===========================================================================
 *  THE PICTURE A SHARED ONEPAGE LINK SHOWS
 * ===========================================================================
 * "By default, the card for the shared link should not be the card. It
 * should be the image avatar of the OnePage." Three choices, the profile
 * photo first (lib/onepage/seo pickShareImage). Pinned here:
 *
 *   CHOOSING      each choice, each fallback (no photo, nothing uploaded),
 *                 a database without the column (the settings, then the
 *                 photo), a value that is not one of the three
 *   THE TAGS      og:image, its size and type, twitter:card and
 *                 twitter:image for each choice, from the resolver and from
 *                 the public page's real generateMetadata
 *   THE ROUTE     PUT /api/onepage writes the column, refuses a fourth
 *                 choice, and keeps the choice in the settings when the
 *                 column is not there yet
 *   THE PHOTO     /<slug>/links/photo.jpg answers a 600 by 600 JPEG from
 *                 any picture, a year for the current `v`, the card for a
 *                 page with no photo; the card route draws the card, not an
 *                 upload that is not chosen
 *   THE SQL       run-now part 57, its check column, the editor's three cards
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import sharp from "sharp"
import { fakeDb } from "./_fake-db"
import {
  PROFILE_IMAGE_SIZE,
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  onePageMetadataFrom,
  photoAtSize,
  pickShareImage,
  resolveOnePageSeo,
  shareImageModeOf,
} from "@/lib/onepage/seo"
import { checkSettingsPatch } from "@/lib/onepage/settings-rules"
import { imageInfo } from "@/lib/onepage/share-image"
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
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}

const PAGE_URL = "https://storelib.me/satori"
const PHOTO = "https://x.supabase.co/storage/v1/object/public/avatars/u/me.jpg"
const UPLOAD = "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/og.jpg"
const THEME = { background_type: "solid", background_color: "#1A2E1A", text_color: "#eef2ec", button_color: "#ff0000" }
const resolve = (over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) =>
  resolveOnePageSeo({ name: "Satori Studio", bio: "Prints and posters", handle: "satori", avatarUrl: PHOTO, theme: THEME, settings, pageUrl: PAGE_URL, ...over })

function choosing() {
  console.log("\nEach choice")
  const p = resolve()
  check("nothing chosen: the profile photo", p.image.mode === "profile" && p.image.source === "profile" && p.image.fallback === null && p.image.photoUrl === PHOTO)
  check("at its own address beside the page, 600 square, a JPEG", /^https:\/\/storelib\.com\/satori\/links\/photo\.jpg\?v=[a-z0-9]{6,12}$/.test(p.image.url) && p.image.width === 600 && p.image.height === 600 && p.image.type === "image/jpeg", p.image.url)
  check("a summary card on X, as Linktree and Beacons send it", p.image.twitterCard === "summary")
  const c = resolve({ shareImageMode: "card" })
  check("the card: the page's card, 1200 by 630, a PNG, a large card", c.image.source === "generated" && c.image.fallback === null && /\/satori\/links\/share\.png\?v=/.test(c.image.url) && c.image.width === 1200 && c.image.height === 630 && c.image.type === "image/png" && c.image.twitterCard === "summary_large_image")
  const u = resolve({ shareImageMode: "custom" }, { social_image_url: UPLOAD, social_image_position_x: 20, social_image_position_y: 80 })
  check("a picture of their own: the upload, on the card's address, 1200 by 630", u.image.source === "custom" && u.image.customUrl === UPLOAD && /\/share\.png\?v=/.test(u.image.url) && u.image.twitterCard === "summary_large_image")
  check("the card chosen with an upload still there: the card, not the upload", resolve({ shareImageMode: "card" }, { social_image_url: UPLOAD }).image.source === "generated")
  check("the photo chosen with an upload still there: the photo", resolve({ shareImageMode: "profile" }, { social_image_url: UPLOAD }).image.source === "profile")

  console.log("\nWhen a choice has nothing to show")
  const noPhoto = resolve({ avatarUrl: null })
  check("no photo at all: the card, and it says why", noPhoto.image.mode === "profile" && noPhoto.image.source === "generated" && noPhoto.image.fallback === "no-photo" && noPhoto.image.twitterCard === "summary_large_image")
  check("a photo that is not an https address is no photo", ["http://x.co/a.jpg", "data:image/png;base64,AAAA", "https://127.0.0.1/a.jpg", ""].every((a) => resolve({ avatarUrl: a }).image.source === "generated"))
  const noUpload = resolve({ shareImageMode: "custom" })
  check("a picture of their own with nothing uploaded: the photo, and it says why", noUpload.image.source === "profile" && noUpload.image.fallback === "no-upload")
  const nothing = resolve({ shareImageMode: "custom", avatarUrl: null })
  check("and with no photo either: the card", nothing.image.source === "generated" && nothing.image.fallback === "no-upload")
  check("the card never falls back: it always draws", resolve({ shareImageMode: "card", avatarUrl: null }).image.fallback === null)
  check("pickShareImage, all six", JSON.stringify([
    pickShareImage("profile", { photoUrl: PHOTO, customUrl: null }),
    pickShareImage("profile", { photoUrl: null, customUrl: UPLOAD }),
    pickShareImage("card", { photoUrl: PHOTO, customUrl: UPLOAD }),
    pickShareImage("custom", { photoUrl: PHOTO, customUrl: UPLOAD }),
    pickShareImage("custom", { photoUrl: PHOTO, customUrl: null }),
    pickShareImage("custom", { photoUrl: null, customUrl: null }),
  ].map((x) => `${x.source}/${x.fallback}`)) === JSON.stringify(["profile/null", "generated/no-photo", "generated/null", "custom/null", "profile/no-upload", "generated/no-upload"]))

  console.log("\nA database without the column")
  check("no column and no setting: the profile photo", shareImageModeOf({ settings: { show_branding: true } }) === "profile" && shareImageModeOf(null) === "profile" && shareImageModeOf({}) === "profile")
  check("no column: the choice kept in the settings", shareImageModeOf({ settings: { share_image_mode: "card" } }) === "card" && resolve({}, { share_image_mode: "card" }).image.source === "generated")
  check("the column, when it is there, over the settings", shareImageModeOf({ share_image_mode: "profile", settings: { share_image_mode: "card" } }) === "profile" && resolve({ shareImageMode: "profile" }, { share_image_mode: "card" }).image.source === "profile")
  check("a null column reads the settings", shareImageModeOf({ share_image_mode: null, settings: { share_image_mode: "custom" } }) === "custom")
  check("anything but the three is the profile photo", ["banner", "", 3, "PROFILE", { a: 1 }].every((v) => shareImageModeOf({ share_image_mode: v, settings: { share_image_mode: v } }) === "profile"))

  console.log("\nA new address when the picture changes")
  check("a new photo, a new address", resolve({ avatarUrl: "https://x.supabase.co/storage/v1/object/public/avatars/u/new.jpg" }).image.url !== p.image.url)
  check("a rename or a new theme leaves the photo's address alone", resolve({ name: "Kyoto Riso", theme: { ...THEME, background_color: "#000000" } }).image.url === p.image.url)
  check("switching the choice switches the address", new Set([p.image.url, c.image.url, u.image.url]).size === 3)
  check("and switching back gives the photo's address back", resolve({ shareImageMode: "profile" }).image.url === p.image.url)

  console.log("\nA Google account photo")
  check("asked for at 600, not blown up from 96", photoAtSize("https://lh3.googleusercontent.com/a/ACg8ocK123=s96-c") === "https://lh3.googleusercontent.com/a/ACg8ocK123=s600-c")
  check("one with no size is given one", photoAtSize("https://lh3.googleusercontent.com/a/ACg8ocK123") === "https://lh3.googleusercontent.com/a/ACg8ocK123=s600-c")
  check("any other address is fetched as it is", photoAtSize(PHOTO) === PHOTO && photoAtSize("not a url") === "not a url")
}

function tags() {
  console.log("\nThe tags each choice gives")
  for (const [label, seo, want] of [
    ["profile photo", resolve(), { card: "summary", w: 600, h: 600, type: "image/jpeg", path: "/links/photo.jpg" }],
    ["share card", resolve({ shareImageMode: "card" }), { card: "summary_large_image", w: 1200, h: 630, type: "image/png", path: "/links/share.png" }],
    ["custom image", resolve({ shareImageMode: "custom" }, { social_image_url: UPLOAD }), { card: "summary_large_image", w: 1200, h: 630, type: "image/png", path: "/links/share.png" }],
    ["no photo", resolve({ avatarUrl: null }), { card: "summary_large_image", w: 1200, h: 630, type: "image/png", path: "/links/share.png" }],
  ] as const) {
    const m = onePageMetadataFrom(seo, { handle: "satori", indexable: true }) as any
    const img = m.openGraph.images[0]
    check(
      `${label}: og:image, its size and type, twitter:card and twitter:image`,
      img.url === seo.image.url && img.url.includes(want.path) && img.width === want.w && img.height === want.h && img.type === want.type && m.twitter.card === want.card && m.twitter.images[0] === img.url && img.url.startsWith("https://storelib.com/"),
      { img, twitter: m.twitter },
    )
    check(`${label}: never a /_next/image address`, !/_next\/image/.test(img.url))
  }
  check("the sizes the tags name are the sizes served", PROFILE_IMAGE_SIZE === 600 && SHARE_IMAGE_WIDTH === 1200 && SHARE_IMAGE_HEIGHT === 630)
}

function settingsRules() {
  console.log("\nThe choice kept in the settings")
  check("one of the three is kept", checkSettingsPatch({ share_image_mode: "card" }).ok)
  check("a fourth is refused with a sentence", !checkSettingsPatch({ share_image_mode: "banner" }).ok && /share image/.test((checkSettingsPatch({ share_image_mode: "banner" }) as any).error))
}

/* ─── The real routes, with the database and the network swapped ─────────── */

const S: any = ((globalThis as any).__shareStubs = { admin: null, server: null, user: null, fetch: null })
const dir = mkdtempSync(join(tmpdir(), "onepage-share-image-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__shareStubs.admin\n`),
  "@/lib/supabase/server": stub(
    "server",
    `export const createClient = async () => ({ ...globalThis.__shareStubs.server, from: (t) => globalThis.__shareStubs.server.from(t), auth: { getUser: async () => ({ data: { user: globalThis.__shareStubs.user }, error: null }) } })\n`,
  ),
  /* Changed on purpose (rel-public): the OnePage's held owner is tagged by the creator's domains (lib/onepage/published-page). */
  /* Changed on purpose (OnePage production audit, S2): the save route publishes in the same write, and what a publish does after it (lib/seo/announce, lib/social/onepage-sync, lib/storefront/creator-page-purge) names these too; not this suite's subject. */
  "@/lib/custom-domains/store": stub("domains", `export const primaryHostFor = async () => null\nexport const creatorDomainsTag = (id) => "custom-domains:" + id\nexport const isMissingColumn = () => false\nexport const isMissingTable = () => false\n`),
  "@/lib/website-builder/site-seo-data": stub("site-seo", `export const activeDomainOf = async () => null\nexport const formerSiteAddresses = async () => []\nexport const siteSeo = async () => null\n`),
  /* Round 49 (edge): a OnePage change also refreshes its stored copy (lib/onepage/public-cache, a lazy import of lib/edge/snapshot-capture, which reaches the whole site SEO graph); not this suite's subject, and run after the answer in the app. */
  "@/lib/edge/snapshot-capture": stub("snapshot-capture", `export const later = () => {}\nexport const refreshOnePageSnapshot = async () => {}\nexport const keepPageFresh = () => {}\nexport const refreshSiteSoon = () => {}\nexport const refreshSiteSnapshot = async () => null\nexport const backfillSiteCopies = async () => false\n`),
  /* Changed on purpose (OnePage editor fixes 2): the save route also asks which products its blocks name (productIdsInBlocks) and takes deleted ones out (withoutProduct, through lib/onepage/product-removals). */
  "@/lib/onepage/live-products": stub("live", `export const withLiveProducts = async (_db, _id, blocks) => blocks\nexport const productIdsInBlocks = () => []\nexport const withoutProduct = (blocks) => blocks\n`),
  "@/components/onepage/public-onepage": stub("public", `export const PublicOnePage = () => null\n`),
  "@/components/analytics/track-view": stub("track", `export const TrackView = () => null\n`),
  "@/components/attribution/capture-touch": stub("touch", `export const CaptureTouch = () => null\n`),
  "@/lib/onepage/ensure-onepage": stub("ensure", `export const ensureOnePage = async () => null\n`),
  /* Changed on purpose (round AR): the page now reaches the OnePage integrations (lib/onepage/integrations/post-public), which name publicLookup and publicUrlProblem; not this suite's subject. */
  "@/lib/api/public-fetch": stub("fetch", `export const fetchPublic = async (url) => globalThis.__shareStubs.fetch(url)\nexport const publicLookup = () => {}\nexport const publicUrlProblem = () => null\nexport const isPrivateAddress = () => false\nexport const redirectTarget = async () => null\n`),
  "next/navigation": stub("nav", `export const notFound = () => { throw new Error("NOT_FOUND") }\nexport const permanentRedirect = () => {}\nexport const redirect = () => {}\nexport const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`),
  "next/og": stub(
    "og",
    `import { createRequire } from "node:module"\nconst require = createRequire(${JSON.stringify(join(process.cwd(), "package.json"))})\nexport const ImageResponse = require("next/og").ImageResponse\n`,
  ),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__onepage-share-image__", entry.replace(/[^\w]+/g, "_") + ".mjs")
  await build({
    entryPoints: [join(process.cwd(), entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    logLevel: "error",
    alias: { "@": process.cwd() },
    packages: "external",
    plugins: [
      {
        name: "stand-ins",
        setup(b) {
          const names = new Set(Object.keys(stubs))
          b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined))
        },
      },
    ],
    external: ["next/*", "server-only", "sharp"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

const OWNER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const PAGE = "44444444-4444-4444-8444-444444444444"
const ROW = {
  id: PAGE,
  owner_id: OWNER,
  seller_id: CREATOR,
  creator_id: CREATOR,
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints and posters",
  avatar_url: PHOTO,
  theme: THEME,
  settings: { show_branding: true },
  social_links: {},
  draft_blocks: [],
  status: "published",
  published_blocks: [],
  published_theme: THEME,
  published_profile: { title: "Satori Studio", bio: "Prints and posters", avatar_url: PHOTO },
}

function world(row: Record<string, any>, profilePhoto: string | null = PHOTO) {
  return fakeDb({
    onepages: [row],
    creators: [{ id: CREATOR, user_id: OWNER, banned_at: null, subscription_plan_id: "free", subscription_status: "active" }],
    profiles: [{ id: OWNER, username: "satori", display_name: "Satori Studio", avatar_url: profilePhoto }],
    products: [{ id: "p1", creator_id: CREATOR, status: "published" }],
  })
}

/** A database with no share_image_mode column: an update naming it fails as PostgREST fails it. */
function withoutColumn(db: ReturnType<typeof fakeDb>) {
  return {
    ...db,
    from(table: string) {
      const q = db.from(table) as any
      if (table !== "onepages") return q
      const update = q.update.bind(q)
      q.update = (payload: Record<string, unknown>) => {
        if ("share_image_mode" in payload) {
          const failing: any = new Proxy({}, { get: (_t, k) => (k === "then" ? (r: any) => r({ data: null, error: { code: "PGRST204", message: "Could not find the 'share_image_mode' column of 'onepages' in the schema cache" } }) : () => failing) })
          return failing
        }
        return update(payload)
      }
      return q
    },
  }
}

async function routes() {
  const page = (await import(await bundle("app/(storelib)/(marketing)/l/[slug]/page.tsx"))) as any
  const route = (await import(await bundle("app/api/onepage/route.ts"))) as any
  const photo = (await import(await bundle("app/(storelib)/(marketing)/[sellername]/links/photo.jpg/route.ts"))) as any
  const card = (await import(await bundle("app/(storelib)/(marketing)/[sellername]/links/share.png/route.tsx"))) as any

  console.log("\nThe public page's metadata")
  const meta = async (row: Record<string, any>, profilePhoto: string | null = PHOTO) => {
    S.admin = world(row, profilePhoto)
    return page.generateMetadata({ params: Promise.resolve({ slug: "satori" }) })
  }
  let m = await meta(ROW)
  check("a page from before the column: the photo, a summary card", /\/satori\/links\/photo\.jpg\?v=/.test(m.openGraph.images[0].url) && m.openGraph.images[0].width === 600 && m.openGraph.images[0].type === "image/jpeg" && m.twitter.card === "summary", { og: m.openGraph.images, tw: m.twitter })
  m = await meta({ ...ROW, share_image_mode: "card" })
  check("the column says card: the card, a large card", /\/share\.png\?v=/.test(m.openGraph.images[0].url) && m.openGraph.images[0].width === 1200 && m.twitter.card === "summary_large_image")
  m = await meta({ ...ROW, settings: { ...ROW.settings, share_image_mode: "card" } })
  check("no column, the choice in the settings: the card", /\/share\.png\?v=/.test(m.openGraph.images[0].url))
  m = await meta({ ...ROW, share_image_mode: "profile", settings: { ...ROW.settings, share_image_mode: "card" } })
  check("the column over the settings, as after part 57", /\/photo\.jpg\?v=/.test(m.openGraph.images[0].url))
  m = await meta({ ...ROW, share_image_mode: "custom", settings: { ...ROW.settings, social_image_url: UPLOAD } })
  check("custom with an upload: the upload's address, a large card", /\/share\.png\?v=/.test(m.openGraph.images[0].url) && m.twitter.card === "summary_large_image")
  m = await meta({ ...ROW, avatar_url: null, published_profile: { ...ROW.published_profile, avatar_url: null } }, null)
  check("no photo anywhere: the card", /\/share\.png\?v=/.test(m.openGraph.images[0].url) && m.twitter.card === "summary_large_image")
  m = await meta({ ...ROW, avatar_url: null, published_profile: { ...ROW.published_profile, avatar_url: null } }, PHOTO)
  check("no photo on the page, one on the profile: the profile's", /\/photo\.jpg\?v=/.test(m.openGraph.images[0].url))
  check("og:image and twitter:image are one address", m.twitter.images[0] === m.openGraph.images[0].url)

  console.log("\nPUT /api/onepage")
  const put = async (body: Record<string, unknown>, missing = false) => {
    const db = world({ ...ROW })
    S.admin = db
    S.server = missing ? withoutColumn(db) : db
    S.user = { id: OWNER }
    const res = await route.PUT(new Request("https://storelib.test/api/onepage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: PAGE, ...body }) }))
    return { res, body: await res.json().catch(() => ({})), row: db.tables.onepages[0] }
  }
  let r = await put({ share_image_mode: "card" })
  check("the choice is written to its column", r.res.status === 200 && r.row.share_image_mode === "card" && r.row.settings.share_image_mode === undefined, r.row)
  r = await put({ share_image_mode: "banner" })
  check("a fourth choice is refused with a sentence, nothing written", r.res.status === 400 && /share image/.test(r.body.error) && r.row.share_image_mode === undefined)
  r = await put({ share_image_mode: null, title: "Satori" })
  check("null is not a choice and is not written", r.res.status === 200 && r.row.share_image_mode === undefined && r.row.title === "Satori")
  r = await put({ share_image_mode: "custom", settings: { social_image_url: UPLOAD } }, true)
  check("no column yet: kept in the settings, with the rest of the save", r.res.status === 200 && r.row.share_image_mode === undefined && r.row.settings.share_image_mode === "custom" && r.row.settings.social_image_url === UPLOAD && r.row.settings.show_branding === true, r.row)
  r = await put({ share_image_mode: "card" }, true)
  check("and with nothing else in the save", r.res.status === 200 && r.row.settings.share_image_mode === "card" && r.row.settings.show_branding === true)
  r = await put({ title: "Satori" }, true)
  check("a save that does not name it never touches it", r.res.status === 200 && r.row.settings.share_image_mode === undefined)

  console.log("\nThe photo route")
  const source = await sharp({ create: { width: 900, height: 500, channels: 4, background: { r: 200, g: 60, b: 40, alpha: 0.5 } } }).webp().toBuffer()
  const asked: string[] = []
  S.fetch = async (url: string) => {
    asked.push(url)
    return url.includes("broken") ? new Response(new Uint8Array([1, 2, 3])) : new Response(new Uint8Array(source))
  }
  S.admin = world({ ...ROW })
  let seen = resolve()
  const v = new URL(seen.image.url).searchParams.get("v")
  let res = await photo.GET(new Request(`https://storelib.com/satori/links/photo.jpg?v=${v}`), { params: Promise.resolve({ sellername: "satori" }) })
  const bytes = new Uint8Array(await res.arrayBuffer())
  const info = imageInfo(bytes)
  check("a WebP photo, 900 by 500, comes back a 600 by 600 JPEG", res.status === 200 && res.headers.get("content-type") === "image/jpeg" && info?.mime === "image/jpeg" && info?.width === 600 && info?.height === 600, { status: res.status, info })
  check("small enough for every app's preview", bytes.byteLength < 300 * 1024, bytes.byteLength)
  check("kept for a year under the current v", /s-maxage=31536000/.test(res.headers.get("cache-control") || ""))
  check("fetched through the careful fetch, at the photo's address", asked.includes(PHOTO))
  res = await photo.GET(new Request("https://storelib.com/satori/links/photo.jpg?v=old"), { params: Promise.resolve({ sellername: "satori" }) })
  check("an old v for a minute", res.status === 200 && /s-maxage=60\b/.test(res.headers.get("cache-control") || ""))
  S.admin = world({ ...ROW, avatar_url: null, published_profile: { ...ROW.published_profile, avatar_url: null } }, null)
  res = await photo.GET(new Request("https://storelib.com/satori/links/photo.jpg"), { params: Promise.resolve({ sellername: "satori" }) })
  check("no photo: sent to the card", res.status === 302 && /^https:\/\/storelib\.com\/satori\/links\/share\.png\?v=/.test(res.headers.get("location") || ""), res.headers.get("location"))
  const broken = "https://x.supabase.co/storage/v1/object/public/avatars/u/broken.jpg"
  S.admin = world({ ...ROW, avatar_url: broken, published_profile: { ...ROW.published_profile, avatar_url: broken } }, broken)
  res = await photo.GET(new Request("https://storelib.com/satori/links/photo.jpg"), { params: Promise.resolve({ sellername: "satori" }) })
  check("a photo that cannot be read: sent to the card", res.status === 302)
  S.admin = world({ ...ROW })
  res = await photo.GET(new Request("https://storelib.com/nobody/links/photo.jpg"), { params: Promise.resolve({ sellername: "nobody" }) })
  check("no page, no photo", res.status === 404)

  console.log("\nThe card route follows the choice")
  const uploaded = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#0000ff" } }).png().toBuffer()
  S.fetch = async (url: string) => new Response(new Uint8Array(url === UPLOAD ? uploaded : source))
  const blueAt = async (row: Record<string, any>) => {
    S.admin = world(row)
    const out = await card.GET(new Request("https://storelib.com/satori/links/share.png"), { params: Promise.resolve({ sellername: "satori" }) })
    const png = Buffer.from(await out.arrayBuffer())
    const { data } = await sharp(png).extract({ left: 20, top: 20, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
    return data[2] > 200 && data[0] < 40
  }
  check("custom chosen: the upload is drawn", await blueAt({ ...ROW, share_image_mode: "custom", settings: { ...ROW.settings, social_image_url: UPLOAD } }))
  check("card chosen with the same upload stored: the card is drawn", !(await blueAt({ ...ROW, share_image_mode: "card", settings: { ...ROW.settings, social_image_url: UPLOAD } })))
  seen = resolve({ shareImageMode: "card" })
  S.admin = world({ ...ROW, share_image_mode: "card" })
  res = await card.GET(new Request(seen.image.url), { params: Promise.resolve({ sellername: "satori" }) })
  check("the card's current v is kept for a year", /s-maxage=31536000/.test(res.headers.get("cache-control") || ""))
}

function sources() {
  console.log("\nThe SQL and the editor")
  const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
  const sql = read("supabase/sql/run-now/57_onepage_share_image.sql")
  const lines = sql.trimEnd().split("\n")
  check("part 57: a header, then one statement per line", lines[0].startsWith("/* ") && lines[0].endsWith(" */") && lines.slice(1).every((l) => /^(DO \$\$ .* END \$\$;|notify pgrst, 'reload schema';)$/.test(l)))
  check("adds the column, text, not null, 'profile' unless changed", sql.includes("ADD COLUMN share_image_mode text NOT NULL DEFAULT 'profile'"))
  check("the first run sets every page already there to 'profile'", /NOT EXISTS \(SELECT 1 FROM information_schema\.columns [^)]*column_name = 'share_image_mode'\) THEN ALTER TABLE public\.onepages ADD COLUMN[^;]*; UPDATE public\.onepages SET share_image_mode = 'profile'/.test(sql))
  check("and a second run changes nothing: the reset is inside the step that adds the column", (sql.match(/UPDATE public\.onepages/g) || []).length === 2 && !/^UPDATE/m.test(sql))
  check("only the three are allowed", sql.includes("CHECK (share_image_mode IN ('profile', 'card', 'custom'))"))
  check("the check after has a column for it", read("supabase/sql/run-now/99_check_after.sql").includes("as p57_onepage_share_image"))
  check("the README lists it", read("supabase/sql/run-now/README.md").includes("| `57_onepage_share_image.sql` |"))
  const panel = read("components/onepage/seo-panel.tsx")
  check("the editor offers the three, the photo first", /\{ id: "profile", label: "Profile photo" \},\s*\{ id: "card", label: "Share card" \},\s*\{ id: "custom", label: "Custom image" \}/.test(panel))
  check("chosen like every other choice in the editor: its mark fades and scales in (ChoiceMark)", panel.includes("<ChoiceMark on={image.mode === choice.id} />") && panel.includes("aria-pressed={image.mode === choice.id}"))
  check("it says what shows when there is no photo", panel.includes("You have no profile photo yet, so links show the share card."))
  check("choosing is an edit of the page, sent by Save", panel.includes("updateOnePage({ share_image_mode: mode })"))
  check("no em dash in what it says", !/—/.test(panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
}

async function main() {
  choosing()
  tags()
  settingsRules()
  await routes()
  sources()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
