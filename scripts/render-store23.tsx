/**
 * Round 23, S23: the real checkout, receipt, order page and Store details
 * components for scripts/check-store23.mjs, with the routes they call
 * answered as the real routes answer. `?case=` picks one:
 *
 *   site-gate       the website's own checkout (custom domains, imported Shopify themes) while the store requires sign in
 *   site            the same checkout with Customer information all Required, the news box, and VAT 19% on top
 *   physical-gate   Storelib's cart checkout, signed out, sign in required
 *   physical        the cart checkout's form with the store's fields and its tax by name
 *   digital         the single product checkout with VAT 19% for a buyer in Romania
 *   receipt         the receipt page: the store's name and logo, its business details, VAT 19%
 *   order           the physical order page: date, VAT 19%, currency, Sold by
 *   store           Settings › Store details with Business details filled in
 *   site-cod        the website's checkout with Cash on delivery offered beside the card
 *   site-fr         the same, in French: the store's approved translations of the checkout's words (lib/markets/checkout-words)
 *   physical-cod    Storelib's cart checkout with Cash on delivery offered
 *   order-cod       the physical order page of a cash on delivery order, cash still to pay
 *   order-fr        the physical order page in French, with its help panel
 *   receipt-fr      the receipt page in French
 */
import * as React from "react"
import CheckoutPageClient from "@/app/(storelib)/checkout/checkout-client"
import { SiteCheckout } from "@/app/(storelib)/checkout/site/site-checkout"
import { CheckoutWords } from "@/components/checkout/parts/words"
import { PhysicalCheckout } from "@/app/(storelib)/checkout/physical/physical-checkout"
import { ReceiptView } from "@/app/(storelib)/receipt/[token]/receipt-view"
import { OrderStatusView } from "@/app/(storelib)/checkout/physical/order/[token]/order-status-view"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { checkoutConfig } from "@/lib/store/checkout-config"
import { encodeItems } from "@/lib/physical/cart-link"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"

declare global {
  interface Window {
    __commerceProbeCalls?: { url: string; body: unknown }[]
  }
}

const SHOP = "c0000000-0000-4000-8000-000000000001"
const MUG = "a0000000-0000-4000-8000-0000000000a1"
const STRICT = checkoutConfig({ nameFields: "first_and_last", company: "required", phone: "required", address2: "required", marketingOptIn: true })

const quote: SiteQuote = {
  kind: "ships",
  creatorId: SHOP,
  lines: [{ productId: MUG, variantId: null, title: "Stoneware mug", variantName: null, imageUrl: null, type: "physical", quantity: 2, unitCents: 2000, discountCents: 0, requiresShipping: true, maxQuantity: 99 }],
  dropped: [],
  stockIssues: [],
  requiresShipping: true,
  coupon: null,
  couponError: null,
  delivery: { ok: true, options: [{ id: "r1", name: "Standard", priceCents: 500, estimate: "3 to 5 business days" }], selectedId: "r1", needsCountry: false },
  pickups: [],
  totals: { itemsSubtotalCents: 4000, discountCents: 0, shippingCents: 500, shippingDiscountCents: 0, taxCents: 760, taxIncluded: false, totalCents: 5260, taxLabel: "VAT 19%" },
}

const settings = {
  settings: {
    storeName: "Bread Studio",
    phone: "+40 721 234 567",
    phoneCountry: "RO",
    defaultCountry: "RO",
    checkout: STRICT,
    defaultSalesChannelId: null,
    logoUrl: null,
    legal: { company: "Bread Studio SRL", taxId: "RO12345678", country: "RO", line1: "Strada Lungă 4", line2: "", city: "Cluj-Napoca", postalCode: "400001", region: "Cluj" },
    ready: true,
  },
  detectedCountry: "RO",
  supportEmail: "hello@bread.studio",
  suggested: { storeName: "Ana Pop", contactEmail: "ana@example.com" },
  logoDefault: null,
}

function stubFetch() {
  const calls: { url: string; body: unknown }[] = (window.__commerceProbeCalls = [])
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = null
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null
    } catch {
      body = String(init?.body)
    }
    calls.push({ url, body })
    /* Cash on delivery placed: the thank you page, as the route answers it. */
    if (url.startsWith("/api/checkout/site") && (body as { action?: string } | null)?.action === "cod") return json({ receiptToken: "rt_cod", thanks: "/checkout/thanks/rt_cod" })
    if (url.startsWith("/api/checkout/site")) return json(quote)
    if (url === "/api/physical/checkout") return json({ url: "/checkout/physical/order/rt_cod", free: false, cod: true })
    if (url.startsWith("/api/physical/checkout/quote")) return json(quote)
    if (url.startsWith("/api/store/settings")) return json(settings)
    if (url.startsWith("/api/physical/settings")) return json({ settings: { defaultLocationId: null }, locations: [] })
    return json({})
  }) as typeof fetch
}

const brand = { name: "Bread Studio", imageUrl: null, kind: null } as never

/** What a French store's Translate › Checkout holds once approved. */
const FRENCH: Record<string, string> = {
  "Contact information": "Coordonnées",
  "Payment method": "Moyen de paiement",
  "Card": "Carte",
  "Cash on delivery": "Paiement à la livraison",
  "Delivery": "Livraison",
  "Shipping method": "Mode de livraison",
  "Pay {amount}": "Payer {amount}",
  "Pay {shop}": "Payer {shop}",
  "Subtotal": "Sous-total",
  "Total due": "Total à payer",
  "Order summary": "Récapitulatif",
  "First name": "Prénom",
  "Last name": "Nom",
  "Address": "Adresse",
  "City": "Ville",
  "Country/region": "Pays ou région",
  "Phone": "Téléphone",
  "Email me with news and offers": "Recevoir les nouveautés et les offres par e-mail",
  "I agree to the [Terms and Conditions] and the [Refund policy]": "J'accepte les [Conditions générales] et la [Politique de remboursement]",
  "Add a note for the shop": "Ajouter une note pour la boutique",
  "Continue shopping": "Continuer mes achats",
  "Powered by": "Fourni par",
  "Pay {amount} in cash when it's delivered.": "Payez {amount} en espèces à la livraison.",
  "Place order": "Passer la commande",
  "Enter a valid email address.": "Saisissez une adresse e-mail valide.",
  /* The order page and the receipt (app/(storelib)/checkout/physical/order, app/(storelib)/receipt). */
  "Order {number}": "Commande {number}",
  "Your order is confirmed": "Votre commande est confirmée",
  "Confirmed": "Confirmée",
  "Processing": "En préparation",
  "Shipped": "Expédiée",
  "Delivered": "Livrée",
  "{method}, usually {estimate} after it ships.": "{method}, en général {estimate} après l'expédition.",
  "{min} to {max} business days": "{min} à {max} jours ouvrés",
  "Items": "Articles",
  "Qty {quantity}": "Qté {quantity}",
  "Shipping": "Livraison",
  "Total": "Total",
  "Shipping address": "Adresse de livraison",
  "Need help with this order?": "Besoin d'aide pour cette commande ?",
  "Write to {shop} about anything with this order.": "Écrivez à {shop} pour toute question sur cette commande.",
  "Contact the shop": "Contacter la boutique",
  "Thanks, {name}": "Merci, {name}",
  "Order {number} · {date}": "Commande {number} · {date}",
  "Sold by {name} (trading as {store})": "Vendu par {name} (sous le nom {store})",
  "Download invoice (PDF)": "Télécharger la facture (PDF)",
}

export function boot(render: (el: React.ReactElement) => void) {
  stubFetch()
  const which = new URLSearchParams(location.search).get("case") || "site"
  const wrap = (el: React.ReactElement) => <div data-case={which}>{el}</div>
  const cod = which.endsWith("-cod")
  const withCash = (c: ReturnType<typeof checkoutConfig>) => (cod ? { ...c, cashOnDelivery: true } : c)
  if (which === "site-gate" || which === "site" || which === "site-cod" || which === "site-fr") {
    const gate = which === "site-gate"
    const fr = which === "site-fr"
    render(
      wrap(
        <CheckoutWords lang={fr ? "fr" : "en"} words={fr ? FRENCH : {}}>
        <SiteCheckout
          shopId={SHOP}
          brand={brand}
          shopUrl="https://bread.studio/"
          backTo="https://bread.studio/cart"
          items={[{ productId: MUG, variantId: null, quantity: 2 }]}
          wholeCart
          couponCode={null}
          initialQuote={quote}
          initialError={null}
          config={gate ? checkoutConfig({ requireAccount: true }) : fr ? { ...STRICT, cashOnDelivery: true } : withCash(STRICT)}
          buyer={null}
          lockedEmail={null}
          needsSignIn={gate}
          lang={fr ? "fr" : undefined}
        />
        </CheckoutWords>,
      ),
    )
    return
  }
  if (which === "physical-gate" || which === "physical" || which === "physical-cod") {
    if (!location.search.includes("items=")) history.replaceState(null, "", `${location.pathname}?case=${which}&shop=${SHOP}&items=${encodeItems([{ productId: MUG, variantId: null, quantity: 2 }])}`)
    const gate = which === "physical-gate"
    render(wrap(<PhysicalCheckout shopId={SHOP} shopName="Bread Studio" brand={brand} config={gate ? checkoutConfig({ requireAccount: true }) : withCash(STRICT)} buyer={gate ? { signedIn: false, confirmed: false } : { signedIn: true, confirmed: true }} />))
    return
  }
  if (which === "digital") {
    render(
      wrap(
        <CheckoutPageClient
          product={{ id: "p1", title: "The bread baking course", slug: "bread", description: null, price_cents: 4900, thumbnail_url: null, type: "course" }}
          creator={{ id: SHOP, name: "Bread Studio", avatar_url: null, username: "bread" }}
          userEmail={null}
          isLoggedIn={false}
          checkoutConfig={checkoutConfig({ marketingOptIn: true })}
          checkoutTax={{ included: false, regions: [{ id: "r-ro", country: "RO", rateBps: 1900, name: "VAT" }, { id: "r-de", country: "DE", rateBps: 1900, name: "MwSt." }], overrides: [], country: "RO" }}
        />,
      ),
    )
    return
  }
  if (which === "receipt" || which === "receipt-fr") {
    const fr = which === "receipt-fr"
    render(
      wrap(
        <CheckoutWords lang={fr ? "fr" : "en"} words={fr ? FRENCH : {}}>
        <ReceiptView
          locale={fr ? "fr" : "en-US"}
          viewer={{ signedIn: false, isBuyer: false }}
          receipt={{
            number: "1042",
            createdAt: "2026-10-11T10:00:00Z",
            currency: "usd",
            state: "open",
            items: [{ orderId: "o1", productId: "p1", title: "The bread baking course", slug: "bread", thumbnailUrl: null, type: "course", variantName: null, state: "open", subtotalCents: 4900, tipCents: 0, totalCents: 5831, refundedCents: 0, refundedAt: null, files: [], courseHref: null }] as never,
            subtotalCents: 4900,
            tipCents: 0,
            totalCents: 5831,
            refundedCents: 0,
            taxCents: 931,
            taxIncluded: false,
            taxLabel: "VAT 19%",
            payment: { method: "card", brand: "visa", last4: "4242" },
            seller: { name: "Bread Studio", username: "bread", avatarUrl: null, supportEmail: "hello@bread.studio", legal: { name: "Bread Studio SRL", lines: ["Strada Lungă 4", "400001 Cluj-Napoca", "Cluj", "Romania"], taxId: "RO12345678", taxIdLabel: "VAT number" } },
            buyer: { firstName: "Maria", maskedEmail: "m***@example.com", email: "sent", unclaimed: true },
            primary: { orderId: "o1", token: "rt_" + "a".repeat(40) },
            invoice: true,
          }}
        />
        </CheckoutWords>,
      ),
    )
    return
  }
  if (which === "order" || which === "order-cod" || which === "order-fr") {
    const fr = which === "order-fr"
    render(
      wrap(
        <CheckoutWords lang={fr ? "fr" : "en"} words={fr ? FRENCH : {}}>
        <OrderStatusView
          help={fr ? { openCase: null } : null}
          token={"t".repeat(30)}
          justPaid={false}
          canReturn={false}
          shop={{ name: "Bread Studio", avatar: null, email: "hello@bread.studio", phone: "+40 721 234 567", websiteUrl: "https://bread.studio", legal: { name: "Bread Studio SRL", lines: ["Strada Lungă 4", "400001 Cluj-Napoca", "Romania"], taxId: "RO12345678", taxIdLabel: "VAT number" } }}
          order={{
            id: "a0000000-0000-4000-8000-000000001042",
            status: "paid",
            fulfillmentStatus: "unfulfilled",
            cancelled: false,
            createdAt: "2026-10-11T10:00:00Z",
            email: "maria@example.com",
            name: "Maria Ionescu",
            address: { name: "Maria Ionescu", line1: "Bd. Eroilor 1", city: "Cluj-Napoca", postalCode: "400129", country: "RO" },
            delivery: { name: "Standard", priceCents: 500, minDays: 3, maxDays: 5 },
            pickup: null,
            processing: false,
            totals: { subtotal: 4000, discount: 0, shipping: 500, tax: 760, taxIncluded: false, taxLabel: "VAT 19%", total: 5260, refunded: 0, currency: "RON" },
            cash: which === "order-cod" ? "due" : null,
            lines: [{ orderId: "o1", title: "Stoneware mug", variantName: null, imageUrl: null, quantity: 2, cents: 4000, type: "physical", receiptToken: null, returnable: 0 }],
            shipments: [],
            returns: [],
          }}
        />
        </CheckoutWords>,
      ),
    )
    return
  }
  render(
    wrap(
      <div className="mx-auto max-w-[760px] bg-[#f8f9fa] p-4 sm:p-6">
        <StoreDetailsPanel />
      </div>,
    ),
  )
}
