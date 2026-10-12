import { tt } from "@/lib/i18n/text"
/**
 * ===========================================================================
 *  HOW IT WORKS: ONE SHORT EXPLANATION PER SETTING THAT NEEDS ONE
 * ===========================================================================
 * The words behind every "How it works" in Settings (components/app/
 * settings/how-it-works.tsx). Written for somebody setting up a shop for the
 * first time: what the thing is, what happens because of it, and the one
 * decision it asks of them. A picture comes with each (`art`), drawn in the
 * component. Pure, so the tests read it.
 */

export type ExplainerArt = "shipping" | "locations" | "taxes" | "returns" | "checkout" | "channels" | "integrations" | "packages" | "fulfilment" | "team" | "store" | "reasons" | "languages" | "markets"

export interface Explainer {
  title: string
  art: ExplainerArt
  /** Two to four short lines, read top to bottom. */
  lines: string[]
  /**
   * Where the full guide is, when there is one. A guide in the physical
   * products part of the Help Center is only offered while physical commerce
   * is on, since those articles are not found while it is off
   * (components/app/settings/how-it-works.tsx).
   */
  guide?: string
}

export const EXPLAINERS = {
  shipping: {
    get title() { return tt("How shipping works") },
    art: "shipping",
    get lines() { return [
      tt("A shipping profile is a group of products that ship the same way. Every product starts in the General profile."),
      tt("Inside a profile, a zone is a list of countries or regions you ship to, and each zone has its rates: a flat price, free over an amount, or priced by weight or by order value."),
      tt("At checkout the buyer types their address. Storelib finds the zone it falls in and shows that zone's rates. An address in no zone cannot check out, so add every country you ship to."),
    ] },
    guide: "/help/physical-products/shipping-profiles-zones-and-rates",
  },
  locations: {
    get title() { return tt("How locations work") },
    art: "locations",
    get lines() { return [
      tt("A location is any place that holds your stock: your home, a warehouse, a fulfillment center, or a supplier who ships for you."),
      tt("Each product's stock is counted per location. When an order comes in, it is assigned to the default location, and its stock goes down there."),
      tt("Who ships the orders says what happens to an order with items from there: you ship it yourself, or it's emailed to a partner who ships it, and you add their tracking number."),
      tt("Turn on local pickup for a location and buyers nearby can collect their order there for free. Your default location's address is where return emails tell buyers to send items."),
    ] },
    guide: "/help/physical-products/locations",
  },
  taxes: {
    get title() { return tt("How taxes work") },
    art: "taxes",
    get lines() { return [
      tt("Add a region for every country where you have to charge tax, and give it a rate. A region can be a whole country or a state inside one."),
      tt("At checkout Storelib looks at where the buyer is and adds that region's rate. Buyers anywhere else pay no tax."),
      tt("Prices include tax is how most of Europe shows prices: the tax is part of the price, not added on top."),
      tt("Storelib charges what you set and nothing more. Ask an accountant which rates apply to you."),
    ] },
    guide: "/help/physical-products/taxes",
  },
  returns: {
    get title() { return tt("How returns work") },
    art: "returns",
    get lines() { return [
      tt("When returns are on, a buyer sees Request a return on their order page for as many days as your return window."),
      tt("They pick a reason from your list and the items. You get an email and approve or decline it from the order."),
      tt("Once the items are back, mark them received: you choose whether they go back into stock, and you refund the buyer from the same screen."),
      tt("The buyer gets an email at each step: approved (with where to send it), received, and refunded."),
    ] },
    guide: "/help/physical-products/returns-physical",
  },
  reasons: {
    get title() { return tt("How reasons work") },
    art: "reasons",
    get lines() { return [
      tt("Reasons are the choices a buyer picks from when they ask for a return, and the ones you pick from when you refund."),
      tt("The value is what is saved and counted in Analytics, so keep it short and never change its meaning. The label is the words people see."),
      tt("A reason you delete stays on the returns and refunds that already used it."),
    ] },
    guide: "/help/physical-products/returns-physical",
  },
  checkout: {
    get title() { return tt("How checkout works") },
    art: "checkout",
    get lines() { return [
      tt("Checkout is the page where a buyer types their details and pays. These settings decide what it asks for."),
      tt("Every field you mark Don't include disappears from checkout. Optional ones show without a star."),
      tt("Changes reach your live checkout within a few seconds. Nothing here touches orders already placed."),
    ] },
    guide: "/help/physical-products/checkout-settings",
  },
  channels: {
    get title() { return tt("How sales channels work") },
    art: "channels",
    get lines() { return [
      tt("A sales channel is a place your products are listed. Storelib runs three: your online store, your creator page and Explore."),
      tt("Every product is on every channel until you take it off one, from the product's Sales channels card. It disappears from that place's lists and search; its own link keeps working."),
      tt("Channels you create are for keeping track, like a market stall or a wholesale list. Storelib doesn't show anything there."),
    ] },
    guide: "/help/physical-products/sales-channels",
  },
  integrations: {
    get title() { return tt("How integrations work") },
    art: "integrations",
    get lines() { return [
      tt("An integration connects Storelib to a service you already use: Google Analytics, a pixel for your ads, a shipping or print on demand company."),
      tt("Built in ones need nothing more than turning on. The others ask for a key from your account with that service."),
      tt("Your data stays in your store. Turning an integration off stops what it sends, and keeps everything it already did."),
    ] },
    guide: "/help/physical-products/integrations",
  },
  packages: {
    get title() { return tt("How packages work") },
    art: "packages",
    get lines() { return [
      tt("A package is a box or mailer you ship in, with its size and empty weight."),
      tt("Storelib adds the package's empty weight to the products inside when it works out a weight based shipping rate, so the buyer pays for what the parcel really weighs."),
      tt("Mark the one you use most as the default."),
    ] },
    guide: "/help/physical-products/units-and-packages",
  },
  fulfilment: {
    get title() { return tt("Who ships your orders") },
    art: "fulfilment",
    get lines() { return [
      tt("Pick how your orders get to buyers. It sets up your first location and the integrations that fit it."),
      tt("Shipping yourself or from a warehouse: you pack each order and add its tracking. Print on demand, dropshipping, a supplier or a fulfillment center: the order goes to them and they ship it."),
      tt("A mix is fine. Each location says who ships from it, and each product says which location it ships from."),
    ] },
    /* Every way of fulfilling, from what you connect to how tracking reaches the buyer. */
    guide: "/help/physical-products/playbook",
  },
  team: {
    get title() { return tt("How the team works") },
    art: "team",
    get lines() { return [
      tt("Invite people by email. They get a link, sign in with their own Storelib account, and open your store from their dashboard."),
      tt("A Manager works in your Orders: fulfils and ships them, handles returns and notes, and sends receipts and invoices."),
      tt("Refunds, payouts, billing, products, the website, the team and deleting the store stay with you, the owner."),
    ] },
  },
  store: {
    get title() { return tt("What store details are for") },
    art: "store",
    get lines() { return [
      tt("Your store's name and contact details go on receipts, order emails and your checkout, so buyers know who they bought from."),
      tt("Your phone is shown to your payment provider and on order emails, so a buyer or a carrier can reach you about an order."),
      tt("Where your store is based is the country new locations and tax regions start in. Prices are in your payout currency, set under Payments."),
      tt("Business details put your legal name, address and tax number on every receipt and invoice."),
    ] },
    guide: "/help/physical-products/store-details",
  },
  languages: {
    get title() { return tt("How languages work") },
    art: "languages",
    get lines() { return [
      tt("Your website stays at its own address in your default language. Every other language gets the same pages under its code: yourstore.com/fr, yourstore.com/fr/products/mug."),
      tt("Visitors switch with the language selector. On a Storelib theme it sits under the footer by itself. On a theme you imported from Shopify it is the theme's own selector, turned on in the editor (Show language, usually in the header or footer)."),
      tt("Nobody is moved by their browser's language. A market can start its countries in its own language on their first visit, and after that the visitor's choice wins."),
      tt("Only approved translations show, and only once a language is published. Anything not translated yet shows in your default language, never blank."),
    ] },
  },
  markets: {
    get title() { return tt("How markets and currencies work") },
    art: "markets",
    get lines() { return [
      tt("A market is a group of countries. Give it a currency and its visitors see your prices converted at the day's European Central Bank rate, with the rounding you pick."),
      tt("Visitors are matched by the country they browse from, and can change it with the currency or country selector. Their choice is remembered."),
      tt("Checkout charges what your store's prices are in, and says so next to the total, so a converted price is always shown as an estimate."),
    ] },
  },
} satisfies Record<string, Explainer>

export type ExplainerId = keyof typeof EXPLAINERS
