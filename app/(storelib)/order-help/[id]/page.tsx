import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaseForBuyer } from "@/lib/support/cases-server"
import { buyerPageLanguage } from "@/lib/markets/checkout-language"
import { CheckoutWords } from "@/components/checkout/parts/words"
import { CaseView } from "./case-view"

export const dynamic = "force-dynamic"

/* A private page: never indexed, and the address (with its key) never sent on to another site. */
export const metadata: Metadata = { title: "Your conversation with the shop", robots: { index: false, follow: false }, referrer: "no-referrer" }

const ENGLISH = { lang: "en", words: {} as Record<string, string> }

/**
 * A buyer's case about their order (lib/support/cases.ts), opened with its
 * private link (`k`), the same one every email about it carries. Served on
 * storelib.com and on the store's own website (proxy.ts lets /order-help
 * through on every host); the links a parcel's case sends are on the
 * website (lib/support/cases-server.ts). In the order's language, as its
 * emails and its order page (lib/markets/buyer-language.ts): the one an
 * email link names (?lang), else the one the order was placed in, else the
 * store's default; English for an order from storelib.com.
 */
export default async function OrderHelpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; lang?: string }> }) {
  const { id } = await params
  const { k, lang } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id) || !k) notFound()
  const out = await getCaseForBuyer(createAdminClient(), id, k)
  if (!out.ok) notFound()
  const language = await buyerPageLanguage(out.store.creatorId, { channel: out.order.channel, named: lang, order: out.order.lang }).catch(() => ENGLISH)
  return (
    <CheckoutWords lang={language.lang} words={language.words}>
      <CaseView
        id={id}
        k={k}
        initial={{ case: out.case, messages: out.messages, escalation: out.escalation }}
        store={{ name: out.store.name, logoUrl: out.store.logoUrl, email: out.store.email, phone: out.store.phone, websiteUrl: out.order.storeUrl }}
        order={{ path: out.order.path }}
        live={out.live}
      />
    </CheckoutWords>
  )
}
