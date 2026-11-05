/**
 * ===========================================================================
 *  THE BUYER'S PROFILE: OVERVIEW AND SETTINGS
 * ===========================================================================
 * The owner, about /account: "When I click on it, it should not be direct
 * account settings. It needs to be the account with multiple subpages there,
 * such as settings, overview. Like a profile, a user profile, not directly
 * changing the name or profile photo." And: "in the profile page there
 * should be the header present like in the library page".
 *
 * Since then the owner made /account the profile center: "it is MY
 * profile page, exactly the same page others see ... plus owner extras:
 * pill navigation for Activity, Communities, Library ..., Edit profile,
 * Settings". The addresses are pure functions and are asked
 * here. The wiring (the header, the tabs' switch, where signed out goes) is
 * read off the source. How it looks and how the switch moves is measured in
 * scripts/check-account-hub.mjs.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ACCOUNT_TABS, accountLoginPath, accountTabFor } from "../lib/account/account-tabs"
import { sellerAccessFrom, hasSellerAccess } from "../lib/account/seller-access"
import { buyerTabFor, buyerTabsBelongOn } from "../lib/nav/buyer-tabs"
import { ownerPillFor, showsProfileHeader } from "../lib/profile/owner-pills"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nThe profile's pages")
check("Overview, then Settings", ACCOUNT_TABS.map((t) => `${t.label} ${t.href}`).join() === "Overview /account,Settings /account/settings", ACCOUNT_TABS)
const tabCases: Array<[string, number]> = [["/account", 0], ["/account/", 0], ["/account/settings", 1], ["/account/settings/", 1], ["/account/settingsx", 0], ["", 0]]
for (const [p, want] of tabCases) check(`${p || "(no path)"} is ${ACCOUNT_TABS[want].label}`, accountTabFor(p) === want, accountTabFor(p))
check("signed out, each page comes back to itself", accountLoginPath("/account") === "/login?next=%2Faccount" && accountLoginPath("/account/settings") === "/login?next=%2Faccount%2Fsettings")
check("both are the Profile tab of the phone's bar, with the bar drawn", buyerTabFor("/account/settings") === 3 && buyerTabsBelongOn("/account/settings") && buyerTabFor("/account") === 3)

console.log("\nEvery page under /account sends signed out people to sign in with its own address")
{
  const pages: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${name}`
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel)
      else if (name === "page.tsx") pages.push(rel)
    }
  }
  walk("app/(storelib)/account")
  check("Activity, Communities and Settings are routes of their own", pages.includes("app/(storelib)/account/page.tsx") && pages.includes("app/(storelib)/account/communities/page.tsx") && pages.includes("app/(storelib)/account/settings/page.tsx"), pages)
  /* The library's pages moved in whole; its own layout sends signed out people to sign in with the library's address. */
  check("the library's layout sends signed out people to sign in and back to the library", /redirect\(accountLoginPath\(LIBRARY_HOME\)\)/.test(code("app/(storelib)/account/library/layout.tsx")))
  for (const page of pages.filter((p) => !p.startsWith("app/(storelib)/account/library/"))) {
    /* Changed on purpose (r52): Storelib's pages are under app/(storelib), the published websites' root is app/(site). */
    const href = page.replace(/^app\/\(storelib\)/, "").replace(/\/page\.tsx$/, "") || "/account"
    const escaped = href.replace(/\//g, "\\/")
    /* Changed on purpose: 84d43680 made /account/preferences an old address that only redirects to Settings' Preferences section, so it asks through the page it sends to, which must ask with its own next. */
    const moved = /^\s*redirect\("(\/account\/[a-z/-]+)\?section=[a-z]+"\)/m.exec(code(page))
    const asking = moved && !/pageUser\(|currentUser/.test(code(page)) ? `app/(storelib)${moved[1]}/page.tsx` : page
    const askingHref = asking.replace(/^app\/\(storelib\)/, "").replace(/\/page\.tsx$/, "") || "/account"
    check(`${page} asks with next=${askingHref}`, existsSync(join(process.cwd(), asking)) && new RegExp(`pageUser\\(accountLoginPath\\("${askingHref.replace(/\//g, "\\/")}"\\)\\)`).test(code(asking)))
  }
  check("no loading.tsx above the pages, so that redirect is a real one and not a hop after a skeleton", !existsSync(join(process.cwd(), "app/(storelib)/account/loading.tsx")))
  check("and the layout does not redirect for them (it cannot know which page it is)", !/redirect\(/.test(code("app/(storelib)/account/layout.tsx")))
}

console.log("\nThe header, as on the library, at every width")
{
  const layout = code("app/(storelib)/account/layout.tsx")
  /* Changed on purpose: 84d43680 mounts the platform header through AccountHeaderSwitch, which stands it aside only while a community's own bar is drawn on the profile. */
  const mount = /<AccountHeaderSwitch initialWishlistCount=\{initialWishlistCount\} onPlatformDomain=\{onPlatformDomain\} buyerHeaderLight=\{buyerHeaderLight\} \/>/
  const headerSwitch = code("components/account/account-header-switch.tsx")
  check("the layout mounts the platform header, and the library inside it draws none of its own", mount.test(layout) && /return <ConditionalHeader \{\.\.\.props\} \/>/.test(headerSwitch) && !/ConditionalHeader|BuyerTabBar|ConditionalFooter/.test(code("app/(storelib)/account/library/layout.tsx")))
  check("with the footer and the phone's tab bar", /<ConditionalFooter \/>/.test(layout) && /<BuyerTabBar \/>/.test(layout))
  const header = code("components/marketing/conditional-header.tsx")
  const footer = code("components/marketing/conditional-footer.tsx")
  check("and the header draws on /account and its pages (it was not on the list, so it drew nothing there)", /\(\(p === "\/account" \|\| p\.startsWith\("\/account\/"\)\) && !p\.startsWith\("\/account\/continue"\)\)/.test(header))
  check("the footer too", /\(\(pathname === "\/account" \|\| pathname\.startsWith\("\/account\/"\)\) && !pathname\.startsWith\("\/account\/continue"\)\)/.test(footer))
  /* "The profile page reached from Explore needs to have the header on it." The rule that kept it off a phone, and the wrapper that applied it, are both gone. */
  check("nothing hides it on a phone any more: no rule, no wrapper", !/hidesHeaderOnPhone/.test(header) && !/data-header-phone/.test(header))
  /* Round 5: the cover runs edge to edge, so the column is drawn under it by the hub (components/account/account-column.tsx), not around everything by the layout. */
  /* Round 12: /@handle is the creator page's template now (components/profile/member-profile-page.tsx), so /account keeps its own 960 column. */
  check("the column is the profile's own width, the library a little wider and a course's lessons wider still (changed on purpose: \"too narrow\")", /width = "max-w-\[960px\]"/.test(read("components/account/account-column.tsx")) && /"max-w-\[1040px\]"/.test(read("components/account/account-column.tsx")) && /"max-w-\[1280px\]"/.test(read("components/account/account-column.tsx")) && /"pt-4 sm:pt-6"/.test(read("components/account/account-column.tsx")) && /<AccountColumn>\{children\}<\/AccountColumn>/.test(layout) )
}

console.log("\nThe hub: your own profile page, as everybody sees it, with your pills")
{
  const hub = code("components/account/account-hub.tsx")
  const hero = code("components/profile/profile-hero.tsx")
  const layout = code("app/(storelib)/account/layout.tsx")
  check("in the layout, so the person stays put while the page changes", /<AccountHub identity=\{identity\} communities=\{communities\}>/.test(layout))
  /* "it is MY profile page, exactly the same page others see (same header, cover, avatar ...)" */
  /* Round 12: /@handle draws the creator page's header (ShopHeaderRenderer); /account keeps ProfileHero. */
  check("the header is ProfileHero, with the cover; /@handle draws the creator header", /<ProfileHero\b/.test(hub) && /<ShopHeaderRenderer\b/.test(code("components/profile/member-profile-page.tsx")) && /coverUrl: identity\.coverUrl/.test(hub))
  /* Round 5: no "Joined <month year>" line under the name any more (the activity ends on that day anyway). */
  check("photo, name, @username, the bio, the follower counts, and no Joined line", /useShellAvatar\(identity\.avatarUrl\)/.test(hub) && /@\{person\.username\}/.test(hero) && !/Joined \{/.test(hero) && !/memberSince/.test(hero + hub + layout) && /data-profile-bio=""/.test(hero) && /<ProfileSocial\b/.test(hero))
  check("the photo is the account's live copy and opens in the creator page's lightbox", /<AvatarLightbox src=\{shown\} name=\{name\}>/.test(hub) && /<AccountAvatar\s+src=\{shown\}/.test(hub) && /cursor-zoom-in/.test(hero) && /className=\{PROFILE_AVATAR_CLASS\}/.test(hub))
  /* Round 4: five percent bigger on every profile, 118 / 134 from 112 / 128; round 11 about six percent more, 125 / 142. One class shared with /@handle's hero so the two cannot drift. */
  /* Round 5: "the avatar border lighter (thinner, softer)": a 2px ring and a softer shadow. */
  /* Round 13: "a touch more depth": the same 2px ring with a hairline at its outer edge, and a shadow that travels further. */
  check("the photo is large: 125px on a phone, 142 from 640px, a thin crisp ring and a soft shadow with a little depth, the same class as /@handle", /h-\[125px\] w-\[125px\]/.test(hero) && /sm:h-\[142px\] sm:w-\[142px\]/.test(hero) && /ring-2 ring-\[#f8f9fa\]/.test(hero) && !/ring-4/.test(hero) && /shadow-\[0_1px_2px_rgba\(16,24,40,0\.08\),0_10px_22px_-12px_rgba\(16,24,40,0\.34\)\]/.test(hero) && /outline-1 outline-offset-2 outline-\[rgba\(16,24,40,0\.09\)\]/.test(hero) && /className=\{PROFILE_AVATAR_CLASS\}/.test(hub) && /export const PROFILE_AVATAR_CLASS/.test(hero))
  check("the owner's pills under it", /<ProfileOwnerPills communities=\{communities\}/.test(hub))
  check("the bio, the cover and the counts reach the hub from the layout's own reads", /async function readBio\(userId: string\)/.test(layout) && /personCover\(admin, user\.id\)/.test(layout) && /followCounts\(admin, user\.id\)/.test(layout))
  /* Round 5: "Library opens as its own page ... WITHOUT the profile hero above them (like /account/settings does)". */
  check("Settings and the whole library are pages of their own: the hub draws none of the person there, only the profile's column", /if \(!showsProfileHeader\(pathname\)\) return <AccountColumn width=\{accountWidth\(pathname\)\}>\{children\}<\/AccountColumn>/.test(hub))
  const where: Array<[string, boolean]> = [["/account", true], ["/account/communities", true], ["/account/library", false], ["/account/library/courses", false], ["/account/library/receipts/", false], ["/account/library/products/p1", false], ["/account/library/courses/c1", false], ["/account/library/memberships/m1", false], ["/account/settings", false]]
  for (const [path, want] of where) check(`  ${path}: ${want ? "the person over it" : "its own screen"}`, showsProfileHeader(path) === want)
  /* Edit profile is a button on the cover now, not a pill: every Settings address is the Settings pill. */
  const pills: Array<[string, string | null]> = [["/account", "activity"], ["/account/communities", "communities"], ["/account/library/wishlist", "library"], ["/account/settings", "settings"], ["/account/settings?section=profile", "settings"], ["/account/settings?section=privacy", "settings"], ["/explore", null]]
  for (const [path, want] of pills) check(`  ${path} lights ${want ?? "no pill"}`, ownerPillFor(path) === want)
}

console.log("\nNo light bar of the profile's own: one header on the screen")
{
  const hub = code("components/account/account-hub.tsx")
  const settings = code("components/account/account-settings.tsx")
  const skeleton = code("components/account/account-skeleton.tsx")
  check("the phone bar and its hairline are gone from the hub", !/data-account-bar/.test(hub) && !/PhoneBar/.test(hub) && !/setScrolled/.test(hub))
  check("and nothing else draws one in its place", !/data-account-bar/.test(settings))
  check("the skeleton reserves no room for one either", !/52px/.test(skeleton) && /pt-6 pb-10/.test(skeleton))
  /* Settings' own top row is a row in the page, not a second bar stuck to the top of a phone. */
  /*
    A WAY BACK, NOT A WAY OUT. The round control was an X, which says "you
    are done here" about a screen reached from the profile and returned to.
    "Make sure the thing there is not an X, it is a back icon basically."
  */
  check("Settings' top row is the way back and the word Settings, and never sticky", /data-account-settings-top=""/.test(settings) && /data-account-settings-close=""/.test(settings) && !/className="[^"]*sticky[^"]*"\s*data-account-settings-top/.test(settings) && !/data-account-settings-top=""[^>]*sticky/.test(settings))
  check("  and it is a chevron that says where it goes, not an X: the shared back control, first tap and a real back", /<BackControl fallback=\{BACK_TO\} label="Back to profile"/.test(settings) && /const BACK_TO = "\/account"/.test(settings) && /<ChevronLeft className="h-5 w-5"/.test(read("components/navigation/back-control.tsx")) && !/<X /.test(settings))
  /*
    ONE SECTION DISSOLVES INTO THE NEXT: the one leaving fades out, then
    the one picked fades in behind it. It used to fade the arriving one up
    while the other was taken away in the same frame, which the eye reads
    as a cut ("not so direct, smooth clean").
  */
  /* Round 17, changed on purpose (the owner: "switching in between pill shapes is not smooth"): the fade out then in was a quarter second of a half drawn page, and every section was built again on every visit. */
  check("the section picked is in place on its frame, each one kept once opened", /function KeptSections/.test(settings) && /<KeptSections\s+section=\{section\}/.test(settings) && /hidden=\{s\.key !== section\}/.test(settings) && !/function SectionSwap/.test(settings))
  check("  it lands with the shared short soft fade, holding the height while it does", /landContent\(panes\.current\.get\(section\)/.test(settings) && /holdHeight\(box\.current\)/.test(settings) && /letGoHeight\(box\.current/.test(settings))
  check("  reduced motion just changes (the shared landing does nothing under it)", /prefers-reduced-motion: reduce/.test(read("lib/ui/pill-switch.ts")))
  /* "The photo icon there is too big in the profile avatar circle in the settings." */
  const avatarPhoto = code("components/account/account-photo.tsx")
  check("the camera badge is a badge, not a second button", /h-\[26px\] w-\[26px\][^"]*ring-\[2\.5px\]/.test(avatarPhoto) && /<Camera className="h-\[13px\] w-\[13px\]"/.test(avatarPhoto))
  /*
    AND A PHOTO JUST CHANGED SHOWS AT ONCE IN THE BLACK BAR. Settings
    already announced it to the shell's copy; the public header asked the
    database once on mount and kept that answer, so the old picture stayed
    up there until a full reload.
  */
  const header = code("components/platform/platform-header-client.tsx")
  check("the site header reads the shell's copy, so a new photo is there without a reload", /import \{ useShellAvatar \} from "@\/lib\/account\/avatar-store"/.test(header) && /useShellAvatar\(profile \? profile\.avatar_url : cachedAvatarUrl\)/.test(header))
  check("  and Settings is what announces it, on a save and on a remove", (avatarPhoto.match(/announceAvatar\(/g) ?? []).length >= 2)
}

console.log("\nOne face per screen")
{
  const hub = code("components/account/account-hub.tsx")
  const photo = code("components/account/account-photo.tsx")
  const settings = code("components/account/account-settings.tsx")
  /* "the settings tab opens with the same two profile pictures there, it looks ugly": the hub bows out on Settings, so its one circle is Settings' own. */
  /* It opens the picture now, which is a viewer, not a photo control: still no picker and no camera here. */
  check("the profile's circle is only a picture: it is handed no photo control at all", /<AccountAvatar\s+src=\{shown\}\s+name=\{name\}\s+size=\{PROFILE_AVATAR_PX\.wide\}/.test(hub) && !/useAccountPhoto/.test(hub) && !/photo=\{/.test(hub) && !/editable/.test(hub))
  check("Settings' circle is the control: pressed, it opens the picker", /<AccountAvatar src=\{shown\} name=\{name\} photo=\{photo\} editable/.test(settings) && /useAccountPhoto\(userId/.test(settings) && /\{editable && photo \? \(\s*<button[\s\S]{0,120}onClick=\{photo\.pick\}/.test(photo))
  check("Change photo and Remove sit beside it, and the picker is drawn once", /data-photo-change=""/.test(settings) && /data-photo-remove=""/.test(settings) && (settings.match(/\{photo\.input\}/g) ?? []).length === 1)
  check("uploaded under the owner's folder, through the one photo route, and announced", /`\$\{userId\}\/avatar-\$\{Date\.now\(\)\}\.jpg`/.test(photo) && /fetch\("\/api\/account\/avatar"/.test(photo) && /announceAvatar\(publicUrl\)/.test(photo) && /announceAvatar\(null\)/.test(photo))
  check("the camera only fades and grows, on the compositor", /transition-\[opacity,scale\]/.test(photo) && /editable \? "scale-100 opacity-100" : "scale-75 opacity-0"/.test(photo))
  /* Changed on purpose: 89c6f3ba moved the settings route's reads into lib/account/load-account-settings.ts, shared with the settings sheet's bundle route. */
  check("the layout hands the hub whose photo it is, and the settings route hands it the same one", /userId: user\.id,/.test(code("app/(storelib)/account/layout.tsx")) && /loadAccountSettingsForUser\(user,/.test(code("app/(storelib)/account/settings/page.tsx")) && /avatarUrl: profile\?\.avatar_url \|\| null/.test(code("lib/account/load-account-settings.ts")))
}

console.log("\nSettings: the Skool shape, in Storelib's own parts")
{
  const settings = code("components/account/account-settings.tsx")
  const library = code("components/library/library-tabs.tsx")
  /* Four now: Privacy holds the profile's two switches (show activity, show communities), asked for with profiles for everybody. */
  check("five sections (Notifications since round 12), Profile first, so Edit profile lands on the profile's fields", /\{ key: "profile", label: "Profile" \}[\s\S]*\{ key: "account", label: "Account" \}[\s\S]*\{ key: "privacy", label: "Privacy" \}[\s\S]*\{ key: "preferences", label: "Preferences" \}/.test(settings) && /initialSection = "profile"/.test(settings) && /useState<SectionKey>\(initialSection\)/.test(settings))
  /* Round 17: one fill for every row of pills (lib/ui/pill-switch.ts), the space pills' quiet switch: opacity only over 140ms, nothing scaling. */
  check("the pills are the library's pills: 36px, white on a hairline, the chosen one on #e2e4e8", /h-9 shrink-0 cursor-pointer touch-manipulation select-none items-center whitespace-nowrap rounded-full border border-\[#e4e7ec\] bg-white px-3\.5 text-\[14px\]/.test(settings) && /PILL_FILL/.test(settings) && /PILL_FILL/.test(library) && /bg-\[#e2e4e8\]/.test(read("lib/ui/pill-switch.ts")))
  check("switching the same way: the fill fades in place over the space pills' 140ms, nothing grows", /cn\(PILL_FILL, on \? "opacity-100" : "opacity-0"\)/.test(settings) && /const TAB_FADE_MS = PILL_FADE_MS/.test(library) && /export const PILL_FADE_MS = 140/.test(read("lib/ui/pill-switch.ts")) && !/scale-\[0\.96\]/.test(settings + library))
  check("only the compositor's properties move", !/transition-\[[^\]]*(width|height|left|top|padding|margin)/.test(settings))
  check("the fields are /app Settings' fields: a hairline box, violet on focus, 16px on a phone so iOS does not zoom", /focus:border-\[#8b5cf6\] focus:ring-2 focus:ring-\[#8b5cf6\]\/20/.test(settings) && /text-\[16px\] sm:text-\[14px\]/.test(settings))
  check("a label over each field and a line of help under it", /htmlFor="account-name"/.test(settings) && /htmlFor="account-bio"/.test(settings) && /const HELP = /.test(settings))
  check("the bio has a counter, and the name only once its end is in sight", /<Counter used=\{bio\.length\} max=\{BIO_MAX\}/.test(settings) && /name\.length > NAME_MAX - 20 \? <Counter/.test(settings))
  check("no bio field where profiles.bio has not been added yet", /\{bioSupported \? \(/.test(settings) && /if \(bioSupported\) patch\.bio = nextBio \|\| null/.test(settings))
  /* Changed on purpose: 89c6f3ba moved the settings route's reads into lib/account/load-account-settings.ts. */
  const settingsLoad = code("lib/account/load-account-settings.ts")
  check("the settings route says whether the column is there, from PostgREST's own answer", /loadAccountSettingsForUser/.test(code("app/(storelib)/account/settings/page.tsx")) && /PGRST204/.test(settingsLoad) && /42703/.test(settingsLoad))
  /* Every flow that was on the page before is still on it, and still the shared one. */
  check("the email change, the password card and the preference switches are /app Settings' own", /EmailChangeFlow,/.test(settings) && /PasswordCard,/.test(settings) && /useSavedSwitch,/.test(settings) && /from "@\/components\/app\/settings\/account-panels"/.test(settings))
  check("log out here, log out everywhere, and deleting behind a 6 digit code", /signOut\(\{ scope \}\)/.test(settings) && /logOut\("global"\)/.test(settings) && /"\/api\/auth\/delete-account"/.test(settings) && /action: "send-code"/.test(settings) && /action: "verify", code/.test(settings))
  check("the name still tells the rest of Storelib it changed", /\/api\/account\/profile-changed/.test(settings) && /writeAuthSnapshot\(\{ \.\.\.snap, displayName: nextName \}\)/.test(settings))
}


console.log("\nSeller access is still one rule")
{
  check("only the seller state has seller access", hasSellerAccess(sellerAccessFrom({ creator: { onboarding_completed: true } })) && !hasSellerAccess(sellerAccessFrom({ creator: { onboarding_completed: false }, profile: { is_creator: true } })))
  const header = code("components/platform/platform-header-client.tsx")
  check("the header's account sheet asks the same rule", /hasSellerAccess\(/.test(header) && /sellerAccessFrom\(/.test(header))
}

console.log("\nActivity: what /account opens on")
{
  const route = code("app/(storelib)/account/page.tsx")
  check("the profile's own Activity, read through the one gate that reads the privacy switch, you as the viewer", /activityFor\(db, \{ userId: user\.id, viewerId: user\.id \}\)/.test(route) && /<ProfileActivity\b/.test(route))
  check("a hidden list says only you can see it", /privacy\.showActivity \? undefined/.test(route) && /Only you can see your activity\./.test(route))
  check("it streams in under the header, behind a deferred skeleton", /<Suspense fallback=\{<OverviewSkeleton \/>\}>/.test(route) && /skeleton-deferred/.test(read("components/account/account-skeleton.tsx")))
  check("nothing to type on it", !/<input\b|<textarea\b|onSubmit|\.update\(/.test(route))
}

console.log("\nThe copy")
{
  const files = ["components/account/account-hub.tsx", "components/account/account-photo.tsx", "components/account/account-settings.tsx", "components/account/account-skeleton.tsx", "components/account/push-switch-row.tsx", "components/account/cover-field.tsx", "lib/account/account-tabs.ts", "app/(storelib)/account/layout.tsx", "app/(storelib)/account/page.tsx", "app/(storelib)/account/communities/page.tsx", "app/(storelib)/account/settings/page.tsx"]
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
  for (const f of files) check(`${f}: no em dashes, none of the banned words`, !banned.test(read(f)), (read(f).match(banned) || [])[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
