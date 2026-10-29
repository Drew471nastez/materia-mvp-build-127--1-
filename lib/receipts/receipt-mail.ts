/**
 * ===========================================================================
 *  A DIGITAL RECEIPT, BUILT ONE WAY FOR THE INBOX AND FOR THE PREVIEW
 * ===========================================================================
 * lib/email.tsx sendBuyerDownloadEmail reads the order (the model, the
 * language, the store's saved words) and hands them here; Emails › Customer
 * emails › Receipt hands a sample order and the same three
 * (lib/emails/customer-catalog.ts). Both get back the same subject, HTML
 * and text, so the preview is the email a buyer gets, letter for letter
 * (tests/emails-preview.test.ts).
 *
 *   language   built inside it (lib/emails/words.ts): the button, the notes
 *              on each line and the subject in the buyer's language
 *   saved      the store's own subject, heading, opening and button
 *              (Settings › Customer emails), used only when the email is in
 *              the website's own language, the one they were written in
 *
 * Pure: no database, no mailer.
 */
import { et, inEmailLanguage } from "@/lib/emails/words"
import { itemsText, pickCopy, resolveCopy, type EmailCopy } from "@/lib/emails/customer-custom"
import { withOwnFrame } from "@/lib/emails/layout"
import { buyerReceiptEmailHtml, buyerReceiptEmailText, type ReceiptEmailModel } from "./email"

export interface ReceiptLanguage {
  lang: string
  words: Record<string, string> | null
  /** The website's own language: the store's saved words are written in it. */
  own: boolean
}

function safeText(s: string) {
  return (s || "").toString().replace(/\s+/g, " ").trim()
}

/** The receipt's fixed words, as receiptEmailModel writes them in English, in the email's language. */
function word(v: string | null | undefined): string | null | undefined {
  switch (v) {
    case "Free":
      return et("Free")
    case "Download your files":
      return et("Download your files")
    case "View your receipt":
      return et("View your receipt")
    case "Waiting for payment":
      return et("Waiting for payment")
    case "Refunded":
      return et("Refunded")
    case "Payment failed":
      return et("Payment failed")
    case "On hold":
      return et("On hold")
    default:
      return v
  }
}

/** "October 10, 2026", "10 octobre 2026": the day it was bought, in the email's language, as the English one always read. */
function dayIn(iso: string | null | undefined, lang: string | null | undefined, timeZone?: string | null): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  try {
    return new Intl.DateTimeFormat(lang && lang !== "en" ? [lang, "en-US"] : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: timeZone || "UTC" }).format(at)
  } catch {
    return timeZone ? dayIn(iso, lang, null) : null
  }
}

export function buildReceiptEmail(input: ReceiptEmailModel, language: ReceiptLanguage | null | undefined, saved?: EmailCopy | null): { subject: string; html: string; text: string; model: ReceiptEmailModel } {
  const model: ReceiptEmailModel = { ...input, items: input.items.map((i) => ({ ...i })) }
  const say = <T,>(build: () => T): T => inEmailLanguage(language?.lang, language?.words, build)
  const firstTitle = model.items[0]?.title ?? ""
  let subject = say(() => {
    /* The store's day (its time zone), as its invoice PDF and order emails write it. */
    const day = dayIn(model.dateIso, language?.lang, model.timeZone)
    if (day) model.dateText = day
    model.buttonLabel = word(model.buttonLabel) ?? model.buttonLabel
    model.totalText = word(model.totalText) ?? model.totalText
    model.subtotalText = word(model.subtotalText) ?? model.subtotalText
    model.items = model.items.map((i) => ({ ...i, note: word(i.note) ?? null, amountText: word(i.amountText) ?? i.amountText }))
    return model.items.length > 1 ? et("Your receipt from {shop}: {count} items", { shop: safeText(model.sellerName), count: model.items.length }) : et("Your receipt for {title}", { title: safeText(firstTitle) })
  })
  /* The store's own words in the buyer's language: the main ones in the website's, a language's own where written, else the standard ones in theirs (pickCopy). */
  const copy = saved ? resolveCopy(pickCopy(saved, language), { customer_name: model.firstName, order_number: model.orderNumber, shop_name: model.sellerName, items: itemsText(model.items.map((i) => i.title)) }) : undefined
  if (copy) {
    if (copy.heading) model.heading = copy.heading
    if (copy.introHtml !== undefined) {
      model.introHtml = copy.introHtml || null
      model.introText = copy.introText || null
    }
    if (copy.button) model.buttonLabel = copy.button
    if (copy.subject) subject = copy.subject
  }
  const framed = withOwnFrame({ html: say(() => buyerReceiptEmailHtml(model)), text: say(() => buyerReceiptEmailText(model)) }, copy)
  return { subject, html: framed.html, text: framed.text, model }
}
