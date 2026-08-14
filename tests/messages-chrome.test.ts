/**
 * ===========================================================================
 *  THE CHROME AROUND A CONVERSATION
 * ===========================================================================
 *
 * Everything in this suite is a rule that is INVISIBLE WHEN IT BREAKS. None of
 * these produce an error, a log line, or a crash — they produce a screen that
 * looks fine and is quietly wrong:
 *
 *   · A composer on the Storelib thread accepts messages nobody reads. It looks
 *     exactly like support. It is a void with a send button.
 *
 *   · A report that arrives without the message it is about. Moderation gets
 *     "this person is abusive" attached to a hundred rows and has to guess.
 *
 *   · An offender taken from the query string instead of from the conversation
 *     row. The page still renders, the report still files, and it is filed
 *     against whoever the URL said.
 *
 *   · The verified mark missing from the list beside a thread that has it. The
 *     one account an impersonator would want that disagreement for.
 *
 *   · A full-resolution photograph fetched for a 32px circle. Nothing breaks;
 *     the page is just slow in a way no error surface reports.
 *
 * Every negative assertion reads `code()` — source with comments stripped — for
 * the reason recorded in tests/one-arrival.test.ts: this repository has now had
 * four separate guards satisfied by the prose explaining why the forbidden
 * thing is not there.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

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

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))

// ---------------------------------------------------------------------------
console.log("\nThe official thread is read-only")
// ---------------------------------------------------------------------------

const thread = code("components/messages/thread.tsx")

check(
  "the composer is not rendered on the Storelib thread",
  /thread\?\.official \?/.test(thread) && /Centrul de ajutor/.test(thread),
  "        components/messages/thread.tsx — an input for messages nobody reads\n" +
    "        is not a smaller problem than no input; it is a larger one.",
)

const sendRoute = code("app/api/messages/[id]/route.ts")
const imageRoute = code("app/api/messages/[id]/image/route.ts")

check(
  "and the text endpoint refuses the write, not just the button",
  /isOfficialThread\(/.test(sendRoute) && /status: 403/.test(sendRoute),
  "        A hidden text box is a courtesy. A stale tab, a queued offline send\n" +
    "        or a session and curl all still reach the endpoint.",
)

check(
  "and so does the photo endpoint",
  /isOfficialThread\(/.test(imageRoute),
  "        A route that refuses words and accepts photographs has not closed\n" +
    "        the thread, it has made writing into it inconvenient.",
)

check(
  "the refusal fails OPEN when no official account is configured",
  (() => {
    const guard = code("lib/messages/official-thread.ts")
    // A null system id means the account was never seeded, and in that
    // environment NO conversation is the official one. Refusing on the null
    // would take ordinary messaging down over an unconfigured marketing
    // feature.
    return /if \(!systemId\) return false/.test(guard)
  })(),
  "        lib/messages/official-thread.ts",
)

check(
  "the welcome note no longer invites a reply it cannot take",
  (() => {
    const sys = code("lib/system-account.ts")
    return !/scrie-ne direct aici/.test(sys) && /Centrul de ajutor/.test(sys)
  })(),
  "        lib/system-account.ts — copy asking for something the screen no\n" +
    "        longer offers is the worst of both.",
)

// ---------------------------------------------------------------------------
console.log("\nReporting one message")
// ---------------------------------------------------------------------------

const actions = code("components/messages/message-actions.tsx")

check(
  "every message carries a menu, not only a long press",
  (() => {
    // A long press is invisible, and on a desktop pointer it does not exist at
    // all. "Hold this to find out what you can do" is not an affordance.
    return /MessageDots/.test(thread) && /msg-row/.test(thread)
  })(),
  "        components/messages/thread.tsx",
)

check(
  "the report link carries all four identifiers",
  (() => {
    return (
      /ref_id: conversationId/.test(actions) &&
      /ref_type: "msg_thread"/.test(actions) &&
      /offender_id: offenderId/.test(actions) &&
      /reported_message_id: messageId/.test(actions)
    )
  })(),
  "        components/messages/message-actions.tsx — a report that does not say\n" +
    "        which message is a report moderation has to guess at.",
)

check(
  "reporting is not offered on your own words",
  /!message\.mine/.test(actions),
  "        \"Report\" beside something you wrote is a control with no meaning,\n" +
    "        and it sits directly above \"Șterge mesajul\".",
)

const reportPage = code("app/(marketing)/user/reports/new/page.tsx")

check(
  "the report page takes the offender from the conversation ROW, not the URL",
  (() => {
    // The query string is written by whoever is standing at the address bar.
    // `offender_id` is read for nothing but the sign-in round trip; the id that
    // is filed comes out of the row RLS already proved membership of.
    return (
      /const offenderId = convo\.buyer_id === user\.id \? convo\.seller_id : convo\.buyer_id/.test(reportPage) &&
      !/offender_id.*\bofficialId\b/.test(reportPage) &&
      !/one\(params\.offender_id\)/.test(reportPage)
    )
  })(),
  "        app/(marketing)/user/reports/new/page.tsx — believing offender_id\n" +
    "        would let anybody file a report against a stranger.",
)

check(
  "and the reported message is scoped to that conversation",
  /\.eq\("conversation_id", refId\)/.test(reportPage),
  "        Otherwise an id pasted from another thread resolves, and a moderator\n" +
    "        is shown a private conversation neither party reported.",
)

const actionsRoute = code("app/api/messages/[id]/actions/route.ts")

check(
  "the API checks the message id against the thread before storing it",
  (() => {
    return (
      /\.eq\("conversation_id", id\)/.test(actionsRoute) &&
      /message_id: messageId/.test(actionsRoute)
    )
  })(),
  "        app/api/messages/[id]/actions/route.ts",
)

const messagingSql = read("supabase/sql/RUN_MESSAGING_ALL.sql")

check(
  "a per-message report is not blocked by a thread-level one",
  (() => {
    // The old index was unconditional on (conversation_id, reporter_id), so
    // anybody who had ever reported a thread would have every later
    // per-message report silently swallowed as a duplicate.
    return (
      /drop index if exists conversation_reports_one_per_reporter/.test(messagingSql) &&
      /conversation_reports_one_per_thread[\s\S]{0,200}where message_id is null/.test(messagingSql) &&
      /conversation_reports_one_per_message[\s\S]{0,200}where message_id is not null/.test(messagingSql)
    )
  })(),
  "        supabase/sql/RUN_MESSAGING_ALL.sql",
)

check(
  "and deleting the reported message does not delete the report",
  /message_id uuid references public\.messages\(id\) on delete set null/.test(messagingSql),
  "        A report that vanishes when the offender presses unsend is a\n" +
    "        moderation queue the offender controls.",
)

// ---------------------------------------------------------------------------
console.log("\nThe safety banner")
// ---------------------------------------------------------------------------

const safety = code("components/messages/safety-notice.tsx")

check(
  "the warning goes somewhere",
  /href="\/help"/.test(safety) && /Află mai multe/.test(safety),
  "        components/messages/safety-notice.tsx — two lines cannot explain what\n" +
    "        a payment outside the app actually costs you.",
)

check(
  "and the link is underlined, not colour alone",
  // On the link itself. An `underline` loose in the file proves nothing — the
  // assertion has to reach from the href to the class that draws the rule.
  /<Link\s+href="\/help"[\s\S]{0,240}?underline[\s\S]{0,240}?Află mai multe/.test(safety),
  "        Colour is the one thing that does not survive a cheap screen or a\n" +
    "        colour-blind reader, and this is the sentence worth not missing.",
)

// ---------------------------------------------------------------------------
console.log("\nThe desktop conversation list")
// ---------------------------------------------------------------------------

const deskList = code("components/messages/desktop-conversation-list.tsx")

check(
  "no listing means the PERSON, not their initial",
  (() => {
    // This fell straight from "no item photograph" to a grey letter, skipping
    // the avatar — which is why the Storelib thread, the one conversation that
    // is about no listing at all, showed a grey S.
    return /<InitialAvatar[\s\S]{0,200}url=\{r\.other\?\.avatar_url\}/.test(deskList) && !/initials\(who\)/.test(deskList)
  })(),
  "        components/messages/desktop-conversation-list.tsx",
)

check(
  "the verified mark is in the list, not only in the thread it opens",
  /r\.official && \(?\s*<BadgeCheck/.test(deskList),
  "        A list that disagrees with the screen it opens is the disagreement an\n" +
    "        impersonator wants.",
)

check(
  "notifications are reachable without making the window narrow",
  (() => {
    return (
      /useState<"messages" \| "notifications">/.test(deskList) &&
      /DesktopNotifications/.test(deskList) &&
      /translateX\(100%\)/.test(deskList)
    )
  })(),
  "        components/messages/desktop-conversation-list.tsx — the split view had\n" +
    "        no way to reach the activity feed at all.",
)

check(
  "and both inboxes read one definition of what a notification means",
  (() => {
    const inbox = code("components/messages/inbox.tsx")
    const shared = "@/lib/messages/notification-view"
    return (
      inbox.includes(shared) &&
      deskList.includes(shared) &&
      !/function notifHref/.test(inbox) &&
      !/function notifHref/.test(deskList)
    )
  })(),
  "        Two copies of notifHref is two answers to where a follow goes.",
)

// ---------------------------------------------------------------------------
console.log("\nAvatars are fetched at the size they are drawn")
// ---------------------------------------------------------------------------

check(
  "no marketplace screen pulls a raw avatar url into an <img>",
  (() => {
    // A plain <img src={avatar_url}> downloads WHAT WAS UPLOADED — a two or
    // three megabyte camera photograph — and draws it into a 32px circle. The
    // reviews list did that a dozen times on one screen.
    const files = [
      "components/member/member-profile.tsx",
      "components/member/profile-pinned-header.tsx",
      "components/member/seller-reviews-list.tsx",
      "components/product/product-detail.tsx",
      "components/messages/desktop-conversation-list.tsx",
    ]
    return files.every((f) => {
      const src = code(f)
      return !/<img[^>]*src=\{[^}]*avatar[^}]*\}/i.test(src) && !/<img[^>]*src=\{url\}/.test(src)
    })
  })(),
  "        AvatarPhoto / InitialAvatar route these through next/image, whose\n" +
    "        size ladder has rungs at 24/32/48/64/96 for exactly this.",
)

check(
  "the shared avatar takes its radius from the caller",
  (() => {
    // The desktop conversation list draws a rounded SQUARE, because the slot
    // beside it holds a listing photograph at the same radius. A hard-coded
    // rounded-full meant that caller got a circle inside a square.
    const av = code("components/ui/initial-avatar.tsx")
    return /rounded-\[inherit\]/.test(av)
  })(),
  "        components/ui/initial-avatar.tsx",
)

check(
  "a broken avatar url falls back instead of painting the browser's glyph",
  (() => {
    const av = code("components/ui/initial-avatar.tsx")
    return /onError=\{\(\) => setBroken\(true\)\}/.test(av) && /if \(!url \|\| broken\) return <>\{children\}<\/>/.test(av)
  })(),
  "        An account that deleted its picture, or an OAuth host the optimizer\n" +
    "        is not configured for, must not leave a grey question mark.",
)

// ---------------------------------------------------------------------------
console.log("\nHover, everywhere, as one motion")
// ---------------------------------------------------------------------------

const css = read("app/globals.css")

check(
  "hover states are given a duration and a curve",
  (() => {
    // A Tailwind `hover:` utility does not animate anything. hover:bg-… on a
    // button with no transition class is a background that changes between two
    // frames, which is the entire "cheap and plastic" complaint.
    //
    // Both halves are read out of the RULE rather than out of the file. The
    // first version of this asked whether the file contained a cubic-bezier
    // anywhere, and passed happily with the hover curve replaced by `linear` —
    // because the same curve is also used by .msg-dots forty lines down.
    const property = /\[class\*="hover:"\]:not\(\[class\*="transition-none"\]\) \{\s*transition-property:[^}]*transform/.test(
      css,
    )
    const curve = css.match(
      /\[class\*="hover:"\]:not\(\[class\*="transition-none"\]\):not\(\[class\*="ease-"\]\) \{\s*transition-timing-function: ([^;]+);/,
    )
    return property && !!curve && /^cubic-bezier\(/.test(curve[1].trim())
  })(),
  "        app/globals.css",
)

check(
  "arriving is quicker than leaving",
  (() => {
    const enter = css.match(/\[class\*="hover:"\][^{]*:hover \{\s*transition-duration: (\d+)ms/)
    const leave = css.match(
      /\[class\*="hover:"\]:not\(\[class\*="transition-none"\]\):not\(\[class\*="duration-"\]\) \{\s*transition-duration: (\d+)ms/,
    )
    return !!enter && !!leave && Number(enter[1]) < Number(leave[1])
  })(),
  "        A control that snaps back the instant the pointer leaves looks like\n" +
    "        it was never really lit.",
)

check(
  "an element that states its own timing keeps it",
  (() => {
    // The slow zoom on a card photograph is a deliberate 500ms. This fills in
    // the silence where nothing was specified, which is the vast majority — it
    // does not overrule anybody who decided.
    return /:not\(\[class\*="duration-"\]\)/.test(css) && /:not\(\[class\*="ease-"\]\)/.test(css)
  })(),
  "        app/globals.css",
)

check(
  "and none of it applies where there is no pointer",
  (() => {
    // :hover fires on tap on a touch screen and lingers until the next one,
    // which the @media (hover: none) block above spends forty lines
    // suppressing. A quarter-second fade on a state that should not exist
    // there would undo that.
    const i = css.indexOf('[class*="hover:"]:not([class*="transition-none"]) {')
    const guard = css.lastIndexOf("@media (hover: hover) and (pointer: fine)", i)
    return i > 0 && guard > 0 && i - guard < 400
  })(),
  "        app/globals.css",
)

check(
  "the per-message menu exists only where there is no gesture for it",
  (() => {
    // A touch screen already has the gesture, everybody already knows it, and
    // it opens this exact sheet: press and hold a message. So on a phone the
    // dots are forty pieces of furniture running down the middle of a screen
    // whose entire content is the messages, offering a second door to a room
    // that already has one.
    //
    // A pointer is the case with no gesture — a mouse cannot press and hold —
    // which is where the button earns its place and where a hover exists to
    // reveal it.
    return (
      /\.msg-row:hover > \.msg-dots/.test(css) &&
      /\.msg-dots:focus-visible/.test(css) &&
      /@media \(hover: none\) \{\s*\.msg-dots \{\s*display: none;/.test(css)
    )
  })(),
  "        app/globals.css",
)

// ---------------------------------------------------------------------------
console.log("\nA sheet is a phone shape")
// ---------------------------------------------------------------------------

const sheet = code("components/ui/bottom-sheet.tsx")

check(
  "above 768px it is a centred dialog, not a panel glued to the bottom edge",
  (() => {
    // Every reason a sheet exists is a phone reason: the bottom edge is where a
    // thumb reaches, the handle is for a flick, 86dvh is because the top of a
    // phone is the status bar. On a 27-inch monitor none of those hold and what
    // is left is a 512px panel stuck to the bottom of a 2000px window.
    return (
      /useWideViewport\(\)/.test(sheet) &&
      /wide \? DIALOG_HIDDEN : SHEET_HIDDEN/.test(sheet) &&
      /items-center justify-center/.test(sheet)
    )
  })(),
  "        components/ui/bottom-sheet.tsx",
)

check(
  "the drag is not merely inert on a pointer — it is not attached",
  /onPointerDown=\{wide \? undefined : onPointerDown\}/.test(sheet),
  "        A mouse-down that starts a gesture a pointer can never finish is how\n" +
    "        a dialog ends up half-dismissed under a cursor that was selecting text.",
)

check(
  "and the grab handle is replaced by a control a pointer can use",
  /wide \? \(/.test(sheet) && /aria-label="Închide"/.test(sheet) && /data-sheet-handle/.test(sheet),
  "        components/ui/bottom-sheet.tsx",
)

check(
  "Escape closes it",
  /e\.key === "Escape"/.test(sheet),
  "        A phone has a back gesture and a scrim under a thumb. A keyboard has\n" +
    "        neither, and the actions sheet has no visible close control at all.",
)

check(
  "the dialog gets its own curve, not the sheet's spring",
  (() => {
    // A sheet's spring is front-loaded because it models an object thrown up
    // from an edge. A dialog does not travel, so the same curve reads as
    // something dropped rather than opened.
    return /const DIALOG_IN =/.test(sheet) && /const DIALOG_OUT_MS = \d+/.test(sheet) && /outMs/.test(sheet)
  })(),
  "        components/ui/bottom-sheet.tsx",
)

check(
  "a sheet row's hover is gated on there being a pointer, not on a width",
  /\[@media\(hover:hover\)\]:hover:/.test(sheet),
  "        `md:hover:` lights the row on tap on every tablet, which is the same\n" +
    "        mistake as shipping the sheet itself to a desktop.",
)

// ---------------------------------------------------------------------------
console.log("\nThe avatar in the corner of a thumbnail")
// ---------------------------------------------------------------------------

check(
  "the corner badge is one element, not an avatar inside a shrink-to-fit box",
  (() => {
    // THE OVAL. An absolutely-positioned <span> shrinks to fit its contents,
    // and its contents were an inline-block — which sits on a text baseline. So
    // the box was 19px wide and 19px PLUS the descender tall, `rounded-full`
    // resolved against two different numbers, and the white ring traced an egg.
    return (
      /size=\{19\}\s*\n\s*className="absolute -bottom-0\.5 -right-0\.5 ring-2 ring-white"/.test(deskList) &&
      !/<span className="absolute -bottom-0\.5 -right-0\.5[^"]*rounded-full/.test(deskList)
    )
  })(),
  "        components/messages/desktop-conversation-list.tsx",
)

// ---------------------------------------------------------------------------
console.log("\nSeen, and the column that never heard about it")
// ---------------------------------------------------------------------------

const threadLib = code("lib/messages/thread.ts")

check(
  "reading a thread tells the reader's own inbox, not only the sender's thread",
  (() => {
    // Marking read changes two screens. The sender's thread learned it; the
    // READER's conversation list did not, so the row you were at that moment
    // reading stayed washed violet with an unread dot on it.
    const block = threadLib.slice(threadLib.indexOf("announceThread(id, \"read\")"))
    return /announceInbox\(userId\)/.test(block.slice(0, 900))
  })(),
  "        lib/messages/thread.ts — and only when rows actually changed, or an\n" +
    "        open thread re-reading itself would ring it several times a minute.",
)

check(
  "the desktop column is live, like the phone's has always been",
  (() => {
    // It was written before the inbox channel existed and was left on a
    // twenty-second interval — which on a phone is nearly invisible and on a
    // desktop is a column sitting beside the conversation it describes,
    // disagreeing with it for up to twenty seconds.
    return /channel\(`inbox:\$\{viewerId\}`/.test(deskList) && /removeChannel\(channel\)/.test(deskList)
  })(),
  "        components/messages/desktop-conversation-list.tsx",
)

check(
  "and the conversation open beside it is never drawn as unread",
  /const unread = r\.unread > 0 && !isActive/.test(deskList),
  "        The server marks it read as the pane opens, but that is a round trip,\n" +
    "        and for that round trip the row contradicted the screen next to it.",
)

// ---------------------------------------------------------------------------
console.log("\nNotifications say things in one colour")
// ---------------------------------------------------------------------------

check(
  "no violet on a notification verb",
  (() => {
    // A third of the sentences in the feed were coloured for no reason a reader
    // could infer, a pixel away from the violet unread wash meaning something
    // else. The accepted offer keeps its emerald: it is the only row in the
    // list that means money is about to move.
    const view = code("lib/messages/notification-view.ts")
    return !/#7c3aed/.test(view) && /text-emerald-600/.test(view)
  })(),
  "        lib/messages/notification-view.ts",
)

// ---------------------------------------------------------------------------
console.log("\nAn empty photo slot looks empty")
// ---------------------------------------------------------------------------

const sellForm = code("components/sell/new-listing-form.tsx")

check(
  "the picker's empty tiles are dashed, not the solid hairline a filled card wears",
  /border-2 border-dashed/.test(sellForm),
  "        A solid border is what every FILLED card on this form has, so an empty\n" +
    "        slot drawn the same way reads as a broken card rather than a target.",
)

// ---------------------------------------------------------------------------
console.log("\nThe \"i\" beside a heading")

const tip = code("components/ui/info-tip.tsx")
// ---------------------------------------------------------------------------


check(
  "the bubble is always mounted, so it can fade in both directions",
  (() => {
    // It is opened by a HOVER. An unmounted element can only pop, which would
    // pop on every pass of the cursor.
    return !/\{open && </.test(tip) && /role="tooltip"/.test(tip)
  })(),
  "        components/ui/info-tip.tsx",
)

check(
  "and visibility is in the transition with a delay, or the fade never plays",
  /visibility 0s linear 200ms/.test(css) && /visibility 0s linear 0s/.test(css),
  "        A `visibility: hidden` applied at once cuts the exit short; applied\n" +
    "        never, the closed bubble stays hit-testable and readable to a screen\n" +
    "        reader.",
)

check(
  "the mark is always visible; the sentence is what hover reveals",
  (() => {
    // The first version of this faded the MARK up under the cursor, and that
    // was the wrong half to hide: a mark you cannot see is a mark you cannot
    // know to point at, and the same movement that revealed it also opened it —
    // so there was never a state where you could see that help existed and
    // choose whether to read it.
    return (
      /\.info-tip-mark \{\s*opacity: 1;/.test(css) &&
      !/\.info-tip-mark \{\s*opacity: 0;/.test(css) &&
      /onPointerEnter=/.test(tip) &&
      /setOpen\(true\)/.test(tip)
    )
  })(),
  "        app/globals.css, components/ui/info-tip.tsx",
)

check(
  "and the bubble is drawn where nothing can clip it",
  (() => {
    // It was an absolutely-positioned child and it was CUT OFF along the edge
    // of the row it sat in. Everything above it is a candidate: the form's rows
    // clip their own backgrounds to their corners, the sheet scrolls inside an
    // overflow-hidden box, cards clip by design. Fixing that one container at a
    // time means finding every container, forever.
    return (
      /createPortal\(/.test(tip) &&
      /getBoundingClientRect\(\)/.test(tip) &&
      /position: fixed;/.test(css.slice(css.indexOf(".info-tip-bubble {"), css.indexOf(".info-tip-arrow")))
    )
  })(),
  "        components/ui/info-tip.tsx",
)

check(
  "and it flips above the mark rather than off the bottom of the window",
  (() => {
    // The DECISION has to consult the viewport height, not merely mention the
    // upward coordinate somewhere. The first version of this asked only for
    // `const below =` and for the upward expression, both of which survive
    // `const below = true` — because the upward coordinate still appears in the
    // `top` it then never picks.
    return (
      /const below = [\s\S]{0,160}?<= vh/.test(tip) &&
      /top: below \? r\.bottom \+ GAP : r\.top - GAP - h/.test(tip)
    )
  })(),
  "        components/ui/info-tip.tsx",
)

check(
  "a tap elsewhere closes it",
  (() => {
    // Hover handles this for free on a pointer. On touch there is no "untap",
    // so without this the bubble sits over whatever the person tries to reach
    // next and the form appears stuck.
    return /addEventListener\("pointerdown", away\)/.test(tip)
  })(),
  "        components/ui/info-tip.tsx",
)

// ---------------------------------------------------------------------------
console.log("\nThe header does not blank itself")
// ---------------------------------------------------------------------------

const platformHeader = code("components/platform/platform-header-client.tsx")
const conditional = code("components/marketing/conditional-header.tsx")

check(
  "the header never suspends, so there is no fallback to flash",
  (() => {
    // useSearchParams() opts its component into Suspense, and the boundary above
    // this one fell back to a BARE BLACK BAR — no logo, no search, no icons, no
    // avatar. Every navigation that re-suspended blanked the whole header and
    // filled it back in, which is the flash on pressing Vinde acum. The button
    // was never involved.
    return (
      !/useSearchParams/.test(platformHeader) &&
      /useUrlSearchParams\(\)/.test(platformHeader) &&
      !/<Suspense/.test(conditional)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "and a query-only navigation still updates it",
  (() => {
    // `window.location.search` is a snapshot. A new PATH re-renders through
    // usePathname and back/forward fires popstate, but ?category=a becoming
    // ?category=b fires nothing at all — the App Router calls history.pushState
    // and the History API has no event for a programmatic push.
    const hook = code("lib/use-url-search-params.ts")
    return (
      /popstate/.test(hook) &&
      /usePathname\(\)/.test(hook) &&
      /history\[name\]/.test(hook) &&
      /pushState", "replaceState/.test(hook)
    )
  })(),
  "        lib/use-url-search-params.ts",
)

// ---------------------------------------------------------------------------
console.log("\nOne search, and it is the marketplace's")
// ---------------------------------------------------------------------------

check(
  "the desktop header opens the real search, not the digital-goods one",
  (() => {
    // What was there predated the marketplace entirely: nine Design/Development/
    // Marketing chips, results linking to /p/ pages, dollar prices, "Product by",
    // English copy on a Romanian site. A different product's search, left running.
    return (
      /<MobileSearchOverlay[\s/>]/.test(platformHeader) &&
      !/Start typing to search products/.test(platformHeader) &&
      !/Product by /.test(platformHeader)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "and that search has a desktop shape rather than a desktop copy",
  (() => {
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    // `md:hidden` was why a desktop could not reach any of it. One component,
    // two shapes — the alternative is two implementations of what search means.
    return !/md:hidden fixed inset-0/.test(overlay) && /anchored \? /.test(overlay)
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "there is ONE search field, it is in the bar, and it never moves",
  (() => {
    // Two earlier versions were wrong in opposite ways. A centred modal with
    // its own field put two search boxes on screen at once. Hiding the header's
    // while that modal was open was worse: the thing you clicked vanished from
    // where you clicked it and a different one appeared lower down.
    //
    // Anchored, the header's input IS the search field and the panel is a child
    // of its container — so it lines up at every width with nothing measured,
    // and the panel draws no field of its own.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return (
      // The header draws the field and owns what is in it…
      /<input\b[\s\S]{0,600}?value=\{query\}/.test(platformHeader) &&
      /onQueryChange=\{setQuery\}/.test(platformHeader) &&
      /\banchored\b/.test(platformHeader) &&
      // …the panel is measured against that field and drawn in a portal, so
      // the header's stacking context and any ancestor overflow are out of the
      // picture entirely…
      /anchorTo=\{searchBoxRef\}/.test(platformHeader) &&
      /createPortal\(layer, document\.body\)/.test(overlay) &&
      /getBoundingClientRect\(\)/.test(overlay) &&
      // …and draws no field of its own when it does.
      /\{!anchored && \(/.test(overlay)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "the category strip is centred in the white, lip included",
  (() => {
    /**
     * Three values were tried here and all three were guesses at the wrong
     * number, because the white above these labels does not start where the
     * nav starts: a separate `bg-black h-[16px]` block with a
     * `rounded-t-[16px]` white overlay sits above it, drawing the concave
     * corner where the black bar meets the white. Its pixels are white too, so
     * a `pt` here lands on TOP of them — pt-2.5 read as 30 above against 14
     * below.
     *
     * FOUR NUMBERS, ALL THE SAME. The lip's height, the lip's radius, the
     * desktop row's bottom padding and the mobile rail's. The bar came down
     * from 20 to 16 and every one of them had to come with it: 16 on one side
     * only is dead white under the labels, and a 20px radius in a 16px box is
     * a curve with its bottom cut off.
     *
     * The lip is the top padding. This guard fails if somebody reintroduces a
     * pt, or changes the lip without changing the padding that matches it.
     */
    const header = code("components/platform/platform-header-client.tsx")
    const lip = /bg-black h-\[16px\]"/.test(header) && /bg-white rounded-t-\[16px\]/.test(header)
    const strip = /gap-7 whitespace-nowrap pb-4 pt-0 text-\[14\.5px\]/.test(header)
    const rail = /md:hidden px-0 pt-0 pb-4 overflow-x-auto/.test(header)
    return lip && strip && rail
  })(),
  "        components/platform/platform-header-client.tsx",
)

console.log("\nThe header only offers what an account has")

check(
  "the heart is signed-in only, and the bag is not",
  (() => {
    // THE WISHLIST. To a stranger it is an icon leading to an empty room — and
    // worse than empty, because it carried a COUNT: the guest list hangs off a
    // cookie, so a first-time visitor arrived at a black bar advertising that
    // they had two saved items, on a site they had never used. A number about
    // you, on a page that has never met you. Both the desktop icon and the
    // phone one.
    //
    // THE BAG STAYS. They looked like the same case and are not: a wishlist is
    // a record of what you have done, while a basket is a step in buying
    // something — and buying does not require an account here, the cart works
    // signed out and the sign-in happens at checkout. Hiding it would be hiding
    // the only place a guest's items are, from the guest whose items they are.
    const header = code("components/platform/platform-header-client.tsx")
    const wish = header.indexOf("aria-label={t(\"wishlist\")}")
    const bag = header.indexOf("aria-label={t(\"bag\")}")
    const before = (at: number) => header.slice(Math.max(0, at - 700), at)
    return (
      wish > 0 &&
      bag > 0 &&
      /\{user && \(/.test(before(wish)) &&
      !/\{user && \(/.test(before(bag)) &&
      // And the phone icon, which is a separate element in the mobile row.
      /\{user && \(\s*\n\s*<Link\s*\n\s*href=\{getCanonicalOrRelativePath\(wishlistHref\)\}/.test(header)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "the categories control is a glyph, and the field gave back ten percent",
  (() => {
    // It read "Categories" in English on a Romanian marketplace, immediately
    // left of a field whose placeholder is "Caută orice" — one bar, two
    // languages. Translating it was the obvious repair and the wrong one:
    // "Categorii" is nine characters of chrome beside a hamburger that already
    // means exactly that, and it was eating width the search field could use.
    //
    // The field then gave some back anyway. At `max-w-xl` (576) it ran most of
    // the way between the logo and the icons on a 1400px measure, which made
    // the header read as a search page with some navigation attached.
    const header = code("components/platform/platform-header-client.tsx")
    const button = header.slice(header.indexOf("setCategoriesDropdownOpen(!categoriesDropdownOpen)"))
    return (
      /aria-label="Categorii"/.test(button.slice(0, 900)) &&
      !/<span>Categories<\/span>/.test(header) &&
      /flex h-10 w-10 items-center justify-center rounded-lg/.test(button.slice(0, 900)) &&
      /relative hidden md:flex flex-1 max-w-\[518px\] mx-4/.test(header) &&
      !/max-w-xl mx-4/.test(header)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "people search starts from profiles, so it can find somebody who has never sold",
  (() => {
    // It hydrated from `creators`, and a creators row is a SELLER record —
    // written by the seller onboarding and by /api/listings on somebody's first
    // listing. Anybody who has never listed anything does not have one, which
    // on a second-hand marketplace is most accounts: every buyer, every new
    // sign-up, everybody who came to browse. They matched the name lookup, had
    // no row to hydrate, and vanished.
    //
    // Then `if (hasCounts && productsCount < 1) continue` removed the rest.
    // Correct for a directory of shops; wrong for a tab called PEOPLE.
    const route = code("app/api/v2/search/people/route.ts")
    return (
      /from\("profiles"\)[\s\S]{0,200}?\.or\(`username\.ilike/.test(route) &&
      /\.not\("username", "is", null\)/.test(route) &&
      // The seller record is a JOIN for decoration now, not the thing searched.
      !/if \(hasCounts && productsCount < 1\) continue/.test(route) &&
      // Batched over the returned page — never one query per row.
      /\.in\("creator_id", \[\.\.\.creatorToUser\.keys\(\)\]\)/.test(route)
    )
  })(),
  "        app/api/v2/search/people/route.ts",
)

check(
  "one letter is enough to search, and the panel never empties while you type",
  (() => {
    // It was `trimmed.length < 2` in two places, so typing the first letter of
    // somebody's name cleared both lists and drew the "search members by name"
    // hint — the panel telling you to do the thing you were visibly in the
    // middle of doing. Two characters is a sensible floor for full text over a
    // million documents; it is the wrong floor for a name lookup over a
    // marketplace's members.
    //
    // And nothing is cleared between keystrokes any more. The old effect emptied
    // both arrays and set `loading` BEFORE the debounce had elapsed, so a single
    // fast word flashed hint → spinner → results. The only thing that empties
    // the panel now is emptying the field.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return (
      /if \(trimmed\.length < 1\) \{/.test(overlay) &&
      /if \(!trimmed\) \{\s*\n\s*setTitles\(\[\]\)/.test(overlay) &&
      !/trimmed\.length < 2/.test(overlay)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "an answer already given comes back on the same frame, with no spinner flicker",
  (() => {
    // Search is the one surface where the same request is made over and over by
    // definition — "jordan" is typed as j, jo, jor, jord — and half of it is
    // then deleted and retyped. A session-lived cache means BACKSPACE IS FREE,
    // which is most of what "typing feels smooth" means in a search box, and a
    // hit skips the debounce entirely.
    //
    // The spinner is armed on a timer rather than on the keystroke: a response
    // that returns in 90ms with a spinner shown at 0ms is a spinner nobody can
    // read and everybody sees flicker.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return (
      /const searchCache = new Map<string, \{ titles: string\[\]; people: Person\[\] \}>\(\)/.test(overlay) &&
      /const hit = searchCache\.get\(key\)/.test(overlay) &&
      /function rememberSearch/.test(overlay) &&
      // Only a COMPLETE answer is cached — half of one would be served in full
      // next time and the missing half never fetched again.
      /if \(nextTitles && nextPeople\) rememberSearch\(key, nextTitles, nextPeople\)/.test(overlay) &&
      /const spinner = setTimeout\(\(\) => setPeopleLoading\(true\), 260\)/.test(overlay) &&
      // And the debounce is short enough that it is not itself the wait.
      /\}, 120\)/.test(overlay)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "eight faces in a dropdown are eight thumbnails, not eight camera photographs",
  (() => {
    // A bare `<img src={avatar}>` downloads WHAT WAS UPLOADED: two or three
    // megabytes, three thousand pixels across, decoded in full and painted into
    // a circle forty-four pixels wide — eight of them, fetched the moment
    // somebody types a letter, on the surface whose whole job is to answer
    // before they finish typing.
    //
    // And they arrive staggered rather than in one frame: eight rows appearing
    // together is a block of text; the same eight 22ms apart is a list filling
    // in. Capped, so the last is never more than a tenth of a second behind the
    // first.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    const rowSrc = overlay.slice(overlay.indexOf("function PersonRow"))
    const listSrc = overlay.slice(overlay.indexOf("function PeopleTab"), overlay.indexOf("function PersonRow"))
    return (
      /<AvatarPhoto url=\{avatar\} size=\{44\}/.test(rowSrc) &&
      !/<img/.test(rowSrc) &&
      !/loading="lazy"/.test(rowSrc) &&
      /animationDelay: `\$\{Math\.min\(i, 4\) \* 22\}ms`/.test(listSrc) &&
      /animate-in fade-in-0 slide-in-from-bottom-1/.test(listSrc)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "the desktop field types its suggestions, the same way the phone does",
  (() => {
    // The phone has had the typing placeholder since it shipped; the desktop had
    // a static "Caută orice", which is the same field saying less on the surface
    // with more room to say it. A search box that shows what people actually
    // search for is the cheapest onboarding a marketplace has — it answers "what
    // is on here" before anybody has typed anything.
    //
    // It cannot be the `placeholder` attribute: animating one per character
    // means rewriting the attribute every frame. So the attribute is empty, the
    // overlay is a sibling, and `aria-label` still carries the field's name.
    const header = code("components/platform/platform-header-client.tsx")
    return (
      /<AnimatedSearchPlaceholder\s*\n\s*active=\{!query && !searchModalOpen\}/.test(header) &&
      /placeholder=""/.test(header) &&
      /aria-label=\{t\("search_placeholder"\)\}/.test(header) &&
      // A click landing on the placeholder text instead of the field is the one
      // way an overlay like this is worse than the attribute it replaces.
      /pointer-events-none absolute left-11 right-11/.test(header)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "a face resolves out of the grey, and only pulses if it is actually slow",
  (() => {
    // Eight avatars requested the instant somebody types a letter arrive over
    // the network in whatever order they arrive, and each one popped into a flat
    // grey circle at full opacity the moment its bytes landed — eight
    // independent pops, which is the "glitchy" in "the avatars are hard to load
    // and glitch".
    //
    // The fade is unconditional; the pulse waits. A skeleton shown immediately
    // is a skeleton on every CACHED avatar — visible for one frame, which is a
    // flicker rather than a loading state.
    const avatar = code("components/ui/initial-avatar.tsx")
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return (
      /const SKELETON_AFTER_MS = 240/.test(avatar) &&
      /setTimeout\(\(\) => setSlow\(true\), SKELETON_AFTER_MS\)/.test(avatar) &&
      /skeleton && !loaded && "opacity-0"/.test(avatar) &&
      /skeleton && "relative transition-opacity duration-\[260ms\] ease-out"/.test(avatar) &&
      /slow && "animate-pulse"/.test(avatar) &&
      // Opt-in, so the four screens that already paint their own neutral are
      // untouched — and turned on where the eight-at-once case actually is.
      /skeleton = false/.test(avatar) &&
      /<AvatarPhoto url=\{avatar\} size=\{44\} skeleton/.test(overlay)
    )
  })(),
  "        components/ui/initial-avatar.tsx",
)

check(
  "the category bar pins under the header and gets out of the way going down",
  (() => {
    // Six departments pinned to the top of the screen for the whole length of a
    // marketplace is six words of navigation taking a slice off every page —
    // and you are scrolling because you want to see LISTINGS. Scroll up and it
    // is back before the gesture is finished, which is the shape every app in
    // this category uses and the reason it works: the moment you reverse is the
    // moment you are looking for a way somewhere else.
    //
    // `sticky`, not `fixed`: sticky keeps the element's space where it really is
    // in the document, so hiding it can never open a gap in the middle of a
    // page. And `--platform-header-h` rather than a number, so the two read as
    // one piece of chrome however tall the header happens to be.
    const header = code("components/platform/platform-header-client.tsx")
    const css = read("app/globals.css")
    return (
      /className="platform-subbar sticky z-\[35\]"/.test(header) &&
      /data-hidden=\{subbarHidden \? "true" : "false"\}/.test(header) &&
      /style=\{\{ top: "var\(--platform-header-h, 0px\)" \}\}/.test(header) &&
      // AND IT MEASURES ITSELF. Sticky keeps the element's space in the
      // document, and this bar's space is at the very top of the page — so
      // hiding it before the page has moved by its own height shows the band it
      // vacated: white, bar-height, under a black header, above a #f5f5f5 page.
      // The floor is the measured height, not a number somebody wrote down
      // while the bar was 20px taller than it is now.
      /const subbarHidden = useHideOnScrollDown\(true, subbarH\)/.test(header) &&
      /ro\.observe\(el\)/.test(header) &&
      /setSubbarH\(Math\.round\(el\.getBoundingClientRect\(\)\.height\)\)/.test(header) &&
      /<div\s*\n\s*ref=\{subbarRef\}/.test(header) &&
      // Transform only — a translate is composited, so a bar leaving costs no
      // layout on the frame a grid of photographs is scrolling past it.
      /\.platform-subbar\[data-hidden="true"\] \{\s*\n[\s\S]{0,240}?transform: translate3d\(0, calc\(-100% - 2px\), 0\)/.test(css) &&
      // Leaving is quicker than arriving: it is answering a scroll you have
      // already made, while the other is a surface you are about to read.
      /\.platform-subbar \{[\s\S]{0,200}?transition: transform 300ms/.test(css) &&
      /transition: transform 220ms/.test(css)
    )
  })(),
  "        components/platform/platform-header-client.tsx, app/globals.css",
)

check(
  "and it cannot flicker, cost a frame, or hide when there is nowhere to scroll",
  (() => {
    // The three ways this pattern is normally shipped broken:
    //
    //   A naïve version flips whenever the sign of the delta changes, so a
    //   one-pixel jitter — a trackpad settling, a rubber-band easing back, the
    //   browser correcting after an image loads — snaps the bar in and out while
    //   nobody is scrolling. The dead band is measured from the last DECISION,
    //   not the last event, which makes it a hysteresis rather than a delay.
    //
    //   A handler that works runs on every frame of every flick. This one reads
    //   `scrollY` and returns; the comparison is once per animation frame at
    //   most and the state is only SET when the answer changes.
    //
    //   And iOS reports positions past the end of the document during an
    //   overscroll, then reports them coming back — which reads as "scrolled up"
    //   and pops the bar out during a bounce nobody asked anything of.
    const hook = code("lib/marketplace/use-hide-on-scroll-down.ts")
    return (
      /const THRESHOLD = 12/.test(hook) &&
      /if \(Math\.abs\(delta\) < THRESHOLD\) return/.test(hook) &&
      /addEventListener\("scroll", onScroll, \{ passive: true \}\)/.test(hook) &&
      /frame = requestAnimationFrame\(read\)/.test(hook) &&
      /if \(frame\) return/.test(hook) &&
      /const max = Math\.max\(0, document\.documentElement\.scrollHeight - window\.innerHeight\)/.test(hook) &&
      // The floor is raisable and can only go up: a caller passing 0 — a sticky
      // bar that has not measured itself yet — still gets the 24px minimum.
      /const floor = Math\.max\(REVEAL_ABOVE, revealAbove\)/.test(hook) &&
      /if \(y <= floor\)/.test(hook) &&
      /\}, \[enabled, revealAbove\]\)/.test(hook)
    )
  })(),
  "        lib/marketplace/use-hide-on-scroll-down.ts",
)

check(
  "and a result opens the marketplace profile, not the digital storefront",
  (() => {
    // /u/ is the store-builder storefront; /member/ is the marketplace profile
    // — the avatar, the listings grid, the Salvate and Evaluări tabs, the
    // score. Somebody who typed a name into a marketplace search expects the
    // second, and on an account that never went through seller onboarding the
    // first is an empty shop.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    const rowSrc = overlay.slice(overlay.indexOf("function PersonRow"))
    return (
      /href=\{username \? `\/member\/\$\{encodeURIComponent\(username\)\}` : "#"\}/.test(rowSrc) &&
      !/`\/u\/\$\{username\}`/.test(rowSrc) &&
      // And it carries the same score line the profile and the listing do.
      /<SellerScore/.test(rowSrc)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "and the two buttons in the bar are buttons, not lozenges",
  (() => {
    // A fully rounded button reads as a chip — something to toggle or dismiss —
    // and Vinde is the primary action of the whole marketplace. Eight pixels is
    // what every other real control on this site already uses, and it stops the
    // row being two lozenges beside a rectangular search field.
    const header = code("components/platform/platform-header-client.tsx")
    return (
      /className="h-10 rounded-lg px-5 text-\[14\.5px\] font-semibold bg-\[#7c3aed\]/.test(header) &&
      /inline-flex h-10 items-center justify-center rounded-lg border border-white\/15 bg-neutral-800/.test(header)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "the search panel is Articole and Persoane — Categorii is out, not deleted",
  (() => {
    // A tab earns its place by answering a question the others cannot. Articole
    // and Persoane do. Categorii did not: the rail sits directly under this
    // panel, the department menu is one press away, and every card carries its
    // own — so a third of the width of a search panel went on a list you can see
    // behind it.
    //
    // TEMPORARY, and the code says so: CategoriesTab and the "categories" member
    // of SearchTab both stay, so putting the row back is one line rather than a
    // rebuild.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    const tabs = overlay.slice(overlay.indexOf("const TABS"), overlay.indexOf("const POPULAR_EXPANSIONS"))
    return (
      (tabs.match(/mfeed\.tab_/g) ?? []).length === 2 &&
      /mfeed\.tab_items/.test(tabs) &&
      /mfeed\.tab_people/.test(tabs) &&
      !/mfeed\.tab_categories/.test(tabs) &&
      // Kept, so this is a decision rather than a demolition.
      /function CategoriesTab/.test(overlay) &&
      /type SearchTab = "items" \| "categories" \| "people"/.test(overlay)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "the search tabs are ruled apart; the category rail is not",
  (() => {
    // Articole / Categorii / Persoane are three different KINDS of result — a
    // person is not a narrower article — so a rule between them says where one
    // choice ends. The six category labels are one flat list of filters over
    // the same thing, and ruling between those turned a rail into a navbar.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    const header = code("components/platform/platform-header-client.tsx")
    const strip = header.slice(header.indexOf("DEFAULT_CATEGORIES.map"), header.indexOf("DEFAULT_CATEGORIES.map") + 1400)
    return (
      /my-2 w-px shrink-0 self-center bg-neutral-200/.test(overlay) &&
      /\{i > 0 && <span aria-hidden/.test(overlay) &&
      !/w-px/.test(strip)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "the header's field is not reset by its own re-renders",
  (() => {
    /**
     * THE BUG THAT MADE SEARCH LOOK ENTIRELY BROKEN.
     *
     *   useEffect(() => { setQuery(searchParams.get("q") ?? "") }, [searchParams])
     *
     * `searchParams` is an OBJECT — a new one on re-render — so the dependency
     * is an identity rather than a value and the effect fires on a URL that
     * never changed. On the home page `q` is absent, so every run set the field
     * back to "".
     *
     * And the field's own onChange calls setSearchModalOpen(true), which
     * re-renders the header. So the first character anybody typed went: query
     * = "n", panel opens, re-render, effect runs, query = "". The field stayed
     * empty and the panel stayed on its empty state.
     *
     * The dependency must be the STRING. Anything else is the same bug.
     */
    const header = code("components/platform/platform-header-client.tsx")
    return (
      !/\}, \[searchParams\]\)/.test(header) &&
      /const urlQuery = searchParams\.get\("q"\) \?\? ""/.test(header) &&
      /\}, \[urlQuery\]\)/.test(header) &&
      // And it still seeds from a real navigation to a different query.
      /lastUrlQuery\.current = urlQuery/.test(header)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "the dim is a SIBLING of the panel, and below it",
  (() => {
    // THE BUG THIS SHIPPED AS. The scrim was `fixed inset-0 z-[94]` INSIDE the
    // panel's own `fixed z-[95]` wrapper — and a positioned element with a
    // z-index is a stacking context, so those numbers were compared against
    // each other rather than against the page. The scrim won: a 25% black wash
    // painted OVER the search panel, the whole box came up grey, and every
    // click aimed at a tab or a result landed on the scrim and closed it.
    //
    // Two things have to hold, and asserting only one of them is what let it
    // through: the scrim must not live inside the panel's wrapper, AND its
    // z-index must be the lower of the two.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    const bodyBlock = overlay.slice(overlay.indexOf("const body = ("), overlay.indexOf("const layer ="))
    const layerBlock = overlay.slice(overlay.indexOf("const layer ="))
    const scrimZ = /bg-black\/25/.test(layerBlock)
      ? Number(/z-\[(\d+)\][^"]*bg-black\/25/.exec(layerBlock)?.[1] ?? NaN)
      : NaN
    const panelZ = Number(/anchored\s*\?\s*"fixed z-\[(\d+)\]"/.exec(bodyBlock)?.[1] ?? NaN)
    // AND UNDER THE SITE HEADER (z-40), which is the second thing this got
    // wrong: at 94 the scrim covered the search field itself, so the box you
    // were typing in was dimmed, unreadable to a text selection, and a click on
    // it landed on the scrim and closed the panel.
    return (
      !/bg-black\/25/.test(bodyBlock) &&
      Number.isFinite(scrimZ) &&
      Number.isFinite(panelZ) &&
      scrimZ < panelZ &&
      scrimZ < 40
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "the panel is sized by what is in it, not by the window",
  (() => {
    // The children are laid out for a phone, where the panel is the screen:
    // `flex-1` on the scroller and a 40vh floor under the empty state. Put that
    // in a box with a max-height and the ceiling becomes a target — the panel
    // grew to most of the window to hold an icon and one line of grey text.
    // Both halves are needed; either alone still leaves a viewport-sized panel.
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    return (
      /h-fit max-h-\[min\(/.test(overlay) &&
      /anchored && "flex-initial"/.test(overlay) &&
      /\.search-anchored \.search-empty \{\s*min-height: 0;/.test(css)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx, app/globals.css",
)

// ---------------------------------------------------------------------------
console.log("\nLoading that does not announce itself")
// ---------------------------------------------------------------------------

check(
  "an avatar with a photograph coming waits behind a shimmer, not a coloured letter",
  (() => {
    // The letter used to sit under every avatar. On a cold load that is a
    // saturated violet disc with an initial in it, held for the length of the
    // network, replaced in ONE FRAME by a face: two confident and completely
    // different pictures of the same person, which reads as the app changing its
    // mind rather than as something loading.
    const av = code("components/ui/initial-avatar.tsx")
    return (
      /const waiting = !!url && !broken && !loaded/.test(av) &&
      /waiting && "animate-pulse/.test(av) &&
      /loaded \? "opacity-100" : "opacity-0"/.test(av)
    )
  })(),
  "        components/ui/initial-avatar.tsx",
)

check(
  "and a cached photograph does not leave the shimmer up forever",
  (() => {
    // A cached image can finish loading BEFORE React attaches onLoad, and then
    // the event never fires. `complete` is the browser's own record of that.
    const av = code("components/ui/initial-avatar.tsx")
    return /node\?\.complete\) setLoaded\(true\)/.test(av)
  })(),
  "        components/ui/initial-avatar.tsx",
)

check(
  "a face is fetched before the page's photographs, not behind them",
  /fetchPriority="high"/.test(code("components/ui/initial-avatar.tsx")),
  "        A 2KB avatar queued behind eight listing photographs waits for all of\n" +
    "        them, and it is the thing being waited for.",
)

// ---------------------------------------------------------------------------
console.log("\nThe typed placeholder has a space in it")
// ---------------------------------------------------------------------------

check(
  "the gap before the quote is a layout fact, not a character",
  (() => {
    // `<span>Caută </span><span>„…"</span>` renders as `Caută„…"`: HTML collapses
    // whitespace at the end of an inline box before the next one. The string was
    // correct at every call site and the DOM ate it.
    const ph = code("components/explore/animated-search-placeholder.tsx")
    return /gap-\[0\.3em\]/.test(ph) && !/prefix = "Search for ",/.test(ph)
  })(),
  "        components/explore/animated-search-placeholder.tsx",
)

// ---------------------------------------------------------------------------
console.log("\nThe price row does not strobe under the field")
// ---------------------------------------------------------------------------

check(
  "the buyer-pays row is not rebuilt on every keystroke",
  (() => {
    // It was keyed on `priceCents` so the entrance would replay when the number
    // changed. What "changed" means while somebody types a price is EVERY
    // KEYSTROKE — so React threw the row away and built a new one per
    // character, and the fade-and-rise ran from its first frame each time.
    // Typing "130" played it three times; holding a key played it continuously.
    return (
      /price-total-in/.test(sellForm) &&
      !/key=\{priceCents\}/.test(sellForm) &&
      /tabular-nums/.test(sellForm)
    )
  })(),
  "        components/sell/new-listing-form.tsx",
)

check(
  "and it names both numbers, the typed one first",
  (() => {
    // The seller's own figure has to lead. A line that opens with the buyer's
    // total reads as the price going up; the same two numbers the other way
    // round read as protection being added to theirs.
    //
    // BOTH still have to be there. The row got quieter, not shorter by a number:
    // the buyer's total is the one that surprises somebody later on the listing
    // page, and a form that drops it is a form that lets them find out
    // afterwards.
    const line = sellForm.slice(sellForm.indexOf("price-total-in "))
    return (
      line.indexOf("formatPlatformMoney(priceCents)") <
        line.indexOf("formatPlatformMoney(buyerPaysCents(priceCents))") &&
      /Primești/.test(line) &&
      /cumpărătorul vede/.test(line)
    )
  })(),
  "        components/sell/new-listing-form.tsx",
)

check(
  "it is a caption under the field, not a panel shouting at it",
  (() => {
    // A tinted, full-width, two-and-a-half-line box under a field somebody is
    // still typing into was the loudest thing in the Preț section — louder than
    // the price field. A row that shouts reads as a warning, and this is not
    // one: nothing has gone wrong and nothing needs deciding. It restates the
    // number just typed and names the one a buyer will see, which is a caption.
    //
    // The whole element, from its opening tag to the end of the section — the
    // class attribute is where the marker is, and slicing from there would start
    // the window after `<button` and its handler.
    const at = sellForm.indexOf("price-total-in ")
    const line = sellForm.slice(sellForm.lastIndexOf("<", at), sellForm.indexOf("</section>", at))
    return (
      // No tinted ground, no chevron pointing at itself, no full-width block.
      !/bg-\[#7c3aed\]\/\[0\.07\]/.test(line) &&
      !/<ChevronRight/.test(line) &&
      !/\bw-full\b/.test(line) &&
      // What says it is pressable instead: the text darkens under a finger.
      /active:text-neutral-800/.test(line) &&
      // And it is smaller than the row it replaced, which was 12.5px.
      /text-\[12px\]/.test(line)
    )
  })(),
  "        components/sell/new-listing-form.tsx",
)

check(
  "a listing cannot be published below the floor, and the floor is on screen",
  (() => {
    // Stated rather than enforced at the keystroke: a field that refuses the
    // "1" you type on the way to "15" is a field that fights you.
    //
    // The floor is NOT printed in the label. A rule stated permanently above a
    // field almost nobody was going to break is a condition of using the form;
    // the same sentence under the field, once a number is below the line, is an
    // answer to what was just typed.
    return (
      /priceCents < MIN_LISTING_PRICE_CENTS/.test(sellForm) &&
      /Prețul minim pentru un anunț este/.test(sellForm) &&
      !/minimum \{formatPlatformMoney\(MIN_LISTING_PRICE_CENTS\)\}/.test(sellForm)
    )
  })(),
  "        components/sell/new-listing-form.tsx",
)

check(
  "the info mark is on the photos and the price, and not on the title",
  (() => {
    const titleLabel = sellForm.slice(sellForm.indexOf(">Titlu<") - 400, sellForm.indexOf(">Titlu<") + 40)
    return !/InfoTip/.test(titleLabel) && /Fotografii/.test(sellForm) && /info="Prima fotografie/.test(sellForm)
  })(),
  "        components/sell/new-listing-form.tsx",
)

check(
  "the badge is a control, and it opens the app's one explanation of the fee",
  (() => {
    // The explanation is NOT written on the sell form. It opens the same
    // "Protecția cumpărătorului" screen the feed, the listing page and the
    // wishlist open from their own shields — a full-screen subpage on a phone,
    // a centred dialog on a desktop. One explanation, in one place, reached the
    // same way from every surface that quotes the fee.
    //
    // The shield keeps the brand violet even though the row around it is now a
    // grey caption: it is the mark that says there is something behind this
    // line, and it is the same mark on the same errand everywhere else in the
    // product.
    //
    // From the element's OPENING TAG, not from its class attribute. The class
    // is where the marker is, and slicing from there starts the window after
    // `<button` and its onClick — so the first version of this reported both
    // missing while they were sitting two lines above the slice.
    const at = sellForm.indexOf("price-total-in ")
    const line = sellForm.slice(sellForm.lastIndexOf("<", at), sellForm.indexOf("</section>", at))
    return (
      /<button/.test(line) &&
      /onClick=\{\(\) => openBuyerProtection\(\)\}/.test(line) &&
      /<ShieldCheck[\s\S]{0,160}?text-\[#7c3aed\]/.test(line) &&
      !/<InfoTip/.test(line)
    )
  })(),
  "        components/sell/new-listing-form.tsx",
)

check(
  "and that explanation names both halves of the fee",
  (() => {
    // The page said "5% din prețul articolului, plus 4 lei" while the code
    // charged a flat tier for a while. Copy and arithmetic have to agree, and
    // the fixed part is graduated now, so the sentence has to say so.
    const prot = code("components/marketplace/buyer-protection.tsx")
    return /5% din prețul articolului, plus o sumă fixă/.test(prot) && /4 lei de la 15 lei în sus/.test(prot)
  })(),
  "        components/marketplace/buyer-protection.tsx",
)

check(
  "and the photos mark is gone where there is no hover to open it with",
  (() => {
    // The card already says the same thing in plain text directly under the
    // heading, which on a phone is the full screen width.
    return /infoOnTouch=\{false\}/.test(sellForm) && /@media \(hover: none\) \{\s*\.pointer-only-tip \{\s*display: none;/.test(css)
  })(),
  "        components/sell/new-listing-form.tsx, app/globals.css",
)

console.log("\nThe chrome a phone browser gets")

check(
  "the departments are pictures of what is in them",
  (() => {
    // Sparkles / ShoppingBag / Gift / Music / Lightbulb against Femei, Bărbați,
    // Copii, Divertisment and Hobbyuri — a wand, a carrier bag, a present, a
    // quaver and a bulb. Four of those five are what a template reaches for
    // when nobody has decided what the row means: a sparkle stands for
    // "special", a gift for "nice", a bulb for "idea". None of them is a thing
    // anybody can buy here, so the menu was five words with five decorations
    // beside them and the decorations were being skipped.
    //
    // What is pinned is the ABSENCE of those five, not the presence of the
    // particular replacements — a better record than Disc3 is a change this
    // guard should not have an opinion about, while reaching back for Sparkles
    // is the mistake it exists to catch.
    //
    // AND THERE IS ONE MAP NOW, NOT ONE PER SURFACE. The desktop header defined
    // these privately, which was fine while it was the only place that offered
    // departments — the phone's menu, its rail and the search tiles were still
    // drawing the OLD taxonomy with the OLD icons. Two navigation taxonomies is
    // how one of them ends up pointing at an empty feed.
    const nav = code("lib/marketplace/department-nav.ts")
    const hdr = code("components/platform/platform-header-client.tsx")
    const map = nav.slice(nav.indexOf("const DEPARTMENT_ICONS"), nav.indexOf("export type DepartmentNavItem"))
    return (
      /women: Dress/.test(map) &&
      /men: Shirt/.test(map) &&
      !/Sparkles|ShoppingBag|Gift|Lightbulb/.test(map) &&
      // Derived from the SELL FORM's taxonomy, so a department added there
      // appears everywhere without anybody remembering to come here.
      /DEPARTMENT_NAV: DepartmentNavItem\[\] = DEPARTMENTS\.map/.test(nav) &&
      /const DEFAULT_CATEGORIES = DEPARTMENT_RAIL/.test(hdr) &&
      /const CATEGORIES_WITH_SUBS = DEPARTMENT_NAV/.test(hdr) &&
      // lucide ships exactly one garment, so the other apparel department had
      // to be drawn — to lucide's own spec, because half a set in one drawing
      // language and half in another is worse than any single icon in it.
      /viewBox="0 0 24 24"/.test(code("components/marketplace/department-icons.tsx")) &&
      /stroke="currentColor"/.test(code("components/marketplace/department-icons.tsx")) &&
      // And the type is ours, because `typeof LayoutGrid` is lucide's own
      // forwardRef type: a type that says "an icon" and means "an icon from
      // that one package".
      /type DeptIcon = React\.ComponentType/.test(nav) &&
      !/icon: typeof LayoutGrid/.test(hdr)
    )
  })(),
  "        components/platform/platform-header-client.tsx",
)

check(
  "every surface offers the departments a listing can actually be filed under",
  (() => {
    // TWO TAXONOMIES, AND ONLY ONE OF THEM WAS REAL.
    //
    // lib/marketplace/categories.ts carries Womenswear / Menswear / Sneakers /
    // Bags & Accessories / Jewellery / Beauty / Books / Home / Vintage, and it
    // is what the phone's menu, its category rail and the search tiles all read
    // from. lib/marketplace/listing-taxonomy.ts carries Femei / Bărbați / Copii
    // / Divertisment / Hobbyuri și colecții — and it is what the SELL FORM makes
    // people choose from, so it is the only one any listing has ever been filed
    // under.
    //
    // The consequence was worse than a mismatch of words. `?category=sneakers`
    // validated and then matched nothing, because no listing carries
    // `sneakers`: it carries `women-footwear`. Ten doors on the phone's menu,
    // every one of them opening onto an empty room — which a shopper cannot
    // tell apart from a marketplace with nothing in it.
    const drawer = code("components/marketing/mobile-web-header.tsx")
    const rail = code("components/marketplace/search-row.tsx")
    const feed = code("components/explore/mobile-feed.tsx")
    const overlay = code("components/explore/mobile-search-overlay.tsx")
    const legacy = /from "@\/lib\/marketplace\/categories"/
    return (
      // Not one of the four still reads the legacy list. `product-card` and
      // `checkout` still import CONDITIONS from it, which is a different thing
      // in the same file and is not navigation.
      ![drawer, rail, feed, overlay].some((f) => legacy.test(f)) &&
      /DEPARTMENT_NAV/.test(drawer) &&
      // AND EVERY WAY OF PICKING ONE GOES TO THE SAME PLACE. The sticky bar
      // pushed `/?category=women` — the home page carrying a filter, with no
      // title, no count, no trail and no filter bar — so the same word did one
      // thing in the Browse menu, another in the phone's drawer and a third in
      // the bar, and only the third had nothing to show for it. `categoryPath`
      // rather than a hand-written string, so they cannot drift again.
      /navigateToExploreCategory\(cat === "all" \? "\/" : categoryPath\(cat\)\)/.test(
        code("components/platform/platform-header-client.tsx"),
      ) &&
      /router\.push\(id === "all" \? "\/" : categoryPath\(id\)\)/.test(drawer) &&
      /router\.push\(id === "all" \? "\/" : categoryPath\(id\)\)/.test(feed) &&
      // Nothing anywhere still pushes the old shape.
      ![drawer, rail, feed, overlay].some((f) => /\?category=\$\{/.test(f)) &&
      /DEPARTMENT_RAIL/.test(rail) &&
      /DEPARTMENT_RAIL/.test(feed) &&
      /DEPARTMENT_RAIL/.test(overlay) &&
      // AND THE FILTER TESTS THE RIGHT THING. `normalizeCategoryToId` maps the
      // OLD taxonomy's display names onto the OLD taxonomy's ids: handed
      // `women-footwear` it recognises nothing, answers "all", and every pill
      // matches everything — a filter that looks like it works while doing
      // nothing at all.
      /listingInDepartment\(p\?\.category, cat\)/.test(feed) &&
      !/normalizeCategoryToId/.test(feed) &&
      // The drawer drills into the groups, because a department is not a
      // destination and Femei · Pantofi is. `?sub=` is a group id, which is
      // exactly what a listing's category column holds.
      /drawerDept\.subcategories\.map/.test(drawer) &&
      /className="sub-push"/.test(drawer) &&
      /drawerPopped \? "sub-pop" : undefined/.test(drawer) &&
      // And reopening the menu starts at the top rather than wherever it was
      // left — a drawer that opens on Femei because you pressed Femei once.
      /setDrawerDept\(null\)\s*\n\s*setDrawerPopped\(false\)/.test(drawer)
    )
  })(),
  "        lib/marketplace/department-nav.ts",
)

check(
  "the filter button does something, and what it opens can count",
  (() => {
    // It had no `onClick` at all — a painted control beside the search field for
    // as long as this screen has existed. That is worse than no button: somebody
    // who presses it and gets nothing concludes the marketplace is broken rather
    // than that the feature is missing.
    const feed = code("components/explore/mobile-feed.tsx")
    const sheet = code("components/explore/mobile-filter-sheet.tsx")
    const engine = code("lib/marketplace/feed-filters.ts")
    return (
      /onClick=\{\(\) => setFiltersOpen\(true\)\}/.test(feed) &&
      /<MobileFilterSheet/.test(feed) &&
      /<MobileSortSheet/.test(feed) &&
      // THE COUNT IS EXACT, because the listings are already on the client — so
      // the footer is a promise the next screen keeps rather than a number the
      // sheet discovers after you apply it.
      /applyFeedFilters\(pool, draft\)\.length/.test(sheet) &&
      // …and it is only SHOWN where it can be true. On the results page the
      // answer is a SQL count, and re-running it per keystroke to put a number
      // on a button is a request a second for a number nobody asked for. A
      // missing count is honest; a stale one is not.
      /pool\.length > 0 \? applyFeedFilters\(pool, draft\)\.length : null/.test(sheet) &&
      // NOTHING IS APPLIED UNTIL YOU SAY SO. Live-applying under an open sheet
      // destroys the pool the facets were counted from: press "Negru" and Brand
      // offers three brands instead of forty, because the options are now being
      // counted from the black things.
      /const \[draft, setDraft\] = useState<FeedFilters>\(value\)/.test(sheet) &&
      /onApply\(draft\)/.test(sheet) &&
      // And the facets are counted from the POOL, not from the filtered set.
      /const facets = useMemo\(\(\) => facetsFrom\(pool, urlCategory\), \[pool, urlCategory\]\)/.test(feed) &&
      /const pool = useMemo/.test(feed) &&
      // Every option is a value some listing actually carries, ordered by how
      // many carry it — an option that returns nothing is the same empty room
      // the old category menu was full of.
      /counts\.set\(key, \(counts\.get\(key\) \?\? 0\) \+ 1\)/.test(engine) &&
      // BRANDS ARE FOLDED BY CASE, and only brands. `condition` and `colour` are
      // ids from a fixed list and `size` comes from a size system, so those are
      // one spelling each already. `brand` is free text somebody typed, so a
      // catalogue reliably holds Nike, nike and NIKE — unfolded, the list offers
      // all three at a third of the real count each, and picking one silently
      // excludes the listings that spelled it differently.
      /brands: tally\(products, \(p\) => p\?\.brand, \(v\) => v, true\)/.test(engine) &&
      // The spelling shown is the commonest, decided AFTER counting — deciding
      // as you go keeps whichever arrived first, which is the order the database
      // happened to return rows in.
      /if \(n > best \|\| \(n === best && spelling < value\)\)/.test(engine) &&
      // And the server agrees with it. `.in\(\)` is case-SENSITIVE, so an
      // `.in\("brand", \["Nike"\]\)` behind a count that folded case is a page
      // disagreeing with the number printed on its own filter.
      /brand\.ilike\.\$\{JSON\.stringify\(b\)\}/.test(read("app/(marketing)/shop/[[...path]]/page.tsx")) &&
      /\.sort\(\(a, b\) => b\.count - a\.count/.test(engine) &&
      // A price RANGE is one filter however many of its two ends are set: a
      // badge reading 2 for "between 50 and 200" is counting inputs.
      /\(f\.minPrice != null \|\| f\.maxPrice != null \? 1 : 0\)/.test(engine) &&
      // Levels, not accordions — the same push/pop as the sell form.
      /className="sub-push pb-6"/.test(sheet) &&
      /popped && "sub-pop"/.test(sheet)
    )
  })(),
  "        components/explore/mobile-filter-sheet.tsx, lib/marketplace/feed-filters.ts",
)

check(
  "pressing a category lands on that category rather than on the marketing hero",
  (() => {
    // A guest with no query gets the home page on this screen, and
    // `?category=women&sub=women-shoes` was counted as "no query" — so pressing
    // Încălțăminte in the menu arrived at the proposition panel. The menu is
    // what appears broken, not the feed.
    //
    // And the department is passed SEPARATELY from `category`: that one is
    // validated against the legacy VALID_CATEGORY_IDS, so `?category=women`
    // fails the test and arrives as "all" even though the query filtered by it
    // correctly.
    const feed = code("components/explore/mobile-feed.tsx")
    const page = code("app/(marketing)/_explore-feed.tsx")
    return (
      /const filteredByUrl = \(urlCategory !== "" && urlCategory !== "all"\) \|\| urlSub !== ""/.test(feed) &&
      // A browser gets the home page signed in or out; the app's Acasă tab is the
      // exception, and only for somebody signed in.
      /const homePage = !searchQuery && !filteredByUrl && \(!signedIn \|\| !nativeShell\)/.test(feed) &&
      /const departmentId = DEPARTMENTS\.some\(\(d\) => d\.id === rawCategory\) \? rawCategory : null/.test(page) &&
      /initialDepartment=\{departmentId \?\? ""\}/.test(page) &&
      /initialSub=\{subGroup \?\? ""\}/.test(page) &&
      // And the results header tells you where you are, with a way back UP that
      // is not the back button.
      /<ResultsHeader/.test(feed) &&
      /aria-label="Breadcrumb"/.test(code("components/explore/results-header.tsx"))
    )
  })(),
  "        components/explore/mobile-feed.tsx, app/(marketing)/_explore-feed.tsx",
)

check(
  "the phone's Sign up button is a button rather than a line of text",
  (() => {
    // PILL_FILLED sets the colour, the radius and the press. It does not set a
    // size — the drawer uses it at h-12 — and nothing set one here, so this was
    // as tall as 13.5px of text and nothing else: about 20px, in a row of 44px
    // icon buttons, and under Apple's 44px target on its short axis.
    const hdr = code("components/marketing/mobile-web-header.tsx")
    return /className=\{`ml-1 h-9 px-4 text-\[14px\] \$\{PILL_FILLED\}`\}/.test(hdr)
  })(),
  "        components/marketing/mobile-web-header.tsx",
)

check(
  "the app is offered from inside the header, not above it",
  (() => {
    // The feed is `position: fixed` under `--web-header-h`, and that number is
    // measured off the header's own root. A band rendered ABOVE the header is a
    // band the feed knows nothing about, so the top of the marketplace would sit
    // underneath it. As a CHILD it is inside the box the ResizeObserver already
    // watches: it appears, the height republishes on the same frame, everything
    // below moves down, and none of that needed coordinating.
    const hdr = read("components/marketing/mobile-web-header.tsx")
    const banner = code("components/marketing/install-app-banner.tsx")
    const headerStart = hdr.indexOf("<header")
    return (
      hdr.indexOf("<InstallAppBanner />") > headerStart &&
      /const observer = new ResizeObserver\(publishHeaderHeight\)/.test(hdr) &&
      // iOS only, because the App Store is the only store link this app has and
      // sending an Android user there is a button that lands them somewhere
      // they cannot install from. A map, not a string, so a Play Store URL is
      // one line when there is one.
      /const STORE_URL: Record<"ios", string>/.test(banner) &&
      /apps\.apple\.com\/us\/app\/storelib\/id6760252232/.test(banner) &&
      /iPad\|iPhone\|iPod/.test(banner) &&
      // Never inside the app, and never to somebody who installed it to their
      // home screen — "install the app" inside the app is the worst thing this
      // could do.
      /StorelibApp\|Capacitor/.test(banner) &&
      /display-mode: standalone/.test(banner) &&
      // Dismissal survives a reload, under a versioned key so a future campaign
      // re-offers it by bumping the version rather than by ignoring a no.
      /const DISMISS_KEY = "storelib_install_banner_v1"/.test(banner) &&
      /localStorage\.setItem\(DISMISS_KEY/.test(banner) &&
      // And nothing is drawn until the answer is known: an optimistic band that
      // vanishes is a layout shift on every load for everybody who said no.
      /if \(!ready \|\| !show\) return null/.test(banner)
    )
  })(),
  "        components/marketing/install-app-banner.tsx, components/marketing/mobile-web-header.tsx",
)

check(
  "and closing search takes the keyboard with it instead of after it",
  (() => {
    // The fade was never the problem — 300ms of opacity and 8px of travel is one
    // composited property and a transform. What made Închide look broken was
    // everything else moving during it:
    //
    //   Nothing blurred the field, so iOS dismissed the keyboard only when the
    //   input was torn down at 360ms — after the panel had gone. The sheet faded
    //   out over a keyboard still up, then the keyboard slid away over the feed
    //   underneath: two animations for one gesture.
    //
    //   And this padding tracks the keyboard's height, so a dismissing keyboard
    //   walked it from ~300px to 0 across half a dozen visualViewport events —
    //   every one a reflow of the results list, on the frames where it is still
    //   half visible.
    const ov = code("components/explore/mobile-search-overlay.tsx")
    return (
      // Frozen for the close: `open`, not `mounted`, and the difference between
      // them is exactly the third of a second this must hold still for.
      /if \(!mounted \|\| !open\) return\s*\n\s*const vv = window\.visualViewport/.test(ov) &&
      /\}, \[mounted, open\]\)/.test(ov) &&
      // The keyboard goes on the frame the panel starts leaving.
      /if \(open \|\| !mounted\) return\s*\n\s*inputRef\.current\?\.blur\(\)/.test(ov) &&
      // activeElement as well as the ref, because focus may have moved to a
      // result row on the way out and blurring the field would then do nothing.
      /el instanceof HTMLElement && \(el\.tagName === "INPUT" \|\| el\.tagName === "TEXTAREA"\)/.test(ov)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "pull to refresh is an app gesture and only the app has it",
  (() => {
    // In the shell it is the right control: no address bar, no reload, and the
    // feed is the home screen. In a browser it is a second, worse copy of
    // something the browser already does — and it fights it. Chrome and Safari
    // own the downward drag at the top of a document; this scroller intercepted
    // it, opened its own gap and spun its own spinner, so one gesture meant two
    // things depending on which element the thumb landed on.
    //
    // Decided in the lazy initialiser, not an effect: `capacitor` is on <html>
    // before the first paint — the same signal the CSS uses to pick between the
    // two headers — and an effect would leave the gesture live for the first
    // frames on the web.
    const feed = code("components/explore/mobile-feed.tsx")
    return (
      /const \[nativeShell\] = useState\(\s*\n?\s*\(\) => typeof document !== "undefined" && document\.documentElement\.classList\.contains\("capacitor"\),/.test(
        feed,
      ) && /enabled: nativeShell && !reelsActive/.test(feed)
    )
  })(),
  "        components/explore/mobile-feed.tsx",
)

check(
  "and the page it closes onto has stopped moving before the panel goes",
  (() => {
    // `overflow: hidden` on the body makes the DOCUMENT non-scrollable, and a
    // `position: sticky` element in a document that cannot scroll has nothing to
    // stick to — it falls back to its place in the flow. So the header moves
    // when the lock goes on and moves back when it comes off. Behind an opaque
    // panel neither is visible; keyed on `mounted`, the lock came off at 360ms —
    // a good forty milliseconds after the panel had finished fading out. That is
    // the header jumping on its own, with nothing on screen to explain it.
    const ov = code("components/explore/mobile-search-overlay.tsx")
    return (
      /if \(!mounted \|\| anchored \|\| !open\) return\s*\n\s*return lockScroll\(\)/.test(ov) &&
      /\}, \[mounted, anchored, open\]\)/.test(ov)
    )
  })(),
  "        components/explore/mobile-search-overlay.tsx",
)

check(
  "and the phone's category sheet drills down the way the sell form does",
  (() => {
    // It was `slide-in-from-right-4 fade-in` going in and
    // `slide-in-from-left-4 fade-in` coming back: a 16px nudge and a fade,
    // which is not a level arriving — it is a panel appearing near where the
    // last one was. The rows underneath then staggered themselves at 30ms
    // apart on top of that, so one gesture played as two overlapping
    // animations of different lengths and the panel landed while its contents
    // were still arriving.
    //
    // `sub-push` / `sub-pop` are the movement components/sell/picker-page.tsx
    // uses, at the same duration and curve: the arriving level comes the full
    // width from the right, and the one you go BACK to steps in from -25% at
    // 0.62 opacity — the parallax that says it was underneath all along.
    // Three surfaces, one gesture.
    const hdr = code("components/platform/platform-header-client.tsx")
    const css = read("app/globals.css")
    return (
      (hdr.match(/className="sub-push"/g) ?? []).length === 1 &&
      /className=\{cn\(sheetPopped && "sub-pop"\)\}/.test(hdr) &&
      // The pop is a RETURN, and it is spent on the way back in — a flag left
      // set replays the back animation the next time the sheet opens, and an
      // unconditional one greeted you with it on the very first open.
      /setSheetPopped\(true\)\s*\n\s*setExpandedCategory\(null\)/.test(hdr) &&
      /setSheetPopped\(false\)\s*\n\s*setExpandedCategory\(cat\.label\)/.test(hdr) &&
      // Its own flag, not the dropdown's: two surfaces with their own level
      // state, and sharing one would let a back press in the dropdown decide
      // how the sheet animates next time.
      /const \[sheetPopped, setSheetPopped\] = useState\(false\)/.test(hdr) &&
      /const \[poppedSub, setPoppedSub\] = useState\(false\)/.test(hdr) &&
      // No stagger left anywhere in the sheet's rows.
      !/animationDelay: `\$\{index \* 30\}ms`/.test(hdr) &&
      !/slide-in-from-right-4|slide-in-from-left-4/.test(hdr) &&
      // Transform and opacity only, so twelve rows cost the compositor a layer
      // and the main thread nothing.
      /@keyframes sub-pop \{[\s\S]{0,160}?translate3d\(-25%, 0, 0\)/.test(css) &&
      /animation: sub-push 360ms cubic-bezier\(0\.32, 0\.72, 0, 1\) both/.test(css)
    )
  })(),
  "        components/platform/platform-header-client.tsx, app/globals.css",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
