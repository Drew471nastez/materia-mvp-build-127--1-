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
  "the per-message menu is revealed by a pointer and permanent without one",
  (() => {
    return (
      /\.msg-row:hover > \.msg-dots/.test(css) &&
      /\.msg-dots:focus-visible/.test(css) &&
      /@media \(hover: none\) \{\s*\.msg-dots \{\s*opacity: 1;/.test(css)
    )
  })(),
  "        Forty of these run down the middle of a screen whose whole content\n" +
    "        is the messages. At full contrast it is furniture; at zero nobody\n" +
    "        finds it.",
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
// ---------------------------------------------------------------------------

const tip = code("components/ui/info-tip.tsx")

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
  "the mark is hidden at rest only where a pointer exists to reveal it",
  (() => {
    // A control invisible until an event that cannot happen is a control that
    // does not exist. `@media (hover: hover)` rather than a breakpoint, because
    // a tablet is a wide screen with no pointer.
    const i = css.indexOf(".info-tip-mark {\n    opacity: 0;\n  }")
    const guard = css.lastIndexOf("@media (hover: hover) and (pointer: fine)", i)
    return i > 0 && guard > 0 && i - guard < 300 && /@media \(hover: none\) \{\s*\.info-tip-mark \{\s*opacity: 1;/.test(css)
  })(),
  "        app/globals.css",
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

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
