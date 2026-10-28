/**
 * Emails › Customer emails, round 28: every part of a customer email can be
 * the store's own (subject, preview text, heading, text, button, a footer
 * note), in the website's language and apart in each other language it
 * publishes, and what is saved is what is read back and what is sent.
 *
 *   save -> load      saveCustomerEmailCopy writes store_settings.customer_emails,
 *                     loadCustomerEmailCopy reads the same words back
 *   per language      a French part leaves the main words as they were; a
 *                     buyer in French gets the French part, one in German the
 *                     standard words (pickCopy)
 *   sent as previewed the preheader replaces the inbox line, the footer note
 *                     opens the footer, escaped; the text part has the note
 *   reset             `copy: null` takes one part back to the default, the
 *                     other part kept
 *
 *   npx tsx --conditions=react-server tests/customer-email-roundtrip.test.ts
 */
import { loadCustomerEmailCopy, saveCustomerEmailCopy } from "@/lib/emails/customer-copy-server"
import { COPY_FIELDS, DEFAULT_COPY, pickCopy, readSavedCopy, resolveCopy, withWords } from "@/lib/emails/customer-custom"
import { previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { withOwnFrame } from "@/lib/emails/layout"
import { emailWordsFor, loadEmailWords, previewEmailWords, saveEmailWords, wordsInput, wordsPayload } from "@/lib/communities/server/email-templates"
import { COMMUNITY_WORD_FIELDS, readCommunityExtras } from "@/lib/emails/community-words"

/* Any table, in memory, with eq filters, upsert on a conflict key and delete: enough for the community words' reads and writes. */
function tableDb(seed: Record<string, Array<Record<string, unknown>>>) {
  const tables: Record<string, Array<Record<string, unknown>>> = JSON.parse(JSON.stringify(seed))
  return {
    tables,
    from(name: string) {
      const rows = (tables[name] ??= [])
      const filters: Array<[string, unknown]> = []
      let mode: "select" | "delete" = "select"
      const match = (r: Record<string, unknown>) => filters.every(([k, v]) => r[k] === v)
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        delete: () => ((mode = "delete"), q),
        maybeSingle: async () => ({ data: rows.find(match) ?? null, error: null }),
        upsert: async (row: Record<string, unknown>, opts?: { onConflict?: string }) => {
          const keys = (opts?.onConflict ?? "id").split(",")
          const i = rows.findIndex((r) => keys.every((k) => r[k] === row[k]))
          const copy = JSON.parse(JSON.stringify(row))
          if (i >= 0) rows[i] = { ...rows[i], ...copy }
          else rows.push(copy)
          return { error: null }
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          if (mode === "delete") {
            for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1)
            return Promise.resolve({ data: null, error: null }).then(res, rej)
          }
          return Promise.resolve({ data: rows.filter(match), error: null }).then(res, rej)
        },
      }
      return q
    },
  }
}

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}

/* store_settings, in memory: what the two server functions read and write. */
function fakeDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const db = {
    rows,
    from(table: string) {
      if (table !== "store_settings") throw new Error(`unexpected table ${table}`)
      let id: string | null = null
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => ((id = v), q),
        maybeSingle: async () => ({ data: id && rows.has(id) ? { ...rows.get(id) } : null, error: null }),
        upsert: async (row: Record<string, unknown>) => {
          rows.set(String(row.creator_id), { ...(rows.get(String(row.creator_id)) ?? {}), ...JSON.parse(JSON.stringify(row)) })
          return { error: null }
        },
      }
      return q
    },
  }
  return db
}

const SHOP = { name: "Astrid Studio", supportEmail: "hello@astrid.studio", currency: "EUR" }
const CREATOR = "cr-1"

async function main() {
  console.log("\nSix parts, each with a default\n")
  check("subject, preview text, heading, text, button and footer note", COPY_FIELDS.join() === "subject,preheader,heading,body,button,footer")
  check("every email has all six, the preview text and the footer note empty by default", Object.values(DEFAULT_COPY).every((c) => COPY_FIELDS.every((f) => typeof c[f] === "string")) && Object.values(DEFAULT_COPY).every((c) => c.preheader === "" && c.footer === ""))

  console.log("\nSaved, read back, the same words\n")
  const db = fakeDb()
  const main = { subject: "Order {{order_number}} is in", preheader: "Thanks for shopping with {{shop_name}}", heading: "We got it, {{customer_name}}", body: "We are packing it now.\n\nIt ships tomorrow.", button: "See the order", footer: "Returns within 30 days.\nNo questions <b>asked</b>." }
  const r1 = await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", main)
  check("the main words save", r1.ok === true, r1)
  const back1 = await loadCustomerEmailCopy(db, CREATOR)
  const own = back1.order_confirmation
  check("and read back as they were typed, tags taken out of the footer", own?.subject === main.subject && own?.preheader === main.preheader && own?.heading === main.heading && own?.body === main.body && own?.button === main.button && own?.footer === "Returns within 30 days.\nNo questions asked.", own)

  const fr = { subject: "Commande {{order_number}} reçue", footer: "Retours sous 30 jours." }
  const r2 = await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", fr, "fr")
  check("a French part saves", r2.ok === true, r2)
  const back2 = await loadCustomerEmailCopy(db, CREATOR)
  check("  beside the main words, which are left as they were", back2.order_confirmation?.subject === main.subject && back2.order_confirmation?.langs?.fr?.subject === fr.subject && back2.order_confirmation?.langs?.fr?.footer === fr.footer, back2.order_confirmation)
  check("  a language that is not one is refused", (await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", fr, "<script>")).ok === false)
  check("  an unknown placeholder is refused, nothing written", (await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", { subject: "{{ordr}}" }, "fr")).ok === false && (await loadCustomerEmailCopy(db, CREATOR)).order_confirmation?.langs?.fr?.subject === fr.subject)

  console.log("\nEach buyer gets the words of the language the email is in\n")
  const saved = back2.order_confirmation
  check("the website's own language: the main words", pickCopy(saved, { lang: "en", own: true })?.subject === main.subject && !("langs" in (pickCopy(saved, { lang: "en", own: true }) ?? {})))
  check("French: the French part", pickCopy(saved, { lang: "fr", own: false })?.subject === fr.subject)
  check("  fr-CA reads the French part too", pickCopy(saved, { lang: "fr-CA", own: false })?.subject === fr.subject)
  check("German, with nothing written for it: none, so the standard German words go", pickCopy(saved, { lang: "de", own: false }) === undefined)

  console.log("\nSent as previewed: the preview text and the footer note are in the email\n")
  const mail = previewCustomerEmail("order_confirmation", SHOP, saved, { channel: "website", language: { lang: "en", words: {}, own: true } })!
  check("the subject is the store's, filled in", mail.subject === "Order #1042 is in", mail.subject)
  check("the inbox line is the preview text, filled in", /class="e-preheader"[^>]*>Thanks for shopping with Astrid Studio/.test(mail.html), mail.html.match(/class="e-preheader"[^>]*>.{0,60}/)?.[0])
  check("  and only one inbox line", (mail.html.match(/class="e-preheader"/g) ?? []).length === 1)
  check("the footer note opens the footer, escaped, its newline a line break", /data-own-footer="">Returns within 30 days\.<br>No questions asked\.<\/p>/.test(mail.html), mail.html.match(/data-own-footer[^<]*<br>[^<]*/)?.[0])
  check("  and is in the text part", mail.text.includes("Returns within 30 days.\nNo questions asked."))
  const frMail = previewCustomerEmail("order_confirmation", SHOP, saved, { channel: "website", language: { lang: "fr", words: {}, own: false } })!
  check("in French, the French subject and footer note; the main English ones are not used", frMail.subject === "Commande #1042 reçue" && /Retours sous 30 jours\./.test(frMail.html) && !/Returns within 30 days/.test(frMail.html), frMail.subject)
  const plain = previewCustomerEmail("order_confirmation", SHOP, null)!
  check("an email with nothing of the store's has no footer note and the template's own inbox line", !/data-own-footer/.test(plain.html) && /class="e-preheader"/.test(plain.html))
  check("withOwnFrame changes nothing when there is nothing to put in", withOwnFrame(plain, null) === plain && withOwnFrame(plain, resolveCopy({ heading: "x" }, {})) === plain)
  for (const id of ["receipt", "digital_refund", "checkout_reminder", "shipping_confirmation", "refund", "return_approved", "membership_started"]) {
    const m = previewCustomerEmail(id, SHOP, { preheader: "Inbox line for {{shop_name}}", footer: "A note from the shop" }, { channel: "website", language: { lang: "en", words: {}, own: true } })!
    check(`${id}: the preview text and the footer note are drawn`, /e-preheader[^>]*>Inbox line for Astrid Studio/.test(m.html) && /A note from the shop/.test(m.html) && /A note from the shop/.test(m.text), { pre: m.html.match(/class="e-preheader"[^>]*>.{0,40}/)?.[0] })
  }

  console.log("\nReset puts one part back\n")
  const r3 = await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", null, "fr")
  const back3 = await loadCustomerEmailCopy(db, CREATOR)
  check("the French part reset: gone, the main words kept", r3.ok && !back3.order_confirmation?.langs && back3.order_confirmation?.subject === main.subject, back3.order_confirmation)
  await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", fr, "fr")
  await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", null)
  const back4 = await loadCustomerEmailCopy(db, CREATOR)
  check("the main words reset: the defaults go, the French part kept", back4.order_confirmation?.subject === undefined && back4.order_confirmation?.langs?.fr?.subject === fr.subject, back4.order_confirmation)
  await saveCustomerEmailCopy(db, CREATOR, "order_confirmation", null, "fr")
  check("both reset: the email has nothing saved", !(await loadCustomerEmailCopy(db, CREATOR)).order_confirmation)

  console.log("\nWhat is read from the database is cleaned again\n")
  const dirty = readSavedCopy({ receipt: { footer: "<i>hi</i>", langs: { fr: { subject: "Reçu" }, "../x": { subject: "no" }, de: "nope" } }, nope: { subject: "x" } })
  check("a stored footer loses its tags; an odd language key or value is dropped; an unknown email is dropped", dirty.receipt?.footer === "hi" && dirty.receipt?.langs?.fr?.subject === "Reçu" && Object.keys(dirty.receipt?.langs ?? {}).join() === "fr" && !dirty.nope, dirty)
  check("withWords keeps the other part when one is replaced", withWords({ subject: "A", langs: { fr: { subject: "B" } } }, { heading: "C" }, null)?.langs?.fr?.subject === "B" && withWords({ subject: "A" }, { subject: "D" }, "de")?.subject === "A")

  console.log("\nA community's emails: the same six parts, saved and read back, drawn as sent\n")
  {
    const COMM = "11111111-1111-4111-8111-111111111111"
    const db = tableDb({ communities: [{ id: COMM, creator_id: CREATOR, name: "Makers Club", slug: "makers" }], community_email_templates: [], store_settings: [{ creator_id: CREATOR, customer_emails: { receipt: { subject: "Kept {{items}}" } } }] })
    check("the editor's six parts, in order", COMMUNITY_WORD_FIELDS.join() === "subject,preheader,heading,intro,button,footer")
    const typed = wordsInput({ subject: "Welcome to {{community_name}}, {{first_name}}", preheader: "Your first week in {{community_name}}", heading: "Hi {{first_name}}", intro: "Say hello in the intros thread.", button: "Come in", footer: "Questions? Reply to this email.\nWe read every one." }, "welcome")
    check("what is typed is read, the footer note keeping its line break", !("error" in typed) && typed.preheader === "Your first week in {{community_name}}" && typed.footer === "Questions? Reply to this email.\nWe read every one.", typed)
    if (!("error" in typed)) {
      const saved = await saveEmailWords(db, COMM, "welcome", typed, "u-1")
      check("saved", "ok" in saved, saved)
      const loaded = await loadEmailWords(db, COMM)
      const w = loaded.words.welcome
      check("read back: all six parts as typed", !!w && w.subject === typed.subject && w.heading === typed.heading && w.intro === typed.intro && w.button === typed.button && w.preheader === typed.preheader && w.footer === typed.footer, w)
      check("  the four in their table, the preview text and footer note beside the store's words", db.tables.community_email_templates.length === 1 && Object.keys(readCommunityExtras(db.tables.store_settings[0].customer_emails, COMM).welcome ?? {}).join() === "preheader,footer")
      check("  the store's own words untouched by it", (db.tables.store_settings[0].customer_emails as Record<string, { subject?: string }>).receipt?.subject === "Kept {{items}}")
      await saveCustomerEmailCopy(db, CREATOR, "receipt", { subject: "Changed {{items}}" })
      check("saving the store's words keeps the community's preview text and footer note", Object.keys(readCommunityExtras(db.tables.store_settings[0].customer_emails, COMM).welcome ?? {}).join() === "preheader,footer" && (await loadCustomerEmailCopy(db, CREATOR)).receipt?.subject === "Changed {{items}}")
      const sender = await emailWordsFor(db, COMM, "welcome")
      check("the sender reads all six, and hands them to the template", sender?.footer === typed.footer && wordsPayload(sender).tplPreheader === typed.preheader && wordsPayload(sender).tplFooter === typed.footer)
      const mail = previewEmailWords("welcome", sender!, { id: COMM, name: "Makers Club", slug: "makers", creatorName: "Ana" })
      check("drawn as a member gets it: the inbox line is the preview text, filled in", /class="e-preheader"[^>]*>Your first week in Makers Club/.test(mail.html), mail.html.match(/class="e-preheader"[^>]*>.{0,50}/)?.[0])
      check("  the footer note is in the email and its text part, before the email's own note", /Questions\? Reply to this email\./.test(mail.html) && /Questions\? Reply to this email\./.test(mail.text), mail.text.slice(-300))
      check("  the subject and button are the owner's", mail.subject.startsWith("Welcome to Makers Club") && /Come in/.test(mail.html))
      const four = { ...typed, preheader: "", footer: "" }
      await saveEmailWords(db, COMM, "welcome", four, "u-1")
      const again = (await loadEmailWords(db, COMM)).words.welcome
      check("the preview text and footer note emptied: gone, the four kept", !!again && !again.preheader && !again.footer && again.subject === typed.subject && !readCommunityExtras(db.tables.store_settings[0].customer_emails, COMM).welcome)
      await saveEmailWords(db, COMM, "welcome", { subject: "", heading: "", intro: "", button: "", preheader: "", footer: "" }, "u-1")
      check("all six emptied: the community's standard words, nothing kept", !(await loadEmailWords(db, COMM)).words.welcome && db.tables.community_email_templates.length === 0)
    }
    check("an unknown value in the footer note is refused", "error" in wordsInput({ footer: "{{ordr}}" }, "welcome"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
