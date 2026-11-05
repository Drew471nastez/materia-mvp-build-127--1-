/**
 * ===========================================================================
 *  ONE PROFILE PHOTO, AND ONE PLACE THAT DECIDES IT
 * ===========================================================================
 * The owner, with three screenshots: his creator page showed his face, the
 * Profile photo in Settings › General showed a black "loud" logo, and his
 * OnePage showed a third picture. One person, three faces, at the same
 * moment.
 *
 * WHY THEY DRIFTED. `profiles.avatar_url` is the photo, and five other rows
 * keep a copy of it (lib/account/profile-follow). A copy used to follow the
 * profile only while it still held the value the profile used to hold, which
 * reads well for a NAME — a page title somebody typed should survive a
 * rename — and is wrong for a FACE. Each editor wrote its own copy once and
 * that copy counted as chosen from then on, so it never followed again:
 *
 *   the creator page header   written by onboarding, and by the builder
 *   profiles.avatar_url       written by Settings › General
 *   onepages.avatar_url       written by the OnePage editor, which uploaded
 *                             into a different bucket entirely
 *
 * WHAT THIS PINS.
 *
 *   one source    every surface reads `profiles.avatar_url`, and the copies
 *                 are kept equal to it; the resolver reads the live profile
 *                 BEFORE any copy
 *   every editor  the OnePage editor, the creator page builder, the
 *                 storefront's Edit profile and both onboarding flows save
 *                 through the one route Settings uses
 *   no override   a copy is never "chosen": it mirrors, whatever it holds,
 *                 a removal included. There is no per surface photo and so
 *                 nothing to reset
 *   reconciled    an account already holding three different photos comes
 *                 back to one, and the copy taken at the last publish comes
 *                 with it, so the live OnePage does not wait to be
 *                 republished
 *   said once     the control that changes it says where it appears
 *
 * Run with:  npm run test:push
 */
import { untt } from "./i18n-source"
import { existsSync, readFileSync } from "node:fs"
import { readCode, readSource } from "./_source"
import { creatorPhoto, keptPhoto, mirrorsProfilePhoto } from "../lib/account/identity"
import { followProfilePhoto } from "../lib/account/avatar"
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

const BASE = "https://proj.supabase.co/storage/v1/object/public"
/* The three photos in the report, as the rows actually held them. */
const FACE = `${BASE}/avatars/user-1/avatar-1700000000000.jpg`
const LOUD_LOGO = `${BASE}/avatars/user-1/avatar-1750000000000.jpg`
const ONEPAGE_UPLOAD = `${BASE}/onepage-assets/user-1/avatar-1760000000000.png`
const NEW_PHOTO = `${BASE}/avatars/user-1/avatar-1800000000000.jpg`

/* ── A stand in database ───────────────────────────────────────────────── */
type Row = Record<string, unknown>
interface World {
  onepages: Row[]
  creators: Row[]
  configs: Row[]
}

function clientFor(w: World): FollowClient {
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
          for (const row of (held[name] ?? []).filter((r) => r[column] === value)) Object.assign(row, values)
          return Promise.resolve({ data: null, error: null }) as never
        },
      }),
    }),
  }
}

/** The owner's account as it was reported: three different photos at once. */
function threeFaces(): World {
  return {
    onepages: [
      {
        id: "page-1",
        owner_id: "user-1",
        title: "Andrew",
        avatar_url: ONEPAGE_UPLOAD,
        published_profile: { title: "Andrew", bio: "", avatar_url: ONEPAGE_UPLOAD },
        settings: {},
      },
    ],
    creators: [{ id: "creator-1", user_id: "user-1", display_name: "Andrew", avatar_url: FACE }],
    configs: [
      {
        id: "config-1",
        creator_id: "creator-1",
        draft_config: { headerSettings: { avatarUrl: FACE }, globalSettings: { storeName: "Andrew" } },
        published_config: { headerSettings: { avatarUrl: FACE }, globalSettings: { storeName: "Andrew" } },
      },
    ],
  }
}

const photosIn = (w: World): string[] => {
  const cfg = (key: "draft_config" | "published_config") => ((w.configs[0][key] as Row).headerSettings as Row).avatarUrl
  return [
    String(w.onepages[0].avatar_url),
    String((w.onepages[0].published_profile as Row).avatar_url),
    String(w.creators[0].avatar_url),
    String(cfg("draft_config")),
    String(cfg("published_config")),
  ]
}

async function main() {
  /* ── One source of truth ───────────────────────────────────────────────── */
  console.log("\nThe profile is the photo, and it is read before any copy")
  {
    check("the live profile wins over the copy taken at publish", creatorPhoto({ published: ONEPAGE_UPLOAD, own: FACE, live: LOUD_LOGO }) === LOUD_LOGO)
    check("and over the page's own copy", creatorPhoto({ published: null, own: ONEPAGE_UPLOAD, live: LOUD_LOGO }) === LOUD_LOGO)
    check("a copy answers only for a page drawn without the profile to hand", creatorPhoto({ published: null, own: ONEPAGE_UPLOAD, live: null }) === ONEPAGE_UPLOAD)
    check("and a sign in provider's picture is never that answer", creatorPhoto({ published: null, own: "https://lh3.googleusercontent.com/a/ACg8ocK=s96-c", live: null }) === null)
    check("the placeholder is not a photo", keptPhoto("/placeholder.svg") === null)
  }

  /* ── No copy is ever "chosen" ─────────────────────────────────────────── */
  console.log("\nA copy mirrors the profile, whatever it holds")
  {
    check("a photo another editor wrote follows", mirrorsProfilePhoto(ONEPAGE_UPLOAD, NEW_PHOTO) === NEW_PHOTO)
    check("so does an empty one", mirrorsProfilePhoto(null, NEW_PHOTO) === NEW_PHOTO)
    check("a removal empties it", mirrorsProfilePhoto(ONEPAGE_UPLOAD, null) === null)
    check("a copy already on it is not written again", mirrorsProfilePhoto(NEW_PHOTO, NEW_PHOTO) === undefined)
    check("the creator page header takes it too", (followProfilePhoto({ headerSettings: { avatarUrl: FACE } }, NEW_PHOTO) as { headerSettings: { avatarUrl: string } })?.headerSettings.avatarUrl === NEW_PHOTO)
    check("and shows the initials on a removal", (followProfilePhoto({ headerSettings: { avatarUrl: FACE } }, null) as { headerSettings: { avatarUrl: string } })?.headerSettings.avatarUrl === "")
    check("the exception that let them drift is gone", !readCode("lib/account/identity.ts").includes("export function followsProfilePhoto"))
    check("but a page title somebody typed is still left alone", readCode("lib/account/profile-follow.ts").includes("followsProfile("))
  }

  /* ── The account that was reported ─────────────────────────────────────── */
  console.log("\nThree photos at once, reconciled to one")
  {
    const w = threeFaces()
    check("it really does start with three", new Set(photosIn(w)).size === 2 && photosIn(w).includes(FACE) && photosIn(w).includes(ONEPAGE_UPLOAD))
    await followProfileIdentity(clientFor(w), "user-1", { photo: { after: LOUD_LOGO } })
    check("every copy is the profile's photo now", photosIn(w).every((p) => p === LOUD_LOGO), photosIn(w))
    check("the published OnePage follows without being republished", (w.onepages[0].published_profile as Row).avatar_url === LOUD_LOGO)
    check("the name is not touched by a photo change", w.onepages[0].title === "Andrew" && (w.configs[0].draft_config as Row & { globalSettings: Row }).globalSettings.storeName === "Andrew")
  }

  /* ── Whichever editor it was changed in ────────────────────────────────── */
  console.log("\nChanging it anywhere ends with the same photo everywhere")
  {
    for (const [where, before] of [
      ["Settings", LOUD_LOGO],
      ["the OnePage editor", ONEPAGE_UPLOAD],
      ["the creator page", FACE],
    ] as const) {
      const w = threeFaces()
      await followProfileIdentity(clientFor(w), "user-1", { photo: { before, after: NEW_PHOTO } })
      check(`a photo saved from ${where} reaches all five copies`, photosIn(w).every((p) => p === NEW_PHOTO), photosIn(w))
    }
    const removed = threeFaces()
    await followProfileIdentity(clientFor(removed), "user-1", { photo: { after: null } })
    check("and a removal empties all five", photosIn(removed).every((p) => p === "null" || p === ""), photosIn(removed))
  }

  /* ── Every editor saves the same photo ─────────────────────────────────── */
  console.log("\nEvery photo control in the app saves the profile")
  {
    const settings = readCode("components/app/settings/profile-photo.tsx")
    check("Settings › General saves through the account route", settings.includes('fetch("/api/account/avatar"') && settings.includes('from("avatars")'))

    const links = readCode("components/onepage/tabs/links-tab.tsx")
    /* Round 11: the crop sheet (components/onepage/crop-upload.tsx) uploads it, into the avatars bucket, in both the Links and the Design tab. */
    check("the OnePage editor uploads into the account's own avatars folder", /prefix="avatar"\s+bucket="avatars"/.test(links) && /prefix="avatar"\s+bucket="avatars"/.test(readCode("components/onepage/tabs/design-tab.tsx")))
    check("and saves it as the profile photo", links.includes('fetch("/api/account/avatar"'))
    check("it no longer keeps its photo in onepage-assets", !/from\("onepage-assets"\)\.upload\(fileName, blob/.test(links))
    check("removing it there removes the one photo", /url: null/.test(links) && links.includes("announceAvatar(null)"))

    const pageSection = readCode("components/onepage/profile-section.tsx")
    check("the OnePage profile section saves it the same way", pageSection.includes('from("avatars")') && pageSection.includes('fetch("/api/account/avatar"'))

    const storefront = readCode("components/storefront/edit-profile-button.tsx")
    check("the storefront's Edit profile uploads to the avatars bucket and saves the profile", storefront.includes('bucket="avatars"') && storefront.includes('fetch("/api/creator-profile"'))
    check("and tells the shell at once", storefront.includes("announceAvatar("))

    for (const file of ["components/app/creator-onboarding-modal.tsx", "components/onepage/onboarding-modal.tsx"]) {
      const onboarding = readCode(file)
      check(`the photo picked in ${file.split("/").pop()} is the one profile photo`, onboarding.includes('from("avatars")') && onboarding.includes('fetch("/api/account/avatar"'))
    }
  }

  /* ── And no route can write a second one ───────────────────────────────── */
  console.log("\nNo route freezes a photo of its own")
  {
    const onepage = readCode("app/api/onepage/route.ts")
    check("the OnePage save never takes the photo from the request", onepage.includes("updates.avatar_url = photoNow") && !/updates\.avatar_url = avatar_url/.test(onepage))
    check("it reads the profile for it", onepage.includes('from("profiles").select("avatar_url")'))
    check("and moves every copy after the save", onepage.includes("followProfileIdentity("))

    const publish = readCode("app/api/onepage/publish/route.ts")
    check("publishing freezes the profile's photo, not the browser's copy", (publish.match(/avatar_url: photoNow/g) ?? []).length === 4)

    const builder = readCode("app/api/store-builder/route.ts")
    check("the creator page writes the profile and then the copies", (builder.match(/followProfileIdentity\(/g) ?? []).length === 3)

    const creatorProfile = readCode("app/api/creator-profile/route.ts")
    check("the storefront's Edit profile does too", creatorProfile.includes("followProfileIdentity("))

    const avatarRoute = readCode("app/api/account/avatar/route.ts")
    check("and so does the one route Settings uses", avatarRoute.includes("followProfileIdentity(") && avatarRoute.includes("saveProfilePhoto("))
    check("no route deletes the file it replaced", !/\.remove\(/.test(avatarRoute))

    const icon = readCode("app/api/onepage/seller-avatar/route.ts")
    check("the tab icon reads the profile before the creator page header", icon.indexOf('from("profiles")') < icon.indexOf('from("store_builder_configs")'))

    const creatorPage = readCode("app/(storelib)/(marketing)/u/[username]/page.tsx")
    /* Round 12: the drawn card's fingerprint, and the share route, take the profile photo before the header's copy. */
    check("the creator page's share card takes the profile photo before the header's copy", creatorPage.includes("profile.avatar_url || avatarFromHeader") && readCode("app/(storelib)/(marketing)/member/[username]/share.png/route.tsx").includes("profile.avatarUrl || creatorFace?.avatar"))

    const preview = readCode("components/onepage/live-preview.tsx")
    check("the editor's preview hears a photo change at once", preview.includes("useShellAvatar("))

    const brand = readCode("lib/email-campaigns/brand-server.ts")
    check("a receipt's sender photo is the live profile", brand.includes("senderPhoto(profile?.avatar_url)"))
  }

  /* ── The screens say so ────────────────────────────────────────────────── */
  console.log("\nOne place to change it, and no line under it explaining so (owner's call)")
  {
    const WHERE = /Shown on your creator page|This is your (Storelib )?profile photo\./
    const settings = readSource("components/app/settings/profile-photo.tsx")
    check("no line under the Settings control", !WHERE.test(settings))
    check("its buttons are 44px on a phone", settings.includes("h-11 rounded-lg px-4 text-[13px] sm:h-9"))
    check("there is no per surface override to reset", !/Use my profile photo/i.test(settings))

    const links = readSource("components/onepage/tabs/links-tab.tsx")
    check("the OnePage control carries no explanation either", !WHERE.test(links))
    check("and calls itself by the same name", links.includes(">Profile photo</SheetDialogTitle>"))

    const storefront = readSource("components/storefront/edit-profile-button.tsx")
    /* Changed on purpose (round 41): the sheet's labels carry the /app label style. */
    check("nor the storefront sheet", !WHERE.test(storefront) && storefront.includes(">Profile photo</Label>"))

    const builderSidebar = readSource("components/store-builder/sections-sidebar.tsx")
    check("nor the creator page builder", !WHERE.test(builderSidebar))
  }

  /* ── The database part ─────────────────────────────────────────────────── */
  console.log("\nThe SQL: one statement per line, safe twice, and mirrored in migrations")
  {
    const path = "supabase/sql/run-now/53_one_profile_photo.sql"
    check("the part is on disk", existsSync(path))
    const part = untt(readFileSync(path, "utf8"), path)
    const lines = part.trim().split("\n")
    check("every line is a /* */ comment or one whole statement", lines.every((l) => (l.startsWith("/*") && l.endsWith("*/")) || /;\s*$/.test(l)))
    check("and there is no -- comment", !/^\s*--/m.test(part))
    check("it ends by reloading the schema", part.trim().endsWith("notify pgrst, 'reload schema';"))
    check("the photo follow becomes a mirror", /CREATE OR REPLACE FUNCTION public\.storelib_follow_photo\(stored text, was text, now_value text\) RETURNS text LANGUAGE sql IMMUTABLE AS \$\$ SELECT now_value \$\$;/.test(part))
    check("the OnePage's published copy is brought onto it", part.includes("UPDATE public.onepages o SET avatar_url = p.avatar_url") && part.includes("'{avatar_url}'"))
    check("the creator row too", part.includes("UPDATE public.creators c SET avatar_url = p.avatar_url"))
    check("and the creator page header, draft and published", (part.match(/'\{headerSettings,avatarUrl\}'/g) ?? []).length >= 8)
    check("a face already on the pages is lifted into an empty profile rather than lost", part.includes("public.storelib_best_photo(p.id)"))
    check("but never over a photo the person removed themselves", part.includes("storelib_avatar_chosen"))
    check("a product page's header is only touched where that table exists", part.includes("to_regclass('public.product_page_configs') IS NOT NULL"))

    const migration = untt(readFileSync("supabase/migrations/20261010_one_profile_photo.sql", "utf8"))
    const statements = (sql: string) => sql.split("\n").filter((l) => l.trim() && !l.startsWith("/*") && !l.startsWith("--"))
    check("the migration holds the same statements", JSON.stringify(statements(migration)) === JSON.stringify(statements(part)))

    check("listed in the README", /\| `53_one_profile_photo\.sql` \|/.test(untt(readFileSync("supabase/sql/run-now/README.md", "utf8"))))
    const after = untt(readFileSync("supabase/sql/run-now/99_check_after.sql", "utf8"))
    check("the check after has a column for it", after.includes("as p53_one_profile_photo"))
    check("and file 3 of four carries the part", untt(readFileSync("supabase/sql/run-four/3_of_4_latest.sql", "utf8")).includes("-- part 53_one_profile_photo.sql"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main()
