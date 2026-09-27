/**
 * ===========================================================================
 *  A ONEPAGE'S SEARCH AND SHARE FIELDS, AND THE SETTINGS THAT SAVE THEM
 * ===========================================================================
 * "Should they not change dynamically based on the changes users make on the
 * OnePage?" They follow the page until somebody types their own, and the
 * public page says exactly what the editor previewed. Pinned here:
 *
 *   RESOLUTION    lib/onepage/seo resolveOnePageSeo: the defaults from the
 *                 name, the bio, the photo and the theme; an override; a
 *                 reset; an empty bio; long values cut like Google cuts
 *                 them; markup and entities out; the image's fingerprint
 *                 moving with what the image is drawn from and nothing else.
 *   METADATA      the public page's real generateMetadata, run against an
 *                 in-memory database, equal field for field to what the
 *                 editor's preview resolves from the draft that was saved.
 *   THE ROUTE     PUT /api/onepage as it ships, with its database swapped:
 *                 settings cleaned or refused, a page address checked like a
 *                 username and never somebody else's, the paid settings
 *                 only on a paid plan.
 *   THE IMAGE     /<slug>/links/share.png drawn for real (next/og), with the
 *                 long cache only for the current fingerprint.
 */
import { register } from "node:module"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import {
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  clipText,
  coverRect,
  onePageMetadataFrom,
  plainText,
  resolveOnePageSeo,
  shareCardModel,
  textLength,
} from "@/lib/onepage/seo"
import { buttonStyleOf, checkPageSlug, checkSettingsPatch } from "@/lib/onepage/settings-rules"
import { publicOnePageFromDraft } from "@/lib/onepage/public-shape"
import { imageInfo } from "@/lib/onepage/share-image"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}

/* The address a OnePage is shared at: storelib.me/{handle} (lib/onepage/address). */
const PAGE_URL = "https://storelib.me/satori"
const THEME = { background_type: "solid", background_color: "#1A2E1A", text_color: "#eef2ec", secondary_text_color: "#b7c4b6", button_color: "#ff0000" }
const base = (over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) =>
  resolveOnePageSeo({ name: "Satori Studio", bio: "Prints, posters and a newsletter", handle: "satori", avatarUrl: "https://x.supabase.co/a.jpg", theme: THEME, settings, pageUrl: PAGE_URL, ...over })

function resolution() {
  console.log("\nFollowing the page")
  const d = base()
  check("the title is the name and the brand", d.title.value === "Satori Studio | Storelib" && d.title.auto)
  check("the description is the bio", d.description.value === "Prints, posters and a newsletter" && d.description.auto)
  check("the shared title is the name alone: the app prints the site beside it", d.socialTitle.value === "Satori Studio" && d.socialTitle.auto)
  check("the shared description is the description", d.socialDescription.value === d.description.value && d.socialDescription.auto)
  check("the picture is the card drawn from the page", d.image.source === "generated" && d.image.customUrl === null)
  check("its address is beside the page, outside /api, with a fingerprint", /^https:\/\/storelib\.com\/satori\/links\/share\.png\?v=[a-z0-9]{6,12}$/.test(d.image.url), d.image.url)
  check("the host and Google's grey line", d.domain === "storelib.me" && d.breadcrumb === "storelib.me › satori")

  const renamed = base({ name: "Satori Prints" })
  check("a rename moves the title, the shared title and the picture", renamed.title.value === "Satori Prints | Storelib" && renamed.socialTitle.value === "Satori Prints" && renamed.image.url !== d.image.url)
  check("a new bio moves the description and not the picture", base({ bio: "Posters only" }).description.value === "Posters only" && base({ bio: "Posters only" }).image.url === d.image.url)
  check("a new photo moves the picture", base({ avatarUrl: "https://x.supabase.co/b.jpg" }).image.url !== d.image.url)
  check("a new theme colour moves the picture", base({ theme: { ...THEME, background_color: "#000000" } }).image.url !== d.image.url)

  console.log("\nAn empty page")
  const empty = base({ bio: "", name: "" })
  check("no name: the handle", empty.name === "@satori" && empty.title.value === "@satori | Storelib")
  check("no bio: a plain line naming the page", empty.description.value === "Links and products from @satori.")
  check("only spaces and markup in the bio count as none", base({ bio: "  <p> </p> " }).description.value === "Links and products from Satori Studio.")

  console.log("\nSomebody types their own")
  const own = base({}, { seo_title: "Risograph prints from Kyoto", seo_description: "Hand pulled prints, shipped worldwide." })
  check("the typed title wins, and says so", own.title.value === "Risograph prints from Kyoto" && !own.title.auto)
  check("the typed description wins", own.description.value === "Hand pulled prints, shipped worldwide." && !own.description.auto)
  check("the shared title follows the typed title", own.socialTitle.value === "Risograph prints from Kyoto" && own.socialTitle.auto)
  check("the shared description follows the typed description", own.socialDescription.value === "Hand pulled prints, shipped worldwide." && own.socialDescription.auto)
  const ownRenamed = base({ name: "Somebody Else" }, { seo_title: "Risograph prints from Kyoto" })
  check("a typed title no longer follows a rename", ownRenamed.title.value === "Risograph prints from Kyoto")
  check("but the fields nobody typed still do", ownRenamed.socialDescription.value === "Prints, posters and a newsletter" && ownRenamed.image.card.name === "Somebody Else")
  const social = base({}, { social_title: "Come say hi", social_description: "New prints every Friday" })
  check("a shared title of its own leaves the search title alone", social.socialTitle.value === "Come say hi" && !social.socialTitle.auto && social.title.value === "Satori Studio | Storelib")
  check("a shared description of its own", social.socialDescription.value === "New prints every Friday" && !social.socialDescription.auto)

  console.log("\nGoing back to following")
  check("a cleared field follows again", base({}, { seo_title: null }).title.auto && base({}, { seo_title: "" }).title.auto && base({}, { seo_title: "   " }).title.auto)
  check("the page's own name typed back is not an override", base({}, { seo_title: "Satori Studio" }).title.auto && base({}, { seo_title: "satori studio | storelib" }).title.auto)
  check("the bio typed back is not an override", base({}, { seo_description: "Prints, posters and a newsletter" }).description.auto)

  console.log("\nLong values, markup")
  const longName = "The Extraordinarily Long Named Riso Print Collective of Kyoto Japan"
  const long = base({ name: longName, bio: "word ".repeat(80) })
  check("a long name drops the brand and is cut to 60 at a word, with an ellipsis", textLength(long.title.value) <= SEO_TITLE_MAX && long.title.value.endsWith("…") && !/Storelib/.test(long.title.value), long.title.value)
  check("the shared title too", textLength(long.socialTitle.value) <= SEO_TITLE_MAX)
  check("a long bio is cut to 160", textLength(long.description.value) <= SEO_DESCRIPTION_MAX && long.description.value.endsWith("…"))
  const typedLong = base({}, { seo_title: "x".repeat(90), seo_description: "y".repeat(400) })
  check("a typed title and description are held to 60 and 160", textLength(typedLong.title.value) === 60 && textLength(typedLong.description.value) === 160)
  const marked = base({ name: "<b>Satori</b> &amp; Co", bio: "<script>alert(1)</script>Prints &lt;3\n\nand   posters" })
  check("markup is taken out and entities read", marked.name === "Satori & Co" && !/[<>]/.test(marked.description.value) && /Prints 3 and posters|Prints and posters|alert\(1\) Prints 3 and posters/.test(marked.description.value), marked.description.value)
  check("no tag survives in any field", ![marked.title.value, marked.description.value, marked.socialTitle.value].some((v) => /<|>/.test(v)))
  check("an emoji is never cut in half", !/\uD83C$|\uD83D$/.test(clipText("😀".repeat(100), 10)) && textLength(clipText("😀".repeat(100), 10)) <= 10)
  check("plain text of nothing is nothing", plainText(null) === "" && plainText(42) === "")

  console.log("\nThe share picture")
  const custom = base({}, { social_image_url: "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/og.jpg", social_image_position_x: 30, social_image_position_y: 70 })
  check("an upload replaces the card", custom.image.source === "custom" && custom.image.focal.x === 30 && custom.image.focal.y === 70)
  check("moving its crop moves the fingerprint", base({}, { social_image_url: custom.image.customUrl, social_image_position_x: 31, social_image_position_y: 70 }).image.url !== custom.image.url)
  check("an http, IP or internal picture is no picture", ["http://x.co/a.jpg", "https://127.0.0.1/a.jpg", "https://localhost/a.jpg", "https://metadata.internal/a.jpg", "javascript:alert(1)"].every((u) => base({}, { social_image_url: u }).image.source === "generated"))
  const dark = shareCardModel({ name: "A", avatarUrl: null, theme: { background_type: "solid", background_color: "#000000", text_color: "#111111" }, pageUrl: PAGE_URL })
  check("text the theme would draw unreadable is swapped for one that reads", dark.text === "#ffffff")
  const grad = shareCardModel({ name: "A", avatarUrl: null, theme: { background_type: "gradient", gradient_color_1: "#ffd1dc", gradient_color_2: "#fbe7c6", gradient_direction: 90 }, pageUrl: PAGE_URL })
  check("a gradient theme draws its gradient", grad.background.gradient === "linear-gradient(90deg, #ffd1dc 0%, #fbe7c6 100%)")
  check("no photo: initials", shareCardModel({ name: "Satori Studio", avatarUrl: null, theme: THEME, pageUrl: PAGE_URL }).initials === "SS")
  const r = coverRect(800, 1000, 1200, 630, 50, 0)
  check("a crop covers the card and keeps the chosen point", r.width === 1200 && r.height === 1500 && r.left === 0 && r.top === 0 && coverRect(800, 1000, 1200, 630, 50, 100).top === -870)
  check("a PNG and a JPEG are read for their size", JSON.stringify(imageInfo(pngHeader(640, 480))) === JSON.stringify({ width: 640, height: 480, mime: "image/png" }) && imageInfo(new Uint8Array([1, 2, 3])) === null)

  console.log("\nThe metadata it makes")
  const m = onePageMetadataFrom(d, { handle: "satori", indexable: true, icon: "https://x.supabase.co/a.jpg" }) as any
  check("the title whole, so the layout adds no second brand", m.title.absolute === "Satori Studio | Storelib")
  check("one address for canonical and og:url", m.alternates.canonical === PAGE_URL && m.openGraph.url === PAGE_URL)
  check("a large card, always, with its size", m.twitter.card === "summary_large_image" && m.openGraph.images[0].width === 1200 && m.openGraph.images[0].height === 630)
  check("not listed means not indexed", (onePageMetadataFrom(d, { indexable: false }) as any).robots.index === false)
}

function pngHeader(w: number, h: number) {
  const b = new Uint8Array(33)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const v = new DataView(b.buffer)
  v.setUint32(16, w)
  v.setUint32(20, h)
  return b
}

function rules() {
  console.log("\nWhat the route accepts")
  const t = checkSettingsPatch({ seo_title: "  <b>Hello</b>   there  ", seo_description: "d".repeat(300), social_title: "", share_style: "glassmorphism", subscribe_enabled: false, extra_key: { a: 1 } })
  check("text is stripped, trimmed and held to its limit", t.ok && t.value.seo_title === "Hello there" && (t.value.seo_description as string).length === 160 && t.value.social_title === null)
  check("the templates' glassmorphism is stored as glass", t.ok && t.value.share_style === "glass" && buttonStyleOf("glassmorphism", "white") === "glass")
  check("a key it does not know is kept", t.ok && JSON.stringify(t.value.extra_key) === '{"a":1}')
  check("a share picture at http is refused", !checkSettingsPatch({ social_image_url: "http://x.co/a.jpg" }).ok)
  check("one at https is kept", checkSettingsPatch({ social_image_url: "https://x.supabase.co/a.jpg" }).ok)
  check("a switch that is not on or off is refused", !checkSettingsPatch({ share_enabled: "no" }).ok)
  check("a style nobody draws is refused", !checkSettingsPatch({ subscribe_style: "neon" }).ok)
  check("a badge that does not exist is refused", !checkSettingsPatch({ verified_badge_type: "king" }).ok && checkSettingsPatch({ verified_badge_type: "verified_brand" }).ok)
  check("the crop is held to 0 to 100", (checkSettingsPatch({ social_image_position_x: 140 }) as any).value.social_image_position_x === 100)
  check("a value sent back as it is stored is kept, however old", checkSettingsPatch({ social_image_url: "http://old.example/a.png" }, { social_image_url: "http://old.example/a.png" }).ok)
  check("settings that are not an object are refused", !checkSettingsPatch("x").ok && !checkSettingsPatch([1]).ok)
  check("a page address follows the username rules", checkPageSlug("Satori-Prints").ok && (checkPageSlug("Satori-Prints") as any).value === "satori-prints")
  check("a short, reserved or broken address is refused, with a sentence saying what to do",
    ["ab", "app", "checkout", "-x-", "a--b", "x".repeat(31)].every((s) => !checkPageSlug(s).ok) && (checkPageSlug("ab") as any).error === "Use at least 3 characters")
}

/* ─── The real route and page, with the database swapped ─────────────────── */

const S: any = ((globalThis as any).__seoStubs = { admin: null, server: null, user: null })
const dir = mkdtempSync(join(tmpdir(), "onepage-seo-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__seoStubs.admin\n`),
  "@/lib/supabase/server": stub(
    "server",
    `export const createClient = async () => ({ ...globalThis.__seoStubs.server, auth: { getUser: async () => ({ data: { user: globalThis.__seoStubs.user }, error: null }) } })\n`,
  ),
  "@/lib/custom-domains/store": stub("domains", `export const primaryHostFor = async () => null\n`),
  "@/lib/website-builder/site-seo-data": stub("site-seo", `export const activeDomainOf = async () => null\n`),
  "@/lib/onepage/live-products": stub("live", `export const withLiveProducts = async (_db, _id, blocks) => blocks\n`),
  "@/components/onepage/public-onepage": stub("public", `export const PublicOnePage = () => null\n`),
  "@/lib/onepage/ensure-onepage": stub("ensure", `export const ensureOnePage = async () => null\n`),
  "next/navigation": stub("nav", `export const notFound = () => { throw new Error("NOT_FOUND") }\nexport const permanentRedirect = () => {}\nexport const redirect = () => {}\n`),
  "next/og": stub(
    "og",
    `import { createRequire } from "node:module"\nconst require = createRequire(${JSON.stringify(join(process.cwd(), "package.json"))})\nexport const ImageResponse = require("next/og").ImageResponse\n`,
  ),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__onepage-seo__", entry.replace(/[^\w]+/g, "_") + ".mjs")
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
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

const OWNER = "11111111-1111-4111-8111-111111111111"
const CREATOR = "22222222-2222-4222-8222-222222222222"
const OTHER = "33333333-3333-4333-8333-333333333333"
const PAGE = "44444444-4444-4444-8444-444444444444"

/** The page as the editor holds it, after a save: the draft, and the copy publish took of it. */
function savedRow(draft: Record<string, any>) {
  return {
    ...draft,
    status: "published",
    published_blocks: draft.draft_blocks,
    published_theme: draft.theme,
    published_profile: { title: draft.title, bio: draft.bio, avatar_url: draft.avatar_url, avatar_video_url: null },
    published_social_links: draft.social_links,
  }
}

function world(row: Record<string, any>, plan = "free") {
  return fakeDb({
    onepages: [row],
    creators: [{ id: CREATOR, user_id: OWNER, banned_at: null, subscription_plan_id: plan, subscription_status: "active" }],
    profiles: [
      { id: OWNER, username: "satori", display_name: "Satori Studio", avatar_url: null },
      { id: OTHER, username: "takenname", display_name: "Somebody", avatar_url: null },
    ],
    products: [{ id: "p1", creator_id: CREATOR, status: "published" }],
  })
}

const DRAFT = {
  id: PAGE,
  owner_id: OWNER,
  seller_id: CREATOR,
  creator_id: CREATOR,
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/a.jpg",
  theme: THEME,
  settings: { show_branding: true, analytics_enabled: true },
  social_links: {},
  draft_blocks: [],
}

function previewOf(draft: Record<string, any>) {
  const drawn = publicOnePageFromDraft(draft as any, { displayName: "Satori Studio", liveAvatarUrl: null })
  return resolveOnePageSeo({ name: drawn.title, bio: drawn.bio, handle: draft.slug, avatarUrl: drawn.avatar_url, theme: drawn.theme, settings: draft.settings, pageUrl: PAGE_URL })
}

async function metadataAndRoutes() {
  const page = (await import(await bundle("app/(marketing)/l/[slug]/page.tsx"))) as any
  const route = (await import(await bundle("app/api/onepage/route.ts"))) as any
  const image = (await import(await bundle("app/(marketing)/[sellername]/links/share.png/route.tsx"))) as any

  console.log("\nThe public page says what the editor previewed")
  const cases: Array<[string, Record<string, any>]> = [
    ["following the page", DRAFT],
    ["a typed title and a shared description", { ...DRAFT, settings: { ...DRAFT.settings, seo_title: "Risograph prints from Kyoto", social_description: "New prints every Friday" } }],
    ["an empty bio and an uploaded picture", { ...DRAFT, bio: "", settings: { ...DRAFT.settings, social_image_url: "https://x.supabase.co/storage/v1/object/public/onepage-assets/u/og.jpg", social_image_position_x: 20, social_image_position_y: 80 } }],
  ]
  for (const [label, draft] of cases) {
    S.admin = world(savedRow(draft))
    const meta = await page.generateMetadata({ params: Promise.resolve({ slug: "satori" }) })
    const seen = previewOf(draft)
    const same =
      meta.title?.absolute === seen.title.value &&
      meta.description === seen.description.value &&
      meta.openGraph?.title === seen.socialTitle.value &&
      meta.openGraph?.description === seen.socialDescription.value &&
      meta.openGraph?.url === seen.url &&
      meta.alternates?.canonical === seen.url &&
      meta.openGraph?.images?.[0]?.url === seen.image.url &&
      meta.twitter?.images?.[0] === seen.image.url &&
      meta.twitter?.title === seen.socialTitle.value &&
      meta.twitter?.card === "summary_large_image"
    check(`${label}: title, description, share card and address are the preview's`, same, JSON.stringify({ meta: { t: meta.title, d: meta.description, og: meta.openGraph }, seen: { t: seen.title, d: seen.description, st: seen.socialTitle, img: seen.image.url } }))
  }
  S.admin = world(savedRow(DRAFT))
  const missing = await page.generateMetadata({ params: Promise.resolve({ slug: "nobody-here" }) })
  check("a page that is not there says so, is not indexed and has no card", missing.title === "Page not found" && missing.robots?.index === false && !missing.openGraph)

  console.log("\nPUT /api/onepage")
  const put = async (body: Record<string, unknown>, plan = "free") => {
    const db = world({ ...DRAFT, status: "published" }, plan)
    S.admin = db
    S.server = db
    S.user = { id: OWNER }
    const res = await route.PUT(new Request("https://storelib.test/api/onepage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: PAGE, ...body }) }))
    return { res, body: await res.json().catch(() => ({})), row: db.tables.onepages[0] }
  }
  let r = await put({ settings: { seo_title: "<i>Prints</i> from Kyoto", share_style: "glassmorphism" } })
  check("settings are cleaned and merged, the rest kept", r.res.status === 200 && r.row.settings.seo_title === "Prints from Kyoto" && r.row.settings.share_style === "glass" && r.row.settings.show_branding === true)
  r = await put({ settings: { social_image_url: "http://169.254.169.254/latest" } })
  check("a share picture at an internal address is refused with a reason", r.res.status === 400 && /https/.test(r.body.error) && r.row.settings.social_image_url === undefined)
  r = await put({ slug: "takenname" })
  check("an address that is somebody else's username is taken", r.res.status === 400 && r.body.error === "That page address is taken" && r.row.slug === "satori")
  r = await put({ slug: "app" })
  check("an address the platform owns is refused", r.res.status === 400 && r.row.slug === "satori")
  r = await put({ slug: "satori-prints" })
  check("a free address is taken", r.res.status === 200 && r.row.slug === "satori-prints")
  r = await put({ slug: "satori" })
  check("sending the address it has changes nothing and checks nothing", r.res.status === 200 && r.row.slug === "satori")
  r = await put({ settings: { verified_badge_enabled: true } }, "free")
  check("the verified badge is refused on the free plan", r.res.status === 400 && /Pro/.test(r.body.error) && r.row.settings.verified_badge_enabled === undefined)
  r = await put({ settings: { show_branding: false } }, "free")
  check("so is hiding the Storelib badge", r.res.status === 400 && r.row.settings.show_branding === true)
  r = await put({ settings: { verified_badge_enabled: true, verified_badge_type: "verified_artist" } }, "growth")
  check("both are saved on Pro", r.res.status === 200 && r.row.settings.verified_badge_enabled === true && r.row.settings.verified_badge_type === "verified_artist")
  {
    /* The plan cannot be read: the badge is neither granted (a free page would get Pro while the read fails) nor refused as unpaid (a paying creator told to upgrade). */
    const db = world({ ...DRAFT, status: "published" }, "growth")
    S.admin = new Proxy(db, { get: (t, k) => (k === "from" ? (table: string) => { if (table === "creators") throw new Error("down"); return (t as any).from(table) } : (t as any)[k]) })
    S.server = db
    S.user = { id: OWNER }
    const res = await route.PUT(new Request("https://storelib.test/api/onepage", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: PAGE, settings: { verified_badge_enabled: true } }) }))
    const body = await res.json().catch(() => ({}))
    check("a plan that cannot be read neither grants the badge nor calls it unpaid: try again", res.status === 400 && /could not be checked/.test(body.error ?? "") && db.tables.onepages[0].settings.verified_badge_enabled === undefined, body)
  }
  r = await put({ title: 42 })
  check("a name that is not text is refused", r.res.status === 400)
  S.user = null
  const anon = await route.PUT(new Request("https://storelib.test/api/onepage", { method: "PUT", body: JSON.stringify({ id: PAGE }) }))
  check("nobody signed in, nothing saved", anon.status === 401)

  console.log("\nThe share image")
  S.admin = world(savedRow({ ...DRAFT, avatar_url: null }))
  const seen = previewOf({ ...DRAFT, avatar_url: null })
  const v = new URL(seen.image.url).searchParams.get("v")
  const current = await image.GET(new Request(`https://storelib.com/satori/links/share.png?v=${v}`), { params: Promise.resolve({ sellername: "satori" }) })
  const bytes = new Uint8Array(await current.arrayBuffer())
  const info = imageInfo(bytes)
  check("it is a 1200 by 630 PNG", current.status === 200 && current.headers.get("content-type") === "image/png" && info?.width === 1200 && info?.height === 630, JSON.stringify(info))
  check("the current fingerprint is kept for a year", /s-maxage=31536000/.test(current.headers.get("cache-control") || ""))
  const stale = await image.GET(new Request("https://storelib.com/satori/links/share.png?v=old"), { params: Promise.resolve({ sellername: "satori" }) })
  check("an old one for a minute", stale.status === 200 && /s-maxage=60\b/.test(stale.headers.get("cache-control") || ""))
  const none = await image.GET(new Request("https://storelib.com/nobody/links/share.png"), { params: Promise.resolve({ sellername: "nobody" }) })
  check("no page, no picture", none.status === 404)
}

async function main() {
  resolution()
  rules()
  await metadataAndRoutes()
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
