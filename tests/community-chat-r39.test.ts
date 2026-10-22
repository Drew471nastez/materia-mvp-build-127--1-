/**
 * ===========================================================================
 *  COMMUNITY CHAT, ROUND 39: PICTURES, THE BOX, STATES, PRESENCE, MOTION
 * ===========================================================================
 * The owner: "pictures don't work to be added into chats", "look how ugly
 * the GIF/emoji buttons sit", "message sending, seen and delivered states,
 * realtime typing, online state", "the appearing and disappearing of the
 * chat modal must feel smoother", "the chat takes too much time to load".
 *
 *   PICTURES   the cause: an upload hands the browser Storelib's address
 *              for the picture (https://storelib.com/media/product-images/
 *              ...), and the chat's and the comments' folder checks read only
 *              storage's own, so every picture was refused as "Upload it
 *              again". Both addresses are read now, the folder still holds;
 *              pictures and files sent in conversations and groups are kept
 *              by the daily sweep like a channel's
 *   BOX        one row: attach, the field (the words as wide as it, then GIF
 *              and emoji as equal icon buttons at its right end), Send; every
 *              target 40px on the field's middle
 *   STATES     sending, sent, delivered, seen per own message, from the other
 *              side's marks (part 275: delivered marks written when their
 *              list is read, read marks as before); groups say Seen by N
 *   PRESENCE   a private realtime presence topic per member and community
 *              (online:<community>:<user>), joined by its member's pages and
 *              watched by whoever has their conversation open; part 275's
 *              policy lets only members read it and only its member write it
 *   MOTION     the panel comes and goes with opacity, translate and scale,
 *              never transform; reduced motion keeps the fade only
 *   SPEED      the conversation asked for when the pointer rests on Message;
 *              opened from a profile, its header and kept page draw at once
 *
 * Measured in scripts/check-community-chat-r39.mjs.
 *
 * Run with: npx tsx --conditions=react-server tests/community-chat-r39.test.ts
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { picturePathOf } from "@/lib/communities/post-media"
import { checkChatMedia } from "@/lib/communities/server/chat-media"
import { checkCommentMedia } from "@/lib/communities/server/comments"

let failed = 0
let passed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => readCode(f)

const U = "aaaaaaaa-0000-4000-8000-00000000000a"
const C = "6f1c2a1e-0000-4000-8000-000000000001"
const NAME = "1792694881030_ewlkxo.webp"
const MEDIA = (user = U, name = NAME) => `https://storelib.com/media/product-images/${user}/community/${C}/${name}`
const STORAGE = (user = U, name = NAME) => `https://abc.supabase.co/storage/v1/object/public/product-images/${user}/community/${C}/${name}`

/** Storage as checkChatMedia asks it: a folder listing that holds the one picture uploaded. */
function storage(held: string[]) {
  return {
    storage: {
      from: () => ({
        list: async (folder: string, o: { search: string }) => ({ data: held.filter((p) => p === `${folder}/${o.search}`).map(() => ({ name: o.search, metadata: { size: 1234 } })), error: null }),
      }),
    },
  }
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co"

  console.log("\nPictures in a chat message (the cause, and the fix)")
  {
    const path = `${U}/community/${C}/${NAME}`
    check("a picture's path is read from Storelib's address as from storage's", picturePathOf(MEDIA()) === path && picturePathOf(STORAGE()) === path)
    check("only on Storelib's own host, only the picture bucket, no query", picturePathOf(`https://evil.example/media/product-images/${path}`) === null && picturePathOf(`https://storelib.com/media/other/${path}`) === null && picturePathOf(`${MEDIA()}?x=1`) === null)
    const community = { id: C, chat_enabled: true, creator_id: "c" } as never
    const viewer = { userId: U, role: "member", level: 1 } as never
    const db = storage([path]) as never
    const sent = await checkChatMedia(db, community, viewer, [{ type: "image", url: MEDIA(), w: 1600, h: 1000 }], { attachmentsEnabled: true })
    check("a picture the browser uploaded, by the address it was handed, is accepted in a chat message", sent.ok && sent.value.length === 1 && sent.value[0].type === "image", sent)
    const old = await checkChatMedia(db, community, viewer, [{ type: "image", url: STORAGE() }], { attachmentsEnabled: true })
    check("and by storage's own address, as before", old.ok)
    const theirs = await checkChatMedia(storage([`bbbbbbbb-0000-4000-8000-00000000000b/community/${C}/${NAME}`]) as never, community, viewer, [{ type: "image", url: MEDIA("bbbbbbbb-0000-4000-8000-00000000000b") }], { attachmentsEnabled: true })
    check("somebody else's picture is still refused (the folder check holds)", !theirs.ok && /Upload it again/.test((theirs as { error: string }).error))
    const gone = await checkChatMedia(storage([]) as never, community, viewer, [{ type: "image", url: MEDIA() }], { attachmentsEnabled: true })
    check("a picture that is not in storage is still refused", !gone.ok)
    const comment = await checkCommentMedia(db, community, viewer, [{ type: "image", url: MEDIA() }])
    check("a comment's picture, the same check, accepted the same way", comment.ok, comment)
    const orphans = code("lib/communities/server/orphans.ts")
    check("the daily sweep keeps pictures and files a conversation or a group message carries", /from\("community_direct_messages"\)\.select\("body, attachments"\)/.test(orphans) && /from\("community_chat_group_messages"\)\.select\("body, attachments"\)/.test(orphans) && /\["community_direct_messages", "community_chat_group_messages"\]/.test(orphans))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
