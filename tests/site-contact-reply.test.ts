/**
 * Emails › Messages, round 28: a reply to a contact form message is written
 * on the message's page and sent from the store, kept beside the message,
 * shown under it as a thread, and never listed as a message of its own.
 *
 *   npx tsx --conditions=react-server tests/site-contact-reply.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { REPLY_PAGE, cleanReply, replyEmail, replyRow, replySubject, threadRows } from "@/lib/site-contact/reply"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe words and the email\n")
check("a reply is cleaned: control characters out, blank lines kept to one, trimmed", cleanReply("  Hi Ana,\r\n\r\n\r\n\u0007Thanks!  ") === "Hi Ana,\n\nThanks!")
check("  nothing typed is nothing", cleanReply("   ") === "" && cleanReply(42) === "")
check("  at most 5000 characters, the table's own limit", cleanReply("x".repeat(6000)).length === 5000)
check("Re: once, however often it is answered", replySubject("Wholesale", "Bread Studio") === "Re: Wholesale" && replySubject("RE: Wholesale", "Bread Studio") === "RE: Wholesale" && replySubject("", "Bread Studio") === "Re: your message to Bread Studio")
const mail = replyEmail({ sender: { kind: "store", name: "Bread Studio" }, text: "Hi Ana,\n\nYes, we ship to <Cluj>.", original: { name: "Ana", subject: "Shipping", message: "Do you ship to Cluj?", created_at: "2026-10-20T10:00:00Z" } })
check("the email is the store's, on the subject, with their message quoted", mail.subject === "Re: Shipping" && /Bread Studio/.test(mail.html) && /Do you ship to Cluj\?/.test(mail.html) && /Ana, Oct 20, 2026/.test(mail.html))
check("  what was typed is escaped, never markup", /&lt;Cluj&gt;/.test(mail.html) && !/<Cluj>/.test(mail.html))
check("  and the text part has both", /Yes, we ship to <Cluj>\./.test(mail.text) && /Do you ship to Cluj\?/.test(mail.text))
check("  it says why it came and how to answer", /Reply to this email to answer/.test(mail.html))

console.log("\nKept beside the message, shown under it\n")
const row = replyRow({ creatorId: "cr-1", message: { id: "m1", email: "Ana@Example.com", site: "bread.storelib.com", subscriber_id: null }, subject: "Re: Shipping", text: "Yes.", shopName: "Bread Studio", at: "2026-10-21T09:00:00Z" })
check("the row is marked as a reply, read, to the lower cased address, naming its message", row.page === REPLY_PAGE && row.read_at === "2026-10-21T09:00:00Z" && row.email === "ana@example.com" && (row.source_detail as { reply_to: string }).reply_to === "m1" && row.consent === false)
const rows = threadRows([
  { id: "r2", page: REPLY_PAGE, source_detail: { reply_to: "m1" }, message: "Second", created_at: "2026-10-22T09:00:00Z" },
  { id: "m2", page: "contact", source_detail: { surface: "site" }, message: "Hello", created_at: "2026-10-21T12:00:00Z" },
  { id: "r1", page: REPLY_PAGE, source_detail: { reply_to: "m1" }, message: "First", created_at: "2026-10-21T09:00:00Z" },
  { id: "m1", page: null, source_detail: null, message: "Do you ship?", created_at: "2026-10-20T10:00:00Z" },
  { id: "rx", page: REPLY_PAGE, source_detail: null, message: "Orphan", created_at: "2026-10-20T10:00:00Z" },
])
check("the list holds the messages only, in their order", rows.map((r) => r.id).join() === "m2,m1")
check("  each with its replies, oldest first", rows[1].replies.map((r) => r.id).join() === "r1,r2" && rows[0].replies.length === 0)
check("  and without the detail that marked them", rows.every((r) => !("source_detail" in r)))

console.log("\nWired in\n")
const route = read("app/api/email/messages/[id]/reply/route.ts")
check("the route is scoped by the message and the session's store, and rate limited", /\.eq\("id", id\)\s*\.eq\("creator_id", gate\.creatorId\)/.test(route) && /rateLimit\(/.test(route) && /requireTeamPermission\("marketing"\)/.test(route))
check("  it marks the message read and keeps the reply", /update\(\{ read_at: at \}\)/.test(route) && /insert\(row\)/.test(route))
check("  answers go to the store's contact address", /replyAddress\(store\?\.email\)/.test(route))
const area = read("app/api/email/area/route.ts")
check("Messages and a contact's page leave replies out of the list", /threadRows\(/.test(area) && /m\.page !== REPLY_PAGE/.test(area))
const page = read("app/(storelib)/app/emails/message-detail.tsx")
check("the message's page shows the thread and the box, and Reply goes to it", /<Thread message=\{message\} onReply=\{onReply\} \/>/.test(page) && /data-reply-box=\{message\.id\}/.test(page) && /data-message-reply=""/.test(page))
const client = read("app/(storelib)/app/emails/emails-client.tsx")
check("the reply shows at once as sending, and the message reads as read", /pending: true/.test(client) && /read_at: r\.read_at \?\? at/.test(client))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
