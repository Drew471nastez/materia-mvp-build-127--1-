/**
 * ===========================================================================
 *  THE PICTURE A CREATOR PUT ON THEIR ONEPAGE IS THE ONE THAT SHOWS
 * ===========================================================================
 * After #361: "In the preview and in the live, it doesn't display the photo
 * avatar that I uploaded there", and under the page in the phone's app
 * switcher, the tab still read "Zarra Bianco | Storelib" beside an old face.
 *
 * What this pins, against the real modules:
 *
 *   drawn       THE PROFILE PHOTO is drawn on the live page and in the
 *               editor's preview. It was the page's own copy first, and that
 *               is how one creator came to have three faces at once: this
 *               one, the one in Settings and the one on his creator page.
 *               The page's copy is read only for a page drawn without the
 *               profile to hand
 *   the draft   a photo saved in the OnePage editor is the profile photo, so
 *               it shows in the preview AND on the live page at once, rather
 *               than waiting for a publish
 *   one face    the tab title, the favicon, the apple touch icon and the
 *               share card are read from the shape the page is drawn from,
 *               and nothing stands in for a page with no picture
 *   one photo   changing the profile photo rewrites EVERY copy of it, the
 *               OnePage's and its published copy included, whatever they
 *               hold. The name keeps the old rule: a page title somebody
 *               typed is still left alone
 *   kept        no photo change deletes a file from storage
 *   the frame   with no picture the header keeps its place under the top
 *               bar, and the page paints its own colour under the footer
 *
 * Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { readCode } from "./_source"
import { creatorPhoto, keptPhoto, mirrorsProfilePhoto, providerPhoto } from "../lib/account/identity"
import { followProfileIdentity, type FollowClient } from "../lib/account/profile-follow"
import { publicOnePage, publicOnePageFromDraft } from "../lib/onepage/public-shape"
import { canvasRule, heroHeaderShown, pageCanvasColour, safeCssColour } from "../lib/onepage/page-frame"

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

const BASE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public"
/* The photo on the reporting page: uploaded in the OnePage editor. */
const PAGE_UPLOAD = `${BASE}/onepage-assets/24765588-7564-47ea-af06-3c6a0e617999/avatar-1789991372145.png`
const NEW_UPLOAD = `${BASE}/onepage-assets/24765588-7564-47ea-af06-3c6a0e617999/avatar-1790500000000.png`
const PROFILE_OLD = `${BASE}/avatars/24765588-7564-47ea-af06-3c6a0e617999/avatar-1700000000000.jpg`
const PROFILE_NEW = `${BASE}/avatars/24765588-7564-47ea-af06-3c6a0e617999/avatar-1800000000000.jpg`
const GOOGLE_SIGN_IN = "https://lh3.googleusercontent.com/a/ACg8ocK-photo=s96-c"
const GOOGLE_PHOTOS = "https://lh3.googleusercontent.com/pw/AP1GczN-a-holiday-picture=w800"

const row = (over: Record<string, unknown> = {}) => ({
  id: "page-1",
  slug: "lucadragoste",
  title: "Luca Dragoste",
  bio: "",
  avatar_url: PAGE_UPLOAD,
  avatar_video_url: null,
  theme: { background_type: "solid", background_color: "#0a0a0a" },
  settings: { seo_title: "Zarra Bianco" },
  social_links: {},
  draft_blocks: [],
  published_blocks: [],
  published_profile: { title: "Luca Dragoste", bio: "", avatar_url: PAGE_UPLOAD },
  seller_id: "seller-1",
  ...over,
})

async function main() {
  /* ── Drawn ─────────────────────────────────────────────────────────────── */
  console.log("\nThe photo the page draws is the profile's, live and in the preview")
  {
    const live = publicOnePage(row(), { source: "published", displayName: "Luca Dragoste", liveAvatarUrl: PROFILE_NEW })
    check("the live page draws the profile photo, whatever the row's old copy holds", live.avatar_url === PROFILE_NEW, live.avatar_url)
    const preview = publicOnePageFromDraft(row(), { liveAvatarUrl: PROFILE_NEW })
    check("and so does the preview", preview.avatar_url === PROFILE_NEW, preview.avatar_url)
    const noProfile = publicOnePage(row(), { source: "published", liveAvatarUrl: null })
    check("a page drawn without the profile to hand still shows a face", noProfile.avatar_url === PAGE_UPLOAD, noProfile.avatar_url)
    check("an address in Storelib's own storage is never taken for a sign in picture", !providerPhoto(PAGE_UPLOAD) && !providerPhoto(PROFILE_NEW))
    check("a Google Photos picture somebody chose is kept", keptPhoto(GOOGLE_PHOTOS) === GOOGLE_PHOTOS)
    check("the picture Google sent at sign in is still passed over", keptPhoto(GOOGLE_SIGN_IN) === null)
    check("an X post image is kept, an X account picture is not",
      keptPhoto("https://pbs.twimg.com/media/Fx123.jpg") !== null && keptPhoto("https://pbs.twimg.com/profile_images/1/me.jpg") === null)
    check("an Instagram post image is kept", keptPhoto("https://scontent-lhr8-1.cdninstagram.com/v/t51/123.jpg") !== null
      && keptPhoto("https://scontent.xx.fbcdn.net/v/t39.30808-6/1.jpg") !== null)
  }

  /* ── The draft ─────────────────────────────────────────────────────────── */
  console.log("\nA new upload shows in the preview before it is published")
  {
    const page = row({ avatar_url: NEW_UPLOAD })
    const preview = publicOnePageFromDraft(page, { liveAvatarUrl: NEW_UPLOAD })
    check("the preview draws the photo just saved", preview.avatar_url === NEW_UPLOAD, preview.avatar_url)
    const live = publicOnePage(page, { source: "published", liveAvatarUrl: NEW_UPLOAD })
    check("and so does the live page, without waiting for a publish", live.avatar_url === NEW_UPLOAD, live.avatar_url)

    const empty = publicOnePageFromDraft(row({ avatar_url: null, published_profile: null }), { liveAvatarUrl: PROFILE_NEW })
    const emptyLive = publicOnePage(row({ avatar_url: null, published_profile: null }), { source: "published", liveAvatarUrl: PROFILE_NEW })
    check("a page with no picture of its own: the preview falls back to the profile like the live page", empty.avatar_url === PROFILE_NEW && emptyLive.avatar_url === PROFILE_NEW, [empty.avatar_url, emptyLive.avatar_url])

    const preview2 = readCode("components/onepage/live-preview.tsx")
    check("the editor's preview is given the owner's profile to fall back on", /publicOnePageFromDraft\(onepage as never, \{ displayName: owner\.displayName, liveAvatarUrl: owner\.avatarUrl \}\)/.test(preview2))
  }

  /* ── One face ──────────────────────────────────────────────────────────── */
  console.log("\nThe tab, the icon and the share card show what the page shows")
  {
    const route = readCode("app/(storelib)/(marketing)/l/[slug]/page.tsx")
    /* The loader and the tags the metadata and the share image both read (lib/onepage/published-page, lib/onepage/seo). */
    const loader = readCode("lib/onepage/published-page.ts")
    const seoLib = readCode("lib/onepage/seo.ts")
    /* The page asks resolveOnePage now, which also says where a name with no page leads (lib/onepage/resolve-address); findPublishedOnePage, which the metadata asks, is that same cached answer, so it is still one lookup. */
    check("one lookup serves the metadata and the page", (route.match(/await findPublishedOnePage\(slug\)/g) ?? []).length === 1 && (route.match(/await resolveOnePage\(slug\)/g) ?? []).length === 1 && /export const resolveOnePage = cache\(/.test(loader) && /const address = await resolveOnePage\(slug\)\n  return address\.kind === "page" \? address\.page : null/.test(loader))
    check("the metadata reads the shape the body is drawn from", loader.includes("const drawn = publishedShape(onepage, owner)") && /publishedOnePageSeo\(onepage, owner, slug[,)]/.test(route))
    check("the body is drawn from that shape", route.includes("const transformedOnepage = publishedShape(onepage, owner"))
    check("the favicon is the picture the page draws", route.includes("icon: drawn.avatar_url"))
    check("the apple touch icon is the same one", /icons: \{ icon: extra\.icon, apple: extra\.icon \}/.test(seoLib))
    check("the share card falls back to it too", loader.includes("avatarUrl: drawn.avatar_url") && seoLib.includes("avatarUrl: safeImageUrl(avatarUrl)"))
    check("the tab title is the page's name unless a Meta title was typed", loader.includes("name: drawn.title") && seoLib.includes("title: { absolute: seo.title.value }") && seoLib.includes("overrideOf(settings.seo_title, autoT"))
    check("nothing else stands in for a page with no picture", !route.includes("headerSettings") && !route.includes("store_builder_configs"))

    const page = readCode("components/onepage/public-onepage.tsx")
    check("the page's own icon does not reach for the creator page header", !page.includes("/api/onepage/seller-avatar") && page.includes("const faviconUrl = avatarUrl || videoFrameUrl\n"))

    /* The icon and the body, built from one row. */
    const drawn = publicOnePage(row(), { source: "published", displayName: "Luca Dragoste", liveAvatarUrl: PROFILE_OLD })
    check("the name drawn on the page is the profile's new one", drawn.title === "Luca Dragoste")
  }

  /* ── One photo ─────────────────────────────────────────────────────────── */
  console.log("\nA new profile photo rewrites every copy of the photo, wherever it was set")
  {
    type Row = Record<string, unknown>
    const world = (pageAvatar: string | null, publishedAvatar: string | null) => ({
      onepages: [{ id: "page-1", owner_id: "user-1", title: "Luca Dragoste", avatar_url: pageAvatar, published_profile: { title: "Luca Dragoste", avatar_url: publishedAvatar }, settings: {} }] as Row[],
      creators: [] as Row[],
      configs: [] as Row[],
    })
    const client = (w: ReturnType<typeof world>): FollowClient => {
      const held: Record<string, Row[]> = { onepages: w.onepages, creators: w.creators, store_builder_configs: w.configs }
      return {
        from: (name: string) => ({
          select: () => ({
            eq: (column: string, value: string) => {
              const rows = (held[name] ?? []).filter((r) => r[column] === value)
              return Object.assign(Promise.resolve({ data: rows, error: null }), {
                maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
              }) as never
            },
          }),
          update: (values: Row) => ({
            eq: (column: string, value: string) => {
              for (const r of (held[name] ?? []).filter((x) => x[column] === value)) Object.assign(r, values)
              return Promise.resolve({ data: null, error: null }) as never
            },
          }),
        }),
      }
    }

    const chosen = world(PAGE_UPLOAD, PAGE_UPLOAD)
    await followProfileIdentity(client(chosen), "user-1", { photo: { before: PROFILE_OLD, after: PROFILE_NEW } })
    check("a photo written by the OnePage editor takes the profile's", chosen.onepages[0].avatar_url === PROFILE_NEW, chosen.onepages[0].avatar_url)
    check("and so does its published copy", (chosen.onepages[0].published_profile as Row).avatar_url === PROFILE_NEW)

    const removed = world(PAGE_UPLOAD, PAGE_UPLOAD)
    await followProfileIdentity(client(removed), "user-1", { photo: { before: PROFILE_OLD, after: null } })
    check("removing the profile photo clears it", removed.onepages[0].avatar_url === null)

    const fromNothing = world(PAGE_UPLOAD, PAGE_UPLOAD)
    await followProfileIdentity(client(fromNothing), "user-1", { photo: { before: null, after: PROFILE_NEW } })
    check("a first profile photo replaces it", fromNothing.onepages[0].avatar_url === PROFILE_NEW)

    const copy = world(PROFILE_OLD, PROFILE_OLD)
    await followProfileIdentity(client(copy), "user-1", { photo: { before: PROFILE_OLD, after: PROFILE_NEW } })
    check("an exact copy of the old profile photo follows it", copy.onepages[0].avatar_url === PROFILE_NEW && (copy.onepages[0].published_profile as Row).avatar_url === PROFILE_NEW)

    check("an address that only differs in case is another file and takes the profile's", mirrorsProfilePhoto(PROFILE_OLD.toUpperCase(), PROFILE_NEW) === PROFILE_NEW)
    check("an empty copy is filled in", mirrorsProfilePhoto(null, PROFILE_NEW) === PROFILE_NEW)
    check("a photo uploaded in the OnePage editor follows too: there is one photo", mirrorsProfilePhoto(PAGE_UPLOAD, PROFILE_NEW) === PROFILE_NEW)
    check("a Google Photos picture in a copy follows a removal", mirrorsProfilePhoto(GOOGLE_PHOTOS, null) === null)
    check("the picture Google sent at sign in does", mirrorsProfilePhoto(GOOGLE_SIGN_IN, null) === null)
    check("and the resolver passes over it", creatorPhoto({ published: GOOGLE_SIGN_IN, own: null, live: PROFILE_NEW }) === PROFILE_NEW)
  }

  /* ── Kept ──────────────────────────────────────────────────────────────── */
  console.log("\nNo photo change deletes a file")
  {
    check("the sweep is gone", !existsSync("lib/account/avatar-files.ts"))
    for (const file of [
      "app/api/account/avatar/route.ts",
      "app/api/account/profile-changed/route.ts",
      "app/api/creator-profile/route.ts",
      "app/api/onepage/route.ts",
      "app/api/onepage/publish/route.ts",
      "app/api/store-builder/route.ts",
      "lib/account/avatar-save.ts",
      "lib/account/profile-follow.ts",
      "lib/account/identity.ts",
      "lib/account/avatar.ts",
      "components/app/settings/profile-photo.tsx",
    ]) {
      const code = readCode(file)
      check(`${file} removes nothing from storage`, !/storage[\s\S]{0,80}\.remove\(/.test(code) && !code.includes("sweepReplacedAvatar"))
    }
  }

  /* ── The frame ─────────────────────────────────────────────────────────── */
  console.log("\nWith no picture, the header keeps its place")
  {
    check("a hero is drawn with a photo", heroHeaderShown({ header_layout: "hero" }, { avatar_url: PAGE_UPLOAD }))
    check("and with a video", heroHeaderShown({ header_layout: "hero" }, { avatar_video_url: "https://x/v.mp4" }))
    check("not without either: the header is the classic one", !heroHeaderShown({ header_layout: "hero" }, { avatar_url: null, avatar_video_url: null }))
    check("never for a classic theme", !heroHeaderShown({ header_layout: "classic" }, { avatar_url: PAGE_UPLOAD }) && !heroHeaderShown(null, { avatar_url: PAGE_UPLOAD }))
    const page = readCode("components/onepage/public-onepage.tsx")
    /* Changed on purpose (round 42): a theme's cover picture also starts at the very top (lib/onepage/theme-layout coverImageOf). */
    check("the page's top padding reads that answer", page.includes('heroHeaderShown(safeTheme, { avatar_url, avatar_video_url }) || coverImageOf(safeTheme) ? "0" : "50px"'))
    check("the header block reads it", page.includes("if (heroHeaderShown(theme as any, profile)) {"))
    check("the social row under it reads it", page.includes("const isHeroLayout = heroHeaderShown(theme as any, profile)"))
    check("nothing reads the raw layout for spacing any more", !/header_layout === "hero" \? "0"/.test(page))
  }

  console.log("\nThe page paints its own colour under the footer")
  {
    check("a solid page ends on its colour", pageCanvasColour({ background_type: "solid", background_color: "#0f3d2e" }) === "#0f3d2e")
    check("a gradient on its last stop", pageCanvasColour({ background_type: "gradient", background_gradient: "linear-gradient(180deg, #111111 0%, #0f3d2e 100%)", background_color: "#fff" }) === "#0f3d2e")
    check("an image page on its colour", pageCanvasColour({ background_type: "image", background_color: "#123456" }) === "#123456")
    check("a page with none on black, as the page itself", pageCanvasColour({}) === "#000000")
    check("only a colour reaches the stylesheet", safeCssColour("red;}body{display:none") === "#000000" && safeCssColour("rgba(1, 2, 3, 0.5)") === "rgba(1, 2, 3, 0.5)")
    check("the rule covers html, the app shell's html and body", canvasRule({ background_color: "#0f3d2e" }) === "html,html.capacitor,body{background-color:#0f3d2e}")
    const page = readCode("components/onepage/public-onepage.tsx")
    check("the page writes that rule", page.includes("canvasRule(safeTheme)"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailing: ${failures.join(", ")}`)
    process.exit(1)
  }
}
main()
