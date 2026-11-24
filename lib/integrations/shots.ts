/**
 * ===========================================================================
 *  PICTURES OF EACH APP, CONNECTED TO STORELIB (r24)
 * ===========================================================================
 * The gallery on an integration's page is its one YouTube video and two of
 * these: the provider's own app the way it looks once a Storelib store is
 * connected (Mailchimp's contacts Storelib added, Printful's orders from the
 * store, Google Tag Manager's tags). Drawn by Storelib as HTML and rendered
 * to WebP by scripts/render-integration-shots.mjs, with a sample store's
 * data; nothing is a copy of the provider's screens and no mark but the
 * integration's own is drawn.
 *
 * Files: public/integrations/shots/<id>-<view>-<width>.webp at each of
 * SHOT_WIDTHS, 16:9 (1280 by 720 at the largest). tests/integrations-r24
 * checks that every one named here is there at every width.
 *
 * Pure data: no I/O.
 */

export const SHOT_WIDTHS = [640, 960, 1280] as const
export const SHOT_WIDTH = 1280
export const SHOT_HEIGHT = 720

export interface AppShot {
  view: string
  alt: string
}

export const APP_SHOTS: Partial<Record<string, AppShot[]>> = {
  mailchimp: [
    { view: "audience", alt: "Mailchimp's contacts, with the people Storelib added from your OnePage signups, tagged OnePage signup" },
    { view: "journey", alt: "A Mailchimp journey that welcomes each new signup Storelib sends" },
  ],
  klaviyo: [
    { view: "profiles", alt: "Klaviyo profiles from your store, each with the last event Storelib sent" },
    { view: "flow", alt: "A Klaviyo flow started by the Placed Order metric Storelib sends with each paid order" },
  ],
  omnisend: [
    { view: "contacts", alt: "Omnisend contacts added by Storelib" },
    { view: "automation", alt: "An Omnisend automation started by the placed order event from Storelib" },
  ],
  brevo: [
    { view: "contacts", alt: "Brevo contacts on the list Storelib keeps in step" },
    { view: "workflow", alt: "A Brevo welcome workflow for the Storelib subscribers list" },
  ],
  mailerlite: [
    { view: "subscribers", alt: "MailerLite subscribers in the Storelib buyers group" },
    { view: "automation", alt: "A MailerLite automation for each new subscriber in the Storelib buyers group" },
  ],
  kit: [
    { view: "subscribers", alt: "Kit subscribers tagged Storelib buyer" },
    { view: "sequence", alt: "A Kit automation that starts when Storelib adds the Storelib buyer tag" },
  ],
  printful: [
    { view: "orders", alt: "Printful's orders, each one sent by Storelib from your store" },
    { view: "products", alt: "Your store in Printful, with the products synced with Storelib" },
  ],
  printify: [
    { view: "orders", alt: "Printify's orders from your Storelib store, from on hold to delivered" },
    { view: "products", alt: "Your Printify products, published to Storelib" },
  ],
  gelato: [
    { view: "orders", alt: "Gelato's orders from your Storelib store" },
    { view: "products", alt: "Gelato products connected to your Storelib store" },
  ],
  "cj-dropshipping": [
    { view: "orders", alt: "CJdropshipping store orders sent by Storelib, with their tracking numbers" },
    { view: "products", alt: "CJdropshipping products connected to your Storelib store" },
  ],
  shipstation: [
    { view: "orders", alt: "ShipStation's orders awaiting shipment from your Storelib store" },
    { view: "shipped", alt: "Shipped orders in ShipStation, with the tracking that goes back to Storelib" },
  ],
  shippo: [
    { view: "orders", alt: "Shippo's orders imported from Storelib, with the cheapest rate for each" },
    { view: "rates", alt: "Buying a label in Shippo for an order from Storelib" },
  ],
  easypost: [
    { view: "shipments", alt: "EasyPost shipments for Storelib orders" },
    { view: "tracker", alt: "An EasyPost tracker for a Storelib order, step by step" },
  ],
  aftership: [
    { view: "shipments", alt: "AfterShip following the parcels of your Storelib orders" },
    { view: "detail", alt: "One parcel in AfterShip, from label to out for delivery" },
  ],
  "google-analytics": [
    { view: "events", alt: "Google Analytics events from your store, from page_view to purchase" },
    { view: "purchases", alt: "Google Analytics ecommerce purchases report for your products" },
  ],
  "google-tag-manager": [
    { view: "tags", alt: "Google Tag Manager tags firing on your Storelib store" },
    { view: "preview", alt: "Tag Assistant showing the purchase event Storelib pushes to the data layer" },
  ],
  "google-ads": [
    { view: "conversions", alt: "Google Ads conversions summary with the purchase conversion from your store" },
    { view: "action", alt: "The purchase conversion action in Google Ads, its tag installed with Storelib" },
  ],
  "meta-pixel": [
    { view: "overview", alt: "Meta Events Manager with the events your store sends, from PageView to Purchase" },
    { view: "test", alt: "Meta test events from your store, with a purchase's parameters" },
  ],
  "tiktok-pixel": [
    { view: "events", alt: "TikTok Events Manager with the events your store sends" },
    { view: "test", alt: "TikTok test events from your store, with Complete Payment" },
  ],
  "pinterest-tag": [
    { view: "tag", alt: "Pinterest tag events from your store: page visit, add to cart, checkout and lead" },
    { view: "history", alt: "Pinterest event history from your store, with a checkout's details" },
  ],
  "microsoft-clarity": [
    { view: "dashboard", alt: "Microsoft Clarity's dashboard for your store's pages" },
    { view: "recordings", alt: "Microsoft Clarity recordings of visits to your store" },
  ],
  calendly: [
    { view: "meetings", alt: "Calendly meetings, each one booked into Storelib" },
    { view: "webhooks", alt: "The Calendly webhook Storelib adds when you connect it" },
  ],
  "cal-com": [
    { view: "bookings", alt: "Cal.com bookings, each one in Storelib too" },
    { view: "webhooks", alt: "The Cal.com webhook Storelib adds when you connect it" },
  ],
  discord: [
    { view: "roles", alt: "Discord server roles, with the members' role Storelib gives and takes back" },
    { view: "members", alt: "Discord members who were given the role after buying on Storelib" },
  ],
  zapier: [
    { view: "zap", alt: "A Zap that catches each OnePage signup from Storelib and adds it to a sheet" },
    { view: "history", alt: "Zap runs for each signup Storelib sent" },
  ],
  make: [
    { view: "scenario", alt: "A Make scenario that starts with the webhook Storelib calls on each signup" },
    { view: "history", alt: "Make's run history for the Storelib signups scenario" },
  ],
}

export function shotSrc(id: string, view: string, width: number): string {
  return `/integrations/shots/${id}-${view}-${width}.webp`
}

/** The srcset for one picture, every width it was written at. */
export function shotSrcSet(id: string, view: string): string {
  return SHOT_WIDTHS.map((w) => `${shotSrc(id, view, w)} ${w}w`).join(", ")
}
