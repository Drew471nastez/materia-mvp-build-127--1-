import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaseForBuyer } from "@/lib/support/cases-server"
import { CaseView } from "./case-view"

export const dynamic = "force-dynamic"

/* A private page: never indexed, and the address (with its key) never sent on to another site. */
export const metadata: Metadata = { title: "Your case", robots: { index: false, follow: false }, referrer: "no-referrer" }

/**
 * A buyer's case about their order (lib/support/cases.ts), opened with its
 * private link (`k`), the same one every email about it carries.
 */
export default async function OrderHelpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params
  const { k } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id) || !k) notFound()
  const out = await getCaseForBuyer(createAdminClient(), id, k)
  if (!out.ok) notFound()
  return <CaseView id={id} k={k} initial={{ case: out.case, messages: out.messages, escalation: out.escalation }} store={{ name: out.store.name, logoUrl: out.store.logoUrl, email: out.store.email, phone: out.store.phone, websiteUrl: out.store.websiteUrl }} />
}
