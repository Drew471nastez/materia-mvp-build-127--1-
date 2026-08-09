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

import { readFileSync } from "node:fs"
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
  "an archived listing can be put back",
  /archived \? "Publică din nou" : "Arhivează anunțul"/.test(sheet) &&
    /action: archived \? "publish" : "archive"/.test(sheet),
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
  "sold is never written or cleared here",
  (() => {
    // Republishing a sold item would put one physical object back on the
    // market twice.
    return /const EDITABLE = \["published", "draft", "archived"\]/.test(route) && !/status: "sold"/.test(route)
  })(),
)

check(
  "an edit to a LIVE listing has to leave it complete",
  (() => {
    // A draft is allowed to be half-written; something on the feed is not, and
    // the rules have to be on the server because a client can be bypassed.
    const block = route.slice(route.indexOf('if (row.status === "published") {'), route.indexOf("const patch"))
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
    return /\{editId \? "Salvează modificările" : "Publică anunțul"\}/.test(form) && /\{!editId && \(/.test(form)
  })(),
)

check(
  "and the screen says which one you are on",
  /\{editId \? "Editează anunțul" : "Vinde un articol"\}/.test(form),
)

console.log("\nAn archived listing is not a lost one")

check(
  "your own profile still shows it; a visitor's does not",
  (() => {
    // Archiving takes a listing off the feed, and the profile is the only place
    // left that could show it to you. Without this, archiving something is
    // losing it: no screen anywhere lists it, and the only control that could
    // put it back lives on a page you can no longer reach.
    const lib = strip(read("lib/profile/listings.ts"))
    const own = strip(read("app/(marketing)/profile/page.tsx"))
    const other = strip(read("app/(marketing)/member/[username]/page.tsx"))
    return (
      /\.in\("status", includeArchived \? \["published", "archived"\] : \["published"\]\)/.test(lib) &&
      /includeArchived: true/.test(own) &&
      !/includeArchived/.test(other)
    )
  })(),
)

check(
  "and it says it is archived rather than sitting there looking live",
  (() => {
    // Otherwise the only clue that it is off the feed is that nobody ever
    // buys it.
    const profile = strip(read("components/member/member-profile.tsx"))
    return /listing\.status === "archived" &&/.test(profile) && /Arhivat/.test(profile)
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
