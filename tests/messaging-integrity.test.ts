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

console.log("\nVoice notes")

check(
  "a recording is private, like a photograph and more so",
  (() => {
    // A recording of somebody's actual voice in a two-person conversation. What
    // is stored on the message is the object PATH; the link is minted per read
    // for whichever party is asking.
    const route = read(("app/api/messages/[id]/voice/route.ts"))
    return (
      /from\("messages"\)\s*\n?\s*\.upload\(path/.test(route) &&
      /public: false/.test(route) &&
      !/getPublicUrl/.test(route)
    )
  })(),
)

check(
  "membership is checked before a single byte is accepted",
  (() => {
    const route = read(("app/api/messages/[id]/voice/route.ts"))
    const convoAt = route.indexOf('.from("conversations")')
    const formAt = route.indexOf("await req.formData()")
    return convoAt > 0 && formAt > convoAt
  })(),
)

check(
  "the bytes have to be what the upload claims they are",
  (() => {
    // `file.type` is a label the client wrote. These objects are served back to
    // the other party from our own domain, so a file that is not the recording
    // it claims to be is one we would hand to somebody else under our name.
    const route = read(("app/api/messages/[id]/voice/route.ts"))
    return /function sniff\(/.test(route) && /if \(!sniffed\)/.test(route)
  })(),
)

check(
  "a mis-tap and a phone call are both refused",
  (() => {
    const route = read(("app/api/messages/[id]/voice/route.ts"))
    return /ms < MIN_MS/.test(route) && /ms > MAX_MS/.test(route) && /file\.size > MAX_BYTES/.test(route)
  })(),
)

check(
  "it needs no migration, and says why that is a design",
  (() => {
    // `messages` has a shape constraint and a validated `kind`, so a new kind is
    // a migration — and a feature that cannot ship until somebody runs SQL
    // against production half-exists for as long as that takes. Same sentinel
    // trick the photo fallback uses, with its own sentinel so the two can never
    // be mistaken for each other.
    const enc = read(("lib/messages/voice-message.ts"))
    const img = read(("lib/messages/image-fallback.ts"))
    const voiceSentinel = /const SENTINEL = "([^"]+)"/.exec(enc)?.[1]
    const imageSentinel = /const SENTINEL = "([^"]+)"/.exec(img)?.[1]
    return !!voiceSentinel && !!imageSentinel && voiceSentinel !== imageSentinel
  })(),
)

check(
  "the duration travels with the message rather than being asked of the audio",
  (() => {
    // `HTMLAudioElement.duration` on a MediaRecorder blob is Infinity in Chrome
    // and Safari until the whole file has been fetched and seeked — so a bubble
    // that trusted it would show nothing until you pressed play.
    const enc = read(("lib/messages/voice-message.ts"))
    const bubble = read(("components/messages/voice-bubble.tsx"))
    return (
      /export function encodeVoiceBody\(path: string, ms: number, peaks: number\[\]\)/.test(enc) &&
      /ms > 0 \? ms : 0/.test(enc) &&
      // The bubble draws the stored length, and only trusts `duration` when it
      // is finite.
      /Number\.isFinite\(a\.duration\) && a\.duration > 0/.test(bubble)
    )
  })(),
)

check(
  "and so does the waveform, so a thread does not download thirty files to draw it",
  (() => {
    const enc = read(("lib/messages/voice-message.ts"))
    const bubble = read(("components/messages/voice-bubble.tsx"))
    return (
      /export const MAX_PEAKS = \d+/.test(enc) &&
      /preload="none"/.test(bubble) &&
      !/decodeAudioData/.test(bubble)
    )
  })(),
)

check(
  "the encoding survives a note written without peaks",
  (() => {
    // A voice message that would not render because its waveform is missing
    // would be a decoration deciding whether the content exists.
    const enc = read(("lib/messages/voice-message.ts"))
    return /peaks = \(parts\[2\] \?\? ""\)/.test(enc) && /if \(!path\) return null/.test(enc)
  })(),
)

check(
  "nothing is sent unless the finger lifts on purpose",
  (() => {
    // Three ways out and only one sends. `pointercancel` — a notification, the
    // app switcher, a second finger — must never be the thing that sends a
    // recording of a room.
    const rec = read(("components/messages/voice-recorder.tsx"))
    return (
      /onPointerCancel=\{\(\) => stop\(false\)\}/.test(rec) &&
      /onPointerUp=\{\(\) => \{[\s\S]{0,160}?stop\(!cancelling\)/.test(rec) &&
      /elapsed < MIN_MS/.test(rec)
    )
  })(),
)

check(
  "the microphone is released on every exit path",
  (() => {
    // Otherwise the browser keeps the recording indicator lit and the microphone
    // held for the rest of the session.
    const rec = read(("components/messages/voice-recorder.tsx"))
    return (
      /stream\.current\?\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(rec) &&
      /useEffect\(\(\) => \(\) => teardown\(\), \[teardown\]\)/.test(rec)
    )
  })(),
)

check(
  "a permission prompt answered after the finger lifted does not open a microphone",
  (() => {
    // getUserMedia takes as long as the person takes to answer it. By then the
    // press may be long over.
    const rec = read(("components/messages/voice-recorder.tsx"))
    return /if \(cancelled\.current\) \{[\s\S]{0,200}?getTracks\(\)\.forEach/.test(rec)
  })(),
)

check(
  "only one voice note plays at a time",
  (() => {
    // Two playing over each other is unintelligible and there is no way to mean
    // it. An event rather than a module registry, so it cannot leak across
    // threads.
    const bubble = read(("components/messages/voice-bubble.tsx"))
    return (
      /const STOP_OTHERS = "storelib:voice-play"/.test(bubble) &&
      /window\.dispatchEvent\(new CustomEvent\(STOP_OTHERS/.test(bubble) &&
      /audio\.current\?\.pause\(\)/.test(bubble)
    )
  })(),
)

check(
  "the inbox says what arrived instead of printing the sentinel",
  (() => {
    // The row must not have to know there are several ways media can be filed;
    // it only has to know it is one.
    const list = read(("lib/messages/list.ts"))
    const inbox = read(("components/messages/inbox.tsx"))
    return /isEncodedVoice\(m\.body\)/.test(list) && /"Mesaj vocal"/.test(inbox)
  })(),
)

check(
  "and the push names it without playing it back",
  (() => {
    // A lock-screen banner is read by whoever is holding the phone.
    const push = read(("lib/push/message-notification.ts"))
    return /if \(kind === "voice"\) return "Ți-a trimis un mesaj vocal"/.test(push)
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
