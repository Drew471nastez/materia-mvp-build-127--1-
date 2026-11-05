/**
 * ===========================================================================
 *  ONE NAME AND ONE FACE, EVERYWHERE, THE MOMENT THEY CHANGE
 * ===========================================================================
 * "Why is it still showing Zarra Bianco and my old picture?" The OnePage's
 * own content had the new name; the tab title and the icon beside it, which
 * an iPhone shows along the bottom of the screen, had the old one.
 *
 * They came from copies: `onepages.published_profile`, taken when the page
 * was published, `onepages.settings.seo_title`, which the SEO card filled in
 * with the page name and then saved, and `creators.display_name`, written
 * when the account was made. Renaming yourself writes `profiles`, so none of
 * them moved.
 *
 * Three stories run here, each against a stand in database:
 *
 *   renamed        the display name changes after the page was published:
 *                  the title, the published copy, the Meta title, the
 *                  creator row and the store name follow; a page title
 *                  somebody typed does not
 *   new photo      the photo changes after the page was published: every
 *                  copy of the old address follows it
 *   photo removed  and the picture Google sent does not come back
 *
 * Then the resolver the tab title and the page body now share
 * (lib/account/identity), and the files that must keep using it.
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import {
  creatorName,
  creatorPhoto,
  followsProfile,
  mirrorsProfilePhoto,
  keptPhoto,
  providerPhoto,
  typedSeoTitle,
} from "../lib/account/identity"
import { followProfileIdentity, type FollowClient } from "../lib/account/profile-follow"

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

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocK-photo=s96-c"
const OLD_PHOTO = "https://proj.supabase.co/storage/v1/object/public/avatars/user-1/avatar-1700000000000.jpg"
const NEW_PHOTO = "https://proj.supabase.co/storage/v1/object/public/avatars/user-1/avatar-1800000000000.jpg"

/* ── A stand in database ───────────────────────────────────────────────── */
type Row = Record<string, unknown>
interface World {
  onepages: Row[]
  creators: Row[]
  configs: Row[]
  writes: string[]
}

function clientFor(w: World): FollowClient {
  const held: Record<string, Row[]> = { onepages: w.onepages, creators: w.creators, store_builder_configs: w.configs }
  const table = (name: string): Row[] => held[name] ?? []
  return {
    from: (name: string) => ({
      select: () => ({
        eq: (column: string, value: string) => {
          const rows = table(name).filter((r) => r[column] === value)
          const answer = { data: rows, error: null }
          return Object.assign(Promise.resolve(answer), {
            maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
          }) as never
        },
      }),
      update: (values: Row) => ({
        eq: (column: string, value: string) => {
          for (const row of table(name).filter((r) => r[column] === value)) {
            Object.assign(row, values)
            w.writes.push(`${name}.update`)
          }
          return Promise.resolve({ data: null, error: null }) as never
        },
      }),
    }),
  }
}

/** A world where the account was opened as "Zarra Bianco" with the Google picture. */
function world(over: { pageTitle?: string; seoTitle?: string | null } = {}): World {
  return {
    onepages: [
      {
        id: "page-1",
        owner_id: "user-1",
        title: over.pageTitle ?? "Zarra Bianco",
        avatar_url: OLD_PHOTO,
        published_profile: { title: over.pageTitle ?? "Zarra Bianco", bio: "", avatar_url: OLD_PHOTO },
        settings: { seo_title: over.seoTitle === undefined ? "Zarra Bianco" : over.seoTitle, share_enabled: true },
      },
    ],
    creators: [{ id: "creator-1", user_id: "user-1", display_name: "Zarra Bianco", avatar_url: OLD_PHOTO }],
    configs: [
      {
        id: "config-1",
        creator_id: "creator-1",
        draft_config: { headerSettings: { avatarUrl: OLD_PHOTO }, globalSettings: { storeName: "Zarra Bianco" } },
        published_config: { headerSettings: { avatarUrl: OLD_PHOTO }, globalSettings: { storeName: "Zarra Bianco" } },
      },
    ],
    writes: [],
  }
}

/* Every story is awaited, so they run in order and the count at the end is the whole suite. */
async function main() {
  /* ── The rule on its own ───────────────────────────────────────────────── */
  console.log("\nA copy follows the profile only when it still holds what the profile held")
  check("the old name follows", followsProfile("Zarra Bianco", "Zarra Bianco", "Luca Dragoste") === "Luca Dragoste")
  check("a title somebody typed is left alone", followsProfile("My links", "Zarra Bianco", "Luca Dragoste") === undefined)
  check("an empty copy is left empty, it already falls back", followsProfile("", "Zarra Bianco", "Luca Dragoste") === undefined)
  check("case and spacing do not hide a match", followsProfile("  zarra bianco ", "Zarra Bianco", "Luca Dragoste") === "Luca Dragoste")
  check("a copy already on the new name is not written again", followsProfile("Luca Dragoste", "Zarra Bianco", "Luca Dragoste") === undefined)
  check("a cleared name clears the copy", followsProfile("Zarra Bianco", "Zarra Bianco", "") === null)

  console.log("\nThe picture a sign in provider sent belongs to the profile alone")
  check("a Google picture is recognised", providerPhoto(GOOGLE))
  check("an uploaded photo is not", !providerPhoto(NEW_PHOTO))
  check("a Google picture in a copy follows even a removal", mirrorsProfilePhoto(GOOGLE, null) === null)
  check("the old photo follows the new one", mirrorsProfilePhoto(OLD_PHOTO, NEW_PHOTO) === NEW_PHOTO)
  check("a picture written by another editor follows too: there is one photo", mirrorsProfilePhoto("https://cdn.example.com/logo.png", NEW_PHOTO) === NEW_PHOTO)
  check("a copy already on it is not written again", mirrorsProfilePhoto(NEW_PHOTO, NEW_PHOTO) === undefined)
  check("a Google picture is never drawn from a copy", keptPhoto(GOOGLE) === null)

  console.log("\nA Meta title that is only the page's name again says nothing")
  check("the name back again is not a title", typedSeoTitle("Luca Dragoste", "Luca Dragoste") === null)
  check("words somebody typed are", typedSeoTitle("Templates for designers", "Luca Dragoste") === "Templates for designers")
  check("an empty box is not a title", typedSeoTitle("", "Luca Dragoste") === null)

  /* ── Story 1: the display name changed after the page was published ────── */
  console.log("\nA creator renamed after publishing: the tab title follows")
  {
    const w = world()
    await followProfileIdentity(clientFor(w), "user-1", { name: { before: "Zarra Bianco", after: "Luca Dragoste" } })
    const page = w.onepages[0]
    check("the OnePage title follows", page.title === "Luca Dragoste", page.title)
    check("the copy taken at publish follows", (page.published_profile as Row).title === "Luca Dragoste", page.published_profile)
    check("the SEO card's Meta title follows", (page.settings as Row).seo_title === "Luca Dragoste", page.settings)
    check("the rest of the settings are untouched", (page.settings as Row).share_enabled === true)
    check("the creator row follows", w.creators[0].display_name === "Luca Dragoste")
    check("the creator page's store name follows", ((w.configs[0].published_config as Row).globalSettings as Row).storeName === "Luca Dragoste")
    check("the photo is not touched by a rename", page.avatar_url === OLD_PHOTO)

    const title = creatorName({
      published: (page.published_profile as Row).title,
      own: page.title,
      live: "Luca Dragoste",
    })
    check("the tab title reads the new name", title === "Luca Dragoste", title)
  }

  console.log("\nA page title somebody typed survives the rename")
  {
    const w = world({ pageTitle: "My links", seoTitle: "Templates for designers" })
    await followProfileIdentity(clientFor(w), "user-1", { name: { before: "Zarra Bianco", after: "Luca Dragoste" } })
    check("the page keeps its own title", w.onepages[0].title === "My links")
    check("the published copy keeps it too", (w.onepages[0].published_profile as Row).title === "My links")
    check("the Meta title somebody typed stays", (w.onepages[0].settings as Row).seo_title === "Templates for designers")
    check("the creator row still follows, nothing edits it", w.creators[0].display_name === "Luca Dragoste")
  }

  /* ── Story 2: the photo changed after the page was published ───────────── */
  console.log("\nA creator who replaced their photo after publishing")
  {
    const w = world()
    const followed = await followProfileIdentity(clientFor(w), "user-1", { photo: { before: OLD_PHOTO, after: NEW_PHOTO } })
    const page = w.onepages[0]
    check("the OnePage picture follows", page.avatar_url === NEW_PHOTO)
    check("the copy taken at publish follows", (page.published_profile as Row).avatar_url === NEW_PHOTO)
    check("the creator row follows", w.creators[0].avatar_url === NEW_PHOTO)
    check("the creator page header follows", ((w.configs[0].published_config as Row).headerSettings as Row).avatarUrl === NEW_PHOTO)
    check("the name is not touched by a photo change", page.title === "Zarra Bianco")
    check("the creator id comes back for the caches", followed.creatorId === "creator-1")

    const icon = creatorPhoto({ published: (page.published_profile as Row).avatar_url, own: page.avatar_url, live: NEW_PHOTO })
    check("the icon is the new photo", icon === NEW_PHOTO, icon)
  }

  /* ── Story 3: the photo was deleted ────────────────────────────────────── */
  console.log("\nA creator who deleted their photo: nothing puts a face back")
  {
    const w = world()
    ;(w.onepages[0].published_profile as Row).avatar_url = GOOGLE
    w.creators[0].avatar_url = GOOGLE
    await followProfileIdentity(clientFor(w), "user-1", { photo: { before: OLD_PHOTO, after: null } })
    const page = w.onepages[0]
    check("the OnePage picture is cleared", page.avatar_url === null, page.avatar_url)
    check("the Google picture in the published copy goes too", (page.published_profile as Row).avatar_url === null)
    check("the creator row's Google picture goes", w.creators[0].avatar_url === null)
    check("the creator page header shows initials", ((w.configs[0].draft_config as Row).headerSettings as Row).avatarUrl === "")

    const icon = creatorPhoto({ published: (page.published_profile as Row).avatar_url, own: page.avatar_url, live: null })
    check("there is no icon left to draw", icon === null, icon)
    check("a Google picture left anywhere is still not drawn", creatorPhoto({ published: GOOGLE, own: null, live: null }) === null)
  }

  /* ── The tab title falls back to the live profile, not to "Creator" ────── */
  console.log("\nA page that never had a name of its own")
  {
    const name = creatorName({ published: "", own: null, live: "Luca Dragoste" })
    check("reads the live profile name", name === "Luca Dragoste", name)
    const photo = creatorPhoto({ published: null, own: null, live: NEW_PHOTO })
    check("and the live profile photo", photo === NEW_PHOTO)
  }

  /* ── The replaced file is kept ──────────────────────────────────────────── */
  console.log("\nThe photo that was replaced stays in storage")
  {
    const { existsSync } = await import("node:fs")
    check("there is no sweep module any more", !existsSync("lib/account/avatar-files.ts"))
    const photoRoute = readCode("app/api/account/avatar/route.ts")
    check("the photo route removes no file", !/\.remove\(/.test(photoRoute) && !photoRoute.includes("sweepReplacedAvatar"))
  }

  /* ── The files that must keep reading it this way ──────────────────────── */
  console.log("\nEvery public surface reads the one resolver")
  {
    /* The page, and the loader its metadata and share image read (lib/onepage/published-page), as one. */
    const onepage = readCode("app/(storelib)/(marketing)/l/[slug]/page.tsx") + readCode("lib/onepage/published-page.ts")
    const seoLib = readCode("lib/onepage/seo.ts")
    check("the OnePage metadata builds its title and icon from the shape the body is drawn from", onepage.includes("const drawn = publishedShape(onepage, owner)") && onepage.includes("icon: drawn.avatar_url") && onepage.includes("name: drawn.title"))
    check("and the body is drawn from that same shape", onepage.includes("const transformedOnepage = publishedShape(onepage, owner"))
    check("and reads the live display name", onepage.includes("display_name") && onepage.includes("owner.displayName"))
    check("it no longer starts the title from the published copy alone", !/const displayName = profile\?\.title \|\| onepage\.title \|\| "Creator"/.test(onepage))
    check("it no longer starts the icon from the published copy alone", !/faviconUrl = profile\?\.avatar_url \|\| onepage\.avatar_url/.test(onepage))
    check("a Meta title that is only the name again does not win", seoLib.includes("overrideOf(settings.seo_title, autoT, SEO_TITLE_MAX, [name, plainName"))
    check("the share card takes the same face", onepage.includes("avatarUrl: drawn.avatar_url") && seoLib.includes("shareCardModel({ name, avatarUrl: input.avatarUrl"))

    const shape = readCode("lib/onepage/public-shape.ts")
    check("the page body reads the same resolver", shape.includes("creatorName({") && shape.includes("creatorPhoto({"))
    check("and is given the live photo to fall back on", shape.includes("liveAvatarUrl"))

    const product = readCode("app/(storelib)/(marketing)/p/[slug]/page.tsx")
    check("the product page prefers the live profile name", /sellerName = profile\?\.display_name \|\| profile\?\.full_name \|\| creator\.display_name/.test(product))

    const creatorPage = readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")
    check("the creator page's share card passes over a provider's picture in the header", creatorPage.includes("keptPhoto(headerSettings?.avatarUrl)"))
    /* Round 12: the share card is drawn (/member/<handle>/share.png) from the profile's own photo, whatever it is. */
    check("but keeps the profile's own photo, whatever it is", creatorPage.includes("profile.avatar_url || avatarFromHeader"))

    const site = readCode("lib/website-builder/published-site.ts")
    check("a website's name prefers the live profile too", /displayName: p\.display_name \|\| c\.display_name/.test(site))

    const settingsForm = readCode("components/app/settings-form-new.tsx")
    check("renaming yourself in Settings tells the server to move the copies", settingsForm.includes("/api/account/profile-changed"))

    const photoRoute = readCode("app/api/account/avatar/route.ts")
    check("saving a photo moves the copies", photoRoute.includes("followProfileIdentity"))
    check("and deletes no file", !photoRoute.includes("sweepReplacedAvatar") && !/\.remove\(/.test(photoRoute))

    const creatorProfile = readCode("app/api/creator-profile/route.ts")
    check("the storefront's Edit profile moves them as well", creatorProfile.includes("followProfileIdentity"))
    check("and clears the caches the public pages read the profile through", /* Changed on purpose (round AD): one helper expires the creator page's and the website's copies now. */ creatorProfile.includes("identityChanged({ userId: page.profileId") /* Changed on purpose (round 42 team): the store owner's profile, for a member with Creator page too */ && readCode("lib/account/identity-caches.ts").includes("creatorTagOf(ids.userId)"))

    /* The box is empty while it follows the page, and shows the page's value only as its placeholder: only typed words are saved. */
    const seoTab = readCode("components/onepage/tabs/settings-tab.tsx") + readCode("components/onepage/seo-panel.tsx")
    check("the SEO card never saves the name it was only showing",
      !/seo_title: metaTitle,/.test(seoTab) && seoTab.includes('placeholder: field.auto ? field.value : ""') && seoTab.includes('onChange(e.target.value === "" ? null : e.target.value)'))

    const sql = readCode("supabase/sql/run-now/44_profile_identity_follows.sql")
    check("the database keeps the copies in step for every other writer", sql.includes("CREATE TRIGGER profiles_identity_follows"))
    check("and can never fail a profile save", sql.includes("EXCEPTION WHEN others THEN RAISE WARNING"))
    const check99 = readCode("supabase/sql/run-now/99_check_after.sql")
    check("the check after has a column for it", check99.includes("as p44_profile_identity_follows"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailing: ${failures.join(", ")}`)
    process.exit(1)
  }

}
main()
