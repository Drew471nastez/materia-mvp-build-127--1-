/**
 * ===========================================================================
 *  ASK STORELIB: A SENT PICTURE IS A PICTURE, NOW AND AFTER A RELOAD
 * ===========================================================================
 * "In Ask Storelib the images are not displaying in the chat conversation.
 * It just says the text 'an image attached'."
 *
 * Why it did: the pictures were kept in a bucket and a table that were only
 * ever created by sql/20260924_theme_chat_attachments.sql, which is not one
 * of the parts the owner runs (supabase/sql/run-now). So every picture was
 * dropped without a word on the way in, and read back the thread had
 * nothing but the note the route keeps ("[an image attached]"), which it
 * printed as the message. Now:
 *
 *   NOTE        one writer and one reader of the note; it is never text
 *   RESTORE     a question read back: its words, its pictures, a count of
 *               the ones that did not come back, drawn as tiles
 *   STORE       pictures kept against their message, all at once; a
 *               missing bucket or table is "not_set_up", not silence; only
 *               this install's own paths are ever signed
 *   SAY SO      the route streams what it could not keep; the read says
 *               whether pictures can be read; the chat says it plainly
 *   DATABASE    run-now part 34: the private bucket, the table, a read only
 *               policy, one statement per line, in 99 and the README
 *   THREAD      thumbnails that open in the viewer, a tile where one is
 *               gone or fails to load
 *
 * The real thumbnails, live and after a reload, are measured in a browser
 * by scripts/check-ask-ai.mjs (PICTURES).
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { pictureNote, readPictureNote, withPictureNote } from "../lib/website-builder/ask-attach"
import { promptForPictures, restoreExchanges, type StoredMessage } from "../lib/website-builder/ask-restore"
import { attachmentsFor, keepImages, pathOnInstall, type StoreClients } from "../lib/website-builder/agent/attachment-store"
import { isMissingBucket, isMissingTable } from "../lib/website-builder/agent/db-errors"
import { titleFrom } from "../lib/website-builder/agent/chat"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (name: string) => console.log(`\n${name}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const INSTALL = "aaaaaaaa-0000-4000-8000-0000000000e1"
const OTHER = "bbbbbbbb-0000-4000-8000-0000000000e2"

/* ── a fake database and bucket ──────────────────────────────────────── */

type Row = Record<string, unknown>
interface Fake {
  rows: Row[]
  objects: Set<string>
  uploads: string[]
  inserts: number
  removed: string[]
  missingTable?: boolean
  missingBucket?: boolean
  failInsert?: boolean
  signedFor?: string[]
}

function fake(state: Partial<Fake> = {}, owned: string[] = [INSTALL]): { f: Fake; clients: StoreClients } {
  const f: Fake = { rows: [], objects: new Set(), uploads: [], inserts: 0, removed: [], ...state }
  const table = (visible: (row: Row) => boolean) => ({
    select: () => {
      const filters: ((row: Row) => boolean)[] = []
      const q = {
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q },
        in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q },
        then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
          resolve(f.missingTable ? { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.theme_chat_attachments' in the schema cache" } } : { data: f.rows.filter((r) => visible(r) && filters.every((x) => x(r))), error: null }),
      }
      return q
    },
    insert: async (rows: Row[]) => {
      f.inserts++
      if (f.missingTable) return { error: { code: "42P01", message: 'relation "public.theme_chat_attachments" does not exist' } }
      if (f.failInsert) return { error: { code: "23503", message: "violates foreign key constraint" } }
      f.rows.push(...rows.map((r, i) => ({ id: `row-${f.rows.length + i}`, ...r })))
      return { error: null }
    },
  })
  const storage = {
    from: () => ({
      upload: async (path: string) => {
        f.uploads.push(path)
        if (f.missingBucket) return { data: null, error: { message: "Bucket not found", statusCode: "404" } }
        f.objects.add(path)
        return { data: { path }, error: null }
      },
      remove: async (paths: string[]) => { f.removed.push(...paths); paths.forEach((p) => f.objects.delete(p)); return { data: [], error: null } },
      createSignedUrls: async (paths: string[]) => {
        f.signedFor = paths
        if (f.missingBucket) return { data: null, error: { message: "Bucket not found", statusCode: "404" } }
        return { data: paths.map((p) => ({ path: p, signedUrl: f.objects.has(p) ? `https://x.supabase.co/storage/v1/object/sign/theme-chat-attachments/${p}?token=t` : null, error: f.objects.has(p) ? null : "not found" })), error: null }
      },
    }),
  }
  return {
    f,
    clients: {
      user: { from: () => table((r) => owned.includes(String(r.install_id))), storage },
      admin: { from: () => table(() => true), storage },
    },
  }
}

const png = (name = "shot.png") => ({ mediaType: "image/png" as const, data: Buffer.from("not really a png").toString("base64"), name })

async function main() {
  // ---------------------------------------------------------------------------
  section("The note is written once and read once, and never shown as text")
  // ---------------------------------------------------------------------------
  {
    check("one picture, and three", pictureNote(1) === "[an image attached]" && pictureNote(3) === "[3 images attached]" && pictureNote(0) === "")
    check("after the words, as the transcript stores them", withPictureNote("Build this", 1) === "Build this\n\n[an image attached]" && withPictureNote("  ", 2) === "[2 images attached]" && withPictureNote("Hi", 0) === "Hi")
    const back = readPictureNote(withPictureNote("Make the hero like this", 2))
    check("read back: the words, and the count", back.text === "Make the hero like this" && back.count === 2, JSON.stringify(back))
    check("a picture with no words reads as none, one", JSON.stringify(readPictureNote("[an image attached]")) === '{"text":"","count":1}')
    check("words with no note are words", JSON.stringify(readPictureNote("Make it blue")) === '{"text":"Make it blue","count":0}')
    check("the history's name for a chat leaves the note out", titleFrom("Build this\n\n[2 images attached]") === "Build this" && titleFrom("[an image attached]") === "A picture")
  }

  // ---------------------------------------------------------------------------
  section("A question read back")
  // ---------------------------------------------------------------------------
  {
    const messages: StoredMessage[] = [
      { id: "u1", role: "user", content: "Build this\n\n[2 images attached]", images: [{ id: "i1", name: "shot.png", url: "https://signed/1" }, { id: "i2", name: "two.png", url: "https://signed/2" }] },
      { id: "a1", role: "assistant", content: "Added a hero like your picture.", ops: [{ kind: "add_section", id: "h1", sectionType: "hero_split" }] },
      { id: "u2", role: "user", content: "[an image attached]", images: [] },
      { id: "a2", role: "assistant", content: "Which page?\n- Home\n- About", ops: [] },
      { id: "u3", role: "user", content: "Also this\n\n[3 images attached]", images: [{ id: "i3", name: "left.png", url: "https://signed/3" }] },
      { id: "a3", role: "assistant", content: "", error: "The edit failed.", ops: [] },
      { id: "u4", role: "user", content: "Make it blue", images: [] },
    ]
    const r = restoreExchanges(messages)
    check("one exchange per question", r.length === 4 && r.map((e) => e.messageId).join() === "u1,u2,u3,u4")
    check("its words without the note", r[0].prompt === "Build this" && r[2].prompt === "Also this" && r[3].prompt === "Make it blue")
    check("its pictures, as they came back", r[0].images.map((i) => i.url).join() === "https://signed/1,https://signed/2" && r[0].missingImages === 0)
    check("a picture sent with no words reads as it did when it was sent", r[1].prompt === promptForPictures(1) && r[1].prompt === "Build this.")
    check("and when none came back, it is one tile, not a sentence", r[1].images.length === 0 && r[1].missingImages === 1)
    check("some back and some not: the rest are tiles", r[2].images.length === 1 && r[2].missingImages === 2)
    check("a message without pictures has no tiles", r[3].images.length === 0 && r[3].missingImages === 0)
    check("the answer is paired with its question", r[0].reply === "Added a hero like your picture." && r[2].error === "The edit failed.")
    check("its changes are counted, not replayed", r[0].activity.sections.join() === "h1")
    check("a question the run asked is a question again", r[1].activity.question?.question === "Which page?" && r[1].activity.question?.options.join() === "Home,About")
    check("no prompt anywhere carries the note", !r.some((e) => /attached\]/.test(e.prompt)))
  }

  // ---------------------------------------------------------------------------
  section("Kept against their message, and said when they are not")
  // ---------------------------------------------------------------------------
  {
    const { f, clients } = fake()
    const kept = await keepImages({ installId: INSTALL, messageId: "m1", images: [png("a.png"), png("b.png"), png("c.png")] }, clients)
    check("three pictures are three objects under this install's prefix", kept.kept === 3 && kept.of === 3 && kept.problem === null && f.uploads.length === 3 && f.uploads.every((p) => pathOnInstall(p, INSTALL)))
    check("and their rows go in one write, each naming its message", f.inserts === 1 && f.rows.length === 3 && f.rows.every((r) => r.message_id === "m1" && r.install_id === INSTALL))

    const noBucket = fake({ missingBucket: true })
    const k2 = await keepImages({ installId: INSTALL, messageId: "m1", images: [png()] }, noBucket.clients)
    check("no bucket yet: not_set_up, and no row written", k2.kept === 0 && k2.problem === "not_set_up" && noBucket.f.inserts === 0)

    const noTable = fake({ missingTable: true })
    const k3 = await keepImages({ installId: INSTALL, messageId: "m1", images: [png(), png()] }, noTable.clients)
    check("no table yet: not_set_up, and the bytes it uploaded are taken back", k3.problem === "not_set_up" && noTable.f.removed.length === 2 && noTable.f.objects.size === 0)

    const badRow = fake({ failInsert: true })
    const k4 = await keepImages({ installId: INSTALL, messageId: "m1", images: [png()] }, badRow.clients)
    check("a row that fails for another reason: failed, bytes taken back", k4.problem === "failed" && badRow.f.removed.length === 1)

    const noMessage = fake()
    const k5 = await keepImages({ installId: INSTALL, messageId: null, images: [png()] }, noMessage.clients)
    check("a question that was not kept keeps no pictures: nothing would ever show them", k5.kept === 0 && noMessage.f.uploads.length === 0)
    check("nothing at all to keep is not a problem", (await keepImages({ installId: INSTALL, messageId: "m1", images: [] }, fake().clients)).problem === null)
  }

  // ---------------------------------------------------------------------------
  section("Read back as signed URLs, only this creator's, only this install's")
  // ---------------------------------------------------------------------------
  {
    const { f, clients } = fake()
    await keepImages({ installId: INSTALL, messageId: "m1", images: [png("a.png")] }, clients)
    await keepImages({ installId: INSTALL, messageId: "m2", images: [png("b.png"), png("c.png")] }, clients)
    const read1 = await attachmentsFor(INSTALL, ["m1", "m2"], clients)
    check("each message gets its own pictures, signed", read1.problem === null && read1.byMessage.get("m1")?.length === 1 && read1.byMessage.get("m2")?.length === 2 && [...read1.byMessage.values()].flat().every((p) => p.url.startsWith("https://")))
    check("with the names the creator gave them", read1.byMessage.get("m1")?.[0].name === "a.png")

    /* A row that names somebody else's bytes, however it got there. */
    f.rows.push({ id: "evil", install_id: INSTALL, message_id: "m1", storage_path: `${OTHER}/theirs.png`, media_type: "image/png", name: "theirs.png" })
    f.objects.add(`${OTHER}/theirs.png`)
    const read2 = await attachmentsFor(INSTALL, ["m1"], clients)
    check("a path under another install is never signed, whatever row names it", !(f.signedFor ?? []).some((p) => p.startsWith(OTHER)) && read2.byMessage.get("m1")?.length === 1)
    check("nor one that climbs out of the prefix", !pathOnInstall(`${INSTALL}/../${OTHER}/x.png`, INSTALL) && !pathOnInstall(`${INSTALL}/a/b.png`, INSTALL) && pathOnInstall(`${INSTALL}/1f0c.jpg`, INSTALL))

    const theirs = fake({}, [OTHER])
    theirs.f.rows.push(...f.rows)
    theirs.f.objects = f.objects
    const read3 = await attachmentsFor(INSTALL, ["m1", "m2"], theirs.clients)
    check("another creator's client reads none of them: RLS decides", read3.byMessage.size === 0)

    f.objects.delete(String(f.rows.find((r) => r.message_id === "m2")?.storage_path))
    const read4 = await attachmentsFor(INSTALL, ["m2"], clients)
    check("bytes that are gone come back as nothing for that picture, and the thread counts it as gone", read4.byMessage.get("m2")?.length === 1)

    const none = await attachmentsFor(INSTALL, ["m1"], fake({ missingTable: true }).clients)
    check("before the database update: not_set_up, not an empty answer", none.problem === "not_set_up" && none.byMessage.size === 0)
    check("no messages, no read", (await attachmentsFor(INSTALL, [], clients)).problem === null)
    check("missing things are told apart from broken ones", isMissingTable({ code: "PGRST205" }) && isMissingTable({ code: "42P01" }) && !isMissingTable({ code: "23505", message: "duplicate key" }) && isMissingBucket({ message: "Bucket not found" }) && !isMissingBucket({ message: "The resource already exists" }))
  }

  // ---------------------------------------------------------------------------
  section("The routes say what they could not keep or read")
  // ---------------------------------------------------------------------------
  {
    const route = read("app/api/website-builder/themes/[installId]/agent/route.ts")
    const chatRoute = read("app/api/website-builder/themes/[installId]/chat/route.ts")
    const chat = read("lib/website-builder/agent/chat.ts")
    check(
      "a question that could not be kept is said on the stream, with why",
      /else send\(\{ type: "unsaved", what: "chat", reason: recorded\.problem \?\? "failed" \}\)/.test(route) &&
        /if \(error \|\| !data\) return \{ id: null, problem: isMissingTable\(error\) \? "not_set_up" : "failed" \}/.test(chat),
    )
    check("and so are pictures that could not be kept", /send\(\{ type: "unsaved", what: "pictures", reason: kept\.problem, kept: kept\.kept, of: kept\.of \}\)/.test(route))
    check("the read says whether pictures can be read back", (chatRoute.match(/pictures: (all|read)\.pictures/g) ?? []).length === 2 && /pictures: pictures\.problem \?\? "ready"/.test(chat))
    check("the note is still what the transcript keeps: the model's memory reads it", /prompt: noted/.test(route))
  }

  // ---------------------------------------------------------------------------
  section("The database: run-now part 34")
  // ---------------------------------------------------------------------------
  {
    const part = read("supabase/sql/run-now/34_theme_chat_attachments.sql")
    const migration = read("supabase/migrations/20261005_theme_chat_attachments.sql")
    const lines = part.trim().split("\n")
    const lower = part.toLowerCase()
    check("a one line note, then one whole statement per line", /^\/\* .* \*\/$/.test(lines[0]) && lines.slice(1).every((l) => /;\s*$/.test(l)))
    check(
      "every statement can run twice",
      lines.slice(1).every((l) => /IF NOT EXISTS|IF EXISTS|ENABLE ROW LEVEL SECURITY|^CREATE POLICY|ON CONFLICT \(id\) DO UPDATE/.test(l)) &&
        /DROP POLICY IF EXISTS tca_own_read ON public\.theme_chat_attachments;\nCREATE POLICY tca_own_read/.test(part),
    )
    check("the bucket is private, pictures only, 3MB, and a second run keeps it private", /values \('theme-chat-attachments', 'theme-chat-attachments', false, 3145728, array\['image\/png', 'image\/jpeg', 'image\/webp', 'image\/gif'\]\) on conflict \(id\) do update set public = false/.test(lower))
    check("pictures go after thirty days, and with their website", /expires_at timestamptz not null default \(now\(\) \+ interval '30 days'\)/.test(lower) && /references public\.store_theme_installs\(id\) on delete cascade/.test(lower))
    check("indexes for the message, the collector and the website", ["theme_chat_attachments_message_idx", "theme_chat_attachments_expiry_idx", "theme_chat_attachments_install_idx"].every((i) => part.includes(i)))
    check(
      "rows are read by the creator who owns the website and written by no browser: the older allow everything policy is dropped",
      /drop policy if exists tca_own on public\.theme_chat_attachments;/.test(lower) &&
        /create policy tca_own_read on public\.theme_chat_attachments for select using \(install_id in \(select i\.id from public\.store_theme_installs i join public\.creators c on c\.id = i\.creator_id where c\.user_id = auth\.uid\(\)\)\)/.test(lower) &&
        !/for (insert|update|delete|all)/.test(lower) && /enable row level security/.test(lower),
    )
    check("no storage policy: the bytes are reached only by a signed URL", !/storage\.objects/.test(lower))
    check("the migration holds the same statements", lines.slice(1).every((l) => migration.includes(l)))
    const after = read("supabase/sql/run-now/99_check_after.sql")
    check("99 has a column that reads true only with the bucket private and the policy read only", /as p34_theme_chat_attachments\b/.test(after) && /id = 'theme-chat-attachments' and public = false/.test(after) && /cmd <> 'SELECT'/.test(after))
    const readme = read("supabase/sql/run-now/README.md")
    check("the README lists it and says what happens until it runs", /\| `34_theme_chat_attachments\.sql` \|[^\n]*Picture no longer available/.test(readme) && Number(readme.match(/Parts `01` to `(\d+)`/)?.[1] ?? 0) >= 34)
    check("and the four files carry it", read("supabase/sql/run-four/3_of_4_latest.sql").includes("-- part 34_theme_chat_attachments.sql"))
  }

  // ---------------------------------------------------------------------------
  section("The thread")
  // ---------------------------------------------------------------------------
  {
    const panel = read("components/website-builder/theme-chat.tsx")
    check("a restored conversation is read by the pure restore, not by hand", /restoreExchanges\(body\.messages\)\.map/.test(panel) && /missingImages: r\.missingImages \|\| undefined/.test(panel))
    check(
      "a picture in hand is a thumbnail that opens in the viewer",
      /data-ask-sent-image=""\s*\n\s*onClick=\{\(\) => onView\(pictures, index\)\}/.test(panel) && /<ImageViewer images=\{viewing\.images\}/.test(panel),
    )
    check(
      "one that is gone, or whose address does not load, is a tile that says so",
      /onError=\{\(\) => setBroken\(/.test(panel) && /const gone = \(exchange\.missingImages \?\? 0\) \+ \(exchange\.images\?\.length \?\? 0\) - pictures\.length/.test(panel) &&
        /data-ask-missing-image=""\s*\n\s*role="img"\s*\n\s*aria-label="Picture no longer available"/.test(panel),
    )
    check(
      "before the update, the chat says what it cannot keep, once, above the thread",
      /Chats are not saved yet\. They are kept once the database update is run\./.test(panel) &&
        /Pictures show here until you leave\. They are kept once the database update is run\./.test(panel) &&
        /if \(body\.reason === "not_set_up"\) setKeeping\(\(was\) => \(\{ \.\.\.was, chat: false \}\)\)/.test(panel) &&
        /setKeeping\(\{ chat: true, pictures: body\.pictures !== "not_set_up" \}\)/.test(panel),
    )
    check(
      "and what the stream says could not be kept lands there, or under the message",
      /if \(event\.reason === "not_set_up"\) setKeeping\(\(was\) => \(\{ \.\.\.was, \[what\]: false \}\)\)\s*\n\s*else patch\(\(e\) => \(\{ \.\.\.e, notKept: what \}\)\)/.test(panel),
    )
    check("no em dash or banned word in the new sentences", !/—/.test(panel.slice(panel.indexOf("THE PICTURES, AS PICTURES"), panel.indexOf("THE PICTURES, AS PICTURES") + 4000)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
