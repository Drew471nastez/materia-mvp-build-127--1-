import type { Metadata } from "next"
import { helpHref, publicHelpUrl } from "@/lib/help/paths"
import { Breadcrumbs } from "@/components/help/help-parts"
import { HELP_WIDTH, HelpHero } from "@/components/help/help-hero"
import { ContactForm } from "@/components/help/contact-form"
import { SUPPORT_INBOX } from "@/lib/help/contact"

const CONTACT_DESCRIPTION = "Write to the Storelib team about an order, a payout, your store or your account. A person reads every message and replies by email."

export const metadata: Metadata = {
  title: { absolute: "Contact support | Storelib Help Center" },
  description: CONTACT_DESCRIPTION,
  alternates: { canonical: publicHelpUrl("/contact") },
  /* Its own card: with none, the page inherited the home page's og:url and title. */
  openGraph: { title: "Contact support", description: CONTACT_DESCRIPTION, url: publicHelpUrl("/contact"), siteName: "Storelib Help Center", type: "website" },
  twitter: { card: "summary", title: "Contact support", description: CONTACT_DESCRIPTION },
}

/**
 * help.storelib.com/contact: the Help Center's own way to reach the team, a
 * form rather than a mailto that opens whatever mail app happens to be set
 * up (components/help/contact-form.tsx, app/api/help/contact).
 */
export default async function HelpContactPage({ searchParams }: { searchParams: Promise<{ about?: string }> }) {
  const { about } = await searchParams
  return (
    <div className="bg-white">
      <HelpHero />
      <div className={`${HELP_WIDTH} pb-16 pt-6 sm:pb-24 sm:pt-8`}>
        <Breadcrumbs items={[{ label: "All topics", href: "/help" }, { label: "Contact support" }]} />
        <div className="mx-auto mt-6 max-w-[860px]">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[32px]">Contact support</h1>
          <p className="mt-1.5 max-w-[62ch] text-[15.5px] leading-relaxed text-[#4b5563]">
            Tell us what is going on and a person on the team will reply by email, usually within a day. You can also{" "}
            <a href={helpHref("/help")} className="font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-2 hover:decoration-[#1a1a2e]">
              browse the guides
            </a>
            .
          </p>
          <div className="mt-7">
            <ContactForm initialReason={about} />
          </div>
          <p className="mt-5 text-center text-[13px] text-[#9ca3af]">
            Prefer email? Write to{" "}
            <a href={`mailto:${SUPPORT_INBOX}`} className="text-[#6b7280] underline underline-offset-2 hover:text-[#1a1a2e]">
              {SUPPORT_INBOX}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
