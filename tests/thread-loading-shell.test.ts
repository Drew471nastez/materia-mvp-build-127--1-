/**
 * ===========================================================================
 *  THE LOADING SHELL AND THE REAL CONVERSATION ARE THE SAME BOX
 * ===========================================================================
 * Tapping a conversation paints app/(marketing)/messages/[id]/loading.tsx
 * first, then replaces it with components/messages/thread.tsx. The handover
 * between those two is supposed to be invisible: same header, same composer,
 * same everything except the messages. If a single row differs in height, the
 * whole screen steps at the swap and one tap reads as two arrivals — which is
 * what "the chat loads glitchy" has meant every time it has been reported.
 *
 * That file's own header comment has said so from the beginning. It did not
 * help: the real header grew a LISTING STRIP — a 40px thumbnail, its padding
 * and a hairline, sixty-one pixels of it — and the shell was never updated, so
 * every conversation about an item (which is nearly all of them) grew a row at
 * the handover and everything below it dropped. A comment cannot notice that.
 *
 * These assertions are deliberately literal. They take the class strings that
 * DECIDE HEIGHT out of the real component and require the same strings in the
 * shell. That makes the test annoying in exactly the right way: change the
 * header's padding and it fails until the shell is changed too, which is the
 * entire point. It cannot verify rendered geometry — there is no DOM here — but
 * every drift that has actually happened would have been caught by it.
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
const thread = readFileSync(join(root, "components/messages/thread.tsx"), "utf8")
const shell = readFileSync(join(root, "app/(marketing)/messages/[id]/loading.tsx"), "utf8")

console.log("\nA conversation and its loading shell must not move at the swap\n")

/**
 * Every one of these is a string that decides how tall something is. Present in
 * the real conversation and absent from the shell means the screen changes
 * shape at the handover.
 */
const GEOMETRY: Array<[string, string]> = [
  [
    "the header band",
    "shrink-0 border-b border-neutral-100 bg-white/95 backdrop-blur-md",
  ],
  ["the header row", "flex items-center gap-2 px-2 py-2"],
  [
    "the listing strip",
    "flex items-center gap-3 border-t border-neutral-100 px-4 py-2.5",
  ],
  [
    "the composer band",
    "thread-composer shrink-0 border-t border-neutral-100 bg-white px-3 pt-2.5",
  ],
  ["the composer row", "flex items-end gap-2"],
]

for (const [what, cls] of GEOMETRY) {
  const inThread = thread.includes(cls)
  const inShell = shell.includes(cls)
  check(
    `${what} is described identically in both`,
    inThread && inShell,
    !inThread
      ? `        Not found in thread.tsx. If the real header changed, change the\n` +
        `        shell to match and update this string — do not just delete it.\n` +
        `        Looking for: ${cls}`
      : `        Missing from loading.tsx. The shell is now a different height\n` +
        `        from the screen that replaces it, so the conversation steps at\n` +
        `        the handover.\n        Looking for: ${cls}`,
  )
}

// ── The pinned box itself ───────────────────────────────────────────────────
check(
  "both are pinned by .thread-shell",
  /className="thread-shell/.test(shell) && /"thread-shell /.test(thread),
  "        The shell's position, height and safe-area handling all come from\n" +
    "        this one class. Without it on both, they are not even the same box.",
)
check(
  "both pay the safe-area inset in the header rather than above it",
  shell.includes('paddingTop: "env(safe-area-inset-top, 0px)"') &&
    thread.includes('paddingTop: "env(safe-area-inset-top, 0px)"'),
)

// ── The two things that are allowed to differ ───────────────────────────────
check(
  "only the shell has a spinner",
  shell.includes("IosSpinner") && !/IosSpinner[\s\S]{0,80}thread-surface/.test(thread),
  "        The real conversation must never show a loading indicator of its\n" +
    "        own: page.tsx reads the thread on the server, so it arrives with\n" +
    "        its messages already in it. Two spinners is two waits.",
)
check(
  "the shell's spinner is held back before it appears",
  /thread-wait/.test(shell),
  "        A prefetched conversation commits in under a tenth of a second.\n" +
    "        Drawing a spinner for it is what made one tap look like two loads.",
)

// ── No entrance on the arriving conversation ────────────────────────────────
check(
  "the conversation does not animate its own arrival",
  !/"thread-enter"/.test(thread) && !/className=\{?"[^"]*\bthread-enter\b/.test(thread),
  "        The shell before it is fully opaque, so an entrance on the real\n" +
    "        screen is a dip landing exactly ON the handover — announcing the\n" +
    "        one frame that has to pass unnoticed. The arrival belongs to\n" +
    "        <main>, which rises across both. See tab-transition.tsx.",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
