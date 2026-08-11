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

import { existsSync, readFileSync } from "node:fs"
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

console.log("\nWhat two removed features left behind")

check(
  "rows from a deleted feature are recognised, not printed raw",
  (() => {
    // Voice notes and calls are gone. Their ROWS are not and cannot be: people
    // sent those messages. Both were stored as an ordinary text body behind a
    // sentinel, so with the decoders deleted they would render as a control
    // character followed by `storelib:voice` and a storage path, straight into
    // somebody's chat history. Gibberish in a conversation is a worse outcome
    // than the feature having been removed.
    const legacy = read("lib/messages/legacy-media.ts")
    const thread = read("lib/messages/thread.ts")
    const list = read("lib/messages/list.ts")
    return (
      /export function legacyMediaKind/.test(legacy) &&
      /legacyMediaKind\(m\.body\)/.test(thread) &&
      /legacyMediaKind\(m\.body\)/.test(list)
    )
  })(),
  "        lib/messages/legacy-media.ts — deleting the rows was the alternative\n" +
    "        and is worse: it rewrites two people's history silently.",
)

check(
  "and the app no longer carries either feature",
  (() => {
    // A removal that leaves the routes behind is not a removal.
    const gone = [
      "lib/calls/protocol.ts",
      "lib/calls/peer.ts",
      "components/calls/call-host.tsx",
      "components/messages/voice-recorder.tsx",
      "components/messages/voice-bubble.tsx",
      "lib/messages/voice-message.ts",
      "lib/messages/call-message.ts",
      "app/api/calls/ring/route.ts",
      "app/api/messages/[id]/voice/route.ts",
    ]
    const left = gone.filter((f) => existsSync(join(root, f)))
    if (left.length) console.log(`        still present: ${left.join(", ")}`)
    return left.length === 0
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

const REFUSAL = { message: "mime type image/avif is not supported" }

check(
  "a bucket that refuses a type has its list cleared and the upload retried",
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
  "the image route does not configure the shared bucket itself",
  (() => {
    // There used to be two routes writing into this bucket and each declaring
    // what it accepts, which is one definition in two places agreeing only by
    // luck — and it did not, which is what the widen-and-retry above exists to
    // repair. One of the two is gone now; the rule it broke stands.
    return (
      /uploadMessageMedia\(admin, path, file/.test(image) &&
      !/allowedMimeTypes/.test(image) &&
      !/createBucket/.test(image) &&
      // The real gate, still there: what the bytes are, not what was claimed.
      /function sniff\(/.test(image)
    )
  })(),
)

check(
  "opening a conversation does not wait for storage and the database in series",
  (() => {
    // The signed links used to be minted AFTER the listing, the profiles and the
    // system id had all come back — two waits in a row that have nothing to say
    // to each other. Storage does not care what the listing is called and the
    // listing does not care what the photographs are, so on a phone that was one
    // extra round trip before the first picture could begin downloading.
    const t = read("lib/messages/thread.ts")
    const signAt = t.indexOf("const signing = paths.length")
    const barrierAt = t.indexOf("] = await Promise.all([\n    convo.listing_id")
    return (
      signAt > 0 &&
      barrierAt > signAt &&
      // Awaited WITH the rest rather than after it.
      /systemId, \{ data: signed \}\] = await Promise\.all\(\[/.test(t) &&
      // And nothing awaits storage on its own any more.
      !/await admin\.storage\.from\("messages"\)\.createSignedUrls/.test(t)
    )
  })(),
  "        lib/messages/thread.ts — work that does not depend on other work\n" +
    "        should not be queued behind it.",
)

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failed:")
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
