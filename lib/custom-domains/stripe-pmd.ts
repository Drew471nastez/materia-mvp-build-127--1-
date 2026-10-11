import "server-only"

/**
 * Register a creator's live hostname with Stripe payment method domains on
 * the platform account, or disable that registration when the domain is
 * disconnected. Does not touch PaymentIntents, Connect, fees, or storelib.com.
 */
import { findDomain, type DomainRecord } from "@/lib/checkout/wallet-domains"
import { checkoutHostsFor, needsOneValidate, planPaymentDomain, siteSubdomainForWallets } from "@/lib/custom-domains/payment-hosts"
import { getMainDomain } from "@/lib/url-helpers"
import { isMissingColumn, isMissingTable } from "@/lib/custom-domains/store"
import { createAdminClient } from "@/lib/supabase/admin"

type Admin = ReturnType<typeof createAdminClient>

function walletsOf(record: DomainRecord | null | undefined) {
  return {
    stripe_pmd_id: record?.id ?? null,
    apple_pay_status: record?.apple_pay?.status ?? null,
    google_pay_status: record?.google_pay?.status ?? null,
    enabled: record?.enabled !== false,
  }
}

async function remember(admin: Admin, customDomainId: string | null, hostname: string, record: DomainRecord | null) {
  const { error } = await admin.from("stripe_payment_method_domains").upsert(
    {
      hostname,
      custom_domain_id: customDomainId,
      ...walletsOf(record),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hostname" },
  )
  if (error && !isMissingTable(error) && !isMissingColumn(error)) {
    console.error("[stripe-pmd] save failed:", error.message)
  }
}

async function loadExisting(hostname: string) {
  const { stripe } = await import("@/lib/stripe")
  const found = await stripe.paymentMethodDomains.list({ domain_name: hostname, limit: 10 })
  return findDomain((found.data ?? []) as DomainRecord[], hostname)
}

/**
 * After a domain is active: create the payment-method domain if Stripe does
 * not have it, re-enable it if it was switched off, and validate once when
 * Apple Pay or Google Pay is not active yet. A later Check again retries.
 */
export async function syncStripePaymentDomains(admin: Admin, customDomainId: string, domain: string): Promise<void> {
  const hosts = checkoutHostsFor(domain)
  if (hosts.length === 0) return
  const { stripe } = await import("@/lib/stripe")
  for (const hostname of hosts) {
    try {
      let existing = await loadExisting(hostname)
      const plan = planPaymentDomain(existing)
      if (plan === "create") {
        existing = (await stripe.paymentMethodDomains.create({ domain_name: hostname, enabled: true })) as DomainRecord
      } else if (plan === "enable" && existing?.id) {
        existing = (await stripe.paymentMethodDomains.update(existing.id, { enabled: true })) as DomainRecord
      }
      if (existing?.id && needsOneValidate(existing)) {
        existing = (await stripe.paymentMethodDomains.validate(existing.id)) as DomainRecord
      }
      await remember(admin, customDomainId, hostname, existing)
    } catch (error) {
      console.error(`[stripe-pmd] ${hostname}:`, error instanceof Error ? error.message : error)
    }
  }
}

/** Disconnect: disable the platform registration. storelib.com is never in the host list. */
export async function disableStripePaymentDomains(admin: Admin, domain: string): Promise<void> {
  const hosts = checkoutHostsFor(domain)
  if (hosts.length === 0) return
  const { stripe } = await import("@/lib/stripe")
  for (const hostname of hosts) {
    try {
      const existing = await loadExisting(hostname)
      if (!existing?.id || existing.enabled === false) {
        if (existing) {
          const { error } = await admin
            .from("stripe_payment_method_domains")
            .update({ enabled: false, apple_pay_status: existing.apple_pay?.status ?? null, google_pay_status: existing.google_pay?.status ?? null, updated_at: new Date().toISOString() })
            .eq("hostname", hostname)
          if (error && !isMissingTable(error) && !isMissingColumn(error)) console.error("[stripe-pmd] save failed:", error.message)
        }
        continue
      }
      const updated = (await stripe.paymentMethodDomains.update(existing.id, { enabled: false })) as DomainRecord
      const { error } = await admin
        .from("stripe_payment_method_domains")
        .update({
          stripe_pmd_id: updated.id ?? existing.id,
          enabled: false,
          apple_pay_status: updated.apple_pay?.status ?? existing.apple_pay?.status ?? null,
          google_pay_status: updated.google_pay?.status ?? existing.google_pay?.status ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("hostname", hostname)
      if (error && !isMissingTable(error) && !isMissingColumn(error)) console.error("[stripe-pmd] save failed:", error.message)
    } catch (error) {
      console.error(`[stripe-pmd] disable ${hostname}:`, error instanceof Error ? error.message : error)
    }
  }
}

/*
 * A WEBSITE'S OWN SUBDOMAIN. The checkout on andrews.storelib.com is on that
 * host (lib/checkout/site-checkout), and Stripe draws Apple Pay and Google
 * Pay only on a domain registered with the platform account, one exact
 * hostname each: storelib.com's registration does not cover it, so the
 * wallet row was simply missing there. Registered the first time its
 * checkout is opened (app/checkout/site), after the page is sent, and
 * remembered in stripe_payment_method_domains: once active it is never asked
 * again; until then at most once a day per host, and once per six hours per
 * server even where that table is missing. Apple fetches the domain file
 * from the host itself (public/.well-known, served on every host: proxy.ts).
 */
const askedSubdomains = new Map<string, number>()

export async function ensureSiteWalletDomain(admin: Admin, host: string): Promise<void> {
  const hostname = siteSubdomainForWallets(host, getMainDomain())
  if (!hostname) return
  const now = Date.now()
  const asked = askedSubdomains.get(hostname)
  if (asked && now - asked < 6 * 3600_000) return
  if (askedSubdomains.size > 5000) askedSubdomains.clear()
  askedSubdomains.set(hostname, now)
  try {
    const { data, error } = await admin.from("stripe_payment_method_domains").select("enabled, apple_pay_status, google_pay_status, updated_at").eq("hostname", hostname).maybeSingle()
    if (!error && data) {
      const row = data as { enabled?: boolean | null; apple_pay_status?: string | null; google_pay_status?: string | null; updated_at?: string | null }
      if (row.enabled !== false && row.apple_pay_status === "active" && row.google_pay_status === "active") return
      const at = Date.parse(row.updated_at ?? "")
      if (Number.isFinite(at) && now - at < 24 * 3600_000) return
    }
    const { stripe } = await import("@/lib/stripe")
    let existing = await loadExisting(hostname)
    const plan = planPaymentDomain(existing)
    if (plan === "create") existing = (await stripe.paymentMethodDomains.create({ domain_name: hostname, enabled: true })) as DomainRecord
    else if (plan === "enable" && existing?.id) existing = (await stripe.paymentMethodDomains.update(existing.id, { enabled: true })) as DomainRecord
    if (existing?.id && needsOneValidate(existing)) existing = (await stripe.paymentMethodDomains.validate(existing.id)) as DomainRecord
    await remember(admin, null, hostname, existing)
  } catch (error) {
    console.error(`[stripe-pmd] ${hostname}:`, error instanceof Error ? error.message : error)
  }
}
