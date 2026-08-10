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

import {
  MESSAGE_MEDIA_TYPES,
  isMimeRefusal,
  uploadMessageMedia,
} from "@/lib/messages/media-bucket"

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
    //
    // Asserted on the shared uploader rather than on the route, because that is
    // where the bucket is now declared — and asserted on EVERY place it is
    // declared, since a bucket that is created private and later widened back
    // to public would be private only until the first repair.
    const route = read(("app/api/messages/[id]/voice/route.ts"))
    const bucket = read(("lib/messages/media-bucket.ts"))
    const publicFlags = bucket.match(/public: (true|false)/g) ?? []
    return (
      /\.from\(MESSAGES_BUCKET\)\s*\n?\s*\.upload\(path/.test(bucket) &&
      publicFlags.length >= 2 &&
      publicFlags.every((f) => f === "public: false") &&
      !/getPublicUrl/.test(bucket) &&
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
      // Locked, a cancel is not about this recording any more — but while a
      // finger is on it, the system taking the gesture still discards.
      /onPointerCancel=\{\(\) => \{\s*\n\s*if \(locked\) return\s*\n\s*stop\(false\)/.test(rec) &&
      /stop\(!cancelling\)/.test(rec) &&
      /elapsed < MIN_MS/.test(rec)
    )
  })(),
)

check(
  "and it can be locked, so a long note does not need a thumb pinned to the glass",
  (() => {
    // Hold-to-talk is right for the short reply that is most voice notes and
    // wrong for the long one: a minute of speaking with a thumb pinned down is
    // uncomfortable, and a hand that slips sends whatever was said so far.
    const rec = read("components/messages/voice-recorder.tsx")
    return (
      /const LOCK_PX = \d+/.test(rec) &&
      /if \(up >= LOCK_PX && up > left\)/.test(rec) &&
      /setPhase\("locked"\)/.test(rec)
    )
  })(),
)

check(
  "up wins over left only past the threshold, so a diagonal drag cannot lock instead of cancel",
  (() => {
    // Both axes move on any real gesture, so whichever is further is the one
    // being made.
    const rec = read("components/messages/voice-recorder.tsx")
    return /up > left/.test(rec) && /const CANCEL_PX = \d+/.test(rec)
  })(),
)

check(
  "a locked recording gets two explicit controls, because it has no gesture left",
  (() => {
    // The finger is gone, so the two things you might want have to be visible
    // and separate — and one of them destroys something.
    const rec = read("components/messages/voice-recorder.tsx")
    return (
      /aria-label="Șterge înregistrarea"[\s\S]{0,200}?onClick=\{\(\) => stop\(false\)\}/.test(rec) &&
      /aria-label="Trimite înregistrarea"[\s\S]{0,200}?onClick=\{\(\) => stop\(true\)\}/.test(rec)
    )
  })(),
)

check(
  "and a press on the mic while locked starts nothing new",
  (() => {
    const rec = read("components/messages/voice-recorder.tsx")
    return /if \(!e\.isPrimary \|\| locked\) return/.test(rec)
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

// ── THE BUCKET THAT REFUSED THE VOICE NOTES ─────────────────────────────────
//
// Sending one failed with `mime type audio/webm is not supported`, and nothing
// in the voice route was wrong. The `messages` bucket is created on first use
// by whichever route gets there first, that was the PHOTO route, and it
// declared an image-only `allowedMimeTypes`. Storage enforces that list, so
// audio was refused by the bucket itself before a line of app code ran.
//
// These are DRIVEN rather than grepped. The failure was a recovery path that
// existed and never fired — `createBucket` on "bucket not found", against a
// bucket that was found — and reading the source would have shown a bucket
// fallback right there and looked fine. So a fake storage client answers the
// way the real one did, and the assertions are about what actually happens.

type Call = { name: string; args: any[] }

function fakeAdmin(uploadAnswers: Array<{ message: string } | null>) {
  const calls: Call[] = []
  let n = 0
  return {
    calls,
    admin: {
      storage: {
        from: () => ({
          upload: async (...args: any[]) => {
            calls.push({ name: "upload", args })
            return { error: uploadAnswers[n++] ?? null }
          },
        }),
        createBucket: async (...args: any[]) => {
          calls.push({ name: "createBucket", args })
          return { error: null }
        },
        updateBucket: async (...args: any[]) => {
          calls.push({ name: "updateBucket", args })
          return { error: null }
        },
      },
    } as any,
  }
}

const REFUSAL = { message: "mime type audio/webm is not supported" }

check(
  "a bucket that refuses audio/webm is widened and the upload retried",
  await (async () => {
    // The actual reported failure, end to end: the bucket exists, it is narrow,
    // and the recovery has to be a WIDENING rather than a creation.
    const { admin, calls } = fakeAdmin([REFUSAL, null])
    const { error } = await uploadMessageMedia(admin, "u/1/a.webm", new Blob(["x"]), "audio/webm")
    const widen = calls.find((c) => c.name === "updateBucket")
    return (
      error === null &&
      !!widen &&
      calls.filter((c) => c.name === "upload").length === 2 &&
      // Not createBucket. That is the path the old code had, and it is exactly
      // why the bug survived: the bucket was never missing.
      !calls.some((c) => c.name === "createBucket") &&
      widen.args[1]?.allowedMimeTypes?.includes("audio/webm") === true
    )
  })(),
  "        lib/messages/media-bucket.ts — the bucket is what refused it, so the\n" +
    "        bucket is what has to change. No code-only fix reaches it.",
)

check(
  "widening keeps photographs working, because it is additive",
  await (async () => {
    // A repair that fixed voice notes by breaking every photo would be a worse
    // bug than the one it closed, and it would ship silently.
    const { admin, calls } = fakeAdmin([REFUSAL, null])
    await uploadMessageMedia(admin, "u/1/a.webm", new Blob(["x"]), "audio/webm")
    const list: string[] = calls.find((c) => c.name === "updateBucket")?.args[1]?.allowedMimeTypes
    return (
      Array.isArray(list) &&
      list.includes("image/jpeg") &&
      list.includes("image/png") &&
      list.includes("image/heic") &&
      // And what a browser actually records into, with the codec parameter as
      // MediaRecorder writes it — storage matches these literally.
      list.includes("audio/webm;codecs=opus") &&
      list.includes("audio/mp4")
    )
  })(),
)

check(
  "an upload that succeeds does not touch the bucket configuration at all",
  await (async () => {
    // The repair must be a response to a refusal, not a thing every upload does.
    // Rewriting the bucket on every message would be a write per photo.
    const { admin, calls } = fakeAdmin([null])
    const { error } = await uploadMessageMedia(admin, "u/1/a.jpg", new Blob(["x"]), "image/jpeg")
    return error === null && calls.length === 1 && calls[0].name === "upload"
  })(),
)

check(
  "a missing bucket is still created, with the full list rather than half of it",
  await (async () => {
    const { admin, calls } = fakeAdmin([{ message: "Bucket not found" }, null])
    const { error } = await uploadMessageMedia(admin, "u/1/a.webm", new Blob(["x"]), "audio/webm")
    const made = calls.find((c) => c.name === "createBucket")
    return (
      error === null &&
      !!made &&
      made.args[1]?.allowedMimeTypes?.includes("audio/webm") === true &&
      made.args[1]?.allowedMimeTypes?.includes("image/jpeg") === true &&
      made.args[1]?.public === false
    )
  })(),
)

check(
  "and any other failure is handed back unchanged instead of guessed at",
  await (async () => {
    // Retrying a quota error against a rewritten bucket would turn one clear
    // failure into two unclear ones.
    const { admin, calls } = fakeAdmin([{ message: "Payload too large" }])
    const { error } = await uploadMessageMedia(admin, "u/1/a.webm", new Blob(["x"]), "audio/webm")
    return (
      error?.message === "Payload too large" &&
      calls.length === 1 &&
      !calls.some((c) => c.name === "createBucket" || c.name === "updateBucket")
    )
  })(),
)

check(
  "the refusal is recognised by what storage says, not by what was uploaded",
  isMimeRefusal("mime type audio/webm is not supported") &&
    isMimeRefusal("MIME type image/heic is not supported") &&
    !isMimeRefusal("Bucket not found") &&
    !isMimeRefusal(null),
)

check(
  "one allowlist, imported by both routes",
  (() => {
    // Two routes each declaring what one shared bucket accepts is a definition
    // that agrees with itself only by luck. It did not — and the way it
    // disagreed was silent until somebody sent the other kind of file.
    const voice = read(("app/api/messages/[id]/voice/route.ts"))
    return (
      /uploadMessageMedia\(admin, path, file/.test(image) &&
      /uploadMessageMedia\(admin, path, file/.test(voice) &&
      // Neither route may keep its own copy of the list or its own recovery.
      !/allowedMimeTypes/.test(image) &&
      !/allowedMimeTypes/.test(voice) &&
      !/createBucket/.test(image) &&
      !/createBucket/.test(voice) &&
      MESSAGE_MEDIA_TYPES.length > 0
    )
  })(),
)

// ── THE RECORDING STRIP, AND THE CONTROLS IT USED TO SIT ON TOP OF ──────────
//
// While recording, the strip covers the whole composer row — and the mic stays
// visible and pressable on top of it, because the mic is the gesture. So the
// strip's contents have to START after the mic. They did not: it was `px-3`
// across the full row, so the timer and the waveform were drawn underneath the
// photo button and the mic. Two sets of controls in the same pixels.

check(
  "the recording strip leaves room for the button that is drawn on top of it",
  (() => {
    const rec = read("components/messages/voice-recorder.tsx")
    const pad = Number(/pl-\[(\d+)px\]/.exec(rec)?.[1])
    // The mic is `h-11 w-11` — 44px in Tailwind's scale — and the composer row
    // gaps at 8px. Anything less than the button's own width puts the strip's
    // first element underneath it.
    const micIsW11 = /h-11 w-11 shrink-0/.test(rec)
    return micIsW11 && Number.isFinite(pad) && pad >= 44
  })(),
  "        components/messages/voice-recorder.tsx — the strip's left padding has\n" +
    "        to clear the mic, or the timer and waveform are drawn under it.",
)

check(
  "and it takes that room back once locked, because the mic is gone by then",
  (() => {
    // Locked, there is nothing left to hold: the button hides itself, and a
    // strip that kept the gap would leave a hole where a control used to be.
    const rec = read("components/messages/voice-recorder.tsx")
    return (
      /locked \? "pl-3" : "pl-\[\d+px\]"/.test(rec) &&
      /locked && "pointer-events-none opacity-0"/.test(rec) &&
      // Moved rather than snapped, or the whole row jumps at the lock.
      /transition-\[background-color,padding\]/.test(rec)
    )
  })(),
)

check(
  "the mic sits at one end of the composer, which is what makes the strip possible",
  (() => {
    // A strip cannot leave a hole in its MIDDLE for a button sitting in the way
    // of its own contents — so the button it has to clear must be at an edge.
    // This is the layout invariant the overlap violated.
    const t = read("components/messages/thread.tsx")
    const mic = t.indexOf("<VoiceRecorder")
    const photo = t.indexOf("<ImagePlus")
    return mic > -1 && photo > -1 && mic < photo
  })(),
)

check(
  "the lock affordance is above the finger rather than at the far end of the row",
  (() => {
    // It describes the mic, so it has to be over the mic. Pinned right, it was
    // at the opposite end of the row from the button it was telling you about.
    const rec = read("components/messages/voice-recorder.tsx")
    return /absolute bottom-\[\d+px\] left-1 z-30/.test(rec)
  })(),
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
