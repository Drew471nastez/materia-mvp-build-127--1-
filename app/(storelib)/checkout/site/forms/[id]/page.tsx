import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfThisHost } from "@/lib/checkout/site-checkout-server"
import { storefrontForms } from "@/lib/forms/storefront-forms"
import { publicDefinition, validateDefinition } from "@/lib/forms/definition"
import { SiteFormFrame } from "./site-form-frame"

export const dynamic = "force-dynamic"

/* A frame of the website's own page: never indexed, and never sent on as a Referer. */
export const metadata: Metadata = { title: "Form", robots: { index: false, follow: false }, referrer: "same-origin" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ===========================================================================
 *  https://<site host>/checkout/forms/<id>
 * ===========================================================================
 * One of the creator's published forms or booking pages, drawn by Storelib's
 * own renderer for the website's page to frame (lib/storelib-theme/compat/
 * storelib-form.ts, the journey-storelib-form section and the Storelib form
 * app block). The proxy sends the address here on the website's host and
 * lets only that origin frame it (lib/checkout/site-checkout
 * siteCheckoutRouteFor `framed`). The shop is the HOST's: a form that is not
 * this website's creator's is not found here, whatever id is asked for.
 * Answers, booking times and payment go through the form's own routes
 * (/api/forms/<id>/public, slots, submit), exactly as on storelib.com.
 */
export default async function SiteFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const site = await siteOfThisHost((await headers()).get("host"))
  if (!site) notFound()
  const admin = createAdminClient()
  const theirs = await storefrontForms(admin, site.creatorId, [id])
  if (!theirs[id.toLowerCase()]) notFound()
  const { data, error } = await admin.from("native_forms").select("id,revision,published").eq("id", id.toLowerCase()).eq("status", "published").maybeSingle()
  if (error || !data?.published) notFound()
  let definition
  try {
    definition = publicDefinition(validateDefinition(data.published))
  } catch {
    notFound()
  }
  return <SiteFormFrame formId={id.toLowerCase()} initial={{ id: id.toLowerCase(), revision: data.revision, definition }} site={site.host} title={theirs[id.toLowerCase()].title} />
}
