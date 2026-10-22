/**
 * ===========================================================================
 *  COMMUNITY CHAT, ROUND 37
 * ===========================================================================
 * Held from their inputs:
 *
 *   ORDER        one row per message however it arrives (send answer,
 *                realtime, catch up), by server time then id; pending and
 *                failed sends stay last until the server copy replaces them
 *   WHO MAY      messages between members: the admins' rule, blocks either
 *                way, the person's own choice, the team always reaching
 *                members; groups: who may start one
 *   SETTINGS     an admin's change, checked; new rules words bump the version
 *                and ask everyone again
 *   PUSH         never the sender, never a chat open on their screen, not a
 *                muted chat unless it is about them, a channel only for
 *                mentions, replies or those who asked for every message;
 *                previews off says "New message"
 *   SERVER       every chat route starts with the member gate; a group or a
 *                conversation is only the viewer's own; writes go through
 *                chatGate (chat on, no chat ban, rules); a retried send
 *                is written once (client_id)
 *   SQL          part 270: RLS on every new table, members read only their
 *                groups, typing topics checked, realtime publication guarded,
 *                its migration byte for byte, a README row and a check column
 *
 * Run with: npx tsx --conditions=react-server tests/community-chat-r37.test.ts
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import {
  DEFAULT_CHAT_SETTINGS,
  VIEWING_MS,
  attachmentLine,
  chatPushVerdict,
  chatRestriction,
  chatSettingsOf,
  chatSettingsPatch,
  cleanClientId,
  dmDecision,
  groupCreateAllowed,
  mergeMessages,
  pushPreviewText,
  rulesNeeded,
  sameBubbleGroup,
  slowModeWait,
  typingLine,
  typingTopic,
  type Orderable,
} from "@/lib/communities/chat-rules"
import { SETTINGS_TABS, settingsTabOf } from "@/components/community/creator/logic"

let failed = 0
let passed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => readCode(f)

const A = "11111111-1111-1111-1111-111111111111"
const B = "22222222-2222-2222-2222-222222222222"
const now = Date.parse("2026-10-22T12:00:00Z")

/* ── ORDER ─────────────────────────────────────────────────────────────── */
console.log("\nOrder and duplicates")
{
  type M = Orderable & { body: string }
  const m = (id: string, at: string, extra: Partial<M> = {}): M => ({ id, createdAt: at, body: id, ...extra })
  const pending = m("local-c1", "2026-10-22T12:00:09Z", { clientId: "client-0001", state: "sending" })
  const list = mergeMessages<M>([m("b", "2026-10-22T12:00:02Z"), m("a", "2026-10-22T12:00:01Z"), pending], [])
  check("settled messages by server time, a pending send last", list.map((x) => x.id).join(",") === "a,b,local-c1")
  const settled = mergeMessages<M>(list, [m("c", "2026-10-22T12:00:03Z", { clientId: "client-0001" })])
  check("the server copy replaces the pending one (same client id): no duplicate", settled.map((x) => x.id).join(",") === "a,b,c")
  const again = mergeMessages<M>(settled, [m("c", "2026-10-22T12:00:03Z"), m("b", "2026-10-22T12:00:02Z")])
  check("the same message from realtime and a catch up is one row", again.length === 3)
  const tie = mergeMessages<M>([], [m("z", "2026-10-22T12:00:05Z"), m("y", "2026-10-22T12:00:05Z")])
  check("two messages in the same instant: ordered by id, the same for everyone", tie.map((x) => x.id).join(",") === "y,z")
  const failedSend = mergeMessages<M>(settled, [{ ...pending, id: "local-c2", clientId: "client-0002", state: "failed" }])
  check("a failed send stays at the end until it is sent again", failedSend[failedSend.length - 1].id === "local-c2")
  check("client ids: 8 to 64 URL safe characters only", cleanClientId("abcdefgh") === "abcdefgh" && cleanClientId("short") === null && cleanClientId("a b c d e f g h") === null)
  check("bubbles group within five minutes, same sender, same day", sameBubbleGroup({ authorId: A, createdAt: "2026-10-22T12:00:00Z" }, { authorId: A, createdAt: "2026-10-22T12:04:00Z" }) && !sameBubbleGroup({ authorId: A, createdAt: "2026-10-22T12:00:00Z" }, { authorId: B, createdAt: "2026-10-22T12:01:00Z" }) && !sameBubbleGroup({ authorId: A, createdAt: "2026-10-22T12:00:00Z" }, { authorId: A, createdAt: "2026-10-22T12:06:00Z" }))
  check("typing words", typingLine(["Ana"]) === "Ana is typing" && typingLine(["Ana", "Ben"]) === "Ana and Ben are typing" && typingLine(["a", "b", "c"]) === "3 people are typing" && typingLine([]) === "")
  check("typing topics are the ones part 270 checks", typingTopic("space", A) === `chat:space:${A}` && typingTopic("dm", A) === `chat:dm:${A}` && typingTopic("group", A) === `chat:group:${A}`)
}

/* ── WHO MAY ───────────────────────────────────────────────────────────── */
console.log("\nWho may message whom")
{
  const d = (o: Partial<Parameters<typeof dmDecision>[0]>) => dmDecision({ policy: "everyone", senderId: A, senderRole: "member", recipientId: B, recipientRole: "member", recipientDms: "everyone", blocked: false, ...o })
  check("members message members by default", d({}).ok)
  check("never yourself", !d({ recipientId: A }).ok)
  check("off: nobody, the team included", !d({ policy: "off" }).ok && !d({ policy: "off", senderRole: "owner" }).ok)
  check("a block either way stops it", !d({ blocked: true }).ok && (d({ blocked: true }) as { reason: string }).reason === "blocked")
  check("the team only: members reach the team, not each other", !d({ policy: "staff" }).ok && d({ policy: "staff", recipientRole: "moderator" }).ok)
  check("the team reaches any member", d({ policy: "staff", senderRole: "admin" }).ok && d({ senderRole: "owner", recipientDms: "nobody" }).ok)
  check("a member's own choice: nobody, or the team only", !d({ recipientDms: "nobody" }).ok && !d({ recipientDms: "staff" }).ok && d({ recipientDms: "staff", senderRole: "moderator" }).ok)
  check("but a block still stops the team", !d({ blocked: true, senderRole: "admin" }).ok)
  check("groups: members, the team only, off", groupCreateAllowed("members", "member") && !groupCreateAllowed("staff", "member") && groupCreateAllowed("staff", "admin") && !groupCreateAllowed("off", "owner"))
  check("a chat ban, a mute in force, a mute that ended", chatRestriction({ chatBannedAt: "2026-10-01T00:00:00Z" })?.kind === "banned" && chatRestriction({ chatMutedUntil: "2026-10-22T13:00:00Z" }, now)?.kind === "muted" && chatRestriction({ chatMutedUntil: "2026-10-22T11:00:00Z" }, now) === null)
  check("slow mode: seconds left, then none", slowModeWait(now - 10_000, 30, now) === 20 && slowModeWait(now - 31_000, 30, now) === 0 && slowModeWait(null, 30, now) === 0 && slowModeWait(now, 0, now) === 0)
}

/* ── SETTINGS ──────────────────────────────────────────────────────────── */
console.log("\nAdmin settings")
{
  check("no row reads as the defaults", JSON.stringify(chatSettingsOf(null)) === JSON.stringify(DEFAULT_CHAT_SETTINGS))
  check("a stored row with a bad value falls back", chatSettingsOf({ dm_policy: "nope", groups_policy: "staff", attachments_enabled: false, rules: "Be kind", rules_version: 2 }).dmPolicy === "everyone" && chatSettingsOf({ groups_policy: "staff" }).groupsPolicy === "staff")
  const p = chatSettingsPatch({ dmPolicy: "staff", rules: "  Be kind.\r\n\r\n\r\nNo spam. " }, DEFAULT_CHAT_SETTINGS)
  check("a change is checked and cleaned; new rules bump the version", p.ok && p.next.dmPolicy === "staff" && p.next.rules === "Be kind.\n\nNo spam." && p.next.rulesVersion === 1 && p.columns.rules_version === 1)
  const same = p.ok ? chatSettingsPatch({ rules: "Be kind.\n\nNo spam." }, p.next) : null
  check("the same rules again do not ask everyone again", !!same?.ok && same.next.rulesVersion === 1)
  check("a wrong value is refused", !chatSettingsPatch({ dmPolicy: "all" }, DEFAULT_CHAT_SETTINGS).ok && !chatSettingsPatch({ pushPreviews: "yes" }, DEFAULT_CHAT_SETTINGS).ok && !chatSettingsPatch({ rules: "x".repeat(4001) }, DEFAULT_CHAT_SETTINGS).ok)
  check("rules are asked for once per version", rulesNeeded({ rules: "Be kind", rulesVersion: 2 }, null) && rulesNeeded({ rules: "Be kind", rulesVersion: 2 }, 1) && !rulesNeeded({ rules: "Be kind", rulesVersion: 2 }, 2) && !rulesNeeded({ rules: "", rulesVersion: 0 }, null))
  check("Settings has a Chat panel, and old names land on it", (SETTINGS_TABS as readonly string[]).includes("chat") && settingsTabOf("messages") === "chat" && settingsTabOf("chat") === "chat")
  const panel = code("components/community/creator/settings-section.tsx")
  check("the panel is in the one list, drawn by ChatPanel", /value: "chat"[\s\S]{0,300}<ChatPanel head=\{p\.head\} \/>/.test(panel))
  const adminRoute = code("app/api/app/community/[id]/chat/route.ts")
  check("the admin route: reads for the team, settings need manage_settings, slow mode manage_spaces, bans ban and mutes mute", /requireCreatorCommunity\(id, "view"\)/.test(adminRoute) && /requireCreatorCommunity\(id, "manage_settings"\)/.test(adminRoute) && /requireCreatorCommunity\(id, "manage_spaces"\)/.test(adminRoute) && /body\.mode === "ban" \? "ban" : "mute"/.test(adminRoute) && (adminRoute.match(/manageLimit\(/g) ?? []).length >= 3)
  const settings = code("lib/communities/server/chat-settings.ts")
  check("a chat ban or mute never reaches someone at or above the moderator's role", /ROLE_RANK\[targetRole\] >= ROLE_RANK\[actor\.role\]/.test(settings) && /action: `chat\.\$\{/.test(settings))
}

/* ── PUSH ──────────────────────────────────────────────────────────────── */
console.log("\nWhen a phone is told")
{
  const v = (o: Partial<Parameters<typeof chatPushVerdict>[0]>) => chatPushVerdict({ kind: "dm", senderId: A, recipientId: B, readAt: null, pref: null, addressed: false, now, ...o })
  check("a conversation or a group: every message", v({}) === "push" && v({ kind: "group" }) === "push")
  check("never your own message", v({ recipientId: A }) === "self")
  check("never while the chat is open on their screen", v({ readAt: new Date(now - 5_000).toISOString() }) === "viewing" && v({ readAt: new Date(now - VIEWING_MS - 1000).toISOString() }) === "push")
  check("muted: nothing, unless it names or answers them", v({ pref: { notify: "default", mutedUntil: "2026-10-22T18:00:00Z" } }) === "muted" && v({ pref: { notify: "default", mutedUntil: "2026-10-22T18:00:00Z" }, addressed: true }) === "push" && v({ pref: { notify: "none", mutedUntil: null }, addressed: true }) === "muted")
  check("a mute that ended pushes again", v({ pref: { notify: "default", mutedUntil: "2026-10-22T11:00:00Z" } }) === "push")
  check("a channel: mentions and replies by default, everything when asked", v({ kind: "space" }) === "level" && v({ kind: "space", addressed: true }) === "push" && v({ kind: "space", pref: { notify: "all", mutedUntil: null } }) === "push")
  check("previews off: only who sent it", pushPreviewText(false, "secret plans") === "New message" && pushPreviewText(true, "  hi   there ") === "hi there" && pushPreviewText(true, "", [{ type: "image" }]) === "Photo")
  check("what a message carries, in words", attachmentLine([{ type: "image" }, { type: "image" }]) === "2 photos" && attachmentLine([{ type: "file" }]) === "File" && attachmentLine([{ type: "image" }, { type: "file" }]) === "2 attachments")
  const push = code("lib/communities/server/chat-push.ts")
  check("chat pushes go through pushOne (switch, kinds, quiet hours, devices), one banner per chat", /await pushOne\(db, \{/.test(push) && /collapseKey: conversationGroup\(m\.chatId\)/.test(push) && /chatPushVerdict\(/.test(push) && /underBurst\(/.test(push))
  check("a banner carries the sender's name, where, and a short line, nothing else", /title: clip\(`\$\{m\.senderName\} in \$\{where\}`, 60\)/.test(push) && /body = clip\(pushPreviewText\(m\.previews, m\.text, m\.media\), 180\)/.test(push))
  const direct = code("lib/communities/server/direct.ts")
  check("a direct message asks directPushWanted first, after the response", /await pushSoon\(async \(\) => \{\s*if \(!\(await directPushWanted\(/.test(direct))
  const groups = code("lib/communities/server/groups.ts")
  check("a group message pushes its people after the response, opening that group", /await pushSoon\(async \(\) => \{[\s\S]*pushChatMessage\(db, \{ kind: "group"[\s\S]*url: `\/community\/\$\{community\.slug\}\?group=\$\{opened\.group\.id\}`/.test(groups))
  const chat = code("lib/communities/server/chat.ts")
  check("a channel tells the named and the answered with a bell row, and pushes the people who asked for everything", /kind: "mention"[\s\S]*dedupeKey: `mention:message:/.test(chat) && /kind: "reply"[\s\S]*dedupeKey: `reply:message:/.test(chat) && /everyMessageListeners\(db, space\.id\)/.test(chat))
  const frame = code("components/community/member/shell-frame.tsx")
  check("?group= opens the group once (a push's tap)", /search\?\.get\("group"\)/.test(frame) && /setChat\(\{ groupId: groupAsked \}\)/.test(frame))
}

/* ── SERVER ────────────────────────────────────────────────────────────── */
console.log("\nAuthorization")
{
  const routes = [
    "app/api/community/[communityId]/chat/route.ts",
    "app/api/community/[communityId]/chat/prefs/route.ts",
    "app/api/community/[communityId]/chat/blocks/route.ts",
    "app/api/community/[communityId]/chat/files/route.ts",
    "app/api/community/[communityId]/groups/route.ts",
    "app/api/community/[communityId]/groups/[groupId]/route.ts",
    "app/api/community/[communityId]/groups/[groupId]/read/route.ts",
    "app/api/community/[communityId]/groups/[groupId]/messages/[messageId]/route.ts",
  ]
  /* Changed on purpose (round 37 merge): each route shows its gate in its own body (communities-security reads it there), the rate limit by chatLimit. */
  const ungated = routes.filter((f) => {
    const s = code(f)
    const handlers = (s.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length
    return handlers === 0 || (s.match(/const off = await requireCommunitiesOn\(\)\s*if \(off\) return off/g) ?? []).length !== handlers || (s.match(/const gate = await requireMember\(db, communityId, await sessionUserId\(\), "(view|chat)"\)\s*if \(gate instanceof NextResponse\) return gate/g) ?? []).length !== handlers
  })
  check("every new member route starts with the member gate (communities on, active member, rate limit)", ungated.length === 0, ungated)
  const helper = code("lib/communities/server/chat-routes.ts")
  check("  and the rate limit is chatLimit, which is rateLimit by the member", /export async function chatLimit\(gate: ChatRouteGate, bucket: RateBucket\)/.test(helper) && /rateLimit\(\{ bucket: rateBucket\(bucket\)/.test(helper))
  const groupRoutes = routes.filter((f) => f.includes("[groupId]")).map(code)
  check("every group route opens only a group the viewer is in", groupRoutes.every((s) => s.split("export async function").slice(1).every((h) => /const opened = await groupOf\(db, gate\.community, gate\.viewer, groupId\)\s*if \(!opened\) return notFound\(\)/.test(h))))
  const writes = ["app/api/community/[communityId]/groups/route.ts", "app/api/community/[communityId]/groups/[groupId]/route.ts"].map(code)
  check("sends and group changes need the chat action (a community mute or ban stops them)", writes.every((s) => /requireMember\(db, communityId, await sessionUserId\(\), "chat"\)[\s\S]{0,120}chatLimit\(gate, "(groupMake|dm|groupChange)"\)/.test(s)))
  const groups = code("lib/communities/server/groups.ts")
  check("groupOf needs the viewer's own membership row and an open group", /\.eq\("group_id", groupId\)\.eq\("user_id", viewer\.userId\)/.test(groups) && /group\.archived_at \|\| !m/.test(groups))
  check("group writes go through chatGate; people added are active members nobody blocked", (groups.match(/await chatGate\(db, community, viewer\)/g) ?? []).length >= 3 && /blockedAmong\(db, by, list\)/.test(groups) && /states\.get\(id\)\?\.active/.test(groups))
  check("only the owner or the team rename, add and remove", /if \(!managesGroup\(opened\.me, viewer\.role\)\) return \{ ok: false, error: "Only the group's owner can change it\."/.test(groups))
  const chat = code("lib/communities/server/chat.ts")
  const post = chat.slice(chat.indexOf("export async function postMessage"), chat.indexOf("async function tellAboutMessage"))
  check("a channel message: post_role, chatGate, attachments checked, slow mode, screened, then written", post.indexOf("meetsRole(viewer.role, space.post_role)") > 0 && post.indexOf("chatGate(") > 0 && post.indexOf("checkChatMedia(") > 0 && post.indexOf("slowModeWait(") > 0 && post.indexOf("screenWrite(w, \"message\"") > 0 && post.indexOf("screenWrite(") < post.indexOf(".insert("))
  check("a retried send is answered with the message already written (client_id), also on a race", /const again = await sentBefore\(db, viewer\.userId, clientId\)/.test(post) && /error\?\.code === "23505" && clientId/.test(post))
  const direct = code("lib/communities/server/direct.ts")
  const send = direct.slice(direct.indexOf("export async function sendDirectMessage"), direct.indexOf("export async function editDirectMessage"))
  check("a direct message: chatGate, who may message whom, attachments, screened before it is written", send.indexOf("chatGate(") > 0 && send.indexOf("mayMessage(") > 0 && send.indexOf("checkChatMedia(") > 0 && send.indexOf("screenWrite(") < send.indexOf(".insert("))
  check("a new conversation is only made when the viewer may write to them", /if \(!id\) \{\s*const may = await mayMessage\(db, community, viewer, otherId\)/.test(direct))
  const media = code("lib/communities/server/chat-media.ts")
  check("attachments only from Storelib storage: the sender's picture folder, their own community files", /path\.startsWith\(folder\)/.test(media) && /storedObjectSize\(/.test(media) && /m\.store !== "community"/.test(media) && /ownedMedia\(db, community, viewer, media\)/.test(media))
  const files = code("app/api/community/[communityId]/chat/files/route.ts")
  check("a chat file is signed only for someone in that chat, named on that message", /chatSpace\(db, gate\.community, gate\.viewer, row\.space_id\)/.test(files) && /conversationOf\(db, gate\.community, gate\.viewer, row\.conversation_id\)/.test(files) && /groupOf\(db, gate\.community, gate\.viewer, row\.group_id\)/.test(files) && /signCommunityFile\(/.test(files))
  const prefs = code("app/api/community/[communityId]/chat/prefs/route.ts")
  check("a mute is only set on a chat the viewer is in", /if \(!\(await inChat\(db, gate, body\.type, body\.id\)\)\) return notFound\(\)/.test(prefs))
}

/* ── THE SCREEN ────────────────────────────────────────────────────────── */
console.log("\nThe chat screen")
{
  const s = code("components/community/member/chat-surface.tsx")
  check("one merge for every arrival (send, stream, catch up, older)", (s.match(/mergeMessages\(/g) ?? []).length >= 4 && !/\.\.\.cur, \.\.\.fresh/.test(s))
  check("sending: on screen at once, a client id, retried under the same id", /state: "sending",/.test(s) && /clientId = newClientId\(\)/.test(s) && /const retry = \(m: ChatItem\)[\s\S]{0,200}void post\(m\)/.test(s))
  check("scrolled up, new messages gather in a pill; at the bottom it stays there", /setUnseen\(\(n\) => n \+ fresh\)/.test(s) && /data-chat-pill=""/.test(s) && /if \(atBottom\.current\) el\.scrollTop = el\.scrollHeight/.test(s))
  check("older messages keep the reader's place", /keepFrom\.current = el\.scrollHeight - el\.scrollTop/.test(s) && /el\.scrollTop = el\.scrollHeight - keepFrom\.current/.test(s))
  check("pictures have their box before they load", /style=\{\{ aspectRatio: String\(ratio\) \}\}/.test(s) && /aspect-square/.test(s))
  check("the composer sits on the keyboard: safe area, and no extra foot with the keyboard up", /pb-\[max\(8px,env\(safe-area-inset-bottom\)\)\]/.test(s) && /\[html\[data-keyboard=open\]_&\]:pb-2/.test(s))
  const chat = code("components/community/member/chat.tsx")
  check("on a phone the channel is sized to the visible screen (--vv-h, --vv-top), the bar given up while typing", /max-sm:top-\[calc\(var\(--vv-top,0px\)\+var\(--chat-top\)\)\]/.test(chat) && /max-sm:h-\[calc\(var\(--vv-h,100dvh\)-var\(--chat-top\)\)\]/.test(chat) && /\[html\[data-keyboard=open\]_&\]:\[--chat-top:0px\]/.test(chat))
  check("no user agent sniffing in the chat screens", !/navigator\.userAgent|isIOS|iPhone/.test(s + chat + code("components/community/member/messages.tsx")))
  const core = code("components/community/member/chat-core.ts")
  check("typing over a private channel, joined after the session", /config: \{ private: true, broadcast: \{ self: false \} \}/.test(core) && /await realtimeAuth\(supabase\)\s*if \(gone\) return\s*channel = supabase/.test(core))
  check("the read mark is renewed while the chat is open (no push for what is on screen)", /window\.setInterval\(\(\) => mark\(true\), VIEWING_BEAT_MS\)/.test(core))
  const msgs = code("components/community/member/messages.tsx")
  check("groups listen to their own rows", /"community_chat_group_messages",\s*`group_id=eq\.\$\{id\}`/.test(msgs) && /"community_chat_groups", `community_id=eq\.\$\{communityId\}`/.test(msgs))
  check("Seen follows the other person's read mark live", /`id=eq\.\$\{id\}`/.test(msgs) && /setOtherReadAt\(read\)/.test(msgs))
}

/* ── SQL ───────────────────────────────────────────────────────────────── */
console.log("\nPart 270")
{
  const P = "supabase/sql/run-now/270_community_chat_realtime.sql"
  const sql = read(P)
  check("its migration is the same bytes", read("supabase/migrations/20270210_community_chat_realtime.sql") === sql)
  const tables = ["community_chat_settings", "community_chat_groups", "community_chat_group_members", "community_chat_group_messages", "community_chat_prefs", "community_member_blocks"]
  check("RLS on every new table", tables.every((t) => sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)))
  check("nothing is granted to anon; members only SELECT the group tables", /REVOKE ALL ON public\.community_chat_settings, [^;]* FROM PUBLIC, anon, authenticated;/.test(sql) && sql.includes("GRANT SELECT ON public.community_chat_groups, public.community_chat_group_members, public.community_chat_group_messages TO authenticated;") && !/GRANT [^;]*(INSERT|UPDATE|DELETE)[^;]* TO authenticated/.test(sql))
  check("members read only groups they are in", (sql.match(/USING \(public\.community_in_group\(/g) ?? []).length === 3 && /gm\.user_id = auth\.uid\(\)/.test(sql) && /m\.chat_banned_at IS NULL/.test(sql))
  check("typing topics: checked against what the person may read, guarded", /community_chat_topic_ok\(realtime\.topic\(\)\)/.test(sql) && /to_regclass\('realtime\.messages'\) IS NULL/.test(sql) && /EXCEPTION WHEN insufficient_privilege/.test(sql))
  check("realtime publication added only when there, and only once", /SELECT pubowner INTO v_owner FROM pg_publication WHERE pubname = 'supabase_realtime'/.test(sql) && /NOT EXISTS \(SELECT 1 FROM pg_publication_tables/.test(sql))
  check("a retried send is one row: client_id unique per author on all three message tables", ["community_chat_group_messages", "community_messages", "community_direct_messages"].every((t) => new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${t}_client_key ON public\\.${t} \\(author_id, client_id\\) WHERE client_id IS NOT NULL`).test(sql)))
  check("safe to run again: every create checks first", sql.split("\n").filter((l) => /^CREATE (TABLE|INDEX|UNIQUE INDEX) /.test(l) && !/IF NOT EXISTS/.test(l)).length === 0 && sql.split("\n").filter((l) => /^CREATE POLICY/.test(l)).length === 0 && sql.includes("DROP TRIGGER IF EXISTS community_chat_group_members_count ON public.community_chat_group_members;\nCREATE TRIGGER community_chat_group_members_count"))
  check("one statement per line, the note first", sql.split("\n")[0].startsWith("/*") && sql.trimEnd().endsWith("notify pgrst, 'reload schema';"))
  /* Changed on purpose (round 38): part 272's column now follows part 270's, so 270's ends with a comma, not the statement. */
  check("a README row and a check column", read("supabase/sql/run-now/README.md").includes("| `270_community_chat_realtime.sql` |") && /as p270_community_chat_realtime[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("copy: no em dash, no banned word", !/—/.test(sql) && !/\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(sql + code("components/community/member/chat-surface.tsx") + code("components/community/creator/chat-panel.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
