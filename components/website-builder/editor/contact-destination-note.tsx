"use client"

/**
 * WHERE A CONTACT FORM'S MESSAGES GO, SAID IN THE SECTION'S SETTINGS (round
 * AX). The Contact Form section has a Recipient Email. Storelib sends the
 * visitor's message there only when it is the sign in email of the account
 * or of someone on its team (lib/seller-inbox provenInbox); any other address
 * is passed over for the account's own, so a typed address can never turn
 * the form into a way to mail strangers from Storelib. One line, so the
 * seller is not left thinking a different address gets the mail.
 */
import { tt } from "@/lib/i18n/text"

/** The section types that carry a Recipient Email. */
export function hasRecipientEmail(type: string): boolean {
  return type === "contact_form"
}

export function ContactDestinationNote({ type, settings }: { type: string; settings: Record<string, unknown> }) {
  if (!hasRecipientEmail(type)) return null
  const typed = typeof settings.recipient_email === "string" ? settings.recipient_email.trim() : ""
  return (
    <div className="mx-4 mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12.5px] leading-snug" data-contact-destination={typed ? "typed" : "account"}>
      <p className="text-muted-foreground">
        {typed
          ? tt("Messages go to {email} only if it is your sign in email or a team member's. Otherwise they go to your sign in email.", { email: typed })
          : tt("Messages go to your sign in email.")}{" "}
        {tt("Every message is also kept in Contacts › Forms.")}
      </p>
    </div>
  )
}
