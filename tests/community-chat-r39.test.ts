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

  console.log("\nThe box, one row")
  {
    const s = code("components/community/member/chat-surface.tsx")
    check("every button is the same 40px circle with a 20px mark", /const ICON = "flex h-10 w-10 shrink-0 [^"]*\[&_svg\]:h-5 \[&_svg\]:w-5"/.test(s) && /const TOOL = `\$\{ICON\} /.test(s) && /className=\{`\$\{ICON\} hover:bg-\[#f1f2f4\]`\}\s*data-chat-attach=""/.test(s))
    check("the words are as wide as the field (the textarea's box takes the room), one line 40px tall", /wrapClassName="min-w-0 flex-1"/.test(s) && /min-h-\[38px\] pb-1\.5 pl-4 pr-1 pt-2 text-\[16px\] leading-6/.test(s) && /wrapClassName = ""/.test(code("components/community/member/mention-input.tsx")) && /className=\{`relative \$\{wrapClassName\}`\}/.test(code("components/community/member/mention-input.tsx")))
    check("the field's focus outline is an inset ring, so focusing never changes its height", /rounded-\[20px\] bg-\[#f3f4f6\] transition-\[background-color,box-shadow\] duration-150 focus-within:bg-white focus-within:shadow-\[inset_0_0_0_1px_#e3e5e8\]/.test(s) && !/data-chat-field=""[\s\S]{0,40}border border-transparent/.test(s))
    check("GIF is an icon drawn like the emoji's, at the field's right end before emoji", /function GifGlyph\(\)/.test(s) && /mark=\{<GifGlyph \/>\}/.test(s) && /mark \?\? <GifMark \/>/.test(code("components/community/member/media-gif.tsx")) && s.indexOf("<GifTool ") < s.indexOf("<ToolStandIn onPress"))
  }

  console.log("\nSent, delivered, seen")
  {
    const { messageTick, seenLineOf } = await import("@/lib/communities/chat-rules")
    const at = (min: number) => new Date(Date.UTC(2026, 9, 22, 12, min)).toISOString()
    const one = (read: number | null, delivered: number | null) => [{ read: read === null ? null : at(read), delivered: delivered === null ? null : at(delivered) }]
    check("a conversation: sent until their Storelib has it, delivered, then seen once they read past it", messageTick(at(10), one(null, null)).tick === "sent" && messageTick(at(10), one(5, 9)).tick === "sent" && messageTick(at(10), one(5, 10)).tick === "delivered" && messageTick(at(10), one(11, null)).tick === "seen")
    check("their read mark alone is delivered too (read implies delivered)", messageTick(at(10), one(12, null)).tick === "seen" && messageTick(at(10), one(12, 3)).tick === "seen")
    const group = [
      { read: at(20), delivered: at(20) },
      { read: at(5), delivered: at(15) },
      { read: null, delivered: null },
    ]
    const g = messageTick(at(10), group)
    check("a group: delivered once anybody has it, seen once everybody read it", g.tick === "delivered" && g.readers === 1 && g.of === 3 && messageTick(at(10), group.slice(0, 1)).tick === "seen" && messageTick(at(30), group).tick === "sent")
    check("the line under the last one: Seen; Seen by N; Seen by everyone; nothing before anybody read it", seenLineOf({ readers: 1, of: 1 }, false) === "Seen" && seenLineOf(g, true) === "Seen by 1" && seenLineOf({ readers: 3, of: 3 }, true) === "Seen by everyone" && seenLineOf({ readers: 0, of: 3 }, true) === "" && seenLineOf(null, false) === "")
    const s = code("components/community/member/chat-surface.tsx")
    check("each own message carries its state; a channel none", /tick=\{m\.mine && !m\.state && tickOf \? tickOf\(m\.createdAt\)\.tick : null\}/.test(s) && /p\.groupMarks \?\? \(p\.otherReadAt === undefined \? null :/.test(s) && /data-tick=\{tick\}/.test(s) && /aria-label=\{tick === "seen" \? "Seen" : "Delivered"\}/.test(s))
    const m = code("components/community/member/messages.tsx")
    check("a conversation's marks come from its kept page at once, every page, and its row over realtime; a mark never goes back", /cachedPage\(chatCacheKey\(userId, "dm", id\)\)\?\.extra/.test(m) && /onPage=\{take\}/.test(m) && /function later\(a: string \| null, b: unknown\): string \| null/.test(m))
    check("a group's marks come with its pages and follow each member's row over realtime", /groupMarks=\{marks\}/.test(m) && /"community_chat_group_members",\s*`group_id=eq\.\$\{id\}`/.test(m) && /delivered: later\(m\.delivered, row\.delivered_at\)/.test(m))
    const dms = code("app/api/community/[communityId]/dms/route.ts")
    check("delivered is written after the list's answer has gone, for its reader", /after\(\(\) => markDelivered\(db, gate\.community\.id, userId\)\)/.test(dms) && dms.indexOf("after(() => markDelivered") > dms.indexOf("requireMember("))
    const direct = code("lib/communities/server/direct.ts")
    check("the mark is one call to part 275's function, quiet before it ran", /db\.rpc\("community_mark_delivered", \{ p_community: communityId, p_user: userId \}\)/.test(direct) && /if \(error && !missing\(error\)\)/.test(direct))
    check("a conversation's newest page and catch ups carry the other's delivered mark and last heartbeat", /sp\.get\("before"\) \? Promise\.resolve\(null\) : conversationMarks\(db, conversation, gate\.viewer\)/.test(code("app/api/community/[communityId]/dms/[conversationId]/route.ts")) && /select\("a_delivered_at, b_delivered_at"\)/.test(direct) && /select\("last_seen_at"\)\.eq\("community_id", conversation\.community_id\)\.eq\("user_id", other\)/.test(direct))
    check("a group's pages carry the others' marks, without the delivered column before part 275", /sp\.get\("before"\) \? Promise\.resolve\(undefined\) : groupMarks\(db, opened, gate\.viewer\)/.test(code("app/api/community/[communityId]/groups/[groupId]/route.ts")) && /if \(error && missing\(error\)\) \(\{ data, error \} = await ask\("user_id, last_read_at"\)\)/.test(code("lib/communities/server/groups.ts")))
  }

  console.log("\nOnline, last seen, typing")
  {
    const { lastSeenLine, onlineTopic, SEEN_ONLINE_MS } = await import("@/components/community/member/chat-presence")
    const now = Date.UTC(2026, 9, 22, 15, 0)
    const off = { live: false, online: false, leftAt: null }
    check("presence says online: Online", lastSeenLine({ live: true, online: true, leftAt: null }, null, now).text === "Online")
    check("no presence: a heartbeat in the last couple of minutes is online, older is last seen", lastSeenLine(off, new Date(now - 60_000).toISOString(), now).online && lastSeenLine(off, new Date(now - SEEN_ONLINE_MS - 1000).toISOString(), now).text === "Last seen 2m ago")
    check("presence joined and they are not there: last seen, never online from an old heartbeat", lastSeenLine({ live: true, online: false, leftAt: null }, new Date(now - 30_000).toISOString(), now).text === "Last seen just now" && !lastSeenLine({ live: true, online: false, leftAt: null }, new Date(now - 30_000).toISOString(), now).online)
    check("the later of presence's leaving and the heartbeat", lastSeenLine({ live: true, online: false, leftAt: now - 5_000 }, new Date(now - 3_600_000 * 3).toISOString(), now).text === "Last seen just now")
    check("today, yesterday, a date; nothing when nothing is known", /^Last seen today at /.test(lastSeenLine(off, new Date(now - 3 * 3_600_000).toISOString(), now).text) && /^Last seen yesterday at /.test(lastSeenLine(off, new Date(now - 26 * 3_600_000).toISOString(), now).text) && /^Last seen [A-Z][a-z]{2} \d+$/.test(lastSeenLine(off, new Date(now - 9 * 86_400_000).toISOString(), now).text) && lastSeenLine(off, null, now).text === "")
    const topic = onlineTopic("6f1c2a1e-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-00000000000a")
    const sql = read("supabase/sql/run-now/275_community_chat_states.sql")
    const re = /p_topic !~ '([^']+)'/.exec(sql)?.[1] ?? ""
    check("the topic is what part 275's policy reads: online:<community>:<user>, the user at 45", !!re && new RegExp(re).test(topic) && topic.slice(44, 80) === "aaaaaaaa-0000-4000-8000-00000000000a" && topic.slice(7, 43) === "6f1c2a1e-0000-4000-8000-000000000001")
    const p = code("components/community/member/chat-presence.ts")
    check("a private channel; its own member says here while the page is visible, and leaves when hidden", /supabase\.channel\(topic, \{ config: \{ private: true, presence: \{ key: me \?\? "" \} \} \}\)/.test(p) && /if \(document\.visibilityState === "visible"\) void Promise\.resolve\(channel\.track\(/.test(p) && /channel\.untrack\(\)/.test(p))
    check("one channel per topic for the page, kept a moment after the last user leaves", /const WATCHED = new Map<string, Watch>\(\)/.test(p) && /if \(mine\.users > 0 \|\| WATCHED\.get\(topic\) !== mine\) return/.test(p))
    const m = code("components/community/member/messages.tsx")
    check("every member page with messages on says its member is here", /useBeHere\(communityId, userId, initial !== null\)/.test(m))
    check("the header: typing, else online or last seen, else the @name, on one line of fixed height; a dot on the picture while online", /\{typing \? "typing" : status \|\| \(other\.username \? `@\$\{other\.username\}` : ""\)\}/.test(m) && /block h-4 truncate text-\[12px\] leading-4/.test(m) && /data-online-dot=""/.test(m))
    check("typing reaches the header from the chat (and stays above the box)", /onTypingChange=\{setTyping\}/.test(m) && /onTypingChange\?\.\(typingKey \? typingKey\.split\("\\u0000"\) : \[\]\)/.test(code("components/community/member/chat-surface.tsx")) && /data-chat-typing=""/.test(code("components/community/member/chat-surface.tsx")))
  }

  console.log("\nThe panel coming and going")
  {
    const m = code("components/community/member/messages.tsx")
    check("a computer: opacity, translate and scale from its top right corner, eased", /origin-top-right[^`]*transition-\[opacity,translate,scale\] ease-sheet/.test(m) && /"-translate-y-2 scale-\[0\.98\] opacity-0"/.test(m) && /"translate-y-0 scale-100 opacity-100"/.test(m))
    check("a phone: a full screen sheet from the foot, as every screen over the community", /transition-\[translate,opacity\] ease-sheet/.test(m) && /"translate-y-full motion-reduce:opacity-0"/.test(m))
    check("never a keyframe slide on the panel any more, and reduced motion keeps only the fade", !/animate-in slide-in-from-right duration-\[240ms\]/.test(m) && !/animate-out fade-out-0 slide-out-to-right-3/.test(m) && /motion-reduce:translate-y-0 motion-reduce:scale-100/.test(m))
    check("its first frame is drawn at the start, then it moves; it goes a beat after the motion ends", /void box\.current\?\.getBoundingClientRect\(\)\s*const raf = requestAnimationFrame\(\(\) => setPhase\("in"\)\)/.test(m) && /\(phone \? SHEET_OUT_MS : EXIT_MS\) \+ 40/.test(m))
  }

  console.log("\nOpening a conversation from a profile")
  {
    const m = code("components/community/member/messages.tsx")
    check("hovered, touched or focused: the conversation found without making one, with its newest page, once a person", /api<[^>]*>\(`\$\{apiBase\(communityId\)\}\/dms\?with=\$\{encodeURIComponent\(userId\)\}`\)/.test(m) && /WARMED\.has\(key\)/.test(m) && /keepAnswered\(chatCacheKey\(me, "dm", r\.data\.conversation\.id\), r\.data\.page\)/.test(m))
    check("pressed cold: its header at once from the person the button knew, made or found with its page in one answer", /setView\(\{ kind: "opening", other: start\.person \?\? null \}\)/.test(m) && /\{ body: \{ userId, page: true \} \}/.test(m) && /setView\(\{ kind: "thread", id: c\.id, other: c\.other \?\? start\.person \?\? null, still: true \}\)/.test(m))
    check("the conversation takes the opening's place without sliding", /\$\{still \? "" : slideClass\(back\)\}/.test(m))
    const profile = code("components/community/member/member-profile.tsx")
    check("the profile's and the members list's Message buttons ask ahead", /onPointerEnter=\{data\.message\.can \? \(\) => warmConversation\(community\.id, null, person\.userId\) : undefined\}/.test(profile) && /onTouchStart=\{data\.message\.can/.test(profile) && /warmConversation\(communityId, null, m\.userId\)/.test(code("components/community/member/members.tsx")))
    const dms = code("app/api/community/[communityId]/dms/route.ts")
    check("GET ?with= reads only (the member's gate first, nothing made, no starting count)", dms.indexOf('searchParams.get("with")') > dms.indexOf('requireMember(db, communityId, await sessionUserId(), "view")') && /findConversation\(db, gate\.community, gate\.viewer, withId\)/.test(dms) && dms.indexOf("findConversation(") < dms.indexOf("export async function POST"))
    check("POST still checks who may write and counts starting, then adds the page when asked", dms.indexOf('rateBucket("dmOpen")') < dms.indexOf("openConversation(") && /body\?\.page === true \? await conversationOf\(db, gate\.community, gate\.viewer, result\.value\.id\) : null/.test(dms))
    const direct = code("lib/communities/server/direct.ts")
    check("finding never makes a conversation and stays in the community and the pair", /export async function findConversation[\s\S]{0,700}\.eq\("community_id", community\.id\)\.eq\("user_a", pair\.user_a\)\.eq\("user_b", pair\.user_b\)\.maybeSingle\(\)/.test(direct) && !/export async function findConversation[\s\S]{0,700}\.insert\(/.test(direct))
  }

  console.log("\nPictures in a bubble")
  {
    const s = code("components/community/member/chat-surface.tsx")
    check("the one just sent from the file picked; any other from the optimizer at the bubble's width, with a srcset; a GIF as it is", /const local = localPicture\(a\.url\)\s*if \(local\) return \{ src: local, srcSet: undefined \}/.test(s) && /optimizedSrcSet\(a\.url, widths\)/.test(s) && /pictureSources\(a, 300, \[384, 640, 828\]\)/.test(s) && /pictureSources\(a, 150, \[256, 384\]\)/.test(s) && /if \(a\.type === "gif" \|\| isGifPicture\(a\)\) return \{ src: a\.url, srcSet: undefined \}/.test(s))
  }

  console.log("\nSent while it uploads")
  {
    const s = code("components/community/member/chat-surface.tsx")
    check("Send is pressable while pictures go up (only a failed tile is left behind)", /const canSend = editing \? !!text\.trim\(\) \|\| !!editing\.attachments\.length : !!text\.trim\(\) \|\| live\.length > 0/.test(s) && /setTray\(\(cur\) => cur\.filter\(\(t\) => t\.failed\)\)/.test(s))
    check("the bubble draws the picture picked, at its shape, until the upload's answer takes its place; then it is posted", /onSend\(text, \[\.\.\.live\.map\(\(t\) => t\.media \?\? placeholderOf\(t\)\), \.\.\.link\], finish\)/.test(s) && /img\.onload = \(\) => setTray/.test(s) && /const real = item\.upload \? await item\.upload\(again\) : null/.test(s) && /void post\(next\)/.test(s))
    check("an upload that failed: Not sent, and trying again uploads it once more", /error: "A picture or file did not upload\. Try again\."/.test(s) && /\(again \? await upload\(live\[i\]\.file, live\[i\]\.kind,/.test(s))
  }

  console.log("\nPart 275")
  {
    const P = "supabase/sql/run-now/275_community_chat_states.sql"
    const sql = read(P)
    check("its migration is the same bytes", read("supabase/migrations/20270212_community_chat_states.sql") === sql)
    check("delivered marks on conversations and group members", /ALTER TABLE public\.community_conversations ADD COLUMN IF NOT EXISTS a_delivered_at timestamptz, ADD COLUMN IF NOT EXISTS b_delivered_at timestamptz;/.test(sql) && /ALTER TABLE public\.community_chat_group_members ADD COLUMN IF NOT EXISTS delivered_at timestamptz;/.test(sql))
    check("the mark writes only where something newer from somebody else waits (one realtime update per new message)", (sql.match(/last_author_id IS DISTINCT FROM p_user AND \((a_|b_|gm\.)delivered_at IS NULL OR (a_|b_|gm\.)delivered_at < (g\.)?last_message_at\)/g) ?? []).length === 3)
    check("server only: the mark is for the service role alone; definer functions with their search path", /REVOKE ALL ON FUNCTION public\.community_mark_delivered\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.community_mark_delivered\(uuid, uuid\) TO service_role;/.test(sql) && (sql.match(/SECURITY DEFINER SET search_path = public/g) ?? []).length === 2)
    check("presence: members may watch a member's topic, only that member may say they are here, in a live community with chat on", /IF p_write AND v_user <> auth\.uid\(\) THEN RETURN false; END IF;/.test(sql) && /k\.deleted_at IS NULL AND k\.suspended_at IS NULL AND k\.chat_enabled/.test(sql) && /public\.community_role_of\(v_community, auth\.uid\(\)\) IS NOT NULL AND public\.community_role_of\(v_community, v_user\) IS NOT NULL/.test(sql) && /FOR SELECT TO authenticated USING \(realtime\.messages\.extension = ''presence'' AND public\.community_online_topic_ok\(realtime\.topic\(\), false\)\)/.test(sql) && /FOR INSERT TO authenticated WITH CHECK \(realtime\.messages\.extension = ''presence'' AND public\.community_online_topic_ok\(realtime\.topic\(\), true\)\)/.test(sql))
    check("safe to run again, one statement per line, the note first", sql.split("\n")[0].startsWith("/*") && sql.trimEnd().endsWith("notify pgrst, 'reload schema';") && /DROP POLICY IF EXISTS "storelib member online read"/.test(sql) && /CREATE OR REPLACE FUNCTION public\.community_mark_delivered/.test(sql))
    check("a README row and a check column", read("supabase/sql/run-now/README.md").includes("| `275_community_chat_states.sql` |") && /as p275_community_chat_states;/.test(read("supabase/sql/run-now/99_check_after.sql")))
    const copy = [sql, code("components/community/member/chat-surface.tsx"), code("components/community/member/messages.tsx"), code("components/community/member/chat-presence.ts"), code("lib/communities/chat-rules.ts")].join("\n")
    check("copy: no em dash, no banned word", !/—/.test(copy) && !/\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(copy))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
