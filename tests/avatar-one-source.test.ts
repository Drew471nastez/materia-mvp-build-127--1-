/**
 * ===========================================================================
 *  ONE PROFILE PHOTO, EVERYWHERE
 * ===========================================================================
 * "When I'm in the settings tab and I click to delete the profile photo I
 * have there, it shows the initials there, but then it shows the image I
 * created my account with (Google) in the black top bar. And when I delete
 * that one, it shows the initials in that one."
 *
 * The rule (lib/account/avatar): `profiles.avatar_url` is the photo, the
 * initials when it is empty; the Google picture is copied in at sign up only;
 * removing it is remembered on the account (AVATAR_CHOSEN) so it never comes
 * back. This suite runs the save (lib/account/avatar-save) against a stand in
 * database with a Google picture in it, and a database that copies the
 * account's picture into the profile whenever the account changes, which is
 * the shape of "the first removal came back, the second one stuck":
 *
 *   remove   the initials in the profile, in the creator page header (draft
 *            and published), the choice marked on the account
 *   sign in  with Google again: the picture stays away
 *   save     the creator page, unchanged: the profile is left alone
 *   upload   the new photo in the profile and the creator page header
 *   reload   every reader works out the same photo
 *
 * The screens are measured in a browser by scripts/check-avatar-everywhere.mjs.
 *
 * Run with:  npm run test:push
 */
import { readCode } from "./_source"
import { AVATAR_CHOSEN, copyProviderAvatar, followProfilePhoto, onboardingPhoto, pagePhotoForProfile, profileAvatar } from "../lib/account/avatar"
import { saveProfilePhoto, type PhotoClient } from "../lib/account/avatar-save"
import { headerAvatar } from "../lib/store-builder/header-avatar"

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
const MINE = "https://proj.supabase.co/storage/v1/object/public/avatars/user-1/avatar-1727000000000.jpg"

/* ── A stand in database ───────────────────────────────────────────────── */
type Row = Record<string, unknown>
interface World {
  profiles: Map<string, Row>
  creators: Row[]
  configs: Row[]
  meta: Record<string, unknown>
  calls: string[]
  /** What the database does when the account changes, if anything. */
  onAccountChange?: (w: World) => void
  /** Row level security turning the profile update away. */
  refuseProfile?: boolean
}

function clientFor(w: World): PhotoClient {
  const result = <T>(data: T, error: unknown = null) => Promise.resolve({ data, error } as { data: T; error: null })
  return {
    auth: {
      updateUser: ({ data }: { data: Record<string, unknown> }) => {
        w.calls.push("auth.updateUser")
        Object.assign(w.meta, data)
        w.onAccountChange?.(w)
        return result({ user: { user_metadata: w.meta } })
      },
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: string) => {
          const run = () => {
            w.calls.push(`${table}.update`)
            if (table === "profiles") {
              const row = w.profiles.get(value)
              if (!row || w.refuseProfile) return [] as Row[]
              Object.assign(row, values)
              return [row]
            }
            const rows = (table === "store_builder_configs" ? w.configs : w.creators).filter((r) => r[column] === value)
            for (const r of rows) Object.assign(r, JSON.parse(JSON.stringify(values)))
            return rows
          }
          const promise = Promise.resolve().then(() => ({ data: null, error: null, rows: run() }))
          return {
            then: (ok: (v: { data: null; error: null }) => unknown, bad?: (e: unknown) => unknown) => promise.then((v) => ok({ data: null, error: null }), bad),
            select: (columns: string) =>
              promise.then((v) => ({ data: v.rows.map((r) => Object.fromEntries(columns.split(",").map((c) => c.trim()).map((c) => [c, r[c] ?? null]))), error: null })),
          } as never
        },
      }),
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => {
            const rows = table === "creators" ? w.creators : table === "profiles" ? [...w.profiles.values()] : w.configs
            return result(rows.find((r) => r[column] === value) ?? null)
          },
          eq: (column2: string, value2: string) => result(w.configs.filter((r) => r[column] === value && r[column2] === value2)),
        }),
      }),
    }),
  } as unknown as PhotoClient
}

const header = (avatarUrl: string | undefined) => ({
  headerSettings: { title: "Mara", ...(avatarUrl === undefined ? {} : { avatarUrl }) },
  sections: [{ id: "header-1", type: "header", settings: { title: "Mara", ...(avatarUrl === undefined ? {} : { avatarUrl }) } }, { id: "p", type: "products", settings: {} }],
})

function googleWorld(): World {
  /* A Google sign up that went through onboarding: the picture in the profile, the creator page and its published copy. */
  return {
    profiles: new Map([["user-1", { id: "user-1", avatar_url: GOOGLE }]]),
    creators: [{ id: "creator-1", user_id: "user-1" }],
    configs: [{ id: "cfg-1", creator_id: "creator-1", page_type: "shop", draft_config: header(GOOGLE), published_config: header(GOOGLE) }],
    meta: { avatar_url: GOOGLE, picture: GOOGLE, full_name: "Mara Lind" },
    calls: [],
    /* The shape of the report: whenever the account changes, its picture is copied into the profile. */
    onAccountChange: (w) => {
      const row = w.profiles.get("user-1")
      if (row) row.avatar_url = w.meta.avatar_url ?? row.avatar_url
    },
  }
}

/** What every reader works out from the database: the /app header and Settings, and the public creator page. */
function everywhere(w: World) {
  const profile = w.profiles.get("user-1")!
  const cfg = w.configs[0]
  const pub = (cfg.published_config as { headerSettings?: { avatarUrl?: string } }).headerSettings
  const draft = (cfg.draft_config as { headerSettings?: { avatarUrl?: string } }).headerSettings
  return {
    header: profileAvatar(profile.avatar_url as string | null),
    creatorPage: headerAvatar(pub, profile.avatar_url as string | null).url ? "photo" : "initials",
    creatorPageUrl: pub?.avatarUrl,
    editor: draft?.avatarUrl,
  }
}

async function main() {
  console.log("\n1. Remove, with a Google picture everywhere")
  {
    const w = googleWorld()
    const user = { id: "user-1", user_metadata: { ...w.meta } }
    const saved = await saveProfilePhoto(clientFor(w), user, null)
    const seen = everywhere(w)
    check("the save says it worked", saved.ok === true, saved)
    check("the choice is marked on the account before the photo is written", w.calls.indexOf("auth.updateUser") >= 0 && w.calls.indexOf("auth.updateUser") < w.calls.indexOf("profiles.update"), w.calls)
    check("so a database that copies the account's picture into the profile cannot undo the removal", w.profiles.get("user-1")!.avatar_url === null, w.profiles.get("user-1"))
    check("the /app header (and Settings, the sidebar, the account sheet) show the initials", seen.header === null)
    check("the creator page header, draft and published, is the initials too", seen.creatorPage === "initials" && seen.creatorPageUrl === "" && seen.editor === "", seen)
    check("the header section's own copy follows", ((w.configs[0].published_config as { sections: Array<{ type: string; settings: { avatarUrl?: string } }> }).sections.find((s) => s.type === "header")!.settings.avatarUrl) === "")
    check("and the choice is remembered", w.meta[AVATAR_CHOSEN] === true)

    console.log("\n2. Signing in with Google again, a minute later")
    check("does not copy the picture back",
      !copyProviderAvatar({ profileExists: true, profileAvatar: w.profiles.get("user-1")!.avatar_url as null, providerAvatar: GOOGLE, chosen: w.meta[AVATAR_CHOSEN] === true, accountAgeMs: 60_000 }))
    check("and the seller onboarding does not start from it", onboardingPhoto({ profileAvatar: null, providerAvatar: GOOGLE, chosen: true }) === null)

    console.log("\n3. Saving the creator page without touching its photo")
    const draft = (w.configs[0].draft_config as { headerSettings: { avatarUrl?: string } }).headerSettings.avatarUrl
    check("hands the profile nothing", pagePhotoForProfile(draft, draft) === undefined)
    check("nor does publishing it", pagePhotoForProfile("", "") === undefined)
    check("an old copy of the Google picture saved over a removal would be a change the person made there", pagePhotoForProfile(GOOGLE, "") === GOOGLE)

    console.log("\n4. Upload a new photo")
    const user2 = { id: "user-1", user_metadata: { ...w.meta } }
    w.calls = []
    const up = await saveProfilePhoto(clientFor(w), user2, MINE)
    const now = everywhere(w)
    check("the save says it worked", up.ok === true, up)
    check("the account is not written again once the choice is marked", !w.calls.includes("auth.updateUser"), w.calls)
    check("the header shows the new photo", now.header === MINE)
    check("the creator page header shows it, draft and published", now.creatorPage === "photo" && now.creatorPageUrl === MINE && now.editor === MINE, now)

    console.log("\n5. Reload")
    const again = everywhere(w)
    check("every reader works out the same photo from what was saved", again.header === MINE && again.creatorPageUrl === MINE)
  }

  console.log("\n6. What the save refuses to call saved")
  {
    const w = googleWorld()
    w.refuseProfile = true
    const r = await saveProfilePhoto(clientFor(w), { id: "user-1", user_metadata: {} }, null)
    check("an update the database turned away (no row changed) is an error, not a quiet success", r.ok === false && (r as { status: number }).status === 409, r)
    check("and nothing on the creator page moved", (w.configs[0].published_config as { headerSettings: { avatarUrl: string } }).headerSettings.avatarUrl === GOOGLE)
  }
  {
    const w = googleWorld()
    /* A database that puts the picture back in the same statement. */
    const c = clientFor(w)
    const sneaky = {
      ...c,
      from: (table: string) => {
        const t = c.from(table)
        if (table !== "profiles") return t
        return { ...t, update: () => t.update({ avatar_url: GOOGLE }) }
      },
    } as PhotoClient
    const r = await saveProfilePhoto(sneaky, { id: "user-1", user_metadata: { [AVATAR_CHOSEN]: true } }, null)
    check("a profile that reads back a different photo than the one saved is an error", r.ok === false, r)
  }

  console.log("\n7. The creator page follows only a photo it holds")
  check("a header with no photo of its own already shows the profile's: left alone", followProfilePhoto(header(undefined), null) === null && followProfilePhoto(header(undefined), MINE) === null)
  check("a header holding the old photo takes the new one", (followProfilePhoto(header(GOOGLE), MINE) as { headerSettings: { avatarUrl: string } }).headerSettings.avatarUrl === MINE)
  check("and the initials on a removal", (followProfilePhoto(header(GOOGLE), null) as { headerSettings: { avatarUrl: string } }).headerSettings.avatarUrl === "")
  check("nothing to write when it already matches", followProfilePhoto(header(MINE), MINE) === null && followProfilePhoto(header(""), null) === null)
  check("the rest of the page is left as it was", JSON.stringify((followProfilePhoto(header(GOOGLE), MINE) as { sections: unknown[] }).sections[1]) === JSON.stringify(header(GOOGLE).sections[1]))
  check("no config, no change", followProfilePhoto(null, MINE) === null)

  console.log("\n8. Onboarding starts from the profile")
  check("the profile's photo first", onboardingPhoto({ profileAvatar: MINE, providerAvatar: GOOGLE, chosen: false }) === MINE)
  check("the Google picture for a person who never chose one", onboardingPhoto({ profileAvatar: null, providerAvatar: GOOGLE, chosen: false }) === GOOGLE)
  check("nothing for a person who removed theirs", onboardingPhoto({ profileAvatar: null, providerAvatar: GOOGLE, chosen: true }) === null)

  console.log("\n9. The code that does it")
  const saveSrc = readCode("lib/account/avatar-save.ts")
  const route = readCode("app/api/account/avatar/route.ts")
  check("the route saves through saveProfilePhoto on the person's own client and clears the creator page's shared cache",
    /saveProfilePhoto\(supabase as unknown as PhotoClient, user, url\)/.test(route) && /revalidateTag\(creatorTag\(user\.id\), "max"\)/.test(route) && /revalidateTag\(creatorTag\(saved\.creatorId\), "max"\)/.test(route))
  check("and still takes a photo only from the person's own folder", /\/storage\/v1\/object\/public\/avatars\/\$\{userId\}\//.test(route))
  check("the save marks the choice, then writes the profile and reads it back",
    saveSrc.indexOf("supabase.auth.updateUser({ data: { [AVATAR_CHOSEN]: true } })") > 0 &&
      saveSrc.indexOf("supabase.auth.updateUser({ data: { [AVATAR_CHOSEN]: true } })") < saveSrc.indexOf('.from("profiles").update({ avatar_url: url }).eq("id", user.id).select("avatar_url")'))
  const store = readCode("lib/account/avatar-store.ts")
  check("an announcement reaches the other tabs and corrects the public header's snapshot",
    /new BroadcastChannel\(CHANNEL\)/.test(store) && /tabs\(\)\?\.postMessage\(\{ url: clean \}\)/.test(store) && /writeAuthSnapshot\(\{ \.\.\.snap, avatarUrl: url \}\)/.test(store))
  const form = readCode("components/app/settings-form-new.tsx")
  check("Settings reads the photo where the header reads it, and the save bar does not ask about it",
    /const avatarUrl = useShellAvatar\(profile\.avatar_url\) \?\? ""/.test(form) && !/setAvatarUrl|avatarUrl !== initialValues/.test(form))
  const builder = readCode("app/api/store-builder/route.ts")
  check("the creator page's save and both publishes hand the profile a photo only when it changed there",
    (builder.match(/pagePhotoForProfile\(/g) ?? []).length === 3 && !/const avatarValue = config\.headerSettings\.avatarUrl === "" \? null/.test(builder)
      && !/currentConfig\.draft_config\.headerSettings\.avatarUrl === ""/.test(builder))
  const onboarding = readCode("components/app/creator-onboarding-modal.tsx")
  check("onboarding starts from onboardingPhoto, not the Google picture", /const start = onboardingPhoto\(\{/.test(onboarding) && !/if \(user\?\.user_metadata\?\.avatar_url\) \{\s*setAvatarUrl/.test(onboarding))
  const library = readCode("app/library/settings/buyer-settings.tsx")
  check("the library's photo is saved through the same route and announced", /fetch\("\/api\/account\/avatar"/.test(library) && /announceAvatar\(url\)/.test(library) && !/update\(\{ avatar_url: url \}\)/.test(library))
  const layout = readCode("app/app/layout.tsx")
  check("the /app header's photo is still the profile's, with no fallback", /const avatarUrl = profileAvatar\(profile\?\.avatar_url\)/.test(layout) && !/user_metadata\??\.(avatar_url|picture)/.test(layout))
  /*
    The account menu and the phone's account sheet are headed by the businesses of the login: the row
    for the one you are in drew the list's own copy of the photo, which fell back to the creator row's
    older one after a removal, and waited for the server after a change.
  */
  const businesses = readCode("lib/businesses/server.ts")
  check("the businesses' photos are their profiles', with no fallback to an older copy on the creator row",
    /avatarUrl: profileAvatar\(p\?\.avatar_url\),/.test(businesses) && !/c\?\.avatar_url/.test(businesses) && /select\("user_id, slug, display_name, onboarding_completed"\)/.test(businesses))
  const switcher = readCode("components/app/business-switcher.tsx")
  check("the row for the business you are in draws the header's photo, so it changes with it",
    /* The business you are in is its own row at the top of the switcher now (one row that opens to the rest), drawn from `current`. */
    /src=\{currentAvatar !== undefined \? currentAvatar \|\| null : current\.avatarUrl\}/.test(switcher) && /const current = businesses\.find\(\(b\) => b\.current\)/.test(switcher) &&
      /<BusinessSwitcher businesses=\{businesses\} variant="dropdown" currentAvatar=\{avatarSrc\}/.test(readCode("components/app/sidebar.tsx")) &&
      /<BusinessSwitcher businesses=\{businesses\} variant="sheet" currentAvatar=\{avatarSrc\}/.test(readCode("components/app/mobile-account-menu.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}
main()
