"use client"

/**
 * WHERE A SIGN UP GOES, SAID IN THE SECTION'S SETTINGS (round 43, the owner:
 * the newsletter sections should make it clear where the newsletter is set
 * up). A newsletter section, Storelib Newsletter in an imported theme and the
 * Popup's email box all send to Emails › Subscribers, and Subscribers names
 * the box each person came from with the same words used here
 * (lib/contacts/contact-source FORM_NAME). One line and a link to the list.
 * Storelib has no confirmation email for a sign up, so there is no double
 * opt in setting to point to; the consent line is recorded with each one.
 */
import { ArrowUpRight } from "lucide-react"
import { FORM_NAME, type ContactForm } from "@/lib/contacts/contact-source"
import { appForSection } from "@/lib/website-builder/app-sections"
import { tt } from "@/lib/i18n/text"

/** The box a section's sign ups are listed under in Subscribers, or null for a section that takes none. */
export function signupFormOf(type: string, settings: Record<string, unknown>): ContactForm | null {
  if (type === "popup") return settings.content === "email" || settings.content === undefined ? "site_popup" : null
  if (type === "storelib-newsletter") return settings.look === "popup" ? "site_popup" : settings.look === "inline" ? "newsletter" : "bar"
  if (appForSection(type)?.app.id === "email") return "newsletter"
  return null
}

export const SUBSCRIBERS_HREF = "/app/emails?tab=subscribers"

export function SignupDestinationNote({ type, settings }: { type: string; settings: Record<string, unknown> }) {
  const form = signupFormOf(type, settings)
  if (!form) return null
  return (
    <div className="mx-4 mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12.5px] leading-snug" data-signup-destination={form}>
      <p className="text-muted-foreground">
        {tt("Sign-ups go to Emails › Subscribers, listed as {where}. They join at once, with no confirmation email.", { where: FORM_NAME[form] })}
      </p>
      <a
        href={SUBSCRIBERS_HREF}
        target="_blank"
        rel="noopener"
        className="mt-1 inline-flex h-7 items-center gap-1 rounded-md text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline"
        data-signup-destination-link=""
      >
        {tt("Open Subscribers")}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  )
}
