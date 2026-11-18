import type React from "react"
import type { Metadata } from "next"
import { AuthArrival } from "@/components/auth/auth-arrival-server"
import { authPageMetadata } from "@/lib/seo/private-metadata"

/* A client page, so its title is set here. Not indexed, links followed, no canonical (lib/seo/private-metadata.ts). */
export const metadata: Metadata = authPageMetadata("Log in", "Log in to your Storelib account to manage your store, products and orders, or to open what you bought.")

/* Drawn per request, with the form and the address's own ?intent= and ?next= in the first HTML (components/auth/auth-arrival-server.tsx). */
export const dynamic = "force-dynamic"

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthArrival>{children}</AuthArrival>
}
