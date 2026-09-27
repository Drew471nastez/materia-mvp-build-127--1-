import { NextResponse, type NextRequest } from "next/server"

import { recordAdminAction } from "@/lib/admin/audit"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import {
  ASSOCIATION_PATH,
  buildReport,
  findDomain,
  nextStep,
  normaliseDomain,
  siteDomain,
  associationNote,
  associationOk,
  type AssociationCheck,
  type DomainRecord,
  type WalletDomainReport,
} from "@/lib/checkout/wallet-domains"
import { baseUrl } from "@/lib/notify/urls"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET  /api/admin/payment-domains   where Stripe stands on our domain
 *  POST /api/admin/payment-domains   register it, or re-check it
 * ===========================================================================
 * Apple Pay and Google Pay only appear on a domain that is registered with
 * the Stripe account as a payment method domain. That registration is the
 * last thing standing between the checkout and the wallet buttons: the
 * Express Checkout Element already asks for Apple Pay, Google Pay and Link,
 * and the association file Apple fetches is already served
 * (public/.well-known, next.config.mjs).
 *
 * This is the dashboard's Payment method domains page, in the admin console,
 * because it has to be usable from a phone.
 *
 * ---------------------------------------------------------------------------
 * PRESSING IT TWICE IS SAFE
 * ---------------------------------------------------------------------------
 * POST reads Stripe's own list first. A domain that is there is VALIDATED,
 * which asks Stripe to fetch the association file again and re-check each
 * wallet; a domain that is not is CREATED. So the second press is a re-check,
 * not a second registration, and Stripe's duplicate error is never reached.
 *
 * It changes nothing about a payment: no amount, no PaymentIntent, no
 * charge. It decides where a button is allowed to draw.
 *
 * ---------------------------------------------------------------------------
 * OUR OWN FILE IS CHECKED FROM HERE TOO
 * ---------------------------------------------------------------------------
 * Stripe's `apple_pay.status_details.error_message` is the truth about what
 * Apple saw, but it arrives a step late. So both answers also fetch
 * /.well-known/apple-developer-merchantid-domain-association from the domain
 * itself and report the status and the byte length, with redirects NOT
 * followed, because Apple does not follow one either. A 404, a redirect to a
 * login page, or a 12-byte answer is then visible in the same place as
 * Stripe's verdict instead of needing curl.
 *
 * Everything that decides anything is in lib/checkout/wallet-domains.ts and
 * runs in tests/wallet-domains.test.ts without a Stripe key.
 */

/** Long enough for a cold edge, short enough that the panel is not left waiting. */
const FETCH_TIMEOUT_MS = 8_000

/**
 * Our own association file, as Apple would see it: no redirect followed, no
 * cache. A failure is an answer too, so this never throws.
 */
async function checkAssociation(domain: string): Promise<AssociationCheck> {
  const url = `https://${domain}${ASSOCIATION_PATH}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "manual", signal: controller.signal })
    const location = res.headers.get("location")
    const redirectedTo = res.status >= 300 && res.status < 400 && location ? location.slice(0, 200) : null
    /* Byte length, not character length: the file is ASCII, and a short body is the tell. */
    const body = redirectedTo ? "" : await res.text().catch(() => "")
    const bytes = redirectedTo ? null : new TextEncoder().encode(body).length
    const partial = { status: res.status, bytes, redirectedTo }
    return { url, ...partial, ok: associationOk(partial), note: associationNote(partial) }
  } catch (e) {
    console.error(`[admin] payment-domains association fetch: ${e instanceof Error ? e.message : "unknown"}`)
    const partial = { status: null, bytes: null, redirectedTo: null }
    return { url, ...partial, ok: false, note: associationNote(partial) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The whole report: every domain on the account, this domain's registration,
 * and our own file. The list is asked for in full rather than filtered by
 * name, so a creator's own domain shows here as well.
 */
async function report(domain: string): Promise<WalletDomainReport> {
  const { stripe } = await import("@/lib/stripe")
  const [list, association] = await Promise.all([
    stripe.paymentMethodDomains.list({ limit: 100 }),
    checkAssociation(domain),
  ])
  const all = (list.data ?? []) as DomainRecord[]
  return buildReport({ domain, record: findDomain(all, domain), all, association })
}

/** The domain this request is about: an explicit one, or the site's own. */
function domainFor(request: NextRequest, asked: unknown): { domain: string } | { error: string } {
  if (asked !== undefined && asked !== null && asked !== "") {
    const named = normaliseDomain(asked)
    if (!named) return { error: "That is not a domain name." }
    return { domain: named }
  }
  return { domain: siteDomain(baseUrl(), request.url) }
}

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const chosen = domainFor(request, new URL(request.url).searchParams.get("domain"))
  if ("error" in chosen) return NextResponse.json({ error: chosen.error }, { status: 400 })

  try {
    return NextResponse.json(await report(chosen.domain), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return adminFailure("payment domains read", error, "Stripe could not be asked about this domain. Nothing was changed.")
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const chosen = domainFor(request, (body as { domain?: unknown })?.domain)
  if ("error" in chosen) return NextResponse.json({ error: chosen.error }, { status: 400 })
  const domain = chosen.domain

  const { stripe } = await import("@/lib/stripe")

  /* What Stripe already has decides which call this is. */
  let existing: DomainRecord | null
  try {
    const found = await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 10 })
    existing = findDomain((found.data ?? []) as DomainRecord[], domain)
  } catch (error) {
    return adminFailure("payment domains list", error, "Stripe could not be asked about this domain. Nothing was changed.")
  }

  const step = nextStep(existing)
  try {
    if (step === "create") {
      await stripe.paymentMethodDomains.create({ domain_name: domain, enabled: true })
    } else {
      await stripe.paymentMethodDomains.validate(existing!.id!)
    }
  } catch (error) {
    /* Stripe's own sentence for a domain it refused says what to fix; anything else stays in the log. */
    const e = error as { type?: string; raw?: { message?: string } }
    const said =
      e?.type === "StripeInvalidRequestError" && e.raw?.message
        ? `Stripe refused: ${e.raw.message}`
        : step === "create"
          ? "Stripe did not register the domain. Nothing was changed."
          : "Stripe did not re-check the domain. Nothing was changed."
    return adminFailure(`payment domains ${step}`, error, said, 502)
  }

  const notes: string[] = []
  const recorded = await recordAdminAction(createAdminClient(), {
    action: step === "create" ? "register_payment_domain" : "validate_payment_domain",
    targetType: "domain",
    targetId: domain,
    targetLabel: domain,
    detail: { step },
  })
  if (!recorded) notes.push("Not written to the audit log: its table is missing. Run supabase/sql/RUN_ADMIN_CONSOLE.sql.")

  /* The same report GET answers, read back after the change. */
  try {
    return NextResponse.json({ ...(await report(domain)), did: step, notes }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return adminFailure(
      "payment domains read back",
      error,
      step === "create" ? "The domain was registered, but Stripe could not be read back. Open this panel again." : "The domain was re-checked, but Stripe could not be read back. Open this panel again.",
    )
  }
}
