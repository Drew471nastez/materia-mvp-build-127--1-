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
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

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
    return (
      !/bg-black\/25/.test(bodyBlock) &&
      Number.isFinite(scrimZ) &&
      Number.isFinite(panelZ) &&
      scrimZ < panelZ
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
    const line = sellForm.slice(sellForm.indexOf("price-total-in mt-2.5"))
    return (
      line.indexOf("formatPlatformMoney(priceCents)") <
        line.indexOf("formatPlatformMoney(buyerPaysCents(priceCents))") &&
      /incl\. protecția plății/.test(line)
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
  "the price line is one quiet caption, not a panel with a disclosure in it",
  (() => {
    // Three versions were wrong three ways: a grey sentence buried the figure
    // that matters mid-paragraph; two large rows set the platform's cut out as
    // a line item in the biggest type on the card; a violet panel with a shield
    // and a tooltip made a small arithmetic fact look like a notice, with an
    // explanation longer than the thing explained.
    //
    // What is left is the two numbers, in the weight the form's other captions
    // use. No accent, no panel, no tooltip.
    const line = sellForm.slice(sellForm.indexOf("price-total-in mt-2.5"), sellForm.indexOf("</section>", sellForm.indexOf("price-total-in mt-2.5")))
    return (
      /<ShieldCheck[^>]*text-neutral-400/.test(line) &&
      !/#7c3aed/.test(line) &&
      !/<InfoTip/.test(line)
    )
  })(),
  "        components/sell/new-listing-form.tsx",
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
