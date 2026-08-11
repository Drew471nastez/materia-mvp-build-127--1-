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

import { isMimeRefusal, uploadMessageMedia } from "@/lib/messages/media-bucket"

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
    // where the bucket is now configured — and there is exactly ONE such
    // configuration, used by both the create and the repair, so a bucket cannot
    // be made private and then handed back public by whichever path ran second.
    const route = read(("app/api/messages/[id]/voice/route.ts"))
    const bucket = read(("lib/messages/media-bucket.ts"))
    const publicFlags = bucket.match(/public: (true|false)/g) ?? []
    return (
      /\.from\(MESSAGES_BUCKET\)\s*\n?\s*\.upload\(path/.test(bucket) &&
      publicFlags.length === 1 &&
      publicFlags[0] === "public: false" &&
      /createBucket\(MESSAGES_BUCKET, BUCKET_CONFIG\)/.test(bucket) &&
      /updateBucket\(MESSAGES_BUCKET, BUCKET_CONFIG\)/.test(bucket) &&
      !/getPublicUrl/.test(bucket) &&
      !/getPublicUrl/.test(route) &&
      // And the SQL that declares it says the same thing.
      /'messages',\s*\n\s*'messages',\s*\n\s*false,/.test(sql)
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
// in the voice route was wrong. The `messages` bucket is declared in SQL, with
// an image-only `allowed_mime_types` written when photographs were the only
// attachment — so storage refused every voice note before a line of app code
// ran, and `on conflict do update` means re-running that SQL re-imposes it.
//
// The SQL is therefore the fix, and these assertions guard it in both places it
// can regress: the declaration, and the runtime repair for databases the new
// declaration has not been run against yet.

check(
  "the messages bucket does not gate on a type list the next attachment kind will fail",
  (() => {
    // An image-only array is what refused audio. A longer array would refuse
    // whatever comes third, in a place nobody looks, with an error that blames
    // the upload — and it would have to be kept in step with the app's own
    // sniffing, which is the check that actually looks at the bytes.
    const decl = /insert into storage\.buckets[\s\S]*?'messages',[\s\S]*?\n\)/.exec(sql)?.[0] ?? ""
    return (
      decl.length > 0 &&
      !/array\[[^\]]*image\//.test(decl) &&
      // NULL is how storage spells "no restriction". Written explicitly, so the
      // column is CLEARED on re-run rather than left at whatever is there.
      /\n\s*null\n\)/.test(decl) &&
      /allowed_mime_types = excluded\.allowed_mime_types/.test(sql)
    )
  })(),
  "        supabase/sql/RUN_MESSAGING_ALL.sql — the bucket's own list is what\n" +
    "        refused audio/webm, and re-running this file re-imposes it.",
)

// The rest are DRIVEN rather than grepped. The first attempt at this fix failed
// as a recovery path that existed and did not work, and reading the source
// showed a bucket repair sitting right there looking correct. So a fake storage
// client answers the way the real one did, and the assertions are about what
// actually happens when it does.

type Call = { name: string; args: any[] }

function fakeAdmin(
  uploadAnswers: Array<{ message: string } | null>,
  repairError?: { message: string },
) {
  const calls: Call[] = []
  let n = 0
  const bucketOp = (name: string) => async (...args: any[]) => {
    calls.push({ name, args })
    return { error: repairError ?? null }
  }
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
        createBucket: bucketOp("createBucket"),
        updateBucket: bucketOp("updateBucket"),
      },
    } as any,
  }
}

const REFUSAL = { message: "mime type audio/webm is not supported" }

check(
  "a bucket that refuses audio/webm has its list cleared and the upload retried",
  await (async () => {
    // The actual reported failure, end to end: the bucket exists, its list is
    // narrow, and the recovery has to be an UPDATE rather than a creation.
    const { admin, calls } = fakeAdmin([REFUSAL, null])
    const { error } = await uploadMessageMedia(admin, "u/1/a.webm", new Blob(["x"]), "audio/webm")
    const fix = calls.find((c) => c.name === "updateBucket")
    return (
      error === null &&
      !!fix &&
      calls.filter((c) => c.name === "upload").length === 2 &&
      // Not createBucket: the bucket was never missing, which is why the
      // original "bucket makes itself" fallback never fired.
      !calls.some((c) => c.name === "createBucket") &&
      // Cleared, not lengthened. A longer list is the same trap one attachment
      // kind further on.
      fix.args[1]?.allowedMimeTypes === null &&
      fix.args[1]?.public === false
    )
  })(),
  "        lib/messages/media-bucket.ts — the bucket is what refused it, so the\n" +
    "        bucket is what has to change. No code-only fix reaches it.",
)

check(
  "a repair that itself fails is reported as a repair that failed",
  await (async () => {
    // THE DEFECT IN THE FIRST ATTEMPT AT THIS FIX. It ignored what the repair
    // returned, so a repair that could not run came back as the upload's own
    // refusal — the identical sentence, sending somebody looking in the identical
    // wrong place, with a fix in the tree that appeared to have done nothing.
    const { admin } = fakeAdmin([REFUSAL, REFUSAL], { message: "insufficient privileges" })
    const { error } = await uploadMessageMedia(admin, "u/1/a.webm", new Blob(["x"]), "audio/webm")
    return (
      !!error &&
      error.message !== REFUSAL.message &&
      error.message.includes("insufficient privileges") &&
      // And it names what to do about it, since nobody reading a toast can
      // guess that the answer is in a .sql file.
      error.message.includes("RUN_MESSAGING_ALL.sql")
    )
  })(),
)

check(
  "an upload that succeeds does not touch the bucket configuration at all",
  await (async () => {
    // The repair must be a response to a refusal, not a thing every upload does.
    // Rewriting the bucket on every message would be a write per photograph.
    const { admin, calls } = fakeAdmin([null])
    const { error } = await uploadMessageMedia(admin, "u/1/a.jpg", new Blob(["x"]), "image/jpeg")
    return error === null && calls.length === 1 && calls[0].name === "upload"
  })(),
)

check(
  "a missing bucket is still created, and created private and ungated",
  await (async () => {
    // Same configuration as the SQL declares, or the bucket a fresh deployment
    // makes for itself differs from the bucket the SQL makes, and only one of
    // them gets tested.
    const { admin, calls } = fakeAdmin([{ message: "Bucket not found" }, null])
    const { error } = await uploadMessageMedia(admin, "u/1/a.webm", new Blob(["x"]), "audio/webm")
    const made = calls.find((c) => c.name === "createBucket")
    return (
      error === null &&
      !!made &&
      made.args[1]?.allowedMimeTypes === null &&
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
  "one uploader, and neither route configures the shared bucket itself",
  (() => {
    // Two routes each deciding what one shared bucket accepts is a definition
    // that agrees with itself only by luck. The bytes are still checked per
    // route — that is the gate that reads the file rather than its label.
    const voice = read(("app/api/messages/[id]/voice/route.ts"))
    return (
      /uploadMessageMedia\(admin, path, file/.test(image) &&
      /uploadMessageMedia\(admin, path, file/.test(voice) &&
      !/allowedMimeTypes/.test(image) &&
      !/allowedMimeTypes/.test(voice) &&
      !/createBucket/.test(image) &&
      !/createBucket/.test(voice) &&
      // The real gate, still in both: what the bytes are, not what was claimed.
      /function sniff\(/.test(image) &&
      /function sniff\(/.test(voice)
    )
  })(),
)

// ── A SENT VOICE NOTE HAS TO BE VISIBLE, AND HAS TO STOP SENDING ────────────
//
// Both of these shipped broken together, and the screenshot of them was a row
// with a timestamp and nothing above it, reading "Se trimite…" for ever.

const threadTsx = read("components/messages/thread.tsx")

/** The `m.kind === "voice"` arm of the render chain, and nothing else. */
const voiceArm = /m\.kind === "voice" \? \([\s\S]*?\) : m\.kind === "image" \?/.exec(threadTsx)?.[0] ?? ""
/** The body of sendVoice, so a match cannot come from sendImage next door. */
const sendVoiceFn =
  /const sendVoice = useCallback\([\s\S]*?\n  const sendImage = useCallback\(/.exec(threadTsx)?.[0] ?? ""
/**
 * The same, with the prose taken out.
 *
 * An assertion that something is ABSENT has to read code and not comments —
 * this one first failed on the comment explaining why the thing it forbids was
 * removed, which is a test marking its own fix as the bug.
 */
const sendVoiceCode = sendVoiceFn.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

check(
  "a voice note is drawn on a bubble, like every other kind of message",
  (() => {
    // VoiceBubble draws itself for a COLOURED ground — white play button, white
    // bars, white text when the message is yours. The arm rendering it had no
    // ground at all, so a sent voice note was white on white: the row showed a
    // timestamp and nothing above it.
    return (
      voiceArm.length > 0 &&
      /msg-bubble/.test(voiceArm) &&
      /bg-\[#7c3aed\]/.test(voiceArm) &&
      /bg-neutral-100/.test(voiceArm)
    )
  })(),
  "        components/messages/thread.tsx — the voice arm needs the same bubble\n" +
    "        ground as text and images, or `mine` renders white on white.",
)

check(
  "the send swaps its own optimistic row rather than leaving it to a refetch",
  (() => {
    // `load` KEEPS every pending row on purpose — a poll that landed mid-send
    // would otherwise eat a message still in flight. So a sender that hands its
    // temp row to `load()` to retire has handed it to the one function that
    // cannot: the row is re-appended by the call meant to remove it and sits at
    // "Se trimite…" for ever, with the real message beside it.
    return (
      sendVoiceCode.length > 0 &&
      /m\.id === tempId/.test(sendVoiceCode) &&
      /kind: "voice" as const/.test(sendVoiceCode) &&
      !/\bload\(\)/.test(sendVoiceCode)
    )
  })(),
  "        components/messages/thread.tsx — sendVoice must replace tempId with\n" +
    "        the server's row itself, exactly as sendImage does.",
)

check(
  "and the recording that is already on screen keeps playing after the swap",
  (() => {
    // The stored row's URL is signed and behind a network fetch; the blob is in
    // memory. Revoking it at the swap would break the src just committed to.
    return (
      /blobs\.current\.push\(localUrl\)/.test(sendVoiceFn) &&
      /voice: \{ path: localUrl, ms, peaks \}/.test(sendVoiceFn) &&
      // Recorded as seen in the same breath, or the bubble plays its entrance a
      // second time for one send.
      /seen\.current\?\.add\(message\.id\)/.test(sendVoiceFn)
    )
  })(),
)

check(
  "an answer with no message in it is a failure, not a bubble stuck half-sent",
  (() => {
    // A 200 with an unexpected body would otherwise swap `undefined` into the
    // row and leave something unreadable on screen.
    return /if \(!res\.ok \|\| !data\?\.message\)/.test(sendVoiceFn)
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
