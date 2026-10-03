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
 * The addresses and the overview's facts are pure functions and are asked
 * here. The wiring (the header, the tabs' switch, where signed out goes) is
 * read off the source. How it looks and how the switch moves is measured in
 * scripts/check-account-hub.mjs.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ACCOUNT_TABS, accountLoginPath, accountTabFor } from "../lib/account/account-tabs"
import { accountOverview, RECENT_PURCHASES, sellingEntry } from "../lib/account/overview"
import { sellerAccessFrom, hasSellerAccess } from "../lib/account/seller-access"
import { buyerTabFor, buyerTabsBelongOn } from "../lib/nav/buyer-tabs"
import type { LibraryItem } from "../lib/library/library-view"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
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
  walk("app/account")
  check("Overview and Settings are routes of their own", pages.includes("app/account/page.tsx") && pages.includes("app/account/settings/page.tsx"), pages)
  for (const page of pages) {
    const href = page.replace(/^app/, "").replace(/\/page\.tsx$/, "") || "/account"
    const escaped = href.replace(/\//g, "\\/")
    check(`${page} asks with next=${href}`, new RegExp(`pageUser\\(accountLoginPath\\("${escaped}"\\)\\)`).test(code(page)))
  }
  check("no loading.tsx above the pages, so that redirect is a real one and not a hop after a skeleton", !existsSync(join(process.cwd(), "app/account/loading.tsx")))
  check("and the layout does not redirect for them (it cannot know which page it is)", !/redirect\(/.test(code("app/account/layout.tsx")))
}

console.log("\nThe header, as on the library, at every width")
{
  const layout = code("app/account/layout.tsx")
  const library = code("app/library/layout.tsx")
  const mount = /<ConditionalHeader initialWishlistCount=\{initialWishlistCount\} onPlatformDomain=\{onPlatformDomain\} \/>/
  check("the layout mounts the platform header the way /library does", mount.test(layout) && mount.test(library))
  check("with the footer and the phone's tab bar", /<ConditionalFooter \/>/.test(layout) && /<BuyerTabBar \/>/.test(layout))
  const header = code("components/marketing/conditional-header.tsx")
  const footer = code("components/marketing/conditional-footer.tsx")
  check("and the header draws on /account and its pages (it was not on the list, so it drew nothing there)", /\(\(p === "\/account" \|\| p\.startsWith\("\/account\/"\)\) && !p\.startsWith\("\/account\/continue"\)\)/.test(header))
  check("the footer too", /\(\(pathname === "\/account" \|\| pathname\.startsWith\("\/account\/"\)\) && !pathname\.startsWith\("\/account\/continue"\)\)/.test(footer))
  /* "The profile page reached from Explore needs to have the header on it." The rule that kept it off a phone, and the wrapper that applied it, are both gone. */
  check("nothing hides it on a phone any more: no rule, no wrapper", !/hidesHeaderOnPhone/.test(header) && !/data-header-phone/.test(header))
  check("the column starts the library's py-6 under it, and grows on a computer", /max-w-\[720px\].*lg:max-w-\[1080px\]/.test(layout) && /px-4 py-6 sm:px-6 lg:px-8/.test(library))
}

console.log("\nThe hub: the person, and the page under them")
{
  const hub = code("components/account/account-hub.tsx")
  const layout = code("app/account/layout.tsx")
  check("in the layout, so the person stays put while the page changes", /<AccountHub identity=\{identity\}>\{children\}<\/AccountHub>/.test(layout))
  check("photo, name, @username when there is one, the bio, when they joined", /<AccountAvatar\b/.test(hub) && /useShellAvatar\(identity\.avatarUrl\)/.test(hub) && /@\{identity\.username\}/.test(hub) && /Joined \{identity\.memberSince\}/.test(hub) && /data-account-bio=""/.test(hub))
  check("centred: the person in one column, with overview beside them on a computer", /data-account-profile=""[\s\S]*?flex flex-col items-center text-center/.test(hub) && /lg:grid/.test(hub))
  check("Powered by Storelib under Edit profile", /data-account-powered=""/.test(hub) && /StorelibLogo/.test(hub))
  /*
    A LITTLE BIGGER, WITH A LITTLE MORE SKY. It was 96 and 112, and this
    check held it there; the owner asked for "a bit bigger just, and 2%
    more vertical space between the header at the top and the profile
    avatar", so it is 104 and 120 over 2vh of room.
  */
  check("the photo is large: 112px on a phone, 128 from 768px, with 2vh of room over it", /h-\[112px\] w-\[112px\]/.test(hub) && /md:h-\[128px\] md:w-\[128px\]/.test(hub) && /className="mt-\[2vh\]"/.test(hub))
  check("  and it wears a white ring and a soft shadow, like a creator's circle", /ring-\[3px\] ring-white/.test(hub) && /shadow-\[0_1px_2px_rgba\(16,24,40,0\.08\),0_8px_20px_-10px_rgba\(16,24,40,0\.32\)\]/.test(hub))
  /*
    AND IT OPENS. The same dialog the creator page uses, so the whole
    photograph is there uncropped, Escape and the ground close it, and
    focus comes back to the circle.
  */
  check("the photo opens full size in the creator page's own lightbox", /import \{ AvatarLightbox \} from "@\/components\/storefront\/avatar-lightbox"/.test(hub) && /<AvatarLightbox src=\{shown\} name=\{identity\.name\}>/.test(hub) && /cursor-zoom-in/.test(hub))
  check("when they joined is written on the server in UTC, so both renders agree", /timeZone: "UTC"/.test(layout) && /memberSince: memberSince\(user\.created_at\)/.test(layout))
  check("Edit profile goes to Settings, prefetched in full", /href="\/account\/settings"\s+prefetch=\{true\}/.test(hub) && /data-account-edit=""/.test(hub))
  /* Two pills reading Overview and Settings, right under a button that went to Settings, were one journey drawn twice. Settings has section pills of its own now. */
  check("no Overview / Settings pill row any more", !/data-account-tab\b/.test(hub) && !/ACCOUNT_TABS\.map/.test(hub))
  check("and Settings is its own screen: the hub draws none of the person there", /const onSettings = accountTabFor\(pathname\) === 1/.test(hub) && /if \(onSettings\) return <>\{children\}<\/>/.test(hub))
  check("the bio reaches the hub from the layout's own read of profiles.bio", /async function readBio\(userId: string\)/.test(layout) && /select\("bio"\)/.test(layout))
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
  check("Settings' top row is the way back and the word Settings, and never sticky", /data-account-settings-top=""/.test(settings) && /data-account-settings-close=""/.test(settings) && !/sticky/.test(settings))
  check("  and it is a chevron that says where it goes, not an X", /<ChevronLeft className="h-\[20px\] w-\[20px\]"/.test(settings) && /aria-label="Back to profile"/.test(settings) && !/<X /.test(settings))
  /*
    ONE SECTION DISSOLVES INTO THE NEXT: the one leaving fades out, then
    the one picked fades in behind it. It used to fade the arriving one up
    while the other was taken away in the same frame, which the eye reads
    as a cut ("not so direct, smooth clean").
  */
  check("the sections dissolve rather than cut", /function SectionSwap/.test(settings) && /const SWAP_OUT_MS = \d+/.test(settings) && /const SWAP_IN_MS = \d+/.test(settings) && /<SectionSwap section=\{section\}>/.test(settings))
  check("  the whole move is under a quarter of a second", (Number(settings.match(/SWAP_OUT_MS = (\d+)/)?.[1] ?? 0) + Number(settings.match(/SWAP_IN_MS = (\d+)/)?.[1] ?? 0)) <= 250)
  check("  a fade that never finishes still lands, and reduced motion just changes", /window\.setTimeout\(land, SWAP_OUT_MS \+ 160\)/.test(settings) && /prefers-reduced-motion: reduce/.test(settings))
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
  check("the profile's circle is only a picture: it is handed no photo control at all", /<AccountAvatar\s+src=\{shown\}\s+name=\{identity\.name\}\s+size=\{128\}/.test(hub) && !/useAccountPhoto/.test(hub) && !/photo=\{/.test(hub) && !/editable/.test(hub))
  check("Settings' circle is the control: pressed, it opens the picker", /<AccountAvatar src=\{shown\} name=\{name\} photo=\{photo\} editable/.test(settings) && /useAccountPhoto\(userId/.test(settings) && /\{editable && photo \? \(\s*<button[\s\S]{0,120}onClick=\{photo\.pick\}/.test(photo))
  check("Change photo and Remove sit beside it, and the picker is drawn once", /data-photo-change=""/.test(settings) && /data-photo-remove=""/.test(settings) && (settings.match(/\{photo\.input\}/g) ?? []).length === 1)
  check("uploaded under the owner's folder, through the one photo route, and announced", /`\$\{userId\}\/avatar-\$\{Date\.now\(\)\}\.jpg`/.test(photo) && /fetch\("\/api\/account\/avatar"/.test(photo) && /announceAvatar\(publicUrl\)/.test(photo) && /announceAvatar\(null\)/.test(photo))
  check("the camera only fades and grows, on the compositor", /transition-\[opacity,scale\]/.test(photo) && /editable \? "scale-100 opacity-100" : "scale-75 opacity-0"/.test(photo))
  check("the layout hands the hub whose photo it is, and the settings route hands it the same one", /userId: user\.id,/.test(code("app/account/layout.tsx")) && /avatarUrl=\{profile\?\.avatar_url \|\| null\}/.test(code("app/account/settings/page.tsx")))
}

console.log("\nSettings: the Skool shape, in Storelib's own parts")
{
  const settings = code("components/account/account-settings.tsx")
  const library = code("components/library/library-tabs.tsx")
  /* Four now: Privacy holds the profile's two switches (show activity, show communities), asked for with profiles for everybody. */
  check("four sections, Profile first, so Edit profile lands on the profile's fields", /\{ key: "profile", label: "Profile" \}[\s\S]*\{ key: "account", label: "Account" \}[\s\S]*\{ key: "privacy", label: "Privacy" \}[\s\S]*\{ key: "preferences", label: "Preferences" \}/.test(settings) && /initialSection = "profile"/.test(settings) && /useState<SectionKey>\(initialSection\)/.test(settings))
  check("the pills are the library's pills: 36px, white on a hairline, the chosen one on #e2e4e8", /h-9 shrink-0 cursor-pointer select-none items-center whitespace-nowrap rounded-full border bg-white px-3\.5 text-\[14px\]/.test(settings) && /bg-\[#e2e4e8\]/.test(settings) && /bg-\[#e2e4e8\]/.test(library))
  check("switching the same way, 150ms on one ease out, fading and growing in place", /const PILL_FADE_MS = 150/.test(settings) && /const PILL_EASE = "cubic-bezier\(0\.33, 1, 0\.68, 1\)"/.test(settings) && /on \? "scale-100 opacity-100" : "scale-\[0\.96\] opacity-0"/.test(settings) && /const TAB_FADE_MS = 150/.test(library))
  check("only the compositor's properties move", !/transition-\[[^\]]*(width|height|left|top|padding|margin)/.test(settings))
  check("the fields are /app Settings' fields: a hairline box, violet on focus, 16px on a phone so iOS does not zoom", /focus:border-\[#8b5cf6\] focus:ring-2 focus:ring-\[#8b5cf6\]\/20/.test(settings) && /text-\[16px\] sm:text-\[14px\]/.test(settings))
  check("a label over each field and a line of help under it", /htmlFor="account-name"/.test(settings) && /htmlFor="account-bio"/.test(settings) && /const HELP = /.test(settings))
  check("the bio has a counter, and the name only once its end is in sight", /<Counter used=\{bio\.length\} max=\{BIO_MAX\}/.test(settings) && /name\.length > NAME_MAX - 20 \? <Counter/.test(settings))
  check("no bio field where profiles.bio has not been added yet", /\{bioSupported \? \(/.test(settings) && /if \(bioSupported\) patch\.bio = nextBio \|\| null/.test(settings))
  check("the settings route says whether the column is there, from PostgREST's own answer", /PGRST204/.test(code("app/account/settings/page.tsx")) && /42703/.test(code("app/account/settings/page.tsx")))
  /* Every flow that was on the page before is still on it, and still the shared one. */
  check("the email change, the password card and the preference switches are /app Settings' own", /EmailChangeFlow,/.test(settings) && /PasswordCard,/.test(settings) && /useSavedSwitch,/.test(settings) && /from "@\/components\/app\/settings\/account-panels"/.test(settings))
  check("log out here, log out everywhere, and deleting behind a 6 digit code", /signOut\(\{ scope \}\)/.test(settings) && /logOut\("global"\)/.test(settings) && /"\/api\/auth\/delete-account"/.test(settings) && /action: "send-code"/.test(settings) && /action: "verify", code/.test(settings))
  check("the name still tells the rest of Storelib it changed", /\/api\/account\/profile-changed/.test(settings) && /writeAuthSnapshot\(\{ \.\.\.snap, displayName: nextName \}\)/.test(settings))
}


console.log("\nSelling: Dashboard only with seller access")
{
  const cases: Array<[string, Parameters<typeof sellerAccessFrom>[0], string, string, string]> = [
    ["onboarding finished", { creator: { onboarding_completed: true }, profile: { is_creator: true } }, "dashboard", "/app", "Dashboard"],
    ["a creators row, onboarding not finished", { creator: { onboarding_completed: false }, profile: null }, "finish", "/sell", "Finish setting up your store"],
    ["the old creator choice, no row", { creator: null, profile: { is_creator: true } }, "finish", "/sell", "Finish setting up your store"],
    ["a buyer who never started", { creator: null, profile: { is_creator: false } }, "become", "/sell", "Become a seller"],
    ["no rows at all", { creator: null, profile: null }, "become", "/sell", "Become a seller"],
  ]
  for (const [what, rows, key, href, title] of cases) {
    const entry = sellingEntry(sellerAccessFrom(rows).state)
    check(`${what}: ${title}`, entry.key === key && entry.href === href && entry.title === title, entry)
  }
  check("only the seller state is Dashboard", (["none", "started", "seller"] as const).filter((st) => sellingEntry(st).href === "/app").join() === "seller")
  const data = accountOverview({ items: [], courses: null, memberships: null, wishlist: 0, seller: "started" })
  check("the overview carries the entry for its state", data.selling.key === "finish" && data.seller === "started")

  const overview = code("components/account/account-overview.tsx")
  check("the overview draws the entry it is given, and no Dashboard of its own", /<SellRow entry=\{selling\} \/>/.test(overview) && !/href="\/app"/.test(overview))
  const route = code("app/account/page.tsx")
  check("the page asks for the signed in person's own access, for this request", /const user = await pageUser\(accountLoginPath\("\/account"\)\)/.test(route) && /sellerAccessForRequest\(user\.id\)/.test(route) && !/readAuthSnapshot|createAdminClient\(\)\.from\("creators"\)/.test(route))
  const scope = code("lib/auth/request-scope.ts")
  check("which is their own creators row, by user_id, on their own client (not any row; the service role only adds that row's private columns)", /creatorForRequest = cache\(async \(userId: string\)[\s\S]{0,200}const supabase = await createClient\(\)[\s\S]{0,120}\.from\("creators"\)\.select\(SHELL_CREATOR_COLUMNS\)\.eq\("user_id", userId\)\.maybeSingle\(\)/.test(scope))
  check("and the user is the one the auth server confirmed this request", /currentUserForRequest = cache\(/.test(scope) && /readCurrentUser\(supabase\)/.test(scope))
  check("a copy the router kept is asked for again, so a finished onboarding is never an old Become a seller", /<AccountOverview data=\{data\} drawnAt=\{Date\.now\(\)\} \/>/.test(route) && /router\.refresh\(\)/.test(code("components/account/account-fresh.tsx")))
  const header = code("components/platform/platform-header-client.tsx")
  check("the header's account sheet asks the same rule (hasSellerAccess of sellerAccessFrom), and says Finish setting up for a started store",
    /const access = sellerAccessFrom\(\{ creator: creatorData, profile: profileData \}\)[\s\S]{0,80}hasSellerAccess\(access\)/.test(header)
      && /state === "started" \? "Finish setting up your store" : "Become a seller"/.test(header))
  check("and the shared rule itself: seller only with a finished onboarding", hasSellerAccess(sellerAccessFrom({ creator: { onboarding_completed: true } })) && !hasSellerAccess(sellerAccessFrom({ creator: { onboarding_completed: false }, profile: { is_creator: true } })))
}

console.log("\nThe overview has nothing to type")
{
  const overview = code("components/account/account-overview.tsx")
  const route = code("app/account/page.tsx")
  check("no field, no photo control, no save", !/<input\b|<textarea\b|<ProfilePhoto\b|onSubmit|\.update\(/.test(overview + route))
  check("each fact opens its library page", ["/library", "/library/courses", "/library/memberships", "/library/reviews", "/library/wishlist"].every((h) => read("lib/account/overview.ts").includes(`href: "${h}"`)))
  check("the facts are the library's own loaders, not a second count", /loadLibrary\(user\.id\)/.test(route) && /loadMyCourses\(/.test(route) && /loadLibraryMemberships\(/.test(route))
  check("a read that fails leaves its fact out, not the page", /orNull\(\(\) => loadLibrary/.test(route))
  check("the slow part streams in under the header, behind a deferred skeleton", /<Suspense fallback=\{<OverviewSkeleton \/>\}>/.test(route) && /skeleton-deferred/.test(read("components/account/account-skeleton.tsx")))
  check("seller access is lib/account/seller-access's answer", /sellerAccessForRequest\(user\.id\)/.test(route))
  /* It was three white cards of the same size, the first a list of five rows each with its own grey icon square. CLAUDE.md names that. */
  check("one card of facts, and selling on its own: no third card, no stack of the same box", (overview.match(/data-account-card=/g) ?? []).length === 1 && /data-account-card="library"/.test(overview) && /data-account-selling=/.test(overview))
  check("no icon beside every label: the only marks left are the covers' placeholder and the chevrons", !/FACT_ICON|GraduationCap|BadgeCheck|LayoutDashboard|Store\b|Heart|Star\b/.test(overview))
  check("the purchase count is the card's subline, not a row saying Purchases as well", /data-account-purchases=""/.test(overview) && /facts\.filter\(\(f\) => f\.key !== "purchases"\)/.test(overview))
  check("Storelib's card: white, rounded-2xl, the #e5e7eb hairline and a soft shadow", /bg-white rounded-2xl app-card-x[^"]*shadow-\[0_1px_3px_rgba\(0,0,0,0\.04\)\] border border-\[#e5e7eb\]\/60/.test(overview))
}

console.log("\nThe overview's facts")
{
  const item = (id: string, at: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
    productId: id, title: `P${id}`, thumbnailUrl: null, productSlug: null, archived: false, purchasedAt: at,
    creator: { id: "c", name: "Maria", slug: "maria", avatarUrl: null }, files: [], state: "open", receiptToken: null,
    review: null, canReview: false, ...extra,
  } as LibraryItem)
  const review = { id: "r", rating: 5, content: "", createdAt: "", editedAt: null, hidden: false, sellerReply: null }
  const items = [
    item("1", "2026-01-01T00:00:00Z", { review }),
    item("2", "2026-03-01T00:00:00Z", { canReview: true }),
    item("3", "2026-02-01T00:00:00Z", { canReview: true }),
    item("4", "2026-04-01T00:00:00Z"),
  ]
  const full = accountOverview({
    items,
    courses: [{ title: "Lighting", status: "in_progress" }, { title: "Colour", status: "not_started" }],
    memberships: { current: 1, ended: 0 },
    wishlist: 7,
    seller: "none",
  })
  check("purchases, courses in progress, memberships, reviews written, wishlist", full.facts.map((f) => f.key).join() === "purchases,courses,memberships,reviews,wishlist", full.facts.map((f) => f.key))
  check("with the library's numbers", full.facts.map((f) => f.value).join() === "4,1,1,1,7", full.facts.map((f) => f.value))
  check("the course they had open last is where Continue goes", full.facts[1].detail === "Continue Lighting", full.facts[1].detail)
  check("purchases still to review are said", full.facts[3].detail === "2 purchases to review", full.facts[3].detail)
  check(`the newest ${RECENT_PURCHASES} purchases, newest first, into the library`, full.recent.map((r) => r.productId).join() === "4,2,3" && full.recent[0].href === "/library/products/4", full.recent.map((r) => r.productId))

  const fresh = accountOverview({ items: [], courses: [], memberships: null, wishlist: 0, seller: "seller" })
  check("a new account: purchases and the wishlist, no zeros about things never had", fresh.facts.map((f) => f.key).join() === "purchases,wishlist", fresh.facts.map((f) => f.key))
  check("and nothing in recent purchases", fresh.recent.length === 0)
  const done = accountOverview({ items: [], courses: [{ title: "A", status: "completed" }], memberships: { current: 0, ended: 2 }, wishlist: 0, seller: "started" })
  check("courses all finished say so; ended memberships say none are running", done.facts.find((f) => f.key === "courses")?.detail === "All finished" && done.facts.find((f) => f.key === "memberships")?.detail === "None running")
  const unread = accountOverview({ items: null, courses: null, memberships: null, wishlist: 3, seller: "none" })
  check("a library that could not be read is not an error on the page", unread.facts.map((f) => f.key).join() === "purchases,wishlist")
}

console.log("\nThe copy")
{
  const files = ["components/account/account-hub.tsx", "components/account/account-photo.tsx", "components/account/account-fresh.tsx", "components/account/account-overview.tsx", "components/account/account-settings.tsx", "components/account/account-skeleton.tsx", "lib/account/overview.ts", "lib/account/account-tabs.ts", "app/account/layout.tsx", "app/account/page.tsx", "app/account/settings/page.tsx"]
  const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
  for (const f of files) check(`${f}: no em dashes, none of the banned words`, !banned.test(read(f)), (read(f).match(banned) || [])[0])
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
