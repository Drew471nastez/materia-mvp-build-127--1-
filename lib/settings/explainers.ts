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

export type ExplainerArt = "shipping" | "locations" | "taxes" | "returns" | "checkout" | "channels" | "integrations" | "packages" | "fulfilment" | "team" | "store" | "reasons"

export interface Explainer {
  title: string
  art: ExplainerArt
  /** Two to four short lines, read top to bottom. */
  lines: string[]
  /** Where the full guide is, when there is one. */
  guide?: string
}

export const EXPLAINERS = {
  shipping: {
    title: "How shipping works",
    art: "shipping",
    lines: [
      "A shipping profile is a group of products that ship the same way. Every product starts in the General profile.",
      "Inside a profile, a zone is a list of countries or regions you ship to, and each zone has its rates: a flat price, free over an amount, or priced by weight or by order value.",
      "At checkout the buyer types their address. Storelib finds the zone it falls in and shows that zone's rates. An address in no zone cannot check out, so add every country you ship to.",
    ],
    guide: "/help/physical-products/shipping-rates",
  },
  locations: {
    title: "How locations work",
    art: "locations",
    lines: [
      "A location is any place that holds your stock: your home, a warehouse, a fulfillment center, or a supplier who ships for you.",
      "Each product's stock is counted per location. When an order comes in, it is assigned to the default location, and its stock goes down there.",
      "Turn on local pickup for a location and buyers nearby can collect their order there for free.",
    ],
    guide: "/help/physical-products/locations-and-pickup",
  },
  taxes: {
    title: "How taxes work",
    art: "taxes",
    lines: [
      "Add a region for every country where you have to charge tax, and give it a rate. A region can be a whole country or a state inside one.",
      "At checkout Storelib looks at where the buyer is and adds that region's rate. Buyers anywhere else pay no tax.",
      "Prices include tax is how most of Europe shows prices: the tax is part of the price, not added on top.",
      "Storelib charges what you set and nothing more. Ask an accountant which rates apply to you.",
    ],
    guide: "/help/physical-products/taxes",
  },
  returns: {
    title: "How returns work",
    art: "returns",
    lines: [
      "When returns are on, a buyer sees Request a return on their order page for as many days as your return window.",
      "They pick a reason from your list and the items. You get an email and approve or decline it from the order.",
      "Once the items are back, mark them received: you choose whether they go back into stock, and you refund the buyer from the same screen.",
    ],
    guide: "/help/physical-products/returns",
  },
  reasons: {
    title: "How reasons work",
    art: "reasons",
    lines: [
      "Reasons are the choices a buyer picks from when they ask for a return, and the ones you pick from when you refund.",
      "The value is what is saved and counted in Analytics, so keep it short and never change its meaning. The label is the words people see.",
      "A reason you delete stays on the returns and refunds that already used it.",
    ],
  },
  checkout: {
    title: "How checkout works",
    art: "checkout",
    lines: [
      "Checkout is the page where a buyer types their details and pays. These settings decide what it asks for.",
      "Every field you mark Don't include disappears from checkout. Optional ones show without a star.",
      "Changes reach your live checkout within a few seconds. Nothing here touches orders already placed.",
    ],
  },
  channels: {
    title: "How sales channels work",
    art: "channels",
    lines: [
      "A sales channel is a place your products are sold: your online store, a marketplace, or a pop up shop.",
      "Each product is listed in the channels you choose. Your online store reads its products through the channel marked Storefront, so that one is always there.",
      "Turn a channel off and its products stop selling there, without being deleted.",
    ],
  },
  integrations: {
    title: "How integrations work",
    art: "integrations",
    lines: [
      "An integration connects Storelib to a service you already use: Google Analytics, a pixel for your ads, a shipping or print on demand company.",
      "Built in ones need nothing more than turning on. The others ask for a key from your account with that service.",
      "Your data stays in your store. Turning an integration off stops what it sends, and keeps everything it already did.",
    ],
  },
  packages: {
    title: "How packages work",
    art: "packages",
    lines: [
      "A package is a box or mailer you ship in, with its size and empty weight.",
      "Storelib adds the package weight to the products inside when it works out a weight based rate or buys a label.",
      "Mark the one you use most as the default.",
    ],
  },
  fulfilment: {
    title: "Who ships your orders",
    art: "fulfilment",
    lines: [
      "Pick how your orders get to buyers. It sets up your first location and the integrations that fit it.",
      "Shipping yourself or from a warehouse: you pack each order and add its tracking. Print on demand, dropshipping, a supplier or a fulfillment center: the order goes to them and they ship it.",
      "A mix is fine. Each location says who ships from it, and each product says which location it ships from.",
    ],
    guide: "/help/physical-products/how-physical-products-work",
  },
  team: {
    title: "How the team works",
    art: "team",
    lines: [
      "Invite people by email. They get a link, sign in with their own Storelib account, and see your store in their dashboard.",
      "A Manager runs the store day to day: products, orders, customers and emails. Staff build: products, the website and content.",
      "Billing, payouts, the team and deleting the store stay with you, the owner.",
    ],
  },
  store: {
    title: "What store details are for",
    art: "store",
    lines: [
      "Your store's name and contact details go on receipts, order emails and your checkout, so buyers know who they bought from.",
      "Your phone is shown to your payment provider and on order emails, so a buyer or a carrier can reach you about an order.",
      "The default region decides the currency new prices are in and the country new locations start in.",
    ],
  },
} satisfies Record<string, Explainer>

export type ExplainerId = keyof typeof EXPLAINERS
