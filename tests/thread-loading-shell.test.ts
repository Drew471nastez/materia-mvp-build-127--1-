/**
 * ===========================================================================
 *  SWITCHING CONVERSATIONS DOES NOT FLASH THE ONE YOU LEFT
 * ===========================================================================
 *
 * The history of this suite is the history of one bug seen from two sides.
 *
 * IT FIRST ASSERTED the conversation's loading.tsx matched the real thread to
 * the pixel, so the swap from shell to screen never stepped.
 *
 * THEN IT ASSERTED THE OPPOSITE — that the shell was GONE — because at the time
 * every page on this route fetched the conversation list itself, and a
 * loading.tsx cannot fetch, so on a desktop the shell threw the two-pane split
 * away and drew a narrow card where the column had been. Deleting it and
 * holding the previous page was the lesser evil while that was true.
 *
 * IT WAS NOT the lesser evil. Holding the previous page is what "it flashes the
 * other conversation" was: Next keeps the last screen painted until the next
 * RSC payload lands, so clicking a second conversation left the FIRST one's
 * messages — and every avatar and thumbnail in the column, because each page
 * rendered its own list — on screen for the length of the request, then rebuilt
 * the lot. Two faults wearing one symptom.
 *
 * THE FIX IS STRUCTURAL, and it is what this suite now guards:
 *
 *   THE LIST IS THE LAYOUT'S. app/(marketing)/messages/layout.tsx renders the
 *   column once and Next keeps a layout mounted while the page under it changes
 *   — so switching conversations replaces the right-hand pane and touches
 *   nothing on the left. No remount, no re-decode, no fade, no lost scroll.
 *
 *   THE SHELL IS BACK, pane-scoped. With the column in the layout, a
 *   loading.tsx renders INSIDE the pane and the split survives — so the objection
 *   that removed it is void, and its presence is what stops the previous
 *   conversation showing through while the next one loads. Geometry still has to
 *   match thread.tsx or the handover steps.
 *
 *   NEITHER PAGE RENDERS A LIST. Two lists is the remount; one list, hoisted, is
 *   the fix. If a page grows a MessagesSplit or a DesktopConversationList back,
 *   the flashing returns whole.
 *
 * Run with:  npm run test:push
 */

import { existsSync, readFileSync } from "node:fs"
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

console.log("\nSwitching conversations replaces the pane, not the column\n")

check(
  "the conversation list is the layout's, mounted once for the whole visit",
  (() => {
    // A layout is the one element Next keeps mounted while the page under it
    // changes. The column lives here so switching conversations cannot remount
    // it — which is what made every avatar and thumbnail re-decode and fade.
    const layout = code("app/(marketing)/messages/layout.tsx")
    return (
      /export default async function MessagesLayout/.test(layout) &&
      /<MessagesSplit/.test(layout) &&
      /<DesktopConversationList/.test(layout) &&
      /<MessagesInbox/.test(layout) &&
      // It fetches the list once, here, rather than each page doing it.
      /listConversations\(/.test(layout) &&
      // Signed out draws no column — the child owns the whole width.
      /if \(!user\) return <>\{children\}<\/>/.test(layout)
    )
  })(),
  "        app/(marketing)/messages/layout.tsx",
)

check(
  "neither page renders its own split or list — that was the remount",
  (() => {
    // Two copies of the column, keyed by two route segments, is exactly what
    // rebuilt it on every click. The pages are their pane and nothing else now.
    const listPage = code("app/(marketing)/messages/page.tsx")
    const threadPage = code("app/(marketing)/messages/[id]/page.tsx")
    const clean = (p: string) =>
      !/MessagesSplit/.test(p) && !/DesktopConversationList/.test(p) && !/<MessagesInbox/.test(p)
    return (
      clean(listPage) &&
      clean(threadPage) &&
      // The list page is just the placeholder pane; the thread page is just the
      // thread.
      /return <NoConversationSelected \/>/.test(listPage) &&
      /return <MessageThread /.test(threadPage)
    )
  })(),
  "        app/(marketing)/messages/page.tsx, [id]/page.tsx",
)

check(
  "the active row and the phone's primary screen are read from the path, not passed down",
  (() => {
    // Passing the id down would give the layout a reason to re-render per
    // conversation, which is the remount again. usePathname is the same fact
    // for free — the row simply repaints.
    const split = code("components/messages/split-shell.tsx")
    const list = code("components/messages/desktop-conversation-list.tsx")
    return (
      /const pathname = usePathname\(\)/.test(split) &&
      /pathname === "\/messages"/.test(split) &&
      /const pathname = usePathname\(\)/.test(list) &&
      /pathname\?\.startsWith\("\/messages\/"\)/.test(list) &&
      // And the PROPS that used to carry them are gone, so nothing can pass a
      // stale value that fights the path. (`const primary` derived from the
      // pathname is fine and expected — it is the prop `primary,` in the
      // destructure that must not return.)
      !/^\s*primary,\s*$/m.test(split) &&
      !/activeId = null/.test(list)
    )
  })(),
  "        components/messages/split-shell.tsx, desktop-conversation-list.tsx",
)

check(
  "the loading shell is back, pane-scoped, and matches the thread's geometry",
  (() => {
    // With the column in the layout, a loading.tsx renders inside the pane and
    // the split survives — so the shell can hold the pane while the next
    // conversation loads instead of the previous one showing through. It must
    // still be the same box as thread.tsx or the handover steps.
    const shellPath = "app/(marketing)/messages/[id]/loading.tsx"
    if (!existsSync(join(root, shellPath))) return false
    const shell = code(shellPath)
    return (
      /thread-shell/.test(shell) &&
      /thread-surface/.test(shell) &&
      /thread-composer/.test(shell) &&
      // The listing strip that a missing shell grew a step over — see the note
      // in the shell.
      /border-t border-neutral-100 px-4 py-2\.5/.test(shell)
    )
  })(),
  "        app/(marketing)/messages/[id]/loading.tsx",
)

check(
  "the segment layout survives, because the entrance lives on it",
  (() => {
    // It is the one element Next mounts once per conversation and keeps while
    // loading.tsx is swapped for page.tsx, so an animation on it spans the
    // shell AND the messages as one arrival rather than replaying.
    const layout = code("app/(marketing)/messages/[id]/layout.tsx")
    return /thread-arrive/.test(layout)
  })(),
  "        app/(marketing)/messages/[id]/layout.tsx",
)

check(
  "both conversation lists prefetch the route",
  (() => {
    // The payload lands in the router cache before the row is pressed, so the
    // pane's own wait is usually zero and the shell is a fallback rather than a
    // thing seen on every tap.
    const phone = code("components/messages/inbox.tsx")
    const desktop = code("components/messages/desktop-conversation-list.tsx")
    return /href=\{`\/messages\/\$\{[^}]+\}`\}\s*\n\s*prefetch/.test(phone) &&
      /href=\{`\/messages\/\$\{r\.id\}`\}\s*\n\s*prefetch/.test(desktop)
  })(),
  "        components/messages/inbox.tsx, desktop-conversation-list.tsx",
)

check(
  "and the conversation is read on the server, so the page arrives with it",
  (() => {
    const page = code("app/(marketing)/messages/[id]/page.tsx")
    return /readThread\(/.test(page) && /initial=\{initial\}/.test(page)
  })(),
  "        app/(marketing)/messages/[id]/page.tsx",
)

check(
  "the thread still owns the one loading indicator there is",
  (() => {
    const thread = code("components/messages/thread.tsx")
    return /const covered =/.test(thread) && /IosSpinner/.test(thread)
  })(),
  "        components/messages/thread.tsx",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
