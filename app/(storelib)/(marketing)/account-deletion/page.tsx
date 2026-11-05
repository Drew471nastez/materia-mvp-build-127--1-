import type { Metadata } from "next"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { Mail } from "lucide-react"

// Note: header and footer are injected by app/(marketing)/layout.tsx via
// ConditionalHeader / ConditionalFooter — no extra wiring needed in this file.

/*
  Its own title, description and share card (lib/seo/page-metadata), still
  noindex on purpose: the page app stores link to, not one to rank. A
  noindex page names no canonical, so the two signals never disagree.
*/
export const metadata: Metadata = {
  ...pageMetadata({ path: "/account-deletion", title: "Delete Your Account", description: "Learn how to permanently delete your Storelib account and associated data." }),
  alternates: { canonical: null },
  robots: { index: false, follow: false },
}

const steps = [
  {
    title: "Log in to your account",
    description: "Sign in to Storelib at storelib.com using your email and password or Google account.",
  },
  {
    title: "Go to Settings → Security",
    description: "Click your profile avatar in the top corner, then navigate to Settings and open the Security tab.",
  },
  {
    title: "Click Delete Account",
    description: "Scroll to the Danger Zone section and click the Delete Account button.",
  },
  {
    title: "Confirm the deletion",
    description: "Type your confirmation and submit. Your request will be processed immediately.",
  },
]

const consequences = [
  "Your account will be permanently deleted",
  "Your profile and stores will be removed",
  "Associated data will be removed from our systems",
]

export default function AccountDeletionPage() {
  return (
    <div className="min-h-[80vh] bg-white">
      {/* Hero */}
      <div className="border-b border-neutral-100 bg-neutral-50">
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 mb-3">
            Delete Your Storelib Account
          </h1>
          <p className="text-[17px] text-neutral-500 leading-relaxed">
            You can permanently delete your account at any time by following the steps below.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-14 space-y-14">

        {/* Steps */}
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-neutral-400 mb-6">
            How to delete your account
          </h2>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-4 p-5 rounded-2xl border border-neutral-100 bg-white hover:border-neutral-200 transition-colors">
                <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-neutral-100 text-neutral-700 font-semibold text-sm mt-0.5">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900 text-[15px] mb-0.5">{step.title}</p>
                  <p className="text-[14px] text-neutral-500 leading-relaxed">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* What happens */}
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-neutral-400 mb-6">
            What happens after deletion
          </h2>
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-6">
            <ul className="space-y-3">
              {consequences.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] text-neutral-700">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-neutral-400 flex-shrink-0 block" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 pt-5 border-t border-neutral-200 text-[13px] text-neutral-400 leading-relaxed">
              Some data may be retained temporarily for legal, security, or fraud prevention purposes
              in accordance with applicable law.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6 rounded-2xl border border-neutral-100 bg-white">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-neutral-900 text-[15px] mb-1">Can&apos;t access your account?</p>
            <p className="text-[14px] text-neutral-500">
              If you can&apos;t log in, our team can process the deletion for you. Reach out and we&apos;ll help.
            </p>
          </div>
          <a
            href="mailto:team@storelib.com"
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-[13px] font-medium hover:bg-neutral-800 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            team@storelib.com
          </a>
        </section>

      </div>
    </div>
  )
}
