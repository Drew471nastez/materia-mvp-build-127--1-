import type React from "react"
import type { Metadata } from "next"
import { AuthArrival } from "@/components/auth/auth-arrival-server"
import { pageMetadata } from "@/lib/seo/page-metadata"

/*
  /signup is in the sitemap and is the one auth page that is indexed (the
  auth layout says noindex for the rest). It is a client page, so its title,
  canonical and card are set here. /signup/verify says noindex again
  (./verify/layout.tsx), since this layout's robots reach it too.
*/
export const metadata: Metadata = pageMetadata({
  path: "/signup",
  title: "Sign up",
  description: "Create a free Storelib account with your email, Google or Apple and start selling digital products, with no monthly fee on the Free plan.",
  robots: { index: true, follow: true },
})

/* Drawn per request, with the form and the address's own ?intent= and ?next= in the first HTML (components/auth/auth-arrival-server.tsx). */
export const dynamic = "force-dynamic"

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <AuthArrival>{children}</AuthArrival>
}
