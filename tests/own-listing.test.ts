/**
 * ===========================================================================
 *  YOUR OWN LISTING IS NOT A THING YOU CAN BUY
 * ===========================================================================
 *
 * On your own listing the page showed Buy and Make an offer — two controls
 * whose entire function was to refuse, printing "this is your listing" when
 * pressed. Meanwhile the three things you actually want on a listing of your
 * own did not exist anywhere in the app: fix a typo, take it off the feed,
 * throw it away.
 *
 * The refusal in checkout stays, and always will — an owner check on the
 * client is a courtesy, not a control, because the request can be made without
 * the page. What changed is that the page now offers the things that DO make
 * sense, and the server grew somewhere to send them.
 *
 * Run with:  npm run test:push
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const detail = strip(read("components/product/product-detail.tsx"))
const sheet = strip(read("components/product/manage-listing-sheet.tsx"))
const route = strip(read("app/api/listings/[id]/route.ts"))
const drafts = strip(read("app/api/listings/drafts/[id]/route.ts"))
const form = strip(read("components/sell/new-listing-form.tsx"))

console.log("\nWhat the page offers the person who wrote it")

check(
  "Buy and Make an offer are not rendered on your own listing",
  (() => {
    // They were present and inert: pressing either printed a line saying you
    // could not. A control whose only outcome is a refusal is not a control.
    // Both bars go through isOwn BEFORE they reach isSold, and neither
    // branch that renders Cumpără is reachable when it is your own listing.
    return (
      (detail.match(/\) : isSold \? \(/g) ?? []).length === 2 &&
      (detail.match(/Editează anunțul/g) ?? []).length >= 2 &&
      (detail.match(/Cumpără/g) ?? []).length === 2
    )
  })(),
  "        Both bars — the desktop row and the sticky mobile one.",
)

check(
  "the checkout guard is still there underneath",
  (() => {
    // The page is a courtesy. The request can be made without it, so the
    // server's refusal is the control and is not being relied on less.
    return /if \(isOwn\) return sayOwn\(\)/.test(detail)
  })(),
)

check(
  "there is a ⋯ in the bar AND at the top of the page",
  (() => {
    // The bar hides on scroll, and "take this down" is exactly the thing you
    // go looking for after reading the listing you want to take down.
    return (
      (detail.match(/aria-label="Gestionează anunțul"/g) ?? []).length === 3 &&
      /openManage/.test(detail)
    )
  })(),
)

check(
  "reporting is replaced, not stacked, on your own listing",
  (() => {
    // On your own listing the report flag is the one control that could not
    // possibly apply.
    return /\{isOwn \? \([\s\S]{0,600}?Gestionează anunțul[\s\S]{0,600}?\) : \([\s\S]{0,400}?Raportează/.test(detail)
  })(),
)

check(
  "the manage sheet is only mounted for the owner",
  /\{isOwn && \(\s*\n\s*<ManageListingSheet/.test(detail),
)

console.log("\nEdit, archive, delete")

check(
  "the three actions are ordered by how hard they are to undo",
  (() => {
    // Edit is the common one and completely reversible; archive is what most
    // people mean when they reach for delete; delete is last and says so.
    const e = sheet.indexOf("Editează anunțul")
    const a = sheet.indexOf("Arhivează anunțul")
    const d = sheet.indexOf("Șterge anunțul")
    return e > 0 && a > e && d > a
  })(),
)

check(
  "delete asks first, and names what it is deleting",
  (() => {
    // A single-tap bin is how somebody loses a listing with eight photographs
    // to a thumb that landed a centimetre off, and there is nowhere for a
    // deleted one to go. The second tap is a different button in a different
    // place, so it cannot be the tail of the same gesture.
    return /setConfirming/.test(sheet) && /Ștergi „\{title \|\| "Fără titlu"\}”\?/.test(sheet)
  })(),
)

check(
  "archiving is offered as the thing that was probably meant",
  /Arhivarea îl scoate din feed fără să îl ștergi/.test(sheet),
)

check(
  "an archived listing can be put back, and a reserved one released",
  (() => {
    // Both are toggles, because both are states you enter on purpose and leave
    // on purpose — an archive you cannot undo is a delete with a nicer name.
    return (
      /archived \? "Publică din nou" : "Arhivează anunțul"/.test(sheet) &&
      /act\(archived \? "publish" : "archive", "archive"\)/.test(sheet) &&
      /reserved \? "Anulează rezervarea" : "Marchează ca rezervat"/.test(sheet) &&
      /act\(reserved \? "unreserve" : "reserve", "reserve"\)/.test(sheet)
    )
  })(),
)

check(
  "a draft is offered only the two moves it has",
  (() => {
    // It has never been on the feed, so there is nothing to reserve, nothing to
    // take down and nothing to mark sold. Finish it, or throw it away.
    return (
      /\{isDraft \? "Continuă ciorna" : "Editează anunțul"\}/.test(sheet) &&
      (sheet.match(/\{!isDraft && !sold && \(/g) ?? []).length === 2 &&
      /\{!isDraft && \(/.test(sheet)
    )
  })(),
)

check(
  "a sold listing is not offered an edit",
  (() => {
    // The server refuses it, because editing a sold listing rewrites what
    // somebody already bought — so the row would be a control that only ever
    // returns an error.
    return /\{!sold && \(\s*\n\s*<Row icon=\{<Pencil/.test(sheet)
  })(),
)

console.log("\nWhat the server will and will not do")

check(
  "ownership is part of the query, not a comparison afterwards",
  (() => {
    // Fetching then comparing leaks the row's existence through timing and
    // through which error comes back. Somebody else's listing has to be
    // indistinguishable from one that does not exist.
    return (route.match(/\.eq\("creator_id", creatorId\)/g) ?? []).length >= 5
  })(),
)

check(
  "a listing somebody has BOUGHT cannot be deleted",
  (() => {
    // It is a row in their order history and a link in their receipt.
    return (
      /if \(row\.status === "sold" \|\| \(await hasOrder\(admin, id\)\)\)/.test(route) &&
      /status: 409/.test(route)
    )
  })(),
)

check(
  "and the refusal says what to do instead",
  /Anunțul a fost cumpărat și nu poate fi șters\. Îl poți arhiva\./.test(route),
)

check(
  "the order check fails CLOSED",
  (() => {
    // If the check itself errors we treat the listing as sold. The cost of a
    // false positive is a listing that has to be archived instead; the cost of
    // a false negative is deleting something somebody paid for.
    const fn = route.slice(route.indexOf("async function hasOrder"), route.indexOf("export async function GET"))
    return /refusing to delete/.test(fn) && /return true/.test(fn)
  })(),
)

check(
  "sold can be set by hand, but only left while nobody has bought it",
  (() => {
    // Plenty of things are sold face to face, and a marketplace that cannot be
    // told so fills with listings nobody can buy. Coming back FROM sold is the
    // dangerous direction: it would re-list something a buyer has paid for.
    return (
      /sold: "sold"/.test(route) &&
      /if \(next === "published" && \(await hasOrder\(admin, id\)\)\)/.test(route) &&
      /nu poate fi repus la vânzare/.test(route)
    )
  })(),
)

check(
  "a draft cannot be reserved, archived or marked sold",
  (() => {
    // It has never been on the feed. There is nothing to take down.
    return /if \(row\.status === "draft"\) \{[\s\S]{0,220}?status: 409/.test(route)
  })(),
)

check(
  "the editable set is stated once, where the states are defined",
  (() => {
    const statuses = strip(read("lib/marketplace/listing-status.ts"))
    return (
      /const EDITABLE = EDITABLE_STATUSES as string\[\]/.test(route) &&
      /EDITABLE_STATUSES: ListingStatus\[\] = \["published", "draft", "archived", "reserved"\]/.test(statuses)
    )
  })(),
)

check(
  "an edit to a LIVE listing has to leave it complete",
  (() => {
    // A draft is allowed to be half-written; something on the feed is not, and
    // the rules have to be on the server because a client can be bypassed.
    const block = route.slice(
      route.indexOf('if (row.status === "published" || row.status === "reserved") {'),
      route.indexOf("const patch"),
    )
    return /MIN_PHOTOS/.test(block) && /missing\.push\("titlu"\)/.test(block) && /status: 400/.test(block)
  })(),
)

check(
  "the slug is never rewritten",
  (() => {
    // It is in every link anybody has shared, and re-slugging on a title edit
    // would break all of them.
    const patch = route.slice(route.indexOf("const patch"), route.indexOf("if (Array.isArray(body?.image_variants))"))
    return !/slug/.test(patch)
  })(),
)

check(
  "a half-run migration does not lose the save",
  // The resale attribute columns only exist after 20260801_listing_attributes.
  /full update failed, retrying/.test(route) && /const OPTIONAL = \[/.test(route),
)

check(
  "the drafts route keeps its own narrower scope",
  (() => {
    // Widening it would have been the shortcut, and it would have removed
    // exactly the guard it exists for: it must never be a way to delete
    // something live that somebody has already paid for, or to re-publish
    // something sold.
    return (drafts.match(/\.eq\("status", "draft"\)/g) ?? []).length >= 3
  })(),
)

console.log("\nEditing uses the screen that already exists")

check(
  "the sell form fills itself in from a listing as well as from a draft",
  (() => {
    return (
      /const \[editId\] = useState<string \| null>/.test(form) &&
      /new URLSearchParams\(window\.location\.search\)\.get\("edit"\)/.test(form) &&
      /const v = d\?\.draft \?\? d\?\.listing/.test(form)
    )
  })(),
)

check(
  "and saves back to the row it came from",
  /const target = editId\s*\n\s*\? `\/api\/listings\/\$\{encodeURIComponent\(editId\)\}`/.test(form),
)

check(
  "an edit does not play the 'your listing is live' confirmation",
  (() => {
    // That veil is for the moment a listing first exists. Playing it again
    // because somebody fixed a typo says the wrong thing, and takes over the
    // whole screen to say it.
    const submit = form.slice(form.indexOf("if (editId) {"))
    return /router\.replace\(data\?\.slug \? `\/products\/\$\{data\.slug\}` : "\/profile"\)/.test(submit.slice(0, 600))
  })(),
)

check(
  "the buttons say what they will do",
  (() => {
    // "Salvează" on a new listing means "keep this as a draft", and there is no
    // turning something already live back into one — the button would either
    // lie or do nothing.
    return /\{editId \? "Actualizează anunțul" : "Publică anunțul"\}/.test(form) && /\{!editId && \(/.test(form)
  })(),
)

check(
  "and the screen says which one you are on",
  /\{editId \? "Editează anunțul" : "Vinde un articol"\}/.test(form),
)

console.log("\nEvery state you have ever put a listing into")

check(
  "your own shelf shows all of them; a visitor's shows one",
  (() => {
    // Archiving takes a listing off the feed and the profile is the only place
    // left that could show it to you — without this, archiving something is
    // LOSING it. Drafts had the same problem in reverse: they existed only
    // behind a link in the account drawer, which is not where anybody looks
    // for a listing they started yesterday.
    const lib = strip(read("lib/profile/listings.ts"))
    const statuses = strip(read("lib/marketplace/listing-status.ts"))
    const own = strip(read("app/(marketing)/profile/page.tsx"))
    const other = strip(read("app/(marketing)/member/[username]/page.tsx"))
    return (
      /\.in\("status", ownerView \? OWNER_SHELF : PUBLIC_FEED\)/.test(lib) &&
      /OWNER_SHELF: ListingStatus\[\] = \["published", "reserved", "archived", "draft", "sold"\]/.test(statuses) &&
      /PUBLIC_FEED: ListingStatus\[\] = \["published"\]/.test(statuses) &&
      /ownerView: true/.test(own) &&
      !/ownerView/.test(other)
    )
  })(),
)

check(
  "and each one says what it is, instead of sitting there looking live",
  (() => {
    // A draft, an archived listing and a live one were the same card, and the
    // only clue that two of them were off the feed was that nobody ever bought
    // them. `published` deliberately gets no badge: a mark on every card is a
    // mark on none of them.
    const statuses = strip(read("lib/marketplace/listing-status.ts"))
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /label: "Ciornă"/.test(statuses) &&
      /label: "Rezervat"/.test(statuses) &&
      /label: "Arhivat"/.test(statuses) &&
      /label: "Vândut"/.test(statuses) &&
      /default:\s*\n\s*return null/.test(statuses) &&
      /const badge = isOwner \? ownerStatusBadge\(listing\.status\) : null/.test(profile)
    )
  })(),
)

check(
  "a draft's card opens the form, not a URL that 404s",
  (() => {
    // The listing route refuses anything unpublished, so a draft card linking
    // to /products/<slug> is a card that cannot be opened.
    const statuses = strip(read("lib/marketplace/listing-status.ts"))
    const profile = strip(read("components/member/member-profile.tsx"))
    const card = strip(read("components/explore/product-card.tsx"))
    return (
      /status === "draft"\s*\n?\s*\? `\/products\/new\?draft=/.test(statuses) &&
      /hrefOverride=\{isOwner \? ownerListingHref\(listing\) : undefined\}/.test(profile) &&
      /const productUrl = hrefOverride \?\? getListingUrl/.test(card)
    )
  })(),
)

console.log("\nThe profile is the seller's desk")

check(
  "two tabs, not three: what you are selling, and what people said about you",
  (() => {
    // Ciorne was the wrong shape for what a draft is. A draft is not a
    // different KIND of thing needing its own room; it is one of your
    // listings, in a state — and behind a tab it made the shelf disagree with
    // itself about how many listings you had.
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /const \[shelfTab, setShelfTab\] = useState<"listings" \| "reviews">\("listings"\)/.test(profile) &&
      !/Ciorne/.test(profile) &&
      /function ShelfTab\(/.test(profile) &&
      /Evaluări/.test(profile)
    )
  })(),
)

check(
  "the tabs share the full measure, centred",
  (() => {
    const profile = strip(read("components/member/member-profile.tsx"))
    return /flex flex-1 items-baseline justify-center/.test(profile)
  })(),
)

check(
  "and they answer in the hand as well as on the screen",
  (() => {
    // The strip is the one control on this screen you press without looking
    // at it.
    const profile = strip(read("components/member/member-profile.tsx"))
    const tab = profile.slice(profile.indexOf("function ShelfTab("))
    return /triggerHaptic\("light"\)/.test(tab.slice(0, 900)) && /active:scale-\[0\.97\]/.test(tab.slice(0, 1400))
  })(),
)

check(
  "switching panels is the feed's own move: depth, with a snapshot leaving",
  (() => {
    // One switch grammar per app. The outgoing panel is a snapshot so it can
    // keep painting a list for a state that has already moved on; both layers
    // are transform and opacity only, and hand their layers back.
    const swap = strip(read("components/ui/depth-swap.tsx"))
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /<DepthSwap id=\{shelfTab\}>/.test(profile) &&
      /setOut\(\{ key: idRef\.current, node: lastNode\.current \}\)/.test(swap) &&
      /void i\.offsetHeight/.test(swap) &&
      /willChange = "transform, opacity"/.test(swap)
    )
  })(),
)

check(
  "the reviews tab covers every creator row the account holds",
  (() => {
    // Reviews hang off creators rows, and one account can hold several — the
    // same assumption that once made the profile show only some listings.
    const api = strip(read("app/api/reviews/route.ts"))
    return /sellerUserId/.test(api) && /\.in\("creator_id", creatorIds\)/.test(api)
  })(),
)

check(
  "your own card carries a ⋯ where the heart was",
  (() => {
    // Saving your own listing to your own wishlist does nothing anybody wants,
    // and that corner is the only place on a grid card where a per-item menu
    // can live.
    const profile = strip(read("components/member/member-profile.tsx"))
    const card = strip(read("components/explore/product-card.tsx"))
    return (
      /cornerAction=\{\s*\n?\s*isOwner \? \(/.test(profile) &&
      /setManageFor\(listing\)/.test(profile) &&
      /\{cornerAction \?\? <WishlistHeartButton/.test(card)
    )
  })(),
)

check(
  "the heart is gone from your own listing PAGE too",
  (() => {
    // It was the last self-directed control left on it.
    return /\{!isOwn && \(\s*\n\s*<button\s*\n\s*type="button"\s*\n\s*onClick=\{onLike\}/.test(detail)
  })(),
)

check(
  "deleting from the listing page leaves; deleting from the grid refreshes",
  (() => {
    // That page IS the row. Once it is gone there is nothing there to refresh.
    return (
      /onDeleted=\{\(\) => \{\s*\n\s*router\.replace\("\/profile"\)/.test(detail) &&
      /if \(onDeleted\) onDeleted\(\)\s*\n\s*else router\.refresh\(\)/.test(sheet)
    )
  })(),
)

console.log("\nOwnership is decided from the session, not from a cache")

check(
  "the auth snapshot is a fast path, and the Supabase session is the authority",
  (() => {
    // The listing page is cached and auth-free on purpose, so isOwn can only be
    // decided on the client — and the localStorage snapshot alone was not
    // enough: an account signed in before the snapshot carried userId reported
    // null, and the owner was shown Buy and Make an offer on their own listing.
    return (
      /createBrowserSupabase\(\)\s*\n\s*\.auth\.getSession\(\)/.test(detail) &&
      /data\.session\?\.user\?\.id === sellerUserId\) setIsOwn\(true\)/.test(detail)
    )
  })(),
)

check(
  "you cannot be offered your own follow button either",
  /\{!isOwn && <FollowButton userId=\{product\.creator\?\.user_id\} variant="quiet" \/>\}/.test(detail),
)

console.log("\nThe shelf, drawn like the feed")

check(
  "the tabs share the full measure, centred",
  (() => {
    // Three names spread across the line, the way the feed's own strip is —
    // not a cluster parked at one end.
    const profile = strip(read("components/member/member-profile.tsx"))
    return /flex flex-1 items-baseline justify-center/.test(profile)
  })(),
)

check(
  "switching panels is the feed's own move: depth, with a snapshot leaving",
  (() => {
    // One switch grammar per app. The outgoing panel is a snapshot so it can
    // keep painting a list for a state that has already moved on; both layers
    // are transform and opacity only, and hand their layers back.
    const swap = strip(read("components/ui/depth-swap.tsx"))
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /<DepthSwap id=\{shelfTab\}>/.test(profile) &&
      /setOut\(\{ key: idRef\.current, node: lastNode\.current \}\)/.test(swap) &&
      /void i\.offsetHeight/.test(swap) &&
      /willChange = "transform, opacity"/.test(swap)
    )
  })(),
)

check(
  "the drafts list keeps its own page, and no longer duplicates the grid",
  (() => {
    // /products/drafts still resolves — it is a real deep link and the account
    // drawer points at it — but the profile grid is where drafts now live, so
    // there is no second grid component to keep in step with the first.
    return !existsSync(join(process.cwd(), "components/member/drafts-grid.tsx"))
  })(),
)

console.log("\nSettings stands up")

check(
  "/settings no longer mounts the legacy dashboard form",
  (() => {
    // loadSettingsData + SettingsFormNew was the crash: 1,700 lines of seller
    // dashboard mounted into a marketing route, falling over client-side on
    // any account whose data did not fit its assumptions.
    const page = strip(read("app/(marketing)/settings/page.tsx"))
    return (
      !/SettingsFormNew/.test(page) &&
      !/loadSettingsData/.test(page) &&
      /<SettingsHub/.test(page)
    )
  })(),
)

check(
  "it is a table of contents, and the rows go to screens that exist",
  (() => {
    const hub = strip(read("components/settings/settings-hub.tsx"))
    return (
      /href: "\/profile"/.test(hub) &&
      /href: "\/products\/drafts"/.test(hub) &&
      /href: "\/sales"/.test(hub) &&
      /href: "\/purchases"/.test(hub) &&
      /href: "\/wishlist"/.test(hub) &&
      /href: "\/messages"/.test(hub) &&
      /href="\/profile\/edit"/.test(hub)
    )
  })(),
)

check(
  "a missing profile row renders, not crashes",
  (() => {
    // A buyer who signed up yesterday IS a normal account.
    const page = strip(read("app/(marketing)/settings/page.tsx"))
    return /profile\?\.display_name \?\? user\.user_metadata\?\.display_name \?\? null/.test(page) && /catch/.test(page)
  })(),
)

check(
  "signing out leaves by a full document load",
  (() => {
    // Half the header state lives in server components; a client-side push
    // would keep painting the signed-in chrome around a signed-out session.
    const hub = strip(read("components/settings/settings-hub.tsx"))
    return /auth\.signOut\(\)/.test(hub) && /window\.location\.assign\("\/"\)/.test(hub)
  })(),
)

check(
  "signed-out visitors are sent to login, and back here after",
  /redirect\("\/login\?redirect=\/settings"\)/.test(strip(read("app/(marketing)/settings/page.tsx"))),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
