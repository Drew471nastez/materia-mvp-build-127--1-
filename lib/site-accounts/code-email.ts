/**
 * The email a creator's website sends with a sign in code. From the store,
 * by name and with its logo (lib/site-accounts/site-brand.ts, the same
 * store its receipts and order emails sign with), so the visitor recognises
 * the shop they were on; the same words whether the address has an account
 * there or not, so the email never says which.
 *
 * Drawn in the one layout every Storelib email shares (lib/emails/layout.ts).
 *
 * Pure, so tests/site-accounts.test.ts reads exactly what is sent.
 */
import { emailDocument, emailKit, type EmailSender } from "@/lib/emails/layout"
import { et } from "@/lib/emails/words"

export interface CodeEmail {
  subject: string
  html: string
  text: string
  /** The display name the email is sent from. */
  fromName: string
}

/** A store name fit for a From header and a subject line: one line, no angle brackets, at most 80 characters. */
function oneLine(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "this store"
}

/** A logo the email may show: an https address with no quotes or markup in it. */
function logoOf(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null
  const u = url.trim()
  if (!/^https:\/\/[^\s"'<>]+$/i.test(u) || u.length > 1000) return null
  return u
}

export function codeEmail(input: { store: string; code: string; host: string; minutes: number; logoUrl?: string | null }): CodeEmail {
  const store = oneLine(input.store)
  const code = input.code.replace(/\D/g, "").slice(0, 6)
  const site = input.host.split(":")[0].replace(/^www\./, "")
  const logo = logoOf(input.logoUrl)
  /* Each sentence through et(), so the email is in the language the sign in page was in (lib/emails/words.ts; English as before when none is set). */
  const subject = et("{code} is your code for {store}", { code, store })
  const works = et("It works once, for {minutes} minutes, on {site}.", { minutes: input.minutes, site })
  const ignore = et("If you did not ask for it, you can ignore this email.")
  const text = [et("Your code to sign in to {store}:", { store }), "", code, "", works, ignore].join("\n")
  const sender: EmailSender = { kind: "store", name: store, pictureUrl: logo, picture: "logo" }
  const k = emailKit(sender)
  const html = emailDocument({
    sender,
    subject,
    preview: et("Your code to sign in to {store}. It works once, for {minutes} minutes.", { store, minutes: input.minutes }),
    rows: [k.heading(et("Your sign in code")), k.text(et("Use this code to sign in to {store}.", { store })), k.code(code, works), k.small(ignore)],
    footer: { reason: et("You asked for this on {site}.", { site }) },
  })
  return { subject, html, text, fromName: store }
}
