/**
 * ===========================================================================
 *  THE MESSAGING GUARANTEES, ASSERTED
 * ===========================================================================
 * Chat is the one part of this marketplace where being wrong is not a cosmetic
 * problem: a message that does not arrive, a receipt that lies, a block that
 * does not block, or a thread somebody can read that is not theirs. Each of
 * these is a property the code currently has and that nothing else would
 * notice losing — most of them fail SILENTLY, which is exactly why they are
 * written down here rather than trusted.
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

const thread = read("lib/messages/thread.ts")
const send = read("app/api/messages/[id]/route.ts")
const typing = read("app/api/messages/[id]/typing/route.ts")
const image = read("app/api/messages/[id]/image/route.ts")
const sql = read("supabase/sql/RUN_MESSAGING_ALL.sql")

console.log("\nMessaging: the promises that fail quietly when they break\n")

// ── SEEN ────────────────────────────────────────────────────────────────────
//
// The read receipt is an UPDATE, and PostgREST reports "a policy forbade every
// row" identically to "no rows matched": success, nothing changed. So on a
// database where the messages_update migration was never applied, `Văzut`
// silently never worked and no client code could have fixed it. Membership is
// proven before this runs, so it does not need the policy to be safe.
check(
  "marking read does not depend on an RLS policy existing",
  /optionalAdminClient\(\)\s*\?\?\s*asCaller\)?\s*\n?\s*\.from\("messages"\)/.test(thread) ||
    /\(optionalAdminClient\(\) \?\? asCaller\)/.test(thread),
  "        lib/messages/thread.ts — if this runs as the caller alone, a missing\n" +
    "        `messages_update` policy makes every read receipt a no-op with no\n" +
    "        error anywhere.",
)
check(
  "membership is proven before anything else in readThread",
  thread.indexOf('.from("conversations")') < thread.indexOf('.from("messages")') &&
    /if \(!convo\) return null/.test(thread),
  "        The service client above is only safe because a caller who is not in\n" +
    "        the conversation has already been turned away.",
)
check(
  "the read update stays closed to this thread and other people's messages",
  /\.eq\("conversation_id", id\)[\s\S]{0,200}\.neq\("sender_id", userId\)[\s\S]{0,120}\.is\("read_at", null\)/.test(thread),
  "        Widening this predicate is the one way the service client above\n" +
    "        stops being equivalent to what the caller could do themselves.",
)
check(
  "reading older pages never marks anything read",
  /markRead && !olderThan/.test(thread),
  "        Paging backwards through history is not reading new messages, and\n" +
    "        marking them read would clear the other party's unread badge for\n" +
    "        messages nobody looked at.",
)
check(
  "the policy is in the migration, so the RLS path works where it was run",
  /create policy messages_update on public\.messages/.test(sql),
)

// ── ABUSE AND ACCESS ────────────────────────────────────────────────────────
check(
  "sending is rate limited, and counted in the database",
  /\.gte\("created_at", since\)/.test(send) && /status: 429/.test(send),
  "        A serverless in-memory counter resets whenever the platform scales,\n" +
    "        so it is not a limit. This one is counted from the table.",
)
check(
  "the database enforces its own limit under the route's",
  /rate_limited/.test(send) && /rate_limited|rate limit/i.test(sql),
  "        PostgREST is reachable without going through the route at all, so\n" +
    "        the app's limit cannot be the last word.",
)
check(
  "a block stops the message, not just the view of it",
  /user_blocks/.test(send) && /status: 403/.test(send),
)
check(
  "the refusal does not disclose that a block exists",
  // Only what is RETURNED, not what is explained. The first version of this
  // matched the comment above the check — which says the words on purpose —
  // and failed on code that was correct. A test that reads prose is testing
  // the wrong file.
  (() => {
    const returned = [...send.matchAll(/error:\s*"([^"]+)"/g)].map((m) => m[1])
    return !returned.some((msg) => /blocat|blocked|block/i.test(msg))
  })(),
  "        Whether someone blocked you is information the blocked party is not\n" +
    "        owed; the refusal must read the same as any other refusal.",
)
check(
  "message bodies are bounded before they are stored",
  /\.slice\(0, \d+\)/.test(send),
)
check(
  "every conversation id is validated as a uuid before it reaches a query",
  [send, typing, image].every((f) => /UUID_RE\.test\(id\)/.test(f)),
)
check(
  "typing proves membership before it broadcasts",
  /\.from\("conversations"\)[\s\S]{0,200}\.eq\("id", id\)/.test(typing) && /status: 404/.test(typing),
  "        A broadcast channel carries no RLS. Anyone who could POST here\n" +
    "        without being in the thread could announce into it.",
)
check(
  "the typing broadcast carries no account id",
  /crypto\.randomUUID\(\)/.test(typing) && !/user\.id/.test(typing.split("announceThread")[1] ?? ""),
  "        The payload goes to a channel with no RLS in front of it, so a real\n" +
    "        uuid there hands a listener a participant's account id along with a\n" +
    "        live feed of when they are at their keyboard.",
)

// ── IMAGES ──────────────────────────────────────────────────────────────────
check(
  "message images live in a private bucket and are served signed",
  /createSignedUrl/.test(image),
  "        A public bucket makes every photograph anyone has ever sent in a\n" +
    "        private conversation readable by URL alone.",
)
check(
  "a failed image write does not leave the object behind",
  /storage[\s\S]{0,80}\.remove\(\[path\]\)/.test(image),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
