/**
 * ===========================================================================
 *  PHYSICAL COMMERCE, FOR THE OWNER: WHAT EACH PART DOES AND HOW TO CHECK IT
 * ===========================================================================
 * The words behind /admin/physical-commerce. Plain data, no React and no
 * server imports, so the page, its search and tests/admindocs23.test.ts all
 * read the same thing.
 *
 * HOW TO KEEP IT TRUE. Each section names the code it describes in `code`.
 * When that code changes, read it again and change the section here. Lists
 * that already live in the code (the customer emails, the carriers, the
 * integrations, the checkout defaults, the order statuses) are not copied
 * here: lib/admin/commerce-docs-facts.ts reads them from the code itself, and
 * a section asks for one by its `facts` key, so those lists never go stale.
 *
 * Writing rules for this file: say what is built, never what is planned;
 * name the exact page and button; a link (`href`) only for an address that
 * is the same for everyone (/app/..., /admin/..., /help/...). An address
 * that depends on the creator is written out in words with <angle brackets>.
 */

export interface Place {
  label: string
  /** Only for an address that is the same for every creator. */
  href?: string
}

export interface Topic {
  id: string
  name: string
  /** What it does, in a sentence or two. */
  does: string
  /** Where it is kept: table.column, for the owner's own checks. */
  stored?: string
  /** Where buyers meet it. */
  buyers?: Place[]
  /** Where creators set it or see it. */
  creators?: Place[]
  /** How to see that it works, step by step. */
  check?: string[]
}

/** Lists printed from the code (lib/admin/commerce-docs-facts.ts). */
export type FactKey =
  | "checkoutDefaults"
  | "channels"
  | "customerEmails"
  | "sellerEmails"
  | "rateKinds"
  | "fulfilmentModels"
  | "locationKinds"
  | "pickupReady"
  | "carriers"
  | "orderStatuses"
  | "shipmentStatuses"
  | "integrations"
  | "stripeEvents"

export interface DocSection {
  id: string
  title: string
  intro: string
  /** Where a creator finds it. */
  where?: Place
  /** Only there while physical commerce is on in /admin. */
  physicalOnly?: boolean
  /** Help Center articles under /help/physical-products/<slug>; a slug the Help Center no longer has is left out by the page. */
  help?: string[]
  /** The files this section was written from. */
  code: string[]
  topics: Topic[]
  facts?: FactKey[]
}

const SETTINGS = (tab: string, label: string): Place => ({ label: `Settings › ${label}`, href: `/app/settings?tab=${tab}` })

export const COMMERCE_DOCS: DocSection[] = [
  {
    id: "overview",
    title: "How it fits together",
    intro:
      "A creator sets up the store in Settings, adds products, and sells them on their website, their creator page and Explore. A buyer adds to the cart, pays through Stripe, and gets emails at each step. The creator ships from Orders, the buyer follows the parcel on their order page, and returns and refunds go back the same way.",
    code: ["lib/platform/physical-commerce.ts", "app/admin/_console/panel-physical-commerce.tsx", "components/app/settings-form-new.tsx"],
    topics: [
      {
        id: "switch",
        name: "The physical commerce switch",
        does:
          "One switch for all of Storelib. Off: no physical products, no Shipping or Locations in Settings, no Inventory page, no cart checkout for things that ship. Nothing is deleted while it is off, so turning it on again brings every product, stock level and order back. An order somebody already paid for stays readable either way.",
        stored: "platform_settings.physical_commerce_enabled (env override PHYSICAL_COMMERCE_ENABLED)",
        creators: [{ label: "Shipping and delivery, Locations, Inventory and physical products appear only while it is on" }],
        check: [
          "Open /admin, then Health under System, and find the Physical commerce panel. It says Enabled or Disabled.",
          "While it is on, the panel lists shops set up, physical products, paid orders, orders waiting to ship and any jobs that failed.",
          "As a creator, open Settings: Shipping and delivery and Locations are in the Commerce group only while it is on.",
        ],
      },
      {
        id: "path",
        name: "One order, start to finish",
        does:
          "Product page or website → cart → checkout (address, delivery, tax, payment) → Stripe takes the payment → the order is written once, the held stock becomes sold → order confirmation email to the buyer and a new sale notice to the creator → the creator fulfils in Orders with tracking → shipping email → delivered → return or refund if asked.",
        buyers: [
          { label: "Product page: storelib.com/<username>/<product> or <site>/products/<product>" },
          { label: "Checkout: <site>/checkout on a website, storelib.com/checkout/physical from the creator page" },
          { label: "Order page: the View your order button in every order email" },
        ],
        creators: [{ label: "Orders", href: "/app/orders" }, { label: "Inventory", href: "/app/inventory" }, { label: "Settings", href: "/app/settings" }],
      },
    ],
  },
  {
    id: "store-details",
    title: "Store details",
    intro: "Who the store is to its buyers and where it is based. The checkout header, every customer email and the buyer's order page read from here.",
    where: SETTINGS("store", "Store details"),
    help: ["zero-to-100"],
    code: ["components/app/settings/store-details-panel.tsx", "lib/store/settings-server.ts", "lib/store/identity-server.ts", "app/api/store/settings/route.ts"],
    topics: [
      {
        id: "logo",
        name: "Logo",
        does: "The picture at the top of every customer email (the receipt email too) and of the buyer's order page. Empty: the website's logo, then the creator's profile photo.",
        stored: "store_settings.logo_url",
        buyers: [{ label: "Customer emails and the order page; the checkout header when the website has no logo of its own" }],
        creators: [SETTINGS("store", "Store details › Logo"), SETTINGS("emails", "Customer emails (the preview shows it)")],
        check: ["Upload a logo in Settings › Store details.", "Open Settings › Customer emails and press Order confirmation: the preview shows the new logo at the top."],
      },
      {
        id: "name",
        name: "Store name",
        does: "What receipts, order emails and the checkout header say the order is from. Empty: the creator's own Storelib name.",
        stored: "store_settings.store_name",
        buyers: [{ label: "Checkout header, receipts, the From name and heading of order emails" }],
        creators: [SETTINGS("store", "Store details")],
        check: ["Change the name and save.", "Open the email preview in Settings › Customer emails: the name at the top is the new one.", "Start a checkout on the creator's product: the header shows the new name."],
      },
      {
        id: "contact",
        name: "Contact email and phone",
        does: "Where buyers write about orders; replies to order emails go here. The same address the receipt shows. The phone carries its country's calling code and is for buyers and couriers.",
        stored: "store_settings.contact_email, creators.support_email, store_settings.phone",
        buyers: [{ label: "Receipts and the footer of order emails" }],
        creators: [SETTINGS("store", "Store details")],
        check: ["Set a contact email.", "In the email preview, the footer shows it; a reply to a real order email goes to it."],
      },
      {
        id: "country",
        name: "Where the store is based",
        does: "The country new locations and new tax regions start in. Buyers can be anywhere.",
        stored: "store_settings.default_country",
        creators: [SETTINGS("store", "Store details › Where your store is based")],
      },
      {
        id: "ships-from",
        name: "Where orders ship from",
        does: "With physical commerce on: the default location new orders are assigned to and their stock is taken from, unless a product says otherwise.",
        stored: "commerce_settings.default_location_id",
        creators: [SETTINGS("store", "Store details › Where orders ship from")],
        check: ["Pick a location.", "Place an order: on its page in Orders, the Unfulfilled card names that location."],
      },
      {
        id: "business",
        name: "Business details",
        does: "The business behind the store: legal name, address and tax number (VAT number, EIN, ABN, in the country's own words). Printed under Sold by on the receipt page, the buyer's order page and the invoice PDF. Empty until the creator fills it in; then those show the store's name and contact alone. Needs SQL part 153.",
        stored: "store_settings.legal",
        buyers: [{ label: "Sold by on the receipt, the order page and the invoice" }],
        creators: [SETTINGS("store", "Store details › Business details")],
        check: ["Fill in Business details and save.", "Open a paid order's page (View your order in its email): the line under the contact says Sold by with the name, address and tax number."],
      },
    ],
  },
  {
    id: "checkout",
    title: "Checkout",
    intro:
      "How checkout behaves for every product the store sells. The download checkout, the physical checkout and the website checkout all read the same settings, and the server that takes the payment checks them again, so a field turned off is gone everywhere at once.",
    where: SETTINGS("checkout", "Checkout"),
    help: ["checkout-settings", "what-buyers-see-at-checkout", "customer-accounts"],
    code: ["components/app/settings/checkout-panel.tsx", "lib/store/checkout-config.ts", "lib/automations/abandoned.ts", "lib/automations/abandoned-reminder.ts", "app/api/cron/process-scheduled-emails/route.ts"],
    facts: ["checkoutDefaults"],
    topics: [
      {
        id: "accounts",
        name: "Customer accounts",
        does: "Require customers to sign in: buyers log in or make an account before paying; browsing stays open. Require a confirmed email: no order until they click the link we email them; this turns sign in on as well.",
        stored: "store_settings.checkout.requireAccount, requireConfirmedEmail",
        buyers: [{ label: "Checkout asks them to sign in before the payment step" }],
        creators: [SETTINGS("checkout", "Checkout › Customer accounts")],
        check: ["Turn on Require customers to sign in.", "Open the store's checkout in a private window: it asks for sign in before payment."],
      },
      {
        id: "marketing",
        name: "Email news box",
        does: "An unticked \"Email me with news and offers\" box under the email field. Only buyers who tick it join the store's list and get campaigns and checkout reminders.",
        stored: "store_settings.checkout.marketingOptIn",
        buyers: [{ label: "Under the email field at checkout" }],
        creators: [SETTINGS("checkout", "Checkout › Marketing"), { label: "Customers", href: "/app/customers" }],
        check: ["Open a checkout: the box is there and unticked.", "Turn it off in Settings: the box is gone from every checkout."],
      },
      {
        id: "abandoned",
        name: "Abandoned checkout reminder",
        does:
          "A buyer who reached Pay and left without paying gets one email about an hour later with a link back to the same cart. Only buyers who ticked the news box or are already on the store's list, and never one who bought since. A store that built its own Leaves checkout automation in Emails gets that instead (at most once a week per person, ending the moment they buy). The hourly email job finds checkouts started between one hour and three days ago and decides each one once.",
        stored: "store_settings.checkout.abandonedRecovery; each started checkout in checkout_starts (handled_at, outcome)",
        buyers: [{ label: "The Checkout reminder email, with Finish checkout" }],
        creators: [SETTINGS("checkout", "Checkout › Abandoned checkouts"), SETTINGS("emails", "Customer emails › Checkout reminder (its words)")],
        check: [
          "The status above shows when the hourly email job last ran and when a started checkout was last decided.",
          "To see one: with a test card on a preview with Stripe test keys, tick the news box, reach Pay, close the tab. After the next hourly run the reminder arrives; its button opens the same cart.",
        ],
      },
      {
        id: "fields",
        name: "Customer information",
        does: "Full name as one field or first and last apart. Company name, phone and address line 2 can each be left out, optional or required (physical orders). Email is always asked.",
        stored: "store_settings.checkout.nameFields, company, phone, address2",
        buyers: [{ label: "The contact and address step of checkout" }],
        creators: [SETTINGS("checkout", "Checkout › Customer information")],
        check: ["Make Phone number required.", "Open a cart checkout with something that ships: the phone field is marked required and Pay refuses an empty one."],
      },
    ],
  },
  {
    id: "sales-channels",
    title: "Sales channels",
    intro:
      "Where products are listed. Storelib runs three channels: the Online store (the website), the Creator page and Explore. Taking a product off one really hides it there; its own link keeps working. A store can add its own channels (a market stall, a wholesale list) as names for its own records.",
    where: SETTINGS("channels", "Sales channels"),
    help: ["sales-channels"],
    code: ["components/app/settings/channels-panel.tsx", "lib/store/channels.ts", "lib/store/channel-filter.ts", "app/app/products/new/sales-channels-card.tsx"],
    facts: ["channels"],
    topics: [
      {
        id: "listing",
        name: "Which channel a product is on",
        does: "Every product is on every channel until someone takes it off one, in the product editor's Sales channels card.",
        stored: "sales_channels, product_channel_listings (listed = false means off)",
        buyers: [
          { label: "Online store: the website's product lists, collections, search and sitemap" },
          { label: "Creator page: storelib.com/<username> and the OnePage" },
          { label: "Explore", href: "/explore" },
        ],
        creators: [{ label: "Products › a product › Sales channels", href: "/app/products" }],
        check: ["Take a product off Explore in its editor.", "Search for it on /explore: it is not there. Its own link still opens it."],
      },
      {
        id: "new-products",
        name: "List new products on",
        does: "The channels a new product starts on: all of them, or one.",
        stored: "store_settings.default_sales_channel_id",
        creators: [SETTINGS("channels", "Sales channels › New products")],
        check: ["Pick one channel.", "Make a new product: its Sales channels card has only that channel ticked."],
      },
    ],
  },
  {
    id: "emails",
    title: "Customer emails and seller emails",
    intro:
      "Every email a buyer gets from the store, and the ones the creator gets about their sales. Customer emails carry the store's logo, name and contact, and each one's subject, heading, opening text and button can be reworded. What is typed is plain text, escaped when the email is drawn.",
    where: SETTINGS("emails", "Customer emails"),
    help: ["physical-order-emails"],
    code: ["components/app/settings/customer-emails-panel.tsx", "lib/emails/customer-catalog.ts", "lib/emails/customer-custom.ts", "lib/physical/email-templates.ts", "lib/physical/jobs-server.ts", "lib/notify/registry.ts"],
    facts: ["customerEmails", "sellerEmails"],
    topics: [
      {
        id: "editor",
        name: "Changing the words",
        does: "A row opens the email with its preview, drawn by the same template that sends it. On a computer it is a dialog with the fields beside the preview; on a phone a sheet with Preview and Edit tabs. Placeholders: customer's first name, order number, store name, what they bought. Reset to default puts the standard words back.",
        stored: "store_settings.customer_emails (only what differs from the default)",
        creators: [SETTINGS("emails", "Customer emails")],
        check: ["Open Order confirmation, change the heading, Save.", "Close and open it again: the preview shows the new heading. The next real order confirmation uses it."],
      },
      {
        id: "sending",
        name: "How they are sent",
        does: "Order emails go into a queue and the physical commerce job sends them every ten minutes, retrying with a pause when the mail service refuses. Receipts for downloads go out right after payment. Everything is sent through Mailgun.",
        stored: "commerce_jobs (kind send_email), email_logs",
        check: ["The status above shows whether Mailgun is configured and when the physical commerce job last ran.", "/admin › Health › Physical commerce lists jobs retrying or given up on, with Try the given-up jobs again."],
      },
      {
        id: "seller",
        name: "Emails to the creator",
        does: "A new sale notice for each order, low stock (one a day at most, listing what reached its low stock line), refunds and disputes. Partner locations get each new order with the items and the address, and a page to add tracking. The creator turns the optional ones off in Settings › Notifications.",
        creators: [SETTINGS("notifications", "Notifications"), SETTINGS("locations", "Locations › Orders email")],
      },
    ],
  },
  {
    id: "taxes",
    title: "Taxes",
    intro:
      "Storelib charges the tax a store sets and nothing more: no automatic rates. A buyer whose address is in no tax region pays no tax. Both checkouts and the server that takes the payment work the tax out the same way.",
    where: SETTINGS("taxes", "Taxes"),
    help: ["taxes", "units-and-packages"],
    code: ["components/app/settings/taxes-panel.tsx", "lib/tax/rules.ts", "lib/tax/server.ts", "app/api/checkout/site/route.ts", "app/api/checkout/stripe-session/route.ts"],
    topics: [
      {
        id: "charge",
        name: "Charge tax",
        does: "Off: buyers pay the prices and nothing more. On: tax applies where the buyer's address is in a region.",
        stored: "commerce_settings.tax_mode",
        creators: [SETTINGS("taxes", "Taxes › Tax")],
      },
      {
        id: "inclusive",
        name: "Prices include tax or not",
        does: "Included (most of Europe): the tax is the part of the price that was tax and the total does not move. Not included: tax is added on top.",
        stored: "commerce_settings.prices_include_tax",
        buyers: [{ label: "The Tax line at checkout, on the receipt and in the order confirmation" }],
        check: ["Add a region with 20%. With prices excluding tax, a 100.00 item to that country shows Tax 20.00 and a total of 120.00.", "Switch to including tax: the same item totals 100.00 with Tax 16.67 inside it."],
      },
      {
        id: "regions",
        name: "Tax regions and product rates",
        does: "A country, or a state inside one, with its rate and the name receipts show (VAT, Sales tax). A state's own row wins over its country's. A single product can have its own rate in one region (books at 5%).",
        stored: "commerce_tax_rates, commerce_tax_overrides",
        creators: [SETTINGS("taxes", "Taxes › Tax regions")],
      },
      {
        id: "shipping-digital",
        name: "Tax on shipping and on digital products",
        does: "Shipping: delivery is taxed at the items' rate (physical orders). Digital: downloads, courses and memberships are taxed too; off by default so a digital store that never opens Taxes is charged exactly as before.",
        stored: "commerce_settings.tax_on_shipping, commerce_settings.tax_digital",
        check: ["Turn on tax on digital products, then open a download's checkout with a billing country in a region: a Tax line appears."],
      },
    ],
  },
  {
    id: "shipping",
    title: "Shipping and delivery",
    intro:
      "What delivery costs for each address and how long it takes. The checkout shows the options, and the server prices them again when the buyer pays; a price sent by the browser is never used.",
    where: SETTINGS("shipping", "Shipping and delivery"),
    physicalOnly: true,
    help: ["shipping-profiles-zones-and-rates", "shipping-rate-examples", "fulfillment-methods"],
    code: ["components/physical/shipping-settings.tsx", "lib/physical/rates.ts", "lib/physical/units.ts", "lib/physical/checkout-pricing-server.ts"],
    facts: ["fulfilmentModels", "rateKinds"],
    topics: [
      {
        id: "fulfilment-type",
        name: "How orders are fulfilled",
        does: "Asked once on the first visit, and it sets up a first location of that kind. Each location then says who ships from it, so a mix is fine. One product can be fulfilled differently from the store (its editor's Advanced › Fulfilment).",
        stored: "commerce_settings.fulfillment_model; products.fulfillment_method",
        creators: [SETTINGS("shipping", "Shipping and delivery › How you fulfil orders")],
      },
      {
        id: "units",
        name: "Units",
        does: "Metric or imperial, for weights and sizes typed in Settings, on new products and in packages. Rates keep working after a switch.",
        stored: "commerce_settings.unit_system",
      },
      {
        id: "profiles",
        name: "Profiles, zones and rates",
        does:
          "The General profile covers every product; a custom profile is for products that ship differently (heavy, fragile). In a profile, a zone is a set of countries or states (or Rest of world) and holds rates. The zone for the buyer's address is used: a state beats its country, which beats Rest of world. Each rate has the name buyers see, a delivery estimate in business days, and can be free over an amount. Several profiles in one cart: a rate name every profile offers becomes one option at the sum, else the cheapest of each is offered as Standard shipping.",
        stored: "shipping_profiles, shipping_zones, shipping_rates",
        buyers: [{ label: "Delivery options with price and estimate at checkout; the free shipping bar on the website" }],
        creators: [SETTINGS("shipping", "Shipping and delivery")],
        check: [
          "Make a zone for one country with a Flat rate of 5.00, 3 to 5 days.",
          "Add a physical product to the cart on the website and go to checkout with an address in that country: Standard 5.00, 3 to 5 business days, is offered.",
          "An address in a country no zone covers: checkout says “This shop doesn't ship there yet.”",
        ],
      },
      {
        id: "packages",
        name: "Packages",
        does: "The boxes and mailers the store ships in. The default one's empty weight is added to the order's weight for weight based rates.",
        stored: "shipping_packages, commerce_settings.default_package_id",
        creators: [SETTINGS("shipping", "Shipping and delivery › Packages")],
      },
    ],
  },
  {
    id: "locations-inventory",
    title: "Locations and inventory",
    intro:
      "Where stock is kept, where orders ship from, who ships them, local pickup, and how stock moves. Stock is held for a buyer from the moment they press Pay, so two buyers can never both get the last one.",
    where: SETTINGS("locations", "Locations"),
    physicalOnly: true,
    help: ["locations", "inventory-and-stock", "local-pickup"],
    code: ["components/physical/shipping-settings.tsx", "app/app/inventory/inventory-client.tsx", "lib/physical/inventory-server.ts", "lib/physical/storefront-stock.ts", "lib/physical/checkout-server.ts", "lib/physical/jobs-server.ts", "lib/website-builder/site-commerce.ts"],
    facts: ["locationKinds", "pickupReady"],
    topics: [
      {
        id: "locations",
        name: "Locations",
        does:
          "A place of the store's own (home, studio, warehouse, shop) or a partner's (print on demand, dropshipping supplier, third party logistics). Who ships: the store itself; the partner by email (each new order with its items and address goes to the location's orders email, with a link where the partner adds tracking); or a signed request to the store's own system. Ships orders from here and In use can each be turned off.",
        stored: "inventory_locations",
        creators: [SETTINGS("locations", "Locations")],
        check: ["Add a partner location with an orders email you can read.", "Place an order for a product stocked there: the partner email arrives with the items, the address and Add tracking."],
      },
      {
        id: "pickup",
        name: "Local pickup",
        does: "A location can offer free pickup, with how soon it is usually ready, its opening hours and instructions. Buyers choose Pickup at checkout; the hours show there, on the product page's delivery line and on the order page. The creator marks it ready and then collected, and each sends the buyer an email. The hours need SQL part 154.",
        stored: "inventory_locations.pickup_enabled, pickup_ready, pickup_instructions, pickup_hours",
        buyers: [{ label: "Pickup option at checkout with the hours; Ready for pickup and Picked up emails" }],
        check: ["Turn on pickup at a location and type opening hours.", "On the website's checkout choose Pick up: the hours show under the location; the order page shows Open with the hours."],
      },
      {
        id: "local-delivery",
        name: "Local delivery",
        does: "The creator delivers orders from a location to buyers whose postal code starts with one of its codes, in the location's country, for its own price (free over an amount, with a minimum order if set) and a note like the delivery days. Offered at checkout beside shipping only to addresses it covers; the order page and the emails say the shop brings it. Needs SQL part 154.",
        stored: "inventory_locations.local_delivery_enabled, local_delivery_codes, local_delivery_price_cents, local_delivery_min_cents, local_delivery_free_over_cents, local_delivery_note",
        buyers: [{ label: "Local delivery option at checkout; the order page says Delivered by the shop" }],
        creators: [SETTINGS("locations", "Locations › a location › Local delivery")],
        check: ["Turn on local delivery at a location with a postal code prefix like 400.", "At checkout, an address starting 400 is offered Local delivery at its price; another address is not."],
      },
      {
        id: "stock",
        name: "Inventory",
        does:
          "Every physical variant on one page with on hand, committed (sold or held, not shipped), available and incoming, for all locations or one. A change is an adjustment with a reason and lands in the history; transfers move stock between locations in two steps, sent and received. A checkout holds the stock for 35 minutes; an unpaid hold is given back by the physical commerce job.",
        stored: "inventory_levels, inventory_movements, inventory_reservations, inventory_transfers",
        buyers: [{ label: "Sold out, and \"Only 3 left\" on product pages (Website settings › Commerce › Show how many are left)" }],
        creators: [{ label: "Inventory", href: "/app/inventory" }, { label: "Products › a product › Inventory card", href: "/app/products" }],
        check: ["Set a variant to 2 on hand.", "On the website its product page says Only 2 left (when shown); buy 2 and it says Sold out.", "Inventory shows the movement with the order."],
      },
      {
        id: "low-stock",
        name: "Low stock line and email",
        does: "At or below the line, a product counts as low: Inventory marks it, product pages can say how many are left, and with the email on, the creator gets one email a day at most listing what sold down to its line. A product can set its own line in its Inventory card.",
        stored: "commerce_settings.low_stock_default, low_stock_alerts; products.low_stock_threshold",
        creators: [SETTINGS("locations", "Locations › Low stock"), { label: "Inventory › Low", href: "/app/inventory?filter=low" }],
        check: ["The status above shows the last low stock email the queue handled.", "Sell a product down to its line: within ten minutes the creator gets the low stock email, with a link to Inventory › Low."],
      },
    ],
  },
  {
    id: "returns-refunds",
    title: "Returns and refunds",
    intro:
      "Buyers ask for a return from their order page and the creator approves each one. Refunds are made from the order, all or part, and also when made in Stripe. Without physical commerce the section is Refunds and holds the refund reasons alone.",
    where: SETTINGS("returns", "Returns and refunds"),
    help: ["returns-physical", "refund-a-physical-order", "cancel-a-physical-order", "store-policies"],
    code: ["components/physical/shipping-settings.tsx", "components/app/settings/reasons-panel.tsx", "lib/store/reasons.ts", "app/checkout/physical/order/[token]/order-status-view.tsx", "components/physical/order-panel.tsx"],
    topics: [
      {
        id: "window",
        name: "Accept returns and the return window",
        does: "Off: the order page has no return button. On: buyers can ask within the window, counted from delivery, or from shipping when there is no tracking.",
        stored: "commerce_settings.returns_enabled, return_window_days",
        buyers: [{ label: "Return items on the order page; the returns note beside Check out on the website when turned on" }],
        creators: [SETTINGS("returns", "Returns and refunds › Returns")],
        check: ["Open a delivered order's page (View your order in its email): Return items is there inside the window and gone after it."],
      },
      {
        id: "reasons",
        name: "Return reasons and refund reasons",
        does: "Return reasons are what a buyer picks when asking to send something back. Refund reasons are what the creator picks in the refund dialog, kept on the order's timeline. Other always stays.",
        stored: "commerce_reasons",
        creators: [SETTINGS("returns", "Returns and refunds › Reasons")],
      },
      {
        id: "flow",
        name: "A return, start to finish",
        does: "Requested → the creator approves with instructions (Return approved email) → received (Return received email) → closed, with any refund (Return complete email). Each step is on the order's timeline. A refund before anything shipped can put the stock back.",
        stored: "commerce_returns, commerce_return_items",
        creators: [{ label: "Orders › the order › Returns", href: "/app/orders" }],
      },
    ],
  },
  {
    id: "domains",
    title: "Domains",
    intro:
      "A creator's own web address for their website or creator page. Every website also has its own <site>.storelib.com address. The cart, checkout, order tracking and thank you page all work on the connected domain.",
    where: SETTINGS("domains", "Domains"),
    help: ["store-domain", "sell-on-your-website"],
    code: ["components/app/settings/domains-panel.tsx", "app/api/domains/route.ts", "app/checkout/site/page.tsx", "app/checkout/site/track/page.tsx"],
    topics: [
      {
        id: "connect",
        name: "Add, verify and connect",
        does: "Add the domain, then add the DNS records shown (Type, Name, Value, each with Copy) at the registrar and press Check. Status goes Pending, then Connected; Needs attention when a record is wrong. Connects to says whether the domain opens the website or the creator page. The certificate for https is issued by the host once the records are right.",
        stored: "custom_domains",
        buyers: [{ label: "https://<their domain>/ and /checkout, /checkout/track, /checkout/thanks/<order> on it" }],
        creators: [SETTINGS("domains", "Domains")],
        check: ["Status Connected in Settings › Domains.", "Open https://<domain>/ in a private window: the website loads with a valid certificate.", "Add a product to the cart there and press Check out: the checkout opens on the same domain."],
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    intro:
      "Services a store connects. Analytics and ad pixels load on every page of the store's website with the ID the creator saved, and a paid order is reported to the ad and analytics ones once. Printful, Printify, Gelato and CJ Dropshipping take each paid order for their location and send tracking back; CJ can also keep a product's stock in step. The list below says which ones are working today and which are Coming soon.",
    where: SETTINGS("integrations", "Integrations"),
    help: ["integrations", "printful-and-printify", "gelato-and-cj-dropshipping"],
    code: ["components/app/settings/integrations-directory.tsx", "components/physical/integrations-marketplace.tsx", "lib/integrations/catalog.ts", "lib/store/tracking.ts", "lib/physical/providers.ts", "lib/integrations/fulfilment/forward-server.ts", "lib/integrations/fulfilment/gelato.ts", "lib/integrations/fulfilment/cj.ts", "lib/integrations/fulfilment/links-server.ts", "lib/physical/secrets.ts", "app/api/integrations/webhooks", "app/api/cron/physical/route.ts", "app/admin/integrations"],
    facts: ["integrations"],
    topics: [
      {
        id: "pixels",
        name: "Analytics and pixels",
        does: "Google Analytics, Tag Manager, Google Ads, Meta, TikTok, Pinterest, Microsoft Clarity, Klaviyo and Omnisend by ID (lib/store/tracking.ts). Each ID is checked against its service's format when saved and again when the page is drawn. A paid order is reported to Google, Tag Manager, Meta, TikTok and Pinterest; Clarity, Klaviyo and Omnisend only load on the pages.",
        stored: "store_settings.tracking",
        buyers: [{ label: "Every page of the store's website loads the service's own tag" }],
        creators: [SETTINGS("integrations", "Integrations")],
        check: ["Save a Google Analytics ID.", "Open the website and the page source: the gtag script with that ID is there. Real time in Google Analytics shows the visit."],
      },
      {
        id: "print-partners",
        name: "Printful and Printify",
        does: "Connected with the creator's own token, which Storelib checks with the provider before saving. Connecting makes a location of the same name that forwards to it (Settings › Locations says Connected to Printful). A paid order with items at that location queues a forward_fulfillment job; the job sends the items still to ship by SKU with the address, as a draft or straight to production (the creator's choice). The provider's webhook, or a tracking_sync job every few hours when it can't send one, reads the order back and ships the items with the carrier and tracking number, which emails the buyer. Both jobs run in /api/cron/physical every ten minutes. A product printed there is never counted for stock, so it never sells out for lack of it.",
        stored: "commerce_integrations (secret_ciphertext, webhook_secret_ciphertext, config), inventory_locations.integration_id, commerce_jobs, commerce_order_events",
        creators: [SETTINGS("integrations", "Integrations › Printful or Printify"), SETTINGS("locations", "Locations")],
        check: [
          "Connect a Printful test store with a private token: the page says Connected and names the store; Settings › Locations has a Printful location that says Connected to Printful.",
          "Give a product Print on demand at that location and each variant its Printful SKU. Buy it with the test card: the order's timeline says Order sent to Printful, and the draft is in Printful.",
          "Ship it in Printful (or wait for the tracking check): the order shows the carrier and number and the buyer gets the shipping email.",
          "The provider's webhook address is https://storelib.com/api/integrations/webhooks/<printful or printify>/<token>. The token is made by Storelib from the creator's id and a key only the server has, so it can't be guessed; Printify's deliveries are also checked against their signature.",
        ],
      },
      {
        id: "gelato-cj",
        name: "Gelato and CJ Dropshipping",
        does: "Connected with the creator's API key, checked first (Gelato: a catalogue read; CJ: the key exchanged for an access token, kept sealed and refreshed). Connecting makes a location of the same name (Gelato print on demand, CJ a dropshipping supplier). Neither shares SKUs with the store, so the creator matches each variant once on the card: a CJ variant found by SKU or words in CJ's catalogue, or a Gelato product UID with the print file's https address, each checked with the partner before it is saved. A paid order queues forward_fulfillment as for Printful: Gelato gets an Order API v4 draft or order (searched first by its reference, so a retry never makes a second) with the creator's shipment method; CJ gets createOrderV2 unpaid, then confirmed and paid from the CJ balance when Send to production is on, by the cheapest method CJ quotes or the one the creator typed. An item with no match is never sent (CJ only by an SKU CJ confirms exactly): the order is marked to send by hand with the reason. Tracking comes back by CJ's order and logistics webhooks and Gelato's (which the creator pastes in Gelato), or the tracking_sync job; every webhook is only a pointer, the order is read back with the creator's key. CJ stock in step: per product, an inventory_sync job every six hours, CJ's STOCK webhook, or Read CJ stock now, each a provider_sync stock movement at the CJ location.",
        stored: "commerce_integrations (secret_ciphertext, config: CJ's sealed tokens, shipment method, shipping method, ships from), fulfilment_variant_links (SQL part 162), inventory_levels and inventory_movements (provider_sync), commerce_jobs (forward_fulfillment, tracking_sync, inventory_sync)",
        creators: [SETTINGS("integrations", "Integrations › Gelato or CJ Dropshipping"), SETTINGS("locations", "Locations")],
        check: [
          "Connect CJ with a CJ API key: the card says Connected and Settings › Locations has a CJ Dropshipping location. Press Match products, search a CJ SKU, choose a variant: the row says Matched.",
          "Give that product Dropshipping at the CJ location. Buy it with the test card: the timeline says Order sent to CJ Dropshipping and the order is in CJ, unpaid.",
          "Turn on Keep stock in step with CJ: the row shows CJ's stock and the variant's stock history has a Synced from provider line.",
          "Connect Gelato, match a variant to a product UID and a print file, buy it: the draft is in Gelato's dashboard. Paste the card's address in Gelato › Developer › Webhooks; the card's Tracking line changes once Gelato sends its first update.",
          "Without part 162, matching says it turns on after SQL part 162 runs, and orders for unmatched items are marked to send by hand.",
        ],
      },
      {
        id: "secrets",
        name: "Where keys are kept",
        does: "Every key and signing secret a store saves is sealed on the server and never sent back, only its last four characters. The sealing key, and the key that signs webhook addresses, come from COMMERCE_SECRETS_KEY when the deployment sets it, else they are derived from SUPABASE_SERVICE_ROLE_KEY. Set COMMERCE_SECRETS_KEY: with only the derived key, rotating the service role key makes every saved key unreadable and every provider webhook address stop working, and each store would have to connect again.",
        check: ["In Vercel, the project's environment has COMMERCE_SECRETS_KEY (a long random value) for Production. Set it before stores connect, and never change it after."],
      },
      {
        id: "own-webhook",
        name: "The creator's own system and Send a test",
        does: "Your own system (webhook) posts each paid order as JSON to the creator's https address, signed with their secret in X-Storelib-Signature. Send a test posts a signed ping the same way and says what the address answered. A failed delivery is retried and shown on the integration.",
        stored: "commerce_integrations (provider custom_webhook)",
        creators: [SETTINGS("integrations", "Integrations › Your own system (webhook)")],
        check: ["Save a request bin's https address and a secret, press Send a test: the page says the status it answered and the bin shows the signed request."],
      },
      {
        id: "admin",
        name: "Pausing one for everyone",
        does: "An integration can be paused for every store from /admin › Integrations: it stays listed and cannot be installed.",
        creators: [{ label: "/admin › Integrations", href: "/admin/integrations" }],
      },
    ],
  },
  {
    id: "products",
    title: "Physical products",
    intro: "A physical product is made like any other, and gets Inventory, Variants and Shipping cards in its editor in place of files.",
    where: { label: "Products › New › Physical", href: "/app/products/new?type=physical" },
    physicalOnly: true,
    help: ["create-a-physical-product", "variants-and-options", "upsells-and-bundles"],
    code: ["components/physical/product-cards.tsx", "components/physical/variant-table.tsx", "lib/physical/order-limit.ts"],
    topics: [
      {
        id: "cards",
        name: "What the editor asks",
        does:
          "Inventory: track or not, quantity per location, keep selling when out, low stock alert. Variants: up to three options and every combination with its own price, stock, photo, SKU, barcode and weight. Shipping: shipped or not, weight, which shipping rates it uses. Advanced: codes and cost, package size and customs, tax, brand and tags, fulfilling it differently. Settings: the most per order.",
        stored: "products, product_options, product_variants, inventory_levels",
        buyers: [{ label: "Product page: options, price, stock, the quantity limit" }],
        creators: [{ label: "Products", href: "/app/products" }],
      },
      {
        id: "selling-more",
        name: "Discount codes, bundles and checkout offers",
        does: "Codes a buyer types at checkout; bundles shown on each product's page with Add all to cart; one product suggested in the checkout.",
        stored: "coupons, store_offers",
        creators: [{ label: "Coupons", href: "/app/coupons" }, { label: "Offers", href: "/app/offers" }],
      },
      {
        id: "website",
        name: "On the website",
        does: "Website settings › Commerce, per website: Show how many are left (and its words), the free shipping bar and its amount, and the returns note beside Check out. Drafted and published with the website's other settings.",
        stored: "the website's theme settings (show_stock_left, low_stock_text, free_shipping_bar, free_shipping_threshold, cart_returns_note)",
        creators: [{ label: "Website builder › the website › Settings › Commerce", href: "/app/website-builder" }],
      },
    ],
  },
  {
    id: "orders",
    title: "Orders and fulfilment",
    intro:
      "Every order, digital and physical, is on the Orders page. A physical order is laid out the way Shopify lays one out: what is left to ship, each shipment with its tracking, the address and delivery the buyer paid for, the buyer's note and a timeline.",
    where: { label: "Orders", href: "/app/orders" },
    help: ["ship-your-orders", "cancel-a-physical-order", "physical-payouts"],
    code: ["components/physical/order-panel.tsx", "app/app/orders/order-detail.tsx", "lib/physical/status.ts", "lib/physical/checkout-server.ts", "lib/physical/buyer-cancel.ts", "app/api/physical/orders", "app/api/physical/order-status/[token]/cancel/route.ts"],
    facts: ["orderStatuses"],
    topics: [
      {
        id: "fulfil",
        name: "Fulfil items",
        does: "Pick quantities, add the tracking number and carrier, and choose whether to email the buyer. Each place the parcel leaves from has its own card. Also: Mark as in progress, Packing slip, Cancel order before anything ships, Mark ready for pickup.",
        stored: "fulfillments, fulfillment_items, fulfillment_events",
        buyers: [{ label: "Shipping confirmation email; the order page moves to Shipped" }],
        creators: [{ label: "Orders › an order", href: "/app/orders" }],
        check: ["On a paid test order press Fulfill items, add a tracking number, keep Email the buyer on.", "The buyer's Shipping confirmation arrives with a tracking link; the order page shows Shipped."],
      },
      {
        id: "payment",
        name: "How the payment becomes an order",
        does: "At Pay the cart is priced again on the server, the stock is held, and Stripe takes one payment for the total with delivery and tax as their own lines. When Stripe confirms (the buyer's return or the webhook, whichever is first) the order is written exactly once, the held stock becomes sold, and the emails and partner forwarding are queued.",
        stored: "commerce_checkouts, orders, commerce_order_events",
      },
      {
        id: "buyer-cancel",
        name: "A buyer asks to cancel",
        does: "While an order is Unfulfilled (paid, nothing refunded, sent or marked in progress) the buyer's order page has Cancel order. It asks the shop and cancels nothing: one order.cancel_requested entry on the timeline, by the buyer, which emails the seller (Cancel request). The order shows a Cancel requested card: Cancel and refund cancels it (stock back, the Order cancelled email) and refunds every paid line in full through the Orders page's refund (the Refund email); Keep order writes order.cancel_declined and the buyer's page says the shop is going ahead. One request per order, limited per address and per order. Settings › Checkout › Let buyers ask to cancel turns the button off.",
        stored: "commerce_order_events (order.cancel_requested, order.cancel_declined), store_settings.checkout.buyerCancel",
        buyers: [{ label: "Cancel order on the order page, storelib.com/checkout/physical/order/<key>" }],
        creators: [{ label: "Orders › the order › Cancel requested", href: "/app/orders" }, SETTINGS("checkout", "Checkout › Cancellations")],
        check: [
          "On a paid test order that hasn't shipped, open View your order from its email and press Cancel order, then Ask to cancel.",
          "The seller gets the Cancel request email; the order shows Cancel requested.",
          "Press Cancel and refund: the buyer gets Order cancelled and the Refund email, and Stripe's test dashboard shows the refund.",
        ],
      },
      {
        id: "help",
        name: "Buyer help requests",
        does: "From their order page a buyer can ask for help (not arrived, damaged, wrong item and more). The creator answers in Support; the buyer follows the case at its private link.",
        stored: "order_cases, order_case_messages",
        creators: [{ label: "Support", href: "/app/support" }],
      },
    ],
  },
  {
    id: "tracking",
    title: "Tracking",
    intro: "The tracking number a creator adds becomes a link to the carrier's own tracking page when the carrier is one Storelib knows. An unknown carrier gets no made up link: the buyer sees the number, and the creator can paste the carrier's link.",
    physicalOnly: true,
    help: ["ship-your-orders"],
    code: ["lib/physical/carriers.ts", "lib/physical/status.ts", "app/checkout/physical/order/[token]/order-status-view.tsx", "app/checkout/site/track/page.tsx", "app/checkout/physical/partner/[token]/page.tsx"],
    facts: ["carriers", "shipmentStatuses"],
    topics: [
      {
        id: "order-page",
        name: "The buyer's order page",
        does: "Reached from View your order in every order email. Its address is a random key only those emails carry. It shows the steps (ordered, shipped, delivered), each shipment with its carrier link, returns (Return items), and Get help.",
        buyers: [{ label: "storelib.com/checkout/physical/order/<key>, from the order emails" }],
      },
      {
        id: "track-on-site",
        name: "Track your order on the website",
        does: "<site>/checkout/track asks for the order number and email and sends the order's link to that email. It says the same thing whether anything matched, so it gives nothing away.",
        buyers: [{ label: "https://<site or domain>/checkout/track" }],
        check: ["Open /checkout/track on the website, type a real order number and its email: the email with the order link arrives."],
      },
      {
        id: "changes",
        name: "Tracking changes and delivery",
        does: "Edit tracking on a shipment can email the buyer the new number. Mark as in transit and Mark as delivered move the shipment on; Out for delivery and Delivered emails go when those steps are reached.",
      },
      {
        id: "delivery-problem",
        name: "Delivery problem",
        does: "A shipment whose status becomes failed (the seller's Report a delivery problem, or a partner's tracking) sends the buyer the Delivery problem email and the seller the delivery problem notice, once each time it fails. The buyer's order page heads with There's a problem with your delivery and marks the package in red; the seller's order, its bar and the Orders list say Delivery problem in red until it is marked in transit, out for delivery or delivered again.",
        stored: "fulfillments.status = failed, fulfillment_events",
        buyers: [{ label: "The Delivery problem email; the order page's red package" }],
        creators: [{ label: "Orders › the order › the shipment's menu › Report a delivery problem", href: "/app/orders" }, SETTINGS("emails", "Customer emails › Delivery problem")],
        check: ["On a shipped test order press Report a delivery problem: the buyer gets the email, the order page shows the problem, and the Orders list says Delivery problem.", "Press Mark as in transit: the list and the order page move on."],
      },
    ],
  },
  {
    id: "receipts",
    title: "Receipts",
    intro:
      "Every payment has one receipt page, which is also the download page for digital items. The receipt email and the page read the same data, so they never disagree about items or totals.",
    code: ["lib/receipts/rules.ts", "app/receipt/[token]/page.tsx", "lib/store/identity-server.ts"],
    topics: [
      {
        id: "receipt",
        name: "The receipt",
        does: "The seller as their profile shows them (name and photo) with their support email, every item, the tax line and whether prices included it, and the total. The receipt email is signed with Store details (logo, store name, contact). Downloads are signed for five minutes per press and each download is logged.",
        stored: "orders (receipt_token, tax_cents, tax_included)",
        buyers: [{ label: "storelib.com/receipt/<key>, from the receipt email and the thank you page" }, { label: "Profile › Library, for a buyer with an account", href: "/account/library" }],
        check: ["Buy a download on a preview with test keys: the receipt email's button opens /receipt/<key> with the files and the totals."],
      },
    ],
  },
  {
    id: "testing",
    title: "Checking it all with test payments",
    intro:
      "Stripe has test keys and live keys. The status at the top says which mode this deployment runs in. On the live site every payment is real money: do not test with a real card there.",
    code: ["lib/payments/stripe/config.ts", "app/admin/payments"],
    facts: ["stripeEvents"],
    topics: [
      {
        id: "test-mode",
        name: "A full test order",
        does: "On a preview deployment with Stripe test keys (sk_test_ and pk_test_) and the test webhook secret, a creator account with Stripe connected in test mode can sell to itself with Stripe's test card 4242 4242 4242 4242, any future date, any CVC.",
        check: [
          "Buy a physical product from the creator's website with the test card.",
          "The order appears in Orders within seconds; Order confirmation reaches the buyer; the creator gets the new sale notice.",
          "Fulfil it with a tracking number: Shipping confirmation arrives; the order page shows Shipped with the carrier link.",
          "Refund it from the order: the Refund email arrives and Stripe's test dashboard shows the refund.",
          "/admin › Payments › Webhooks lists each Stripe event as processed.",
        ],
      },
      {
        id: "emails-only",
        name: "Emails without an order",
        does: "Settings › Customer emails shows every customer email as it would go out, drawn by the template that sends it, with sample data.",
        creators: [SETTINGS("emails", "Customer emails")],
      },
    ],
  },
]

/** One flat string per topic for the search box: what a person would type. */
export function searchTextOf(section: DocSection, topic?: Topic): string {
  const parts = topic
    ? [section.title, topic.name, topic.does, topic.stored, ...(topic.buyers ?? []).map((p) => p.label), ...(topic.creators ?? []).map((p) => p.label), ...(topic.check ?? [])]
    : [section.title, section.intro, section.where?.label]
  return parts.filter(Boolean).join(" ").toLowerCase()
}

/** Does this text match every word typed? */
export function matchesQuery(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => text.includes(w))
}
