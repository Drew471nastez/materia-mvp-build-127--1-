import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfHost } from "@/lib/checkout/site-checkout-server"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { ShopBar } from "../../parts/shop-bar"
import { ErrorBanner, Field, TextInput } from "../../parts/ui"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Track your order", robots: { index: false, follow: false }, referrer: "no-referrer" }

/** Why the last try stopped, as a fixed sentence: nothing from the address is printed. */
const ERRORS: Record<string, string> = {
  number: "Check the order number. It's the 8 letters and numbers after # in your order email.",
  email: "Enter the email you ordered with.",
  limit: "That's a lot of tries. Wait a few minutes, then try again.",
}

/**
 * ===========================================================================
 *  TRACK YOUR ORDER, ON THE STORE'S WEBSITE
 * ===========================================================================
 * https://<site host>/checkout/track (lib/checkout/site-checkout routes it
 * here on a website's own host, a subdomain or a connected domain): the
 * order number and the email it was placed with, and the link to that
 * order is emailed to that address (app/api/checkout/site/track). No
 * script, no account. The same words whether anything matched, so it says
 * nothing about anybody's orders.
 */
export default async function SiteTrackPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams
  const admin = createAdminClient()
  const site = await siteOfHost(admin, (await headers()).get("host"))
  if (!site) notFound()
  const brand = await checkoutBrand(admin, site.creatorId)
  const shopUrl = `${site.origin}/`
  const error = sp.error && Object.prototype.hasOwnProperty.call(ERRORS, sp.error) ? ERRORS[sp.error] : null
  const sent = sp.sent === "1" && !error

  return (
    <div data-page="order-lookup" className="min-h-dvh bg-[#f8f9fa]">
      <ShopBar brand={brand} backTo={null} shopUrl={shopUrl} />
      <main className="mx-auto w-full max-w-[460px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Track your order</h1>
        {sent ? (
          <div role="status" className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[15px] font-medium text-[#1a1a2e]">Check your email</p>
            <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">If that order number and email match an order, we sent a link to it. It can take a minute to arrive.</p>
            <a href="/checkout/track" className="mt-4 inline-flex min-h-[44px] items-center text-[14.5px] font-medium text-[#1a1a2e] underline underline-offset-4">
              Look up another order
            </a>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">Enter your order number and the email you ordered with. We'll email you a link to your order and its tracking.</p>
            <form method="post" action="/api/checkout/site/track" className="mt-6 space-y-4">
              {error ? <ErrorBanner>{error}</ErrorBanner> : null}
              <Field id="track-number" label="Order number" hint="It's in your order confirmation email.">
                <TextInput id="track-number" name="number" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} placeholder="#3F2A9C1B" required invalid={sp.error === "number"} />
              </Field>
              <Field id="track-email" label="Email">
                <TextInput id="track-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required invalid={sp.error === "email"} />
              </Field>
              <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[#1a1a2e] px-4 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(0,0,0,0.12)] hover:bg-[#262640]">
                Email me the link
              </button>
            </form>
          </>
        )}
        <p className="mt-8 text-[14px] text-[#6b7280]">
          Have an account?{" "}
          <a href="/account/login?return=%2Faccount" className="font-medium text-[#1a1a2e] underline underline-offset-4">
            Sign in
          </a>{" "}
          to see all your orders.
        </p>
      </main>
    </div>
  )
}
