import type { Metadata } from "next"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { helpTopicsFor } from "@/lib/help/questions"
import { Breadcrumbs, ContactSupport, HELP_CONTAINER } from "@/components/help/help-parts"
import { QuestionsBrowser } from "@/components/help/questions-browser"
import { jsonLdScript } from "@/lib/seo/json-ld"

const DESCRIPTION = "What happens when an order can't be filled, a parcel goes missing, a buyer wants a refund or can't find a download, and what to do, for stores and for buyers."

export const metadata: Metadata = {
  title: { absolute: "Order problems, answered for stores and buyers | Storelib Help Center" },
  description: DESCRIPTION,
  alternates: { canonical: "/help/questions" },
  openGraph: { title: "Order problems, answered", description: DESCRIPTION, url: "/help/questions", siteName: "Storelib Help Center", type: "website" },
}

/* The physical questions follow the switch in /admin, like the rest of the physical guide. */
export const revalidate = 60

/**
 * /help/questions: the questions stores and buyers ask, by topic, each with
 * what happens and what each side does (lib/help/questions.ts). The answers
 * are in the page as it's served, for search engines and for reading with
 * no script; the search and the topic list work on top of that.
 */
export default async function HelpQuestionsPage() {
  const topics = helpTopicsFor(await isPhysicalCommerceEnabled())
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: topics.flatMap((t) => t.questions.map((q) => ({ "@type": "Question", name: q.q, acceptedAnswer: { "@type": "Answer", text: q.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") } }))),
  }
  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faq) }} />
      <header className="border-b border-[#e5e7eb] bg-[#f8f9fa]">
        <div className={`${HELP_CONTAINER} py-8 sm:py-12`}>
          <Breadcrumbs items={[{ label: "Help Center", href: "/help" }]} />
          <h1 className="mt-4 text-[28px] font-bold tracking-tight text-[#1a1a2e] sm:text-[32px]">Order problems, answered</h1>
          <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-[#6b7280]">
            The questions stores and buyers ask most, answered for both sides: what happens, what the store does, and what the buyer does.
          </p>
        </div>
      </header>
      <div className={`${HELP_CONTAINER} py-8 sm:py-12`}>
        <QuestionsBrowser topics={topics} />
      </div>
      <ContactSupport />
    </div>
  )
}
