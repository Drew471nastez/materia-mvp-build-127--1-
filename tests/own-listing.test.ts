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
      (detail.match(/\) : unavailable \? \(/g) ?? []).length === 2 &&
      (detail.match(/isOwn && !unavailable \? \(/g) ?? []).length === 2 &&
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
      // Four now: the header, both bars' owner branch, and the pill row that
      // stands in for them when the listing is sold or reserved — because a
      // listing you can no longer sell is one you still have to be able to
      // manage.
      (detail.match(/aria-label="Gestionează anunțul"/g) ?? []).length === 5 &&
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
  "delete asks first, in an alert rather than by growing the sheet",
  (() => {
    // A single-tap bin is how somebody loses a listing with eight photographs
    // to a thumb that landed a centimetre off, and there is nowhere for a
    // deleted one to go. The second tap is a different button in a different
    // place, so it cannot be the tail of the same gesture.
    //
    // It used to be a red panel that EXPANDED inside the sheet, and expanding a
    // panel anchored to the bottom of the screen re-lays-out and re-rasterises
    // the whole thing on every frame of the expansion. The question is a
    // platform alert now: it costs no layout, and it is the shape people
    // already read as "this one is not reversible".
    return (
      /<ConfirmDialog/.test(sheet) &&
      /open=\{confirming\}/.test(sheet) &&
      /Nu se poate anula/.test(sheet) &&
      !/gridTemplateRows/.test(sheet)
    )
  })(),
)

check(
  "the sheet does not repeat the name of the listing back at you",
  (() => {
    // You arrived here by pressing ⋯ on one specific card. You are looking at
    // the photograph of the thing you mean, and being told its name again is
    // the interface repeating what your own thumb just said. It survives in
    // the accessible name, where naming the subject is the entire job.
    return (
      /label=\{`Gestionează \$\{title \|\| "anunțul"\}`\}/.test(sheet) &&
      !/Anunțul tău/.test(sheet) &&
      !/\{title \|\| "Fără titlu"\}/.test(sheet)
    )
  })(),
)

check(
  "archiving is offered as the thing that was probably meant",
  (() => {
    // The three lines of explanation in the sheet are gone — read once, skipped
    // forever after. The advice that mattered is the one given at the moment it
    // applies: when the server refuses a delete because somebody has bought it.
    const route = strip(read("app/api/listings/[id]/route.ts"))
    return /nu poate fi șters\. Îl poți arhiva\./.test(route)
  })(),
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
      // Reserve, mark-sold and archive are all `!isDraft && !sold`: a draft has
      // never been on the feed, and a sold row is outside EDITABLE so every one
      // of them would 409.
      /\{isDraft \? "Continuă ciorna" : "Editează anunțul"\}/.test(sheet) &&
      (sheet.match(/\{!isDraft && !sold && \(/g) ?? []).length === 3
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
      /if \(await hasOrder\(admin, id\)\) \{/.test(route) &&
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
    // EVERY non-draft state, not just published and reserved: `archived` was a
    // hole straight through validation, because an archived row could be
    // blanked by an unvalidated edit and then pushed onto the feed by the
    // `publish` action, which carries no fields and checked nothing.
    const block = route.slice(route.indexOf('if (row.status !== "draft") {'), route.indexOf("const patch"))
    return /publishProblems\(\{/.test(block) && /status: 400/.test(block)
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
    // THE ID COMES FROM THE ROUTE, NOT FROM window.location.
    //
    // It used to be read in a `useState` initialiser from
    // `new URLSearchParams(window.location.search)`, and that is a read of the
    // BROWSER'S URL rather than the one being rendered. On a client navigation
    // the App Router commits the new tree first and calls `history.pushState` in
    // an effect afterwards, so on the form's first render the search string is
    // still the page you came FROM — empty, from a profile. `editId` was null,
    // the loading effect never ran, and pressing "Editează anunțul" opened a
    // blank form headed "Vinde un articol".
    //
    // Which is exactly why it looked like a loading fault and was not: reload
    // the URL by hand and it worked perfectly, because then the browser really
    // was at that address first. It failed only on the path anybody uses.
    //
    // A prop from a server component has no such timing. And there is
    // deliberately NO fallback to the URL: a stale read would mean opening + for
    // a fresh listing right after editing one loads the listing you just left,
    // which is worse than a blank form.
    return (
      /const editId = initialEditId \?\? null/.test(form) &&
      // The exact pattern that was the bug. (A later `window.location.search`
      // survives on purpose — it strips `?draft=` off the URL after publishing a
      // resumed draft, which is a write, not a read of route state.)
      !/new URLSearchParams\(window\.location\.search\)\.get\(/.test(form) &&
      /const v = d\?\.draft \?\? d\?\.listing/.test(form)
    )
  })(),
)

check(
  "and every route that renders the form hands it one",
  (() => {
    // A prop nobody passes is the same blank form with extra steps.
    const editModal = strip(read("app/(marketing)/@modal/(.)products/edit/[id]/page.tsx"))
    const editPage = strip(read("app/(marketing)/products/edit/[id]/page.tsx"))
    const newModal = strip(read("app/(marketing)/@modal/(.)products/new/page.tsx"))
    const newPage = strip(read("app/(marketing)/products/new/page.tsx"))
    return (
      /const \{ id \} = await params/.test(editModal) &&
      /<NewListingForm editId=\{id\} initialListing=\{listing\} \/>/.test(editModal) &&
      /const \{ id \} = await params/.test(editPage) &&
      /<NewListingForm editId=\{id\} initialListing=\{listing\} \/>/.test(editPage) &&
      /const \{ draft \} = await searchParams/.test(newModal) &&
      /draftId=\{draft \?\? null\}/.test(newModal) &&
      /const \{ draft \} = await searchParams/.test(newPage) &&
      /draftId=\{draft \?\? null\}/.test(newPage)
    )
  })(),
)

check(
  "the intercepted edit route has its own loading shell",
  (() => {
    // A Suspense fallback resolves to the nearest loading.tsx up the tree, which
    // without this is the FULL-PAGE shell — a centred column of grey blocks with
    // no sheet. Tapping Editează would show a page-shaped skeleton in place and
    // then the real sheet sliding up over it: two arrivals, which is the flash
    // the interception exists to prevent.
    return existsSync(join(process.cwd(), "app/(marketing)/@modal/(.)products/edit/[id]/loading.tsx"))
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
    // And it only sends you to the LISTING if the listing is one the route
    // will render: an archived row stays archived through an edit, and
    // /products/<slug> calls notFound() for it. The server returns the status
    // so the client does not have to guess.
    const submit = form.slice(form.indexOf("if (editId) {"))
    return (
      /const live = data\?\.status === "published" \|\| data\?\.status === "reserved" \|\| data\?\.status === "sold"/.test(
        submit.slice(0, 1200),
      ) &&
      /router\.replace\(live && data\?\.slug \? `\/products\/\$\{data\.slug\}` : "\/profile"\)/.test(submit.slice(0, 1400))
    )
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
  "and the screen says WHICH listing you are on, by name",
  (() => {
    // "Editează anunțul" tells you what you are doing, which you already know —
    // you pressed the button that says it. It does not tell you which listing,
    // and this sheet is reached from a grid where every card is 88px of
    // photograph. The title is the thing that makes the screen answerable at a
    // glance; the verb is the fallback for the frame before the row lands.
    return (
      (form.match(/\{editId \? title\.trim\(\) \|\| "Editează anunțul" : "(Vinde|Listează) un articol"\}/g) ?? [])
        .length === 2 &&
      // And it must not run under the X that sits over the left of that row.
      /max-w-\[62%\] truncate/.test(form)
    )
  })(),
)

console.log("\nThe things a review found")

check(
  "a reserved listing does not draw a buy bar over routes that all refuse it",
  (() => {
    // `reserved` was added so the page stays reachable for the buyer it is
    // being held for, but the availability model here was binary. Buying 404'd
    // at the checkout page, the offer sheet answered "try again" for a
    // permanent condition, and the message button silently did nothing.
    return (
      /const unavailable = !PUBLIC_FEED\.includes\(product\.status\)/.test(detail) &&
      /const unavailableLabel = isSold \? "Vândut" : "Rezervat"/.test(detail) &&
      (detail.match(/if \(unavailable\) return/g) ?? []).length === 2 &&
      /\{!isOwn && !unavailable && \(/.test(detail)
    )
  })(),
)

check(
  "an archived card does not link to a page that 404s",
  (() => {
    // Only "draft" was diverted, and PUBLIC_PAGE excludes archived too — so
    // every archived card on the one shelf that exists to make archived
    // listings reachable again pointed at notFound().
    const statuses = strip(read("lib/marketplace/listing-status.ts"))
    return /if \(PUBLIC_PAGE\.includes\(listing\.status as ListingStatus\)\) return `\/products\/\$\{listing\.slug\}`/.test(statuses)
  })(),
)

check(
  "an armed delete does not carry over to a different listing",
  (() => {
    // One sheet instance serves the whole grid. A confirmation armed on one
    // card was still expanded when the sheet reopened on another — one tap
    // from destroying the wrong listing.
    const profile = strip(read("components/member/member-profile.tsx"))
    // The reset-on-close is gone, because closing the sheet is now HOW the
    // confirmation opens. What discards it is the parent keying the whole
    // component on the listing's id, so a change of subject cannot inherit it.
    return /key=\{shown\.id\}/.test(profile) && !/if \(open\) return\s*\n\s*setConfirming\(false\)/.test(sheet)
  })(),
)

check(
  "and the sheet does not rewrite itself while it is sliding away",
  (() => {
    // BottomSheet keeps its children mounted for the exit animation, so props
    // read straight from the nulled selection turned it into a generic,
    // titleless listing for 310ms.
    const profile = strip(read("components/member/member-profile.tsx"))
    return /if \(manageFor\) setShown\(manageFor\)/.test(profile) && /\{isOwner && shown && \(/.test(profile)
  })(),
)

check(
  "deleting cannot destroy a refunded or disputed order",
  (() => {
    // orders.product_id is ON DELETE CASCADE, so the guard has to be an
    // allowlist of order states that are SAFE TO ERASE — not a list of the
    // three that happen to mean "paid". A refunded order is the buyer's
    // receipt, the refund record and the seller's revenue history.
    return (
      /const DELETABLE_ORDER_STATES = \["pending", "failed", "cancelled", "canceled", "abandoned"\]/.test(route) &&
      /\.not\("status", "in", `\(\$\{DELETABLE_ORDER_STATES\.join\(","\)\}\)`\)/.test(route)
    )
  })(),
)

check(
  "an inherited Object key is not a status action",
  (() => {
    // "__proto__", "toString" and "constructor" all return a truthy value from
    // a bare index into an object literal, so a request naming one was handled
    // as a status change.
    return (
      /Object\.prototype\.hasOwnProperty\.call\(ACTION_TO_STATUS, action\)/.test(route) &&
      /if \(action !== null && !known\)/.test(route)
    )
  })(),
)

check(
  "publishing re-validates the STORED row, not the request",
  (() => {
    // `publish` and `unreserve` carry no fields, so nothing in the body could
    // be validated even in principle — and they are the two ways onto the feed
    // that do not go through an edit.
    const block = route.slice(route.indexOf('if (next === "published") {'))
    return /const \{ data: full \} = await admin/.test(block.slice(0, 1800)) && /publishProblems\(\{/.test(block.slice(0, 2600))
  })(),
)

check(
  "the delete refusal does not recommend a control the server refuses",
  (() => {
    // "Îl poți arhiva" is true for a published listing with an order against
    // it and false for one whose status is already sold — `sold` is outside
    // EDITABLE, so archive 409s.
    return /row\.status === "sold"\s*\n?\s*\? "Anunțul a fost vândut\./.test(route)
  })(),
)

check(
  "a resumed draft published with 'and another' does not lock the form",
  (() => {
    // draftId picks the save target on every submit and the post-another
    // branch empties the form in place — so every later save PATCHed a drafts
    // endpoint scoped `.eq("status","draft")` against a row that had just
    // become published.
    return (
      /const \[draftId, setDraftId\] = useState<string \| null>/.test(form) &&
      /setDraftId\(null\)/.test(form) &&
      /window\.history\.replaceState\(null, "", "\/products\/new"\)/.test(form) &&
      /baseline\.current = null/.test(form)
    )
  })(),
)

check(
  "saving does not quietly drop a photo that is still uploading",
  (() => {
    // `uploaded` is the photos whose upload has returned a URL, and that
    // filtered list is what gets sent. On the exit that exists to KEEP your
    // work, silently storing three of five photographs is the one thing it
    // must not do.
    return (
      /if \(photos\.some\(\(p\) => p\.uploading\)\) \{/.test(form) &&
      /Așteaptă să se încarce fotografiile\./.test(form)
    )
  })(),
)

check(
  "a saved listing that is no longer for sale is not a wishlist card",
  (() => {
    // The embed neither filtered nor selected status, so a wishlist kept
    // drawing buyable cards for listings that had since been sold, archived or
    // reverted to a draft — and the client could not tell, because the field
    // never reached it.
    const wl = strip(read("app/api/wishlist/route.ts"))
    return /if \(!PUBLIC_FEED\.includes\(\(item\.products as any\)\.status\)\) continue/.test(wl)
  })(),
)

check(
  "POST caps the photos it is handed",
  (() => {
    // cleanVariants is told to build `photos.length` entries while
    // thumbnail_url and gallery_urls keep only MAX_PHOTOS — so an uncapped
    // list broke the positional alignment those columns depend on AND wrote an
    // unbounded jsonb column from an untrusted body.
    const create = strip(read("app/api/listings/route.ts"))
    return /\)\.slice\(0, MAX_PHOTOS\)/.test(create)
  })(),
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
      // Keyed off PUBLIC_PAGE, so `archived` is covered too — it had exactly
      // the same problem and only "draft" was handled, which sent every
      // archived card on the owner shelf to a 404.
      /if \(PUBLIC_PAGE\.includes\(listing\.status as ListingStatus\)\) return `\/products\/\$\{listing\.slug\}`/.test(
        statuses,
      ) &&
      // The two hrefs are built by sell-route.ts now rather than spelled out
      // here — see "archived and draft cards no longer point at a dead address".
      /sellDraftHref\(listing\.id\) : sellEditHref\(listing\.id\)/.test(statuses) &&
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
    const go = profile.slice(profile.indexOf("const goToTab = useCallback"))
    const tab = profile.slice(profile.indexOf("function ShelfTab("))
    return /triggerHaptic\("light"\)/.test(go.slice(0, 400)) && /active:scale-\[0\.97\]/.test(tab.slice(0, 1400))
  })(),
)

check(
  "switching panels re-mounts nothing",
  (() => {
    // A depth crossfade needs both layers in the DOM, so leaving the grid meant
    // mounting sixty ProductCards a second time — sixty next/image elements,
    // decoded again — on the one frame the animation had to start on. That is
    // the right trade for the feed, which crossfades two full-screen
    // photographs; it is the wrong one for a grid. Both panels stay mounted and
    // the inactive one is display:none, so a switch is a class change.
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /shelfTab === "reviews" \? "block" : "hidden"/.test(profile) &&
      /shelfTab === "listings" \? "block" : "hidden"/.test(profile) &&
      /\{reviewsSeen && \(/.test(profile) &&
      !/DepthSwap/.test(profile)
    )
  })(),
)

check(
  "an inactive panel adds no height to the page",
  (() => {
    // Forty percent down a grid of sixty cards is three thousand pixels of
    // scroll; the reviews panel is three hundred. `hidden` is display:none, so
    // the page is never taller than what is on it.
    const sheetCss = strip(read("app/globals.css"))
    return /\.shelf-panel \{[\s\S]{0,90}?contain: layout paint style/.test(sheetCss)
  })(),
)

check(
  "and the strip is brought to the top before the panel changes",
  (() => {
    // THE INVARIANT, unchanged: the swap must never happen while the page is
    // still scrolled past where the shorter panel will end. Otherwise the
    // browser is left beyond the end of a document that just shrank — it paints
    // nothing, then clamps, which is the second of empty page followed by a
    // jump.
    //
    // WHAT CHANGED is how the strip gets there. It used to be an instant
    // `scrollBy` fired on the same tick as the swap, and two thousand pixels
    // erased between one frame and the next is not a transition anybody can
    // follow — press Evaluări and the screen you were reading is simply gone.
    // The travel is animated now and the swap waits for it, which satisfies this
    // invariant more strictly than the jump did rather than less: `commit` is
    // the ONLY thing that moves the panels, and on the animated path it is
    // reachable only from the end of the scroll.
    const profile = strip(read("components/member/member-profile.tsx"))
    const go = profile.slice(profile.indexOf("const goToTab = useCallback"), profile.indexOf("const panelIn ="))
    return (
      go.length > 200 &&
      // One place changes the panel, and it is the one the scroll calls.
      (go.match(/setShelfTab\(/g) ?? []).length === 1 &&
      /const commit = \(\) => \{[\s\S]{0,200}?setShelfTab\(/.test(go) &&
      // The animated branch never commits inline — only `stop()` does, and
      // `stop()` is what the final frame runs.
      /if \(t < 1\) \{\s*\n\s*requestAnimationFrame\(step\)\s*\n\s*return\s*\n\s*\}\s*\n\s*stop\(\)/.test(go) &&
      /const stop = \(\) => \{[\s\S]{0,320}?commit\(\)/.test(go)
    )
  })(),
)

check(
  "a page already at the strip does not travel, and neither does a reduced-motion one",
  (() => {
    // Switching while you can still see the strip must not move the page at all,
    // and somebody who has asked for less motion gets the old instant behaviour
    // rather than a 380ms glide they opted out of. Both fall through to the same
    // immediate commit.
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /\(prefers-reduced-motion: reduce\)/.test(profile) &&
      /if \(top >= -1 \|\| reduced\) \{[\s\S]{0,220}?commit\(\)\s*\n\s*return/.test(profile) &&
      /if \(top < 0\) window\.scrollBy\(\{ top, behavior: "auto" \}\)/.test(profile)
    )
  })(),
)

check(
  "the tab answers the finger, and the panel answers the scroll",
  (() => {
    // A 380ms glide with the underline still sitting on the tab you left is a
    // tap that did nothing for a third of a second. The strip is optimistic —
    // it draws `pending` — while the panels wait for the travel to finish.
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /const shownTab = pending \?\? shelfTab/.test(profile) &&
      /active=\{shownTab === "listings"\}/.test(profile) &&
      /active=\{shownTab === "reviews"\}/.test(profile) &&
      // The panels are the slow half, and must NOT read the optimistic value.
      /shelf-panel", shelfTab === "reviews"/.test(profile) &&
      /shelf-panel", shelfTab === "listings"/.test(profile)
    )
  })(),
)

check(
  "a finger on the screen wins the scroll back",
  (() => {
    // A page that keeps gliding somewhere while you are trying to scroll it
    // yourself is worse than the jump this replaces. Either input cancels the
    // run and commits where it stands.
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /addEventListener\("touchstart", stop, \{ passive: true, once: true \}\)/.test(profile) &&
      /addEventListener\("wheel", stop, \{ passive: true, once: true \}\)/.test(profile) &&
      // And a run that outlives its component stops driving a page that is gone.
      /useEffect\(\(\) => \(\) => void scrollRun\.current\+\+, \[\]\)/.test(profile)
    )
  })(),
)

check(
  "the reviews request starts on the tap, not on the arrival",
  (() => {
    // The panel is `hidden` either way, so mounting it early costs no layout —
    // and its round trip then runs during the glide instead of on the frame it
    // appears. The tab lands populated rather than landing and then filling in.
    const profile = strip(read("components/member/member-profile.tsx"))
    const go = profile.slice(profile.indexOf("const goToTab = useCallback"), profile.indexOf("const panelIn ="))
    const commitEnd = go.indexOf("setPending(null)")
    return commitEnd > 0 && go.indexOf('if (next === "reviews") setReviewsSeen(true)') > commitEnd
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
      /\{cornerAction \?\? \(mine \? null : <WishlistHeartButton/.test(card)
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
      /if \(onDeleted\) \{\s*\n\s*onDeleted\(\)\s*\n\s*return\s*\n\s*\}/.test(sheet)
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
  "the underline travels rather than two borders swapping colour",
  (() => {
    // The one thing a tab strip has to communicate is that these are the same
    // control in two positions, and a border that simply becomes black
    // somewhere else says the opposite. One bar, moved by transform.
    // `shownTab`, not `shelfTab`: the bar belongs to the strip, which answers
    // the finger immediately, rather than to the panels, which wait for the
    // scroll to finish. It still travels by transform and it is still one bar.
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /transform: `translate3d\(\$\{shownTab === "reviews" \? 100 : 0\}%, 0, 0\)`/.test(profile) &&
      /absolute -bottom-px left-0 h-\[2px\] w-1\/2/.test(profile)
    )
  })(),
)

check(
  "an empty seller pays for no round trip at all",
  (() => {
    // The count is already known from the server render, so zero reviews draws
    // the empty state on the FIRST frame instead of three skeletons and a
    // second layout a second later. That was the glitch.
    const list = strip(read("components/member/seller-reviews-list.tsx"))
    const profile = strip(read("components/member/member-profile.tsx"))
    return (
      /const empty = knownCount === 0/.test(list) &&
      /useState<Review\[\] \| null>\(empty \? \[\] : null\)/.test(list) &&
      /if \(empty\) return/.test(list) &&
      /knownCount=\{reviews === undefined \? undefined : \(reviews\?\.count \?\? 0\)\}/.test(profile)
    )
  })(),
)

check(
  "and a non-empty one gets a skeleton the shape of the answer",
  (() => {
    const list = strip(read("components/member/seller-reviews-list.tsx"))
    return /const rows = Math\.min\(Math\.max\(knownCount \?\? 3, 1\), 6\)/.test(list)
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


/* ===========================================================================
 *  THE PANEL, THE BAR AND THE BADGE
 * ===========================================================================
 *
 * Four complaints, and only one of them was about something being slow.
 *
 *   the sheet is laggy and clicky   it was doing layout work per frame
 *   switching tabs is not smooth    it said a change happened, not which way
 *   scrolling loses the profile     forty cards down, nothing said whose shop
 *   the draft badge is orange       amber is a warning; a draft is not one
 */

const profileSrc = strip(read("components/member/member-profile.tsx"))
const pinnedSrc = strip(read("components/member/profile-pinned-header.tsx"))
const lockSrc = strip(read("lib/scroll-lock.ts"))
const bottomSheet = strip(read("components/ui/bottom-sheet.tsx"))
const dialog = strip(read("components/ui/confirm-dialog.tsx"))
const css = read("app/globals.css")

console.log("\nThe sheet stops fighting the page")

check(
  "the page behind a sheet holds still",
  (() => {
    // A thumb landing slightly off the sheet, or on it but past the end of its
    // list, used to move the whole profile. Nothing breaks; it just reads as a
    // panel sitting on a web page, which is most of what "laggy" meant here.
    return /lockScroll/.test(bottomSheet) && /if \(!mounted\) return\s*\n\s*return lockScroll\(\)/.test(bottomSheet)
  })(),
)

check(
  "and two overlapping overlays cannot leave it locked",
  (() => {
    // The delete confirmation opens as the sheet that raised it is still
    // closing. Save-and-restore means whichever effect ran last decides whether
    // the page scrolls — including the case where it stays locked with nothing
    // on screen to unlock it. Counted instead.
    return (
      /let depth = 0/.test(lockSrc) &&
      /if \(depth === 0\)/.test(lockSrc) &&
      /depth = Math\.max\(0, depth - 1\)/.test(lockSrc) &&
      /lockScroll/.test(dialog) &&
      !/document\.body\.style\.overflow = "hidden"/.test(dialog)
    )
  })(),
)

check(
  "a sheet on its way out stops taking taps",
  (() => {
    // It is still on screen for a third of a second after the decision was
    // made, and a row pressed in that window fires an action against a panel
    // that has already been dismissed.
    return /sheet\.style\.pointerEvents = dead/.test(bottomSheet) && /scrim\.style\.pointerEvents = dead/.test(bottomSheet)
  })(),
)

check(
  "the refresh waits for the animation instead of racing it",
  (() => {
    // router.refresh() re-renders the profile — sixty cards — on the frames the
    // sheet is using to slide away. The exit stuttered every single time, and
    // the sheet was never the cause.
    return (
      /const AFTER_EXIT_MS = 330/.test(sheet) &&
      /setTimeout\(\(\) => router\.refresh\(\), AFTER_EXIT_MS\)/.test(sheet) &&
      !/onClose\(\)\s*\n\s*router\.refresh\(\)/.test(sheet)
    )
  })(),
)

check(
  "there is no card drawn inside the sheet",
  (() => {
    // A panel inside a panel, two radii and two edges deep, for a list of five
    // things. The sheet IS the container; a second one inside it says its
    // contents belong to something else that happens to be in here.
    const body = sheet.slice(sheet.indexOf("<BottomSheet"), sheet.indexOf("</BottomSheet>"))
    return !/rounded-2xl border border-neutral/.test(body) && /-mx-2/.test(body)
  })(),
)

check(
  "the rows run to both edges, and the rule does not cut the icon off",
  (() => {
    // A press highlight that stops short of the edge reads as a button placed
    // on the sheet rather than as a row of it; a full-width rule separates the
    // icon column from the text it belongs to.
    const row = sheet.slice(sheet.indexOf("function Row("))
    return /w-full items-center gap-4 px-5/.test(row) && /left-\[56px\] right-0 h-px/.test(row)
  })(),
)

check(
  "the scrim sets the stage before the sheet lands on it",
  (() => {
    // Tied to the sheet's own 380ms, the page behind was still fully legible
    // when the panel was halfway up — two things arriving at once, and the eye
    // reads the whole screen going dark as the slower of the two.
    return /const SCRIM_IN = "opacity 240ms/.test(bottomSheet) && /const SPRING_IN = "transform 380ms/.test(bottomSheet)
  })(),
)

check(
  "and clears before it has finished leaving",
  (() => {
    const scrimOut = Number(bottomSheet.match(/SCRIM_OUT = "opacity (\d+)ms/)?.[1])
    const springOut = Number(bottomSheet.match(/SPRING_OUT = "transform (\d+)ms/)?.[1])
    return scrimOut > 0 && springOut > 0 && scrimOut < springOut
  })(),
)

console.log("\nSwitching tabs says which way you went")

check(
  "the incoming panel arrives from the side its tab is on",
  (() => {
    return (
      /setDir\(next === "reviews" \? "right" : "left"\)/.test(profileSrc) &&
      /shelf-panel-in-right/.test(css) &&
      /shelf-panel-in-left/.test(css)
    )
  })(),
)

check(
  "and nothing animates on arrival, when nothing has changed",
  (() => {
    // `dir` is null until the first switch: the listings panel is what the page
    // opens on, and animating it in is motion announcing something that did not
    // happen.
    return /shelfTab !== tab \|\| !dir \? undefined/.test(profileSrc)
  })(),
)

check(
  "both tabs replay their animation, not just one of them",
  (() => {
    // The reviews panel had the class written straight on it, so it played once
    // — on the mount — and every switch back to it after that was a cut, while
    // listings animated every time.
    return (
      (profileSrc.match(/panelIn\("(listings|reviews)"\)/g) ?? []).length === 2 &&
      !/className="shelf-panel-in"/.test(profileSrc)
    )
  })(),
)

check(
  "the strip lands below the pinned bar, not underneath it",
  (() => {
    // Scrolling it to y=0 puts it under frosted glass, which reads as having
    // scrolled too far.
    return /getBoundingClientRect\(\)\.top - pinnedOffset\(\)/.test(profileSrc) && /profile-pinned\[data-shown="true"\]/.test(profileSrc)
  })(),
)

console.log("\nThe bar that arrives when the name leaves")

check(
  "it carries the name",
  /\{name\}/.test(pinnedSrc) && /name=\{name\}/.test(profileSrc),
)

check(
  "and the controls that were on the cover — but not the pencil",
  (() => {
    // There is a full "Editează profilul" button in the header. An icon meaning
    // the same thing is the same door twice, and it is the one of the four
    // whose glyph says least.
    return (
      /Distribuie/.test(pinnedSrc) &&
      /href="\/wishlist"/.test(pinnedSrc) &&
      /href="\/settings"/.test(pinnedSrc) &&
      !/Pencil/.test(pinnedSrc) &&
      !/Pencil/.test(profileSrc)
    )
  })(),
)

check(
  "it is not driven by a scroll handler",
  (() => {
    // This page is a grid of photographs being flicked through. A handler
    // running every frame to compute a boolean that changes twice a session is
    // main-thread work paid for continuously and used almost never.
    return (
      /new IntersectionObserver/.test(profileSrc) &&
      !/addEventListener\("scroll"/.test(profileSrc) &&
      !/addEventListener\("scroll"/.test(pinnedSrc)
    )
  })(),
)

check(
  "it appears when the name goes ABOVE, not before it is reached",
  /entry\.boundingClientRect\.top < 0/.test(profileSrc),
)

check(
  "it moves on the compositor and never on layout",
  (() => {
    const rule = css.slice(css.indexOf(".profile-pinned {"), css.indexOf(".profile-pinned[data-shown"))
    return /transform: translate3d\(0, -100%, 0\)/.test(rule) && /opacity: 0/.test(rule) && !/height:/.test(rule)
  })(),
)

check(
  "it leaves the notch alone and sits under everything modal",
  (() => {
    const rule = css.slice(css.indexOf(".profile-pinned {"), css.indexOf(".profile-pinned[data-shown"))
    // A sheet is 95 and an alert is 130; a bar that outranked either would sit
    // on top of the thing it is meant to be behind.
    return /padding-top: env\(safe-area-inset-top, 0px\)/.test(rule) && /z-index: 60/.test(rule)
  })(),
)

check(
  "it escapes the transform the profile animates under",
  // `position: fixed` inside a transformed ancestor is fixed to THAT, which
  // would park the bar somewhere down the page.
  /createPortal\(/.test(pinnedSrc) && /document\.body,/.test(pinnedSrc),
)

check(
  "the bar does not survive a modal opening over the page",
  (() => {
    // "Vinde un articol" appeared with this profile's bar across the top of it.
    // /products/new is an INTERCEPTED route, which is what lets the sell sheet
    // open without losing the page behind — so this component is not unmounted,
    // and its bar, portalled to <body> and fixed to the viewport, went on being
    // drawn over a screen it has nothing to do with.
    return (
      /usePathname/.test(profileSrc) &&
      /pathname === "\/profile" \|\| !!pathname\?\.startsWith\("\/member\/"\)/.test(profileSrc) &&
      /visible=\{pinned && onScreen\}/.test(profileSrc)
    )
  })(),
)

check(
  "the name and the face are one object, not two ends of the bar",
  (() => {
    // The avatar sat against the controls, so the two halves of "whose profile
    // is this" were at opposite edges and the picture read as a fourth button.
    const group = pinnedSrc.slice(pinnedSrc.indexOf("flex min-w-0 flex-1 items-center gap-2"))
    const nameAt = group.indexOf("{name}")
    const faceAt = group.indexOf("<PinnedAvatar")
    return nameAt > 0 && faceAt > nameAt
  })(),
)

check(
  "arriving is slower than leaving, and the fade trails rather than leads",
  (() => {
    // Both directions shared one timing, so the bar hit full opacity a third of
    // the way through its travel — the most visible part of the animation was
    // the least informative.
    const rest = css.slice(css.indexOf(".profile-pinned {"), css.indexOf('.profile-pinned[data-shown="true"]'))
    const shown = css.slice(css.indexOf('.profile-pinned[data-shown="true"]'))
    const outT = Number(rest.match(/transform (\d+)ms/)?.[1])
    const outO = Number(rest.match(/opacity (\d+)ms/)?.[1])
    const inT = Number(shown.match(/transform (\d+)ms/)?.[1])
    const inO = Number(shown.match(/opacity (\d+)ms/)?.[1])
    return inT > outT && outO < outT && inO < inT && inO > outO
  })(),
)

check(
  "a subpage holds the page still until it has actually gone",
  (() => {
    // The lock was keyed on `open`, so it was released a third of a second
    // BEFORE the panel finished sliding off. Restoring `overflow` re-snaps the
    // document scroller, in full view through the space the panel is vacating.
    const picker = strip(read("components/sell/picker-page.tsx"))
    return (
      /if \(stage === "closed"\) return\s*\n\s*return lockScroll\(\)/.test(picker) &&
      !/document\.body\.style\.overflow/.test(picker)
    )
  })(),
)

console.log("\nThe last of the bumps, and the badge")

check(
  "Editează profilul does not flinch when you press it",
  (() => {
    // It shrank to 0.94 and sprang back, on a control that then leaves the
    // screen anyway — a second animation competing with the one that matters.
    const btn = profileSrc.slice(profileSrc.indexOf('href="/profile/edit"'), profileSrc.indexOf("Editează profilul"))
    return !/active:scale/.test(btn) && /active:bg-neutral-100/.test(btn)
  })(),
)

check(
  "a draft is marked in black, not in amber",
  (() => {
    // Amber on a draft read as a warning about a listing that has never been
    // anywhere and cannot have gone wrong — and three of them on one grid is an
    // alarm about the ordinary case.
    const statuses = strip(read("lib/marketplace/listing-status.ts"))
    return (
      /case "draft":\s*\n\s*return \{ label: "Ciornă", tone: "neutral" \}/.test(statuses) &&
      /badge\.tone === "neutral" && "bg-neutral-900"/.test(profileSrc)
    )
  })(),
)

check(
  "and it is solid black, so it is the same black on every photograph",
  !/bg-neutral-900\/85/.test(profileSrc),
)

console.log("\nEditing a listing actually lands on the form")

check(
  "the sheet closes on its way to the sell form",
  (() => {
    // IT DID NOT. `onEdit` was a haptic and a `router.push`, with no `onClose()`
    // anywhere — so the sheet stayed open over the form it had just opened, and
    // both sit at z-95, so which one won was decided by DOM order.
    const edit = sheet.slice(sheet.indexOf("const onEdit = useCallback"), sheet.indexOf("const act = useCallback"))
    return edit.length > 80 && /onClose\(\)/.test(edit)
  })(),
)

check(
  "and the page it lands on is not still locked",
  (() => {
    // THE REAL DAMAGE, and the reason this reads as "the form comes up empty".
    // BottomSheet holds lockScroll() for as long as it is MOUNTED. A sheet that
    // never closes never unmounts, so the lock was never released — and the sell
    // form is a scrolling column of fields. Everything below the fold was loaded
    // and unreachable, which looks exactly like nothing having been populated.
    return (
      /if \(!mounted\) return\s*\n\s*return lockScroll\(\)/.test(bottomSheet) &&
      /const onEdit = useCallback\([\s\S]{0,400}?onClose\(\)/.test(sheet)
    )
  })(),
)

check(
  "the navigation waits for the sheet to leave, rather than racing it",
  (() => {
    // Two panels of different weights moving at once. The status actions already
    // defer their refresh by exactly this constant for exactly this reason.
    const edit = sheet.slice(sheet.indexOf("const onEdit = useCallback"), sheet.indexOf("const act = useCallback"))
    return /setTimeout\(\(\) => router\.push\(editHref\), AFTER_EXIT_MS\)/.test(edit)
  })(),
)

check(
  "and the route is warmed while the sheet is still up, so the wait buys something",
  // Otherwise the sheet finishes leaving and only THEN does the form start
  // fetching — the pause this sequence exists to remove, moved later.
  /if \(open\) router\.prefetch\(editHref\)/.test(sheet),
)

check(
  "a draft still resumes through the drafts route",
  (() => {
    // The two are not interchangeable: only the drafts route knows how to
    // publish from a draft, and a draft has never been live, so /edit would say
    // it was. Both hrefs are built by lib/marketplace/sell-route.ts now.
    const routes = strip(read("lib/marketplace/sell-route.ts"))
    return (
      /const editHref = isDraft \? sellDraftHref\(listingId\) : sellEditHref\(listingId\)/.test(sheet) &&
      /return `\/products\/edit\/\$\{encodeURIComponent\(listingId\)\}`/.test(routes) &&
      /return `\$\{SELL_NEW\}\?draft=\$\{encodeURIComponent\(draftId\)\}`/.test(routes)
    )
  })(),
)

check(
  "the URL says edit, because the URL is the one part of a screen you can read",
  (() => {
    // `/products/new?edit=…` says "new" to somebody who is editing.
    return !/products\/new\?edit=/.test(sheet) && !/products\/new\?edit=/.test(detail)
  })(),
)

check(
  "and every screen that hides itself for the sell form knows about BOTH routes",
  (() => {
    // Eight components asked `pathname.startsWith("/products/new")` by hand to
    // mean "the form is on screen". Adding a second address to eight string
    // comparisons is how seven get updated and the eighth quietly treats the
    // edit screen as an ordinary listing page — which for `isListing` in the
    // global nav means hiding the tab bar under the sheet and reflowing the
    // profile behind it, the exact flash that file's note exists to explain.
    const files = [
      "components/marketing/global-mobile-nav.tsx",
      "components/marketing/global-mobile-topbar.tsx",
      "components/marketing/tab-transition.tsx",
      "components/marketing/conditional-footer.tsx",
      "components/marketing/shell-scroll-reset.tsx",
      "components/explore/mobile-bottom-nav.tsx",
    ]
    // `[^.]` so this does not trip on `window.location.pathname.startsWith`,
    // which the tab bar uses in its tap rescue to check where the + actually
    // landed. That one is about the new-listing route specifically and is right.
    return files.every((f) => {
      const src = strip(read(f))
      return /isSellFormRoute/.test(src) && !/[^.]pathname\.startsWith\("\/products\/new"\)/.test(src)
    })
  })(),
)

check(
  "the verbs are not boxed inside the sheet that already contains them",
  (() => {
    // `rounded-2xl border border-neutral-200/80` around the rows, drawn inside a
    // sheet that is itself a rounded white panel over a scrim: a card in a card,
    // two corner radii a few pixels apart, and a hairline tracing the outline of
    // the thing it was already inside. It read as a second modal nested in the
    // first.
    return !/rounded-2xl border border-neutral-200\/80/.test(sheet) && /-mx-2 pb-4 pt-1/.test(sheet)
  })(),
)

console.log("\nThe edit screen arrives already filled in")

check(
  "the route reads the row, so there is no second arrival to watch",
  (() => {
    // The form used to fetch this itself: the sheet mounted empty, slid up, and
    // the row landed a few hundred milliseconds later — every field, every chip
    // and eight photographs appearing at once, AFTER the slide had finished. Two
    // arrivals for one tap, and the second cannot be part of the transition
    // because the transition is over by then.
    const modal = strip(read("app/(marketing)/@modal/(.)products/edit/[id]/page.tsx"))
    const page = strip(read("app/(marketing)/products/edit/[id]/page.tsx"))
    return (
      /const listing = await loadOwnedListing\(id\)/.test(modal) &&
      /initialListing=\{listing\}/.test(modal) &&
      /const listing = await loadOwnedListing\(id\)/.test(page) &&
      /initialListing=\{listing\}/.test(page)
    )
  })(),
)

check(
  "every field is seeded on the first render rather than set by an effect",
  (() => {
    // A `useState` initialiser runs before the first paint. `setTitle` in an
    // effect is a second render, which is the pop.
    return (
      /const seed = useRef\(initialListing \? fieldsFromRow\(initialListing\) : null\)\.current/.test(form) &&
      /useState<Photo\[\]>\(seed\?\.photos \?\? \[\]\)/.test(form) &&
      /useState\(seed\?\.title \?\? ""\)/.test(form) &&
      /useState\(seed\?\.price \?\? ""\)/.test(form)
    )
  })(),
)

check(
  "and the form does not then fetch the row it was just handed",
  (() => {
    // The answer would be identical to what is on screen, and applying it would
    // overwrite anything typed while it was in flight.
    return /if \(seed\) return\s*\n\s*const id = draftId \?\? editId/.test(form)
  })(),
)

check(
  "'unchanged' is measured from the seeded values, not from an empty form",
  (() => {
    // `formReady` is what decides when the baseline for `dirty` is taken. Left
    // false on a seeded form, the baseline would be taken later and the fields
    // would compare unequal to an empty form — every edit screen opening as
    // though somebody had already typed in it, and closing would ask whether to
    // discard changes nobody made.
    return /const \[formReady, setFormReady\] = useState\(!!seed\)/.test(form)
  })(),
)

check(
  "one mapping from row to fields, shared by both paths",
  (() => {
    // The seeded path and the draft path both turn a row into field values. Two
    // copies is two places for "the era chip does not come back" to live.
    return (
      /function fieldsFromRow\(/.test(form) &&
      /const next = fieldsFromRow\(v\)/.test(form) &&
      (form.match(/thumbnail_url, \.\.\.\(Array\.isArray/g) ?? []).length === 1
    )
  })(),
)

check(
  "the server read is ownership-scoped in the query itself",
  (() => {
    // The id is a uuid anybody can read off a listing page. Fetched by id AND by
    // the caller's creator id in one statement — not fetched and then compared,
    // which leaks a row's existence through timing and through which error comes
    // back.
    const owned = strip(read("lib/marketplace/owned-listing.ts"))
    return (
      /\.eq\("id", id\)\s*\n\s*\.eq\("creator_id", creatorId\)/.test(owned) &&
      /import "server-only"/.test(owned)
    )
  })(),
)

console.log("\nAn archived card opens the screen that can do something about it")

check(
  "archived and draft cards no longer point at a dead address",
  (() => {
    // REGRESSION, caught twice in the same function. It wrote
    // `/products/new?edit=<id>` by hand and was left pointing there after the
    // edit screen moved to its own route — so tapping an archived card, on the
    // one shelf that exists to make archived listings reachable again, opened a
    // blank NEW-listing form. The comment above it already records this function
    // linking to a 404 once before, for the same reason: an address written out
    // in a file that does not own addresses.
    const statuses = strip(read("lib/marketplace/listing-status.ts"))
    return (
      !/products\/new\?edit=/.test(statuses) &&
      /return listing\.status === "draft" \? sellDraftHref\(listing\.id\) : sellEditHref\(listing\.id\)/.test(
        statuses,
      )
    )
  })(),
)

check(
  "a published card still opens the listing, not the form",
  /if \(PUBLIC_PAGE\.includes\(listing\.status as ListingStatus\)\) return `\/products\/\$\{listing\.slug\}`/.test(
    strip(read("lib/marketplace/listing-status.ts")),
  ),
)

console.log("\nComing back to where you were")

check(
  "closing the sheet does not drop you at the top of the profile",
  (() => {
    // Skipping the reset while the sheet is UP was only half of it. The reset
    // fires on the navigation BACK, when the pathname is /profile again and the
    // guard no longer applies — so the position was thrown away one step after
    // the guard stopped watching.
    const reset = strip(read("components/marketing/shell-scroll-reset.tsx"))
    return (
      /cameFrom\.current = \{ path: previous \?\? "", top: el\?\.scrollTop \?\? 0 \}/.test(reset) &&
      /if \(back && back\.path === path\)/.test(reset) &&
      /el\.scrollTop = back\.top/.test(reset)
    )
  })(),
)

check(
  "the position is captured on the way IN, once",
  (() => {
    // While the sheet is up this effect can run again for a search-param change,
    // and re-reading then captures the covered page's scrollTop after something
    // else has touched it.
    const reset = strip(read("components/marketing/shell-scroll-reset.tsx"))
    return /if \(!previous \|\| !isSellFormRoute\(previous\)\)/.test(reset)
  })(),
)

check(
  "and a DIFFERENT screen still arrives at its top",
  (() => {
    // Publishing an edit ends on /products/<slug>, which is not where you came
    // from and must not inherit its scroll position.
    const reset = strip(read("components/marketing/shell-scroll-reset.tsx"))
    const tail = reset.slice(reset.indexOf("if (back && back.path === path)"))
    return /if \(el && el\.scrollTop !== 0\) el\.scrollTop = 0/.test(tail)
  })(),
)

console.log("\nWhat a missing photograph draws")

check(
  "an empty card is not an emoji",
  (() => {
    // It was a 👜 at text-4xl. An emoji is drawn by the OS, so the same listing
    // was a flat handbag on one phone, a glossy one on another, and a hollow
    // rectangle on a device with no font for it — at whatever size and colour
    // the vendor picked, in a grid tuned to neutrals.
    const card = strip(read("components/explore/product-card.tsx"))
    return (
      !/👜/.test(card) &&
      !/text-4xl/.test(card) &&
      /<ImageOff className="h-8 w-8 text-neutral-300"/.test(card)
    )
  })(),
)

check(
  "and neither is an empty avatar in the pinned bar",
  (() => {
    // The same trap one size down, on the element added right next to it: a
    // silhouette emoji beside a real photograph in the same 28px circle is the
    // loudest mismatch in the bar. The initial is the app's own type in the
    // app's own grey, and it is what the full-size avatar above already does.
    return (
      /name\.trim\(\)\.charAt\(0\)\.toUpperCase\(\)/.test(pinnedSrc) &&
      /object-cover/.test(pinnedSrc)
    )
  })(),
)

check(
  "the bar carries the face as well as the name",
  (() => {
    // A name alone is the weakest of the identifiers the bar stands in for:
    // display names repeat, they truncate at this width, and the thing the eye
    // recognises forty cards down a grid is the picture. To the RIGHT of the
    // name, so a long name is shortened rather than the face being dropped.
    const at = pinnedSrc.indexOf("{name}")
    return (
      at > 0 &&
      /<PinnedAvatar name=\{name\} url=\{avatarUrl\} \/>/.test(pinnedSrc) &&
      pinnedSrc.indexOf("<PinnedAvatar") > at &&
      pinnedSrc.indexOf("<PinnedAvatar") < pinnedSrc.indexOf('label="Distribuie"') &&
      // And the caller actually hands it one.
      /avatarUrl=\{member\.avatarUrl\}/.test(profileSrc)
    )
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
