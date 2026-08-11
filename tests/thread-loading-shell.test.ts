/**
 * ===========================================================================
 *  A CONVERSATION HAS NO LOADING SHELL, AND MUST NOT GROW ONE BACK
 * ===========================================================================
 *
 * This suite used to assert that app/(marketing)/messages/[id]/loading.tsx and
 * components/messages/thread.tsx were the same box to the pixel — same header
 * padding, same avatar, same listing strip, same composer — because any row
 * that differed made the screen step at the handover and one tap read as two
 * arrivals.
 *
 * That was the right test for a shell that had to exist. It no longer does, and
 * the reason is worth keeping:
 *
 * ---------------------------------------------------------------------------
 * WHY THE SHELL WENT
 * ---------------------------------------------------------------------------
 * A `loading.tsx` is a Suspense boundary. Next paints it INSTEAD OF the route
 * while the route resolves, and it knows nothing about which conversation is
 * opening — so it can only ever draw grey bars where the name, the face and the
 * item are about to be.
 *
 * Two things made that a bad trade here:
 *
 *   IT WAS THE WRONG SHAPE ON A DESKTOP. The real screen is a split view: a
 *   340px column of conversations and the thread beside it. The shell was a
 *   `max-w-2xl` card in the middle of the page, because a loading file cannot
 *   fetch the conversation list to fill the column. So clicking a row on a wide
 *   screen threw away the whole two-pane layout, drew a narrow skeleton card
 *   where it had been, and then snapped back. The list you had just clicked in
 *   disappeared and returned.
 *
 *   AND IT WAS ANSWERING A QUESTION NOBODY WAS ASKING ANY MORE. It existed so a
 *   tap had something to show while the payload landed. Both conversation lists
 *   now prefetch the route, and page.tsx reads the thread on the server — so in
 *   the ordinary case the payload is already in the client router cache when
 *   the row is pressed and there is nothing to wait for. The shell was being
 *   painted, and replaced, for a wait that had already been eliminated.
 *
 * With no boundary, a navigation that genuinely has to wait simply holds the
 * screen you are on until the next one is ready — which is what a native app
 * does, and which cannot flash, cannot step, and cannot be the wrong shape.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED NOW
 * ---------------------------------------------------------------------------
 * That the shell has not come back, and that the two things which make its
 * absence safe are still in place: the prefetch on the rows, and the server
 * read in page.tsx. Re-adding a loading.tsx without those would reintroduce
 * every symptom above at once.
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

console.log("\nA conversation opens onto itself, not onto a skeleton of itself\n")

check(
  "there is no loading boundary on the conversation route",
  !existsSync(join(root, "app/(marketing)/messages/[id]/loading.tsx")),
  "        A loading.tsx here cannot know which conversation is opening, and on\n" +
    "        a wide screen cannot draw the split view at all — so it replaces the\n" +
    "        conversation list with a narrow skeleton card and then snaps back.",
)

check(
  "nor on the inbox above it",
  !existsSync(join(root, "app/(marketing)/messages/loading.tsx")),
  "        Same reasoning, and this one has been removed once already.",
)

check(
  "the segment layout survives, because the entrance lives on it",
  (() => {
    // It is the one element Next mounts once and keeps for the whole visit, so
    // an animation on it plays exactly once. That was true when there was a
    // shell to span and is still what stops the arrival replaying.
    const layout = code("app/(marketing)/messages/[id]/layout.tsx")
    return /thread-arrive/.test(layout)
  })(),
  "        app/(marketing)/messages/[id]/layout.tsx",
)

check(
  "both conversation lists prefetch the route",
  (() => {
    // This is what makes the missing boundary invisible: the payload is in the
    // router cache before the row is pressed. Without it a tap sits on the
    // inbox with nothing acknowledging it, which is the complaint the shell was
    // originally added to answer.
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
    // A wait that does happen is covered inside the screen, on the same
    // surface, by the cover held until the data AND the pictures are ready —
    // one indicator, in the right place, instead of a shell's and then its own.
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
