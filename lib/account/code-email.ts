import { platformEmail } from "@/lib/emails/layout"

/**
 * The email that carries a one time code (signup, a new address, the current
 * address). Drawn in the one Storelib layout (lib/emails/layout.ts): the
 * code large and on its own, no picture of its own and no link for a filter
 * to rewrite. Readable as text, with the code on its own line.
 */
export function codeEmail({
  heading,
  lead,
  code,
  minutes,
  footer,
  /** Opens verify with the code prefilled and copied in the browser. */
  copyHref,
}: {
  heading: string
  lead: string
  code?: string
  minutes?: number
  footer: string
  copyHref?: string | null
}): { html: string; text: string } {
  void copyHref
  const mail = platformEmail({
    subject: heading,
    preview: code ? `${code} is your code. ${lead}` : lead,
    heading,
    paragraphs: [lead],
    code: code ? { value: code, caption: minutes ? `It expires in ${minutes} minutes.` : null } : null,
    note: footer,
  })
  return { html: mail.html, text: mail.text }
}
