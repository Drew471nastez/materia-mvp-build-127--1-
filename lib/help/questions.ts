/**
 * ===========================================================================
 *  /help/questions: WHAT HAPPENS IF...
 * ===========================================================================
 * The questions stores and buyers actually ask, one page, by topic: what
 * happens, what the store does, what the buyer does. Written from the code
 * like every article (lib/help/articles.ts): stock holds and Keep selling are
 * lib/physical/inventory, the emails are lib/physical/email-templates and
 * jobs-server, cases are lib/support/cases, refunds and returns are
 * lib/physical/orders-server. A question about things that ship is shown only
 * while physical commerce is on, like the rest of that guide.
 *
 * Text may carry links as [label](/path), as in the articles.
 */

export interface HelpQuestion {
  id: string
  q: string
  /** What happens, in a sentence or three. */
  a: string
  /** What the store does about it. */
  store?: string[]
  /** What the buyer does, or sees. */
  buyer?: string[]
  /** A drawn picture from components/help/help-figures. */
  figure?: { figure: string; caption: string }
  /** About things that ship: hidden while physical commerce is off. */
  physical?: boolean
}

export interface HelpTopic {
  id: string
  title: string
  line: string
  questions: HelpQuestion[]
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "stock",
    title: "Orders and stock",
    line: "Selling out, the last one, and orders you can't fill yet.",
    questions: [
      {
        id: "order-without-stock",
        physical: true,
        q: "What happens if someone orders something I don't have in stock?",
        a: "With Track inventory on, nobody can buy more than you have: at zero the product shows as sold out and can't go in a cart. The only way an order comes in without stock is if you turned on Keep selling when out of stock for that product. Then the order is placed, its quantity goes below zero in Inventory, and it waits in Orders as Unfulfilled until you ship it.",
        store: [
          "Restock, then ship it as normal: Mark as shipped with the tracking number. The buyer gets the shipping email.",
          "If it will take a while, tell the buyer: reply to their order email, which goes straight to them.",
          "If you can't get it, cancel the order (the stock is released) and refund it. The buyer gets a cancellation email and then a refund email.",
        ],
        buyer: ["Their order page shows the order as confirmed and not yet shipped. If they're worried, Get help with this order on that page writes to the store."],
        figure: { figure: "inventory-card", caption: "Track inventory, the quantity, and Keep selling when out of stock, in the product's Inventory card." },
      },
      {
        id: "last-one",
        physical: true,
        q: "Can two people buy the last one at the same time?",
        a: "No. When a buyer pays, Storelib holds the stock for them, so the next person sees it as sold out. A checkout left unpaid gives its items back within the hour.",
      },
      {
        id: "new-order",
        physical: true,
        q: "How do I know I have a new order?",
        a: "You get an email, and the order appears in Orders as Unfulfilled. If a partner ships it, they get the order by email too, with the items and the address.",
        figure: { figure: "order-steps", caption: "Every order moves through the same steps." },
      },
      {
        id: "low-stock",
        physical: true,
        q: "Can Storelib tell me before I run out?",
        a: "Yes. Turn on Email me when stock runs low in Settings › Locations. At most one email a day lists what sold down to its low stock line. Each product can have its own line.",
        figure: { figure: "low-stock-email", caption: "The low stock email." },
      },
    ],
  },
  {
    id: "shipping",
    title: "Shipping and tracking",
    line: "Addresses, tracking numbers, parcels that go missing or arrive broken.",
    questions: [
      {
        id: "address-not-covered",
        physical: true,
        q: "What happens if a buyer's address is somewhere I don't ship?",
        a: "Checkout says shipping isn't available to that address, and they can't pay. Nothing is charged.",
        store: ["Add the country to a zone in Settings › Shipping and delivery, or add a Rest of world zone. See [Shipping profiles, zones and rates](/help/physical-products/shipping-profiles-zones-and-rates)."],
        figure: { figure: "zone-rates", caption: "A zone and its rates." },
      },
      {
        id: "tracking",
        physical: true,
        q: "How does the buyer follow their parcel?",
        a: "When you press Mark as shipped and add the carrier and tracking number, the buyer gets an email with where the parcel is (confirmed, on its way, out for delivery, delivered) and a Track your package button that opens the carrier's own live tracking. Their order page shows it too. Change the number later and they get an email with the new one.",
        store: ["Mark as shipped from the order, with the carrier and tracking number. Out for delivery and Delivered each send the buyer an email as well."],
        buyer: ["Track your package in the email, or View your order for the order page."],
        figure: { figure: "mark-shipped", caption: "Mark as shipped, with the carrier and number." },
      },
      {
        id: "part-shipped",
        physical: true,
        q: "Can I ship part of an order now and the rest later?",
        a: "Yes. Mark only the items you're sending as shipped. The buyer's email says part of the order is on the way and the rest follows. Each shipment has its own tracking.",
        figure: { figure: "split-order", caption: "One order, two shipments." },
      },
      {
        id: "not-arrived",
        physical: true,
        q: "The tracking says delivered but the buyer says it never came. What now?",
        a: "The buyer presses Get help with this order on their order page and chooses It hasn't arrived. The store gets it by email and in Support › From buyers, and answers there.",
        store: [
          "Check the carrier's tracking for proof of delivery, a photo or a signature, and tell the buyer what it shows.",
          "If it really is lost, post another and put its tracking number in your reply, or refund it.",
          "If you can't agree, either of you can press Ask Storelib to step in.",
        ],
        buyer: ["Check around the door and with neighbours first, then Get help with this order. Replies come by email."],
      },
      {
        id: "damaged",
        physical: true,
        q: "What if a parcel arrives damaged or with the wrong item?",
        a: "The buyer opens a case from the order page (It arrived damaged, Wrong item or Something's missing). The store answers first.",
        store: ["Ask for a photo in your reply, then send a replacement, refund, or approve a return so they send it back."],
        buyer: ["Keep the packaging and take a photo. Send it when the store replies."],
      },
      {
        id: "pickup",
        physical: true,
        q: "How does local pickup work for the buyer?",
        a: "At checkout they choose Pick up instead of an address. When you mark the order ready, they get an email with where to come, your instructions and a Get directions button. When you mark it picked up, they get a thank you.",
        figure: { figure: "checkout-pickup", caption: "Pick up at checkout." },
      },
    ],
  },
  {
    id: "returns",
    title: "Returns, refunds and cancelling",
    line: "Taking items back, giving money back, stopping an order.",
    questions: [
      {
        id: "return",
        physical: true,
        q: "How does a return work?",
        a: "With returns on, the buyer sees Request a return on their order page until your return window ends. They pick the items and a reason. You approve or decline it from the order. Approved, they get an email with where to send it (your default location's address). Mark it received when it's back, choose whether it goes back into stock, and refund from the same screen.",
        store: ["Turn returns on and set the window in Settings › Returns and refunds. Edit the reasons buyers choose from there too."],
        buyer: ["Request a return on the order page. Each step comes by email: approved, received, refunded."],
      },
      {
        id: "refund",
        q: "How do I give someone their money back?",
        a: "Refund from the order, all of it or part. The money goes back to the card or wallet they paid with, and banks usually take 5 to 10 business days to show it. The buyer gets an email with the amount. A refund made in the Stripe dashboard shows on the order and emails the buyer too.",
        store: ["Open the order, Refund, the amount and a reason. Storelib's fee on the sale isn't returned."],
        buyer: ["The refund email says how much and where it went."],
      },
      {
        id: "cancel",
        physical: true,
        q: "Can I cancel an order?",
        a: "Yes, while nothing in it has shipped. Cancelling puts the stock back and emails the buyer that the order won't be sent. Refund it as well, so they get their money back: they get a refund email when you do.",
      },
      {
        id: "refund-download",
        q: "Can a buyer get a refund for a download?",
        a: "That's your call, by the refund policy on your product page. A full refund removes it from their Library and closes the download link; a partial one leaves access as it is.",
      },
    ],
  },
  {
    id: "problems",
    title: "When a buyer has a problem",
    line: "Getting help with an order, and when Storelib steps in.",
    questions: [
      {
        id: "get-help",
        q: "Where does a buyer go when something is wrong?",
        a: "Every order page and receipt has Get help with this order. The buyer picks what's wrong and writes a few words. It goes to the store first, by email and in Support › From buyers. The buyer gets a link to follow the case and reply.",
        store: ["Answer from Support › From buyers. Your reply goes to the buyer by email, from your store's name. Mark resolved when it's sorted."],
        buyer: ["Get help with this order on the order page or receipt, then reply from the case page or the email."],
      },
      {
        id: "storelib-steps-in",
        q: "When does Storelib step in?",
        a: "When either of you presses Ask Storelib to step in on the case. Storelib reads the whole case, writes to you both, and can close it. Until then it stays between the store and the buyer.",
      },
      {
        id: "chargeback",
        q: "What's the difference between a case and a chargeback?",
        a: "A case is the buyer asking the store, and it's free and usually quick. A chargeback is the buyer asking their bank to take the money back instead. The bank decides, it takes weeks, and the store adds evidence. See [Disputes and chargebacks](/help/orders-and-payouts/disputes). Answering cases quickly is the best way to keep chargebacks away.",
      },
    ],
  },
  {
    id: "digital",
    title: "Downloads, courses and memberships",
    line: "Getting to what was bought.",
    questions: [
      {
        id: "cant-find-download",
        q: "A buyer can't find their download. Where is it?",
        a: "On the receipt page, linked from the receipt email. If they bought while signed in, it's in their [Library](/account/library) too.",
        store: ["Resend the receipt from the order's menu, or change the email address on the order if they typed it wrong."],
        buyer: ["Check spam for the receipt email, or Get help with this order on the receipt (It won't open or download)."],
      },
      {
        id: "mixed-cart",
        physical: true,
        q: "What happens when a cart has a download and something that ships?",
        a: "It's one order and one payment. The download is ready on the order page at once; the rest ships as normal, with its own shipping emails.",
      },
    ],
  },
  {
    id: "money",
    title: "Money and tax",
    line: "Tax at checkout and getting paid.",
    questions: [
      {
        id: "tax",
        q: "Do I have to charge tax, and how does it show?",
        a: "Storelib charges tax only where you add a region in Settings › Taxes, at the rate you give it. Choose whether your prices already include it. The buyer sees it as its own line at checkout and on the receipt.",
      },
      {
        id: "paid",
        q: "When do I get paid?",
        a: "Each sale goes to your balance, less Storelib's fee. See [How payouts work](/help/orders-and-payouts/how-payouts-work) for when you can cash out.",
      },
    ],
  },
]

/** The topics and questions a visitor is shown, without the physical ones while physical commerce is off. */
export function helpTopicsFor(physical: boolean): HelpTopic[] {
  return HELP_TOPICS.map((t) => ({ ...t, questions: t.questions.filter((q) => physical || !q.physical) })).filter((t) => t.questions.length > 0)
}
