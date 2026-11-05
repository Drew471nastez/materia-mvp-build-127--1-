/**
 * Round T: support requests from stores (/app/support) and Storelib's
 * Resolution center (/admin/resolution), SQL part 114, lib/support.
 *
 *   node scripts/run-push-tests.mjs (it imports server-only modules)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { MAX_OPEN, readNewTicket, readReply, statusAfter } from "@/lib/support/tickets"
import { adminReply, getTicket, openTicket, replyAsStore } from "@/lib/support/tickets-server"
import { threadPrompt } from "@/lib/support/suggest-server"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A database that writes down every call and answers from `answers[table:op]`. */
function fakeDb(answers: Record<string, unknown>) {
  const log: string[] = []
  const db = {
    log,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@example.com" } } }) } },
    from(table: string) {
      let op = "select"
      const q: Record<string, unknown> = {}
      const done = () => answers[`${table}:${op}`] ?? { data: null, error: null }
      for (const name of ["eq", "neq", "order", "limit", "ilike", "lt"]) q[name] = (...a: unknown[]) => (log.push(`${table}.${op}.${name}(${a.map(String).join(",")})`), q)
      q.select = (cols?: string, opts?: { head?: boolean }) => (op === "select" && opts?.head ? (op = "count") : null, q)
      q.insert = (row: unknown) => ((op = "insert"), log.push(`${table}.insert ${JSON.stringify(row)}`), q)
      q.update = (row: unknown) => ((op = "update"), log.push(`${table}.update ${JSON.stringify(row)}`), q)
      q.delete = () => ((op = "delete"), log.push(`${table}.delete`), q)
      q.single = async () => done()
      q.maybeSingle = async () => done()
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(done()).then(res)
      return q
    },
  }
  return db
}

const row = { id: "t1", creator_id: "c1", opened_by: "u1", topic: "payouts", subject: "Payout missing", status: "waiting", priority: "normal", order_ref: null, dispute_id: null, creator_unread: true, created_at: "2026-10-10T10:00:00Z", updated_at: "2026-10-10T10:00:00Z", last_message_at: "2026-10-10T10:00:00Z", resolved_at: null }

async function main() {
  console.log("\nWhat a store sends")
  check("a subject is needed", !readNewTicket({ topic: "orders", subject: " ", message: "My payout hasn't come" }).ok)
  check("and enough words to help the first time", !readNewTicket({ topic: "orders", subject: "Help", message: "hi" }).ok)
  const good = readNewTicket({ topic: "nonsense", subject: "  Payout missing ", message: "It was due on Friday and hasn't arrived.", orderRef: "#1a2b3c4d" })
  check("an unknown topic is Something else; the order loses its #", good.ok && good.topic === "other" && good.subject === "Payout missing" && good.orderRef === "1a2b3c4d", good)
  check("an order number that isn't one is refused", !readNewTicket({ topic: "orders", subject: "x", message: "long enough words", orderRef: "<script>" }).ok)
  check("an empty reply is nothing", readReply("   ") === null && readReply(" ok ") === "ok")
  check("whose turn: the store writes, it's Storelib's; Storelib replies, it's the store's; a note changes nothing", statusAfter("creator") === "open" && statusAfter("storelib") === "waiting" && statusAfter("storelib", true, "open") === "open")

  console.log("\nOpening one")
  const full = fakeDb({ "support_tickets:count": { count: MAX_OPEN, error: null } })
  const refused = await openTicket(full, { creatorId: "c1", userId: "u1" }, { topic: "orders", subject: "x", message: "long enough words", orderRef: null })
  check(`no more than ${MAX_OPEN} open at once`, "status" in refused && refused.status === 429 && !full.log.some((l) => l.includes(".insert")))
  const broken = fakeDb({ "support_tickets:count": { count: 0, error: null }, "support_tickets:insert": { data: row, error: null }, "support_ticket_messages:insert": { data: null, error: { code: "23514", message: "bad" } } })
  const rolled = await openTicket(broken, { creatorId: "c1", userId: "u1" }, { topic: "orders", subject: "x", message: "long enough words", orderRef: null })
  check("a request whose message won't save is taken back, not left empty", !rolled.ok && broken.log.includes("support_tickets.delete"))
  const missing = fakeDb({ "support_tickets:count": { count: null, error: { code: "42P01" } } })
  const notYet = await openTicket(missing, { creatorId: "c1", userId: "u1" }, { topic: "orders", subject: "x", message: "long enough words", orderRef: null })
  check("before part 114 it says so and points to email", "error" in notYet && notYet.status === 503 && /support@storelib\.com/.test(notYet.error))

  console.log("\nThe store's side")
  const mine = fakeDb({ "support_tickets:select": { data: row, error: null }, "support_ticket_messages:select": { data: [{ id: 1, ticket_id: "t1", author: "creator", internal: false, body: "Hi", created_at: row.created_at }], error: null } })
  const got = await getTicket(mine, "c1", "t1")
  check("found by its id and the store together", mine.log.includes("support_tickets.select.eq(id,t1)") && mine.log.includes("support_tickets.select.eq(creator_id,c1)"))
  check("never Storelib's internal notes", mine.log.includes("support_ticket_messages.select.eq(internal,false)"))
  check("reading it clears New reply", got.ok && !got.ticket.unread && mine.log.some((l) => l.startsWith('support_tickets.update {"creator_unread":false}')))
  const replied = fakeDb({ "support_tickets:select": { data: row, error: null } })
  await replyAsStore(replied, { creatorId: "c1" }, "t1", "Still nothing")
  check("a store's reply hands it back to Storelib and opens a resolved one again", replied.log.some((l) => /support_tickets\.update \{"status":"open","resolved_at":null/.test(l)))

  console.log("\nStorelib's side")
  const note = fakeDb({ "support_tickets:select": { data: { ...row, status: "open" }, error: null } })
  await adminReply(note, "t1", { body: "Checked Stripe, payout in transit", internal: true })
  const noteUpdate = note.log.find((l) => l.startsWith("support_tickets.update")) ?? ""
  check("an internal note keeps whose turn it is and doesn't mark the store's request as replied", /"status":"open"/.test(noteUpdate) && !/creator_unread/.test(noteUpdate), noteUpdate)
  const answer = fakeDb({ "support_tickets:select": { data: { ...row, status: "open" }, error: null } })
  await adminReply(answer, "t1", { body: "It's on its way", internal: false })
  const answerUpdate = answer.log.find((l) => l.startsWith("support_tickets.update")) ?? ""
  check("a reply makes it the store's turn and marks it New reply for them", /"status":"waiting"/.test(answerUpdate) && /"creator_unread":true/.test(answerUpdate), answerUpdate)
  const prompt = threadPrompt({ topic: "payouts", subject: "Payout missing", orderRef: "1A2B" }, [{ id: 1, author: "creator", internal: false, body: "Hi", createdAt: "" }, { id: 2, author: "storelib", internal: true, body: "In transit", createdAt: "" }], "Angus Farm")
  check("the suggestion sees the thread, the topic and the order, and knows a note isn't seen by the store", /Topic: Payouts/.test(prompt) && /Order: #1A2B/.test(prompt) && /internal note \(not seen by the store\)/.test(prompt) && !/@/.test(prompt))

  console.log("\nThe SQL")
  const sql = read("supabase/sql/run-now/114_support_tickets.sql")
  check("the migration is the same part", sql === read("supabase/migrations/20261206_support_tickets.sql"))
  check("a store reads its own, and never an internal note", /support_tickets_owner_read ON public\.support_tickets FOR SELECT TO authenticated/.test(sql) && /USING \(NOT internal AND EXISTS/.test(sql))
  check("only the server writes", /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.support_tickets, public\.support_ticket_messages FROM PUBLIC, anon, authenticated/.test(sql))
  check("a note can only be Storelib's", /CHECK \(NOT internal OR author = 'storelib'\)/.test(sql))
  check("listed in the README and the check after", /114_support_tickets\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p114_support_tickets/.test(read("supabase/sql/run-now/99_check_after.sql")))

  console.log("\nWired in")
  const adminRoutes = ["app/api/admin/support/route.ts", "app/api/admin/support/[id]/route.ts", "app/api/admin/support/[id]/suggest/route.ts"]
  check("every admin route checks the admin cookie first", adminRoutes.every((f) => /const denied = await requireAdmin\(\)\n\s+if \(denied\) return denied/.test(read(f))))
  check("a suggestion is only ever a draft: nothing sends from its route", !/adminReply|sendMailgun/.test(read("app/api/admin/support/[id]/suggest/route.ts")))
  check("a store's routes are the signed in store's own", ["app/api/support/tickets/route.ts", "app/api/support/tickets/[id]/route.ts"].every((f) => /shopCaller\(\)/.test(read(f))))
  check("opening is rate limited per person", /bucket: "support", subjects: \[`support:\$\{c\.userId\}`\]/.test(read("app/api/support/tickets/route.ts")))
  check("the admin nav has Resolution center", /href: "\/admin\/resolution", label: "Resolution center"/.test(read("app/(storelib)/admin/_console/shell.tsx")))
  /* Changed on purpose (round AW): the Help Center is on help.storelib.com, so its link to the dashboard is storelib.com's own. */
check("Help and Settings lead to Open a request", /href=\{mainSiteUrl\("\/app\/support"\)\}/.test(read("components/help/help-parts.tsx")) && /href="\/app\/support"/.test(read("components/app/settings-form-new.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
