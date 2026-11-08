import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteOfHost } from "@/lib/checkout/site-checkout-server"
import { checkoutBrand } from "@/lib/checkout/brand-server"
import { ShopBar } from "../../parts/shop-bar"
import { ErrorBanner, Field, TextInput } from "@/components/checkout/parts/ui"
import { checkoutLanguage } from "@/lib/markets/checkout-language"
import { checkoutT, type CheckoutT } from "@/lib/markets/checkout-words"
import { CheckoutWords } from "@/components/checkout/parts/words"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Track your order", robots: { index: false, follow: false }, referrer: "no-referrer" }

/** Why the last try stopped, as a fixed sentence in the page's language: nothing from the address is printed. */
function errorOf(ct: CheckoutT, why: string | undefined): string | null {
  switch (why) {
    case "number":
      return ct("Check the order number. It's the 8 letters and numbers after # in your order email.")
    case "email":
      return ct("Enter the email you ordered with.")
    case "limit":
      return ct("That's a lot of tries. Wait a few minutes, then try again.")
    default:
      return null
  }
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
export default async function SiteTrackPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; lang?: string }> }) {
  const sp = await searchParams
  const admin = createAdminClient()
  const site = await siteOfHost(admin, (await headers()).get("host"))
  if (!site) notFound()
  /*
    IN THE WEBSITE'S LANGUAGE: the one the link names (?lang=fr, from a
    page in French), else the one the visitor chose on the website, as the
    checkout picks it (lib/markets/checkout-language). It was English only.
  */
  const [brand, language] = await Promise.all([
    checkoutBrand(admin, site.creatorId),
    checkoutLanguage(site.creatorId, null, (await cookies()).get("sl_lang")?.value, sp.lang).catch(() => ({ lang: "en", words: {} as Record<string, string> })),
  ])
  const ct = checkoutT(language.lang, language.words)
  const own = language.lang === "en" || !sp.lang ? "" : language.lang
  const shopUrl = `${site.origin}/`
  const error = errorOf(ct, sp.error)
  const sent = sp.sent === "1" && !error

  return (
    <CheckoutWords lang={language.lang} words={language.words}>
    <div data-page="order-lookup" className="min-h-dvh bg-[#f8f9fa]">
      <ShopBar brand={brand} backTo={null} shopUrl={shopUrl} />
      <main className="mx-auto w-full max-w-[460px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <h1 className="text-[24px] font-semibold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">{ct("Track your order")}</h1>
        {sent ? (
          <div role="status" className="mt-6 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[15px] font-medium text-[#1a1a2e]">{ct("Check your email")}</p>
            <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">{ct("If that order number and email match an order, we sent a link to it. It can take a minute to arrive.")}</p>
            <a href={own ? `/checkout/track?lang=${encodeURIComponent(own)}` : "/checkout/track"} className="mt-4 inline-flex min-h-[44px] items-center text-[14.5px] font-medium text-[#1a1a2e] underline underline-offset-4">
              {ct("Look up another order")}
            </a>
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[14.5px] leading-6 text-[#6b7280]">{ct("Enter your order number and the email you ordered with. We'll email you a link to your order and its tracking.")}</p>
            <form method="post" action="/api/checkout/site/track" className="mt-6 space-y-4">
              {own ? <input type="hidden" name="lang" value={own} /> : null}
              {error ? <ErrorBanner>{error}</ErrorBanner> : null}
              <Field id="track-number" label={ct("Order number")} hint={ct("It's in your order confirmation email.")}>
                <TextInput id="track-number" name="number" type="text" inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={20} placeholder="#3F2A9C1B" required invalid={sp.error === "number"} />
              </Field>
              <Field id="track-email" label={ct("Email")}>
                <TextInput id="track-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="you@example.com" required invalid={sp.error === "email"} />
              </Field>
              <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[#1a1a2e] px-4 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(0,0,0,0.12)] hover:bg-[#262640]">
                {ct("Email me the link")}
              </button>
            </form>
          </>
        )}
        <p className="mt-8 text-[14px] text-[#6b7280]">
          {ct("Have an account?")}{" "}
          <a href={`${own ? `/${own}` : ""}/account/login?return=%2Faccount`} className="font-medium text-[#1a1a2e] underline underline-offset-4">
            {ct("Sign in to see all your orders")}
          </a>
        </p>
      </main>
    </div>
    </CheckoutWords>
  )
}
