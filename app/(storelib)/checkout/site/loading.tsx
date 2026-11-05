import { stripeEarly } from "../parts/stripe-early"

/**
 * THE CHECKOUT'S OWN FRAME, AT ONCE.
 *
 * A website's Check out is a full page load, and the page is priced on the
 * server before it is sent (./page.tsx), so the browser held the shop's page
 * with nothing happening until the whole checkout arrived. This is streamed
 * first instead: the checkout's own background and, from 1024px, its white
 * right half, exactly where the page draws them, with nothing in them. The
 * checkout then comes in over it with its usual entrance (checkout-enter).
 * No spinner and no grey blocks: nothing is drawn that then has to go away.
 */
export default function SiteCheckoutLoading() {
  /* Stripe's connections and Stripe.js, asked for with this first frame, while the page is priced (../parts/stripe-early). */
  stripeEarly({ script: true })
  return (
    <div data-page="checkout" data-checkout-loading="" aria-busy="true" className="relative min-h-screen bg-white lg:bg-[#f8f9fa]">
      <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 hidden w-1/2 bg-white shadow-[-8px_0_24px_-14px_rgba(17,24,39,0.11)] lg:block" />
      <span className="sr-only">Loading checkout</span>
    </div>
  )
}
