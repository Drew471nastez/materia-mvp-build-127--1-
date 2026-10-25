/**
 * Writes a sample of the emails round AE2 brands and makes editable, for
 * scripts/check-ae2-email-branding.mjs to open in Chromium: a community's
 * welcome, ticket, paid plan and broadcast, with and without its picture and
 * its own domain, with and without the owner's words, and a store's
 * membership and refund with its words. Each as .html, .txt and .json (the
 * subject, who it is from, Reply-To, and the host its links should be on).
 *
 *   OUT_DIR=<dir> node <bundle of this file>
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { previewBroadcast, previewEmailWords } from "@/lib/communities/server/email-templates"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"

const out = process.env.OUT_DIR || ".ae2-email-probe/out"
mkdirSync(out, { recursive: true })

const base = { id: "11111111-1111-4111-8111-111111111111", name: "Makers Club", slug: "makers", creatorName: "Ana Lopez", replyTo: "team@makers.example", currency: "EUR" }
const pictured = { ...base, logoUrl: "https://makers.example/avatar.png", host: "club.makers.example" }
const plain = { ...base, logoUrl: null, host: null }
const none = { subject: "", heading: "", intro: "", button: "" }

type Sample = { subject: string; html: string; text: string; fromName?: string | null; replyTo?: string | null }
const write = (name: string, m: Sample, meta: Record<string, unknown>) => {
  writeFileSync(join(out, `${name}.html`), m.html)
  writeFileSync(join(out, `${name}.txt`), m.text)
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ subject: m.subject, fromName: m.fromName ?? null, replyTo: m.replyTo ?? null, ...meta }))
}

write("community-welcome-pictured", previewEmailWords("welcome", { ...none, intro: "Hi {{first_name}}, glad you are here. Start with the pinned post." }, pictured), { community: true, picture: true, host: "club.makers.example" })
write("community-welcome-plain", previewEmailWords("welcome", none, plain), { community: true, picture: false, host: "storelib.com" })
write("community-ticket-pictured", previewEmailWords("event_ticket", { ...none, subject: "{{event_title}}: you are in", button: "See the event" }, pictured), { community: true, picture: true, host: "club.makers.example" })
write("community-ticket-plain", previewEmailWords("event_ticket", none, plain), { community: true, picture: false, host: "storelib.com" })
write("community-plan-failed-pictured", previewEmailWords("membership_payment_failed", { ...none, intro: "Your seat in {{community_name}} is still yours for now." }, pictured), { community: true, picture: true, host: "club.makers.example" })
const b = previewBroadcast({ subject: "New lessons are up", message: "Two new lessons went up today.\n\nSee you on Thursday.", authorName: "Ana Lopez" }, pictured)
write("community-broadcast-pictured", { ...b, text: b.html.replace(/<[^>]+>/g, " "), fromName: "Makers Club", replyTo: "team@makers.example" }, { community: true, picture: true, host: "club.makers.example" })
const shop = { name: "Bread & Butter", supportEmail: "hello@bread.example", storeUrl: "https://bread.example", currency: "EUR", logoUrl: null }
write("store-membership-started", previewCustomerEmail("membership_started", shop, { body: "Hi {{customer_name}}, welcome to {{plan_name}}. Your first bake-along is Saturday." }, { creator: { name: "Maria Popescu", photoUrl: "https://bread.example/maria.jpg" }, language: { lang: "en", words: {}, own: true } })!, { community: false, picture: true, host: "storelib.com" })
write("store-digital-refund", previewCustomerEmail("digital_refund", shop, { heading: "Your money for {{items}} is on its way" }, { channel: "storelib", creator: { name: "Maria Popescu", photoUrl: "https://bread.example/maria.jpg" } })!, { community: false, picture: true, host: "storelib.com" })
console.log(`wrote 8 samples to ${out}`)
