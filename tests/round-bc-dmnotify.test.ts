/**
 * ===========================================================================
 *  ROUND BC: A MESSAGE BETWEEN MEMBERS IS IN THE BELL TOO, QUIETLY
 * ===========================================================================
 * "When someone sends somebody a message it should display as a
 * notification as well ... not spammy, very regulated." A direct message
 * writes one row per conversation in the recipient's inbox (communities and
 * Explore bells, and the /app panel while unread). A second message rewrites
 * that row; while it is unread and was raised a moment ago, nothing is
 * pushed and the row keeps its time. Nothing for the sender, nothing while
 * the conversation is open or muted, nothing for a member who set the
 * community to Nothing. Opening the conversation reads the row.
 *
 * Run with:  npx tsx --conditions react-server tests/round-bc-dmnotify.test.ts
 */
import { readFileSync } from "node:fs"
import {
  DM_NOTIFICATION_KIND,
  DM_THROTTLE_MS,
  dmBellPlan,
  dmBellVerdict,
  dmNotificationBody,
  dmNotificationKey,
  dmNotificationTitle,
} from "../lib/notifications/dm-notify-shared"
import { noteDirectMessage, readDirectNote } from "../lib/communities/server/direct-notify"
import { panelMessageRow } from "../lib/notifications/dm-panel"
import { USER_NOTIFICATION_KINDS, splitTitle } from "../lib/notifications/user-inbox-shared"
import { labelOf, staysOnOpen } from "../lib/notifications/panel"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (f: string) => readFileSync(f, "utf8")

/* ── A small PostgREST stand in: only what the bell's writer calls ───────── */

type Row = Record<string, any>
/* The database's own clock for created_at defaults: the time the test says it is. */
let clock = 0
function fakeDb(tables: Record<string, Row[]>, opts: { refuseKind?: boolean; noTable?: boolean } = {}) {
  let serial = 0
  const writes: { table: string; op: string; payload: any }[] = []
  function from(table: string) {
    const st: { op: string; preds: ((r: Row) => boolean)[]; payload: any; head: boolean; single: boolean; conflict: string | null; ignore: boolean } = { op: "select", preds: [], payload: null, head: false, single: false, conflict: null, ignore: false }
    const rows = () => (tables[table] ??= [])
    const run = () => {
      if (opts.noTable && table === "user_notifications") return { data: null, error: { code: "42P01", message: "missing" }, count: null }
      const hit = rows().filter((r) => st.preds.every((p) => p(r)))
      if (st.op === "select") {
        if (st.head) return { data: null, error: null, count: hit.length }
        if (st.single) return { data: hit[0] ?? null, error: null }
        return { data: hit, error: null }
      }
      if (st.op === "upsert") {
        writes.push({ table, op: "insert", payload: st.payload })
        if (opts.refuseKind && table === "user_notifications") return { data: null, error: { code: "23514", message: "violates check constraint" } }
        const key = st.conflict ? st.payload[st.conflict] : null
        if (key && rows().some((r) => r[st.conflict!] === key)) return { data: [], error: null }
        const row = { id: `00000000-0000-4000-9000-${String(++serial).padStart(12, "0")}`, read_at: null, created_at: new Date(clock).toISOString(), ...st.payload }
        rows().push(row)
        return { data: [{ id: row.id }], error: null }
      }
      if (st.op === "update") {
        writes.push({ table, op: "update", payload: st.payload })
        for (const r of hit) Object.assign(r, st.payload)
        return { data: hit, error: null }
      }
      return { data: null, error: null }
    }
    const b: any = {
      select(_c?: string, o?: { head?: boolean }) {
        if (st.op === "select") st.head = !!o?.head
        return b
      },
      eq(c: string, v: unknown) {
        st.preds.push((r) => String(r[c]) === String(v))
        return b
      },
      gt(c: string, v: string) {
        st.preds.push((r) => String(r[c]) > v)
        return b
      },
      is(c: string, v: null) {
        st.preds.push((r) => (r[c] ?? null) === v)
        return b
      },
      in(c: string, vs: unknown[]) {
        st.preds.push((r) => vs.map(String).includes(String(r[c])))
        return b
      },
      upsert(p: Row, o: { onConflict?: string; ignoreDuplicates?: boolean }) {
        st.op = "upsert"
        st.payload = p
        st.conflict = o?.onConflict ?? null
        return b
      },
      update(p: Row) {
        st.op = "update"
        st.payload = p
        return b
      },
      maybeSingle() {
        st.single = true
        return Promise.resolve(run())
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(res, rej)
      },
    }
    return b
  }
  return { db: { from } as any, writes, tables }
}

const COMMUNITY = "11111111-1111-4111-8111-111111111111"
const CONV = "22222222-2222-4222-8222-222222222222"
const MARA = "33333333-3333-4333-8333-333333333333"
const BEN = "44444444-4444-4444-8444-444444444444"

function world(o: { level?: string | null; status?: string; pref?: Row | null } = {}) {
  return {
    community_members: [{ community_id: COMMUNITY, user_id: BEN, status: o.status ?? "active", notify_level: o.level ?? null }],
    profiles: [{ id: MARA, display_name: "Mara Pop", username: "mara" }],
    community_chat_prefs: o.pref ? [{ user_id: BEN, chat_type: "dm", chat_id: CONV, ...o.pref }] : [],
    community_direct_messages: [] as Row[],
    user_notifications: [] as Row[],
  }
}
function message(tables: Record<string, Row[]>, at: number) {
  tables.community_direct_messages.push({ id: `m${tables.community_direct_messages.length}`, conversation_id: CONV, author_id: MARA, status: "published", created_at: new Date(at).toISOString() })
}
const send = (db: any, now: number, extra: Partial<Parameters<typeof noteDirectMessage>[1]> = {}) =>
  ((clock = now), noteDirectMessage)(db, { communityId: COMMUNITY, communitySlug: "darkroom", conversationId: CONV, senderId: MARA, recipientId: BEN, recipientReadAt: null, preview: "Are you coming tonight?", now, ...extra })

async function main() {
  console.log("\nWhat a row says")
  check("one key per conversation and recipient", dmNotificationKey(CONV, BEN) === `dm:${CONV}:${BEN}`)
  check("the name leads: one message", dmNotificationTitle("Mara Pop", 1) === "Mara Pop sent you a message")
  check("then the count", dmNotificationTitle("Mara Pop", 3) === "Mara Pop sent you 3 messages")
  check("past 99 it says 99+", dmNotificationTitle("Mara Pop", 140) === "Mara Pop sent you 99+ messages")
  check("no name is A member", dmNotificationTitle("  ", 1) === "A member sent you a message")
  check("the bell sets the name in bold", splitTitle(dmNotificationTitle("Mara Pop", 2), "Mara Pop").lead === "Mara Pop")
  check("the preview is one short line", dmNotificationBody("hi\n\nthere") === "hi there" && dmNotificationBody("x".repeat(400)).length === 140 && dmNotificationBody("").length > 0)
  check("no em dash in what a row says", !/—/.test(read("lib/notifications/dm-notify-shared.ts")))

  console.log("\nWho hears it")
  const t0 = Date.parse("2026-10-24T10:00:00Z")
  check("never the sender", dmBellVerdict({ senderId: MARA, recipientId: MARA, readAt: null, pref: null, level: null, now: t0 }) === "self")
  check("not while the conversation is open", dmBellVerdict({ senderId: MARA, recipientId: BEN, readAt: new Date(t0 - 10_000).toISOString(), pref: null, level: null, now: t0 }) === "viewing")
  check("a read mark from an hour ago is not open", dmBellVerdict({ senderId: MARA, recipientId: BEN, readAt: new Date(t0 - 3_600_000).toISOString(), pref: null, level: null, now: t0 }) === "notify")
  check("not while muted", dmBellVerdict({ senderId: MARA, recipientId: BEN, readAt: null, pref: { notify: "none", mutedUntil: null }, level: null, now: t0 }) === "muted")
  check("not while muted for a while", dmBellVerdict({ senderId: MARA, recipientId: BEN, readAt: null, pref: { notify: "default", mutedUntil: new Date(t0 + 60_000).toISOString() }, level: null, now: t0 }) === "muted")
  check("a mute that ran out is over", dmBellVerdict({ senderId: MARA, recipientId: BEN, readAt: null, pref: { notify: "default", mutedUntil: new Date(t0 - 60_000).toISOString() }, level: null, now: t0 }) === "notify")
  check("not for a member who set the community to Nothing", dmBellVerdict({ senderId: MARA, recipientId: BEN, readAt: null, pref: null, level: "none", now: t0 }) === "off")

  console.log("\nGrouped and throttled")
  check("no row yet: one is written and it is news", JSON.stringify(dmBellPlan(null, t0)) === JSON.stringify({ action: "insert", raise: true, news: true }))
  const fresh = { read_at: null, created_at: new Date(t0 - 30_000).toISOString() }
  check("an unread row raised a moment ago: updated, not raised, no push", JSON.stringify(dmBellPlan(fresh, t0)) === JSON.stringify({ action: "update", raise: false, news: false }))
  const stale = { read_at: null, created_at: new Date(t0 - DM_THROTTLE_MS - 1).toISOString() }
  check("an unread row older than the throttle: raised again", dmBellPlan(stale, t0).raise && dmBellPlan(stale, t0).news)
  const seen = { read_at: new Date(t0 - 1000).toISOString(), created_at: new Date(t0 - 2000).toISOString() }
  check("a read row: raised again at once", dmBellPlan(seen, t0).raise && dmBellPlan(seen, t0).news)
  check("the throttle is a few minutes", DM_THROTTLE_MS >= 60_000 && DM_THROTTLE_MS <= 10 * 60_000)

  console.log("\nThe writer, on a stand in database")
  {
    const tables = world()
    const { db } = fakeDb(tables)
    message(tables, t0)
    check("first message: news", (await send(db, t0)) === "news")
    const rows = tables.user_notifications
    check("one row, for Ben, from Mara", rows.length === 1 && rows[0].user_id === BEN && rows[0].actor_id === MARA && rows[0].kind === DM_NOTIFICATION_KIND && rows[0].source === "communities")
    check("it links to the conversation", rows[0].url === `/community/darkroom?dm=${MARA}`)
    check("it says who and the words", rows[0].title === "Mara Pop sent you a message" && rows[0].body === "Are you coming tonight?")
    const firstAt = rows[0].created_at
    message(tables, t0 + 20_000)
    message(tables, t0 + 40_000)
    const second = await send(db, t0 + 40_000, { preview: "Bring the film" })
    check("two more within the throttle: quiet (no push)", second === "quiet", second)
    check("still one row, now with the count and the newest words", rows.length === 1 && rows[0].title === "Mara Pop sent you 3 messages" && rows[0].body === "Bring the film")
    check("and it kept its time", rows[0].created_at === firstAt)
    message(tables, t0 + DM_THROTTLE_MS + 60_000)
    const later = await send(db, t0 + DM_THROTTLE_MS + 60_000)
    check("after the throttle: raised again, news", later === "news" && rows.length === 1 && rows[0].created_at === new Date(t0 + DM_THROTTLE_MS + 60_000).toISOString())

    console.log("\nRead with the conversation")
    await readDirectNote(db, CONV, BEN)
    check("opening the conversation reads the row", !!rows[0].read_at)
    const readMark = new Date(t0 + DM_THROTTLE_MS + 90_000).toISOString()
    const afterRead = t0 + DM_THROTTLE_MS + 5 * 60_000
    message(tables, afterRead)
    const next = await send(db, afterRead, { recipientReadAt: readMark, preview: "One more" })
    check("the next message after reading: unread again and news", next === "news" && rows[0].read_at === null)
    check("and counts only what came after the read mark", rows[0].title === "Mara Pop sent you a message", rows[0].title)
    await readDirectNote(db, CONV, MARA)
    check("somebody else's read leaves Ben's row alone", rows[0].read_at === null)
  }
  {
    const tables = world()
    const { db, writes } = fakeDb(tables)
    const out = await send(db, t0, { recipientReadAt: new Date(t0 - 5_000).toISOString() })
    check("while Ben has it open: quiet, nothing written", out === "quiet" && writes.length === 0)
    check("never told about their own message", (await send(db, t0, { recipientId: MARA })) === "quiet" && tables.user_notifications.length === 0)
  }
  {
    const tables = world({ pref: { notify: "none", muted_until: null } })
    const { db, writes } = fakeDb(tables)
    check("muted conversation: quiet, nothing written", (await send(db, t0)) === "quiet" && writes.length === 0)
  }
  {
    const tables = world({ level: "none" })
    const { db, writes } = fakeDb(tables)
    check("community set to Nothing: quiet, nothing written", (await send(db, t0)) === "quiet" && writes.length === 0)
  }
  {
    const tables = world({ status: "banned" })
    const { db } = fakeDb(tables)
    check("a member no longer active hears nothing", (await send(db, t0)) === "quiet" && tables.user_notifications.length === 0)
  }
  {
    const tables = world()
    const { db } = fakeDb(tables, { refuseKind: true })
    check("before part 284 (the check refuses the kind): unavailable, so the push goes as before", (await send(db, t0)) === "unavailable")
  }
  {
    const tables = world()
    const { db } = fakeDb(tables, { noTable: true })
    check("before part 85 (no table): unavailable", (await send(db, t0)) === "unavailable")
    let threw = false
    try {
      await readDirectNote(db, CONV, BEN)
    } catch {
      threw = true
    }
    check("and reading the conversation still works", !threw)
  }

  console.log("\nWired where messages are sent and read")
  const direct = read("lib/communities/server/direct.ts")
  check("sendDirectMessage writes the bell row after the response, before the push", /pushSoon\(async \(\) => \{\s*const bell = await noteDirectMessage\(db, \{[^}]*recipientReadAt: otherReadAt, preview: pushText \}\)\s*if \(bell === "quiet"\) return\s*if \(!\(await directPushWanted/.test(direct))
  check("markConversationRead reads the row too", /readDirectNote\(db, conversation\.id, viewer\.userId\)/.test(direct))

  console.log("\nIn the /app panel, communities and Explore")
  const route = read("app/api/notifications/route.ts")
  check("the panel's list carries the unread conversations on its first page", /const messagesRead = firstPage \? panelMessages\(user\.id\)/.test(route) && /notifications = \[\.\.\.\(messages as unknown as Record<string, unknown>\[\]\), \.\.\.notifications\]/.test(route))
  check("and its badge counts them", /panelMessagesUnread\(user\.id\)/.test(route))
  check("read, put away and read all reach the same rows", /readPanelMessages\(user\.id, null\)/.test(route) && /readPanelMessages\(user\.id, ids\)/.test(route))
  const row = panelMessageRow({ id: "x", title: "Mara Pop sent you a message", body: "Hi", url: `/community/darkroom?dm=${MARA}`, created_at: new Date(t0).toISOString() })
  check("a panel row is a Messages row with the words under it", row.type === "message" && labelOf({ id: row.id, type: row.type, category: null, area: null }) === "Messages" && row.message === "Hi")
  check("a tap on it opens and puts it away, like other plain rows", !staysOnOpen({ category: null, kind: row.kind, engine: false }))
  const panel = read("lib/notifications/dm-panel.ts")
  check("the panel reads only this person's message rows, unread, with communities on", /\.eq\("user_id", userId\)\s*\.eq\("kind", DM_NOTIFICATION_KIND\)\s*\.is\("read_at", null\)/.test(panel) && /communitiesEnabled\(\)/.test(panel))
  const bell = read("components/notifications/notification-bell.tsx")
  check("the bell hears a row raised in place (an UPDATE) on its own inbox", /if \(table === "user_notifications"\) channel\.on\("postgres_changes", \{ event: "UPDATE", schema: "public", table, filter: `user_id=eq\.\$\{userId\}` \}, raised\)/.test(bell))
  check("a row being read does not count as raised", /const raised = [^]*?if \(!payload\.new \|\| payload\.new\.read_at\) return/.test(bell))

  console.log("\nPart 284")
  const sql = read("supabase/sql/run-now/284_direct_message_notifications.sql")
  const kinds = sql.match(/ADD CONSTRAINT user_notifications_kind_check CHECK \(kind IN \(([^)]+)\)\)/)?.[1] ?? ""
  check("keeps every kind it took and adds direct_message", kinds === [...USER_NOTIFICATION_KINDS, DM_NOTIFICATION_KIND].map((k) => `'${k}'`).join(", "), kinds)
  check("drops before it adds, in one statement, and waits for part 85", /DROP CONSTRAINT IF EXISTS user_notifications_kind_check, ADD CONSTRAINT user_notifications_kind_check/.test(sql) && /to_regclass\('public\.user_notifications'\) IS NULL/.test(sql))
  check("summary first, reload last", sql.startsWith("/* ") && sql.trimEnd().endsWith("notify pgrst, 'reload schema';"))
  check("its copy in migrations is byte for byte", read("supabase/migrations/20270215_direct_message_notifications.sql") === sql)
  check("listed in the README and checked after", /`284_direct_message_notifications\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p284_direct_message_notifications[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
