import { publicHelpUrl } from "@/lib/help/paths"
import type { Metadata } from "next"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { helpTopicsFor } from "@/lib/help/questions"
import { Breadcrumbs, ContactSupport } from "@/components/help/help-parts"
import { HELP_WIDTH, HelpHero, TopicIcon } from "@/components/help/help-hero"
import { QuestionsBrowser } from "@/components/help/questions-browser"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { helpBreadcrumbs } from "@/lib/help/structured-data"

const DESCRIPTION = "What happens when an order can't be filled, a parcel goes missing, a buyer wants a refund or can't find a download, and what to do, for stores and for buyers."

export const metadata: Metadata = {
  title: { absolute: "Order problems, answered for stores and buyers | Storelib Help Center" },
  description: DESCRIPTION,
  alternates: { canonical: publicHelpUrl("/questions") },
  openGraph: { title: "Order problems, answered", description: DESCRIPTION, url: publicHelpUrl("/questions"), siteName: "Storelib Help Center", type: "website" },
  twitter: { card: "summary", title: "Order problems, answered", description: DESCRIPTION },
}

/* The physical questions follow the switch in /admin, like the rest of the physical guide. */
/* An hour (round 54, Vercel cost): saving, publishing and a post going live clear these at once (lib/blog/admin-http.ts, went-live.ts; the platform switch clears /help). */
export const revalidate = 3600

/**
 * /help/questions: the questions stores and buyers ask, by topic, each with
 * what happens and what each side does (lib/help/questions.ts). The answers
 * are in the page as it's served, for search engines and for reading with
 * no script; the search and the topic list work on top of that.
 */
export default async function HelpQuestionsPage() {
  const topics = helpTopicsFor(await isPhysicalCommerceEnabled())
  /* Breadcrumbs only (round 45): no FAQPage, whose rich results Google shows only for government and health sites. The answers are plain HTML below. */
  const crumbs = { "@context": "https://schema.org", ...helpBreadcrumbs([{ name: "Help Center", path: "/help" }, { name: "Order problems", path: "/help/questions" }]) }
  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }} />
      <HelpHero />
      <div className={`${HELP_WIDTH} pt-6 sm:pt-8`}>
        <Breadcrumbs items={[{ label: "All topics", href: "/help" }, { label: "Order problems" }]} />
        <div className="mt-6 flex items-start gap-4">
          <TopicIcon slug="questions" size={52} />
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[32px]">Order problems, answered</h1>
            <p className="mt-1.5 max-w-[62ch] text-[15.5px] leading-relaxed text-[#4b5563]">What happens, what the store does and what the buyer does, for the questions asked most.</p>
          </div>
        </div>
      </div>
      <div className={`${HELP_WIDTH} py-8 sm:py-10`}>
        <QuestionsBrowser topics={topics} />
      </div>
      <ContactSupport frame={HELP_WIDTH} />
    </div>
  )
}
